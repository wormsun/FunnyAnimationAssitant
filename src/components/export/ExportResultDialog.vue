<template>
  <div
    class="export-result-overlay"
    @click.self="handleClose"
  >
    <div class="export-result-dialog">
      <!-- 标题栏 -->
      <div class="dialog-header">
        <div class="header-content">
          <span class="status-icon">{{ success ? '✅' : '❌' }}</span>
          <h3>{{ success ? '导出成功' : '导出失败' }}</h3>
        </div>
        <button
          class="close-btn"
          title="关闭"
          @click="handleClose"
        >
          ✕
        </button>
      </div>

      <!-- 内容区 -->
      <div class="dialog-body">
        <div
          v-if="success"
          class="success-content"
        >
          <!-- 文件信息 -->
          <div class="info-section">
            <h4>📊 导出信息</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">文件大小:</span>
                <span class="value">{{ formatFileSize(result.fileSize) }}</span>
              </div>
              <div class="info-item">
                <span class="label">导出时长:</span>
                <span class="value">{{ formatDuration(result.duration) }}</span>
              </div>
              <div class="info-item">
                <span class="label">总帧数:</span>
                <span class="value">{{ result.totalFrames }} 帧</span>
              </div>
              <div class="info-item">
                <span class="label">导出效率:</span>
                <span class="value">{{ averageSpeed }}</span>
              </div>
            </div>
          </div>

          <!-- 视频设置 -->
          <div class="info-section">
            <h4>🎬 视频设置</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">分辨率:</span>
                <span class="value">{{ result.resolution.width }}×{{ result.resolution.height }}</span>
              </div>
              <div class="info-item">
                <span class="label">帧率:</span>
                <span class="value">{{ result.frameRate }} FPS</span>
              </div>
              <div class="info-item">
                <span class="label">质量:</span>
                <span class="value">{{ result.quality }}</span>
              </div>
              <div class="info-item">
                <span class="label">格式:</span>
                <span class="value">MP4 (H.264 + AAC)</span>
              </div>
            </div>
          </div>

          <!-- 提示信息 -->
          <div class="tip-section">
            <span class="tip-icon">💡</span>
            <span class="tip-text">视频已自动下载到浏览器默认下载文件夹</span>
          </div>
        </div>

        <!-- 失败信息 -->
        <div
          v-else
          class="error-content"
        >
          <div class="error-message">
            <span class="error-icon">⚠️</span>
            <p>{{ result.errorMessage || '导出过程中发生未知错误' }}</p>
          </div>
          <div
            v-if="result.errorDetails"
            class="error-details"
          >
            <details>
              <summary>查看详细错误信息</summary>
              <pre>{{ result.errorDetails }}</pre>
            </details>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="dialog-footer">
        <button
          v-if="!success"
          class="btn btn-secondary"
          @click="handleClose"
        >
          关闭
        </button>
        <button
          v-if="!success"
          class="btn btn-primary"
          @click="handleRetry"
        >
          重试
        </button>
        <button
          v-if="success"
          class="btn btn-primary"
          @click="handleClose"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ExportResult {
  success: boolean
  fileSize: number
  duration: number
  totalFrames: number
  resolution: { width: number; height: number }
  frameRate: number
  quality: string
  errorMessage?: string
  errorDetails?: string
}

const props = defineProps<{
  result: ExportResult
}>()

const emit = defineEmits<{
  close: []
  exportAgain: []
  retry: []
}>()

const success = computed(() => props.result.success)

// 计算平均导出速度
const averageSpeed = computed(() => {
  if (!props.result.duration || !props.result.totalFrames) return '-'
  const framesPerSecond = props.result.totalFrames / (props.result.duration / 1000)
  const speedRatio = framesPerSecond / props.result.frameRate
  // 说明：如果视频是 25 FPS，导出用了 10 秒，实际处理了 250 帧
  // 那么每秒处理 25 帧，相当于 1x 实时速度（刚好跟上视频播放速度）
  // 如果每秒处理 50 帧，就是 2x 速度（比实时播放快 2 倍）
  if (speedRatio >= 1) {
    return `每秒处理 ${framesPerSecond.toFixed(1)} 帧 (${speedRatio.toFixed(2)}x)`
  } else {
    return `每秒处理 ${framesPerSecond.toFixed(1)} 帧 (较慢)`
  }
})

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

// 格式化时长
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) {
    return `${minutes} 分 ${secs} 秒`
  }
  return `${secs} 秒`
}

function handleClose() {
  emit('close')
}

function handleRetry() {
  emit('retry')
}

</script>

<style scoped>
.export-result-overlay {
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
  animation: fadeIn 0.2s ease;
  pointer-events: auto;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.export-result-dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
  pointer-events: auto;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-icon {
  font-size: 28px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.success-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e5e7eb;
}

.info-section h4 {
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item .label {
  font-size: 13px;
  color: #6b7280;
}

.info-item .value {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.tip-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #eff6ff;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
}

.tip-icon {
  font-size: 18px;
}

.tip-text {
  font-size: 14px;
  color: #1e40af;
}

.error-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fef2f2;
  border-radius: 8px;
  border-left: 3px solid #ef4444;
  border: 1px solid #fecaca;
}

.error-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.error-message p {
  margin: 0;
  font-size: 15px;
  color: #991b1b;
  line-height: 1.6;
}

.error-details {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
}

.error-details summary {
  cursor: pointer;
  font-size: 14px;
  color: #6b7280;
  padding: 8px;
  user-select: none;
}

.error-details summary:hover {
  color: #1f2937;
}

.error-details pre {
  margin: 12px 0 0 0;
  padding: 12px;
  background: #1f2937;
  border-radius: 6px;
  font-size: 12px;
  color: #ef4444;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
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
