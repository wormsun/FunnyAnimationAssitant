<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="picker-dialog">
        <div class="dialog-header">
          <h3>{{ title }}</h3>
          <button
            class="close-btn"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="dialog-content">
          <!-- 左侧筛选栏：仅标签 -->
          <div class="filter-sidebar">
            <div class="filter-group">
              <h4>标签</h4>
              <div class="filter-list">
                <button
                  class="filter-btn"
                  :class="{ active: selectedTags.size === 0 }"
                  @click="selectedTags = new Set()"
                >
                  全部
                </button>
                <button
                  v-for="tag in allTags"
                  :key="tag"
                  class="filter-btn"
                  :class="{ active: selectedTags.has(tag) }"
                  @click="toggleTag(tag)"
                >
                  {{ tag }}
                </button>
              </div>
            </div>
          </div>

          <!-- 右侧内容区 -->
          <div class="main-content">
            <!-- 顶部工具栏：性别 tabs + 搜索框 -->
            <div class="content-toolbar">
              <div class="gender-tabs">
                <button
                  v-for="opt in genderOptions"
                  :key="opt.value"
                  class="gender-tab"
                  :class="{ active: currentGender === opt.value }"
                  @click="currentGender = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                placeholder="搜索人物..."
              >
            </div>

            <!-- 卡片网格 -->
            <div class="dialog-body">
              <div
                v-if="filteredCharacters.length === 0"
                class="empty-state"
              >
                <p>📭 暂无可用人物</p>
                <p class="hint">
                  请先在「人物管理」中创建人物
                </p>
              </div>

              <div
                v-else
                class="character-grid"
              >
                <div
                  v-for="char in filteredCharacters"
                  :key="char.id"
                  class="character-card"
                  :class="{ selected: selectedId === char.id }"
                  @click="selectedId = char.id"
                  @dblclick="handleConfirm"
                >
                  <div class="card-preview">
                    <img
                      v-if="char._runtimeThumbnailUrl"
                      :src="char._runtimeThumbnailUrl"
                      :alt="char.name"
                      @error="handleImageError"
                    >
                    <div
                      v-else
                      class="no-preview"
                    >
                      👤
                    </div>
                    <!-- 性别角标 -->
                    <div class="gender-badge">
                      {{ getGenderIcon(char.gender) }}
                    </div>
                    <!-- 对象数量 -->
                    <div class="count-badge">
                      {{ char.objects.length }} 个对象
                    </div>
                  </div>
                  <div class="card-info">
                    <div
                      class="card-name"
                      :title="char.name"
                    >
                      {{ char.name }}
                    </div>
                    <div
                      v-if="char.tags && char.tags.length > 0"
                      class="card-tags"
                    >
                      <span
                        v-for="tag in char.tags.slice(0, 2)"
                        :key="tag"
                        class="mini-tag"
                      >
                        {{ tag }}
                      </span>
                      <span
                        v-if="char.tags.length > 2"
                        class="more-tags"
                      >...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部按钮 -->
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
                {{ confirmText }}
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

import { useCompositeCharacterStore } from '@/stores/compositeCharacterStore'
import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { Gender } from '@/types/project'

const props = withDefaults(defineProps<{
  /** 对话框标题 */
  title?: string
  /** 排除的人物 ID 列表 */
  excludeIds?: string[]
  /** 仅包含的人物 ID 列表（白名单模式，为空则不过滤） */
  includeIds?: string[]
  /** 确认按钮文字 */
  confirmText?: string
}>(), {
  title: '选择人物',
  excludeIds: () => [],
  includeIds: () => [],
  confirmText: '确定',
})

const emit = defineEmits<{
  select: [character: CompositeCharacter]
  close: []
}>()

const characterStore = useCompositeCharacterStore()

const selectedId = ref<string | null>(null)
const currentGender = ref<Gender | 'all'>('all')
const searchKeyword = ref('')
const selectedTags = ref<Set<string>>(new Set())

/** 从所有人物中动态收集去重的标签列表 */
const allTags = computed(() => {
  const tagSet = new Set<string>()
  // 基于当前可见范围（白名单/排除后）收集标签
  let base = props.includeIds.length > 0
    ? characterStore.characters.filter(c => props.includeIds.includes(c.id))
    : characterStore.characters
  if (props.excludeIds.length > 0) {
    base = base.filter(c => !props.excludeIds.includes(c.id))
  }
  for (const c of base) {
    if (c.tags) {
      for (const tag of c.tags) tagSet.add(tag)
    }
  }
  return [...tagSet].sort()
})

function toggleTag(tag: string): void {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) {
    next.delete(tag)
  } else {
    next.add(tag)
  }
  selectedTags.value = next
}

const genderOptions: { label: string; value: Gender | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '♂ 男', value: 'male' },
  { label: '♀ 女', value: 'female' },
  { label: '⚧ 其他', value: 'other' },
]

function getGenderIcon(gender: Gender): string {
  switch (gender) {
    case 'male': return '♂'
    case 'female': return '♀'
    case 'other': return '⚧'
  }
}

const filteredCharacters = computed(() => {
  // 1. 白名单过滤（includeIds 非空时仅展示白名单中的人物）
  let list = props.includeIds.length > 0
    ? characterStore.characters.filter(c => props.includeIds.includes(c.id))
    : [...characterStore.characters]

  // 2. 排除指定 ID
  if (props.excludeIds.length > 0) {
    list = list.filter(c => !props.excludeIds.includes(c.id))
  }

  // 3. 性别筛选
  if (currentGender.value !== 'all') {
    list = list.filter(c => c.gender === currentGender.value)
  }

  // 4. 标签筛选（多选交集：人物必须包含所有已选标签）
  if (selectedTags.value.size > 0) {
    list = list.filter(c =>
      c.tags && [...selectedTags.value].every(tag => c.tags?.includes(tag))
    )
  }

  // 5. 关键词搜索
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(kw))
  }

  // 6. 按创建时间倒序
  return list.sort((a, b) => b.createdAt - a.createdAt)
})

function handleImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none'
}

function handleConfirm(): void {
  if (!selectedId.value) return
  const char = characterStore.getCharacter(selectedId.value)
  if (char) {
    emit('select', char)
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

/* ===== 双栏布局 ===== */
.dialog-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== 左侧筛选栏 ===== */
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

/* ===== 右侧内容区 ===== */
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
  justify-content: space-between;
  gap: 12px;
}

.gender-tabs {
  display: flex;
  background: #f3f4f6;
  padding: 3px;
  border-radius: 8px;
  flex-shrink: 0;
}

.gender-tab {
  padding: 5px 14px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.gender-tab:hover {
  color: #374151;
}

.gender-tab.active {
  background: white;
  color: #1f2937;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
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

/* ===== Body: Grid 卡片 ===== */
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

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.character-card {
  background: #f9fafb;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}

.character-card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.character-card.selected {
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

.gender-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
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

/* ===== Footer ===== */
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
</style>
