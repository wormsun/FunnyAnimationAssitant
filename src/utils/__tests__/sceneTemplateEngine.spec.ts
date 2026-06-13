/**
 * sceneTemplateEngine 单元测试
 * v17: 多根平坦列表结构
 */

import { describe, expect, it } from 'vitest'

import type { CompositeObject, SceneObject } from '@/types/sceneObject'

import {
    buildTemplateFromObjects,
    instantiateTemplate,
    snapshotToTemplate,
} from '../sceneTemplateEngine'

// ===== 辅助工厂函数 =====

function makeObject(overrides: Partial<SceneObject> & { id: string; type: SceneObject['type'] }): SceneObject {
    return {
        name: overrides.name ?? `obj-${overrides.id}`,
        refId: '',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        flipX: false,
        visible: true,
        opacity: 1,
        zIndex: 0,
        initialAnimations: [],
        ...overrides,
    } as SceneObject
}

function makeComposite(id: string, childIds: string[], overrides?: Partial<CompositeObject>): CompositeObject {
    return {
        ...makeObject({ id, type: 'composite', ...overrides }),
        type: 'composite',
        childIds,
        compositeMode: 'union',
    } as CompositeObject
}

// ===== snapshotToTemplate =====

describe('snapshotToTemplate', () => {
    it('单个对象快照 → objects.length === 1', () => {
        const obj = makeObject({ id: 'a', type: 'prop', x: 100, y: 200 })
        const template = snapshotToTemplate([obj], [obj], '测试模板')

        expect(template.objects).toHaveLength(1)
        expect(template.name).toBe('测试模板')
        expect(template.id).toMatch(/^stpl_/)
        expect(template.createdAt).toBeGreaterThan(0)
    })

    it('坐标归零：单个对象 → 中心为 (0, 0)', () => {
        const obj = makeObject({ id: 'a', type: 'prop', x: 300, y: 400 })
        const template = snapshotToTemplate([obj], [obj], '测试')

        expect(template.objects[0]!.x).toBe(0)
        expect(template.objects[0]!.y).toBe(0)
    })

    it('坐标归零：多对象使用包围盒中心', () => {
        const a = makeObject({ id: 'a', type: 'prop', x: 0, y: 0 })
        const b = makeObject({ id: 'b', type: 'prop', x: 200, y: 100 })
        const template = snapshotToTemplate([a, b], [a, b], '测试')

        // 包围盒中心: (100, 50)
        expect(template.objects[0]!.x).toBe(-100) // 0 - 100
        expect(template.objects[0]!.y).toBe(-50)   // 0 - 50
        expect(template.objects[1]!.x).toBe(100)    // 200 - 100
        expect(template.objects[1]!.y).toBe(50)     // 100 - 50
    })

    it('composite 快照 → 自动收集子对象', () => {
        const child1 = makeObject({ id: 'c1', type: 'prop', parentId: 'comp' })
        const child2 = makeObject({ id: 'c2', type: 'prop', parentId: 'comp' })
        const composite = makeComposite('comp', ['c1', 'c2'])

        const allObjects = [composite, child1, child2]
        const template = snapshotToTemplate([composite], allObjects, '组合模板')

        expect(template.objects).toHaveLength(3) // composite + 2 children
    })

    it('嵌套 composite → 递归收集', () => {
        const leaf = makeObject({ id: 'leaf', type: 'prop', parentId: 'inner' })
        const inner = makeComposite('inner', ['leaf'], { parentId: 'outer' } as Partial<CompositeObject>)
        const outer = makeComposite('outer', ['inner'])

        const allObjects: SceneObject[] = [outer, inner, leaf]
        const template = snapshotToTemplate([outer], allObjects, '嵌套模板')

        expect(template.objects).toHaveLength(3)
    })

    it('去重：重复的对象不会重复收集', () => {
        const obj = makeObject({ id: 'a', type: 'prop' })
        const template = snapshotToTemplate([obj, obj], [obj], '去重测试')

        expect(template.objects).toHaveLength(1)
    })

    it('标签正确保存', () => {
        const obj = makeObject({ id: 'a', type: 'prop' })
        const template = snapshotToTemplate([obj], [obj], '标签测试', ['室内', '对话'])

        expect(template.tags).toEqual(['室内', '对话'])
    })

    it('无标签时 tags 字段不存在', () => {
        const obj = makeObject({ id: 'a', type: 'prop' })
        const template = snapshotToTemplate([obj], [obj], '无标签')

        expect(template.tags).toBeUndefined()
    })

    it('清除 spawned 字段', () => {
        const obj = makeObject({ id: 'a', type: 'prop' }) as SceneObject & { spawned?: boolean }
        obj.spawned = false
        const template = snapshotToTemplate([obj], [obj as SceneObject], '测试')

        const result = template.objects[0] as unknown as Record<string, unknown>
        expect(result['spawned']).toBeUndefined()
    })

    it('顶层对象 parentId 被清除', () => {
        const obj = makeObject({ id: 'a', type: 'prop', parentId: 'external' })
        const template = snapshotToTemplate([obj], [obj], '测试')

        expect(template.objects[0]!.parentId).toBeUndefined()
    })

    it('记录 editorAnchor（归零前的包围盒中心）', () => {
        const a = makeObject({ id: 'a', type: 'prop', x: 300, y: 400 })
        const b = makeObject({ id: 'b', type: 'prop', x: 500, y: 600 })
        const template = snapshotToTemplate([a, b], [a, b], '锚点测试')

        // 包围盒中心: (400, 500)
        expect(template.editorAnchor).toEqual({ x: 400, y: 500 })
    })

    it('composite 子对象的局部坐标不受归零影响（回归测试）', () => {
        // 模拟：composite 在画布中心 (3360, 700)，两个子对象在局部坐标 (-100, 0) 和 (100, 0)
        const child1 = makeObject({ id: 'c1', type: 'prop', x: -100, y: 0, parentId: 'comp' })
        const child2 = makeObject({ id: 'c2', type: 'prop', x: 100, y: 0, parentId: 'comp' })
        const composite = makeComposite('comp', ['c1', 'c2'], { x: 3360, y: 700 })

        const allObjects: SceneObject[] = [composite, child1, child2]
        const template = snapshotToTemplate([composite], allObjects, '位置测试')

        // editorAnchor 应为 composite 的世界坐标（只有 1 个顶层对象，中心就是它自身）
        expect(template.editorAnchor).toEqual({ x: 3360, y: 700 })

        // composite 归零 → (0, 0)
        const tplComp = template.objects.find(o => o.type === 'composite')!
        expect(tplComp.x).toBe(0)
        expect(tplComp.y).toBe(0)

        // 子对象的局部坐标应完全保持不变
        const tplChild1 = template.objects.find(o => o.id === 'c1')!
        const tplChild2 = template.objects.find(o => o.id === 'c2')!
        expect(tplChild1.x).toBe(-100)
        expect(tplChild1.y).toBe(0)
        expect(tplChild2.x).toBe(100)
        expect(tplChild2.y).toBe(0)

        // 实例化到画布中心后，composite 回到 (3360, 700)
        const result = instantiateTemplate(template, 3360, 700, { autoWrapComposite: false })
        const instComp = result.objects.find(o => o.type === 'composite')!
        expect(instComp.x).toBe(3360)
        expect(instComp.y).toBe(700)

        // 子对象局部坐标仍不变
        const instChildren = result.objects.filter(o => o.parentId === instComp.id)
        expect(instChildren).toHaveLength(2)
        const instChild1 = instChildren.find(o => o.x < 0)
        const instChild2 = instChildren.find(o => o.x > 0)
        expect(instChild1).toBeDefined()
        expect(instChild2).toBeDefined()
        expect(instChild1!.x).toBe(-100)
        expect(instChild1!.y).toBe(0)
        expect(instChild2!.x).toBe(100)
        expect(instChild2!.y).toBe(0)
    })
})

// ===== buildTemplateFromObjects =====

describe('buildTemplateFromObjects', () => {
    it('多个顶层对象 → 不自动创建包装 composite', () => {
        const a = makeObject({ id: 'a', type: 'prop' })
        const b = makeObject({ id: 'b', type: 'prop' })
        const template = buildTemplateFromObjects([a, b], [a, b], '多根模板')

        expect(template.objects).toHaveLength(2)
        // 确保没有自动创建的 composite
        expect(template.objects.every(o => o.type !== 'composite')).toBe(true)
    })

    it('空数组 → 空模板', () => {
        const template = buildTemplateFromObjects([], [], '空模板')
        expect(template.objects).toHaveLength(0)
    })

    it('混合顶层和子对象 → 只将顶层作为入口', () => {
        const child = makeObject({ id: 'c1', type: 'prop', parentId: 'comp' })
        const composite = makeComposite('comp', ['c1'])
        const standalone = makeObject({ id: 'alone', type: 'prop' })

        const allObjects = [composite, child, standalone]
        const template = buildTemplateFromObjects(allObjects, allObjects, '混合模板')

        // 顶层: composite + standalone = 2 选中; composite 递归收集 child
        // 总计: composite + child + standalone = 3
        expect(template.objects).toHaveLength(3)
    })
})

// ===== instantiateTemplate =====

describe('instantiateTemplate', () => {
    it('所有对象 ID 全部更新（不与模板内 ID 重复）', () => {
        const obj = makeObject({ id: 'original', type: 'prop' })
        const template = snapshotToTemplate([obj], [obj], '测试')

        const result = instantiateTemplate(template, 500, 300)

        expect(result.objects).toHaveLength(1)
        expect(result.objects[0]!.id).not.toBe('original')
        expect(result.objects[0]!.id).toMatch(/^obj_/)
    })

    it('坐标还原到放置点（自动包装后子对象为局部坐标）', () => {
        const a = makeObject({ id: 'a', type: 'prop', x: 0, y: 0 })
        const b = makeObject({ id: 'b', type: 'prop', x: 200, y: 100 })
        const template = snapshotToTemplate([a, b], [a, b], '测试')

        const result = instantiateTemplate(template, 500, 400)

        // wrapper composite 在 (500, 400)
        const wrapper = result.objects[0]!
        expect(wrapper.x).toBe(500)
        expect(wrapper.y).toBe(400)

        // 子对象存储局部坐标（相对于 composite）
        // 模板内 a: (-100, -50), b: (100, 50)
        // 全局 = 模板偏移 + drop = (400,350) / (600,450)
        // 局部 = 全局 - composite = (-100,-50) / (100,50) — 等于模板原始偏移
        expect(result.objects[1]!.x).toBe(-100)
        expect(result.objects[1]!.y).toBe(-50)
        expect(result.objects[2]!.x).toBe(100)
        expect(result.objects[2]!.y).toBe(50)
    })

    it('parentId / childIds 正确重映射', () => {
        const child = makeObject({ id: 'c1', type: 'prop', parentId: 'comp' })
        const composite = makeComposite('comp', ['c1'])
        const allObjects: SceneObject[] = [composite, child]

        const template = snapshotToTemplate([composite], allObjects, '组合测试')
        const result = instantiateTemplate(template, 0, 0, { autoWrapComposite: false })

        const newComposite = result.objects.find(o => o.type === 'composite') as CompositeObject
        const newChild = result.objects.find(o => o.type === 'prop')

        expect(newComposite).toBeDefined()
        expect(newChild).toBeDefined()
        expect(newComposite.childIds).toContain(newChild!.id)
        expect(newChild!.parentId).toBe(newComposite.id)
    })

    it('内部对象引用随实例化重映射', () => {
        const target = makeObject({ id: 'target', type: 'prop', parentId: 'comp' })
        const mask = {
            ...makeObject({ id: 'mask', type: 'mask', parentId: 'comp' }),
            type: 'mask',
            shape: 'rectangle',
            mode: 'inside_visible',
            targetIds: ['target', 'external'],
        } as SceneObject & { targetIds: string[] }
        const effect = {
            ...makeObject({ id: 'effect', type: 'screen_effect', parentId: 'comp' }),
            type: 'screen_effect',
            effectClass: 'spotlight',
            params: { targetId: 'target' },
        } as SceneObject & { params: { targetId: string } }
        const composite = makeComposite('comp', ['target', 'mask', 'effect'], {
            instanceRootCompositeId: 'target',
        } as Partial<CompositeObject>)
        const allObjects: SceneObject[] = [composite, target, mask, effect]

        const template = snapshotToTemplate([composite], allObjects, '引用重映射')
        const result = instantiateTemplate(template, 0, 0, { autoWrapComposite: false })
        const newTargetId = result.idMap.get('target')!
        const newMask = result.objects.find(o => o.id === result.idMap.get('mask')) as SceneObject & { targetIds: string[] }
        const newEffect = result.objects.find(o => o.id === result.idMap.get('effect')) as SceneObject & { params: { targetId: string } }
        const newComposite = result.objects.find(o => o.id === result.idMap.get('comp')) as CompositeObject

        expect(newMask.targetIds).toEqual([newTargetId, 'external'])
        expect(newEffect.params.targetId).toBe(newTargetId)
        expect(newComposite.instanceRootCompositeId).toBe(newTargetId)
    })

    it('空模板实例化 → 空结果', () => {
        const template = buildTemplateFromObjects([], [], '空模板')
        const result = instantiateTemplate(template, 100, 100)
        expect(result.objects).toHaveLength(0)
        expect(result.missingRefs).toHaveLength(0)
    })

    it('资源校验：检测缺失的 refId', () => {
        const obj = makeObject({ id: 'a', type: 'prop', refId: 'missing-prop' })
        const template = snapshotToTemplate([obj], [obj], '测试')

        const checker = (_type: string, refId: string) => refId !== 'missing-prop'
        const result = instantiateTemplate(template, 0, 0, { resourceChecker: checker })

        expect(result.missingRefs).toContain('missing-prop')
    })

    it('多根模板默认自动包装 entity composite', () => {
        const a = makeObject({ id: 'a', type: 'prop' })
        const b = makeObject({ id: 'b', type: 'prop' })
        const template = snapshotToTemplate([a, b], [a, b], '多根模板')

        const result = instantiateTemplate(template, 500, 300)

        // 原始 2 个对象 + 1 个 wrapper composite = 3
        expect(result.objects).toHaveLength(3)

        const wrapper = result.objects[0] as CompositeObject
        expect(wrapper.type).toBe('composite')
        expect(wrapper.compositeMode).toBe('entity')
        expect(wrapper.compositeLocked).toBe(true)
        expect(wrapper.childIds).toHaveLength(2)

        // 子对象的 parentId 指向 wrapper
        const child1 = result.objects[1]!
        const child2 = result.objects[2]!
        expect(child1.parentId).toBe(wrapper.id)
        expect(child2.parentId).toBe(wrapper.id)
        expect(wrapper.childIds).toContain(child1.id)
        expect(wrapper.childIds).toContain(child2.id)
    })

    it('单根模板不包装 composite', () => {
        const obj = makeObject({ id: 'a', type: 'prop' })
        const template = snapshotToTemplate([obj], [obj], '单根模板')

        const result = instantiateTemplate(template, 500, 300)

        expect(result.objects).toHaveLength(1)
        expect(result.objects[0]!.type).toBe('prop')
    })

    it('autoWrapComposite: false 时不包装', () => {
        const a = makeObject({ id: 'a', type: 'prop' })
        const b = makeObject({ id: 'b', type: 'prop' })
        const template = snapshotToTemplate([a, b], [a, b], '不包装')

        const result = instantiateTemplate(template, 500, 300, { autoWrapComposite: false })

        expect(result.objects).toHaveLength(2)
        expect(result.objects.every(o => o.type !== 'composite')).toBe(true)
    })

    it('已有 composite 的多根模板：只包装顶层', () => {
        const child = makeObject({ id: 'c1', type: 'prop', parentId: 'comp' })
        const composite = makeComposite('comp', ['c1'])
        const standalone = makeObject({ id: 'alone', type: 'prop' })

        const allObjects: SceneObject[] = [composite, child, standalone]
        const template = snapshotToTemplate([composite, standalone], allObjects, '混合')

        const result = instantiateTemplate(template, 0, 0)

        // 3 原始对象 + 1 wrapper = 4
        expect(result.objects).toHaveLength(4)

        const wrapper = result.objects[0] as CompositeObject
        expect(wrapper.type).toBe('composite')
        expect(wrapper.compositeMode).toBe('entity')
        // wrapper 的 childIds 只含 2 个顶层对象（composite 和 standalone）
        expect(wrapper.childIds).toHaveLength(2)
    })

    it('坐标还原（autoWrapComposite: false）', () => {
        const a = makeObject({ id: 'a', type: 'prop', x: 0, y: 0 })
        const b = makeObject({ id: 'b', type: 'prop', x: 200, y: 100 })
        const template = snapshotToTemplate([a, b], [a, b], '测试')

        const result = instantiateTemplate(template, 500, 400, { autoWrapComposite: false })

        // 模板内 a: (-100, -50), b: (100, 50)
        // 放置后 a: (400, 350), b: (600, 450)
        expect(result.objects[0]!.x).toBe(400)
        expect(result.objects[0]!.y).toBe(350)
        expect(result.objects[1]!.x).toBe(600)
        expect(result.objects[1]!.y).toBe(450)
    })
})
