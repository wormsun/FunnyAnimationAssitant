/**
 * CameraCut Action Handler
 * 处理相机瞬切
 */

import type { CameraCutAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const CameraCutHandler: ActionHandler<CameraCutAction> = {
    type: 'camera_cut',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: false,

    applyToState(state: WriteableState, action: CameraCutAction, _context?: ActionHandlerContext): void {
        const { params } = action

        state.x = params.x
        state.y = params.y
        state.zoom = params.zoom
    }
}
