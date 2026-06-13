/**
 * renderChain 测试
 * 模拟人物编辑器导入流程，验证 renderChain 相关函数的正确性
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { CompositeObject, ScreenEffectObject, SymbolObject, TextObject } from '@/types/sceneObject'

/**
 * 模拟 convertConfigToSceneObjects 的输出结构：
 * entity composite (无 parentId) + symbol 子对象 (有 parentId)
 */
function createImportedCharacterObjects() {
    const compositeId = 'sceneobject_composite_1'
    const child1Id = 'sceneobject_symbol_1'
    const child2Id = 'sceneobject_symbol_2'
    const child3Id = 'sceneobject_symbol_3'

    const composite: CompositeObject = {
        id: compositeId,
        type: 'composite',
        name: '导入人物',
        alias: '导入人物',
        refId: '',
        childIds: [child1Id, child2Id, child3Id],
        compositeLocked: true,
        compositeMode: 'entity',
        x: 3360,
        y: 700,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 10,
        visible: true,
    }

    const child1: SymbolObject = {
        id: child1Id,
        type: 'symbol',
        name: '后发',
        alias: '后发',
        refId: '',
        parentId: compositeId,
        materials: [],
        x: 0,
        y: -50,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 10,
        visible: true,
    }

    const child2: SymbolObject = {
        id: child2Id,
        type: 'symbol',
        name: '身体',
        alias: '身体',
        refId: '',
        parentId: compositeId,
        materials: [],
        x: 0,
        y: 0,
        width: 200,
        height: 300,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 10,
        visible: true,
    }

    const child3: SymbolObject = {
        id: child3Id,
        type: 'symbol',
        name: '前发',
        alias: '前发',
        refId: '',
        parentId: compositeId,
        materials: [],
        x: 0,
        y: -40,
        width: 120,
        height: 80,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 10,
        visible: true,
    }

    // configImporter 返回的顺序：composite 在前，子对象在后（DFS 序）
    return {
        compositeId,
        child1Id,
        child2Id,
        child3Id,
        objects: [composite, child1, child2, child3],
    }
}

describe('renderChain: 人物编辑器导入流程', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('RC-IMPORT-01: 导入后 sceneRenderChain 只包含根级 composite', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const { compositeId, child1Id, child2Id, child3Id, objects } = createImportedCharacterObjects()

        // 模拟导入：逐个 addObject
        for (const obj of objects) {
            store.addObject(obj)
        }

        const chain = store.getSceneRenderChain()
        console.log('[RC-IMPORT-01] sceneRenderChain:', chain)

        // renderChain 应只包含根级 composite
        expect(chain).toContain(compositeId)
        expect(chain).not.toContain(child1Id)
        expect(chain).not.toContain(child2Id)
        expect(chain).not.toContain(child3Id)
        expect(chain.length).toBe(1)
    })

    it('RC-IMPORT-02: getSortedObjects 必须返回所有对象（含子对象）', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const { compositeId, child1Id, child2Id, child3Id, objects } = createImportedCharacterObjects()

        for (const obj of objects) {
            store.addObject(obj)
        }

        const sorted = store.getSortedObjects()
        const sortedIds = sorted.map(o => o.id)
        console.log('[RC-IMPORT-02] getSortedObjects ids:', sortedIds)
        console.log('[RC-IMPORT-02] getSortedObjects types:', sorted.map(o => o.type))
        console.log('[RC-IMPORT-02] getSortedObjects parentIds:', sorted.map(o => o.parentId ?? 'ROOT'))

        // 必须包含所有 4 个对象
        expect(sorted.length).toBe(4)
        expect(sortedIds).toContain(compositeId)
        expect(sortedIds).toContain(child1Id)
        expect(sortedIds).toContain(child2Id)
        expect(sortedIds).toContain(child3Id)
    })

    it('RC-IMPORT-03: getChildObjects 返回 entity 的子对象', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const { compositeId, child1Id, child2Id, child3Id, objects } = createImportedCharacterObjects()

        for (const obj of objects) {
            store.addObject(obj)
        }

        const children = store.getChildObjects(compositeId)
        const childIds = children.map(o => o.id)
        console.log('[RC-IMPORT-03] getChildObjects ids:', childIds)

        expect(children.length).toBe(3)
        expect(childIds).toContain(child1Id)
        expect(childIds).toContain(child2Id)
        expect(childIds).toContain(child3Id)
    })

    it('RC-IMPORT-04: 编辑模式加载（instantiateTemplate 流程）', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const { objects } = createImportedCharacterObjects()

        // 模拟编辑模式加载：与 CompositeCharacterEditor onMounted 一致
        for (const obj of objects) {
            store.addObject(obj)
        }

        // 验证 store.objects 包含所有对象
        const allObjects = store.objects
        console.log('[RC-IMPORT-04] store.objects count:', allObjects.length)
        console.log('[RC-IMPORT-04] store.objects ids:', allObjects.map(o => o.id))
        expect(allObjects.length).toBe(4)

        // 验证 getSortedObjects 返回所有对象
        const sorted = store.getSortedObjects()
        console.log('[RC-IMPORT-04] getSortedObjects count:', sorted.length)
        expect(sorted.length).toBe(4)

        // 验证 renderChain
        const chain = store.getSceneRenderChain()
        console.log('[RC-IMPORT-04] renderChain:', chain)
        expect(chain.length).toBe(1)

        // 模拟渲染循环：遍历 getSortedObjects，每个对象都应该能正常处理
        for (const obj of sorted) {
            if (obj.parentId) {
                // 子对象：应能找到父对象
                const parent = store.getObject(obj.parentId)
                expect(parent).toBeDefined()
                console.log(`[RC-IMPORT-04] 子对象 ${obj.id} (${obj.type}) → 父 ${obj.parentId} (${parent?.type})`)
            } else {
                console.log(`[RC-IMPORT-04] 根对象 ${obj.id} (${obj.type})`)
            }
        }
    })

    it('RC-IMPORT-05: getRootObjects 不含子对象', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const { compositeId, objects } = createImportedCharacterObjects()

        for (const obj of objects) {
            store.addObject(obj)
        }

        const rootObjects = store.getRootObjects()
        const rootIds = rootObjects.map(o => o.id)
        console.log('[RC-IMPORT-05] rootObjects ids:', rootIds)

        // 根对象只有 composite（无 parentId 的对象）
        expect(rootIds).toContain(compositeId)
        // 子对象不应在根列表中
        expect(rootIds.length).toBe(1)
    })
})

describe('renderChain: union 成组后渲染顺序', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    /**
     * 模拟场景：entity composite 内有 3 个子对象（后发、头部、身体）
     * 用户选择其中 2 个（后发、头部）创建 union
     */
    it('RC-UNION-01: union 成组后 renderChain 应保持子对象原始顺序', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        // 创建 3 个根级对象（模拟 entity 的子对象平铺在根级）
        const obj1: SymbolObject = {
            id: 'obj_hair_back', type: 'symbol', name: '后发', alias: '后发',
            refId: '', materials: [],
            x: 0, y: -50, width: 100, height: 100,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }
        const obj2: SymbolObject = {
            id: 'obj_head', type: 'symbol', name: '头部', alias: '头部',
            refId: '', materials: [],
            x: 0, y: 0, width: 200, height: 200,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }
        const obj3: SymbolObject = {
            id: 'obj_body', type: 'symbol', name: '身体', alias: '身体',
            refId: '', materials: [],
            x: 0, y: 100, width: 200, height: 300,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }

        store.addObject(obj1)
        store.addObject(obj2)
        store.addObject(obj3)

        const chainBefore = [...store.getSceneRenderChain()]
        console.log('[RC-UNION-01] renderChain BEFORE:', chainBefore)
        // 成组前：3 个对象都在 renderChain
        expect(chainBefore).toEqual(['obj_hair_back', 'obj_head', 'obj_body'])

        // 成组：后发 + 头部 → union
        const union = store.groupObjects(['obj_hair_back', 'obj_head'], 'union')
        console.log('[RC-UNION-01] union created:', union.id, 'compositeMode:', union.compositeMode)

        const chainAfter = [...store.getSceneRenderChain()]
        console.log('[RC-UNION-01] renderChain AFTER:', chainAfter)

        // 关键断言：union 不应出现在 renderChain 中
        expect(chainAfter).not.toContain(union.id)

        // 关键断言：子对象应保持在 renderChain 中，且顺序不变
        // 后发仍在头部前面，身体在最后
        const hairIdx = chainAfter.indexOf('obj_hair_back')
        const headIdx = chainAfter.indexOf('obj_head')
        const bodyIdx = chainAfter.indexOf('obj_body')
        console.log('[RC-UNION-01] positions: hair=%d, head=%d, body=%d', hairIdx, headIdx, bodyIdx)

        expect(hairIdx).toBeGreaterThanOrEqual(0)
        expect(headIdx).toBeGreaterThanOrEqual(0)
        expect(bodyIdx).toBeGreaterThanOrEqual(0)
        expect(hairIdx).toBeLessThan(headIdx)  // 后发在头部前
        expect(headIdx).toBeLessThan(bodyIdx)  // 头部在身体前
    })

    it('RC-UNION-02: union 成组后 getSortedObjects 顺序不变', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const obj1: SymbolObject = {
            id: 'A', type: 'symbol', name: 'A', alias: 'A',
            refId: '', materials: [],
            x: 0, y: 0, width: 10, height: 10,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }
        const obj2: SymbolObject = {
            id: 'B', type: 'symbol', name: 'B', alias: 'B',
            refId: '', materials: [],
            x: 10, y: 0, width: 10, height: 10,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }
        const obj3: SymbolObject = {
            id: 'C', type: 'symbol', name: 'C', alias: 'C',
            refId: '', materials: [],
            x: 20, y: 0, width: 10, height: 10,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
            zIndex: 10, visible: true,
        }

        store.addObject(obj1)
        store.addObject(obj2)
        store.addObject(obj3)

        // 成组前 getSortedObjects 顺序
        const sortedBefore = store.getSortedObjects().map(o => o.id)
        console.log('[RC-UNION-02] sortedObjects BEFORE:', sortedBefore)

        // B + C → union
        const union = store.groupObjects(['B', 'C'], 'union')

        const sortedAfter = store.getSortedObjects().map(o => o.id)
        console.log('[RC-UNION-02] sortedObjects AFTER:', sortedAfter)

        // A, B, C 的相对顺序应保持不变（union 排在最后，作为链外对象）
        const aIdx = sortedAfter.indexOf('A')
        const bIdx = sortedAfter.indexOf('B')
        const cIdx = sortedAfter.indexOf('C')
        console.log('[RC-UNION-02] positions: A=%d, B=%d, C=%d, union=%d', aIdx, bIdx, cIdx, sortedAfter.indexOf(union.id))

        expect(aIdx).toBeLessThan(bIdx)
        expect(bIdx).toBeLessThan(cIdx)
    })
})

describe('renderChain: 文本对象参与场景排序', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('RC-TEXT-01: 文本应进入 renderChain，并按 zIndex 位于画面特效下方', () => {
        const store = useSceneObjectStore()
        store.setActionMode(false)
        store.clearObjects()

        const text: TextObject = {
            id: 'text_1',
            type: 'text',
            name: '文本',
            alias: '文本',
            refId: '',
            content: '测试文本',
            fontSize: 72,
            fontFamily: 'Noto Sans SC',
            fontWeight: 'normal',
            fontStyle: 'normal',
            color: '#ffffff',
            align: 'center',
            wordWrap: false,
            wordWrapWidth: 400,
            x: 0,
            y: 0,
            width: 400,
            height: 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            alpha: 1,
            flipX: false,
            zIndex: 100,
            visible: true,
        }
        const effect: ScreenEffectObject = {
            id: 'effect_1',
            type: 'screen_effect',
            name: '画面特效',
            alias: '画面特效',
            refId: 'screen_effect',
            effectClass: 'screen_effect',
            params: { baseColor: '#000000', openRatio: 1 },
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            alpha: 1,
            flipX: false,
            zIndex: 1000,
            visible: true,
        }

        store.addObject(effect)
        store.addObject(text)

        const chain = store.getSceneRenderChain()
        expect(chain).toEqual(['text_1', 'effect_1'])
    })
})
