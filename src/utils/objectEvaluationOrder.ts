import type { SceneObject } from '@/types/sceneObject'
import type { Action, RuntimeSlot } from '@/types/screenplay'
import { topologicalSortByParent } from '@/utils/evaluationOrder'
import { flattenSetSceneStructureParams } from '@/utils/setSceneStructureAction'

function applyParentOverrideFromAction(parentOverrides: Map<string, string | null>, action: Action): void {
  if (action.category !== 'point') return

  if (action.type === 'set_scene_structure') {
    const patch = flattenSetSceneStructureParams(action.params)
    for (const [id, parentId] of Object.entries(patch.parentById)) {
      parentOverrides.set(id, parentId)
    }
  }
}

export function buildParentOverridesForSlot(
  actions: Action[],
  slotIndex: number
): Map<string, string | null> {
  const parentOverrides = new Map<string, string | null>()

  for (const action of actions) {
    if (action.slotIndex !== slotIndex) continue
    applyParentOverrideFromAction(parentOverrides, action)
  }

  return parentOverrides
}

export function buildParentOverridesForTime(
  actions: Action[],
  currentTime: number,
  slots?: RuntimeSlot[]
): Map<string, string | null> {
  const parentOverrides = new Map<string, string | null>()

  for (const action of actions) {
    if (action.category !== 'point') continue
    const startTime = slots?.[action.slotIndex]?.startTime ?? 0
    if (currentTime < startTime) continue
    applyParentOverrideFromAction(parentOverrides, action)
  }

  return parentOverrides
}

export function sortObjectsForEvaluation(
  objects: SceneObject[],
  parentOverrides?: Map<string, string | null>
): SceneObject[] {
  if (!parentOverrides || parentOverrides.size === 0) {
    return topologicalSortByParent(objects)
  }

  const objectById = new Map(objects.map(obj => [obj.id, obj]))
  const shadowObjects = objects.map(obj => ({
    id: obj.id,
    parentId: parentOverrides.has(obj.id) ? parentOverrides.get(obj.id) ?? null : obj.parentId ?? null,
  }))

  return topologicalSortByParent(shadowObjects)
    .map(obj => objectById.get(obj.id))
    .filter((obj): obj is SceneObject => Boolean(obj))
}

export function sortObjectsBySlotActionOrder(
  objects: SceneObject[],
  orderedActions: readonly Action[],
  slotIndex: number,
): SceneObject[] {
  const actionOrderByTarget = new Map<string, number>()
  orderedActions.forEach((action, index) => {
    if (action.slotIndex !== slotIndex) return
    if (actionOrderByTarget.has(action.target)) return
    actionOrderByTarget.set(action.target, index)
  })

  return [...objects].sort((a, b) => {
    const aOrder = actionOrderByTarget.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bOrder = actionOrderByTarget.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })
}
