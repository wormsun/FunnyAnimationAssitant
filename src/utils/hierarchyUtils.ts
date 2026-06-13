import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import type { SceneSetup } from '@/types/screenplay'
import { reconcileRenderChain } from '@/utils/renderChainUtils'

export interface HierarchyReconcileResult {
    changed: boolean
    warnings: string[]
}

function arraysEqual(a: readonly string[] | undefined, b: readonly string[]): boolean {
    if (!a) return b.length === 0
    if (a.length !== b.length) return false
    return a.every((value, index) => value === b[index])
}

/**
 * Rebuild composite.childIds from object.parentId.
 *
 * Runtime hierarchy has a single source of truth: child.parentId. childIds is a
 * derived cache used by UI, render-chain expansion, and traversal helpers.
 */
export function rebuildChildIdsFromParentIds(objects: SceneObject[]): HierarchyReconcileResult {
    const warnings: string[] = []
    let changed = false

    const objectMap = new Map<string, SceneObject>()
    const nextChildren = new Map<string, string[]>()

    for (const obj of objects) {
        objectMap.set(obj.id, obj)
        if (obj.type === 'composite') {
            nextChildren.set(obj.id, [])
        }
    }

    for (const obj of objects) {
        if (!obj.parentId) continue

        const parent = objectMap.get(obj.parentId)
        if (!parent) {
            warnings.push(`Object "${obj.id}" parentId "${obj.parentId}" does not exist; cleared to root`)
            delete obj.parentId
            changed = true
            continue
        }
        if (parent.type !== 'composite') {
            warnings.push(`Object "${obj.id}" parentId "${obj.parentId}" is not a composite; cleared to root`)
            delete obj.parentId
            changed = true
            continue
        }

        nextChildren.get(parent.id)?.push(obj.id)
    }

    for (const obj of objects) {
        if (obj.type !== 'composite') continue

        const comp = obj as CompositeObject
        const expected = nextChildren.get(comp.id) ?? []
        if (!arraysEqual(comp.childIds, expected)) {
            comp.childIds = [...expected]
            changed = true
        }
    }

    return { changed, warnings }
}

export function getChildIdsByParentId(objects: readonly SceneObject[], parentId: string): string[] {
    return objects.filter(obj => obj.parentId === parentId).map(obj => obj.id)
}

export function reconcileSetupHierarchy(setup: SceneSetup): HierarchyReconcileResult {
    const result = rebuildChildIdsFromParentIds(setup.objects)

    const nextSceneChain = reconcileRenderChain(setup.renderChain ?? [], setup.objects)
    if (!arraysEqual(setup.renderChain, nextSceneChain)) {
        setup.renderChain = nextSceneChain
        result.changed = true
    }

    for (const obj of setup.objects) {
        if (obj.type !== 'composite') continue

        const comp = obj as CompositeObject
        if (comp.compositeMode !== 'entity') continue

        const nextChain = reconcileRenderChain(comp.renderChain ?? [], setup.objects, comp.id)
        if (!arraysEqual(comp.renderChain, nextChain)) {
            comp.renderChain = nextChain
            result.changed = true
        }
    }

    return result
}

export function warnHierarchyIssues(scope: string, warnings: readonly string[]): void {
    if (warnings.length === 0) return
    if (!import.meta.env.DEV) return
    console.warn(`[Hierarchy] ${scope}`, warnings)
}
