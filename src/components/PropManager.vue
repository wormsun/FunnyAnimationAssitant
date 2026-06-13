<template>
  <div class="prop-manager">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          道具管理
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
            class="btn-filter-type" 
            :class="{ active: resourceType === 'all' }"
            @click="resourceType = 'all'"
          >
            全部
          </button>
          <button 
            class="btn-filter-type" 
            :class="{ active: resourceType === 'dynamic' }"
            @click="resourceType = 'dynamic'"
          >
            动态
          </button>
          <button 
            class="btn-filter-type" 
            :class="{ active: resourceType === 'static' }"
            @click="resourceType = 'static'"
          >
            静态
          </button>
        </div>
      </div>

      <div class="toolbar-right">
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

        <div class="search-box">
          <input 
            v-model="searchKeyword" 
            type="text" 
            placeholder="搜索道具..." 
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
            删除 ({{ selectedIds.size }})
          </button>
        </template>

        <button
          v-if="!isBatchMode"
          class="btn-new"
          @click="openCreateModal"
        >
          + 新建道具
        </button>
        <button
          v-if="!isBatchMode"
          class="btn-import"
          @click="showImportDialog = true"
        >
          📁 导入道具
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Gallery -->
      <div class="gallery-container">
        <div
          v-if="filteredProps.length === 0"
          class="empty-state"
        >
          <p>📭 暂无道具</p>
          <p class="hint">
            点击"新建道具"开始创建
          </p>
        </div>

        <div
          v-else
          class="gallery-grid"
        >
          <div 
            v-for="prop in filteredProps" 
            :key="prop.id" 
            class="prop-card"
            :class="{ selected: isBatchMode && selectedIds.has(prop.id) }"
            @click="handleCardClick(prop)"
          >
            <!-- Batch Checkbox -->
            <div
              v-if="isBatchMode"
              class="card-checkbox"
            >
              <input 
                type="checkbox" 
                :checked="selectedIds.has(prop.id)"
                @click.stop="toggleSelect(prop.id)"
              >
            </div>

            <!-- Preview -->
            <div class="card-preview">
              <img 
                :src="getPreviewUrl(prop)" 
                @error="handleImageError"
              >
              <div
                v-if="prop.type === 'animation'"
                class="anim-badge"
              >
                动画 ({{ prop.frames?.length || 0 }}帧)
              </div>
            </div>

            <!-- Info -->
            <div class="card-info">
              <div
                class="prop-name"
                :title="prop.name"
              >
                {{ prop.name }}
              </div>
              <div class="prop-meta">
                <div class="tags-row">
                  <span
                    v-for="tag in (prop.tags || []).slice(0, 2)"
                    :key="tag"
                    class="mini-tag"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="(prop.tags || []).length > 2"
                    class="more-tags"
                  >...</span>
                </div>
                <span class="time-ago">{{ formatTimeAgo(prop.createdAt || 0) }}</span>
              </div>
            </div>

            <!-- Hover Actions -->
            <div
              v-if="!isBatchMode"
              class="card-actions"
            >
              <button
                class="btn-icon edit"
                title="编辑"
                @click.stop="openEditModal(prop.id)"
              >
                ✏️
              </button>
              <button
                class="btn-icon delete"
                title="删除"
                @click.stop="deleteProp(prop.id)"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 标签筛选对话框 -->
    <TagSelectDialog
      v-model:visible="showFilterModal"
      :available-tags="allTags"
      :selected-tags="selectedTags"
      @confirm="handleTagsConfirm"
    />

    <!-- Editor Modal -->
    <PropEditorModal 
      :visible="editorVisible" 
      v-bind="editingPropId ? { 'prop-id': editingPropId } : {}"
      @close="closeEditor"
      @save="handleSaved"
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
    <AssetImportDialog
      v-if="showImportDialog"
      asset-type="prop"
      @close="showImportDialog = false"
      @imported="handleImported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed,ref } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { usePropStore } from '@/stores/propStore'
import type { PropAsset } from '@/types/project'

import AssetImportDialog from './AssetImportDialog.vue'
import TagSelectDialog from './common/TagSelectDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import PropEditorModal from './PropEditorModal.vue'

const propStore = usePropStore()
const { getImageUrl } = useAssetImage()

// State
const selectedTags = ref<string[]>([])
const resourceType = ref<'all' | 'dynamic' | 'static'>('all')
const searchKeyword = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const isBatchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const editorVisible = ref(false)
const editingPropId = ref<string | undefined>(undefined)

// 导入对话框
const showImportDialog = ref(false)

// Filter Modal
const showFilterModal = ref(false)

// Computed
const allTags = computed(() => {
  const tags = new Set<string>()
  propStore.props.forEach((p: PropAsset) => {
    p.tags?.forEach((t: string) => tags.add(t))
  })
  return Array.from(tags).sort()
})

function handleTagsConfirm(tags: string[]) {
  selectedTags.value = tags
}

const filteredProps = computed(() => {
  let list = propStore.props
  
  // 多标签筛选：匹配任一选中标签
  if (selectedTags.value.length > 0) {
    list = list.filter((p: PropAsset) => p.tags?.some((t: string) => selectedTags.value.includes(t)))
  }
  
  if (resourceType.value === 'dynamic') {
    list = list.filter((p: PropAsset) => p.type === 'animation')
  } else if (resourceType.value === 'static') {
    list = list.filter((p: PropAsset) => p.type === 'static')
  }

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter((p: PropAsset) => (p.name || '').toLowerCase().includes(kw))
  }
  
  // Sort by Time
  return [...list].sort((a, b) => {
    if (sortOrder.value === 'newest') {
      return (b.createdAt || 0) - (a.createdAt || 0)
    } else {
      return (a.createdAt || 0) - (b.createdAt || 0)
    }
  })
})

// Methods
function getPreviewUrl(prop: PropAsset): string {
  if (prop.type === 'static') {
    return prop._runtimeUrl || getImageUrl(prop.url) || ''
  } else {
    // Animation: Prioritize custom still frame, then first frame
    if (prop.stillFrameSource === 'custom') {
      return prop._runtimeStillUrl || getImageUrl(prop.stillFrameCustomUrl) || ''
    } else {
      // Use frame
      const idx = prop.stillFrameIndex || 0
      const frame = prop.frames?.[idx]
      const frameRuntimeUrl = frame?.['_runtimeUrl'] as string | undefined
      return frame ? (frameRuntimeUrl ?? getImageUrl(frame.url) ?? '') : ''
    }
  }
}

function handleImageError(e: Event) {
  (e.target as HTMLImageElement).src = '' 
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

// Modal Logic
function openCreateModal() {
  editingPropId.value = undefined
  editorVisible.value = true
}

function openEditModal(id: string) {
  editingPropId.value = id
  editorVisible.value = true
}

function closeEditor() {
  editorVisible.value = false
  editingPropId.value = undefined
}

function handleSaved() {
  // Refresh logic if needed
}

function deleteProp(id: string) {
  pendingDeleteIds.value = [id]
  deleteConfirmTitle.value = '删除道具'
  deleteConfirmMessage.value = '确定要删除这个道具吗？此操作不可恢复。'
  showDeleteConfirm.value = true
}

// Delete Confirmation State
const showDeleteConfirm = ref(false)
const deleteConfirmTitle = ref('')
const deleteConfirmMessage = ref('')
const pendingDeleteIds = ref<string[]>([])

function confirmDelete() {
  pendingDeleteIds.value.forEach(id => propStore.deleteProp(id))
  if (pendingDeleteIds.value.length > 1) {
    selectedIds.value.clear()
    isBatchMode.value = false
  }
  pendingDeleteIds.value = []
  showDeleteConfirm.value = false
}

// Batch Logic
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value.clear()
}

function handleCardClick(prop: PropAsset) {
  if (isBatchMode.value) {
    toggleSelect(prop.id)
  } else {
    openEditModal(prop.id)
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

function batchDelete() {
  pendingDeleteIds.value = Array.from(selectedIds.value)
  deleteConfirmTitle.value = '批量删除道具'
  deleteConfirmMessage.value = `确定要删除选中的 ${selectedIds.value.size} 个道具吗？此操作不可恢复。`
  showDeleteConfirm.value = true
}

function selectAll() {
  filteredProps.value.forEach((prop: PropAsset) => selectedIds.value.add(prop.id))
}

function deselectAll() {
  selectedIds.value.clear()
}

function invertSelection() {
  const currentSet = new Set(selectedIds.value)
  selectedIds.value.clear()
  filteredProps.value.forEach((prop: PropAsset) => {
    if (!currentSet.has(prop.id)) {
      selectedIds.value.add(prop.id)
    }
  })
}

// 处理导入完成
function handleImported(count: number) {
  console.log(`[PropManager] 成功导入 ${count} 个道具`)
}
</script>

<style scoped>
.prop-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
}

.toolbar {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 200px;
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

.btn-batch, .btn-secondary {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

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
}

.btn-delete-batch {
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-import {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-import:hover {
  background: #2563eb;
}

/* Gallery */
.gallery-container {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.prop-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.prop-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
}

.prop-card.selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.card-checkbox {
  position: absolute;
  top: 8px; left: 8px;
  z-index: 10;
}

.card-preview {
  height: 140px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 10px;
}

.card-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.anim-badge {
  position: absolute;
  bottom: 4px; right: 4px;
  background: rgba(0,0,0,0.6);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.card-info {
  padding: 10px;
}

.prop-name {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prop-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.tags-row {
  display: flex;
  gap: 4px;
}

.mini-tag {
  background: #f3f4f6;
  color: #6b7280;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.time-ago {
  color: #9ca3af;
  font-size: 10px;
}

.card-actions {
  position: absolute;
  top: 8px; right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.prop-card:hover .card-actions {
  opacity: 1;
}

.btn-icon {
  width: 24px; height: 24px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
}

.btn-icon:hover {
  background: #f9fafb;
}

.btn-icon.delete:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}
</style>
