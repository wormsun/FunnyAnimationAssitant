/**
 * Audio 序列化器
 *
 * 从 sceneObjectStore.toSetupObject / fromSetupObject 的 audio case 提取。
 */

import type { AudioObject, SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const audioSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const audio = obj as AudioObject
        Object.assign(base, {
            volume: audio.volume,
            loop: audio.loop,
            autoPlay: audio.playbackState === 'play',
            fadeIn: audio.fadeIn,
            fadeOut: audio.fadeOut,
        })
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const audioData = objData as unknown as {
            volume?: number
            loop?: boolean
            autoPlay?: boolean
            fadeIn?: number
            fadeOut?: number
        }
        const audioObj = ctx.createAudioObject(
            objData.refId,
            objData.name ?? objData.alias ?? '音效',
            {
                volume: audioData.volume ?? 1.0,
                loop: audioData.loop ?? false,
                playbackState: audioData.autoPlay ? 'play' : 'stop',
                fadeIn: audioData.fadeIn ?? 0,
                fadeOut: audioData.fadeOut ?? 0,
            },
            objData.id,
            objData.alias ?? '',
        )

        // 恢复持久化属性（与 propSerializer/backgroundSerializer 保持一致）
        ctx.updateObject(audioObj.id, {
            spawned: objData.spawned ?? true,
            parentId: objData.parentId,
        })
    },
}

registerTypeSerializer('audio', audioSerializer)
