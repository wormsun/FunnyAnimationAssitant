<template>
  <AssetBrowser
    title="选择道具"
    :assets="propStore.props"
    :all-tags="propStore.allTags"
    :type-filter-options="typeFilterOptions"
    empty-text="暂无道具素材，请先在素材管理中添加道具"
    :load-image="loadImage"
    :load-all-frames="loadAllFrames"
    @select="handleSelect"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { useAssetImage } from '@/composables/useAssetImage'
import { usePropStore } from '@/stores/propStore'
import type { PropAsset } from '@/types/project'

import AssetBrowser from './AssetBrowser.vue'

const emit = defineEmits<{
  select: [prop: PropAsset]
  close: []
}>()

const propStore = usePropStore()
const { getImageUrl, loadImageUrl } = useAssetImage()

const typeFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '静态', value: 'static' },
  { label: '动态', value: 'animation' }
]

function handleSelect(asset: { id: string; [key: string]: unknown }) {
  // 从 store 获取完整的 Prop 对象
  const prop = propStore.getProp(asset.id)
  if (prop) {
    emit('select', prop)
  }
}

// 加载图片 - 返回 Promise<string> 以兼容 AssetBrowser 组件
async function loadImage(id: string): Promise<string> {
  const prop = propStore.getProp(id)
  if (!prop) return ''
  
  // 1. 静态道具
  if (prop.type === 'static') {
    const propWithRuntime = prop as typeof prop & { _runtimeUrl?: string }
    if (propWithRuntime._runtimeUrl) {
      return propWithRuntime._runtimeUrl
    }
    if (prop.url) {
      await loadImageUrl(prop.url)
      return getImageUrl(prop.url)
    }
    return ''
  }

  // 2. 动态道具：使用静止帧配置
  // 2.1 自定义静止帧
  if (prop.stillFrameSource === 'custom') {
    const propWithRuntime = prop as typeof prop & { _runtimeStillUrl?: string }
    if (propWithRuntime._runtimeStillUrl) {
      return propWithRuntime._runtimeStillUrl
    }
    if (prop.stillFrameCustomUrl) {
      await loadImageUrl(prop.stillFrameCustomUrl)
      return getImageUrl(prop.stillFrameCustomUrl)
    }
  }

  // 2.2 使用指定帧索引（默认第一帧）
  const frameIndex = prop.stillFrameIndex ?? 0
  const frame = prop.frames?.[frameIndex]
  if (frame) {
    const frameWithRuntime = frame as typeof frame & { _runtimeUrl?: string }
    if (frameWithRuntime._runtimeUrl) {
      return frameWithRuntime._runtimeUrl
    }
    if (frame.url) {
      await loadImageUrl(frame.url)
      return getImageUrl(frame.url)
    }
  }

  return ''
}

// 加载所有帧 URL - 用于 Hover 动画预览
async function loadAllFrames(id: string): Promise<string[]> {
  const prop = propStore.getProp(id)
  if (prop?.type !== 'animation' || !prop?.frames?.length) {
    return []
  }

  const urls: string[] = []
  for (const frame of prop.frames) {
    const frameWithRuntime = frame as typeof frame & { _runtimeUrl?: string }
    if (frameWithRuntime._runtimeUrl) {
      urls.push(frameWithRuntime._runtimeUrl)
    } else if (frame.url) {
      await loadImageUrl(frame.url)
      const url = getImageUrl(frame.url)
      if (url) {
        urls.push(url)
      }
    }
  }
  return urls
}
</script>

