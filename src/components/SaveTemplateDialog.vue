<template>
  <div
    v-if="visible"
    class="modal-overlay"
    @click.self="emit('cancel')"
  >
    <div class="save-template-dialog">
      <div class="dialog-header">
        <h3>保存为场景模板</h3>
        <button
          class="close-btn"
          @click="emit('cancel')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 模板名称 -->
        <div class="form-field">
          <label>模板名称 <span class="required">*</span></label>
          <input
            v-model="templateName"
            type="text"
            class="form-input"
            placeholder="输入模板名称"
            @keydown.enter="handleSave"
          >
        </div>

        <!-- 标签 -->
        <div class="form-field">
          <label>标签（可选）</label>
          <div class="tags-input-area">
            <div class="tags-display">
              <span
                v-for="tag in selectedTags"
                :key="tag"
                class="tag-chip"
              >
                {{ tag }}
                <button
                  class="tag-remove"
                  @click="removeTag(tag)"
                >×</button>
              </span>
            </div>
            <input
              v-model="newTag"
              type="text"
              class="tag-input"
              placeholder="输入标签后按回车"
              @keydown.enter="addTag"
            >
          </div>
          <!-- 推荐标签 -->
          <div
            v-if="recommendedTags.length > 0"
            class="recommended-tags"
          >
            <span
              v-for="tag in recommendedTags"
              :key="tag"
              class="recommend-tag"
              @click="addTagDirectly(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- 对象选择列表 -->
        <div class="form-field">
          <label>选择要包含的对象</label>
          <div class="object-select-toolbar">
            <button
              class="btn-select-action"
              @click="selectAll"
            >
              全选
            </button>
            <button
              class="btn-select-action"
              @click="deselectAll"
            >
              全不选
            </button>
          </div>
          <div class="object-select-list">
            <div
              v-for="item in objectSelectItems"
              :key="item.id"
              class="object-select-item"
              :class="{
                checked: selectedObjectIds.has(item.id),
                'is-child': item.isChild,
                'follow-parent': item.followParent,
              }"
              @click="toggleObjectSelect(item)"
            >
              <input
                type="checkbox"
                :checked="selectedObjectIds.has(item.id)"
                :disabled="item.followParent"
                @click.stop="toggleObjectSelect(item)"
              >
              <span
                class="obj-icon"
              >{{ item.icon }}</span>
              <span class="obj-name">{{ item.name }}</span>
              <span
                v-if="item.followParent"
                class="follow-hint"
              >跟随父对象</span>
            </div>
          </div>
          <div class="select-summary">
            选中 {{ selectedObjectIds.size }} 个对象
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          class="btn-cancel"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          class="btn-save"
          :disabled="!canSave"
          @click="handleSave"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useSceneTemplateStore } from '@/stores/sceneTemplateStore'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import { snapshotToTemplate } from '@/utils/sceneTemplateEngine'

interface Props {
  visible: boolean
  /** 打开时预选的对象 ID（可选） */
  initialSelectedObjectId?: string | undefined
  /** 所有非 camera 对象 */
  allSceneObjects: SceneObject[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'saved', templateId: string): void
}>()

const templateStore = useSceneTemplateStore()

// 初始名称
const defaultName = computed(() => {
  if (props.initialSelectedObjectId) {
    const obj = props.allSceneObjects.find(o => o.id === props.initialSelectedObjectId)
    return obj?.alias ?? obj?.name ?? '新建模板'
  }
  return '新建模板'
})

const templateName = ref(defaultName.value)
const newTag = ref('')
const selectedTags = ref<string[]>([])

const recommendedTags = computed(() => {
  return templateStore.allTags.filter(t => !selectedTags.value.includes(t))
})

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !selectedTags.value.includes(tag)) {
    selectedTags.value.push(tag)
  }
  newTag.value = ''
}

function addTagDirectly(tag: string) {
  if (!selectedTags.value.includes(tag)) {
    selectedTags.value.push(tag)
  }
}

function removeTag(tag: string) {
  selectedTags.value = selectedTags.value.filter(t => t !== tag)
}

// ===== 对象选择逻辑 =====

/** 对象选择列表项 */
interface ObjectSelectItem {
  id: string
  name: string
  icon: string
  isChild: boolean
  /** 子对象跟随父对象，不可单独勾选/取消 */
  followParent: boolean
  parentId?: string | undefined
}

/** 收集某个 composite 的所有递归子对象 ID */
function collectAllChildIds(compositeId: string, objects: SceneObject[]): Set<string> {
  const result = new Set<string>()
  const composite = objects.find(o => o.id === compositeId)
  if (composite?.type !== 'composite') return result

  const comp = composite as CompositeObject
  for (const childId of comp.childIds) {
    result.add(childId)
    // 递归
    const childSet = collectAllChildIds(childId, objects)
    for (const id of childSet) {
      result.add(id)
    }
  }
  return result
}

/** 构建对象选择列表（树形展示） */
const objectSelectItems = computed((): ObjectSelectItem[] => {
  const items: ObjectSelectItem[] = []
  const allObjects = props.allSceneObjects

  // 找出所有属于某个 composite 子对象的 ID
  const allChildIds = new Set<string>()
  for (const obj of allObjects) {
    if (obj.type === 'composite') {
      const children = collectAllChildIds(obj.id, allObjects)
      for (const id of children) {
        allChildIds.add(id)
      }
    }
  }

  // 顶层对象 = 不是任何 composite 的子对象
  const topLevel = allObjects.filter(o => !allChildIds.has(o.id))

  function addWithChildren(obj: SceneObject, depth: number): void {
    items.push({
      id: obj.id,
      name: obj.alias ?? obj.name ?? obj.id,
      icon: getTypeIcon(obj.type),
      isChild: depth > 0,
      followParent: depth > 0,
      parentId: obj.parentId,
    })

    // 如果是 composite，展开子对象
    if (obj.type === 'composite') {
      const comp = obj as CompositeObject
      for (const childId of comp.childIds) {
        const child = allObjects.find(o => o.id === childId)
        if (child) {
          addWithChildren(child, depth + 1)
        }
      }
    }
  }

  for (const obj of topLevel) {
    addWithChildren(obj, 0)
  }

  return items
})

/** 选中的对象 ID 集合 */
const selectedObjectIds = ref(new Set<string>(
  props.initialSelectedObjectId ? [props.initialSelectedObjectId] : []
))

/** 切换对象的选中状态 */
function toggleObjectSelect(item: ObjectSelectItem): void {
  if (item.followParent) return // 子对象不可单独操作

  const newSet = new Set(selectedObjectIds.value)
  if (newSet.has(item.id)) {
    newSet.delete(item.id)
  } else {
    newSet.add(item.id)
  }
  selectedObjectIds.value = newSet
}

function selectAll(): void {
  const newSet = new Set<string>()
  for (const item of objectSelectItems.value) {
    if (!item.followParent) {
      newSet.add(item.id)
    }
  }
  selectedObjectIds.value = newSet
}

function deselectAll(): void {
  selectedObjectIds.value = new Set<string>()
}

const canSave = computed(() => {
  return templateName.value.trim().length > 0 && selectedObjectIds.value.size > 0
})

function handleSave() {
  const name = templateName.value.trim()
  if (!name || selectedObjectIds.value.size === 0) return

  // 收集选中的顶层对象
  const selectedTopLevel = props.allSceneObjects.filter(o => selectedObjectIds.value.has(o.id))

  const template = snapshotToTemplate(
    selectedTopLevel,
    props.allSceneObjects,
    name,
    selectedTags.value.length > 0 ? selectedTags.value : undefined,
  )

  templateStore.addTemplate(template)
  emit('saved', template.id)
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

.save-template-dialog {
  background: white;
  width: 520px;
  max-width: 90vw;
  max-height: 80vh;
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
  flex-shrink: 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.required { color: #ef4444; }

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.tags-input-area {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
  min-height: 40px;
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #eff6ff;
  color: #3b82f6;
  border-radius: 12px;
  font-size: 12px;
}

.tag-remove {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
}

.tag-input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 4px 0;
}

.recommended-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.recommend-tag {
  color: #4b5563;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.recommend-tag:hover {
  background: #e5e7eb;
}

/* ===== 对象选择列表 ===== */

.object-select-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.btn-select-action {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  color: #4b5563;
  transition: all 0.15s;
}

.btn-select-action:hover {
  background: #f3f4f6;
}

.object-select-list {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.object-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
  color: #374151;
}

.object-select-item:hover {
  background: #f9fafb;
}

.object-select-item.checked {
  background: #eff6ff;
}

.object-select-item.is-child {
  padding-left: 36px;
}

.object-select-item.follow-parent {
  opacity: 0.65;
  cursor: default;
}

.object-select-item input[type="checkbox"] {
  flex-shrink: 0;
}

.obj-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.obj-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.follow-hint {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
}

.select-summary {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
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
}

.btn-save {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-save:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
