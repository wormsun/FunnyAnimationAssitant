import { describe, expect, it } from 'vitest'

import type { Action } from '@/types/screenplay'

import {
  canCameraActionsCoexist,
  findCameraConflict,
  findUpsertableCameraAction,
  sortCameraActionsForEvaluation,
} from '../cameraActionRules'

function cameraAction(
  id: string,
  type: 'camera_cut' | 'camera_move' | 'camera_follow' | 'camera_shake',
  slotIndex: number,
  slotSpan = 1,
): Action {
  return {
    id,
    type,
    target: 'camera',
    category: type === 'camera_cut' ? 'point' : 'duration',
    slotIndex,
    ...(type === 'camera_cut' ? {} : { slotSpan, easing: 'linear' }),
    params: type === 'camera_follow'
      ? { followTarget: 'actor_1' }
      : type === 'camera_shake'
        ? { intensity: 10, decay: true, frequency: 20 }
        : { x: 100, y: 100, zoom: 1 },
  } as Action
}

describe('cameraActionRules', () => {
  it('treats same-slot camera_cut actions as conflicting/upsertable', () => {
    const existing = cameraAction('cut_1', 'camera_cut', 2)
    const candidate = cameraAction('cut_2', 'camera_cut', 2)

    expect(canCameraActionsCoexist(existing, candidate)).toBe(false)
    expect(findCameraConflict([existing], candidate)).toBe(existing)
    expect(findUpsertableCameraAction([existing], candidate)).toBe(existing)
  })

  it('allows camera_cut and camera_move to coexist in the same slot', () => {
    const cut = cameraAction('cut', 'camera_cut', 1)
    const move = cameraAction('move', 'camera_move', 1)

    expect(canCameraActionsCoexist(cut, move)).toBe(true)
    expect(findCameraConflict([cut], move)).toBeNull()
  })

  it('keeps camera_follow mutually exclusive with cut and move ranges', () => {
    const move = cameraAction('move', 'camera_move', 1, 2)
    const follow = cameraAction('follow', 'camera_follow', 2, 1)

    expect(canCameraActionsCoexist(move, follow)).toBe(false)
    expect(findCameraConflict([move], follow)).toBe(move)
  })

  it('allows camera_shake to coexist with base camera actions but upserts overlapping shake', () => {
    const move = cameraAction('move', 'camera_move', 1, 2)
    const shake = cameraAction('shake', 'camera_shake', 1)
    const nextShake = cameraAction('shake_2', 'camera_shake', 1)

    expect(canCameraActionsCoexist(move, shake)).toBe(true)
    expect(findCameraConflict([move], shake)).toBeNull()
    expect(canCameraActionsCoexist(shake, nextShake)).toBe(false)
    expect(findUpsertableCameraAction([shake], nextShake)).toBe(shake)
  })

  it('sorts same-slot camera actions as cut, movement, then shake', () => {
    const actions = [
      cameraAction('shake', 'camera_shake', 0),
      cameraAction('move', 'camera_move', 0),
      cameraAction('cut', 'camera_cut', 0),
    ]

    expect(sortCameraActionsForEvaluation(actions).map(action => action.id)).toEqual(['cut', 'move', 'shake'])
  })
})
