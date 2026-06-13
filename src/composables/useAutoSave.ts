/**
 * 自动保存功能
 * 监听各个 Store 的变化，定期自动保存项目
 */

import { watch } from 'vue'

import { useBackgroundStore } from '@/stores/backgroundStore'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'

// 防抖函数
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function (this: unknown, ...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      func.apply(this, args)
      timeout = null
    }, wait)
  }
}

/**
 * 启用自动保存
 * @param interval 自动保存间隔（毫秒），默认 30 秒
 */
export function useAutoSave(interval = 30000) {
  const expressionStore = useExpressionStore()
  const backgroundStore = useBackgroundStore()
  const sceneStore = useSceneStore()
  const episodeStore = useEpisodeStore()
  const projectStore = useProjectStore()

  // 创建防抖的自动保存函数
  const debouncedAutoSave = debounce(async () => {
    if (!projectStore.autoSaveEnabled) return

    await projectStore.autoSave()
  }, interval)

  // characterStore watcher 已移除

  // 监听 expressionStore 变化
  watch(
    () => expressionStore.expressions,
    () => {
      debouncedAutoSave()
    },
    { deep: true }
  )

  // 监听 backgroundStore 变化
  watch(
    () => backgroundStore.backgrounds,
    () => {
      debouncedAutoSave()
    },
    { deep: true }
  )

  // 监听 sceneStore 变化
  watch(
    () => sceneStore.currentScene,
    () => {
      debouncedAutoSave()
    },
    { deep: true }
  )

  // 监听 episodeStore 变化（新增）
  watch(
    () => episodeStore.episodes,
    () => {
      debouncedAutoSave()
    },
    { deep: true }
  )

  return {
    enable: () => {
      projectStore.autoSaveEnabled = true
    },
    disable: () => {
      projectStore.autoSaveEnabled = false
    },
    triggerNow: () => {
      debouncedAutoSave()
    }
  }
}
