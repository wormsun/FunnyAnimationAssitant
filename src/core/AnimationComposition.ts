/**
 * AnimationComposition
 *
 * 共享的多轨道输出合成逻辑，供正式运行时播放器 (GenericAnimationPlayer)
 * 以及动画编辑工作台 (AnimationWorkbench) 复用，避免两边实现分叉。
 *
 * 合成规则（与原 GenericAnimationPlayer.applyOutputs 一致）：
 * - Transform: 位移/旋转累加，缩放相乘；支持每条轨道自己的 pivot 补偿
 * - Visibility: alpha 相乘
 * - Effect (numeric deltas): 位移/旋转累加，(1 + deltaScale) 相乘，(1 + deltaAlpha) 相乘
 *
 * 注意：Effect 的滤镜/粒子/特效状态（glow/motionBlur/wave/ribbon/…）是
 * stateful 资源，由调用方按自己的缓存策略负责安装与清理，不在此处处理。
 */

import type * as PIXI from 'pixi.js'

import type {
    AnimationOutput,
    EffectTrackOutput,
    TransformTrackOutput,
    VisibilityTrackOutput,
} from '@/types/animation'

/** 单个目标对象上多条轨道合成后的最终变换增量 */
export interface ComposedTransform {
    deltaX: number
    deltaY: number
    deltaRotation: number
    scaleMultX: number
    scaleMultY: number
    alphaProduct: number
}

/** 合成时的上下文（基准变换 + 对象包围盒 + PIXI pivot） */
export interface CompositionContext {
    baseRotation: number
    baseScaleX: number
    baseScaleY: number
    /** 对象包围盒：用于 pivot 百分比换算到局部坐标 */
    objectBoundsX: number
    objectBoundsY: number
    objectWidth: number
    objectHeight: number
    /** PIXI 容器当前的 pivot（rotation/scale 真实旋转中心） */
    pivotX: number
    pivotY: number
}

/** 创建一个空的累加器（单位元） */
export function createEmptyComposedTransform(): ComposedTransform {
    return {
        deltaX: 0,
        deltaY: 0,
        deltaRotation: 0,
        scaleMultX: 1,
        scaleMultY: 1,
        alphaProduct: 1,
    }
}

/**
 * 累加一条 Transform 轨道的输出。
 * 完整复制 GenericAnimationPlayer.applyOutputs 中 transform 分支的逻辑，
 * 包含 flipX 合并到 sx、pivot 位置补偿。
 */
export function accumulateTransformOutput(
    acc: ComposedTransform,
    t: TransformTrackOutput,
    ctx: CompositionContext,
): void {
    const flipFactor = t.flipX ? -1 : 1
    const sx = (t.scaleX ?? 1) * flipFactor
    const sy = t.scaleY ?? 1
    const rot = t.rotation ?? 0

    const pivot = t.pivot
    if (pivot) {
        // pivot 补偿：pivot 为对象本地坐标系像素值（与 container.pivot 同坐标系）
        // 相对 PIXI pivot 的偏移 dx/dy
        const dx = pivot.x - ctx.pivotX
        const dy = pivot.y - ctx.pivotY

        const bx = ctx.baseScaleX * dx
        const by = ctx.baseScaleY * dy
        const ax = ctx.baseScaleX * sx * dx
        const ay = ctx.baseScaleY * sy * dy
        const cosB = Math.cos(ctx.baseRotation)
        const sinB = Math.sin(ctx.baseRotation)
        const cosA = Math.cos(ctx.baseRotation + rot)
        const sinA = Math.sin(ctx.baseRotation + rot)
        const beforeX = cosB * bx - sinB * by
        const beforeY = sinB * bx + cosB * by
        const afterX = cosA * ax - sinA * ay
        const afterY = sinA * ax + cosA * ay
        acc.deltaX += (beforeX - afterX) + (t.x ?? 0)
        acc.deltaY += (beforeY - afterY) + (t.y ?? 0)
    } else {
        acc.deltaX += t.x ?? 0
        acc.deltaY += t.y ?? 0
    }

    acc.deltaRotation += rot
    acc.scaleMultX *= sx
    acc.scaleMultY *= sy
}

/** 累加一条 Visibility 轨道输出 */
export function accumulateVisibilityOutput(
    acc: ComposedTransform,
    v: VisibilityTrackOutput,
): void {
    acc.alphaProduct *= v.alpha ?? 1
}

/** 特效 numeric delta（与 DynamicEffectManager.EffectOutput / EffectTrackOutput 的数值字段兼容） */
export interface EffectNumericDelta {
    deltaX?: number | undefined
    deltaY?: number | undefined
    deltaRotation?: number | undefined
    deltaScaleX?: number | undefined
    deltaScaleY?: number | undefined
    deltaAlpha?: number | undefined
}

/** 累加一条 Effect 轨道的 numeric delta（不处理滤镜） */
export function accumulateEffectDelta(
    acc: ComposedTransform,
    d: EffectNumericDelta | null | undefined,
): void {
    if (!d) return
    acc.deltaX += d.deltaX ?? 0
    acc.deltaY += d.deltaY ?? 0
    acc.deltaRotation += d.deltaRotation ?? 0
    if (d.deltaScaleX !== undefined) acc.scaleMultX *= 1 + d.deltaScaleX
    if (d.deltaScaleY !== undefined) acc.scaleMultY *= 1 + d.deltaScaleY
    if (d.deltaAlpha !== undefined) acc.alphaProduct *= 1 + d.deltaAlpha
}

/**
 * 合成多条 AnimationOutput 到单个 ComposedTransform。
 *
 * @param outputs 各条轨道的 AnimationOutput（通常每条轨道一个）
 * @param ctx    合成上下文
 * @param evaluateEffect 供调用方自定义：把一条 EffectTrackOutput 转换为 numeric delta。
 *               - 正式播放器：走 effectManager + jelly/squash 预计算分支
 *               - 工作台：走 DynamicEffectManager.calculateWithProgress（已预算好 delta）
 *               传入 undefined 表示本次合成不累加 effect deltas（仅 transform + visibility）。
 */
export function composeAnimationOutputs(
    outputs: AnimationOutput[],
    ctx: CompositionContext,
    evaluateEffect?: (e: EffectTrackOutput) => EffectNumericDelta | null,
): ComposedTransform {
    const acc = createEmptyComposedTransform()

    for (const output of outputs) {
        for (const t of output.transforms) {
            accumulateTransformOutput(acc, t, ctx)
        }
        for (const v of output.visibilities) {
            accumulateVisibilityOutput(acc, v)
        }
        if (evaluateEffect) {
            for (const e of output.effects) {
                accumulateEffectDelta(acc, evaluateEffect(e))
            }
        }
    }

    return acc
}

/** 基础姿态（用于写回 container） */
export interface BaseTransformState {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    alpha: number
}

/**
 * 将合成后的变换一次性写回 container。
 * 等价于 GenericAnimationPlayer.applyOutputs 末尾的写入代码。
 */
export function applyComposedTransformToContainer(
    container: PIXI.Container,
    base: BaseTransformState,
    composed: ComposedTransform,
): void {
    container.x = base.x + composed.deltaX
    container.y = base.y + composed.deltaY
    container.rotation = base.rotation + composed.deltaRotation
    container.scale.x = base.scaleX * composed.scaleMultX
    container.scale.y = base.scaleY * composed.scaleMultY
    container.alpha = base.alpha * composed.alphaProduct
}
