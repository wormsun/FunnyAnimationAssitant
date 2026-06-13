/**
 * Background 序列化器
 *
 * 从 sceneObjectStore.toSetupObject / fromSetupObject 的 background case 提取。
 */

import { useBackgroundStore } from '@/stores/backgroundStore'
import type { SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const backgroundSerializer: TypeSerializer = {
    serializeFields(_obj: SceneObject, _base: Record<string, unknown>): void {
        // v16: animations/initialAnimations 已统一在 toSetupObject base 处理
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const backgroundStore = useBackgroundStore()
        const bgAsset = backgroundStore.getBackground(objData.refId)
        const bgName = bgAsset?.name ?? '背景'

        const bgObj = ctx.createBackgroundObject(
            objData.refId,
            bgName,
            objData.id,
            objData.alias ?? '',
        )

        const bgUpdates: import('@/types/sceneObject').SceneObjectUpdateFor = {
            x: objData.x,
            y: objData.y,
            scaleX: objData.scaleX,
            scaleY: objData.scaleY,
            rotation: objData.rotation,
            zIndex: objData.zIndex,
            visible: objData.visible ?? true,
            alpha: objData.alpha ?? 1,
            flipX: objData.flipX ?? false,
            spawned: objData.spawned ?? true,
            transformOriginX: objData.transformOriginX,
            transformOriginY: objData.transformOriginY,
            parentId: objData.parentId,
        }
        if (objData.width !== undefined) bgUpdates.width = objData.width
        if (objData.height !== undefined) bgUpdates.height = objData.height
        ctx.updateObject(bgObj.id, bgUpdates)
    },
}

registerTypeSerializer('background', backgroundSerializer)
