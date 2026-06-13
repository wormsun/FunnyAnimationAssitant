<template>
  <div
    class="state-selector-overlay"
    @click.self="$emit('close')"
  >
    <div class="state-selector-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          选择人物姿态
        </h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <div
          v-if="stateList.length === 0"
          class="empty-state"
        >
          <p>暂无人物姿态定义</p>
          <p class="empty-hint">
            请在项目设置中定义人物姿态
          </p>
        </div>
        <div class="state-list">
          <div
            v-for="state in stateList"
            :key="state.id"
            class="state-item"
            :class="{ selected: selectedState === state.id }"
            @click="handleSelect(state.id)"
          >
            <span class="state-icon">{{ state.icon }}</span>
            <div class="state-info">
              <span class="state-name">{{ state.name }}</span>
              <span class="state-desc">{{ state.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          class="btn-cancel"
          @click="$emit('close')"
        >
          取消
        </button>
        <button
          class="btn-confirm"
          @click="handleConfirm"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface CharacterState {
  id: string
  name: string
  icon: string
  description: string
}

const props = defineProps<{
  currentState?: string
}>()

const emit = defineEmits<{
  close: []
  select: [state: string]
}>()

// TODO: 从项目配置获取状态列表
const stateList = ref<CharacterState[]>([
  { id: 'normal', name: '正常', icon: '🧍', description: '站立姿势' },
  { id: 'sit', name: '坐下', icon: '🪑', description: '坐姿' },
  { id: 'walk', name: '行走', icon: '🚶', description: '行走状态' },
  { id: 'run', name: '奔跑', icon: '🏃', description: '快速奔跑' },
])

const selectedState = ref<string>(props.currentState || 'normal')

function handleSelect(state: string) {
  selectedState.value = state
}

function handleConfirm() {
  emit('select', selectedState.value)
  emit('close')
}
</script>

<style scoped>
.state-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.state-selector-dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e5e7eb;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.state-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.state-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.state-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.state-item.selected {
  background: #dbeafe;
  border-color: #3b82f6;
}

.state-icon {
  font-size: 24px;
}

.state-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.state-desc {
  font-size: 12px;
  color: #6b7280;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
}

.empty-state p {
  margin: 8px 0;
}

.empty-hint {
  font-size: 13px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.btn-cancel,
.btn-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  color: #6b7280;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-confirm {
  background: #3b82f6;
  border: 1px solid #3b82f6;
  color: white;
}

.btn-confirm:hover {
  background: #2563eb;
}
</style>
