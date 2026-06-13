/**
 * 角色命名诊断工具
 *
 * 支持四类检测：
 *   D1 重复 alias：同一角色根子树中 alias 相同的多个对象
 *   D2 缺推荐名：系统推荐名词表中未在角色内出现的项
 *   D3 非规范命名：对象 alias/name 与某推荐名 "相似但不相等"（编辑距离 ≤ 1 或子串关系）
 *   D4 改名影响：改名/改 alias 时，列出受影响的预定义动作
 */

import { RECOMMENDED_NAMES, RECOMMENDED_NAMES_SET } from '@/constants/recommendedNames'
import type { PresetAnimationTemplate } from '@/types/presetAnimation'
import type { SceneObject } from '@/types/sceneObject'
import { collectSubtreeIds } from '@/utils/presetAnimationMapper'

// ===== D1 =====

export interface DuplicateAliasEntry {
  alias: string
  objectIds: string[]
}

export function findDuplicateAliases(
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): DuplicateAliasEntry[] {
  const subtreeIds = collectSubtreeIds(rootCompositeId, sceneObjects)
  const byAlias = new Map<string, string[]>()
  for (const id of subtreeIds) {
    const obj = sceneObjects.get(id)
    if (!obj?.alias) continue
    const bucket = byAlias.get(obj.alias)
    if (bucket) bucket.push(id)
    else byAlias.set(obj.alias, [id])
  }
  const out: DuplicateAliasEntry[] = []
  for (const [alias, ids] of byAlias) {
    if (ids.length > 1) out.push({ alias, objectIds: ids })
  }
  return out
}

// ===== D2 =====

export interface MissingRecommendedEntry {
  recommendedName: string
}

/**
 * 检测推荐名词表中未被角色 alias/name 覆盖的项
 */
export function findMissingRecommendedNames(
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): MissingRecommendedEntry[] {
  const subtreeIds = collectSubtreeIds(rootCompositeId, sceneObjects)
  const present = new Set<string>()
  for (const id of subtreeIds) {
    const obj = sceneObjects.get(id)
    if (!obj) continue
    if (obj.alias) present.add(obj.alias)
    if (obj.name) present.add(obj.name)
  }
  return RECOMMENDED_NAMES
    .filter(n => !present.has(n))
    .map(recommendedName => ({ recommendedName }))
}

// ===== D3 =====

export interface NonStandardNameEntry {
  objectId: string
  field: 'alias' | 'name'
  value: string
  suggested: string
}

/** Levenshtein 编辑距离（迭代实现） */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length
  const n = b.length
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,        // deletion
        (curr[j - 1] ?? 0) + 1,    // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0
  }
  return prev[n] ?? 0
}

/** 判定 candidate 是否与 target "相似但不等"：编辑距离 ≤ 1 或子串关系 */
export function isSimilarButNotEqual(candidate: string, target: string): boolean {
  if (!candidate || !target) return false
  if (candidate === target) return false
  if (candidate.includes(target) || target.includes(candidate)) return true
  return editDistance(candidate, target) <= 1
}

/**
 * 寻找与某推荐名相似但不相等的 alias/name
 * 返回建议把 value 改为 suggested（最接近的推荐名）
 */
export function findNonStandardNames(
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): NonStandardNameEntry[] {
  const subtreeIds = collectSubtreeIds(rootCompositeId, sceneObjects)
  const results: NonStandardNameEntry[] = []

  for (const id of subtreeIds) {
    const obj = sceneObjects.get(id)
    if (!obj) continue

    // 如果对象的 alias/name 本身就是推荐名，跳过
    const aliasIsRecommended = obj.alias ? RECOMMENDED_NAMES_SET.has(obj.alias) : false
    const nameIsRecommended = RECOMMENDED_NAMES_SET.has(obj.name)

    if (!aliasIsRecommended && obj.alias) {
      const sug = findClosestRecommended(obj.alias)
      if (sug) results.push({ objectId: id, field: 'alias', value: obj.alias, suggested: sug })
    }
    // 仅在 alias 为空且 name 不规范时检测 name，避免双重报告
    if (!obj.alias && !nameIsRecommended) {
      const sug = findClosestRecommended(obj.name)
      if (sug) results.push({ objectId: id, field: 'name', value: obj.name, suggested: sug })
    }
  }
  return results
}

function findClosestRecommended(candidate: string): string | undefined {
  for (const rec of RECOMMENDED_NAMES) {
    if (isSimilarButNotEqual(candidate, rec)) return rec
  }
  return undefined
}

// ===== D4 =====

export interface RenameImpactEntry {
  templateId: string
  templateName: string
  origin: 'system' | 'user'
  affectedTargetKeys: string[]
}

/**
 * 分析改名影响：遍历所有模板，列出 expectedTargets 中
 * recommendedName 或 fallbackNames 包含 oldName 的项。
 *
 * 同时匹配 fallbackNames：由于系统模板可通过粗粒度名（左臂 / 右腿）
 * 作为细粒度目标的回退，对粗粒度名的重命名也会影响这些模板。
 */
export function analyzeRenameImpact(
  oldName: string,
  templates: PresetAnimationTemplate[],
): RenameImpactEntry[] {
  const out: RenameImpactEntry[] = []
  for (const tpl of templates) {
    const affected = tpl.expectedTargets
      .filter(t =>
        t.recommendedName === oldName ||
        (t.fallbackNames?.includes(oldName) ?? false),
      )
      .map(t => t.key)
    if (affected.length > 0) {
      out.push({
        templateId: tpl.id,
        templateName: tpl.name,
        origin: tpl.origin,
        affectedTargetKeys: affected,
      })
    }
  }
  return out
}
