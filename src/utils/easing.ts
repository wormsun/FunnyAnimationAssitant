/**
 * Easing Functions Library
 * 缓动函数库，支持 Animation 系统的各种缓动效果
 */

import type { EasingType } from '@/types/animation'

/**
 * 缓动函数类型
 */
export type EasingFunction = (t: number) => number

/**
 * 线性缓动
 */
export function linear(t: number): number {
    return t
}

/**
 * 阶跃缓动 (Step)
 * 保持起始值直到结束，适用于离散状态切换
 */
export function step(_t: number): number {
    // 始终返回 0，表示保持起始值
    // 插值结果: start + (end - start) * 0 = start
    return 0
}

/**
 * 二次方缓动 - 加速
 */
export function easeInQuad(t: number): number {
    return t * t
}

/**
 * 二次方缓动 - 减速
 */
export function easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t)
}

/**
 * 二次方缓动 - 加速减速
 */
export function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * 三次方缓动 - 加速
 */
export function easeInCubic(t: number): number {
    return t * t * t
}

/**
 * 三次方缓动 - 减速
 */
export function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
}

/**
 * 三次方缓动 - 加速减速
 */
export function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * 正弦缓动 - 加速
 */
export function easeInSine(t: number): number {
    return 1 - Math.cos((t * Math.PI) / 2)
}

/**
 * 正弦缓动 - 减速
 */
export function easeOutSine(t: number): number {
    return Math.sin((t * Math.PI) / 2)
}

/**
 * 正弦缓动 - 加速减速
 */
export function easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2
}

/**
 * 弹性缓动 - 加速
 */
export function easeInElastic(t: number): number {
    const c4 = (2 * Math.PI) / 3
    return t === 0
        ? 0
        : t === 1
            ? 1
            : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4)
}

/**
 * 弹性缓动 - 减速
 */
export function easeOutElastic(t: number): number {
    const c4 = (2 * Math.PI) / 3
    return t === 0
        ? 0
        : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/**
 * 弹性缓动 - 加速减速
 */
export function easeInOutElastic(t: number): number {
    const c5 = (2 * Math.PI) / 4.5
    return t === 0
        ? 0
        : t === 1
            ? 1
            : t < 0.5
                ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
                : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1
}

/**
 * 弹跳缓动 - 加速
 */
export function easeInBounce(t: number): number {
    return 1 - easeOutBounce(1 - t)
}

/**
 * 弹跳缓动 - 减速
 */
export function easeOutBounce(t: number): number {
    const n1 = 7.5625
    const d1 = 2.75

    if (t < 1 / d1) {
        return n1 * t * t
    } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
}

/**
 * 弹跳缓动 - 加速减速
 */
export function easeInOutBounce(t: number): number {
    return t < 0.5
        ? (1 - easeOutBounce(1 - 2 * t)) / 2
        : (1 + easeOutBounce(2 * t - 1)) / 2
}

/**
 * 简化的 easeIn (使用二次方)
 */
export function easeIn(t: number): number {
    return easeInQuad(t)
}

/**
 * 简化的 easeOut (使用二次方)
 */
export function easeOut(t: number): number {
    return easeOutQuad(t)
}

/**
 * 简化的 easeInOut (使用二次方)
 */
export function easeInOut(t: number): number {
    return easeInOutQuad(t)
}

/**
 * 缓动函数映射表
 */
const easingFunctions: Record<EasingType, EasingFunction> = {
    linear,
    step,
    easeIn,
    easeOut,
    easeInOut,
    easeInQuad,
    easeOutQuad,
    easeInOutQuad,
    easeInCubic,
    easeOutCubic,
    easeInOutCubic,
    easeInSine,
    easeOutSine,
    easeInOutSine,
    easeInElastic,
    easeOutElastic,
    easeInOutElastic,
    easeInBounce,
    easeOutBounce,
    easeInOutBounce,
}

/**
 * 获取缓动函数
 */
export function getEasingFunction(type: EasingType): EasingFunction {
    return easingFunctions[type] ?? linear
}

/**
 * 应用缓动函数
 * @param t 归一化时间 (0-1)
 * @param easing 缓动类型
 */
export function applyEasing(t: number, easing: EasingType = 'linear'): number {
    const fn = getEasingFunction(easing)
    return fn(Math.max(0, Math.min(1, t)))
}

/**
 * 线性插值
 */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}
