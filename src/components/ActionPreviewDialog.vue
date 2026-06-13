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
            <span class="preview-icon">👁️</span>
            <span class="preview-title">动作预览</span>
            <span class="block-info">{{ blockDescription }}</span>
          </div>
          <button
            class="close-btn"
            title="关闭"
            @click="handleClose"
          >
            ✕
          </button>
        </div>

        <!-- 预览画布区域 -->
        <div class="preview-content">
          <div
            v-if="isLoading"
            class="loading-overlay"
          >
            <div class="loading-spinner" />
            <span>{{ loadingMessage }}</span>
          </div>
          <div
            v-if="errorMessage"
            class="error-overlay"
          >
            <span class="error-icon">⚠️</span>
            <span>{{ errorMessage }}</span>
          </div>
          <ScenePlayer
            v-if="!isLoading && !errorMessage && episodeCopy"
            ref="scenePlayerRef"
            :episode-id="episodeId"
            :scene-id="sceneId"
            :block-id="blockId"
            :episode="episodeCopy"
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
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import { type Episode } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { SceneObject } from '@/types/sceneObject'
import { ensureBlockTTS as sharedEnsureBlockTTS } from '@/utils/ttsUtils'
import { audioKit } from '@/utils/WebAudioKit'

import ScenePlayer from './screenplay/ScenePlayer.vue'

const props = defineProps<{
  visible: boolean
  episodeId: string
  sceneId: string
  blockId: string
  episode: Episode
}>()

const emit = defineEmits<{
  close: []
}>()

const projectStore = useProjectStore()
const sceneObjectStore = useSceneObjectStore()
const soundStore = useSoundStore()
const { loadImageUrl, getImageUrl } = useAssetImage()
const { loadAudioUrl, getAudioUrl } = useAssetAudio()

// Teleport 目标 - 在全屏模式下需要 teleport 到全屏元素内
const teleportTarget = shallowRef<HTMLElement | string>('body')

// 状态
const isLoading = ref(true)
const loadingMessage = ref('正在准备预览...')
const errorMessage = ref<string | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const totalDuration = ref(0)

// ScenePlayer 实例引用
interface ScenePlayerInstance {
  play: () => Promise<void>
  pause: () => void
  reset: () => void
  seek: (time: number) => void
  currentTime: number
  totalDuration: number
  isPlaying: boolean
}
const scenePlayerRef = ref<ScenePlayerInstance | null>(null)

// 资源管理
const loadedTextureUrls = new Set<string>()
const loadedAudioUrls = new Set<string>()

// Episode 深拷贝 (Playable Replica 模式)
const episodeCopy = ref<Episode | null>(null)

// 备份 SceneObjectStore 数据
const backupSceneObjects = ref<SceneObject[]>([])

// 计算当前场景 (使用原始 props)
const currentScene = computed(() => {
  if (!props.episode) return null
  return props.episode.scenes.find(s => s.id === props.sceneId) ?? null
})

// 计算当前场景副本
const currentSceneCopy = computed(() => {
  if (!episodeCopy.value) return null
  return episodeCopy.value.scenes.find(s => s.id === props.sceneId) ?? null
})

// 计算当前 Block
const currentBlock = computed(() => {
  if (!currentScene.value) return null
  return currentScene.value.script.find(b => b.id === props.blockId) ?? null
})

// Block 描述
const blockDescription = computed(() => {
  const block = currentBlock.value
  if (!block) return ''
  
  if (block.type === 'dialogue') {
    const instance = sceneObjectStore.getObject(block.instanceId)
    const displayName = instance ? (instance.alias ?? instance.name) : block.instanceId
    return `${displayName}: "${block.text.substring(0, 15)}${block.text.length > 15 ? '...' : ''}"`
  } else if (block.type === 'narration') {
    return `旁白: "${block.text.substring(0, 15)}${block.text.length > 15 ? '...' : ''}"`
  } else {
    const otherBlock = block as unknown as { type: string, description?: string }
    if (otherBlock.type === 'action') {
      return otherBlock.description ?? '演出 (纯动作)'
    }
  }
  return ''
})

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

/**
 * 确保当前 Block 的 TTS 已生成并准备好
 */
async function ensureBlockTTS() {
  const scene = currentSceneCopy.value
  const originalScene = currentScene.value
  if (!scene || !originalScene) return

  // 找到目标 Block
  const block = scene.script.find(b => b.id === props.blockId)
  const originalBlock = originalScene.script.find(b => b.id === props.blockId)
  if (!block || !originalBlock) return
  if (block.type !== 'dialogue' && block.type !== 'narration') return
  if (originalBlock.type !== 'dialogue' && originalBlock.type !== 'narration') return

  loadingMessage.value = '正在检查语音资源...'

  try {
    await sharedEnsureBlockTTS(originalBlock, block, {
      sceneObjects: originalScene.setup.objects,
      actors: projectStore.actors,
      narrator: projectStore.narrator,
      episodeId: props.episodeId,
      sceneId: props.sceneId,
      onProgress: (msg) => { loadingMessage.value = msg }
    })
  } catch (err) {
    console.error('[ActionPreview] TTS生成失败:', err)
    const error = err as Error & { errorCode?: string }
    if (error.errorCode === 'TTS_PROVIDER_NOT_CONFIGURED') {
      errorMessage.value = '本地 TTS Provider 尚未配置。请先为台词导入本地音频，或配置本地 TTS Provider。'
    } else {
      errorMessage.value = `TTS生成失败: ${error.message ?? '未知错误'}`
    }
    return
  }

  // 预加载 TTS 音频 Blob URL
  const finalBlock = scene.script.find(b => b.id === props.blockId)
  const audioPath = (finalBlock && finalBlock.type !== 'action') ? finalBlock.ttsConfig?.audioPath : undefined
  if (audioPath && !audioPath.startsWith('blob:') && !audioPath.startsWith('data:')) {
    try {
      await loadAudioUrl(audioPath)
      const blobUrl = getAudioUrl(audioPath)
      if (blobUrl) {
        await audioKit.load(blobUrl)
        loadedAudioUrls.add(blobUrl)
      }
    } catch (e) {
      console.warn('[ActionPreview] TTS audio preload failed:', e)
    }
  }
}

/**
 * 预加载场景图片资源
 */
async function preloadSceneImages() {
  const scene = currentSceneCopy.value
  if (!scene) return
  
  loadingMessage.value = '正在加载图片资源...'
  
  const { collectAssets, loadAssets } = useAssetLoader()
  const allImageUrls = new Set<string>()
  
  // 收集 Setup 静态资源
  const { imageUrls: setupImageUrls } = collectAssets(scene.setup, null)
  setupImageUrls.forEach(url => allImageUrls.add(url))
  
  // 收集当前 Block 的动态资源 (set_character 切换的表情等)
  const block = scene.script.find(b => b.id === props.blockId)
  if (block) {
    const { imageUrls: blockImageUrls } = collectAssets(scene.setup, block)
    blockImageUrls.forEach(url => allImageUrls.add(url))
  }
  
  // 加载资源
  await loadAssets(allImageUrls, new Set())
  
  for (const url of allImageUrls) {
    try {
      await loadImageUrl(url)
      const blobUrl = getImageUrl(url)
      if (blobUrl) {
        loadedTextureUrls.add(blobUrl)
      }
    } catch {
      // loadAssets 已处理
    }
  }
}

/**
 * 预加载场景音频资源 (SFX/BGM)
 */
async function preloadSceneAudio() {
  const scene = currentSceneCopy.value
  if (!scene) return

  loadingMessage.value = '正在加载音频资源...'
  const audioPaths = new Set<string>()
  
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
      } catch {
        // ignore
      }
    }))
  }
}

/**
 * 初始化预览
 */
async function initPreview() {
  isLoading.value = true
  errorMessage.value = null
  
  try {
    loadingMessage.value = '正在初始化...'
    
    await audioKit.init()
    
    // 1. 确保 TTS
    await ensureBlockTTS()
    if (errorMessage.value) return  // TTS 失败已设置错误消息
    
    // 2. 预加载图片资源
    await preloadSceneImages()
    
    // 3. 预加载音频资源
    await preloadSceneAudio()
    
    loadingMessage.value = '准备就绪'
    
    await nextTick()
  } catch (e) {
    console.error('[ActionPreview] Init preview failed:', e)
    errorMessage.value = `初始化失败: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isLoading.value = false
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

  // 释放预加载的音频资源
  for (const url of loadedAudioUrls) {
    audioKit.unload(url)
  }
  loadedAudioUrls.clear()
  
  emit('close')
}

// 恢复 SceneObjectStore 的备份数据
// 提取为独立函数，供 onBeforeUnmount 和 watch 共用
function restoreSceneObjects() {
  if (backupSceneObjects.value.length > 0 || sceneObjectStore.objects.length === 0) {
    // 双层架构：使用 initFromSetup 替代直接赋值
    sceneObjectStore.initFromSetup(backupSceneObjects.value)
    backupSceneObjects.value = []
  }
}

// 组件卸载前恢复 Store（v-if 控制的组件卸载时 watch 不会触发 visible=false）
onBeforeUnmount(() => {
  restoreSceneObjects()
})

// 监听 visible 变化
watch(() => props.visible, async (val) => {
  if (val) {
    updateTeleportTarget()
    
    // 深拷贝 Episode，避免污染 Store
    episodeCopy.value = JSON.parse(JSON.stringify(props.episode)) as Episode
    
    // 同步 Scene Objects 到 Store
    backupSceneObjects.value = [...sceneObjectStore.setupState.objects]
    if (currentScene.value?.setup?.objects) {
      // 双层架构：使用 initFromSetup 替代直接赋值
      sceneObjectStore.initFromSetup(currentScene.value.setup.objects)
    } else {
      sceneObjectStore.clearObjects()
    }
    
    await initPreview()
  } else {
    episodeCopy.value = null
    restoreSceneObjects()
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

.block-info {
  font-size: 12px;
  color: #9ca3af;
  background: #374151;
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
