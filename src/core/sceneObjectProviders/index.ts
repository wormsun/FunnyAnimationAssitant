/**
 * 场景对象 Provider 注册中心 — ContainerFactory Registry
 *
 * P1: 用注册替代 switch(obj.type) 的散弹式修改。
 * 新增对象类型只需调用 registerContainerFactory() 注册工厂函数。
 *
 * 本模块仅定义注册表和查询 API，各类型的工厂函数由消费者（useSceneGraph / FrameCapture）
 * 在初始化时注册——保持"轻量注册"策略，不提取庞大的引擎特有逻辑。
 */

import type { SceneObjectType } from '@/types/sceneObject'

// ============================================================================
// Types
// ============================================================================

/**
 * 容器工厂函数签名
 *
 * 接收场景对象数据，返回 PIXI.Container（异步，部分类型需加载纹理）。
 * 返回 null 表示该类型当前不需要渲染容器（如 audio）。
 */
export type ContainerFactory<TObj = import('@/types/sceneObject').SceneObject> = (
    obj: TObj,
) => Promise<import('pixi.js').Container | null>

// ============================================================================
// Registry
// ============================================================================

const containerFactoryRegistry = new Map<SceneObjectType, ContainerFactory>()

/**
 * 注册一个对象类型的容器工厂
 *
 * 相同 type 重复注册会覆盖（支持 HMR）。
 */
export function registerContainerFactory(
    type: SceneObjectType,
    factory: ContainerFactory,
): void {
    containerFactoryRegistry.set(type, factory)
}

/**
 * 获取已注册的容器工厂
 *
 * 未注册则返回 undefined，调用方应做 fallback 或 throw。
 */
export function getContainerFactory(type: SceneObjectType): ContainerFactory | undefined {
    return containerFactoryRegistry.get(type)
}

/**
 * 检查某类型是否已注册
 */
export function hasContainerFactory(type: SceneObjectType): boolean {
    return containerFactoryRegistry.has(type)
}

/**
 * 获取所有已注册的类型列表（用于调试/测试）
 */
export function getRegisteredTypes(): SceneObjectType[] {
    return [...containerFactoryRegistry.keys()]
}

/**
 * 清空注册表（仅测试使用）
 */
export function clearContainerFactoryRegistry(): void {
    containerFactoryRegistry.clear()
}

// ============================================================================
// Lifecycle Hooks Registry (P2)
// ============================================================================

/**
 * Store 操作接口（传给钩子的最小依赖）
 *
 * 避免钩子直接引用 Store（防止循环依赖），只暴露必要操作。
 */
export interface LifecycleStoreAccessor {
    getObject(id: string): import('@/types/sceneObject').SceneObject | undefined
    removeObject(id: string): void
    updateObject<T extends import('@/types/sceneObject').SceneObject = import('@/types/sceneObject').SceneObject>(id: string, updates: import('@/types/sceneObject').SceneObjectUpdateFor<T>): void
    duplicateObject(id: string): import('@/types/sceneObject').SceneObject | undefined
}

/**
 * 对象类型生命周期钩子
 *
 * 各类型通过注册钩子来扩展 Store 的通用操作，避免 Store 内部 type-check + cast。
 */
export interface ObjectLifecycleHooks {
    /** 删除前回调 — 用于级联删除子对象等 */
    onBeforeDelete?(obj: import('@/types/sceneObject').SceneObject, store: LifecycleStoreAccessor): void
    /** 复制后回调 — 用于递归复制子对象、更新关联关系等 */
    onAfterDuplicate?(original: import('@/types/sceneObject').SceneObject, duplicate: import('@/types/sceneObject').SceneObject, store: LifecycleStoreAccessor): void
}

const lifecycleHooksRegistry = new Map<SceneObjectType, ObjectLifecycleHooks>()

/** 注册某类型的生命周期钩子 */
export function registerLifecycleHooks(type: SceneObjectType, hooks: ObjectLifecycleHooks): void {
    lifecycleHooksRegistry.set(type, hooks)
}

/** 获取某类型的生命周期钩子 */
export function getLifecycleHooks(type: SceneObjectType): ObjectLifecycleHooks | undefined {
    return lifecycleHooksRegistry.get(type)
}
