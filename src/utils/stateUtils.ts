/**
 * 状态工具函数 (v6.2)
 * 用于计算对象运行时状态和状态差异比较
 */

import type { SceneObject } from '@/stores/sceneObjectStore'
import type { Action, SceneSetup } from '@/types/screenplay'

import { evaluateObjectState } from './actionEvaluator'


// Phase 4e: 消除 SubtypeSnapshotBuilder registry，直接使用 SceneObject

/**
 * 统一构建对象状态快照（Phase 4e 简化）
 * 现在直接返回 SceneObject 的浅克隆，不再拉平子类型字段
 * @deprecated Phase 4e 后应直接使用 { ...obj }
 */
export function buildObjectStateSnapshot(obj: SceneObject): SceneObject {
  return { ...obj }
}

/**
 * 状态差异
 */
export interface StateDiff {
  transform?: Partial<{
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    alpha: number
  }>
  active?: {
    visible: boolean
  }
}

/**
 * 从场景对象获取运行时状态
 */
export function getObjectRuntimeState(obj: SceneObject | null | undefined): SceneObject | null {
  if (!obj) return null
  return { ...obj }
}

/**
 * 对比两个状态，返回差异
 * 只返回发生变化的属性
 */
export function compareObjectState(
  baseline: SceneObject,
  current: SceneObject
): StateDiff {
  const diff: StateDiff = {}

  const transformDiff: NonNullable<StateDiff['transform']> = {}

  if (baseline.x !== current.x) transformDiff.x = current.x
  if (baseline.y !== current.y) transformDiff.y = current.y
  if (baseline.scaleX !== current.scaleX) transformDiff.scaleX = current.scaleX
  if (baseline.scaleY !== current.scaleY) transformDiff.scaleY = current.scaleY
  if (baseline.rotation !== current.rotation) transformDiff.rotation = current.rotation
  if (baseline.alpha !== current.alpha) transformDiff.alpha = current.alpha

  if (Object.keys(transformDiff).length > 0) {
    diff.transform = transformDiff
  }


  // 可见性对比
  if (baseline.visible !== current.visible) {
    diff.active = { visible: current.visible }
  }

  return diff
}

/**
 * 检查状态差异是否为空
 */
export function isStateDiffEmpty(diff: StateDiff): boolean {
  const hasTransform = diff.transform && Object.keys(diff.transform).length > 0
  const hasActive = diff.active !== undefined

  return !hasTransform && !hasActive
}

/**
 * 根据更新的属性确定动作类型 (v6.3)
 * - set_transform: 视觉属性 (alpha/visible/flipX/zIndex)
 */
export function getActionTypeFromUpdates(updates: Partial<SceneObject>): 'set_transform' | null {
  const keys = Object.keys(updates)

  // 视觉属性 (v6.3: 仅 alpha, visible, flipX, zIndex)
  const visualKeys = ['alpha', 'visible', 'flipX', 'zIndex']
  const hasVisualKey = keys.some(k => visualKeys.includes(k))
  if (hasVisualKey) {
    return 'set_transform'
  }

  return null
}

/**
 * v7.0: 从场景对象获取目标标识符（用于 Action.target）
 * 对于角色对象，返回其运行时对象ID（即 SceneObject.id）
 */
export function getTargetAliasFromObject(obj: SceneObject): string | null {
  if (!obj) return null

  if (obj.type === 'camera') {
    return 'camera'
  }

  // 所有类型返回对象ID
  return obj.id
}

/**
 * 从更新对象中提取变换参数（用于 set_transform 动作）
 */
export function extractTransformParams(updates: Partial<SceneObject>): Record<string, number> | null {
  const params: Record<string, number> = {}

  if (updates.x !== undefined) params['x'] = updates.x
  if (updates.y !== undefined) params['y'] = updates.y
  if (updates.scaleX !== undefined) params['scaleX'] = updates.scaleX
  if (updates.scaleY !== undefined) params['scaleY'] = updates.scaleY
  if (updates.rotation !== undefined) params['rotation'] = updates.rotation
  if (updates.alpha !== undefined) params['alpha'] = updates.alpha

  return Object.keys(params).length > 0 ? params : null
}



/**
 * 从 SceneSetup 中获取对象的初始状态
 * 用于 Action Mode 下计算对象在指定时刻的运行时状态
 */
export function getStartStateFromSetup(
  setup: SceneSetup,
  _obj: SceneObject,
  targetAlias: string
): SceneObject | null {
  // 相机对象特殊处理 - 构造伪 SceneObject
  if (targetAlias === 'camera') {
    return {
      id: 'camera',
      type: 'camera',
      name: 'camera',
      refId: '',
      x: setup.camera.x,
      y: setup.camera.y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      visible: true,
      zIndex: 0,
    } as SceneObject
  }

  // v7.0: 直接通过ID查找对应的 setup 对象
  let setupObj: SceneObject | null = null

  for (const setupObject of setup.objects) {
    // v7.0: target 现在是实例ID
    if (setupObject.id === targetAlias) {
      setupObj = setupObject
      break
    }
  }

  if (!setupObj) return null

  return { ...setupObj }
}

/**
 * 计算对象在指定 slot 开始时刻的运行时状态
 * @param setup 前置状态（block 开始前的状态）
 * @param obj 当前选中的场景对象
 * @param targetAlias 对象的目标别名（用于匹配 Action）
 * @param actions 当前 block 的所有动作
 * @param slotStartTime slot 的开始时间（毫秒）
 * @param totalDuration block 的总时长（毫秒）
 * @param slots 运行时槽位列表
 */
export function computeObjectStateAtSlot(
  setup: SceneSetup,
  obj: SceneObject,
  targetAlias: string,
  actions: Action[],
  slotStartTime: number,
  totalDuration: number,
  slots?: import('@/types/screenplay').RuntimeSlot[]
): SceneObject | null {
  // 获取初始状态（传入 obj 以便将来扩展支持其他对象类型）
  const startState = getStartStateFromSetup(setup, obj, targetAlias)
  if (!startState) return null

  // 过滤出针对该对象的动作
  const objectActions = actions.filter(a => a.target === targetAlias)

  // 使用 evaluateObjectState 计算在 slotStartTime 时刻的状态
  return evaluateObjectState(
    startState,
    objectActions,
    slotStartTime,
    totalDuration,
    slots
  )
}
