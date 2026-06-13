/**
 * Episode Store - 集管理
 * 负责管理项目中的多个集（Episode）
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { BGMTrack, SceneContainer, ScriptBlock } from '@/types/screenplay'

import { useProjectStore } from './projectStore'

/**
 * 演员配置
 */
export interface Actor {
  id: string                 // 脚本中引用的名字（如"小明"）
  name: string               // 演员名称
  characterId: string        // 关联的人物ID
  voiceId: number            // TTS Provider 音色 ID
}

/**
 * 旁白配置
 */
export interface Narrator {
  id: string      // 旁白ID
  name: string    // 旁白名称（如"旁白1"）
  voiceId: number // TTS Provider 音色 ID
}

/**
 * 集（Episode）
 * v6.0: 合并了Screenplay，直接包含剧本内容（scenes）
 * 演员和旁白配置已移至 Project 层级
 */
export interface Episode {
  id: string
  episodeNumber: number      // 集号（1, 2, 3...）
  name: string               // 集名字

  // 剧本内容（原 Screenplay.scenes）
  scenes: SceneContainer[]   // 场景列表

  // 配乐管理 (v7.5)
  bgmTracks: BGMTrack[]

  // 元数据
  duration: number           // 时长（秒）
  thumbnail?: string         // 缩略图（Base64或Blob URL）
  createdAt: number
  modifiedAt: number
  version?: string           // 数据版本
}

export const useEpisodeStore = defineStore('episode', () => {
  const projectStore = useProjectStore()

  // 状态
  const episodes = ref<Episode[]>([])
  const currentEpisodeId = ref<string | null>(null)

  // 计算属性
  const currentEpisode = computed(() => {
    if (!currentEpisodeId.value) return null
    return episodes.value.find(ep => ep.id === currentEpisodeId.value)
  })

  const sortedEpisodes = computed(() => {
    return [...episodes.value].sort((a, b) => a.episodeNumber - b.episodeNumber)
  })

  /**
   * 创建新动画
   */
  function createEpisode(name: string): Episode {
    const maxEpisodeNumber = episodes.value.length > 0
      ? Math.max(...episodes.value.map(ep => ep.episodeNumber))
      : 0

    const episode: Episode = {
      id: `episode_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      episodeNumber: maxEpisodeNumber + 1,
      name: name || `第${maxEpisodeNumber + 1}个动画`,
      scenes: [],  // 初始化为空场景列表
      bgmTracks: [], // 初始化为空配乐列表
      duration: 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      version: '6.0'
    }

    episodes.value.push(episode)


    return episode
  }

  /**
   * 获取集
   */
  function getEpisode(id: string): Episode | undefined {
    return episodes.value.find(ep => ep.id === id)
  }

  /**
   * 更新集
   */
  function updateEpisode(id: string, data: Partial<Episode>): void {
    const index = episodes.value.findIndex(ep => ep.id === id)
    const currentEp = episodes.value[index]
    if (index !== -1 && currentEp) {
      episodes.value[index] = {
        ...currentEp,
        ...data,
        modifiedAt: Date.now()
      }

    }
  }

  /**
   * 删除集
   */
  function deleteEpisode(id: string): void {
    const index = episodes.value.findIndex(ep => ep.id === id)
    if (index !== -1) {
      episodes.value.splice(index, 1)

      // 如果删除的是当前集，清空当前集ID
      if (currentEpisodeId.value === id) {
        currentEpisodeId.value = null
      }


    }
  }

  /**
   * 设置当前编辑的集
   */
  function setCurrentEpisode(id: string): void {
    if (episodes.value.find(ep => ep.id === id)) {
      currentEpisodeId.value = id

    }
  }

  /**
   * 清空所有集
   */
  function clearAll(): void {
    episodes.value = []
    currentEpisodeId.value = null
  }

  // ==================== 场景管理方法 ====================

  /**
   * 添加场景到剧集
   */
  function addScene(episodeId: string, scene: SceneContainer): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      episode.scenes.push(scene)
      episode.modifiedAt = Date.now()
      projectStore.markAsUnsaved()

    }
  }

  /**
   * 插入场景到指定位置
   */
  function insertScene(episodeId: string, scene: SceneContainer, index: number): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      episode.scenes.splice(index, 0, scene)
      episode.modifiedAt = Date.now()
      projectStore.markAsUnsaved()

    }
  }

  /**
   * 获取场景
   */
  function getScene(episodeId: string, sceneId: string): SceneContainer | undefined {
    const episode = getEpisode(episodeId)
    return episode?.scenes.find((s) => s.id === sceneId)
  }

  /**
   * 更新场景
   */
  function updateScene(episodeId: string, sceneId: string, updates: Partial<SceneContainer>): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      const scene = episode.scenes.find((s) => s.id === sceneId)
      if (scene) {
        Object.assign(scene, updates)
        episode.modifiedAt = Date.now()
        projectStore.markAsUnsaved()
      }
    }
  }

  /**
   * 删除场景
   */
  function deleteScene(episodeId: string, sceneId: string): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      const index = episode.scenes.findIndex((s) => s.id === sceneId)
      if (index !== -1) {
        episode.scenes.splice(index, 1)
        episode.modifiedAt = Date.now()
        projectStore.markAsUnsaved()

      }
    }
  }

  /**
   * 移动场景位置（上移/下移）
   */
  function moveScene(episodeId: string, sceneId: string, direction: 'up' | 'down'): void {
    const episode = getEpisode(episodeId)
    if (!episode) return

    const index = episode.scenes.findIndex((s) => s.id === sceneId)
    if (index === -1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= episode.scenes.length) return

    // 交换相邻元素
    const temp = episode.scenes[index]!
    episode.scenes[index] = episode.scenes[targetIndex]!
    episode.scenes[targetIndex] = temp

    episode.modifiedAt = Date.now()
    projectStore.markAsUnsaved()
  }

  /**
   * 更新剧集的场景列表
   */
  function updateScenes(episodeId: string, scenes: SceneContainer[]): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      episode.scenes = scenes
      episode.modifiedAt = Date.now()
      projectStore.markAsUnsaved()
    }
  }

  /**
   * 获取剧集的场景列表
   */
  function getScenes(episodeId: string): SceneContainer[] {
    const episode = getEpisode(episodeId)
    return episode?.scenes ?? []
  }

  // ==================== Block 管理方法 ====================

  /**
   * 添加 Block 到场景
   */
  function addBlockToScene(episodeId: string, sceneId: string, block: ScriptBlock): void {
    const scene = getScene(episodeId, sceneId)
    if (scene) {
      scene.script.push(block)
      const episode = getEpisode(episodeId)
      if (episode) {
        episode.modifiedAt = Date.now()
        projectStore.markAsUnsaved()
      }
    }
  }

  /**
   * 更新场景中的 Block
   */
  function updateBlockInScene(episodeId: string, sceneId: string, blockId: string, updates: Partial<ScriptBlock>): void {
    const scene = getScene(episodeId, sceneId)
    if (scene) {
      const block = scene.script.find((b) => b.id === blockId)
      if (block) {
        Object.assign(block, updates)
        const episode = getEpisode(episodeId)
        if (episode) {
          episode.modifiedAt = Date.now()
          projectStore.markAsUnsaved()
        }
      }
    }
  }

  /**
   * 删除场景中的 Block
   * v10: 同时清理该 Block 中出生的 Shadow Objects
   */
  function deleteBlockFromScene(episodeId: string, sceneId: string, blockId: string): void {
    const scene = getScene(episodeId, sceneId)
    if (scene) {
      const index = scene.script.findIndex((b) => b.id === blockId)
      if (index !== -1) {
        const block = scene.script[index]
        if (!block) return

        // v10: 删除 block 前，清理关联的 shadow objects
        if (block.actions && scene.setup?.objects) {
          // 找出该 block 中所有 birth actions (set_lifecycle + spawned: true) 对应的对象 ID
          const birthTargetIds = block.actions
            .filter(a => a.type === 'set_lifecycle' && (a as { params: { spawned: boolean } }).params.spawned === true)
            .map(a => a.target)

          for (const targetId of birthTargetIds) {
            // 只删除 shadow object（setup 中 spawned === false 的动态对象）
            const setupObj = scene.setup.objects.find(o => o.id === targetId)
            if (setupObj?.spawned === false) {
              // 从 setup 中移除对象
              scene.setup.objects = scene.setup.objects.filter(o => o.id !== targetId)
              // 清理其他 block 中引用该对象的 actions
              for (const otherBlock of scene.script) {
                if (otherBlock.id !== blockId && otherBlock.actions) {
                  otherBlock.actions = otherBlock.actions.filter(a => a.target !== targetId)
                }
              }
            }
          }
        }

        scene.script.splice(index, 1)
        const episode = getEpisode(episodeId)
        if (episode) {
          episode.modifiedAt = Date.now()
          projectStore.markAsUnsaved()
        }
      }
    }
  }

  // ==================== BGM 管理方法 (v7.5) ====================

  function addBGMTrack(episodeId: string, track: BGMTrack): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      if (!episode.bgmTracks) episode.bgmTracks = []
      episode.bgmTracks.push(track)
      episode.modifiedAt = Date.now()
      projectStore.markAsUnsaved()
    }
  }

  function updateBGMTrack(episodeId: string, trackId: string, updates: Partial<BGMTrack>): void {
    const episode = getEpisode(episodeId)
    if (episode?.bgmTracks) {
      const track = episode.bgmTracks.find(t => t.id === trackId)
      if (track) {
        Object.assign(track, updates)
        episode.modifiedAt = Date.now()
        projectStore.markAsUnsaved()
      }
    }
  }

  function removeBGMTrack(episodeId: string, trackId: string): void {
    const episode = getEpisode(episodeId)
    if (episode?.bgmTracks) {
      const index = episode.bgmTracks.findIndex(t => t.id === trackId)
      if (index !== -1) {
        episode.bgmTracks.splice(index, 1)
        episode.modifiedAt = Date.now()
        projectStore.markAsUnsaved()
      }
    }
  }

  function setBGMTracks(episodeId: string, tracks: BGMTrack[]): void {
    const episode = getEpisode(episodeId)
    if (episode) {
      episode.bgmTracks = tracks
      episode.modifiedAt = Date.now()
      projectStore.markAsUnsaved()
    }
  }

  return {
    // 状态
    episodes,
    currentEpisodeId,
    currentEpisode,
    sortedEpisodes,

    // 剧集管理方法
    createEpisode,
    getEpisode,
    updateEpisode,
    deleteEpisode,
    setCurrentEpisode,
    clearAll,

    // 场景管理方法
    addScene,
    insertScene,
    getScene,
    updateScene,
    deleteScene,
    moveScene,
    updateScenes,
    getScenes,

    // Block 管理方法
    addBlockToScene,
    updateBlockInScene,
    deleteBlockFromScene,

    // BGM 管理
    addBGMTrack,
    updateBGMTrack,
    removeBGMTrack,
    setBGMTracks
  }
})
