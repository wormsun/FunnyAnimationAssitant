/**
 * Composite 序列化器
 *
 * P2: 组合对象的序列化/反序列化。
 * 特化字段：childIds, compositeMode
 * 注意：compositeLocked 是 UI-only 属性，不参与序列化（默认 true）
 */

import type { CompositeObject, SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const compositeSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const composite = obj as CompositeObject
        base['childIds'] = composite.childIds ?? []
        // compositeLocked 是 UI-only 属性，不保存到项目文件
        base['compositeMode'] = composite.compositeMode ?? 'entity'
        // renderChain 仅 entity 模式序列化
        if (composite.compositeMode === 'entity' && composite.renderChain) {
            base['renderChain'] = composite.renderChain
        }
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const composite = objData as CompositeObject
        const compositeObj = ctx.createCompositeObject(
            objData.name ?? '组合对象',
            composite.childIds ?? [],
            objData.id,
            objData.alias ?? '',
            composite.compositeMode ?? 'entity',
        )

        ctx.updateObject<CompositeObject>(compositeObj.id, {
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
            compositeLocked: true, // UI-only，始终默认 true
            compositeMode: composite.compositeMode ?? 'entity',
        })

        // renderChain 仅在持久化数据存在时恢复（避免 undefined 删除占位空数组）
        if (composite.renderChain) {
            ctx.updateObject<CompositeObject>(compositeObj.id, {
                renderChain: composite.renderChain,
            })
        }

        if (objData.width !== undefined || objData.height !== undefined) {
            const sizeUpdates: import('@/types/sceneObject').SceneObjectUpdateFor<CompositeObject> = {}
            if (objData.width !== undefined) sizeUpdates.width = objData.width
            if (objData.height !== undefined) sizeUpdates.height = objData.height
            ctx.updateObject<CompositeObject>(compositeObj.id, sizeUpdates)
        }
    },
}

registerTypeSerializer('composite', compositeSerializer)
