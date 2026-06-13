import type { AnimationTrack } from '@/types/animation'
import { TARGET_SELF } from '@/types/animation'
import type { SceneObject } from '@/types/sceneObject'

export interface TrackTargetDisplayOptions {
  track: AnimationTrack
  sceneObject?: SceneObject | undefined
  getObjectName?: ((objectId: string) => string | undefined) | undefined
}

export interface TrackTargetDisplay {
  primary: string
  secondary?: string
  objectName?: string
  targetId?: string | undefined
  isSelf: boolean
}

export function resolveTrackTargetDisplay(options: TrackTargetDisplayOptions): TrackTargetDisplay {
  const { track, sceneObject, getObjectName } = options
  const targetId = 'targetObjectId' in track ? track.targetObjectId : undefined

  if (!targetId || targetId === TARGET_SELF) {
    const selfName = sceneObject?.alias?.trim() ?? sceneObject?.name?.trim()
    return {
      primary: '自身',
      ...(selfName ? { secondary: selfName } : {}),
      ...(selfName ? { objectName: selfName } : {}),
      targetId,
      isSelf: true,
    }
  }

  const objectName = getObjectName?.(targetId)?.trim()
  if (objectName) {
    return {
      primary: objectName,
      objectName,
      targetId,
      isSelf: false,
    }
  }

  return {
    primary: targetId.slice(0, 8),
    targetId,
    isSelf: false,
  }
}
