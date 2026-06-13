/**
 * 预制动画模板类型定义 (v3 — 名称寻址版)
 *
 * 所有预制动作通过 `targetName`（字符串，alias 或 name）寻址轨道目标对象。
 * 废除 rig 机制：不再使用 requiredRigs / rigTracks / ArticulatedRigId。
 *
 * 实例化结果始终为单一 TrackAnimationDefinition（含多条指向不同 targetObjectId 的轨道）。
 */

import type { AnimationTrack } from './animation'

/** 预制动画分类 */
export type PresetAnimationCategory =
  | 'locomotion'
  | 'gesture'
  | 'idle'
  | 'emotion'
  | 'custom'

/**
 * 分布式 Omit：对联合类型的每个成员独立执行 Omit
 * 标准 Omit<A|B, K> 只保留 A∩B 的公共键；DistributiveOmit 保留各成员的独有键。
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * 模板内目标描述
 *
 * - `key`：模板内稳定标识符（即便 recommendedName 改动也不影响 tracks 绑定）
 * - `recommendedName`：寻址用推荐名（alias 或 name），解析器在角色根子树中先按 alias 再按 name 查找
 * - `optional`：可选部位。缺失时不阻塞应用，仅标注为 skipped
 * - `hint`：UI 提示
 */
export interface ExpectedTarget {
  key: string
  recommendedName: string
  /** 名称回退序列：精确匹配失败时按顺序尝试（粗粒度回退，如 左上臂 → 左臂） */
  fallbackNames?: string[]
  optional?: boolean
  hint?: string
}

/**
 * 目标对应的轨道组
 *
 * 实例化时，系统将 targetKey 映射为具体对象 UUID，
 * 将 tracks 中每条轨道注入 targetObjectId 后合并到统一的 TrackAnimationDefinition。
 */
export interface TargetTrackGroup {
  targetKey: string
  /** 轨道列表（模板中不含 targetObjectId，实例化时填充） */
  tracks: DistributiveOmit<AnimationTrack, 'targetObjectId'>[]
}

/** 预定义动作模板 */
export interface PresetAnimationTemplate {
  id: string
  name: string
  description?: string
  tags?: string[]
  category: PresetAnimationCategory
  thumbnailUrl?: string
  /** 模板来源: 'system' = 系统内置, 'user' = 用户自定义 */
  origin: 'system' | 'user'

  /** 模板期望的目标列表（推荐名寻址） */
  expectedTargets: ExpectedTarget[]
  /** 各目标的动画轨道 */
  targetTracks: TargetTrackGroup[]

  /** 是否循环 */
  loop: boolean
  /** 动画结束后的填充行为 */
  fillMode?: 'none' | 'forwards'
  /** 显式总时长 (ms)，各轨道也可有独立 duration */
  duration?: number
}

/**
 * 模板数据完整性校验
 */
export function validatePresetTemplate(template: PresetAnimationTemplate): string[] {
  const errors: string[] = []

  const expectedKeys = new Set(template.expectedTargets.map(t => t.key))

  // 1. targetTracks 中的 key 必须在 expectedTargets 中声明
  for (const group of template.targetTracks) {
    if (!expectedKeys.has(group.targetKey)) {
      errors.push(`targetTrack "${group.targetKey}" 不在 expectedTargets 中`)
    }
    if (group.tracks.length === 0) {
      errors.push(`targetTrack "${group.targetKey}" 无轨道数据`)
    }
  }

  // 2. 非 optional 的 expectedTargets 必须有对应的 targetTrack
  const coveredKeys = new Set(template.targetTracks.map(g => g.targetKey))
  for (const t of template.expectedTargets) {
    if (!t.optional && !coveredKeys.has(t.key)) {
      errors.push(`expectedTarget "${t.key}" (${t.recommendedName}) 无对应的 targetTrack 定义`)
    }
  }

  // 3. expectedTargets.key 不得重复
  const keyCount = new Map<string, number>()
  for (const t of template.expectedTargets) {
    keyCount.set(t.key, (keyCount.get(t.key) ?? 0) + 1)
  }
  for (const [key, count] of keyCount) {
    if (count > 1) errors.push(`expectedTargets 中 key "${key}" 重复 ${count} 次`)
  }

  return errors
}
