<template>
  <div
    class="modal-overlay"
    @click.self="$emit('close')"
  >
    <div class="import-dialog">
      <div class="dialog-header">
        <h3>📁 导入表情</h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 性别选择 -->
        <div class="form-group">
          <label>性别 *</label>
          <div class="gender-selector">
            <label class="radio-label">
              <input
                v-model="formData.gender"
                type="radio"
                value="male"
              > 男
            </label>
            <label class="radio-label">
              <input
                v-model="formData.gender"
                type="radio"
                value="female"
              > 女
            </label>
            <label class="radio-label">
              <input
                v-model="formData.gender"
                type="radio"
                value="other"
              > 其他
            </label>
          </div>
        </div>

        <!-- 标签编辑 -->
        <div class="form-group">
          <label>标签 (Tags)</label>
          <div class="tags-input-container">
            <div class="tags-list">
              <span
                v-for="tag in formData.tags"
                :key="tag"
                class="tag-badge"
              >
                {{ tag }}
                <button
                  class="tag-remove"
                  @click="removeTag(tag)"
                >×</button>
              </span>
            </div>
            <input
              v-model="newTagInput"
              type="text"
              placeholder="按回车添加..."
              class="tag-input"
              @keydown.enter.prevent="addTag"
              @blur="addTag"
            >
          </div>
          <!-- 快速选择已有标签 -->
          <div
            v-if="quickPickTags.length > 0"
            class="quick-tags"
          >
            <span
              v-for="tag in quickPickTags"
              :key="tag"
              class="quick-tag"
              @click="addTagDirectly(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- 混合模式 -->
        <div class="form-group">
          <label>混合模式</label>
          <select
            v-model="formData.blendMode"
            class="form-select"
          >
            <option value="normal">正常 (Normal)</option>
            <option value="multiply">正片叠底 (Multiply) - 适合白背景</option>
          </select>
          <p class="form-hint">
            💡 如果表情图片有白色背景，选择"正片叠底"可使白色透明化
          </p>
        </div>

        <!-- 文件夹选择 -->
        <div class="form-group">
          <label>导入文件夹</label>
          <button
            class="btn-select-folder"
            @click="openFolderBrowser"
          >
            📁 选择文件夹...
          </button>
          <div
            v-if="selectedFolderPath"
            class="folder-info"
          >
            <span class="folder-path">{{ selectedFolderPath }}</span>
            <span
              v-if="previewItems.length > 0"
              class="preview-count"
            >
              ({{ previewItems.length }} 个表情待导入)
            </span>
          </div>
        </div>

        <!-- 导入规则说明 -->
        <div class="rules-hint">
          <div class="hint-title">⚡ 导入规则</div>
          <ul>
            <li>单张图片 → 静态表情 (图片名 = 表情名)</li>
            <li>子文件夹 → 动画表情 (文件夹名 = 表情名，图片按名称排序)</li>
          </ul>
        </div>

        <!-- 预览列表 -->
        <div
          v-if="previewItems.length > 0"
          class="preview-list"
        >
          <div class="preview-header">预览</div>
          <div class="preview-items">
            <div
              v-for="item in previewItems"
              :key="item.name"
              class="preview-item"
            >
              <span class="item-icon">{{ item.type === 'static' ? '🖼️' : '🎞️' }}</span>
              <span class="item-name">{{ item.name }}</span>
              <span class="item-info">
                {{ item.type === 'static' ? '静态' : `${item.imageCount} 帧` }}
              </span>
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
          :disabled="!canImport || isImporting"
          class="btn-import"
          @click="handleImport"
        >
          <span v-if="isImporting">导入中... ({{ importProgress.current }}/{{ importProgress.total }})</span>
          <span v-else>导入 ({{ previewItems.length }})</span>
        </button>
      </div>
    </div>

    <!-- 文件夹选择对话框 -->
    <FileBrowserDialog
      v-if="showFolderBrowser"
      title="选择表情文件夹"
      select-mode="directory"
      @select-directory="handleFolderSelect"
      @close="showFolderBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useExpressionStore } from '@/stores/expressionStore'
import type { SelectedDirectory } from '@/types/fileBrowser'
import type { Expression } from '@/types/project'
import {
  type ImportPreviewItem,
  processImportItem,
  scanDirectoryForExpressions
} from '@/utils/expressionImportUtils'

import FileBrowserDialog from './FileBrowserDialog.vue'

const emit = defineEmits<{
  close: []
  imported: [count: number]
}>()

const expressionStore = useExpressionStore()

// 表单数据
const formData = ref({
  gender: 'female' as 'male' | 'female' | 'other',
  tags: [] as string[],
  blendMode: 'normal' as 'normal' | 'multiply'
})

// 标签输入
const newTagInput = ref('')

// 文件夹选择
const showFolderBrowser = ref(false)
const selectedFolderPath = ref<string | null>(null)
const selectedFolderHandle = ref<FileSystemDirectoryHandle | null>(null)

// 预览数据
const previewItems = ref<ImportPreviewItem[]>([])

// 导入状态
const isImporting = ref(false)
const importProgress = ref({ current: 0, total: 0 })

// 计算属性
const canImport = computed(() => previewItems.value.length > 0 && !isImporting.value)

// 获取所有表情的标签（去重）
const allExpressionTags = computed(() => {
  const tags = new Set<string>()
  Object.values(expressionStore.expressions).forEach((expr: Expression) => {
    expr.tags?.forEach((t: string) => {
      // 排除性别标签
      if (!['male', 'female', 'other', '男', '女', '其他'].includes(t)) {
        tags.add(t)
      }
    })
  })
  return Array.from(tags).sort()
})

// 快速选择标签
const quickPickTags = computed(() => {
  return allExpressionTags.value.filter(t => !formData.value.tags.includes(t))
})

// 标签操作
function addTag() {
  const tag = newTagInput.value.trim()
  if (tag && !formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag)
  }
  newTagInput.value = ''
}

function removeTag(tag: string) {
  formData.value.tags = formData.value.tags.filter(t => t !== tag)
}

function addTagDirectly(tag: string) {
  if (!formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag)
  }
}

// 打开文件夹浏览器
function openFolderBrowser() {
  showFolderBrowser.value = true
}

// 处理文件夹选择
async function handleFolderSelect(directory: SelectedDirectory) {
  showFolderBrowser.value = false
  selectedFolderPath.value = directory.path
  selectedFolderHandle.value = directory.handle

  // 扫描文件夹
  try {
    previewItems.value = await scanDirectoryForExpressions(directory.handle, directory.path)
  } catch (error) {
    console.error('[ExpressionImportDialog] 扫描文件夹失败:', error)
    previewItems.value = []
  }
}

// 执行导入
async function handleImport() {
  if (!canImport.value) return

  isImporting.value = true
  importProgress.value = { current: 0, total: previewItems.value.length }

  let successCount = 0

  try {
    for (const item of previewItems.value) {
      try {
        const result = await processImportItem(item)

        // 创建表情
        expressionStore.createExpression(result.name, result.defaultFrame, {
          gender: formData.value.gender,
          tags: [...formData.value.tags],
          speakingFrames: result.speakingFrames,
          speakingFps: 12,
          speakingLoop: true,
          blendMode: formData.value.blendMode
        })

        successCount++
      } catch (error) {
        console.error(`[ExpressionImportDialog] 导入 "${item.name}" 失败:`, error)
      }
      importProgress.value.current++
    }

    emit('imported', successCount)
    emit('close')
  } finally {
    isImporting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.import-dialog {
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  background: white;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.btn-close {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 20px;
  background: none;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group > label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.gender-selector {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #4b5563;
}

.radio-label input[type="radio"] {
  accent-color: #3b82f6;
}

.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.form-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #6b7280;
}

/* 标签样式 */
.tags-input-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  min-height: 42px;
  align-items: center;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #3b82f6;
  color: white;
  border-radius: 12px;
  font-size: 12px;
}

.tag-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}

.tag-remove:hover {
  color: white;
}

.tag-input {
  flex: 1;
  min-width: 100px;
  border: none;
  background: transparent;
  font-size: 14px;
  outline: none;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.quick-tag {
  padding: 4px 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-tag:hover {
  background: #e5e7eb;
  color: #374151;
}

/* 文件夹选择 */
.btn-select-folder {
  width: 100%;
  padding: 12px 16px;
  background: #f9fafb;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-select-folder:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}

.folder-info {
  margin-top: 8px;
  font-size: 13px;
  color: #4b5563;
}

.folder-path {
  font-family: monospace;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
}

.preview-count {
  color: #059669;
  font-weight: 500;
  margin-left: 8px;
}

/* 规则说明 */
.rules-hint {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.hint-title {
  font-size: 13px;
  font-weight: 600;
  color: #0369a1;
  margin-bottom: 8px;
}

.rules-hint ul {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #0c4a6e;
}

.rules-hint li {
  margin-bottom: 4px;
}

/* 预览列表 */
.preview-list {
  margin-top: 16px;
}

.preview-header {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 8px;
}

.preview-items {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.preview-item:last-child {
  border-bottom: none;
}

.item-icon {
  font-size: 16px;
}

.item-name {
  flex: 1;
  font-size: 13px;
  color: #374151;
}

.item-info {
  font-size: 12px;
  color: #9ca3af;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.btn-cancel {
  padding: 10px 20px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-import {
  padding: 10px 24px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-import:hover:not(:disabled) {
  background: #2563eb;
}

.btn-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
