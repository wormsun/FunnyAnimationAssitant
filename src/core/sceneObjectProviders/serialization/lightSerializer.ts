/**
 * Light 序列化器
 *
 * v25.1: 环境光和点光源都参与序列化/反序列化。
 * 环境光由 sceneLoader 自动创建（如不存在），但用户修改的
 * lightColor / lightIntensity 需要持久化，以便 ScenePlayer 读取。
 *
 * Phase 1: 新增 flicker / flickerSpeed / directionMode / directionAngle / coneAngle
 * 序列化策略：仅非默认值写入，减小文件体积（旧数据兼容由 createLightObject 默认值保证）。
 */

import type { LightObject, SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const lightSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const light = obj as LightObject
        base['lightType'] = light.lightType
        base['lightColor'] = light.lightColor
        base['lightIntensity'] = light.lightIntensity
        base['lightRadius'] = light.lightRadius

        // Phase 1: 仅非默认值才写入（减小文件体积）
        if (light.flicker !== undefined && light.flicker !== 0) {
            base['flicker'] = light.flicker
        }
        if (light.flickerSpeed !== undefined && light.flickerSpeed !== 0.35) {
            base['flickerSpeed'] = light.flickerSpeed
        }
        if (light.directionMode !== undefined && light.directionMode !== 'omni') {
            base['directionMode'] = light.directionMode
            // 方向性参数仅 cone 模式才有意义
            if (light.directionAngle !== undefined && light.directionAngle !== 0) {
                base['directionAngle'] = light.directionAngle
            }
            if (light.coneAngle !== undefined && light.coneAngle !== 100) {
                base['coneAngle'] = light.coneAngle
            }
        }
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const lightData = objData as LightObject

        // 值域校验：未知 lightType 回退到 'point'
        const validLightTypes = ['ambient', 'point', 'spot'] as const
        const lightType = validLightTypes.includes(lightData.lightType)
            ? lightData.lightType
            : 'point'

        const lightObj = ctx.createLightObject(
            lightType,
            objData.name ?? (
                lightData.lightType === 'ambient'
                    ? '环境光'
                    : lightData.lightType === 'spot'
                        ? '聚光灯'
                        : '点光源'
            ),
            {
                lightColor: lightData.lightColor,
                lightIntensity: lightData.lightIntensity,
                lightRadius: lightData.lightRadius,
                // Phase 1: 条件展开，仅非 undefined 时传入（兼容 exactOptionalPropertyTypes）
                ...(lightData.flicker !== undefined ? { flicker: lightData.flicker } : {}),
                ...(lightData.flickerSpeed !== undefined ? { flickerSpeed: lightData.flickerSpeed } : {}),
                ...(lightData.directionMode !== undefined ? { directionMode: lightData.directionMode } : {}),
                ...(lightData.directionAngle !== undefined ? { directionAngle: lightData.directionAngle } : {}),
                ...(lightData.coneAngle !== undefined ? { coneAngle: lightData.coneAngle } : {}),
                x: objData.x,
                y: objData.y,
            },
            objData.id,
            objData.alias,
        )

        ctx.updateObject(lightObj.id, {
            x: objData.x,
            y: objData.y,
            zIndex: objData.zIndex,
            visible: objData.visible ?? true,
            alpha: objData.alpha ?? 1,
            spawned: objData.spawned ?? true,
        })
    },
}

registerTypeSerializer('light', lightSerializer)
