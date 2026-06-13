import { describe, expect, it } from 'vitest'

import type { CompositeObject, SceneObject, SymbolObject } from '@/types/sceneObject'
import { choosePreviewFitBounds, collectRootVisibilitySnapshot, diagnosePreviewRenderChain } from '@/utils/previewDiagnostics'

function makeEntityRoot(id: string): CompositeObject {
  return {
    id,
    type: 'composite',
    name: id,
    alias: id,
    refId: '',
    childIds: [],
    compositeLocked: true,
    compositeMode: 'entity',
    x: 100,
    y: 200,
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
}

function makeUnionRoot(id: string): CompositeObject {
  const comp = makeEntityRoot(id)
  comp.compositeMode = 'union'
  return comp
}

function makeSymbol(id: string, parentId?: string): SymbolObject {
  const base: SymbolObject = {
    id,
    type: 'symbol',
    name: id,
    alias: id,
    refId: '',
    materials: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    flipX: false,
    zIndex: 5,
    visible: true,
  }

  if (parentId !== undefined) {
    base.parentId = parentId
  }
  return base
}

describe('previewDiagnostics', () => {
  it('flags missing root entity composite from renderChain', () => {
    const root = makeEntityRoot('root_entity')
    const child = makeSymbol('child', 'root_entity')
    const objects = [root, child] as SceneObject[]

    const diag = diagnosePreviewRenderChain(objects, ['child'])

    expect(diag.rootRenderableIds).toEqual(['root_entity'])
    expect(diag.missingRootRenderableIds).toEqual(['root_entity'])
  })

  it('does not require union root composite itself in renderChain', () => {
    const rootUnion = makeUnionRoot('root_union')
    const childA = makeSymbol('a', 'root_union')
    const childB = makeSymbol('b', 'root_union')
    rootUnion.childIds = ['a', 'b']
    const objects = [rootUnion, childA, childB] as SceneObject[]

    const diag = diagnosePreviewRenderChain(objects, ['a', 'b'])

    expect(diag.rootRenderableIds).toEqual([])
    expect(diag.missingRootRenderableIds).toEqual([])
  })

  it('collects root visibility snapshot with default spawned=true', () => {
    const root = makeEntityRoot('root_entity')
    const child = makeSymbol('child', 'root_entity')
    root.visible = false
    root.alpha = 0.4
    const snapshot = collectRootVisibilitySnapshot([root, child] as SceneObject[])

    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]?.['id']).toBe('root_entity')
    expect(snapshot[0]?.['visible']).toBe(false)
    expect(snapshot[0]?.['alpha']).toBe(0.4)
    expect(snapshot[0]?.['spawned']).toBe(true)
    expect(snapshot[0]?.['isEntityComposite']).toBe(true)
  })

  it('chooses contentLayer bounds for fit when content bounds are valid', () => {
    const content = { x: 120, y: 80, width: 400, height: 600 }
    const stage = { x: 0, y: 0, width: 6912, height: 4096 }

    const fit = choosePreviewFitBounds(content, stage)

    expect(fit.chosen).toBe('contentLayer')
    expect(fit.bounds).toEqual(content)
  })

  it('falls back to stage bounds when content bounds are invalid', () => {
    const content = { x: 0, y: 0, width: 0, height: 0 }
    const stage = { x: 0, y: 0, width: 6912, height: 4096 }

    const fit = choosePreviewFitBounds(content, stage)

    expect(fit.chosen).toBe('stage')
    expect(fit.bounds).toEqual(stage)
  })
})
