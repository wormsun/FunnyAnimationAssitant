/**
 * 全局坐标 ↔ 本地坐标转换工具
 * v17: 为全局坐标方案提供统一的坐标系转换函数
 *
 * 矩阵工具函数（resolveWorldMatrix / invertMatrix / decomposeMatrix / buildTransformMatrix）
 * 定义在 SetParentHandler.ts 中并 export，本模块在此基础上封装高层转换接口。
 */

import {
    buildTransformMatrix,
    decomposeMatrixForState,
    resolveWorldMatrix,
} from './handlers/SetParentHandler'
import type { WriteableState } from './types'

/**
 * 将全局坐标转换为 state 当前 parent 下的本地坐标
 *
 * - state.parentId 为空时：全局 = 本地，直接返回原值
 * - state.parentId 有值时：通过 parent 链世界矩阵的逆矩阵转换
 *
 * @param globalParams 全局坐标参数（部分属性可选）
 * @param state 目标对象的当前运行时状态（需包含 parentId）
 * @param getObjectState 查询对象状态的回调
 * @returns 转换后的本地坐标参数
 */
export function globalToLocal(
    globalParams: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number },
    state: WriteableState,
    getObjectState?: (id: string) => WriteableState | undefined
): { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number } {
    // Fast path: 无 parent → 全局坐标 = 本地坐标
    if (!state.parentId || !getObjectState) {
        return globalParams
    }

    const parentState = getObjectState(state.parentId)
    if (!parentState) {
        return globalParams
    }

    const parentWorldMatrix = resolveWorldMatrix(parentState, getObjectState)
    const invParent = invertMatrix(parentWorldMatrix)

    // 关键修复：对缺失的 globalParams，使用 state 当前本地值的全局等价值作为 fallback
    // 避免将全局参数与本地参数混入同一矩阵
    const currentWorldMatrix = resolveWorldMatrix(state, getObjectState)
    const currentGlobal = decomposeMatrixForState(currentWorldMatrix, state)

    const globalMatrixState: WriteableState = {
        x: globalParams.x ?? currentGlobal.x,
        y: globalParams.y ?? currentGlobal.y,
        scaleX: globalParams.scaleX ?? currentGlobal.scaleX,
        scaleY: globalParams.scaleY ?? currentGlobal.scaleY,
        rotation: globalParams.rotation ?? currentGlobal.rotation,
    }
    if (state.flipX !== undefined) globalMatrixState.flipX = state.flipX
    if (state.transformOriginX !== undefined) globalMatrixState.transformOriginX = state.transformOriginX
    if (state.transformOriginY !== undefined) globalMatrixState.transformOriginY = state.transformOriginY

    const globalMatrix = buildTransformMatrix(globalMatrixState)

    const localMatrix = multiplyMatrix(invParent, globalMatrix)
    const local = decomposeMatrixForState(localMatrix, state)

    // 仅返回 globalParams 中明确提供的属性
    const result: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number } = {}
    if (globalParams.x !== undefined) result.x = local.x
    if (globalParams.y !== undefined) result.y = local.y
    if (globalParams.scaleX !== undefined) result.scaleX = local.scaleX
    if (globalParams.scaleY !== undefined) result.scaleY = local.scaleY
    if (globalParams.rotation !== undefined) result.rotation = local.rotation
    return result
}

/**
 * 将 state 的本地坐标解析为全局坐标
 *
 * @param state 包含本地坐标的对象状态
 * @param getObjectState 查询对象状态的回调
 * @returns 全局坐标的几何属性
 */
export function localToGlobal(
    state: WriteableState,
    getObjectState?: (id: string) => WriteableState | undefined
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number } {
    if (!state.parentId || !getObjectState) {
        return {
            x: state.x ?? 0,
            y: state.y ?? 0,
            scaleX: state.scaleX ?? 1,
            scaleY: state.scaleY ?? 1,
            rotation: state.rotation ?? 0,
        }
    }

    const worldMatrix = resolveWorldMatrix(state, getObjectState)
    return decomposeMatrixForState(worldMatrix, state)
}

// ==================== 内部矩阵工具 ====================
// multiplyMatrix 和 invertMatrix 在 SetParentHandler 中未 export
// 为避免修改 SetParentHandler 的导出列表，此处复制实现

/** 2D 仿射变换矩阵 */
interface Transform2D {
    a: number
    b: number
    c: number
    d: number
    tx: number
    ty: number
}

function multiplyMatrix(parent: Transform2D, child: Transform2D): Transform2D {
    return {
        a: parent.a * child.a + parent.c * child.b,
        b: parent.b * child.a + parent.d * child.b,
        c: parent.a * child.c + parent.c * child.d,
        d: parent.b * child.c + parent.d * child.d,
        tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
        ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
    }
}

function invertMatrix(m: Transform2D): Transform2D {
    const det = m.a * m.d - m.b * m.c
    if (Math.abs(det) < 1e-10) {
        return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
    }
    const invDet = 1 / det
    return {
        a: m.d * invDet,
        b: -m.b * invDet,
        c: -m.c * invDet,
        d: m.a * invDet,
        tx: (m.c * m.ty - m.d * m.tx) * invDet,
        ty: (m.b * m.tx - m.a * m.ty) * invDet,
    }
}
