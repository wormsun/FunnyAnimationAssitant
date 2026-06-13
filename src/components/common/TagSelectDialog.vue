<template>
  <div
    v-if="visible"
    class="modal-overlay"
    @click.self="handleCancel"
  >
    <div class="tag-select-dialog">
      <div class="dialog-header">
        <h3>按标签筛选</h3>
        <button
          class="close-btn"
          @click="handleCancel"
        >
          ×
        </button>
      </div>
      <div class="dialog-body">
        <div class="tags-cloud">
          <button 
            class="tag-chip"
            :class="{ active: isAllSelected }"
            @click="selectAll"
          >
            全部
          </button>
          <button 
            v-for="tag in availableTags" 
            :key="tag"
            class="tag-chip"
            :class="{ active: localSelectedTags.includes(tag) }"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
        <div
          v-if="availableTags.length === 0"
          class="empty-hint"
        >
          无可用标签
        </div>
      </div>
      <div class="dialog-footer">
        <button
          class="btn-cancel"
          @click="handleCancel"
        >
          取消
        </button>
        <button
          class="btn-confirm"
          @click="handleConfirm"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  availableTags: string[]
  selectedTags: string[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', tags: string[]): void
}>()

// 本地选中标签（编辑中的状态）
const localSelectedTags = ref<string[]>([])

// 当对话框打开时，同步外部选中状态到本地
watch(() => props.visible, (visible) => {
  if (visible) {
    localSelectedTags.value = [...props.selectedTags]
  }
})

// 是否全选
const isAllSelected = computed(() => {
  return props.availableTags.length > 0 && 
         localSelectedTags.value.length === props.availableTags.length
})

// 全选
function selectAll() {
  if (isAllSelected.value) {
    // 如果已经全选，点击后清空
    localSelectedTags.value = []
  } else {
    // 否则全选
    localSelectedTags.value = [...props.availableTags]
  }
}

// 切换单个标签
function toggleTag(tag: string) {
  const index = localSelectedTags.value.indexOf(tag)
  if (index === -1) {
    localSelectedTags.value.push(tag)
  } else {
    localSelectedTags.value.splice(index, 1)
  }
}

// 确定
function handleConfirm() {
  emit('confirm', [...localSelectedTags.value])
  emit('update:visible', false)
}

// 取消
function handleCancel() {
  emit('update:visible', false)
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

.tag-select-dialog {
  background: white;
  width: 500px;
  max-width: 90vw;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #9ca3af;
  line-height: 1;
}

.close-btn:hover {
  color: #6b7280;
}

.dialog-body {
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

.empty-hint {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 20px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-confirm {
  padding: 8px 20px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-confirm:hover {
  background: #2563eb;
}
</style>
