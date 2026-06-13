<template>
  <div class="light-picker-overlay" @click.self="$emit('close')">
    <div class="light-picker-dialog">
      <div class="dialog-header">
        <h3>💡 添加灯光</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <!-- 点光源分组 -->
        <div class="light-group">
          <div class="group-header">
            <span class="group-icon">💡</span>
            <span class="group-title">点光源</span>
            <span class="group-desc">全方向辐射光 — 适合灯泡、蜡烛、火把等</span>
          </div>
          <div class="preset-grid">
            <button
              v-for="preset in pointPresets"
              :key="preset.id"
              class="preset-card"
              :class="{ selected: selectedPresetId === preset.id }"
              @click="selectPreset('point', preset.id)"
            >
              <span
                class="preset-dot"
                :style="{ background: preset.params.lightColor }"
              />
              <span class="preset-info">
                <span class="preset-name">{{ preset.label }}</span>
                <span class="preset-desc">{{ preset.description }}</span>
              </span>
              <span v-if="preset.params.flicker > 0" class="preset-badge flicker">闪烁</span>
            </button>
          </div>
        </div>

        <!-- 聚光灯分组 -->
        <div class="light-group">
          <div class="group-header">
            <span class="group-icon">🔦</span>
            <span class="group-title">聚光灯</span>
            <span class="group-desc">定向锥形光 — 适合手电、追光、壁灯等</span>
          </div>
          <div class="preset-grid">
            <button
              v-for="preset in spotPresets"
              :key="preset.id"
              class="preset-card"
              :class="{ selected: selectedPresetId === preset.id }"
              @click="selectPreset('spot', preset.id)"
            >
              <span
                class="preset-dot"
                :style="{ background: preset.params.lightColor }"
              />
              <span class="preset-info">
                <span class="preset-name">{{ preset.label }}</span>
                <span class="preset-desc">{{ preset.description }}</span>
              </span>
              <span v-if="preset.params.flicker > 0" class="preset-badge flicker">闪烁</span>
            </button>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="cancel-btn" @click="$emit('close')">取消</button>
        <button class="confirm-btn" :disabled="!selectedPresetId" @click="handleConfirm">
          添加灯光
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import {
  type LightPresetEntry,
  type LightPresetParams,
  POINT_LIGHT_PRESETS,
  SPOT_LIGHT_PRESETS,
} from '@/utils/lightPresets'

/** 对外暴露的选择结果 */
export interface LightPickerResult {
  /** 灯光类型 */
  lightType: 'point' | 'spot'
  /** 预设 ID */
  presetId: string
  /** 预设参数快照 */
  params: LightPresetParams
}

/**
 * 兼容旧接口 — 消费方可按 `.id` 读取灯型
 * @deprecated 新调用方应直接读取 LightPickerResult.lightType
 */
export interface LightPickerPreset {
  id: 'point' | 'spot'
  name: string
  icon: string
  description: string
  /** 预设参数快照（新增） */
  presetId?: string
  params?: LightPresetParams
}

const emit = defineEmits<{
  select: [result: LightPickerResult]
  close: []
}>()

const pointPresets = POINT_LIGHT_PRESETS
const spotPresets = SPOT_LIGHT_PRESETS

const selectedPresetId = ref<string | null>(pointPresets[0]?.id ?? null)
const selectedLightType = ref<'point' | 'spot'>('point')

function selectPreset(lightType: 'point' | 'spot', presetId: string): void {
  selectedLightType.value = lightType
  selectedPresetId.value = presetId
}

function findPreset(lightType: 'point' | 'spot', presetId: string): LightPresetEntry | undefined {
  const list = lightType === 'point' ? pointPresets : spotPresets
  return list.find(p => p.id === presetId)
}

function handleConfirm(): void {
  if (!selectedPresetId.value) return
  const preset = findPreset(selectedLightType.value, selectedPresetId.value)
  if (!preset) return
  emit('select', {
    lightType: selectedLightType.value,
    presetId: preset.id,
    params: { ...preset.params },
  })
}
</script>

<style scoped>
.light-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.56);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.light-picker-dialog {
  width: min(720px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 48px));
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header,
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-footer {
  border-top: 1px solid #e5e7eb;
  border-bottom: none;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.close-btn,
.cancel-btn,
.confirm-btn {
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.close-btn {
  width: 32px;
  height: 32px;
  background: #f3f4f6;
  color: #374151;
  font-size: 18px;
}

.dialog-body {
  padding: 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 分组 ── */
.light-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.group-icon {
  font-size: 18px;
}

.group-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.group-desc {
  font-size: 12px;
  color: #6b7280;
  margin-left: 4px;
}

/* ── 预设网格 ── */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.preset-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #dbe3ef;
  background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.preset-card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.10);
}

.preset-card.selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.20), 0 6px 16px rgba(59, 130, 246, 0.12);
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
}

.preset-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.08);
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.preset-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.preset-desc {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.preset-badge.flicker {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

/* ── 按钮 ── */
.cancel-btn,
.confirm-btn {
  min-width: 88px;
  padding: 10px 14px;
  font-size: 14px;
}

.cancel-btn {
  background: #f3f4f6;
  color: #374151;
}

.confirm-btn {
  background: #2563eb;
  color: #ffffff;
}

.confirm-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>
