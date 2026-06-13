<template>
  <div class="project-info-header">
    <!-- Row 1: Title (click to edit) -->
    <div class="header-top">
      <!-- 编辑模式 -->
      <div
        v-if="isEditing"
        class="title-edit-wrapper"
      >
        <input
          ref="nameInput"
          v-model="editName"
          class="title-input"
          @keydown.enter="confirmEdit"
          @keydown.escape="cancelEdit"
          @blur="confirmEdit"
        >
      </div>
      <!-- 显示模式 -->
      <h1
        v-else
        class="project-title"
        title="点击重命名"
        @click="startEdit"
      >
        {{ name }}
        <span class="edit-hint">✏️</span>
      </h1>
    </div>
    
    <!-- Row 2: Meta Info -->
    <div class="meta-row">
      <span
        class="meta-item"
        title="动画数量"
      >
        <span class="icon">🎬</span> {{ episodeCount }} 动画
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  name: string
  episodeCount: number
}>()

const emit = defineEmits<{
  rename: [name: string]
}>()

const isEditing = ref(false)
const editName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startEdit() {
  editName.value = props.name
  isEditing.value = true
  void nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

function confirmEdit() {
  const trimmed = editName.value.trim()
  if (trimmed && trimmed !== props.name) {
    emit('rename', trimmed)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}
</script>

<style scoped>
.project-info-header {
  margin-bottom: 20px;
}

.header-top {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.project-title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: -0.5px;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 8px;
  margin-left: -8px;
  transition: background 0.15s;
}

.project-title:hover {
  background: #f3f4f6;
}

.edit-hint {
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.15s;
}

.project-title:hover .edit-hint {
  opacity: 0.6;
}

.title-edit-wrapper {
  display: flex;
  align-items: center;
}

.title-input {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.5px;
  border: 2px solid #3b82f6;
  border-radius: 6px;
  padding: 2px 8px;
  outline: none;
  background: white;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  min-width: 200px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon {
  font-size: 14px;
  opacity: 0.8;
}
</style>
