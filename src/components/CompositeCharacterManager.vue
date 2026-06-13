<template>
  <div class="composite-character-manager">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          人物管理
        </h2>

        <!-- 标签筛选按钮 -->
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

        <!-- 性别标签页 -->
        <div class="type-filters">
          <button
            v-for="opt in genderOptions"
            :key="opt.value"
            class="btn-filter-type"
            :class="{ active: currentGender === opt.value }"
            @click="currentGender = opt.value"
          >
            {{ opt.label }}
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
            placeholder="搜索人物..."
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
            class="btn-delete-batch"
            :disabled="selectedIds.size === 0"
            @click="batchDelete"
          >
            删除 ({{ selectedIds.size }})
          </button>
        </template>

        <button
          v-if="!isBatchMode"
          class="btn-create"
          @click="handleCreateCharacter"
        >
          ➕ 新建人物
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Gallery -->
      <div class="gallery-container">
        <div
          v-if="filteredCharacters.length === 0"
          class="empty-state"
        >
          <p>📭 暂无人物</p>
          <p class="hint">
            点击"新建人物"创建人物角色
          </p>
        </div>

        <div
          v-else
          class="gallery-grid"
        >
          <div
            v-for="char in filteredCharacters"
            :key="char.id"
            class="character-card"
            :class="{ selected: isBatchMode && selectedIds.has(char.id) }"
            @click="handleCardClick(char)"
          >
            <!-- Batch Checkbox -->
            <div
              v-if="isBatchMode"
              class="card-checkbox"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(char.id)"
                @click.stop="toggleSelect(char.id)"
              >
            </div>

            <!-- Preview -->
            <div class="card-preview">
              <img
                v-if="char._runtimeThumbnailUrl"
                :src="char._runtimeThumbnailUrl"
                @error="handleImageError"
              >
              <div
                v-else
                class="no-preview"
              >
                👤
              </div>
              <div class="object-count-badge">
                {{ char.objects.length }} 个对象
              </div>
              <!-- 性别标记 -->
              <div class="gender-badge">
                {{ getGenderIcon(char.gender) }}
              </div>
            </div>

            <!-- Info -->
            <div class="card-info">
              <div
                class="character-name"
                :title="char.name"
              >
                {{ char.name }}
              </div>
              <div class="character-meta">
                <div class="tags-row">
                  <span
                    v-for="tag in (char.tags || []).slice(0, 2)"
                    :key="tag"
                    class="mini-tag"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="(char.tags || []).length > 2"
                    class="more-tags"
                  >...</span>
                </div>
                <span class="time-ago">{{ formatTimeAgo(char.createdAt) }}</span>
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
                @click.stop="editingCharacterId = char.id"
              >
                ✏️
              </button>
              <button
                class="btn-icon delete"
                title="删除"
                @click.stop="deleteCharacter(char.id)"
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

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      v-if="showDeleteConfirm"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      :is-danger="true"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />

    <!-- 编辑器 (overlay 对话框模式) -->
    <CompositeCharacterEditor
      v-if="editingCharacterId"
      v-bind="editingCharacterId !== '__new__' ? { 'character-id': editingCharacterId } : {}"
      @close="editingCharacterId = null"
      @saved="handleEditorSaved"
      @created="handleEditorCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useCompositeCharacterStore } from '@/stores/compositeCharacterStore'
import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { Gender } from '@/types/project'

import TagSelectDialog from './common/TagSelectDialog.vue'
import CompositeCharacterEditor from './CompositeCharacterEditor.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const characterStore = useCompositeCharacterStore()

// 性别筛选选项
const genderOptions: { label: string; value: Gender | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '其他', value: 'other' },
]

// State
const currentGender = ref<Gender | 'all'>('all')
const selectedTags = ref<string[]>([])
const searchKeyword = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const isBatchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const showFilterModal = ref(false)

// 编辑器状态
const editingCharacterId = ref<string | null>(null)

const allTags = computed(() => characterStore.allTags)

function handleTagsConfirm(tags: string[]) {
  selectedTags.value = tags
}

function getGenderIcon(gender: Gender): string {
  switch (gender) {
    case 'male': return '♂'
    case 'female': return '♀'
    case 'other': return '⚧'
  }
}

const filteredCharacters = computed(() => {
  // 1. 性别筛选
  let list = characterStore.getCharactersByGender(currentGender.value)

  // 2. 标签筛选
  if (selectedTags.value.length > 0) {
    list = list.filter(c => c.tags?.some(tag => selectedTags.value.includes(tag)))
  }

  // 3. 关键词搜索
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(kw))
  }

  // 4. 排序
  return [...list].sort((a, b) => {
    if (sortOrder.value === 'newest') {
      return b.createdAt - a.createdAt
    } else {
      return a.createdAt - b.createdAt
    }
  })
})

// Methods
function handleImageError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none'
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

function handleCardClick(char: CompositeCharacter) {
  if (isBatchMode.value) {
    toggleSelect(char.id)
  } else {
    editingCharacterId.value = char.id
  }
}

function handleEditorSaved() {
  editingCharacterId.value = null
}

function handleCreateCharacter() {
  editingCharacterId.value = '__new__'
}

function handleEditorCreated(newCharacterId: string) {
  editingCharacterId.value = newCharacterId
}

function deleteCharacter(id: string) {
  pendingDeleteIds.value = [id]
  deleteConfirmTitle.value = '删除人物'
  deleteConfirmMessage.value = '确定要删除这个人物吗？此操作不可恢复。'
  showDeleteConfirm.value = true
}

// Delete Confirmation State
const showDeleteConfirm = ref(false)
const deleteConfirmTitle = ref('')
const deleteConfirmMessage = ref('')
const pendingDeleteIds = ref<string[]>([])

function confirmDelete() {
  pendingDeleteIds.value.forEach(id => characterStore.deleteCharacter(id))
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

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

function batchDelete() {
  pendingDeleteIds.value = Array.from(selectedIds.value)
  deleteConfirmTitle.value = '批量删除人物'
  deleteConfirmMessage.value = `确定要删除选中的 ${selectedIds.value.size} 个人物吗？此操作不可恢复。`
  showDeleteConfirm.value = true
}

function selectAll() {
  filteredCharacters.value.forEach(c => selectedIds.value.add(c.id))
}

function deselectAll() {
  selectedIds.value.clear()
}
</script>

<style scoped>
.composite-character-manager {
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

/* 性别标签页 */
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

.filter-controls { display: flex; gap: 8px; }

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

.btn-create {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-create:hover {
  background: #2563eb;
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

.btn-batch, .btn-secondary {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  background: white;
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

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

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

.character-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.character-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
}

.character-card.selected {
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

.no-preview {
  font-size: 48px;
  opacity: 0.3;
}

.object-count-badge {
  position: absolute;
  bottom: 4px; right: 4px;
  background: rgba(0,0,0,0.6);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.gender-badge {
  position: absolute;
  top: 4px; right: 4px;
  background: rgba(255,255,255,0.9);
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.card-info { padding: 10px; }

.character-name {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.tags-row { display: flex; gap: 4px; }

.mini-tag {
  background: #f3f4f6;
  color: #6b7280;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.more-tags {
  color: #9ca3af;
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

.character-card:hover .card-actions { opacity: 1; }

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(255,255,255,0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
</style>
