import { describe, expect, it } from 'vitest'

import type { SceneObject } from '@/types/sceneObject'
import type { Action } from '@/types/screenplay'
import { sortObjectsBySlotActionOrder, sortObjectsForEvaluation } from '@/utils/objectEvaluationOrder'

function makeObject(id: string, parentId?: string): SceneObject {
  return {
    id,
    type: 'prop',
    name: id,
    alias: id,
    refId: 'prop',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    flipX: false,
    zIndex: 0,
    visible: true,
    ...(parentId ? { parentId } : {}),
  } as SceneObject
}

describe('objectEvaluationOrder', () => {
  it('orders same-depth objects by current slot action order', () => {
    const objects = [makeObject('a'), makeObject('b'), makeObject('c')]
    const actions: Action[] = [
      {
        id: 'b-action',
        type: 'set_transform',
        category: 'point',
        target: 'b',
        slotIndex: 0,
        order: 0,
        params: { x: 10 },
      } as Action,
      {
        id: 'a-action',
        type: 'set_transform',
        category: 'point',
        target: 'a',
        slotIndex: 0,
        order: 1,
        params: { x: 20 },
      } as Action,
    ]

    const sorted = sortObjectsForEvaluation(sortObjectsBySlotActionOrder(objects, actions, 0))

    expect(sorted.map(obj => obj.id)).toEqual(['b', 'a', 'c'])
  })

  it('keeps parent before child even when child action is earlier', () => {
    const objects = [makeObject('parent'), makeObject('child', 'parent')]
    const actions: Action[] = [
      {
        id: 'child-action',
        type: 'set_transform',
        category: 'point',
        target: 'child',
        slotIndex: 0,
        order: 0,
        params: { x: 10 },
      } as Action,
      {
        id: 'parent-action',
        type: 'set_transform',
        category: 'point',
        target: 'parent',
        slotIndex: 0,
        order: 1,
        params: { x: 20 },
      } as Action,
    ]

    const sorted = sortObjectsForEvaluation(sortObjectsBySlotActionOrder(objects, actions, 0))

    expect(sorted.map(obj => obj.id)).toEqual(['parent', 'child'])
  })
})
