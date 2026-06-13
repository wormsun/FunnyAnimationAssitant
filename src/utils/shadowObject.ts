/**
 * Shadow Object 管理模块
 * 
 * 实现动态对象注入功能：
 * - 在 Action Mode 的任意 Slot 动态添加场景对象
 * - 使用 Shadow Pool 策略：对象在 Setup 层创建时 spawned=false
 * - 通过 Action 控制对象的出生时机和位置
 * 
 * @version v9.2 - 使用 spawned 属性分离生命周期与可见性
 */

import { CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import { Z_INDEX_BACKGROUND, Z_INDEX_DEFAULT, Z_INDEX_LIGHT } from '@/constants/zIndex'

/**
 * Shadow Prop 默认尺寸（与 sceneObjectStore.createPropObject 保持一致）
 * 渲染时会根据实际纹理尺寸更新
 */
const SHADOW_PROP_DEFAULT_WIDTH = 200
const SHADOW_PROP_DEFAULT_HEIGHT = 200
import type { SceneObject } from '@/types/sceneObject'
import type {
    SceneContainer,
    ScriptBlock,
    SetLifecycleAction
} from '@/types/screenplay'
import { generateId } from '@/utils/uuid'

/**
 * 添加 Shadow Object 的参数
 */
export interface AddShadowObjectParams {
    /** 场景容器 */
    scene: SceneContainer
    /** 当前脚本块 */
    block: ScriptBlock
    /** 当前槽位索引 */
    slotIndex: number
    /** 对象类型 */
    objectType: 'prop' | 'audio' | 'background' | 'symbol' | 'expression' | 'light'
    /** 资源 ID (propId, audioId, backgroundId) */
    resourceId: string
    /** 资源名称 */
    resourceName: string
    /** 相机中心 X 坐标 */
    cameraCenterX: number
    /** 相机中心 Y 坐标 */
    cameraCenterY: number
    /** 可选：别名 */
    alias?: string
}

/**
 * 添加 Shadow Object 的返回结果
 */
export interface AddShadowObjectResult {
    /** 创建的 Setup 对象 */
    setupObject: SceneObject
    /** 出生 Action (v9.3: 类型改为 SetLifecycleAction) */
    spawnAction: SetLifecycleAction
}

/**
 * 创建 Shadow Object 及其出生 Action
 * 
 * @param params 参数
 * @returns 创建的 Setup 对象和出生 Action
 */
export function createShadowObject(params: AddShadowObjectParams): AddShadowObjectResult {
    const {
        slotIndex,
        objectType,
        resourceId,
        resourceName,
        // v9.3: cameraCenterX/cameraCenterY 不再需要，位置由后续的 set_transform 设置
    } = params

    const objectId = generateId('sceneobject')  // v9.2: 与 Scene Mode 保持一致

    // 1. 创建影子对象 (spawned: false, 位置为画布中心)
    // v2.0.0: 所有对象统一使用中心坐标语义，与 sceneObjectStore 的 create*Object 保持一致
    const initialX = CANVAS_CENTER_X
    const initialY = CANVAS_CENTER_Y

    const setupObject: SceneObject = {
        id: objectId,
        refId: resourceId,
        type: objectType,
        name: resourceName,
        x: initialX,
        y: initialY,
        width: objectType === 'background' ? 0 : objectType === 'light' ? 96 : (objectType === 'prop' || objectType === 'symbol' || objectType === 'expression' ? SHADOW_PROP_DEFAULT_WIDTH : 0),
        height: objectType === 'background' ? 0 : objectType === 'light' ? 96 : (objectType === 'prop' || objectType === 'symbol' || objectType === 'expression' ? SHADOW_PROP_DEFAULT_HEIGHT : 0),
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        zIndex: objectType === 'background' ? Z_INDEX_BACKGROUND : objectType === 'light' ? Z_INDEX_LIGHT : Z_INDEX_DEFAULT,
        flipX: false,
        visible: true,   // v9.2: visible 恢复为 true（可见性）
        spawned: false,  // v9.2: 关键 - 未出生
        alpha: 1,
        ...(params.alias ? { alias: params.alias } : { alias: resourceName }),
        // 音频对象默认属性
        ...(objectType === 'audio' ? {
            volume: 1.0,
            loop: false,
            playbackState: 'stop' as const
        } : {}),
        // v16: 元件对象默认属性
        ...(objectType === 'symbol' ? {
            materials: []
        } : {}),
        // v25: 光源对象默认属性（与 sceneObjectStore.createLightObject 保持一致）
        ...(objectType === 'light' ? {
            lightType: 'point' as const,
            lightColor: '#ffffff',
            lightIntensity: 1.0,
            lightRadius: 300,
            flicker: 0,
            flickerSpeed: 0.35,
            directionMode: 'omni' as const,
            directionAngle: 0,
            coneAngle: 100,
        } : {}),
    }

    // 2. 创建出生 Action (v9.3: 使用 SetLifecycleAction)
    const spawnAction: SetLifecycleAction = {
        id: generateId(),
        type: 'set_lifecycle',
        category: 'point',
        target: objectId,
        slotIndex,
        params: {
            spawned: true,
            autoDespawnOnBlockEnd: true
        }
    }

    return { setupObject, spawnAction }
}

/**
 * 判断对象是否为动态对象 (Shadow Object)
 * 
 * 动态对象的判断依据：
 * - Setup 中 spawned=false
 * - 通过 Action 控制 spawned=true
 * 
 * @param obj Setup 对象
 * @returns 是否为动态对象
 */
export function isShadowObject(obj: SceneObject): boolean {
    return obj.spawned === false
}

/**
 * 查找对象的出生槽位索引
 * 
 * v9.3: 使用 SetLifecycleAction 查找出生动作
 * 
 * @param objectId 对象 ID
 * @param actions 当前 Block 的 Actions 列表
 * @returns 出生槽位索引，如果未找到返回 -1
 */
export function findBirthSlotIndex(objectId: string, actions: SetLifecycleAction[]): number {
    // 查找第一个 spawned: true 的 set_lifecycle action
    const birthAction = actions
        .filter(a =>
            a.type === 'set_lifecycle' &&
            a.target === objectId &&
            a.params.spawned === true
        )
        .sort((a, b) => a.slotIndex - b.slotIndex)[0]

    return birthAction ? birthAction.slotIndex : -1
}

/**
 * 检查对象在指定槽位是否活跃（已出生且未消亡）
 * 
 * v9.3: 使用 SetLifecycleAction 检查 spawned 状态
 * 
 * @param objectId 对象 ID
 * @param slotIndex 槽位索引
 * @param actions Actions 列表
 * @param isSetupSpawned Setup 中的 spawned 值
 * @returns 是否有生命（spawned 状态）
 */
export function isObjectAliveAtSlot(
    objectId: string,
    slotIndex: number,
    actions: SetLifecycleAction[],
    isSetupSpawned: boolean
): boolean {
    // 获取该对象在指定槽位之前（含）的所有 spawned 变更
    const lifecycleActions = actions
        .filter(a =>
            a.type === 'set_lifecycle' &&
            a.target === objectId &&
            a.slotIndex <= slotIndex
        )
        .sort((a, b) => a.slotIndex - b.slotIndex)

    // 如果没有 spawned 变更，使用 Setup 中的值
    if (lifecycleActions.length === 0) {
        return isSetupSpawned
    }

    // 返回最后一个 spawned 变更的值
    const lastAction = lifecycleActions[lifecycleActions.length - 1]
    return lastAction?.params.spawned === true
}

