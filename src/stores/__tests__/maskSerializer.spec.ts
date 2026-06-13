/**
 * Clip-Mask Phase 1 — maskSerializer 序列化 + finalizeMaskTargets 单元测试
 *
 * 详见 doc-prd/clip-mask-design.md（v2.1）§11、§14.1（Stage A）。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MaskObject } from '@/types/sceneObject'

import { useSceneObjectStore } from '../sceneObjectStore'

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

const noopResolveActor = () => null

describe('Clip-Mask Phase 1 — maskSerializer + finalizeMaskTargets', () => {
    let store: ReturnType<typeof useSceneObjectStore>
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        setActivePinia(createPinia())
        store = useSceneObjectStore()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ })
    })

    describe('createMaskObject', () => {
        it('创建蒙版默认 mode=inside_visible、targetIds=[]', () => {
            const m = store.createMaskObject('蒙版1', 'rectangle')
            expect(m.type).toBe('mask')
            expect(m.shape).toBe('rectangle')
            expect(m.mode).toBe('inside_visible')
            expect(m.targetIds).toEqual([])
            expect(m.refId).toBe('')
        })
    })

    describe('round-trip 保留非空 targetIds', () => {
        it('1 mask + 3 prop 目标，序列化-反序列化后字段完整', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const p2 = store.createPropObject('p2', '道具2')
            const p3 = store.createPropObject('p3', '道具3')
            const mask = store.createMaskObject('蒙版', 'ellipse', { width: 300, height: 200 })
            store.updateObject<MaskObject>(mask.id, { targetIds: [p1.id, p2.id, p3.id] })

            // 序列化
            const dtos = [p1, p2, p3, mask].map(o => store.toSetupObject(store.getObject(o.id)!))

            // 重置 store 后反序列化
            setActivePinia(createPinia())
            store = useSceneObjectStore()
            for (const d of dtos) store.fromSetupObject(d, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject(mask.id) as MaskObject
            expect(restored).toBeTruthy()
            expect(restored.type).toBe('mask')
            expect(restored.shape).toBe('ellipse')
            expect(restored.mode).toBe('inside_visible')
            expect(restored.width).toBe(300)
            expect(restored.height).toBe(200)
            expect(new Set(restored.targetIds)).toEqual(new Set([p1.id, p2.id, p3.id]))
        })
    })

    describe('脏数据清理', () => {
        it('死引用：targetIds 中不存在的 id 被静默剔除', () => {
            const p1 = store.createPropObject('p1', '道具1')
            const mask = store.createMaskObject('蒙版', 'rectangle')
            store.updateObject<MaskObject>(mask.id, { targetIds: [p1.id, 'ghost-id'] })

            const dtos = [p1, mask].map(o => store.toSetupObject(store.getObject(o.id)!))

            setActivePinia(createPinia())
            store = useSceneObjectStore()
            for (const d of dtos) store.fromSetupObject(d, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject(mask.id) as MaskObject
            expect(restored.targetIds).toEqual([p1.id])
            expect(warnSpy).toHaveBeenCalled()
        })

        it('mask→mask 嵌套被剔除', () => {
            const innerMask = store.createMaskObject('内蒙版', 'rectangle')
            const outerMask = store.createMaskObject('外蒙版', 'rectangle')
            store.updateObject<MaskObject>(outerMask.id, { targetIds: [innerMask.id] })

            const dtos = [innerMask, outerMask].map(o => store.toSetupObject(store.getObject(o.id)!))

            setActivePinia(createPinia())
            store = useSceneObjectStore()
            for (const d of dtos) store.fromSetupObject(d, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject(outerMask.id) as MaskObject
            expect(restored.targetIds).toEqual([])
        })

        it('非法目标类型被剔除', () => {
            const cam = store.createCameraObject('相机')
            const mask = store.createMaskObject('蒙版', 'rectangle')
            // 直接绕过 UI 写入非法 targetIds
            store.updateObject<MaskObject>(mask.id, { targetIds: [cam.id] })

            const dtos = [cam, mask].map(o => store.toSetupObject(store.getObject(o.id)!))

            setActivePinia(createPinia())
            store = useSceneObjectStore()
            for (const d of dtos) store.fromSetupObject(d, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject(mask.id) as MaskObject | undefined
            // 相机不通过 fromSetupObject 加载（无 serializer），因此 restored 仍是 mask 自身
            expect(restored?.targetIds ?? []).toEqual([])
        })

        it('同 target 多 mask 冲突：起始索引较小者胜', () => {
            const p = store.createPropObject('p', '道具')
            const maskA = store.createMaskObject('A', 'rectangle')
            const maskB = store.createMaskObject('B', 'rectangle')
            store.updateObject<MaskObject>(maskA.id, { targetIds: [p.id] })
            store.updateObject<MaskObject>(maskB.id, { targetIds: [p.id] })

            const dtos = [p, maskA, maskB].map(o => store.toSetupObject(store.getObject(o.id)!))

            setActivePinia(createPinia())
            store = useSceneObjectStore()
            for (const d of dtos) store.fromSetupObject(d, noopResolveActor)
            store.finalizeMaskTargets()

            const a = store.getObject(maskA.id) as MaskObject
            const b = store.getObject(maskB.id) as MaskObject
            expect(a.targetIds).toEqual([p.id])
            expect(b.targetIds).toEqual([])
        })

        it('未知 shape 降级为 rectangle 并 warn', () => {
            const dto = {
                id: 'mask-x',
                type: 'mask',
                name: '蒙版',
                refId: '',
                x: 0, y: 0, width: 100, height: 100,
                scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
                zIndex: 0, visible: true,
                shape: 'star',
                mode: 'inside_visible',
                targetIds: [],
            } as unknown as Parameters<typeof store.fromSetupObject>[0]

            store.fromSetupObject(dto, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject('mask-x') as MaskObject
            expect(restored.shape).toBe('rectangle')
            expect(warnSpy).toHaveBeenCalled()
        })

        it('不支持的 mode 降级为 inside_visible 并 warn', () => {
            const dto = {
                id: 'mask-y',
                type: 'mask',
                name: '蒙版',
                refId: '',
                x: 0, y: 0, width: 100, height: 100,
                scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, flipX: false,
                zIndex: 0, visible: true,
                shape: 'rectangle',
                mode: 'outside_visible',
                targetIds: [],
            } as unknown as Parameters<typeof store.fromSetupObject>[0]

            store.fromSetupObject(dto, noopResolveActor)
            store.finalizeMaskTargets()

            const restored = store.getObject('mask-y') as MaskObject
            expect(restored.mode).toBe('inside_visible')
            expect(warnSpy).toHaveBeenCalled()
        })
    })
})
