import { describe, expect, it } from 'vitest'

import type { Action, RuntimeSlot } from '@/types/screenplay'
import type { SceneObject } from '@/types/sceneObject'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'

import { evaluateObjectState, evaluateObjectStateBySlot } from '../actionEvaluator'
import { globalToLocal, localToGlobal } from '../actionHandlers/matrixUtils'
import { topologicalSortByParent } from '../evaluationOrder'

// ==================== Test Fixtures ====================

/** 创建无 parent 的基础对象 */
function makeObj(id: string, overrides?: Partial<SceneObject>): SceneObject {
    return {
        id, type: 'prop', name: id, refId: `ref_${id}`,
        x: 0, y: 0, width: 100, height: 100,
        scaleX: 1, scaleY: 1, rotation: 0, alpha: 1,
        visible: true, flipX: false, zIndex: 0,
        ...overrides,
    } as SceneObject
}

/** 构建 ActionHandlerContext（从 Map<id, SceneObject> 构建） */
function makeContext(objects: SceneObject[]): ActionHandlerContext {
    const map = new Map(objects.map(o => [o.id, o]))
    return {
        getObjectState: (id: string) => {
            const obj = map.get(id)
            return obj ? (obj as unknown as WriteableState) : undefined
        }
    }
}

// ==================== matrixUtils ====================

describe('globalToLocal / localToGlobal', () => {

    it('无 parent → 全局 = 本地（直通）', () => {
        const state = makeObj('a', { x: 100, y: 200 }) as unknown as WriteableState
        const result = globalToLocal({ x: 300, y: 400 }, state)
        expect(result.x).toBe(300)
        expect(result.y).toBe(400)
    })

    it('有 parent（仅平移）→ 正确转换', () => {
        const parent = makeObj('p', { x: 200, y: 300 })
        const child = makeObj('c', { x: 50, y: 0, parentId: 'p' })

        const ctx = makeContext([parent, child])
        const childState = child as unknown as WriteableState

        // 全局 (400, 500) → 相对于 parent(200,300) → 本地 (200, 200)
        const result = globalToLocal({ x: 400, y: 500 }, childState, ctx.getObjectState)
        expect(result.x).toBeCloseTo(200, 5)
        expect(result.y).toBeCloseTo(200, 5)
    })

    it('有 parent（平移+缩放）→ 正确转换', () => {
        const parent = makeObj('p', { x: 100, y: 100, scaleX: 2, scaleY: 2 })
        const child = makeObj('c', { x: 50, y: 50, parentId: 'p' })

        const ctx = makeContext([parent, child])
        const childState = child as unknown as WriteableState

        // parent 世界：x=100, y=100, scale=2x
        // 全局 (300, 300) → parent 本地 = (300-100)/2 = 100, (300-100)/2 = 100
        const result = globalToLocal({ x: 300, y: 300 }, childState, ctx.getObjectState)
        expect(result.x).toBeCloseTo(100, 5)
        expect(result.y).toBeCloseTo(100, 5)
    })

    it('localToGlobal 无 parent', () => {
        const state = makeObj('a', { x: 150, y: 250 }) as unknown as WriteableState
        const result = localToGlobal(state)
        expect(result.x).toBe(150)
        expect(result.y).toBe(250)
    })

    it('localToGlobal 有 parent（平移）', () => {
        const parent = makeObj('p', { x: 200, y: 300 })
        const child = makeObj('c', { x: 50, y: 100, parentId: 'p' })

        const ctx = makeContext([parent, child])
        const childState = child as unknown as WriteableState

        // 本地 (50, 100) + parent(200, 300) = 全局 (250, 400)
        const result = localToGlobal(childState, ctx.getObjectState)
        expect(result.x).toBeCloseTo(250, 5)
        expect(result.y).toBeCloseTo(400, 5)
    })

    it('globalToLocal → localToGlobal 往返一致', () => {
        // 注意：非均匀缩放(scaleX≠scaleY)+旋转 的矩阵分解有固有精度限制
        // 此测试使用均匀缩放确保往返精度
        const parent = makeObj('p', { x: 200, y: 100, scaleX: 1.5, scaleY: 1.5, rotation: 0.3 })
        const child = makeObj('c', { x: 30, y: 40, parentId: 'p' })

        const ctx = makeContext([parent, child])
        const childState = child as unknown as WriteableState

        const globalParams = { x: 500, y: 400, scaleX: 2, scaleY: 2, rotation: 0.5 }

        // 全局 → 本地
        const localResult = globalToLocal(globalParams, childState, ctx.getObjectState)

        // 更新 child state 为本地结果，再转回全局
        const updatedChild = {
            ...childState,
            x: localResult.x,
            y: localResult.y,
            scaleX: localResult.scaleX,
            scaleY: localResult.scaleY,
            rotation: localResult.rotation,
        } as WriteableState

        const globalResult = localToGlobal(updatedChild, ctx.getObjectState)
        expect(globalResult.x).toBeCloseTo(globalParams.x, 3)
        expect(globalResult.y).toBeCloseTo(globalParams.y, 3)
        expect(globalResult.scaleX).toBeCloseTo(globalParams.scaleX, 3)
        expect(globalResult.scaleY).toBeCloseTo(globalParams.scaleY, 3)
        expect(globalResult.rotation).toBeCloseTo(globalParams.rotation, 3)
    })
})

// ==================== evaluateObjectStateBySlot（Action Mode）====================

describe('evaluateObjectStateBySlot — 全局坐标转换', () => {

    it('无 parent 对象 set_transform → 行为不变', () => {
        const obj = makeObj('a', { x: 100, y: 100 })
        const actions: Action[] = [{
            id: 'st1', type: 'set_transform', category: 'point',
            target: 'a', slotIndex: 0,
            params: { x: 500, y: 300 }
        } as unknown as Action]

        const result = evaluateObjectStateBySlot(obj, actions, 0)
        expect(result.x).toBe(500)
        expect(result.y).toBe(300)
    })

    it('有 parent 对象 set_transform → 全局坐标转为 parent 本地', () => {
        const parent = makeObj('p', { x: 200, y: 300 })
        const child = makeObj('c', { x: 0, y: 0, parentId: 'p' })

        const ctx = makeContext([parent, child])

        // Action 存储全局坐标 (400, 500)
        const actions: Action[] = [{
            id: 'st1', type: 'set_transform', category: 'point',
            target: 'c', slotIndex: 0,
            params: { x: 400, y: 500 }
        } as unknown as Action]

        const result = evaluateObjectStateBySlot(child, actions, 0, undefined, ctx)
        // 预期结果：relative to parent(200,300) → (200, 200)
        expect(result.x).toBeCloseTo(200, 5)
        expect(result.y).toBeCloseTo(200, 5)
    })

    it('有 parent 对象 tween_transform 的 x/y → 全局坐标转为 parent 本地', () => {
        const parent = makeObj('p', { x: 100, y: 100 })
        const child = makeObj('c', { x: 50, y: 50, parentId: 'p' })

        const ctx = makeContext([parent, child])

        // Action 存储全局目标坐标 (500, 400)
        const actions: Action[] = [{
            id: 'tt1', type: 'tween_transform', category: 'duration',
            target: 'c', slotIndex: 0, slotSpan: 1,
            params: { x: 500, y: 400 }
        } as unknown as Action]

        const result = evaluateObjectStateBySlot(child, actions, 0, undefined, ctx)
        // 预期结果: (500-100, 400-100) = (400, 300)
        expect(result.x).toBeCloseTo(400, 5)
        expect(result.y).toBeCloseTo(300, 5)
    })
})

// ==================== evaluateObjectState（Preview Mode 插值）====================

describe('evaluateObjectState — 全局空间 tween 插值', () => {

    const slots: RuntimeSlot[] = [
        { type: 'subtitle', index: 0, startTime: 0, duration: 1000 },
        { type: 'subtitle', index: 1, startTime: 1000, duration: 1000 }
    ]

    it('无 parent tween 插值 → 行为不变', () => {
        const obj = makeObj('a', { x: 0, y: 0 })
        const actions: Action[] = [{
            id: 'tt1', type: 'tween_transform', category: 'duration',
            target: 'a', slotIndex: 0, slotSpan: 1, easing: 'linear',
            params: { x: 100, y: 200 }
        } as unknown as Action]

        // 中间帧 (50%)
        const result = evaluateObjectState(obj, actions, 500, 2000, slots)
        expect(result.x).toBeCloseTo(50, 1)
        expect(result.y).toBeCloseTo(100, 1)
    })

    it('有 parent tween 插值 → 全局空间 lerp 后转本地', () => {
        const parent = makeObj('p', { x: 200, y: 0 })
        const child = makeObj('c', { x: 0, y: 0, parentId: 'p' })
        // child 全局初始位置 = (200, 0)

        const ctx = makeContext([parent, child])

        // 全局目标 (400, 0)
        const actions: Action[] = [{
            id: 'tt1', type: 'tween_transform', category: 'duration',
            target: 'c', slotIndex: 0, slotSpan: 1, easing: 'linear',
            params: { x: 400, y: 0 }
        } as unknown as Action]

        // 50% → 全局 (300, 0) → 本地 (300-200, 0) = (100, 0)
        const result = evaluateObjectState(child, actions, 500, 2000, slots, -1, ctx)
        expect(result.x).toBeCloseTo(100, 1)
        expect(result.y).toBeCloseTo(0, 1)
    })

    it('有 parent 对象 tween_transform 的 rotation → 按局部值插值', () => {
        const parent = makeObj('p', { rotation: Math.PI / 4 })
        const child = makeObj('c', { rotation: 0, parentId: 'p' })

        const ctx = makeContext([parent, child])

        const actions: Action[] = [{
            id: 'tt_rotation', type: 'tween_transform', category: 'duration',
            target: 'c', slotIndex: 0, slotSpan: 1, easing: 'linear',
            params: { rotation: Math.PI / 2 }
        } as unknown as Action]

        const result = evaluateObjectState(child, actions, 500, 2000, slots, -1, ctx)
        expect(result.rotation).toBeCloseTo(Math.PI / 4, 6)
    })
})

// ==================== topologicalSortByParent ====================

describe('topologicalSortByParent', () => {

    it('无 parent 保持原序', () => {
        const objects = [
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
        ]
        const sorted = topologicalSortByParent(objects)
        expect(sorted.map(o => o.id)).toEqual(['a', 'b', 'c'])
    })

    it('parent 排在 child 之前', () => {
        const objects = [
            { id: 'child', parentId: 'parent' },
            { id: 'parent' },
            { id: 'standalone' },
        ]
        const sorted = topologicalSortByParent(objects)
        const parentIdx = sorted.findIndex(o => o.id === 'parent')
        const childIdx = sorted.findIndex(o => o.id === 'child')
        expect(parentIdx).toBeLessThan(childIdx)
    })

    it('多层嵌套正确排序', () => {
        const objects = [
            { id: 'grandchild', parentId: 'child' },
            { id: 'child', parentId: 'parent' },
            { id: 'parent' },
        ]
        const sorted = topologicalSortByParent(objects)
        const ids = sorted.map(o => o.id)
        expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('child'))
        expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('grandchild'))
    })

    it('孤儿（parentId 指向不存在的对象）视为深度 0', () => {
        const objects = [
            { id: 'orphan', parentId: 'nonexistent' },
            { id: 'root' },
        ]
        const sorted = topologicalSortByParent(objects)
        // 两者深度均为 0，保持原序
        expect(sorted.map(o => o.id)).toEqual(['orphan', 'root'])
    })

    it('parentId 为 null / undefined 均视为无 parent', () => {
        const objects = [
            { id: 'a', parentId: null },
            { id: 'b', parentId: undefined },
            { id: 'c' },
        ]
        const sorted = topologicalSortByParent(objects)
        expect(sorted.map(o => o.id)).toEqual(['a', 'b', 'c'])
    })

    it('循环 parentId 应抛出 Error (Fail-Fast)', () => {
        const objects = [
            { id: 'a', parentId: 'b' },
            { id: 'b', parentId: 'a' },
        ]
        expect(() => topologicalSortByParent(objects)).toThrow('循环的父子对象关系')
    })
})
