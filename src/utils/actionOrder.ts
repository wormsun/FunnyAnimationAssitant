import type { Action } from '@/types/screenplay'
import { flattenSetSceneStructureParams } from '@/utils/setSceneStructureAction'

export type ActionOrderMode = 'default' | 'custom'

function getExplicitOrder(action: Action): number | undefined {
  return Number.isFinite(action.order) ? action.order : undefined
}

export function getSceneStructureSpawnedTargetsForSlot(
  actions: readonly Action[],
  slotIndex: number,
): Set<string> {
  const targets = new Set<string>()
  for (const action of actions) {
    if (action.slotIndex !== slotIndex || action.type !== 'set_scene_structure') continue
    const patch = flattenSetSceneStructureParams(action.params)
    for (const [id, spawned] of Object.entries(patch.spawnedById)) {
      if (spawned) targets.add(id)
    }
  }
  return targets
}

function buildSceneStructureSpawnedTargetsBySlot(actions: readonly Action[]): Map<number, Set<string>> {
  const targetsBySlot = new Map<number, Set<string>>()
  for (const action of actions) {
    if (action.type !== 'set_scene_structure') continue
    const targets = targetsBySlot.get(action.slotIndex) ?? new Set<string>()
    const patch = flattenSetSceneStructureParams(action.params)
    for (const [id, spawned] of Object.entries(patch.spawnedById)) {
      if (spawned) targets.add(id)
    }
    targetsBySlot.set(action.slotIndex, targets)
  }
  return targetsBySlot
}

export function isSceneStructureSpawnedTargetTransform(
  action: Action,
  spawnedTargets: ReadonlySet<string>,
): boolean {
  return action.type === 'set_transform' && spawnedTargets.has(action.target)
}

function getPointActionPriority(
  action: Action,
  spawnedTargetsBySlot?: ReadonlyMap<number, ReadonlySet<string>>,
): number {
  const spawnedTargets = spawnedTargetsBySlot?.get(action.slotIndex)
  if (spawnedTargets && isSceneStructureSpawnedTargetTransform(action, spawnedTargets)) {
    return 4
  }

  switch (action.type) {
    case 'set_lifecycle':
      return 0
    case 'set_transform':
      return 1
    case 'set_visual':
      return 2
    case 'set_scene_structure':
      return 3
    case 'set_composite':
      return 5
    default:
      return 10
  }
}

function compareActionsByDefaultOrder(
  a: Action,
  b: Action,
  objectIndexMap?: ReadonlyMap<string, number>,
  spawnedTargetsBySlot?: ReadonlyMap<number, ReadonlySet<string>>,
): number {
  if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex

  const aIsPoint = a.category === 'point'
  const bIsPoint = b.category === 'point'
  if (aIsPoint && !bIsPoint) return -1
  if (!aIsPoint && bIsPoint) return 1

  if (aIsPoint && bIsPoint) {
    const priorityDiff = getPointActionPriority(a, spawnedTargetsBySlot) - getPointActionPriority(b, spawnedTargetsBySlot)
    if (priorityDiff !== 0) return priorityDiff
  }

  void objectIndexMap

  return 0
}

/**
 * 统一动作评估顺序。
 *
 * 规则：
 * 1. 先按 slotIndex
 * 2. 同 slot 下如果存在显式 order，则按 order 执行
 * 3. 没有显式 order 的旧数据沿用兼容排序：point action 先于 duration action
 * 4. 同 slot 下 point action 使用固定优先级
 * 5. 普通对象 set_transform 在 set_scene_structure 前执行，
 *    这样加入人物/成组时可以基于当前 slot 的最终视觉姿态反算 local。
 * 6. 由 set_scene_structure 在同 slot 启用的结构对象，其自身 set_transform 后置执行，
 *    这样新组合先启用/挂载，再接收旋转、缩放、变换点。
 */
export function sortActionsForEvaluation(
  actions: readonly Action[],
  objectIndexMap?: ReadonlyMap<string, number>,
): Action[] {
  const spawnedTargetsBySlot = buildSceneStructureSpawnedTargetsBySlot(actions)
  const slotLocalIndexById = new Map<string, number>()
  const slotCounts = new Map<number, number>()
  actions.forEach((action) => {
    const index = slotCounts.get(action.slotIndex) ?? 0
    slotLocalIndexById.set(action.id, index)
    slotCounts.set(action.slotIndex, index + 1)
  })

  return [...actions].sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex

    const aOrder = getExplicitOrder(a)
    const bOrder = getExplicitOrder(b)
    if (aOrder !== undefined || bOrder !== undefined) {
      const aEffectiveOrder = aOrder ?? slotLocalIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bEffectiveOrder = bOrder ?? slotLocalIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER
      const orderDiff = aEffectiveOrder - bEffectiveOrder
      if (orderDiff !== 0) return orderDiff
    }

    return compareActionsByDefaultOrder(a, b, objectIndexMap, spawnedTargetsBySlot)
  })
}

export function sortActionsByDefaultEvaluationOrder(
  actions: readonly Action[],
  objectIndexMap?: ReadonlyMap<string, number>,
): Action[] {
  return [...actions].sort((a, b) => compareActionsByDefaultOrder(a, b, objectIndexMap))
}

export function hasCustomActionOrderForSlot(actions: readonly Action[], slotIndex: number): boolean {
  return actions.some(action => action.slotIndex === slotIndex && getExplicitOrder(action) !== undefined)
}

export function getActionOrderModeForSlot(actions: readonly Action[], slotIndex: number): ActionOrderMode {
  return hasCustomActionOrderForSlot(actions, slotIndex) ? 'custom' : 'default'
}

export function reconcileActionOrderForSlot(
  actions: Action[],
  slotIndex: number,
  options: {
    mode?: ActionOrderMode
    actionIds?: readonly string[]
    appendActionId?: string
    objectIndexMap?: ReadonlyMap<string, number> | undefined
  } = {},
): boolean {
  const slotActions = actions.filter(action => action.slotIndex === slotIndex)
  const mode = options.mode ?? getActionOrderModeForSlot(actions, slotIndex)

  if (mode === 'default') {
    let changed = false
    for (const action of slotActions) {
      if (action.order === undefined) continue
      delete action.order
      changed = true
    }
    return changed
  }

  const actionById = new Map(slotActions.map(action => [action.id, action]))
  const usedIds = new Set<string>()
  const ordered: Action[] = []

  if (options.actionIds) {
    for (const id of options.actionIds) {
      const action = actionById.get(id)
      if (!action || usedIds.has(id)) continue
      ordered.push(action)
      usedIds.add(id)
    }
  }

  const appendAction = options.appendActionId ? actionById.get(options.appendActionId) : undefined
  const remaining = sortActionsForEvaluation(
    slotActions.filter(action => !usedIds.has(action.id) && action.id !== appendAction?.id),
    options.objectIndexMap,
  )
  ordered.push(...remaining)
  if (appendAction && !usedIds.has(appendAction.id)) {
    ordered.push(appendAction)
    usedIds.add(appendAction.id)
  }

  let changed = false
  ordered.forEach((action, index) => {
    if (action.order !== index) {
      action.order = index
      changed = true
    }
  })

  return changed
}

export function normalizeActionOrdersForSlot(
  actions: Action[],
  slotIndex: number,
  objectIndexMap?: ReadonlyMap<string, number>,
): boolean {
  return reconcileActionOrderForSlot(actions, slotIndex, { mode: 'custom', objectIndexMap })
}

export function clearActionOrdersForSlot(actions: Action[], slotIndex: number): boolean {
  return reconcileActionOrderForSlot(actions, slotIndex, { mode: 'default' })
}

export function applyActionOrderIdsForSlot(actions: Action[], slotIndex: number, actionIds: readonly string[]): boolean {
  return reconcileActionOrderForSlot(actions, slotIndex, { mode: 'custom', actionIds })
}
