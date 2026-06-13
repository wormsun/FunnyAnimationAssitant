/**
 * Transform matrix utilities.
 *
 * Runtime hierarchy changes are represented by scene-level set_scene_structure
 * actions. This module keeps the shared matrix helpers used by hierarchy,
 * tween, and composite rendering code.
 */

import type { WriteableState } from '../types'

// ==================== 矩阵变换工具 ====================

/** 2D 仿射变换矩阵 [a, b, c, d, tx, ty] */
interface Transform2D {
    a: number   // scaleX * cos(rotation)
    b: number   // scaleX * sin(rotation)
    c: number   // -scaleY * sin(rotation)
    d: number   // scaleY * cos(rotation)
    tx: number  // x
    ty: number  // y
}

/**
 * 从 WriteableState 构建仿射矩阵
 * 变换顺序：Scale → Rotate → Translate
 */
export function buildTransformMatrix(state: WriteableState): Transform2D {
    const x = state.x ?? 0
    const y = state.y ?? 0
    const rawScaleX = state.scaleX ?? 1
    const scaleY = state.scaleY ?? 1
    const rotation = state.rotation ?? 0
    // v19.2: 将 flipX 烘焙到 scaleX（与 compositeTransform.ts 一致）
    const flipX = (state.flipX) ?? false
    const effScaleX = rawScaleX * (flipX ? -1 : 1)

    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const originX = state.transformOriginX ?? 0
    const originY = state.transformOriginY ?? 0
    const originPositionX = flipX ? -originX : originX
    const originPositionY = originY
    const a = effScaleX * cos
    const b = effScaleX * sin
    const c = -scaleY * sin
    const d = scaleY * cos

    return {
        a,
        b,
        c,
        d,
        tx: x + originPositionX - (a * originX + c * originY),
        ty: y + originPositionY - (b * originX + d * originY),
    }
}

/**
 * 矩阵乘法：parent * child → world
 */
export function multiplyMatrix(parent: Transform2D, child: Transform2D): Transform2D {
    return {
        a: parent.a * child.a + parent.c * child.b,
        b: parent.b * child.a + parent.d * child.b,
        c: parent.a * child.c + parent.c * child.d,
        d: parent.b * child.c + parent.d * child.d,
        tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
        ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
    }
}

/**
 * 矩阵求逆
 */
export function invertMatrix(m: Transform2D): Transform2D {
    const det = m.a * m.d - m.b * m.c
    if (Math.abs(det) < 1e-10) {
        // 奇异矩阵（缩放为 0），返回恒等矩阵
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

/**
 * 从仿射矩阵提取 x, y, scaleX, scaleY, rotation
 *
 * v19.2: 当 det < 0（反射）时，负号放到 scaleX 上，旋转角用 atan2(-b, -a) 修正。
 * 这避免将纯 X 翻转误解为 180° 旋转（atan2(0, -1) = π 的陷阱）。
 * 与 compositeTransform.ts 的 decomposeMatrix 保持一致。
 */
export function decomposeMatrix(m: Transform2D): {
    x: number; y: number; scaleX: number; scaleY: number; rotation: number
} {
    const x = m.tx
    const y = m.ty
    const scaleXRaw = Math.sqrt(m.a * m.a + m.b * m.b)
    const scaleY = Math.sqrt(m.c * m.c + m.d * m.d)
    const det = m.a * m.d - m.b * m.c

    let scaleX: number
    let rotation: number

    if (det < 0) {
        // 负行列式 = 反射（flipX），将负号放在 scaleX 上
        scaleX = -scaleXRaw
        // atan2(b, a) 在 a<0 时会多出 π（将 flipX 误解为 180° 旋转）
        // 用 atan2(-b, -a) 补偿
        rotation = Math.atan2(-m.b, -m.a)
    } else {
        scaleX = scaleXRaw
        rotation = Math.atan2(m.b, m.a)
    }

    return { x, y, scaleX, scaleY, rotation }
}

/**
 * 将渲染矩阵拆回 WriteableState 坐标。
 *
 * buildTransformMatrix 与 SceneObjectRenderer 一样会把 transformOriginX/Y
 * 转成 PIXI pivot + position 补偿；直接 decomposeMatrix 会把补偿后的 tx/ty
 * 当作 state.x/y，导致 renderer 再补偿一次。这里按同一公式反解回 state 坐标。
 */
export function decomposeMatrixForState(
    m: Transform2D,
    state: WriteableState
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number } {
    const decomposed = decomposeMatrix(m)
    const originX = state.transformOriginX ?? 0
    const originY = state.transformOriginY ?? 0
    if (originX === 0 && originY === 0) {
        return decomposed
    }

    const flipX = decomposed.scaleX < 0
    const cos = Math.cos(decomposed.rotation)
    const sin = Math.sin(decomposed.rotation)
    const a = decomposed.scaleX * cos
    const b = decomposed.scaleX * sin
    const c = -decomposed.scaleY * sin
    const d = decomposed.scaleY * cos
    const originPositionX = flipX ? -originX : originX
    const originPositionY = originY

    return {
        ...decomposed,
        x: m.tx - originPositionX + (a * originX + c * originY),
        y: m.ty - originPositionY + (b * originX + d * originY),
    }
}

/**
 * 递归计算对象的世界变换矩阵
 * 沿 parentId 链向上遍历，逐层组合变换
 */
export function resolveWorldMatrix(
    state: WriteableState,
    getObjectState: (id: string) => WriteableState | undefined
): Transform2D {
    const localMatrix = buildTransformMatrix(state)

    if (!state.parentId) {
        return localMatrix
    }

    const parentState = getObjectState(state.parentId)
    if (!parentState) {
        return localMatrix
    }

    const parentWorldMatrix = resolveWorldMatrix(parentState, getObjectState)
    return multiplyMatrix(parentWorldMatrix, localMatrix)
}

// This module now only exports matrix utilities. Runtime parent changes are
// represented by scene-level set_scene_structure actions, not object-level handlers.
