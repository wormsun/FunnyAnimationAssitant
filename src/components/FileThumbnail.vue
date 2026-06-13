<template>
  <div class="thumbnail-wrapper">
    <img 
      v-if="src" 
      :src="src" 
      class="thumbnail-image" 
      @error="handleError"
    >
    <div
      v-else-if="loading"
      class="thumbnail-loading"
    >
      <div class="mini-spinner" />
    </div>
    <div
      v-else
      class="thumbnail-icon"
    >
      <span v-if="item.kind === 'directory'">📁</span>
      <span v-else>{{ getFileIcon(item.name) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import type { FileNode } from '@/types/fileBrowser'
import { thumbnailManager } from '@/utils/ThumbnailManager'

const props = defineProps<{
  item: FileNode
}>()

const src = ref('')
const loading = ref(false)

onMounted(() => {
  void loadThumbnail()
})

// 监听 item 变化（因为虚拟滚动会复用组件实例）
watch(() => props.item.path, () => {
  void loadThumbnail()
})

async function loadThumbnail() {
  if (props.item.kind !== 'file' || props.item.isParentDir || !isImageFile(props.item.name)) {
    src.value = ''
    return
  }

  loading.value = true
  src.value = '' // 重置以显示 loading

  try {
    const fileHandle = props.item.handle as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const url = await thumbnailManager.getThumbnail(file, props.item.path)
    src.value = url
  } catch (error) {
    // console.warn('Thumbnail load failed', error)
  } finally {
    loading.value = false
  }
}

function handleError() {
  src.value = '' // Fallback to icon
}

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const iconMap: Record<string, string> = {
    'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
    'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'm4a': '🎵', 'aac': '🎵',
    'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'webm': '🎬',
    'json': '📄', 'txt': '📄', 'md': '📄',
  }
  return iconMap[ext] ?? '📄'
}
</script>

<style scoped>
.thumbnail-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #f3f4f6;
}

.mini-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.thumbnail-icon {
  font-size: 48px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>