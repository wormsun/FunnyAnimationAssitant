<template>
  <div
    class="grouping-mode-bar"
    :style="{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }"
  >
    <!-- Header: 可拖动 -->
    <div class="grouping-bar-header" @mousedown="startDrag">
      <span class="grouping-mode-icon">🔗</span>
      <span class="grouping-mode-label">
        {{ mode === 'create' ? '成组模式' : `添加成员到「${compositeName ?? '未知'}」` }}
      </span>
      <span class="grouping-pending-list">
        已选 {{ pendingIds.length }} 个
      </span>
      <!-- compositeMode 选择器（仅 create 模式且未隐藏） -->
      <template v-if="mode === 'create' && !hideCompositeMode">
        <button
          class="composite-mode-btn"
          :class="{ active: compositeMode === 'entity' }"
          title="实体模式：删除组合时同时删除子对象"
          @click="$emit('update:compositeMode', 'entity')"
        >
          📦 实体
        </button>
        <button
          class="composite-mode-btn"
          :class="{ active: compositeMode === 'union' }"
          title="联合模式：删除组合时子对象自动解散"
          @click="$emit('update:compositeMode', 'union')"
        >
          📎 联合
        </button>
      </template>
      <button
        class="grouping-btn confirm"
        :disabled="pendingIds.length < 2 && mode === 'create'"
        @click="$emit('confirm')"
      >
        ✓ {{ mode === 'create' ? '完成' : '确认' }}
      </button>
      <button
        class="grouping-btn cancel"
        @click="$emit('cancel')"
      >
        ✗ 取消
      </button>
    </div>
    <!-- 对象列表 -->
    <div class="grouping-object-list">
      <template v-for="flat in flatNodes" :key="flat.id">
        <label
          class="grouping-object-item"
          :style="flat.depth > 0 ? { paddingLeft: (8 + flat.depth * 20) + 'px' } : {}"
          :class="{
            checked: pendingIds.includes(flat.id),
            disabled: lockedParentId !== null && flat.parentId !== lockedParentId,
          }"
        >
          <input
            type="checkbox"
            :checked="pendingIds.includes(flat.id)"
            :disabled="lockedParentId !== null && flat.parentId !== lockedParentId"
            @change="$emit('toggle', flat.id)"
          />
          <button
            v-if="flat.hasChildren"
            class="expand-toggle"
            @click.prevent.stop="toggleExpand(flat.id)"
          >
            {{ expandedIds.has(flat.id) ? '▼' : '▶' }}
          </button>
          <span v-else class="expand-spacer" />
          <span class="object-icon">{{ flat.icon }}</span>
          <span class="object-name">{{ flat.name }}</span>
        </label>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
export type { FlatGroupingNode, GroupingTreeNode } from './groupingTypes'
export { flattenGroupingTree } from './groupingTypes'
</script>

<script setup lang="ts">
import { computed,ref } from 'vue'

import type { GroupingTreeNode } from './groupingTypes'
import { flattenGroupingTree } from './groupingTypes'

const props = defineProps<{
  mode: 'create' | 'addTo'
  compositeName?: string | undefined
  pendingIds: string[]
  treeNodes: GroupingTreeNode[]
  lockedParentId: string | undefined | null
  compositeMode: 'entity' | 'union'
  hideCompositeMode?: boolean
}>()

defineEmits<{
  (e: 'toggle', objectId: string): void
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:compositeMode', mode: 'entity' | 'union'): void
}>()

// 展开/折叠状态（组件内部管理）
const expandedIds = ref(new Set<string>())

function toggleExpand(id: string): void {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

// 扁平化计算
const flatNodes = computed(() =>
  flattenGroupingTree(props.treeNodes, expandedIds.value)
)

// 拖动偏移（组件内部管理）
const offset = ref({ x: 0, y: 0 })

function startDrag(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return

  e.preventDefault()
  const startX = e.clientX - offset.value.x
  const startY = e.clientY - offset.value.y

  function onMove(ev: MouseEvent): void {
    offset.value = {
      x: ev.clientX - startX,
      y: ev.clientY - startY,
    }
  }

  function onUp(): void {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 暴露 reset 方法供父组件在取消/确认时调用
function resetOffset(): void {
  offset.value = { x: 0, y: 0 }
  expandedIds.value.clear()
}

defineExpose({ resetOffset })
</script>

<style scoped>
.grouping-mode-bar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: calc(100% - 24px);
  padding: 10px 14px;
  background: rgba(219, 234, 254, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(147, 197, 253, 0.6);
  border-radius: 8px;
  font-size: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.grouping-bar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  cursor: grab;
}

.grouping-bar-header:active {
  cursor: grabbing;
}

.grouping-mode-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.grouping-mode-label {
  color: #1e40af;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
}

.grouping-pending-list {
  flex: 1;
  min-width: 0;
  color: #4b5563;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

/* compositeMode 选择器 */
.composite-mode-btn {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  background: white;
  color: #6b7280;
  transition: all 0.15s;
  flex-shrink: 0;
  white-space: nowrap;
}

.composite-mode-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.composite-mode-btn:hover:not(.active) {
  background: #f3f4f6;
}

/* 确认 / 取消 */
.grouping-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  white-space: nowrap;
}

.grouping-btn.confirm {
  background: #3b82f6;
  color: white;
}

.grouping-btn.confirm:hover:not(:disabled) {
  background: #2563eb;
}

.grouping-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.grouping-btn.cancel {
  background: white;
  border-color: #d1d5db;
  color: #6b7280;
}

.grouping-btn.cancel:hover {
  background: #f3f4f6;
}

/* 对象列表 */
.grouping-object-list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid rgba(147, 197, 253, 0.4);
  margin-top: 8px;
  padding-top: 6px;
}

.grouping-object-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
  transition: background 0.15s;
  user-select: none;
}

.grouping-object-item:hover:not(.disabled) {
  background: rgba(59, 130, 246, 0.08);
}

.grouping-object-item.checked {
  background: rgba(59, 130, 246, 0.15);
  color: #1e40af;
  font-weight: 500;
}

.grouping-object-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.grouping-object-item input[type="checkbox"] {
  margin: 0;
  cursor: inherit;
  accent-color: #3b82f6;
  flex-shrink: 0;
}

.expand-toggle {
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 10px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.expand-toggle:hover {
  color: #3b82f6;
}

.expand-spacer {
  width: 16px;
  flex-shrink: 0;
}

.grouping-object-item .object-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.grouping-object-item .object-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
