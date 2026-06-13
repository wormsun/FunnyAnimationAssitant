/**
 * 预定义动作系统 — 系统级推荐名称词表
 *
 * 用于：
 * 1. 系统内置动作模板中 expectedTargets[i].recommendedName
 * 2. 角色编辑器 NamingCheckPanel 的推荐名参考
 * 3. namingDiagnostics D2 缺推荐名检测、D3 非规范命名相似度检测
 *
 * 词表范围：17 项人物组合对象常用部位。不含手、脚。
 *
 * 粗细粒度语义回退（由模板的 ExpectedTarget.fallbackNames 显式声明）：
 *   左上臂 / 左下臂 → 左臂
 *   右上臂 / 右下臂 → 右臂
 *   左大腿 / 左小腿 → 左腿
 *   右大腿 / 右小腿 → 右腿
 */

export const RECOMMENDED_NAMES = [
  '身体',
  '头部',
  '表情',
  '面部',
  '头发',
  '左上臂',
  '左下臂',
  '右上臂',
  '右下臂',
  '左臂',
  '右臂',
  '左大腿',
  '左小腿',
  '右大腿',
  '右小腿',
  '左腿',
  '右腿',
] as const

export type RecommendedName = typeof RECOMMENDED_NAMES[number]

/** 便捷集合 */
export const RECOMMENDED_NAMES_SET: ReadonlySet<string> = new Set(RECOMMENDED_NAMES)

/**
 * 系统推荐名的语义回退表。
 * 用于构建系统内置动作模板时生成 ExpectedTarget.fallbackNames。
 * 仅针对系统级名称；用户自定义动作不享受回退。
 */
export const RECOMMENDED_NAME_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  左上臂: ['左臂'],
  左下臂: ['左臂'],
  右上臂: ['右臂'],
  右下臂: ['右臂'],
  左大腿: ['左腿'],
  左小腿: ['左腿'],
  右大腿: ['右腿'],
  右小腿: ['右腿'],
}

/** 取得某推荐名的回退序列（缺省返回空数组） */
export function getRecommendedFallbacks(name: string): readonly string[] {
  return RECOMMENDED_NAME_FALLBACKS[name] ?? []
}
