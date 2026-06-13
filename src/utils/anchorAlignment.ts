import type { Expression } from '@/types/project'

interface AlignableAsset {
  offsetFix?: { x: number; y: number }
  pivot?: { x: number; y: number }
}

/**
 * 锚点对齐工具函数
 * 用于在更换表情资源时保持视觉位置一致
 */

/**
 * 计算新资源的offset，使新锚点与旧锚点对齐
 * @param oldResource 旧资源
 * @param newResource 新资源
 * @param oldExpression 旧表情数据（包含anchor信息）
 * @param newExpression 新表情数据（包含anchor信息）
 * @param assumedImageSize 假设的图片尺寸（默认200x200）
 * @returns 新的offset坐标
 */
export function calculateAlignedOffset(
  oldResource: AlignableAsset,
  oldExpression: Expression,
  newExpression: Expression,
  assumedImageSize = 200
): { x: number; y: number } {
  // 使用表情数据中的 anchor
  const oldAnchor = oldExpression.anchor
  const newAnchor = newExpression.anchor
  // 资源本身不再携带 scale，按 1 处理
  const oldScale = { x: 1, y: 1 }
  const newScale = { x: 1, y: 1 }
  
  // 计算旧锚点的世界位置（相对于资源中心）
  // anchor 是相对坐标 (0-1)，需要转换为像素坐标
  const oldAnchorWorldX = (oldAnchor.x - 0.5) * assumedImageSize * Math.abs(oldScale.x)
  const oldAnchorWorldY = (oldAnchor.y - 0.5) * assumedImageSize * Math.abs(oldScale.y)
  
  // 计算新锚点的世界位置（相对于资源中心）
  const newAnchorWorldX = (newAnchor.x - 0.5) * assumedImageSize * Math.abs(newScale.x)
  const newAnchorWorldY = (newAnchor.y - 0.5) * assumedImageSize * Math.abs(newScale.y)
  
  // 计算新的 offset，使新锚点与旧锚点对齐
  const oldOffsetX = oldResource.offsetFix?.x ?? 0
  const oldOffsetY = oldResource.offsetFix?.y ?? 0
  const newOffsetX = oldOffsetX + oldAnchorWorldX - newAnchorWorldX
  const newOffsetY = oldOffsetY + oldAnchorWorldY - newAnchorWorldY
  
  return { x: newOffsetX, y: newOffsetY }
}

/**
 * 应用锚点对齐到新资源
 * @param oldResource 旧资源
 * @param newResource 新资源（会被修改）
 * @param oldExpression 旧表情数据
 * @param newExpression 新表情数据
 * @param assumedImageSize 假设的图片尺寸
 */
export function applyAnchorAlignment(
  oldResource: AlignableAsset,
  newResource: AlignableAsset,
  oldExpression: Expression,
  newExpression: Expression,
  assumedImageSize = 200
): void {
  const newOffset = calculateAlignedOffset(
    oldResource,
    oldExpression,
    newExpression,
    assumedImageSize
  )
  
  // 更新新资源的 offsetFix
  newResource.offsetFix ??= { x: 0, y: 0 }
  newResource.offsetFix.x = newOffset.x
  newResource.offsetFix.y = newOffset.y
  
  // 同时更新新资源的 pivot 为新表情的 anchor
  newResource.pivot = { ...newExpression.anchor }
}
