import * as PIXI from 'pixi.js'

import { useAssetLoader } from '@/composables/useAssetLoader'
import { CANVAS_HEIGHT } from '@/constants/canvas'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import type { Background, PropAsset } from '@/types/project'
import type { SceneObject, SymbolMaterial, SymbolObject } from '@/types/sceneObject'

export interface DefaultObjectSize {
  width: number
  height: number
}

interface AnimationAssetLike {
  url?: string
  backgroundImage?: string
  stillFrameSource?: 'frame' | 'custom'
  stillFrameCustomUrl?: string
  stillFrameIndex?: number
  frames?: { url?: string }[]
}

type ObjectSizeUpdater = (id: string, updates: Pick<SceneObject, 'width' | 'height'>) => void

function roundSize(width: number, height: number): DefaultObjectSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

function resolveAnimationStillUrl(asset: AnimationAssetLike): string | undefined {
  if (asset.stillFrameSource === 'custom') {
    return asset.stillFrameCustomUrl ?? asset.url ?? asset.backgroundImage
  }

  if (asset.stillFrameCustomUrl) return asset.stillFrameCustomUrl

  const indexedFrame = asset.frames?.[asset.stillFrameIndex ?? 0]?.url
  if (indexedFrame) return indexedFrame

  return asset.frames?.find(frame => frame.url)?.url ?? asset.url ?? asset.backgroundImage
}

function resolvePropImageUrl(prop: PropAsset | undefined): string | undefined {
  if (!prop) return undefined
  if (prop.type === 'static') return prop.url
  return resolveAnimationStillUrl(prop)
}

function resolveBackgroundImageUrl(background: Background | undefined): string | undefined {
  if (!background) return undefined
  if (background.type === 'static') return background.url ?? background.backgroundImage
  return resolveAnimationStillUrl(background)
}

export function resolveSymbolMaterial(symbol: SymbolObject): SymbolMaterial | undefined {
  const materialId = symbol.currentMaterialId
  return materialId
    ? symbol.materials?.find(material => material.id === materialId) ?? symbol.materials?.[0]
    : symbol.materials?.[0]
}

function resolveSymbolMaterialImageUrl(material: SymbolMaterial | undefined): string | undefined {
  if (!material) return undefined
  if (material.type === 'static') return material.url
  return resolveAnimationStillUrl(material)
}

export async function measureImageNaturalSize(url: string | undefined): Promise<DefaultObjectSize | null> {
  if (!url) return null

  const { loadAssets, getTexture } = useAssetLoader()
  await loadAssets(new Set([url]), new Set(), 'sceneObjectDefaultSize.measure')

  const texture = getTexture(url)
  if (!texture || texture === PIXI.Texture.EMPTY || !texture.valid) {
    return null
  }

  return roundSize(texture.width, texture.height)
}

function applyBackgroundDefaultScale(size: DefaultObjectSize): DefaultObjectSize {
  const scale = size.height >= CANVAS_HEIGHT ? CANVAS_HEIGHT / size.height : 1
  return roundSize(size.width * scale, size.height * scale) ?? size
}

export async function measurePropDefaultSize(propId: string): Promise<DefaultObjectSize | null> {
  const prop = usePropStore().getProp(propId)
  return measureImageNaturalSize(resolvePropImageUrl(prop))
}

export async function measureBackgroundDefaultSize(backgroundId: string): Promise<DefaultObjectSize | null> {
  const background = useBackgroundStore().getBackground(backgroundId)
  const naturalSize = await measureImageNaturalSize(resolveBackgroundImageUrl(background))
  return naturalSize ? applyBackgroundDefaultScale(naturalSize) : null
}

export async function measureExpressionNaturalSize(expressionId: string): Promise<DefaultObjectSize | null> {
  const expression = useExpressionStore().getExpression(expressionId)
  return measureImageNaturalSize(expression?.defaultFrame?.url)
}

export async function measureExpressionDefaultSize(expressionId: string): Promise<DefaultObjectSize | null> {
  const expression = useExpressionStore().getExpression(expressionId)
  const naturalSize = await measureExpressionNaturalSize(expressionId)
  if (!naturalSize) return null

  const defaultScale = expression?.defaultScale ?? 1
  return roundSize(naturalSize.width * defaultScale, naturalSize.height * defaultScale)
}

export async function measureSymbolDefaultSize(symbol: SymbolObject): Promise<DefaultObjectSize | null> {
  const material = resolveSymbolMaterial(symbol)
  return measureImageNaturalSize(resolveSymbolMaterialImageUrl(material))
}

export async function measureSceneObjectDefaultSize(obj: SceneObject): Promise<DefaultObjectSize | null> {
  switch (obj.type) {
    case 'prop':
      return measurePropDefaultSize(obj.refId)
    case 'background':
      return measureBackgroundDefaultSize(obj.refId)
    case 'expression':
      return measureExpressionDefaultSize(obj.refId)
    case 'symbol':
      return measureSymbolDefaultSize(obj as SymbolObject)
    default:
      return null
  }
}

export async function applyMeasuredDefaultSize(
  obj: SceneObject,
  updateObject: ObjectSizeUpdater,
): Promise<DefaultObjectSize | null> {
  const measured = await measureSceneObjectDefaultSize(obj)
  if (!measured) return null

  if (obj.width !== measured.width || obj.height !== measured.height) {
    updateObject(obj.id, {
      width: measured.width,
      height: measured.height,
    })
  }

  return measured
}

export async function syncExpressionInstanceDefaultSizes(
  expressionId: string,
  objects: readonly SceneObject[],
  updateObject: ObjectSizeUpdater,
): Promise<void> {
  const measured = await measureExpressionDefaultSize(expressionId)

  for (const obj of objects) {
    if (obj.type !== 'expression') continue
    if (obj.refId !== expressionId && (obj as { defaultRefId?: string }).defaultRefId !== expressionId) continue

    updateObject(obj.id, {
      width: measured?.width ?? obj.width,
      height: measured?.height ?? obj.height,
    })
  }
}
