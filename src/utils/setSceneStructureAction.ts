import type { SceneObject } from '@/types/sceneObject'
import type { SceneStructureOperation, SetSceneStructureAction, SetSceneStructureParams } from '@/types/screenplay'
import {
    decomposeMatrixForState,
    invertMatrix,
    multiplyMatrix,
    resolveWorldMatrix,
} from '@/utils/actionHandlers/handlers/SetParentHandler'
import type { WriteableState } from '@/utils/actionHandlers/types'
import { rebuildChildIdsFromParentIds } from '@/utils/hierarchyUtils'
import { reconcileRenderChain } from '@/utils/renderChainUtils'

function getObjectMap(objects: SceneObject[]): Map<string, SceneObject> {
    return new Map(objects.map(obj => [obj.id, obj]))
}

export interface FlattenedSceneStructureOperations {
    parentById: Record<string, string | null>
    spawnedById: Record<string, boolean>
    autoRestoreOnBlockEndById: Record<string, boolean>
}

export function flattenSceneStructureOperations(
    operations: readonly SceneStructureOperation[] = [],
): FlattenedSceneStructureOperations {
    const parentById: Record<string, string | null> = {}
    const spawnedById: Record<string, boolean> = {}
    const autoRestoreOnBlockEndById: Record<string, boolean> = {}

    for (const operation of operations) {
        if (operation.kind === 'group') {
            parentById[operation.groupId] = operation.parentId
            spawnedById[operation.groupId] = true
            for (const memberId of operation.memberIds) {
                parentById[memberId] = operation.groupId
            }
            if (operation.autoRestoreOnBlockEnd === false) {
                autoRestoreOnBlockEndById[operation.groupId] = false
            }
            continue
        }

        if (operation.kind === 'ungroup') {
            parentById[operation.groupId] = operation.groupParentId
            spawnedById[operation.groupId] = false
            for (const memberId of operation.memberIds) {
                parentById[memberId] = operation.restoreParentId
            }
            continue
        }

        for (const objectId of operation.objectIds) {
            parentById[objectId] = operation.parentId
        }
    }

    return { parentById, spawnedById, autoRestoreOnBlockEndById }
}

export function flattenSetSceneStructureParams(
    params: SetSceneStructureParams,
): FlattenedSceneStructureOperations {
    return flattenSceneStructureOperations(params.operations)
}

function reconcileRuntimeRenderChains(objects: SceneObject[], renderChain?: string[]): string[] | undefined {
    for (const obj of objects) {
        if (obj.type !== 'composite') continue
        const comp = obj as unknown as { compositeMode?: string; renderChain?: string[] }
        if (comp.compositeMode !== 'entity') continue
        comp.renderChain = reconcileRenderChain(comp.renderChain ?? [], objects, obj.id)
    }
    return renderChain ? reconcileRenderChain(renderChain, objects) : renderChain
}

function getRuntimeDepth(id: string, objectMap: Map<string, SceneObject>): number {
    let depth = 0
    let current = objectMap.get(id)
    const visited = new Set<string>([id])

    while (current?.parentId) {
        if (visited.has(current.parentId)) break
        visited.add(current.parentId)
        depth += 1
        current = objectMap.get(current.parentId)
    }

    return depth
}

export function applySetSceneStructureActionToObjects(
    objects: SceneObject[],
    action: SetSceneStructureAction,
    renderChain?: string[],
): { renderChain?: string[] } {
    const objectMap = getObjectMap(objects)
    const getObjectState = (id: string): WriteableState | undefined =>
        objectMap.get(id) as unknown as WriteableState | undefined

    const patch = flattenSetSceneStructureParams(action.params)
    const changedIds = Object.keys(patch.parentById)
    const worldBefore = new Map<string, ReturnType<typeof resolveWorldMatrix>>()
    const preserveIds = new Set<string>()

    for (const id of changedIds) {
        const obj = objectMap.get(id)
        if (!obj) continue
        const nextParentId = patch.parentById[id]
        const prevParentId = obj.parentId ?? null
        if (prevParentId === nextParentId) continue
        if (obj.spawned === false) continue
        worldBefore.set(id, resolveWorldMatrix(obj as unknown as WriteableState, getObjectState))
        preserveIds.add(id)
    }

    for (const [id, spawned] of Object.entries(patch.spawnedById)) {
        const obj = objectMap.get(id)
        if (!obj) continue
        ;(obj as unknown as { spawned?: boolean }).spawned = spawned
    }

    for (const [id, parentId] of Object.entries(patch.parentById)) {
        const obj = objectMap.get(id)
        if (!obj) continue
        if (parentId) {
            obj.parentId = parentId
        } else {
            delete obj.parentId
        }
    }

    rebuildChildIdsFromParentIds(objects)

    const orderedPreserveIds = [...preserveIds].sort(
        (a, b) => getRuntimeDepth(a, objectMap) - getRuntimeDepth(b, objectMap)
    )

    for (const id of orderedPreserveIds) {
        const obj = objectMap.get(id)
        const before = worldBefore.get(id)
        if (!obj || !before) continue

        const state = obj as unknown as WriteableState
        let nextLocalMatrix = before
        if (obj.parentId) {
            const parentState = getObjectState(obj.parentId)
            if (parentState) {
                nextLocalMatrix = multiplyMatrix(invertMatrix(resolveWorldMatrix(parentState, getObjectState)), before)
            }
        }
        const local = decomposeMatrixForState(nextLocalMatrix, state)
        obj.x = local.x
        obj.y = local.y
        obj.scaleX = Math.abs(local.scaleX)
        obj.scaleY = local.scaleY
        obj.rotation = local.rotation
        obj.flipX = local.scaleX < 0
    }

    rebuildChildIdsFromParentIds(objects)
    const nextRenderChain = reconcileRuntimeRenderChains(objects, renderChain)
    return nextRenderChain ? { renderChain: nextRenderChain } : {}
}
