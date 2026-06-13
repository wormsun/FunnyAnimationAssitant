/**
 * AnimationTrackEvaluator.SchemeB.spec.ts
 *
 * v13 Scheme B —— 分裂关键帧（valueIn/valueOut）求值语义
 */

import { describe, expect, it } from 'vitest'

import { AnimationTrackEvaluator } from '@/core/AnimationTrackEvaluator'
import type { TransformTrack, VisibilityTrack } from '@/types/animation'

describe('AnimationTrackEvaluator · Scheme B split keyframes', () => {
    describe('transform', () => {
        it('未设 out 的关键帧应与旧数据完全等价（valueIn === valueOut）', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0 },
                    { time: 1, x: 100 },
                ],
            }
            // 段内中点应为 50（完全兼容旧线性插值）
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0.5).x).toBe(50)
        })

        it('中间帧设 out.x：左右两段用各自端点插值产生跳变', () => {
            // 段 [0, 0.5]：0 → 10
            // 段 [0.5, 1]：100 → 100
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0 },
                    { time: 0.5, x: 10, out: { x: 100 } },
                    { time: 1, x: 100 },
                ],
            }

            // 段 1 中点：0→10 → 5
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0.25).x).toBe(5)
            // 关键帧时刻：段 2 起点 valueOut=100（forward-facing）
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0.5).x).toBe(100)
            // 段 2 中点：100→100 → 100
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0.75).x).toBe(100)
        })

        it('out 仅覆写部分字段时，未覆写字段 fall-through 到顶层', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0, y: 0 },
                    // 只覆写 y 的 valueOut；x 在 out 侧仍用顶层 x=50
                    { time: 0.5, x: 50, y: 10, out: { y: 100 } },
                    { time: 1, x: 100, y: 100 },
                ],
            }
            // 段 1 末尾（playhead=0.5）：forward-facing valueOut → x=50, y=100
            const atMid = AnimationTrackEvaluator.evaluateTransform(track, 0.5)
            expect(atMid.x).toBe(50)
            expect(atMid.y).toBe(100)
        })

        it('末帧的 out 不生效（播放到末尾显示 valueIn）', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0 },
                    { time: 1, x: 100, out: { x: 999 } }, // 末帧 out 语义为动画外，不应在播放内显示
                ],
            }
            // progress=1 落在末帧 → 显示 valueIn=100
            expect(AnimationTrackEvaluator.evaluateTransform(track, 1).x).toBe(100)
        })

        it('首帧的 out 用作播放起始值（valueOut forward-facing）', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0, out: { x: 50 } }, // 首帧 valueIn=0（暂停前），valueOut=50（开播）
                    { time: 1, x: 100 },
                ],
            }
            // progress=0 → 使用首帧 valueOut=50
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0).x).toBe(50)
            // 中点：50→100 线性 → 75
            expect(AnimationTrackEvaluator.evaluateTransform(track, 0.5).x).toBe(75)
        })
    })

    describe('visibility', () => {
        it('alpha 分裂：中间帧 valueOut 覆写产生跳变', () => {
            const track: VisibilityTrack = {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, alpha: 0 },
                    { time: 0.5, alpha: 0.2, out: { alpha: 1 } },
                    { time: 1, alpha: 1 },
                ],
            }
            // 段 1 中点：0→0.2 → 0.1
            expect(AnimationTrackEvaluator.evaluateVisibility(track, 0.25).alpha).toBeCloseTo(0.1, 5)
            // 关键帧时刻 → 取 valueOut=1
            expect(AnimationTrackEvaluator.evaluateVisibility(track, 0.5).alpha).toBe(1)
        })

        it('未设 out 时向后兼容旧插值行为', () => {
            const track: VisibilityTrack = {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, alpha: 0 },
                    { time: 1, alpha: 1 },
                ],
            }
            expect(AnimationTrackEvaluator.evaluateVisibility(track, 0.5).alpha).toBeCloseTo(0.5, 5)
        })
    })
})
