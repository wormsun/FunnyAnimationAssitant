<template>
  <div class="expression-manager">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          表情管理
        </h2>
        
        <div class="filter-controls">
          <button 
            class="btn-filter"
            :class="{ active: selectedTags.length > 0 }"
            @click="showFilterModal = true"
          >
            筛选 <span v-if="selectedTags.length > 0">({{ selectedTags.length }})</span>
            <span class="icon">▼</span>
          </button>
        </div>

        <div class="type-filters">
          <button 
            v-for="opt in genderOptions"
            :key="opt"
            class="btn-filter-type"
            :class="{ active: currentGenderTag === opt }"
            @click="currentGenderTag = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- 排序 -->
        <div class="sort-box">
          <select
            v-model="sortOrder"
            class="sort-select"
          >
            <option value="newest">
              📅 最新创建
            </option>
            <option value="oldest">
              📅 最早创建
            </option>
          </select>
        </div>

        <!-- 搜索框 -->
        <div class="search-box">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索表情名称..."
            class="search-input"
          >
        </div>

        <button
          class="btn-batch"
          @click="toggleBatchMode"
        >
          {{ isBatchMode ? '退出批量' : '⚙️ 批量管理' }}
        </button>

        <template v-if="isBatchMode">
          <button
            class="btn-secondary"
            @click="selectAll"
          >
            全选
          </button>
          <button
            class="btn-secondary"
            @click="deselectAll"
          >
            全不选
          </button>
          <button
            class="btn-secondary"
            @click="invertSelection"
          >
            反向选择
          </button>
          <button
            class="btn-delete-batch"
            :disabled="selectedIds.size === 0"
            @click="batchDelete"
          >
            🗑️ 删除 ({{ selectedIds.size }})
          </button>
        </template>
        <template v-else>
          <button
            class="btn-new"
            @click="openCreateModal"
          >
            + 新建表情
          </button>
          <button
            class="btn-import"
            @click="showImportDialog = true"
          >
            📁 导入表情
          </button>
        </template>
      </div>
    </div>

    <!-- 表情画廊 -->
    <div class="gallery-container">
      <div
        v-if="filteredExpressions.length === 0"
        class="empty-state"
      >
        <p>📭 暂无表情</p>
        <p class="hint">
          点击"新建表情"开始创建
        </p>
      </div>

      <div
        v-else
        class="gallery-grid"
      >
        <div
          v-for="expr in filteredExpressions"
          :key="expr.id"
          class="expression-card"
          :class="{ selected: isBatchMode && selectedIds.has(expr.id) }"
          @click="handleCardClick(expr)"
        >
          <!-- 批量模式下的复选框 -->
          <div
            v-if="isBatchMode"
            class="card-checkbox"
          >
            <input
              type="checkbox"
              :checked="selectedIds.has(expr.id)"
              @click.stop="toggleSelect(expr.id)"
            >
          </div>

          <!-- 图片预览 -->
          <div class="card-image">
            <img 
              :src="getImageUrlSync(expr)" 
              :alt="expr.name"
              :style="{ transform: expr.flipHorizontal ? 'scaleX(-1)' : 'none' }"
              @error="handleImageError"
            >
          </div>

          <!-- 卡片信息 -->
          <div class="card-info">
            <div class="card-name">
              {{ expr.name }}
            </div>
            <div class="card-meta">
              <span class="card-time">{{ formatTime(expr.createdAt) }}</span>
              <span
                v-if="expr.speakingFrames.length > 0"
                class="card-badge"
              >
                动画 ({{ expr.speakingFrames.length }}帧)
              </span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div
            v-if="!isBatchMode"
            class="card-actions"
          >
            <button
              class="btn-edit"
              title="编辑"
              @click.stop="openEditModal(expr)"
            >
              ✏️
            </button>
            <button
              class="btn-delete"
              title="删除"
              @click.stop="deleteExpression(expr.id)"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Footer Removed -->

    <!-- 编辑/新建弹窗 -->
    <ExpressionEditorModal
      v-if="editorModalVisible"
      :visible="editorModalVisible"
      :expression="editingExpression"
      @close="closeEditorModal"
      @saved="handleExpressionSaved"
      @deleted="handleExpressionDeleted"
    />
    <TagSelectDialog
      v-model:visible="showFilterModal"
      :available-tags="availableTags"
      :selected-tags="selectedTags"
      @confirm="handleTagsConfirm"
    />

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      v-if="showDeleteConfirm"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      :is-danger="true"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />

    <!-- 导入对话框 -->
    <ExpressionImportDialog
      v-if="showImportDialog"
      @close="showImportDialog = false"
      @imported="handleImported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { useExpressionStore } from '@/stores/expressionStore'
import type { Expression } from '@/types/project'

import TagSelectDialog from './common/TagSelectDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ExpressionEditorModal from './ExpressionEditorModal.vue'
import ExpressionImportDialog from './ExpressionImportDialog.vue'

const expressionStore = useExpressionStore()
const { getImageUrl, preloadImages, clearCache } = useAssetImage()

// 选项
const genderOptions = ['全部', '男', '女', '其他']

// 筛选状态
const currentGenderTag = ref('全部')
const selectedTags = ref<string[]>([])
const searchKeyword = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const showFilterModal = ref(false)

// 批量管理模式
const isBatchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())

// 编辑弹窗
const editorModalVisible = ref(false)
const editingExpression = ref<Expression | null>(null)

// 导入对话框
const showImportDialog = ref(false)

// 计算所有可用标签（排除性别标签）
const availableTags = computed(() => {
  const tags = new Set<string>()
  const genderTags = new Set(['男', '女', '其他'])
  
  expressionStore.expressionList.forEach(expr => {
    expr.tags.forEach(t => {
      if (!genderTags.has(t)) {
        tags.add(t)
      }
    })
  })
  return Array.from(tags).sort()
})

// 筛选后的表情列表
const filteredExpressions = computed(() => {
  let expressions = expressionStore.expressionList

  // 性别筛选
  if (currentGenderTag.value !== '全部') {
    const targetGender = currentGenderTag.value
    let mappedGender: 'male' | 'female' | 'other' | undefined
    if (targetGender === '男') mappedGender = 'male'
    else if (targetGender === '女') mappedGender = 'female'
    else if (targetGender === '其他') mappedGender = 'other'

    expressions = expressions.filter(expr => {
      // 兼容旧数据（检查 tags）和新数据（检查 gender 字段）
      const hasTag = expr.tags.includes(targetGender)
      const hasGender = mappedGender && expr.gender === mappedGender
      return hasTag || hasGender
    })
  }

  // 多标签筛选：匹配任一选中标签
  if (selectedTags.value.length > 0) {
    expressions = expressions.filter(expr => expr.tags.some(t => selectedTags.value.includes(t)))
  }

  // 搜索筛选
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    expressions = expressions.filter(expr =>
      expr.name.toLowerCase().includes(keyword)
    )
  }

  // 排序
  return [...expressions].sort((a, b) => {
    if (sortOrder.value === 'newest') {
      return (b.createdAt || 0) - (a.createdAt || 0)
    } else {
      return (a.createdAt || 0) - (b.createdAt || 0)
    }
  })
})

function handleTagsConfirm(tags: string[]) {
  selectedTags.value = tags
}

// 获取图片URL（同步版本，用于模板）
function getImageUrlSync(expr: Expression): string {
  return getImageUrl(expr.defaultFrame.url)
}

// 预加载所有表情的图片
function preloadExpressionImages() {
  const paths = filteredExpressions.value
    .map(expr => expr.defaultFrame.url)
    .filter(url => url && !url.startsWith('blob:') && !url.startsWith('data:'))
  void preloadImages(paths)
}

// 处理图片加载错误
function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement
  if (img) {
    // 可以显示一个占位符
    console.warn('[ExpressionManager] 图片加载失败:', img.src)
  }
}

// 格式化时间
function formatTime(timestamp?: number): string {
  if (!timestamp) return '未知'
  
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60))
      return minutes <= 0 ? '刚刚' : `${minutes}分钟前`
    }
    return `${hours}小时前`
  } else if (days === 1) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

// 批量管理模式
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value.clear()
}

function selectAll() {
  filteredExpressions.value.forEach(expr => selectedIds.value.add(expr.id))
}

function deselectAll() {
  selectedIds.value.clear()
}

function invertSelection() {
  const currentSet = new Set(selectedIds.value)
  selectedIds.value.clear()
  filteredExpressions.value.forEach(expr => {
    if (!currentSet.has(expr.id)) {
      selectedIds.value.add(expr.id)
    }
  })
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

function handleCardClick(expr: Expression) {
  if (isBatchMode.value) {
    toggleSelect(expr.id)
  } else {
    openEditModal(expr)
  }
}

function batchDelete() {
  if (selectedIds.value.size === 0) return
  pendingDeleteIds.value = Array.from(selectedIds.value)
  deleteConfirmTitle.value = '批量删除表情'
  deleteConfirmMessage.value = `确定要删除选中的 ${selectedIds.value.size} 个表情吗？此操作不可恢复！`
  showDeleteConfirm.value = true
}

// Delete Confirmation State
const showDeleteConfirm = ref(false)
const deleteConfirmTitle = ref('')
const deleteConfirmMessage = ref('')
const pendingDeleteIds = ref<string[]>([])

function confirmDelete() {
  if (pendingDeleteIds.value.length > 0) {
    void expressionStore.deleteExpressions(pendingDeleteIds.value)
    if (pendingDeleteIds.value.length > 1) {
      isBatchMode.value = false
      selectedIds.value.clear()
    }
  }
  pendingDeleteIds.value = []
  showDeleteConfirm.value = false
}

// 编辑弹窗
function openCreateModal() {
  editingExpression.value = null
  editorModalVisible.value = true
}

function openEditModal(expr: Expression) {
  editingExpression.value = expr
  editorModalVisible.value = true
}

function closeEditorModal() {
  editorModalVisible.value = false
  editingExpression.value = null
}

function handleExpressionSaved() {
  // 弹窗关闭时会自动刷新列表
  closeEditorModal()
  // 清除图片缓存，重新加载
  clearCache()
  preloadExpressionImages()
}

function handleExpressionDeleted() {
  // 弹窗关闭时会自动刷新列表
  closeEditorModal()
  // 清除图片缓存，重新加载
  clearCache()
  preloadExpressionImages()
}

// 监听表情列表变化，预加载图片
watch(filteredExpressions, () => {
  preloadExpressionImages()
}, { deep: true })

onMounted(() => {
  preloadExpressionImages()
})

// 删除表情
function deleteExpression(id: string) {
  pendingDeleteIds.value = [id]
  deleteConfirmTitle.value = '删除表情'
  deleteConfirmMessage.value = '确定要删除这个表情吗？此操作不可恢复！'
  showDeleteConfirm.value = true
}

// 处理导入完成
function handleImported(count: number) {
  console.log(`[ExpressionManager] 成功导入 ${count} 个表情`)
  // 清除图片缓存，重新加载
  clearCache()
  preloadExpressionImages()
}
</script>

<style scoped>
.expression-manager {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f9fafb;
  overflow: hidden;
}

/* 顶部工具栏 */
.toolbar {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.filter-controls {
  display: flex;
  gap: 8px;
}

.type-filters {
  display: flex;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}

.btn-filter-type {
  padding: 6px 16px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-filter-type.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.btn-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  color: #374151;
  cursor: pointer;
  font-size: 14px;
}
.btn-filter.active { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  position: relative;
}

.sort-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  outline: none;
}

.sort-select:hover {
  border-color: #9ca3af;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 200px;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.btn-batch,
.btn-secondary {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  color: #374151;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-batch:hover,
.btn-secondary:hover {
  background: #f9fafb;
}

.btn-new {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-new:hover {
  background: #2563eb;
}

.btn-import {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-import:hover {
  background: #2563eb;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.filter-modal {
  background: white;
  width: 500px;
  max-width: 90vw;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
}

.filter-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-header h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.close-btn {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #9ca3af;
}

.filter-body {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  font-size: 14px;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-chip:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.tag-chip.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* 画廊容器 */
.gallery-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  font-size: 16px;
}

.empty-state .hint {
  margin-top: 8px;
  font-size: 14px;
  color: #d1d5db;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.expression-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
}

.expression-card:hover {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  transform: translateY(-2px);
}

.expression-card.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.card-checkbox {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
}

.card-checkbox input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.card-image {
  width: 100%;
  aspect-ratio: 1;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 12px;
}

.card-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
}

.card-time {
  flex: 1;
}

.card-badge {
  padding: 2px 6px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 3px;
  font-size: 11px;
}

.card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.expression-card:hover .card-actions {
  opacity: 1;
}

.btn-edit,
.btn-delete {
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-edit:hover {
  background: white;
  border-color: #3b82f6;
}

.btn-delete:hover {
  background: #fee2e2;
  border-color: #ef4444;
}

.btn-delete-batch {
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-delete-batch:disabled {
  background: #fca5a5;
  cursor: not-allowed;
}

.btn-delete-batch:hover:not(:disabled) {
  background: #dc2626;
}
</style>
