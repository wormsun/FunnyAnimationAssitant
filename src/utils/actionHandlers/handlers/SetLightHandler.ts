/**
 * SetLight Action Handler (点光源 PRD Phase 0.5)
 * 处理光源参数的瞬时设置
 * 直接操作 state.lightColor / lightIntensity / lightRadius
 * 对标 SetScreenEffectHandler 的精简实现
 */

import type { SetLightAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const SetLightHandler: ActionHandler<SetLightAction> = {
    type: 'set_light',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetLightAction, _context?: ActionHandlerContext): void {
        const { params } = action
        if (params.lightColor !== undefined) state.lightColor = params.lightColor
        if (params.lightIntensity !== undefined) state.lightIntensity = params.lightIntensity
        if (params.lightRadius !== undefined) state.lightRadius = params.lightRadius
        // Phase 1: 闪烁和方向性
        if (params.flicker !== undefined) state.flicker = params.flicker
        if (params.flickerSpeed !== undefined) state.flickerSpeed = params.flickerSpeed
        if (params.directionMode !== undefined) state.directionMode = params.directionMode
        if (params.directionAngle !== undefined) state.directionAngle = params.directionAngle
        if (params.coneAngle !== undefined) state.coneAngle = params.coneAngle
    }
}
