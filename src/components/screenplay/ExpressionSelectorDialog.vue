<template>
  <div
    class="expression-selector-overlay"
    @click.self="$emit('close')"
  >
    <div class="expression-selector-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          选择表情
        </h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 性别 Tab 页 -->
        <div class="gender-tabs">
          <button
            v-for="gender in genderTabOptions"
            :key="gender"
            class="gender-tab"
            :class="{ active: activeGenderTab === gender }"
            @click="activeGenderTab = gender"
          >
            {{ gender }}
          </button>
        </div>

        <!-- 主内容区：侧边栏 + 表情网格 -->
        <div class="content-wrapper">
          <!-- 标签侧边栏 -->
          <div class="tag-sidebar">
            <div class="sidebar-title">
              标签
            </div>
            <div class="tag-list">
              <div
                v-for="tag in availableTags"
                :key="tag"
                class="tag-item"
                :class="{ active: selectedTag === tag }"
                @click="selectedTag = tag"
              >
                <span class="tag-name">{{ tag }}</span>
                <span class="tag-count">({{ getTagCount(tag) }})</span>
              </div>
            </div>
          </div>

          <!-- 表情网格 -->
          <div class="expression-content">
            <div
              v-if="filteredExpressions.length === 0"
              class="empty-state"
            >
              <p>该分类下暂无表情</p>
              <p class="empty-hint">
                请在素材管理中添加表情
              </p>
            </div>
            <div
              v-else
              class="expression-grid"
            >
              <div
                v-for="expr in filteredExpressions"
                :key="expr.id"
                class="expression-item"
                :class="{ selected: selectedExpression === expr.id }"
                @click="handleSelect(expr.id)"
              >
                <div class="expression-thumbnail">
                  <img
                    v-if="expr.defaultFrame.url"
                    :src="getExpressionImageUrl(expr.defaultFrame.url)"
                    :alt="expr.name"
                    class="expression-image"
                    :style="{ transform: expr.flipHorizontal ? 'scaleX(-1)' : 'none' }"
                  >
                  <span
                    v-else
                    class="expression-placeholder"
                  >?</span>
                </div>
                <span class="expression-name">{{ expr.name }}</span>
              </div>
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
          class="btn-confirm"
          :disabled="!selectedExpression"
          @click="handleConfirm"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { useExpressionStore } from '@/stores/expressionStore'

const props = defineProps<{
  currentExpression?: string
}>()

const emit = defineEmits<{
  close: []
  select: [expressionId: string]
}>()

const expressionStore = useExpressionStore()
const { getImageUrl } = useAssetImage()

// 获取所有表情
const allExpressions = computed(() => expressionStore.expressionList)

// 性别 Tab 选项
const genderTabOptions = ['全部', '男', '女', '其他']
const activeGenderTab = ref<string>('全部')

// 标签侧边栏
const selectedTag = ref<string>('全部')

// 计算可用标签（排除性别标签）
const availableTags = computed(() => {
  const tags = new Set<string>()
  const genderTags = new Set(['男', '女', '其他'])
  
  allExpressions.value.forEach(expr => {
    expr.tags?.forEach(t => {
      if (!genderTags.has(t)) {
        tags.add(t)
      }
    })
  })
  return ['全部', ...Array.from(tags).sort()]
})

// 按性别筛选的表情列表
const genderFilteredExpressions = computed(() => {
  let list = allExpressions.value
  
  if (activeGenderTab.value !== '全部') {
    const genderMap: Record<string, 'male' | 'female' | 'other'> = {
      '男': 'male',
      '女': 'female',
      '其他': 'other'
    }
    const targetGender = genderMap[activeGenderTab.value]
    list = list.filter(expr => {
      if (activeGenderTab.value === '其他') {
        return expr.gender === 'other' || !expr.gender
      }
      return expr.gender === targetGender
    })
  }
  
  return list
})

// 组合筛选后的表情列表
const filteredExpressions = computed(() => {
  let list = genderFilteredExpressions.value
  
  // 标签筛选
  if (selectedTag.value !== '全部') {
    list = list.filter(expr => expr.tags?.includes(selectedTag.value))
  }
  
  return list
})

// 计算每个标签的数量（受性别筛选影响）
function getTagCount(tag: string): number {
  const list = genderFilteredExpressions.value
  if (tag === '全部') return list.length
  return list.filter(expr => expr.tags?.includes(tag)).length
}

const selectedExpression = ref<string>(props.currentExpression || '')

function handleSelect(expressionId: string) {
  selectedExpression.value = expressionId
}

function handleConfirm() {
  if (selectedExpression.value) {
    emit('select', selectedExpression.value)
    emit('close')
  }
}

// 获取表情图片URL
function getExpressionImageUrl(url: string): string {
  return getImageUrl(url)
}
</script>

<style scoped>
.expression-selector-overlay {
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

.expression-selector-dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 1000px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e5e7eb;
}

.dialog-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 性别 Tab */
.gender-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.gender-tab {
  padding: 8px 20px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.gender-tab:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.gender-tab.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

/* 主内容区 */
.content-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 标签侧边栏 */
.tag-sidebar {
  width: 160px;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #f9fafb;
}

.sidebar-title {
  padding: 16px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.tag-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.tag-item:hover {
  background: #e5e7eb;
}

.tag-item.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-count {
  font-size: 12px;
  color: #9ca3af;
  flex-shrink: 0;
  margin-left: 8px;
}

.tag-item.active .tag-count {
  color: #3b82f6;
}

/* 表情内容区 */
.expression-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.expression-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
}

.expression-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.expression-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.expression-item.selected {
  background: #dbeafe;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.expression-thumbnail {
  width: 90px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expression-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.expression-placeholder {
  font-size: 32px;
  color: #d1d5db;
}

.expression-name {
  font-size: 12px;
  font-weight: 500;
  color: #1f2937;
  text-align: center;
  word-break: break-word;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 60px 24px;
  color: #9ca3af;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-state p {
  margin: 8px 0;
}

.empty-hint {
  font-size: 13px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.btn-cancel,
.btn-confirm {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  color: #6b7280;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-confirm {
  background: #3b82f6;
  border: 1px solid #3b82f6;
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  background: #2563eb;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
