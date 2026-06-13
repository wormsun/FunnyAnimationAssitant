import { computed, reactive, ref } from 'vue'

import { useProjectStore } from '@/stores/projectStore'
import { loadAssetFromDisk } from '@/utils/fileSystem'

// ========================================
// 全局单例缓存（所有组件共享）
// ========================================
const globalImageCache = reactive<Record<string, string>>({})
const globalCacheVersion = ref(0)
const globalLoadingPaths = new Set<string>()
const globalCreatedBlobUrls = new Set<string>()

/**
 * 统一的资源图片加载 Composable
 * 用于将相对路径转换为 Blob URL 用于显示
 */
export function useAssetImage() {
  const projectStore = useProjectStore()

  /**
   * 获取图片 URL（同步版本，用于模板）
   * 如果是路径，会异步加载并缓存
   * 如果缓存中没有，返回透明占位符（避免浏览器尝试加载无效路径）
   */
  function getImageUrl(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) return ''

    // 如果已经是 Blob URL 或 data URL，直接返回
    if (pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) {
      return pathOrUrl
    }

    // 访问 cacheVersion 以确保响应式追踪
    if (globalCacheVersion.value < 0) { /* noop */ }

    // 检查缓存
    if (pathOrUrl in globalImageCache) {
      const cachedUrl = globalImageCache[pathOrUrl]
      return cachedUrl ?? ''
    }

    // 如果是路径，异步加载（但不返回路径，避免浏览器加载失败）
    if (projectStore.isProjectOpen && projectStore.projectHandle) {
      void loadImageUrl(pathOrUrl)
    }

    // 返回透明占位符（1x1 像素的透明 PNG），避免浏览器尝试加载空字符串作为相对 URL
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }

  /**
   * 异步加载图片 URL
   */
  async function loadImageUrl(path: string) {
    if (!projectStore.projectHandle) {
      console.warn('[useAssetImage] 项目未打开，跳过加载:', path)
      return
    }

    // 如果已经在缓存中，直接返回
    if (path in globalImageCache) {
      return
    }

    // 如果正在加载中，等待加载完成
    if (globalLoadingPaths.has(path)) {
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
        globalImageCache[path] = blobUrl
        // 记录创建的 Blob URL
        if (blobUrl.startsWith('blob:')) {
          globalCreatedBlobUrls.add(blobUrl)
        }
        // 触发响应式更新
        globalCacheVersion.value++
      } else {
        console.warn('[useAssetImage] 加载返回空:', path)
      }
    } catch (error) {
      console.error('[useAssetImage] 加载图片失败:', path, error)
    } finally {
      // 移除加载标记
      globalLoadingPaths.delete(path)
    }
  }

  /**
   * 预加载多个图片
   */
  async function preloadImages(paths: string[]) {
    if (!projectStore.isProjectOpen || !projectStore.projectHandle) return

    // 去重路径
    const uniquePaths = Array.from(new Set(paths))

    await Promise.all(uniquePaths.map(path => {
      if (path && !path.startsWith('blob:') && !path.startsWith('data:') && !(path in globalImageCache)) {
        return loadImageUrl(path)
      }
      return Promise.resolve()
    }))
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
        console.error('[useAssetImage] 释放 Blob URL 失败:', url, error)
      }
    })
    globalCreatedBlobUrls.clear()

    // 清空对象
    Object.keys(globalImageCache).forEach(key => {
      delete globalImageCache[key]
    })
    globalCacheVersion.value++
  }

  /**
   * 清理单个 Blob URL
   * @param path 路径
   */
  function revokeBlobUrl(path: string) {
    const url = globalImageCache[path]
    if (url?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url)
        globalCreatedBlobUrls.delete(url)
        delete globalImageCache[path]
        globalCacheVersion.value++
      } catch (error) {
        console.error('[useAssetImage] 释放 Blob URL 失败:', path, error)
      }
    }
  }

  /**
   * 检查是否为路径（不是 Blob URL 或 data URL）
   */
  function isPath(url: string | null | undefined): boolean {
    if (!url) return false
    return !url.startsWith('blob:') && !url.startsWith('data:')
  }

  /**
   * 检查资源是否已准备好（已加载且不是占位符）
   */
  function isImageReady(path: string): boolean {
    if (!path) return true // 空路径视为 ready (不需加载)
    const url = globalImageCache[path]
    // 检查是否在缓存中，且不是占位符
    return !!url && !url.startsWith('data:image/png;base64')
  }

  return {
    getImageUrl,
    loadImageUrl,
    preloadImages,
    clearCache,
    revokeBlobUrl,
    isPath,
    isImageReady,
    imageCache: computed(() => globalImageCache)
  }
}

