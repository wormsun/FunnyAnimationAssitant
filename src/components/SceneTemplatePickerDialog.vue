<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="picker-dialog">
        <div class="dialog-header">
          <h3>选择场景模板</h3>
          <button
            class="close-btn"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="dialog-content">
          <div class="filter-sidebar">
            <div class="filter-group">
              <h4>标签</h4>
              <div class="filter-list">
                <button
                  class="filter-btn"
                  :class="{ active: currentTag === 'all' }"
                  @click="currentTag = 'all'"
                >
                  全部
                </button>
                <button
                  v-for="tag in allTags"
                  :key="tag"
                  class="filter-btn"
                  :class="{ active: currentTag === tag }"
                  :title="tag"
                  @click="currentTag = tag"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
          </div>

          <div class="main-content">
            <div class="content-toolbar">
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                placeholder="搜索模板..."
              >
            </div>

            <div class="dialog-body">
              <div
                v-if="filteredTemplates.length === 0"
                class="empty-state"
              >
                <p>{{ emptyTitle }}</p>
                <p class="hint">
                  {{ emptyHint }}
                </p>
              </div>

              <div
                v-else
                class="template-grid"
              >
                <div
                  v-for="tpl in filteredTemplates"
                  :key="tpl.id"
                  class="template-card"
                  :class="{ selected: selectedId === tpl.id }"
                  @click="selectedId = tpl.id"
                  @dblclick="handleConfirm"
                >
                  <div class="card-preview">
                    <img
                      v-if="tpl._runtimeThumbnailUrl"
                      :src="tpl._runtimeThumbnailUrl"
                      :alt="tpl.name"
                      @error="handleImageError"
                    >
                    <div
                      v-else
                      class="no-preview"
                    >
                      🧩
                    </div>
                    <div class="count-badge">
                      {{ tpl.objects.length }} 个对象
                    </div>
                  </div>
                  <div class="card-info">
                    <div
                      class="card-name"
                      :title="tpl.name"
                    >
                      {{ tpl.name }}
                    </div>
                    <div
                      v-if="tpl.tags && tpl.tags.length > 0"
                      class="card-tags"
                    >
                      <span
                        v-for="tag in tpl.tags.slice(0, 2)"
                        :key="tag"
                        class="mini-tag"
                      >
                        {{ tag }}
                      </span>
                      <span
                        v-if="tpl.tags.length > 2"
                        class="more-tags"
                      >...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="dialog-footer">
              <button
                class="btn-cancel"
                @click="emit('close')"
              >
                取消
              </button>
              <button
                class="btn-confirm"
                :disabled="!selectedId"
                @click="handleConfirm"
              >
                放置到画布
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useSceneTemplateStore } from '@/stores/sceneTemplateStore'
import type { SceneTemplate } from '@/types/sceneTemplate'

const emit = defineEmits<{
  (e: 'select', template: SceneTemplate): void
  (e: 'close'): void
}>()

const templateStore = useSceneTemplateStore()
const searchKeyword = ref('')
const selectedId = ref<string | null>(null)
const currentTag = ref('all')

const allTags = computed(() => templateStore.allTags)

const hasActiveFilters = computed(() =>
  searchKeyword.value.trim().length > 0 || currentTag.value !== 'all'
)

const emptyTitle = computed(() => hasActiveFilters.value ? '📭 没有匹配的场景模板' : '📭 暂无场景模板')
const emptyHint = computed(() =>
  hasActiveFilters.value ? '试试切换标签或调整搜索关键词' : '在场景编辑器中选中组合对象，右键保存为场景模板'
)

const filteredTemplates = computed(() => {
  let list = [...templateStore.templates]

  if (currentTag.value !== 'all') {
    list = list.filter(t => t.tags?.includes(currentTag.value))
  }

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(t => t.name.toLowerCase().includes(kw))
  }

  return list.sort((a, b) => b.createdAt - a.createdAt)
})

function handleImageError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none'
}

function handleConfirm() {
  if (!selectedId.value) return
  const tpl = templateStore.getTemplate(selectedId.value)
  if (tpl) {
    emit('select', tpl)
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
  z-index: 2000;
}

.picker-dialog {
  background: white;
  width: 950px;
  max-width: 90vw;
  height: 80vh;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
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

.close-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.dialog-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.filter-sidebar {
  width: 180px;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  padding: 16px;
  overflow-y: auto;
  flex-shrink: 0;
}

.filter-group {
  margin-bottom: 20px;
}

.filter-group:last-child {
  margin-bottom: 0;
}

.filter-group h4 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-btn {
  text-align: left;
  padding: 7px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-btn:hover {
  background: #e5e7eb;
}

.filter-btn.active {
  background: #e0e7ff;
  color: #4f46e5;
  font-weight: 500;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-toolbar {
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.search-input {
  width: 240px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
}

.hint {
  font-size: 13px;
  margin-top: 4px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.template-card {
  background: #f9fafb;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.template-card.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.card-preview {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  padding: 10px;
  position: relative;
}

.card-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.no-preview {
  font-size: 40px;
  opacity: 0.3;
}

.count-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.card-info {
  padding: 8px 10px;
}

.card-name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  min-height: 16px;
}

.mini-tag {
  background: #e5e7eb;
  color: #6b7280;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.more-tags {
  color: #9ca3af;
  font-size: 10px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f3f4f6;
}

.btn-confirm {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  background: #2563eb;
}

.btn-confirm:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .picker-dialog {
    max-width: 96vw;
    height: 86vh;
  }

  .filter-sidebar {
    width: 140px;
    padding: 12px;
  }

  .content-toolbar {
    justify-content: stretch;
  }

  .search-input {
    width: 100%;
  }

  .template-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>
