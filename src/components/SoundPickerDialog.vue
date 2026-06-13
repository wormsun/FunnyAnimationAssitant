<template>
  <AssetBrowser
    title="选择音效"
    :assets="soundStore.sounds"
    :all-tags="soundStore.allTags"
    :type-filter-options="typeFilterOptions"
    empty-text="暂无音效素材，请先在素材管理中添加音效"
    show-play-button
    show-duration-sort
    @select="handleSelect"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { useSoundStore } from '@/stores/soundStore'
import type { SoundAsset } from '@/types/project'

import AssetBrowser from './AssetBrowser.vue'

const emit = defineEmits<{
  select: [sound: SoundAsset]
  close: []
}>()

const soundStore = useSoundStore()

const typeFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '背景音乐', value: 'bgm' },
  { label: '音效', value: 'sfx' }
]

function handleSelect(asset: { id: string; url?: string; [key: string]: unknown }) {
  emit('select', asset as SoundAsset)
}
</script>
