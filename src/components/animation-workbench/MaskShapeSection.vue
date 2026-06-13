<template>
  <div class="property-section mask-shape-section">
    <h4 class="section-title">
      <span class="section-icon" aria-hidden="true">▭</span>
      <span>蒙版形状</span>
    </h4>

    <!-- 形状 -->
    <div class="field-row">
      <label class="field-label">形状</label>
      <div class="field-control">
        <select
          class="field-select"
          :value="mask.shape"
          @change="onShapeChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="rectangle">矩形</option>
          <option value="ellipse">椭圆</option>
        </select>
      </div>
    </div>

    <!-- 宽度 -->
    <div class="field-row">
      <label class="field-label">宽度</label>
      <div class="field-control">
        <input
          class="field-input"
          type="number"
          :value="mask.width"
          :min="1"
          :step="1"
          @input="onSizeInput('width', ($event.target as HTMLInputElement).value)"
        >
        <span class="unit-suffix">px</span>
      </div>
    </div>

    <!-- 长宽比锁 -->
    <div class="ratio-lock-row">
      <button
        type="button"
        class="ratio-lock-btn"
        :class="{ active: aspectLocked }"
        :title="aspectLocked ? '已锁定长宽比（点击解锁）' : '点击锁定长宽比'"
        :aria-pressed="aspectLocked"
        @click="toggleAspectLock"
      >
        <svg
          v-if="aspectLocked"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <svg
          v-else
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 7.5-1.5" />
        </svg>
        <span class="ratio-lock-text">锁定长宽比</span>
      </button>
    </div>

    <!-- 高度 -->
    <div class="field-row">
      <label class="field-label">高度</label>
      <div class="field-control">
        <input
          class="field-input"
          type="number"
          :value="mask.height"
          :min="1"
          :step="1"
          @input="onSizeInput('height', ($event.target as HTMLInputElement).value)"
        >
        <span class="unit-suffix">px</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { MaskObject, MaskShape } from '@/types/sceneObject'

const props = defineProps<{ mask: MaskObject }>()

const emit = defineEmits<(e: 'change', patch: Partial<MaskObject>) => void>()

const aspectLocked = ref(false)

function toggleAspectLock() {
  aspectLocked.value = !aspectLocked.value
}

function onShapeChange(value: string) {
  if (value !== 'rectangle' && value !== 'ellipse') return
  emit('change', { shape: value as MaskShape })
}

function onSizeInput(key: 'width' | 'height', value: string) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return

  if (!aspectLocked.value) {
    emit('change', { [key]: n } as Partial<MaskObject>)
    return
  }

  const oldW = props.mask.width
  const oldH = props.mask.height
  if (oldW <= 0 || oldH <= 0) {
    emit('change', { [key]: n } as Partial<MaskObject>)
    return
  }
  const ratio = oldW / oldH
  const patch: Partial<MaskObject> = {}
  if (key === 'width') {
    patch.width = n
    patch.height = Math.max(1, Math.round(n / ratio))
  } else {
    patch.height = n
    patch.width = Math.max(1, Math.round(n * ratio))
  }
  emit('change', patch)
}
</script>

<style scoped>
.mask-shape-section {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px 0;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.section-icon {
  font-size: 14px;
  color: #6b7280;
}

.field-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.field-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  text-align: right;
  user-select: none;
}

.field-control {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.field-select,
.field-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  color: #1f2937;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  box-sizing: border-box;
}

.field-select:focus,
.field-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.field-input {
  text-align: right;
}

.unit-suffix {
  font-size: 11px;
  color: #9ca3af;
  user-select: none;
  min-width: 16px;
}

.ratio-lock-row {
  display: flex;
  justify-content: flex-start;
  margin: -2px 0 6px 64px;
}

.ratio-lock-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  height: 22px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ratio-lock-btn:hover {
  color: #4f46e5;
  background: #eef2ff;
  border-color: #c7d2fe;
}

.ratio-lock-btn.active {
  color: #4f46e5;
  background: #eef2ff;
  border-color: #818cf8;
}

.ratio-lock-text {
  user-select: none;
}

</style>
