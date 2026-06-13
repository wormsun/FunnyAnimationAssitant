/**
 * Shadow Object 模块集成测试
 * 覆盖动态对象生命周期：创建、出生、可见性判断
 * 
 * @version v9.3 - 使用 SetLifecycleAction 管理 spawned 状态
 */

import { describe, expect, it } from 'vitest'

import { CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'

import type {
    SceneContainer,
    SceneObject,
    ScriptBlock,
    SetLifecycleAction
} from '@/types/screenplay'

import {
    createShadowObject,
    findBirthSlotIndex,
    isObjectAliveAtSlot,
    isShadowObject
} from '../shadowObject'

// ==================== 测试辅助函数 ====================

function createMockScene(): SceneContainer {
    return {
        id: 'scene_1',
        name: 'test',
        type: 'scene',
        title: 'test',
        setup: {
            objects: [],
            camera: { x: 960, y: 540, zoom: 1 }
        },
        script: []
    } as unknown as SceneContainer
}

function createMockBlock(): ScriptBlock {
    return {
        id: 'block_1',
        type: 'dialogue',
        instanceId: 'instance_1',
        speakerId: 'actor_1',
        text: 'test',
        actions: []
    } as unknown as ScriptBlock
}

// ==================== createShadowObject 测试 ====================

describe('createShadowObject', () => {
    it('creates prop type Shadow Object', () => {
        const scene = createMockScene()
        const block = createMockBlock()

        const result = createShadowObject({
            scene,
            block,
            slotIndex: 2,
            objectType: 'prop',
            resourceId: 'char_001',
            resourceName: 'main',
            cameraCenterX: 960,
            cameraCenterY: 540
        })

        expect(result.setupObject).toBeDefined()
        expect(result.setupObject.type).toBe('prop')
        expect(result.setupObject.refId).toBe('char_001')
        expect(result.setupObject.spawned).toBe(false)
        expect(result.setupObject.visible).toBe(true)

        expect(result.spawnAction).toBeDefined()
        expect(result.spawnAction.type).toBe('set_lifecycle')
        expect(result.spawnAction.target).toBe(result.setupObject.id)
        expect(result.spawnAction.slotIndex).toBe(2)
        expect(result.spawnAction.params.spawned).toBe(true)
        // v9.3: spawnAction 不再包含 x/y，位置由单独的 set_transform 设置
    })

    it('creates prop type Shadow Object', () => {
        const scene = createMockScene()
        const block = createMockBlock()

        const result = createShadowObject({
            scene,
            block,
            slotIndex: 0,
            objectType: 'prop',
            resourceId: 'prop_001',
            resourceName: 'prop_test',
            cameraCenterX: 500,
            cameraCenterY: 300
        })

        expect(result.setupObject.type).toBe('prop')
        expect(result.setupObject.refId).toBe('prop_001')
        expect(result.setupObject.spawned).toBe(false)
        // v2.0.0: 所有对象统一使用中心坐标语义
        expect(result.setupObject.x).toBe(CANVAS_CENTER_X)
        expect(result.setupObject.y).toBe(CANVAS_CENTER_Y)
        // v9.3: spawnAction 不再包含 x/y
        expect(result.spawnAction.params.spawned).toBe(true)
    })

    it('creates background type Shadow Object with canvas center position', () => {
        const scene = createMockScene()
        const block = createMockBlock()

        const result = createShadowObject({
            scene,
            block,
            slotIndex: 0,
            objectType: 'background',
            resourceId: 'bg_001',
            resourceName: 'sky',
            cameraCenterX: 960,
            cameraCenterY: 540
        })

        expect(result.setupObject.type).toBe('background')
        expect(result.setupObject.refId).toBe('bg_001')
        expect(result.setupObject.spawned).toBe(false)
        // v2.0.0: 所有对象统一使用中心坐标语义
        expect(result.setupObject.x).toBe(CANVAS_CENTER_X)
        expect(result.setupObject.y).toBe(CANVAS_CENTER_Y)
        expect(result.spawnAction.params.spawned).toBe(true)
    })

    it('creates audio type Shadow Object', () => {
        const scene = createMockScene()
        const block = createMockBlock()

        const result = createShadowObject({
            scene,
            block,
            slotIndex: 1,
            objectType: 'audio',
            resourceId: 'audio_001',
            resourceName: 'bgm',
            cameraCenterX: 0,
            cameraCenterY: 0
        })

        expect(result.setupObject.type).toBe('audio')
        expect(result.setupObject.spawned).toBe(false)
        expect((result.setupObject as unknown as Record<string, unknown>)['volume']).toBe(1.0)
        expect((result.setupObject as unknown as Record<string, unknown>)['loop']).toBe(false)
    })

    it('generates unique object ID', () => {
        const scene = createMockScene()
        const block = createMockBlock()

        const result1 = createShadowObject({
            scene,
            block,
            slotIndex: 0,
            objectType: 'prop',
            resourceId: 'prop_001',
            resourceName: 'prop1',
            cameraCenterX: 0,
            cameraCenterY: 0
        })

        const result2 = createShadowObject({
            scene,
            block,
            slotIndex: 0,
            objectType: 'prop',
            resourceId: 'prop_001',
            resourceName: 'prop2',
            cameraCenterX: 0,
            cameraCenterY: 0
        })

        expect(result1.setupObject.id).not.toBe(result2.setupObject.id)
    })
})

// ==================== isShadowObject 测试 ====================

describe('isShadowObject', () => {
    it('identifies spawned=false object as Shadow Object', () => {
        const obj: SceneObject = {
            id: 'obj_1',
            refId: 'char_001',
            type: 'prop',
            name: 'test',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            flipX: false,
            visible: true,
            spawned: false,
            alpha: 1
        }

        expect(isShadowObject(obj)).toBe(true)
    })

    it('identifies spawned=true object as non Shadow Object', () => {
        const obj: SceneObject = {
            id: 'obj_1',
            refId: 'char_001',
            type: 'prop',
            name: 'test',
            x: 100,
            y: 100,
            width: 0,
            height: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            flipX: false,
            visible: true,
            spawned: true,
            alpha: 1
        }

        expect(isShadowObject(obj)).toBe(false)
    })

    it('identifies undefined spawned object as non Shadow Object', () => {
        const obj = {
            id: 'obj_1',
            refId: 'char_001',
            type: 'prop',
            x: 100,
            y: 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            zIndex: 10,
            visible: true,
            alpha: 1
        } as SceneObject

        expect(isShadowObject(obj)).toBe(false)
    })
})

// ==================== findBirthSlotIndex 测试 ====================

describe('findBirthSlotIndex', () => {
    it('finds first spawned=true Action slot', () => {
        const actions: SetLifecycleAction[] = [
            {
                id: 'action_1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 2,
                params: { spawned: true }
            },
            {
                id: 'action_2',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 5,
                params: { spawned: false }
            }
        ]

        expect(findBirthSlotIndex('obj_1', actions)).toBe(2)
    })

    it('returns -1 when no spawned=true Action', () => {
        const actions: SetLifecycleAction[] = []

        expect(findBirthSlotIndex('obj_1', actions)).toBe(-1)
    })

    it('only considers target object Actions', () => {
        const actions: SetLifecycleAction[] = [
            {
                id: 'action_1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_2',
                slotIndex: 0,
                params: { spawned: true }
            },
            {
                id: 'action_2',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 3,
                params: { spawned: true }
            }
        ]

        expect(findBirthSlotIndex('obj_1', actions)).toBe(3)
    })
})

// ==================== isObjectAliveAtSlot 测试 ====================

describe('isObjectAliveAtSlot', () => {
    it('alive when Setup spawned=true and no Action', () => {
        const actions: SetLifecycleAction[] = []
        expect(isObjectAliveAtSlot('obj_1', 0, actions, true)).toBe(true)
    })

    it('inactive when Setup spawned=false and no Action', () => {
        const actions: SetLifecycleAction[] = []
        expect(isObjectAliveAtSlot('obj_1', 0, actions, false)).toBe(false)
    })

    it('becomes active after birth', () => {
        const actions: SetLifecycleAction[] = [
            {
                id: 'action_1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 2,
                params: { spawned: true }
            }
        ]

        expect(isObjectAliveAtSlot('obj_1', 0, actions, false)).toBe(false)
        expect(isObjectAliveAtSlot('obj_1', 1, actions, false)).toBe(false)
        expect(isObjectAliveAtSlot('obj_1', 2, actions, false)).toBe(true)
        expect(isObjectAliveAtSlot('obj_1', 3, actions, false)).toBe(true)
    })

    it('becomes inactive after despawn', () => {
        const actions: SetLifecycleAction[] = [
            {
                id: 'action_1',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 1,
                params: { spawned: true }
            },
            {
                id: 'action_2',
                type: 'set_lifecycle',
                category: 'point',
                target: 'obj_1',
                slotIndex: 4,
                params: { spawned: false }
            }
        ]

        expect(isObjectAliveAtSlot('obj_1', 0, actions, false)).toBe(false)
        expect(isObjectAliveAtSlot('obj_1', 1, actions, false)).toBe(true)
        expect(isObjectAliveAtSlot('obj_1', 3, actions, false)).toBe(true)
        expect(isObjectAliveAtSlot('obj_1', 4, actions, false)).toBe(false)
        expect(isObjectAliveAtSlot('obj_1', 5, actions, false)).toBe(false)
    })
})
