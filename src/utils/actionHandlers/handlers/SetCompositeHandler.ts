/**
 * SetComposite Action Handler (P2)
 * 处理组合对象自身属性变更：compositeMode、renderChain 排序等
 *
 * 遵循"字段族合一"设计模式（类比 SetVisualHandler 合并 visible/flipX/zIndex），
 * 将 composite 特有属性统一到一个 Action 类型中。
 *
 * 用法：
 * - set_composite { compositeMode: "entity" } → 切换组合模式
 * - set_composite { renderChain: ["B", "A", "C"] } → 修改渲染链排序
 */

import type { SetCompositeAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

export const SetCompositeHandler: ActionHandler<SetCompositeAction> = {
    type: 'set_composite',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetCompositeAction, _context?: ActionHandlerContext): void {
        const { params } = action

        if (params.compositeMode !== undefined) state.compositeMode = params.compositeMode
        if (params.renderChain !== undefined) state.renderChain = [...params.renderChain]
    },
}

