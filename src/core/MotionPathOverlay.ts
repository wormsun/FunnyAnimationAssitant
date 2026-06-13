/**
 * MotionPathOverlay — 运动路径可视化
 * 
 * 在 pathLayer 上渲染：
 * - 虚线连接关键帧位移位置
 * - 关键帧位置圆点（可点击选中、可拖拽修改 x/y）
 * - 与时间轴/属性面板选中状态同步
 */

import * as PIXI from 'pixi.js'

import type { TransformKeyframe, TransformTrackOutput } from '@/types/animation'

const PATH_COLOR = 0x00BCD4
const DOT_RADIUS = 5
const DOT_SELECTED_RADIUS = 7
const DOT_COLOR = 0x00BCD4
const DOT_SELECTED_COLOR = 0xFFFFFF
const DASH_LENGTH = 6
const GAP_LENGTH = 4
const PATH_ALPHA = 0.6
const INTERPOLATION_STEPS = 20 // segments between keyframes for smooth curves

export interface MotionPathCallbacks {
    /** Called when user clicks a keyframe dot */
    onKeyframeSelect?: (index: number) => void
    /** Called when user drags a keyframe dot to a new position */
    onKeyframeDrag?: (index: number, deltaX: number, deltaY: number) => void
    /** Called when drag ends */
    onKeyframeDragEnd?: (index: number) => void
}

export interface MotionPathPoint {
    x: number
    y: number
    isKeyframe: boolean
    keyframeIndex: number
}

export class MotionPathOverlay extends PIXI.Container {
    private pathGraphics: PIXI.Graphics
    private dotsContainer: PIXI.Container
    private callbacks: MotionPathCallbacks = {}
    private baseX = 0
    private baseY = 0
    private selectedIndex = -1

    // Drag state
    private draggingDotIndex = -1
    private dragStartGlobal = { x: 0, y: 0 }
    private dragStartLocal = { x: 0, y: 0 }

    constructor() {
        super()
        this.name = 'motionPathOverlay'
        
        this.pathGraphics = new PIXI.Graphics()
        this.dotsContainer = new PIXI.Container()
        this.dotsContainer.name = 'pathDots'

        this.addChild(this.pathGraphics, this.dotsContainer)
    }

    setCallbacks(cb: MotionPathCallbacks) {
        this.callbacks = cb
    }

    /**
     * Set base position (object's resting position on canvas)
     */
    setBasePosition(x: number, y: number) {
        this.baseX = x
        this.baseY = y
    }

    /**
     * Update the path visualization
     * @param keyframes Current track keyframes
     * @param evaluator Function that evaluates transform at a given time (0-1)
     * @param selectedKeyframeIndex Currently selected keyframe index
     */
    update(
        keyframes: TransformKeyframe[],
        evaluator: (time: number) => TransformTrackOutput | null,
        selectedKeyframeIndex: number
    ) {
        this.selectedIndex = selectedKeyframeIndex

        this.pathGraphics.clear()
        this.dotsContainer.removeChildren()

        if (keyframes.length < 2) {
            // Still draw the single keyframe dot if exists
            if (keyframes.length === 1) {
                this.drawDot(0, keyframes[0]!)
            }
            return
        }

        // Collect interpolated path points
        const points: { x: number; y: number }[] = []
        const totalSteps = (keyframes.length - 1) * INTERPOLATION_STEPS

        for (let i = 0; i <= totalSteps; i++) {
            const t = i / totalSteps
            const output = evaluator(t)
            if (output) {
                points.push({
                    x: this.baseX + (output.x ?? 0),
                    y: this.baseY + (output.y ?? 0),
                })
            }
        }

        // Draw dashed path
        this.drawDashedPath(points)

        // Draw keyframe dots (on top of path)
        keyframes.forEach((kf, idx) => {
            this.drawDot(idx, kf)
        })
    }

    private drawDashedPath(points: { x: number; y: number }[]) {
        if (points.length < 2) return

        const g = this.pathGraphics
        g.lineStyle({ width: 1.5, color: PATH_COLOR, alpha: PATH_ALPHA })

        let drawing = true
        let segmentRemaining = DASH_LENGTH
        let currentIdx = 0

        while (currentIdx < points.length - 1) {
            const p1 = points[currentIdx]!
            const p2 = points[currentIdx + 1]!
            const dx = p2.x - p1.x
            const dy = p2.y - p1.y
            const segLen = Math.sqrt(dx * dx + dy * dy)

            if (segLen === 0) {
                currentIdx++
                continue
            }

            let consumed = 0

            while (consumed < segLen) {
                const remaining = segLen - consumed
                const step = Math.min(segmentRemaining, remaining)
                const ratio1 = consumed / segLen
                const ratio2 = (consumed + step) / segLen
                const x1 = p1.x + dx * ratio1
                const y1 = p1.y + dy * ratio1
                const x2 = p1.x + dx * ratio2
                const y2 = p1.y + dy * ratio2

                if (drawing) {
                    g.moveTo(x1, y1)
                    g.lineTo(x2, y2)
                }

                consumed += step
                segmentRemaining -= step

                if (segmentRemaining <= 0) {
                    drawing = !drawing
                    segmentRemaining = drawing ? DASH_LENGTH : GAP_LENGTH
                }
            }

            currentIdx++
        }
    }

    private drawDot(index: number, kf: TransformKeyframe) {
        const x = this.baseX + (kf.x ?? 0)
        const y = this.baseY + (kf.y ?? 0)
        const isSelected = index === this.selectedIndex
        const radius = isSelected ? DOT_SELECTED_RADIUS : DOT_RADIUS

        const dot = new PIXI.Graphics()
        dot.beginFill(isSelected ? DOT_SELECTED_COLOR : DOT_COLOR)
        dot.drawCircle(0, 0, radius)
        dot.endFill()

        if (isSelected) {
            dot.lineStyle({ width: 2, color: PATH_COLOR })
            dot.drawCircle(0, 0, radius)
        }

        dot.position.set(x, y)
        dot.eventMode = 'static'
        dot.cursor = 'pointer'
        dot.hitArea = new PIXI.Circle(0, 0, radius + 4)

        // Click to select
        dot.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation()
            this.callbacks.onKeyframeSelect?.(index)

            // Start drag
            this.draggingDotIndex = index
            this.dragStartGlobal = { x: e.global.x, y: e.global.y }
            this.dragStartLocal = { x: dot.position.x, y: dot.position.y }

            const stage = this.getStage()
            if (stage) {
                stage.eventMode = 'static'
                // eslint-disable-next-line @typescript-eslint/unbound-method
                stage.on('pointermove', this.onDotDragMove, this)
                // eslint-disable-next-line @typescript-eslint/unbound-method
                stage.on('pointerup', this.onDotDragEnd, this)
                // eslint-disable-next-line @typescript-eslint/unbound-method
                stage.on('pointerupoutside', this.onDotDragEnd, this)
            }
        })

        this.dotsContainer.addChild(dot)
    }

    private onDotDragMove(e: PIXI.FederatedPointerEvent) {
        if (this.draggingDotIndex < 0) return

        const deltaX = e.global.x - this.dragStartGlobal.x
        const deltaY = e.global.y - this.dragStartGlobal.y

        // Move the dot visually
        const dot = this.dotsContainer.children[this.draggingDotIndex]
        if (dot) {
            dot.position.set(
                this.dragStartLocal.x + deltaX,
                this.dragStartLocal.y + deltaY,
            )
        }

        this.callbacks.onKeyframeDrag?.(this.draggingDotIndex, deltaX, deltaY)
    }

    private onDotDragEnd(_e: PIXI.FederatedPointerEvent) {
        const stage = this.getStage()
        if (stage) {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointermove', this.onDotDragMove, this)
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointerup', this.onDotDragEnd, this)
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointerupoutside', this.onDotDragEnd, this)
        }

        if (this.draggingDotIndex >= 0) {
            this.callbacks.onKeyframeDragEnd?.(this.draggingDotIndex)
        }
        this.draggingDotIndex = -1
    }

    private getStage(): PIXI.Container | null {
        let p: PIXI.Container | null = this.parent
        while (p?.parent) p = p.parent
        return p
    }

    dispose() {
        const stage = this.getStage()
        if (stage) {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointermove', this.onDotDragMove, this)
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointerup', this.onDotDragEnd, this)
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stage.off('pointerupoutside', this.onDotDragEnd, this)
        }
        this.pathGraphics.destroy()
        this.dotsContainer.destroy({ children: true })
    }
}
