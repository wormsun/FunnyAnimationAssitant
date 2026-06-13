<template>
  <div
    class="actor-config-overlay"
    @click.self="$emit('close')"
  >
    <div class="actor-config-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          {{ isEdit ? '编辑演员' : '添加演员' }}
        </h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 选择人物(仅新建时) -->
        <div
          v-if="!isEdit"
          class="form-group"
        >
          <label class="form-label">选择人物</label>
          <div class="character-list">
            <div
              v-for="char in availableCharacters"
              :key="char.id"
              class="character-item"
              :class="{ selected: selectedCharacterId === char.id }"
              @click="selectedCharacterId = char.id"
            >
              <span class="character-avatar">👤</span>
              <span class="character-name">{{ char.name }}</span>
            </div>
          </div>
          <p
            v-if="availableCharacters.length === 0"
            class="empty-hint"
          >
            暂无可用人物,请先在项目中定义人物
          </p>
        </div>

        <!-- 演员名称 -->
        <div class="form-group">
          <label class="form-label">演员名称</label>
          <input
            v-model="formData.name"
            type="text"
            class="form-input"
            placeholder="例如: 阿强、小明"
          >
        </div>

        <!-- 演员别名 -->
        <div class="form-group">
          <label class="form-label">演员别名(用于剧本)</label>
          <input
            v-model="formData.alias"
            type="text"
            class="form-input"
            placeholder="例如: boy, girl"
            :disabled="isEdit"
          >
        </div>

        <!-- 配音设置 -->
        <div class="form-group">
          <label class="form-label">配音设置</label>
          <div class="voice-config">
            <div class="voice-row">
              <label>语速倍率:</label>
              <input
                v-model.number="formData.voice.speed"
                type="number"
                step="0.1"
                min="0.5"
                max="2.0"
                class="form-input-small"
              >
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          v-if="isEdit"
          class="btn-delete"
          @click="handleDelete"
        >
          删除演员
        </button>
        <div class="footer-right">
          <button
            class="btn-cancel"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            class="btn-save"
            :disabled="!canSave"
            @click="handleSave"
          >
            {{ isEdit ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed,ref } from 'vue'

import type { ActorConfig } from '@/types/screenplay'
import { generateId } from '@/utils/uuid'

const props = defineProps<{
  actor?: ActorConfig // 编辑模式传入
  existingAliases?: string[] // 已存在的别名
}>()

const emit = defineEmits<{
  close: []
  save: [actor: ActorConfig]
  delete: []
}>()

const isEdit = !!props.actor

// 模拟人物列表(TODO: 从项目数据获取)
const availableCharacters = ref([
  { id: 'char_boy_001', name: '男主角' },
  { id: 'char_girl_001', name: '女主角' },
  { id: 'char_teacher_001', name: '老师' },
  { id: 'char_friend_001', name: '好友' }
])

const selectedCharacterId = ref(props.actor?.characterId || '')

const formData = ref({
  name: props.actor?.name || '',
  alias: props.actor?.alias || '',
  voice: {
    speed: props.actor?.voice?.speed || 1.0
  }
})

const canSave = computed(() => {
  if (!formData.value.name || !formData.value.alias) return false
  if (!isEdit && !selectedCharacterId.value) return false
  return true
})

function handleSave() {
  if (!canSave.value) return

  const actor: ActorConfig = {
    id: isEdit ? props.actor.id : generateId('actor'),
    alias: formData.value.alias,
    characterId: isEdit ? props.actor.characterId : selectedCharacterId.value,
    name: formData.value.name,
    voice: {
      speed: formData.value.voice.speed
    }
  }

  emit('save', actor)
}

function handleDelete() {
  if (confirm(`确定要删除演员"${props.actor?.name}"吗?`)) {
    emit('delete')
  }
}
</script>

<style scoped>
.actor-config-overlay {
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

.actor-config-dialog {
  width: 90%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.character-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.character-item:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.character-item.selected {
  border-color: #3b82f6;
  background: #dbeafe;
}

.character-avatar {
  font-size: 24px;
}

.character-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.empty-hint {
  font-size: 14px;
  color: #9ca3af;
  text-align: center;
  padding: 20px;
}

.voice-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.voice-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.voice-row label {
  min-width: 80px;
  font-size: 14px;
  color: #6b7280;
}

.form-input-small {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.form-input-small:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  padding: 20px 24px;
  border-top: 1px solid #e5e7eb;
}

.footer-right {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.btn-delete {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: #fee2e2;
  color: #dc2626;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #fecaca;
}

.btn-cancel,
.btn-save {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: white;
  color: #6b7280;
  border: 1px solid #d1d5db;
}

.btn-cancel:hover {
  background: #f9fafb;
}

.btn-save {
  background: #3b82f6;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #2563eb;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
