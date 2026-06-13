/**
 * AnimationController.spec.ts
 *
 * AnimationController 单元测试
 * 测试纯函数辅助工具和核心方法（通过 mock AnimationHost）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
    AnimationController,
    calculateRuntimeDuration,
    getActionStartTime,
    hasAutoDuration,
    type AnimationHost,
} from '@/core/AnimationController'
import type { AnimationDefinition } from '@/types/animation'
import type { Action, RuntimeSlot, SetAnimAction } from '@/types/screenplay'
import type { TTSTimingFile } from '@/utils/ttsTiming'

// ============================================================================
// Helpers
// ============================================================================

function createSlots(...startTimes: number[]): RuntimeSlot[] {
    return startTimes.map((t, i) => ({
        index: i,
        startTime: t,
        duration: 500,
        type: 'subtitle' as const,
        text: '',
    }))
}

function createSetAnimAction(
    target: string,
    slotIndex: number,
    animations: SetAnimAction['params']['animations'],
    reset?: boolean,
): SetAnimAction {
    return {
        type: 'set_anim',
        target,
        slotIndex,
        id: `action-${target}-${slotIndex}`,
        category: 'point' as const,
        params: {
            animations: animations ?? [],
            reset: reset ?? true,
        },
    }
}

function createMockHost(overrides?: Partial<AnimationHost>): AnimationHost {
    return {
        getAnimationPlayer: vi.fn().mockReturnValue(null),
        getObjectContainer: vi.fn().mockReturnValue(null),
        getSceneObjects: vi.fn().mockReturnValue([]),
        getAnimationDefinition: vi.fn().mockReturnValue(null),
        ...overrides,
    }
}

function createTestDefinition(overrides?: Partial<AnimationDefinition>): AnimationDefinition {
    return {
        type: 'track',
        id: 'def-1',
        name: 'test-def',
        loop: false,
        tracks: [{ trackType: 'transform', duration: 1000, easing: 'linear', keyframes: [] }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    } as AnimationDefinition
}

function createTTSTimingFile(
    segments: TTSTimingFile['speechSegments'],
    animationSpeechSegments: TTSTimingFile['animationSpeechSegments'] = segments,
): TTSTimingFile {
    return {
        schemaVersion: 1,
        audioPath: 'cache/tts/test.mp3',
        audioDurationMs: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
        analyzer: {
            method: 'rms_silence_detect',
            frameMs: 10,
            thresholdDb: -35,
            minPauseMs: 100,
            mergeGapMs: 80,
            minSpeechMs: 60,
            animationStopPauseMs: 150,
        },
        pauseSegments: [],
        speechSegments: segments,
        animationSpeechSegments,
    }
}

// ============================================================================
// Pure Function Tests
// ============================================================================

describe('getActionStartTime', () => {
    it('slots 为空时返回 0', () => {
        const action = { slotIndex: 0 } as Action
        expect(getActionStartTime(action, [])).toBe(0)
    })

    it('应返回对应 slot 的 startTime', () => {
        const action = { slotIndex: 1 } as Action
        const slots = createSlots(0, 500, 1200)
        expect(getActionStartTime(action, slots)).toBe(500)
    })

    it('slotIndex 超出范围时返回 0', () => {
        const action = { slotIndex: 5 } as Action
        const slots = createSlots(0, 500)
        expect(getActionStartTime(action, slots)).toBe(0)
    })
})

describe('hasAutoDuration', () => {
    it('有 auto duration 的 transform 轨道应返回 true', () => {
        const def = { tracks: [{ trackType: 'transform', duration: 'auto' as const }] }
        expect(hasAutoDuration(def)).toBe(true)
    })

    it('有 auto duration 的 visibility 轨道应返回 true', () => {
        const def = { tracks: [{ trackType: 'visibility', duration: 'auto' as const }] }
        expect(hasAutoDuration(def)).toBe(true)
    })

    it('固定 duration 应返回 false', () => {
        const def = { tracks: [{ trackType: 'transform', duration: 1000 }] }
        expect(hasAutoDuration(def)).toBe(false)
    })

    it('非 transform/visibility 轨道即使有 auto 也应返回 false', () => {
        const def = { tracks: [{ trackType: 'color', duration: 'auto' as const }] }
        expect(hasAutoDuration(def)).toBe(false)
    })
})

describe('calculateRuntimeDuration', () => {
    it('有匹配 stop action 时返回到 stop 的时长', () => {
        const actions: Action[] = [
            createSetAnimAction('obj-1', 0, [{ animName: 'walk', action: 'play' }]),
            createSetAnimAction('obj-1', 1, [{ animName: 'walk', action: 'stop' }]),
        ]
        const slots = createSlots(0, 800)
        // play at 0, stop at 800 → duration = 800
        const result = calculateRuntimeDuration(actions, slots, 2000, 'obj-1', 'walk', 0)
        expect(result).toBe(800)
    })

    it('无匹配 stop action 时延伸到 Block 结束', () => {
        const actions: Action[] = [
            createSetAnimAction('obj-1', 0, [{ animName: 'walk', action: 'play' }]),
        ]
        const slots = createSlots(0)
        const result = calculateRuntimeDuration(actions, slots, 3000, 'obj-1', 'walk', 0)
        expect(result).toBe(3000) // blockDuration - playStartTime
    })

    it('stop 在 play 之前的不应匹配', () => {
        const actions: Action[] = [
            createSetAnimAction('obj-1', 0, [{ animName: 'walk', action: 'stop' }]),
            createSetAnimAction('obj-1', 1, [{ animName: 'walk', action: 'play' }]),
        ]
        const slots = createSlots(0, 500)
        // play at 500, stop at 0 (before play) → should extend to block end
        const result = calculateRuntimeDuration(actions, slots, 2000, 'obj-1', 'walk', 500)
        expect(result).toBe(1500) // 2000 - 500
    })
})

// ============================================================================
// AnimationController Method Tests
// ============================================================================

describe('AnimationController', () => {
    let controller: AnimationController
    let triggeredAnimations: Set<string>

    beforeEach(() => {
        triggeredAnimations = new Set()
    })

    describe('processSetAnimActions - 对象动画', () => {
        it('应该在正确的时间触发对象动画播放', () => {
            const mockPlayer = {
                playAnimation: vi.fn(),
                stopAnimation: vi.fn(),
            }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'wave', action: 'play' }]),
            ]
            const slots = createSlots(100)

            controller.processSetAnimActions(actions, slots, 200, 3000)

            expect(mockPlayer.playAnimation).toHaveBeenCalledWith(
                'wave', mockDef, expect.objectContaining({ reset: true }),
            )
        })

        it('时间未到时不应触发动画', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'wave', action: 'play' }]),
            ]
            const slots = createSlots(500)

            controller.processSetAnimActions(actions, slots, 200, 3000)

            expect(mockPlayer.playAnimation).not.toHaveBeenCalled()
        })

        it('同一动画不应重复触发', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'wave', action: 'play' }]),
            ]
            const slots = createSlots(0)

            controller.processSetAnimActions(actions, slots, 500, 3000)
            controller.processSetAnimActions(actions, slots, 600, 3000)

            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(1)
        })

        it('stop 命令应该停止动画', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'wave', action: 'stop' }]),
            ]
            const slots = createSlots(0)

            controller.processSetAnimActions(actions, slots, 500, 3000)

            expect(mockPlayer.stopAnimation).toHaveBeenCalledWith('wave')
        })

        it('tts_speech 应只在 TTS 有声片段内播放，并在气口停顿停止', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition({ timingMode: 'tts_speech' })
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'talk', action: 'play' }]),
            ]
            const slots = createSlots(0)
            const timing = createTTSTimingFile([
                { startMs: 0, endMs: 300, durationMs: 300 },
                { startMs: 500, endMs: 800, durationMs: 300 },
            ])

            controller.processSetAnimActions(actions, slots, 100, 1000, { blockId: 'block-1', ttsTiming: timing })
            controller.processSetAnimActions(actions, slots, 350, 1000, { blockId: 'block-1', ttsTiming: timing })
            controller.processSetAnimActions(actions, slots, 550, 1000, { blockId: 'block-1', ttsTiming: timing })

            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(2)
            expect(mockPlayer.stopAnimation).toHaveBeenCalledTimes(1)
            expect(mockPlayer.stopAnimation).toHaveBeenCalledWith('talk')
        })

        it('tts_speech 应使用 animationSpeechSegments 作为动画门控片段', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition({ timingMode: 'tts_speech' })
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'talk', action: 'play' }]),
            ]
            const slots = createSlots(0)
            const timing = createTTSTimingFile(
                [
                    { startMs: 0, endMs: 300, durationMs: 300 },
                    { startMs: 420, endMs: 800, durationMs: 380 },
                ],
                [
                    { startMs: 0, endMs: 800, durationMs: 800 },
                ],
            )

            controller.processSetAnimActions(actions, slots, 100, 1000, { blockId: 'block-1', ttsTiming: timing })
            controller.processSetAnimActions(actions, slots, 350, 1000, { blockId: 'block-1', ttsTiming: timing })
            controller.processSetAnimActions(actions, slots, 500, 1000, { blockId: 'block-1', ttsTiming: timing })

            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(1)
            expect(mockPlayer.stopAnimation).not.toHaveBeenCalled()
        })

        it('tts_speech timing 正在加载时不应先按连续播放启动', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'talk', action: 'play', timingMode: 'tts_speech' }]),
            ]
            const slots = createSlots(0)

            controller.processSetAnimActions(actions, slots, 100, 1000)
            controller.processSetAnimActions(actions, slots, 200, 1000)

            expect(mockPlayer.playAnimation).not.toHaveBeenCalled()
            expect(mockPlayer.stopAnimation).not.toHaveBeenCalled()
        })

        it('tts_speech 确认无 timing 文件时应降级为连续播放', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'talk', action: 'play', timingMode: 'tts_speech' }]),
            ]
            const slots = createSlots(0)

            controller.processSetAnimActions(actions, slots, 100, 1000, { blockId: 'block-1', ttsTiming: null })
            controller.processSetAnimActions(actions, slots, 200, 1000, { blockId: 'block-1', ttsTiming: null })

            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(1)
            expect(mockPlayer.stopAnimation).not.toHaveBeenCalled()
        })

        it('显式 stop 后 tts_speech play 不应在后续有声片段重新启动', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'talk', action: 'play', timingMode: 'tts_speech' }]),
                createSetAnimAction('obj-1', 1, [{ animName: 'talk', action: 'stop' }]),
            ]
            const slots = createSlots(0, 300)
            const timing = createTTSTimingFile([
                { startMs: 0, endMs: 250, durationMs: 250 },
                { startMs: 400, endMs: 700, durationMs: 300 },
            ])

            controller.processSetAnimActions(actions, slots, 100, 1000, { blockId: 'block-1', ttsTiming: timing })
            controller.processSetAnimActions(actions, slots, 450, 1000, { blockId: 'block-1', ttsTiming: timing })

            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(1)
            expect(mockPlayer.stopAnimation).toHaveBeenCalledTimes(1)
        })
    })

    describe('processAutoStopOnBlockEnd', () => {
        it('应该停止 autoStopOnBlockEnd 的动画', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [
                    { animName: 'walk', action: 'play' }, // autoStopOnBlockEnd 默认 true
                ]),
            ]

            controller.processAutoStopOnBlockEnd(actions)

            expect(mockPlayer.stopAnimation).toHaveBeenCalledWith('walk')
        })

        it('autoStopOnBlockEnd=false 的动画不应被停止', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [
                    { animName: 'breathe', action: 'play', autoStopOnBlockEnd: false },
                ]),
            ]

            controller.processAutoStopOnBlockEnd(actions)

            expect(mockPlayer.stopAnimation).not.toHaveBeenCalled()
        })

        it('stop 动作本身不应触发自动停止', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [
                    { animName: 'walk', action: 'stop' },
                ]),
            ]

            controller.processAutoStopOnBlockEnd(actions)

            expect(mockPlayer.stopAnimation).not.toHaveBeenCalled()
        })
    })

    describe('processInitialAnimationStates', () => {
        it('应该播放对象的初始动画', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    {
                        id: 'obj-1', type: 'prop', refId: 'prop-ref-1',
                        initialAnimations: [{ name: 'idle', loop: true }],
                    },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            controller.processInitialAnimationStates()

            expect(mockPlayer.playAnimation).toHaveBeenCalledWith(
                'idle', mockDef, { loop: true, speed: 1.0, reset: true },
            )
        })

        it('应该调用 onAnimationTriggered 处理 prop 初始动画', () => {
            const onTriggered = vi.fn()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    {
                        id: 'prop-1', type: 'prop', refId: 'prop-ref-1',
                        initialAnimations: [{ name: 'spin', loop: true }],
                    },
                ]),
                getObjectContainer: vi.fn().mockReturnValue({ visible: true }),
                getAnimationDefinition: vi.fn().mockReturnValue(createTestDefinition()),
                onAnimationTriggered: onTriggered,
            })
            controller = new AnimationController(host, triggeredAnimations)

            controller.processInitialAnimationStates()

            expect(onTriggered).toHaveBeenCalledWith(
                'prop-1', '_initial', 'play',
            )
        })
    })

    describe('resetTriggeredAnimations', () => {
        it('重置后应该允许重新触发', () => {
            const mockPlayer = { playAnimation: vi.fn(), stopAnimation: vi.fn() }
            const mockDef = createTestDefinition()
            const host = createMockHost({
                getSceneObjects: vi.fn().mockReturnValue([
                    { id: 'obj-1', type: 'prop', refId: 'prop-ref-1' },
                ]),
                getAnimationPlayer: vi.fn().mockReturnValue(mockPlayer),
                getAnimationDefinition: vi.fn().mockReturnValue(mockDef),
            })
            controller = new AnimationController(host, triggeredAnimations)

            const actions: Action[] = [
                createSetAnimAction('obj-1', 0, [{ animName: 'wave', action: 'play' }]),
            ]
            const slots = createSlots(0)

            controller.processSetAnimActions(actions, slots, 500, 3000)
            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(1)

            controller.resetTriggeredAnimations()
            controller.processSetAnimActions(actions, slots, 500, 3000)
            expect(mockPlayer.playAnimation).toHaveBeenCalledTimes(2)
        })
    })
})
