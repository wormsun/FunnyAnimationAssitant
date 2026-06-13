<template>
  <div
    class="dialog-overlay"
    @click.self="$emit('cancel')"
  >
    <div class="dialog-card">
      <div class="dialog-header">
        <h2>🔴 新建项目 (对话框已显示)</h2>
        <button
          class="close-btn"
          @click="$emit('cancel')"
        >
          ×
        </button>
      </div>

      <div class="dialog-body">
        <!-- 文件夹路径 -->
        <div class="form-group">
          <label>📁 项目文件夹</label>
          <div class="folder-path">
            {{ directoryHandle.name }}
          </div>
        </div>

        <!-- 项目文件名 -->
        <div class="form-group">
          <label>📄 项目文件名</label>
          <div class="filename-input-group">
            <input
              v-model="fileName"
              type="text"
              class="filename-input"
              placeholder="Untitled"
              @input="validateFileName"
            >
            <span class="extension">.anime</span>
          </div>
          <div
            v-if="validationError"
            class="validation-error"
          >
            ✗ {{ validationError }}
          </div>
          <div
            v-else-if="fileName.trim()"
            class="validation-success"
          >
            ✓ 该名称可用
          </div>
        </div>

        <!-- 项目名称(可选) -->
        <div class="form-group">
          <label>项目名称 (可选)</label>
          <input
            v-model="projectName"
            type="text"
            class="text-input"
            :placeholder="fileName || 'Untitled'"
          >
        </div>

        <!-- 现有文件列表 -->
        <div
          v-if="existingFiles.length > 0"
          class="existing-files"
        >
          <p class="info-text">
            ⚠ 该文件夹已有 {{ existingFiles.length }} 个项目文件:
          </p>
          <ul class="file-list">
            <li
              v-for="file in existingFiles"
              :key="file"
            >
              • {{ file }}
            </li>
          </ul>
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
          :disabled="!isValid"
          @click="handleConfirm"
        >
          创建
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted,ref } from 'vue'

import { useProjectStore } from '@/stores/projectStore'

interface Props {
  directoryHandle: FileSystemDirectoryHandle
  existingFiles: string[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [data: { fileName: string; projectName: string }]
  cancel: []
}>()

const projectStore = useProjectStore()

const fileName = ref('')
const projectName = ref('')
const validationError = ref('')

// 初始化时生成默认文件名
onMounted(() => {
  fileName.value = projectStore.generateUniqueFileName(props.existingFiles)
})

// 验证文件名
function validateFileName() {
  const name = fileName.value.trim()
  
  if (!name) {
    validationError.value = '文件名不能为空'
    return
  }

  // 检查非法字符
  const invalidChars = /[<>:"/\\|?*]/
  if (invalidChars.test(name)) {
    validationError.value = '文件名包含非法字符'
    return
  }

  // 检查是否与现有文件重名 (不区分大小写)
  const fullName = `${name}.anime`
  const existsIgnoreCase = props.existingFiles.some(
    existingFile => existingFile.toLowerCase() === fullName.toLowerCase()
  )
  if (existsIgnoreCase) {
    validationError.value = '文件名已存在,请修改'
    return
  }

  validationError.value = ''
}

const isValid = computed(() => {
  return fileName.value.trim() && !validationError.value
})

function handleConfirm() {
  if (!isValid.value) return
  
  emit('confirm', {
    fileName: fileName.value.trim(),
    projectName: projectName.value.trim() || fileName.value.trim()
  })
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
  max-height: 90vh;
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
  padding: 32px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.folder-path {
  padding: 12px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #6b7280;
  font-family: monospace;
  font-size: 14px;
}

.filename-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filename-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;
}

.filename-input:focus {
  outline: none;
  border-color: #2563EB;
}

.extension {
  font-size: 16px;
  color: #9ca3af;
  font-weight: 500;
}

.text-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;
}

.text-input:focus {
  outline: none;
  border-color: #2563EB;
}

.validation-error {
  margin-top: 8px;
  color: #ef4444;
  font-size: 14px;
  font-weight: 500;
}

.validation-success {
  margin-top: 8px;
  color: #10b981;
  font-size: 14px;
  font-weight: 500;
}

.existing-files {
  margin-top: 24px;
  padding: 16px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 8px;
}

.info-text {
  margin: 0 0 8px 0;
  color: #92400e;
  font-size: 14px;
  font-weight: 500;
}

.file-list {
  margin: 0;
  padding-left: 20px;
  color: #92400e;
  font-size: 13px;
}

.file-list li {
  margin: 4px 0;
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
