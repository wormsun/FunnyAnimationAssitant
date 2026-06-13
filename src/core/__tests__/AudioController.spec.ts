/**
 * AudioController.spec.ts
 *
 * computeAudioState 纯函数单元测试
 */

import { describe, expect, it } from 'vitest'

import { computeAudioState, type AudioBlockInfo } from '@/core/AudioController'
import type { SceneObject, SetAudioAction } from '@/types/screenplay'

// ============================================================================
// Helpers
// ============================================================================

function createAudioObject(overrides?: Partial<SceneObject>): SceneObject {
    return {
        id: 'audio-1',
        type: 'audio',
        refId: 'sound-ref-1',
        x: 0, y: 0,
        zIndex: 0,
        ...overrides,
    } as SceneObject
}

function createBlockInfo(
    startTime: number,
    actions: { slotIndex: number; target: string; params: SetAudioAction['params'] }[],
    slots?: { startTime: number }[],
): AudioBlockInfo {
    const mappedSlots = slots?.map((s, i) => ({
        index: i,
        startTime: s.startTime,
        duration: 1000,
        type: 'subtitle' as const,
        text: '',
    }))
    return {
        startTime,
        blockActions: actions.map((a, i) => ({
            type: 'set_audio' as const,
            slotIndex: a.slotIndex,
            target: a.target,
            id: `audio-action-${i}`,
            category: 'point' as const,
            params: a.params,
        })),
        ...(mappedSlots ? { slots: mappedSlots } : {}),
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('computeAudioState', () => {
    describe('初始状态（无 Action）', () => {
        it('默认 playbackState 为 stop 时，shouldPlay 为 false', () => {
            const obj = createAudioObject()
            const result = computeAudioState(obj, [], 0, 0)
            expect(result.shouldPlay).toBe(false)
        })

        it('playbackState 为 play 时，shouldPlay 为 true', () => {
            const obj = createAudioObject({
                playbackState: 'play',
                volume: 0.8,
                loop: true,
            } as Partial<SceneObject>)
            const result = computeAudioState(obj as SceneObject, [], 500, 0)
            expect(result.shouldPlay).toBe(true)
            expect(result.targetVolume).toBe(0.8)
            expect(result.loop).toBe(true)
            expect(result.playTime).toBe(0)
        })
    })

    describe('Play Action', () => {
        it('在 Action 时间点之后应该播放', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [{
                    slotIndex: 0,
                    target: 'audio-1',
                    params: { action: 'play', volume: 0.7, loop: false, fadeIn: 0.5 },
                }], [{ startTime: 100 }]),
            ]
            const result = computeAudioState(obj, blocks, 200, 0)
            expect(result.shouldPlay).toBe(true)
            expect(result.targetVolume).toBe(0.7)
            expect(result.loop).toBe(false)
            expect(result.fadeIn).toBe(0.5)
            expect(result.playTime).toBe(100) // blockStart(0) + slotStart(100)
        })

        it('在 Action 时间点之前应该不播放', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [{
                    slotIndex: 0,
                    target: 'audio-1',
                    params: { action: 'play', volume: 1.0, loop: false },
                }], [{ startTime: 500 }]),
            ]
            const result = computeAudioState(obj, blocks, 200, 0)
            expect(result.shouldPlay).toBe(false)
        })

        it('后续 Play Action 应该覆盖前一个', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [
                    {
                        slotIndex: 0,
                        target: 'audio-1',
                        params: { action: 'play', volume: 0.5, loop: false },
                    },
                    {
                        slotIndex: 1,
                        target: 'audio-1',
                        params: { action: 'play', volume: 0.9, loop: true },
                    },
                ], [{ startTime: 100 }, { startTime: 500 }]),
            ]
            const result = computeAudioState(obj, blocks, 600, 0)
            expect(result.shouldPlay).toBe(true)
            expect(result.targetVolume).toBe(0.9)
            expect(result.loop).toBe(true)
            expect(result.playTime).toBe(500)
        })
    })

    describe('Stop Action', () => {
        it('Stop Action 后应该停止播放', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [
                    {
                        slotIndex: 0,
                        target: 'audio-1',
                        params: { action: 'play', volume: 1.0, loop: true },
                    },
                    {
                        slotIndex: 1,
                        target: 'audio-1',
                        params: { action: 'stop', fadeOut: 0 },
                    },
                ], [{ startTime: 0 }, { startTime: 1000 }]),
            ]
            const result = computeAudioState(obj, blocks, 1500, 0)
            expect(result.shouldPlay).toBe(false)
        })

        it('Stop Action 带 fadeOut 时，处于 FadeOut 区间内', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [
                    {
                        slotIndex: 0,
                        target: 'audio-1',
                        params: { action: 'play', volume: 1.0, loop: true },
                    },
                    {
                        slotIndex: 1,
                        target: 'audio-1',
                        params: { action: 'stop', fadeOut: 2 }, // 2秒 fadeOut
                    },
                ], [{ startTime: 0 }, { startTime: 1000 }]),
            ]
            // 在 stop 点 (1000ms) 之后，fadeOut 结束 (3000ms) 之前
            const result = computeAudioState(obj, blocks, 2000, 0)
            expect(result.shouldPlay).toBe(true)
            expect(result.inFadeOutTail).toBe(true)
            expect(result.fadeOutDuration).toBe(2)
            expect(result.stopTime).toBe(1000)
        })

        it('fadeOut 结束后应该停止播放', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [
                    {
                        slotIndex: 0,
                        target: 'audio-1',
                        params: { action: 'play', volume: 1.0, loop: true },
                    },
                    {
                        slotIndex: 1,
                        target: 'audio-1',
                        params: { action: 'stop', fadeOut: 1 }, // 1秒 fadeOut
                    },
                ], [{ startTime: 0 }, { startTime: 1000 }]),
            ]
            // fadeOut 结束后 (1000 + 1000 = 2000ms)
            const result = computeAudioState(obj, blocks, 2500, 0)
            expect(result.shouldPlay).toBe(false)
        })
    })

    describe('自然结束 FadeOut（非循环）', () => {
        it('非循环 + 有 fadeOut + 已知时长 → 自然结束前 FadeOut', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [{
                    slotIndex: 0,
                    target: 'audio-1',
                    params: { action: 'play', volume: 1.0, loop: false, fadeOut: 1 }, // 1秒 fadeOut
                }], [{ startTime: 0 }]),
            ]
            // 音频 5 秒，fadeOut 1 秒 → autoStopStartTime = 0 + 5000 - 1000 = 4000ms
            const result = computeAudioState(obj, blocks, 4500, 5)
            expect(result.shouldPlay).toBe(true)
            expect(result.inFadeOutTail).toBe(true)
            expect(result.stopTime).toBe(4000)
        })

        it('自然结束后应该停止', () => {
            const obj = createAudioObject()
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [{
                    slotIndex: 0,
                    target: 'audio-1',
                    params: { action: 'play', volume: 1.0, loop: false, fadeOut: 1 },
                }], [{ startTime: 0 }]),
            ]
            const result = computeAudioState(obj, blocks, 6000, 5)
            expect(result.shouldPlay).toBe(false)
        })
    })

    describe('不同对象的隔离', () => {
        it('不应该匹配其他对象的 Action', () => {
            const obj = createAudioObject({ id: 'audio-1' })
            const blocks: AudioBlockInfo[] = [
                createBlockInfo(0, [{
                    slotIndex: 0,
                    target: 'audio-2', // 不同对象
                    params: { action: 'play', volume: 1.0, loop: true },
                }], [{ startTime: 0 }]),
            ]
            const result = computeAudioState(obj, blocks, 500, 0)
            expect(result.shouldPlay).toBe(false)
        })
    })
})
