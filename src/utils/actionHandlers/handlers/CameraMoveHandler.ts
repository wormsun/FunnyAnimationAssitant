/**
 * CameraMove Action Handler
 * 处理相机平滑移动
 */

import type { CameraMoveAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

/**
 * 线性插值
 */
function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

export const CameraMoveHandler: ActionHandler<CameraMoveAction> = {
    type: 'camera_move',
    isPointAction: false,
    isDurationAction: true,
    affectsObjectState: false,

    applyToState(state: WriteableState, action: CameraMoveAction, _context?: ActionHandlerContext): void {
        const { params } = action

        if (params.x !== undefined) state.x = params.x
        if (params.y !== undefined) state.y = params.y
        if (params.zoom !== undefined) state.zoom = params.zoom
    },

    interpolate(
        state: WriteableState,
        action: CameraMoveAction,
        progress: number,
        startState: WriteableState
    ): void {
        const { params } = action

        if (params.x !== undefined && startState.x !== undefined) {
            state.x = lerp(startState.x, params.x, progress)
        }
        if (params.y !== undefined && startState.y !== undefined) {
            state.y = lerp(startState.y, params.y, progress)
        }
        if (params.zoom !== undefined && startState.zoom !== undefined) {
            state.zoom = lerp(startState.zoom, params.zoom, progress)
        }
    },

    getTargetState(state: WriteableState, action: CameraMoveAction): void {
        this.applyToState(state, action)
    }
}
