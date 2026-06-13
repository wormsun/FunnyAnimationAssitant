import { defineStore } from 'pinia'
import { computed,ref } from 'vue'

import type { SoundAsset } from '@/types/project'
import { generateId } from '@/utils/uuid'

import { useProjectStore } from './projectStore'

export const useSoundStore = defineStore('sound', () => {
  const sounds = ref<SoundAsset[]>([])

  /**
   * 获取所有已使用的标签
   */
  const allTags = computed(() => {
    const tags = new Set<string>()
    sounds.value.forEach(p => p.tags?.forEach(t => tags.add(t)))
    return Array.from(tags).sort()
  })

  /**
   * 获取所有 BGM
   */
  const bgms = computed(() => {
    return sounds.value.filter(s => s.type === 'bgm')
  })

  /**
   * 获取所有 SFX
   */
  const sfxs = computed(() => {
    return sounds.value.filter(s => s.type === 'sfx')
  })

  /**
   * 创建新音效
   */
  function createSound(name: string, type: 'bgm' | 'sfx' = 'sfx'): SoundAsset {
    const sound: SoundAsset = {
      id: generateId('sound'),
      name,
      type,
      tags: [],
      url: '', // 初始为空，后续设置
      createdAt: Date.now(),
      // 默认属性
      volume: 1.0,
      loop: type === 'bgm', // BGM 默认循环
      fadeIn: 0,
      fadeOut: 0
    }
    sounds.value.push(sound)
    
    const projectStore = useProjectStore()
    projectStore.markAsUnsaved()
    
    return sound
  }

  /**
   * 删除音效
   */
  function deleteSound(id: string) {
    const index = sounds.value.findIndex(p => p.id === id)
    if (index !== -1) {
      sounds.value.splice(index, 1)
      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
    }
  }

  /**
   * 获取音效
   */
  function getSound(id: string): SoundAsset | undefined {
    return sounds.value.find(p => p.id === id)
  }

  /**
   * 更新音效信息
   */
  function updateSound(id: string, updates: Partial<SoundAsset>): boolean {
    const sound = getSound(id)
    if (sound) {
      Object.assign(sound, updates)
      
      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
      return true
    }
    return false
  }

  /**
   * 清空所有数据
   */
  function clearAll() {
    sounds.value = []
  }

  /**
   * 设置音效列表 (用于加载项目)
   */
  function setSounds(list: SoundAsset[]) {
    sounds.value = list
  }

  return {
    sounds,
    allTags,
    bgms,
    sfxs,
    createSound,
    deleteSound,
    getSound,
    updateSound,
    clearAll,
    setSounds
  }
})
