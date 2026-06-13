/**
 * Prop 序列化器
 *
 * 从 sceneObjectStore.toSetupObject / fromSetupObject 的 prop case 提取。
 */

import { usePropStore } from '@/stores/propStore'
import type { SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const propSerializer: TypeSerializer = {
    serializeFields(_obj: SceneObject, _base: Record<string, unknown>): void {
        // v16: animations/initialAnimations 已统一在 toSetupObject base 处理
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const propStore = usePropStore()
        const propAsset = propStore.getProp(objData.refId)
        const propName = propAsset?.name ?? '未知'

        const propObj = ctx.createPropObject(
            objData.refId,
            propName,
            objData.id,
            objData.alias ?? '',
        )

        const propUpdates: import('@/types/sceneObject').SceneObjectUpdateFor = {
            x: objData.x,
            y: objData.y,
            scaleX: objData.scaleX,
            scaleY: objData.scaleY,
            rotation: objData.rotation,
            zIndex: objData.zIndex,
            flipX: objData.flipX ?? false,
            visible: objData.visible ?? true,
            alpha: objData.alpha ?? 1,
            spawned: objData.spawned ?? true,
            transformOriginX: objData.transformOriginX,
            transformOriginY: objData.transformOriginY,
            parentId: objData.parentId,
        }
        if (objData.width !== undefined) propUpdates.width = objData.width
        if (objData.height !== undefined) propUpdates.height = objData.height
        ctx.updateObject(propObj.id, propUpdates)
    },
}

registerTypeSerializer('prop', propSerializer)
