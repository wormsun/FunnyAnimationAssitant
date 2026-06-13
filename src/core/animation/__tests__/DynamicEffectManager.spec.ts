/**
 * DynamicEffectManager.spec.ts
 * 
 * 动态特效管理器单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
    createDynamicEffectManager,
    DynamicEffectManager
} from '@/core/animation/DynamicEffectManager'

describe('DynamicEffectManager', () => {
    let manager: DynamicEffectManager

    beforeEach(() => {
        manager = createDynamicEffectManager()
    })

    describe('基本操作', () => {
        it('应该能添加和移除特效', () => {
            expect(manager.activeCount).toBe(0)

            manager.addEffect('effect1', { type: 'breathe' })
            expect(manager.activeCount).toBe(1)

            manager.removeEffect('effect1')
            expect(manager.activeCount).toBe(0)
        })

        it('应该能暂停和恢复特效', () => {
            manager.addEffect('effect1', { type: 'float' })
            expect(manager.activeCount).toBe(1)

            manager.pauseEffect('effect1')
            expect(manager.activeCount).toBe(0)

            manager.resumeEffect('effect1')
            expect(manager.activeCount).toBe(1)
        })

        it('应该能清除所有特效', () => {
            manager.addEffect('effect1', { type: 'wave' })
            manager.addEffect('effect2', { type: 'breathe' })
            manager.addEffect('effect3', { type: 'float' })
            expect(manager.activeCount).toBe(3)

            manager.clear()
            expect(manager.activeCount).toBe(0)
        })
    })

    describe('wave 特效', () => {
        it('应该产生周期性位移', () => {
            manager.addEffect('wave', {
                type: 'wave',
                amplitude: 10,
                frequency: 1,
                speed: 1
            })

            // 模拟时间推进
            manager.update(0)
            const output0 = manager.evaluate('wave')
            expect(output0).not.toBeNull()
            expect(output0?.deltaX).toBe(0) // sin(0) = 0

            // 推进 250ms (1/4 周期)
            manager.update(250)
            const output250 = manager.evaluate('wave')
            expect(output250?.deltaX).toBeCloseTo(10, 0) // sin(π/2) ≈ 1

            // 推进到 500ms (1/2 周期)
            manager.update(250)
            const output500 = manager.evaluate('wave')
            expect(output500?.deltaX).toBeCloseTo(0, 0) // sin(π) = 0
        })

        it('vertical 模式应该产生 Y 位移', () => {
            manager.addEffect('wave-v', {
                type: 'wave',
                direction: 'vertical',
                amplitude: 5
            })

            manager.update(500)
            const output = manager.evaluate('wave-v')
            expect(output?.deltaY).toBeDefined()
            expect(output?.deltaX).toBeUndefined()
        })
    })

    describe('breathe 特效', () => {
        it('应该产生周期性缩放', () => {
            manager.addEffect('breathe', {
                type: 'breathe',
                intensity: 0.1,
                speed: 1
            })

            manager.update(0)
            const output0 = manager.evaluate('breathe')
            expect(output0?.deltaScaleX).toBe(0) // (1 - cos(0)) / 2 = 0

            // 推进到 500ms (1/2 周期，最大值)
            manager.update(500)
            const output500 = manager.evaluate('breathe')
            expect(output500?.deltaScaleX).toBeCloseTo(0.1, 1) // (1 - cos(π)) / 2 = 1
            expect(output500?.deltaScaleY).toBeCloseTo(0.1, 1)
        })
    })

    describe('float 特效', () => {
        it('应该产生上下浮动', () => {
            manager.addEffect('float', {
                type: 'float',
                amplitude: 20,
                speed: 1
            })

            manager.update(500)
            const output = manager.evaluate('float')
            expect(output?.deltaY).toBeDefined()
            expect(output?.deltaX).toBeDefined() // 也有轻微水平摆动
        })
    })

    describe('glow 特效', () => {
        it('应该产生发光参数', () => {
            manager.addEffect('glow', {
                type: 'glow',
                color: '#ff0000',
                intensity: 0.8,
                size: 15
            })

            manager.update(100)
            const output = manager.evaluate('glow')
            expect(output?.glowColor).toBe('#ff0000')
            expect(output?.glowIntensity).toBeGreaterThan(0)
            expect(output?.glowSize).toBeGreaterThan(0)
        })

        it('应该有脉动效果', () => {
            manager.addEffect('glow', { type: 'glow', intensity: 1, size: 10 })

            // 在 t=0 时计算
            const output0 = manager.evaluate('glow')

            // 推进到 t=250ms（1/4 周期），脉动应该变化
            manager.update(250)
            const output250 = manager.evaluate('glow')

            // 强度应该有变化（因为正弦波在不同相位有不同值）
            expect(output0?.glowIntensity).not.toBeCloseTo(output250?.glowIntensity ?? 0, 2)
        })
    })

    describe('motion_blur 特效', () => {
        it('应该产生运动模糊参数', () => {
            manager.addEffect('motion_blur', {
                type: 'motion_blur',
                velocity: 20,
                angle: 0
            })

            manager.update(100)
            const output = manager.evaluate('motion_blur')
            expect(output?.motionBlurVelocity).toBeDefined()
            expect(output?.motionBlurVelocity?.[0]).toBeGreaterThan(0) // 水平方向
        })

        it('应该根据角度计算速度分量', () => {
            manager.addEffect('motion_blur', { type: 'motion_blur', velocity: 20, angle: 90 })

            manager.update(100)
            const output = manager.evaluate('motion_blur')
            const velocity = output?.motionBlurVelocity

            expect(velocity).toBeDefined()
            if (velocity) {
                // 90 度时，Y 分量应该大于 X 分量
                expect(Math.abs(velocity[1])).toBeGreaterThan(Math.abs(velocity[0]))
            }
        })
    })

    describe('组合特效', () => {
        it('evaluateAll 应该合并多个特效', () => {
            manager.addEffect('breathe', { type: 'breathe', intensity: 0.05 })
            manager.addEffect('float', { type: 'float', amplitude: 10 })

            manager.update(500)
            const combined = manager.evaluateAll()

            // 应该同时有缩放和位移
            expect(combined.deltaScaleX).toBeGreaterThan(0)
            expect(combined.deltaY).toBeDefined()
        })

        it('暂停的特效不应该被计算', () => {
            manager.addEffect('effect1', { type: 'breathe', intensity: 0.1 })
            manager.addEffect('effect2', { type: 'breathe', intensity: 0.1 })

            manager.update(500)
            const beforePause = manager.evaluateAll()

            manager.pauseEffect('effect1')
            const afterPause = manager.evaluateAll()

            // 暂停一个后，缩放应该减少
            expect(afterPause.deltaScaleX).toBeLessThan(beforePause.deltaScaleX ?? 0)
        })
    })

    describe('petrify 特效', () => {
        it('应该返回石化进度', () => {
            manager.addEffect('petrify', {
                type: 'petrify',
                duration: 1.0,
                intensity: 1.0,
                grayScale: true
            })

            // t=0 时 progress 应该是 0
            manager.update(0)
            const output0 = manager.evaluate('petrify')
            expect(output0?.petrifyProgress).toBe(0)
            expect(output0?.petrifyGrayScale).toBe(true)

            // t=500ms (0.5秒) 时 progress 应该是 0.5
            manager.update(500)
            const output500 = manager.evaluate('petrify')
            expect(output500?.petrifyProgress).toBeCloseTo(0.5, 1)

            // t=1000ms 时 progress 应该是 1.0
            manager.update(500)
            const output1000 = manager.evaluate('petrify')
            expect(output1000?.petrifyProgress).toBeCloseTo(1.0, 1)
        })

        it('应该尊重 intensity 参数', () => {
            manager.addEffect('petrify', {
                type: 'petrify',
                duration: 1.0,
                intensity: 0.5  // 只有 50% 强度
            })

            manager.update(1000) // 完成整个 duration
            const output = manager.evaluate('petrify')
            expect(output?.petrifyProgress).toBeCloseTo(0.5, 1) // 最大只到 0.5
        })
    })

    describe('shatter 特效', () => {
        it('应该返回碎裂进度和透明度', () => {
            manager.addEffect('shatter', {
                type: 'shatter',
                duration: 1.5,
                pieceCount: 5,
                explodeForce: 10
            })

            // t=0 时 progress=0, alpha=1
            manager.update(0)
            const output0 = manager.evaluate('shatter')
            expect(output0?.shatterProgress).toBe(0)
            expect(output0?.shatterAlpha).toBeCloseTo(1.0, 1)

            // t=1500ms 时 progress=1, alpha~=0
            manager.update(1500)
            const output1500 = manager.evaluate('shatter')
            expect(output1500?.shatterProgress).toBeCloseTo(1.0, 1)
            expect(output1500?.shatterAlpha).toBeCloseTo(0, 1)
        })

        it('alpha 应该使用 easeOutQuad 衰减', () => {
            manager.addEffect('shatter', {
                type: 'shatter',
                duration: 1.0
            })

            // 在 50% 进度时，easeOutQuad 应该是 0.75，所以 alpha = 0.25
            manager.update(500)
            const output = manager.evaluate('shatter')
            expect(output?.shatterProgress).toBeCloseTo(0.5, 1)
            expect(output?.shatterAlpha).toBeCloseTo(0.25, 1)
        })
    })

    // v11.70: 进度驱动模式测试
    describe('进度驱动模式 (v11.70)', () => {
        it('calculateWithProgress 应该根据 progress 正确计算 jelly 振幅', () => {
            const params = { type: 'jelly' as const, stiffness: 8, damping: 0.3, intensity: 0.3 }

            // progress=0 时应该是最大振幅（cos(0) = 1，decay = 1）
            const output0 = DynamicEffectManager.calculateWithProgress(params, 0, 1000)
            expect(output0.deltaScaleX).toBeCloseTo(0.3, 1) // intensity * 1 * 1

            // progress=0.5 时振幅应该衰减
            const output50 = DynamicEffectManager.calculateWithProgress(params, 0.5, 1000)
            expect(Math.abs(output50.deltaScaleX!)).toBeLessThan(0.3)

            // progress=1 时振幅应该接近 0（阻尼衰减）
            const output100 = DynamicEffectManager.calculateWithProgress(params, 1, 1000)
            expect(Math.abs(output100.deltaScaleX!)).toBeLessThan(0.1)
        })

        it('循环播放时 progress 归零应该重置振幅', () => {
            const params = { type: 'jelly' as const, stiffness: 8, damping: 0.3, intensity: 0.3 }

            // 第一轮结束时的振幅（已衰减）
            const end1 = DynamicEffectManager.calculateWithProgress(params, 1, 1000)

            // 第二轮开始（progress 归零）的振幅
            const start2 = DynamicEffectManager.calculateWithProgress(params, 0, 1000)

            // 第二轮开始的振幅应该重新变大（与第一轮开始相同）
            expect(Math.abs(start2.deltaScaleX!)).toBeGreaterThan(Math.abs(end1.deltaScaleX!))
            expect(start2.deltaScaleX).toBeCloseTo(0.3, 1)
        })

        it('calculateWithProgress 应该根据 progress 正确计算 squash', () => {
            const params = { type: 'squash' as const, intensity: 0.2, speed: 2 }

            // progress=0 时 squash=0（sin(0)=0）
            const output0 = DynamicEffectManager.calculateWithProgress(params, 0, 1000)
            expect(output0.deltaScaleX).toBeCloseTo(0, 1)

            // progress=0.125 时 squash 应该接近最大值（sin(π/2)=1）
            const output125 = DynamicEffectManager.calculateWithProgress(params, 0.125, 1000)
            expect(output125.deltaScaleX).toBeCloseTo(0.2, 1)
            expect(output125.deltaScaleY).toBeCloseTo(-0.2, 1)
        })

        it('calculateWithProgress 对非阻尼类特效也能正常计算', () => {
            const breatheParams = { type: 'breathe' as const, intensity: 0.1, speed: 1 }
            const output = DynamicEffectManager.calculateWithProgress(breatheParams, 0.5, 1000)
            expect(output.deltaScaleX).toBeDefined()
            expect(output.deltaScaleY).toBeDefined()
        })

        it('duration 参数应该正确影响时间基准', () => {
            const params = { type: 'jelly' as const, stiffness: 8, damping: 0.3, intensity: 0.3 }

            // 同样的 progress=0.5，不同的 duration 应该产生不同的结果
            const output1000 = DynamicEffectManager.calculateWithProgress(params, 0.5, 1000)
            const output2000 = DynamicEffectManager.calculateWithProgress(params, 0.5, 2000)

            // 2000ms 的 t=1s，1000ms 的 t=0.5s，衰减程度不同
            expect(output1000.deltaScaleX).not.toBeCloseTo(output2000.deltaScaleX!, 2)
        })
    })
})
