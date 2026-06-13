<template>
  <div
    class="dialog-overlay"
    @click.self="$emit('cancel')"
  >
    <div class="dialog-card">
      <div class="dialog-header">
        <h2>选择项目文件</h2>
        <button
          class="close-btn"
          @click="$emit('cancel')"
        >
          ×
        </button>
      </div>

      <div class="dialog-body">
        <p class="description">
          在文件夹中发现 {{ files.length }} 个项目文件:
        </p>

        <div class="file-list">
          <div
            v-for="file in files"
            :key="file.name"
            :class="['file-item', { selected: selectedFile === file.name }]"
            @click="selectedFile = file.name"
          >
            <input
              v-model="selectedFile"
              type="radio"
              :value="file.name"
              class="radio-input"
            >
            <div class="file-icon">
              📄
            </div>
            <div class="file-info">
              <div class="file-name">
                {{ file.name }}
              </div>
              <div class="file-date">
                {{ formatDate(file.lastModified) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          class="btn btn-outline"
          @click="$emit('cancel')"
        >
          取消
        </button>
        <button
          class="btn btn-primary"
          :disabled="!selectedFile"
          @click="handleSelect"
        >
          打开
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface AnimeFileInfo {
  name: string
  lastModified: Date
}

interface Props {
  files: AnimeFileInfo[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [fileName: string]
  cancel: []
}>()

const selectedFile = ref<string>(props.files[0]?.name ?? '')

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function handleSelect() {
  if (selectedFile.value) {
    emit('select', selectedFile.value)
  }
}
</script>

<style scoped>
.dialog-overlay {
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

.dialog-card {
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 28px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.description {
  margin: 0 0 20px 0;
  color: #6b7280;
  font-size: 15px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.file-item:hover {
  border-color: #2563EB;
  background: #f9fafb;
}

.file-item.selected {
  border-color: #2563EB;
  background: linear-gradient(135deg, #f3e8ff 0%, #fce7f3 100%);
}

.radio-input {
  cursor: pointer;
  width: 20px;
  height: 20px;
  accent-color: #2563EB;
}

.file-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
}

.file-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.file-date {
  font-size: 14px;
  color: #6b7280;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px 32px;
  border-top: 1px solid #e5e7eb;
}

.btn {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline {
  background: white;
  color: #374151;
  border: 2px solid #e5e7eb;
}

.btn-outline:hover {
  border-color: #2563EB;
  color: #2563EB;
}

.btn-primary {
  background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(139, 92, 246, 0.3);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
