/**
 * SetScreenEffect Action Handler (Phase 1)
 * 处理画面特效参数的瞬时设置
 * 直接操作 state.params 嵌套结构（消除 flat state 中间层）
 */

import type { ScreenEffectParams } from '@/types/sceneObject'
import type { SetScreenEffectAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const SetScreenEffectHandler: ActionHandler<SetScreenEffectAction> = {
    type: 'set_screen_effect',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetScreenEffectAction, _context?: ActionHandlerContext): void {
        const { params } = action
        state.params ??= {} as ScreenEffectParams
        const p = state.params

        // 覆盖型参数 (coverOpacity 已删除，统一由 alpha 控制)
        if (params.baseColor !== undefined) p.baseColor = params.baseColor

        // 孔洞参数
        if (params.holeShape !== undefined) p.holeShape = params.holeShape
        if (params.holeCenterX !== undefined) p.holeCenterX = params.holeCenterX
        if (params.holeCenterY !== undefined) p.holeCenterY = params.holeCenterY
        if (params.holeWidth !== undefined) p.holeWidth = params.holeWidth
        if (params.holeHeight !== undefined) p.holeHeight = params.holeHeight
        if (params.openRatio !== undefined) p.openRatio = params.openRatio
        if (params.feather !== undefined) p.feather = params.feather

        // 跟随参数
        if (params.targetId !== undefined) p.targetId = params.targetId
        if (params.offsetX !== undefined) p.offsetX = params.offsetX
        if (params.offsetY !== undefined) p.offsetY = params.offsetY
    }
}
