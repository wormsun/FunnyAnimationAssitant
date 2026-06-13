/**
 * P2: 组合对象 (Composite Object) 单元测试
 *
 * 覆盖：
 * - createCompositeObject 工厂函数
 * - removeObject 级联删除
 * - getChildObjects / getRootObjects 查询
 * - toSetupObject / fromSetupObject 序列化循环
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CompositeObject } from '@/types/sceneObject'
import { localToGlobal as resolveActionWorldTransform } from '@/utils/actionHandlers/matrixUtils'
import { resolveWorldMatrix } from '@/utils/actionHandlers/handlers/SetParentHandler'
import type { WriteableState } from '@/utils/actionHandlers/types'

import { useSceneObjectStore } from '../sceneObjectStore'

function expectWorldMatrixClose(
    actual: ReturnType<typeof resolveWorldMatrix>,
    expected: ReturnType<typeof resolveWorldMatrix>,
    digits = 5
): void {
    expect(actual.a).toBeCloseTo(expected.a, digits)
    expect(actual.b).toBeCloseTo(expected.b, digits)
    expect(actual.c).toBeCloseTo(expected.c, digits)
    expect(actual.d).toBeCloseTo(expected.d, digits)
    expect(actual.tx).toBeCloseTo(expected.tx, digits)
    expect(actual.ty).toBeCloseTo(expected.ty, digits)
}

// Mock stores that sceneObjectStore depends on
vi.mock('../characterStore', () => ({
    useCharacterStore: vi.fn(() => ({
        getCharacter: vi.fn(),
        characters: [],
    })),
}))

vi.mock('../projectStore', () => ({
    useProjectStore: vi.fn(() => ({
        markAsUnsaved: vi.fn(),
    })),
}))

describe('Composite Object - sceneObjectStore', () => {
    let store: ReturnType<typeof useSceneObjectStore>

    beforeEach(() => {
        setActivePinia(createPinia())
        store = useSceneObjectStore()
    })

    // ==================== createCompositeObject ====================

    describe('createCompositeObject', () => {
        it('should create a composite object with correct fields', () => {
            const composite = store.createCompositeObject('测试组合', [])

            expect(composite.type).toBe('composite')
            expect(composite.name).toBe('测试组合')
            expect(composite.childIds).toEqual([])
            expect(composite.id).toContain('sceneobject')
            expect(composite.refId).toBe('')
        })

        it('should set parentId on child objects', () => {
            // 先创建子对象
            const prop = store.createPropObject('prop1', '道具1')
            const bg = store.createBackgroundObject('bg1', '背景1')

            // 创建组合，指定子对象
            const composite = store.createCompositeObject('组合1', [prop.id, bg.id])

            expect(composite.childIds).toContain(prop.id)
            expect(composite.childIds).toContain(bg.id)

            // 验证子对象的 parentId 被设置
            const updatedProp = store.getObject(prop.id)
            const updatedBg = store.getObject(bg.id)
            expect(updatedProp?.parentId).toBe(composite.id)
            expect(updatedBg?.parentId).toBe(composite.id)
        })

        it('should generate unique alias', () => {
            const c1 = store.createCompositeObject('组合')
            const c2 = store.createCompositeObject('组合')

            expect(c1.alias).toBe('组合')
            expect(c2.alias).toBe('组合1')
        })

        it('should generate unique alias inside an entity namespace', () => {
            const entity = store.createCompositeObject('顾砚舟', [], undefined, undefined, 'entity')
            const existingGroup = store.createCompositeObject('组合', [], undefined, undefined, 'union')
            existingGroup.parentId = entity.id
            entity.childIds = [existingGroup.id]

            const nextGroup = store.createCompositeObject('组合', [], undefined, undefined, 'union', entity.id)

            expect(existingGroup.alias).toBe('组合')
            expect(nextGroup.alias).toBe('组合1')
        })

        it('should use custom id and alias when provided', () => {
            const composite = store.createCompositeObject('测试', [], 'custom-id', 'custom-alias')

            expect(composite.id).toBe('custom-id')
            expect(composite.alias).toBe('custom-alias')
        })
    })

    // ==================== removeObject (cascade) ====================

    describe('removeObject (cascade delete)', () => {
        it('should cascade delete child objects when composite is removed', () => {
            const prop1 = store.createPropObject('p1', '道具1')
            const prop2 = store.createPropObject('p2', '道具2')
            const composite = store.createCompositeObject('组合', [prop1.id, prop2.id], undefined, undefined, 'entity')

            expect(store.objects.length).toBe(3)

            // 删除组合对象
            store.removeObject(composite.id)

            // 所有对象都被删除
            expect(store.objects.length).toBe(0)
            expect(store.getObject(prop1.id)).toBeUndefined()
            expect(store.getObject(prop2.id)).toBeUndefined()
            expect(store.getObject(composite.id)).toBeUndefined()
        })

        it('should remove child from parent childIds when deleting a child directly', () => {
            const prop = store.createPropObject('p1', '道具1')
            const composite = store.createCompositeObject('组合', [prop.id])

            // 直接删除子对象
            store.removeObject(prop.id)

            // 子对象被删除
            expect(store.getObject(prop.id)).toBeUndefined()

            // 父对象的 childIds 已更新
            const parent = store.getObject(composite.id) as CompositeObject
            expect(parent.childIds).toEqual([])
        })

        it('should handle nested composite cascade', () => {
            const innerProp = store.createPropObject('p1', '内层道具')
            const innerComposite = store.createCompositeObject('内层组合', [innerProp.id], undefined, undefined, 'entity')
            const outerComposite = store.createCompositeObject('外层组合', [innerComposite.id], undefined, undefined, 'entity')

            expect(store.objects.length).toBe(3)

            // 删除外层组合
            store.removeObject(outerComposite.id)

            // 所有嵌套对象都被删除
            expect(store.objects.length).toBe(0)
        })

        it('should clear selectedObjectId when deleted object was selected', () => {
            const composite = store.createCompositeObject('group', [])
            store.selectObject(composite.id)

            expect(store.selectedObjectId).toBe(composite.id)

            store.removeObject(composite.id)
            expect(store.selectedObjectId).toBeNull()
        })

        it('should clear child parentId in setup state when removing a union composite in action mode', () => {
            const childA = store.createPropObject('p1', 'child1')
            const childB = store.createAudioObject('a1', 'child2')
            const unionComposite = store.createCompositeObject('group', [childA.id, childB.id], undefined, undefined, 'union')

            expect(store.getSetupObject(childA.id)?.parentId).toBe(unionComposite.id)
            expect(store.getSetupObject(childB.id)?.parentId).toBe(unionComposite.id)

            store.setActionMode(true)
            store.removeSetupObject(unionComposite.id)

            expect(store.getSetupObject(unionComposite.id)).toBeUndefined()
            expect(store.getSetupObject(childA.id)?.parentId).toBeUndefined()
            expect(store.getSetupObject(childB.id)?.parentId).toBeUndefined()

            store.setActionMode(false)
            store.setActionMode(true)

            expect(store.getObject(childA.id)?.parentId).toBeUndefined()
            expect(store.getObject(childB.id)?.parentId).toBeUndefined()
        })
    })

    describe('selectObject auto-relock', () => {
        it('should relock an unlocked composite when clearing selection in setup mode', () => {
            const prop = store.createPropObject('p1', '道具1')
            const composite = store.createCompositeObject('组合', [prop.id]) as CompositeObject

            store.updateObject(composite.id, { compositeLocked: false } as Partial<CompositeObject>)
            expect((store.getObject(composite.id) as CompositeObject).compositeLocked).toBe(false)

            store.selectObject(null)

            expect((store.getObject(composite.id) as CompositeObject).compositeLocked).toBe(true)
        })

        it('should relock an unlocked composite when clearing selection in action mode', () => {
            const prop = store.createPropObject('p1', '道具1')
            const composite = store.createCompositeObject('组合', [prop.id]) as CompositeObject

            store.setActionMode(true)
            store.updateSetupObject(composite.id, { compositeLocked: false } as Partial<CompositeObject>)
            expect((store.getSetupObject(composite.id) as CompositeObject).compositeLocked).toBe(false)
            expect((store.getObject(composite.id) as CompositeObject).compositeLocked).toBe(false)

            store.selectObject(null)

            expect((store.getSetupObject(composite.id) as CompositeObject).compositeLocked).toBe(true)
            expect((store.getObject(composite.id) as CompositeObject).compositeLocked).toBe(true)
        })
    })

    describe('getChildObjects', () => {
        it('should return children of a composite object', () => {
            const prop1 = store.createPropObject('p1', '道具1')
            const prop2 = store.createPropObject('p2', '道具2')
            const standalone = store.createPropObject('p3', '独立道具')
            const composite = store.createCompositeObject('组合', [prop1.id, prop2.id])

            const children = store.getChildObjects(composite.id)
            expect(children.length).toBe(2)
            expect(children.map(c => c.id)).toContain(prop1.id)
            expect(children.map(c => c.id)).toContain(prop2.id)
            expect(children.map(c => c.id)).not.toContain(standalone.id)
        })

        it('should return children in childIds order', () => {
            const prop1 = store.createPropObject('p1', '道具1')
            const prop2 = store.createPropObject('p2', '道具2')
            const prop3 = store.createPropObject('p3', '道具3')
            const composite = store.createCompositeObject('组合', [prop2.id, prop3.id, prop1.id])

            const children = store.getChildObjects(composite.id)
            expect(children.map(c => c.id)).toEqual([prop2.id, prop3.id, prop1.id])
        })

        it('should return empty array for objects without children', () => {
            const prop = store.createPropObject('p1', '道具')
            expect(store.getChildObjects(prop.id)).toEqual([])
        })
    })

    // ==================== reorderChild ====================

    describe('reorderChild', () => {
        it('should move child from one position to another', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const p3 = store.createPropObject('p3', '道具3')
            // v19: 必须为 entity 才拥有独立的 renderChain
            const composite = store.createCompositeObject('组合', [p1.id, p2.id, p3.id], undefined, undefined, 'entity')
            // 手动填充 renderChain（createCompositeObject 仅做基础构造）
            const comp = store.getObject(composite.id) as CompositeObject
            comp.renderChain = [p1.id, p2.id, p3.id]

            // Move p1 (index 0) to index 2
            store.reorderChild(composite.id, 0, 2)

            expect(comp.renderChain).toEqual([p2.id, p3.id, p1.id])
        })

        it('should move child backward', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const p3 = store.createPropObject('p3', '道具3')
            const composite = store.createCompositeObject('组合', [p1.id, p2.id, p3.id], undefined, undefined, 'entity')
            const comp = store.getObject(composite.id) as CompositeObject
            comp.renderChain = [p1.id, p2.id, p3.id]

            // Move p3 (index 2) to index 0
            store.reorderChild(composite.id, 2, 0)

            expect(comp.renderChain).toEqual([p3.id, p1.id, p2.id])
        })

        it('should be no-op for same index', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const composite = store.createCompositeObject('组合', [p1.id, p2.id], undefined, undefined, 'entity')
            const comp = store.getObject(composite.id) as CompositeObject
            comp.renderChain = [p1.id, p2.id]

            store.reorderChild(composite.id, 1, 1)

            expect(comp.renderChain).toEqual([p1.id, p2.id])
        })

        it('should be no-op for invalid indices', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.createCompositeObject('组合', [p1.id], undefined, undefined, 'entity')
            const comp = store.getObject(composite.id) as CompositeObject
            comp.renderChain = [p1.id]

            store.reorderChild(composite.id, -1, 0)
            store.reorderChild(composite.id, 0, 5)
            store.reorderChild(composite.id, 10, 0)

            expect(comp.renderChain).toEqual([p1.id])
        })

        it('should be no-op for non-composite object', () => {
            const p1 = store.createPropObject('p1', '道具1')
            // Should not throw
            store.reorderChild(p1.id, 0, 1)
        })
    })

    describe('getRootObjects', () => {
        it('should return only objects without parentId', () => {
            const prop = store.createPropObject('p1', '道具')
            const composite = store.createCompositeObject('组合', [prop.id])
            const standalone = store.createPropObject('p2', '独立道具')

            const roots = store.getRootObjects()
            expect(roots.length).toBe(2) // composite + standalone
            expect(roots.map(r => r.id)).toContain(composite.id)
            expect(roots.map(r => r.id)).toContain(standalone.id)
            expect(roots.map(r => r.id)).not.toContain(prop.id) // prop has parentId
        })
    })

    // ==================== toSetupObject (parentId persistence) ====================

    describe('toSetupObject (parentId)', () => {
        it('should serialize parentId when present', () => {
            const prop = store.createPropObject('p1', '道具')
            const composite = store.createCompositeObject('组合', [prop.id])

            const propData = store.toSetupObject(store.getObject(prop.id)!)
            const compositeData = store.toSetupObject(store.getObject(composite.id)!)

            // prop 有 parentId
            expect(propData.parentId).toBe(composite.id)
            // composite 无 parentId
            expect(compositeData.parentId).toBeUndefined()
        })

        it('should serialize childIds for composite', () => {
            const prop = store.createPropObject('p1', '道具')
            const composite = store.createCompositeObject('组合', [prop.id])

            const data = store.toSetupObject(store.getObject(composite.id)!)
            const compositeData = data as unknown as { childIds: string[] }
            expect(compositeData.childIds).toContain(prop.id)
        })
    })

    // ==================== duplicateObject (recursive) ====================

    describe('duplicateObject (recursive)', () => {
        it('should recursively duplicate composite with children', () => {
            const prop = store.createPropObject('p1', '道具')
            const composite = store.createCompositeObject('组合', [prop.id])

            const dup = store.duplicateObject(composite.id)
            expect(dup).toBeDefined()
            expect(dup!.type).toBe('composite')
            expect(dup!.id).not.toBe(composite.id)

            // 新组合对象有新的子对象
            const dupComposite = dup as CompositeObject
            expect(dupComposite.childIds.length).toBe(1)
            expect(dupComposite.childIds[0]).not.toBe(prop.id)

            // 子对象的 parentId 指向新组合
            const dupChild = store.getObject(dupComposite.childIds[0]!)
            expect(dupChild).toBeDefined()
            expect(dupChild!.parentId).toBe(dup!.id)

            // 原始对象不受影响
            expect(store.getObject(prop.id)?.parentId).toBe(composite.id)
        })

        it('should not have parentId on duplicated top-level object', () => {
            const prop = store.createPropObject('p1', '道具')
            store.createCompositeObject('组合', [prop.id])

            const dup = store.duplicateObject(prop.id)
            // 复制的子对象应是顶层对象（无 parentId）
            expect(dup!.parentId).toBeUndefined()
        })

        it('should preserve entity renderChain order with duplicated child ids only', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const entity = store.groupObjects([p1.id, p2.id], 'entity') as CompositeObject
            const entityInStore = store.getObject(entity.id) as CompositeObject
            entityInStore.renderChain = [p2.id, p1.id]

            const dup = store.duplicateObject(entityInStore.id) as CompositeObject
            expect(dup).toBeDefined()
            expect(dup.type).toBe('composite')
            expect(dup.compositeMode).toBe('entity')
            const dupInStore = store.getObject(dup.id) as CompositeObject

            const dupChildIds = new Set(dup.childIds)
            expect(dupChildIds.size).toBe(2)
            expect(dupChildIds.has(p1.id)).toBe(false)
            expect(dupChildIds.has(p2.id)).toBe(false)

            const duplicatedP1Id = dup.childIds[0]!
            const duplicatedP2Id = dup.childIds[1]!

            // 新 entity 的 renderChain 必须只引用新子对象 ID，并保留原链自定义顺序
            expect(dup.renderChain).toBeDefined()
            expect(new Set(dup.renderChain ?? [])).toEqual(dupChildIds)
            expect(dup.renderChain).toEqual([duplicatedP2Id, duplicatedP1Id])
            expect(dupInStore.renderChain).toEqual([duplicatedP2Id, duplicatedP1Id])
            expect((dup.renderChain ?? []).includes(p1.id)).toBe(false)
            expect((dup.renderChain ?? []).includes(p2.id)).toBe(false)

            // 根级 renderChain 不应残留 entity 子对象
            const sceneChain = store.getSceneRenderChain()
            for (const childId of dup.childIds) {
                expect(sceneChain.includes(childId)).toBe(false)
            }
        })
    })
})

// ==================== Phase A: compositeLocked / compositeMode ====================

describe('Phase A: CompositeObject new fields', () => {
    let store: ReturnType<typeof useSceneObjectStore>

    beforeEach(() => {
        setActivePinia(createPinia())
        store = useSceneObjectStore()
    })

    it('should have compositeLocked=true by default', () => {
        const composite = store.createCompositeObject('组合') as CompositeObject
        expect(composite.compositeLocked).toBe(true)
    })

    it('should have compositeMode=union by default', () => {
        const composite = store.createCompositeObject('组合') as CompositeObject
        expect(composite.compositeMode).toBe('union')
    })

    it('should allow toggling compositeLocked', () => {
        const composite = store.createCompositeObject('组合') as CompositeObject
        store.updateObject(composite.id, { compositeLocked: false } as Partial<CompositeObject>)
        const updated = store.getObject(composite.id) as CompositeObject
        expect(updated.compositeLocked).toBe(false)
    })
})

// ==================== Phase B: Store batch operations ====================

describe('Phase B: groupObjects / ungroupAll / addToComposite / removeFromComposite', () => {
    let store: ReturnType<typeof useSceneObjectStore>

    beforeEach(() => {
        setActivePinia(createPinia())
        store = useSceneObjectStore()
    })

    describe('groupObjects', () => {
        it('should create a composite and set parentId on children', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')

            const composite = store.groupObjects([p1.id, p2.id])

            expect(composite.type).toBe('composite')
            expect(composite.childIds).toContain(p1.id)
            expect(composite.childIds).toContain(p2.id)
            expect(store.getObject(p1.id)?.parentId).toBe(composite.id)
            expect(store.getObject(p2.id)?.parentId).toBe(composite.id)
        })

        it('should accept compositeMode parameter', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id], 'union') as CompositeObject

            expect(composite.compositeMode).toBe('union')
        })

        it('should group siblings under the same parent composite', () => {
            // 创建父组合 A，含 p1, p2, p3 三个子对象
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const p3 = store.createPropObject('p3', '道具3')
            const parentA = store.createCompositeObject('父组合', [p1.id, p2.id, p3.id])

            // 将 p1 和 p2（同级兄弟）成组为子组合 B
            const subComposite = store.groupObjects([p1.id, p2.id])

            // 新组合 B 继承 parentA 的 id 作为 parentId
            expect(subComposite.parentId).toBe(parentA.id)

            // 新组合 B 包含 p1 和 p2
            expect(subComposite.childIds).toContain(p1.id)
            expect(subComposite.childIds).toContain(p2.id)

            // p1 和 p2 的 parentId 变为新组合 B
            expect(store.getObject(p1.id)?.parentId).toBe(subComposite.id)
            expect(store.getObject(p2.id)?.parentId).toBe(subComposite.id)

            // 父组合 A 的 childIds 不再包含 p1, p2，而包含 subComposite 和 p3
            const updatedA = store.getObject(parentA.id) as CompositeObject
            expect(updatedA.childIds).not.toContain(p1.id)
            expect(updatedA.childIds).not.toContain(p2.id)
            expect(updatedA.childIds).toContain(subComposite.id)
            expect(updatedA.childIds).toContain(p3.id)
        })

        it('should throw when grouping objects with different parentIds', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            store.createCompositeObject('组合A', [p1.id])
            // p2 是根级对象（parentId = undefined），p1 是子对象（parentId = 组合A.id）

            expect(() => {
                store.groupObjects([p1.id, p2.id])
            }).toThrow(/同一个 parentId/)
        })
    })

    describe('ungroupAll', () => {
        it('should remove parentId from all children and delete composite', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const composite = store.groupObjects([p1.id, p2.id])

            store.ungroupAll(composite.id)

            expect(store.getObject(p1.id)?.parentId).toBeUndefined()
            expect(store.getObject(p2.id)?.parentId).toBeUndefined()
            expect(store.getObject(composite.id)).toBeUndefined()
        })

        it('should preserve child objects after ungroup', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id])

            store.ungroupAll(composite.id)

            // 子对象仍然存在
            expect(store.getObject(p1.id)).toBeDefined()
        })
    })

    describe('addToComposite', () => {
        it('should add objects to existing composite', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id])

            const p2 = store.createPropObject('p2', '道具2')
            store.addToComposite(composite.id, [p2.id])

            const updated = store.getObject(composite.id) as CompositeObject
            expect(updated.childIds).toContain(p2.id)
            expect(store.getObject(p2.id)?.parentId).toBe(composite.id)
        })

        it('should preserve world position when adding a root object into a nested union composite', () => {
            const arm = store.createPropObject('arm', '左臂')
            store.updateObject(arm.id, { x: 120, y: 80 })

            const sword = store.createPropObject('sword', '剑')
            store.updateObject(sword.id, { x: 180, y: 90 })

            const entity = store.groupObjects([arm.id, sword.id], 'entity') as CompositeObject
            store.updateObject(entity.id, {
                x: 1000,
                y: 600,
                scaleX: 1.2,
                scaleY: 1.1,
                rotation: Math.PI / 9,
            })

            const union = store.groupObjects([arm.id, sword.id], 'union') as CompositeObject
            store.updateObject(union.id, {
                x: 150,
                y: 40,
                rotation: Math.PI / 12,
            })

            const prop = store.createPropObject('dynamic', '动态道具')
            store.updateObject(prop.id, {
                x: 1320,
                y: 760,
                scaleX: 0.9,
                scaleY: 1.05,
                rotation: Math.PI / 7,
            })

            const before = store.getObject(prop.id)!
            store.addToComposite(union.id, [prop.id])
            const after = store.getObject(prop.id)!

            expect(after.parentId).toBe(union.id)

            // 挂入嵌套 union 后，应保持画布世界坐标不跳变
            const entityAfter = store.getObject(entity.id)!
            const unionAfter = store.getObject(union.id)!
            const worldAfter = resolveActionWorldTransform(
                {
                    id: after.id,
                    x: after.x,
                    y: after.y,
                    scaleX: after.scaleX,
                    scaleY: after.scaleY,
                    rotation: after.rotation,
                    flipX: after.flipX,
                    parentId: after.parentId ?? null,
                } as WriteableState,
                (id: string) => {
                    if (id === unionAfter.id) {
                        return {
                            id: unionAfter.id,
                            x: unionAfter.x,
                            y: unionAfter.y,
                            scaleX: unionAfter.scaleX,
                            scaleY: unionAfter.scaleY,
                            rotation: unionAfter.rotation,
                            flipX: unionAfter.flipX,
                            parentId: unionAfter.parentId ?? null,
                        } as WriteableState
                    }
                    if (id === entityAfter.id) {
                        return {
                            id: entityAfter.id,
                            x: entityAfter.x,
                            y: entityAfter.y,
                            scaleX: entityAfter.scaleX,
                            scaleY: entityAfter.scaleY,
                            rotation: entityAfter.rotation,
                            flipX: entityAfter.flipX,
                            parentId: entityAfter.parentId ?? null,
                        } as WriteableState
                    }
                    return undefined
                },
            )

            expect(Math.abs(worldAfter.x - before.x)).toBeLessThan(2)
            expect(Math.abs(worldAfter.y - before.y)).toBeLessThan(2)
        })
    })

    describe('removeFromComposite', () => {
        it('should remove child from composite and clear parentId', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const composite = store.groupObjects([p1.id, p2.id])

            store.removeFromComposite([p1.id])

            expect(store.getObject(p1.id)?.parentId).toBeUndefined()
            const updated = store.getObject(composite.id) as CompositeObject
            expect(updated.childIds).not.toContain(p1.id)
            expect(updated.childIds).toContain(p2.id)
        })
    })

    describe('compositeMode=bind delete behavior', () => {
        it('should bubble children when bind-mode composite is deleted', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id], 'union')

            store.removeObject(composite.id)

            // bind 模式：子对象应存活（冒泡），parentId 清除
            expect(store.getObject(p1.id)).toBeDefined()
            expect(store.getObject(p1.id)?.parentId).toBeUndefined()
        })

        it('should bubble children to grandparent when nested bind-mode composite is deleted', () => {
            // 爷爷 A → 父亲 B(bind) → 孙子 C
            const propC = store.createPropObject('pC', '孙子道具')
            const compositeB = store.groupObjects([propC.id], 'union')
            const compositeA = store.createCompositeObject('爷爷', [compositeB.id])

            // 删除 B → C 应冒泡到 A（而非 undefined）
            store.removeObject(compositeB.id)

            expect(store.getObject(propC.id)).toBeDefined()
            expect(store.getObject(propC.id)?.parentId).toBe(compositeA.id)
        })

        it('should propagate flipX when union composite with flipX is deleted (onBeforeDelete)', () => {
            // v19.2: union composite flipX 冒泡修复回归测试
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id], 'union')

            // 设置 composite flipX=true
            store.updateObject(composite.id, { flipX: true } as Partial<import('@/types/sceneObject').SceneObject>)

            // 删除 composite → 子对象冒泡
            store.removeObject(composite.id)

            // 子对象应继承 flipX=true
            expect(store.getObject(p1.id)).toBeDefined()
            expect(store.getObject(p1.id)?.flipX).toBe(true)
        })

        it('should propagate flipX when dissolving union composite with flipX', () => {
            // v19.2: dissolveComposite 路径 flipX 回归保护
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id], 'union')

            // 设置 composite flipX=true
            store.updateObject(composite.id, { flipX: true } as Partial<import('@/types/sceneObject').SceneObject>)

            // 解散 composite → 子对象冒泡
            store.dissolveComposite(composite.id)

            // 子对象应继承 flipX=true
            expect(store.getObject(p1.id)).toBeDefined()
            expect(store.getObject(p1.id)?.flipX).toBe(true)
        })

        it('should keep render matrix when dissolving nested entity composite with transform origin child', () => {
            const parent = store.createCompositeObject('父级')
            store.updateObject(parent.id, {
                x: 4507.540983606557,
                y: 1594.0387481371088,
                scaleX: 2.2898676009569847,
                scaleY: 2.2898676009569847,
                rotation: 0,
                flipX: false,
            } as Partial<CompositeObject>)

            const child = store.createPropObject('child', '带转轴子对象')
            store.updateObject(child.id, {
                x: 8.679135962929422,
                y: -29.78506891273628,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                flipX: false,
                transformOriginX: -17.5,
                transformOriginY: -63.333335876464844,
            } as Partial<import('@/types/sceneObject').SceneObject>)

            const entity = store.createCompositeObject('待删除 entity', [child.id], undefined, undefined, 'entity')
            store.updateObject(entity.id, {
                parentId: parent.id,
                x: 55.485864037070996,
                y: 22.270068912736463,
                scaleX: 1,
                scaleY: 1,
                rotation: 1.3252758981866675,
                flipX: false,
            } as Partial<CompositeObject>)
            ;(store.getObject(parent.id) as CompositeObject).childIds.push(entity.id)

            const getObjectState = (id: string): WriteableState | undefined => {
                const obj = store.getObject(id)
                return obj ? ({ ...obj, parentId: obj.parentId ?? null } as WriteableState) : undefined
            }
            const beforeWorldMatrix = resolveWorldMatrix(
                getObjectState(child.id)!,
                getObjectState,
            )

            store.dissolveComposite(entity.id)
            store.removeObject(entity.id)

            const updatedChild = store.getObject(child.id)
            expect(updatedChild).toBeDefined()
            expect(updatedChild?.parentId).toBe(parent.id)
            expect(store.getObject(entity.id)).toBeUndefined()

            const afterWorldMatrix = resolveWorldMatrix(
                getObjectState(child.id)!,
                getObjectState,
            )
            expectWorldMatrixClose(afterWorldMatrix, beforeWorldMatrix)
        })

        it('should propagate flipX when ungrouping union composite with flipX', () => {
            // v19.2: ungroupAll 路径 flipX 回归保护
            const p1 = store.createPropObject('p1', '道具1')
            const composite = store.groupObjects([p1.id], 'union')

            // 设置 composite flipX=true
            store.updateObject(composite.id, { flipX: true } as Partial<import('@/types/sceneObject').SceneObject>)

            // 拆组 → 子对象独立
            store.ungroupAll(composite.id)

            // 子对象应继承 flipX=true
            expect(store.getObject(p1.id)).toBeDefined()
            expect(store.getObject(p1.id)?.flipX).toBe(true)
        })
    })

    describe('ungroupAll nesting bubble', () => {
        it('should bubble children to parent composite when ungrouping nested composite', () => {
            // A → B → C，拆分 B → C 回到 A
            const propC = store.createPropObject('pC', '孙子')
            const compositeB = store.groupObjects([propC.id])
            const compositeA = store.createCompositeObject('爷爷', [compositeB.id])

            store.ungroupAll(compositeB.id)

            expect(store.getObject(propC.id)).toBeDefined()
            expect(store.getObject(propC.id)?.parentId).toBe(compositeA.id)
            expect(store.getObject(compositeB.id)).toBeUndefined()
        })
    })

    describe('removeFromComposite nesting bubble', () => {
        it('should bubble child to parent composite when removing from nested composite', () => {
            const propC = store.createPropObject('pC', '孙子')
            const compositeB = store.groupObjects([propC.id])
            const compositeA = store.createCompositeObject('爷爷', [compositeB.id])

            store.removeFromComposite([propC.id])

            expect(store.getObject(propC.id)).toBeDefined()
            // C 从 B 中移出 → 冒泡到 B 的 parentId（= A.id）
            expect(store.getObject(propC.id)?.parentId).toBe(compositeA.id)
        })

        it('should keep world position when bubbling child to parent composite', () => {
            const compositeA = store.createCompositeObject('爷爷')
            store.updateObject(compositeA.id, { x: 100, y: 200 } as Partial<CompositeObject>)

            const compositeB = store.createCompositeObject('父级')
            store.updateObject(compositeB.id, {
                parentId: compositeA.id,
                x: 10,
                y: 20,
            } as Partial<CompositeObject>)
            ;(store.getObject(compositeA.id) as CompositeObject).childIds.push(compositeB.id)

            const propC = store.createPropObject('pC', '孙子')
            store.updateObject(propC.id, {
                parentId: compositeB.id,
                x: 5,
                y: 6,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                flipX: false,
            } as Partial<import('@/types/sceneObject').SceneObject>)
            ;(store.getObject(compositeB.id) as CompositeObject).childIds.push(propC.id)

            store.removeFromComposite([propC.id])

            const updated = store.getObject(propC.id)
            expect(updated?.parentId).toBe(compositeA.id)
            expect(updated?.x).toBeCloseTo(15, 5)
            expect(updated?.y).toBeCloseTo(26, 5)
        })
    })

    describe('cycle detection', () => {
        it('should throw error when adding ancestor to descendant composite', () => {
            // A 包含 B → 尝试将 A 加入 B → 应抛 Error
            const compositeB = store.createCompositeObject('B')
            const compositeA = store.createCompositeObject('A', [compositeB.id])

            expect(() => {
                store.addToComposite(compositeB.id, [compositeA.id])
            }).toThrow(/循环引用/)
        })

        it('should throw error for deep cycle: A→B→C, try to add A into C', () => {
            const compositeC = store.createCompositeObject('C')
            const compositeB = store.createCompositeObject('B', [compositeC.id])
            const compositeA = store.createCompositeObject('A', [compositeB.id])

            expect(() => {
                store.addToComposite(compositeC.id, [compositeA.id])
            }).toThrow(/循环引用/)
        })

        it('should allow adding unrelated object (no cycle)', () => {
            const compositeA = store.createCompositeObject('A')
            const prop = store.createPropObject('p1', '道具')

            expect(() => {
                store.addToComposite(compositeA.id, [prop.id])
            }).not.toThrow()
        })
    })
})
