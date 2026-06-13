/**
 * Action Handler 注册表
 * v8.6 P2: 统一 Action 处理逻辑
 */

import type { Action } from '@/types/screenplay'

import type { ActionHandler, ActionType } from './types'

/**
 * Handler 注册表
 */
const handlerRegistry = new Map<ActionType, ActionHandler>()

/**
 * 注册 Handler
 */
export function registerHandler<T extends Action>(handler: ActionHandler<T>): void {
    handlerRegistry.set(handler.type as ActionType, handler as ActionHandler)
}

/**
 * 获取 Handler
 */
export function getHandler(type: ActionType): ActionHandler | undefined {
    return handlerRegistry.get(type)
}

/**
 * 获取所有已注册的 Handler
 */
export function getAllHandlers(): ActionHandler[] {
    return Array.from(handlerRegistry.values())
}

/**
 * 判断 Action 是否为瞬时动作
 */
export function isPointAction(action: Action): boolean {
    const handler = getHandler(action.type as ActionType)
    return handler?.isPointAction ?? false
}

/**
 * 判断 Action 是否为持续动作
 */
export function isDurationAction(action: Action): boolean {
    const handler = getHandler(action.type as ActionType)
    return handler?.isDurationAction ?? false
}

/**
 * 判断 Action 是否影响目标对象
 */
export function isActionForTarget(action: Action, targetId: string): boolean {
    return action.target === targetId
}

/**
 * 判断 Action 是否为相机动作
 */
export function isCameraAction(action: Action): boolean {
    const cameraTypes: ActionType[] = ['camera_cut', 'camera_move', 'camera_shake', 'camera_follow']
    return cameraTypes.includes(action.type as ActionType)
}

/**
 * 判断 Action 是否影响对象状态
 * 通过 Handler 注册表的 affectsObjectState 元数据判断，消除硬编码 type 枚举。
 */
export function isObjectStateAction(action: Action): boolean {
    const handler = getHandler(action.type as ActionType)
    return handler?.affectsObjectState ?? false
}
