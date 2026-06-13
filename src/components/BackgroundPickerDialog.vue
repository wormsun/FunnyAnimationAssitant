<template>
  <AssetBrowser
    title="选择背景"
    :assets="backgroundStore.backgrounds"
    :all-tags="backgroundStore.allTags"
    :type-filter-options="typeFilterOptions"
    empty-text="暂无背景素材，请先在素材管理中添加背景"
    :load-image="loadImage"
    :load-all-frames="loadAllFrames"
    @select="handleSelect"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { useAssetImage } from '@/composables/useAssetImage'
import { useBackgroundStore } from '@/stores/backgroundStore'
import type { Background } from '@/types/project'

import AssetBrowser from './AssetBrowser.vue'

const emit = defineEmits<{
  select: [background: Background]
  close: []
}>()

const backgroundStore = useBackgroundStore()
const { getImageUrl, loadImageUrl } = useAssetImage()

const typeFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '静态', value: 'static' },
  { label: '动态', value: 'animation' }
]

function handleSelect(asset: { id: string; [key: string]: unknown }) {
  // 从 store 获取完整的 Background 对象
  const background = backgroundStore.getBackground(asset.id)
  if (background) {
    emit('select', background)
  }
}

// 加载背景图片
async function loadImage(id: string): Promise<string> {
  const bg = backgroundStore.getBackground(id)
  if (!bg) return ''

  // 1. 静态背景
  if (bg.type === 'static') {
    if (bg._runtimeUrl) {
      return bg._runtimeUrl
    }
    if (bg.url) {
      await loadImageUrl(bg.url)
      return getImageUrl(bg.url)
    }
    return ''
  }
  
  // 2. 动态背景：使用静止帧配置
  // 2.1 自定义静止帧
  if (bg.stillFrameSource === 'custom') {
    if (bg._runtimeStillUrl) {
      return bg._runtimeStillUrl
    }
    if (bg.stillFrameCustomUrl) {
      await loadImageUrl(bg.stillFrameCustomUrl)
      return getImageUrl(bg.stillFrameCustomUrl)
    }
  }

  // 2.2 使用指定帧索引（默认第一帧）
  const frameIndex = bg.stillFrameIndex ?? 0
  const frame = bg.frames?.[frameIndex]
  if (frame) {
    if (frame._runtimeUrl) {
      return frame._runtimeUrl
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
  const bg = backgroundStore.getBackground(id)
  if (bg?.type !== 'animation' || !bg?.frames?.length) {
    return []
  }

  const urls: string[] = []
  for (const frame of bg.frames) {
    if (frame._runtimeUrl) {
      urls.push(frame._runtimeUrl)
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

