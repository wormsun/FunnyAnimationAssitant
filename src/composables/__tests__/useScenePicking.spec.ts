import { describe, expect, it } from 'vitest'

import { useScenePicking } from '@/composables/useScenePicking'
import type { SceneObjectProvider } from '@/types/SceneObjectProvider'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'

interface FakeRect {
  x: number
  y: number
  width: number
  height: number
}

function makeContainer(rect: FakeRect) {
  return {
    destroyed: false,
    visible: true,
    renderable: true,
    worldAlpha: 1,
    parent: null,
    hitArea: {
      contains: (x: number, y: number) => (
        x >= rect.x
        && x <= rect.x + rect.width
        && y >= rect.y
        && y <= rect.y + rect.height
      ),
    },
    toLocal: (point: { x: number; y: number }) => point,
    getLocalBounds: () => rect,
  } as any
}

function makeObject(id: string, options: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    type: 'prop',
    name: id,
    refId: id,
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
    ...options,
  } as SceneObject
}

function makeComposite(
  id: string,
  options: Partial<CompositeObject> & Pick<CompositeObject, 'childIds' | 'compositeMode'>,
): CompositeObject {
  return makeObject(id, {
    type: 'composite',
    compositeLocked: true,
    ...options,
  } as Partial<SceneObject>) as CompositeObject
}

function makeStore(objects: SceneObject[], renderChain: string[]): SceneObjectProvider {
  return {
    objects,
    selectedObjectId: null,
    getObject: (id: string) => objects.find(obj => obj.id === id),
    getSortedObjects: () => objects,
    getSceneRenderChain: () => renderChain,
    selectObject: () => undefined,
    updateObject: () => undefined,
    updateSetupObject: () => undefined,
  }
}

function createPicker(options: {
  objects: SceneObject[]
  renderChain: string[]
  containers: Record<string, FakeRect>
  passThrough?: Set<string>
}) {
  const containerMap = new Map(
    Object.entries(options.containers).map(([id, rect]) => [id, makeContainer(rect)])
  )
  return useScenePicking({
    store: makeStore(options.objects, options.renderChain),
    getContainer: (id) => containerMap.get(id),
    isPassThrough: (id) => options.passThrough?.has(id) ?? false,
  })
}

describe('useScenePicking', () => {
  it('picks the later renderChain object first when zIndex is equal', () => {
    const picker = createPicker({
      objects: [makeObject('a'), makeObject('b')],
      renderChain: ['a', 'b'],
      containers: {
        a: { x: 0, y: 0, width: 100, height: 100 },
        b: { x: 0, y: 0, width: 100, height: 100 },
      },
    })

    expect(picker.pickAt({ x: 10, y: 10 }).rawHitId).toBe('b')
  })

  it('redirects a union child hit to the locked union composite', () => {
    const union = makeComposite('union', {
      compositeMode: 'union',
      childIds: ['child'],
      compositeLocked: true,
    })
    const child = makeObject('child', { parentId: 'union' })
    const picker = createPicker({
      objects: [union, child],
      renderChain: ['child'],
      containers: {
        union: { x: 0, y: 0, width: 100, height: 100 },
        child: { x: 0, y: 0, width: 20, height: 20 },
      },
    })

    const result = picker.pickAt({ x: 10, y: 10 })
    expect(result.rawHitId).toBe('child')
    expect(result.selectTargetId).toBe('union')
  })

  it('selects a union child directly when the union is unlocked', () => {
    const union = makeComposite('union', {
      compositeMode: 'union',
      childIds: ['child'],
      compositeLocked: false,
    })
    const child = makeObject('child', { parentId: 'union' })
    const picker = createPicker({
      objects: [union, child],
      renderChain: ['child'],
      containers: {
        union: { x: 0, y: 0, width: 100, height: 100 },
        child: { x: 0, y: 0, width: 20, height: 20 },
      },
    })

    const result = picker.pickAt({ x: 10, y: 10 })
    expect(result.rawHitId).toBe('child')
    expect(result.selectTargetId).toBe('child')
  })

  it('picks an unlocked union by bounds when clicking empty union area', () => {
    const union = makeComposite('union', {
      compositeMode: 'union',
      childIds: ['child'],
      compositeLocked: false,
    })
    const child = makeObject('child', { parentId: 'union' })
    const picker = createPicker({
      objects: [union, child],
      renderChain: ['child'],
      containers: {
        union: { x: 0, y: 0, width: 100, height: 100 },
        child: { x: 0, y: 0, width: 20, height: 20 },
      },
    })

    const result = picker.pickAt({ x: 50, y: 50 })
    expect(result.rawHitId).toBe('union')
    expect(result.reason).toBe('composite-bounds')
    expect(result.selectTargetId).toBe('union')
  })

  it('lets a pass-through union and its subtree fall through to lower objects', () => {
    const below = makeObject('below')
    const union = makeComposite('union', {
      compositeMode: 'union',
      childIds: ['child'],
      compositeLocked: true,
    })
    const child = makeObject('child', { parentId: 'union' })
    const picker = createPicker({
      objects: [below, union, child],
      renderChain: ['below', 'child'],
      containers: {
        below: { x: 0, y: 0, width: 100, height: 100 },
        union: { x: 0, y: 0, width: 100, height: 100 },
        child: { x: 0, y: 0, width: 100, height: 100 },
      },
      passThrough: new Set(['union']),
    })

    const result = picker.pickAt({ x: 10, y: 10 })
    expect(result.rawHitId).toBe('below')
    expect(result.selectTargetId).toBe('below')
  })
})
