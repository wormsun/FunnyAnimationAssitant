import type { CompositeObject, SceneObject } from '@/types/sceneObject'

function isRenderableType(type: SceneObject['type']): boolean {
  return type !== 'camera' && type !== 'audio' && type !== 'light'
}

function isUnionComposite(obj: SceneObject): boolean {
  return obj.type === 'composite' && (obj as CompositeObject).compositeMode === 'union'
}

function isEntityComposite(obj: SceneObject): boolean {
  return obj.type === 'composite' && (obj as CompositeObject).compositeMode === 'entity'
}

export interface PreviewChainDiagnostic {
  rootRenderableIds: string[]
  missingRootRenderableIds: string[]
}

export interface BoundsLike {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 诊断预览 renderChain 是否覆盖了根级可渲染对象。
 *
 * 规则：
 * - camera/audio/light 不参与渲染链
 * - 根级 union composite 自身不应出现在 renderChain（其子对象展开）
 * - 根级 entity composite 应出现在 renderChain
 * - 其他根级可渲染对象应出现在 renderChain
 */
export function diagnosePreviewRenderChain(
  objects: readonly SceneObject[],
  renderChain: readonly string[],
): PreviewChainDiagnostic {
  const chainSet = new Set(renderChain)
  const rootRenderableIds: string[] = []
  const missingRootRenderableIds: string[] = []

  for (const obj of objects) {
    if (obj.parentId) continue
    if (!isRenderableType(obj.type)) continue
    if (isUnionComposite(obj)) continue

    rootRenderableIds.push(obj.id)
    if (!chainSet.has(obj.id)) {
      missingRootRenderableIds.push(obj.id)
    }
  }

  return { rootRenderableIds, missingRootRenderableIds }
}

/**
 * 仅用于调试输出：汇总根级对象关键可见性字段。
 */
export function collectRootVisibilitySnapshot(objects: readonly SceneObject[]): Record<string, unknown>[] {
  return objects
    .filter(o => !o.parentId)
    .map(o => ({
      id: o.id,
      type: o.type,
      isEntityComposite: isEntityComposite(o),
      isUnionComposite: isUnionComposite(o),
      x: o.x,
      y: o.y,
      alpha: o.alpha,
      visible: o.visible,
      spawned: o.spawned ?? true,
      zIndex: o.zIndex,
    }))
}

/**
 * 选择预览 fitContent 使用的边界：
 * 优先 contentLayer（真实内容），无效时回退 stage。
 */
export function choosePreviewFitBounds(
  contentLayerBounds: BoundsLike | null | undefined,
  stageBounds: BoundsLike,
): { chosen: 'contentLayer' | 'stage'; bounds: BoundsLike } {
  if (contentLayerBounds && contentLayerBounds.width > 0 && contentLayerBounds.height > 0) {
    return { chosen: 'contentLayer', bounds: contentLayerBounds }
  }
  return { chosen: 'stage', bounds: stageBounds }
}
