/**
 * TransformPivotCompensation.spec.ts
 *
 * 验证：pivot 改变后，补偿公式能让"图像中心世界位置"在每个关键帧保持不变。
 */

import { describe, expect, it } from 'vitest'

import {
    compensateTrackKeyframesForPivotChange,
    type PivotCompensationBaseObject,
} from '@/core/TransformPivotCompensation'
import type { TransformTrack } from '@/types/animation'

/**
 * 计算给定关键帧在"某 pivot 下"的图像中心世界位置。
 * 模拟 PIXI 容器的变换顺序：
 *   world = storePos + R(rot) · S(scale) · (0 − pivot) + flipSign · pivot_correction
 *
 * 为了和 useSceneRenderer 的实际实现对齐，这里使用和
 * applyTransformOriginPivot 一致的推导：
 *   container.pivot = PivotBase + origin
 *   container.position = storeX + flipSign·originX
 * 因此图像中心（PivotBase 处）的世界位置：
 *   V = (storeX + f·origin) + R·S·(PivotBase − (PivotBase+origin))
 *     = storeX + f·origin − R·S·origin
 *
 * 补偿后 storeX' = storeX + adjust，应该让 V 恒定。
 */
function computeCenterWorldPos(
    storeX: number,
    storeY: number,
    origin: { x: number; y: number },
    baseObj: PivotCompensationBaseObject,
    kf: { rotation?: number; scaleX?: number; scaleY?: number; flipX?: boolean },
): { x: number; y: number } {
    const baseFlipSign = baseObj.flipX ? -1 : 1
    const kfFlipFactor = (kf.flipX ?? false) ? -1 : 1
    const sx = baseObj.scaleX * baseFlipSign * (kf.scaleX ?? 1) * kfFlipFactor
    const sy = baseObj.scaleY * (kf.scaleY ?? 1)
    const rot = baseObj.rotation + (kf.rotation ?? 0)
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)

    // (R·S) · (-origin)
    const rx = -origin.x * sx * cos + origin.y * sy * sin
    const ry = -origin.x * sx * sin - origin.y * sy * cos

    return {
        x: storeX + baseFlipSign * origin.x + rx,
        y: storeY + origin.y + ry,
    }
}

describe('TransformPivotCompensation', () => {
    it('Δpivot 为 0 时不改动关键帧', () => {
        const track: TransformTrack = {
            trackType: 'transform',
            keyframes: [{ time: 0, x: 1, y: 2, rotation: 0.5 }],
        }
        const baseObj: PivotCompensationBaseObject = { rotation: 0, scaleX: 1, scaleY: 1 }
        const changed = compensateTrackKeyframesForPivotChange(
            track,
            baseObj,
            { x: 10, y: 20 },
            { x: 10, y: 20 },
        )
        expect(changed).toBe(0)
        expect(track.keyframes[0]!.x).toBe(1)
        expect(track.keyframes[0]!.y).toBe(2)
    })

    it('无旋转无缩放时补偿后中心位置恒定', () => {
        const track: TransformTrack = {
            trackType: 'transform',
            keyframes: [{ time: 0.5, x: 5, y: -3, rotation: 0 }],
        }
        const baseObj: PivotCompensationBaseObject = { rotation: 0, scaleX: 1, scaleY: 1 }
        const storeBaseX = 100
        const storeBaseY = 200

        const kf = track.keyframes[0]!
        const oldPivot = { x: 10, y: 10 }
        const newPivot = { x: 30, y: -5 }
        const beforeCenter = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            oldPivot,
            baseObj,
            kf,
        )
        compensateTrackKeyframesForPivotChange(track, baseObj, oldPivot, newPivot)
        const afterCenter = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            newPivot,
            baseObj,
            kf,
        )
        expect(afterCenter.x).toBeCloseTo(beforeCenter.x, 6)
        expect(afterCenter.y).toBeCloseTo(beforeCenter.y, 6)
    })

    it('关键帧带旋转时补偿后中心位置恒定', () => {
        const track: TransformTrack = {
            trackType: 'transform',
            keyframes: [
                { time: 0, x: 0, y: 0, rotation: 0 },
                { time: 1, x: 0, y: 0, rotation: Math.PI / 3 },
            ],
        }
        const baseObj: PivotCompensationBaseObject = { rotation: 0, scaleX: 1, scaleY: 1 }
        const storeBaseX = 100
        const storeBaseY = 200
        const oldPivot = { x: 0, y: 0 }
        const newPivot = { x: 25, y: 40 }

        const kfs = track.keyframes.map(k => ({ ...k }))
        const before = kfs.map(kf =>
            computeCenterWorldPos(storeBaseX + (kf.x ?? 0), storeBaseY + (kf.y ?? 0), oldPivot, baseObj, kf),
        )

        compensateTrackKeyframesForPivotChange(track, baseObj, oldPivot, newPivot)

        const after = track.keyframes.map(kf =>
            computeCenterWorldPos(storeBaseX + (kf.x ?? 0), storeBaseY + (kf.y ?? 0), newPivot, baseObj, kf),
        )

        for (let i = 0; i < before.length; i++) {
            expect(after[i]!.x).toBeCloseTo(before[i]!.x, 6)
            expect(after[i]!.y).toBeCloseTo(before[i]!.y, 6)
        }
    })

    it('基准对象带旋转 + 关键帧带缩放时补偿后中心位置恒定', () => {
        const track: TransformTrack = {
            trackType: 'transform',
            keyframes: [
                { time: 0, x: 10, y: 20, scaleX: 1.5, scaleY: 0.8, rotation: Math.PI / 4 },
            ],
        }
        const baseObj: PivotCompensationBaseObject = { rotation: Math.PI / 6, scaleX: 1.2, scaleY: 1.1 }
        const storeBaseX = 50
        const storeBaseY = -30
        const oldPivot = { x: 5, y: 5 }
        const newPivot = { x: -10, y: 15 }

        const kf = track.keyframes[0]!
        const before = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            oldPivot,
            baseObj,
            kf,
        )
        compensateTrackKeyframesForPivotChange(track, baseObj, oldPivot, newPivot)
        const after = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            newPivot,
            baseObj,
            kf,
        )
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
    })

    it('基准 flipX=true 时补偿公式方向正确', () => {
        const track: TransformTrack = {
            trackType: 'transform',
            keyframes: [{ time: 0, x: 0, y: 0, rotation: Math.PI / 5 }],
        }
        const baseObj: PivotCompensationBaseObject = { rotation: 0, scaleX: 1, scaleY: 1, flipX: true }
        const storeBaseX = 0
        const storeBaseY = 0
        const oldPivot = { x: 0, y: 0 }
        const newPivot = { x: 20, y: 10 }

        const kf = track.keyframes[0]!
        const before = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            oldPivot,
            baseObj,
            kf,
        )
        compensateTrackKeyframesForPivotChange(track, baseObj, oldPivot, newPivot)
        const after = computeCenterWorldPos(
            storeBaseX + (kf.x ?? 0),
            storeBaseY + (kf.y ?? 0),
            newPivot,
            baseObj,
            kf,
        )
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
    })
})
