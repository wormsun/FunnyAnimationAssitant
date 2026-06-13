/**
 * sceneStateCalculator 模块测试
 * 覆盖 PrevContext 计算、set_lifecycle spawned 跨 Block 累积
 * 
 * @version v9.3 - 验证 set_lifecycle action 的 spawned 属性正确累积
 */

import { describe, expect, it } from 'vitest'

import { SCENE_ACTION_TARGET } from '@/types/screenplay'
import type {
    SceneContainer,
    SceneSetup,
    SceneObject,
    SetCompositeAction,
    SetSceneStructureAction,
    SetTransformAction,
    ScriptBlock,
    SetLifecycleAction
} from '@/types/screenplay'

import {
    applyBlockActionsToState,
    calculateSlotStates,
    calculatePrevContext,
    toRuntimeSnapshot
} from '../sceneStateCalculator'
import { buildTransformMatrix, resolveWorldMatrix } from '../actionHandlers/handlers/SetParentHandler'
import type { WriteableState } from '../actionHandlers/types'

// ==================== 测试辅助函数 ====================

function reparentOperation(objectIds: string[], parentId: string | null) {
    return { id: `op_reparent_${objectIds.join('_')}`, kind: 'reparent' as const, objectIds, parentId }
}

function groupOperation(groupId: string, memberIds: string[], parentId: string | null, autoRestoreOnBlockEnd?: boolean) {
    return {
        id: `op_group_${groupId}`,
        kind: 'group' as const,
        groupId,
        memberIds,
        parentId,
        ...(autoRestoreOnBlockEnd === undefined ? {} : { autoRestoreOnBlockEnd }),
    }
}

function ungroupOperation(groupId: string, memberIds: string[], restoreParentId: string | null, groupParentId: string | null = null) {
    return { id: `op_ungroup_${groupId}`, kind: 'ungroup' as const, groupId, memberIds, groupParentId, restoreParentId }
}

function createMockCharacterObject(id: string, spawned?: boolean): SceneObject {
    return {
        id,
        refId: 'char_001',
        type: 'prop',
        x: 100,
        y: 200,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: 10,
        visible: true,
        spawned: spawned,
        alpha: 1
    } as unknown as SceneObject
}

function createMockSetup(objects: SceneObject[]): SceneSetup {
    return {
        objects,
        camera: { x: 960, y: 540, width: 1920, height: 1080, zoom: 1 },
        renderChain: objects.map(o => o.id),
    }
}

function createMockBlock(id: string, actions: unknown[] = []): ScriptBlock {
    return {
        id,
        type: 'dialogue',
        instanceId: 'instance_' + id,
        speakerId: 'actor_1',
        text: 'test',
        actions
    } as unknown as ScriptBlock
}

function createMockScene(setup: SceneSetup, blocks: ScriptBlock[]): SceneContainer {
    return {
        id: 'scene_1',
        name: 'test',
        type: 'scene',
        title: 'test',
        setup,
        script: blocks
    } as unknown as SceneContainer
}

// ==================== applyBlockActionsToState 测试 ====================

describe('applyBlockActionsToState', () => {
    it('applies completed tween_transform after punctuation-based runtime slot splitting', () => {
        const obj = createMockCharacterObject('obj_1', true)
        const prevState = createMockSetup([obj])
        const block = {
            ...createMockBlock('block_1', [
                {
                    id: 'action_move',
                    type: 'tween_transform',
                    category: 'duration',
                    target: 'obj_1',
                    slotIndex: 1,
                    slotSpan: 4,
                    easing: 'linear',
                    params: { x: 300, y: 400 }
                }
            ]),
            text: '徐小满进入棚中，看着冒烟的灶台和收拾妥当的空地，一脸羡慕。',
            ttsConfig: { duration: 6372 },
        } as unknown as ScriptBlock

        const result = applyBlockActionsToState(toRuntimeSnapshot(prevState), block)

        const resultObj = result.objects.find(o => o.id === 'obj_1')
        expect(resultObj?.x).toBe(300)
        expect(resultObj?.y).toBe(400)
    })

    describe('set_lifecycle action', () => {
        it('applies spawned=false to object state', () => {
            // Setup: 创建一个 spawned=true 的动态对象
            const obj = createMockCharacterObject('obj_1', true)
            const prevState = createMockSetup([obj])

            // Block 1: 包含 set_lifecycle spawned=false 的 action
            const block = createMockBlock('block_1', [
                {
                    id: 'action_1',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'obj_1',
                    slotIndex: 0,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            const result = applyBlockActionsToState(toRuntimeSnapshot(prevState), block)

            // 验证: spawned 应该变为 false
            const resultObj = result.objects.find(o => o.id === 'obj_1')
            expect(resultObj).toBeDefined()
            expect(resultObj!.spawned).toBe(false)
        })

        it('applies spawned=true to object state', () => {
            // Setup: 创建一个 spawned=false 的动态对象
            const obj = createMockCharacterObject('obj_1', false)
            const prevState = createMockSetup([obj])

            // Block: 包含 set_lifecycle spawned=true 的 action
            const block = createMockBlock('block_1', [
                {
                    id: 'action_1',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'obj_1',
                    slotIndex: 0,
                    params: { spawned: true, autoDespawnOnBlockEnd: false }
                } as SetLifecycleAction
            ])

            const result = applyBlockActionsToState(toRuntimeSnapshot(prevState), block)

            // 验证: spawned 应该变为 true
            const resultObj = result.objects.find(o => o.id === 'obj_1')
            expect(resultObj).toBeDefined()
            expect(resultObj!.spawned).toBe(true)
        })

        it('does not modify other objects', () => {
            // Setup: 创建两个对象
            const obj1 = createMockCharacterObject('obj_1', true)
            const obj2 = createMockCharacterObject('obj_2', true)
            const prevState = createMockSetup([obj1, obj2])

            // Block: 只对 obj_1 执行 set_lifecycle
            const block = createMockBlock('block_1', [
                {
                    id: 'action_1',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'obj_1',
                    slotIndex: 0,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            const result = applyBlockActionsToState(toRuntimeSnapshot(prevState), block)

            // 验证: obj_1 spawned=false, obj_2 不受影响
            expect(result.objects.find(o => o.id === 'obj_1')!.spawned).toBe(false)
            expect(result.objects.find(o => o.id === 'obj_2')!.spawned).toBe(true)
        })

        it('auto-restores scene structure changes at block end by default', () => {
            const person: SceneObject = {
                id: 'person_1',
                refId: '',
                type: 'composite',
                name: 'person',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: [],
                compositeMode: 'entity',
            } as unknown as SceneObject
            const group: SceneObject = {
                id: 'group_1',
                refId: '',
                type: 'composite',
                name: '组合',
                x: 100,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
                spawned: false,
                parentId: 'person_1',
                childIds: [],
                compositeMode: 'union',
            } as unknown as SceneObject
            const hand = {
                ...createMockCharacterObject('hand_1', true),
                parentId: 'person_1',
            } as SceneObject
            const chopsticks = {
                ...createMockCharacterObject('chopsticks_1', true),
                parentId: 'person_1',
            } as SceneObject
            const setup = createMockSetup([person, group, hand, chopsticks])
            const block = createMockBlock('block_1', [
                {
                    id: 'group_structure',
                    type: 'set_scene_structure',
                    category: 'point',
                    target: SCENE_ACTION_TARGET,
                    slotIndex: 0,
                    params: {
                        operations: [groupOperation('group_1', ['hand_1', 'chopsticks_1'], 'person_1')],
                    },
                } as SetSceneStructureAction,
            ])

            const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)

            expect(result.objects.find(o => o.id === 'group_1')?.spawned).toBe(false)
            expect(result.objects.find(o => o.id === 'group_1')?.parentId).toBe('person_1')
            expect(result.objects.find(o => o.id === 'hand_1')?.parentId).toBe('person_1')
            expect(result.objects.find(o => o.id === 'chopsticks_1')?.parentId).toBe('person_1')
        })

        it('keeps scene structure changes when autoRestoreOnBlockEnd is false for that structure object', () => {
            const person: SceneObject = {
                id: 'person_1',
                refId: '',
                type: 'composite',
                name: 'person',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: [],
                compositeMode: 'entity',
            } as unknown as SceneObject
            const group: SceneObject = {
                id: 'group_1',
                refId: '',
                type: 'composite',
                name: '组合',
                x: 100,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
                spawned: false,
                parentId: 'person_1',
                childIds: [],
                compositeMode: 'union',
            } as unknown as SceneObject
            const hand = {
                ...createMockCharacterObject('hand_1', true),
                parentId: 'person_1',
            } as SceneObject
            const setup = createMockSetup([person, group, hand])
            const block = createMockBlock('block_1', [
                {
                    id: 'group_structure',
                    type: 'set_scene_structure',
                    category: 'point',
                    target: SCENE_ACTION_TARGET,
                    slotIndex: 0,
                    params: {
                        operations: [groupOperation('group_1', ['hand_1'], 'person_1', false)],
                    },
                } as SetSceneStructureAction,
            ])

            const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)

            expect(result.objects.find(o => o.id === 'group_1')?.spawned).toBe(true)
            expect(result.objects.find(o => o.id === 'hand_1')?.parentId).toBe('group_1')
        })

        it('uses the updated parent transform when a child is attached in the same slot', () => {
            const composite: SceneObject = {
                id: 'composite_1',
                refId: '',
                type: 'composite',
                name: '组合',
                x: 100,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: [],
                compositeMode: 'union',
            } as unknown as SceneObject
            const child: SceneObject = {
                id: 'child_1',
                refId: 'prop_1',
                type: 'prop',
                name: 'child',
                x: 20,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
            } as unknown as SceneObject
            const scene = createMockScene(createMockSetup([composite, child]), [
                createMockBlock('block_1', [
                    {
                        id: 'move_parent',
                        type: 'set_transform',
                        category: 'point',
                        target: 'composite_1',
                        slotIndex: 0,
                        params: { x: 200, y: 0 }
                    } as SetTransformAction,
                    {
                        id: 'attach_child',
                        type: 'set_scene_structure',
                        category: 'point',
                        target: SCENE_ACTION_TARGET,
                        slotIndex: 0,
                        params: { operations: [reparentOperation(['child_1'], 'composite_1')] }
                    } as SetSceneStructureAction
                ])
            ])

            const result = calculateSlotStates(scene, scene.script[0]!, 0)
            const parentState = result.objects.get('composite_1')?.real
            const childState = result.objects.get('child_1')?.real

            expect(parentState?.x).toBe(200)
            expect(childState?.parentId).toBe('composite_1')
            expect(childState?.x).toBe(-180)
        })

        it('applies set_transform to a structure object after it is enabled in the same slot', () => {
            const group: SceneObject = {
                id: 'group_1',
                refId: '',
                type: 'composite',
                name: '组合',
                x: 100,
                y: 50,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                spawned: false,
                childIds: [],
                compositeMode: 'union',
            } as unknown as SceneObject
            const child: SceneObject = {
                id: 'child_1',
                refId: 'prop_1',
                type: 'prop',
                name: 'child',
                x: 120,
                y: 60,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
            } as unknown as SceneObject
            const scene = createMockScene(createMockSetup([group, child]), [
                createMockBlock('block_1', [
                    {
                        id: 'rotate_group',
                        type: 'set_transform',
                        category: 'point',
                        target: 'group_1',
                        slotIndex: 0,
                        params: {
                            rotation: Math.PI / 4,
                            transformOriginX: 12,
                            transformOriginY: -3,
                        }
                    } as SetTransformAction,
                    {
                        id: 'group_child',
                        type: 'set_scene_structure',
                        category: 'point',
                        target: SCENE_ACTION_TARGET,
                        slotIndex: 0,
                        params: {
                            operations: [groupOperation('group_1', ['child_1'], null)],
                        }
                    } as SetSceneStructureAction
                ])
            ])

            const result = calculateSlotStates(scene, scene.script[0]!, 0)
            const groupState = result.objects.get('group_1')?.real
            const childState = result.objects.get('child_1')?.real

            expect(groupState?.spawned).toBe(true)
            expect(groupState?.rotation).toBeCloseTo(Math.PI / 4)
            expect(groupState?.transformOriginX).toBe(12)
            expect(groupState?.transformOriginY).toBe(-3)
            expect(childState?.parentId).toBe('group_1')
        })

        it('evaluates parent before child even when setup order is child first', () => {
            const composite: SceneObject = {
                id: 'composite_1',
                refId: '',
                type: 'composite',
                name: '组合',
                x: 100,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: [],
                compositeMode: 'union',
            } as unknown as SceneObject
            const child: SceneObject = {
                id: 'child_1',
                refId: 'prop_1',
                type: 'prop',
                name: 'child',
                x: 20,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
            } as unknown as SceneObject
            const scene = createMockScene(createMockSetup([child, composite]), [
                createMockBlock('block_1', [
                    {
                        id: 'move_parent',
                        type: 'set_transform',
                        category: 'point',
                        target: 'composite_1',
                        slotIndex: 0,
                        params: { x: 200, y: 0 }
                    } as SetTransformAction,
                    {
                        id: 'attach_child',
                        type: 'set_scene_structure',
                        category: 'point',
                        target: SCENE_ACTION_TARGET,
                        slotIndex: 0,
                        params: { operations: [reparentOperation(['child_1'], 'composite_1')] }
                    } as SetSceneStructureAction
                ])
            ])

            const result = calculateSlotStates(scene, scene.script[0]!, 0)
            const parentState = result.objects.get('composite_1')?.real
            const childState = result.objects.get('child_1')?.real

            expect(parentState?.x).toBe(200)
            expect(childState?.parentId).toBe('composite_1')
            expect(childState?.x).toBe(-180)
        })

        it('preserves spawned child world scale and rotation when attaching to a flipped scaled parent', () => {
            const parent: SceneObject = {
                id: 'parent_1',
                refId: '',
                type: 'composite',
                name: 'parent',
                x: 2682.8844941141165,
                y: 1877.418105043968,
                width: 0,
                height: 0,
                scaleX: 1.927933173117561,
                scaleY: 1.927933173117561,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                flipX: true,
                childIds: [],
                compositeMode: 'entity',
            } as unknown as SceneObject
            const child: SceneObject = {
                id: 'child_1',
                refId: 'prop_1',
                type: 'prop',
                name: 'child',
                x: 3360,
                y: 1400,
                width: 20,
                height: 20,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
                spawned: false,
                flipX: false,
            } as unknown as SceneObject
            const worldPose: WriteableState = {
                id: 'child_1',
                x: 2959.6991004015727,
                y: 1965.2994298377369,
                scaleX: 0.48231884153360105,
                scaleY: 0.48231884153360105,
                rotation: -1.5492402300781607,
                flipX: false,
            }
            const expectedWorld = buildTransformMatrix(worldPose)

            const block = createMockBlock('block_1', [
                {
                    id: 'spawn_child',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'child_1',
                    slotIndex: 0,
                    params: { spawned: true }
                } as SetLifecycleAction,
                {
                    id: 'pose_child',
                    type: 'set_transform',
                    category: 'point',
                    target: 'child_1',
                    slotIndex: 0,
                    params: {
                        x: worldPose.x,
                        y: worldPose.y,
                        scaleX: worldPose.scaleX,
                        scaleY: worldPose.scaleY,
                        rotation: worldPose.rotation,
                    }
                } as SetTransformAction,
                {
                    id: 'attach_child',
                    type: 'set_scene_structure',
                    category: 'point',
                    target: SCENE_ACTION_TARGET,
                    slotIndex: 0,
                    params: { operations: [reparentOperation(['child_1'], 'parent_1')] }
                } as SetSceneStructureAction,
            ])
            const scene = createMockScene(createMockSetup([parent, child]), [block])

            const result = calculateSlotStates(scene, block, 0)
            const parentState = result.objects.get('parent_1')?.real
            const childState = result.objects.get('child_1')?.real
            expect(parentState).toBeDefined()
            expect(childState).toBeDefined()
            expect(childState?.parentId).toBe('parent_1')

            const stateMap = new Map<string, SceneObject>([
                ['parent_1', parentState!],
                ['child_1', childState!],
            ])
            const actualWorld = resolveWorldMatrix(
                childState as unknown as WriteableState,
                id => stateMap.get(id) as unknown as WriteableState | undefined,
            )
            expect(actualWorld.a).toBeCloseTo(expectedWorld.a, 5)
            expect(actualWorld.b).toBeCloseTo(expectedWorld.b, 5)
            expect(actualWorld.c).toBeCloseTo(expectedWorld.c, 5)
            expect(actualWorld.d).toBeCloseTo(expectedWorld.d, 5)
            expect(actualWorld.tx).toBeCloseTo(expectedWorld.tx, 5)
            expect(actualWorld.ty).toBeCloseTo(expectedWorld.ty, 5)
        })
    })
})

// ==================== calculatePrevContext 测试 ====================

describe('calculatePrevContext', () => {
    describe('set_lifecycle spawned 跨 Block 累积', () => {
        it('TC-SPAWNED-01: Block1 中设置 spawned=false，Block2 的 prevContext 应为 false', () => {
            // Setup: 动态对象初始 spawned=true（已出生）
            const obj = createMockCharacterObject('dynamic_char', true)
            const setup = createMockSetup([obj])

            // Block 1: 包含 set_lifecycle spawned=false（使对象退场）
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_despawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            // Block 2: 无 action
            const block2 = createMockBlock('block_2', [])

            // 创建场景
            const scene = createMockScene(setup, [block1, block2])

            // 计算 Block 2 的 prevContext
            const prevContext = calculatePrevContext(scene, 'block_2')

            // 验证: dynamic_char 的 spawned 应该已经被设为 false
            const resultObj = prevContext.objects.find(o => o.id === 'dynamic_char')
            expect(resultObj).toBeDefined()
            expect(resultObj!.spawned).toBe(false)
        })

        it('TC-SPAWNED-02: Block1 中设置 spawned=true，Block2 的 prevContext 应为 true', () => {
            // Setup: 动态对象初始 spawned=false（未出生）
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: 包含 set_lifecycle spawned=true（使对象出生）
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true, autoDespawnOnBlockEnd: false }
                } as SetLifecycleAction
            ])

            // Block 2: 无 action
            const block2 = createMockBlock('block_2', [])

            // 创建场景
            const scene = createMockScene(setup, [block1, block2])

            // 计算 Block 2 的 prevContext
            const prevContext = calculatePrevContext(scene, 'block_2')

            // 验证: dynamic_char 的 spawned 应该已经被设为 true
            const resultObj = prevContext.objects.find(o => o.id === 'dynamic_char')
            expect(resultObj).toBeDefined()
            expect(resultObj!.spawned).toBe(true)
        })

        it('TC-SPAWNED-03: 多 Block 累积测试', () => {
            // Setup: 动态对象初始 spawned=false
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: spawned=true（出生）
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true, autoDespawnOnBlockEnd: false }
                } as SetLifecycleAction
            ])

            // Block 2: spawned=false（退场）
            const block2 = createMockBlock('block_2', [
                {
                    id: 'action_despawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            // Block 3: 无 action
            const block3 = createMockBlock('block_3', [])

            // 创建场景
            const scene = createMockScene(setup, [block1, block2, block3])

            // 验证各 Block 的 prevContext
            const prevContext1 = calculatePrevContext(scene, 'block_1')
            expect(prevContext1.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(false) // 初始状态

            const prevContext2 = calculatePrevContext(scene, 'block_2')
            expect(prevContext2.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(true) // Block1 出生后

            const prevContext3 = calculatePrevContext(scene, 'block_3')
            expect(prevContext3.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(false) // Block2 退场后
        })

        it('TC-SPAWNED-04: autoDespawnOnBlockEnd=true (default) causes auto despawn after block end', () => {
            // Setup: 动态对象初始 spawned=false
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: spawned=true，不设置 autoDespawnOnBlockEnd（默认 true）
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true }
                } as SetLifecycleAction
            ])

            // Block 2: 无 action
            const block2 = createMockBlock('block_2', [])

            const scene = createMockScene(setup, [block1, block2])

            // Block 2 的 prevContext 中对象应已自动消亡
            const prevContext = calculatePrevContext(scene, 'block_2')
            expect(prevContext.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(false)
        })

        it('TC-SPAWNED-05: autoDespawnOnBlockEnd=false prevents auto despawn', () => {
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: spawned=true + autoDespawnOnBlockEnd=false
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true, autoDespawnOnBlockEnd: false }
                } as SetLifecycleAction
            ])

            const block2 = createMockBlock('block_2', [])
            const scene = createMockScene(setup, [block1, block2])

            // Block 2 的 prevContext 中对象应继续存活
            const prevContext = calculatePrevContext(scene, 'block_2')
            expect(prevContext.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(true)
        })

        it('TC-SPAWNED-06: manual despawn in same block takes priority over autoDespawnOnBlockEnd', () => {
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: spawned=true (autoDespawnOnBlockEnd=true by default) + manual spawned=false
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true }
                } as SetLifecycleAction,
                {
                    id: 'action_despawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 2,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            const block2 = createMockBlock('block_2', [])
            const scene = createMockScene(setup, [block1, block2])

            // 手动消亡已存在，对象应为 false
            const prevContext = calculatePrevContext(scene, 'block_2')
            expect(prevContext.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(false)
        })

        it('does not mutate hierarchy when auto-despawning nested union composite', () => {
            const parent: SceneObject = {
                id: 'parent_1',
                refId: '',
                type: 'composite',
                name: 'parent',
                x: 3360,
                y: 1400,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: ['union_1'],
                compositeMode: 'entity',
            } as unknown as SceneObject
            const union: SceneObject = {
                id: 'union_1',
                refId: '',
                type: 'composite',
                name: 'union',
                parentId: 'parent_1',
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 1,
                visible: true,
                alpha: 1,
                childIds: ['child_1'],
                compositeMode: 'union',
            } as unknown as SceneObject
            const child: SceneObject = {
                id: 'child_1',
                refId: 'prop_1',
                type: 'prop',
                name: 'child',
                parentId: 'union_1',
                x: 37.25,
                y: 153.05,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 2,
                visible: true,
                alpha: 1,
            } as unknown as SceneObject
            const block1 = createMockBlock('block_1', [
                {
                    id: 'birth_union',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'union_1',
                    slotIndex: 0,
                    params: { spawned: true }
                } as SetLifecycleAction
            ])
            const block2 = createMockBlock('block_2', [])
            const scene = createMockScene(createMockSetup([parent, union, child]), [block1, block2])

            const prevContext = calculatePrevContext(scene, 'block_2')
            const childState = prevContext.objects.find(o => o.id === 'child_1')

            expect(childState?.parentId).toBe('union_1')
            expect(childState?.x).toBeCloseTo(37.25, 5)
            expect(childState?.y).toBeCloseTo(153.05, 5)
        })
    })
})

describe('calculateSlotStates', () => {
    it('honors custom order when set_scene_structure precedes target set_transform in the same slot', () => {
        const character = {
            id: 'character_1',
            refId: '',
            type: 'composite',
            x: 100,
            y: 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            visible: true,
            spawned: true,
            alpha: 1,
            childIds: ['group_1'],
            compositeMode: 'entity',
        } as unknown as SceneObject
        const group = {
            id: 'group_1',
            refId: '',
            type: 'composite',
            x: 10,
            y: 20,
            scaleX: 1,
            scaleY: 1,
            rotation: Math.PI / 6,
            zIndex: 10,
            visible: true,
            spawned: true,
            alpha: 1,
            parentId: 'character_1',
            childIds: ['arm_1'],
            compositeMode: 'entity',
        } as unknown as SceneObject
        const arm = {
            ...createMockCharacterObject('arm_1', true),
            x: 5,
            y: 6,
            rotation: 0,
            parentId: 'group_1',
        } as SceneObject
        const setup = createMockSetup([character, group, arm])
        const targetRotation = 0.1
        const sceneStructureAction: SetSceneStructureAction = {
            id: 'structure_first',
            type: 'set_scene_structure',
            category: 'point',
            target: SCENE_ACTION_TARGET,
            slotIndex: 0,
            order: 0,
            params: {
                operations: [ungroupOperation('group_1', ['arm_1'], 'character_1')],
            },
        }
        const transformAction: SetTransformAction = {
            id: 'transform_second',
            type: 'set_transform',
            category: 'point',
            target: 'arm_1',
            slotIndex: 0,
            order: 1,
            params: {
                rotation: targetRotation,
            },
        }
        const block = createMockBlock('block_1', [sceneStructureAction, transformAction])
        const scene = createMockScene(setup, [block])

        const slotStates = calculateSlotStates(scene, block, 0)
        const blockEndState = applyBlockActionsToState(toRuntimeSnapshot(setup), block, undefined, true, true)
        const slotArm = slotStates.objects.get('arm_1')?.real
        const blockEndArm = blockEndState.objects.find(o => o.id === 'arm_1')

        expect(slotArm?.parentId).toBe('character_1')
        expect(slotArm?.rotation).toBeCloseTo(targetRotation, 6)
        expect(blockEndArm?.parentId).toBe('character_1')
        expect(blockEndArm?.rotation).toBeCloseTo(targetRotation, 6)
    })

    it('applies set_composite renderChain after same-slot set_scene_structure in default order', () => {
        const character = {
            id: 'character_1',
            refId: '',
            type: 'composite',
            x: 100,
            y: 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            visible: true,
            spawned: true,
            alpha: 1,
            childIds: ['body_1', 'head_1'],
            compositeMode: 'entity',
            renderChain: ['body_1', 'head_1'],
        } as unknown as SceneObject
        const body = {
            ...createMockCharacterObject('body_1', true),
            parentId: 'character_1',
        } as SceneObject
        const head = {
            ...createMockCharacterObject('head_1', true),
            parentId: 'character_1',
        } as SceneObject
        const prop = createMockCharacterObject('prop_1', true)
        const setup = createMockSetup([character, body, head, prop])

        const sceneStructureAction: SetSceneStructureAction = {
            id: 'structure_add_prop',
            type: 'set_scene_structure',
            category: 'point',
            target: SCENE_ACTION_TARGET,
            slotIndex: 0,
            params: {
                operations: [reparentOperation(['prop_1'], 'character_1')],
            },
        }
        const compositeAction: SetCompositeAction = {
            id: 'composite_reorder',
            type: 'set_composite',
            category: 'point',
            target: 'character_1',
            slotIndex: 0,
            params: {
                renderChain: ['body_1', 'prop_1', 'head_1'],
            },
        }
        const block = createMockBlock('block_1', [sceneStructureAction, compositeAction])
        const scene = createMockScene(setup, [block])

        const currentSlotStates = calculateSlotStates(scene, block, 0)
        const nextSlotStates = calculateSlotStates(scene, block, 1)

        expect(currentSlotStates.objects.get('prop_1')?.real.parentId).toBe('character_1')
        const currentCharacter = currentSlotStates.objects.get('character_1')?.real as unknown as { renderChain?: string[] }
        const nextCharacter = nextSlotStates.objects.get('character_1')?.real as unknown as { renderChain?: string[] }

        expect(currentCharacter.renderChain).toEqual([
            'body_1',
            'prop_1',
            'head_1',
        ])
        expect(nextCharacter.renderChain).toEqual([
            'body_1',
            'prop_1',
            'head_1',
        ])
    })

    it('uses prevContextOverride instead of recalculating prevContext', () => {
        const obj = createMockCharacterObject('dynamic_char', true)
        const setup = createMockSetup([obj])

        const block1 = createMockBlock('block_1', [
            {
                id: 'action_despawn',
                type: 'set_lifecycle',
                category: 'point',
                target: 'dynamic_char',
                slotIndex: 0,
                params: { spawned: false }
            } as SetLifecycleAction
        ])

        const block2 = createMockBlock('block_2', [])
        const scene = createMockScene(setup, [block1, block2])

        const override = toRuntimeSnapshot(createMockSetup([
            createMockCharacterObject('dynamic_char', true)
        ]))

        const result = calculateSlotStates(scene, block2, 0, override)
        const state = result.objects.get('dynamic_char')

        expect(state).toBeDefined()
        expect(state!.real.spawned).toBe(true)

        const actualPrevContext = calculatePrevContext(scene, 'block_2')
        expect(actualPrevContext.objects.find(o => o.id === 'dynamic_char')!.spawned).toBe(false)
    })
})

// ==================== calculateSlotStates 测试 ====================


describe('calculateSlotStates', () => {
    describe('spawned=false 对象处理', () => {
        it('TC-SLOT-01: prevContext 中 spawned=false 的对象，其 real 状态应保持 spawned=false', () => {
            // 这个测试验证：当 Block1 中对象被设为 spawned=false 后，
            // Block2 的 calculateSlotStates 返回的 real 状态中该对象的 spawned 应为 false

            // Setup: 动态对象初始 spawned=true
            const obj = createMockCharacterObject('dynamic_char', true)
            const setup = createMockSetup([obj])

            // Block 1: 设置 spawned=false
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_despawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: false }
                } as SetLifecycleAction
            ])

            // Block 2: 无 action
            const block2 = createMockBlock('block_2', [])

            // 创建场景
            const scene = createMockScene(setup, [block1, block2])

            // 计算 Block 2, Slot 0 的状态
            const slotStates = calculateSlotStates(scene, block2, 0)

            // 验证: dynamic_char 的 real 状态应该 spawned=false
            const objState = slotStates.objects.get('dynamic_char')
            expect(objState).toBeDefined()
            expect(objState!.real.spawned).toBe(false)
        })

        it('TC-SLOT-02: prevContext 中 spawned=true 的对象，其 real 状态应保持 spawned=true', () => {
            // Setup: 动态对象初始 spawned=false
            const obj = createMockCharacterObject('dynamic_char', false)
            const setup = createMockSetup([obj])

            // Block 1: 设置 spawned=true
            const block1 = createMockBlock('block_1', [
                {
                    id: 'action_spawn',
                    type: 'set_lifecycle',
                    category: 'point',
                    target: 'dynamic_char',
                    slotIndex: 0,
                    params: { spawned: true, autoDespawnOnBlockEnd: false }
                } as SetLifecycleAction
            ])

            // Block 2: 无 action
            const block2 = createMockBlock('block_2', [])

            // 创建场景
            const scene = createMockScene(setup, [block1, block2])

            // 计算 Block 2, Slot 0 的状态
            const slotStates = calculateSlotStates(scene, block2, 0)

            // 验证: dynamic_char 的 real 状态应该 spawned=true
            const objState = slotStates.objects.get('dynamic_char')
            expect(objState).toBeDefined()
            expect(objState!.real.spawned).toBe(true)
        })
    })
})

// ==================== Composite Auto-Despawn 测试 ====================

describe('composite auto-despawn child handling', () => {
    // 辅助函数：创建组合对象
    function createMockCompositeObject(
        id: string,
        childIds: string[],
        compositeMode: 'entity' | 'union',
        spawned?: boolean
    ): SceneObject {
        return {
            id,
            refId: '',
            type: 'composite',
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            visible: true,
            spawned: spawned,
            alpha: 1,
            childIds,
            compositeMode,
            compositeLocked: true,
        } as unknown as SceneObject
    }

    function createMockPropObject(id: string, spawned?: boolean, parentId?: string): SceneObject {
        return {
            id,
            refId: 'prop_001',
            type: 'prop',
            x: 100,
            y: 200,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            visible: true,
            spawned: spawned,
            alpha: 1,
            ...(parentId ? { parentId } : {}),
        } as unknown as SceneObject
    }

    it('TC-AUTODESPAWN-COMPOSITE-OWN: own 模式组合对象自动消亡时，子对象 spawned 应级联为 false', () => {
        // Setup: 组合对象和子对象都初始为 spawned=false
        const child1 = createMockPropObject('child_1', false, 'composite_1')
        const child2 = createMockPropObject('child_2', false, 'composite_1')
        const composite = createMockCompositeObject('composite_1', ['child_1', 'child_2'], 'entity', false)
        const setup = createMockSetup([composite, child1, child2])

        // Block 1: 组合对象出生（autoDespawnOnBlockEnd 默认 true）
        const block1 = createMockBlock('block_1', [
            {
                id: 'action_spawn_composite',
                type: 'set_lifecycle',
                category: 'point',
                target: 'composite_1',
                slotIndex: 0,
                params: { spawned: true }
            } as SetLifecycleAction,
            // 子对象也出生（autoDespawnOnBlockEnd=false，让它们不被自身的自动消亡影响）
            {
                id: 'action_spawn_child1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'child_1',
                slotIndex: 0,
                params: { spawned: true, autoDespawnOnBlockEnd: false }
            } as SetLifecycleAction,
            {
                id: 'action_spawn_child2',
                type: 'set_lifecycle',
                category: 'point',
                target: 'child_2',
                slotIndex: 0,
                params: { spawned: true, autoDespawnOnBlockEnd: false }
            } as SetLifecycleAction,
        ])

        const block2 = createMockBlock('block_2', [])
        const scene = createMockScene(setup, [block1, block2])

        // Block 2 的 prevContext 中，组合对象自动消亡，子对象应级联消亡
        const prevContext = calculatePrevContext(scene, 'block_2')
        expect(prevContext.objects.find(o => o.id === 'composite_1')!.spawned).toBe(false)
        expect(prevContext.objects.find(o => o.id === 'child_1')!.spawned).toBe(false)
        expect(prevContext.objects.find(o => o.id === 'child_2')!.spawned).toBe(false)
    })

    it('TC-AUTODESPAWN-COMPOSITE-BIND: union 模式组合对象自动消亡时，不改变子对象 parentId', () => {
        // Setup: 组合对象和子对象
        const child1 = createMockPropObject('child_1', false, 'composite_1')
        const child2 = createMockPropObject('child_2', false, 'composite_1')
        const composite = createMockCompositeObject('composite_1', ['child_1', 'child_2'], 'union', false)
        const setup = createMockSetup([composite, child1, child2])

        // Block 1: 组合对象出生（autoDespawnOnBlockEnd 默认 true）
        const block1 = createMockBlock('block_1', [
            {
                id: 'action_spawn_composite',
                type: 'set_lifecycle',
                category: 'point',
                target: 'composite_1',
                slotIndex: 0,
                params: { spawned: true }
            } as SetLifecycleAction,
            {
                id: 'action_spawn_child1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'child_1',
                slotIndex: 0,
                params: { spawned: true, autoDespawnOnBlockEnd: false }
            } as SetLifecycleAction,
            {
                id: 'action_spawn_child2',
                type: 'set_lifecycle',
                category: 'point',
                target: 'child_2',
                slotIndex: 0,
                params: { spawned: true, autoDespawnOnBlockEnd: false }
            } as SetLifecycleAction,
        ])

        const block2 = createMockBlock('block_2', [])
        const scene = createMockScene(setup, [block1, block2])

        const prevContext = calculatePrevContext(scene, 'block_2')
        expect(prevContext.objects.find(o => o.id === 'composite_1')!.spawned).toBe(false)
        expect(prevContext.objects.find(o => o.id === 'child_1')!.parentId).toBe('composite_1')
        expect(prevContext.objects.find(o => o.id === 'child_2')!.parentId).toBe('composite_1')
    })

    it('TC-AUTODESPAWN-COMPOSITE-BIND-ALIVE: bind 模式组合对象自动消亡时，子对象 spawned 应保持存活', () => {
        // Setup: 同上
        const child1 = createMockPropObject('child_1', false, 'composite_1')
        const composite = createMockCompositeObject('composite_1', ['child_1'], 'union', false)
        const setup = createMockSetup([composite, child1])

        const block1 = createMockBlock('block_1', [
            {
                id: 'action_spawn_composite',
                type: 'set_lifecycle',
                category: 'point',
                target: 'composite_1',
                slotIndex: 0,
                params: { spawned: true }
            } as SetLifecycleAction,
            {
                id: 'action_spawn_child1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'child_1',
                slotIndex: 0,
                params: { spawned: true, autoDespawnOnBlockEnd: false }
            } as SetLifecycleAction,
        ])

        const block2 = createMockBlock('block_2', [])
        const scene = createMockScene(setup, [block1, block2])

        const prevContext = calculatePrevContext(scene, 'block_2')
        // bind 模式：组合对象消亡，但子对象应保持存活
        expect(prevContext.objects.find(o => o.id === 'composite_1')!.spawned).toBe(false)
        expect(prevContext.objects.find(o => o.id === 'child_1')!.spawned).toBe(true)
    })
})
