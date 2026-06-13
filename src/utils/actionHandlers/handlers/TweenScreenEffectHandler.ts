/**
 * TweenScreenEffect Action Handler (Phase 1)
 * 处理画面特效参数的持续渐变
 * 直接操作 state.params 嵌套结构（消除 flat state 中间层）
 */

import type { ScreenEffectParams } from '@/types/sceneObject'
import type { TweenScreenEffectAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

/**
 * 线性插值
 */
function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

export const TweenScreenEffectHandler: ActionHandler<TweenScreenEffectAction> = {
    type: 'tween_screen_effect',
    isPointAction: false,
    isDurationAction: true,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: TweenScreenEffectAction, _context?: ActionHandlerContext): void {
        // 瞬时应用：直接设置为目标值
        const { params } = action
        state.params ??= {} as ScreenEffectParams
        const p = state.params

        // coverOpacity 已删除，统一由 alpha 控制
        if (params.baseColor !== undefined) p.baseColor = params.baseColor
        if (params.holeShape !== undefined) p.holeShape = params.holeShape
        if (params.holeCenterX !== undefined) p.holeCenterX = params.holeCenterX
        if (params.holeCenterY !== undefined) p.holeCenterY = params.holeCenterY
        if (params.holeWidth !== undefined) p.holeWidth = params.holeWidth
        if (params.holeHeight !== undefined) p.holeHeight = params.holeHeight
        if (params.openRatio !== undefined) p.openRatio = params.openRatio
        if (params.feather !== undefined) p.feather = params.feather
        if (params.targetId !== undefined) p.targetId = params.targetId
        if (params.offsetX !== undefined) p.offsetX = params.offsetX
        if (params.offsetY !== undefined) p.offsetY = params.offsetY
    },

    interpolate(
        state: WriteableState,
        action: TweenScreenEffectAction,
        progress: number,
        startState: WriteableState
    ): void {
        const { params } = action
        state.params ??= {} as ScreenEffectParams
        const p = state.params
        const sp = startState.params

        // 数值型参数做线性插值

        // coverOpacity 已删除，不透明度插值统一由 tween_transform 的 alpha 处理
        if (params.holeCenterX !== undefined && sp?.holeCenterX !== undefined) {
            p.holeCenterX = lerp(sp.holeCenterX, params.holeCenterX, progress)
        }
        if (params.holeCenterY !== undefined && sp?.holeCenterY !== undefined) {
            p.holeCenterY = lerp(sp.holeCenterY, params.holeCenterY, progress)
        }
        if (params.holeWidth !== undefined && sp?.holeWidth !== undefined) {
            p.holeWidth = lerp(sp.holeWidth, params.holeWidth, progress)
        }
        if (params.holeHeight !== undefined && sp?.holeHeight !== undefined) {
            p.holeHeight = lerp(sp.holeHeight, params.holeHeight, progress)
        }
        if (params.openRatio !== undefined && sp?.openRatio !== undefined) {
            p.openRatio = lerp(sp.openRatio, params.openRatio, progress)
        }
        if (params.feather !== undefined && sp?.feather !== undefined) {
            p.feather = lerp(sp.feather, params.feather, progress)
        }
        if (params.offsetX !== undefined && sp?.offsetX !== undefined) {
            p.offsetX = lerp(sp.offsetX, params.offsetX, progress)
        }
        if (params.offsetY !== undefined && sp?.offsetY !== undefined) {
            p.offsetY = lerp(sp.offsetY, params.offsetY, progress)
        }

        // 非数值型参数（baseColor, holeShape, targetId）不做插值，在 progress >= 1 时切换
        if (progress >= 1) {
            if (params.baseColor !== undefined) p.baseColor = params.baseColor
            if (params.holeShape !== undefined) p.holeShape = params.holeShape
            if (params.targetId !== undefined) p.targetId = params.targetId
        }
    },

    getTargetState(state: WriteableState, action: TweenScreenEffectAction): void {
        // 与 applyToState 相同
        this.applyToState(state, action)
    }
}
