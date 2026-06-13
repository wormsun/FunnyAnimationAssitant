/**
 * SceneObjectProvider — 场景对象数据访问抽象接口
 *
 * 将 useSceneRenderer / useSceneGraph 对 sceneObjectStore 的直接依赖抽象为接口，
 * 使得动画编辑等场景可以注入独立的 store 实现，实现完全数据隔离。
 *
 * 全局 sceneObjectStore 天然满足此接口（子集），无需适配。
 */

import type { SceneObject, SceneObjectUpdateFor } from '@/types/sceneObject'
import type { SlotStatesResult } from '@/utils/sceneStateCalculator'

export interface SceneObjectProvider {
  // ---- Reactive state ----
  /**
   * 当前活跃层的对象列表（setup 或 runtime）。
   * 对于 Pinia store，这是自动 unwrap 的 computed（直接返回数组）。
   * 对于自定义实现，需要提供 getter 返回响应式数组。
   */
  readonly objects: SceneObject[]
  /** 当前选中的对象 ID（Pinia 自动 unwrap 为 string | null） */
  selectedObjectId: string | null

  // ---- Read methods ----
  getObject(id: string): SceneObject | undefined
  getSortedObjects(): SceneObject[]
  getSceneRenderChain(): string[]

  // ---- Write methods ----
  selectObject(id: string | null): void
  updateObject<T extends SceneObject = SceneObject>(id: string, updates: SceneObjectUpdateFor<T>): void
  updateSetupObject<T extends SceneObject = SceneObject>(id: string, updates: SceneObjectUpdateFor<T>): void

  // ---- Optional: Action Mode ----
  applySlotState?(slotStates: SlotStatesResult, excludeIds?: Set<string>): void
}
