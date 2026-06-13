<template>
  <div class="scene-player">
    <div
      ref="previewCanvas"
      class="preview-canvas"
    />
    
    <!-- 加载/错误状态 -->
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
    
    <!-- 字幕显示 -->
    <div
      v-if="currentSubtitle"
      class="subtitle-overlay"
    >
      <div class="subtitle-text">
        {{ currentSubtitle }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import { CAMERA_BASE_HEIGHT,CAMERA_BASE_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { getPlaybackVolumeGain } from '@/constants/voiceOptions'
import { AnimationController, type AnimationHost } from '@/core/AnimationController'
import { computeAudioState } from '@/core/AudioController'
import { CompositeRenderTarget } from '@/core/CompositeRenderTarget'
import { type GenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import {
  applyAllMasks,
  createMaskRendererResources,
  disposeMaskRendererResources,
  type MaskRendererResources,
} from '@/core/maskRenderer'
import { installRootRenderChainRenderer } from '@/core/RenderChainStage'
import {
  applyLightingFilter,
  type LightingFilterCache,
  type RenderHost,
  renderObject as sharedRenderObject,
  sortCompositeContainers as sharedSortCompositeContainers,
  syncObjectBoundsToPlayers as sharedSyncObjectBoundsToPlayers,
  updateCompositeRenderTargetsInOrder,
} from '@/core/renderPipeline'
import { type ObjectStateHost,SceneObjectRenderer } from '@/core/SceneObjectRenderer'
import { advanceAllObjectAnimations } from '@/core/spriteAnimationDriver'
import { computeTextRevealState } from '@/core/TextRevealController'
import type { TextureProvider } from '@/core/TextureProvider'
import { useAnimationStore } from '@/stores/animationStore'
import { useBackgroundStore } from '@/stores/backgroundStore'
import type { Episode } from '@/stores/episodeStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePropStore } from '@/stores/propStore'
import { useSoundStore } from '@/stores/soundStore'
import type { CompositeObject } from '@/types/sceneObject'
import type {
  Action,
  BlockPlayInfo,
  RuntimeSceneSnapshot,
  RuntimeSlot,
  SceneContainer,
  SceneObject,
  SceneSetup,
  ScriptBlock,
  SetAnimAction,
  SetSceneStructureAction,
} from '@/types/screenplay'
import { evaluateCameraState, evaluateObjectState, type RuntimeCameraState } from '@/utils/actionEvaluator'
import { type ActionType,getHandler } from '@/utils/actionHandlers'
import { isObjectStateAction } from '@/utils/actionHandlers/registry'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'
import { sortActionsForEvaluation } from '@/utils/actionOrder'
import { restoreAnimatedSpriteStillFrame } from '@/utils/animationUtils'
import { collectSceneFontPreloadObjects, preloadSceneFonts } from '@/utils/fontLoader'
import { rebuildChildIdsFromParentIds } from '@/utils/hierarchyUtils'
import { buildParentOverridesForTime, sortObjectsBySlotActionOrder, sortObjectsForEvaluation } from '@/utils/objectEvaluationOrder'
import { reconcileRenderChain, sortRenderChainByZIndex } from '@/utils/renderChainUtils'
import { applyBlockActionsToState, applyMaskPostPass, calculatePrevContext } from '@/utils/sceneStateCalculator'
import { applySetSceneStructureActionToObjects } from '@/utils/setSceneStructureAction'
import { getSubtitleTextAtTime, parseBlockToSlots } from '@/utils/slotUtils'
import { buildObjectStateSnapshot } from '@/utils/stateUtils'
import type { TTSTimingFile } from '@/utils/ttsTiming'
import { type AudioInstance, audioKit } from '@/utils/WebAudioKit'


const props = withDefaults(defineProps<{
  episodeId: string
  sceneId: string
  episode: Episode
  autoPlay?: boolean
  seamless?: boolean
  currentSlotIndex?: number
  blockId?: string  // 单 Block 播放模式（ActionPreviewDialog 使用）
}>(), {
  currentSlotIndex: 0,
  blockId: ''
})

const emit = defineEmits<{
  'playback-finished': []
  'progress': [number, number] // currentTime, totalDuration
  'ready': []
  'error': [string]
  'play-state-change': [boolean]
}>()

const { getImageUrl } = useAssetImage()
const { getAudioUrl, loadAudioUrl } = useAssetAudio()
const { getTexture } = useAssetLoader()

// const episodeStore = useEpisodeStore()
// const sceneObjectStore = useSceneObjectStore()

const backgroundStore = useBackgroundStore()
const propStore = usePropStore()
const expressionStore = useExpressionStore()
const soundStore = useSoundStore()
const projectStore = useProjectStore()

// v14.x: 统一渲染器实例
const scenePlayerTextureProvider: TextureProvider = {
  getTexture: (url: string) => {
    const tex = getTexture(url)
    if (tex !== PIXI.Texture.EMPTY) return tex
    const fullUrl = getImageUrl(url)
    return fullUrl ? PIXI.Texture.from(fullUrl) : PIXI.Texture.EMPTY
  },
  getImageUrl: (url: string) => getImageUrl(url)
}
const sceneObjectRenderer = new SceneObjectRenderer(
  scenePlayerTextureProvider,
  { propStore, backgroundStore, expressionStore }
)

// P0: ObjectStateHost — 桥接本地缓存给统一渲染器
const objectStateHost: ObjectStateHost = {
  getObjectDimensions: (id: string) => objectDimensions.get(id),
  setObjectDimensions: (id: string, dims: { width: number; height: number }) => objectDimensions.set(id, dims),
}

// 画布引用
const previewCanvas = ref<HTMLElement | null>(null)

// 状态
const isLoading = ref(true)
const loadingMessage = ref('正在准备预览...')
const errorMessage = ref<string | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const currentBlockIndex = ref(-1)
let previousBlockIndex = -1
const currentSubtitle = ref('')

// PIXI 相关
let pixiApp: PIXI.Application | null = null
let stage: PIXI.Container | null = null
let sceneLoadGeneration = 0
const objectContainers = new Map<string, PIXI.Container>()
const audioInstances = new Map<string, AudioInstance>()
const audioInstancePlayTimes = new Map<string, number>()  // 追踪每个实例对应的 playTime，用于检测 play action 切换
const pendingAudioPlays = new Set<string>()
const pendingAudioPlayTimes = new Map<string, number>()  // 追踪 pending play 对应的 playTime
const audioStopping = new Set<string>()

function isCurrentSceneLoad(generation: number): boolean {
  return generation === sceneLoadGeneration && !!pixiApp && !!contentViewport
}


// v11.60: Animation Player 注册表（统一 Map，消除按类型分发的 if/else 分支）
const objectAnimationPlayers = new Map<string, GenericAnimationPlayer>()
const triggeredAnimations = new Set<string>()


// P2: Composite own 模式离屏渲染目标
const compositeRenderTargets = new Map<string, CompositeRenderTarget>()

// v25: 光照滤镜缓存（复用实例避免每帧创建）
const lightingFilterCache: LightingFilterCache = {}

// Clip-Mask Phase 1：每帧渲染前应用所有 mask 关系
const maskRendererResources: MaskRendererResources = createMaskRendererResources()

function applyMasksBeforeRender(states: SceneObject[]): void {
  if (!stage) return
  // 确保 mask container / target container 的 worldTransform 已是最新（applyObjectState 之后、render 之前）
  // 根 stage parent 为 null，stage.updateTransform() 会 NPE，逐子节点刷新。
  for (const child of stage.children) {
    child.updateTransform()
  }
  applyAllMasks(states, (id) => objectContainers.get(id), maskRendererResources)
}

// 方案B: camera_follow 首帧 BBox 偏移量缓存
// key = action.id, value = { dx, dy } = BBox 中心 - pivot 中心
const followBBoxOffsets = new Map<string, { dx: number, dy: number }>()

// ═══ RenderHost 桥接（共享渲染管线依赖注入） ═══
const renderHost: RenderHost = {
  sceneObjectRenderer,
  objectContainers,
  objectAnimationPlayers,

  compositeRenderTargets,
  getRenderer: () => pixiApp?.renderer as PIXI.Renderer | undefined,
  getSceneObjects: () => sceneSetup?.objects ?? [],
}

// ═══ AnimationController 集成 ═══
const scenePlayerAnimationHost: AnimationHost = {

  getAnimationPlayer: (id: string) => objectAnimationPlayers.get(id) ?? null,
  getObjectContainer: (id: string) => objectContainers.get(id) ?? null,
  getSceneObjects: () => sceneSetup?.objects ?? [],
  getAnimationDefinition: (objectId: string, animName: string) => {
    const animationStore = useAnimationStore()
    // v16: 统一从 SceneObject.animations 查找（hydrate 保证已填充）
    const obj = sceneSetup?.objects.find(o => o.id === objectId)
    if (!obj) return null
    return animationStore.getObjectAnimationByName(obj, animName) ?? null
  },
  // 手动帧动画驱动钩子：
  // 1. 重置累积器，确保帧序列动画从第 0 帧开始
  // 2. 设置 _shouldPlay 标志，替代之前由 fallbackPlayPropSprite 完成的 gotoAndPlay(0)
  //    （提供 onAnimationTriggered 后 fallbackPlayPropSprite 不再执行，需由此钩子接管）
  onAnimationTriggered: (objectId: string, _animName: string, cmd: 'play' | 'stop') => {
    const container = objectContainers.get(objectId)
    if (!container) return
    const spriteNames = ['prop_animation', 'bg_animation', 'symbol_animation', 'expression_animation']
    for (const name of spriteNames) {
      const sprite = container.getChildByName(name) as (PIXI.AnimatedSprite & { _shouldPlay?: boolean }) | undefined
      if (sprite) {
        if (cmd === 'play') {
          sprite._shouldPlay = true
          spriteAnimTimeAccumulator.set(sprite, 0)
        } else {
          sprite._shouldPlay = false
        }
        break
      }
    }
  },
}
const animationController = new AnimationController(scenePlayerAnimationHost, triggeredAnimations)

// 手动帧动画推进累积器（替代 PIXI Ticker 自动更新）
const spriteAnimTimeAccumulator = new WeakMap<PIXI.AnimatedSprite, number>()

// 相机视口相关
let contentViewport: PIXI.Container | null = null
let scaleContainer: PIXI.Container | null = null
let blackBackground: PIXI.Graphics | null = null

// 画布尺寸和相机视口（从统一常量文件导入）

// 缓存相机信息
let cachedCameraInfo: { x: number; y: number; width: number; height: number; zoom: number } | null = null

// v7.3: camera_follow 最后跟随位置缓存（用于相机状态计算）
let lastFollowPosition: { x: number; y: number } | null = null
let lastEvaluatedCameraState: RuntimeCameraState | null = null

// Block 播放相关 — 使用共享 BlockPlayInfo 类型（types/screenplay.ts）

function cloneSceneObject<T extends SceneObject>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

function getSlotIndexAtTime(slots: RuntimeSlot[], localTime: number): number {
  if (slots.length === 0) return -1
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (!slot) continue
    const slotEndTime = slot.startTime + slot.duration
    if (localTime >= slot.startTime && localTime < slotEndTime) {
      return i
    }
  }
  return slots.length - 1
}

function getActionTimeRangeForPreview(
  action: Action,
  slots: RuntimeSlot[],
): { start: number; end: number; duration: number } {
  let start = 0
  let duration = 0

  const slot = slots[action.slotIndex]
  if (slot) {
    start = slot.startTime
    if (action.category === 'duration') {
      const span = (action as { slotSpan?: number }).slotSpan ?? 1
      for (let i = 0; i < span; i++) {
        const currentSlot = slots[action.slotIndex + i]
        if (currentSlot) duration += currentSlot.duration
      }
    }
  }

  return { start, end: start + duration, duration }
}

function applyPreviewObjectAction(
  state: SceneObject,
  action: Action,
  stateMap: Map<string, SceneObject>,
): SceneObject {
  const nextState = cloneSceneObject(state)
  const handler = getHandler(action.type as ActionType)
  if (!handler) return nextState

  const context: ActionHandlerContext = {
    getObjectState: (id: string) => {
      const current = stateMap.get(id)
      return current ? (current as unknown as WriteableState) : undefined
    }
  }

  handler.applyToState(nextState as unknown as WriteableState, action, context)
  return nextState
}

function applyPreviewSceneStructureAction(
  stateMap: Map<string, SceneObject>,
  action: SetSceneStructureAction,
): void {
  const objects = [...stateMap.values()]
  applySetSceneStructureActionToObjects(objects, action)
  stateMap.clear()
  for (const obj of objects) {
    stateMap.set(obj.id, obj)
  }
}

const blockPlayInfos = ref<BlockPlayInfo[]>([])  // 改为响应式
const ttsTimingCache = new Map<string, TTSTimingFile | null>()
const pendingTTSTimingLoads = new Map<string, Promise<TTSTimingFile | null>>()
let animationFrame: number | null = null
let playStartTime = 0
let playStartOffset = 0
let lastAnimationUpdateTime: number | null = null
const audioPlayRequestId = ref(0) // 播放请求ID，用于解决竞态
const audioPlayGeneration = ref(0) // 音频播放代数，用于解决 Seek 竞态

// 场景初始配置副本（从 setup 复制，作为只读基准）
let sceneSetup: SceneSetup | null = null

// 缓存对象原始尺寸 (用于修正视觉中心计算)
const objectDimensions = new Map<string, { 
  width: number
  height: number
  pivotX?: number
  pivotY?: number
  boundsX?: number
  boundsY?: number
}>()

// v14.2: 追踪每个角色最后一次测量 bounds 时的姿态
// 只有姿态变更时才重新测量，避免动画播放期间每帧测量导致跳动
const lastMeasuredPose = new Map<string, string>()

// 待清理的音频实例
const trackedAudioInstances = new Set<AudioInstance>()

function syncProgressState() {
  emit('progress', currentTime.value, totalDuration.value)
}

function buildSlotsForDuration(block: ScriptBlock, duration: number): RuntimeSlot[] {
  if (block.type === 'action') {
    return parseBlockToSlots(block)
  }

  const adjustedBlock: ScriptBlock = {
    ...block,
    ttsConfig: {
      ...(block.ttsConfig ?? {}),
      duration,
    },
  }
  return parseBlockToSlots(adjustedBlock)
}

function updateBlockTimelineFrom(index: number, duration: number) {
  const currentInfo = blockPlayInfos.value[index]
  if (!currentInfo || duration <= 0 || currentInfo.duration === duration) {
    return
  }

  const delta = duration - currentInfo.duration
  if (currentInfo.block.type !== 'action') {
    currentInfo.block.ttsConfig = {
      ...(currentInfo.block.ttsConfig ?? {}),
      duration,
    }
  }
  currentInfo.duration = duration
  currentInfo.endTime = currentInfo.startTime + duration
  currentInfo.slots = buildSlotsForDuration(currentInfo.block, duration)

  for (let i = index + 1; i < blockPlayInfos.value.length; i++) {
    const info = blockPlayInfos.value[i]
    if (!info) continue
    info.startTime += delta
    info.endTime += delta
  }

  syncProgressState()
}

async function resolvePlayableAudioUrl(audioUrl: string): Promise<string | null> {
  if (audioUrl.startsWith('blob:') || audioUrl.startsWith('data:') || audioUrl.startsWith('http')) {
    return audioUrl
  }

  const resolvedUrl = getAudioUrl(audioUrl)
  if (resolvedUrl) {
    return resolvedUrl
  }

  await loadAudioUrl(audioUrl)
  return getAudioUrl(audioUrl) ?? null
}

async function reconcileBlockAudioDurations() {
  for (let i = 0; i < blockPlayInfos.value.length; i++) {
    const info = blockPlayInfos.value[i]
    if (!info?.audioUrl) continue

    try {
      const playableUrl = await resolvePlayableAudioUrl(info.audioUrl)
      if (!playableUrl) continue

      const audioBuffer = await audioKit.load(playableUrl)
      const actualDurationMs = Math.round((audioBuffer?.duration ?? 0) * 1000)
      if (actualDurationMs > 0) {
        updateBlockTimelineFrom(i, Math.max(info.duration, actualDurationMs))
      }
    } catch (err) {
      console.warn('[ScenePlayer] 音频时长校正失败:', err)
    }
  }
}

// 计算当前场景
const currentScene = computed((): SceneContainer | null => {
  if (!props.episode) return null
  return props.episode.scenes.find(s => s.id === props.sceneId) || null
})

// blockId 模式标志
const blockIdMode = computed(() => !!props.blockId)

// blockId 模式下的当前 Block
const targetBlock = computed(() => {
  if (!blockIdMode.value || !currentScene.value) return null
  return currentScene.value.script.find(b => b.id === props.blockId) ?? null
})

// blockId 模式下的 prevContext
const prevContext = computed((): RuntimeSceneSnapshot | null => {
  if (!blockIdMode.value || !currentScene.value || !props.blockId) return null
  return calculatePrevContext(currentScene.value, props.blockId)
})

// 总时长
const totalDuration = computed(() => {
  return blockPlayInfos.value.reduce((sum, info) => sum + info.duration, 0)
})

// 暴露给父组件的方法
defineExpose({
  play,
  pause,
  reset,
  seek,
  currentTime,
  totalDuration,
  isPlaying
})

/**
 * 获取默认相机状态
 */
function getDefaultCameraState(): RuntimeCameraState {
  const camera = cachedCameraInfo || {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    zoom: 1
  }
  return {
    x: camera.x,
    y: camera.y,
    zoom: camera.zoom,
    shakeOffsetX: 0,
    shakeOffsetY: 0
  }
}

/**
 * 初始化 PIXI App (仅执行一次)
 */
async function initPixiApp() {
  if (pixiApp) return

  if (!previewCanvas.value) {
    console.error('previewCanvas ref is null')
    errorMessage.value = '画布容器初始化失败'
    return
  }

  try {
    const containerRect = previewCanvas.value.getBoundingClientRect()
    // 等待容器尺寸
    if (containerRect.height < 100) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // 重新获取尺寸
    const finalRect = previewCanvas.value.getBoundingClientRect()
    
    // 计算缩放比例：让相机视口区域适配容器，留 5% 边距
    const scaleX = finalRect.width / CAMERA_BASE_WIDTH
    const scaleY = finalRect.height / CAMERA_BASE_HEIGHT
    const displayScale = Math.min(scaleX, scaleY) * 0.95
    
    // 显示尺寸 = 相机视口尺寸 * displayScale
    const displayWidth = CAMERA_BASE_WIDTH * displayScale
    const displayHeight = CAMERA_BASE_HEIGHT * displayScale
    
    // 初始化 AudioContext
    await audioKit.init()

    // v12: Direct Projection 架构（与 FrameCapture 保持一致）
    // 画布尺寸 = 相机视口尺寸，不再使用超大画布 + 遮罩裁剪
    pixiApp = new PIXI.Application({
      width: CAMERA_BASE_WIDTH,
      height: CAMERA_BASE_HEIGHT,
      backgroundColor: 0x000000,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    // 禁用 PIXI 内部 Ticker 自动渲染，改为 updateFrame() 末尾手动 render
    // 消除「PIXI Ticker 先于 updateFrame 渲染旧状态」导致的 1 帧延迟
    pixiApp.ticker.autoStart = false
    pixiApp.ticker.stop()

    const canvas = pixiApp.view as HTMLCanvasElement
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
    
    // 简化的容器布局：画布直接显示相机视口，无需裁剪
    const clipWrapper = document.createElement('div')
    clipWrapper.style.width = `${displayWidth}px`
    clipWrapper.style.height = `${displayHeight}px`
    clipWrapper.style.overflow = 'hidden'
    clipWrapper.style.position = 'absolute'
    clipWrapper.style.left = '50%'
    clipWrapper.style.top = '50%'
    clipWrapper.style.transform = 'translate(-50%, -50%)'
    clipWrapper.style.borderRadius = '4px'
    
    // 画布与容器完全对齐，不需要负偏移
    canvas.style.position = 'absolute'
    canvas.style.left = '0px'
    canvas.style.top = '0px'
    
    clipWrapper.appendChild(canvas)
    previewCanvas.value.appendChild(clipWrapper)
    
    // v12: 创建视口结构（与 FrameCapture 一致）
    // 1. 黑色背景层
    blackBackground = new PIXI.Graphics()
    blackBackground.beginFill(0x000000)
    blackBackground.drawRect(0, 0, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT)
    blackBackground.endFill()
    blackBackground.zIndex = -1
    pixiApp.stage.addChild(blackBackground)
    
    // 2. 创建 scaleContainer
    scaleContainer = new PIXI.Container()
    scaleContainer.scale.set(1, 1)
    pixiApp.stage.addChild(scaleContainer)
    
    // 3. 创建内容视口容器
    contentViewport = new PIXI.Container()
    contentViewport.sortableChildren = true
    contentViewport.zIndex = 0
    scaleContainer.addChild(contentViewport)
    
    // v12: 不再需要 cameraMask，内容自然在画布边界裁剪
    
    pixiApp.stage.sortableChildren = true
    
  } catch (err) {
    console.error('[ScenePlayer] PIXI Init Failed:', err)
    errorMessage.value = '渲染引擎初始化失败'
  }
}

/**
 * 加载当前场景
 * v11.66: 改为 async，await renderInitialFrame
 */
async function loadScene() {
  if (!pixiApp || !contentViewport) return
  const loadGeneration = ++sceneLoadGeneration
  
  try {
    // 只有非无缝模式才显示加载遮罩
    if (!props.seamless) {
      isLoading.value = true
      loadingMessage.value = '正在准备场景...'
    }
    errorMessage.value = null
    
    const scene = currentScene.value
    if (!scene) {
      if (isCurrentSceneLoad(loadGeneration)) {
        errorMessage.value = '场景不存在'
        isLoading.value = false
      }
      return
    }
    
    // P1: blockId 模式下使用 prevContext 作为初始状态
    if (blockIdMode.value && prevContext.value) {
      sceneSetup = JSON.parse(JSON.stringify(prevContext.value)) as SceneSetup
    } else {
      // 使用场景的 setup 作为初始状态
      sceneSetup = JSON.parse(JSON.stringify(scene.setup)) as SceneSetup
    }

    // v16: animations 已持久化，不再需要运行时 hydrate
    
    // 准备新的 Stage
    const newStage = new PIXI.Container()
    newStage.sortableChildren = true
    
    // 清理旧状态 (保留 PIXI App 和 Viewport)
    stopAllAudio()

    objectContainers.clear()
    blockPlayInfos.value = []
    
    // 将 stage 指向新的容器
    if (stage) {
      contentViewport.removeChild(stage)
      stage.destroy({ children: true })
    }
    stage = newStage
    contentViewport.addChild(stage)
    
    // 初始化相机信息
    // P1: blockId 模式下从 prevContext 的 camera 获取相机初始状态
    const cameraSource = blockIdMode.value && prevContext.value
      ? prevContext.value.camera
      : sceneSetup?.camera
    const cameraInfo = cameraSource || {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      zoom: 1
    }
    cachedCameraInfo = { 
      x: cameraInfo.x, 
      y: cameraInfo.y, 
      width: CAMERA_BASE_WIDTH,
      height: CAMERA_BASE_HEIGHT,
      zoom: cameraInfo.zoom || 1 
    }
    
    // v11.66: await renderInitialFrame to ensure all characters are initialized
    const rendered = await renderInitialFrame(loadGeneration)
    if (!rendered || !isCurrentSceneLoad(loadGeneration)) return
    
    // 准备 Block 信息
    prepareBlockPlayInfos()
    if (!isCurrentSceneLoad(loadGeneration)) return
    loadingMessage.value = '正在准备 TTS timing...'
    await preloadTTSTimingsForBlockInfos()
    if (!isCurrentSceneLoad(loadGeneration)) return
    renderCurrentFrameWithoutAudio()
    await reconcileBlockAudioDurations()
    if (!isCurrentSceneLoad(loadGeneration)) return
    renderCurrentFrameWithoutAudio()
    syncProgressState()
    
    // 完成
    isLoading.value = false
    emit('ready')
    
    if (props.autoPlay) {
      void play()
    }
    
  } catch (err) {
    if (!isCurrentSceneLoad(loadGeneration)) return
    console.error('[ScenePlayer] Load Scene Failed:', err)
    errorMessage.value = `场景加载失败: ${err instanceof Error ? err.message : '未知错误'}`
    isLoading.value = false
  }
}

async function initRenderer() {
  await initPixiApp()
  await loadScene()
}

/**
 * 准备 Block 播放信息
 */
function prepareBlockPlayInfos() {
  const scene = currentScene.value
  if (!scene) {
    return
  }
  
  let accumulatedTime = 0
  ttsTimingCache.clear()
  pendingTTSTimingLoads.clear()
  
  // P1: blockId 模式下只为目标 Block 生成播放信息
  const blocksToProcess = blockIdMode.value && targetBlock.value
    ? [targetBlock.value]
    : scene.script
  
  let currentSnapshot: RuntimeSceneSnapshot = JSON.parse(JSON.stringify({
    objects: sceneSetup!.objects,
    renderChain: sceneSetup!.renderChain ?? [],
    camera: {
      x: cachedCameraInfo?.x ?? CANVAS_WIDTH / 2,
      y: cachedCameraInfo?.y ?? CANVAS_HEIGHT / 2,
      zoom: cachedCameraInfo?.zoom ?? 1,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
    },
  })) as RuntimeSceneSnapshot

  for (const block of blocksToProcess) {
    // 确保 TTS 已生成
    let duration = 0
    let audioUrl: string | undefined

    // ScriptBlock 类型 (DialogueBlock | NarrationBlock) 都有 ttsConfig 属性
    if (block.type === 'action') {
      duration = block.duration
    } else if (block.ttsConfig) {
      duration = block.ttsConfig.duration || 0
      // v12.8: audioPath 替代 audio，使用懒加载
      audioUrl = block.ttsConfig.audioPath ? getAudioUrl(block.ttsConfig.audioPath) : undefined
    }
    
    // 如果没有时长，给一个默认值
    if (duration <= 0) {
      duration = 1000
    }
    
    const slots = parseBlockToSlots(block)
    const blockActions: Action[] = block.actions || []
    
    const startSnapshot: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(currentSnapshot)) as RuntimeSceneSnapshot
    
    const startTime = accumulatedTime
    const endTime = accumulatedTime + duration
    
    const playInfo: BlockPlayInfo = {
      block,
      startTime: startTime,
      endTime: endTime,
      duration,
      slots,
      blockActions,
      startSnapshot,
      ...(audioUrl ? { audioUrl } : {})
    }
    blockPlayInfos.value.push(playInfo)
    const timingAudioPath = getBlockTTSAudioPath(block)
    if (timingAudioPath) {
      void loadTTSTimingForAudioPath(timingAudioPath)
    }

    accumulatedTime += duration
    currentSnapshot = applyBlockActionsToState(currentSnapshot, block, scene)
  }
}

function getBlockPlaybackVolume(block: ScriptBlock): number {
  if (block.type === 'dialogue') {
    const scene = currentScene.value
    const instance = scene?.setup.objects.find((o) => o.id === block.instanceId)
    const actorId = instance?.extraInfo?.kind === 'actor' ? instance.extraInfo.actorId : undefined
    const actor = actorId
      ? projectStore.actors.find((item) => item.id === actorId)
      : (instance?.refId ? projectStore.actors.find((item) => item.characterId === instance.refId) : undefined)
    return getPlaybackVolumeGain(actor?.voice?.volume)
  }

  if (block.type === 'narration') {
    return getPlaybackVolumeGain(projectStore.narrator?.voice?.volume)
  }

  return 1
}

function getBlockTTSAudioPath(block: ScriptBlock): string | undefined {
  if (block.type === 'action') return undefined
  return block.ttsConfig?.audioPath
}

async function preloadTTSTimingsForBlockInfos(): Promise<void> {
  const audioPaths = new Set<string>()
  for (const info of blockPlayInfos.value) {
    const audioPath = getBlockTTSAudioPath(info.block)
    if (audioPath) audioPaths.add(audioPath)
  }
  await Promise.all([...audioPaths].map(audioPath => loadTTSTimingForAudioPath(audioPath)))
}

function getTTSTimingForBlock(block: ScriptBlock): TTSTimingFile | null | undefined {
  const audioPath = getBlockTTSAudioPath(block)
  if (!audioPath) return null
  if (ttsTimingCache.has(audioPath)) {
    const timing = ttsTimingCache.get(audioPath) ?? null
    return timing
  }
  void loadTTSTimingForAudioPath(audioPath)
  return undefined
}

async function loadTTSTimingForAudioPath(audioPath: string): Promise<TTSTimingFile | null> {
  if (ttsTimingCache.has(audioPath)) return ttsTimingCache.get(audioPath) ?? null

  const pending = pendingTTSTimingLoads.get(audioPath)
  if (pending) return pending

  const promise = projectStore.loadTTSTiming(audioPath)
    .then(timing => {
      ttsTimingCache.set(audioPath, timing)
      return timing
    })
    .catch(error => {
      console.warn('[ScenePlayer] 加载 TTS timing 失败，降级为连续播放:', audioPath, error)
      ttsTimingCache.set(audioPath, null)
      return null
    })
    .finally(() => {
      pendingTTSTimingLoads.delete(audioPath)
    })

  pendingTTSTimingLoads.set(audioPath, promise)
  return promise
}



/**
 * 渲染初始帧（使用五阶段管线）
 * 与 updateFrame 保持一致的渲染逻辑
 * v11.66: 改为 async，与 ActionPreviewDialog.resetToPrev 流程一致
 */
async function renderInitialFrame(loadGeneration: number): Promise<boolean> {
  if (!stage) {
      throw new Error('[ScenePlayer] renderInitialFrame aborted: stage is null')
  }
  if (!sceneSetup) {
      throw new Error('[ScenePlayer] renderInitialFrame aborted: sceneSetup is null')
  }
  const renderStage = stage
  const renderSetup = sceneSetup

  // 清理旧状态
  renderStage.removeChildren()
  objectContainers.clear()
  objectDimensions.clear()

  // P2: 先清理离屏渲染目标，避免内存泄漏和重复渲染旧纹理
  compositeRenderTargets.forEach(crt => crt.destroy())
  compositeRenderTargets.clear()

  lastMeasuredPose.clear()
  
  // P1: blockId 模式下使用 getActiveObjects 包含 Shadow Objects
  const objectsToRender = getActiveObjects()
  if (objectsToRender.length === 0) {
      console.warn('[ScenePlayer] renderInitialFrame warning: no objects to render')
      return true
  }
  
  // Phase 1: 资源同步（创建所有对象，await 确保角色完全初始化）
  const synced = await syncResources(loadGeneration, renderStage, renderSetup)
  if (!synced || !isCurrentSceneLoad(loadGeneration) || stage !== renderStage || sceneSetup !== renderSetup) {
    return false
  }
  

  
  // Phase 1.5: 应用初始动画状态（在测量之前，确保角色状态正确）
  applyInitialAnimationStates()
  
  // P1: blockId 模式下重播跨 Block 持续播放的动画
  replayCarriedOverAnimations()
  
  // Phase 2: 实时测量（现在角色状态已确定）
  measureObjects()
  sharedSyncObjectBoundsToPlayers(objectDimensions, objectAnimationPlayers)
  
  // Phase 3: 评估状态 (构建初始状态)
  const states = new Map<string, SceneObject>()
  for (const objSetup of objectsToRender) {
    const state = buildObjectStateSnapshot(objSetup)
    
    states.set(objSetup.id, state)
  }
  
  // Phase 3.5: Parent 容器迁移（确保 PIXI 父子关系与数据层 parentId 一致）
  // v22: renderObject 使用 renderChain 遍历子对象时，union 容器可能未在正确位置创建，
  // 此步骤根据 state.parentId 将 PIXI 容器迁移到正确的父级（与 layoutObjects 保持一致）
  for (const objSetup of objectsToRender) {
    const container = objectContainers.get(objSetup.id)
    if (!container) continue
    const state = states.get(objSetup.id)
    if (!state) continue
    const newParentId = state.parentId ?? null
    let targetParent: PIXI.Container
    if (!newParentId) {
      targetParent = renderStage
    } else {
      const parentCrt = compositeRenderTargets.get(newParentId)
      targetParent = parentCrt?.getSourceContainer() ?? (objectContainers.get(newParentId) ?? renderStage)
    }
    if (container.parent !== targetParent) {
      if (container.parent) container.parent.removeChild(container)
      targetParent.addChild(container)
    }
  }
  
  // Phase 4: 布局对象 (应用状态)
  const visualCenters = new Map<string, { x: number, y: number }>()
  
  for (const objSetup of objectsToRender) {
    const container = objectContainers.get(objSetup.id)
    if (!container) continue
    
    const state = states.get(objSetup.id)
    if (!state) continue
    
    // 应用状态
    const visualCenter = applyObjectState(container, state, objSetup, states)
    if (visualCenter) {
      visualCenters.set(objSetup.id, visualCenter)
    }
      // 灯光对象的容器需要参与 updateTransform（toGlobal 依赖准确的 worldTransform），
    // 但不应渲染可见像素。使用 renderable=false（不阻止 transform 更新），
    // 而非 visible=false（会导致 PIXI 跳过 updateTransform）。
    if (objSetup.type === 'light') {
      container.renderable = false
    }

    objectAnimationPlayers.get(objSetup.id)?.cacheBaseTransform()
  }
  
  // v23: 为根级 stage 安装 renderChain 驱动的渲染逻辑
  // 渲染顺序完全由 renderChain + sortRenderChainByZIndex 决定
  if (renderSetup.renderChain && renderSetup.renderChain.length > 0) {
    const setupChain = reconcileRenderChain(
      renderSetup.renderChain,
      [...states.values()],
    )
    installRootRenderChainRenderer(
      renderStage,
      () => sortRenderChainByZIndex(
        setupChain,
        (id) => states.get(id)?.zIndex ?? renderSetup.objects.find(o => o.id === id)?.zIndex ?? 0
      ),
      (id) => objectContainers.get(id),
    )
  }
  // 递归排序组合容器（entity 内部 renderChain）
  // v22: 传入 getZIndex 以排序 entity 内部 renderChain
  sharedSortCompositeContainers(renderSetup.objects, objectContainers, compositeRenderTargets,
    (id) => states.get(id)?.zIndex ?? renderSetup.objects.find(o => o.id === id)?.zIndex ?? 0
  )
  
  // v19 Fix: 初始帧 CRT 更新 — syncResources 中 crt.enable() 时子对象尚未定位，
  // Phase 4 定位完成后必须刷新 CRT 的 RenderTexture
  updateCompositeRenderTargetsInOrder(compositeRenderTargets, [...states.values()])
  
  // Phase 5: 相机更新
  applyCameraTransform(getDefaultCameraState())

  // Phase 6: 光照滤镜
  if (contentViewport && isCurrentSceneLoad(loadGeneration) && stage === renderStage && sceneSetup === renderSetup) {
    contentViewport.updateTransform()
    applyLightingFilter(
      [...states.values()],
      renderStage,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      lightingFilterCache,
      new PIXI.Rectangle(0, 0, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT),
      (id) => objectContainers.get(id),
      undefined,
      pixiApp?.renderer as PIXI.Renderer | undefined,
      compositeRenderTargets,
    )
  }

  // Clip-Mask Phase 1：在 render 之前更新 worldTransform 并应用所有蒙版
  applyMasksBeforeRender([...states.values()])

  // 手动渲染初始帧（Ticker 已禁用）
  if (pixiApp) {
    pixiApp.renderer.render(pixiApp.stage)
  }
  return true
}

function applyInitialAnimationStates() {
  if (!sceneSetup) return
  
  // v16: 初始动画统一委托给 AnimationController 处理。
  // 这样 spawned=false 的对象会延迟到真正可见时才启动初始动画，避免“未出生先播放”。
  animationController.processInitialAnimationStates()
  
  // ScenePlayer 特有：仅处理“无初始动画”时的 stillFrame 恢复。
  for (const objSetup of sceneSetup.objects) {
    if (objSetup.type !== 'prop') continue
    const container = objectContainers.get(objSetup.id)
    if (!container) continue
    
    // v16: 直接访问 SceneObjectBase.initialAnimations
    const initialAnims = objSetup.initialAnimations
    
    if (!initialAnims || initialAnims.length === 0) {
      const animatedSprite = container.getChildByName('prop_animation') as PIXI.AnimatedSprite | undefined
      if (animatedSprite?.playing) {
        const propData = propStore.getProp(objSetup.refId)
        restoreAnimatedSpriteStillFrame(animatedSprite, {
          stillFrameSource: propData?.stillFrameSource,
          stillFrameIndex: propData?.stillFrameIndex,
          url: propData?.stillFrameCustomUrl,
        }, getTexture)
      }
    }
  }
}

/**
 * P1: 获取活跃对象列表（blockId 模式下包含 Shadow Objects）
 * Shadow Object: 在场景 Setup 中定义但 spawned=false，在当前 Block 中被 set_lifecycle { spawned: true } 激活的对象
 */
function getActiveObjects(): SceneObject[] {
  if (!blockIdMode.value || !sceneSetup) {
    return sceneSetup?.objects ?? []
  }
  
  const scene = currentScene.value
  const block = targetBlock.value
  if (!scene || !block) return sceneSetup.objects
  
  const prevObjIds = new Set(sceneSetup.objects.map(o => o.id))
  const activeObjects = [...sceneSetup.objects]
  
  // 收集当前 Block 动作的所有目标 ID
  const actionTargets = new Set<string>()
  for (const action of block.actions ?? []) {
    if (action.target && action.target !== 'camera') {
      actionTargets.add(action.target)
    }
  }
  
  // 从场景 Setup 中查找不在 prevContext 但被当前 Block 动作引用的对象
  for (const objSetup of scene.setup.objects) {
    if (actionTargets.has(objSetup.id) && !prevObjIds.has(objSetup.id)) {
      const shadowObj: SceneObject = {
        ...objSetup,
        spawned: false  // Shadow Object 默认未 spawn
      }
      activeObjects.push(shadowObj)
    }
  }
  
  return activeObjects
}

/**
 * P1: 重播跨 Block 持续播放的动画
 * 回溯当前 Block 之前所有 Block 的 set_anim actions，
 * 找出 autoStopOnBlockEnd === false 且未被后续 stop 覆盖的动画，
 * 在 Block 预览初始化时重新触发这些动画。
 */
function replayCarriedOverAnimations() {
  if (!blockIdMode.value) return
  const scene = currentScene.value
  const block = targetBlock.value
  if (!scene || !block) return

  const script = scene.script
  if (!script || script.length === 0) return

  const blockIndex = script.findIndex(b => b.id === block.id)
  if (blockIndex <= 0) return // 第一个 Block 无前置动画

  interface CarriedAnimation {
    targetId: string
    animName: string
    loop: boolean | undefined
  }
  const carriedAnimations = new Map<string, CarriedAnimation>()

  for (let i = 0; i < blockIndex; i++) {
    const prevBlock = script[i]
    if (!prevBlock) continue
    const blockActions = prevBlock.actions ?? []

    const setAnimActions = blockActions.filter(
      (a): a is SetAnimAction => a.type === 'set_anim'
    )

    for (const action of setAnimActions) {
      const targetId = action.target

      for (const animItem of (action.params.animations ?? [])) {
        const animName = animItem.animName
        const cmd = animItem.action ?? 'play'
        const key = `${targetId}:${animName}`

        if (cmd === 'play' && animItem.autoStopOnBlockEnd === false) {
          // v16: 仅校验对象存在性，不再按类型白名单过滤
          // 动画定义统一通过 AnimationHost.getAnimationDefinition(objectId, animName) 查找
          const objSetup = scene.setup.objects.find(o => o.id === targetId)
          if (!objSetup) continue

          carriedAnimations.set(key, { targetId, animName, loop: animItem.loop })
        } else if (cmd === 'play') {
          carriedAnimations.delete(key)
        } else if (cmd === 'stop') {
          carriedAnimations.delete(key)
        }
      }
    }
  }

  if (carriedAnimations.size === 0) return

  for (const carried of carriedAnimations.values()) {
    const { targetId, animName, loop } = carried

    // v16: 统一通过 AnimationHost.getAnimationDefinition 查找（hydrate 保证 obj.animations 已填充）
    const definition = scenePlayerAnimationHost.getAnimationDefinition(targetId, animName)
    if (!definition) continue
    const player = objectAnimationPlayers.get(targetId)
    if (!player) continue
    player.playAnimation(animName, definition, { loop: loop ?? definition.loop, reset: false })
  }
}

/**
 * 统一对象渲染入口（委托给共享渲染管线）
 */
async function renderObject(obj: SceneObject, parentContainer: PIXI.Container): Promise<void> {
  await sharedRenderObject(obj, parentContainer, renderHost)
}

function getMainSprite(container: PIXI.Container, type: string): PIXI.Sprite | PIXI.AnimatedSprite | null {
  if (type === 'background') return container.getChildByName('background_sprite')!
  else if (type === 'prop') return container.getChildByName('prop_sprite')! || container.getChildByName('prop_animation')!
  // v7.3: effect type removed

  return null
}

async function syncResources(
  loadGeneration?: number,
  targetStage: PIXI.Container | null = stage,
  targetSetup: SceneSetup | null = sceneSetup,
): Promise<boolean> {
  if (!targetSetup || !targetStage) return false
  const activeIds = new Set<string>()
  // P1: blockId 模式下使用 getActiveObjects 包含 Shadow Objects
  const objectsToSync = blockIdMode.value ? getActiveObjects() : targetSetup.objects

  // Text PRD Phase 0: 预加载 setup 字体，以及 Action Mode 的 set_text 字体切换
  const blocksForFontPreload = blockIdMode.value && targetBlock.value
    ? [targetBlock.value]
    : (currentScene.value?.script ?? [])
  await preloadSceneFonts(collectSceneFontPreloadObjects(objectsToSync, blocksForFontPreload))
  if (
    loadGeneration !== undefined
    && (!isCurrentSceneLoad(loadGeneration) || stage !== targetStage || sceneSetup !== targetSetup)
  ) {
    return false
  }

  for (const objSetup of objectsToSync) {
    activeIds.add(objSetup.id)
    const container = objectContainers.get(objSetup.id)
    if (!container) {
      try {
        await renderObject(objSetup, targetStage)
        if (
          loadGeneration !== undefined
          && (!isCurrentSceneLoad(loadGeneration) || stage !== targetStage || sceneSetup !== targetSetup)
        ) {
          return false
        }
      } catch (err) { /* ignore */ }
      continue
    }
    syncObjectTexture(objSetup, container)
  }
  for (const [id, container] of objectContainers) {
    if (!activeIds.has(id)) container.visible = false
  }
  return true
}

function syncObjectTexture(objSetup: SceneObject, container: PIXI.Container) {
  if (objSetup.type === 'prop' ) {
    const mainSprite = getMainSprite(container, objSetup.type)
    if (!mainSprite?.texture?.valid) {
       // logic to retry loading if needed
    }
  }
}

function measureObjects() {
  if (!sceneSetup) return
  sceneObjectRenderer.measureObjectBounds(sceneSetup.objects, objectContainers, objectStateHost)
}

/**
 * 将 objectDimensions 同步到所有 GenericAnimationPlayer
 * 用于 pivot 位置补偿计算
 */
function syncObjectBoundsToPlayers() {
  sharedSyncObjectBoundsToPlayers(objectDimensions, objectAnimationPlayers)
}

function evaluateStates(currentInfo: BlockPlayInfo, blockLocalTime: number): Map<string, SceneObject> {
  if (!sceneSetup) return new Map()
  const objectIndexMap = new Map<string, number>()
  currentInfo.startSnapshot.objects.forEach((obj, idx) => {
    objectIndexMap.set(obj.id, idx)
  })
  const orderedBlockActions = sortActionsForEvaluation(currentInfo.blockActions, objectIndexMap)
  const objectStateActions = orderedBlockActions.filter((action) =>
    action.target !== 'camera' && isObjectStateAction(action)
  )
  const currentSlotIndex = getSlotIndexAtTime(currentInfo.slots, blockLocalTime)

  // 1) 构建当前 slot 开始前的 base state：
  //    前置 point action 和已完成 duration action 只结算一次，冻结到 base 中。
  const baseStates = new Map<string, SceneObject>()
  for (const obj of currentInfo.startSnapshot.objects) {
    baseStates.set(obj.id, cloneSceneObject(obj))
  }

  for (const action of orderedBlockActions) {
    if (currentSlotIndex === -1) continue

    if (action.type === 'set_scene_structure') {
      if (action.slotIndex < currentSlotIndex) {
        applyPreviewSceneStructureAction(baseStates, action)
      }
      continue
    }

    if (action.target === 'camera' || !isObjectStateAction(action)) continue

    const currentState = baseStates.get(action.target)
    if (!currentState) continue

    if (action.category === 'point') {
      if (action.slotIndex < currentSlotIndex) {
        baseStates.set(action.target, applyPreviewObjectAction(currentState, action, baseStates))
      }
      continue
    }

    const span = (action as { slotSpan?: number }).slotSpan ?? 1
    const endSlot = action.slotIndex + span
    if (endSlot <= currentSlotIndex) {
      baseStates.set(action.target, applyPreviewObjectAction(currentState, action, baseStates))
    }
  }

  // 2) 仅应用当前 slot 的 point action：
  //    姿态类动作先得到当前 slot 的最终画面，set_scene_structure 随后反算 local，
  //    后续 slot 不会重新按新的 parent 世界矩阵反算。
  const pointStates = new Map<string, SceneObject>()
  for (const [id, state] of baseStates) {
    pointStates.set(id, cloneSceneObject(state))
  }

  for (const action of orderedBlockActions) {
    if (action.category !== 'point' || action.slotIndex !== currentSlotIndex) continue

    if (action.type === 'set_scene_structure') {
      applyPreviewSceneStructureAction(pointStates, action)
      continue
    }

    if (action.target === 'camera' || !isObjectStateAction(action)) continue

    const currentState = pointStates.get(action.target)
    if (!currentState) continue
    pointStates.set(action.target, applyPreviewObjectAction(cloneSceneObject(currentState), action, pointStates))
  }

  const parentOverrides = buildParentOverridesForTime(orderedBlockActions, blockLocalTime, currentInfo.slots)
  const sortedObjects = sortObjectsForEvaluation(
    sortObjectsBySlotActionOrder([...pointStates.values()], orderedBlockActions, currentSlotIndex),
    parentOverrides,
  )

  // 2.5) Clip-Mask Phase 1 — D1.5 mask post-pass
  //   applyPreviewObjectAction → SetMaskHandler 仅做单 mask 字段折叠，
  //   缺少跨 mask 独占裁决 / 顺序无关转移 / "无隐式释放" 语义；
  //   这里在 pointStates 上重跑一次共享 post-pass，保证 ScenePlayer 的实时预览
  //   与 applyBlockActionsToState 计算的 block 终态一致。
  //   仅处理 slotIndex <= currentSlotIndex 的 set_mask（已触发的那些）。
  if (currentSlotIndex !== -1) {
    const setMaskActionsThroughCurrentSlot = orderedBlockActions.filter(
      a => a.type === 'set_mask' && a.slotIndex <= currentSlotIndex,
    )
    if (setMaskActionsThroughCurrentSlot.length > 0) {
      // 构造 RuntimeSceneSnapshot 兼容外壳；applyMaskPostPass 仅读 prevState.objects、
      // 写 newState.objects 中 mask 对象的 targetIds / shape。
      const prevSnapshot = {
        ...currentInfo.startSnapshot,
        objects: currentInfo.startSnapshot.objects,
      }
      const newSnapshotObjects = [...pointStates.values()]
      const newSnapshot = {
        ...currentInfo.startSnapshot,
        objects: newSnapshotObjects,
      }
      applyMaskPostPass(prevSnapshot, newSnapshot, setMaskActionsThroughCurrentSlot)
      // newSnapshotObjects 元素引用与 pointStates 中相同；mutation 自动同步回 Map。
    }
  }

  // 3) 在 point state 基础上，仅对当前活跃的 duration action 做时间插值。
  //    前置 slot 的 point action 不再参与每帧重算。
  const states = new Map<string, SceneObject>()
  for (const objSetup of sortedObjects) {
    const targetId = objSetup.id
    const pointState = pointStates.get(targetId)
    if (!pointState) continue

    const activeDurationActions = objectStateActions.filter((action) => {
      if (action.target !== targetId || action.category !== 'duration') return false
      const { start, end, duration } = getActionTimeRangeForPreview(action, currentInfo.slots)
      const isBlockEndFrame = blockLocalTime === currentInfo.duration && end === currentInfo.duration
      return duration > 0 && blockLocalTime >= start && (blockLocalTime < end || isBlockEndFrame)
    })

    if (activeDurationActions.length === 0) {
      states.set(targetId, cloneSceneObject(pointState))
      continue
    }

    const ctx: ActionHandlerContext = {
      getObjectState: (id: string) => {
        const evaluated = states.get(id)
        if (evaluated) return evaluated as unknown as WriteableState
        const pointState = pointStates.get(id)
        return pointState ? (pointState as unknown as WriteableState) : undefined
      }
    }

    const currentState = evaluateObjectState(
      pointState,
      activeDurationActions,
      blockLocalTime,
      currentInfo.duration,
      currentInfo.slots,
      -1,
      ctx
    )
    states.set(targetId, currentState)
  }

  rebuildCompositeChildIdsInStateMap(states)
  reconcileEntityRenderChainsInStateMap(states)

  // Text reveal actions — 注入 revealProgress
  for (const [, state] of states) {
    if (state.type !== 'text') continue
    const textState = state as import('@/types/sceneObject').TextObject
    const currentAbsTime = currentInfo.startTime + blockLocalTime
    const revealState = computeTextRevealState(
      blockPlayInfos.value,
      currentInfo,
      state.id,
      currentAbsTime,
    )
    if (!revealState) continue
    textState.content = revealState.content
    ;(state as unknown as import('@/utils/actionHandlers/types').WriteableState).revealProgress = revealState.progress
  }

  return states
}

function rebuildCompositeChildIdsInStateMap(states: Map<string, SceneObject>): void {
  rebuildChildIdsFromParentIds([...states.values()])
}

function reconcileEntityRenderChainsInStateMap(states: Map<string, SceneObject>): void {
  const runtimeObjects = [...states.values()]
  for (const state of runtimeObjects) {
    if (state.type !== 'composite') continue
    const comp = state as CompositeObject
    if ((comp.compositeMode ?? 'entity') !== 'entity') continue
    comp.renderChain = reconcileRenderChain(comp.renderChain ?? [], runtimeObjects, comp.id)
  }
}

function layoutObjects(
  states: Map<string, SceneObject>,
  renderChain?: readonly string[],
): Map<string, { x: number, y: number }> {
  if (!sceneSetup || !stage) return new Map()

  const visualCenters = new Map<string, { x: number, y: number }>()

  // P1: blockId 模式下使用 getActiveObjects 包含 Shadow Objects
  const objectsToLayout = getActiveObjects()
  
  // P2: 检测 parentId 变化，迁移 PIXI 容器到正确的父级
  // v20: union/entity 统一挂载到 parentId 对应的容器
  for (const objSetup of objectsToLayout) {
    const container = objectContainers.get(objSetup.id)
    if (!container) continue
    const state = states.get(objSetup.id)
    if (!state) continue
    
    const newParentId = state.parentId ?? null
    // 确定目标父容器
    // P2: 如果目标 parent 是 own 模式 composite（拥有 CRT），
    // 子容器应添加到 CRT 的 source（渲染子树）而非 outputContainer，
    // 否则子对象不会被渲染到 RenderTexture 中。
    let targetParent: PIXI.Container
    if (!newParentId) {
      targetParent = stage
    } else {
      const parentCrt = compositeRenderTargets.get(newParentId)
      targetParent = parentCrt?.getSourceContainer() ?? (objectContainers.get(newParentId) ?? stage)
    }
    
    // 如果当前父容器不匹配，则迁移
    if (container.parent !== targetParent) {
      if (container.parent) container.parent.removeChild(container)
      targetParent.addChild(container)
    }
  }
  
  for (const objSetup of objectsToLayout) {
    const container = objectContainers.get(objSetup.id)
    if (!container) continue
    const state = states.get(objSetup.id)
    if (!state) continue
    
    const visualCenter = applyObjectState(container, state, objSetup, states)
    if (visualCenter) visualCenters.set(objSetup.id, visualCenter)
    // 灯光对象：renderable=false 隐藏渲染，但保留 transform 更新
    if (objSetup.type === 'light') {
      container.renderable = false
    }

    objectAnimationPlayers.get(objSetup.id)?.cacheBaseTransform()
  }

  // P2: 将子对象的本地坐标 visual center 转换为场景世界坐标
  // applyObjectState 返回的是父容器本地坐标，camera_follow 需要世界坐标
  if (contentViewport) {
    contentViewport.updateTransform()
    for (const objSetup of objectsToLayout) {
      const state = states.get(objSetup.id)
      if (!state?.parentId) continue
      const container = objectContainers.get(objSetup.id)
      if (!container) continue
      const localCenter = visualCenters.get(objSetup.id)
      if (!localCenter) continue
      const scenePoint = projectContainerParentPointToScene(
        objSetup.id,
        container,
        new PIXI.Point(localCenter.x, localCenter.y),
        states,
      )
      visualCenters.set(objSetup.id, { x: scenePoint.x, y: scenePoint.y })
    }
  }

  // v23: 为根级 stage 安装/更新 renderChain 驱动的渲染逻辑
  // 每帧使用最新的 activeRenderChain（包含运行时 zIndex）
  const activeRenderChain = reconcileRenderChain(
    renderChain ?? sceneSetup?.renderChain ?? [],
    [...states.values()],
  )
  if (stage && activeRenderChain.length > 0) {
    const capturedChain = activeRenderChain
    installRootRenderChainRenderer(
      stage,
      () => sortRenderChainByZIndex(
        capturedChain,
        (id) => states.get(id)?.zIndex ?? objectsToLayout.find(o => o.id === id)?.zIndex ?? 0
      ),
      (id) => objectContainers.get(id),
    )
  }
  // 关键：entity 内部排序必须基于当前帧 runtime 状态（set_scene_structure/set_lifecycle 已修改 parentId/childIds）
  const runtimeObjectsToSort = objectsToLayout.map(obj => states.get(obj.id) ?? obj)
  // 递归排序 entity composite 内部 renderChain
  sharedSortCompositeContainers(runtimeObjectsToSort, objectContainers, compositeRenderTargets,
    (id) => states.get(id)?.zIndex ?? objectsToLayout.find(o => o.id === id)?.zIndex ?? 0,
  )
  return visualCenters
}

function findCompositeRenderTargetChain(
  objectId: string,
  states: Map<string, SceneObject>,
): { id: string, source: PIXI.Container, output: PIXI.Container }[] {
  const chain: { id: string, source: PIXI.Container, output: PIXI.Container }[] = []
  let currentId = states.get(objectId)?.parentId

  while (currentId) {
    const crt = compositeRenderTargets.get(currentId)
    if (crt) {
      chain.push({
        id: currentId,
        source: crt.getSourceContainer(),
        output: crt.getOutputContainer(),
      })
    }
    currentId = states.get(currentId)?.parentId
  }

  return chain
}

function projectGlobalPointThroughCompositeChain(
  objectId: string,
  globalPoint: PIXI.Point,
  states: Map<string, SceneObject>,
): PIXI.Point | null {
  if (!contentViewport) return globalPoint

  let projectedGlobalPoint = globalPoint
  let didProject = false

  for (const crtProjection of findCompositeRenderTargetChain(objectId, states)) {
    const sourceLocalPoint = crtProjection.source.toLocal(projectedGlobalPoint)
    projectedGlobalPoint = crtProjection.output.toGlobal(sourceLocalPoint)
    didProject = true
  }

  if (!didProject) return null

  const scenePoint = contentViewport.toLocal(projectedGlobalPoint)
  return new PIXI.Point(scenePoint.x, scenePoint.y)
}

function projectContainerParentPointToScene(
  objectId: string,
  container: PIXI.Container,
  pointInParent: PIXI.Point,
  states: Map<string, SceneObject>,
): PIXI.Point {
  if (!contentViewport) return pointInParent

  const globalPoint = container.parent.toGlobal(pointInParent)
  const scenePoint = projectGlobalPointThroughCompositeChain(objectId, globalPoint, states)
    ?? contentViewport.toLocal(globalPoint)
  return new PIXI.Point(scenePoint.x, scenePoint.y)
}

function projectContainerLocalPointToScene(
  objectId: string,
  container: PIXI.Container,
  pointInContainer: PIXI.Point,
  states: Map<string, SceneObject>,
): PIXI.Point {
  if (!contentViewport) return pointInContainer

  const globalPoint = container.toGlobal(pointInContainer)
  const scenePoint = projectGlobalPointThroughCompositeChain(objectId, globalPoint, states)
    ?? contentViewport.toLocal(globalPoint)
  return new PIXI.Point(scenePoint.x, scenePoint.y)
}

/**
 * 方案B: 统一首帧 BBox 偏移量锁定
 * 对每个 camera_follow action 的跟随目标，首帧计算 BBox 中心与 pivot 中心的偏差并缓存，
 * 后续帧使用缓存偏移量 + 实时 pivot 位置，确保跟随点稳定不跳动。
 * 对简单对象 offset ≈ 0（等价于原 pivot 行为），对 composite 修正了视觉中心偏移。
 */
function computeFollowVisualCenters(
  pivotCenters: Map<string, { x: number, y: number }>,
  blockActions: Action[],
  states: Map<string, SceneObject>,
): Map<string, { x: number, y: number }> {
  const result = new Map(pivotCenters)
  if (!contentViewport) return result
  contentViewport.updateTransform()

  const followActions = blockActions.filter(
    (a: Action) => a.target === 'camera' && a.type === 'camera_follow'
  )

  for (const action of followActions) {
    const followTarget = (action.params as { followTarget?: string })?.followTarget
    if (!followTarget) continue

    const pivotCenter = pivotCenters.get(followTarget)
    if (!pivotCenter) continue

    // 检查缓存：已有首帧偏移量则直接使用
    if (followBBoxOffsets.has(action.id)) {
      const offset = followBBoxOffsets.get(action.id)!
      result.set(followTarget, {
        x: pivotCenter.x + offset.dx,
        y: pivotCenter.y + offset.dy,
      })
      continue
    }

    // 首帧：从 PIXI 容器计算 BBox 中心偏移量
    const container = objectContainers.get(followTarget)
    if (!container) continue

    const bounds = container.getLocalBounds()
    if (bounds.width <= 0 || bounds.height <= 0) continue

    const bboxLocalCenter = new PIXI.Point(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    )
    const bboxSceneCenter = projectContainerLocalPointToScene(
      followTarget,
      container,
      bboxLocalCenter,
      states,
    )

    const dx = bboxSceneCenter.x - pivotCenter.x
    const dy = bboxSceneCenter.y - pivotCenter.y

    // 缓存偏移量
    followBBoxOffsets.set(action.id, { dx, dy })

    // 应用偏移
    result.set(followTarget, {
      x: pivotCenter.x + dx,
      y: pivotCenter.y + dy,
    })
  }

  return result
}

// P0: 委托给统一渲染器
function applyObjectState(
  container: PIXI.Container,
  state: SceneObject,
  objSetup: SceneObject,
  _runtimeStates?: Map<string, SceneObject>
): { x: number, y: number } | null {
  const result = sceneObjectRenderer.applyObjectState(container, state, objSetup, objectStateHost)

  // v20: union 子对象在容器内（真实 PIXI 父子关系），变换自动传播，无需 applyUnionProxyChain

  return result
}

function updateCamera(
  currentInfo: BlockPlayInfo,
  blockLocalTime: number,
  centers: Map<string, { x: number, y: number }>,
  frameDeltaMs: number,
) {
  const blockActions = currentInfo.blockActions
  const cameraActions = blockActions.filter((a: Action) => a.target === 'camera')

  for (const action of cameraActions) {
    if (action.type === 'camera_follow') {
      const params = action.params as { followTarget?: string; offsetX?: number; offsetY?: number }
      const followTarget = params?.followTarget
      if (followTarget && centers.has(followTarget)) {
        const targetCenter = centers.get(followTarget)!
        const offsetX = params?.offsetX ?? 0
        const offsetY = params?.offsetY ?? -50
        lastFollowPosition = {
          x: targetCenter.x + offsetX,
          y: targetCenter.y + offsetY,
        }
      }
    }
  }

  const cameraState = evaluateCameraState(
    currentInfo.startSnapshot.camera,
    blockActions,
    blockLocalTime,
    currentInfo.duration,
    currentInfo.slots,
    centers,
    lastFollowPosition,
    frameDeltaMs,
    lastEvaluatedCameraState,
  )
  lastEvaluatedCameraState = { ...cameraState }
  applyCameraTransform(cameraState)
}

function applyCameraTransform(cameraState: RuntimeCameraState) {
  if (!contentViewport) return
  SceneObjectRenderer.applyCameraTransform(contentViewport, cameraState)
}

function updateSubtitle(currentInfo: BlockPlayInfo, localTime: number) {
  currentSubtitle.value = getSubtitleTextAtTime(currentInfo.block, currentInfo.slots, localTime)
}

function applyAnimationControl(currentInfo: BlockPlayInfo, currentTime: number) {
    animationController.processSetAnimActions(
      currentInfo.blockActions,
      currentInfo.slots,
      currentTime,
      currentInfo.duration,
      {
        blockId: currentInfo.block.id,
        ttsTiming: getTTSTimingForBlock(currentInfo.block),
      },
    )
}

/**
 * v11.88: Block 结束时自动停止动画
 * 遍历该 Block 的所有 set_anim actions，对 autoStopOnBlockEnd !== false 的动画执行停止
 */
function applyAutoStopOnBlockEnd(prevBlockInfo: BlockPlayInfo): void {
    animationController.processAutoStopOnBlockEnd(prevBlockInfo.blockActions)
}

function updateAudio(currentInfo: BlockPlayInfo, blockLocalTime: number, states: Map<string, SceneObject>) {
    if (!sceneSetup) return
    const currentAbsTime = currentInfo.startTime + blockLocalTime
    
    for (const objSetup of sceneSetup.objects) {
        if (objSetup.type !== 'audio') continue

        // 检查生命周期：如果对象已消亡，停止其音频并跳过
        const objState = states.get(objSetup.id)
        if (objState?.spawned === false) {
            const instance = audioInstances.get(objSetup.id)
            if (instance?.isPlaying) {
                instance.stop()
                audioInstances.delete(objSetup.id)
                audioInstancePlayTimes.delete(objSetup.id)
                audioStopping.delete(objSetup.id)
            }
            continue
        }

        if (pendingAudioPlays.has(objSetup.id)) {
            // 计算当前应有的 audioState 以检测 playTime 是否已切换
            const pendingPlayTime = pendingAudioPlayTimes.get(objSetup.id)
            const peekState = computeAudioState(objSetup, blockPlayInfos.value, currentAbsTime, 0)
            if (peekState.shouldPlay && pendingPlayTime === peekState.playTime) {
                continue  // 同一个 play action，等待 pending 完成
            }
            // playTime 已切换或不再需要播放，废弃在途的 pending play
            // 注意：这里不能递增全局 audioPlayGeneration，否则会误杀其他对象的在途加载
            // 利用 audioInstancePlayTimes 做 per-object 失效：下方新建 play 会写入新 playTime，
            // 旧 .then() 回调通过 capturedPlayTime 比对自动丢弃
            pendingAudioPlays.delete(objSetup.id)
            pendingAudioPlayTimes.delete(objSetup.id)
            audioInstancePlayTimes.delete(objSetup.id)
            // 继续执行下方逻辑
        }
        
        // PA: 使用 computeAudioState 纯函数计算音频状态
        let instance = audioInstances.get(objSetup.id)
        const audioDurationSec = instance?.duration ?? 0
        const audioState = computeAudioState(
            objSetup,
            blockPlayInfos.value,
            currentAbsTime,
            audioDurationSec,
        )
        
        let { shouldPlay } = audioState
        const { targetVolume, loop, playTime, fadeIn, inFadeOutTail, fadeOutDuration, stopTime } = audioState
        
        if (!isPlaying.value) if (shouldPlay) shouldPlay = false

        // 检测 playTime 是否已切换（新的 play action 生效），如果是则停止旧实例
        if (shouldPlay && instance?.isPlaying) {
            const cachedPlayTime = audioInstancePlayTimes.get(objSetup.id)
            if (cachedPlayTime !== playTime) {
                // 旧实例对应的 play action 已过期，停止并清除
                instance.stop()
                audioInstances.delete(objSetup.id)
                audioInstancePlayTimes.delete(objSetup.id)
                audioStopping.delete(objSetup.id)
                instance = undefined  // 让下方逻辑走新建分支
            }
        }

        if (shouldPlay) {
            if (!instance?.isPlaying) {
                const sound = soundStore.getSound(objSetup.refId)
                if (!sound?.url) continue
                const blobUrl = getAudioUrl(sound.url)
                if (!blobUrl) continue
                
                const startOffset = (currentAbsTime - playTime) / 1000
                let initialVol = targetVolume
                let initialFadeIn = fadeIn
                if (inFadeOutTail) {
                    const t = (currentAbsTime - stopTime) / 1000
                    const d = fadeOutDuration
                    const progress = Math.min(1, Math.max(0, t / d))
                    initialVol = targetVolume * (1 - progress)
                    initialFadeIn = 0
                }
                
                const currentGeneration = audioPlayGeneration.value
                const capturedPlayTime = playTime  // per-object 失效令牌
                pendingAudioPlays.add(objSetup.id)
                pendingAudioPlayTimes.set(objSetup.id, playTime)
                audioInstancePlayTimes.set(objSetup.id, playTime)
                audioKit.play(blobUrl, {
                    volume: initialVol, loop: loop, fadeIn: initialFadeIn, startOffset: startOffset
                }).then(inst => {
                    pendingAudioPlays.delete(objSetup.id)
                    pendingAudioPlayTimes.delete(objSetup.id)

                    // 全局失效化：Seek/Stop 期间发起的请求一律丢弃
                    if (currentGeneration !== audioPlayGeneration.value) {
                        inst?.stop()
                        return
                    }

                    // per-object 失效化：另一个 play action 已替代本次请求
                    if (audioInstancePlayTimes.get(objSetup.id) !== capturedPlayTime) {
                        inst?.stop()
                        return
                    }

                    if (inst) {
                        audioInstances.set(objSetup.id, inst)
                        if (inFadeOutTail) {
                            const remaining = fadeOutDuration - (currentAbsTime - stopTime) / 1000
                            inst.stop(Math.max(0, remaining))
                            audioStopping.add(objSetup.id)
                        } else {
                            audioStopping.delete(objSetup.id)
                        }
                        if (!isPlaying.value) {
                            inst.stop()
                            audioInstances.delete(objSetup.id)
                            audioInstancePlayTimes.delete(objSetup.id)
                        }
                    }
                }).catch(() => { /* ignore */ })
            } else {
                if (inFadeOutTail) {
                    if (!audioStopping.has(objSetup.id)) {
                        const remaining = fadeOutDuration - (currentAbsTime - stopTime) / 1000
                        instance.stop(Math.max(0, remaining))
                        audioStopping.add(objSetup.id)
                    }
                } else {
                    audioStopping.delete(objSetup.id)
                    instance.setVolume(targetVolume, 0.1)
                }
            }
        } else {
            if (instance?.isPlaying) {
                instance.stop()
                audioInstances.delete(objSetup.id)
                audioInstancePlayTimes.delete(objSetup.id)
                audioStopping.delete(objSetup.id)
            }
        }
    }
}

// preloadAllAssets removed as requested. Resources should be preloaded by parent (ScriptPreviewDialog/ScenePreviewDialog).
// async function preloadAllAssets() {
//    // Empty stub or removed implementation
// }


/**
 * 加载并解码音频 (已移除，ScenePlayer不负责加载)
 */
// async function loadAndDecodeAudio(path: string) {
//   // 1. 加载 Blob URL
//   await loadAudioUrl(path)
//   const blobUrl = getAudioUrl(path)
//   
//   if (!blobUrl) {
//     console.warn('[ScenePlayer] Failed to load audio blob:', path)
//     return
//   }
//
//   // 2. WebAudioKit Load
//   await audioKit.load(blobUrl)
// }

/**
 * 更新当前帧（主循环入口）
 * 遵循 5 阶段渲染管线：
 * ```mermaid
 * graph TD
 *     A[Start Frame] --> B[Phase 1: Sync Resources]
 *     B --> C[Phase 2: Measure Objects]
 *     C --> D[Phase 3: Evaluate States]
 *     D --> E[Phase 4: Layout Objects]
 *     E --> F[Phase 5: Update Camera]
 *     F --> G[End Frame]
 * ```
 */
function updateFrame(time: number, options: { updateAudio?: boolean } = {}) {
  const shouldUpdateAudio = options.updateAudio !== false
  if (!sceneSetup) {
    throw new Error('[ScenePlayer] updateFrame aborted: sceneSetup is null')
  }
  if (blockPlayInfos.value.length === 0) {
    throw new Error('[ScenePlayer] updateFrame aborted: blockPlayInfos is empty')
  }
  
  // 找到当前播放的 block
  let currentInfo: BlockPlayInfo | null = null
  let blockLocalTime = 0
  
  for (let i = 0; i < blockPlayInfos.value.length; i++) {
    const info = blockPlayInfos.value[i]
    if (!info) continue

    if (time >= info.startTime && time < info.endTime) {
      currentInfo = info
      currentBlockIndex.value = i
      blockLocalTime = time - info.startTime
      break
    } else if (time >= info.endTime && i === blockPlayInfos.value.length - 1) {
      currentInfo = info
      currentBlockIndex.value = i
      blockLocalTime = info.duration
    }
  }
  
  if (!currentInfo) {
    throw new Error(`[ScenePlayer] 无法找到当前时间对应的 Block 信息 (Time: ${time})`)
  }
  
  // 检测 Block 切换
  if (currentBlockIndex.value !== previousBlockIndex) {
    // v11.88: 处理 autoStopOnBlockEnd - 停止上一个 Block 中需要自动停止的动画
    if (previousBlockIndex >= 0 && previousBlockIndex < blockPlayInfos.value.length) {
      const prevBlockInfo = blockPlayInfos.value[previousBlockIndex]
      if (prevBlockInfo) {
        applyAutoStopOnBlockEnd(prevBlockInfo)
      }
    }
    // v11.88: Block 切换时清空动画触发状态，确保新 Block 中的动画能够正常触发
    triggeredAnimations.clear()
    followBBoxOffsets.clear()
    previousBlockIndex = currentBlockIndex.value
  }
  
  // 更新字幕
  updateSubtitle(currentInfo, blockLocalTime)
  
  // Phase 1: 资源同步 (已在 loadScene/renderInitialFrame 中完成，updateFrame 不重复执行)
  // v11.66: 与 ActionPreviewDialog 保持一致
  // syncResources()
  
  // Phase 2: 实时测量 (已移至初始化阶段，不再每帧执行，确保位置锚点稳定)
  // measureObjects()
  
  // Phase 3: 评估状态
  const states = evaluateStates(currentInfo, blockLocalTime)
  
  // Phase 4: 布局对象
  // v22: 从 snapshot 读取 renderChain
  const pivotCenters = layoutObjects(states, currentInfo.startSnapshot.renderChain)

  // Phase 4.5: 刚变为可见的对象立即补启动延迟的初始动画，
  // 避免等到后续 set_anim 处理阶段才进入播放态。
  animationController.syncDeferredInitialAnimations()

  // Phase 5: 音频更新
  if (shouldUpdateAudio) {
    updateAudio(currentInfo, blockLocalTime, states)
  }

  // Phase 6: 动画控制 (处理 set_anim 动作)
  applyAnimationControl(currentInfo, blockLocalTime)

  // Phase 7: 更新动画 Player (v11.60)
  const deltaTime = isPlaying.value
    ? (lastAnimationUpdateTime === null ? 16.67 : Math.min(50, Math.max(0, time - lastAnimationUpdateTime)))
    : 0
  if (isPlaying.value) {
    lastAnimationUpdateTime = time
  }

  objectAnimationPlayers.forEach(player => player.update(deltaTime))

  // Phase 7.5: 手动推进所有 AnimatedSprite 帧索引
  // 替代 PIXI Ticker 自动更新，确保出生帧同帧播放
  advanceAllObjectAnimations(objectContainers, deltaTime, spriteAnimTimeAccumulator)

  // v20: union 子对象在容器内，动画变换自动传播，无需 sharedPropagateUnionAnimations

  // P2: 更新 composite own 模式的离屏渲染纹理（必须在 player.update 之后、renderer.render 之前）
  updateCompositeRenderTargetsInOrder(compositeRenderTargets, [...states.values()])

  // 方案B: 统一通过首帧 BBox 偏移量计算稳定的跟随点
  const followCenters = computeFollowVisualCenters(pivotCenters, currentInfo.blockActions, states)

  // Phase 8: 相机更新
  updateCamera(currentInfo, blockLocalTime, followCenters, deltaTime)

  // Phase 9: 光照滤镜
  // updateTransform 确保 worldTransform 是最新的，toGlobal 给出精确屏幕坐标
  if (stage && contentViewport) {
    contentViewport.updateTransform()
    applyLightingFilter(
      [...states.values()],
      stage,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      lightingFilterCache,
      new PIXI.Rectangle(0, 0, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT),
      (id) => objectContainers.get(id),
      undefined,
      pixiApp?.renderer as PIXI.Renderer | undefined,
      compositeRenderTargets,
    )
  }

  // Clip-Mask Phase 1：在 render 之前更新 worldTransform 并应用所有蒙版
  applyMasksBeforeRender([...states.values()])

  // Phase 10: 手动渲染
  // 禁用 PIXI Ticker 自动渲染后，由 updateFrame 末尾同步 render，
  // 确保状态更新和渲染在同一调用栈内完成（与 FrameCapture 一致）
  if (pixiApp) {
    pixiApp.renderer.render(pixiApp.stage)
  }
}

function renderCurrentFrameWithoutAudio(): void {
  if (blockPlayInfos.value.length === 0) return

  try {
    updateFrame(currentTime.value, { updateAudio: false })
  } catch (e) {
    console.warn('[ScenePlayer] Initial evaluated frame render failed:', e)
  }
}

/**
 * 停止所有音频
 */
function stopAllAudio() {
  // 增加 generation，使得正在路上的 BGM/SFX play 请求失效
  audioPlayGeneration.value++

  // Stop all tracked instances
  for (const [_, instance] of audioInstances) {
    try {
      instance.stop()
    } catch (e) {
      console.warn('[ScenePlayer] Failed to stop audio instance:', e)
    }
  }
  audioInstances.clear()
  audioInstancePlayTimes.clear()
  
  // Also clear tracking sets
  pendingAudioPlays.clear()
  pendingAudioPlayTimes.clear()
  audioStopping.clear()
  
  // Stop main block audio
  // Stop main block audio
  trackedAudioInstances.forEach(inst => {
      try { inst.stop() } catch { /* ignore */ }
  })
  trackedAudioInstances.clear()

}

/**
 * 开始播放
 */
async function play() {
  if (isPlaying.value) {
    return
  }
  
  // 确保 AudioContext 已激活
  await audioKit.init()

  if (blockPlayInfos.value.length === 0) {
    return
  }
  
  // 如果已经播放完，重置
  if (currentTime.value >= totalDuration.value) {
    currentTime.value = 0
  }
  
  isPlaying.value = true
  emit('play-state-change', true)
  lastAnimationUpdateTime = currentTime.value
  
  // 先尝试播放音频，等待音频就绪后再启动动画时间轴
  await playCurrentBlockAudio()
  
  playStartTime = performance.now()
  playStartOffset = currentTime.value
  
  // 启动动画循环
  startPlaybackLoop()
}

/**
 * 暂停
 */
function pause() {
  if (!isPlaying.value) return
  
  isPlaying.value = false
  emit('play-state-change', false)
  lastAnimationUpdateTime = null
  
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  
  stopCurrentAudio()
  
  playStartOffset = currentTime.value
}

/**
 * 重置
 */
function reset() {
  isPlaying.value = false
  emit('play-state-change', false)
  currentTime.value = 0
  currentBlockIndex.value = -1
  currentSubtitle.value = ''
  lastAnimationUpdateTime = null
  
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  
  stopCurrentAudio()
  
  // 停止所有音频
  stopAllAudio()
  
  // 不要挂起 AudioContext，否则再次播放时无声
  // const ctx = audioKit.getContext()
  // if (ctx) {
  //   await ctx.suspend()
  // }

  playStartOffset = 0
  lastFollowPosition = null
  lastEvaluatedCameraState = null
  followBBoxOffsets.clear()
  triggeredAnimations.clear()  // v11.60: 重置时清空动画触发状态
  // v11.66: resetSceneToSetup is now async, use void to avoid blocking
  void resetSceneToSetup()
}

/**
 * 跳转时间
 */
async function seek(time: number) {
  currentTime.value = time

  // Force pause immediately to stop noise
  // Force pause immediately to stop noise
  trackedAudioInstances.forEach(inst => {
      try { inst.stop() } catch { /* ignore */ }
  })
  trackedAudioInstances.clear()
  
  // 停止所有音效
  stopAllAudio()
  
  // 如果正在播放，重新同步
  if (isPlaying.value) {
    playStartTime = performance.now()
    playStartOffset = currentTime.value
    lastAnimationUpdateTime = currentTime.value
    // 重新播放当前 Block 的音频
    await playCurrentBlockAudio()
  } else {
    // 如果暂停状态，仅更新画面
    try {
        updateFrame(time)
    } catch(e) {
        console.warn('[ScenePlayer] Seek update failed:', e)
    }
  }
}

/**
 * 播放动画循环
 */
function startPlaybackLoop() {
  let lastBlockIndex = -1
  
  function loop() {
    if (!isPlaying.value) {
      return
    }
    
    const elapsed = performance.now() - playStartTime
    const newTime = playStartOffset + elapsed
    
    if (newTime >= totalDuration.value) {
      currentTime.value = totalDuration.value
      isPlaying.value = false
      emit('play-state-change', false)
      lastAnimationUpdateTime = null

      try {
        updateFrame(totalDuration.value, { updateAudio: false })
      } catch (e) {
        console.warn('[ScenePlayer] Final frame render failed:', e)
      }

      currentSubtitle.value = ''
      
      if (trackedAudioInstances.size > 0) {
        trackedAudioInstances.forEach(inst => {
             try { inst.stop() } catch { /* ignore */ }
        })
        trackedAudioInstances.clear()
      }

      emit('playback-finished')
      return
    }
    
    currentTime.value = newTime
    emit('progress', currentTime.value, totalDuration.value)
    
    // 检查是否切换到新的 block
    const currentInfo = blockPlayInfos.value.find(
      i => newTime >= i.startTime && newTime < i.endTime
    )
    if (currentInfo) {
      const newBlockIndex = blockPlayInfos.value.indexOf(currentInfo)
      if (newBlockIndex !== lastBlockIndex) {
        lastBlockIndex = newBlockIndex
        // 切换到新 block，播放新的音频
        void playCurrentBlockAudio()
      }
    }
    
    try {
        updateFrame(newTime)
    } catch (e) {
        console.error(e)
        void pause()
    }
    animationFrame = requestAnimationFrame(() => { void loop() })
  }
  
  animationFrame = requestAnimationFrame(() => { void loop() })
}

/**
 * 播放当前 block 的音频
 */
async function playCurrentBlockAudio() {
  audioPlayRequestId.value++
  const currentRequestId = audioPlayRequestId.value

  stopCurrentAudio()
  
  if (currentRequestId !== audioPlayRequestId.value) return

  const info = blockPlayInfos.value.find(
    i => currentTime.value >= i.startTime && currentTime.value < i.endTime
  )
  
  if (!info?.audioUrl) {
    return
  }

  const infoIndex = blockPlayInfos.value.indexOf(info)
  
  try {
    const audioUrl = await resolvePlayableAudioUrl(info.audioUrl)
    if (!audioUrl) {
      console.warn('[ScenePlayer] 无法解析音频路径:', info.audioUrl)
      return
    }

    if (currentRequestId !== audioPlayRequestId.value) return

    // 使用 AudioKit 播放
    const localTime = currentTime.value - info.startTime
    const startOffset = Math.max(0, localTime / 1000)
    
    const audioBuffer = await audioKit.load(audioUrl)
    
    if (currentRequestId !== audioPlayRequestId.value) return

    const actualDurationMs = Math.round((audioBuffer?.duration ?? 0) * 1000)
    if (infoIndex >= 0 && actualDurationMs > 0 && actualDurationMs !== info.duration) {
      updateBlockTimelineFrom(infoIndex, Math.max(info.duration, actualDurationMs))
    }
    
    const instance = await audioKit.play(audioUrl, {
        volume: getBlockPlaybackVolume(info.block),
        loop: false,
        startOffset: startOffset
    })
    
    if (instance) {
        trackedAudioInstances.add(instance)
        // 监听结束以清理？AudioKit 实例会自动停止。
        // 但我们需要 track 它以便 seek/pause 时停止。
    }

  } catch (err: unknown) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[ScenePlayer] 音频播放失败:', err)
    }
  }
}

/**
 * 安全停止当前音频
 */
function stopCurrentAudio() {
  trackedAudioInstances.forEach(inst => {
      try { inst.stop() } catch { /* ignore */ }
  })
  trackedAudioInstances.clear()
}

/**
 * 将场景重置为 Setup 状态
 * v11.66: 改为 async，与 renderInitialFrame 流程一致
 */
async function resetSceneToSetup() {
  if (!sceneSetup) return

  // v11.60: 重置动画触发状态
  triggeredAnimations.clear()
  objectDimensions.clear()

  // v11.66: await syncResources to ensure characters are fully initialized
  await syncResources()
  

  
  // 应用初始动画状态（在测量之前）
  applyInitialAnimationStates()
  
  // P1: blockId 模式下重播跨 Block 持续播放的动画
  replayCarriedOverAnimations()
  
  // 测量（现在角色状态已确定）
  measureObjects()
  syncObjectBoundsToPlayers()

  // P1: 使用 getActiveObjects 遍历对象
  const objectsToApply = getActiveObjects()
  const states = new Map<string, SceneObject>()

  for (const objSetup of objectsToApply) {
    const getInitialObjectState = (objSetup: SceneObject): SceneObject => buildObjectStateSnapshot(objSetup)
    states.set(objSetup.id, getInitialObjectState(objSetup))
  }

  // Phase 4: 布局对象 (与 updateFrame 完全一致的逻辑，包含 parent 迁移和排序)
  // v22: 传入场景 setup 的 renderChain
  layoutObjects(states, sceneSetup.renderChain)

  applyCameraTransform(getDefaultCameraState())

  // P2: 更新 composite own 模式的离屏渲染纹理
  updateCompositeRenderTargetsInOrder(compositeRenderTargets, [...states.values()])

  // Clip-Mask Phase 1：在 render 之前更新 worldTransform 并应用所有蒙版
  applyMasksBeforeRender([...states.values()])

  // 手动渲染（Ticker 已禁用）
  if (pixiApp) {
    pixiApp.renderer.render(pixiApp.stage)
  }
}

// Cleanup
function cleanup() {
  isPlaying.value = false
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  // P2: 先清理离屏渲染目标（在 Player 之前，因为 Player.destroy 会还原容器层级）
  compositeRenderTargets.forEach(crt => crt.destroy())
  compositeRenderTargets.clear()

  // Clip-Mask Phase 1：清理蒙版渲染资源（必须在容器销毁之前）
  disposeMaskRendererResources(maskRendererResources)

  // v11.60: 清理动画 Player（它们需要访问容器来移除滤镜）
  objectAnimationPlayers.forEach(player => player.destroy())
  objectAnimationPlayers.clear()
  triggeredAnimations.clear()
  followBBoxOffsets.clear()

  // 再清理其他资源
  if (pixiApp) {
    pixiApp.stop() // Stop ticker before destroy
    pixiApp.destroy(true, { children: true, texture: false, baseTexture: false })
    pixiApp = null
    stage = null
    contentViewport = null
    scaleContainer = null
    blackBackground = null
  }
  stopAllAudio()
  objectContainers.clear()

  if (lightingFilterCache.instance) {
    lightingFilterCache.instance.destroy()
    delete lightingFilterCache.instance
  }
  if (lightingFilterCache.maskRT) {
    lightingFilterCache.maskRT.destroy(true)
    delete lightingFilterCache.maskRT
  }

  lastMeasuredPose.clear()
}

onMounted(() => {
    void initRenderer()
})

onBeforeUnmount(() => {
    cleanup()
})

watch(() => props.sceneId, () => {
    // 切换场景时，只重置状态并加载新场景，不销毁 PIXI App
    isPlaying.value = false
    currentTime.value = 0
    currentBlockIndex.value = -1
    currentSubtitle.value = ''
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    // 异步切换
    void loadScene()
})

</script>

<style scoped>
.scene-player {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.loading-overlay, .error-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8);
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.subtitle-overlay {
  position: absolute;
  bottom: 5%;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  text-align: center;
  pointer-events: none;
}

.subtitle-text {
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 24px;
  display: inline-block;
}

.loading-spinner {
  width: 40px; height: 40px;
  border: 4px solid #333;
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
