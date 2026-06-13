/**
 * SimpleGizmo — 动画编辑器独立画布的变换控制框
 *
 * 纯 PixiJS 实现，不依赖 useSceneRenderer / useInteraction / sceneObjectStore。
 * 处理单个对象的 移动 / 旋转 / 缩放 / 锚点拖拽。
 * 所有操作结果通过事件回调输出，由 AnimationWorkbench 写入关键帧数据。
 */

import * as PIXI from 'pixi.js'

// ===== Types =====

export interface GizmoTransformValues {
    x?: number
    y?: number
    scaleX?: number
    scaleY?: number
    rotation?: number
}

export interface GizmoPivotValues {
    x: number  // normalized 0-1
    y: number
}

export interface SimpleGizmoCallbacks {
    onInteractionStart?: () => void
    onInteractionMove?: (values: GizmoTransformValues) => void
    onInteractionEnd?: (values: GizmoTransformValues) => void
    onPivotChange?: (pivot: GizmoPivotValues) => void
}

type GizmoInteractionState =
    | { type: 'idle' }
    | { type: 'translating'; startMouseX: number; startMouseY: number; startObjX: number; startObjY: number }
    | { type: 'rotating'; lastAngle: number; accumulatedDelta: number; startRotation: number; pivotGlobal: PIXI.Point }
    | { type: 'scaling'; startDistance: number; startScaleX: number; startScaleY: number; handleType: 'corner' | 'edge-h' | 'edge-v'; pivotGlobal: PIXI.Point }
    | { type: 'pivot-dragging'; startPivotX: number; startPivotY: number }

// ===== Constants =====

const COLORS = {
    border: 0x00bcd4,      // cyan
    handleFill: 0xffffff,  // white
    handleStroke: 0x00bcd4,
    rotateHandle: 0x2196f3, // blue
    pivotHandle: 0xff9800,  // orange
}

const CORNER_HANDLE_SIZE = 10
const EDGE_HANDLE_SIZE = 8
const ROTATE_HANDLE_RADIUS = 5
const ROTATE_HANDLE_OFFSET = 35
const PIVOT_HANDLE_RADIUS = 5

// ===== SimpleGizmo Class =====

export class SimpleGizmo extends PIXI.Container {
    private target: PIXI.Container | null = null
    private callbacks: SimpleGizmoCallbacks = {}

    // Visual elements
    private border = new PIXI.Graphics()
    private cornerHandles: PIXI.Graphics[] = []
    private edgeHandles: PIXI.Graphics[] = []
    private rotateHandle = new PIXI.Graphics()
    private rotateLine = new PIXI.Graphics()
    private pivotMarker = new PIXI.Graphics()
    private floatingLabel = new PIXI.Text('', { fontSize: 12, fill: 0xffffff, fontFamily: 'monospace' })

    // State
    private state: GizmoInteractionState = { type: 'idle' }
    private pivotNorm: GizmoPivotValues = { x: 0.5, y: 0.5 }

    // Canvas element ref (for cursor changes)
    private canvasEl: HTMLElement | null = null

    // Window event handlers (bound in setupEvents, cleaned up on removed)
    private _onWindowPointerMove: ((e: PointerEvent) => void) | null = null
    private _onWindowPointerUp: (() => void) | null = null

    constructor() {
        super()
        this.name = 'SimpleGizmo'
        this.eventMode = 'static'

        this.buildVisuals()
        this.floatingLabel.visible = false
        this.addChild(this.floatingLabel)
    }

    // ===== Public API =====

    setCallbacks(callbacks: SimpleGizmoCallbacks) {
        this.callbacks = callbacks
    }

    setCanvasElement(el: HTMLElement) {
        this.canvasEl = el
    }

    attach(target: PIXI.Container, _objectBounds: { width: number; height: number }, pivotNorm?: GizmoPivotValues) {
        this.target = target
        if (pivotNorm) this.pivotNorm = { ...pivotNorm }
        this.visible = true
        this.updateFromTarget()
    }

    detach() {
        this.target = null
        this.visible = false
    }

    /** Sync gizmo position to match target's current transform */
    updateFromTarget() {
        if (!this.target) return
        this.redraw()
    }

    setPivot(pivot: GizmoPivotValues) {
        this.pivotNorm = { ...pivot }
        this.redraw()
    }

    // ===== Build Visuals =====

    private buildVisuals() {
        // Border
        this.border.name = 'gizmo_border'
        this.addChild(this.border)

        // 4 corner handles
        const cornerNames = ['tl', 'tr', 'br', 'bl']
        for (const name of cornerNames) {
            const h = new PIXI.Graphics()
            h.name = `corner_${name}`
            h.eventMode = 'static'
            this.cornerHandles.push(h)
            this.addChild(h)
        }

        // 4 edge handles
        const edgeNames = ['top', 'right', 'bottom', 'left']
        for (const name of edgeNames) {
            const h = new PIXI.Graphics()
            h.name = `edge_${name}`
            h.eventMode = 'static'
            this.edgeHandles.push(h)
            this.addChild(h)
        }

        // Rotate handle + line
        this.rotateLine.name = 'rotate_line'
        this.addChild(this.rotateLine)
        this.rotateHandle.name = 'rotate_handle'
        this.rotateHandle.eventMode = 'static'
        this.rotateHandle.cursor = 'crosshair'
        this.addChild(this.rotateHandle)

        // Pivot marker
        this.pivotMarker.name = 'pivot_marker'
        this.pivotMarker.eventMode = 'static'
        this.pivotMarker.cursor = 'crosshair'
        this.addChild(this.pivotMarker)

        // Bind events
        this.setupEvents()
    }

    // ===== Redraw =====

    private redraw() {
        if (!this.target) return

        const t = this.target
        const localBounds = t.getLocalBounds()
        if (localBounds.width <= 0 || localBounds.height <= 0) return

        // Get OBB corners in global coords
        const lT = t.toGlobal(new PIXI.Point(localBounds.x, localBounds.y))
        const rT = t.toGlobal(new PIXI.Point(localBounds.x + localBounds.width, localBounds.y))
        const rB = t.toGlobal(new PIXI.Point(localBounds.x + localBounds.width, localBounds.y + localBounds.height))
        const lB = t.toGlobal(new PIXI.Point(localBounds.x, localBounds.y + localBounds.height))

        // Convert to gizmo's local space (gizmo is in stage coords = global)
        const corners = [lT, rT, rB, lB].map(p => this.toLocal(p))

        const topMid = mid(corners[0]!, corners[1]!)
        const rightMid = mid(corners[1]!, corners[2]!)
        const bottomMid = mid(corners[2]!, corners[3]!)
        const leftMid = mid(corners[3]!, corners[0]!)
        const center = mid(topMid, bottomMid)

        // --- Border ---
        this.border.clear()
        // 边框线不可见（选择框由 useSceneRenderer 绘制），保留透明 fill 用于拖拽检测
        this.border.lineStyle(2, COLORS.border, 0)
        this.border.moveTo(corners[0]!.x, corners[0]!.y)
        this.border.lineTo(corners[1]!.x, corners[1]!.y)
        this.border.lineTo(corners[2]!.x, corners[2]!.y)
        this.border.lineTo(corners[3]!.x, corners[3]!.y)
        this.border.closePath()

        // Invisible fill for hit detection (translate)
        this.border.beginFill(0x000000, 0.001)
        this.border.moveTo(corners[0]!.x, corners[0]!.y)
        this.border.lineTo(corners[1]!.x, corners[1]!.y)
        this.border.lineTo(corners[2]!.x, corners[2]!.y)
        this.border.lineTo(corners[3]!.x, corners[3]!.y)
        this.border.closePath()
        this.border.endFill()

        // --- Corner handles ---
        const cornerPositions = [corners[0]!, corners[1]!, corners[2]!, corners[3]!]
        const cornerCursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']
        for (let i = 0; i < 4; i++) {
            const h = this.cornerHandles[i]!
            const pos = cornerPositions[i]!
            h.clear()
            h.beginFill(COLORS.handleFill)
            h.lineStyle(2, COLORS.handleStroke)
            h.drawRect(-CORNER_HANDLE_SIZE / 2, -CORNER_HANDLE_SIZE / 2, CORNER_HANDLE_SIZE, CORNER_HANDLE_SIZE)
            h.endFill()
            h.position.set(pos.x, pos.y)
            h.rotation = t.rotation
            h.cursor = cornerCursors[i]!
        }

        // --- Edge handles ---
        const edgePositions = [topMid, rightMid, bottomMid, leftMid]
        const edgeCursors = ['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize']
        for (let i = 0; i < 4; i++) {
            const h = this.edgeHandles[i]!
            const pos = edgePositions[i]!
            h.clear()
            h.beginFill(COLORS.handleFill)
            h.lineStyle(2, COLORS.handleStroke)
            h.drawRect(-EDGE_HANDLE_SIZE / 2, -EDGE_HANDLE_SIZE / 2, EDGE_HANDLE_SIZE, EDGE_HANDLE_SIZE)
            h.endFill()
            h.position.set(pos.x, pos.y)
            h.rotation = t.rotation
            h.cursor = edgeCursors[i]!
        }

        // --- Rotation handle ---
        // Top center, offset upward
        const rotDir = normalize(sub(topMid, center))
        const rotPos = { x: topMid.x + rotDir.x * ROTATE_HANDLE_OFFSET, y: topMid.y + rotDir.y * ROTATE_HANDLE_OFFSET }

        this.rotateLine.clear()
        this.rotateLine.lineStyle(1, COLORS.border, 0.6)
        // Dashed effect (approximate)
        this.rotateLine.moveTo(topMid.x, topMid.y)
        this.rotateLine.lineTo(rotPos.x, rotPos.y)

        this.rotateHandle.clear()
        this.rotateHandle.beginFill(COLORS.rotateHandle)
        this.rotateHandle.drawCircle(0, 0, ROTATE_HANDLE_RADIUS)
        this.rotateHandle.endFill()
        this.rotateHandle.position.set(rotPos.x, rotPos.y)

        // --- Pivot marker ---
        const pivotLocal = new PIXI.Point(
            localBounds.x + localBounds.width * this.pivotNorm.x,
            localBounds.y + localBounds.height * this.pivotNorm.y,
        )
        const pivotGlobal = t.toGlobal(pivotLocal)
        const pivotInGizmo = this.toLocal(pivotGlobal)

        this.pivotMarker.clear()
        this.pivotMarker.lineStyle(2, COLORS.pivotHandle)
        this.pivotMarker.drawCircle(0, 0, PIVOT_HANDLE_RADIUS)
        // Small crosshair inside
        this.pivotMarker.moveTo(-3, 0)
        this.pivotMarker.lineTo(3, 0)
        this.pivotMarker.moveTo(0, -3)
        this.pivotMarker.lineTo(0, 3)
        this.pivotMarker.position.set(pivotInGizmo.x, pivotInGizmo.y)

        // Store corners for hit testing (unused currently but reserved for future hit detection)
        // this._corners = corners as PIXI.IPointData[]
        // this._edgeMidpoints = edgePositions
        // this._center = center
    }

    // ===== Events =====

    private setupEvents() {
        // Corner handles → scale (proportional)
        this.cornerHandles.forEach((h) => {
            h.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                e.stopPropagation()
                this.startScaling(e, 'corner')
            })
        })

        // Edge handles → scale (single axis)
        this.edgeHandles.forEach((h, i) => {
            const type = (i === 0 || i === 2) ? 'edge-v' : 'edge-h'
            h.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                e.stopPropagation()
                this.startScaling(e, type)
            })
        })

        // Rotate handle
        this.rotateHandle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation()
            this.startRotating(e)
        })

        // Pivot marker
        this.pivotMarker.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation()
            this.startPivotDrag(e)
        })

        // Border interior → translate
        this.border.eventMode = 'static'
        this.border.cursor = 'move'
        this.border.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation()
            this.startTranslating(e)
        })

        // Global move/up via window events（不依赖 PIXI 事件冒泡）
        // 绑定到 window 确保鼠标离开 gizmo 区域后仍能持续接收事件，
        // 解决拖拽/旋转/缩放时鼠标移出画布导致交互中断的问题
        this._onWindowPointerMove = (e: PointerEvent) => {
            if (this.state.type === 'idle' || !this.target) return
            // 将 window PointerEvent 转换为 PIXI 坐标
            const canvas = this.canvasEl
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            // CSS 像素坐标（autoDensity: true 时 PIXI event.global 也是 CSS 像素）
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            // 构造 FederatedPointerEvent 兼容的 global 对象
            const fakeEvent = {
                global: { x, y, clone: () => ({ x, y }) },
                shiftKey: e.shiftKey,
                stopPropagation: () => { /* noop */ },
            } as unknown as PIXI.FederatedPointerEvent
            this.onPointerMove(fakeEvent)
        }
        this._onWindowPointerUp = () => {
            if (this.state.type === 'idle') return
            this.onPointerUp({} as PIXI.FederatedPointerEvent)
        }

        this.on('added', () => {
            window.addEventListener('pointermove', this._onWindowPointerMove!)
            window.addEventListener('pointerup', this._onWindowPointerUp!)
        })

        this.on('removed', () => {
            window.removeEventListener('pointermove', this._onWindowPointerMove!)
            window.removeEventListener('pointerup', this._onWindowPointerUp!)
        })
    }

    // ===== Interaction Start =====

    private startTranslating(e: PIXI.FederatedPointerEvent) {
        if (!this.target) return
        const global = e.global.clone()
        this.state = {
            type: 'translating',
            startMouseX: global.x,
            startMouseY: global.y,
            startObjX: this.target.position.x,
            startObjY: this.target.position.y,
        }
        this.callbacks.onInteractionStart?.()
    }

    private startRotating(e: PIXI.FederatedPointerEvent) {
        if (!this.target) return
        const pivotGlobal = this.getPivotGlobal()
        const mouseGlobal = e.global.clone()
        const startAngle = Math.atan2(mouseGlobal.y - pivotGlobal.y, mouseGlobal.x - pivotGlobal.x)
        this.state = {
            type: 'rotating',
            lastAngle: startAngle,
            accumulatedDelta: 0,
            startRotation: this.target.rotation,
            pivotGlobal,
        }
        this.callbacks.onInteractionStart?.()
    }

    private startScaling(e: PIXI.FederatedPointerEvent, handleType: 'corner' | 'edge-h' | 'edge-v') {
        if (!this.target) return
        const pivotGlobal = this.getPivotGlobal()
        const mouseGlobal = e.global.clone()
        const startDistance = dist(mouseGlobal, pivotGlobal)
        this.state = {
            type: 'scaling',
            startDistance: startDistance || 1,
            startScaleX: this.target.scale.x,
            startScaleY: this.target.scale.y,
            handleType,
            pivotGlobal,
        }
        this.callbacks.onInteractionStart?.()
    }

    private startPivotDrag(_e: PIXI.FederatedPointerEvent) {
        this.state = {
            type: 'pivot-dragging',
            startPivotX: this.pivotNorm.x,
            startPivotY: this.pivotNorm.y,
        }
    }

    // ===== Pointer Move =====

    private onPointerMove(e: PIXI.FederatedPointerEvent) {
        if (this.state.type === 'idle') return
        if (!this.target) return

        const mouse = e.global.clone()

        switch (this.state.type) {
            case 'translating': {
                let dx = mouse.x - this.state.startMouseX
                let dy = mouse.y - this.state.startMouseY

                // Shift constraint: horizontal or vertical
                if (e.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) dy = 0
                    else dx = 0
                }

                this.target.position.set(
                    this.state.startObjX + dx,
                    this.state.startObjY + dy,
                )

                // Floating label
                this.showLabel(`X: ${dx > 0 ? '+' : ''}${Math.round(dx)}  Y: ${dy > 0 ? '+' : ''}${Math.round(dy)}`, mouse)

                this.callbacks.onInteractionMove?.({
                    x: this.target.position.x,
                    y: this.target.position.y,
                })
                break
            }

            case 'rotating': {
                const pivotG = this.state.pivotGlobal
                const currentAngle = Math.atan2(mouse.y - pivotG.y, mouse.x - pivotG.x)

                // 连续累计每一步的最短弧增量，支持单次拖拽超过 180° 甚至整圈旋转
                let frameDelta = currentAngle - this.state.lastAngle
                // 归一化到 [-π, π]，处理 atan2 在 ±π 边界的跳变
                while (frameDelta > Math.PI) frameDelta -= Math.PI * 2
                while (frameDelta < -Math.PI) frameDelta += Math.PI * 2
                this.state.lastAngle = currentAngle
                this.state.accumulatedDelta += frameDelta

                let delta = this.state.accumulatedDelta

                // Shift: 15° snap
                if (e.shiftKey) {
                    const step = Math.PI / 12
                    delta = Math.round(delta / step) * step
                }

                const newRotation = this.state.startRotation + delta
                this.target.rotation = newRotation

                const degrees = ((newRotation * 180 / Math.PI) % 360).toFixed(1)
                this.showLabel(`${degrees}°`, mouse)

                this.callbacks.onInteractionMove?.({
                    rotation: newRotation,
                })
                break
            }

            case 'scaling': {
                const pivotG = this.state.pivotGlobal
                const currentDist = dist(mouse, pivotG) || 1
                const ratio = currentDist / this.state.startDistance

                let newScaleX = this.state.startScaleX
                let newScaleY = this.state.startScaleY

                switch (this.state.handleType) {
                    case 'corner':
                        newScaleX = this.state.startScaleX * ratio
                        newScaleY = this.state.startScaleY * ratio
                        break
                    case 'edge-h':
                        newScaleX = this.state.startScaleX * ratio
                        break
                    case 'edge-v':
                        newScaleY = this.state.startScaleY * ratio
                        break
                }

                this.target.scale.set(newScaleX, newScaleY)

                const pctX = Math.round(Math.abs(newScaleX) * 100)
                const pctY = Math.round(Math.abs(newScaleY) * 100)
                this.showLabel(`${pctX}% × ${pctY}%`, mouse)

                this.callbacks.onInteractionMove?.({
                    scaleX: newScaleX,
                    scaleY: newScaleY,
                })
                break
            }

            case 'pivot-dragging': {
                if (!this.target) break
                const localBounds = this.target.getLocalBounds()
                const localPoint = this.target.toLocal(mouse)
                // Compute normalized 0-1 within bounds
                const nx = Math.max(0, Math.min(1, (localPoint.x - localBounds.x) / localBounds.width))
                const ny = Math.max(0, Math.min(1, (localPoint.y - localBounds.y) / localBounds.height))
                this.pivotNorm = { x: nx, y: ny }

                this.showLabel(`Pivot: ${Math.round(nx * 100)}%, ${Math.round(ny * 100)}%`, mouse)

                this.callbacks.onPivotChange?.({ x: nx, y: ny })
                break
            }
        }

        this.redraw()
    }

    // ===== Pointer Up =====

    private onPointerUp(_e: PIXI.FederatedPointerEvent) {
        if (this.state.type === 'idle') return
        if (!this.target) {
            this.state = { type: 'idle' }
            return
        }

        this.floatingLabel.visible = false

        if (this.state.type !== 'pivot-dragging') {
            // Emit final values
            this.callbacks.onInteractionEnd?.({
                x: this.target.position.x,
                y: this.target.position.y,
                scaleX: this.target.scale.x,
                scaleY: this.target.scale.y,
                rotation: this.target.rotation,
            })
        }

        this.state = { type: 'idle' }
        if (this.canvasEl) this.canvasEl.style.cursor = 'default'
    }

    // ===== Helpers =====

    private getPivotGlobal(): PIXI.Point {
        if (!this.target) return new PIXI.Point(0, 0)
        const localBounds = this.target.getLocalBounds()
        const pivotLocal = new PIXI.Point(
            localBounds.x + localBounds.width * this.pivotNorm.x,
            localBounds.y + localBounds.height * this.pivotNorm.y,
        )
        return this.target.toGlobal(pivotLocal)
    }

    private showLabel(text: string, mouseGlobal: PIXI.IPointData) {
        this.floatingLabel.text = text
        const local = this.toLocal(mouseGlobal)
        this.floatingLabel.position.set(local.x + 15, local.y - 25)
        this.floatingLabel.visible = true
    }

    get isInteracting(): boolean {
        return this.state.type !== 'idle'
    }
}

// ===== Math Helpers =====

function mid(a: PIXI.IPointData, b: PIXI.IPointData): PIXI.IPointData {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function sub(a: PIXI.IPointData, b: PIXI.IPointData): PIXI.IPointData {
    return { x: a.x - b.x, y: a.y - b.y }
}

function dist(a: PIXI.IPointData, b: PIXI.IPointData): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
}

function normalize(v: PIXI.IPointData): PIXI.IPointData {
    const len = Math.sqrt(v.x * v.x + v.y * v.y)
    if (len === 0) return { x: 0, y: -1 }
    return { x: v.x / len, y: v.y / len }
}
