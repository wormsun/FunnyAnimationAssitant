/**
 * Ghost Mode Calculator Tests
 * 测试 calculateSlotStates 函数的正确性
 */

import { describe, expect, it } from 'vitest'

import type {
    Action,
    CameraCutAction,
    CameraMoveAction,
    DialogueBlock,
    SceneContainer,
    TweenTransformAction
} from '@/types/screenplay'

import { calculateSlotStates } from '../sceneStateCalculator'
import { CANVAS_CENTER_X, CANVAS_CENTER_Y, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT } from '@/constants/canvas'
import { localToGlobal } from '@/utils/actionHandlers/matrixUtils'
import type { WriteableState } from '@/utils/actionHandlers/types'

// Default camera object for tests
const DEFAULT_CAMERA = { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 }

// ==================== Test Fixtures ====================

function createMockScene(objects: any[] = [], camera?: any): SceneContainer {
    return {
        id: 'scene_1',
        type: 'scene_container',
        title: 'Test Scene',
        setup: {
            camera: camera || DEFAULT_CAMERA,
            objects: objects.map((o, i) => ({
                id: o.id || `obj_${i}`,
                refId: o.refId || `ref_${i}`,
                type: o.type || 'prop',
                name: o.name || `obj_${i}`,
                x: o.x ?? 0,
                y: o.y ?? 0,
                width: o.width ?? 0,
                height: o.height ?? 0,
                scaleX: o.scaleX ?? 1,
                scaleY: o.scaleY ?? 1,
                rotation: o.rotation ?? 0,
                zIndex: o.zIndex ?? i,
                alpha: o.alpha ?? 1,
                flipX: o.flipX ?? false,
                visible: o.visible ?? true,
                parentId: o.parentId,
                spawned: o.spawned,
                childIds: o.childIds,
                compositeMode: o.compositeMode,
                transformOriginX: o.transformOriginX,
                transformOriginY: o.transformOriginY,
                // PT 重构: 同时设置顶层字段和 initialState（兼容旧数据）
                initialState: o.initialState,
                pose: o.pose ?? o.initialState?.pose,
                expression: o.expression ?? o.expression,
                partAssetOverrides: o.partAssetOverrides ?? o.partAssetOverrides,
                layerPresetId: o.layerPresetId ?? o.initialState?.layerPresetId
            } as any)),
            renderChain: objects.map((o: any, i: number) => o.id || `obj_${i}`),
        },
        script: []
    }
}

function createMockBlock(actions: Action[] = []): DialogueBlock {
    return {
        id: 'block_1',
        type: 'dialogue',
        instanceId: 'char_1',
        text: '测试文本',
        actions,
        ttsConfig: {
            duration: 3000,
        }
    }
}

// ==================== Unit Tests ====================

describe('calculateSlotStates', () => {
    describe('TC-GM-20: Idle State (No Actions)', () => {
        it('should return ghost=null for objects with no actions at current slot', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ])
            const block = createMockBlock([]) // No actions
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).toBeNull() // No ghost for idle
            expect(objResult!.real.x).toBe(100)
            expect(objResult!.real.y).toBe(200)
        })
    })

    describe('TC-GM-01: Point Action Ghost', () => {
        it('should not show ghost for alpha-only set_transform action', () => {
            const scene = createMockScene([
                // PT 重构: 顶层字段优先
                { id: 'char_A', type: 'prop', x: 100, y: 200, pose: 'stand' }
            ])

            const setCharAction: Action = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: {
                    alpha: 0.8
                }
            }

            const block = createMockBlock([setCharAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).toBeNull()
            expect(objResult!.real.alpha).toBe(0.8) // After action
        })

        it('should show ghost=before, real=after for spatial set_transform action', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ])

            const setTransformAction: Action = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: {
                    x: 320,
                    y: 260
                }
            }

            const block = createMockBlock([setTransformAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).not.toBeNull()
            expect(objResult!.ghost!.x).toBe(100)
            expect(objResult!.ghost!.y).toBe(200)
            expect(objResult!.real.x).toBe(320)
            expect(objResult!.real.y).toBe(260)
        })
    })

    describe('TC-GM-10: Duration Action Ghost (Start Slot)', () => {
        it('should show ghost=startPos, real=targetPos at duration action start', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ])

            const tweenAction: TweenTransformAction = {
                id: 'action_1',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 1,
                slotSpan: 2,
                params: {
                    x: 500,
                    y: 300
                }
            }

            const block = createMockBlock([tweenAction])
            scene.script.push(block)

            // At slot 1 (start of duration action)
            const result = calculateSlotStates(scene, block, 1)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).not.toBeNull()
            expect(objResult!.ghost!.x).toBe(100) // Start position
            expect(objResult!.ghost!.y).toBe(200)
            expect(objResult!.real.x).toBe(500) // Target position
            expect(objResult!.real.y).toBe(300)
        })
    })

    describe('TC-GM-11: Duration Action Ghost (Middle Slot)', () => {
        it('should still show ghost=startPos, real=targetPos at middle of duration', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ])

            const tweenAction: TweenTransformAction = {
                id: 'action_1',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 1,
                slotSpan: 3, // Slots 1, 2, 3
                params: {
                    x: 500,
                    y: 300
                }
            }

            const block = createMockBlock([tweenAction])
            scene.script.push(block)

            // At slot 2 (middle of duration action)
            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).not.toBeNull()
            expect(objResult!.ghost!.x).toBe(100) // Still start position
            expect(objResult!.real.x).toBe(500) // Still target position
        })
    })

    describe('TC-GM-12: Duration Action Completed', () => {
        it('should show ghost=null when duration action is completed before current slot', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ])

            const tweenAction: TweenTransformAction = {
                id: 'action_1',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 0,
                slotSpan: 2, // Slots 0, 1 -> ends at slot 2
                params: {
                    x: 500,
                    y: 300
                }
            }

            const block = createMockBlock([tweenAction])
            scene.script.push(block)

            // At slot 3 (after duration action completed)
            const result = calculateSlotStates(scene, block, 3)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).toBeNull() // No ghost, action completed
            expect(objResult!.real.x).toBe(500) // Final position applied to base
            expect(objResult!.real.y).toBe(300)
        })
    })

    describe('TC-GM-30: Camera Cut Ghost', () => {
        it('should show ghost camera before cut, real camera after cut', () => {
            const scene = createMockScene([], DEFAULT_CAMERA)

            const cameraCutAction: CameraCutAction = {
                id: 'action_cam',
                type: 'camera_cut',
                category: 'point',
                target: 'camera',
                slotIndex: 2,
                params: {
                    x: 500,
                    y: 400,
                    zoom: 1.5
                }
            }

            const block = createMockBlock([cameraCutAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            expect(result.camera.ghost).not.toBeNull()
            expect(result.camera.ghost!.x).toBe(CANVAS_CENTER_X) // Before cut
            expect(result.camera.ghost!.y).toBe(CANVAS_CENTER_Y)
            expect(result.camera.ghost!.zoom).toBe(1)

            expect(result.camera.real.x).toBe(500) // After cut
            expect(result.camera.real.y).toBe(400)
            expect(result.camera.real.zoom).toBe(1.5)
        })
    })

    describe('TC-GM-35: Camera Move Ghost', () => {
        it('should show ghost camera at start, real camera at target for camera_move', () => {
            const scene = createMockScene([], DEFAULT_CAMERA)

            const cameraMoveAction: CameraMoveAction = {
                id: 'action_cam',
                type: 'camera_move',
                category: 'duration',
                target: 'camera',
                slotIndex: 1,
                slotSpan: 2,
                params: {
                    x: 800,
                    y: 600,
                    zoom: 2
                }
            }

            const block = createMockBlock([cameraMoveAction])
            scene.script.push(block)

            // At slot 1 (start of camera_move)
            const result = calculateSlotStates(scene, block, 1)

            expect(result.camera.ghost).not.toBeNull()
            expect(result.camera.ghost!.x).toBe(CANVAS_CENTER_X)
            expect(result.camera.ghost!.y).toBe(CANVAS_CENTER_Y)
            expect(result.camera.ghost!.zoom).toBe(1)

            expect(result.camera.real.x).toBe(800)
            expect(result.camera.real.y).toBe(600)
            expect(result.camera.real.zoom).toBe(2)
        })
    })

    describe('TC-GM-40: Camera Follow No Ghost', () => {
        it('should return ghost=null for camera_follow actions', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200 }
            ], DEFAULT_CAMERA)

            const cameraFollowAction: Action = {
                id: 'action_cam',
                type: 'camera_follow',
                category: 'duration',
                target: 'camera',
                slotIndex: 1,
                slotSpan: 2,
                params: {
                    followTarget: 'char_A',
                    damping: 0.5
                }
            } as Action

            const block = createMockBlock([cameraFollowAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            // camera_follow not supported for Ghost Mode
            expect(result.camera.ghost).toBeNull()
        })
    })

    describe('TC-GM-50: Point + Duration Same Slot', () => {
        it('should apply point action first, then duration target', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 200, alpha: 1 }
            ])

            const setTransformAction: Action = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: {
                    alpha: 0.5
                }
            } as Action

            const tweenAction: TweenTransformAction = {
                id: 'action_2',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 2,
                slotSpan: 2,
                params: {
                    x: 500
                }
            }

            const block = createMockBlock([setTransformAction, tweenAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).not.toBeNull()
            expect(objResult!.ghost!.x).toBe(100) // Before actions
            expect(objResult!.ghost!.alpha).toBe(1)
            expect(objResult!.real.x).toBe(500) // Duration target applied
            expect(objResult!.real.alpha).toBe(0.5) // Point action applied
        })
    })

    // ==================== v8.4 新增: Action 创建后同步测试 ====================

    describe('TC-GM-60: Action Creation Sync (tween_transform)', () => {
        it('should correctly calculate Real state after tween_transform position action', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 50, y: 100 }
            ])

            // 模拟用户拖动后创建的 tween_transform action
            const tweenAction: TweenTransformAction = {
                id: 'action_drag',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 2,
                slotSpan: 1,
                params: {
                    x: 300,
                    y: 250
                }
            }

            const block = createMockBlock([tweenAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()
            expect(objResult!.ghost).not.toBeNull()
            expect(objResult!.ghost!.x).toBe(50) // 原位置
            expect(objResult!.ghost!.y).toBe(100)
            expect(objResult!.real.x).toBe(300) // 新位置 (Action 目标)
            expect(objResult!.real.y).toBe(250)
        })

        it('should correctly calculate Real state after tween_transform scale action', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 100, scaleX: 1, scaleY: 1 }
            ])

            const tweenAction: TweenTransformAction = {
                id: 'action_scale',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 2,
                slotSpan: 1,
                params: {
                    scaleX: 2,
                    scaleY: 1.5
                }
            }

            const block = createMockBlock([tweenAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult!.ghost!.scaleX).toBe(1) // 原缩放
            expect(objResult!.ghost!.scaleY).toBe(1)
            expect(objResult!.real.scaleX).toBe(2) // 新缩放
            expect(objResult!.real.scaleY).toBe(1.5)
        })
    })

    describe('TC-GM-61: Action Creation Sync (set_character)', () => {
        it('should correctly calculate Real state without ghost after set_character alpha change', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 100, alpha: 1 }
            ])

            const setCharAction: Action = {
                id: 'action_alpha',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: {
                    alpha: 0.5
                }
            }

            const block = createMockBlock([setCharAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult!.ghost).toBeNull()
            expect(objResult!.real.alpha).toBe(0.5) // 新透明度
        })

        it('should correctly calculate Real state without ghost after set_character expression change', () => {
            const scene = createMockScene([
                // PT 重构: 顶层字段优先
                { id: 'char_A', type: 'prop', x: 100, y: 100, expression: 'neutral' }
            ])

            const setCharAction: Action = {
                id: 'action_expr',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: {
                    alpha: 0.8
                }
            }

            const block = createMockBlock([setCharAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult!.ghost).toBeNull()
            expect((objResult!.real as unknown as Record<string, unknown>)['alpha']).toBe(0.8) // 新透明度
        })
    })

    describe('TC-GM-62: Multiple Actions Same Slot (Stacking)', () => {
        it('should stack multiple actions on same object at same slot', () => {
            const scene = createMockScene([
                { id: 'char_A', type: 'prop', x: 100, y: 100, alpha: 1, rotation: 0 }
            ])

            // 位置 Action
            const moveAction: TweenTransformAction = {
                id: 'action_move',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 2,
                slotSpan: 1,
                params: { x: 500, y: 300 }
            }

            // 缩放 Action
            const scaleAction: TweenTransformAction = {
                id: 'action_scale',
                type: 'tween_transform',
                category: 'duration',
                target: 'char_A',
                slotIndex: 2,
                slotSpan: 1,
                params: { scaleX: 2, scaleY: 2 }
            }

            // 透明度 Action (set_transform)
            const alphaAction: Action = {
                id: 'action_alpha',
                type: 'set_transform',
                category: 'point',
                target: 'char_A',
                slotIndex: 2,
                params: { alpha: 0.7 }
            }

            const block = createMockBlock([moveAction, scaleAction, alphaAction])
            scene.script.push(block)

            const result = calculateSlotStates(scene, block, 2)

            const objResult = result.objects.get('char_A')
            expect(objResult).toBeDefined()

            // Ghost 应保持原始值
            expect(objResult!.ghost!.x).toBe(100)
            expect(objResult!.ghost!.y).toBe(100)
            expect(objResult!.ghost!.scaleX).toBe(1)
            expect(objResult!.ghost!.alpha).toBe(1)

            // Real 应应用所有 Action 的目标
            expect(objResult!.real.x).toBe(500)
            expect(objResult!.real.y).toBe(300)
            expect(objResult!.real.scaleX).toBe(2)
            expect(objResult!.real.scaleY).toBe(2)
            expect(objResult!.real.alpha).toBe(0.7)
        })
    })

    describe('Current-slot scene structure with transform origin and duration', () => {
        it('should apply current-slot transform origin before active duration rotation for spawned composites', () => {
            const scene = createMockScene([
                { id: 'parent', type: 'composite', x: 100, y: 100, compositeMode: 'entity', childIds: ['hand', 'bowl', 'group'] },
                { id: 'group', type: 'composite', parentId: 'parent', spawned: false, x: 10, y: 20, compositeMode: 'union', childIds: [] },
                { id: 'hand', type: 'prop', parentId: 'parent', x: 8, y: 18 },
                { id: 'bowl', type: 'prop', parentId: 'parent', x: 16, y: 24 },
            ])

            const actions: Action[] = [
                {
                    id: 'group_action',
                    type: 'set_scene_structure',
                    category: 'point',
                    target: '_scene_',
                    slotIndex: 0,
                    params: {
                        operations: [{
                            id: 'op_group',
                            kind: 'group',
                            groupId: 'group',
                            memberIds: ['hand', 'bowl'],
                            parentId: 'parent',
                        }]
                    }
                } as Action,
                {
                    id: 'origin_action',
                    type: 'set_transform',
                    category: 'point',
                    target: 'group',
                    slotIndex: 0,
                    params: {
                        transformOriginX: -10,
                        transformOriginY: -20,
                    }
                } as Action,
                {
                    id: 'rotate_action',
                    type: 'tween_transform',
                    category: 'duration',
                    target: 'group',
                    slotIndex: 0,
                    slotSpan: 2,
                    params: {
                        rotation: 1,
                    }
                } as Action,
            ]

            const block = createMockBlock(actions)
            scene.script.push(block)

            const slot0 = calculateSlotStates(scene, block, 0).objects.get('group')!.real
            const slot0Ghost = calculateSlotStates(scene, block, 0).objects.get('group')!.ghost
            const slot1 = calculateSlotStates(scene, block, 1).objects.get('group')!.real

            expect(slot0.spawned).toBe(true)
            expect(slot0.rotation).toBe(1)
            expect(slot0.transformOriginX).toBe(-10)
            expect(slot0.transformOriginY).toBe(-20)
            expect(slot0.x).toBeCloseTo(slot1.x, 6)
            expect(slot0.y).toBeCloseTo(slot1.y, 6)
            expect(slot0Ghost).not.toBeNull()
            expect(slot0Ghost!.spawned).toBe(true)
            expect(slot0Ghost!.rotation).toBe(0)
            expect(slot0Ghost!.transformOriginX).toBe(-10)
            expect(slot0Ghost!.transformOriginY).toBe(-20)
        })

        it('should reparent new children before applying current-slot parent duration', () => {
            const scene = createMockScene([
                { id: 'parent', type: 'composite', x: 100, y: 100, compositeMode: 'entity', childIds: [] },
                { id: 'prop', type: 'prop', spawned: false, x: 0, y: 0 },
            ])

            const actions: Action[] = [
                {
                    id: 'spawn_prop',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'prop',
                    slotIndex: 0,
                    params: { spawned: true }
                } as Action,
                {
                    id: 'place_prop',
                    type: 'set_transform',
                    category: 'point',
                    target: 'prop',
                    slotIndex: 0,
                    params: { x: 10, y: 20 }
                } as Action,
                {
                    id: 'attach_prop',
                    type: 'set_scene_structure',
                    category: 'point',
                    target: '_scene_',
                    slotIndex: 0,
                    params: {
                        operations: [{
                            id: 'op_reparent',
                            kind: 'reparent',
                            objectIds: ['prop'],
                            parentId: 'parent',
                        }]
                    }
                } as Action,
                {
                    id: 'move_parent',
                    type: 'tween_transform',
                    category: 'duration',
                    target: 'parent',
                    slotIndex: 0,
                    slotSpan: 2,
                    params: { x: 200, y: 100 }
                } as Action,
            ]

            const block = createMockBlock(actions)
            scene.script.push(block)

            const slot0States = calculateSlotStates(scene, block, 0)
            const parentGhost = slot0States.objects.get('parent')!.ghost

            const getPropGlobal = (slotIndex: number) => {
                const slotStates = calculateSlotStates(scene, block, slotIndex)
                const objects = new Map([...slotStates.objects.entries()].map(([id, result]) => [id, result.real]))
                const prop = objects.get('prop')!
                const getObjectState = (id: string): WriteableState | undefined =>
                    objects.get(id) as unknown as WriteableState | undefined
                return localToGlobal(prop as unknown as WriteableState, getObjectState)
            }

            const slot0Global = getPropGlobal(0)
            const slot1Global = getPropGlobal(1)

            expect(parentGhost).not.toBeNull()
            expect(parentGhost!.x).toBe(100)
            expect(parentGhost!.y).toBe(100)
            expect(slot0Global.x).toBeCloseTo(slot1Global.x, 6)
            expect(slot0Global.y).toBeCloseTo(slot1Global.y, 6)
            expect(slot0Global.x).toBeCloseTo(110, 6)
            expect(slot0Global.y).toBeCloseTo(20, 6)
        })
    })
})
