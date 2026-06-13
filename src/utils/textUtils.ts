/**
 * 文本处理工具函数
 */

/**
 * 统一文本换行符，避免 CRLF / Unicode Line Separator 干扰渲染与测量。
 */
export function normalizeTextContent(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\r\u2028\u2029]/g, '\n')
}

/**
 * 自动行高策略：统一安全系数，避免跨字体出现重叠。
 */
export function getAutoTextLineHeight(_fontFamily: string | null | undefined, fontSize: number | null | undefined): number {
  const size = fontSize ?? 72
  return size * 1.2
}

export type TextLineHeightSource = 'auto' | 'explicit' | 'legacy-auto-migrated'

export interface ResolvedTextLineHeight {
  lineHeight: number
  source: TextLineHeightSource
}

/**
 * 统一行高解析：
 * - undefined/null/非法值 => 自动
 * - 历史自动值（fontSize * 1.3）=> 迁移到自动
 * - 其它正数 => 显式行高
 */
export function resolveTextLineHeight(
  fontFamily: string | null | undefined,
  fontSize: number | null | undefined,
  lineHeight: number | null | undefined,
): ResolvedTextLineHeight {
  const auto = getAutoTextLineHeight(fontFamily, fontSize)
  if (lineHeight === undefined || lineHeight === null) {
    return { lineHeight: auto, source: 'auto' }
  }

  const explicit = Number(lineHeight)
  if (!Number.isFinite(explicit) || explicit <= 0) {
    return { lineHeight: auto, source: 'auto' }
  }

  const size = fontSize ?? 72
  const legacyAuto = size * 1.3
  if (Math.abs(explicit - legacyAuto) < 0.01) {
    return { lineHeight: auto, source: 'legacy-auto-migrated' }
  }

  return { lineHeight: explicit, source: 'explicit' }
}

/**
 * 自动 leading（行距附加项）补偿：
 * 使用 0 作为统一安全默认值，避免负 leading 导致文字重叠。
 */
export function getAutoTextLeading(
  _fontFamily: string | null | undefined,
  _fontSize: number | null | undefined,
  explicitLineHeight?: number | null,
): number {
  if (explicitLineHeight !== undefined && explicitLineHeight !== null) return 0
  return 0
}

/**
 * 将角度映射到 PIXI 可用的线性渐变方向（水平/垂直 + 正反向）。
 * 注：PIXI.TextStyle 本身不支持任意角度，这里取最接近的 4 向离散映射。
 */
export function resolveTextGradient(
  stops: { offset: number; color: string }[] | null | undefined,
  angleDeg: number | null | undefined,
): { colors: string[]; gradientStops: number[]; gradientType: 0 | 1 } | null {
  if (!stops || stops.length === 0) return null
  const sorted = [...stops].sort((a, b) => a.offset - b.offset)
  let colors = sorted.map(s => s.color)
  let gradientStops = sorted.map(s => s.offset)

  const angle = ((angleDeg ?? 90) % 360 + 360) % 360
  // 0: left->right, 90: top->bottom, 180: right->left, 270: bottom->top
  const horizontal = (angle < 45) || (angle >= 135 && angle < 225) || (angle >= 315)
  const reverse = (angle >= 135 && angle < 315)

  if (reverse) {
    colors = [...colors].reverse()
    gradientStops = gradientStops.map(v => 1 - v).reverse()
  }

  return {
    colors,
    gradientStops,
    gradientType: horizontal ? 1 : 0, // 0=vertical, 1=horizontal
  }
}

/**
 * 中间截断字符串
 * @param text 原始文本
 * @param maxLength 最大长度
 * @param startChars 保留开头的字符数
 * @param endChars 保留结尾的字符数
 * @returns 截断后的文本
 */
export function truncateMiddle(
  text: string,
  maxLength = 20,
  startChars = 8,
  endChars = 8
): string {
  if (!text || text.length <= maxLength) {
    return text
  }

  // 如果文本太短，无法按要求保留前后字符，则直接保留前半部分
  if (text.length <= startChars + endChars + 3) {
    return text.substring(0, maxLength - 3) + '...'
  }

  return `${text.substring(0, startChars)}...${text.substring(text.length - endChars)}`
}
