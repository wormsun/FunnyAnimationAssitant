/**
 * TweenTransform Action Handler
 * 处理位置/缩放/旋转/透明度的持续变换
 *
 * v17/v27:
 * - x/y 按全局坐标存储，播放时转回当前 parent 下的本地坐标
 * - rotation/scale 按对象自身局部值存储和插值
 */

import type { TweenTransformAction } from '@/types/screenplay'

import { globalToLocal } from '../matrixUtils'
import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'
import { decomposeMatrixForState, resolveWorldMatrix } from './SetParentHandler'

/**
 * 线性插值
 */
function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

export const TweenTransformHandler: ActionHandler<TweenTransformAction> = {
    type: 'tween_transform',
    isPointAction: false,
    isDurationAction: true,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: TweenTransformAction, context?: ActionHandlerContext): void {
        // 瞬时应用：
        // - x/y: 全局 → 本地
        // - rotation/scale: 直接应用局部值
        const { params } = action

        const positionParams: { x?: number; y?: number } = {}
        if (params.x !== undefined) positionParams.x = params.x
        if (params.y !== undefined) positionParams.y = params.y
        const coordinateBasis: WriteableState = {
            ...state,
            ...(params.scaleX !== undefined ? { scaleX: params.scaleX } : {}),
            ...(params.scaleY !== undefined ? { scaleY: params.scaleY } : {}),
            ...(params.rotation !== undefined ? { rotation: params.rotation } : {}),
        }
        const localPosition = globalToLocal(positionParams, coordinateBasis, context?.getObjectState)
        if (localPosition.x !== undefined) state.x = localPosition.x
        if (localPosition.y !== undefined) state.y = localPosition.y
        if (params.scaleX !== undefined) state.scaleX = params.scaleX
        if (params.scaleY !== undefined) state.scaleY = params.scaleY
        if (params.rotation !== undefined) state.rotation = params.rotation
        // alpha 不受坐标系影响
        if (params.alpha !== undefined) state.alpha = params.alpha
    },

    interpolate(
        state: WriteableState,
        action: TweenTransformAction,
        progress: number,
        startState: WriteableState,
        context?: ActionHandlerContext
    ): void {
        const { params } = action

        // Fast path: 无 parent → 位置/姿态都可直接按原值插值
        if (!state.parentId || !context?.getObjectState) {
            if (params.x !== undefined && startState.x !== undefined) {
                state.x = lerp(startState.x, params.x, progress)
            }
            if (params.y !== undefined && startState.y !== undefined) {
                state.y = lerp(startState.y, params.y, progress)
            }
            if (params.scaleX !== undefined && startState.scaleX !== undefined) {
                state.scaleX = lerp(startState.scaleX, params.scaleX, progress)
            }
            if (params.scaleY !== undefined && startState.scaleY !== undefined) {
                state.scaleY = lerp(startState.scaleY, params.scaleY, progress)
            }
            if (params.rotation !== undefined && startState.rotation !== undefined) {
                state.rotation = lerp(startState.rotation, params.rotation, progress)
            }
            if (params.alpha !== undefined && startState.alpha !== undefined) {
                state.alpha = lerp(startState.alpha, params.alpha, progress)
            }
            return
        }

        // 有 parent:
        // - x/y 在全局空间插值，结果转回本地
        // - rotation/scale 在局部空间直接插值
        const getObj = context.getObjectState

        // 1. startState 本地 → 全局
        const startWorld = resolveWorldMatrix(startState, getObj)
        const startDecomp = decomposeMatrixForState(startWorld, startState)

        // 2. 位置在全局空间分量独立 lerp
        const globalResult: { x?: number; y?: number } = {}
        if (params.x !== undefined) {
            globalResult.x = lerp(startDecomp.x, params.x, progress)
        }
        if (params.y !== undefined) {
            globalResult.y = lerp(startDecomp.y, params.y, progress)
        }

        const basisState: WriteableState = { ...state }
        if (params.scaleX !== undefined && startState.scaleX !== undefined) {
            basisState.scaleX = lerp(startState.scaleX, params.scaleX, progress)
        }
        if (params.scaleY !== undefined && startState.scaleY !== undefined) {
            basisState.scaleY = lerp(startState.scaleY, params.scaleY, progress)
        }
        if (params.rotation !== undefined && startState.rotation !== undefined) {
            basisState.rotation = lerp(startState.rotation, params.rotation, progress)
        }

        // 3. 位置: 全局 → 本地
        const localPosition = globalToLocal(globalResult, basisState, getObj)
        if (localPosition.x !== undefined) state.x = localPosition.x
        if (localPosition.y !== undefined) state.y = localPosition.y
        if (params.scaleX !== undefined && basisState.scaleX !== undefined) state.scaleX = basisState.scaleX
        if (params.scaleY !== undefined && basisState.scaleY !== undefined) state.scaleY = basisState.scaleY
        if (params.rotation !== undefined && basisState.rotation !== undefined) state.rotation = basisState.rotation

        // alpha 直接 lerp（不受坐标系影响）
        if (params.alpha !== undefined && startState.alpha !== undefined) {
            state.alpha = lerp(startState.alpha, params.alpha, progress)
        }
    },

    getTargetState(state: WriteableState, action: TweenTransformAction): void {
        // 与 applyToState 相同
        this.applyToState(state, action)
    }
}
