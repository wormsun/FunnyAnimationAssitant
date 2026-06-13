/**
 * SetTransform Action Handler (v9.3 更新)
 * 处理几何属性变换：x, y, scaleX, scaleY, rotation, alpha
 * 
 * v17/v27:
 * - x/y 按全局坐标存储，applyToState 时转为当前 parent 下的本地坐标
 * - rotation/scale/transformOrigin 按对象自身局部值存储和应用
 * 
 * 注意：visible/flipX/zIndex 已移至 SetVisualHandler
 *       spawned 已移至 SetLifecycleHandler
 */

import type { SetTransformAction } from '@/types/screenplay'

import { globalToLocal } from '../matrixUtils'
import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

function applyTransformOriginCompensation(state: WriteableState, nextOriginX: number, nextOriginY: number): void {
    const prevOriginX = state.transformOriginX ?? 0
    const prevOriginY = state.transformOriginY ?? 0
    const deltaOffsetX = nextOriginX - prevOriginX
    const deltaOffsetY = nextOriginY - prevOriginY

    if (Math.abs(deltaOffsetX) < 0.01 && Math.abs(deltaOffsetY) < 0.01) {
        return
    }

    const rotation = state.rotation ?? 0
    const flipSign = (state.flipX ?? false) ? -1 : 1
    const effectiveSx = (state.scaleX ?? 1) * flipSign
    const sy = state.scaleY ?? 1
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    const adjustX = deltaOffsetX * (effectiveSx * cos - flipSign) - deltaOffsetY * sy * sin
    const adjustY = deltaOffsetX * effectiveSx * sin + deltaOffsetY * (sy * cos - 1)

    if (Math.abs(adjustX) > 0.01) {
        state.x = (state.x ?? 0) + adjustX
    }
    if (Math.abs(adjustY) > 0.01) {
        state.y = (state.y ?? 0) + adjustY
    }
}

export const SetTransformHandler: ActionHandler<SetTransformAction> = {
    type: 'set_transform',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetTransformAction, context?: ActionHandlerContext): void {
        const { params } = action

        // 仅位置使用全局 → 本地转换；姿态类参数保持局部语义
        const positionParams: { x?: number; y?: number } = {}
        if (params.x !== undefined) positionParams.x = params.x
        if (params.y !== undefined) positionParams.y = params.y
        const coordinateBasis: WriteableState = {
            ...state,
            ...(params.scaleX !== undefined ? { scaleX: params.scaleX } : {}),
            ...(params.scaleY !== undefined ? { scaleY: params.scaleY } : {}),
            ...(params.rotation !== undefined ? { rotation: params.rotation } : {}),
            ...(params.transformOriginX !== undefined ? { transformOriginX: params.transformOriginX } : {}),
            ...(params.transformOriginY !== undefined ? { transformOriginY: params.transformOriginY } : {}),
        }
        const localPosition = globalToLocal(positionParams, coordinateBasis, context?.getObjectState)

        // 几何属性 (v9.3: 仅处理几何变换和透明度)
        if (localPosition.x !== undefined) state.x = localPosition.x
        if (localPosition.y !== undefined) state.y = localPosition.y
        if (params.scaleX !== undefined) state.scaleX = params.scaleX
        if (params.scaleY !== undefined) state.scaleY = params.scaleY
        if (params.rotation !== undefined) state.rotation = params.rotation
        // alpha 不受坐标系影响
        if (params.alpha !== undefined) state.alpha = params.alpha
        // 当 action 只是移动变换点时，做一次瞬时位置补偿，避免单独拖 pivot
        // 影响对象当下的视觉摆放。若同一 action 还包含旋转/缩放，则应围绕新
        // 变换点产生可见变化；若包含 x/y，则显式位置本身就是最终约束。
        const hasOriginOverride = params.transformOriginX !== undefined || params.transformOriginY !== undefined
        const hasExplicitPosition = localPosition.x !== undefined || localPosition.y !== undefined
        const hasOriginDrivenTransform =
            params.rotation !== undefined ||
            params.scaleX !== undefined ||
            params.scaleY !== undefined
        if (hasOriginOverride && !hasExplicitPosition && !hasOriginDrivenTransform) {
            applyTransformOriginCompensation(
                state,
                params.transformOriginX ?? (state.transformOriginX ?? 0),
                params.transformOriginY ?? (state.transformOriginY ?? 0),
            )
        }
        // 变换原点覆盖（像素偏移，不受坐标系影响）
        if (params.transformOriginX !== undefined) state.transformOriginX = params.transformOriginX
        if (params.transformOriginY !== undefined) state.transformOriginY = params.transformOriginY
    }
}
