import * as PIXI from 'pixi.js'

import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import type { SceneObjectProvider } from '@/types/SceneObjectProvider'
import { sortRenderChainByZIndex } from '@/utils/renderChainUtils'

export type PickReason = 'object' | 'composite-bounds' | 'blank'

export interface PickResult {
  rawHitId: string | null
  selectTargetId: string | null
  dragTargetId: string | null
  reason: PickReason
}

interface PickCandidate {
  objectId: string
  reason: Exclude<PickReason, 'blank'>
  rank: number
}

export interface ScenePickingOptions {
  store: SceneObjectProvider
  getContainer: (objectId: string) => PIXI.Container | undefined
  isPassThrough: (objectId: string) => boolean
}

export function useScenePicking(options: ScenePickingOptions) {
  const { store, getContainer, isPassThrough } = options

  function getZIndex(objectId: string): number {
    return store.getObject(objectId)?.zIndex ?? 0
  }

  function isComposite(obj: SceneObject | undefined): obj is CompositeObject {
    return obj?.type === 'composite'
  }

  function isSceneObjectPickable(obj: SceneObject | undefined): obj is SceneObject {
    if (!obj) return false
    if (obj.type === 'audio') return false
    if (obj.spawned === false) return false
    if (!obj.visible) return false
    if (obj.alpha <= 0) return false
    if (hasPassThroughInAncestry(obj.id)) return false
    return true
  }

  function hasPassThroughInAncestry(objectId: string): boolean {
    let current: SceneObject | undefined = store.getObject(objectId)
    while (current) {
      if (isPassThrough(current.id)) return true
      current = current.parentId ? store.getObject(current.parentId) : undefined
    }
    return false
  }

  function collectDescendantIds(compositeId: string, result = new Set<string>()): Set<string> {
    const comp = store.getObject(compositeId)
    if (!isComposite(comp)) return result

    for (const childId of comp.childIds ?? []) {
      if (result.has(childId)) continue
      result.add(childId)
      const child = store.getObject(childId)
      if (isComposite(child)) {
        collectDescendantIds(child.id, result)
      }
    }
    return result
  }

  function buildDrawOrderRanks(): Map<string, number> {
    const ranks = new Map<string, number>()
    let rank = 0

    const visitChain = (chain: readonly string[]) => {
      const sortedChain = sortRenderChainByZIndex(chain, getZIndex)
      for (const objectId of sortedChain) {
        const obj = store.getObject(objectId)
        if (!obj) continue

        if (isComposite(obj) && obj.compositeMode === 'entity') {
          ranks.set(obj.id, ++rank)
          if (obj.renderChain?.length) {
            visitChain(obj.renderChain)
          }
          continue
        }

        ranks.set(obj.id, ++rank)
      }
    }

    visitChain(store.getSceneRenderChain())

    // Editor overlays are not renderChain participants, but their visible handles
    // are drawn above scene content and should remain pickable when not pass-through.
    for (const obj of store.objects) {
      if (ranks.has(obj.id)) continue
      if (obj.type === 'camera' || obj.type === 'light') {
        ranks.set(obj.id, ++rank)
      }
    }

    return ranks
  }

  function getCompositeBoundsRank(compositeId: string, ranks: Map<string, number>): number {
    const ownRank = ranks.get(compositeId)
    if (ownRank !== undefined) return ownRank - 0.1

    let maxDescendantRank = Number.NEGATIVE_INFINITY
    for (const descendantId of collectDescendantIds(compositeId)) {
      const descendantRank = ranks.get(descendantId)
      if (descendantRank !== undefined) {
        maxDescendantRank = Math.max(maxDescendantRank, descendantRank)
      }
    }

    return Number.isFinite(maxDescendantRank) ? maxDescendantRank - 0.1 : Number.NEGATIVE_INFINITY
  }

  function buildPickCandidates(): PickCandidate[] {
    const ranks = buildDrawOrderRanks()
    const candidates: PickCandidate[] = []

    for (const [objectId, rank] of ranks) {
      const obj = store.getObject(objectId)
      if (!isSceneObjectPickable(obj)) continue
      if (isComposite(obj)) continue
      candidates.push({ objectId, reason: 'object', rank })
    }

    for (const obj of store.objects) {
      if (!isComposite(obj)) continue
      if (!isSceneObjectPickable(obj)) continue
      const rank = getCompositeBoundsRank(obj.id, ranks)
      if (!Number.isFinite(rank)) continue
      candidates.push({ objectId: obj.id, reason: 'composite-bounds', rank })
    }

    candidates.sort((a, b) => b.rank - a.rank)
    return candidates
  }

  function hitTestContainer(container: PIXI.Container, globalPoint: PIXI.IPointData): boolean {
    if (container.destroyed || !isContainerVisible(container)) return false

    const localPoint = container.toLocal(globalPoint)
    const hitArea = container.hitArea as (PIXI.IHitArea & { contains?: (x: number, y: number) => boolean }) | null
    if (hitArea?.contains) {
      return hitArea.contains(localPoint.x, localPoint.y)
    }

    const bounds = container.getLocalBounds()
    return (
      localPoint.x >= bounds.x
      && localPoint.x <= bounds.x + bounds.width
      && localPoint.y >= bounds.y
      && localPoint.y <= bounds.y + bounds.height
    )
  }

  function isContainerVisible(container: PIXI.Container): boolean {
    let current: PIXI.Container | PIXI.DisplayObject | null = container
    while (current) {
      if (!current.visible || !current.renderable || current.worldAlpha <= 0) {
        return false
      }
      current = current.parent
    }
    return true
  }

  function hitTestObject(objectId: string, globalPoint: PIXI.IPointData): boolean {
    const obj = store.getObject(objectId)
    if (!isSceneObjectPickable(obj)) return false

    const container = getContainer(objectId)
    if (!container) return false

    return hitTestContainer(container, globalPoint)
  }

  function hitTestAnyDescendant(compositeId: string, globalPoint: PIXI.IPointData): boolean {
    for (const descendantId of collectDescendantIds(compositeId)) {
      const descendant = store.getObject(descendantId)
      if (isComposite(descendant)) continue
      if (hitTestObject(descendantId, globalPoint)) return true
    }
    return false
  }

  function resolveSelectionTarget(rawHitId: string | null): string | null {
    if (!rawHitId) return null

    let selectedId = rawHitId
    let current = store.getObject(rawHitId)

    while (current?.parentId) {
      const ancestor = store.getObject(current.parentId)
      if (isComposite(ancestor) && ancestor.compositeLocked) {
        selectedId = ancestor.id
      }
      current = ancestor
    }

    return selectedId
  }

  function pickAt(globalPoint: PIXI.IPointData): PickResult {
    const candidates = buildPickCandidates()

    for (const candidate of candidates) {
      if (candidate.reason === 'composite-bounds' && hitTestAnyDescendant(candidate.objectId, globalPoint)) {
        continue
      }

      if (!hitTestObject(candidate.objectId, globalPoint)) continue

      const selectTargetId = resolveSelectionTarget(candidate.objectId)
      return {
        rawHitId: candidate.objectId,
        selectTargetId,
        dragTargetId: selectTargetId,
        reason: candidate.reason,
      }
    }

    return {
      rawHitId: null,
      selectTargetId: null,
      dragTargetId: null,
      reason: 'blank',
    }
  }

  return {
    pickAt,
    buildPickCandidates,
    hitTestObject,
    resolveSelectionTarget,
  }
}
