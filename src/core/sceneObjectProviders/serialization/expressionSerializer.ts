/**
 * Expression 序列化器
 *
 * 处理 ExpressionObject 的子类型特化字段。
 * ExpressionObject 的 refId 已由基类 toSetupObject 统一序列化，
 * 此序列化器仅需处理反序列化创建逻辑。
 */

import type { ExpressionObject, SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const expressionSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const expr = obj as ExpressionObject
        if (expr.defaultRefId) {
            base['defaultRefId'] = expr.defaultRefId
        }
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const exprObj = ctx.createExpressionObject(
            objData.refId ?? '',
            objData.alias ?? objData.name ?? '表情',
            objData.id,
            objData.alias ?? '',
        )
        // 旧数据兼容：缺失 defaultRefId 时 fallback 为 refId
        const rawData = objData as ExpressionObject
        const defaultRefId = rawData.defaultRefId ?? objData.refId ?? ''
        ctx.updateObject(exprObj.id, {
            x: objData.x,
            y: objData.y,
            width: objData.width ?? 200,
            height: objData.height ?? 200,
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
            defaultRefId,
        } as Partial<ExpressionObject>)
    },
}

registerTypeSerializer('expression', expressionSerializer)
