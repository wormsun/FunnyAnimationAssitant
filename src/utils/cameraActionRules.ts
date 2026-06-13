import type { Action } from '@/types/screenplay'

export type CameraActionType = 'camera_cut' | 'camera_move' | 'camera_follow' | 'camera_shake'

export interface SlotRange {
  start: number
  end: number
}

export function isCameraActionType(type: string): type is CameraActionType {
  return type === 'camera_cut'
    || type === 'camera_move'
    || type === 'camera_follow'
    || type === 'camera_shake'
}

export function isCameraAction(action: Action): boolean {
  return action.target === 'camera' && isCameraActionType(action.type)
}

export function isCameraFollowAction(type: string): boolean {
  return type === 'camera_follow'
}

export function isCameraPositionAction(type: string): boolean {
  return type === 'camera_cut' || type === 'camera_move'
}

export function isCameraShakeAction(type: string): boolean {
  return type === 'camera_shake'
}

export function getActionSlotRange(action: Pick<Action, 'category' | 'slotIndex'> & { slotSpan?: number }): SlotRange {
  const span = action.category === 'duration' ? (action.slotSpan ?? 1) : 1
  return {
    start: action.slotIndex,
    end: action.slotIndex + Math.max(1, span) - 1,
  }
}

export function rangesOverlap(a: SlotRange, b: SlotRange): boolean {
  return !(a.end < b.start || a.start > b.end)
}

export function canCameraActionsCoexist(a: Action, b: Action): boolean {
  if (!isCameraAction(a) || !isCameraAction(b)) return true

  const aRange = getActionSlotRange(a)
  const bRange = getActionSlotRange(b)
  if (!rangesOverlap(aRange, bRange)) return true

  if (isCameraShakeAction(a.type) || isCameraShakeAction(b.type)) {
    return !(isCameraShakeAction(a.type) && isCameraShakeAction(b.type))
  }

  if (
    (a.type === 'camera_cut' && b.type === 'camera_move')
    || (a.type === 'camera_move' && b.type === 'camera_cut')
  ) {
    return true
  }

  return false
}

export function findCameraConflict(
  actions: readonly Action[],
  candidate: Action,
  options: { excludeId?: string } = {},
): Action | null {
  if (!isCameraAction(candidate)) return null

  return actions.find(action => (
    action.id !== options.excludeId
    && isCameraAction(action)
    && !canCameraActionsCoexist(action, candidate)
  )) ?? null
}

export function findUpsertableCameraAction(
  actions: readonly Action[],
  candidate: Action,
  options: { excludeId?: string } = {},
): Action | null {
  if (!isCameraAction(candidate)) return null

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (!action || action.id === options.excludeId || !isCameraAction(action)) continue
    if (action.type !== candidate.type) continue
    if (!rangesOverlap(getActionSlotRange(action), getActionSlotRange(candidate))) continue
    return action
  }

  return null
}

export function getCameraActionEvaluationPriority(type: string): number {
  switch (type) {
    case 'camera_cut':
      return 0
    case 'camera_move':
    case 'camera_follow':
      return 1
    case 'camera_shake':
      return 2
    default:
      return 9
  }
}

export function sortCameraActionsForEvaluation(actions: readonly Action[]): Action[] {
  return [...actions].sort((a, b) => (
    a.slotIndex - b.slotIndex
    || getCameraActionEvaluationPriority(a.type) - getCameraActionEvaluationPriority(b.type)
  ))
}
