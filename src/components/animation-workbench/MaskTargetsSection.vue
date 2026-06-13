<template>
  <div class="property-section mask-targets-section">
    <h4 class="section-title">
      <svg
        class="section-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      </svg>
      <span>裁切目标</span>
      <span v-if="mask.targetIds.length > 0" class="target-count">
        {{ mask.targetIds.length }}
      </span>
    </h4>

    <!-- 已选目标列表 -->
    <div v-if="mask.targetIds.length === 0" class="empty-hint">
      尚未指定任何目标，请从下方选择对象
    </div>
    <ul v-else class="target-list">
      <template v-for="targetId in mask.targetIds" :key="targetId">
        <!-- 目标根行 -->
        <li class="target-row">
          <button
            v-if="hasChildren(targetId)"
            type="button"
            class="tree-toggle-btn"
            :title="isExpanded(targetId) ? '折叠' : '展开'"
            @click="toggleExpand(targetId)"
          >
            {{ isExpanded(targetId) ? '▼' : '▶' }}
          </button>
          <span v-else class="tree-toggle-spacer" />

          <span class="target-icon">{{ getObjectIcon(targetId) }}</span>
          <span class="target-name" :title="getObjectAlias(targetId)">
            {{ getObjectAlias(targetId) }}
          </span>
          <button
            type="button"
            class="remove-btn"
            title="移除目标"
            aria-label="移除目标"
            @click="removeTarget(targetId)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </li>

        <!-- 子对象（仅展开后显示） -->
        <template v-if="isExpanded(targetId)">
          <li
            v-for="child in getDescendants(targetId)"
            :key="targetId + '/' + child.obj.id"
            class="target-row child-row"
            :style="{ paddingLeft: 8 + child.depth * 14 + 'px' }"
          >
            <span class="tree-indent" aria-hidden="true">└</span>
            <span class="target-icon">{{ getIconByType(child.obj.type) }}</span>
            <span class="target-name child-name" :title="child.obj.alias || child.obj.name">
              {{ child.obj.alias || child.obj.name }}
            </span>
          </li>
        </template>
      </template>
    </ul>

    <!-- 添加目标：树形下拉，支持组合对象折叠/展开 -->
    <div class="add-row">
      <div class="tree-picker">
        <button
          type="button"
          class="tree-picker-trigger"
          :disabled="candidateTargets.length === 0"
          @click="togglePicker"
        >
          <span class="trigger-plus">＋</span>
          <span>{{ candidateTargets.length === 0 ? '暂无可选对象' : '添加目标…' }}</span>
          <span class="trigger-arrow">{{ pickerOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="pickerOpen" class="tree-picker-menu">
          <button
            v-for="row in candidateTreeRows"
            :key="row.obj.id"
            type="button"
            class="tree-picker-row"
            :style="getPickerRowStyle(row.depth)"
            @click="addTarget(row.obj.id)"
          >
            <span
              v-if="row.hasChildren"
              class="picker-toggle"
              title="展开/折叠"
              @click.stop="togglePickerExpand(row.obj.id)"
            >
              {{ pickerExpandedIds.has(row.obj.id) ? '▼' : '▶' }}
            </span>
            <span v-else class="picker-toggle-spacer" />
            <span class="picker-icon">{{ getIconByType(row.obj.type) }}</span>
            <span class="picker-name">{{ row.obj.alias || row.obj.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { MaskObject, SceneObject } from '@/types/sceneObject'
import { debugLog } from '@/utils/debugLogger'
import { isAllowedMaskTargetType } from '@/utils/maskUtils'

const props = defineProps<{ mask: MaskObject }>()

const emit = defineEmits<(e: 'change', patch: Partial<MaskObject>) => void>()

const sceneObjectStore = useSceneObjectStore()

const expandedIds = reactive<Set<string>>(new Set())
const pickerExpandedIds = reactive<Set<string>>(new Set())
const pickerOpen = ref(false)

const allMasks = computed<MaskObject[]>(() => {
  return sceneObjectStore.objects.filter(o => o.type === 'mask') as unknown as MaskObject[]
})

const claimedByOthers = computed<Set<string>>(() => {
  const set = new Set<string>()
  for (const m of allMasks.value) {
    if (m.id === props.mask.id) continue
    for (const tid of m.targetIds) set.add(tid)
  }
  return set
})

const candidateTargets = computed<SceneObject[]>(() => {
  const own = new Set(props.mask.targetIds)
  const excludedBySelectedAncestors = new Set<string>()
  const collectDescendants = (parentId: string) => {
    for (const child of sceneObjectStore.objects) {
      if (child.parentId !== parentId || excludedBySelectedAncestors.has(child.id)) continue
      excludedBySelectedAncestors.add(child.id)
      collectDescendants(child.id)
    }
  }
  for (const targetId of own) {
    collectDescendants(targetId)
  }
  return sceneObjectStore.objects.filter(obj => {
    if (obj.id === props.mask.id) return false
    if (!isAllowedMaskTargetType(obj.type)) return false
    if (own.has(obj.id)) return false
    if (excludedBySelectedAncestors.has(obj.id)) return false
    if (claimedByOthers.value.has(obj.id)) return false
    return true
  })
})

interface CandidateTreeRow {
  obj: SceneObject
  depth: number
  hasChildren: boolean
}

const candidateTreeRows = computed<CandidateTreeRow[]>(() => {
  const candidates = new Set(candidateTargets.value.map(obj => obj.id))
  const objectIds = new Set(sceneObjectStore.objects.map(obj => obj.id))
  const rows: CandidateTreeRow[] = []
  const visited = new Set<string>()

  const hasVisibleCandidateDescendant = (id: string): boolean => {
    return sceneObjectStore.objects.some(obj => {
      if (obj.parentId !== id) return false
      if (candidates.has(obj.id)) return true
      return hasVisibleCandidateDescendant(obj.id)
    })
  }

  const walk = (obj: SceneObject, depth: number) => {
    if (visited.has(obj.id)) return
    visited.add(obj.id)

    const children = sceneObjectStore.objects.filter(child => child.parentId === obj.id)
    const visibleChildren = children.filter(child => candidates.has(child.id) || hasVisibleCandidateDescendant(child.id))
    const isCandidate = candidates.has(obj.id)

    if (isCandidate) {
      rows.push({ obj, depth, hasChildren: visibleChildren.length > 0 })
    }
    if ((!isCandidate || pickerExpandedIds.has(obj.id)) && visibleChildren.length > 0) {
      for (const child of visibleChildren) {
        walk(child, isCandidate ? depth + 1 : depth)
      }
    }
  }

  const roots = sceneObjectStore.objects.filter(obj => !obj.parentId || !sceneObjectStore.objects.some(parent => parent.id === obj.parentId))
  for (const root of roots) {
    if (candidates.has(root.id) || hasVisibleCandidateDescendant(root.id)) {
      walk(root, 0)
    }
  }

  for (const obj of candidateTargets.value) {
    if (!visited.has(obj.id) && (!obj.parentId || !objectIds.has(obj.parentId))) {
      walk(obj, 0)
    }
  }
  return rows
})

function getObjectAlias(id: string): string {
  const o = sceneObjectStore.objects.find(x => x.id === id)
  return o?.alias || o?.name || id
}

function getObjectIcon(id: string): string {
  const o = sceneObjectStore.objects.find(x => x.id === id)
  return getIconByType(o?.type)
}

function getIconByType(type: string | undefined): string {
  switch (type) {
    case 'prop': return '📦'
    case 'text': return '📝'
    case 'symbol': return '🔧'
    case 'expression': return '😀'
    case 'composite': return '🧩'
    case 'background': return '🖼️'
    default: return '•'
  }
}

function hasChildren(id: string): boolean {
  return sceneObjectStore.objects.some(o => o.parentId === id)
}

function isExpanded(id: string): boolean {
  return expandedIds.has(id)
}

function toggleExpand(id: string) {
  if (expandedIds.has(id)) expandedIds.delete(id)
  else expandedIds.add(id)
}

function togglePicker() {
  if (candidateTargets.value.length === 0) return
  pickerOpen.value = !pickerOpen.value
}

function togglePickerExpand(id: string) {
  if (pickerExpandedIds.has(id)) pickerExpandedIds.delete(id)
  else pickerExpandedIds.add(id)
}

function getPickerRowStyle(depth: number): Record<string, string> {
  const indent = Math.max(0, depth) * 18
  return {
    marginLeft: `${indent}px`,
    width: `calc(100% - ${indent}px)`,
  }
}

interface DescendantNode {
  obj: SceneObject
  depth: number
}

function getDescendants(rootId: string): DescendantNode[] {
  const result: DescendantNode[] = []
  const walk = (parentId: string, depth: number) => {
    const children = sceneObjectStore.objects.filter(o => o.parentId === parentId)
    for (const child of children) {
      result.push({ obj: child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(rootId, 0)
  return result
}

function addTarget(id: string) {
  if (!candidateTargets.value.some(obj => obj.id === id)) return
  const newIds = [...props.mask.targetIds, id]
  debugLog('mask', '[MASK-DEBUG] MaskTargetsSection.addTarget emit change\n' + JSON.stringify({ maskId: props.mask.id, oldTargets: props.mask.targetIds, newIds }, null, 2))
  emit('change', { targetIds: newIds })
  pickerOpen.value = false
}

function removeTarget(id: string) {
  const newIds = props.mask.targetIds.filter(t => t !== id)
  debugLog('mask', '[MASK-DEBUG] MaskTargetsSection.removeTarget emit change\n' + JSON.stringify({ maskId: props.mask.id, removed: id, newIds }, null, 2))
  emit('change', { targetIds: newIds })
  expandedIds.delete(id)
}
</script>

<style scoped>
.mask-targets-section {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.section-icon {
  color: #ec4899;
  flex-shrink: 0;
}

.target-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  margin-left: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #4338ca;
  background: #eef2ff;
  border-radius: 9px;
}

.empty-hint {
  padding: 10px 12px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  background: #f9fafb;
  border: 1px dashed #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
}

.target-list {
  list-style: none;
  padding: 0;
  margin: 0 0 8px 0;
}

.target-list .target-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #f9fafb !important;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.15s ease, border-color 0.15s ease;
  color: #1f2937;
}

.target-list .target-row:hover {
  background: #f3f4f6 !important;
  border-color: #d1d5db;
}

.target-list .target-row.child-row {
  background: #ffffff !important;
  border-color: #f1f5f9;
  border-style: dashed;
  margin-bottom: 2px;
}

.target-list .target-row.child-row:hover {
  background: #f9fafb !important;
}

.tree-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 9px;
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}

.tree-toggle-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.tree-toggle-spacer {
  display: inline-block;
  width: 18px;
  flex-shrink: 0;
}

.tree-indent {
  font-size: 11px;
  color: #d1d5db;
  font-family: monospace;
  flex-shrink: 0;
}

.target-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.target-name {
  flex: 1;
  font-size: 13px;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.child-name {
  font-size: 12px;
  color: #6b7280;
}

.remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.add-row {
  display: flex;
}

.tree-picker {
  position: relative;
  flex: 1;
}

.tree-picker-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tree-picker-trigger:hover:not(:disabled),
.tree-picker-trigger:focus {
  outline: none;
  border-style: solid;
  border-color: #6366f1;
  background: #eef2ff;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.tree-picker-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background: #f9fafb;
}

.trigger-plus {
  color: #6b7280;
  font-size: 16px;
  line-height: 1;
}

.trigger-arrow {
  margin-left: auto;
  font-size: 10px;
  color: #6b7280;
}

.tree-picker-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 4px);
  z-index: 40;
  max-height: 260px;
  overflow: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
}

.tree-picker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  color: #1f2937;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.tree-picker-row:hover {
  outline: none;
  color: #fff;
  background: #2563eb;
}

.tree-picker-row:focus {
  outline: none;
}

.tree-picker-row:focus-visible {
  box-shadow: inset 0 0 0 2px #93c5fd;
}

.picker-toggle,
.picker-toggle-spacer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 9px;
  flex-shrink: 0;
}

.picker-toggle {
  border-radius: 3px;
  color: #6b7280;
}

.tree-picker-row:hover .picker-toggle {
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
}

.picker-icon {
  flex-shrink: 0;
}

.picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
