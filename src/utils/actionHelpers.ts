/**
 * Action 工具函数
 * 提供语义化的 Action 类型判断，提高代码可读性
 * 
 * v9.3: 生命周期判断改用 SetLifecycleAction
 */

import type { Action, SetLifecycleAction } from '@/types/screenplay'

// ==================== 生命周期 Action 判断 ====================

/**
 * 判断是否为出生 Action (Birth Action)
 * 
 * v9.3: 使用 set_lifecycle action 判断出生
 * 当 set_lifecycle action 包含 spawned: true 时，表示对象在此时刻"出生"进入场景。
 * 
 * @param action - 要判断的 Action
 * @returns 如果是出生 Action 返回 true
 * 
 * @example
 * ```ts
 * if (isBirthAction(action)) {
 *   // 显示 🌱 图标
 * }
 * ```
 */
export function isBirthAction(action: Action): action is SetLifecycleAction {
    if (action.type !== 'set_lifecycle') return false
    return action.params.spawned === true
}

/**
 * 判断是否为死亡 Action (Death Action)
 * 
 * v9.3: 使用 set_lifecycle action 判断消亡
 * 当 set_lifecycle action 包含 spawned: false 时，表示对象在此时刻"消亡"退出场景。
 * 
 * @param action - 要判断的 Action
 * @returns 如果是死亡 Action 返回 true
 * 
 * @example
 * ```ts
 * if (isDeathAction(action)) {
 *   // 显示 🍂 图标
 * }
 * ```
 */
export function isDeathAction(action: Action): action is SetLifecycleAction {
    if (action.type !== 'set_lifecycle') return false
    return action.params.spawned === false
}

/**
 * 判断是否为生命周期 Action (Birth 或 Death)
 * 
 * @param action - 要判断的 Action
 * @returns 如果是生命周期相关的 Action 返回 true
 */
export function isLifecycleAction(action: Action): action is SetLifecycleAction {
    return isBirthAction(action) || isDeathAction(action)
}

// ==================== 几何变换 Action 判断 ====================

/**
 * 判断 set_transform action 是否包含几何属性变化
 * 
 * 几何属性包括：x, y, scaleX, scaleY, rotation
 * 用于检测与 tween_transform 的互斥冲突。
 * 
 * @param action - 要判断的 Action
 * @returns 如果包含几何属性返回 true
 */
export function hasGeometryParams(action: Action): boolean {
    if (action.type !== 'set_transform') return false
    const params = action.params
    return (
        params.x !== undefined ||
        params.y !== undefined ||
        params.scaleX !== undefined ||
        params.scaleY !== undefined ||
        params.rotation !== undefined
    )
}

// ==================== 生命周期 Action 图标 ====================

/** 出生 Action 图标 - 种子/萌芽🌱 */
export const BIRTH_ACTION_ICON = '🌱'

/** 死亡 Action 图标 - 凋零/落叶🍂 */
export const DEATH_ACTION_ICON = '🍂'
