/**
 * Clip-Mask Phase 1 D5b — sceneStateCalculator mask post-pass 集成测试
 *
 * 覆盖 doc-prd/clip-mask-implementation-plan.md §3 D1.5 算法：
 *  1. 同 slot 内 set_mask 按目标 mask 折叠（最后一次写入生效）。
 *  2. Claimers 包含本 slot 参与 mask + 上游已占且本 slot 未参与的 owner。
 *  3. |Claimers| ≥ 2 时按 newState.objects 稳定索引升序取首位，其余从 candidate 剔除。
 *  4. 仅参与 mask 被写回；非参与 owner 静默保留（无隐式释放）。
 *  5. 顺序无关性：A=[X,Y]→[Y,Z], B=[]→[X] 同 slot ⇒ A=[Y,Z], B=[X]。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type {
    SceneSetup,
    ScriptBlock,
    SetMaskAction,
    RuntimeSceneSnapshot,
} from '@/types/screenplay'
import type { MaskObject, SceneObject } from '@/types/sceneObject'

import {
    applyBlockActionsToState,
    toRuntimeSnapshot,
} from '../sceneStateCalculator'

// ==================== fixtures ====================

function makeProp(id: string): SceneObject {
    return {
        id,
        refId: id,
        type: 'prop',
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: 10,
        visible: true,
        spawned: true,
        alpha: 1,
    } as unknown as SceneObject
}

function makeMask(
    id: string,
    targetIds: string[] = [],
    shape: 'rectangle' | 'ellipse' = 'rectangle',
): MaskObject {
    return {
        id,
        refId: '',
        type: 'mask',
        name: id,
        alias: id,
        shape,
        mode: 'inside_visible',
        targetIds: [...targetIds],
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: 100,
        visible: true,
        spawned: true,
        alpha: 1,
        flipX: false,
    } as unknown as MaskObject
}

function makeSetup(objects: SceneObject[]): SceneSetup {
    return {
        objects,
        camera: { x: 960, y: 540, width: 1920, height: 1080, zoom: 1 },
        renderChain: objects.map(o => o.id),
    }
}

function makeSetMaskAction(
    id: string,
    target: string,
    slotIndex: number,
    params: SetMaskAction['params'],
): SetMaskAction {
    return {
        id,
        target,
        type: 'set_mask',
        category: 'point',
        slotIndex,
        params,
    }
}

function makeBlock(actions: unknown[]): ScriptBlock {
    return {
        id: 'block_1',
        type: 'dialogue',
        instanceId: 'inst_block_1',
        speakerId: 'actor_1',
        text: 'x',
        actions,
        ttsConfig: { duration: 1000 },
    } as unknown as ScriptBlock
}

function getMask(snap: SceneSetup | RuntimeSceneSnapshot, id: string): MaskObject {
    const m = snap.objects.find(o => o.id === id)
    expect(m).toBeDefined()
    expect(m!.type).toBe('mask')
    return m as unknown as MaskObject
}

// ==================== 测试 ====================

describe('sceneStateCalculator mask post-pass (D1.5)', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    })
    afterEach(() => {
        warnSpy.mockRestore()
    })

    it('single set_mask updates targetIds (basic happy path)', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', [])
        const setup = makeSetup([propX, maskA])
        const block = makeBlock([
            makeSetMaskAction('a1', 'maskA', 0, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)

        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('updates shape when provided', () => {
        const maskA = makeMask('maskA', [], 'rectangle')
        const setup = makeSetup([maskA])
        const block = makeBlock([
            makeSetMaskAction('a1', 'maskA', 0, { shape: 'ellipse' }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').shape).toBe('ellipse')
    })

    it('updates width and height when provided', () => {
        const maskA = makeMask('maskA', [], 'rectangle')
        const setup = makeSetup([maskA])
        const block = makeBlock([
            makeSetMaskAction('a1', 'maskA', 0, { width: 720, height: 180 }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').width).toBe(720)
        expect(getMask(result, 'maskA').height).toBe(180)
    })

    it('same-slot fold: last set_mask wins on targetIds for same mask', () => {
        const propX = makeProp('propX')
        const propY = makeProp('propY')
        const maskA = makeMask('maskA', [])
        const setup = makeSetup([propX, propY, maskA])
        const block = makeBlock([
            makeSetMaskAction('a1', 'maskA', 0, { targetIds: ['propX'] }),
            makeSetMaskAction('a2', 'maskA', 0, { targetIds: ['propY'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual(['propY'])
    })

    it('order-independent transfer: A=[X,Y]→[Y,Z], B=[]→[X] ⇒ A=[Y,Z], B=[X]', () => {
        const propX = makeProp('propX')
        const propY = makeProp('propY')
        const propZ = makeProp('propZ')
        const maskA = makeMask('maskA', ['propX', 'propY'])
        const maskB = makeMask('maskB', [])
        const setup = makeSetup([propX, propY, propZ, maskA, maskB])

        // 反序：B 先写、A 后写 —— 结果应与正序一致
        const block = makeBlock([
            makeSetMaskAction('a-b', 'maskB', 0, { targetIds: ['propX'] }),
            makeSetMaskAction('a-a', 'maskA', 0, { targetIds: ['propY', 'propZ'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual(['propY', 'propZ'])
        expect(getMask(result, 'maskB').targetIds).toEqual(['propX'])
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('contested target: both add propX same slot ⇒ smaller-index wins, larger evicted', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', []) // index 1
        const maskB = makeMask('maskB', []) // index 2
        const setup = makeSetup([propX, maskA, maskB])

        const block = makeBlock([
            makeSetMaskAction('a-b', 'maskB', 0, { targetIds: ['propX'] }),
            makeSetMaskAction('a-a', 'maskA', 0, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
        expect(getMask(result, 'maskB').targetIds).toEqual([])
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const msg = String(warnSpy.mock.calls[0]![0])
        expect(msg).toContain('[set_mask]')
        expect(msg).toContain('propX')
        expect(msg).toContain('maskA')
        expect(msg).toContain('maskB')
    })

    it('upstream owner non-participant: B claims X, A upstream owns X & non-participant ⇒ A keeps, B does not get', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX']) // upstream owner
        const maskB = makeMask('maskB', [])
        const setup = makeSetup([propX, maskA, maskB])

        const block = makeBlock([
            makeSetMaskAction('a-b', 'maskB', 0, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        // A 静默保留 propX；B 由于 contested 且 stable index 较大 → 失败
        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
        expect(getMask(result, 'maskB').targetIds).toEqual([])
        // 必须有 warn（contested by [maskA, maskB], winner=maskA）
        expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('explicit release by upstream owner allows transfer: A→[], B→[X] ⇒ A=[], B=[X]', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX'])
        const maskB = makeMask('maskB', [])
        const setup = makeSetup([propX, maskA, maskB])

        const block = makeBlock([
            makeSetMaskAction('a-a', 'maskA', 0, { targetIds: [] }),
            makeSetMaskAction('a-b', 'maskB', 0, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual([])
        expect(getMask(result, 'maskB').targetIds).toEqual(['propX'])
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('non-participant owner across multiple slots stays untouched', () => {
        // slot 0: B 申请 X 但被 A 阻挡（A 仍在 upstream，从未 release）
        // slot 1: 无任何 set_mask
        // 期望：A 保持原有 propX，B 仍为空
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX'])
        const maskB = makeMask('maskB', [])
        const setup = makeSetup([propX, maskA, maskB])

        const block = makeBlock([
            makeSetMaskAction('a-b', 'maskB', 0, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
        expect(getMask(result, 'maskB').targetIds).toEqual([])
    })

    it('multi-slot: slot 0 release by A, slot 1 claim by B ⇒ B owns', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX'])
        const maskB = makeMask('maskB', [])
        const setup = makeSetup([propX, maskA, maskB])

        const block = makeBlock([
            makeSetMaskAction('a-a', 'maskA', 0, { targetIds: [] }),
            makeSetMaskAction('a-b', 'maskB', 1, { targetIds: ['propX'] }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual([])
        expect(getMask(result, 'maskB').targetIds).toEqual(['propX'])
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('block with no set_mask leaves all masks unchanged', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX'])
        const setup = makeSetup([propX, maskA])

        const block = makeBlock([])
        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
    })

    it('shape change does not affect targetIds (partial update)', () => {
        const propX = makeProp('propX')
        const maskA = makeMask('maskA', ['propX'], 'rectangle')
        const setup = makeSetup([propX, maskA])

        const block = makeBlock([
            makeSetMaskAction('a1', 'maskA', 0, { shape: 'ellipse' }),
        ])

        const result = applyBlockActionsToState(toRuntimeSnapshot(setup), block)
        expect(getMask(result, 'maskA').shape).toBe('ellipse')
        expect(getMask(result, 'maskA').targetIds).toEqual(['propX'])
    })
})
