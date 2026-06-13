/**
 * 场景对象序列化 Provider 注册中心 — TypeSerializer Registry
 *
 * P1: 用注册替代 sceneObjectStore 中 toSetupObject / fromSetupObject 的 switch(obj.type)。
 * 新增对象类型只需调用 registerTypeSerializer() 注册序列化器。
 *
 * 设计原则：
 * - 公共基类字段（id/refId/type/x/y/scale...）由 toSetupObject 统一处理
 * - TypeSerializer 只负责**子类型特化字段**的序列化/反序列化
 */

import type { SceneObjectType } from '@/types/sceneObject'

// ============================================================================
// Types
// ============================================================================

/**
 * 类型序列化器接口
 *
 * 每种 SceneObjectType 注册一个实现。
 */
export interface TypeSerializer {
    /**
     * 序列化：将子类型特化字段写入 base DTO
     *
     * @param obj    运行时 SceneObject（已按 type 缩窄）
     * @param base   公共字段已填充的 DTO 对象，此方法在其上追加特化字段
     */
    serializeFields(obj: import('@/types/sceneObject').SceneObject, base: Record<string, unknown>): void

    /**
     * 反序列化：从持久化数据创建运行时 SceneObject 并注入 Store
     *
     * @param objData  持久化 DTO 数据
     * @param ctx      反序列化上下文（Store 操作函数注入）
     */
    deserialize(objData: import('@/types/sceneObject').SceneObject, ctx: DeserializeContext): void
}

/**
 * 反序列化上下文
 *
 * 将 sceneObjectStore 内部函数注入给序列化器，避免循环依赖。
 */
export interface DeserializeContext {
    // createCharacterObject 已移除
    createBackgroundObject: (
        backgroundId: string,
        name: string,
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createAudioObject: (
        soundId: string,
        name: string,
        options?: {
            volume?: number
            loop?: boolean
            fadeIn?: number
            fadeOut?: number
            playbackState?: 'play' | 'stop'
        },
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createPropObject: (
        propId: string,
        name: string,
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createScreenEffectObject: (
        effectClass: string,
        name: string,
        params?: import('@/types/sceneObject').ScreenEffectParams,
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createSymbolObject: (
        name: string,
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createExpressionObject: (
        expressionId: string,
        name: string,
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').SceneObject
    createCompositeObject: (
        name: string,
        childIds: string[],
        customId?: string,
        customAlias?: string,
        compositeMode?: 'entity' | 'union',
    ) => import('@/types/sceneObject').SceneObject
    /**
     * Clip-Mask Phase 1：创建蒙版对象。
     * 反序列化时由 maskSerializer 调用；初始 targetIds 传空数组，
     * 真实 targetIds 通过 `pendingMaskTargets` 在所有对象就绪后由 finalize 步骤回填并裁决独占冲突。
     */
    createMaskObject: (
        name: string,
        shape: import('@/types/sceneObject').MaskShape,
        options?: {
            width?: number
            height?: number
            mode?: import('@/types/sceneObject').MaskMode
        },
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').MaskObject
    /**
     * Clip-Mask Phase 1：暂存反序列化阶段读取的 targetIds（key 为 mask id）。
     * 所有对象 deserialize 完成后，调用 `finalizeMaskTargets()` 回填并清理：
     * 死引用 / 非法目标类型 / mask→mask 嵌套 / 同 target 多 mask 冲突。
     */
    pendingMaskTargets: Map<string, string[]>
    createTextObject: (
        content: string,
        canvasCenter?: { x: number; y: number },
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').TextObject
    createLightObject: (
        lightType: 'ambient' | 'point' | 'spot',
        name: string,
        options?: {
            lightColor?: string
            lightIntensity?: number
            lightRadius?: number
            flicker?: number
            flickerSpeed?: number
            directionMode?: 'omni' | 'cone'
            directionAngle?: number
            coneAngle?: number
            x?: number
            y?: number
        },
        customId?: string,
        customAlias?: string,
    ) => import('@/types/sceneObject').LightObject
    updateObject: <T extends import('@/types/sceneObject').SceneObject = import('@/types/sceneObject').SceneObject>(id: string, updates: import('@/types/sceneObject').SceneObjectUpdateFor<T>) => void
    resolveActorName: (
        refId: string,
        actorId?: string,
    ) => { displayName: string; resolvedActorId: string } | null
}

// ============================================================================
// Registry
// ============================================================================

const serializerRegistry = new Map<SceneObjectType, TypeSerializer>()

/**
 * 注册一个对象类型的序列化器
 */
export function registerTypeSerializer(type: SceneObjectType, serializer: TypeSerializer): void {
    serializerRegistry.set(type, serializer)
}

/**
 * 获取已注册的序列化器
 */
export function getTypeSerializer(type: SceneObjectType): TypeSerializer | undefined {
    return serializerRegistry.get(type)
}

/**
 * 清空注册表（仅测试使用）
 */
export function clearSerializerRegistry(): void {
    serializerRegistry.clear()
}
