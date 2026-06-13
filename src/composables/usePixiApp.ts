/**
 * usePixiApp - PixiJS Application 基础设置模块
 * 
 * 职责：
 * 1. 管理 PixiJS Application 的生命周期（init/destroy）
 * 2. 处理画布尺寸和视口变换（缩放 + 平移）
 * 3. 管理基础图层结构（stage, viewportLayer, selectionContainer, activeLayer）
 */

import * as PIXI from 'pixi.js'
import { ref } from 'vue'

import { CANVAS_HEIGHT,CANVAS_WIDTH } from '@/constants/canvas'

export interface PixiAppOptions {
  canvasContainer: HTMLElement
  canvasWidth?: number
  canvasHeight?: number
  mode?: 'setup' | 'action'
  wheelZoomAnchor?: 'pointer' | 'viewport-center'
  /**
   * 禁用视口滚轮和平移交互：滚轮不再缩放/平移视口，中键与 Space+拖拽也不再平移。
   * 用于 PivotEditorPanel 这类固定视图面板，避免对象被滚动或中键拖拽带离可视区。
   */
  disableViewportPanZoom?: boolean
}

export interface PixiAppContext {
  app: PIXI.Application
  stage: PIXI.Container
  viewportLayer: PIXI.Container
  canvasElement: HTMLCanvasElement
  selectionContainer: PIXI.Container
  safeAreaOverlay: PIXI.Graphics
  activeLayer: PIXI.Container | null
  contentLayer: PIXI.Container | null
}

// ============================================================================
// 缩放常量
// ============================================================================

const MIN_ZOOM = 0.1    // 最小缩放倍率（相对于 fitScale）
const MAX_ZOOM = 8.0    // 最大缩放倍率
const ZOOM_STEP = 1.1   // 每次滚轮缩放步长
const PAN_SPEED = 1.0   // 滚轮平移速度倍率

export function usePixiApp(options: PixiAppOptions) {

  // 应用实例
  let app: PIXI.Application | null = null
  let stage: PIXI.Container | null = null
  let viewportLayer: PIXI.Container | null = null
  let canvasElement: HTMLCanvasElement | null = null
  let selectionContainer: PIXI.Container | null = null
  let safeAreaOverlay: PIXI.Graphics | null = null
  let activeLayer: PIXI.Container | null = null
  let contentLayer: PIXI.Container | null = null
  let lightingBoundsAnchor: PIXI.Graphics | null = null

  // v25.4: 视口变换变更回调（pan/zoom 时通知外部更新光照等）
  const viewportTransformCallbacks = new Set<() => void>()

  // 坐标转换参数
  const transformParams = ref({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  })

  // 画布尺寸
  const canvasSize = ref({
    width: options.canvasWidth ?? CANVAS_WIDTH,
    height: options.canvasHeight ?? CANVAS_HEIGHT
  })

  // 鼠标位置（画布坐标）
  const mousePosition = ref({ x: 0, y: 0 })

  // ========== 缩放与平移状态 ==========

  /** 基础适配比例（高度填满视口），由 updateTransformParams 计算 */
  let fitScale = 1

  /** 用户缩放因子（默认 1.0 = Fit Height） */
  const userZoom = ref(1.0)

  /** 用户平移偏移（屏幕像素） */
  const panOffset = ref({ x: 0, y: 0 })

  /** 当前是否处于平移拖拽中 */
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartOffsetX = 0
  let panStartOffsetY = 0

  /** Space 键按下状态（用于 Space+拖拽 平移） */
  let spacePressed = false

  /**
   * 初始化 PixiJS Application
   */
  async function initApp(): Promise<PixiAppContext | null> {
    if (app) {
      return getContext()
    }

    await Promise.resolve() // Ensure async behavior

    // 创建 PixiJS Application — renderer 大小为视口大小
    app = new PIXI.Application({
      width: options.canvasContainer.clientWidth,
      height: options.canvasContainer.clientHeight,
      backgroundColor: 0x1a1a1a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    })

    // 挂载到容器
    canvasElement = app.view as HTMLCanvasElement
    options.canvasContainer.appendChild(canvasElement)

    // 创建根舞台
    stage = new PIXI.Container()
    stage.sortableChildren = true
    stage.name = 'main_stage'
    app.stage.addChild(stage)

    // 创建视口层（承载缩放 + 平移）
    viewportLayer = new PIXI.Container()
    viewportLayer.sortableChildren = true
    viewportLayer.name = 'viewport_layer'
    stage.addChild(viewportLayer)

    // 创建选择框容器
    selectionContainer = new PIXI.Container()
    selectionContainer.zIndex = 9999
    selectionContainer.name = 'selection_container'
    app.stage.addChild(selectionContainer)

    // 创建安全区域遮罩
    safeAreaOverlay = new PIXI.Graphics()
    safeAreaOverlay.zIndex = 9998
    safeAreaOverlay.name = 'safe_area_overlay'
    app.stage.addChild(safeAreaOverlay)

    // v25.3: activeLayer 作为滤镜宿主层，contentLayer 承载实际场景对象
    activeLayer = new PIXI.Container()
    activeLayer.zIndex = 1
    activeLayer.sortableChildren = true
    activeLayer.name = 'active_layer'
    viewportLayer.addChild(activeLayer)

    // 让 activeLayer 的局部 bounds 固定覆盖整张画布，
    // 避免 LightingFilter 的输入空间退化成“当前可见对象包围盒”。
    lightingBoundsAnchor = new PIXI.Graphics()
    lightingBoundsAnchor.name = 'lighting_bounds_anchor'
    lightingBoundsAnchor.zIndex = -9999
    lightingBoundsAnchor.eventMode = 'none'
    // alpha=0 的图元不会稳定进入 getLocalBounds()，这里保留极低透明度，
    // 让 activeLayer 的 filter 输入空间固定覆盖整张画布。
    lightingBoundsAnchor.beginFill(0xffffff, 0.001)
    lightingBoundsAnchor.drawRect(0, 0, canvasSize.value.width, canvasSize.value.height)
    lightingBoundsAnchor.endFill()
    activeLayer.addChild(lightingBoundsAnchor)

    contentLayer = new PIXI.Container()
    contentLayer.zIndex = 0
    contentLayer.sortableChildren = true
    contentLayer.name = 'content_layer'
    activeLayer.addChild(contentLayer)

    // 计算坐标转换参数
    updateTransformParams()

    // 初始平移：将画布水平居中到视口
    centerCanvasInViewport()

    // 绑定基础事件
    bindEvents()

    return getContext()
  }

  /**
   * 获取应用上下文
   */
  function getContext(): PixiAppContext | null {
    if (!app || !stage || !viewportLayer || !canvasElement || !selectionContainer || !safeAreaOverlay) {
      return null
    }
    return {
      app,
      stage,
      viewportLayer,
      canvasElement,
      selectionContainer,
      safeAreaOverlay,
      activeLayer,
      contentLayer,
    }
  }

  // ========== 视口变换 ==========

  /**
   * 计算 effectiveScale 并应用到 viewportLayer
   */
  function applyTransform() {
    if (!viewportLayer || !app) return

    const effectiveScale = fitScale * userZoom.value

    viewportLayer.scale.set(effectiveScale, effectiveScale)
    viewportLayer.position.set(panOffset.value.x, panOffset.value.y)

    // 安全区域遮罩跟随 viewportLayer 变换
    if (safeAreaOverlay) {
      safeAreaOverlay.scale.set(effectiveScale, effectiveScale)
      safeAreaOverlay.position.set(panOffset.value.x, panOffset.value.y)
    }

    // 选择框容器保持在屏幕坐标系（toGlobal 返回屏幕坐标）
    // 不需要跟随 stage 变换，手柄大小自然保持屏幕像素恒定

    transformParams.value = {
      scale: effectiveScale,
      offsetX: panOffset.value.x,
      offsetY: panOffset.value.y
    }

    updateSafeAreaOverlay()

    // v25.4: 通知外部视口变换已更新（光照滤镜需要重新计算屏幕坐标）
    for (const cb of viewportTransformCallbacks) cb()
  }

  /**
   * 更新坐标转换参数（高度填满视口）
   */
  function updateTransformParams() {
    if (!options.canvasContainer || !app) return

    const viewportWidth = options.canvasContainer.clientWidth
    const viewportHeight = options.canvasContainer.clientHeight

    // 计算基础适配比例（高度填满）
    fitScale = viewportHeight / canvasSize.value.height

    // Renderer 大小 = 视口大小（不再随画布宽度缩放）
    app.renderer.resize(viewportWidth, viewportHeight)

    applyTransform()
  }

  /**
   * 将画布水平居中到视口
   */
  function centerCanvasInViewport() {
    if (!options.canvasContainer) return

    const viewportWidth = options.canvasContainer.clientWidth
    const effectiveScale = fitScale * userZoom.value
    const canvasPixelWidth = canvasSize.value.width * effectiveScale

    // 如果画布比视口宽，将画布中心对齐视口中心
    if (canvasPixelWidth > viewportWidth) {
      panOffset.value = {
        x: (viewportWidth - canvasPixelWidth) / 2,
        y: panOffset.value.y
      }
    } else {
      // 画布比视口窄，也居中
      panOffset.value = {
        x: (viewportWidth - canvasPixelWidth) / 2,
        y: panOffset.value.y
      }
    }

    applyTransform()
  }

  // ========== 缩放 ==========

  /**
   * 以指定屏幕坐标为锚点进行缩放
   * @param newZoom 新的 userZoom 值
   * @param anchorScreenX 锚点屏幕 X（相对于 canvas 元素）
   * @param anchorScreenY 锚点屏幕 Y（相对于 canvas 元素）
   */
  function zoomAtPoint(newZoom: number, anchorScreenX: number, anchorScreenY: number) {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
    const oldZoom = userZoom.value
    if (Math.abs(clampedZoom - oldZoom) < 0.001) return

    userZoom.value = clampedZoom

    // 锚点公式：保持鼠标指向的世界坐标不变
    const ratio = clampedZoom / oldZoom
    panOffset.value = {
      x: anchorScreenX - (anchorScreenX - panOffset.value.x) * ratio,
      y: anchorScreenY - (anchorScreenY - panOffset.value.y) * ratio,
    }

    applyTransform()
  }

  /**
   * 设置缩放级别（以视口中心为锚点）
   * 供工具栏 +/- 按钮和预设列表使用
   */
  function setZoomLevel(newZoom: number) {
    if (!options.canvasContainer) return
    const viewportWidth = options.canvasContainer.clientWidth
    const viewportHeight = options.canvasContainer.clientHeight
    zoomAtPoint(newZoom, viewportWidth / 2, viewportHeight / 2)
  }

  /**
   * 直接设置平移偏移（供滚动条组件调用）
   */
  function setPanOffset(x: number, y: number) {
    panOffset.value = { x, y }
    applyTransform()
  }

  /**
   * 重置视图为默认 Fit Height + 水平居中
   */
  function resetView() {
    userZoom.value = 1.0
    panOffset.value = { x: 0, y: 0 }
    updateTransformParams()
    centerCanvasInViewport()
  }

  /**
   * Fit All：缩放使整个画布在视口中完全可见
   */
  function fitAll() {
    if (!options.canvasContainer) return

    const viewportWidth = options.canvasContainer.clientWidth
    const viewportHeight = options.canvasContainer.clientHeight

    const scaleX = viewportWidth / canvasSize.value.width
    const scaleY = viewportHeight / canvasSize.value.height
    const targetFitScale = Math.min(scaleX, scaleY)

    // userZoom = targetFitScale / fitScale
    userZoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetFitScale / fitScale))

    // 居中
    const effectiveScale = fitScale * userZoom.value
    const canvasPixelWidth = canvasSize.value.width * effectiveScale
    const canvasPixelHeight = canvasSize.value.height * effectiveScale
    panOffset.value = {
      x: (viewportWidth - canvasPixelWidth) / 2,
      y: (viewportHeight - canvasPixelHeight) / 2,
    }

    applyTransform()
  }

  /**
   * Fit Content：缩放使给定包围盒在视口中完全可见（留 15% padding）
   * @param bbox 包围盒（世界坐标）
   */
  function fitContent(bbox: { x: number; y: number; width: number; height: number }) {
    if (!options.canvasContainer || bbox.width <= 0 || bbox.height <= 0) return

    const viewportWidth = options.canvasContainer.clientWidth
    const viewportHeight = options.canvasContainer.clientHeight
    const padding = 0.85 // 留 15% padding

    const scaleX = (viewportWidth * padding) / bbox.width
    const scaleY = (viewportHeight * padding) / bbox.height
    const targetEffectiveScale = Math.min(scaleX, scaleY)

    userZoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetEffectiveScale / fitScale))

    // 将包围盒中心对齐视口中心
    const effectiveScale = fitScale * userZoom.value
    const bboxCenterX = (bbox.x + bbox.width / 2) * effectiveScale
    const bboxCenterY = (bbox.y + bbox.height / 2) * effectiveScale
    panOffset.value = {
      x: viewportWidth / 2 - bboxCenterX,
      y: viewportHeight / 2 - bboxCenterY,
    }

    applyTransform()
  }

  /**
   * 100% 视图：1:1 像素显示，画布中心对齐视口中心
   */
  function zoomTo100() {
    if (!options.canvasContainer) return

    const viewportWidth = options.canvasContainer.clientWidth
    const viewportHeight = options.canvasContainer.clientHeight

    // fitScale * userZoom = 1.0 → userZoom = 1 / fitScale
    userZoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 1.0 / fitScale))

    // 画布中心对齐视口中心
    const effectiveScale = fitScale * userZoom.value
    const canvasPixelWidth = canvasSize.value.width * effectiveScale
    const canvasPixelHeight = canvasSize.value.height * effectiveScale
    panOffset.value = {
      x: (viewportWidth - canvasPixelWidth) / 2,
      y: (viewportHeight - canvasPixelHeight) / 2,
    }

    applyTransform()
  }

  // ========== 安全区域遮罩 ==========

  /**
   * 更新安全区域遮罩
   * 安全区域遮罩跟随 stage 变换（scale + position），
   * 所以绘制坐标使用世界坐标空间（与 stage 一致）
   */
  function updateSafeAreaOverlay() {
    if (!safeAreaOverlay || !app) return

    safeAreaOverlay.clear()

    const effectiveScale = fitScale * userZoom.value
    if (effectiveScale <= 0) return

    // 可见区域（世界坐标）
    const viewportWidth = options.canvasContainer.clientWidth / effectiveScale
    const viewportHeight = options.canvasContainer.clientHeight / effectiveScale
    const viewOriginX = -panOffset.value.x / effectiveScale
    const viewOriginY = -panOffset.value.y / effectiveScale

    // 填充整个可视区为半透明黑
    safeAreaOverlay.beginFill(0x000000, 0.3)
    const padding = 10000
    safeAreaOverlay.drawRect(
      viewOriginX - padding,
      viewOriginY - padding,
      viewportWidth + padding * 2,
      viewportHeight + padding * 2
    )

    // 挖空中间的安全区
    safeAreaOverlay.beginHole()
    safeAreaOverlay.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    safeAreaOverlay.endHole()
    safeAreaOverlay.endFill()

    // 绘制安全区绿色边框
    safeAreaOverlay.lineStyle(4 / effectiveScale, 0x00ff00, 0.5)
    safeAreaOverlay.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  // ========== 事件处理 ==========

  /**
   * 滚轮事件处理
   */
  function handleWheel(e: WheelEvent) {
    if (options.disableViewportPanZoom) {
      e.preventDefault()
      return
    }

    // Ctrl/Meta + 滚轮：缩放
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const useViewportCenter = options.wheelZoomAnchor === 'viewport-center'
      const offsetX = useViewportCenter
        ? options.canvasContainer.clientWidth / 2
        : e.clientX - rect.left
      const offsetY = useViewportCenter
        ? options.canvasContainer.clientHeight / 2
        : e.clientY - rect.top
      zoomAtPoint(userZoom.value * factor, offsetX, offsetY)
    } else if (e.shiftKey) {
      // Shift + 滚轮：水平平移
      e.preventDefault()
      panOffset.value = {
        x: panOffset.value.x - e.deltaY * PAN_SPEED,
        y: panOffset.value.y
      }
      applyTransform()
    } else {
      // 滚轮：垂直平移
      e.preventDefault()
      panOffset.value = {
        x: panOffset.value.x,
        y: panOffset.value.y - e.deltaY * PAN_SPEED
      }
      applyTransform()
    }
  }

  /**
   * 指针按下：检测中键拖拽 / Space+拖拽
   */
  function handlePointerDownForPan(e: PointerEvent) {
    if (options.disableViewportPanZoom) {
      if (e.button === 1 || (spacePressed && e.button === 0)) {
        e.preventDefault()
      }
      return
    }

    if (e.button === 1 || (spacePressed && e.button === 0)) {
      e.preventDefault()
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      panStartOffsetX = panOffset.value.x
      panStartOffsetY = panOffset.value.y

      // 设置光标
      if (canvasElement) {
        canvasElement.style.cursor = 'grabbing'
      }
    }
  }

  /**
   * 指针移动：平移拖拽
   */
  function handlePointerMoveForPan(e: PointerEvent) {
    if (!isPanning) return

    panOffset.value = {
      x: panStartOffsetX + (e.clientX - panStartX),
      y: panStartOffsetY + (e.clientY - panStartY),
    }
    applyTransform()
  }

  /**
   * 指针释放：结束平移
   */
  function handlePointerUpForPan(_e: PointerEvent) {
    if (isPanning) {
      isPanning = false
      // 恢复光标
      if (canvasElement) {
        canvasElement.style.cursor = spacePressed ? 'grab' : ''
      }
    }
  }

  /**
   * 键盘按下：Space 键
   */
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+0: Fit All
    if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.code === 'Digit0')) {
      e.preventDefault()
      if (options.disableViewportPanZoom) return
      fitAll()
      return
    }

    // Ctrl+1: 100% 视图
    if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.code === 'Digit1')) {
      e.preventDefault()
      if (options.disableViewportPanZoom) return
      zoomTo100()
      return
    }

    if (e.code === 'Space' && !e.repeat) {
      // 仅当焦点不在输入框/文本区时激活平移模式
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      e.preventDefault()
      if (options.disableViewportPanZoom) return
      spacePressed = true
      if (canvasElement && !isPanning) {
        canvasElement.style.cursor = 'grab'
      }
    }
  }

  /**
   * 键盘释放：Space 键
   */
  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spacePressed = false
      if (canvasElement && !isPanning) {
        canvasElement.style.cursor = ''
      }
    }
  }

  /**
   * 画布鼠标移动事件（更新世界坐标）
   */
  function handleCanvasPointerMove(event: PointerEvent) {
    if (!viewportLayer || !canvasElement) return

    // 平移拖拽处理
    handlePointerMoveForPan(event)

    const rect = canvasElement.getBoundingClientRect()
    const globalX = event.clientX - rect.left
    const globalY = event.clientY - rect.top
    const globalPos = { x: globalX, y: globalY }
    const localPos = viewportLayer.toLocal(globalPos)

    mousePosition.value = {
      x: Math.round(localPos.x),
      y: Math.round(localPos.y)
    }
  }

  // ========== 事件绑定 ==========

  /**
   * 绑定基础事件
   */
  function bindEvents() {
    if (!canvasElement || !stage) return

    const container = options.canvasContainer

    // 鼠标移动事件（更新鼠标位置 + 平移）
    canvasElement.addEventListener('pointermove', handleCanvasPointerMove as EventListener)

    // 滚轮事件（缩放 / 平移）
    container.addEventListener('wheel', handleWheel, { passive: false })

    // 中键 / Space+左键 平移
    canvasElement.addEventListener('pointerdown', handlePointerDownForPan as EventListener)
    window.addEventListener('pointerup', handlePointerUpForPan as EventListener)

    // Space 键
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // 阻止中键默认滚动行为
    canvasElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    })
  }

  /**
   * 解绑事件
   */
  function unbindEvents() {
    if (!canvasElement) return

    const container = options.canvasContainer

    canvasElement.removeEventListener('pointermove', handleCanvasPointerMove as EventListener)
    container.removeEventListener('wheel', handleWheel)
    canvasElement.removeEventListener('pointerdown', handlePointerDownForPan as EventListener)
    window.removeEventListener('pointerup', handlePointerUpForPan as EventListener)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
  }

  /**
   * 销毁 PixiJS Application
   */
  function destroyApp() {
    unbindEvents()

    if (safeAreaOverlay) {
      safeAreaOverlay.destroy()
      safeAreaOverlay = null
    }

    if (lightingBoundsAnchor) {
      lightingBoundsAnchor.destroy()
      lightingBoundsAnchor = null
    }

    if (app) {
      // v8.8 Fix: 不销毁共享的纹理缓存 (texture)
      // 只销毁本组件创建的 Container 和 Sprite，保留全局纹理缓存供其他组件使用
      app.destroy(true, { children: true, texture: false })
      app = null
    }

    stage = null
    viewportLayer = null
    selectionContainer = null
    activeLayer = null
    contentLayer = null
    canvasElement = null

  }


  return {
    // 生命周期
    initApp,
    destroyApp,
    getContext,

    // 视口控制
    updateTransformParams,
    resetView,
    fitAll,
    fitContent,
    zoomTo100,
    setZoomLevel,
    setPanOffset,
    zoomAtPoint,
    centerCanvasInViewport,

    // 缩放平移状态
    userZoom,
    panOffset,
    get fitScale() { return fitScale },

    // 状态
    canvasSize,
    mousePosition,
    transformParams,

    // 平移状态查询（供交互模块判断是否抑制对象拖拽）
    get isSpacePressed() { return spacePressed },
    get isPanning() { return isPanning },

    // 内部引用（供其他模块使用）
    get app() { return app },
    get stage() { return stage },
    get viewportLayer() { return viewportLayer },
    get canvasElement() { return canvasElement },
    get selectionContainer() { return selectionContainer },
    get activeLayer() { return activeLayer },

    // v25.4: 视口变换变更回调
    onViewportTransformChanged(cb: () => void) { viewportTransformCallbacks.add(cb) },
    offViewportTransformChanged(cb: () => void) { viewportTransformCallbacks.delete(cb) },
  }
}
