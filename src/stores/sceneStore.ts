/**
 * 场景管理 Store
 * 管理当前场景及其脚本节点
 */

import { defineStore } from 'pinia'
import { computed,ref } from 'vue'

import type { Scene, TimelineNode } from '@/types/project'
import type { ActorConfig } from '@/types/screenplay'

export const useSceneStore = defineStore('scene', () => {
  // 场景列表
  const scenes = ref<Scene[]>([])
  // 当前场景
  const currentScene = ref<Scene | null>(null)

  /**
   * 生成唯一ID
   */
  function generateId(prefix = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 创建新场景
   */
  function createScene(name: string, backgroundId: string): Scene {
    const scene: Scene = {
      id: generateId('scene'),
      name,
      backgroundId,
      actors: [],
      script: [],
      duration: 0,
      createdAt: Date.now()
    }

    scenes.value.push(scene)
    currentScene.value = scene

    return scene
  }

  /**
   * 切换当前场景
   */
  function switchScene(sceneId: string): boolean {
    const scene = scenes.value.find(s => s.id === sceneId)
    if (!scene) return false

    currentScene.value = scene
    return true
  }

  /**
   * 设置当前场景
   */
  function setCurrentScene(scene: Scene | null): void {
    currentScene.value = scene
  }

  /**
   * 更新场景信息
   */
  function updateScene(updates: Partial<Scene>): boolean {
    if (!currentScene.value) return false

    Object.assign(currentScene.value, updates)
    return true
  }

  /**
   * 添加角色到场景
   */
  function addActor(actor: ActorConfig): boolean {
    if (!currentScene.value) return false

    currentScene.value.actors.push(actor)
    return true
  }

  /**
   * 从场景移除角色
   */
  function removeActor(actorId: string): boolean {
    if (!currentScene.value) return false

    const index = currentScene.value.actors.findIndex(a => a.id === actorId)
    if (index !== -1) {
      currentScene.value.actors.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 获取场景中的角色
   */
  function getActor(actorId: string): ActorConfig | undefined {
    if (!currentScene.value) return undefined
    return currentScene.value.actors.find(a => a.id === actorId)
  }

  /**
   * 更新角色信息
   */
  function updateActor(actorId: string, updates: Partial<ActorConfig>): boolean {
    const actor = getActor(actorId)
    if (!actor) return false

    Object.assign(actor, updates)
    return true
  }

  /**
   * 添加脚本节点
   */
  function addScriptNode(node: TimelineNode): boolean {
    if (!currentScene.value) return false

    currentScene.value.script.push(node)
    recalculateDuration()
    return true
  }

  /**
   * 移除脚本节点
   */
  function removeScriptNode(nodeId: string): boolean {
    if (!currentScene.value) return false

    const index = currentScene.value.script.findIndex(n => n.id === nodeId)
    if (index !== -1) {
      currentScene.value.script.splice(index, 1)
      recalculateDuration()
      return true
    }
    return false
  }

  /**
   * 获取脚本节点
   */
  function getScriptNode(nodeId: string): TimelineNode | undefined {
    if (!currentScene.value) return undefined
    return currentScene.value.script.find(n => n.id === nodeId)
  }

  /**
   * 更新脚本节点
   */
  function updateScriptNode(nodeId: string, updates: Partial<TimelineNode>): boolean {
    const node = getScriptNode(nodeId)
    if (!node) return false

    Object.assign(node, updates)
    recalculateDuration()
    return true
  }

  /**
   * 重新计算场景时长
   */
  function recalculateDuration(): void {
    if (!currentScene.value) return

    if (currentScene.value.script.length === 0) {
      currentScene.value.duration = 0
      return
    }

    // 找到最后一个节点的结束时间
    const maxEnd = Math.max(
      ...currentScene.value.script.map(node => node.start + node.duration)
    )
    currentScene.value.duration = maxEnd
  }

  /**
   * 涟漪编辑：更新节点时长时自动推移后续节点
   */
  function updateNodeDurationWithRipple(nodeId: string, newDuration: number): boolean {
    if (!currentScene.value) return false

    const node = getScriptNode(nodeId)
    if (!node) return false

    const oldDuration = node.duration
    const deltaTime = newDuration - oldDuration

    // 更新当前节点时长
    node.duration = newDuration

    // 推移后续节点
    if (deltaTime !== 0) {
      currentScene.value.script.forEach(n => {
        if (n.start > node.start) {
          n.start += deltaTime
        }
      })
    }

    recalculateDuration()
    return true
  }

  /**
   * 排序脚本节点（按开始时间）
   */
  function sortScriptNodes(): void {
    if (!currentScene.value) return
    currentScene.value.script.sort((a, b) => a.start - b.start)
  }

  /**
   * 清空场景
   */
  function clearScene(): void {
    currentScene.value = null
  }

  /**
   * 删除场景
   */
  function deleteScene(sceneId: string): boolean {
    const index = scenes.value.findIndex(s => s.id === sceneId)
    if (index === -1) return false

    scenes.value.splice(index, 1)

    // 如果删除的是当前场景，切换到第一个场景
    if (currentScene.value?.id === sceneId) {
      const firstScene = scenes.value[0]
      currentScene.value = firstScene ?? null
    }

    return true
  }

  // 计算属性
  const hasScene = computed(() => currentScene.value !== null)
  const actorCount = computed(() => currentScene.value?.actors.length ?? 0)
  const nodeCount = computed(() => currentScene.value?.script.length ?? 0)
  const sceneDuration = computed(() => currentScene.value?.duration ?? 0)

  return {
    // 状态
    scenes,
    currentScene,
    hasScene,
    actorCount,
    nodeCount,
    sceneDuration,

    // 场景管理
    createScene,
    switchScene,
    setCurrentScene,
    updateScene,
    clearScene,
    deleteScene,

    // 角色管理
    addActor,
    removeActor,
    getActor,
    updateActor,

    // 脚本节点管理
    addScriptNode,
    removeScriptNode,
    getScriptNode,
    updateScriptNode,
    updateNodeDurationWithRipple,
    sortScriptNodes,
    recalculateDuration
  }
})
