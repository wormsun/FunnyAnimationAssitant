/**
 * 预制动画模板实例化器 (v3 — 名称寻址版)
 *
 * 将 targetName（alias 或 name） 寻址的 PresetAnimationTemplate
 * 转换为 UUID 寻址的 TrackAnimationDefinition。
 *
 * 寻址优先级：
 *   1. alias 精确匹配
 *   2. name 精确匹配
 *   3. 未命中 → missing
 *   4. 多命中 → ambiguous
 *
 * 作用域：角色根复合子树内（不跨角色）
 */

import { nanoid } from 'nanoid'

import type {
  AnimationTrack,
  TrackAnimationDefinition,
} from '@/types/animation'
import type {
  DistributiveOmit,
  ExpectedTarget,
  PresetAnimationTemplate,
  TargetTrackGroup,
} from '@/types/presetAnimation'
import type { SceneObject } from '@/types/sceneObject'

// ===== 类型定义 =====

export interface ResolveResult {
  status: 'unique' | 'missing' | 'ambiguous'
  objectId?: string
  /** ambiguous 时的候选对象 ID 列表 */
  candidates?: string[]
}

export interface DiagnosticsUniqueEntry {
  targetKey: string
  recommendedName: string
  objectId: string
}

export interface DiagnosticsMissingEntry {
  targetKey: string
  recommendedName: string
  optional: boolean
  hint?: string
}

export interface DiagnosticsAmbiguousEntry {
  targetKey: string
  recommendedName: string
  candidates: string[]
  hint?: string
}

export interface InstantiationDiagnostics {
  unique: DiagnosticsUniqueEntry[]
  missing: DiagnosticsMissingEntry[]
  ambiguous: DiagnosticsAmbiguousEntry[]
}

export interface InstantiationResult {
  animation: TrackAnimationDefinition
  diagnostics: InstantiationDiagnostics
}

// ===== 子树收集 =====

/**
 * 从根复合对象出发，按 parentId / childIds 关系收集整棵子树的对象 ID。
 * 遇到循环引用时安全跳出。
 */
export function collectSubtreeIds(
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): Set<string> {
  const visited = new Set<string>()
  const stack: string[] = [rootCompositeId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    const obj = sceneObjects.get(id)
    if (!obj) continue
    if (obj.type === 'composite') {
      const childIds = (obj as { childIds?: string[] }).childIds ?? []
      for (const cid of childIds) {
        if (!visited.has(cid)) stack.push(cid)
      }
    }
  }
  return visited
}

// ===== 名称寻址 =====

/**
 * 在角色根子树内按名称查找目标对象
 * 优先级：alias 精确匹配 → name 精确匹配
 */
export function resolveTargetByName(
  name: string,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): ResolveResult {
  if (!name) return { status: 'missing' }
  const subtreeIds = collectSubtreeIds(rootCompositeId, sceneObjects)

  // Pass 1: alias 精确匹配
  const aliasMatches: string[] = []
  for (const id of subtreeIds) {
    const obj = sceneObjects.get(id)
    if (obj?.alias && obj.alias === name) aliasMatches.push(id)
  }
  if (aliasMatches.length === 1) return { status: 'unique', objectId: aliasMatches[0]! }
  if (aliasMatches.length > 1) return { status: 'ambiguous', candidates: aliasMatches }

  // Pass 2: name 精确匹配
  const nameMatches: string[] = []
  for (const id of subtreeIds) {
    const obj = sceneObjects.get(id)
    if (obj?.name === name) nameMatches.push(id)
  }
  if (nameMatches.length === 1) return { status: 'unique', objectId: nameMatches[0]! }
  if (nameMatches.length > 1) return { status: 'ambiguous', candidates: nameMatches }

  return { status: 'missing' }
}

// ===== 诊断 =====

/**
 * 检查模板是否可应用于指定角色根对象
 *
 * 返回完整诊断结果：哪些目标唯一命中、哪些缺失、哪些歧义
 */
export function canApplyPreset(
  template: PresetAnimationTemplate,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
  overrides?: Record<string, string>,
): InstantiationDiagnostics {
  const diagnostics: InstantiationDiagnostics = {
    unique: [],
    missing: [],
    ambiguous: [],
  }

  for (const target of template.expectedTargets) {
    // 手动 override 优先
    const overrideId = overrides?.[target.key]
    if (overrideId) {
      if (sceneObjects.has(overrideId)) {
        diagnostics.unique.push({
          targetKey: target.key,
          recommendedName: target.recommendedName,
          objectId: overrideId,
        })
        continue
      }
      // override 指向不存在的对象：按 missing 处理
    }

    const result = resolveTargetWithFallback(target, rootCompositeId, sceneObjects)
    addDiagnosticEntry(diagnostics, target, result)
  }

  return diagnostics
}

/**
 * 按推荐名 + fallbackNames 顺序依次尝试解析目标。
 *
 * 规则：
 *   - unique 命中 → 立即返回
 *   - ambiguous 命中 → 立即返回（歧义是终态，不应被后续 fallback 掩盖）
 *   - missing → 继续尝试下一个候选
 * 若所有候选均 missing，返回 missing。
 */
function resolveTargetWithFallback(
  target: ExpectedTarget,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): ResolveResult {
  const candidates = [target.recommendedName, ...(target.fallbackNames ?? [])]
  for (const name of candidates) {
    const result = resolveTargetByName(name, rootCompositeId, sceneObjects)
    if (result.status === 'unique' || result.status === 'ambiguous') return result
  }
  return { status: 'missing' }
}

function addDiagnosticEntry(
  diagnostics: InstantiationDiagnostics,
  target: ExpectedTarget,
  result: ResolveResult,
): void {
  if (result.status === 'unique' && result.objectId) {
    diagnostics.unique.push({
      targetKey: target.key,
      recommendedName: target.recommendedName,
      objectId: result.objectId,
    })
  } else if (result.status === 'ambiguous') {
    const entry: DiagnosticsAmbiguousEntry = {
      targetKey: target.key,
      recommendedName: target.recommendedName,
      candidates: result.candidates ?? [],
    }
    if (target.hint !== undefined) entry.hint = target.hint
    diagnostics.ambiguous.push(entry)
  } else {
    const entry: DiagnosticsMissingEntry = {
      targetKey: target.key,
      recommendedName: target.recommendedName,
      optional: target.optional ?? false,
    }
    if (target.hint !== undefined) entry.hint = target.hint
    diagnostics.missing.push(entry)
  }
}

/** 诊断是否可以直接应用（无阻塞 missing / ambiguous） */
export function isDiagnosticsApplicable(diagnostics: InstantiationDiagnostics): boolean {
  const blockingMissing = diagnostics.missing.filter(m => !m.optional)
  return blockingMissing.length === 0 && diagnostics.ambiguous.length === 0
}

// ===== 实例化 =====

/**
 * 实例化预制动画模板
 *
 * @param template 预制动画模板（名称寻址）
 * @param rootCompositeId 角色根复合对象 ID
 * @param sceneObjects 场景对象 Map（用于名称解析）
 * @param overrides 手动指定的 targetKey → objectId 覆盖（处理 missing / ambiguous）
 */
export function instantiatePresetAnimation(
  template: PresetAnimationTemplate,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
  overrides?: Record<string, string>,
): InstantiationResult {
  const diagnostics = canApplyPreset(template, rootCompositeId, sceneObjects, overrides)

  // 构建 targetKey → objectId 解析表
  const keyToObjectId = new Map<string, string>()
  for (const entry of diagnostics.unique) {
    keyToObjectId.set(entry.targetKey, entry.objectId)
  }

  const now = Date.now()
  const allTracks: AnimationTrack[] = []

  // 遍历模板的 targetTracks，将 targetKey → UUID
  for (const group of template.targetTracks) {
    const objectId = keyToObjectId.get(group.targetKey)
    if (!objectId) continue // missing / ambiguous 的目标 → 跳过其轨道

    for (const templateTrack of group.tracks) {
      const track: AnimationTrack = {
        ...templateTrack,
        targetObjectId: objectId,
      } as AnimationTrack
      allTracks.push(track)
    }
  }

  const animation: TrackAnimationDefinition = {
    type: 'track',
    id: nanoid(),
    name: template.name,
    loop: template.loop,
    tracks: allTracks,
    createdAt: now,
    updatedAt: now,
  }
  if (template.description !== undefined) animation.description = template.description
  if (template.tags !== undefined) animation.tags = template.tags
  if (template.fillMode !== undefined) animation.fillMode = template.fillMode
  if (template.duration !== undefined) animation.duration = template.duration

  return { animation, diagnostics }
}

/**
 * 反向采集：从现有的 TrackAnimationDefinition 生成 ExpectedTargets
 *
 * 用于 "保存为预定义动作" 向导：
 * 扫描动画所有 tracks 的 targetObjectId，读取对应对象的 alias（回退 name），
 * 汇总为 expectedTargets + targetTracks。
 *
 * @returns 采集结果，若任何轨道的 targetObjectId 未找到对应对象，返回 error
 */
export function extractPresetTargetsFromAnimation(
  animation: TrackAnimationDefinition,
  sceneObjects: Map<string, SceneObject>,
): {
  expectedTargets: ExpectedTarget[]
  targetTracks: TargetTrackGroup[]
  warnings: string[]
} {
  const warnings: string[] = []
  const objectIdToKey = new Map<string, string>()
  const targetsByKey = new Map<string, ExpectedTarget>()
  const tracksByKey = new Map<string, DistributiveOmit<AnimationTrack, 'targetObjectId'>[]>()

  for (const track of animation.tracks) {
    const targetId = track.targetObjectId
    if (!targetId || targetId === '_self') {
      warnings.push(`轨道 "${track.displayName ?? track.trackType}" 的目标为 _self 或未设置，无法导出`)
      continue
    }
    const obj = sceneObjects.get(targetId)
    if (!obj) {
      warnings.push(`轨道 "${track.displayName ?? track.trackType}" 的目标对象 ${targetId} 不存在`)
      continue
    }

    let key = objectIdToKey.get(targetId)
    if (!key) {
      const aliasName = obj.alias?.trim()
      const recommendedName = aliasName && aliasName.length > 0 ? aliasName : obj.name
      if (recommendedName.trim() === '') {
        warnings.push(`对象 ${targetId} 缺少 alias 和 name，无法作为推荐名`)
        continue
      }
      key = `target_${targetsByKey.size + 1}`
      objectIdToKey.set(targetId, key)
      targetsByKey.set(key, { key, recommendedName })
      tracksByKey.set(key, [])
    }

    // 从 track 中剥离 targetObjectId 以匹配模板格式
    const { targetObjectId: _omit, ...rest } = track as AnimationTrack & { targetObjectId?: string }
    void _omit
    tracksByKey.get(key)!.push(rest as DistributiveOmit<AnimationTrack, 'targetObjectId'>)
  }

  return {
    expectedTargets: Array.from(targetsByKey.values()),
    targetTracks: Array.from(tracksByKey.entries()).map(([targetKey, tracks]) => ({ targetKey, tracks })),
    warnings,
  }
}
