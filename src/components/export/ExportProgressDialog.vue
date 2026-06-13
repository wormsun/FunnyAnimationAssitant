<template>
  <div class="export-progress-dialog-overlay">
    <div class="export-progress-dialog">
      <div class="dialog-header">
        <h3>{{ headerTitle }}</h3>
      </div>
      
      <div class="dialog-body">
        <!-- 进度条 -->
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: progress.percentage + '%' }"
            />
          </div>
          <div class="progress-percentage">
            {{ progress.percentage.toFixed(0) }}%
          </div>
        </div>
        
        <!-- 状态信息 -->
        <div class="progress-info">
          <div class="info-item">
            <span class="label">当前阶段:</span>
            <span class="value">{{ progress.stageMessage }}</span>
          </div>
          <div
            v-if="progress.totalFrames > 0"
            class="info-item"
          >
            <span class="label">帧数:</span>
            <span class="value">{{ progress.currentFrame }} / {{ progress.totalFrames }}</span>
          </div>
          <div
            v-if="progress.currentScene"
            class="info-item"
          >
            <span class="label">当前场景:</span>
            <span class="value">{{ progress.currentScene }} ({{ (progress.currentSceneIndex ?? 0) + 1 }}/{{ progress.totalScenes }})</span>
          </div>
          <div class="info-item">
            <span class="label">已用时间:</span>
            <span class="value">{{ formatTime(progress.elapsedTime) }}</span>
          </div>
          <div
            v-if="progress.estimatedRemaining > 0 && status === 'encoding'"
            class="info-item"
          >
            <span class="label">预估剩余:</span>
            <span class="value">{{ formatTime(progress.estimatedRemaining) }}</span>
          </div>
        </div>
        
        <!-- 错误信息 -->
        <div
          v-if="error"
          class="error-message"
        >
          <span class="error-icon">⚠️</span>
          <span>{{ error.message }}</span>
        </div>
        
        <!-- 成功信息 -->
        <div
          v-if="status === 'completed'"
          class="success-message"
        >
          <span class="success-icon">✓</span>
          <span>导出成功！文件已自动下载</span>
        </div>
      </div>
      
      <div class="dialog-footer">
        <button 
          v-if="status !== 'completed' && status !== 'error'" 
          class="btn btn-secondary" 
          @click="$emit('cancel')"
        >
          取消导出
        </button>
        <button 
          v-if="status === 'completed' || status === 'error'" 
          class="btn btn-primary" 
          @click="$emit('close')"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { VideoExportProgress,VideoExportStatus } from '@/utils/videoExport'

const props = defineProps<{
  status: VideoExportStatus
  progress: VideoExportProgress
  error?: { code: string; message: string }
}>()

defineEmits<{
  cancel: []
  close: []
}>()

const headerTitle = computed(() => {
  switch (props.status) {
    case 'preparing':
      return '准备导出...'
    case 'encoding':
      return '正在导出视频...'
    case 'muxing':
      return '正在封装视频...'
    case 'completed':
      return '导出完成'
    case 'error':
      return '导出失败'
    case 'cancelled':
      return '导出已取消'
    default:
      return '导出视频'
  }
})

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.export-progress-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.export-progress-dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.dialog-body {
  padding: 24px;
}

.progress-bar-container {
  margin-bottom: 24px;
}

.progress-bar {
  width: 100%;
  height: 32px;
  background: #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.progress-percentage {
  text-align: center;
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.progress-info {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.info-item:not(:last-child) {
  border-bottom: 1px solid #e5e7eb;
}

.info-item .label {
  font-size: 14px;
  color: #6b7280;
}

.info-item .value {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.error-message {
  margin-top: 16px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon {
  font-size: 20px;
}

.success-message {
  margin-top: 16px;
  padding: 12px 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #16a34a;
  display: flex;
  align-items: center;
  gap: 8px;
}

.success-icon {
  font-size: 20px;
  font-weight: bold;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}
</style>
