/**
 * Composite 坐标变换工具
 *
 * v2.0.0 方案 A: 保持视觉不变（Preserve Visual Appearance）
 *
 * 对象加入/脱离 composite 时，同时转换 position、scale、rotation，
 * 使对象的全局视觉表现不发生任何变化。
 *
 * v19.2: 使用矩阵分解代替简化公式，正确处理 flipX 翻转场景。
 * 当 parent.flipX=true 时，PIXI scaleX 为负值，简化公式的
 * position / rotation 计算均不正确。矩阵方案统一处理所有情况。
 */

/** 变换所需的最小接口 */
interface TransformData {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    flipX?: boolean
    transformOriginX?: number
    transformOriginY?: number
}

// ==================== 内部矩阵工具 ====================

/** 2D 仿射变换矩阵 */
interface Transform2D {
    a: number   // effScaleX * cos(rotation)
    b: number   // effScaleX * sin(rotation)
    c: number   // -scaleY * sin(rotation)
    d: number   // scaleY * cos(rotation)
    tx: number  // x
    ty: number  // y
}

/** 从 TransformData 构建仿射矩阵（flipX 烘焙到 scaleX） */
function buildMatrix(t: TransformData): Transform2D {
    const effScaleX = t.scaleX * (t.flipX ? -1 : 1)
    const cos = Math.cos(t.rotation)
    const sin = Math.sin(t.rotation)
    const originX = t.transformOriginX ?? 0
    const originY = t.transformOriginY ?? 0
    const originPositionX = t.flipX ? -originX : originX
    const originPositionY = originY
    const a = effScaleX * cos
    const b = effScaleX * sin
    const c = -t.scaleY * sin
    const d = t.scaleY * cos

    return {
        a,
        b,
        c,
        d,
        tx: t.x + originPositionX - (a * originX + c * originY),
        ty: t.y + originPositionY - (b * originX + d * originY),
    }
}

/** 矩阵乘法 */
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

/** 矩阵求逆 */
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

/**
 * 从仿射矩阵分解出 scaleX, scaleY, rotation
 *
 * 矩阵 = R(θ) * S(sx, sy)，其中 sx 可为负（flipX）。
 * 当 det < 0（反射）时，负号放到 scaleX 上，旋转角用 atan2(-b, -a) 修正。
 * 这避免将纯 X 翻转误解为 180° 旋转（atan2(0, -1) = π 的陷阱）。
 */
function decomposeMatrix(m: Transform2D): {
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
        // 用 atan2(-b, -a) 补偿：a = sx*cosθ, b = sx*sinθ，
        // 当 sx<0 时 -b/(-sx)=sinθ, -a/(-sx)=cosθ → atan2(-b,-a)=θ
        rotation = Math.atan2(-m.b, -m.a)
    } else {
        scaleX = scaleXRaw
        rotation = Math.atan2(m.b, m.a)
    }

    return { x, y, scaleX, scaleY, rotation }
}

function decomposeMatrixForTransform(m: Transform2D, t: TransformData): {
    x: number; y: number; scaleX: number; scaleY: number; rotation: number
} {
    const decomposed = decomposeMatrix(m)
    const originX = t.transformOriginX ?? 0
    const originY = t.transformOriginY ?? 0
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
 * 全局坐标 → 局部坐标（attach 时使用）
 *
 * 将子对象的全局变换转换为相对于 parent 的局部变换，
 * 保持子对象的全局视觉表现不变。
 *
 * v19.2: 使用矩阵分解正确处理 parent.flipX，
 * 返回值的 flipX 表示附加后子对象的 flipX 应设为该值。
 */
export function globalToLocal(child: TransformData, parent: TransformData): TransformData {
    const childMatrix = buildMatrix(child)
    const parentMatrix = buildMatrix(parent)
    const invParent = invertMatrix(parentMatrix)
    const localMatrix = multiplyMatrix(invParent, childMatrix)
    const decomposed = decomposeMatrixForTransform(localMatrix, child)

    // decomposeMatrix 只能标记 scaleY 为负来表达反射，
    // 但我们的数据模型要求 scaleX/scaleY 均 >=0，flipX 单独标记。
    // 行列式符号变化 = parent 和 child 的 flipX 不同（XOR）
    const parentFlip = parent.flipX ?? false
    const childFlip = child.flipX ?? false
    const localFlip = parentFlip !== childFlip

    return {
        x: decomposed.x,
        y: decomposed.y,
        scaleX: Math.abs(decomposed.scaleX),
        scaleY: Math.abs(decomposed.scaleY),
        rotation: decomposed.rotation,
        flipX: localFlip,
    }
}

/**
 * 局部坐标 → 全局坐标（detach 时使用）
 *
 * 将子对象的局部变换恢复为全局变换，
 * 保持子对象的全局视觉表现不变。
 *
 * v19.2: 使用矩阵分解正确处理 parent.flipX，
 * 返回值的 flipX 表示脱离后子对象的 flipX 应设为该值。
 */
export function localToGlobal(child: TransformData, parent: TransformData): TransformData {
    const childMatrix = buildMatrix(child)
    const parentMatrix = buildMatrix(parent)
    const globalMatrix = multiplyMatrix(parentMatrix, childMatrix)
    const decomposed = decomposeMatrixForTransform(globalMatrix, child)

    // 同 globalToLocal：XOR 恢复全局 flipX
    const parentFlip = parent.flipX ?? false
    const childFlip = child.flipX ?? false
    const globalFlip = parentFlip !== childFlip

    return {
        x: decomposed.x,
        y: decomposed.y,
        scaleX: Math.abs(decomposed.scaleX),
        scaleY: Math.abs(decomposed.scaleY),
        rotation: decomposed.rotation,
        flipX: globalFlip,
    }
}
