<template>
  <Teleport :to="teleportTarget">
    <div
      v-if="visible"
      class="preview-overlay"
      @click.self="handleClose"
    >
      <div class="preview-dialog">
        <!-- 标题栏 -->
        <div class="preview-header">
          <div class="header-left">
            <span class="preview-icon">🎬</span>
            <span class="preview-title">场景预览</span>
            <span class="scene-info">{{ sceneTitle }}</span>
            <span
              v-if="(scenePlayerRef?.currentTime ?? 0) > 0"
              class="block-indicator"
            >
              {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
            </span>
          </div>
          <button
            class="close-btn"
            title="关闭"
            @click="handleClose"
          >
            ✕
          </button>
        </div>
        
        <!-- 预览区域 -->
        <div class="preview-content">
          <!-- 加载中 -->
          <div
            v-if="isLoading"
            class="loading-overlay"
          >
            <div class="loading-spinner" />
            <span>{{ loadingMessage }}</span>
          </div>
          
          <!-- 错误信息 -->
          <div
            v-else-if="errorMessage"
            class="error-overlay"
          >
            <span class="error-icon">⚠️</span>
            <span>{{ errorMessage }}</span>
            <button
              class="retry-btn"
              @click="initPreview"
            >
              重试
            </button>
          </div>

          <!-- 播放器 -->
          <ScenePlayer
            v-else
            ref="scenePlayerRef"
            :episode-id="episodeId"
            :scene-id="sceneId"
            :episode="episodeCopy!"
            :auto-play="false"
            @playback-finished="handlePlaybackFinished"
            @progress="handleProgress"
            @play-state-change="handlePlayStateChange"
            @error="handlePlayerError"
          />
        </div>

        <!-- 控制栏 -->
        <div class="preview-controls">
          <button 
            class="control-btn play-btn" 
            :disabled="isLoading || !!errorMessage"
            @click="handlePlayPause"
          >
            <span class="btn-icon">{{ isPlaying ? '⏸' : '▶' }}</span>
            <span class="btn-text">{{ isPlaying ? '暂停' : '播放' }}</span>
          </button>
          
          <button 
            class="control-btn reset-btn" 
            :disabled="isLoading"
            @click="handleReset"
          >
            <span class="btn-icon">⏮</span>
            <span class="btn-text">重置</span>
          </button>
          
          <div class="progress-section">
            <input 
              type="range" 
              class="progress-slider"
              :min="0"
              :max="totalDuration"
              :value="currentTime"
              disabled
            >
            <span class="time-display">
              {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import type { Episode } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
// v7.3: effectStore 已删除
import { useSoundStore } from '@/stores/soundStore'
import type { SceneObject } from '@/types/sceneObject'
import { ensureSceneTTS as sharedEnsureSceneTTS } from '@/utils/ttsUtils'
import { audioKit } from '@/utils/WebAudioKit'

import ScenePlayer from './ScenePlayer.vue'

const props = defineProps<{
  visible: boolean
  episodeId: string
  sceneId: string
  episode: Episode
}>()

const emit = defineEmits<{
  close: []
}>()

const projectStore = useProjectStore()
const sceneObjectStore = useSceneObjectStore()

// Teleport 目标
const teleportTarget = shallowRef<HTMLElement | string>('body')

// 状态
const isLoading = ref(true)
const loadingMessage = ref('正在准备预览...')
const errorMessage = ref<string | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const totalDuration = ref(0)

interface ScenePlayerInstance {
  play: () => Promise<void>
  pause: () => void
  reset: () => void
  seek: (time: number) => void
  currentTime: number
  totalDuration: number
  isPlaying: boolean
}

// 引用
const scenePlayerRef = ref<ScenePlayerInstance | null>(null)

// 资源管理
const generatedBlobUrls = new Set<string>()
const loadedTextureUrls = new Set<string>() // 追踪加载的纹理
const loadedAudioUrls = new Set<string>() // 追踪加载的音频

const { loadImageUrl, getImageUrl } = useAssetImage()
const { loadAudioUrl, getAudioUrl, revokeBlobUrl } = useAssetAudio()

// Stores
// v7.3: effectStore 已删除
const soundStore = useSoundStore()

// 计算当前场景
const currentScene = computed(() => {
  if (!props.episode) return null
  return props.episode.scenes.find(s => s.id === props.sceneId) || null
})

const sceneTitle = computed(() => currentScene.value?.title || '未命名场景')

// 更新 teleport 目标
function updateTeleportTarget() {
  const fullscreenElement = document.fullscreenElement
  teleportTarget.value = fullscreenElement ? fullscreenElement as HTMLElement : 'body'
}

// 格式化时间
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const milliseconds = Math.floor((ms % 1000) / 10)
  return `${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`
}

// 初始化预览
async function initPreview() {
  isLoading.value = true
  errorMessage.value = null
  generatedBlobUrls.clear() // 清理旧的（如果有）
  
  try {
    loadingMessage.value = '正在初始化...'
    
    // 初始化 AudioContext
    await audioKit.init()
    
    // 1. 确保 TTS
    await doEnsureSceneTTS()
    if (errorMessage.value) return
    
    // 2. 预加载图片资源 (Texture)
    await preloadSceneImages()
    
    // 3. 预加载音频资源
    await preloadSceneAudio()
    
    loadingMessage.value = '准备就绪'
    
    // 等待一帧，确保 ScenePlayer 挂载
    await nextTick()
  } catch (e) {
    console.error('Init preview failed', e)
    errorMessage.value = `初始化失败: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isLoading.value = false
  }
}

/**
 * 使用共享模块确保场景 TTS，然后预加载音频 Blob URL
 */
async function doEnsureSceneTTS() {
  const scene = currentSceneCopy.value
  const originalScene = currentScene.value
  if (!scene || !originalScene) return

  loadingMessage.value = '正在检查语音资源...'

  try {
    await sharedEnsureSceneTTS(originalScene, scene, {
      sceneObjects: originalScene.setup.objects,
      actors: projectStore.actors,
      narrator: projectStore.narrator,
      episodeId: props.episodeId,
      onProgress: (msg) => { loadingMessage.value = msg }
    })
  } catch (e) {
    console.error('TTS error', e)
    const error = e as Error & { errorCode?: string }
    if (error.errorCode === 'TTS_PROVIDER_NOT_CONFIGURED') {
      errorMessage.value = '本地 TTS Provider 尚未配置。请先为台词导入本地音频，或配置本地 TTS Provider。'
      return
    }
    throw e
  }

  // 预加载音频 Blob URL（与播放器生命周期绑定，保留在组件内）
  for (const block of scene.script) {
    if (block.type !== 'dialogue' && block.type !== 'narration') continue
    const finalConfig = block.ttsConfig
    if (!finalConfig?.audioPath) continue

    try {
      const audioPath = finalConfig.audioPath
      if (audioPath.startsWith('blob:')) {
        await audioKit.load(audioPath)
        loadedAudioUrls.add(audioPath)
      } else {
        await loadAudioUrl(audioPath)
        let blobUrl = getAudioUrl(audioPath)

        // v12.9: 验证 blob URL 是否仍然有效
        if (blobUrl?.startsWith('blob:')) {
          try {
            const resp = await fetch(blobUrl)
            if (!resp.ok) throw new Error('Blob URL not accessible')
          } catch {
            console.warn('[ScenePreview] 缓存的 Blob URL 已失效，重新加载:', audioPath)
            revokeBlobUrl(audioPath)
            await loadAudioUrl(audioPath)
            blobUrl = getAudioUrl(audioPath)
          }
        }

        if (blobUrl) {
          await audioKit.load(blobUrl)
          loadedAudioUrls.add(blobUrl)
        }
      }
    } catch (e) {
      console.error('Audio loading error', e)
      finalConfig.audioPath = ''
    }
  }
}

async function preloadSceneImages() {
  const scene = currentSceneCopy.value
  if (!scene) return
  
  loadingMessage.value = '正在加载图片资源...'
  
  // 使用 useAssetLoader 统一收集资源（包含表情和 partAssetOverrides）
  const { collectAssets, loadAssets } = useAssetLoader()
  
  // 修复：不仅扫描 Setup，还要扫描所有 Block Actions 的动态资源
  // 这确保 set_character 动态切换的表情等资源也被预加载
  const allImageUrls = new Set<string>()
  
  // Step 1: 收集 Setup 静态资源
  const { imageUrls: setupImageUrls } = collectAssets(scene.setup, null)
  setupImageUrls.forEach(url => allImageUrls.add(url))
  
  // Step 2: 收集所有 Block Actions 的动态资源
  for (const block of scene.script) {
    const { imageUrls: blockImageUrls } = collectAssets(scene.setup, block)
    blockImageUrls.forEach(url => allImageUrls.add(url))
  }
  
  // console.log(`[ScenePreviewDialog] preloadSceneImages: collected ${allImageUrls.size} image URLs (setup: ${setupImageUrls.size}, with blocks: ${allImageUrls.size})`)
  
  // 使用 useAssetLoader 加载资源
  await loadAssets(allImageUrls, new Set())
  
  // 记录已加载的 URL（用于 cleanup）
  // 注意：useAssetLoader 内部使用 textureCache，我们也需要追踪 blobUrl 用于 PIXI.Assets 清理
  for (const url of allImageUrls) {
    try {
      // 确保资源也加载到 useAssetImage 的 blob store
      await loadImageUrl(url)
      const blobUrl = getImageUrl(url)
      if (blobUrl) {
        loadedTextureUrls.add(blobUrl)
      }
    } catch (e) {
      // loadAssets 已处理，这里仅追踪
    }
  }
}


async function preloadSceneAudio() {
  const scene = currentSceneCopy.value
  if (!scene) return

  loadingMessage.value = '正在加载音频资源...'
  const audioPaths = new Set<string>()
  
  // Collect SFX / BGM
  for (const obj of scene.setup.objects) {
      if (obj.type === 'audio') {
          const sound = soundStore.getSound(obj.refId)
          if (sound?.url) audioPaths.add(sound.url)
      }
  }
  
  const paths = Array.from(audioPaths)
  if (paths.length > 0) {
      await Promise.all(paths.map(async (path) => {
          try {
              await loadAudioUrl(path)
              const blobUrl = getAudioUrl(path)
              if (blobUrl) {
                  await audioKit.load(blobUrl)
                  loadedAudioUrls.add(blobUrl)
              }
          } catch (e) {
              console.warn('Failed to preload audio:', path)
          }
      }))
  }
}

// 事件处理
function handlePlayPause() {
  if (isPlaying.value) {
    scenePlayerRef.value?.pause()
  } else {
    void scenePlayerRef.value?.play()
  }
}

function handleReset() {
  scenePlayerRef.value?.reset()
}

// Seek 功能已移除，进度条仅用于显示当前进度



function handlePlaybackFinished() {
  isPlaying.value = false
}

function handleProgress(current: number, total: number) {
  currentTime.value = current
  totalDuration.value = total
}

function handlePlayStateChange(playing: boolean) {
  isPlaying.value = playing
}

function handlePlayerError(msg: string) {
  errorMessage.value = msg
}

function handleClose() {
  scenePlayerRef.value?.pause()
  
  // 释放预加载的纹理资源
  for (const url of loadedTextureUrls) {
      if (PIXI.Assets.cache.has(url)) {
          void PIXI.Assets.unload(url)
      }
  }
  loadedTextureUrls.clear()

  // 释放预加载的音频资源（仅从 audioKit 缓存中移除，不 revoke blob URL）
  for (const url of loadedAudioUrls) {
      audioKit.unload(url)
  }
  loadedAudioUrls.clear()

  // v12.9: 不要 revoke generatedBlobUrls，它们可能属于 useAssetAudio 的全局缓存
  // 否则会导致全局缓存中的 blob URL 失效，下次打开时 fetch 失败 (ERR_FILE_NOT_FOUND)
  generatedBlobUrls.clear()
  
  // 恢复 Store 中的 Base64 (如果被我们修改成了 Blob URL)
  // 实际上，由于我们直接修改了 episode.scenes 中的对象，而 Store 中的 state 也是这些对象
  // 我们可能污染了 Store。
  // 这是一个风险点。
  // 更好的做法是：不要修改原始对象，而是创建一个 Map 传递给 ScenePlayer？
  // 或者：在 close 时，如果有 Base64 备份，恢复它？
  // 由于我们是 "Base64 -> Blob URL"，我们丢失了 Base64 吗？
  // 并没有，我们是从 Store 读取 Base64，转换后赋值给 .audio。
  // 如果我们不恢复，下次 Store 保存时会保存 Blob URL 吗？
  // 是的，如果用户在预览期间保存项目。这是个问题。
  
  // 修正方案：
  // 我们在 ensureSceneTTS 中，不应该修改 block.ttsConfig.audio。
  // 但是 ScenePlayer 是设计为从 block.ttsConfig.audio 读取的。
  // ScenePlayer 应该支持从外部 Map 获取音频，或者我们应该深拷贝一份 Scene 数据给 ScenePlayer。
  
  // 考虑到 ScenePlayer 重构中我们移除了所有转换逻辑，它现在只认 URL。
  // 最简单的方案：深拷贝 currentScene 给 ScenePlayer。
  // 但 ScenePlayer 接收 episodeId/sceneId 并自己从 Store 获取...
  // 这导致 ScenePlayer 总是从 Store 获取原始数据。
  
  // 回头看 ScenePlayer.vue:
  // const currentScene = computed(() => props.episode.scenes.find...)
  // 它使用 props.episode。
  
  // 所以，如果我们在 ScenePreviewDialog 中传递一个 **深拷贝的 Episode** 给 ScenePlayer，
  // 我们就可以随意修改这个副本而不影响 Store。
  
  emit('close')
}

// 修正：使用副本传递给 ScenePlayer
const episodeCopy = ref<Episode | null>(null)
// 备份 SceneObjectStore 数据
const backupSceneObjects = ref<SceneObject[]>([])

// 覆盖 currentScene 计算属性，使用 episodeCopy
const currentSceneCopy = computed(() => {
  if (!episodeCopy.value) return null
  return episodeCopy.value.scenes.find(s => s.id === props.sceneId) || null
})

watch(() => props.visible, async (val) => {
  if (val) {
    updateTeleportTarget()
    // 深拷贝 Episode，避免污染 Store
    episodeCopy.value = JSON.parse(JSON.stringify(props.episode)) as Episode
    
    // 同步 Scene Objects 到 Store，以便 getVoiceId 能查找到实例
    // 注意：使用原始 currentScene (来自 props) 获取对象数据
    // 备份现有数据
    backupSceneObjects.value = [...sceneObjectStore.setupState.objects]

    if (currentScene.value?.setup?.objects) {
       // 双层架构：使用 initFromSetup 替代直接赋值（objects 现在是 computed 只读）
       sceneObjectStore.initFromSetup(currentScene.value.setup.objects)
    } else {
       sceneObjectStore.clearObjects()
    }

    await initPreview()
  } else {
    episodeCopy.value = null
    
    // 恢复 Scene Objects
    // 只有在有备份时才恢复，避免多次恢复导致数据丢失
    if (backupSceneObjects.value.length > 0 || sceneObjectStore.objects.length === 0) {
        // 双层架构：使用 initFromSetup 替代直接赋值
        sceneObjectStore.initFromSetup(backupSceneObjects.value)
        backupSceneObjects.value = []
    }
  }
}, { immediate: true })

</script>

<style scoped>
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483647;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.preview-dialog {
  background: #1f2937;
  border-radius: 8px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  width: 98vw;
  height: 96vh;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #374151;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-icon {
  font-size: 16px;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #f3f4f6;
}

.scene-info {
  font-size: 12px;
  color: #9ca3af;
  background: #374151;
  padding: 2px 8px;
  border-radius: 4px;
}

.block-indicator {
  font-size: 12px;
  color: #60a5fa;
  background: #1e3a5f;
  padding: 2px 8px;
  border-radius: 4px;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #374151;
  color: #f3f4f6;
}

.preview-content {
  position: relative;
  background: #111827;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  overflow: hidden;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(17, 24, 39, 0.9);
  color: #9ca3af;
  font-size: 14px;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #374151;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 32px;
}

.retry-btn {
  margin-top: 10px;
  padding: 6px 12px;
  background: #374151;
  color: #f3f4f6;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid #374151;
  background: #1f2937;
  border-radius: 0 0 8px 8px;
  flex-shrink: 0;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-btn {
  background: #3b82f6;
  color: white;
}

.play-btn:hover:not(:disabled) {
  background: #2563eb;
}

.reset-btn {
  background: #374151;
  color: #f3f4f6;
}

.reset-btn:hover:not(:disabled) {
  background: #4b5563;
}

.btn-icon {
  font-size: 12px;
}

.progress-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #374151;
  border-radius: 3px;
  cursor: pointer;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.progress-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.progress-slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.time-display {
  font-size: 12px;
  color: #9ca3af;
  font-family: monospace;
  min-width: 90px;
  text-align: right;
}
</style>
