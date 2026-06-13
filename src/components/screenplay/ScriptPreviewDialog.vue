<template>
  <Teleport :to="teleportTarget">
    <div
      v-if="visible"
      class="script-preview-overlay"
      @click.self="handleClose"
    >
      <div class="script-preview-dialog">
        <!-- 加载遮罩 -->
        <div
          v-if="isLoadingResources"
          class="loading-overlay"
        >
          <div class="loading-content">
            <template v-if="ttsProviderError">
              <div class="tts-provider-error-icon">
                ⚠️
              </div>
              <div class="tts-provider-error-title">
                本地 TTS 未配置
              </div>
              <div class="tts-provider-error-message">
                {{ loadingDetail }}
              </div>
              <button
                class="close-btn-secondary"
                @click="handleClose"
              >
                关闭
              </button>
            </template>
            <!-- 正常加载状态 -->
            <template v-else>
              <div class="loading-spinner" />
              <div class="loading-text">
                正在准备资源...
              </div>
              <div class="loading-progress">
                <div
                  class="progress-bar"
                  :style="{ width: `${loadingProgress}%` }"
                />
              </div>
              <div class="loading-detail">
                {{ loadingDetail }}
              </div>
            </template>
          </div>
        </div>

        <!-- 主内容区：播放器 -->
        <div
          v-show="!isLoadingResources"
          class="player-content"
        >
          <div class="player-header">
            <div class="header-left">
              <span class="preview-icon">🎬</span>
              <span class="preview-title">{{ currentSceneTitle }}</span>
              <span
                v-if="currentScene"
                class="scene-info"
              >
                {{ currentSceneIndex + 1 }} / {{ scenes.length }}
              </span>
              <span
                v-if="isPlayerPlaying"
                class="block-info"
              >
                - 正在播放
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

          <div class="player-container">
            <!-- 场景播放器组件：A/B 双层交接，避免同一 ScenePlayer 跨场景复用导致运行态残留 -->
            <ScenePlayer
              v-if="layerAScene && !isLoadingResources"
              :key="`scene-player-a-${layerA.key}-${layerAScene.id}`"
              ref="playerARef"
              class="player-layer"
              :class="{ active: activeLayerId === 'a', pending: pendingLayerId === 'a' }"
              :episode-id="episodeId"
              :scene-id="layerAScene.id"
              :episode="episodeCopy || episode"
              :auto-play="false"
              :seamless="true"
              @playback-finished="handleSceneFinished('a')"
              @error="handlePlayerError"
              @ready="handlePlayerReady('a')"
              @progress="(localCurrent: number) => handleProgress('a', localCurrent)"
            />
            <ScenePlayer
              v-if="layerBScene && !isLoadingResources"
              :key="`scene-player-b-${layerB.key}-${layerBScene.id}`"
              ref="playerBRef"
              class="player-layer"
              :class="{ active: activeLayerId === 'b', pending: pendingLayerId === 'b' }"
              :episode-id="episodeId"
              :scene-id="layerBScene.id"
              :episode="episodeCopy || episode"
              :auto-play="false"
              :seamless="true"
              @playback-finished="handleSceneFinished('b')"
              @error="handlePlayerError"
              @ready="handlePlayerReady('b')"
              @progress="(localCurrent: number) => handleProgress('b', localCurrent)"
            />
          </div>

          <!-- 播放控制栏 -->
          <div class="player-controls">
            <button
              class="ctrl-btn play-btn"
              :title="isPlayerPlaying ? '暂停' : '播放'"
              @click="togglePlay"
            >
              {{ isPlayerPlaying ? '暂停' : '播放' }}
            </button>
            <button
              class="ctrl-btn reset-btn"
              title="重置当前场景"
              @click="handleReset"
            >
              重置
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
              <span class="time-text">{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import type { Episode } from '@/stores/episodeStore'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { Scene } from '@/types/project'
import type { BGMTrack, SceneContainer, SceneSetup, ScriptBlock } from '@/types/screenplay'
import { ensureSceneTTS as sharedEnsureSceneTTS } from '@/utils/ttsUtils'
import type { AudioInstance } from '@/utils/WebAudioKit'
import { audioKit } from '@/utils/WebAudioKit'

import ScenePlayer from './ScenePlayer.vue'

const props = defineProps<{
  visible: boolean
  episodeId: string
  episode: Episode
  initialSceneId?: string
}>()

const SCENE_START_ID = '__SCENE_START__'
const SCENE_END_ID = '__SCENE_END__'

const emit = defineEmits<{
  close: []
}>()

const projectStore = useProjectStore()
const episodeStore = useEpisodeStore()
// v7.58: 移除 characterStore, backgroundStore, propStore，改用 useAssetLoader 统一管理
const soundStore = useSoundStore()
const { getImageUrl } = useAssetImage()
const { loadAudioUrl, getAudioUrl, revokeBlobUrl } = useAssetAudio()

// 资源管理
const generatedBlobUrls = new Set<string>()
const loadedTextureUrls = new Set<string>()
const loadedAudioUrls = new Set<string>()

// 副本 (用于播放，包含 Blob URLs)
const episodeCopy = ref<Episode | null>(null)

onMounted(() => {
  // console.log('[ScriptPreview] Component mounted')
  updateTeleportTarget()
})

onBeforeUnmount(() => {
    stopAndCleanup()
})

// 状态
const currentSceneIndex = ref(0)
const autoPlayNext = ref(false)
const isPlayerPlaying = ref(false)
const isPlaybackFinished = ref(false)
const currentTime = ref(0) // Global current time
const totalDuration = ref(0) // Global total duration
const teleportTarget = shallowRef<HTMLElement | string>('body')

interface ScenePlayerInstance {
  play: () => Promise<void>
  pause: () => void
  reset: () => void
  seek: (time: number) => void
  currentTime: number
  totalDuration: number
  isPlaying: boolean
}

type PlayerLayerId = 'a' | 'b'

interface PlayerLayerState {
  sceneIndex: number | null
  key: number
}

let playerLayerKeySeed = 0
const layerA = ref<PlayerLayerState>({ sceneIndex: null, key: ++playerLayerKeySeed })
const layerB = ref<PlayerLayerState>({ sceneIndex: null, key: ++playerLayerKeySeed })
const activeLayerId = ref<PlayerLayerId>('a')
const pendingLayerId = ref<PlayerLayerId | null>(null)
const isPendingLayerReady = ref(false)
const shouldSwitchWhenPendingReady = ref(false)
const playerARef = ref<ScenePlayerInstance | null>(null)
const playerBRef = ref<ScenePlayerInstance | null>(null)
let nextSceneWarmupTimer: number | null = null
let previousLayerCleanupTimer: number | null = null

// 场景时间信息缓存
const sceneDurations = ref<number[]>([])
const sceneStartTimes = ref<number[]>([])
const sceneBlockTimeline = ref<Record<string, { id: string, startTime: number, endTime: number }[]>>({})

// BGM 状态
const activeBGMInstances = new Map<string, AudioInstance>()

interface BGMTimelineItem {
  track: BGMTrack
  startTime: number
  endTime: number
  triggerEndTime: number
}
const bgmTimelines = ref<BGMTimelineItem[]>([])

// 预加载状态
const isLoadingResources = ref(false)
const loadingProgress = ref(0)
const loadingDetail = ref('')
const ttsProviderError = ref(false)

// 计算属性
const scenes = computed(() => (episodeCopy.value || props.episode).scenes || [])

const currentScene = computed(() => {
  if (scenes.value.length === 0) return null
  return scenes.value[currentSceneIndex.value]
})

const layerAScene = computed(() => getSceneByLayerIndex(layerA.value.sceneIndex))
const layerBScene = computed(() => getSceneByLayerIndex(layerB.value.sceneIndex))

const currentSceneTitle = computed(() => {
  return currentScene.value?.title || `场景 ${currentSceneIndex.value + 1}`
})

// 方法
function getSceneByLayerIndex(index: number | null): SceneContainer | null {
  if (index === null) return null
  return scenes.value[index] ?? null
}

function getLayerState(layerId: PlayerLayerId): PlayerLayerState {
  return layerId === 'a' ? layerA.value : layerB.value
}

function getLayerPlayer(layerId: PlayerLayerId): ScenePlayerInstance | null {
  return layerId === 'a' ? playerARef.value : playerBRef.value
}

function getActivePlayer(): ScenePlayerInstance | null {
  return getLayerPlayer(activeLayerId.value)
}

function getInactiveLayerId(): PlayerLayerId {
  return activeLayerId.value === 'a' ? 'b' : 'a'
}

function resetPlayerLayers(sceneIndex: number) {
  cancelLayerTransitionTimers()
  activeLayerId.value = 'a'
  pendingLayerId.value = null
  isPendingLayerReady.value = false
  shouldSwitchWhenPendingReady.value = false
  layerA.value = { sceneIndex, key: ++playerLayerKeySeed }
  layerB.value = { sceneIndex: null, key: ++playerLayerKeySeed }
}

function clearPendingLayer() {
  if (!pendingLayerId.value) return
  const pendingLayer = getLayerState(pendingLayerId.value)
  pendingLayer.sceneIndex = null
  pendingLayer.key = ++playerLayerKeySeed
  pendingLayerId.value = null
  isPendingLayerReady.value = false
  shouldSwitchWhenPendingReady.value = false
}

function preparePendingScene(sceneIndex: number) {
  if (sceneIndex < 0 || sceneIndex >= scenes.value.length) return
  if (pendingLayerId.value) {
    const currentPendingLayer = getLayerState(pendingLayerId.value)
    if (currentPendingLayer.sceneIndex === sceneIndex) return
    clearPendingLayer()
  }

  const pendingId = getInactiveLayerId()
  const pendingLayer = getLayerState(pendingId)
  pendingLayer.sceneIndex = sceneIndex
  pendingLayer.key = ++playerLayerKeySeed
  pendingLayerId.value = pendingId
  isPendingLayerReady.value = false
}

function prepareNextSceneInBackground() {
  const nextSceneIndex = currentSceneIndex.value + 1
  if (nextSceneIndex >= scenes.value.length) return
  preparePendingScene(nextSceneIndex)
}

function cancelNextSceneWarmup() {
  if (nextSceneWarmupTimer === null) return
  window.clearTimeout(nextSceneWarmupTimer)
  nextSceneWarmupTimer = null
}

function cancelPreviousLayerCleanup() {
  if (previousLayerCleanupTimer === null) return
  window.clearTimeout(previousLayerCleanupTimer)
  previousLayerCleanupTimer = null
}

function cancelLayerTransitionTimers() {
  cancelNextSceneWarmup()
  cancelPreviousLayerCleanup()
}

function schedulePreviousLayerCleanup(
  layerId: PlayerLayerId,
  expectedSceneIndex: number | null,
  expectedKey: number,
) {
  cancelPreviousLayerCleanup()
  previousLayerCleanupTimer = window.setTimeout(() => {
    previousLayerCleanupTimer = null

    if (activeLayerId.value === layerId || pendingLayerId.value === layerId) return

    const layer = getLayerState(layerId)
    if (layer.sceneIndex !== expectedSceneIndex || layer.key !== expectedKey) return

    layer.sceneIndex = null
    layer.key = ++playerLayerKeySeed
  }, 600)
}

function scheduleNextSceneWarmup() {
  cancelNextSceneWarmup()

  const nextSceneIndex = currentSceneIndex.value + 1
  if (nextSceneIndex >= scenes.value.length) return

  nextSceneWarmupTimer = window.setTimeout(() => {
    nextSceneWarmupTimer = null

    if (!isPlayerPlaying.value || isPlaybackFinished.value || isLoadingResources.value) return
    if (pendingLayerId.value) return

    preparePendingScene(nextSceneIndex)
  }, 1200)
}

function activatePendingLayer() {
  if (!pendingLayerId.value) return false

  const nextLayerId = pendingLayerId.value
  const pendingLayer = getLayerState(nextLayerId)
  const nextSceneIndex = pendingLayer.sceneIndex
  if (nextSceneIndex === null) return false

  const previousActiveLayerId = activeLayerId.value
  activeLayerId.value = nextLayerId
  pendingLayerId.value = null
  isPendingLayerReady.value = false
  shouldSwitchWhenPendingReady.value = false
  currentSceneIndex.value = nextSceneIndex

  const previousLayer = getLayerState(previousActiveLayerId)
  const previousSceneIndex = previousLayer.sceneIndex
  const previousLayerKey = previousLayer.key
  schedulePreviousLayerCleanup(previousActiveLayerId, previousSceneIndex, previousLayerKey)

  if (isPlayerPlaying.value) {
    void nextTick(() => {
      const activePlayer = getActivePlayer()
      if (activePlayer) void activePlayer.play()
      scheduleNextSceneWarmup()
    })
  }

  return true
}

function updateTeleportTarget() {
  const fullscreenElement = document.fullscreenElement
  teleportTarget.value = fullscreenElement ? fullscreenElement as HTMLElement : 'body'
  // console.log('[ScriptPreview] Updated teleport target:', teleportTarget.value)
}

async function preloadGlobalBGM() {
  const tracks = props.episode.bgmTracks || []
  if (tracks.length === 0) return

  loadingDetail.value = '正在预加载配乐...'
  
  for (const track of tracks) {
    if (track.assetId) {
      const asset = soundStore.getSound(track.assetId)
      if (asset?.url) {
        try {
          await loadAudioUrl(asset.url)
          const blobUrl = getAudioUrl(asset.url)
          if (blobUrl) {
            await audioKit.load(blobUrl)
            loadedAudioUrls.add(blobUrl)
          }
        } catch (e) {
          console.warn(`[ScriptPreview] Failed to preload BGM: ${asset.url}`, e)
        }
      }
    }
  }
}

function updateGlobalBGM(globalTime: number) {
  for (const item of bgmTimelines.value) {
    const { track, startTime, triggerEndTime } = item
    
    // Check if should play based on triggerEndTime (which accounts for fadeOut)
    const shouldPlay = globalTime >= startTime && globalTime < triggerEndTime
    
    // Execute Play/Stop logic
    const instance = activeBGMInstances.get(track.id)
    if (shouldPlay) {
        // Check global player state
        if (!isPlayerPlaying.value) {
            continue
        }

        if (instance) {
             // If already playing, do nothing
             if (instance.isPlaying) continue

             // If paused but not ended, resume
             instance.resume()
             continue
        }

        // Start playing
        const asset = soundStore.getSound(track.assetId)
            const blobUrl = asset?.url ? getAudioUrl(asset.url) : null
            
            if (blobUrl) {
                // Calculate start offset in seconds
                const offsetSeconds = Math.max(0, (globalTime - startTime) / 1000)

                // console.log(`[updateGlobalBGM] Starting track ${track.id} at ${globalTime}, offset=${offsetSeconds}`)

                void audioKit.play(blobUrl, {
                    volume: track.volume,
                    loop: track.loop,
                    fadeIn: track.fadeIn ?? 1.0,
                    startOffset: offsetSeconds
                }).then(inst => {
                    if (inst) {
                        // console.log(`[activeBGMInstances] Setting instance for ${track.id}`)
                        activeBGMInstances.set(track.id, inst)
                    }
                })
            }
    } else {
        if (instance?.isPlaying) {
            // console.log(`[updateGlobalBGM] Stopping track ${track.id} at ${globalTime}`)
            instance.stop(track.fadeOut ?? 1.0)
            // console.log(`[activeBGMInstances] Deleting instance for ${track.id} (stop)`)
            activeBGMInstances.delete(track.id)
        }
    }
  }
}

function stopAndCleanup() {
  cancelLayerTransitionTimers()
  playerARef.value?.pause()
  playerBRef.value?.pause()

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

  // 停止所有声音
  // console.log('[ScriptPreview] Stopping all audio (cleanup)')
  audioKit.stopAll()
  // console.log('[activeBGMInstances] Clearing all (stopAndCleanup)')
  activeBGMInstances.clear()

  // v12.9: 不要 revoke generatedBlobUrls，它们可能属于 useAssetAudio 的全局缓存
  // 否则会导致全局缓存中的 blob URL 失效，下次打开时 fetch 失败 (ERR_FILE_NOT_FOUND)
  generatedBlobUrls.clear()
}

function resetPlayerState() {
  cancelLayerTransitionTimers()
  currentTime.value = 0
  isPlayerPlaying.value = false
  isPlaybackFinished.value = false
  autoPlayNext.value = false
  clearPendingLayer()
  
  // Reset BGM
  audioKit.stopAll()
  activeBGMInstances.clear()
}

function handleClose() {
  stopAndCleanup()
  ttsProviderError.value = false
  emit('close')
}

function handleSceneFinished(layerId: PlayerLayerId = activeLayerId.value) {
  if (layerId !== activeLayerId.value) return
  // console.log(`[ScriptPreview] Scene ${currentSceneIndex.value} finished`)
  // 当前场景播放结束，自动播放下一场
  if (currentSceneIndex.value < scenes.value.length - 1) {
    // console.log('[ScriptPreview] Auto-playing next scene:', currentSceneIndex.value + 1)
    const nextSceneIndex = currentSceneIndex.value + 1
    
    // 下一场通常已在当前场景播放期间完成隐藏层预热；若还没 ready，
    // 当前播放器保持在最后一帧，等 ready 后立即切换。
    if (pendingLayerId.value && getLayerState(pendingLayerId.value).sceneIndex === nextSceneIndex) {
      if (isPendingLayerReady.value) {
        activatePendingLayer()
      } else {
        shouldSwitchWhenPendingReady.value = true
      }
    } else {
      preparePendingScene(nextSceneIndex)
      shouldSwitchWhenPendingReady.value = true
    }

    autoPlayNext.value = false
    
    // 2. 注意：我们不应该在这里 stopAll，因为 BGM 需要跨场景播放
    // 也不需要 clear activeBGMInstances，因为 updateGlobalBGM 会处理状态
    
  } else {
    // 整个剧本结束
    // console.log('[ScriptPreview] All scenes finished')
    isPlayerPlaying.value = false
    isPlaybackFinished.value = true
    //currentTime.value = totalDuration.value // Ensure UI shows full progress
    
    // 淡出所有 BGM
    // console.log('[ScriptPreview] All scenes finished, fading out all BGMs')
    activeBGMInstances.forEach((inst, trackId) => {
      const track = props.episode.bgmTracks?.find(t => t.id === trackId)
      inst.stop(track?.fadeOut ?? 1.0)
    })
    // console.log('[activeBGMInstances] Clearing all (handleSceneFinished - all finished)')
    activeBGMInstances.clear()
  }
}

function togglePlay() {
  const activePlayer = getActivePlayer()
  if (!activePlayer) return
  
  if (isPlayerPlaying.value) {
    isPlayerPlaying.value = false
    cancelNextSceneWarmup()
    activePlayer.pause()
  } else {
    // 如果播放已结束，则从头开始
    if (isPlaybackFinished.value) {
        handleReset()
        isPlaybackFinished.value = false
        isPlayerPlaying.value = true
        
        // 尝试播放（处理单场景或组件未卸载的情况）
        void nextTick(() => {
            const player = getActivePlayer()
            if (player) void player.play()
        })
    } else {
        isPlayerPlaying.value = true
        void activePlayer.play()
    }
  }
}

function handleReset() {
  // console.log('[ScriptPreview] Resetting playback')
  const wasAtZero = currentSceneIndex.value === 0
  
  // 重置状态
  resetPlayerState()
  currentSceneIndex.value = 0
  resetPlayerLayers(0)
  
  void nextTick(() => {
    const activePlayer = getActivePlayer()
    if (!activePlayer) return
    if (wasAtZero) activePlayer.reset()
    else activePlayer.pause()
  })
}



function handlePlayerError(msg: string) {
  console.error('[ScriptPreview] Player error:', msg)
  isPlayerPlaying.value = false
}

function handlePlayerReady(layerId: PlayerLayerId) {
  if (pendingLayerId.value === layerId) {
    isPendingLayerReady.value = true
    if (shouldSwitchWhenPendingReady.value) {
      activatePendingLayer()
    }
    return
  }

  if (layerId === activeLayerId.value && getLayerState(layerId).sceneIndex === currentSceneIndex.value) {
    void nextTick(() => {
      prepareNextSceneInBackground()
    })
  }
}

function handleProgress(layerIdOrLocalCurrent: PlayerLayerId | number, maybeLocalCurrent?: number) {
  const layerId = typeof layerIdOrLocalCurrent === 'string'
    ? layerIdOrLocalCurrent
    : activeLayerId.value
  const localCurrent = typeof layerIdOrLocalCurrent === 'number'
    ? layerIdOrLocalCurrent
    : (maybeLocalCurrent ?? 0)

  if (layerId !== activeLayerId.value) return
  // Calculate global time
  const sceneStart = sceneStartTimes.value[currentSceneIndex.value] || 0
  
  // Update global time
  currentTime.value = sceneStart + localCurrent
  
  // Update Global BGM (v7.5)
  updateGlobalBGM(currentTime.value)
}

// Seek 功能已移除，进度条仅用于显示当前进度

function recalculateGlobalTimeline() {
    let accum = 0
    const starts: number[] = []
    for (let i = 0; i < scenes.value.length; i++) {
        starts.push(accum)
        accum += (sceneDurations.value[i] || 0)
    }
    sceneStartTimes.value = starts
    totalDuration.value = accum
    
    // 持久化总时长到 Episode（转换为秒）
    if (accum > 0) {
        episodeStore.updateEpisode(props.episodeId, { 
            duration: Math.round(accum / 1000) 
        })
    }
}

function calculateBGMTimelines() {
    const tracks = props.episode.bgmTracks || []
    const timelines: BGMTimelineItem[] = []

    for (const track of tracks) {
        // Start Time Calculation
        let startTime = 0
        const startSceneIndex = scenes.value.findIndex(s => s.id === track.start.sceneId)
        
        if (startSceneIndex === -1) {
            console.warn(`[ScriptPreview] Invalid start scene for track ${track.id}`)
            continue
        }

        const startSceneGlobalTime = sceneStartTimes.value[startSceneIndex] || 0
        
        if (!track.start.blockId || track.start.blockId === SCENE_START_ID) {
            startTime = startSceneGlobalTime
        } else if (track.start.blockId === SCENE_END_ID) {
            startTime = startSceneGlobalTime + (sceneDurations.value[startSceneIndex] || 0)
        } else {
            const sceneTimeline = sceneBlockTimeline.value[track.start.sceneId] || []
            const block = sceneTimeline.find(b => b.id === track.start.blockId)
            if (block) {
                startTime = startSceneGlobalTime + block.startTime
            } else {
                startTime = startSceneGlobalTime
            }
        }

        // End Time Calculation
        let endTime = totalDuration.value
        const endSceneIndex = scenes.value.findIndex(s => s.id === track.end.sceneId)

        if (endSceneIndex !== -1) {
            const endSceneGlobalTime = sceneStartTimes.value[endSceneIndex] || 0
            
            if (!track.end.blockId || track.end.blockId === SCENE_END_ID) {
                endTime = endSceneGlobalTime + (sceneDurations.value[endSceneIndex] || 0)
            } else if (track.end.blockId === SCENE_START_ID) {
                endTime = endSceneGlobalTime
            } else {
                const sceneTimeline = sceneBlockTimeline.value[track.end.sceneId] || []
                const block = sceneTimeline.find(b => b.id === track.end.blockId)
                if (block) {
                    endTime = endSceneGlobalTime + block.startTime
                } else {
                    endTime = endSceneGlobalTime + (sceneDurations.value[endSceneIndex] || 0)
                }
            }
        }

        const fadeOutDuration = (track.fadeOut ?? 1.0) * 1000
        const triggerEndTime = Math.max(startTime, endTime - fadeOutDuration)

        timelines.push({
            track,
            startTime,
            endTime,
            triggerEndTime
        })
    }
    
    bgmTimelines.value = timelines
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const milliseconds = Math.floor((ms % 1000) / 100)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}.${milliseconds}`
}

// ----------------------------------------------------------------------
// 资源预加载逻辑
// ----------------------------------------------------------------------

async function preloadAllResources() {
  if (scenes.value.length === 0) return
  
  // console.log('[ScriptPreview] Starting resource preload for', scenes.value.length, 'scenes')
  isLoadingResources.value = true
  ttsProviderError.value = false
  loadingProgress.value = 0
  loadingDetail.value = '开始分析剧本资源...'
  
  // Reset timeline info
  sceneDurations.value = new Array<number>(scenes.value.length).fill(0)
  sceneStartTimes.value = new Array<number>(scenes.value.length).fill(0)
  
  try {
    const totalScenes = scenes.value.length
    
    // 初始化 AudioContext (必须在用户交互后调用，这里假设打开 Dialog 是用户交互)
    await audioKit.init()
    // console.log('[ScriptPreview] AudioKit initialized')
    
    // 确保元数据已加载
    // console.log('[ScriptPreview] Checking store data...')

    for (let i = 0; i < totalScenes; i++) {
      const scene = scenes.value[i]
      if (!scene) continue

      const sceneProgressBase = (i / totalScenes) * 100
      const sceneProgressStep = (1 / totalScenes) * 100
      
      // console.log(`[ScriptPreview] Processing scene ${i + 1}/${totalScenes}: ${scene.title}`)
      loadingDetail.value = `正在处理场景 ${i + 1}/${totalScenes}: ${scene.title || '未命名'}`
      
      // 1. 处理 TTS (最耗时，先做)
    // console.log(`[ScriptPreview] Preloading TTS for scene ${i}`)
    // 获取原始场景对象，用于检查更新
    const originalScene = props.episode.scenes[i]
    if (!originalScene) continue
    
            await doPreloadSceneTTS(scene, originalScene)
            loadingProgress.value = sceneProgressBase + sceneProgressStep * 0.4
      
      // 2. 计算场景时长 (Estimating Duration)
      calculateSceneDuration(scene, i)
      
      // 3. 处理图片资源 (生成 Texture)
      // console.log(`[ScriptPreview] Preloading images for scene ${i}`)
      await preloadSceneImages(scene)
      loadingProgress.value = sceneProgressBase + sceneProgressStep * 0.7
      
      // 4. 处理音频资源 (BGM/SFX 解码)
      // console.log(`[ScriptPreview] Preloading audio for scene ${i}`)
      await preloadSceneAudio(scene)
      loadingProgress.value = sceneProgressBase + sceneProgressStep
    }
    
    // 5. 预加载全局 BGM (v7.5)
    await preloadGlobalBGM()

    // Finalize timeline
    recalculateGlobalTimeline()
    calculateBGMTimelines()
    
    loadingProgress.value = 100
    loadingDetail.value = '准备就绪'
    // console.log('[ScriptPreview] Resource preload completed')
    
    // 稍微延迟，让用户看到 100%
    await new Promise(resolve => setTimeout(resolve, 500))
    
    isLoadingResources.value = false
    
    // 如果没有指定初始场景，自动开始播放第一个
    if (!props.initialSceneId) {
      currentSceneIndex.value = 0
      resetPlayerLayers(0)
      autoPlayNext.value = false
    }
    
  } catch (err) {
    console.error('[ScriptPreview] 资源预加载失败:', err)
    
    const error = err as Error & { errorCode?: string }
    if (error.errorCode === 'TTS_PROVIDER_NOT_CONFIGURED') {
      ttsProviderError.value = true
      loadingDetail.value = '本地 TTS Provider 尚未配置。请先为台词导入本地音频，或配置本地 TTS Provider。'
      return
    }
    
    // 其他错误：仍然允许进入（可能只是部分资源失败）
    loadingDetail.value = `预加载失败: ${err instanceof Error ? err.message : '未知错误'}`
    setTimeout(() => {
        isLoadingResources.value = false
    }, 2000)
  }
}

function calculateSceneDuration(scene: SceneContainer, index: number) {
    let duration = 0
    const blockTimelines: { id: string, startTime: number, endTime: number }[] = []
    
    if (scene.script) {
        for (const block of scene.script) {
            let blockDur = 1000 // Default
            if (block.type === 'action') {
              blockDur = block.duration
            } else if (block.ttsConfig?.duration) {
                blockDur = block.ttsConfig.duration
            } else {
                const legacyDuration = (block as { duration?: number }).duration
                if (legacyDuration) {
                    blockDur = legacyDuration
                }
            }
            
            blockTimelines.push({
                id: block.id,
                startTime: duration,
                endTime: duration + blockDur
            })
            
            duration += blockDur
        }
    }
    sceneDurations.value[index] = duration
    sceneBlockTimeline.value[scene.id] = blockTimelines
}

function syncTtsDurationFromAudioBuffer(block: ScriptBlock, audioBuffer: AudioBuffer | null) {
  if (block.type !== 'dialogue' && block.type !== 'narration') return
  if (!block.ttsConfig) return

  const actualDuration = Math.round((audioBuffer?.duration ?? 0) * 1000)
  if (actualDuration > 0) {
    block.ttsConfig.duration = Math.max(block.ttsConfig.duration ?? 0, actualDuration)
  }
}

/**
 * 使用共享 TTS 模块确保场景 TTS，然后预加载音频 Blob URL
 */
async function doPreloadSceneTTS(scene: SceneContainer, originalScene: SceneContainer) {
  if (!scene || !originalScene || !scene.script) return

  try {
    await sharedEnsureSceneTTS(originalScene, scene, {
      sceneObjects: originalScene.setup.objects,
      actors: projectStore.actors,
      narrator: projectStore.narrator,
      episodeId: props.episodeId,
      onProgress: (msg) => { loadingDetail.value = msg }
    })
  } catch (e) {
    console.error('TTS error', e)
    const error = e as Error & { errorCode?: string }
    if (error.errorCode === 'TTS_PROVIDER_NOT_CONFIGURED') {
      loadingDetail.value = '本地 TTS Provider 尚未配置。请先为台词导入本地音频，或配置本地 TTS Provider。'
      throw e
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
        const audioBuffer = await audioKit.load(audioPath)
        syncTtsDurationFromAudioBuffer(block, audioBuffer)
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
            console.warn('[ScriptPreview] 缓存的 Blob URL 已失效，重新加载:', audioPath)
            revokeBlobUrl(audioPath)
            await loadAudioUrl(audioPath)
            blobUrl = getAudioUrl(audioPath)
          }
        }

        if (blobUrl) {
          const audioBuffer = await audioKit.load(blobUrl)
          syncTtsDurationFromAudioBuffer(block, audioBuffer)
          loadedAudioUrls.add(blobUrl)
        }
      }
    } catch (e) {
      console.error('Audio loading error', e)
      finalConfig.audioPath = ''
    }
  }
}

async function preloadSceneImages(scene: Scene | SceneContainer) {
    // V7 FIX: 使用 useAssetLoader.collectAssets 统一收集资源
    // 这确保 Block Actions 中 set_character 动态切换的 Pose/Expression 也被预加载
    const { collectAssets, loadAssets } = useAssetLoader()
    
    // Explicitly cast to a type with known properties to avoid 'any' and unsafe member access
    const safeScene = scene as unknown as { setup?: SceneSetup; title?: string; name?: string; id: string }
    const sceneSetup = safeScene.setup ?? null

    const allImageUrls = new Set<string>()
    
    // Step 1: 收集 Setup 静态资源
    const { imageUrls: setupImageUrls } = collectAssets(sceneSetup, null)
    setupImageUrls.forEach(url => allImageUrls.add(url))
    
    // Step 2: 收集所有 Block Actions 的动态资源
    if (scene.script) {
        (scene.script as ScriptBlock[]).forEach((block: ScriptBlock) => {
            const { imageUrls: blockImageUrls } = collectAssets(sceneSetup, block)
            blockImageUrls.forEach(url => allImageUrls.add(url))
        })
    }
    
    // console.log(`[ScriptPreview] preloadSceneImages: collected ${allImageUrls.size} image URLs for scene: ${safeScene.title ?? safeScene.name ?? safeScene.id}`)
    
    // Step 3: 使用 loadAssets 统一加载
    await loadAssets(allImageUrls, new Set())
    
    // Step 4: 追踪已加载的 Blob URL (用于 cleanup)
    for (const url of allImageUrls) {
        try {
            const blobUrl = getImageUrl(url)
            if (blobUrl) {
                loadedTextureUrls.add(blobUrl)
            }
        } catch {
            // loadAssets 已处理，这里仅追踪
        }
    }
}


async function preloadSceneAudio(scene: Scene | SceneContainer) {
    const safeScene = scene as unknown as { setup?: SceneSetup }
    const sceneSetup = safeScene.setup
    const audioPaths = new Set<string>()
    
    if (sceneSetup?.objects) {
        for (const obj of sceneSetup.objects) {
            if (obj.type === 'audio') {
                const sound = soundStore.getSound(obj.refId)
                if (sound?.url) audioPaths.add(sound.url)
            }
        }
    }
    
    const paths = Array.from(audioPaths)
    if (paths.length > 0) {
        // console.log(`[ScriptPreview] Preloading ${paths.length} audio files...`)
        await Promise.all(paths.map(async (path) => {
            try {
                await loadAudioUrl(path)
                const blobUrl = getAudioUrl(path)
                if (blobUrl) {
                    await audioKit.load(blobUrl)
                    loadedAudioUrls.add(blobUrl)
                }
            } catch (e) {
                console.warn(`[ScriptPreview] Failed to preload audio: ${path}`, e)
            }
        }))
        // console.log(`[ScriptPreview] ${paths.length} audio files preloaded`)
    }
}


// 监听可见性
watch(() => props.visible, (visible) => {
  // console.log('[ScriptPreview] visible changed:', visible)
  if (visible) {
    updateTeleportTarget()
    // 创建副本用于播放和修改
    episodeCopy.value = JSON.parse(JSON.stringify(props.episode)) as Episode
    
    // 初始化场景索引
    if (props.initialSceneId) {
      // console.log('[ScriptPreview] Initializing with scene ID:', props.initialSceneId)
      const idx = scenes.value.findIndex(s => s.id === props.initialSceneId)
      if (idx !== -1) {
        currentSceneIndex.value = idx
        resetPlayerLayers(idx)
        // console.log('[ScriptPreview] Set initial scene index to:', idx)
      } else {
        console.warn('[ScriptPreview] Initial scene ID not found, defaulting to 0')
        currentSceneIndex.value = 0
        resetPlayerLayers(0)
      }
    } else {
      // console.log('[ScriptPreview] No initial scene ID, defaulting to 0')
      currentSceneIndex.value = 0
      resetPlayerLayers(0)
    }
    autoPlayNext.value = false
    resetPlayerState()
    
    // 开始预加载
    // console.log('[ScriptPreview] Triggering preloadAllResources...')
    void preloadAllResources()
    
  } else {
    // 关闭时重置
    // console.log('[ScriptPreview] Dialog closed, resetting state')
    isPlayerPlaying.value = false
    stopAndCleanup()
  }
}, { immediate: true })

</script>

<style scoped>
.script-preview-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(5px);
}

.script-preview-dialog {
  display: flex;
  flex-direction: column;
  width: 98vw;
  height: 96vh;
  background: #1f2937;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  position: relative;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #111827;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f3f4f6;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 300px;
}

.loading-spinner {
  width: 40px; height: 40px;
  border: 4px solid #374151;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

.loading-text {
  font-size: 16px;
  margin-bottom: 12px;
  font-weight: 500;
}

.loading-progress {
  width: 100%;
  height: 6px;
  background: #374151;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

.loading-detail {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  height: 1.5em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.tts-provider-error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.tts-provider-error-title {
  font-size: 18px;
  font-weight: 600;
  color: #f87171;
  margin-bottom: 8px;
}

.tts-provider-error-message {
  font-size: 14px;
  color: #9ca3af;
  text-align: center;
  line-height: 1.6;
  margin-bottom: 20px;
}

.close-btn-secondary {
  padding: 8px 24px;
  background: #374151;
  color: #f3f4f6;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.close-btn-secondary:hover {
  background: #4b5563;
}

@keyframes spin { to { transform: rotate(360deg); } }


/* Player Content */
.player-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000;
  width: 100%;
}

.player-header {
  padding: 12px 20px;
  background: #1f2937;
  border-bottom: 1px solid #374151;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-icon {
  font-size: 18px;
}

.preview-title {
  color: #f3f4f6;
  font-size: 16px;
  font-weight: 600;
}

.scene-info {
  font-size: 12px;
  color: #9ca3af;
  background: #374151;
  padding: 2px 8px;
  border-radius: 4px;
}

.block-info {
  font-size: 12px;
  color: #10b981;
  margin-left: 8px;
}

.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 20px;
  cursor: pointer;
}

.player-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
}

.player-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  z-index: 0;
}

.player-layer.active {
  opacity: 1;
  pointer-events: auto;
  z-index: 2;
}

.player-layer.pending {
  opacity: 0;
  pointer-events: none;
  z-index: 1;
}

/* Controls */
.player-controls {
  padding: 12px 20px;
  background: #1f2937;
  border-top: 1px solid #374151;
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 12px;
}

.ctrl-btn {
  padding: 6px 12px;
  background: #374151;
  border: none;
  border-radius: 4px;
  color: #e5e7eb;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  min-width: 36px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctrl-btn:hover:not(:disabled) {
  background: #4b5563;
}

.play-btn {
  background: #2563eb;
  color: white;
}

.play-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.progress-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-text {
  font-family: monospace;
  font-size: 12px;
  color: #9ca3af;
  min-width: 90px;
  text-align: right;
}

.progress-slider {
  flex: 1;
  height: 4px;
  background: #4b5563;
  border-radius: 2px;
  cursor: pointer;
  -webkit-appearance: none;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #60a5fa;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.progress-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
</style>
