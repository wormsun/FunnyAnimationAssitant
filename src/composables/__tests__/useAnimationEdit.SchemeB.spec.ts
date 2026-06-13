/**
 * useAnimationEdit —— Scheme B (v13 valueIn/valueOut 拆分) 编辑 API 单元测试
 *
 * 覆盖：splitKeyframeAt / mergeKeyframeAt / isKeyframeStructurallySplit
 *      / updateKeyframeOut / updateVisibilityKeyframeOut
 * 以及：持久化往返（JSON 序列化/反序列化保留 `out` 字段）
 */

import { describe, expect, it } from 'vitest'

import type { AnimationDefinition, TransformKeyframe, VisibilityKeyframe } from '@/types/animation'

import { useAnimationEdit } from '../useAnimationEdit'

function makeTransformAnim(): AnimationDefinition {
    const kfs: TransformKeyframe[] = [
        { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        { time: 0.5, x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 1 },
        { time: 1, x: 200, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
    ]
    return {
        id: 'anim-test',
        type: 'track',
        name: 'test',
        loop: false,
        createdAt: 0,
        updatedAt: 0,
        tracks: [
            {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: kfs,
            },
        ],
    }
}

function makeVisibilityAnim(): AnimationDefinition {
    const kfs: VisibilityKeyframe[] = [
        { time: 0, alpha: 1 },
        { time: 0.5, alpha: 0.5 },
        { time: 1, alpha: 0 },
    ]
    return {
        id: 'anim-vis',
        type: 'track',
        name: 'vis',
        loop: false,
        createdAt: 0,
        updatedAt: 0,
        tracks: [
            {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: kfs,
            },
        ],
    }
}

function makeMixedAnim(): AnimationDefinition {
    return {
        id: 'anim-mixed',
        type: 'track',
        name: 'mixed',
        loop: false,
        createdAt: 0,
        updatedAt: 0,
        tracks: [
            {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                    { time: 0.5, x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 1 },
                    { time: 1, x: 200, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
                ],
            },
            {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, alpha: 1 },
                    { time: 0.5, alpha: 0.5 },
                    { time: 1, alpha: 0 },
                ],
            },
        ],
    }
}

describe('useAnimationEdit — Scheme B splitKeyframeAt / mergeKeyframeAt', () => {
    it('splitKeyframeAt: 将 transform 关键帧 valueIn 字段克隆到 out（语义不变）', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        const ok = ctx.splitKeyframeAt(1)
        expect(ok).toBe(true)
        const kf = ctx.currentTrack.value!.keyframes[1]!
        expect(kf.out).toBeDefined()
        expect(kf.out).toEqual({ x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 1 })
        // 顶层 valueIn 字段保持不变
        expect(kf.x).toBe(100)
        expect(kf.scaleX).toBe(2)
    })

    it('splitKeyframeAt: 已拆分的关键帧重复调用返回 false，不覆盖现有 out', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        ctx.splitKeyframeAt(1)
        const kf = ctx.currentTrack.value!.keyframes[1]!
        kf.out!.x = 999
        expect(ctx.splitKeyframeAt(1)).toBe(false)
        expect(kf.out!.x).toBe(999)
    })

    it('mergeKeyframeAt: 删除 out 恢复单值关键帧', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        ctx.splitKeyframeAt(1)
        expect(ctx.mergeKeyframeAt(1)).toBe(true)
        expect(ctx.currentTrack.value!.keyframes[1]!.out).toBeUndefined()
    })

    it('mergeKeyframeAt: 未拆分的关键帧返回 false', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        expect(ctx.mergeKeyframeAt(1)).toBe(false)
    })

    it('isKeyframeStructurallySplit: 仅当 out 存在且至少有一个字段时返回 true', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        const kfs = ctx.currentTrack.value!.keyframes
        expect(ctx.isKeyframeStructurallySplit(kfs[0])).toBe(false)
        ctx.splitKeyframeAt(1)
        expect(ctx.isKeyframeStructurallySplit(kfs[1])).toBe(true)
        // 手动清空后应视为未拆分
        kfs[1]!.out = {}
        expect(ctx.isKeyframeStructurallySplit(kfs[1])).toBe(false)
    })

    it('updateKeyframeOut: 设置/更新 out 字段', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        ctx.splitKeyframeAt(1)
        ctx.updateKeyframeOut(1, 'x', 500)
        expect(ctx.currentTrack.value!.keyframes[1]!.out!.x).toBe(500)
    })

    it('updateKeyframeOut: 传入 undefined 删除单个 out 字段；out 变空时整体删除', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        const kf = ctx.currentTrack.value!.keyframes[1]!
        // 仅设一个 out 字段
        kf.out = { x: 500 }
        ctx.updateKeyframeOut(1, 'x', undefined)
        expect(kf.out).toBeUndefined()
    })

    it('updateKeyframeOut: 自动初始化 out 对象', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        const kf = ctx.currentTrack.value!.keyframes[1]!
        expect(kf.out).toBeUndefined()
        ctx.updateKeyframeOut(1, 'scaleX', 3)
        expect(kf.out).toEqual({ scaleX: 3 })
    })

    it('splitKeyframeAt (visibility): 克隆 alpha 到 out', () => {
        const ctx = useAnimationEdit({ animation: makeVisibilityAnim() })
        ctx.splitKeyframeAt(1)
        const kf = ctx.currentVisibilityTrack.value!.keyframes[1]!
        expect(kf.out).toEqual({ alpha: 0.5 })
    })

    it('updateVisibilityKeyframeOut: 设置 / 清除 out.alpha', () => {
        const ctx = useAnimationEdit({ animation: makeVisibilityAnim() })
        ctx.splitKeyframeAt(1)
        ctx.updateVisibilityKeyframeOut(1, 0.2)
        expect(ctx.currentVisibilityTrack.value!.keyframes[1]!.out!.alpha).toBe(0.2)
        ctx.updateVisibilityKeyframeOut(1, undefined)
        expect(ctx.currentVisibilityTrack.value!.keyframes[1]!.out).toBeUndefined()
    })
})

describe('useAnimationEdit — Scheme B 持久化往返 (JSON)', () => {
    it('transform: splitKeyframeAt + 自定义 out 字段经 JSON 往返保持不变', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        ctx.splitKeyframeAt(1)
        ctx.updateKeyframeOut(1, 'x', 777)
        ctx.updateKeyframeOut(1, 'rotation', 0.25)

        // 模拟“保存 → 重新加载”
        const serialized = JSON.stringify(ctx.animationDef)
        const parsed = JSON.parse(serialized) as AnimationDefinition
        const ctx2 = useAnimationEdit({ animation: parsed })

        const kf = ctx2.currentTrack.value!.keyframes[1]!
        expect(kf.out).toEqual({ x: 777, y: 50, scaleX: 2, scaleY: 2, rotation: 0.25 })
        expect(kf.x).toBe(100)
        expect(ctx2.isKeyframeStructurallySplit(kf)).toBe(true)
    })

    it('visibility: splitKeyframeAt + out.alpha 经 JSON 往返保持不变', () => {
        const ctx = useAnimationEdit({ animation: makeVisibilityAnim() })
        ctx.splitKeyframeAt(1)
        ctx.updateVisibilityKeyframeOut(1, 0.1)

        const parsed = JSON.parse(JSON.stringify(ctx.animationDef)) as AnimationDefinition
        const ctx2 = useAnimationEdit({ animation: parsed })
        const kf = ctx2.currentVisibilityTrack.value!.keyframes[1]!
        expect(kf.out).toEqual({ alpha: 0.1 })
    })

    it('mergeKeyframeAt 之后 JSON 中不再包含 out 字段', () => {
        const ctx = useAnimationEdit({ animation: makeTransformAnim() })
        ctx.splitKeyframeAt(1)
        ctx.mergeKeyframeAt(1)
        const serialized = JSON.stringify(ctx.animationDef)
        expect(serialized).not.toContain('"out"')
    })
})

describe('useAnimationEdit — clipboard workflows', () => {
    it('copyKeyframe 会记录剪贴板类型，并阻止跨轨道粘贴', () => {
        const ctx = useAnimationEdit({ animation: makeMixedAnim() })

        ctx.selectedKeyframeIndex.value = 1
        ctx.copyKeyframe()

        expect(ctx.hasKeyframeClipboard.value).toBe(true)
        expect(ctx.keyframeClipboardType.value).toBe('transform')
        expect(ctx.canPasteKeyframeToCurrentTrack()).toBe(true)

        ctx.seekTo(0.25)
        const insertIdx = ctx.pasteKeyframe()
        expect(insertIdx).toBe(1)
        expect(ctx.currentTrack.value!.keyframes).toHaveLength(4)
        expect(ctx.currentTrack.value!.keyframes[1]).toMatchObject({
            time: 0.25,
            x: 100,
            y: 50,
            scaleX: 2,
            scaleY: 2,
            rotation: 1,
        })

        ctx.selectTrack(1)
        expect(ctx.canPasteKeyframeToCurrentTrack()).toBe(false)
        expect(ctx.keyframeClipboardType.value).toBe('transform')

        const visibilityCount = ctx.currentVisibilityTrack.value!.keyframes.length
        expect(ctx.pasteKeyframe()).toBe(-1)
        expect(ctx.currentVisibilityTrack.value!.keyframes).toHaveLength(visibilityCount)
    })

    it('copyKeyframe / duplicateKeyframeToPlayhead 支持 visibility 轨道', () => {
        const ctx = useAnimationEdit({ animation: makeMixedAnim() })

        ctx.selectTrack(1)
        ctx.selectedKeyframeIndex.value = 1
        ctx.copyKeyframe()

        expect(ctx.hasKeyframeClipboard.value).toBe(true)
        expect(ctx.keyframeClipboardType.value).toBe('visibility')
        expect(ctx.canPasteKeyframeToCurrentTrack()).toBe(true)
        expect(ctx.canDuplicateKeyframeToPlayhead()).toBe(true)

        ctx.seekTo(0.25)
        const insertIdx = ctx.duplicateKeyframeToPlayhead()
        expect(insertIdx).toBe(1)
        expect(ctx.currentVisibilityTrack.value!.keyframes).toHaveLength(4)
        expect(ctx.currentVisibilityTrack.value!.keyframes[1]).toEqual({ time: 0.25, alpha: 0.5 })
    })
})
