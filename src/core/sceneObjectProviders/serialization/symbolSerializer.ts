/**
 * Symbol 序列化器
 *
 * 处理 SymbolObject 的 materials / currentMaterialId 子类型特化字段。
 */

import type { SceneObject, SymbolObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const symbolSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const sym = obj as SymbolObject
        // v16: materials 直接序列化（_runtimeUrl 已从类型中移除，无需手动剥离）
        base['materials'] = sym.materials.map(m => ({
            ...m,
            // 确保 frames 深拷贝（避免引用共享）
            ...(m.frames ? { frames: m.frames.map(f => ({ ...f })) } : {}),
        }))
        if (sym.currentMaterialId !== undefined) {
            base['currentMaterialId'] = sym.currentMaterialId
        }
        // v16: animations/initialAnimations 已统一在 toSetupObject base 处理
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const symData = objData as SymbolObject
        const symbolObj = ctx.createSymbolObject(
            objData.alias ?? objData.name ?? '元件',
            objData.id,
            objData.alias ?? '',
        )
        ctx.updateObject(symbolObj.id, {
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
            materials: symData.materials ?? [],
            currentMaterialId: symData.currentMaterialId,
        } as Partial<SymbolObject>)
    },
}

registerTypeSerializer('symbol', symbolSerializer)
