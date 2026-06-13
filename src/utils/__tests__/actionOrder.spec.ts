import { describe, expect, it } from 'vitest'

import { SCENE_ACTION_TARGET, type Action } from '@/types/screenplay'

import {
  applyActionOrderIdsForSlot,
  clearActionOrdersForSlot,
  getActionOrderModeForSlot,
  hasCustomActionOrderForSlot,
  normalizeActionOrdersForSlot,
  reconcileActionOrderForSlot,
  sortActionsByDefaultEvaluationOrder,
  sortActionsForEvaluation,
} from '../actionOrder'

describe('sortActionsForEvaluation', () => {
  it('orders same-slot point actions by lifecycle -> transform -> visual -> hierarchy -> composite', () => {
    const actions: Action[] = [
      {
        id: 'visual',
        type: 'set_visual',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { visible: true },
      } as Action,
      {
        id: 'transform',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'hierarchy',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        params: { operations: [{ id: 'op_1', kind: 'reparent', objectIds: ['obj'], parentId: 'parent_1' }] },
      } as Action,
      {
        id: 'composite',
        type: 'set_composite',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { renderChain: [] },
      } as Action,
      {
        id: 'lifecycle',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { spawned: true },
      } as Action,
    ]

    const result = sortActionsForEvaluation(actions)

    expect(result.map(action => action.id)).toEqual([
      'lifecycle',
      'transform',
      'visual',
      'hierarchy',
      'composite',
    ])
  })

  it('orders transforms for newly enabled structure objects after scene structure', () => {
    const actions: Action[] = [
      {
        id: 'group-transform',
        type: 'set_transform',
        category: 'point',
        target: 'group_1',
        slotIndex: 0,
        params: { rotation: 1 },
      } as Action,
      {
        id: 'child-transform',
        type: 'set_transform',
        category: 'point',
        target: 'child_1',
        slotIndex: 0,
        params: { rotation: 0.5 },
      } as Action,
      {
        id: 'structure',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        params: {
          operations: [{ id: 'op_1', kind: 'group', groupId: 'group_1', memberIds: ['child_1'], parentId: null }],
        },
      } as Action,
    ]

    const result = sortActionsForEvaluation(actions)

    expect(result.map(action => action.id)).toEqual([
      'child-transform',
      'structure',
      'group-transform',
    ])
  })

  it('keeps point actions before duration actions in the same slot', () => {
    const actions: Action[] = [
      {
        id: 'duration',
        type: 'tween_transform',
        category: 'duration',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'point',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 50 },
      } as Action,
    ]

    const result = sortActionsForEvaluation(actions)

    expect(result.map(action => action.id)).toEqual(['point', 'duration'])
  })

  it('uses explicit order before compatible same-slot priority', () => {
    const actions: Action[] = [
      {
        id: 'hierarchy',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        order: 1,
        params: { operations: [{ id: 'op_1', kind: 'reparent', objectIds: ['obj'], parentId: 'parent_1' }] },
      } as Action,
      {
        id: 'transform',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { x: 100 },
      } as Action,
    ]

    const result = sortActionsForEvaluation(actions)

    expect(result.map(action => action.id)).toEqual(['transform', 'hierarchy'])
  })

  it('keeps existing no-order actions before appended explicit-order actions', () => {
    const actions: Action[] = [
      {
        id: 'existing-transform',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'new-lifecycle',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 1,
        params: { spawned: true },
      } as Action,
    ]

    const result = sortActionsForEvaluation(actions)

    expect(result.map(action => action.id)).toEqual(['existing-transform', 'new-lifecycle'])
  })

  it('can ignore explicit order and restore compatible default priority', () => {
    const actions: Action[] = [
      {
        id: 'hierarchy',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        order: 1,
        params: { operations: [{ id: 'op_1', kind: 'reparent', objectIds: ['obj'], parentId: 'parent_1' }] },
      } as Action,
      {
        id: 'transform',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { x: 100 },
      } as Action,
    ]

    const result = sortActionsByDefaultEvaluationOrder(actions)

    expect(result.map(action => action.id)).toEqual(['transform', 'hierarchy'])
  })

  it('normalizes explicit order for one slot only', () => {
    const actions: Action[] = [
      {
        id: 'visual',
        type: 'set_visual',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { visible: true },
      } as Action,
      {
        id: 'transform',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'other-slot',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 1,
        params: { x: 200 },
      } as Action,
    ]

    const changed = normalizeActionOrdersForSlot(actions, 0)

    expect(changed).toBe(true)
    expect(actions.find(action => action.id === 'transform')?.order).toBe(0)
    expect(actions.find(action => action.id === 'visual')?.order).toBe(1)
    expect(actions.find(action => action.id === 'other-slot')?.order).toBeUndefined()
  })

  it('clears custom order for one slot', () => {
    const actions: Action[] = [
      {
        id: 'a',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'b',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 1,
        order: 0,
        params: { x: 200 },
      } as Action,
    ]

    expect(clearActionOrdersForSlot(actions, 0)).toBe(true)

    expect(actions.find(action => action.id === 'a')?.order).toBeUndefined()
    expect(actions.find(action => action.id === 'b')?.order).toBe(0)
  })

  it('keeps default slots order-free and appends new actions in custom slots through reconcile', () => {
    const defaultSlotActions: Action[] = [
      {
        id: 'existing-default',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
    ]
    const customSlotActions: Action[] = [
      {
        id: 'existing-custom',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 1,
        order: 0,
        params: { x: 200 },
      } as Action,
      {
        id: 'new-custom',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 1,
        params: { spawned: true },
      } as Action,
    ]

    defaultSlotActions.push({
      id: 'new-default',
      type: 'set_lifecycle',
      category: 'point',
      target: 'obj',
      slotIndex: 0,
      params: { spawned: true },
    } as Action)
    reconcileActionOrderForSlot(defaultSlotActions, 0, { mode: 'default' })
    reconcileActionOrderForSlot(customSlotActions, 1, {
      mode: 'custom',
      appendActionId: 'new-custom',
    })

    expect(defaultSlotActions.every(action => action.order === undefined)).toBe(true)
    expect(customSlotActions.find(action => action.id === 'existing-custom')?.order).toBe(0)
    expect(customSlotActions.find(action => action.id === 'new-custom')?.order).toBe(1)
  })

  it('detects and applies custom slot order ids', () => {
    const actions: Action[] = [
      {
        id: 'a',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'b',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { spawned: true },
      } as Action,
    ]

    expect(hasCustomActionOrderForSlot(actions, 0)).toBe(false)
    expect(applyActionOrderIdsForSlot(actions, 0, ['b', 'a'])).toBe(true)
    expect(hasCustomActionOrderForSlot(actions, 0)).toBe(true)
    expect(actions.map(action => action.order)).toEqual([1, 0])
  })

  it('treats a slot as default until any action has explicit order', () => {
    const actions: Action[] = [
      {
        id: 'a',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'b',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { spawned: true },
      } as Action,
    ]

    expect(getActionOrderModeForSlot(actions, 1)).toBe('default')
    expect(getActionOrderModeForSlot(actions, 0)).toBe('custom')
  })

  it('reconciles custom slots so every slot action has a continuous order', () => {
    const actions: Action[] = [
      {
        id: 'a',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'b',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 10,
        params: { spawned: true },
      } as Action,
    ]

    expect(reconcileActionOrderForSlot(actions, 0, { mode: 'custom' })).toBe(true)

    expect(actions.find(action => action.id === 'a')?.order).toBe(0)
    expect(actions.find(action => action.id === 'b')?.order).toBe(1)
  })

  it('appends a moved or newly created action at the end of a custom slot', () => {
    const actions: Action[] = [
      {
        id: 'existing',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'new-action',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        params: { spawned: true },
      } as Action,
    ]

    reconcileActionOrderForSlot(actions, 0, {
      mode: 'custom',
      appendActionId: 'new-action',
    })

    expect(actions.find(action => action.id === 'existing')?.order).toBe(0)
    expect(actions.find(action => action.id === 'new-action')?.order).toBe(1)
  })

  it('clears all explicit order fields when reconciling a default slot', () => {
    const actions: Action[] = [
      {
        id: 'a',
        type: 'set_transform',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 0,
        params: { x: 100 },
      } as Action,
      {
        id: 'b',
        type: 'set_lifecycle',
        category: 'point',
        target: 'obj',
        slotIndex: 0,
        order: 1,
        params: { spawned: true },
      } as Action,
    ]

    reconcileActionOrderForSlot(actions, 0, { mode: 'default' })

    expect(actions.every(action => action.order === undefined)).toBe(true)
  })
})
