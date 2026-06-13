/**
 * SetVisual Action Handler (v9.3 新增)
 * 处理视觉属性变换：visible, flipX, zIndex
 * 
 * 与 set_transform 和 tween_transform 可共存
 */

import type { SetVisualAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const SetVisualHandler: ActionHandler<SetVisualAction> = {
    type: 'set_visual',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetVisualAction, _context?: ActionHandlerContext): void {
        const { params } = action

        // 视觉属性
        if (params.visible !== undefined) state.visible = params.visible
        if (params.flipX !== undefined) state.flipX = params.flipX
        if (params.zIndex !== undefined) state.zIndex = params.zIndex
        if (params.receiveLighting !== undefined) state.receiveLighting = params.receiveLighting
        if (params.castShadow !== undefined) state.castShadow = params.castShadow
    }
}
