/**
 * TweenLight Action Handler (点光源 PRD Phase 0.5)
 * 处理光源参数的持续渐变
 * 直接操作 state.lightColor / lightIntensity / lightRadius
 * 对标 TweenScreenEffectHandler 的实现
 */

import type { TweenLightAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

/**
 * 线性插值
 */
function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

/**
 * Hex 颜色 RGB 逐通道线性插值
 */
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ]
}

function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    return '#' + [clamp(r), clamp(g), clamp(b)]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('')
}

function lerpHexColor(from: string, to: string, t: number): string {
    const [r1, g1, b1] = hexToRgb(from)
    const [r2, g2, b2] = hexToRgb(to)
    return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

export const TweenLightHandler: ActionHandler<TweenLightAction> = {
    type: 'tween_light',
    isPointAction: false,
    isDurationAction: true,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: TweenLightAction, _context?: ActionHandlerContext): void {
        // 瞬时应用：直接设置为目标值
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
    },

    interpolate(
        state: WriteableState,
        action: TweenLightAction,
        progress: number,
        startState: WriteableState
    ): void {
        const { params } = action

        // 数值型参数线性插值
        if (params.lightIntensity !== undefined && startState.lightIntensity !== undefined) {
            state.lightIntensity = lerp(startState.lightIntensity, params.lightIntensity, progress)
        }
        if (params.lightRadius !== undefined && startState.lightRadius !== undefined) {
            state.lightRadius = lerp(startState.lightRadius, params.lightRadius, progress)
        }
        // 颜色 RGB 逐通道插值
        if (params.lightColor !== undefined && startState.lightColor !== undefined) {
            state.lightColor = lerpHexColor(startState.lightColor, params.lightColor, progress)
        }
        // Phase 1: 闪烁和方向性插值
        if (params.flicker !== undefined && startState.flicker !== undefined) {
            state.flicker = lerp(startState.flicker, params.flicker, progress)
        }
        if (params.flickerSpeed !== undefined && startState.flickerSpeed !== undefined) {
            state.flickerSpeed = lerp(startState.flickerSpeed, params.flickerSpeed, progress)
        }
        // directionMode 是枚举，不插值，直接设置终态
        if (params.directionMode !== undefined) {
            state.directionMode = params.directionMode
        }
        if (params.directionAngle !== undefined && startState.directionAngle !== undefined) {
            state.directionAngle = lerp(startState.directionAngle, params.directionAngle, progress)
        }
        if (params.coneAngle !== undefined && startState.coneAngle !== undefined) {
            state.coneAngle = lerp(startState.coneAngle, params.coneAngle, progress)
        }
    },

    getTargetState(state: WriteableState, action: TweenLightAction): void {
        this.applyToState(state, action)
    }
}
