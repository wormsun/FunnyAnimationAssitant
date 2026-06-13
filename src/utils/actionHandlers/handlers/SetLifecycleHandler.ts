/**
 * SetLifecycle Action Handler (v9.3 鏂板)
 * 澶勭悊瀵硅薄鐢熷懡鍛ㄦ湡锛歴pawned
 * 
 * 鐢ㄤ簬鎺у埗鍔ㄦ€佸璞＄殑鍑虹敓锛堭煂憋級鍜屾秷浜★紙馃崅锛?
 * P2: entity composite 绫诲瀷瀵硅薄鐢熷懡鍛ㄦ湡鍙樺寲鏃讹紝鑷姩绾ц仈瀛愬璞 spawned.
 * Runtime hierarchy changes are handled by scene-level set_scene_structure actions.
 */

import type { SceneObject } from '@/types/sceneObject'
import type { SetLifecycleAction } from '@/types/screenplay'
import { getChildIdsByParentId } from '@/utils/hierarchyUtils'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

/**
 * 閫掑綊绾ц仈璁剧疆 spawned 鐘舵€侊紙entity 妯″紡锛?
 * 閬嶅巻鎵€鏈夊悗浠ｅ璞★紙鍚祵濂?composite锛夛紝缁熶竴璁剧疆 spawned
 */
function cascadeSpawnedState(
    childIds: string[],
    spawned: boolean,
    getObjectState: (id: string) => WriteableState | undefined
): void {
    for (const childId of childIds) {
        const childState = getObjectState(childId)
        if (!childState) continue
        childState.spawned = spawned
        // 閫掑綊锛氬鏋滃瓙瀵硅薄涔熸槸 composite锛岀户缁骇鑱?
        const grandChildIds = (childState as unknown as { childIds?: string[] }).childIds
        if (grandChildIds && grandChildIds.length > 0) {
            cascadeSpawnedState(grandChildIds, spawned, getObjectState)
        }
    }
}

function getRuntimeObjects(context: ActionHandlerContext): WriteableState[] {
    return Array.isArray(context.objects) ? context.objects : []
}

function getChildIds(
    state: WriteableState,
    context: ActionHandlerContext,
): string[] {
    const objects = getRuntimeObjects(context)
    if (objects.length > 0 && state.id) {
        const derived = getChildIdsByParentId(objects as unknown as SceneObject[], state.id)
        if (derived.length > 0) return derived
    }
    return [...((state as unknown as { childIds?: string[] }).childIds ?? [])]
}

export const SetLifecycleHandler: ActionHandler<SetLifecycleAction> = {
    type: 'set_lifecycle',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetLifecycleAction, context?: ActionHandlerContext): void {
        const { params } = action

        // 鐢熷懡鍛ㄦ湡灞炴€?
        if (params.spawned !== undefined) {
            state.spawned = params.spawned

            // composite 瀛愬璞¤嚜鍔ㄥ鐞?
            if (context?.getObjectState && state.type === 'composite') {
                const childIds = getChildIds(state, context)
                const compositeMode = (state as unknown as { compositeMode?: string }).compositeMode ?? 'entity'

                if (params.spawned) {
                    if (compositeMode === 'entity' && childIds.length > 0) {
                        cascadeSpawnedState(childIds, true, context.getObjectState)
                    }
                } else {
                    if (compositeMode === 'entity' && childIds.length > 0) {
                        cascadeSpawnedState(childIds, false, context.getObjectState)
                    }
                }
            }
        }
    }
}
