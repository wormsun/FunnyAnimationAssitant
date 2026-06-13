/**
 * useInteraction - 交互逻辑模块
 * 
 * 职责：
 * 1. 处理拖拽逻辑（handleDrag）
 * 2. 处理调整大小逻辑（handleResize）
 * 3. 处理旋转逻辑（handleRotate）
 * 4. 管理交互状态（isDragging, isResizing, isRotating）
 * 
 * 解耦点：
 * - 接收鼠标事件，计算出增量 (dx, dy)
 * - 通过回调抛出结果，而不是直接修改数据
 */

import * as PIXI from 'pixi.js'

import type { SceneObject } from '@/stores/sceneObjectStore'

export function normalizeAngleDelta(deltaAngle: number): number {
  const fullTurn = Math.PI * 2
  while (deltaAngle > Math.PI) deltaAngle -= fullTurn
  while (deltaAngle < -Math.PI) deltaAngle += fullTurn
  return deltaAngle
}

export function accumulateRotationDelta(
  previousAngle: number,
  currentAngle: number,
  accumulatedDelta: number
): { currentAngle: number; accumulatedDelta: number } {
  return {
    currentAngle,
    accumulatedDelta: accumulatedDelta + normalizeAngleDelta(currentAngle - previousAngle)
  }
}

export interface DragState {
  objectId: string
  startMouseX: number
  startMouseY: number
  startMouseParentX: number
  startMouseParentY: number
  startObjectX: number
  startObjectY: number
  startObjectGlobalX: number
  startObjectGlobalY: number
}

export interface ResizeState {
  objectId: string
  corner: string
  startMouseX: number
  startMouseY: number
  startObjectX: number
  startObjectY: number
  startScaleX: number
  startScaleY: number
  startWidth: number
  startHeight: number
  startRotation: number
  originalAspect: number
}

export interface RotateState {
  objectId: string
  centerX: number
  centerY: number
  startAngle: number
  lastAngle: number
  accumulatedDelta: number
  startRotation: number
}

export interface InteractionCallbacks {
  onDragMove?: (objectId: string, newX: number, newY: number, deltaX: number, deltaY: number) => void
  onDragEnd?: (
    objectId: string,
    finalX: number,
    finalY: number,
    startX: number,
    startY: number,
    globalPosition?: { x: number; y: number }
  ) => void | Promise<void>
  onResizeMove?: (objectId: string, newScaleX: number, newScaleY: number, newX: number, newY: number) => void
  onResizeEnd?: (objectId: string) => void | Promise<void>
  onRotateMove?: (objectId: string, newRotation: number) => void
  onRotateEnd?: (objectId: string) => void | Promise<void>
  onSelect?: (objectId: string) => void
  getObject?: (objectId: string) => SceneObject | undefined
  getContainer?: (objectId: string) => PIXI.Container | undefined
  getCharacterEffectiveScale?: (objectId: string) => number | undefined
  /**
   * v19: 获取对象在数据模型中的评估位置（parent-local）
   * Setup Mode: 返回 obj.x/y
   * Action Mode: 从 ghost states 获取 action 评估后的状态
   */
  getEvaluatedPosition?: (objectId: string) => { x: number; y: number } | undefined
  getEvaluatedGlobalPosition?: (objectId: string) => { x: number; y: number } | undefined
  /**
   * v20: 获取对象在数据模型中的评估变换（scaleX, scaleY, rotation）
   * Setup Mode: 返回 obj.scaleX/scaleY/rotation
   * Action Mode: 从 ghost states 获取 action 评估后的状态
   */
  getEvaluatedTransform?: (objectId: string) => { scaleX: number; scaleY: number; rotation: number } | undefined
  /** v19: 拖拽时的位置补偿量（Transform Origin → container.position 的偏移） */
  getPositionCompensation?: (objectId: string) => { cx: number; cy: number }
  /** v19: 获取对象沿父链累积的有效翻转状态（XOR 所有祖先 + 自身的 flipX） */
  getEffectiveFlipX?: (objectId: string) => boolean
}

export interface UseInteractionOptions {
  stage: PIXI.Container
  canvasElement: HTMLCanvasElement
  callbacks: InteractionCallbacks
}

export function useInteraction(options: UseInteractionOptions) {
  const { stage, canvasElement, callbacks } = options

  // 拖拽状态
  let isDragging = false
  let dragState: DragState | null = null

  // v19: 拖拽期间数据模型坐标追踪
  // 用于 handleDragEnd 时获取与 startObjectX/Y 同坐标空间的最终位置，
  // 避免从 container.position 读取（union 子对象经 proxy chain 展平后处于 stage 空间）
  let dragMoved = false
  let lastDragModelX = 0
  let lastDragModelY = 0
  let lastDragGlobalX = 0
  let lastDragGlobalY = 0

  // 调整大小状态
  let isResizing = false
  let resizeState: ResizeState | null = null

  // 旋转状态
  let isRotating = false
  let rotateState: RotateState | null = null

  /**
   * v2.0.0: 从容器位置获取对象中心点坐标
   * v2.0.0 后 container.position 已直接存储中心坐标（不含 offset 补偿），直接读取即可
   */
  function getObjectPositionFromContainer(container: PIXI.Container, _obj: SceneObject): { x: number; y: number } {
    return {
      x: container.position.x,
      y: container.position.y
    }
  }

  /**
   * v2.0.0: 应用对象中心点坐标到容器
   * v2.0.0 后直接赋值中心坐标，与 updateActionModeObjects / applyTransform 保持一致
   */
  function applyContainerPosition(container: PIXI.Container, _obj: SceneObject, newX: number, newY: number) {
    container.position.set(
      Math.round(newX),
      Math.round(newY)
    )
  }

  /**
   * 获取画布坐标
   */
  function getCanvasPosition(event: PointerEvent): { x: number; y: number } {
    const rect = canvasElement.getBoundingClientRect()
    const globalX = event.clientX - rect.left
    const globalY = event.clientY - rect.top
    const globalPos = { x: globalX, y: globalY }
    return stage.toLocal(globalPos)
  }

  /**
   * 将 stage 坐标转换到对象父容器的局部坐标。
   *
   * 对象数据模型的 x/y 存在于 parent-local 坐标系中。拖拽子对象时，
   * 鼠标位移必须先投影到同一个 parent-local 坐标系；否则当父级 composite
   * 存在旋转/缩放/翻转时，直接把 stage delta 加到 x/y 会造成拖拽方向偏离鼠标。
   */
  function getPointerPositionInObjectParent(objectId: string, stagePos: { x: number; y: number }): { x: number; y: number } {
    const container = callbacks.getContainer?.(objectId)
    const parent = container?.parent
    if (!parent || parent === stage) return stagePos

    const parentLocal = parent.toLocal(new PIXI.Point(stagePos.x, stagePos.y), stage)
    return { x: parentLocal.x, y: parentLocal.y }
  }

  /**
   * 开始拖拽
   */
  function startDrag(objectId: string, event: PIXI.FederatedPointerEvent, _container: PIXI.Container) {
    const obj = callbacks.getObject?.(objectId)
    if (!obj) return

    const localPos = stage.toLocal(event.global)
    const parentLocalPos = getPointerPositionInObjectParent(objectId, localPos)

    // v20: 统一从 getEvaluatedPosition 获取当前位置
    // Setup Mode: 返回 obj.x/y
    // Action Mode: 从 ghost states 获取 action 评估后的 parent-local 坐标
    const evaluatedPos = callbacks.getEvaluatedPosition?.(objectId)
    const currentObjectX = evaluatedPos?.x ?? obj.x
    const currentObjectY = evaluatedPos?.y ?? obj.y
    const evaluatedGlobalPos = callbacks.getEvaluatedGlobalPosition?.(objectId)
    const currentObjectGlobalX = evaluatedGlobalPos?.x ?? currentObjectX
    const currentObjectGlobalY = evaluatedGlobalPos?.y ?? currentObjectY

    isDragging = true
    dragMoved = false
    lastDragModelX = currentObjectX
    lastDragModelY = currentObjectY
    lastDragGlobalX = currentObjectGlobalX
    lastDragGlobalY = currentObjectGlobalY
    dragState = {
      objectId,
      startMouseX: localPos.x,
      startMouseY: localPos.y,
      startMouseParentX: parentLocalPos.x,
      startMouseParentY: parentLocalPos.y,
      startObjectX: currentObjectX,
      startObjectY: currentObjectY,
      startObjectGlobalX: currentObjectGlobalX,
      startObjectGlobalY: currentObjectGlobalY
    }

    // 选中对象
    callbacks.onSelect?.(objectId)
  }

  /**
   * 处理拖拽移动
   */
  function handleDragMove(event: PointerEvent) {
    if (!isDragging || !dragState) return

    const localPos = getCanvasPosition(event)
    const obj = callbacks.getObject?.(dragState.objectId)
    if (!obj) return

    // 计算增量
    const deltaX = localPos.x - dragState.startMouseX
    const deltaY = localPos.y - dragState.startMouseY
    const parentLocalPos = getPointerPositionInObjectParent(dragState.objectId, localPos)
    const parentDeltaX = parentLocalPos.x - dragState.startMouseParentX
    const parentDeltaY = parentLocalPos.y - dragState.startMouseParentY

    // 新位置 = 起始位置 + parent-local 增量。
    // parent-local 增量由 PIXI 矩阵转换得到，天然覆盖父级旋转/缩放/翻转/嵌套 composite。
    const newX = dragState.startObjectX + parentDeltaX
    const newY = dragState.startObjectY + parentDeltaY

    // v19: 追踪数据模型坐标（与 startObjectX/Y 同空间）
    dragMoved = true
    lastDragModelX = newX
    lastDragModelY = newY
    lastDragGlobalX = dragState.startObjectGlobalX + deltaX
    lastDragGlobalY = dragState.startObjectGlobalY + deltaY

    // 通过回调通知
    callbacks.onDragMove?.(dragState.objectId, newX, newY, deltaX, deltaY)
  }

  /**
   * 处理拖拽结束
   */
  function handleDragEnd() {
    if (!isDragging || !dragState) {
      isDragging = false
      dragState = null
      return
    }

    const obj = callbacks.getObject?.(dragState.objectId)

    if (obj) {
      // v19: 使用追踪的数据模型坐标作为最终位置，而非从 container.position 读取。
      // 对于 union composite 子对象：
      //   container.position 处于 stage 空间（经 applyUnionProxyChain 展平），
      //   而 startObjectX/Y 处于 parent-local 空间（来自 getEvaluatedPosition）。
      //   两者坐标空间不匹配会导致距离检查失效和错误的 action 创建。
      // 使用 lastDragModelX/Y（来自 handleDragMove 的 startObjectX + delta）
      // 确保与 startObjectX/Y 处于同一坐标空间。
      const finalX = dragMoved ? lastDragModelX : dragState.startObjectX
      const finalY = dragMoved ? lastDragModelY : dragState.startObjectY
      const finalGlobalX = dragMoved ? lastDragGlobalX : dragState.startObjectGlobalX
      const finalGlobalY = dragMoved ? lastDragGlobalY : dragState.startObjectGlobalY

      void callbacks.onDragEnd?.(
        dragState.objectId,
        finalX,
        finalY,
        dragState.startObjectX,
        dragState.startObjectY,
        { x: finalGlobalX, y: finalGlobalY }
      )
    }

    isDragging = false
    dragState = null
  }

  /**
   * 开始调整大小
   */
  function startResize(
    objectId: string,
    corner: string,
    event: PIXI.FederatedPointerEvent,
    bounds: { width: number; height: number }
  ) {
    const obj = callbacks.getObject?.(objectId)
    if (!obj) return

    const localPos = stage.toLocal(event.global)

    // v20: 统一从 getEvaluatedPosition/getEvaluatedTransform 获取初始状态
    // Setup Mode: 返回 obj.x/y/scaleX/scaleY/rotation
    // Action Mode: 从 ghost states 获取 action 评估后的状态
    const evaluatedPos = callbacks.getEvaluatedPosition?.(objectId)
    const evaluatedTransform = callbacks.getEvaluatedTransform?.(objectId)
    const currentObjectX = evaluatedPos?.x ?? obj.x
    const currentObjectY = evaluatedPos?.y ?? obj.y
    const currentScaleX = evaluatedTransform?.scaleX ?? obj.scaleX
    const currentScaleY = evaluatedTransform?.scaleY ?? obj.scaleY
    const currentRotation = evaluatedTransform?.rotation ?? (obj.rotation || 0)

    isResizing = true
    resizeState = {
      objectId,
      corner,
      startMouseX: localPos.x,
      startMouseY: localPos.y,
      startObjectX: currentObjectX,
      startObjectY: currentObjectY,
      startScaleX: currentScaleX,
      startScaleY: currentScaleY,
      startWidth: bounds.width,
      startHeight: bounds.height,
      startRotation: currentRotation,
      originalAspect: bounds.width / bounds.height
    }
  }

  /**
 * 处理调整大小移动
 * v9.4: 中心 Pivot 缩放 - 缩放时保持对象视觉中心不动
 * 支持 OBB 局部投影缩放和独立宽高等比缩放
 */
  function handleResizeMove(event: PointerEvent) {
    if (!isResizing || !resizeState) return

    const localPos = getCanvasPosition(event)
    const obj = callbacks.getObject?.(resizeState.objectId)
    if (!obj) return

    // 计算鼠标全局移动增量
    const deltaX = localPos.x - resizeState.startMouseX
    const deltaY = localPos.y - resizeState.startMouseY

    // 旋转逆投影：将鼠标增量从全局坐标系映射到对象的本地未旋转坐标系
    const angle = resizeState.startRotation
    const cosA = Math.cos(-angle)
    const sinA = Math.sin(-angle)

    // 如果对象的有效翻转状态为 true（含父级继承），x 轴方向被反转，需要反向投射 deltaX
    const effectiveFlip = callbacks.getEffectiveFlipX?.(resizeState.objectId) ?? obj.flipX ?? false
    const flipMultiplierX = effectiveFlip ? -1 : 1

    // 投影到对象的未旋转本地坐标系，并考虑翻转修复鼠标拉伸方向关联
    const localDeltaX = (deltaX * cosA - deltaY * sinA) * flipMultiplierX
    const localDeltaY = deltaX * sinA + deltaY * cosA

    const corner = resizeState.corner
    let scaleChangeX = 0
    let scaleChangeY = 0

    // 根据拖动的手柄和局部增量计算 X/Y 独立的缩放变化
    // 注意：如果是负向手柄拉伸负向距离，实际属于放大，因此公式带负号
    if (corner === 'top-left') {
      scaleChangeX = -localDeltaX / resizeState.startWidth
      scaleChangeY = -localDeltaY / resizeState.startHeight
    } else if (corner === 'top-right') {
      scaleChangeX = localDeltaX / resizeState.startWidth
      scaleChangeY = -localDeltaY / resizeState.startHeight
    } else if (corner === 'bottom-left') {
      scaleChangeX = -localDeltaX / resizeState.startWidth
      scaleChangeY = localDeltaY / resizeState.startHeight
    } else if (corner === 'bottom-right') {
      scaleChangeX = localDeltaX / resizeState.startWidth
      scaleChangeY = localDeltaY / resizeState.startHeight
    } else if (corner === 'top') {
      // 仅边上的手柄：单轴计算
      scaleChangeY = -localDeltaY / resizeState.startHeight
    } else if (corner === 'bottom') {
      scaleChangeY = localDeltaY / resizeState.startHeight
    } else if (corner === 'left') {
      scaleChangeX = -localDeltaX / resizeState.startWidth
    } else if (corner === 'right') {
      scaleChangeX = localDeltaX / resizeState.startWidth
    }

    let newScaleX = resizeState.startScaleX + scaleChangeX
    let newScaleY = resizeState.startScaleY + scaleChangeY

    // 默认行为：普通对象拖动四角时进行等比缩放，按住 Shift 键则自由缩放。
    // 蒙版是裁切框，四角拖动应直接改变宽高比例；拖动单边手柄也始终是单轴拉伸。
    if (obj.type !== 'mask' && !event.shiftKey && corner.includes('-')) {
      const avgScaleChange = (scaleChangeX + scaleChangeY) / 2
      newScaleX = resizeState.startScaleX + avgScaleChange
      newScaleY = resizeState.startScaleY + avgScaleChange
    }

    // 限制最小缩放值
    newScaleX = Math.max(0.1, newScaleX)
    newScaleY = Math.max(0.1, newScaleY)

    // v2.0.0: 中心坐标下，缩放时中心不动，位置不需要补偿
    const newX = resizeState.startObjectX
    const newY = resizeState.startObjectY

    callbacks.onResizeMove?.(resizeState.objectId, newScaleX, newScaleY, newX, newY)
  }

  /**
   * 处理调整大小结束
   */
  function handleResizeEnd() {
    if (isResizing && resizeState) {
      void callbacks.onResizeEnd?.(resizeState.objectId)
    }
    isResizing = false
    resizeState = null
  }

  /**
   * 开始旋转
   */
  function startRotate(objectId: string, event: PIXI.FederatedPointerEvent, container: PIXI.Container, rotationCenter?: PIXI.Point) {
    const obj = callbacks.getObject?.(objectId)
    if (!obj) return

    // 使用提供的旋转中心（transform origin），或回退到容器位置（中心点）
    const globalCenter = rotationCenter ?? container.getGlobalPosition()
    const stageCenter = stage.toLocal(globalCenter)
    const stageMousePos = stage.toLocal(event.global)
    const startAngle = Math.atan2(stageMousePos.y - stageCenter.y, stageMousePos.x - stageCenter.x)

    isRotating = true
    rotateState = {
      objectId,
      centerX: stageCenter.x,
      centerY: stageCenter.y,
      startAngle,
      lastAngle: startAngle,
      accumulatedDelta: 0,
      startRotation: container.rotation
    }
  }

  /**
   * 处理旋转移动
   */
  function handleRotateMove(event: PointerEvent) {
    if (!isRotating || !rotateState) return

    const localPos = getCanvasPosition(event)
    const obj = callbacks.getObject?.(rotateState.objectId)
    if (!obj) return

    // 计算当前鼠标相对于旋转中心的角度
    const dx = localPos.x - rotateState.centerX
    const dy = localPos.y - rotateState.centerY
    const currentAngle = Math.atan2(dy, dx)

    // 连续累计每一步的最短弧增量，支持单次拖拽超过 180° 甚至整圈旋转
    const accumulated = accumulateRotationDelta(
      rotateState.lastAngle,
      currentAngle,
      rotateState.accumulatedDelta
    )
    rotateState.lastAngle = accumulated.currentAngle
    rotateState.accumulatedDelta = accumulated.accumulatedDelta
    let deltaAngle = rotateState.accumulatedDelta

    // v20: flipX 旋转方向补偿
    // 只考虑父链的累积翻转（不含自身），因为：
    // - 自身 flipX 通过 PIXI scale.x < 0 已经在矩阵中正确处理了旋转方向
    // - 父级翻转会镜像鼠标所在的坐标空间，需要反转 delta 补偿
    let parentFlipped = false
    const selfObj = callbacks.getObject?.(rotateState.objectId)
    if (selfObj?.parentId) {
      // 从父对象开始遍历，不含自身
      const parentFlip = callbacks.getEffectiveFlipX?.(selfObj.parentId)
      // getEffectiveFlipX 从参数对象开始含自身遍历，传入 parentId 即为"父链含父自身"
      // 但这里我们需要的是"父链中的翻转"，所以用 parentId 开始
      // 注意：getEffectiveFlipX(parentId) 已经正确计算了从 parent 开始的累积翻转
      parentFlipped = parentFlip ?? false
    }
    if (parentFlipped) {
      deltaAngle = -deltaAngle
    }

    const newRotation = rotateState.startRotation + deltaAngle

    callbacks.onRotateMove?.(rotateState.objectId, newRotation)
  }

  /**
   * 处理旋转结束
   */
  function handleRotateEnd() {
    if (isRotating && rotateState) {
      void callbacks.onRotateEnd?.(rotateState.objectId)
    }
    isRotating = false
    rotateState = null
  }

  /**
   * 全局鼠标移动处理
   */
  function handleGlobalPointerMove(event: PointerEvent) {
    if (isDragging) {
      handleDragMove(event)
    } else if (isResizing) {
      handleResizeMove(event)
    } else if (isRotating) {
      handleRotateMove(event)
    }
  }

  /**
   * 全局鼠标释放处理
   */
  function handleGlobalPointerUp() {
    handleDragEnd()
    handleResizeEnd()
    handleRotateEnd()
  }

  /**
   * 绑定全局事件
   */
  function bindGlobalEvents() {
    window.addEventListener('pointerup', handleGlobalPointerUp)
    window.addEventListener('pointermove', handleGlobalPointerMove)
  }

  /**
   * 解绑全局事件
   */
  function unbindGlobalEvents() {
    window.removeEventListener('pointerup', handleGlobalPointerUp)
    window.removeEventListener('pointermove', handleGlobalPointerMove)
  }

  /**
   * 获取当前正在交互（拖拽/缩放/旋转）的对象 ID
   * 用于防止异步渲染覆盖交互期间直接设置的容器状态
   */
  function getActiveInteractionObjectId(): string | null {
    if (isDragging && dragState) return dragState.objectId
    if (isResizing && resizeState) return resizeState.objectId
    if (isRotating && rotateState) return rotateState.objectId
    return null
  }

  return {
    // 状态
    get isDragging() { return isDragging },
    get isResizing() { return isResizing },
    get isRotating() { return isRotating },
    get dragState() { return dragState },

    // 操作
    startDrag,
    startResize,
    startRotate,

    // 事件绑定
    bindGlobalEvents,
    unbindGlobalEvents,

    // 工具函数
    getObjectPositionFromContainer,
    applyContainerPosition,
    getCanvasPosition,
    getActiveInteractionObjectId
  }
}
