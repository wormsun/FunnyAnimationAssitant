/**
 * AnimationPlayer.spec.ts
 * 
 * AnimationPlayer 和 AnimationPlayerManager 单元测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AnimationPlayer, AnimationPlayerManager } from '@/core/AnimationPlayer'
import type { AnimationDefinition } from '@/types/animation'

// Mock AnimationTrackEvaluator
vi.mock('@/core/AnimationTrackEvaluator', () => ({
    AUTO_DURATION_MARKER: -1,
    AnimationTrackEvaluator: {
        evaluate: () => ({ trackType: 'transform', transforms: {} }),
        getTrackDuration: (track: { duration?: number }) => track.duration ?? 1000
    },
    mergeTrackOutputs: () => ({ transforms: {}, partStates: {} })
}))

// 测试用 Animation 定义
function createTestAnimation(overrides?: Partial<AnimationDefinition>): AnimationDefinition {
    return {
        type: 'track',
        id: 'test-anim-1',
        name: 'test-animation',
        loop: false,
        tracks: [
            {
                trackType: 'transform',
                duration: 1000,
                easing: 'linear',
                keyframes: [
                    { time: 0, x: 0, y: 0 },
                    { time: 1, x: 100, y: 50 }
                ]
            }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides
    } as AnimationDefinition
}

describe('AnimationPlayer', () => {
    let player: AnimationPlayer

    beforeEach(() => {
        player = new AnimationPlayer()
    })

    describe('初始状态', () => {
        it('应该以 stopped 状态开始', () => {
            expect(player.state).toBe('stopped')
            expect(player.isStopped).toBe(true)
            expect(player.isPlaying).toBe(false)
            expect(player.isPaused).toBe(false)
            expect(player.isFilled).toBe(false)
        })

        it('应该有默认的进度和速度', () => {
            expect(player.progress).toBe(0)
            expect(player.speed).toBe(1)
            expect(player.loop).toBe(false)
        })

        it('应该没有当前动画', () => {
            expect(player.currentAnimation).toBeNull()
        })
    })

    describe('play()', () => {
        it('应该开始播放动画', () => {
            const animation = createTestAnimation()
            player.play(animation)

            expect(player.state).toBe('playing')
            expect(player.isPlaying).toBe(true)
            expect(player.currentAnimation).toBe(animation)
        })

        it('应该计算动画时长', () => {
            const animation = createTestAnimation()
            player.play(animation)

            expect(player.duration).toBe(1000)
        })

        it('应该使用 Animation 定义的 loop 设置', () => {
            const animation = createTestAnimation({ loop: true })
            player.play(animation)

            expect(player.loop).toBe(true)
        })

        it('应该允许通过参数覆盖 loop 设置', () => {
            const animation = createTestAnimation({ loop: false })
            player.play(animation, { loop: true })

            expect(player.loop).toBe(true)
        })

        it('应该允许设置播放速度', () => {
            const animation = createTestAnimation()
            player.play(animation, { speed: 2.0 })

            expect(player.speed).toBe(2.0)
        })

        it('reset: false 时应该保持当前进度', () => {
            const animation = createTestAnimation()
            player.play(animation)

            // 模拟一些进度
            player.update(500)
            const progressBefore = player.progress

            // 重新播放，不重置
            player.play(animation, { reset: false })

            expect(player.progress).toBe(progressBefore)
        })
    })

    describe('stop()', () => {
        it('应该停止播放并重置进度', () => {
            const animation = createTestAnimation()
            player.play(animation)
            player.update(500)

            player.stop()

            expect(player.state).toBe('stopped')
            expect(player.isStopped).toBe(true)
            expect(player.progress).toBe(0)
        })
    })

    describe('pause() / resume()', () => {
        it('应该暂停正在播放的动画', () => {
            const animation = createTestAnimation()
            player.play(animation)

            player.pause()

            expect(player.state).toBe('paused')
            expect(player.isPaused).toBe(true)
            expect(player.isPlaying).toBe(false)
        })

        it('应该恢复暂停的动画', () => {
            const animation = createTestAnimation()
            player.play(animation)
            player.pause()

            player.resume()

            expect(player.state).toBe('playing')
            expect(player.isPlaying).toBe(true)
        })

        it('暂停时不应该进度更新', () => {
            const animation = createTestAnimation()
            player.play(animation)
            player.update(200)
            const progressBefore = player.progress

            player.pause()
            player.update(100)

            expect(player.progress).toBe(progressBefore)
        })
    })

    describe('update()', () => {
        it('应该根据时间推进进度', () => {
            const animation = createTestAnimation() // duration: 1000ms
            player.play(animation)

            player.update(500) // 50% 进度

            expect(player.progress).toBeCloseTo(0.5, 1)
        })

        it('应该考虑播放速度', () => {
            const animation = createTestAnimation()
            player.play(animation, { speed: 2.0 })

            player.update(250) // 以 2x 速度更新 250ms = 500ms 进度

            expect(player.progress).toBeCloseTo(0.5, 1)
        })

        it('非循环动画完成后应该停止', () => {
            const animation = createTestAnimation({ loop: false })
            player.play(animation)

            player.update(1500) // 超过动画时长

            expect(player.state).toBe('stopped')
            // 注意：非循环动画完成时 progress 保留为 1（最终帧），而非重置为 0
            expect(player.progress).toBe(1)
        })

        it('循环动画应该重新开始', () => {
            const animation = createTestAnimation({ loop: true })
            player.play(animation)

            player.update(1500) // 1.5 倍动画时长

            expect(player.state).toBe('playing')
            expect(player.progress).toBeCloseTo(0.5, 1)
        })

        it('fillMode: forwards 完成后应该进入 filled 状态并保持输出', () => {
            const callback = vi.fn()
            const filledPlayer = new AnimationPlayer(callback)
            const animation = createTestAnimation({ fillMode: 'forwards', loop: false })

            filledPlayer.play(animation)
            const output = filledPlayer.update(1500)

            expect(filledPlayer.state).toBe('filled')
            expect(filledPlayer.isPlaying).toBe(false)
            expect(filledPlayer.isFilled).toBe(true)
            expect(output).not.toBeNull()

            const secondOutput = filledPlayer.update(100)
            expect(secondOutput).not.toBeNull()
            expect(callback).toHaveBeenCalled()
        })

        it('filled 状态下 stop() 应正确转为 stopped', () => {
            const animation = createTestAnimation({ fillMode: 'forwards', loop: false })

            player.play(animation)
            player.update(1500)
            expect(player.state).toBe('filled')

            player.stop()
            expect(player.state).toBe('stopped')
            expect(player.isStopped).toBe(true)
            expect(player.isFilled).toBe(false)
            expect(player.progress).toBe(0)
        })

        it('filled 状态下 play() 新动画应正确转为 playing', () => {
            const animation1 = createTestAnimation({ fillMode: 'forwards', loop: false })
            const animation2 = createTestAnimation({ loop: true })

            player.play(animation1)
            player.update(1500)
            expect(player.state).toBe('filled')

            player.play(animation2)
            expect(player.state).toBe('playing')
            expect(player.isPlaying).toBe(true)
            expect(player.isFilled).toBe(false)
            expect(player.progress).toBe(0)
        })
    })

    describe('seek()', () => {
        it('应该跳转到指定进度', () => {
            const animation = createTestAnimation()
            player.play(animation)

            player.seek(0.75)

            expect(player.progress).toBe(0.75)
        })

        it('应该将进度限制在 0-1 范围内', () => {
            const animation = createTestAnimation()
            player.play(animation)

            player.seek(1.5)
            expect(player.progress).toBe(1)

            player.seek(-0.5)
            expect(player.progress).toBe(0)
        })
    })

    describe('setSpeed() / setLoop()', () => {
        it('应该更新播放速度', () => {
            const animation = createTestAnimation()
            player.play(animation)

            player.setSpeed(0.5)
            expect(player.speed).toBe(0.5)
        })

        it('应该更新循环设置', () => {
            const animation = createTestAnimation()
            player.play(animation)

            player.setLoop(true)
            expect(player.loop).toBe(true)
        })
    })

    describe('回调', () => {
        it('构造函数应该接受 onUpdate 回调', () => {
            const callback = vi.fn()
            const playerWithCallback = new AnimationPlayer(callback)
            const animation = createTestAnimation()

            playerWithCallback.play(animation)
            playerWithCallback.update(100)

            expect(callback).toHaveBeenCalled()
        })

        it('setOnUpdate 应该设置回调', () => {
            const callback = vi.fn()
            const animation = createTestAnimation()

            player.setOnUpdate(callback)
            player.play(animation)
            player.update(100)

            expect(callback).toHaveBeenCalled()
        })

        it('fillMode: forwards 自然结束时应该触发 onStopCallback', () => {
            const callback = vi.fn()
            const animation = createTestAnimation({ fillMode: 'forwards', loop: false })

            player.setOnStop(callback)
            player.play(animation)
            player.update(1500)

            expect(callback).toHaveBeenCalledTimes(1)
        })
    })
})

describe('AnimationPlayerManager', () => {
    let manager: AnimationPlayerManager

    beforeEach(() => {
        manager = new AnimationPlayerManager()
    })

    describe('getOrCreate()', () => {
        it('应该创建新的播放器', () => {
            const player = manager.getOrCreate('player1')

            expect(player).toBeInstanceOf(AnimationPlayer)
            expect(manager.getAllIds()).toContain('player1')
        })

        it('应该返回已存在的播放器', () => {
            const player1 = manager.getOrCreate('player1')
            const player2 = manager.getOrCreate('player1')

            expect(player1).toBe(player2)
        })
    })

    describe('get()', () => {
        it('应该返回已存在的播放器', () => {
            manager.getOrCreate('player1')
            const player = manager.get('player1')

            expect(player).toBeDefined()
        })

        it('不存在时应该返回 undefined', () => {
            const player = manager.get('nonexistent')

            expect(player).toBeUndefined()
        })
    })

    describe('remove()', () => {
        it('应该移除播放器', () => {
            manager.getOrCreate('player1')

            const removed = manager.remove('player1')

            expect(removed).toBe(true)
            expect(manager.get('player1')).toBeUndefined()
        })

        it('移除前应该停止播放器', () => {
            const player = manager.getOrCreate('player1')
            const animation = createTestAnimation()
            player.play(animation)

            manager.remove('player1')

            expect(player.isStopped).toBe(true)
        })
    })

    describe('updateAll()', () => {
        it('应该更新所有播放器', () => {
            const player1 = manager.getOrCreate('player1')
            const player2 = manager.getOrCreate('player2')
            const animation = createTestAnimation()

            player1.play(animation)
            player2.play(animation)

            const outputs = manager.updateAll(500)

            expect(outputs.size).toBe(2)
            expect(outputs.has('player1')).toBe(true)
            expect(outputs.has('player2')).toBe(true)
        })
    })

    describe('stopAll()', () => {
        it('应该停止所有播放器', () => {
            const player1 = manager.getOrCreate('player1')
            const player2 = manager.getOrCreate('player2')
            const animation = createTestAnimation()

            player1.play(animation)
            player2.play(animation)

            manager.stopAll()

            expect(player1.isStopped).toBe(true)
            expect(player2.isStopped).toBe(true)
        })
    })

    describe('clear()', () => {
        it('应该清空所有播放器', () => {
            manager.getOrCreate('player1')
            manager.getOrCreate('player2')

            manager.clear()

            expect(manager.getAllIds().length).toBe(0)
        })
    })

    describe('getPlayingCount()', () => {
        it('应该返回正在播放的播放器数量', () => {
            const player1 = manager.getOrCreate('player1')
            const player2 = manager.getOrCreate('player2')
            manager.getOrCreate('player3') // 创建但不播放，用于测试计数
            const animation = createTestAnimation()

            player1.play(animation)
            player2.play(animation)
            // player3 不播放

            expect(manager.getPlayingCount()).toBe(2)
        })
    })
})
