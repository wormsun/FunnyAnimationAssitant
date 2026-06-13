import { describe, expect, it } from 'vitest'

import type { Action, RuntimeSlot } from '@/types/screenplay'

import type { RuntimeCameraState } from '../actionEvaluator'
import type { SceneObject } from '@/types/sceneObject'
import { evaluateObjectState, evaluateObjectStateBySlot, evaluateCameraState } from '../actionEvaluator'

describe('actionEvaluator', () => {

    // Default initial state for testing
    const initialState = {
        id: 'test_obj', type: 'prop', name: 'test', refId: 'ref_test',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        visible: true,
        flipX: false,
        zIndex: 0
    } as SceneObject

    // Phase 4e: 测试中访问 evaluator 返回值的子类型字段
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Phase 4e: asAny removed (character type deleted)

    describe('evaluateObjectStateBySlot (Action Mode - No Interpolation)', () => {

        it('should return initial state if no actions', () => {
            const result = evaluateObjectStateBySlot(initialState, [], 0)
            expect(result).toEqual(expect.objectContaining(initialState))
        })

        it('should apply simple point action (set_transform)', () => {
            const actions: Action[] = [{
                id: 'a1',
                type: 'set_transform',
                category: 'point',
                target: 'obj1',
                slotIndex: 0,
                params: { alpha: 0.5 }
            }]

            // Current slot is 0, action is at 0 -> should apply
            const result = evaluateObjectStateBySlot(initialState, actions, 0)

            expect(result.x).toBe(0) // set_transform only handles visual props in V6.3+? Wait, let's check actionEvaluator.ts implementation.
            // set_transform handles: alpha, visible, flipX, zIndex.
            // tween_transform handles: x, y, scale, rotation.
            // BUT wait, in evaluateObjectStateBySlot implementation:
            // It calls applyPointAction or applyDurationActionFinal.

            // Let's verify applyPointAction logic in source code (it was not strictly shown in previous view, likely imported or defined locally? 
            // Ah, I missed 'applyPointAction' definition in previous view block. It might be local helper not shown or imported?
            // Actually, lines 197 calls applyPointAction(baseState, action).
            // Let's assume standard behavior based on comments:
            // "v6.3 更新：set_transform 仅处理视觉属性 (alpha, visible, flipX, zIndex)"

            expect(result.alpha).toBe(0.5)
            // x/y should NOT change if set_transform is strictly visual.
            // Let's try tween_transform for x/y.
        })

        it('should apply tween_transform final state immediately in Action Mode', () => {
            const actions: Action[] = [{
                id: 'a2',
                type: 'tween_transform', // Duration action
                category: 'duration',
                target: 'obj1',
                slotIndex: 0,
                // duration actions usually have slotSpan
                params: { x: 50, y: 50 }
            } as any]

            // Even if we are at slot 0 (start of action), Action Mode (Edit Mode) usually shows result state?
            // "移除 Slot 限制：总是显示最终状态 (v7.20)" -> Wait, the code says:
            // "无论动作是瞬时还是持续，只要它已经开始，我们就认为在当前 Slot 应该显示其效果"
            // "对于 Duration Action，这等同于显示其“最终状态”或“进行中状态”的目标值"

            const result = evaluateObjectStateBySlot(initialState, actions, 0)
            expect(result.x).toBe(50)
            expect(result.y).toBe(50)
        })

        it('should handle set_transform with alpha and visual params', () => {
            const actions: Action[] = [{
                id: 'c1',
                type: 'set_transform',
                category: 'point',
                target: 'obj1',
                slotIndex: 0,
                params: {
                    alpha: 0.8
                }
            }]

            const result = evaluateObjectStateBySlot(initialState, actions, 0)

            expect(result.alpha).toBe(0.8)
        })

        it('should update alpha via set_transform action', () => {
            const startState = {
                ...initialState,
                alpha: 1
            } as SceneObject

            const action: Action = {
                id: 'action_1',
                type: 'set_transform',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    alpha: 0.3
                },
                category: 'point'
            }

            const result = evaluateObjectStateBySlot(startState, [action], 0)
            expect(result.alpha).toBe(0.3)
        })

        it('should preserve other properties when updating alpha', () => {
            const startState = {
                ...initialState,
                id: 'test_obj2', type: 'prop', name: 'test2', refId: 'ref_test2',
                x: 100,
                y: 200,
                alpha: 1
            } as SceneObject

            const action: Action = {
                id: 'action_1',
                type: 'set_transform',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    alpha: 0.5
                },
                category: 'point'
            }

            const result = evaluateObjectStateBySlot(startState, [action], 0)

            expect(result.alpha).toBe(0.5)
            expect(result.x).toBe(100)
        })

        it('should respect action order (later actions override earlier ones)', () => {
            const actions: Action[] = [
                {
                    id: 'a1',
                    type: 'set_transform',
                    category: 'point',
                    target: 'obj1',
                    slotIndex: 0,
                    params: { alpha: 0.5 }
                },
                {
                    id: 'a2',
                    type: 'set_transform',
                    category: 'point',
                    target: 'obj1',
                    slotIndex: 1,
                    params: { alpha: 1.0 }
                }
            ]

            const result = evaluateObjectStateBySlot(initialState, actions, 1)
            expect(result.alpha).toBe(1.0)
        })
    })

    describe('evaluateObjectState (Preview Mode - With Interpolation)', () => {
        // Mock slots: 1 sec each
        const slots: RuntimeSlot[] = [
            { type: 'subtitle', index: 0, startTime: 0, duration: 1000 },
            { type: 'subtitle', index: 1, startTime: 1000, duration: 1000 }
        ]

        it('should interpolate tween_transform', () => {
            const actions: Action[] = [{
                id: 't1',
                type: 'tween_transform',
                category: 'duration',
                target: 'obj1',
                slotIndex: 0,
                params: { x: 100 }
            } as any]
            // Default slotSpan is 1 -> duration 1000ms. Range: 0-1000ms.

            // At 0ms -> start (0)
            let result = evaluateObjectState(initialState, actions, 0, 2000, slots)
            expect(result.x).toBe(0)

            // At 500ms -> middle (50)
            result = evaluateObjectState(initialState, actions, 500, 2000, slots)
            expect(result.x).toBe(50)

            // At 1000ms -> end (100)
            result = evaluateObjectState(initialState, actions, 1000, 2000, slots)
            expect(result.x).toBe(100)
        })

        it('should respect set_transform in Preview Mode', () => {
            const actions: Action[] = [{
                id: 'c1',
                type: 'set_transform',
                category: 'point',
                target: 'obj1',
                slotIndex: 0,
                params: { alpha: 0.7 }
            }]

            const result = evaluateObjectState(initialState, actions, 100, 2000, slots)
            expect(result.alpha).toBe(0.7)
        })
    })
})

describe('evaluateCameraState (Camera Follow Enhancements)', () => {

    const defaultCameraState: RuntimeCameraState = {
        x: 500,
        y: 500,
        zoom: 1,
        shakeOffsetX: 0,
        shakeOffsetY: 0
    }

    // Target at position (1000, 800)
    const visualCenters = new Map([
        ['char1', { x: 1000, y: 800 }]
    ])

    const slots: RuntimeSlot[] = [
        { type: 'subtitle', index: 0, startTime: 0, duration: 2000 }
    ]

    const makeFollowAction = (params: Record<string, unknown>): Action => ({
        id: 'follow1',
        type: 'camera_follow',
        category: 'duration' as const,
        target: 'camera',
        slotIndex: 0,
        slotSpan: 1,
        easing: 'linear',
        params: {
            followTarget: 'char1',
            damping: 0,
            offsetX: 0,
            offsetY: 0,
            ...params
        }
    } as unknown as Action)

    describe('Smooth Entry', () => {
        it('should be at baseState position at t=0 when smoothEntry is true', () => {
            const actions = [makeFollowAction({ smoothEntry: true })]
            const result = evaluateCameraState(defaultCameraState, actions, 0, 2000, slots, visualCenters, null)
            // At t=0, easeOutCubic(0) = 0, so position should be baseState
            expect(result.x).toBe(defaultCameraState.x)
            expect(result.y).toBe(defaultCameraState.y)
        })

        it('should be between base and target at t=150ms when smoothEntry is true', () => {
            const actions = [makeFollowAction({ smoothEntry: true })]
            const result = evaluateCameraState(defaultCameraState, actions, 150, 2000, slots, visualCenters, null)
            // At t=150ms (halfway through 300ms entry), position should be between base and target
            expect(result.x).toBeGreaterThan(defaultCameraState.x)
            expect(result.x).toBeLessThan(1000)
            expect(result.y).toBeGreaterThan(defaultCameraState.y)
            expect(result.y).toBeLessThan(800)
        })

        it('should be at target position at t=300ms when smoothEntry is true', () => {
            const actions = [makeFollowAction({ smoothEntry: true })]
            const result = evaluateCameraState(defaultCameraState, actions, 300, 2000, slots, visualCenters, null)
            // At t=300ms, entry is complete → dead follow
            expect(result.x).toBe(1000)
            expect(result.y).toBe(800)
        })

        it('should be at target position at t=0 when smoothEntry is false', () => {
            const actions = [makeFollowAction({ smoothEntry: false })]
            const result = evaluateCameraState(defaultCameraState, actions, 0, 2000, slots, visualCenters, null)
            // Instant snap to target
            expect(result.x).toBe(1000)
            expect(result.y).toBe(800)
        })

        it('should smoothly transition zoom during entry when zoom is set', () => {
            const actions = [makeFollowAction({ smoothEntry: true, zoom: 2 })]
            const result = evaluateCameraState(defaultCameraState, actions, 150, 2000, slots, visualCenters, null)
            // Zoom should be between 1 (base) and 2 (target) at half-entry
            expect(result.zoom).toBeGreaterThan(1)
            expect(result.zoom).toBeLessThan(2)
        })

        it('should default to smoothEntry=false (backward compat)', () => {
            // No smoothEntry param → defaults to false (instant snap)
            const actions = [makeFollowAction({})]
            const result = evaluateCameraState(defaultCameraState, actions, 0, 2000, slots, visualCenters, null)
            // Should be at target (instant snap, no smooth entry)
            expect(result.x).toBe(1000)
            expect(result.y).toBe(800)
        })
    })

    describe('Auto Push-Pull (自动推拉)', () => {
        it('should not oscillate when autoZoom is false', () => {
            const actions = [makeFollowAction({ smoothEntry: false, zoom: 1, autoZoom: false })]
            const result1 = evaluateCameraState(defaultCameraState, actions, 500, 2000, slots, visualCenters, null)
            const result2 = evaluateCameraState(defaultCameraState, actions, 1000, 2000, slots, visualCenters, null)
            expect(result1.zoom).toBe(1)
            expect(result2.zoom).toBe(1)
        })

        it('should oscillate zoom when autoZoom is true', () => {
            const actions = [makeFollowAction({ smoothEntry: false, zoom: 1, autoZoom: true, autoZoomRange: 10, autoZoomCycles: 1 })]
            // At t=0, sin(0)=0 → zoom = 1
            const result0 = evaluateCameraState(defaultCameraState, actions, 0, 2000, slots, visualCenters, null)
            expect(result0.zoom).toBeCloseTo(1, 2)

            // At t=500ms (1/4 cycle of 2000ms), sin(π/2)=1 → zoom = 1 + 0.1 = 1.1
            const resultQuarter = evaluateCameraState(defaultCameraState, actions, 500, 2000, slots, visualCenters, null)
            expect(resultQuarter.zoom).toBeCloseTo(1.1, 2)

            // At t=1000ms (1/2 cycle), sin(π)≈0 → zoom ≈ 1
            const resultHalf = evaluateCameraState(defaultCameraState, actions, 1000, 2000, slots, visualCenters, null)
            expect(resultHalf.zoom).toBeCloseTo(1, 1)

            // At t=1500ms (3/4 cycle), sin(3π/2)=-1 → zoom = 1 - 0.1 = 0.9
            const result3Quarter = evaluateCameraState(defaultCameraState, actions, 1500, 2000, slots, visualCenters, null)
            expect(result3Quarter.zoom).toBeCloseTo(0.9, 2)
        })

        it('should respect autoZoomRange parameter', () => {
            const actions = [makeFollowAction({ smoothEntry: false, zoom: 1, autoZoom: true, autoZoomRange: 20, autoZoomCycles: 1 })]
            // At 1/4 cycle: sin(π/2)=1 → zoom = 1 + 0.2 = 1.2
            const result = evaluateCameraState(defaultCameraState, actions, 500, 2000, slots, visualCenters, null)
            expect(result.zoom).toBeCloseTo(1.2, 2)
        })

        it('should respect autoZoomCycles parameter', () => {
            const actions = [makeFollowAction({ smoothEntry: false, zoom: 1, autoZoom: true, autoZoomRange: 10, autoZoomCycles: 2 })]
            // With 2 cycles over 2000ms, each cycle is 1000ms
            // At t=250ms (1/4 of first cycle): sin(π/2)=1 → zoom = 1.1
            const result = evaluateCameraState(defaultCameraState, actions, 250, 2000, slots, visualCenters, null)
            expect(result.zoom).toBeCloseTo(1.1, 2)
        })

        it('should use default range=5 and cycles=0.5 when not specified', () => {
            const actions = [makeFollowAction({ smoothEntry: false, zoom: 1, autoZoom: true })]
            // Default: range=5, cycles=0.5
            // cycleDuration = 2000/0.5 = 4000ms
            // At t=1000ms (1/4 cycle): sin(π/2)=1 → zoom = 1 + 0.05 = 1.05
            const result = evaluateCameraState(defaultCameraState, actions, 1000, 2000, slots, visualCenters, null)
            expect(result.zoom).toBeCloseTo(1.05, 2)
        })
    })

    describe('Sequential Follow with Smooth Entry', () => {
        it('should start smooth entry from previous follow target position', () => {
            const twoSlots: RuntimeSlot[] = [
                { type: 'subtitle', index: 0, startTime: 0, duration: 1000 },
                { type: 'subtitle', index: 1, startTime: 1000, duration: 1000 }
            ]
            const twoCenters = new Map([
                ['char1', { x: 200, y: 300 }],
                ['char2', { x: 800, y: 600 }]
            ])
            const actions: Action[] = [
                {
                    id: 'followA', type: 'camera_follow', category: 'duration',
                    target: 'camera', slotIndex: 0, slotSpan: 1, easing: 'linear',
                    params: { followTarget: 'char1', damping: 0, offsetX: 0, offsetY: 0, smoothEntry: false }
                } as unknown as Action,
                {
                    id: 'followB', type: 'camera_follow', category: 'duration',
                    target: 'camera', slotIndex: 1, slotSpan: 1, easing: 'linear',
                    params: { followTarget: 'char2', damping: 0, offsetX: 0, offsetY: 0, smoothEntry: true }
                } as unknown as Action
            ]

            // At t=1000ms: follow A completed, follow B just started with smooth entry
            // Follow B's smooth entry should start from char1's position (200, 300)
            const result = evaluateCameraState(defaultCameraState, actions, 1000, 2000, twoSlots, twoCenters, null)
            expect(result.x).toBe(200) // char1's x, not 500 (defaultCameraState)
            expect(result.y).toBe(300) // char1's y, not 500 (defaultCameraState)
        })
    })
})

describe('evaluateCameraState camera action layering', () => {
    const defaultCameraState: RuntimeCameraState = {
        x: 0,
        y: 0,
        zoom: 1,
        shakeOffsetX: 0,
        shakeOffsetY: 0
    }

    const slots: RuntimeSlot[] = [
        { type: 'subtitle', index: 0, startTime: 0, duration: 1000 }
    ]

    it('starts same-slot camera_move from the camera_cut state', () => {
        const actions: Action[] = [
            {
                id: 'move',
                type: 'camera_move',
                category: 'duration',
                target: 'camera',
                slotIndex: 0,
                slotSpan: 1,
                easing: 'linear',
                params: { x: 200, y: 100, zoom: 2 }
            } as Action,
            {
                id: 'cut',
                type: 'camera_cut',
                category: 'point',
                target: 'camera',
                slotIndex: 0,
                params: { x: 100, y: 50, zoom: 1 }
            } as Action
        ]

        const result = evaluateCameraState(defaultCameraState, actions, 500, 1000, slots)

        expect(result.x).toBe(150)
        expect(result.y).toBe(75)
        expect(result.zoom).toBe(1.5)
    })

    it('layers camera_shake over camera_move without replacing base motion', () => {
        const actions: Action[] = [
            {
                id: 'move',
                type: 'camera_move',
                category: 'duration',
                target: 'camera',
                slotIndex: 0,
                slotSpan: 1,
                easing: 'linear',
                params: { x: 200, y: 100, zoom: 1 }
            } as Action,
            {
                id: 'shake',
                type: 'camera_shake',
                category: 'duration',
                target: 'camera',
                slotIndex: 0,
                slotSpan: 1,
                easing: 'linear',
                params: { intensity: 10, decay: false, frequency: 20 }
            } as Action
        ]

        const result = evaluateCameraState(defaultCameraState, actions, 137, 1000, slots)

        expect(result.x).toBeCloseTo(27.4)
        expect(result.y).toBeCloseTo(13.7)
        expect(Math.abs(result.shakeOffsetX) + Math.abs(result.shakeOffsetY)).toBeGreaterThan(0)
    })
})
