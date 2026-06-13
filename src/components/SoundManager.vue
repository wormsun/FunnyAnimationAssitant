<template>
  <div class="sound-manager">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 class="page-title">
          音效库
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
            :class="{ active: currentType === 'all' }"
            @click="currentType = 'all'"
          >
            全部
          </button>
          <button 
            class="btn-filter-type" 
            :class="{ active: currentType === 'bgm' }"
            @click="currentType = 'bgm'"
          >
            背景音乐
          </button>
          <button 
            class="btn-filter-type" 
            :class="{ active: currentType === 'sfx' }"
            @click="currentType = 'sfx'"
          >
            音效
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
            placeholder="搜索音效..." 
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
          class="btn-create"
          @click="openEditor()"
        >
          + 新建音效
        </button>
        <button
          v-if="!isBatchMode"
          class="btn-import"
          @click="showImportDialog = true"
        >
          📁 导入音效
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="content-area">
      <div
        v-if="filteredSounds.length === 0"
        class="empty-state"
      >
        <p>📭 暂无音效数据</p>
        <p class="hint">
          点击"新建音效"开始创建
        </p>
      </div>
      
      <div
        v-else
        class="sound-grid"
      >
        <div 
          v-for="sound in filteredSounds" 
          :key="sound.id" 
          class="sound-card"
          :class="{ playing: playingSoundId === sound.id, selected: isBatchMode && selectedIds.has(sound.id) }"
          @click="handleCardClick(sound)"
        >
          <!-- Batch Checkbox -->
          <div
            v-if="isBatchMode"
            class="card-checkbox"
          >
            <input 
              type="checkbox" 
              :checked="selectedIds.has(sound.id)"
              @click.stop="toggleSelect(sound.id)"
            >
          </div>

          <!-- Preview Area -->
          <div class="card-preview">
            <div class="sound-icon">
              {{ sound.type === 'bgm' ? '🎵' : '🔊' }}
            </div>
            
            <div class="play-overlay">
              <button
                class="btn-card-play"
                @click.stop="togglePlay(sound.id)"
              >
                {{ playingSoundId === sound.id ? '⏸️' : '▶️' }}
              </button>
            </div>
            
            <div
              v-if="playingSoundId === sound.id"
              class="playing-indicator"
            >
              <div class="bar" />
              <div class="bar" />
              <div class="bar" />
            </div>
            
            <div
              class="type-badge"
              :class="sound.type"
            >
              {{ sound.type === 'bgm' ? 'BGM' : 'SFX' }}
            </div>
          </div>
          
          <!-- Info Area -->
          <div class="card-info">
            <div class="card-header">
              <h4
                class="sound-name"
                :title="sound.name"
              >
                {{ sound.name }}
              </h4>
              <div
                v-if="!isBatchMode"
                class="card-actions"
              >
                <button
                  class="btn-icon"
                  @click.stop="openEditor(sound.id)"
                >
                  ✏️
                </button>
                <button
                  class="btn-icon danger"
                  @click.stop="handleDelete(sound.id)"
                >
                  🗑️
                </button>
              </div>
            </div>
            
            <div class="sound-meta">
              <span class="duration">🕒 {{ formatTime(sound.duration) }}</span>
              <span
                v-if="sound.tags && sound.tags.length > 0"
                class="tag"
              >
                🏷️ {{ sound.tags[0] }}
                <span v-if="sound.tags.length > 1">+{{ sound.tags.length - 1 }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 标签筛选对话框 -->
    <TagSelectDialog
      v-model:visible="showFilterModal"
      :available-tags="soundStore.allTags"
      :selected-tags="selectedTags"
      @confirm="handleTagsConfirm"
    />

    <!-- Editor Modal -->
    <SoundEditorModal 
      :visible="editorVisible" 
      v-bind="editingSoundId ? { 'sound-id': editingSoundId } : {}"
      @close="closeEditor"
      @save="handleSaved"
    />

    <!-- Import Dialog -->
    <SoundImportDialog
      v-if="showImportDialog"
      @close="showImportDialog = false"
      @imported="handleImported"
    />

    <!-- 删除确认对话框 -->
    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="删除确认"
      :message="deleteConfirmMessage"
      confirm-text="删除"
      :is-danger="true"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { useSoundStore } from '@/stores/soundStore'
import type { SoundAsset } from '@/types/project'

import TagSelectDialog from './common/TagSelectDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SoundEditorModal from './SoundEditorModal.vue'
import SoundImportDialog from './SoundImportDialog.vue'

const props = defineProps<{
  initialType?: 'all' | 'bgm' | 'sfx'
}>()

const soundStore = useSoundStore()
const { getImageUrl, loadImageUrl } = useAssetImage()

// State
const currentType = ref<'all' | 'bgm' | 'sfx'>(props.initialType || 'all')

// Watch for prop changes to update currentType if needed (optional, but good for re-opening)
watch(() => props.initialType, (newVal) => {
  if (newVal) {
    currentType.value = newVal
  }
})
const selectedTags = ref<string[]>([])
const searchKeyword = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')
const showFilterModal = ref(false)

const editorVisible = ref(false)
const editingSoundId = ref<string | undefined>(undefined)
const showImportDialog = ref(false)

// 删除确认对话框
const showDeleteConfirm = ref(false)
const pendingDeleteIds = ref<string[]>([])
const deleteConfirmMessage = ref('')

// Batch State
const isBatchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())

// Audio Player
const playingSoundId = ref<string | null>(null)
let currentAudio: HTMLAudioElement | null = null

// Computed
const filteredSounds = computed(() => {
  let result = soundStore.sounds

  // 1. Type Filter
  if (currentType.value !== 'all') {
    result = result.filter(s => s.type === currentType.value)
  }

  // 2. 多标签筛选：匹配任一选中标签
  if (selectedTags.value.length > 0) {
    result = result.filter(s => s.tags?.some(t => selectedTags.value.includes(t)))
  }

  // 3. Search
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    result = result.filter(s => s.name.toLowerCase().includes(kw))
  }

  // 4. Sort
  return result.sort((a, b) => {
    if (sortOrder.value === 'newest') return (b.createdAt || 0) - (a.createdAt || 0)
    if (sortOrder.value === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0)
    if (sortOrder.value === 'shortest') return (a.duration || 0) - (b.duration || 0)
    if (sortOrder.value === 'longest') return (b.duration || 0) - (a.duration || 0)
    return 0
  })
})

// Methods
function handleTagsConfirm(tags: string[]) {
  selectedTags.value = tags
}

function openEditor(id?: string) {
  editingSoundId.value = id
  editorVisible.value = true
}

function closeEditor() {
  editorVisible.value = false
  editingSoundId.value = undefined
}

function handleSaved() {
  // Refresh logic if needed
}

function handleImported(count: number) {
  console.log(`[SoundManager] 成功导入 ${count} 个音效`)
}

function handleDelete(id: string) {
  pendingDeleteIds.value = [id]
  deleteConfirmMessage.value = '确定要删除这个音效吗？'
  showDeleteConfirm.value = true
}

async function togglePlay(id: string) {
  if (playingSoundId.value === id) {
    stopAudio()
    return
  }
  
  // Stop previous
  stopAudio()
  
  const sound = soundStore.getSound(id)
  if (!sound) return
  
  let url = sound._runtimeUrl
  if (!url) {
    // 异步加载音频文件，确保 blob URL 就绪后再播放
    await loadImageUrl(sound.url)
    url = getImageUrl(sound.url)
    // 如果仍然是占位符或空，说明加载失败
    if (!url || url.startsWith('data:image/')) {
      console.warn('[SoundManager] 音频文件加载失败:', sound.url)
      return
    }
  }
  
  currentAudio = new Audio(url)
  currentAudio.volume = sound.volume || 1.0
  currentAudio.loop = sound.type === 'bgm'
  
  currentAudio.play().catch(e => console.error(e))
  currentAudio.onended = () => {
    if (!currentAudio?.loop) {
      playingSoundId.value = null
      currentAudio = null
    }
  }
  
  playingSoundId.value = id
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  playingSoundId.value = null
}

function formatTime(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Batch Logic
function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value.clear()
}

function handleCardClick(sound: SoundAsset) {
  if (isBatchMode.value) {
    toggleSelect(sound.id)
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

function batchDelete() {
  pendingDeleteIds.value = Array.from(selectedIds.value)
  deleteConfirmMessage.value = `确定要删除选中的 ${selectedIds.value.size} 个音效吗？`
  showDeleteConfirm.value = true
}

function confirmDelete() {
  pendingDeleteIds.value.forEach(id => {
    if (playingSoundId.value === id) stopAudio()
    soundStore.deleteSound(id)
  })
  
  // 如果是批量删除，清理批量状态
  if (pendingDeleteIds.value.length > 1) {
    selectedIds.value.clear()
    isBatchMode.value = false
  }
  
  // 重置删除相关状态
  pendingDeleteIds.value = []
  showDeleteConfirm.value = false
}

function selectAll() {
  filteredSounds.value.forEach(s => selectedIds.value.add(s.id))
}

function deselectAll() {
  selectedIds.value.clear()
}

function invertSelection() {
  const currentSet = new Set(selectedIds.value)
  selectedIds.value.clear()
  filteredSounds.value.forEach(s => {
    if (!currentSet.has(s.id)) {
      selectedIds.value.add(s.id)
    }
  })
}

onUnmounted(() => {
  stopAudio()
})
</script>

<style scoped>
.sound-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

.toolbar {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  color: #111827;
}

/* Type Filters */
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
}
.btn-filter.active { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }

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
}

.btn-create {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}
.btn-create:hover { background: #2563eb; }

.btn-import {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-import:hover { background: #2563eb; }

/* Batch Buttons */
.btn-batch, .btn-secondary {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}
.btn-secondary:hover { background: #f9fafb; }

.btn-delete-batch {
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
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

.tags-cloud { display: flex; flex-wrap: wrap; gap: 8px; }

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
.tag-chip:hover { background: #e5e7eb; border-color: #d1d5db; }
.tag-chip.active { background: #3b82f6; color: white; border-color: #3b82f6; }

/* Content Area */
.content-area {
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

.sound-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}

/* Sound Card */
.sound-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  position: relative;
}

.sound-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.05);
  border-color: #bfdbfe;
}

.sound-card.playing {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.sound-card.selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.card-checkbox {
  position: absolute;
  top: 8px; right: 8px;
  z-index: 10;
}

.card-preview {
  height: 120px;
  background: #f9fafb;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sound-icon { font-size: 48px; opacity: 0.5; }

.type-badge {
  position: absolute;
  top: 8px; left: 8px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}
.type-badge.bgm { background: #dbeafe; color: #1e40af; }
.type-badge.sfx { background: #fce7f3; color: #9d174d; }

.play-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.sound-card:hover .play-overlay, .sound-card.playing .play-overlay {
  opacity: 1;
}

.btn-card-play {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.2s;
}
.btn-card-play:hover { transform: scale(1.1); color: #3b82f6; }

.playing-indicator {
  position: absolute;
  bottom: 12px;
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 16px;
}
.bar {
  width: 4px;
  background: #3b82f6;
  animation: bounce 1s infinite;
}
.bar:nth-child(1) { animation-delay: 0s; height: 60%; }
.bar:nth-child(2) { animation-delay: 0.2s; height: 100%; }
.bar:nth-child(3) { animation-delay: 0.4s; height: 80%; }

@keyframes bounce {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1); }
}

.card-info {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sound-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.sound-card:hover .card-actions { opacity: 1; }

.btn-icon {
  border: none; background: none; cursor: pointer; font-size: 14px; padding: 2px;
  opacity: 0.6;
}
.btn-icon:hover { opacity: 1; }
.btn-icon.danger:hover { transform: scale(1.1); }

.sound-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
}

.tag {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
