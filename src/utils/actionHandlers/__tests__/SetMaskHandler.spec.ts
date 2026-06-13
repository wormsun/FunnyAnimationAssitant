/**
 * SetMaskHandler 单元测试 — Clip-Mask Phase 1 (D5)
 *
 * 覆盖：
 * - metadata
 * - 部分更新（targetIds / shape / width / height）
 * - 未提供字段保持不变
 * - targetIds 整段替换（深拷贝，外部突变隔离）
 * - 空数组语义（释放所有 target）
 *
 * 注意：跨 mask 独占冲突由 sceneStateCalculator 的 mask post-pass 解决，
 *       不在此 Handler 单测范围（见 actionEvaluator-mask.spec.ts）。
 */

import { describe, expect, it } from 'vitest'

import type { SetMaskAction } from '@/types/screenplay'
import type { WriteableState } from '@/utils/actionHandlers/types'

import { SetMaskHandler } from '../handlers/SetMaskHandler'

function makeAction(
    target: string,
    params: SetMaskAction['params'],
): SetMaskAction {
    return {
        id: 'test-set-mask',
        target,
        type: 'set_mask',
        category: 'point',
        slotIndex: 0,
        params,
    }
}

function makeMaskState(
    overrides: Partial<WriteableState> = {},
): WriteableState {
    return {
        id: 'mask1',
        type: 'mask',
        shape: 'rectangle',
        targetIds: [],
        ...overrides,
    }
}

describe('SetMaskHandler', () => {
    it('should have correct metadata', () => {
        expect(SetMaskHandler.type).toBe('set_mask')
        expect(SetMaskHandler.isPointAction).toBe(true)
        expect(SetMaskHandler.isDurationAction).toBe(false)
        expect(SetMaskHandler.affectsObjectState).toBe(true)
    })

    it('should not define interpolate (point-only action)', () => {
        expect((SetMaskHandler as unknown as { interpolate?: unknown }).interpolate).toBeUndefined()
    })

    it('updates targetIds when provided', () => {
        const state = makeMaskState({ targetIds: ['old1'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { targetIds: ['a', 'b'] }))
        expect(state.targetIds).toEqual(['a', 'b'])
    })

    it('updates shape when provided', () => {
        const state = makeMaskState({ shape: 'rectangle' })
        SetMaskHandler.applyToState(state, makeAction('mask1', { shape: 'ellipse' }))
        expect(state.shape).toBe('ellipse')
    })

    it('updates targetIds + shape together', () => {
        const state = makeMaskState({ shape: 'rectangle', targetIds: ['x'] })
        SetMaskHandler.applyToState(
            state,
            makeAction('mask1', { targetIds: ['y', 'z'], shape: 'ellipse' }),
        )
        expect(state.targetIds).toEqual(['y', 'z'])
        expect(state.shape).toBe('ellipse')
    })

    it('updates width and height when provided', () => {
        const state = makeMaskState({ width: 200, height: 200 })
        SetMaskHandler.applyToState(state, makeAction('mask1', { width: 640, height: 180 }))
        expect(state.width).toBe(640)
        expect(state.height).toBe(180)
    })

    it('ignores invalid width and height values', () => {
        const state = makeMaskState({ width: 200, height: 200 })
        SetMaskHandler.applyToState(state, makeAction('mask1', { width: 0, height: -10 }))
        expect(state.width).toBe(200)
        expect(state.height).toBe(200)
    })

    it('leaves shape untouched when only targetIds provided', () => {
        const state = makeMaskState({ shape: 'ellipse', targetIds: ['old'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { targetIds: ['new'] }))
        expect(state.shape).toBe('ellipse')
        expect(state.targetIds).toEqual(['new'])
    })

    it('leaves targetIds untouched when only shape provided', () => {
        const state = makeMaskState({ shape: 'rectangle', targetIds: ['keep'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { shape: 'ellipse' }))
        expect(state.shape).toBe('ellipse')
        expect(state.targetIds).toEqual(['keep'])
    })

    it('replaces targetIds entirely (not merges)', () => {
        const state = makeMaskState({ targetIds: ['a', 'b', 'c'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { targetIds: ['d'] }))
        expect(state.targetIds).toEqual(['d'])
    })

    it('accepts empty targetIds (release all)', () => {
        const state = makeMaskState({ targetIds: ['a', 'b'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { targetIds: [] }))
        expect(state.targetIds).toEqual([])
    })

    it('isolates external mutation of params.targetIds', () => {
        const incoming = ['a', 'b']
        const state = makeMaskState({ targetIds: [] })
        SetMaskHandler.applyToState(state, makeAction('mask1', { targetIds: incoming }))
        incoming.push('c')
        expect(state.targetIds).toEqual(['a', 'b'])
    })

    it('no-op when params is empty object', () => {
        const state = makeMaskState({ shape: 'ellipse', targetIds: ['keep'] })
        SetMaskHandler.applyToState(state, makeAction('mask1', {}))
        expect(state.shape).toBe('ellipse')
        expect(state.targetIds).toEqual(['keep'])
    })
})
