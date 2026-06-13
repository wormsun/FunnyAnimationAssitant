/**
 * AnimationTrackEvaluator.spec.ts
 * 
 * 轨道求值器单元测试
 */

import { describe, expect, it } from 'vitest'

import { AnimationTrackEvaluator, mergeTrackOutputs } from '@/core/AnimationTrackEvaluator'
import type {
    EffectTrack,
    FrameSequenceTrack,
    TransformTrack,
    TransformTrackOutput,
    VisibilityTrack,
    VisibilityTrackOutput
} from '@/types/animation'

describe('AnimationTrackEvaluator', () => {
    describe('evaluateTransform', () => {
        it('空关键帧应该返回默认值', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: []
            }

            const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

            expect(result.x).toBe(0)
            expect(result.y).toBe(0)
            expect(result.scaleX).toBe(1)
            expect(result.scaleY).toBe(1)
            expect(result.rotation).toBe(0)
        })

        it('单个关键帧应该返回该帧的值', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 45 }
                ]
            }

            const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

            expect(result.x).toBe(100)
            expect(result.y).toBe(50)
            expect(result.scaleX).toBe(2)
            expect(result.scaleY).toBe(2)
            expect(result.rotation).toBe(45)
        })

        it('两个关键帧应该进行线性插值', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0, y: 0 },
                    { time: 1, x: 100, y: 50 }
                ]
            }

            const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

            expect(result.x).toBeCloseTo(50, 0)
            expect(result.y).toBeCloseTo(25, 0)
        })

        it('应该支持 targetObjectId', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                targetObjectId: 'part-1',
                duration: 1000,
                easing: 'linear',
                keyframes: [{ time: 0, x: 0, y: 0 }]
            }

            const result = AnimationTrackEvaluator.evaluateTransform(track, 0)

            expect(result.targetObjectId).toBe('part-1')
        })

        it('应该支持 pivot 锚点', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                pivot: { x: 0.5, y: 0.5 },
                keyframes: [{ time: 0, x: 0, y: 0 }]
            }

            const result = AnimationTrackEvaluator.evaluateTransform(track, 0)

            expect(result.pivot).toEqual({ x: 0.5, y: 0.5 })
        })

        // v11.1: flipX 离散求值测试
        describe('flipX 离散求值 (v11.1)', () => {
            it('单个关键帧应该返回该帧的 flipX 值', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: [{ time: 0, x: 0, y: 0, flipX: true }]
                }

                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

                expect(result.flipX).toBe(true)
            })

            it('空关键帧应该返回 undefined', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: []
                }

                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

                expect(result.flipX).toBeUndefined()
            })

            it('flipX 应该使用 Step 逻辑 - t < 0.5 时取前一帧', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: [
                        { time: 0, x: 0, y: 0, flipX: false },
                        { time: 1, x: 100, y: 0, flipX: true }
                    ]
                }

                // 进度 0.3 -> t = 0.3 < 0.5，应该取 prev.flipX = false
                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.3)

                expect(result.flipX).toBe(false)
            })

            it('flipX 应该使用 Step 逻辑 - t >= 0.5 时取后一帧', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: [
                        { time: 0, x: 0, y: 0, flipX: false },
                        { time: 1, x: 100, y: 0, flipX: true }
                    ]
                }

                // 进度 0.7 -> t = 0.7 >= 0.5，应该取 next.flipX = true
                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.7)

                expect(result.flipX).toBe(true)
            })

            it('flipX 在 t = 0.5 时应该取后一帧', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: [
                        { time: 0, x: 0, y: 0, flipX: false },
                        { time: 1, x: 100, y: 0, flipX: true }
                    ]
                }

                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

                expect(result.flipX).toBe(true)
            })

            it('flipX undefined 时应该正确传递', () => {
                const track: TransformTrack = {
                    trackType: 'transform',
                    duration: 1000,
                    easing: 'linear',
                    keyframes: [
                        { time: 0, x: 0, y: 0 },  // flipX 未定义
                        { time: 1, x: 100, y: 0 }  // flipX 未定义
                    ]
                }

                const result = AnimationTrackEvaluator.evaluateTransform(track, 0.5)

                expect(result.flipX).toBeUndefined()
            })
        })
    })

    describe('evaluateVisibility', () => {
        it('空关键帧应该返回默认 alpha=1', () => {
            const track: VisibilityTrack = {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: []
            }

            const result = AnimationTrackEvaluator.evaluateVisibility(track, 0.5)

            expect(result.alpha).toBe(1)
        })

        it('应该在可见性关键帧之间插值', () => {
            const track: VisibilityTrack = {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, alpha: 0 },
                    { time: 1, alpha: 1 }
                ]
            }

            const result = AnimationTrackEvaluator.evaluateVisibility(track, 0.5)

            expect(result.alpha).toBeCloseTo(0.5, 1)
        })
    })

    // v11.52: evaluateFrameSequence 测试已删除
    // 帧动画直接使用 AnimatedSprite.play() 播放，不再需要评估器

    describe('evaluateEffect', () => {
        it('应该返回特效参数', () => {
            const track: EffectTrack = {
                trackType: 'effect',
                effectParams: { type: 'breathe', intensity: 0.5, speed: 2 }
            }

            const result = AnimationTrackEvaluator.evaluateEffect(track, 0, 1000)

            expect(result.effectParams.type).toBe('breathe')
            expect(result.effectParams).toHaveProperty('intensity', 0.5)
            expect(result.effectParams).toHaveProperty('speed', 2)
        })

        it('应该支持 targetObjectId', () => {
            const track: EffectTrack = {
                trackType: 'effect',
                targetObjectId: 'body',
                effectParams: { type: 'wave', amplitude: 10 }
            }

            const result = AnimationTrackEvaluator.evaluateEffect(track, 0, 1000)

            expect(result.targetObjectId).toBe('body')
        })
    })

    describe('evaluate (dispatch)', () => {
        it('应该正确分发 transform 轨道', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [{ time: 0, x: 50, y: 25 }]
            }

            const result = AnimationTrackEvaluator.evaluate(track, 0)

            expect(result).toHaveProperty('x', 50)
            expect(result).toHaveProperty('y', 25)
        })

        it('应该正确分发 visibility 轨道', () => {
            const track: VisibilityTrack = {
                trackType: 'visibility',
                duration: 1000,
                easing: 'linear',
                keyframes: [{ time: 0, alpha: 0.5 }]
            }

            const result = AnimationTrackEvaluator.evaluate(track, 0)

            expect(result).toHaveProperty('alpha')
        })

        it('应该对 frame_sequence 轨道抛出错误', () => {
            const track: FrameSequenceTrack = {
                trackType: 'frame_sequence',
                targetObjectId: 'part-1',
                assetId: 'test-asset'
            }

            // v11.52: frame_sequence 轨道现在应该抛出错误
            expect(() => AnimationTrackEvaluator.evaluate(track, 0)).toThrow()
        })

        it('应该正确分发 effect 轨道', () => {
            const track: EffectTrack = {
                trackType: 'effect',
                effectParams: { type: 'glow', color: '#ff0000' }
            }

            const result = AnimationTrackEvaluator.evaluate(track, 0)

            expect(result).toHaveProperty('effectParams')
        })
    })

    describe('getTrackDuration', () => {
        it('应该返回轨道的 duration', () => {
            const track: TransformTrack = {
                trackType: 'transform',
                duration: 2000,
                easing: 'linear',
                keyframes: []
            }

            const duration = AnimationTrackEvaluator.getTrackDuration(track)

            expect(duration).toBe(2000)
        })

        it('无 duration 时应该返回默认值', () => {
            const track: EffectTrack = {
                trackType: 'effect',
                effectParams: { type: 'breathe' }
            }

            const duration = AnimationTrackEvaluator.getTrackDuration(track)

            expect(duration).toBeGreaterThan(0)
        })
    })
})

describe('mergeTrackOutputs', () => {
    it('应该合并多个轨道输出', () => {
        const transformOutput: TransformTrackOutput = {
            targetObjectId: undefined,
            x: 10,
            y: 20,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            pivot: undefined
        }
        const visibilityOutput: VisibilityTrackOutput = {
            targetObjectId: undefined,
            alpha: 0.5
        }

        const result = mergeTrackOutputs([transformOutput, visibilityOutput])

        // mergeTrackOutputs 返回的是数组格式
        expect(result.transforms).toBeDefined()
        expect(Array.isArray(result.transforms)).toBe(true)
        expect(result.transforms.length).toBe(1)
    })

    it('空输出数组应该返回空结果', () => {
        const result = mergeTrackOutputs([])

        expect(result.transforms).toEqual([])
        expect(result.visibilities).toEqual([])
    })
})
