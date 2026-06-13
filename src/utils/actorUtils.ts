/**
 * 演员工具函数
 * v7.0: 更新为使用实例的查找逻辑
 */

import { useProjectStore } from '@/stores/projectStore'
import type { SceneObject } from '@/types/sceneObject'
import type { SceneContainer } from '@/types/screenplay'

/**
 * 通过 characterId 获取演员配置
 * @param characterId 人物资源 ID
 * @returns 演员配置对象，如果找不到则返回 null
 */
export function getActorByCharacterId(characterId: string) {
  const projectStore = useProjectStore()

  // 从项目级演员配置中查找
  return projectStore.actors.find((a) => a.characterId === characterId) ?? null
}

/**
 * v7.0: 通过实例ID获取场景对象
 * @param scene 场景容器
 * @param instanceId 实例ID (SceneObject.id)
 * @returns 场景对象，如果找不到则返回 null
 */
export function getSceneObjectById(scene: SceneContainer, instanceId: string): SceneObject | null {
  return scene.setup.objects.find(obj => obj.id === instanceId) ?? null
}

/**
 * v7.0: 获取实例的别名
 * @param scene 场景容器
 * @param instanceId 实例ID
 * @returns 别名，如果找不到则返回 null
 */
export function getInstanceAlias(scene: SceneContainer, instanceId: string): string | null {
  const obj = getSceneObjectById(scene, instanceId)
  if (!obj) return null

  return obj.alias ?? null
}
