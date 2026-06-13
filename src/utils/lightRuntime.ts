/**
 * lightRuntime — 光源运行时求值器
 *
 * Phase 2: 基于简化参数（flicker/flickerSpeed）驱动动态闪烁效果。
 * Phase 3: 传递方向性参数（directionMode/directionAngle/coneAngle）。
 *
 * 设计原则：
 * - 纯函数，无副作用，无状态
 * - 相同输入永远返回相同输出（相同 timeMs 下确定性）
 * - flicker=0 时短路返回静态值（零开销）
 */

import type { LightObject } from '@/types/sceneObject'

export interface EvaluatedLight {
    /** 光源 X 坐标 */
    x: number
    /** 光源 Y 坐标（含闪烁微抖动） */
    y: number
    /** 动态强度 */
    intensity: number
    /** 动态半径 */
    radius: number
    /** 光照颜色 (hex) */
    color: string
    /** 发光模式 */
    directionMode: 'omni' | 'cone'
    /** 方向角（弧度） */
    directionAngle: number
    /** 扇形开角（角度制） */
    coneAngle: number
    /** 边缘柔化（内部固定值） */
    softness: number
}

/** @deprecated 兼容别名，请使用 EvaluatedLight */
export type EvaluatedPointLight = EvaluatedLight

/**
 * 类型守卫：判断 lightType 是否为位置光源（point 或 spot）
 * 用于在渲染管线中统一过滤需要 GPU 计算的光源
 */
export function isPointLikeLight(light: { lightType: string }): boolean {
    return light.lightType === 'point' || light.lightType === 'spot'
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

/**
 * 从 object id 生成稳定的相位偏移，让多个光源闪烁不同步
 * 使用乘法散列（hash = hash * 31 + charCode）提高分散度，
 * 避免结构化 ID（如 sceneobject_01 vs sceneobject_10）产生相同偏移
 */
function stablePhase(id: string): number {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0
    }
    return Math.abs(hash) * 10.0
}

/**
 * 评估光源在给定时刻的动态状态
 *
 * @param light - 光源对象（含基础参数 + 闪烁/方向性参数）
 * @param timeMs - 当前时间（毫秒），通常为 Date.now() 或虚拟时钟
 * @returns 经过闪烁计算后的运行时光源状态
 */
export function evaluateLight(light: LightObject, timeMs: number): EvaluatedLight {
    return evaluatePointLight(light, timeMs)
}

/** @deprecated 兼容别名，请使用 evaluateLight */
export function evaluatePointLight(light: LightObject, timeMs: number): EvaluatedLight {
    const baseIntensity = light.lightIntensity ?? 1.0
    const baseRadius = light.lightRadius ?? 500
    const baseX = light.x ?? 0
    const baseY = light.y ?? 0
    const flicker = light.flicker ?? 0
    const color = light.lightColor ?? '#ffffff'

    // flicker=0 短路：完全静态，跳过所有噪声计算
    if (flicker <= 0) {
        return {
            x: baseX,
            y: baseY,
            intensity: baseIntensity,
            radius: baseRadius,
            color,
            directionMode: light.directionMode ?? 'omni',
            directionAngle: light.directionAngle ?? 0,
            coneAngle: light.coneAngle ?? 100,
            softness: 0.35,
        }
    }

    // --- 闪烁计算 ---

    const timeSec = timeMs / 1000
    const phase = stablePhase(light.id)
    const speed = lerp(0.8, 4.0, light.flickerSpeed ?? 0.35)

    // 双层正弦波叠加（PRD §7.6）
    const baseSin = Math.sin((timeSec * speed + phase) * Math.PI * 2)
    const detailSin = Math.sin((timeSec * speed * 2.37 + phase * 1.73) * Math.PI * 2)
    const rawSignal = baseSin * 0.72 + detailSin * 0.28
    const flickerSignal = Math.max(-1, Math.min(1, rawSignal))

    // flicker 缩放因子（PRD §7.4）
    const intensityAmount = flicker * 0.18
    const radiusAmount = flicker * 0.08
    const positionJitterY = flicker * 3

    // PRD §7.8: 颜色偏暖（仅在 flickerSignal > 0 时轻微偏移）
    // normalizedSignal: 0~1，表示偏暖程度
    const normalizedSignal = Math.max(0, flickerSignal)
    const colorShiftAmount = flicker * 0.06  // 最大偏移幅度
    const shiftedColor = shiftColorWarmer(color, normalizedSignal * colorShiftAmount)

    return {
        x: baseX,
        y: baseY + flickerSignal * positionJitterY,
        intensity: Math.max(0, baseIntensity * (1 + flickerSignal * intensityAmount)),
        radius: Math.max(1, baseRadius * (1 + flickerSignal * radiusAmount)),
        color: shiftedColor,
        directionMode: light.directionMode ?? 'omni',
        directionAngle: light.directionAngle ?? 0,
        coneAngle: light.coneAngle ?? 100,
        softness: 0.35,
    }
}

/**
 * 将 hex 颜色轻微偏暖：提升 R、降低 B，G 保持不变
 * @param hex - '#rrggbb' 格式
 * @param amount - 偏移量 0~1（0=无偏移，1=最大偏移）
 */
function shiftColorWarmer(hex: string, amount: number): string {
    if (amount <= 0) return hex
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)

    // R 上移，B 下移，幅度很小（最大 ±15/255 ≈ 6%）
    const shift = Math.round(amount * 15)
    const nr = Math.min(255, r + shift)
    const nb = Math.max(0, b - shift)

    const toHex = (v: number): string => v.toString(16).padStart(2, '0')
    return `#${toHex(nr)}${toHex(g)}${toHex(nb)}`
}
