import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { PropAsset } from '@/types/project'

import { useProjectStore } from './projectStore'


export const usePropStore = defineStore('prop', () => {
  const props = ref<PropAsset[]>([])

  /**
   * 生成唯一ID
   */
  function generateId(): string {
    return `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取所有已使用的标签
   */
  const allTags = computed(() => {
    const tags = new Set<string>()
    props.value.forEach((p: PropAsset) => p.tags?.forEach((t: string) => tags.add(t)))
    return Array.from(tags).sort()
  })

  /**
   * 创建新道具
   */
  function createProp(name: string, type: 'static' | 'animation' = 'static'): PropAsset {
    const prop: PropAsset = {
      id: generateId(),
      name,
      type,
      tags: [],
      createdAt: Date.now(),
      fps: 25,
      loop: true
    }
    props.value.push(prop)

    const projectStore = useProjectStore()
    projectStore.markAsUnsaved()

    return prop
  }

  /**
   * 删除道具
   */
  function deleteProp(id: string): boolean {
    const index = props.value.findIndex((p: PropAsset) => p.id === id)
    if (index !== -1) {
      // 释放 Blob URL
      const prop = props.value[index]
      if (prop?._runtimeUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prop._runtimeUrl)
      }
      if (prop?._runtimeStillUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prop._runtimeStillUrl)
      }
      prop?.frames?.forEach((frame) => {
        const runtimeUrl = (frame as { _runtimeUrl?: string })._runtimeUrl
        if (runtimeUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(runtimeUrl)
        }
      })

      props.value.splice(index, 1)

      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
      return true
    }
    return false
  }

  /**
   * 获取道具
   */
  function getProp(id: string): PropAsset | undefined {
    return props.value.find((p: PropAsset) => p.id === id)
  }

  /**
   * 更新道具信息
   */
  function updateProp(id: string, updates: Partial<PropAsset>): boolean {
    const prop = getProp(id)
    if (prop) {
      Object.assign(prop, updates)

      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()
      return true
    }
    return false
  }

  /**
   * 清空所有道具
   */
  function clearAll() {
    // 释放所有资源
    props.value.forEach((prop: PropAsset) => {
      if (prop._runtimeUrl?.startsWith('blob:')) URL.revokeObjectURL(prop._runtimeUrl)
      if (prop._runtimeStillUrl?.startsWith('blob:')) URL.revokeObjectURL(prop._runtimeStillUrl)
      prop.frames?.forEach((frame) => {
        if ((frame['_runtimeUrl'] as string | undefined)?.startsWith('blob:')) URL.revokeObjectURL(frame['_runtimeUrl'] as string)
      })
    })
    props.value = []
  }

  /**
   * 设置道具列表 (用于加载项目)
   */
  function setProps(list: PropAsset[]) {
    props.value = list
  }

  return {
    props,
    allTags,
    createProp,
    deleteProp,
    getProp,
    updateProp,
    clearAll,
    setProps
  }
})