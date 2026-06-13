<template>
  <div class="modal-overlay" @click="handleOverlayClick">
    <div class="modal-content" @click.stop>
      <!-- Header -->
      <div class="modal-header">
        <h3>导入音效</h3>
        <button class="close-btn" @click="close">×</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- 分类选项 -->
        <div class="form-section">
          <div class="form-group">
            <label>分类:</label>
            <div class="radio-group">
              <label class="radio-label">
                <input
                  v-model="classifyMode"
                  type="radio"
                  value="auto"
                >
                智能区分
              </label>
              <label class="radio-label">
                <input
                  v-model="classifyMode"
                  type="radio"
                  value="bgm"
                >
                背景音乐 (BGM)
              </label>
              <label class="radio-label">
                <input
                  v-model="classifyMode"
                  type="radio"
                  value="sfx"
                >
                音效 (SFX)
              </label>
            </div>
            <div
              v-if="classifyMode === 'auto'"
              class="type-hint"
            >
              根据音频长度自动区分：>20秒为背景音乐，否则为音效
            </div>
          </div>
        </div>

        <div class="divider" />

        <!-- 标签 -->
        <div class="form-section">
          <div class="form-group">
            <label>标签:</label>
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
                v-model="tagInput"
                type="text"
                class="tag-input"
                placeholder="输入标签按回车添加..."
                @keydown.enter.prevent="addTag"
              >
            </div>
            <div
              v-if="availableTags.length > 0"
              class="recommended-tags"
            >
              <span
                v-for="tag in availableTags"
                :key="tag"
                class="recommend-tag"
                @click="addTagDirectly(tag)"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <div class="divider" />

        <!-- 文件选择 -->
        <div class="form-section">
          <div class="select-folder-btn" @click="selectFiles">
            <span class="icon">📂</span>
            <span>选择音频文件...</span>
          </div>
        </div>

        <!-- 预览列表 -->
        <div
          v-if="previewItems.length > 0"
          class="preview-section"
        >
          <div class="section-title">
            待导入项目 ({{ previewItems.length }})
          </div>
          <div class="preview-list">
            <div
              v-for="item in previewItems"
              :key="item.filePath"
              class="preview-item"
            >
              <span class="icon">{{ item.type === 'bgm' ? '🎵' : '🔊' }}</span>
              <span class="name">{{ item.name }}</span>
              <span class="type-badge" :class="item.type">
                {{ item.type === 'bgm' ? 'BGM' : 'SFX' }}
              </span>
              <span class="duration">{{ formatTime(item.duration) }}</span>
              <button
                class="btn-remove"
                @click="removePreviewItem(item)"
              >×</button>
            </div>
          </div>
        </div>

        <!-- 进度 -->
        <div
          v-if="isImporting"
          class="progress-section"
        >
          <div class="progress-info">
            导入中... {{ importProgress.current }} / {{ importProgress.total }}
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${(importProgress.current / importProgress.total) * 100}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-cancel" @click="close">取消</button>
        <button
          class="btn-save"
          :disabled="previewItems.length === 0 || isImporting"
          @click="handleImport"
        >
          开始导入 ({{ previewItems.length }})
        </button>
      </div>
    </div>

    <!-- 文件浏览对话框 -->
    <FileBrowserDialog
      v-if="showFileBrowser"
      title="选择音效文件夹"
      select-mode="directory"
      @select-directory="handleDirectorySelect"
      @close="showFileBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import FileBrowserDialog from '@/components/FileBrowserDialog.vue'
import { useSoundStore } from '@/stores/soundStore'
import type { SelectedDirectory } from '@/types/fileBrowser'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
}>()

const soundStore = useSoundStore()

// State
const classifyMode = ref<'auto' | 'bgm' | 'sfx'>('auto')
const tagInput = ref('')
const formData = ref<{ tags: string[] }>({ tags: [] })
const showFileBrowser = ref(false)

interface PreviewItem {
  name: string
  filePath: string
  type: 'bgm' | 'sfx'
  duration: number
  handle: FileSystemFileHandle
}
const previewItems = ref<PreviewItem[]>([])

const isImporting = ref(false)
const importProgress = ref({ current: 0, total: 0 })

// Computed
const availableTags = computed(() => {
  const all = soundStore.allTags
  return all.filter(t => !formData.value.tags.includes(t))
})

// Methods
function handleOverlayClick() {
  // 不关闭
}

function close() {
  emit('close')
}

// 标签管理
function addTag() {
  const val = tagInput.value.trim()
  if (val && !formData.value.tags.includes(val)) {
    formData.value.tags.push(val)
  }
  tagInput.value = ''
}

function addTagDirectly(tag: string) {
  if (!formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag)
  }
}

function removeTag(tag: string) {
  formData.value.tags = formData.value.tags.filter(t => t !== tag)
}

// 文件选择
function selectFiles() {
  showFileBrowser.value = true
}

async function handleDirectorySelect(directory: SelectedDirectory) {
  showFileBrowser.value = false
  
  // 扫描目录中的音频文件
  const audioFiles: { name: string; handle: FileSystemFileHandle; path: string }[] = []
  
  async function scanDirectory(dirHandle: FileSystemDirectoryHandle, basePath: string) {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry
        if (audioFileFilter(fileHandle)) {
          audioFiles.push({
            name: fileHandle.name,
            handle: fileHandle,
            path: basePath ? `${basePath}/${fileHandle.name}` : fileHandle.name
          })
        }
      }
    }
  }
  
  await scanDirectory(directory.handle, directory.path)
  
  if (audioFiles.length === 0) return

  for (const file of audioFiles) {
    const blob = await file.handle.getFile()
    const duration = await getAudioDuration(blob)
    
    // 确定类型
    let type: 'bgm' | 'sfx'
    if (classifyMode.value === 'auto') {
      type = duration > 20 ? 'bgm' : 'sfx'
    } else {
      type = classifyMode.value
    }
    
    const name = file.name.replace(/\.[^/.]+$/, '')
    
    previewItems.value.push({
      name,
      filePath: file.path,
      type,
      duration,
      handle: file.handle
    })
  }
}

// 获取音频时长
function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(audio.duration || 0)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src)
      resolve(0)
    }
    audio.src = URL.createObjectURL(blob)
  })
}

function removePreviewItem(item: PreviewItem) {
  previewItems.value = previewItems.value.filter(i => i.filePath !== item.filePath)
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// 导入
async function handleImport() {
  if (previewItems.value.length === 0) return

  isImporting.value = true
  importProgress.value = { current: 0, total: previewItems.value.length }

  let successCount = 0

  try {
    for (const item of previewItems.value) {
      try {
        const newSound = soundStore.createSound(item.name, item.type)
        
        // 加载 blob URL
        const blob = await item.handle.getFile()
        const blobUrl = URL.createObjectURL(blob)
        
        soundStore.updateSound(newSound.id, {
          tags: [...formData.value.tags],
          url: item.filePath,
          _runtimeUrl: blobUrl,
          duration: item.duration
        })

        successCount++
      } catch (error) {
        console.error(`[SoundImportDialog] 导入 "${item.name}" 失败:`, error)
      }
      importProgress.value.current++
    }

    emit('imported', successCount)
    close()
  } finally {
    isImporting.value = false
  }
}

function audioFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  return /\.(mp3|wav|ogg|aac|m4a|flac|webm)$/.test(name)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  width: 700px;
  max-height: 85vh;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #9ca3af;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-section {
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group > label {
  display: block;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.radio-group {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #4b5563;
  cursor: pointer;
}

.type-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 16px 0;
}

/* Tags */
.tags-input-container {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
  min-height: 44px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #3b82f6;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.tag-remove {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  font-size: 14px;
}

.tag-input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 14px;
}

.recommended-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recommend-tag {
  padding: 4px 8px;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}

.recommend-tag:hover {
  background: #e5e7eb;
}

/* Select Files */
.select-folder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: #6b7280;
}

.select-folder-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}

.select-folder-btn .icon {
  font-size: 24px;
}

/* Preview */
.preview-section {
  margin-top: 16px;
}

.section-title {
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.preview-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-item .icon {
  font-size: 18px;
}

.preview-item .name {
  flex: 1;
  font-size: 14px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-item .type-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.preview-item .type-badge.bgm {
  background: #dbeafe;
  color: #1e40af;
}

.preview-item .type-badge.sfx {
  background: #fce7f3;
  color: #9d174d;
}

.preview-item .duration {
  font-size: 12px;
  color: #9ca3af;
}

.preview-item .btn-remove {
  background: none;
  border: none;
  font-size: 18px;
  color: #9ca3af;
  cursor: pointer;
}

.preview-item .btn-remove:hover {
  color: #ef4444;
}

/* Progress */
.progress-section {
  margin-top: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.progress-info {
  font-size: 14px;
  color: #374151;
  margin-bottom: 8px;
}

.progress-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

/* Footer */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 20px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

.btn-save {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-save:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-save:not(:disabled):hover {
  background: #2563eb;
}
</style>
