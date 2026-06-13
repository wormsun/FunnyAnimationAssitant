<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="modal-container">
        <div class="modal-header">
          <h3>复制结构预览</h3>
          <button class="btn-close" @click="emit('close')">×</button>
        </div>

        <div class="modal-body">
          <div class="source-info">
            来源人物：<strong>{{ sourceName }}</strong>
          </div>

          <!-- 匹配成功 -->
          <div v-if="matchResult.matched.length > 0" class="section">
            <div class="section-header success">
              <span class="section-icon">✅</span>
              <span>匹配成功 ({{ matchResult.matched.length }})</span>
            </div>
            <div class="tag-list">
              <span
                v-for="name in matchResult.matched"
                :key="name"
                class="match-tag matched"
              >{{ name }}</span>
            </div>
          </div>

          <!-- 仅源有（将跳过） -->
          <div v-if="matchResult.sourceOnly.length > 0" class="section">
            <div class="section-header warning">
              <span class="section-icon">⚠️</span>
              <span>仅来源有（将跳过）({{ matchResult.sourceOnly.length }})</span>
            </div>
            <div class="tag-list">
              <span
                v-for="name in matchResult.sourceOnly"
                :key="name"
                class="match-tag source-only"
              >{{ name }}</span>
            </div>
          </div>

          <!-- 仅目标有（将追加） -->
          <div v-if="matchResult.targetOnly.length > 0" class="section">
            <div class="section-header info">
              <span class="section-icon">ℹ️</span>
              <span>仅当前人物有（将保留追加）({{ matchResult.targetOnly.length }})</span>
            </div>
            <div class="tag-list">
              <span
                v-for="name in matchResult.targetOnly"
                :key="name"
                class="match-tag target-only"
              >{{ name }}</span>
            </div>
          </div>

          <!-- 动画复制信息 -->
          <div class="section">
            <div class="section-header">
              <span class="section-icon">🎬</span>
              <span>动画复制</span>
            </div>
            <div class="anim-summary">
              <div class="summary-row">
                <span>将复制动画数</span>
                <span class="summary-value">{{ animationCount }}</span>
              </div>
              <div v-if="skippedAnimations.length > 0" class="summary-row warning-text">
                <span>不可迁移（已跳过）</span>
                <span class="summary-value">{{ skippedAnimations.join('、') }}</span>
              </div>
              <div v-if="trimmedAnimations.length > 0" class="summary-row info-text">
                <span>部分轨道裁剪</span>
                <span class="summary-value">{{ trimmedAnimations.join('、') }}</span>
              </div>
            </div>
          </div>

          <!-- 警告 -->
          <div class="warning-box">
            ⚠️ 此操作将<strong>重建当前人物的整体结构</strong>，不可撤销。建议先保存项目。
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('close')">取消</button>
          <button
            class="btn-primary"
            @click="emit('confirm')"
          >确认执行</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { NameMatchResult } from '@/utils/characterSyncUtils'

defineProps<{
  sourceName: string
  matchResult: NameMatchResult
  animationCount: number
  skippedAnimations: string[]
  trimmedAnimations: string[]
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-container {
  background: white;
  border-radius: 12px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #6b7280;
  cursor: pointer;
}

.btn-close:hover {
  color: #111827;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.source-info {
  font-size: 14px;
  color: #374151;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.section {
  margin-bottom: 14px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.section-header.success { color: #16a34a; }
.section-header.warning { color: #d97706; }
.section-header.info { color: #2563eb; }

.section-icon {
  font-size: 14px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.match-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
}

.match-tag.matched {
  background: #dcfce7;
  color: #166534;
}

.match-tag.source-only {
  background: #fef3c7;
  color: #92400e;
}

.match-tag.target-only {
  background: #dbeafe;
  color: #1e40af;
}

.anim-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #374151;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.summary-value {
  font-weight: 500;
}

.warning-text {
  color: #d97706;
}

.info-text {
  color: #2563eb;
}

.warning-box {
  margin-top: 16px;
  padding: 10px 12px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 13px;
  color: #92400e;
  line-height: 1.4;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f3f4f6;
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  background: #3b82f6;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
