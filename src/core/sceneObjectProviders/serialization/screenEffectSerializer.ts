/**
 * ScreenEffect 序列化器
 *
 * 从 sceneObjectStore.toSetupObject / fromSetupObject 的 screen_effect case 提取。
 */

import type { SceneObject, ScreenEffectObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const screenEffectSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const effect = obj as ScreenEffectObject
        if (effect.effectClass) base['effectClass'] = effect.effectClass
        if (effect.params) {
            base['params'] = effect.params
        }
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const effectData = objData as ScreenEffectObject
        const effectObj = ctx.createScreenEffectObject(
            effectData.effectClass ?? 'fullscreen_cover',
            objData.alias ?? '画面特效',
            effectData.params ?? {},
            objData.id,
            objData.alias ?? '',
        )
        ctx.updateObject(effectObj.id, {
            x: objData.x,
            y: objData.y,
            width: objData.width ?? effectObj.width,
            height: objData.height ?? effectObj.height,
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
        })
    },
}

registerTypeSerializer('screen_effect', screenEffectSerializer)
