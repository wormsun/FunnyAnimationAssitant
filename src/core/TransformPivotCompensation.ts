/**
 * TransformPivotCompensation
 *
 * 当 transform 轨道的 pivot（变换点）发生变化时，逐关键帧补偿 (x, y) 位移，
 * 保证每个关键帧时刻的图像中心视觉位置不跳。
 *
 * 公式（与 useSceneRenderer 非委托 setup 分支的 store.x/y 补偿等价）：
 *     Δorigin = newPivot - oldPivot
 *     sx = baseObj.scaleX * baseFlipSign * kf.scaleX * kfFlipFactor
 *     sy = baseObj.scaleY * kf.scaleY
 *     rot = baseObj.rotation + kf.rotation
 *     adjustX = Δorigin.x * (sx * cos(rot) − baseFlipSign) − Δorigin.y * sy * sin(rot)
 *     adjustY = Δorigin.x * sx * sin(rot)             + Δorigin.y * (sy * cos(rot) − 1)
 *
 * 设计为纯函数、无副作用（直接修改传入 track 的 keyframes.x/y），方便单元测试。
 */

import type { TransformKeyframe, TransformTrack } from '@/types/animation'

export interface PivotCompensationBaseObject {
    rotation: number
    scaleX: number
    scaleY: number
    flipX?: boolean | undefined
}

export interface Vec2 {
    x: number
    y: number
}

/**
 * 对 track 的每个关键帧应用 pivot 改变的位置补偿。
 *
 * @param track     transform 轨道（原地修改 keyframes.x/y）
 * @param baseObj   目标对象的基准姿态（动画挂载时刻的 rotation/scale/flipX）
 * @param oldPivot  旧 pivot（local 像素）
 * @param newPivot  新 pivot（local 像素）
 * @returns         实际产生补偿的关键帧数量（Δ 小于阈值时返回 0）
 */
export function compensateTrackKeyframesForPivotChange(
    track: TransformTrack,
    baseObj: PivotCompensationBaseObject,
    oldPivot: Vec2,
    newPivot: Vec2,
    epsilon = 1e-6,
): number {
    const dOriginX = newPivot.x - oldPivot.x
    const dOriginY = newPivot.y - oldPivot.y

    if (Math.abs(dOriginX) <= epsilon && Math.abs(dOriginY) <= epsilon) {
        return 0
    }

    const baseFlipSign = baseObj.flipX ? -1 : 1
    const baseScaleXSigned = baseObj.scaleX * baseFlipSign
    const baseScaleY = baseObj.scaleY
    const baseRotation = baseObj.rotation

    let compensated = 0
    for (const kf of track.keyframes) {
        compensated += applyPivotCompensationToKeyframe(
            kf,
            { baseFlipSign, baseScaleXSigned, baseScaleY, baseRotation },
            dOriginX,
            dOriginY,
        )
    }
    return compensated
}

interface KeyframeCompensationCtx {
    baseFlipSign: number
    baseScaleXSigned: number
    baseScaleY: number
    baseRotation: number
}

function applyPivotCompensationToKeyframe(
    kf: TransformKeyframe,
    ctx: KeyframeCompensationCtx,
    dOriginX: number,
    dOriginY: number,
): number {
    const kfFlipFactor = (kf.flipX ?? false) ? -1 : 1
    const sx = ctx.baseScaleXSigned * (kf.scaleX ?? 1) * kfFlipFactor
    const sy = ctx.baseScaleY * (kf.scaleY ?? 1)
    const rot = ctx.baseRotation + (kf.rotation ?? 0)
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const adjustX = dOriginX * (sx * cos - ctx.baseFlipSign) - dOriginY * sy * sin
    const adjustY = dOriginX * sx * sin + dOriginY * (sy * cos - 1)
    kf.x = (kf.x ?? 0) + adjustX
    kf.y = (kf.y ?? 0) + adjustY
    return 1
}
