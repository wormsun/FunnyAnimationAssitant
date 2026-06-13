/**
 * SetMaterial Action Handler (v16 新增)
 * 切换 SymbolObject 的当前素材
 */

import type { SetMaterialAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const SetMaterialHandler: ActionHandler<SetMaterialAction> = {
    type: 'set_material',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetMaterialAction, _context?: ActionHandlerContext): void {
        const { params } = action
        if (params.materialId !== undefined) {
            state.currentMaterialId = params.materialId
            // v18: 同时写入 refId，使 ExpressionObject 也能响应 set_material
            state.refId = params.materialId
        }
    }
}
