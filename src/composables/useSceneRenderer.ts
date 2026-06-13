/**
 * useSceneRenderer - Scene Renderer (Commander Pattern)
 * 
 * Architecture:
 * Following "Strategy Pattern + Composition Reuse" design, responsibilities are split into independent Composable modules:
 * 
 * 1. usePixiApp.ts    - PixiJS setup (init/destroy/resize)
 * 2. useSceneGraph.ts - Layer & object management (create/update/remove)
 * 3. useInteraction.ts - Interaction logic (drag/resize/rotate)
 * 
 * This file serves as the "Commander" role, responsible for:
 * - Assembling the above modules
 * - Coordinating data flow between modules
 * - Providing unified external interface
 */

import * as PIXI from 'pixi.js'
import { watch } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
// v7.3: effectStore 已删除
import { useAssetLoader } from '@/composables/useAssetLoader'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH } from '@/constants/canvas'
import { Z_INDEX_CAMERA_OVERLAY } from '@/constants/zIndex'
import { LightingFilter } from '@/core/filters/LightingFilter'
import {
  applyAllMasks,
  createMaskRendererResources,
  disposeMaskRendererResources,
  type MaskRendererResources,
} from '@/core/maskRenderer'
import { installRenderChainRenderer, installRootRenderChainRenderer } from '@/core/RenderChainStage'
import { applyLightingFilter, type LightingFilterCache } from '@/core/renderPipeline'
import { type ObjectDimensions, type ObjectStateHost, SceneObjectRenderer } from '@/core/SceneObjectRenderer'
import { advanceAnimatedSprites } from '@/core/spriteAnimationDriver'
import type { TextureProvider } from '@/core/TextureProvider'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import { type CameraObject, type SceneObject, useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { LightObject, SymbolObject, TextObject } from '@/types/sceneObject'
import type { SceneObjectProvider } from '@/types/SceneObjectProvider'
// Import utilities
// v8.8: evaluateCameraStateBySlot 和 evaluateObjectStateBySlot 已移除
// 统一渲染流程直接使用 calculateSlotStates 的结果
import type { Action, RuntimeSceneSnapshot, RuntimeSlot, SceneSetup, SetAnimAction } from '@/types/screenplay'
import { localToGlobal } from '@/utils/actionHandlers/matrixUtils'
import type { WriteableState } from '@/utils/actionHandlers/types'
import { ensureFontLoaded } from '@/utils/fontLoader'
// v25.6: evaluateLight 由共享 applyLightingFilter 内部调用，编辑器不再直接导入
import { isPointLikeLight } from '@/utils/lightRuntime'
import { sortRenderChainByZIndex } from '@/utils/renderChainUtils'

import { type InteractionCallbacks, useInteraction } from './useInteraction'
// Import decomposed sub-modules
import { type PixiAppOptions, usePixiApp } from './usePixiApp'
import { useSceneGraph } from './useSceneGraph'
import { useScenePicking } from './useScenePicking'

interface UseSceneRendererOptions {
  canvasContainer: HTMLElement
  canvasWidth?: number
  canvasHeight?: number
  mode?: 'setup' | 'action'
  episodeId?: string | null
  sceneId?: string | null
  blockId?: string | null
  onActionUpdate?: (action: ActionUpdatePayload) => void | Promise<void>
  onSetupChange?: (change: SetupChangePayload) => void  // Setup Mode: 拖拽/缩放/旋转/变换点完成后通知
  wheelZoomAnchor?: 'pointer' | 'viewport-center'
  /** 可选的 store 覆盖，用于数据隔离场景（如动画编辑）。不传则使用全局 sceneObjectStore */
  storeOverride?: SceneObjectProvider
  /**
   * 将变换点手柄降级为只读 gizmo：
   * - 绘制为灰色，禁用 pointer 事件，不响应拖拽
   * 用于动画工作台主画布——变换点编辑迁移到 PivotEditorPanel。
   */
  readonlyOriginHandle?: boolean
  /**
   * 锁定对象交互：取消对象容器上的拖拽类 pointer 事件，
   * 使得用户无法拖拽/缩放/旋转对象本体。
   * 变换点手柄仍然有效（手柄在 selectionContainer，不受容器事件影响）。
   * 用于 PivotEditorPanel 的独立子画布。
   */
  lockObjectInteraction?: boolean
  /**
   * 禁用视口 pan/zoom：滚轮、中键与 Space+拖拽都不再触发视口移动或缩放。
   * 用于 PivotEditorPanel 避免对象被滚出可视区。
   */
  disableViewportPanZoom?: boolean
}

// Action Mode 操作回调负载类型
export type ActionUpdatePayload =
  | { type: 'move'; target: string; params: { x: number; y: number; speed: string; globalX?: number; globalY?: number } }
  | { type: 'scale'; target: string; params: { scaleX: number; scaleY: number; x?: number; y?: number; globalX?: number; globalY?: number } }
  | { type: 'rotate'; target: string; params: { rotation: number; x?: number; y?: number; globalX?: number; globalY?: number } }
  | { type: 'set_origin'; target: string; params: { transformOriginX: number; transformOriginY: number } }

export type SetupChangePayload =
  | { type: 'transform'; objectId: string }
  | { type: 'origin'; objectId: string; pivot: { x: number; y: number } }

export function useSceneRenderer(options: UseSceneRendererOptions) {
  const _globalStore = useSceneObjectStore()
  const sceneObjectStore: SceneObjectProvider = options.storeOverride ?? _globalStore
  const propStore = usePropStore()

  // v7.3: effectStore 已删除

  const { imageCache: _imageCache } = useAssetImage()

  const mode = options.mode ?? 'setup'
  const onActionUpdate = options.onActionUpdate
  const onSetupChange = options.onSetupChange
  const readonlyOriginHandle = options.readonlyOriginHandle ?? false
  const lockObjectInteraction = options.lockObjectInteraction ?? false

  // ========== 1. Assemble Sub-modules ==========

  // 1.1 PixiJS Basic Setup
  const pixiAppOptions: PixiAppOptions = {
    canvasContainer: options.canvasContainer,
    mode
  }
  if (options.canvasWidth !== undefined) pixiAppOptions.canvasWidth = options.canvasWidth
  if (options.canvasHeight !== undefined) pixiAppOptions.canvasHeight = options.canvasHeight
  if (options.wheelZoomAnchor !== undefined) pixiAppOptions.wheelZoomAnchor = options.wheelZoomAnchor
  if (options.disableViewportPanZoom !== undefined) pixiAppOptions.disableViewportPanZoom = options.disableViewportPanZoom

  const pixiApp = usePixiApp(pixiAppOptions)

  // 1.2 Layer & Object Management
  const sceneGraph = useSceneGraph({ mode, ...(options.storeOverride ? { storeOverride: options.storeOverride } : {}) })

  // 1.3 Interaction Logic (lazy init, needs stage and canvasElement reference)
  let interaction: ReturnType<typeof useInteraction> | null = null

  // ========== 2. State Management ==========

  // v8.6 P1: Legacy 时间变量已移除，统一使用 Slot 驱动
  // v8.6 P0: currentActions 已迁移至 SceneGraph，改为从 sceneGraph.getCurrentActions() 读取
  // v8.6 P0: currentSlots 已迁移至 SceneGraph，改为从 sceneGraph.getSlots() 读取
  // v8.6 P0: currentSlotIndex 已迁移至 SceneGraph，改为从 sceneGraph.getCurrentSlotIndex() 读取
  let actionModeState: SceneSetup | RuntimeSceneSnapshot | null = null
  let isDestroyed = false // 防止重复销毁的标记
  let blankCanvasInteractionLayer: PIXI.Container | null = null
  let scenePickingInteractionLayer: PIXI.Container | null = null

  let autoRenderEnabled = true

  // Clip-Mask Phase 1: \u8499\u7248\u6e32\u67d3\u5668\u8d44\u6e90\uff08\u7f16\u8f91\u5668\u8def\u5f84\uff09
  const maskRendererResources: MaskRendererResources = createMaskRendererResources()
  let suppressObjectWatchRenderCount = 0

  // v7.9: Override Object States (Target Preview Mode)
  let overrideObjectStates: Map<string, SceneObject> | null = null

  // Action Mode 缩放/旋转操作起始状态
  let resizeStartState: { scaleX: number; scaleY: number; width?: number; height?: number } | null = null
  let rotateStartState: { rotation: number } | null = null



  // Phase 3: 统一渲染器 — 委托给 SceneObjectRenderer.applyObjectState
  const { getTexture: _getTexture } = useAssetLoader()
  const { getImageUrl: _getImageUrl } = useAssetImage()
  const editorTextureProvider: TextureProvider = {
    getTexture: (url: string) => _getTexture(url),
    getImageUrl: (url: string) => _getImageUrl(url)
  }
  const editorRenderer = new SceneObjectRenderer(
    editorTextureProvider,
    {
      propStore,
      backgroundStore: useBackgroundStore(),
      expressionStore: useExpressionStore()
    }
  )
  // Phase 3: Editor ObjectStateHost 缓存
  const lightingFilterInstance = new LightingFilter()
  const objectDimensionsCache = new Map<string, ObjectDimensions>()
  const textFontRenderTokens = new WeakMap<PIXI.Container, number>()

  // 交互锁：记录当前正在拖拽/缩放/旋转的对象 ID
  // 防止异步 applyObjectState 在 await 恢复后覆盖交互期间设置的容器 transform
  const interactionLockedObjects = new Set<string>()

  const editorObjectStateHost: ObjectStateHost = {
    getObjectDimensions: (id: string) => objectDimensionsCache.get(id),
    setObjectDimensions: (id: string, dims: ObjectDimensions) => objectDimensionsCache.set(id, dims),
    isInteractionLocked: (objectId: string) => interactionLockedObjects.has(objectId),
  }

  async function applyEditorObjectState(
    container: PIXI.Container,
    state: SceneObject,
    objSetup: SceneObject,
  ): Promise<boolean> {
    if (state.type === 'text') {
      const textState = state as TextObject
      const token = (textFontRenderTokens.get(container) ?? 0) + 1
      textFontRenderTokens.set(container, token)
      await ensureFontLoaded(textState.fontFamily ?? 'Noto Sans SC', textState.content)
      if (container.destroyed || textFontRenderTokens.get(container) !== token) {
        return false
      }
    }
    editorRenderer.applyObjectState(container, state, objSetup, editorObjectStateHost)
    return true
  }

  // v6.6: 当前选中的动作类型（用于限制相机拖动）
  let currentSelectedActionType: string | null = null

  // v25.6: 光照聚合函数 — 委托给共享管线 applyLightingFilter
  // 消除编辑器/ScenePlayer 双链路分叉，确保坐标投影、半径投影、UV 归一化完全一致。
  const lightingFilterCache: LightingFilterCache = { instance: lightingFilterInstance }

  function aggregateLightingFilter(objects: readonly SceneObject[]): void {
    const ctx = pixiApp.getContext()
    if (!ctx) return
    const filterHost = ctx.activeLayer ?? ctx.stage
    if (!filterHost) return

    const canvasW = options.canvasWidth ?? 1600
    const canvasH = options.canvasHeight ?? 900
    const timeMs = mode === 'action' ? 0 : Date.now()

    // v25.6 fix: 必须使用显式 filterAreaOverride = 渲染器屏幕矩形 (0, 0, w, h)。
    // 原因：computeCanvasWorldFilterArea 在编辑器 pan/zoom 后会产出负坐标 filterArea
    // （如 (-647, 0, 3182, 663)），但 PIXI v7 FilterSystem 内部会将 sourceFrame
    // 裁剪到渲染器屏幕范围，导致 vTextureCoord 映射基准偏移，光圈视觉右移。
    // 使用 app.screen 始终覆盖可见区域 (0,0,w,h)，与 ScenePlayer 的策略一致。
    const pixi = pixiApp.app
    const screenArea = pixi
      ? new PIXI.Rectangle(0, 0, pixi.screen.width, pixi.screen.height)
      : undefined

    applyLightingFilter(
      objects,
      filterHost,
      canvasW,
      canvasH,
      lightingFilterCache,
      screenArea,
      (id) => sceneGraph.getContainer(id),
      timeMs,
      pixi?.renderer as PIXI.Renderer | undefined,
    )
  }

  // v7.15: 播放状态（用于控制动画播放）
  let isPlaying = false

  // v25.4: 视口 pan/zoom 变化时重新计算光照滤镜位置
  // aggregateLightingFilter 使用 toGlobal 获取屏幕坐标，视口变换后坐标改变
  pixiApp.onViewportTransformChanged(() => {
    const objects = sceneObjectStore.objects
    if (objects.length > 0) {
      aggregateLightingFilter(objects)
    }
  })

  // Phase 2: Flicker ticker — 当存在闪烁光源时，每帧刷新光照滤镜
  let flickerTickerRegistered = false
  const flickerTickerCallback = (): void => {
    const objects = sceneObjectStore.objects
    if (objects.length > 0) {
      aggregateLightingFilter(objects)
    }
  }

  /**
   * 检查当前场景是否需要 flicker ticker，按需注册/注销
   */
  function syncFlickerTicker(objects: readonly SceneObject[]): void {
    if (mode === 'action') {
      if (flickerTickerRegistered && pixiApp.app) {
        pixiApp.app.ticker.remove(flickerTickerCallback)
        flickerTickerRegistered = false
      }
      return
    }

    const hasFlicker = objects.some(
      o => o.type === 'light'
        && (o as SceneObject & { spawned?: boolean }).spawned !== false
        && isPointLikeLight(o as LightObject)
        && ((o as LightObject).flicker ?? 0) > 0 && o.visible
    )
    const app = pixiApp.app
    if (!app) return

    if (hasFlicker && !flickerTickerRegistered) {
      app.ticker.add(flickerTickerCallback)
      flickerTickerRegistered = true
    } else if (!hasFlicker && flickerTickerRegistered) {
      app.ticker.remove(flickerTickerCallback)
      flickerTickerRegistered = false
    }
  }

  // Transform Origin 手柄拖拽守卫：手柄 pointerdown 时设置，
  // 阻止同帧 setupObjectInteraction 的 pointerdown 触发对象拖拽
  let suppressNextObjectDrag = false

  // P2: Composite 双击解锁 — 跟踪上次选中目标和时间
  let lastSelectTargetId: string | null = null
  let lastSelectTime = 0
  const DOUBLE_CLICK_THRESHOLD = 300 // ms

  /**
   * Transform Origin 反向补偿：从 container.position 反推对象逻辑中心坐标
   *
   * 当 transformOriginX/Y 不是默认值时，container.position 包含补偿量，
   * 需要减去补偿才能得到真正的 obj.x/y（几何中心坐标）。
   */
  /**
   * v19: 获取 Transform Origin 补偿偏移量
   * containerPosition = dataModelPos + offset
   * 提取自 applyTransformOriginPivot 的相同公式
   *
   * @returns { cx, cy } 正向偏移量
   */
  function getTransformOriginOffset(objectId: string): { cx: number; cy: number } {
    const obj = sceneObjectStore.getObject(objectId)
    const originX = obj?.transformOriginX ?? 0
    const originY = obj?.transformOriginY ?? 0

    // v21: applySlotState 已将 transformOriginX/Y 同步到 runtimeObjects，
    // Action Mode 下 getObject() 返回的是 runtimeObjects，直接读取即可。

    // 像素偏移方案：直接返回 originX/Y 作为补偿量
    return { cx: originX, cy: originY }
  }

  function getEvaluatedObjectState(objectId: string): SceneObject | undefined {
    const slotState = sceneGraph.getGhostStates()?.objects.get(objectId)?.real
    return slotState ?? sceneObjectStore.getObject(objectId)
  }

  function getEvaluatedGlobalPosition(objectId: string): { x: number; y: number } | undefined {
    const state = getEvaluatedObjectState(objectId)
    if (!state) return undefined

    const getObjState = (id: string): WriteableState | undefined => {
      const obj = getEvaluatedObjectState(id)
      return obj ? (obj as unknown as WriteableState) : undefined
    }
    const global = localToGlobal(state as unknown as WriteableState, getObjState)
    return { x: global.x, y: global.y }
  }

  /**
   * v19: 获取对象沿父链累积的有效翻转状态
   * 遍历 parentId 链，XOR 所有祖先 + 自身的 flipX
   * 用于交互系统判断缩放/旋转方向和光标方向
   */
  function getEffectiveFlipX(objectId: string): boolean {
    let flipped = false
    let currentId: string | undefined = objectId
    while (currentId) {
      const obj = sceneObjectStore.getObject(currentId)
      if (!obj) break
      if (obj.flipX) flipped = !flipped
      currentId = obj.parentId
    }
    return flipped
  }

  let groupingPendingIds: string[] = []

  function ensureBlankCanvasInteractionLayer(contentRoot: PIXI.Container): void {
    if (blankCanvasInteractionLayer?.destroyed) {
      blankCanvasInteractionLayer = null
    }

    if (!blankCanvasInteractionLayer) {
      const interactionLayer = new PIXI.Container()
      interactionLayer.name = 'blank_canvas_interaction_layer'
      interactionLayer.zIndex = -10000
      interactionLayer.eventMode = 'static'
      interactionLayer.hitArea = new PIXI.Rectangle(
        0,
        0,
        options.canvasWidth ?? CANVAS_WIDTH,
        options.canvasHeight ?? CANVAS_HEIGHT,
      )
      interactionLayer.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation()

        if (event.button !== 0) return
        if (pixiApp.isSpacePressed || pixiApp.isPanning) return

        sceneObjectStore.selectObject(null)
      })
      blankCanvasInteractionLayer = interactionLayer
    }

    if (blankCanvasInteractionLayer.parent !== contentRoot) {
      contentRoot.addChild(blankCanvasInteractionLayer)
    }
  }

  const scenePicker = useScenePicking({
    store: sceneObjectStore,
    getContainer: (objectId) => sceneGraph.getContainer(objectId),
    isPassThrough: (objectId) => sceneGraph.isPassThrough(objectId),
  })

  function ensureScenePickingInteractionLayer(ctx: import('./usePixiApp').PixiAppContext): void {
    if (scenePickingInteractionLayer?.destroyed) {
      scenePickingInteractionLayer = null
    }

    if (!scenePickingInteractionLayer) {
      const layer = new PIXI.Container()
      layer.name = 'scene_picking_interaction_layer'
      layer.zIndex = 99999
      layer.eventMode = 'static'
      layer.cursor = 'default'
      layer.on('pointerdown', handleScenePickingPointerDown)
      layer.on('pointermove', handleScenePickingPointerMove)
      scenePickingInteractionLayer = layer
    }

    scenePickingInteractionLayer.hitArea = new PIXI.Rectangle(
      0,
      0,
      options.canvasWidth ?? CANVAS_WIDTH,
      options.canvasHeight ?? CANVAS_HEIGHT,
    )

    if (scenePickingInteractionLayer.parent !== ctx.viewportLayer) {
      if (scenePickingInteractionLayer.parent) {
        scenePickingInteractionLayer.parent.removeChild(scenePickingInteractionLayer)
      }
      ctx.viewportLayer.addChild(scenePickingInteractionLayer)
    }
  }

  function handleScenePickingPointerDown(event: PIXI.FederatedPointerEvent): void {
    event.stopPropagation()

    if (event.button !== 0) return
    if (pixiApp.isSpacePressed || pixiApp.isPanning) return
    if (suppressNextObjectDrag) return

    const pickResult = scenePicker.pickAt(event.global)

    if (!pickResult.selectTargetId) {
      sceneObjectStore.selectObject(null)
      return
    }

    let selectTargetId = pickResult.selectTargetId
    sceneObjectStore.selectObject(selectTargetId)

    // P2: 双击检测 — 解锁 composite。拾取层保留 rawHitId，
    // 因此锁定 composite 双击后可切回实际命中的子对象。
    const now = Date.now()
    const isDoubleClick = (now - lastSelectTime < DOUBLE_CLICK_THRESHOLD) && lastSelectTargetId === selectTargetId
    lastSelectTime = now
    lastSelectTargetId = selectTargetId

    if (isDoubleClick) {
      const targetObj = sceneObjectStore.getObject(selectTargetId)
      if (targetObj?.type === 'composite') {
        const comp = targetObj as import('@/types/sceneObject').CompositeObject
        if (comp.compositeLocked) {
          if (mode === 'action') {
            sceneObjectStore.updateSetupObject(selectTargetId, { compositeLocked: false } as Partial<SceneObject>)
          } else {
            sceneObjectStore.updateObject(selectTargetId, { compositeLocked: false } as Partial<SceneObject>)
          }
          if (pickResult.rawHitId && pickResult.rawHitId !== selectTargetId) {
            selectTargetId = pickResult.rawHitId
            sceneObjectStore.selectObject(selectTargetId)
          }
        }
      }
    }

    if (lockObjectInteraction) return

    const dragTargetId = selectTargetId
    const obj = sceneObjectStore.getObject(dragTargetId)
    if (!obj) return

    // 环境光仅支持选中，不参与拖拽
    if (obj.type === 'light' && (obj as import('@/types/sceneObject').LightObject).lightType === 'ambient') {
      return
    }

    // v21: Action mode 下，camera_follow 禁止拖动，其他情况允许
    if (mode === 'action' && obj.type === 'camera' && currentSelectedActionType === 'camera_follow') {
      return
    }

    const dragContainer = sceneGraph.getContainer(dragTargetId)
    if (dragContainer) {
      interaction?.startDrag(dragTargetId, event, dragContainer)
    }
  }

  function handleScenePickingPointerMove(event: PIXI.FederatedPointerEvent): void {
    if (!scenePickingInteractionLayer) return
    if (pixiApp.isSpacePressed || pixiApp.isPanning) {
      scenePickingInteractionLayer.cursor = 'grab'
      return
    }

    const pickResult = scenePicker.pickAt(event.global)
    scenePickingInteractionLayer.cursor = pickResult.selectTargetId ? 'pointer' : 'default'
  }

  // ========== 3. Initialization Flow ==========

  async function initRenderer() {
    // 3.1 Initialize PixiJS Application
    const ctx = await pixiApp.initApp()
    if (!ctx) {
      console.error('[SceneRenderer] PixiJS initialization failed')
      return
    }

    // 3.2 Initialize Interaction System
    const interactionCallbacks: InteractionCallbacks = {
      onDragMove: handleDragMove,
      onDragEnd: handleDragEnd,
      onResizeMove: handleResizeMove,
      onResizeEnd: handleResizeEnd,
      onRotateMove: handleRotateMove,
      onRotateEnd: handleRotateEnd,
      onSelect: (objectId) => sceneObjectStore.selectObject(objectId),
      getObject: (objectId) => sceneObjectStore.getObject(objectId),
      getContainer: (objectId) => sceneGraph.getContainer(objectId),
      getCharacterEffectiveScale: (_objectId) => undefined,
      // v20: 统一的数据模型位置获取（Setup 和 Action Mode 共用）
      // Setup Mode: 直接从 store 读取
      // Action Mode: 优先从 ghost states（action 评估后的状态）读取
      getEvaluatedPosition: (objectId) => {
        // v21: applySlotState 已同步 x/y/zoom 到 runtimeObjects，
        // Setup 和 Action Mode 统一从 store 读取。
        const obj = sceneObjectStore.getObject(objectId)
        return obj ? { x: obj.x, y: obj.y } : undefined
      },
      getEvaluatedGlobalPosition,
      // v20: 统一的数据模型变换获取（Setup 和 Action Mode 共用）
      getEvaluatedTransform: (objectId) => {
        // v21: applySlotState 已同步 scaleX/scaleY/rotation 到 runtimeObjects，
        // Setup 和 Action Mode 统一从 store 读取。
        const obj = sceneObjectStore.getObject(objectId)
        if (!obj) return undefined
        // 相机使用固定变换值
        if (obj.type === 'camera') return { scaleX: 1, scaleY: 1, rotation: 0 }
        return { scaleX: obj.scaleX, scaleY: obj.scaleY, rotation: obj.rotation }
      },
      // v19: Transform Origin → container.position 的补偿量
      getPositionCompensation: (objectId) => getTransformOriginOffset(objectId),
      // v19: 沿父链累积的有效翻转状态
      getEffectiveFlipX: (objectId) => getEffectiveFlipX(objectId),
    }

    interaction = useInteraction({
      stage: ctx.viewportLayer,
      canvasElement: ctx.canvasElement,
      callbacks: interactionCallbacks
    })

    ensureScenePickingInteractionLayer(ctx)

    // Bindglobal events
    interaction.bindGlobalEvents()

    // v11.0: Start Ticker for Animation System
    // This drives CharacterSprite.update and GenericAnimationPlayer.update in Setup Mode
    pixiApp.app!.ticker.add(updateAnimations)

    // 缩放/平移变化时自动刷新选择框
    // selectionContainer 与 stage 平级（不受 zoom 影响），需手动重绘
    watch(pixiApp.transformParams, () => {
      updateSelectionBox()
    })
  }

  // 手动帧动画推进累积器（替代 PIXI Ticker 自动更新）
  // 与 ScenePlayer/FrameCapture 共享同一套 spriteAnimationDriver 逻辑
  const spriteAnimTimeAccumulator = new WeakMap<PIXI.AnimatedSprite, number>()

  // Animation Update Loop
  function updateAnimations() {
    // Only run if not destroyed
    if (!pixiApp.app?.renderer) return

    // v8.8: Use internal ticker.deltaMS (calculated from ticker.userData) or standard delta
    // PixiJS v7 ticker.deltaMS is usually reliable
    const deltaTime = pixiApp.app.ticker.deltaMS

    // Iterate all cached objects
    const cachedIds = sceneGraph.getCachedIds()
    for (const id of cachedIds) {
      // Update GenericAnimationPlayer (Prop/Background)
      const propPlayer = sceneGraph.getGenericAnimationPlayer(id)
      if (propPlayer) {
        propPlayer.update(deltaTime)
      }
    }

    // 手动推进所有 AnimatedSprite 帧索引
    // 替代 PIXI Ticker 自动更新，确保 transform track 和 frame sequence 同步推进
    for (const id of cachedIds) {
      const container = sceneGraph.getContainer(id)
      if (container?.visible) {
        advanceAnimatedSprites(container, deltaTime, spriteAnimTimeAccumulator)
      }
    }

    // v20: union 子对象在容器内（真实 PIXI 父子关系），动画变换自动传播，无需 propagateUnionAnimations

    // Clip-Mask Phase 1：在 PIXI ticker 自动 render 之前计算并应用所有蒙版关系
    // ticker 中用户 callback 默认 priority=NORMAL，会在 priority=LOW 的自动 render 之前调用。
    const stage = pixiApp.app.stage
    if (stage) {
      // 根 stage 的 parent 为 null，直接调用 updateTransform 会在 PIXI v7 内部
      // 访问 this.parent.transform 时抛 NPE。手动递归刷新子树即可。
      for (const child of stage.children) {
        child.updateTransform()
      }
      applyAllMasks(
        sceneObjectStore.objects,
        (id) => sceneGraph.getContainer(id),
        maskRendererResources,
      )
    }
  }

  function applySlotStateSilently(
    slotStates: import('@/utils/sceneStateCalculator').SlotStatesResult,
    excludeIds?: Set<string>
  ): void {
    suppressObjectWatchRenderCount += 1
    try {
      sceneObjectStore.applySlotState?.(slotStates, excludeIds)
    } finally {
      queueMicrotask(() => {
        suppressObjectWatchRenderCount = Math.max(0, suppressObjectWatchRenderCount - 1)
      })
    }
  }



  // ========== 4. Interaction Callback Handlers ==========

  /**
   * v20: 从 store 同步局部渲染
   * 写入 runtimeObjects 后立即更新对应的 PIXI 容器，跳过 Vue watch 异步延迟。
   * 用于交互期间（拖拽/缩放/旋转）的即时视觉反馈。
   */
  function syncContainerFromStore(objectId: string): void {
    const obj = sceneObjectStore.getObject(objectId)
    const container = sceneGraph.getContainer(objectId)
    if (!obj || !container || container.destroyed) return

    // 委托 applyObjectState 统一处理变换（位置、缩放、旋转、pivot、visibility）
    editorRenderer.applyObjectState(container, obj, obj, editorObjectStateHost)

    // v20: union 子对象在容器内，变换自动传播，无需 applyUnionProxyChain

    // 缓存 base transform（动画系统需要）
    const player = sceneGraph.getGenericAnimationPlayer(objectId)
    if (player) player.cacheBaseTransform()
  }


  function handleDragMove(objectId: string, newX: number, newY: number, _deltaX: number, _deltaY: number) {
    const obj = sceneObjectStore.getObject(objectId)
    if (!obj) return

    // v20: unified data-driven drag for both modes
    sceneObjectStore.updateObject(objectId, { x: newX, y: newY })
    syncContainerFromStore(objectId)

    // v20: union 子对象在容器内，拖拽自动传播，无需 propagateUnionDragToChildren
    updateSelectionBox()
  }



  async function handleDragEnd(
    objectId: string,
    finalX: number,
    finalY: number,
    startX: number,
    startY: number,
    globalPosition?: { x: number; y: number }
  ) {
    if (mode === 'action' && onActionUpdate) {
      const obj = sceneObjectStore.getObject(objectId)
      if (!obj) {
        interactionLockedObjects.delete(objectId)
        return
      }

      const distance = Math.sqrt(Math.pow(finalX - startX, 2) + Math.pow(finalY - startY, 2))

      if (distance < 5) {
        // Distance too short, don't create action
        // v19: 不直接调用 applyContainerPosition 恢复位置。
        // 对于 union composite 子对象，container.position 处于 stage 空间
        // （经 applyUnionProxyChain 展平），而 startX/Y 是 parent-local 坐标。
        // 直接写入 parent-local 坐标会破坏 proxy chain 建立的正确位置。
        // 通过 updateActionModeObjects 重新评估，确保所有对象（含 union 子对象）
        // 经过完整的 applyObjectState + applyUnionProxyChain 管线获得正确位置。
        interactionLockedObjects.delete(objectId)
        void updateActionModeObjects()
        return
      }

      let speed: 'auto' | 'instant' | 'slow' | 'fast' = 'auto'
      if (distance < 50) speed = 'instant'
      else if (distance < 200) speed = 'slow'
      else speed = 'fast'
      const target = obj.type === 'camera' ? 'camera' : obj.id
      try {
        const moveParams: ActionUpdatePayload['params'] = { x: finalX, y: finalY, speed }
        if (globalPosition) {
          moveParams.globalX = globalPosition.x
          moveParams.globalY = globalPosition.y
        }
        await onActionUpdate({
          type: 'move',
          target,
          params: moveParams
        })
      } finally {
        interactionLockedObjects.delete(objectId)
        void renderObjects()
      }
    } else {
      interactionLockedObjects.delete(objectId)
    }
    // Setup Mode: 通知拖拽完成（仅在实际发生移动时）
    // 注意：finalX/Y 来自 container.position（含 Math.round 舍入和 Transform Origin 补偿），
    // 与 startX/Y（来自 obj.x/obj.y 逻辑坐标）处于不同坐标空间。
    // 必须使用 store 中对象当前 obj.x/obj.y（与 startX/Y 同空间）进行比较。
    if (mode === 'setup' && onSetupChange) {
      const obj = sceneObjectStore.getObject(objectId)
      if (obj) {
        const distance = Math.sqrt(Math.pow(obj.x - startX, 2) + Math.pow(obj.y - startY, 2))
        if (distance >= 5) {
          onSetupChange({ type: 'transform', objectId })
        }
      }
    }
  }

  function handleResizeMove(objectId: string, newScaleX: number, newScaleY: number, newX: number, newY: number) {
    const obj = sceneObjectStore.getObject(objectId)
    if (!obj) return

    // v20: unified data-driven resize for both modes
    resizeStartState ??= { scaleX: obj.scaleX, scaleY: obj.scaleY, width: obj.width, height: obj.height }

    if (obj.type === 'camera') {
      // camera: resize = zoom change
      // 拖动期间使用连续值（仅 clamp），避免 0.1 步长离散化造成阶梯感
      // 舍入到 0.1 步长在 handleResizeEnd 中执行
      const newZoom = 1 / newScaleX
      const continuousZoom = Math.max(0.1, Math.min(10, newZoom))
      sceneObjectStore.updateObject(objectId, {
        zoom: continuousZoom,
        width: CAMERA_BASE_WIDTH / continuousZoom,
        height: CAMERA_BASE_HEIGHT / continuousZoom
      } as Partial<SceneObject> & Record<string, unknown>)
    } else if (mode === 'setup' && obj.type === 'mask' && resizeStartState) {
      const baseScaleX = resizeStartState.scaleX ?? 1
      const baseScaleY = resizeStartState.scaleY ?? 1
      const baseWidth = resizeStartState.width ?? obj.width ?? 200
      const baseHeight = resizeStartState.height ?? obj.height ?? 200
      const nextWidth = Math.max(1, Math.round(baseWidth * Math.abs(newScaleX / baseScaleX)))
      const nextHeight = Math.max(1, Math.round(baseHeight * Math.abs(newScaleY / baseScaleY)))
      sceneObjectStore.updateObject(objectId, {
        width: nextWidth,
        height: nextHeight,
        scaleX: resizeStartState.scaleX,
        scaleY: resizeStartState.scaleY,
        x: newX,
        y: newY
      })
    } else {
      sceneObjectStore.updateObject(objectId, {
        scaleX: newScaleX,
        scaleY: newScaleY,
        x: newX,
        y: newY
      })
    }
    syncContainerFromStore(objectId)

    // v20: union 子对象在容器内，缩放自动传播
    updateSelectionBox()
  }

  async function handleResizeEnd(objectId: string) {
    if (mode === 'action' && onActionUpdate && resizeStartState) {
      const obj = sceneObjectStore.getObject(objectId)
      if (!obj) {
        resizeStartState = null
        interactionLockedObjects.delete(objectId)
        return
      }

      const finalScaleX = obj.scaleX
      const finalScaleY = obj.scaleY

      // 相机的 scaleX/scaleY 始终为 1.0（zoom 是独立字段），
      // 不能用 scale 差值判断变化量，改用 zoom 差值
      if (obj.type === 'camera') {
        const camObj = obj as CameraObject
        const currentZoom = camObj.zoom ?? 1.0
        const startZoom = 1 / resizeStartState.scaleX // resizeStartState 记录的是交互系统的 scale
        const zoomChange = Math.abs(currentZoom - startZoom)
        if (zoomChange < 0.01) {
          // zoom 变化过小，恢复
          sceneObjectStore.updateObject(objectId, {
            zoom: startZoom,
            width: CAMERA_BASE_WIDTH / startZoom,
            height: CAMERA_BASE_HEIGHT / startZoom
          } as Partial<SceneObject> & Record<string, unknown>)
          syncContainerFromStore(objectId)
          resizeStartState = null
          interactionLockedObjects.delete(objectId)
          updateSelectionBox()
          return
        }
      } else {
        // 普通对象：检查 scale 变化量
        const scaleChange = Math.abs(finalScaleX - resizeStartState.scaleX) + Math.abs(finalScaleY - resizeStartState.scaleY)
        if (scaleChange < 0.01) {
          // too small, restore original via store
          sceneObjectStore.updateObject(objectId, {
            scaleX: resizeStartState.scaleX,
            scaleY: resizeStartState.scaleY
          })
          syncContainerFromStore(objectId)
          resizeStartState = null
          interactionLockedObjects.delete(objectId)
          updateSelectionBox()
          return
        }
      }

      const target = obj.type === 'camera' ? 'camera' : obj.id

      // 相机：释放时将 zoom 对齐到 0.1 步长（拖动期间使用连续值以保流畅）
      // 同时计算等效 scaleX = 1/zoom，供 handleCameraActionUpdate 反向还原 zoom
      if (obj.type === 'camera') {
        const camObj = obj as CameraObject
        const snappedZoom = Math.max(0.1, Math.min(10, Math.round(camObj.zoom * 10) / 10))
        sceneObjectStore.updateObject(objectId, {
          zoom: snappedZoom,
          width: CAMERA_BASE_WIDTH / snappedZoom,
          height: CAMERA_BASE_HEIGHT / snappedZoom
        } as Partial<SceneObject> & Record<string, unknown>)
        syncContainerFromStore(objectId)

        // 相机的 scaleX/scaleY 始终为 1.0，不能直接用 obj.scaleX
        // handleCameraActionUpdate 通过 zoom = 1 / scaleX 反推 zoom，
        // 所以此处传 scaleX = 1 / snappedZoom 使其正确还原
        const cameraEquivalentScale = 1 / snappedZoom
        try {
          await onActionUpdate({
            type: 'scale',
            target,
            params: {
              scaleX: cameraEquivalentScale,
              scaleY: cameraEquivalentScale
            }
          })
        } finally {
          resizeStartState = null
          interactionLockedObjects.delete(objectId)
          void renderObjects()
        }
      } else {
        try {
          await onActionUpdate({
            type: 'scale',
            target,
            params: {
              scaleX: finalScaleX,
              scaleY: finalScaleY,
              x: obj.x,
              y: obj.y
            }
          })
        } finally {
          resizeStartState = null
          interactionLockedObjects.delete(objectId)
          void renderObjects()
        }
      }
      return
    }
    resizeStartState = null
    interactionLockedObjects.delete(objectId)
    if (mode === 'setup' && onSetupChange) {
      onSetupChange({ type: 'transform', objectId })
    }
  }

  function handleRotateMove(objectId: string, newRotation: number) {
    const obj = sceneObjectStore.getObject(objectId)
    if (!obj) return

    // v20: unified data-driven rotate for both modes
    rotateStartState ??= { rotation: obj.rotation }

    sceneObjectStore.updateObject(objectId, { rotation: newRotation })
    syncContainerFromStore(objectId)

    // v20: union 子对象在容器内，旋转自动传播
    updateSelectionBox()
  }

  async function handleRotateEnd(objectId: string) {
    if (mode === 'action' && onActionUpdate && rotateStartState) {
      const obj = sceneObjectStore.getObject(objectId)
      if (!obj) {
        rotateStartState = null
        interactionLockedObjects.delete(objectId)
        return
      }

      const finalRotation = obj.rotation

      // check if change is significant
      const rotationChange = Math.abs(finalRotation - rotateStartState.rotation)
      if (rotationChange < 0.01) {
        // too small, restore original via store
        sceneObjectStore.updateObject(objectId, { rotation: rotateStartState.rotation })
        syncContainerFromStore(objectId)
        rotateStartState = null
        updateSelectionBox()
        return
      }

      const target = obj.type === 'camera' ? 'camera' : obj.id

      try {
        await onActionUpdate({
          type: 'rotate',
          target,
          params: {
            rotation: finalRotation
          }
        })
      } finally {
        rotateStartState = null
        interactionLockedObjects.delete(objectId)
        void renderObjects()
      }
      return
    }
    rotateStartState = null
    interactionLockedObjects.delete(objectId)
    if (mode === 'setup' && onSetupChange) {
      onSetupChange({ type: 'transform', objectId })
    }
  }

  // ========== 5. Render Loop ==========

  async function renderObjects() {
    const createDurationByType = new Map<string, number>()
    const mountDurationByType = new Map<string, number>()
    const interactionDurationByType = new Map<string, number>()
    const updateDurationByType = new Map<string, number>()
    const createCountByType = new Map<string, number>()
    const mountCountByType = new Map<string, number>()
    const interactionCountByType = new Map<string, number>()
    const updateCountByType = new Map<string, number>()
    const addTiming = (bucket: Map<string, number>, type: string, deltaMs: number) => {
      bucket.set(type, (bucket.get(type) ?? 0) + deltaMs)
    }
    const addCount = (bucket: Map<string, number>, type: string) => {
      bucket.set(type, (bucket.get(type) ?? 0) + 1)
    }
    const ctx = pixiApp.getContext()
    if (!ctx) {
      return
    }

    if (sceneGraph.getIsRendering()) {
      sceneGraph.setPendingRender(true)
      return
    }
    sceneGraph.setIsRendering(true)

    try {
      const objects = sceneObjectStore.getSortedObjects()
      let _createdContainerCount = 0
      let _recreatedContainerCount = 0
      const contentRoot = ctx.contentLayer ?? ctx.activeLayer ?? ctx.stage

      if (!contentRoot) {
        return
      }

      ensureBlankCanvasInteractionLayer(contentRoot)

      // v7.12: Log rendering in Setup Mode
      const logBuffer: string[] = []
      if (mode === 'setup') {
        logBuffer.push('[Setup Mode Rendering]')
      }

      // v2.0.0: 预渲染循环 — 先创建所有 composite 容器并缓存
      // 只创建和缓存，不 addChild。addChild 由主循环按 objects 数组顺序统一执行，
      // 确保 PIXI children 索引与数据模型顺序一致（相同 zIndex 时决定渲染覆盖关系）。
      for (const obj of objects) {
        if (obj.type !== 'composite') continue
        if (sceneGraph.getContainer(obj.id)) continue // 已有容器

        const createStart = performance.now()
        const newContainer = await sceneGraph.createObjectContainer(obj)
        addTiming(createDurationByType, obj.type, performance.now() - createStart)
        addCount(createCountByType, obj.type)
        if (newContainer) {
          _createdContainerCount++
          sceneGraph.setContainer(obj.id, newContainer)
          // 立即应用变换（设置 composite 的 position/scale/rotation）
          void sceneGraph.updateObjectContainer(newContainer, obj)
        }
      }

      // Iterate all objects
      for (const obj of objects) {
        // Audio objects are never rendered on canvas
        if (obj.type === 'audio') continue

        // Legacy BGM support (skip rendering)
        if ((obj as unknown as { type: string }).type === 'bgm') continue

        const container = sceneGraph.getContainer(obj.id)

        // v2.0.0: 确定此对象应挂载到哪个父容器
        // 有 parentId 的子对象挂载到 composite 容器，否则挂载到 targetLayer
        // 双层架构：parentId 已由 applySlotState() 写入 runtimeObjects，直接读取
        let parentContainer: PIXI.Container = contentRoot
        const effectiveParentId = obj.parentId
        if (effectiveParentId) {
          // v20: union/entity 统一挂载到 parentId 对应的容器
          const parentCompositeContainer = sceneGraph.getContainer(effectiveParentId)
          if (parentCompositeContainer) {
            parentContainer = parentCompositeContainer
          }
        }

        if (!container) {
          // v9.3: Setup 模式下，跳过 spawned=false 的对象（动态对象）
          if (mode === 'setup' && obj.type !== 'camera') {
            const spawned = (obj as unknown as { spawned?: boolean }).spawned
            if (spawned === false) {
              continue  // 跳过此对象的渲染
            }
          }

          const createStart = performance.now()
          const newContainer = await sceneGraph.createObjectContainer(obj)
          addTiming(createDurationByType, obj.type, performance.now() - createStart)
          addCount(createCountByType, obj.type)
          if (newContainer) {
            _createdContainerCount++
            sceneGraph.setContainer(obj.id, newContainer)
            const mountStart = performance.now()
            // 确保 parentContainer 未被销毁
            if (parentContainer && !parentContainer.destroyed) {
              parentContainer.addChild(newContainer)
            } else {
              contentRoot.addChild(newContainer)
            }

            addTiming(mountDurationByType, obj.type, performance.now() - mountStart)
            addCount(mountCountByType, obj.type)

            // Setup interaction
            const interactionStart = performance.now()
            setupObjectInteraction(newContainer, obj.id)
            addTiming(interactionDurationByType, obj.type, performance.now() - interactionStart)
            addCount(interactionCountByType, obj.type)
          }
        } else {
          // P2: 防御性检查 — 容器可能已被父级 composite 的 destroy({children:true}) 级联销毁
          if (container.destroyed) {
            sceneGraph.removeContainer(obj.id)
            // 重新创建容器
            const createStart = performance.now()
            const newContainer = await sceneGraph.createObjectContainer(obj)
            addTiming(createDurationByType, obj.type, performance.now() - createStart)
            addCount(createCountByType, obj.type)
            if (newContainer) {
              _recreatedContainerCount++
              sceneGraph.setContainer(obj.id, newContainer)
              const mountStart = performance.now()
              if (parentContainer && !parentContainer.destroyed) {
                parentContainer.addChild(newContainer)
              } else {
                contentRoot.addChild(newContainer)
              }
              addTiming(mountDurationByType, obj.type, performance.now() - mountStart)
              addCount(mountCountByType, obj.type)
              const interactionStart = performance.now()
              setupObjectInteraction(newContainer, obj.id)
              addTiming(interactionDurationByType, obj.type, performance.now() - interactionStart)
              addCount(interactionCountByType, obj.type)
              // 穿透列表：覆盖交互状态
              const ptEntry = sceneGraph.getPassThroughEntry(obj.id)
              if (ptEntry) {
                newContainer.eventMode = 'none'
                newContainer.interactiveChildren = false
              }
            }
            continue
          }

          // v9.3: Setup 模式下，已有容器的对象也需要检查 spawned
          if (mode === 'setup' && obj.type !== 'camera') {
            const spawned = (obj as unknown as { spawned?: boolean }).spawned
            if (spawned === false) {
              container.visible = false
              container.eventMode = 'none'
              container.interactiveChildren = false
              continue  // 跳过后续处理
            }
          }

          // v8.8: Action Mode 下跳过 updateObjectContainer
          // 因为它使用 calculateActionModeObjectState (Block 最终状态) 而非 Slot 累积状态
          // 状态统一由 updateActionModeObjects 处理
          if (mode !== 'action') {
            const updateStart = performance.now()
            void sceneGraph.updateObjectContainer(container, obj).finally(() => {
              addTiming(updateDurationByType, obj.type, performance.now() - updateStart)
              addCount(updateCountByType, obj.type)
            })

            // Setup Mode Logging
            if (mode === 'setup') {
              logBuffer.push(`Rendering ${obj.id} (${obj.type}): x=${obj.x.toFixed(1)}, y=${obj.y.toFixed(1)}, scale=${obj.scaleX.toFixed(2)}`)
            }
          }

          // 每次更新时也更新 hitArea（因为纹理可能刚加载完成）
          if (obj.type === 'camera' || obj.type === 'composite') {
            const bounds = container.getLocalBounds()
            if (bounds.width > 0 && bounds.height > 0) {
              container.hitArea = new PIXI.Rectangle(
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height
              )
            }
          }

          // Clip-Mask Phase 1：mask shape / width / height 可能变更，每帧同步 hitArea
          if (obj.type === 'mask') {
            const m = obj as import('@/types/sceneObject').MaskObject
            const w = m.width || 200
            const h = m.height || 200
            if (m.shape === 'ellipse') {
              container.hitArea = new PIXI.Ellipse(0, 0, w / 2, h / 2)
            } else {
              container.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h)
            }
          }

          // v2.0.0: 确保容器在正确的父级中
          // 预缓存的 composite 容器首次到达此处时 parent 为 null
          // 容器或父容器已销毁时跳过（删除 composite 级联销毁子容器）
          if (!container.destroyed && parentContainer && !parentContainer.destroyed && container.parent !== parentContainer) {
            const isFirstMount = !container.parent
            const mountStart = performance.now()
            if (container.parent) container.parent.removeChild(container)
            parentContainer.addChild(container)
            addTiming(mountDurationByType, obj.type, performance.now() - mountStart)
            addCount(mountCountByType, obj.type)
            // 首次挂载到场景时配置交互（预缓存的 composite 尚未设置）
            if (isFirstMount) {
              const interactionStart = performance.now()
              setupObjectInteraction(container, obj.id)
              addTiming(interactionDurationByType, obj.type, performance.now() - interactionStart)
              addCount(interactionCountByType, obj.type)
            }
          }
        }
      }

      // Remove deleted objects
      const objectIds = new Set(objects.map(obj => obj.id))
      const cachedIds = sceneGraph.getCachedIds()

      cachedIds.forEach(id => {
        if (!objectIds.has(id)) {
          sceneGraph.removeContainer(id)
        }
      })


      // v23: 为根级容器安装 renderChain 驱动的渲染逻辑
      // 渲染顺序完全由 sceneRenderChain + sortRenderChainByZIndex 决定，
      // 不再依赖 PIXI sortChildren() 或 setChildIndex
      installRootRenderChainRenderer(
        contentRoot,
        () => {
          const chain = sceneObjectStore.getSceneRenderChain()
          return sortRenderChainByZIndex(
            chain,
            (id) => sceneObjectStore.getObject(id)?.zIndex ?? 0
          )
        },
        (id) => sceneGraph.getContainer(id),
      )


      // v7.22: Action Mode 下，重新应用计算后的状态
      // 因为 updateObjectContainer 会从 Store (Setup 数据) 读取数据导致状态重置
      if (mode === 'action' && actionModeState) {
        // v21: 使用部分 apply — 排除正在交互的对象，其余正常同步
        // updateActionModeObjects 的 guardedInteractionIds 会跳过被锁定对象的渲染覆盖
        sceneGraph.updateSlotIndex(sceneGraph.getCurrentSlotIndex())
        const slotStates = sceneGraph.getGhostStates()
        if (slotStates) {
          const lockedIds = getInteractionLockedIds()
          applySlotStateSilently(slotStates, lockedIds.size > 0 ? lockedIds : undefined)
        }
        void updateActionModeObjects()
      }

      // v25: Setup Mode 光照聚合
      aggregateLightingFilter(objects)

      // P2: composite 子对象按 (zIndex, childIds) 手动排序
      // sortableChildren = false → PIXI 不再自动排序，完全由此函数控制
      sortCompositeContainers()

      updateSelectionBox()
    } finally {
      sceneGraph.setIsRendering(false)
      if (sceneGraph.getPendingRender()) {
        sceneGraph.setPendingRender(false)
        await renderObjects()
      }
    }
  }

  // ========== 6. Object Interaction Setup ==========

  /**
   * v6.6: 设置当前选中的动作类型
   * 用于限制 Action mode 下相机拖动：只有选中 camera_cut 或 camera_move 时才允许拖动
   */
  function setSelectedActionType(actionType: string | null) {
    currentSelectedActionType = actionType
  }

  async function preloadCurrentExpressionSpeakingFrames() {
    if (mode !== 'action') return

    const expressionStore = useExpressionStore()
    const { loadAssets } = useAssetLoader()
    const imageUrls = new Set<string>()

    for (const obj of sceneObjectStore.getSortedObjects()) {
      if (obj.type !== 'expression') continue
      if ((obj as SceneObject & { spawned?: boolean }).spawned === false) continue

      const expression = expressionStore.getExpression(obj.refId)
      expression?.speakingFrames?.forEach(frame => {
        if (frame?.url) imageUrls.add(frame.url)
      })
    }

    if (imageUrls.size === 0) return
    await loadAssets(imageUrls, new Set(), 'SceneRenderer.expression.speakingWarmup')
  }

  function setIsPlaying(playing: boolean) {
    isPlaying = playing
    if (playing) {
      void preloadCurrentExpressionSpeakingFrames().finally(() => {
        void updateActionModeObjects()
      })
      return
    }
    void updateActionModeObjects()
  }

  function setupObjectInteraction(container: PIXI.Container, objectId: string) {
    if (!interaction) return

    const obj = sceneObjectStore.getObject(objectId)

    // 锁定对象交互（PivotEditorPanel 独立画布）：不绑定 pointer 事件、不可拾取，
    // 变换点手柄仍可用（位于 selectionContainer，不受此影响）。
    if (lockObjectInteraction) {
      container.eventMode = 'static'
      container.cursor = 'pointer'
      container.interactiveChildren = false
      container.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation()
        if (event.button !== 0) return
        sceneObjectStore.selectObject(objectId)
        updateSelectionBox()
      })
      return
    }

    // 穿透模式对象：设置 none；正常对象：设置 static 和 cursor
    if (sceneGraph.isPassThrough(objectId)) {
      container.eventMode = 'none'
      container.interactiveChildren = false
    } else {
      container.eventMode = 'static'
      container.cursor = 'pointer'
    }

    // 为摄像机和组合对象设置 hitArea，确保透明区域内的整体边界也可点击。
    if (obj?.type === 'camera' || obj?.type === 'composite') {
      const bounds = container.getLocalBounds()
      if (bounds.width > 0 && bounds.height > 0) {
        container.hitArea = new PIXI.Rectangle(
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height
        )
      }
    }

    // Clip-Mask Phase 1：mask 容器自身无可见子节点，必须用 width/height 显式设定 hitArea
    // 否则点击矩形/椭圆区域内部都不会命中（PIXI 默认用 children bounds 做拾取）。
    if (obj?.type === 'mask') {
      const m = obj as import('@/types/sceneObject').MaskObject
      const w = m.width || 200
      const h = m.height || 200
      if (m.shape === 'ellipse') {
        container.hitArea = new PIXI.Ellipse(0, 0, w / 2, h / 2)
      } else {
        container.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h)
      }
    }

    // Setup pointer events
    container.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
      // 阻止事件冒泡：子对象的 pointerdown 不应传播到 composite 父容器
      // 否则 composite 的 pointerdown 会覆盖子对象的选中和拖拽
      event.stopPropagation()

      // 画布平移模式：Space 按下或正在平移时，跳过对象交互
      if (pixiApp.isSpacePressed || pixiApp.isPanning) return

      // Transform Origin 手柄拖拽守卫：手柄在同一帧已捕获事件，跳过对象拖拽
      if (suppressNextObjectDrag) return

      let selectTargetId = objectId
      const clickedObj = sceneObjectStore.getObject(objectId)
      // 双层架构：parentId 已由 applySlotState() 写入 runtimeObjects，直接读取
      const effectiveParentId = clickedObj?.parentId
      if (effectiveParentId) {
        let currentId: string | undefined = effectiveParentId
        while (currentId) {
          const ancestor = sceneObjectStore.getObject(currentId)
          if (ancestor?.type === 'composite') {
            const comp = ancestor as unknown as { compositeLocked?: boolean }
            if (comp.compositeLocked) {
              selectTargetId = ancestor.id  // 重定向到此锁定的祖先
            }
          }
          currentId = ancestor?.parentId
        }
      }
      sceneObjectStore.selectObject(selectTargetId)

      // P2: 双击检测 — 解锁 composite
      const now = Date.now()
      const isDoubleClick = (now - lastSelectTime < DOUBLE_CLICK_THRESHOLD) && lastSelectTargetId === selectTargetId
      lastSelectTime = now
      lastSelectTargetId = selectTargetId

      if (isDoubleClick) {
        const targetObj = sceneObjectStore.getObject(selectTargetId)
        if (targetObj?.type === 'composite') {
          const comp = targetObj as import('@/types/sceneObject').CompositeObject
          if (comp.compositeLocked) {
            // 解锁 composite
            if (mode === 'action') {
              sceneObjectStore.updateSetupObject(selectTargetId, { compositeLocked: false } as Partial<SceneObject>)
            } else {
              sceneObjectStore.updateObject(selectTargetId, { compositeLocked: false } as Partial<SceneObject>)
            }
            // 重新选中实际点击的子对象（如果点击的不是 composite 自身）
            if (selectTargetId !== objectId) {
              selectTargetId = objectId
              sceneObjectStore.selectObject(selectTargetId)
            }
          }
        }
      }

      // 环境光仅支持选中，不参与拖拽
      if (obj?.type === 'light' && (obj as import('@/types/sceneObject').LightObject).lightType === 'ambient') {
        return
      }

      // v21: Action mode 下，camera_follow 禁止拖动，其他情况允许
      if (mode === 'action' && obj?.type === 'camera') {
        if (currentSelectedActionType === 'camera_follow') {
          // camera_follow 独占模式，不允许拖动
          return
        }
      }

      // P2: compositeLocked 时拖拽目标改为 composite
      const dragTargetId = selectTargetId
      const dragContainer = dragTargetId === objectId ? container : sceneGraph.getContainer(dragTargetId)
      if (dragContainer) {
        interaction?.startDrag(dragTargetId, event, dragContainer)
      }
    })
  }

  /**
   * 更新相机的交互状态
   * 根据当前选中状态设置相机是否可拾取
   */
  function updateCameraInteractivity() {
    for (const obj of sceneObjectStore.objects) {
      if (obj.type === 'camera') {
        const container = sceneGraph.getContainer(obj.id)
        if (container) {
          // 穿透列表中的相机：保持 none，防止覆写 pass-through 状态
          if (sceneGraph.isPassThrough(obj.id)) {
            container.eventMode = 'none'
            container.interactiveChildren = false
          } else {
            container.eventMode = 'static'
            container.cursor = 'pointer'
          }
        }
      }
    }
  }

  // ========== 7. Selection Box ==========

  function updateSelectionBox() {
    const ctx = pixiApp.getContext()
    if (!ctx?.selectionContainer) return

    // 更新相机的交互状态（根据选中状态决定是否可拾取）
    updateCameraInteractivity()

    // 清除现有选择框
    ctx.selectionContainer.removeChildren()

    // P2: 组合模式高亮 — 为待成组对象绘制淡蓝色半透明背景
    if (groupingPendingIds.length > 0) {
      for (const pendingId of groupingPendingIds) {
        const pendingContainer = sceneGraph.getContainer(pendingId)
        if (!pendingContainer) continue

        const pendingBounds = pendingContainer.getBounds()
        if (pendingBounds.width <= 0 || pendingBounds.height <= 0) continue

        const highlight = new PIXI.Graphics()
        highlight.name = `grouping_highlight_${pendingId}`

        // 淡蓝色半透明填充 + 蓝色虚线边框
        highlight.beginFill(0x4da6ff, 0.2)
        highlight.lineStyle(2, 0x2196f3, 0.8)
        const pad = 4
        highlight.drawRoundedRect(
          pendingBounds.x - pad,
          pendingBounds.y - pad,
          pendingBounds.width + pad * 2,
          pendingBounds.height + pad * 2,
          6
        )
        highlight.endFill()

        ctx.selectionContainer.addChild(highlight)
      }
    }

    const drawDashedSegment = (graphics: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, dash = 8, gap = 4) => {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      if (len <= 0) return
      const ux = dx / len
      const uy = dy / len
      let traveled = 0
      while (traveled < len) {
        const dStart = traveled
        const dEnd = Math.min(traveled + dash, len)
        graphics.moveTo(x1 + ux * dStart, y1 + uy * dStart)
        graphics.lineTo(x1 + ux * dEnd, y1 + uy * dEnd)
        traveled = dEnd + gap
      }
    }

    const drawMaskOutline = (
      graphics: PIXI.Graphics,
      maskObj: import('@/types/sceneObject').MaskObject,
      maskContainer: PIXI.Container,
      alpha = 1,
    ) => {
      const w = maskObj.width || 1
      const h = maskObj.height || 1
      graphics.lineStyle(2, 0xffd400, alpha)

      if (maskObj.shape === 'ellipse') {
        const points: PIXI.Point[] = []
        const steps = 72
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2
          points.push(maskContainer.toGlobal(new PIXI.Point(Math.cos(a) * w / 2, Math.sin(a) * h / 2)))
        }
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i]!
          const p2 = points[i + 1]!
          drawDashedSegment(graphics, p1.x, p1.y, p2.x, p2.y)
        }
        return
      }

      const lT = maskContainer.toGlobal(new PIXI.Point(-w / 2, -h / 2))
      const rT = maskContainer.toGlobal(new PIXI.Point(w / 2, -h / 2))
      const rB = maskContainer.toGlobal(new PIXI.Point(w / 2, h / 2))
      const lB = maskContainer.toGlobal(new PIXI.Point(-w / 2, h / 2))
      drawDashedSegment(graphics, lT.x, lT.y, rT.x, rT.y)
      drawDashedSegment(graphics, rT.x, rT.y, rB.x, rB.y)
      drawDashedSegment(graphics, rB.x, rB.y, lB.x, lB.y)
      drawDashedSegment(graphics, lB.x, lB.y, lT.x, lT.y)
    }

    const selectedId = sceneObjectStore.selectedObjectId

    // Clip-Mask Phase 1：编辑器路径长期显示所有未选中 mask 的黄色虚线辅助边框。
    // 这里画在 selectionContainer 上，不写入对象容器，因此不会进入 ScenePlayer / FrameCapture。
    for (const sceneObj of sceneObjectStore.objects) {
      if (sceneObj.type !== 'mask') continue
      if (sceneObj.id === selectedId) continue
      if (sceneObj.visible === false || sceneObj.spawned === false) continue
      const maskContainer = sceneGraph.getContainer(sceneObj.id)
      if (!maskContainer || maskContainer.destroyed) continue
      const outline = new PIXI.Graphics()
      outline.name = `mask_outline_${sceneObj.id}`
      drawMaskOutline(outline, sceneObj as import('@/types/sceneObject').MaskObject, maskContainer, 0.9)
      ctx.selectionContainer.addChild(outline)
    }

    if (!selectedId) return

    const container = sceneGraph.getContainer(selectedId)
    if (!container || container.destroyed || !container.position) return

    const obj = sceneObjectStore.getObject(selectedId)
    if (!obj) return
    const isLight = obj.type === 'light'
    const isMask = obj.type === 'mask'

    // 创建主选择框 Graphics
    const box = new PIXI.Graphics()
    box.name = 'selection_box'

    // v19: union composite 容器为空（子对象挂在上级容器），需要合并子对象边界
    const isUnionComposite = obj.type === 'composite'
      && (obj as import('@/types/sceneObject').CompositeObject).compositeMode === 'union'

    // 统一计算 localBounds（union 使用子对象合并边界）
    let localBounds: PIXI.Rectangle

    if (isUnionComposite) {
      // 遍历子对象的 OBB 角点，转换到 union 容器的本地坐标系
      // 避免使用 getBounds()（全局 AABB，旋转后会膨胀导致选择框不准确）
      const comp = obj as import('@/types/sceneObject').CompositeObject
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const childId of comp.childIds) {
        const childContainer = sceneGraph.getContainer(childId)
        if (!childContainer || childContainer.destroyed) continue
        let childLocal: PIXI.Rectangle
        try {
          childLocal = childContainer.getLocalBounds()
        } catch {
          continue // 纹理已释放的 Sprite，跳过
        }
        if (childLocal.width <= 0 || childLocal.height <= 0) continue
        // 子对象的 4 个 OBB 角点：本地 → 全局 → union 本地
        const corners = [
          new PIXI.Point(childLocal.x, childLocal.y),
          new PIXI.Point(childLocal.x + childLocal.width, childLocal.y),
          new PIXI.Point(childLocal.x + childLocal.width, childLocal.y + childLocal.height),
          new PIXI.Point(childLocal.x, childLocal.y + childLocal.height),
        ]
        for (const corner of corners) {
          const global = childContainer.toGlobal(corner)
          const local = container.toLocal(global)
          minX = Math.min(minX, local.x)
          minY = Math.min(minY, local.y)
          maxX = Math.max(maxX, local.x)
          maxY = Math.max(maxY, local.y)
        }
      }
      if (!isFinite(minX)) return
      localBounds = new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY)
    } else if (obj.type === 'light') {
      // 光源使用放大的固定选择框，提升拾取后的可操作性
      localBounds = new PIXI.Rectangle(-96, -96, 192, 192)
    } else if (obj.type === 'mask') {
      // Clip-Mask Phase 1：mask 容器自身无可见子对象，使用 mask.width × mask.height 作为本地包围盒
      const w = (obj as unknown as { width: number }).width || 1
      const h = (obj as unknown as { height: number }).height || 1
      localBounds = new PIXI.Rectangle(-w / 2, -h / 2, w, h)
    } else {
      try {
        localBounds = container.getLocalBounds()
      } catch {
        // 防御：容器内包含纹理已释放的 Sprite 时 getLocalBounds() 会崩溃
        return
      }
    }

    // 获取四个角落的全局坐标 (OBB)
    const lT = container.toGlobal(new PIXI.Point(localBounds.x, localBounds.y))
    const rT = container.toGlobal(new PIXI.Point(localBounds.x + localBounds.width, localBounds.y))
    const rB = container.toGlobal(new PIXI.Point(localBounds.x + localBounds.width, localBounds.y + localBounds.height))
    const lB = container.toGlobal(new PIXI.Point(localBounds.x, localBounds.y + localBounds.height))

    // 获取边缘中心点的全局坐标
    const topMid = new PIXI.Point((lT.x + rT.x) / 2, (lT.y + rT.y) / 2)
    const rightMid = new PIXI.Point((rT.x + rB.x) / 2, (rT.y + rB.y) / 2)
    const bottomMid = new PIXI.Point((lB.x + rB.x) / 2, (lB.y + rB.y) / 2)
    const leftMid = new PIXI.Point((lT.x + lB.x) / 2, (lT.y + lB.y) / 2)

    // 绘制 OBB 选择框边框
    if (isMask) {
      // Clip-Mask Phase 1：黄色虚线 OBB
      drawMaskOutline(box, obj as import('@/types/sceneObject').MaskObject, container, 1)
    } else {
      box.lineStyle(2, 0x00aaff, 1)
      box.moveTo(lT.x, lT.y)
      box.lineTo(rT.x, rT.y)
      box.lineTo(rB.x, rB.y)
      box.lineTo(lB.x, lB.y)
      box.closePath()
    }

    ctx.selectionContainer.addChild(box)

    if (isLight) {
      return
    }

    // 创建缩放手柄（8 个方向）
    const handleSize = 12
    const edgeHandleSize = 8
    // 动态计算光标方向 (利用 CSS cursor 的旋转特性)
    // 根据 container.rotation 找到最接近的标准方位 (n, ne, e, se, s, sw, w, nw)
    const baseCursors = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
    // 解决极端的负角度 rotation 问题
    const rotationDeg = ((container.rotation * 180 / Math.PI) % 360 + 360) % 360
    // 每个方位占 45 度，n 对应 0 度或 360 度
    const indexOffset = Math.round(rotationDeg / 45) % 8

    const isFlippedX = getEffectiveFlipX(selectedId)

    function getRotatedCursor(baseIndex: number): string {
      let calcIndex = baseIndex
      // 如果发生水平翻转，则根据 y轴 镜像反转 8 个方位游标 (n与s不变，e <-> w, ne <-> nw, se <-> sw)
      if (isFlippedX) {
        calcIndex = (8 - calcIndex) % 8
      }
      const idx = (calcIndex + indexOffset) % 8
      return `${baseCursors[idx]}-resize`
    }

    const handles = [
      { name: 'top-left', x: lT.x, y: lT.y, cursor: getRotatedCursor(7) },   // nw
      { name: 'top', x: topMid.x, y: topMid.y, edge: true, cursor: getRotatedCursor(0) }, // n
      { name: 'top-right', x: rT.x, y: rT.y, cursor: getRotatedCursor(1) },  // ne
      { name: 'right', x: rightMid.x, y: rightMid.y, edge: true, cursor: getRotatedCursor(2) }, // e
      { name: 'bottom-right', x: rB.x, y: rB.y, cursor: getRotatedCursor(3) }, // se
      { name: 'bottom', x: bottomMid.x, y: bottomMid.y, edge: true, cursor: getRotatedCursor(4) }, // s
      { name: 'bottom-left', x: lB.x, y: lB.y, cursor: getRotatedCursor(5) }, // sw
      { name: 'left', x: leftMid.x, y: leftMid.y, edge: true, cursor: getRotatedCursor(6) } // w
    ]

    handles.forEach(h => {
      const handle = new PIXI.Graphics()
      handle.name = `resize_handle_${h.name}`

      // 绘制手柄（白色填充 + 蓝色边框）
      handle.beginFill(0xffffff)
      handle.lineStyle(2, 0x00aaff)

      if (h.edge) {
        handle.drawRect(-edgeHandleSize / 2, -edgeHandleSize / 2, edgeHandleSize, edgeHandleSize)
      } else {
        handle.drawRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize)
      }
      handle.endFill()

      // 设置位置
      handle.position.set(h.x, h.y)

      // 设置交互属性
      handle.eventMode = 'static'
      // 让边缘手柄视觉上跟随对象旋转，但不要覆盖其全局坐标
      handle.rotation = container.rotation
      handle.cursor = h.cursor

      // 绑定事件
      handle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation()

        // v21: Action mode 下，camera_follow 禁止缩放，其他情况允许
        if (mode === 'action' && obj.type === 'camera') {
          if (currentSelectedActionType === 'camera_follow') {
            return
          }
        }

        if (interaction) {
          interaction.startResize(
            selectedId,
            h.name,
            event,
            // 传递对象真正的基础宽高 (未受当前缩放影响的 localWidth)
            { width: localBounds.width, height: localBounds.height }
          )
        }
      })

      ctx.selectionContainer.addChild(handle)
    })

    // 判断是否为相机对象
    const isCamera = obj.type === 'camera'

    // 相机：渲染中心点标记
    if (isCamera) {
      const centerX = (lT.x + rB.x) / 2
      const centerY = (lT.y + rB.y) / 2
      const crossSize = 12

      const centerMark = new PIXI.Graphics()
      centerMark.name = 'camera_center'

      // 绘制十字准星
      centerMark.lineStyle(2, 0xff6600, 1)
      centerMark.moveTo(centerX - crossSize, centerY)
      centerMark.lineTo(centerX + crossSize, centerY)
      centerMark.moveTo(centerX, centerY - crossSize)
      centerMark.lineTo(centerX, centerY + crossSize)

      // 绘制中心圆点
      centerMark.beginFill(0xff6600)
      centerMark.drawCircle(centerX, centerY, 4)
      centerMark.endFill()

      ctx.selectionContainer.addChild(centerMark)
    }

    // 非相机对象：创建旋转手柄（基于对象实际旋转方向上方）
    if (!isCamera && !isLight) {
      const rotateHandleOffset = 30
      const rotateHandleRadius = 8

      // 法线向量：bottomMid 指向 topMid
      const dirX = topMid.x - bottomMid.x
      const dirY = topMid.y - bottomMid.y
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      const nX = dirX / len
      const nY = dirY / len

      const rotateHandleX = topMid.x + nX * rotateHandleOffset
      const rotateHandleY = topMid.y + nY * rotateHandleOffset

      // 绘制连接线
      const rotateLine = new PIXI.Graphics()
      rotateLine.name = 'rotate_line'
      rotateLine.lineStyle(2, 0x00aaff, 0.5)
      rotateLine.moveTo(topMid.x, topMid.y)
      rotateLine.lineTo(rotateHandleX, rotateHandleY)
      ctx.selectionContainer.addChild(rotateLine)

      // 创建旋转手柄
      const rotateHandle = new PIXI.Graphics()
      rotateHandle.name = 'rotate_handle'
      rotateHandle.beginFill(0x00aaff)
      rotateHandle.lineStyle(2, 0xffffff)
      rotateHandle.drawCircle(0, 0, rotateHandleRadius)
      rotateHandle.endFill()
      rotateHandle.position.set(rotateHandleX, rotateHandleY)
      rotateHandle.eventMode = 'static'
      rotateHandle.cursor = 'grab'

      rotateHandle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation()
        if (interaction) {
          // 使用 transform origin 作为旋转中心（非容器 position）
          // 直接读取渲染管线已设好的 container.pivot（含 PivotBase + originX/Y 偏移）
          const originGlobalPt = container.toGlobal(new PIXI.Point(container.pivot.x, container.pivot.y))
          interaction.startRotate(selectedId, event, container, new PIXI.Point(originGlobalPt.x, originGlobalPt.y))
        }
      })

      ctx.selectionContainer.addChild(rotateHandle)
    }

    // ===== Transform Origin 拖拽手柄（非相机对象） =====
    if (!isCamera && !isLight) {
      // 读取当前 transformOrigin 值
      // v21: applySlotState 已同步 transformOriginX/Y 到 runtimeObjects，无需额外读取 slotStates
      const currentOriginX = obj.transformOriginX ?? 0
      const currentOriginY = obj.transformOriginY ?? 0

      // 计算手柄在 OBB 中的全局位置
      // 直接读取渲染管线已设好的 container.pivot（含 PivotBase + originX/Y 偏移）
      const originGlobal = container.toGlobal(new PIXI.Point(container.pivot.x, container.pivot.y))

      // 十字准星 + 圆环（含透明填充点击区域）
      const originHandle = new PIXI.Graphics()
      originHandle.name = 'transform_origin_handle'
      const crossSize = 10
      const circleRadius = 6
      const hitRadius = 14  // 点击区域半径（大于可见元素）

      // v26: readonlyOriginHandle 用于动画工作台主画布——
      // 变换点编辑已迁移到 PivotEditorPanel，主画布上仅作只读 gizmo。
      const handleColor = readonlyOriginHandle ? 0x888888 : 0xFF6600

      // 1. 透明填充圆 — 扩大点击区域（只读时保留视觉，但不响应事件）
      originHandle.beginFill(handleColor, 0.01)
      originHandle.drawCircle(0, 0, hitRadius)
      originHandle.endFill()

      // 2. 可见的十字准星
      originHandle.lineStyle(2, handleColor, 1)
      originHandle.moveTo(-crossSize, 0)
      originHandle.lineTo(crossSize, 0)
      originHandle.moveTo(0, -crossSize)
      originHandle.lineTo(0, crossSize)

      // 3. 可见的圆环
      originHandle.lineStyle(2, handleColor, 1)
      originHandle.drawCircle(0, 0, circleRadius)

      originHandle.position.set(originGlobal.x, originGlobal.y)
      originHandle.eventMode = readonlyOriginHandle ? 'none' : 'static'
      originHandle.cursor = readonlyOriginHandle ? 'default' : 'crosshair'

      if (readonlyOriginHandle) {
        // 只读模式：不绑定拖拽逻辑，仅展示当前 pivot 位置
        ctx.selectionContainer.addChild(originHandle)
        return
      }

      // 拖拽状态
      let isDraggingOrigin = false

      originHandle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation()
        // 设置守卫：阻止同帧对象容器的 pointerdown 启动拖拽
        suppressNextObjectDrag = true
        queueMicrotask(() => { suppressNextObjectDrag = false })
        isDraggingOrigin = true
        originHandle.cursor = 'grabbing'

        // 使用 DOM 级别事件追踪拖拽（与 useInteraction 的 resize/rotate 手柄一致）
        const onWindowMove = (e: PointerEvent) => {
          if (!isDraggingOrigin) return
          // DOM 坐标 → PIXI stage 坐标
          const rect = ctx.canvasElement.getBoundingClientRect()
          const globalX = e.clientX - rect.left
          const globalY = e.clientY - rect.top
          const stagePos = ctx.app.stage.toLocal({ x: globalX, y: globalY })
          originHandle.position.set(stagePos.x, stagePos.y)
        }

        const onWindowUp = () => {
          if (!isDraggingOrigin) return
          isDraggingOrigin = false
          originHandle.cursor = 'crosshair'

          // 手柄 stage 位置 → 对象局部坐标 → 像素偏移
          // 渲染管线设置的 pivot = PivotBase + originXY
          // 拖拽后的新 pivot 位置 = localPt（在容器本地坐标系中）
          // 新 originXY = localPt - PivotBase = localPt - (pivot - currentOriginXY)
          const handleGlobal = new PIXI.Point(originHandle.position.x, originHandle.position.y)
          const localPt = container.toLocal(handleGlobal)
          const pivotBaseX = container.pivot.x - currentOriginX
          const pivotBaseY = container.pivot.y - currentOriginY
          const newOriginX = localPt.x - pivotBaseX
          const newOriginY = localPt.y - pivotBaseY

          // v26: setup 与 action 的语义分离
          // - setup: 修改变换点即修改该时刻的静态摆放，需要同步写入位置补偿
          // - action: 修改变换点只影响后续旋转/缩放，不把补偿固化进 action 数据
          const currentObj = mode === 'action'
            ? (sceneObjectStore.getObject(selectedId) ?? obj)
            : obj

          // 提交变换原点 + 位置补偿
          if (mode === 'setup') {
            // ===== 位置补偿：(R(θ)×S - I) × Δoffset =====
            // 与 Adobe Animate 行为一致：移动变换点时，同步调整 x/y 以保持视觉不变。
            let adjustX = 0
            let adjustY = 0
            let needsCompensation = false
            {
              const rotation = currentObj.rotation ?? 0
              const flipSign = (currentObj.flipX ?? false) ? -1 : 1
              const effectiveSx = (currentObj.scaleX ?? 1) * flipSign
              const sy = currentObj.scaleY ?? 1
              const deltaOffsetX = newOriginX - currentOriginX
              const deltaOffsetY = newOriginY - currentOriginY
              const cos = Math.cos(rotation)
              const sin = Math.sin(rotation)
              adjustX = deltaOffsetX * (effectiveSx * cos - flipSign) - deltaOffsetY * sy * sin
              adjustY = deltaOffsetX * effectiveSx * sin + deltaOffsetY * (sy * cos - 1)
              needsCompensation = Math.abs(adjustX) > 0.01 || Math.abs(adjustY) > 0.01
            }

            // Setup Mode: 直接更新 Store（使用 storeOverride 时更新的是隔离 store，
            // 因此 PivotEditorPanel 的面板会立即反映新位置，手柄不会再跳回旧值）。
            const updates: Record<string, number> = {
              transformOriginX: newOriginX,
              transformOriginY: newOriginY
            }
            if (needsCompensation) {
              updates['x'] = (currentObj.x ?? 0) + adjustX
              updates['y'] = (currentObj.y ?? 0) + adjustY
            }
            sceneObjectStore.updateObject(selectedId, updates)
            // v21: 同步 PIXI 容器的 pivot 和 position 补偿
            // 否则 container.pivot 仍为旧值，导致旋转/缩放围绕错误的基准点
            syncContainerFromStore(selectedId)
            if (onSetupChange) {
              onSetupChange({
                type: 'origin',
                objectId: selectedId,
                pivot: { x: localPt.x, y: localPt.y },
              })
            }
          } else if (mode === 'action' && onActionUpdate) {
            // Action Mode: 通过回调提交
            // 仅记录新的变换点。视觉保持逻辑由 SetTransformHandler 在运行时瞬时补偿，
            // 避免把基于当前姿态算出的 x/y 烘焙到 action 数据里。
            void onActionUpdate({
              type: 'set_origin',
              target: selectedId,
              params: {
                transformOriginX: newOriginX,
                transformOriginY: newOriginY,
              }
            })
          }

          // 清理 DOM 事件
          window.removeEventListener('pointermove', onWindowMove)
          window.removeEventListener('pointerup', onWindowUp)

          // 刷新选择框
          updateSelectionBox()
        }

        window.addEventListener('pointermove', onWindowMove)
        window.addEventListener('pointerup', onWindowUp)
      })

      ctx.selectionContainer.addChild(originHandle)
    }
  }

  function clearSelectionBox() {
    const ctx = pixiApp.getContext()
    if (!ctx?.selectionContainer) return
    ctx.selectionContainer.removeChildren()
  }

  // ========== 8. Action Mode Time Control ==========
  // v8.6 P1: Legacy 时间控制函数已废弃，统一使用 Slot 驱动

  /** @deprecated v8.6 P1: 使用 updateSceneStateBySlot 替代 */
  function setActionTime(_time: number) {
    // No-op: Legacy time-based control removed
    void updateActionModeObjects()
  }

  /** @deprecated v8.6 P1: 无需设置持续时间 */
  function setActionDuration(_duration: number) {
    // No-op: Legacy time-based control removed
  }

  // v8.6 P0: setActions 已废弃，Actions 从 sceneGraph.getCurrentActions() 读取
  // 保留函数以保持 API 兼容性，但内部不再存储
  function setActions(_actions: Action[]) {
    // No-op: Actions are now read from sceneGraph.getCurrentActions()
    // This function is kept for API compatibility during migration
  }

  function setActionContext(context: SceneSetup) {
    actionModeState = context
  }

  /**
   * v20: 手动排序所有 composite 容器的子对象
   * sortableChildren = false 后 PIXI 不再自动排序。
   * entity: 按 renderChain + 运行时 zIndex 排序（含 union 展开子对象）
   * union (根级): 从场景级 renderChain 提取子对象相对顺序
   * union (entity 内): 由父 entity 的 renderByRenderChain 跨容器调度，无需独立排序
   */
  function sortCompositeContainers(): void {
    const objects = sceneObjectStore.getSortedObjects()

    // v21: zIndex 和 renderChain 已由 applySlotState 同步到 runtimeObjects，
    // 直接从 store 读取，不再需要 slotStates。
    const zIndexGetter = (id: string): number => {
      return sceneObjectStore.getObject(id)?.zIndex ?? 0
    }

    for (const obj of objects) {
      if (obj.type !== 'composite') continue
      const comp = obj as import('@/types/sceneObject').CompositeObject
      const compositeContainer = sceneGraph.getContainer(obj.id)
      if (!compositeContainer) continue

      const compositeMode = comp.compositeMode ?? 'entity'

      if (compositeMode === 'entity') {
        // v21: renderChain 已由 applySlotState 同步到 runtimeObjects，直接读取
        const renderChain = comp.renderChain
        if (renderChain && renderChain.length > 0) {
          // v22: 按运行时 zIndex 排序（与 renderPipeline.ts sortCompositeContainers 一致）
          // 确保 set_visual 修改的 zIndex 反映到实际渲染顺序中
          const sortedChain = sortRenderChainByZIndex(renderChain, zIndexGetter)
          const containerMap = new Map<string, import('pixi.js').Container>()
          for (const id of sortedChain) {
            const c = sceneGraph.getContainer(id)
            if (c) containerMap.set(id, c)
          }
          installRenderChainRenderer(compositeContainer, sortedChain, containerMap)
        }
      }
      // union composite（根级或 entity 内）：
      // 渲染顺序由父级容器（stage 或 entity）的 renderByRenderChain 统一调度，无需单独处理
    }
  }

  /**
   * v8.8: 统一的 Action Mode 对象渲染函数
   * 合并了原来的 updateActionModeObjects 和 renderGhostObjects
   * 
   * 职责：
   * 1. 应用 Real 状态到所有对象容器（包含角色表情、姿态等）
   * 2. 创建 Ghost 容器（如果需要）
   */
  async function updateActionModeObjects() {
    if (mode !== 'action' || !actionModeState) return

    const objects = sceneObjectStore.getSortedObjects()
    const ctx = pixiApp.getContext()
    const contentRoot = ctx?.contentLayer ?? ctx?.activeLayer
    if (!contentRoot) return

    // v6.3: Process Animation Triggers
    applyAnimationControl()

    // 交互守卫：跳过正在拖拽/缩放/旋转的对象，防止异步执行覆盖容器变换
    const activeInteractionId = interaction?.getActiveInteractionObjectId() ?? null
    const guardedInteractionIds = new Set<string>(interactionLockedObjects)
    if (activeInteractionId) guardedInteractionIds.add(activeInteractionId)
    // v8.8: 获取 Ghost 专用数据（仅用于 ghost 渲染和相机 ghost）
    const ghostData = sceneGraph.getGhostData()
    const slotIndex = sceneGraph.getCurrentSlotIndex()
    // v20: applySlotState 已移至 updateSlotIndex 调用侧显式执行
    // updateActionModeObjects 现在是纯渲染函数，不再写入 runtimeObjects
    // 这样 watch→renderObjects→updateActionModeObjects 路径不会用旧缓存覆盖交互中间值

    // P2: PIXI 容器 re-parenting — 同步 parentId 变化到 PIXI 层级
    // SetLifecycleHandler 可能清除/修改了评估状态的 parentId（如 union 模式 composite 消亡后子对象冒泡），
    // 必须将 PIXI 容器从旧的父容器移到新的父容器（或 activeLayer），否则会因 PIXI visibility 继承而被隐藏。
    // v19.2: 优先使用 runtimeObjects 中已由 applySlotState 同步的 parentId（运行时真正的归属）
    for (const obj of objects) {
      if (obj.type === 'camera' || obj.type === 'audio') continue
      const container = sceneGraph.getContainer(obj.id)
      if (!container || container.destroyed) continue

      // v21: parentId 已由 applySlotState 同步到 runtimeObjects，直接读取
      const effectiveParentId = obj.parentId ?? null

      let expectedParent: PIXI.Container = contentRoot
      if (effectiveParentId) {
        // v20: union/entity 统一挂载到 parentId 对应的容器
        const parentContainer = sceneGraph.getContainer(effectiveParentId)
        if (parentContainer && !parentContainer.destroyed) {
          expectedParent = parentContainer
        }
      }

      if (container.parent && container.parent !== expectedParent && !expectedParent.destroyed) {
        container.parent.removeChild(container)
        expectedParent.addChild(container)
      }
    }

    // 清除旧的 Ghost 容器
    sceneGraph.clearGhostContainers()

    // v21: slotIndex === -1 表示尚未初始化，使用 Fallback 逻辑
    if (slotIndex === -1) {
      // Fallback: 使用传统方式
      for (const obj of objects) {
        const container = sceneGraph.getContainer(obj.id)
        if (!container || container.destroyed) continue

        // 交互守卫：跳过正在交互的对象
        if (guardedInteractionIds.has(obj.id)) continue

        // Override 模式优先
        if (overrideObjectStates?.has(obj.id)) {
          await applyEditorObjectState(container, overrideObjectStates.get(obj.id)!, obj)
          continue
        }

        // Fallback: 使用 actionModeState 中的原始对象
        const setupObj = actionModeState?.objects?.find(o => o.id === obj.id)
        if (!setupObj) continue
        await applyEditorObjectState(container, setupObj, obj)
        // v20: union 子对象在容器内，变换自动传播，无需 applyUnionProxyChain
      }
      sortCompositeContainers()
      updateSelectionBox()
      return
    }

    // v8.8: 统一渲染流程
    for (const obj of objects) {
      const container = sceneGraph.getContainer(obj.id)
      if (!container) continue

      // 防御：跳过已被销毁的 PIXI 容器（position 为 null 表明已 destroy）
      if (container.destroyed) continue

      // 跳过音频对象
      if (obj.type === 'audio') continue

      // 交互守卫：跳过正在拖拽/缩放/旋转的对象，
      // 防止异步 applyObjectState 覆盖 handleResizeMove/handleDragMove 设置的容器变换
      // v20: 扩展到 union composite 的子对象，因为子对象平铺在上层容器中，
      //      由 propagateUnionDragToChildren / propagateUnionTransformToChildren 手动管理
      if (activeInteractionId) {
        if (guardedInteractionIds.has(obj.id)) continue
        // 检查是否是交互中 union composite 的子对象
        const interactingObj = activeInteractionId ? sceneObjectStore.getObject(activeInteractionId) : null
        if (interactingObj?.type === 'composite') {
          const interactingComp = interactingObj as import('@/types/sceneObject').CompositeObject
          if (interactingComp.compositeMode === 'union' && interactingComp.childIds.includes(obj.id)) {
            continue
          }
        }
      }

      // Override 模式优先
      if (overrideObjectStates?.has(obj.id)) {
        await applyEditorObjectState(container, overrideObjectStates.get(obj.id)!, obj)
        continue
      }

      // 相机 override
      if (obj.type === 'camera' && overrideObjectStates?.has('camera')) {
        await applyEditorObjectState(container, overrideObjectStates.get('camera')!, obj)
        continue
      }

      // === 处理相机 ===
      if (obj.type === 'camera') {
        // v21: 相机状态已由 applySlotState 同步到 runtimeObjects，直接从 obj 读取
        const camObj = obj as import('@/stores/sceneObjectStore').CameraObject
        const actionZoom = camObj.zoom || 1.0

        // Fix: 不使用容器缩放，而是根据 action zoom 重算相机尺寸
        const actionWidth = CAMERA_BASE_WIDTH / actionZoom
        const actionHeight = CAMERA_BASE_HEIGHT / actionZoom

        // 重绘 camera_border 以匹配 action zoom 下的尺寸
        const graphics = container.getChildByName('camera_border') as PIXI.Graphics | undefined
        if (graphics) {
          graphics.clear()
          graphics.lineStyle(20, 0x00ff00)
          graphics.beginFill(0x000000, 0.001)
          graphics.drawRect(0, 0, actionWidth, actionHeight)
          graphics.endFill()
        }

        // 更新 pivot 使其保持中心定位
        container.pivot.set(actionWidth / 2, actionHeight / 2)

        // 相机状态：直接内联赋值
        container.position.set(obj.x, obj.y)
        container.scale.set(1, 1)
        container.rotation = 0
        container.alpha = 1
        // 穿透列表：统一控制相机的可见性和交互
        const cameraPtEntry = sceneGraph.getPassThroughEntry(obj.id)
        if (cameraPtEntry) {
          container.visible = cameraPtEntry.visible
          container.eventMode = 'none'
          container.interactiveChildren = false
        } else {
          container.visible = true
          container.eventMode = 'static'
        }
        container.zIndex = Z_INDEX_CAMERA_OVERLAY

        // 相机 Ghost（从 ghost 专用缓存读取）
        const cameraGhost = ghostData?.camera
        if (cameraGhost) {
          const ghostCamContainer = sceneGraph.createGhostCameraContainer(
            cameraGhost,
            actionWidth,
            actionHeight
          )
          contentRoot.addChildAt(ghostCamContainer, 0)
        }
        continue
      }

      // === 处理普通对象 ===
      // v21: spawned/visible 等已由 applySlotState 同步到 runtimeObjects，直接从 obj 读取
      {
        const isAlive = obj.spawned !== false
        if (!isAlive) {
          // 对象已消亡：隐藏并禁用交互
          container.visible = false
          container.eventMode = 'none'
          container.interactiveChildren = false
          continue
        } else {
          // 对象活跃：检查穿透列表
          const ptEntry = sceneGraph.getPassThroughEntry(obj.id)
          if (ptEntry) {
            container.eventMode = 'none'
            container.interactiveChildren = false
          } else {
            container.eventMode = 'static'
            container.interactiveChildren = true
          }
        }
      }

      // v18: Expression refId 切换时纹理预加载 — 必须在 applyObjectState 之前完成，
      // 否则 applyExpressionState 会检测到 refId 变化并用空纹理重建 sprite
      if (obj.type === 'expression') {
        const currentRenderedRefId = (container as unknown as Record<string, string>)['_renderedRefId']
        if (currentRenderedRefId !== obj.refId) {
          const expressionStore = useExpressionStore()
          const expr = expressionStore.getExpression(obj.refId)
          if (expr) {
            const urls = new Set<string>()
            if (expr.defaultFrame?.url) urls.add(expr.defaultFrame.url)
            expr.speakingFrames?.forEach(frame => {
              if (frame?.url) urls.add(frame.url)
            })
            if (urls.size > 0) {
              const { loadAssets } = useAssetLoader()
              await loadAssets(urls, new Set(), `SceneRenderer.expression.update(${obj.id})`)
            }
          }
        }
      }

      // === Phase 4c: 统一委托给 applyObjectState ===
      // v21: runtimeObjects 已是 real 状态，直接使用 obj
      await applyEditorObjectState(container, obj, obj)

      // 穿透列表的 visible 覆盖 applyObjectState 设置的 visible
      const ptEntryAfterApply = sceneGraph.getPassThroughEntry(obj.id)
      if (ptEntryAfterApply) {
        container.visible = ptEntryAfterApply.visible
      }


      // v20: union 子对象在容器内，变换自动传播，无需 applyUnionProxyChain

      // v16: Symbol 素材切换检测 — Action Mode 下 updateObjectContainer 不被调用，
      // 因此需要在此检测 currentMaterialId 变化并重建容器内容
      if (obj.type === 'symbol') {
        const symbolObj = obj as unknown as SymbolObject
        const targetMaterialId = symbolObj.currentMaterialId ?? symbolObj.materials?.[0]?.id
        const renderedId =
          (container as unknown as Record<string, string>)['_renderedMaterialId']
          ?? (container as unknown as Record<string, string>)['_symbolMaterialId']
        if (renderedId !== targetMaterialId) {
          const material = targetMaterialId
            ? symbolObj.materials?.find(m => m.id === targetMaterialId)
            : symbolObj.materials?.[0]
          if (material) {
            await sceneGraph.preloadEditorSymbolMaterialTextures(material)
          }
          container.removeChildren()
          const newContainer = editorRenderer.createSymbolContainer(obj)
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
          ; (container as unknown as Record<string, string>)['_renderedMaterialId'] = targetMaterialId ?? ''
            ; (container as unknown as Record<string, string>)['_symbolMaterialId'] = targetMaterialId ?? ''
        }
      }

      // Editor 专有: GenericAnimationPlayer cache base transform
      const player = sceneGraph.getGenericAnimationPlayer(obj.id)
      if (player) player.cacheBaseTransform()

      // === 创建 Ghost 容器（如果需要）===
      // v21: Ghost 数据从专用缓存读取，不再从 slotStates.objects 读取
      const ghostState = ghostData?.objects.get(obj.id) ?? null
      if (ghostState) {
        // screen_effect 是全屏覆盖对象，ghost 价值低，且会放大羽化 sprite 的增删频率；
        // 跳过其 ghost 渲染以降低显示树抖动和 parent 竞态风险。
        if (obj.type === 'screen_effect') {
          continue
        }
        const ghostContainer = sceneGraph.createGhostContainer(container, obj.id)

        // 委托 applyObjectState 统一处理 Ghost 变换
        // 关键：createGhostContainer 从 real 容器克隆了 pivot，
        // 但 ghost 状态可能有不同的 transformOriginX/Y（action 之前的值）。
        // 通过 applyObjectState 重新计算 pivot 和位置补偿，确保 ghost
        // 使用自己的 transformOrigin 而非 real 容器的。
        await applyEditorObjectState(ghostContainer, ghostState, obj)

        // 覆盖 alpha 为半透明（applyObjectState 设置的是 ghostState.alpha）
        ghostContainer.alpha = (ghostState.alpha ?? 1) * 0.4

        // 添加到场景（在 Real 对象下方）
        contentRoot.addChildAt(ghostContainer, 0)
      }
    }

    // v25: 聚合光源对象，更新 LightingFilter
    aggregateLightingFilter(objects)
    // Phase 2: 按需启停 flicker ticker
    syncFlickerTicker(objects)

    // v23: Action Mode 的根级顺序已由 targetLayer 的 installRootRenderChainRenderer 负责
    // 但 entity composite 的内部 renderChain 仍需通过 sortCompositeContainers() 更新
    sortCompositeContainers()

    updateSelectionBox()
  }

  // ==================== v8.6 P1: 统一渲染管线 ====================
  /**
   * P1 统一渲染入口：Action Mode 分阶段渲染
   * 
   * 将渲染流程分解为 6 个明确阶段，每个阶段职责单一：
   * 1. 状态计算 (Evaluate)
   * 2. 资源同步 (Sync)
   * 3. Real 状态应用 (Apply)
   * 4. Ghost 容器更新 (Ghost)
   * 5. 相机更新 (Camera)
   * 6. 选择框更新 (Selection)
   * 
   * @param slotIndex 当前 Slot 索引
   */
  function renderActionModeFrame(slotIndex: number): void {
    if (mode !== 'action' || !actionModeState) return

    // ========== Phase 1: 状态计算 ==========
    // 更新 SceneGraph 的 slotIndex，触发 calculateSlotStates
    sceneGraph.updateSlotIndex(slotIndex)

    // v21: 渲染层已改为只读 runtimeObjects，必须在渲染前将评估结果写入 runtime。
    // 否则 updateActionModeObjects 读到的是旧 runtimeObjects，画面停在旧状态。
    const slotStates = sceneGraph.getGhostStates()
    if (slotStates) {
      applySlotStateSilently(slotStates)
    }

    // ========== Phase 2-5: 统一渲染 ==========
    // v8.8: 调用统一的渲染函数，它包含：
    // - Real 状态应用（包含角色表情、姿态等）
    // - Ghost 容器创建
    // - 选择框更新
    void updateActionModeObjects()
  }

  // Phase 4c: getStartStateFromContext 和 applyStateToContainer 已删除
  // 所有渲染统一通过 editorRenderer.applyObjectState 处理


  // ========== 8a. Ghost Mode Rendering (v8.0) ==========
  // NOTE: v8.8 - renderGhostObjects 已合并到 updateActionModeObjects 中
  // Ghost 容器的创建现在在 updateActionModeObjects 的统一渲染流程中完成


  // ========== 9. Coordinate Conversion ==========

  function canvasToWorld(canvasX: number, canvasY: number): { x: number; y: number } {
    const ctx = pixiApp.getContext()
    if (!ctx?.viewportLayer) return { x: canvasX, y: canvasY }

    return {
      x: (canvasX - ctx.viewportLayer.x) / ctx.viewportLayer.scale.x,
      y: (canvasY - ctx.viewportLayer.y) / ctx.viewportLayer.scale.y
    }
  }

  function worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
    const ctx = pixiApp.getContext()
    if (!ctx?.viewportLayer) return { x: worldX, y: worldY }

    return {
      x: worldX * ctx.viewportLayer.scale.x + ctx.viewportLayer.x,
      y: worldY * ctx.viewportLayer.scale.y + ctx.viewportLayer.y
    }
  }

  // ========== 10. Resize Handler ==========

  function handleResize(width: number, height: number) {
    const ctx = pixiApp.getContext()
    if (ctx?.app) {
      // 记录旧的 fitScale，用于等比调整 panOffset
      const oldFitScale = pixiApp.fitScale

      ctx.app.renderer.resize(width, height)
      pixiApp.updateTransformParams()

      const newFitScale = pixiApp.fitScale

      // fitScale 变化时（视口高度改变），等比调整 panOffset 保持视口中心对应的世界坐标不变
      if (oldFitScale > 0 && Math.abs(newFitScale - oldFitScale) > 0.0001) {
        const ratio = newFitScale / oldFitScale
        const viewportWidth = width
        const viewportHeight = height
        const oldPan = pixiApp.panOffset.value
        // 以视口中心为锚点等比缩放 panOffset
        pixiApp.setPanOffset(
          viewportWidth / 2 - (viewportWidth / 2 - oldPan.x) * ratio,
          viewportHeight / 2 - (viewportHeight / 2 - oldPan.y) * ratio,
        )
      } else {
        // fitScale 未变（仅宽度变化，如侧边栏折叠），只重新水平居中
        pixiApp.centerCanvasInViewport()
      }
    }
  }

  // ========== 11. Cleanup ==========

  function destroyRenderer() {
    // 防止重复销毁
    if (isDestroyed) {
      return
    }
    isDestroyed = true

    // Clip-Mask Phase 1：清理蒙版渲染资源（在 PIXI 容器销毁之前）
    disposeMaskRendererResources(maskRendererResources)

    if (interaction) {
      interaction.unbindGlobalEvents()
      interaction = null
    }

    if (blankCanvasInteractionLayer) {
      blankCanvasInteractionLayer.removeAllListeners()
      if (blankCanvasInteractionLayer.parent) {
        blankCanvasInteractionLayer.parent.removeChild(blankCanvasInteractionLayer)
      }
      blankCanvasInteractionLayer.destroy()
      blankCanvasInteractionLayer = null
    }

    if (scenePickingInteractionLayer) {
      scenePickingInteractionLayer.removeAllListeners()
      if (scenePickingInteractionLayer.parent) {
        scenePickingInteractionLayer.parent.removeChild(scenePickingInteractionLayer)
      }
      scenePickingInteractionLayer.destroy()
      scenePickingInteractionLayer = null
    }

    sceneGraph.clearAll()

    // Phase 2: 清理 flicker ticker
    if (flickerTickerRegistered && pixiApp.app) {
      pixiApp.app.ticker.remove(flickerTickerCallback)
      flickerTickerRegistered = false
    }

    pixiApp.destroyApp()

    if (lightingFilterCache.instance) {
      lightingFilterCache.instance.destroy()
      delete lightingFilterCache.instance
    }
    if (lightingFilterCache.maskRT) {
      lightingFilterCache.maskRT.destroy(true)
      delete lightingFilterCache.maskRT
    }
  }

  // ========== 11a. Animation Control Logic (v6.3) ==========

  function applyAnimationControl() {
    const objects = sceneObjectStore.getSortedObjects()

    for (const obj of objects) {
      if (obj.type === 'prop') {
        // v7.3: effect 已合并到 prop，仅保留道具动画控制
        const container = sceneGraph.getContainer(obj.id)
        if (!container) continue

        const spriteName = 'prop_animation'
        const animatedSprite = container.getChildByName(spriteName) as PIXI.AnimatedSprite | undefined
        if (!animatedSprite) continue

        // 1. 获取初始状态
        let currentCmd = 'play'
        const currentLoop = true
        const currentSpeed = 1.0

        // v11.0: animState 已移除，默认播放动画
        // v7.3: effect 类型已删除

        // 2. 应用 Actions
        // v8.6 P0/P1: Read from SceneGraph, use Slot 索引比较
        const propActions = sceneGraph.getCurrentActions()
        const currentSlotIdx = sceneGraph.getCurrentSlotIndex()
        const animActions = propActions.filter(
          a => a.type === 'set_anim' && a.target === obj.id
        ) as SetAnimAction[]

        let latestSlotIndex = -1

        for (const action of animActions) {
          if (action.slotIndex <= currentSlotIdx) {
            if (action.slotIndex > latestSlotIndex) {
              latestSlotIndex = action.slotIndex
              const params = action.params

              // v11.88: 从第一个动画项获取 action（如不存在则默认 play）
              const firstAnim = params.animations?.[0]
              if (firstAnim?.action) currentCmd = firstAnim.action
              // v11.88: speed 参数已移除
            }
          }
        }

        // 3. 执行控制
        if (!isPlaying && currentCmd === 'play') {
          currentCmd = 'stop'
        }

        // 获取 Base FPS
        let baseFps = 25
        // v7.3: 特效已合并到道具，仅保留道具逻辑
        if (obj.type === 'prop') {
          const propData = propStore.getProp(obj.refId)
          if (propData?.fps) baseFps = propData.fps
        }

        animatedSprite.loop = currentLoop
        animatedSprite.animationSpeed = currentSpeed * (baseFps / 60)

        if (currentCmd === 'play') {
          if (!animatedSprite.playing) animatedSprite.play()
        } else {
          if (animatedSprite.playing) animatedSprite.gotoAndStop(0)
        }
      }
    }
  }

  // ========== 12. Watcher Setup ==========

  watch(
      () => sceneObjectStore.objects,
      () => {
        if (!autoRenderEnabled) return
        if (suppressObjectWatchRenderCount > 0) {
          return
        }
        void renderObjects()
    },
    { deep: true }
  )

  watch(
    () => sceneObjectStore.selectedObjectId,
    () => {
      updateSelectionBox()
    }
  )


  // ========== 13. Additional APIs for Component Compatibility ==========

  function updateActionModeState(state: SceneSetup | RuntimeSceneSnapshot) {
    actionModeState = state
    void updateActionModeObjects()
  }

  /** @deprecated v8.6 P1: 使用 updateSceneStateBySlot 替代 */
  function updateTime(
    _time: number,
    _duration: number,
    _actions: Action[],
    context: SceneSetup | RuntimeSceneSnapshot,
    slots: RuntimeSlot[] = []
  ) {
    // v8.6 P1: Legacy 时间驱动已移除，转换为 Slot 驱动
    sceneGraph.setSlots(slots)
    actionModeState = context
    sceneGraph.updateSlotIndex(0) // 默认使用第一个 Slot
    void updateActionModeObjects()
  }

  // v7.17: New Slot-based Update Interface
  function updateSceneStateBySlot(
    slotIndex: number,
    _actions: Action[], // v8.6 P0: Deprecated, actions read from sceneGraph.getCurrentActions()
    context: SceneSetup | RuntimeSceneSnapshot,
    slots: RuntimeSlot[]
  ) {
    // v8.6 P0: Store slots in SceneGraph
    sceneGraph.setSlots(slots)
    sceneGraph.updateSlotIndex(slotIndex)
    // v20: applySlotState 在 slot 重算后显式同步到 runtimeObjects
    const slotStates = sceneGraph.getGhostStates()
    if (slotStates) {
      applySlotStateSilently(slotStates)
    }
    actionModeState = context
    void updateActionModeObjects()
  }

  // ========== 14. External Interface ==========

  function setOverrideObjectStates(states: Map<string, SceneObject> | null) {
    overrideObjectStates = states
    void updateActionModeObjects()
  }

  function setAutoRenderEnabled(enabled: boolean) {
    autoRenderEnabled = enabled
  }

  function hasInteractionLock(): boolean {
    return interactionLockedObjects.size > 0 || (interaction?.getActiveInteractionObjectId() ?? null) !== null
  }

  /**
   * v21: 获取当前所有被交互锁定的对象 ID 集合
   * 用于 applySlotState 的 excludeIds 参数，实现"部分 apply"。
   *
   * 包含 composite 的子树：当拖拽/缩放一个 composite 时，
   * 其所有 childIds 也必须排除，否则子对象会被 slot 评估覆盖，
   * 导致 parent 保持交互中间值而 children 被重置（mixed-state）。
   */
  function getInteractionLockedIds(): Set<string> {
    const ids = new Set<string>(interactionLockedObjects)
    const activeId = interaction?.getActiveInteractionObjectId() ?? null
    if (activeId) ids.add(activeId)

    // 展开 composite 子树
    if (ids.size > 0) {
      const expandCompositeChildren = (parentId: string) => {
        const obj = sceneObjectStore.getObject(parentId)
        if (obj?.type === 'composite') {
          const comp = obj as import('@/types/sceneObject').CompositeObject
          for (const childId of comp.childIds) {
            if (!ids.has(childId)) {
              ids.add(childId)
              // 递归：子对象可能也是 composite
              expandCompositeChildren(childId)
            }
          }
        }
      }
      // 遍历当前锁定 ID 的快照（避免迭代中修改 Set）
      for (const id of [...ids]) {
        expandCompositeChildren(id)
      }
    }

    return ids
  }

  // P2: 设置组合模式待选对象列表，触发高亮渲染
  function setGroupingPendingIds(ids: string[]) {
    groupingPendingIds = ids
    updateSelectionBox()
  }

  return {
    // Initialization
    initRenderer,
    destroyRenderer,

    // Rendering
    renderObjects,
    syncObjectFromStore: syncContainerFromStore,

    // Selection
    updateSelectionBox,
    clearSelectionBox,

    // Action Mode
    setActionTime,
    setActionDuration,
    setActions,
    setActionContext,
    updateActionModeObjects,
    updateActionModeState,
    updateTime,
    updateSceneStateBySlot, // v7.17: New Interface
    renderActionModeFrame, // v8.6 P1: 统一渲染管线入口
    setOverrideObjectStates, // v7.9: 设置覆盖状态 (Target Preview)
    setSelectedActionType, // v6.6: 设置选中的动作类型
    setIsPlaying, // v7.15: 设置播放状态
    setGroupingPendingIds, // P2: 设置组合模式待选对象高亮

    setAutoRenderEnabled,
    hasInteractionLock,
    getInteractionLockedIds,

    // Coordinate conversion
    canvasToWorld,
    worldToCanvas,

    // Resize
    handleResize,

    // Delegate to pixiApp for compatibility
    scrollToCanvasCenter: () => pixiApp.centerCanvasInViewport(),
    updateTransformParams: () => pixiApp.updateTransformParams(),
    resetView: () => pixiApp.resetView(),
    fitAll: () => pixiApp.fitAll(),
    fitContent: (bbox: { x: number; y: number; width: number; height: number }) => pixiApp.fitContent(bbox),
    zoomTo100: () => pixiApp.zoomTo100(),
    setZoomLevel: (zoom: number) => pixiApp.setZoomLevel(zoom),
    setPanOffset: (x: number, y: number) => pixiApp.setPanOffset(x, y),
    get userZoom() { return pixiApp.userZoom },
    get panOffset() { return pixiApp.panOffset },
    get transformParams() { return pixiApp.transformParams },
    get mousePosition() { return pixiApp.mousePosition },
    get canvasSize() { return pixiApp.canvasSize },

    // Sub-module access (for advanced usage)
    getPixiApp: () => pixiApp,
    getSceneGraph: () => sceneGraph,
    getInteraction: () => interaction,

    // Selection & store access (for PivotEditorPanel-style programmatic selection)
    selectObject: (id: string | null) => sceneObjectStore.selectObject(id),
    getStore: () => sceneObjectStore,
  }
}
