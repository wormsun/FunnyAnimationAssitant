import { describe, expect, it } from 'vitest'

import type { SceneObject } from '@/types/sceneObject'
import { SCENE_ACTION_TARGET, type SetSceneStructureAction } from '@/types/screenplay'
import { resolveWorldMatrix } from '@/utils/actionHandlers/handlers/SetParentHandler'
import type { WriteableState } from '@/utils/actionHandlers/types'

import { applySetSceneStructureActionToObjects } from '../setSceneStructureAction'

function symbol(id: string, parentId?: string): SceneObject {
    return {
        id,
        type: 'symbol',
        name: id,
        refId: id,
        x: id === 'box' ? 200 : 40,
        y: id === 'box' ? 120 : 60,
        width: 10,
        height: 10,
        scaleX: 1,
        scaleY: 1,
        rotation: id === 'box' ? Math.PI / 7 : 0,
        alpha: 1,
        visible: true,
        flipX: false,
        zIndex: 1,
        ...(parentId ? { parentId } : {}),
    }
}

function composite(id: string, parentId?: string): SceneObject {
    return {
        id,
        type: 'composite',
        name: id,
        refId: '',
        childIds: [],
        compositeMode: 'union',
        x: 100,
        y: 50,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: Math.PI / 12,
        alpha: 1,
        visible: true,
        flipX: false,
        zIndex: 1,
        ...(parentId ? { parentId } : {}),
    } as SceneObject
}

function groupAction(groupId: string, memberIds: string[], parentId: string | null): SetSceneStructureAction {
    return {
        id: 'hierarchy',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        params: {
            operations: [{ id: 'op_1', kind: 'group', groupId, memberIds, parentId }],
        },
    }
}

function reparentAction(objectIds: string[], parentId: string | null): SetSceneStructureAction {
    return {
        id: 'hierarchy',
        type: 'set_scene_structure',
        category: 'point',
        target: SCENE_ACTION_TARGET,
        slotIndex: 0,
        params: {
            operations: [{ id: 'op_1', kind: 'reparent', objectIds, parentId }],
        },
    }
}

function getter(objects: SceneObject[]) {
    const map = new Map(objects.map(obj => [obj.id, obj]))
    return (id: string): WriteableState | undefined => map.get(id) as unknown as WriteableState | undefined
}

function expectMatrixClose(actual: ReturnType<typeof resolveWorldMatrix>, expected: ReturnType<typeof resolveWorldMatrix>) {
    expect(actual.a).toBeCloseTo(expected.a, 5)
    expect(actual.b).toBeCloseTo(expected.b, 5)
    expect(actual.c).toBeCloseTo(expected.c, 5)
    expect(actual.d).toBeCloseTo(expected.d, 5)
    expect(actual.tx).toBeCloseTo(expected.tx, 5)
    expect(actual.ty).toBeCloseTo(expected.ty, 5)
}

describe('applySetSceneStructureActionToObjects', () => {
    it('applies final parent patch and preserves child world transform', () => {
        const objects = [composite('person'), composite('group', 'person'), symbol('hand', 'person'), symbol('box', 'person')]
        const beforeBox = resolveWorldMatrix(objects[3] as unknown as WriteableState, getter(objects))

        applySetSceneStructureActionToObjects(objects, groupAction('group', ['hand', 'box'], 'person'))

        expect(objects.find(obj => obj.id === 'box')?.parentId).toBe('group')
        expect((objects.find(obj => obj.id === 'group') as unknown as { childIds: string[] }).childIds).toEqual(['hand', 'box'])
        const afterBox = resolveWorldMatrix(objects[3] as unknown as WriteableState, getter(objects))
        expectMatrixClose(afterBox, beforeBox)
    })

    it('uses the last parent value in one patch as final hierarchy state', () => {
        const objects = [composite('person'), composite('group', 'person'), symbol('box')]

        applySetSceneStructureActionToObjects(objects, reparentAction(['box'], 'group'))

        expect(objects.find(obj => obj.id === 'box')?.parentId).toBe('group')
    })

    it('preserves nested changes parent-before-child regardless of patch insertion order', () => {
        const objects = [composite('person'), composite('group'), symbol('box', 'person')]
        const beforeGroup = resolveWorldMatrix(objects[1] as unknown as WriteableState, getter(objects))
        const beforeBox = resolveWorldMatrix(objects[2] as unknown as WriteableState, getter(objects))

        applySetSceneStructureActionToObjects(objects, groupAction('group', ['box'], 'person'))

        const afterGroup = resolveWorldMatrix(objects[1] as unknown as WriteableState, getter(objects))
        const afterBox = resolveWorldMatrix(objects[2] as unknown as WriteableState, getter(objects))
        expect(objects.find(obj => obj.id === 'group')?.parentId).toBe('person')
        expect(objects.find(obj => obj.id === 'box')?.parentId).toBe('group')
        expectMatrixClose(afterGroup, beforeGroup)
        expectMatrixClose(afterBox, beforeBox)
    })
})
