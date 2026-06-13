import { describe, expect, it } from 'vitest'

import type { CompositeObject, PropObject, SceneObject } from '@/types/sceneObject'
import type { SceneSetup } from '@/types/screenplay'
import { rebuildChildIdsFromParentIds, reconcileSetupHierarchy } from '@/utils/hierarchyUtils'

function makeComposite(id: string, overrides: Partial<CompositeObject> = {}): CompositeObject {
    return {
        id,
        type: 'composite',
        name: id,
        alias: id,
        refId: '',
        childIds: [],
        compositeLocked: false,
        compositeMode: 'entity',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 0,
        visible: true,
        ...overrides,
    }
}

function makeProp(id: string, overrides: Partial<PropObject> = {}): PropObject {
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
        ...overrides,
    }
}

describe('hierarchyUtils', () => {
    it('rebuilds childIds from parentId using object order', () => {
        const objects: SceneObject[] = [
            makeComposite('parent', { childIds: ['stale'] }),
            makeProp('b', { parentId: 'parent' }),
            makeProp('a', { parentId: 'parent' }),
        ]

        const result = rebuildChildIdsFromParentIds(objects)

        expect(result.changed).toBe(true)
        expect((objects[0] as CompositeObject).childIds).toEqual(['b', 'a'])
    })

    it('clears invalid parentId references to root', () => {
        const objects: SceneObject[] = [
            makeComposite('parent'),
            makeProp('missingParentChild', { parentId: 'ghost' }),
            makeProp('propParent'),
            makeProp('propChild', { parentId: 'propParent' }),
        ]

        const result = rebuildChildIdsFromParentIds(objects)

        expect(result.changed).toBe(true)
        expect(result.warnings).toHaveLength(2)
        expect(objects[1]!.parentId).toBeUndefined()
        expect(objects[3]!.parentId).toBeUndefined()
        expect((objects[0] as CompositeObject).childIds).toEqual([])
    })

    it('cleans renderChain ids that no longer belong to the hierarchy', () => {
        const setup: SceneSetup = {
            camera: { x: 0, y: 0, width: 1920, height: 1080, zoom: 1 },
            objects: [
                makeComposite('entity', { renderChain: ['child', 'ghost'] }),
                makeProp('child', { parentId: 'entity' }),
                makeProp('root'),
            ],
            renderChain: ['ghost', 'root', 'child'],
        }

        const result = reconcileSetupHierarchy(setup)

        expect(result.changed).toBe(true)
        expect((setup.objects[0] as CompositeObject).childIds).toEqual(['child'])
        expect((setup.objects[0] as CompositeObject).renderChain).toEqual(['child'])
        expect(setup.renderChain).toEqual(['root', 'entity'])
    })
})
