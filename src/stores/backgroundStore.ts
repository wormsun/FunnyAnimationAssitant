import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Background } from '@/types/project'

import { useProjectStore } from './projectStore'


export const useBackgroundStore = defineStore('background', () => {
  const backgrounds = ref<Background[]>([])

  /**
   * 生成唯一ID
   */
  function generateId(): string {
    return `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取所有已使用的标签
   */
  const allTags = computed(() => {
    const tags = new Set<string>()
    backgrounds.value.forEach(p => p.tags?.forEach(t => tags.add(t)))
    return Array.from(tags).sort()
  })

  /**
   * 创建新背景
   */
  function createBackground(name: string, type: 'static' | 'animation' = 'static'): Background {
    const bg: Background = {
      id: generateId(),
      name,
      type,
      tags: [],
      createdAt: Date.now(),
      fps: 25,
      loop: true
    }
    backgrounds.value.push(bg)

    const projectStore = useProjectStore()
    projectStore.markAsUnsaved()

    return bg
  }

  /**
   * 删除背景
   */
  function deleteBackground(id: string): boolean {
    const index = backgrounds.value.findIndex(p => p.id === id)
    if (index !== -1) {
      // 释放 Blob URL
      const bg = backgrounds.value[index]
      if (bg) {
        if (bg._runtimeUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(bg._runtimeUrl)
        }
        if (bg._runtimeStillUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(bg._runtimeStillUrl)
        }
        bg.frames?.forEach(frame => {
          if (frame._runtimeUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(frame._runtimeUrl)
          }
        })
      }

      backgrounds.value.splice(index, 1)

      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
      return true
    }
    return false
  }

  /**
   * 获取背景
   */
  function getBackground(id: string): Background | undefined {
    return backgrounds.value.find(p => p.id === id)
  }

  /**
   * 更新背景信息
   */
  function updateBackground(id: string, updates: Partial<Background>): boolean {
    const bg = getBackground(id)
    if (bg) {
      Object.assign(bg, updates)

      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
      return true
    }
    return false
  }

  /**
   * 清空所有背景
   */
  function clearAll() {
    // 释放所有资源
    backgrounds.value.forEach(bg => {
      if (bg._runtimeUrl?.startsWith('blob:')) URL.revokeObjectURL(bg._runtimeUrl)
      if (bg._runtimeStillUrl?.startsWith('blob:')) URL.revokeObjectURL(bg._runtimeStillUrl)
      bg.frames?.forEach(frame => {
        if (frame._runtimeUrl?.startsWith('blob:')) URL.revokeObjectURL(frame._runtimeUrl)
      })
    })
    backgrounds.value = []
  }

  /**
   * 设置背景列表 (用于加载项目)
   */
  function setBackgrounds(list: Background[]) {
    backgrounds.value = list
  }

  return {
    backgrounds,
    allTags,
    createBackground,
    deleteBackground,
    getBackground,
    updateBackground,
    clearAll,
    setBackgrounds
  }
})
