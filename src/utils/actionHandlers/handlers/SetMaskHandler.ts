/**
 * SetMask Action Handler — Clip-Mask Phase 1
 *
 * 处理蒙版对象自身属性变更：targetIds、shape、width、height
 * 不处理 mode（Phase 1 锁定 inside_visible）
 * 不处理 transform/视觉字段（走 set_transform / set_visual）
 *
 * 部分更新语义：未提供的字段保持不变。
 *
 * 注意：本 Handler 内部 *不* 解决多 mask 同 target 的独占冲突。
 * 同 slot 内的归并 + 全局 reverse-index 裁决在 sceneStateCalculator 的
 * mask post-pass 中完成（见 doc-prd/clip-mask-implementation-plan.md §3 D1.5）。
 *
 * 用法：
 * - set_mask { shape: 'ellipse' }
 * - set_mask { targetIds: ['propA', 'propB'] }
 * - set_mask { width: 640, height: 180 }
 */

import type { SetMaskAction } from '@/types/screenplay'

import type { ActionHandler, WriteableState } from '../types'

export const SetMaskHandler: ActionHandler<SetMaskAction> = {
    type: 'set_mask',
    isPointAction: true,
    isDurationAction: false,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: SetMaskAction): void {
        const { params } = action

        if (params.targetIds !== undefined) {
            // 整段替换（不做去重 / 类型校验 — 由 ActionEditor 写入侧 + 反序列化守卫保证）
            state.targetIds = [...params.targetIds]
        }
        if (params.shape !== undefined) {
            state.shape = params.shape
        }
        if (params.width !== undefined && Number.isFinite(params.width) && params.width > 0) {
            state.width = params.width
        }
        if (params.height !== undefined && Number.isFinite(params.height) && params.height > 0) {
            state.height = params.height
        }
    },
}
