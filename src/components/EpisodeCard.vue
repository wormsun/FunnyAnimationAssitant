<template>
  <div class="episode-card">
    <div class="thumbnail">
      <img
        v-if="episode.thumbnail"
        :src="episode.thumbnail"
        alt="缩略图"
      >
      <div
        v-else
        class="thumbnail-placeholder"
      >
        <span class="episode-number">{{ episode.episodeNumber }}</span>
      </div>
    </div>
    
    <div class="card-content">
      <h3 class="episode-name">
        {{ episode.name }}
      </h3>
      <div class="episode-info">
        <span class="info-text">第 {{ episode.episodeNumber }} 个动画</span>
        <span class="info-text">{{ formatDuration(episode.duration) }}</span>
      </div>
    </div>
    
    <div class="card-actions">
      <button
        class="action-btn primary"
        @click="$emit('edit', episode.id)"
      >
        ✏️ 编辑
      </button>
      <button
        class="action-btn danger"
        @click="$emit('delete', episode.id)"
      >
        🗑️ 删除
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Episode } from '@/stores/episodeStore'

defineProps<{
  episode: Episode
}>()

defineEmits<{
  edit: [id: string]
  delete: [id: string]
}>()

function formatDuration(seconds: number): string {
  if (seconds === 0) return '未计算'
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.episode-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
}

.episode-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.thumbnail {
  width: 100%;
  height: 150px;
  background: #f3f4f6;
  position: relative;
  overflow: hidden;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.episode-number {
  font-size: 48px;
  font-weight: 700;
  color: white;
}

.card-content {
  padding: 16px;
  flex: 1;
}

.episode-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.info-text {
  font-size: 13px;
  color: #6b7280;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  background: white;
  color: #6b7280;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f9fafb;
}

.action-btn.primary {
  color: #3b82f6;
  border-color: #3b82f6;
}

.action-btn.primary:hover {
  background: #3b82f6;
  color: white;
}

.action-btn.danger {
  color: #ef4444;
  border-color: #ef4444;
}

.action-btn.danger:hover {
  background: #ef4444;
  color: white;
}
</style>
