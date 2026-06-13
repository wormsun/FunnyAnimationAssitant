import { computed, reactive, ref } from 'vue'

import { useProjectStore } from '@/stores/projectStore'
import { loadAssetFromDisk } from '@/utils/fileSystem'

// ========================================
// 全局单例缓存（所有组件共享）
// ========================================
const globalAudioCache = reactive<Record<string, string>>({})
const globalCacheVersion = ref(0)
const globalLoadingPaths = new Set<string>()
const globalCreatedBlobUrls = new Set<string>()

/**
 * 统一的资源音频加载 Composable
 * 用于将相对路径转换为 Blob URL 用于播放
 */
export function useAssetAudio() {
  const projectStore = useProjectStore()

  /**
   * 获取音频 URL（同步版本）
   * 如果是路径，会异步加载并缓存
   * 如果缓存中没有，返回空字符串
   */
  function getAudioUrl(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) return ''

    // 如果已经是 Blob URL 或 data URL，直接返回
    if (pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) {
      return pathOrUrl
    }

    // 访问 cacheVersion 以确保响应式追踪
    if (globalCacheVersion.value < 0) { /* noop */ }

    // 检查缓存
    if (pathOrUrl in globalAudioCache) {
      return globalAudioCache[pathOrUrl] ?? ''
    }

    // 如果是路径，异步加载
    if (projectStore.isProjectOpen && projectStore.projectHandle) {
      void loadAudioUrl(pathOrUrl)
    }

    return ''
  }

  /**
   * 异步加载音频 URL
   */
  async function loadAudioUrl(path: string) {
    // 如果已经是 Blob URL 或 data URL，无需加载
    if (path.startsWith('blob:') || path.startsWith('data:')) {
      return
    }

    if (!projectStore.projectHandle) {
      console.warn('[useAssetAudio] 项目未打开，跳过加载:', path)
      return
    }

    // 如果已经在缓存中，直接返回
    if (path in globalAudioCache) {

      return
    }

    // 如果正在加载中，等待加载完成
    if (globalLoadingPaths.has(path)) {
      console.log('[useAssetAudio] 等待其他加载完成:', path)
      // 等待加载完成（轮询等待）
      while (globalLoadingPaths.has(path)) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      return
    }

    // 标记为正在加载
    globalLoadingPaths.add(path)


    try {
      const blobUrl = await loadAssetFromDisk(projectStore.projectHandle, path)


      if (blobUrl) {
        globalAudioCache[path] = blobUrl
        // 记录创建的 Blob URL
        if (blobUrl.startsWith('blob:')) {
          globalCreatedBlobUrls.add(blobUrl)
        }
        // 触发响应式更新
        globalCacheVersion.value++
      } else {
        console.warn('[useAssetAudio] 加载返回空:', path)
      }
    } catch (error) {
      console.error('[useAssetAudio] 加载音频失败:', path, error)
    } finally {
      // 移除加载标记
      globalLoadingPaths.delete(path)
    }
  }

  /**
   * 预加载多个音频
   */
  function preloadAudios(paths: string[]) {
    if (!projectStore.isProjectOpen || !projectStore.projectHandle) return

    // 去重路径
    const uniquePaths = Array.from(new Set(paths))

    uniquePaths.forEach(path => {
      if (path && !path.startsWith('blob:') && !path.startsWith('data:') && !(path in globalAudioCache) && !globalLoadingPaths.has(path)) {
        void loadAudioUrl(path)
      }
    })
  }

  /**
   * 清除缓存
   */
  function clearCache() {
    // 释放所有 Blob URL
    globalCreatedBlobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('[useAssetAudio] 释放 Blob URL 失败:', url, error)
      }
    })
    globalCreatedBlobUrls.clear()

    // 清空对象
    Object.keys(globalAudioCache).forEach(key => {
      delete globalAudioCache[key]
    })
    globalCacheVersion.value++
  }

  /**
   * 清理单个 Blob URL
   * @param path 路径
   */
  function revokeBlobUrl(path: string) {
    const url = globalAudioCache[path]
    if (url?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url)
        globalCreatedBlobUrls.delete(url)
        delete globalAudioCache[path]
        globalCacheVersion.value++
      } catch (error) {
        console.error('[useAssetAudio] 释放 Blob URL 失败:', path, error)
      }
    }
  }

  /**
   * 检查资源是否已准备好
   */
  function isAudioReady(path: string): boolean {
    if (!path) return true
    return path in globalAudioCache
  }

  return {
    getAudioUrl,
    loadAudioUrl,
    preloadAudios,
    clearCache,
    revokeBlobUrl,
    isAudioReady,
    audioCache: computed(() => globalAudioCache)
  }
}
