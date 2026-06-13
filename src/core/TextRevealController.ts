import type { TextObject } from '@/types/sceneObject'
import type { Action, BlockPlayInfo, SetTextRevealAction } from '@/types/screenplay'
import { type ActionType, getHandler } from '@/utils/actionHandlers'
import type { WriteableState } from '@/utils/actionHandlers/types'
import { sortActionsForEvaluation } from '@/utils/actionOrder'

export interface TextRevealState {
  active: boolean
  mode: 'typewriter'
  playTime: number
  content: string
  speed: number
  progress: number
}

interface ActiveTextReveal {
  mode: 'typewriter'
  playTime: number
  content: string
  speed: number
}

function cloneTextObject(obj: TextObject): TextObject {
  return JSON.parse(JSON.stringify(obj)) as TextObject
}

function getObjectIndexMap(info: BlockPlayInfo): Map<string, number> {
  const objectIndexMap = new Map<string, number>()
  info.startSnapshot.objects.forEach((obj, index) => objectIndexMap.set(obj.id, index))
  return objectIndexMap
}

function getActionTime(info: BlockPlayInfo, action: Action): number {
  return info.startTime + (info.slots[action.slotIndex]?.startTime ?? 0)
}

function getTextStateAtRevealAction(
  info: BlockPlayInfo,
  action: SetTextRevealAction,
): TextObject | null {
  const startState = info.startSnapshot.objects.find(obj => obj.id === action.target)
  if (startState?.type !== 'text') return null

  const state = cloneTextObject(startState as TextObject) as unknown as WriteableState
  const orderedActions = sortActionsForEvaluation(info.blockActions, getObjectIndexMap(info))

  for (const candidate of orderedActions) {
    if (candidate.id === action.id) break
    if (candidate.slotIndex > action.slotIndex) break
    if (candidate.category !== 'point') continue
    if (candidate.target !== action.target) continue

    const handler = getHandler(candidate.type as ActionType)
    if (handler?.affectsObjectState) {
      handler.applyToState(state, candidate)
    }
  }

  return state as unknown as TextObject
}

function getEffectiveSpeed(textState: TextObject): number {
  const rawSpeed = Number(textState.revealSpeed)
  return Number.isFinite(rawSpeed)
    ? Math.max(0.5, Math.min(60, rawSpeed))
    : 8
}

function getInitialRevealState(
  blockInfos: readonly BlockPlayInfo[],
  objectId: string,
): ActiveTextReveal | null {
  const firstInfo = blockInfos[0]
  if (!firstInfo) return null
  const initialState = firstInfo.startSnapshot.objects.find(obj => obj.id === objectId)
  if (initialState?.type !== 'text') return null

  const textState = initialState as TextObject
  if (textState.revealInitialState !== 'typewriter') return null

  return {
    mode: 'typewriter',
    playTime: firstInfo.startTime,
    content: textState.content ?? '',
    speed: getEffectiveSpeed(textState),
  }
}

export function computeTextRevealState(
  blockInfos: readonly BlockPlayInfo[],
  currentInfo: BlockPlayInfo,
  objectId: string,
  currentAbsTime: number,
): TextRevealState | null {
  let active: ActiveTextReveal | null = getInitialRevealState(blockInfos, objectId)

  for (const info of blockInfos) {
    if (info.startTime > currentAbsTime) break

    const orderedActions = sortActionsForEvaluation(info.blockActions, getObjectIndexMap(info))
    for (const action of orderedActions) {
      if (action.type !== 'set_text_reveal') continue
      if (action.target !== objectId) continue

      const actionTime = getActionTime(info, action)
      if (actionTime > currentAbsTime) continue

      if (action.params.action === 'stop') {
        active = null
        continue
      }

      const textState = getTextStateAtRevealAction(info, action)
      if (!textState) continue

      active = {
        mode: action.params.mode ?? 'typewriter',
        playTime: actionTime,
        content: textState.content ?? '',
        speed: getEffectiveSpeed(textState),
      }
    }

    if (info === currentInfo) break
  }

  if (!active || active.content.length === 0) return null

  const elapsedSec = Math.max(0, currentAbsTime - active.playTime) / 1000
  const progress = Math.min((elapsedSec * active.speed) / active.content.length, 1)

  return {
    active: true,
    mode: active.mode,
    playTime: active.playTime,
    content: active.content,
    speed: active.speed,
    progress,
  }
}
