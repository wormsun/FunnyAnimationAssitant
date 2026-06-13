<template>
  <div 
    class="action-sequencer" 
    :class="{ collapsed: isCollapsed }"
    :style="containerStyle"
  >
    <!-- 顶部 Resizer 手柄 -->
    <div 
      class="resizer-handle"
      @mousedown="startResize"
    >
      <div class="resizer-grip" />
    </div>

    <!-- 顶部工具栏 -->
    <div
      v-show="!isCollapsed"
      class="sequencer-toolbar"
    >
      <div class="toolbar-left">
        <!-- 过滤器 -->
        <label class="filter-label">过滤器:</label>
        <div
          ref="filterWrapperRef"
          class="filter-wrapper"
        >
          <select
            v-model="filterMode"
            class="filter-select"
            @change="handleFilterChange"
          >
            <option value="active">
              👁️ 仅活跃对象
            </option>
            <option value="all">
              📦 全部显示
            </option>
            <option value="selected">
              ✓ 仅选中
            </option>
            <option value="custom">
              ⚙️ 自定义...
            </option>
          </select>
        </div>
        <!-- 折叠组合按钮 -->
        <button
          class="toolbar-btn"
          title="折叠所有组合对象"
          @click="collapseAllTracks"
        >
          📂 折叠组合
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: showActionOrder }"
          title="显示并调整同一槽位内动作执行顺序"
          @click="showActionOrder = !showActionOrder"
        >
          动作顺序
        </button>
        <div
          v-if="showActionOrder && currentSlotOrderActionCount > 1"
          class="order-controls"
        >
          <span
            v-if="selectedActionOrderInfo"
            class="order-label"
          >
            执行顺序 {{ selectedActionOrderInfo.index + 1 }}/{{ selectedActionOrderInfo.total }}
          </span>
          <button
            class="order-btn"
            title="提前执行"
            :disabled="!selectedActionOrderInfo || selectedActionOrderInfo.index === 0"
            @click="handleMoveSelectedActionOrder(-1)"
          >
            ↑
          </button>
          <button
            class="order-btn"
            title="延后执行"
            :disabled="!selectedActionOrderInfo || selectedActionOrderInfo.index === selectedActionOrderInfo.total - 1"
            @click="handleMoveSelectedActionOrder(1)"
          >
            ↓
          </button>
          <button
            class="order-btn order-default-btn"
            title="清除当前槽位的自定义执行顺序，恢复系统默认顺序"
            @click="handleResetCurrentSlotActionOrder"
          >
            恢复默认
          </button>
        </div>
      </div>

      <div class="toolbar-spacer" />

      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <span class="zoom-label">🔍</span>
        <button
          class="zoom-btn"
          :disabled="zoomLevel <= 0.5"
          @click="handleZoomOut"
        >
          -
        </button>
        <input 
          v-model.number="zoomLevel" 
          type="range" 
          class="zoom-slider" 
          min="0.5" 
          max="2" 
          step="0.1"
        >
        <button
          class="zoom-btn"
          :disabled="zoomLevel >= 2"
          @click="handleZoomIn"
        >
          +
        </button>
        <span class="zoom-value">{{ Math.round(zoomLevel * 100) }}%</span>
      </div>

      <!-- 折叠按钮 - 最右侧 -->
      <button 
        class="collapse-btn" 
        :title="isCollapsed ? '展开' : '折叠'"
        @click="toggleCollapse"
      >
        ▼
      </button>
    </div>

    <!-- 折叠状态时的简化标题栏 -->
    <div
      v-show="isCollapsed"
      class="collapsed-header"
      @click="toggleCollapse"
    >
      <span class="collapsed-title">🎬 动作编辑</span>
      <span class="collapsed-info">{{ actions.length }} 个动作</span>
      <div class="collapsed-spacer" />
      <button class="collapse-btn expand">
        ▲
      </button>
    </div>

    <!-- 主内容区域 - 统一滚动容器 -->
    <div
      v-show="!isCollapsed"
      ref="scrollContainer"
      class="sequencer-content"
      @scroll="handleContainerScroll"
    >
      <!-- 台词轨道行 -->
      <div class="track-row subtitle-row">
        <div class="track-header subtitle-header">
          <span class="header-icon">🗣️</span>
          <span class="header-label">参考台词</span>
        </div>
        <div class="track-content">
          <div class="subtitle-track">
            <div 
              v-for="slot in slots" 
              :key="slot.index"
              class="slot-card"
              :class="{ 
                active: currentSlotIndex === slot.index,
                merged: slot.isMerged,
                preroll: slot.type === 'preroll',
                postroll: slot.type === 'postroll'
              }"
              :style="getSlotStyle(slot)"
              @click="handleSelectSlot(slot.index)"
            >
              <div class="slot-index">
                {{ getSlotIndexLabel(slot) }}
              </div>
              <div class="slot-text">
                {{ getSlotDisplayText(slot) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 对象动作轨道行 -->
      <div 
        v-for="track in sortedFilteredTracks" 
        v-show="isTrackVisible(track)"
        :key="track.targetId"
        class="track-row"
        :class="{ selected: selectedObjectId === track.targetId, 'child-track': !!track.parentId }"
      >
        <div 
          class="track-header"
          :class="{ selected: selectedObjectId === track.targetId }"
          :style="{ paddingLeft: (getTrackDepth(track) * 16 + 8) + 'px' }"
          @click="handleSelectTrack(track)"
          @contextmenu.prevent="handleTrackHeaderContextMenu($event, track)"
        >
          <button
            v-if="hasChildTracks(track.targetId)"
            class="track-collapse-btn"
            @click.stop="toggleTrackCollapse(track.targetId)"
          >
            {{ collapsedComposites.has(track.targetId) ? '▶' : '▼' }}
          </button>
          <span v-else-if="track.parentId" class="track-indent">└</span>
          <span class="header-icon">{{ getTrackIcon(track.type) }}</span>
          <span class="header-label">{{ track.targetName }}</span>
        </div>
        <div class="track-content">
          <div class="action-track">
            <!-- 网格背景 -->
            <div class="track-grid">
              <div 
                v-for="slot in slots" 
                :key="slot.index"
                class="grid-cell"
                :class="{ active: currentSlotIndex === slot.index }"
                :style="getSlotStyle(slot)"
              />
            </div>

            <!-- 动作渲染 -->
            <div class="track-actions">
              <!-- Duration Actions (长条) -->
              <div 
                v-for="action in getDurationActionsForTrack(track.targetId)" 
                :key="action.id"
                class="action-bar"
                :class="[
                  getActionColorClass(action.type),
                  { selected: selectedActionId === action.id }
                ]"
                :style="getActionBarStyle(action)"
                @click.stop="handleSelectAction(action)"
                @mousedown="handleActionDragStart($event, action)"
              >
                <span
                  v-if="isActionOrderVisible(action)"
                  class="action-order-badge action-order-badge-bar"
                >{{ getActionOrderLabel(action) }}</span>
                <span class="action-bar-label">{{ getActionLabel(action) }}</span>
                <!-- 右侧拖拽手柄 -->
                <div 
                  class="resize-handle"
                  @mousedown.stop="handleActionResizeStart($event, action)"
                />
              </div>

              <!-- Point Actions (图标) -->
              <div 
                v-for="action in getPointActionsForTrack(track.targetId)" 
                :key="action.id"
                class="action-icon"
                :class="{ 
                  selected: selectedActionId === action.id,
                  locked: isBirthAction(action)
                }"
                :style="getActionIconStyle(action)"
                :draggable="!isBirthAction(action)"
                :title="isBirthAction(action) ? '出生动作不可拖拽' : ''"
                @click.stop="handleSelectAction(action)"
                @dragstart="handleActionDragStart($event, action)"
              >
                <span
                  v-if="isActionOrderVisible(action)"
                  class="action-order-badge"
                >{{ getActionOrderLabel(action) }}</span>
                {{ getPointActionIcon(action) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div 
        v-if="contextMenu.visible" 
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button
          class="menu-item danger"
          @click="handleDeleteTrackActions"
        >
          🗑️ 删除该对象的所有动作
        </button>
      </div>
    </Teleport>

    <!-- 自定义筛选器对话框 -->
    <Teleport to="body">
      <div
        v-if="customFilterPopover.visible"
        class="custom-filter-overlay"
        @click="closeCustomFilterPopover"
      >
        <div
          class="custom-filter-dialog"
          @click.stop
        >
          <div class="dialog-header">
            <span class="dialog-title">⚙️ 自定义筛选器</span>
            <button
              class="dialog-close"
              @click="closeCustomFilterPopover"
            >
              ✕
            </button>
          </div>
          <div class="dialog-search">
            <input 
              v-model="customFilterPopover.searchText" 
              type="text" 
              placeholder="🔍 搜索对象名称..." 
              class="search-input"
            >
          </div>
          <div class="dialog-content">
            <!-- 按类型分组显示 -->
            <div 
              v-for="group in groupedTracks" 
              :key="group.type" 
              class="track-group"
            >
              <div 
                class="group-header" 
                @click="toggleGroupCollapse(group.type)"
              >
                <span class="group-icon">{{ group.collapsed ? '▶' : '▼' }}</span>
                <span class="group-type-icon">{{ group.icon }}</span>
                <span class="group-label">{{ group.label }}</span>
                <span class="group-count">{{ group.tracks.length }} 个</span>
                <label
                  class="group-checkbox"
                  @click.stop
                >
                  <input 
                    type="checkbox" 
                    :checked="isGroupAllSelected(group.type)"
                    :indeterminate="isGroupPartialSelected(group.type)"
                    @change="toggleGroupSelection(group.type)"
                  >
                  <span class="checkbox-label">全选</span>
                </label>
              </div>
              <div
                v-show="!group.collapsed"
                class="group-tracks"
              >
                <label 
                  v-for="track in getFilteredGroupTracks(group)" 
                  :key="track.targetId" 
                  class="track-item"
                  :class="{ selected: customFilterPopover.selectedTrackIds.includes(track.targetId) }"
                >
                  <input 
                    v-model="customFilterPopover.selectedTrackIds" 
                    type="checkbox"
                    :value="track.targetId"
                  >
                  <span class="track-icon">{{ track.icon }}</span>
                  <span class="track-name">{{ track.targetName }}</span>
                  <span
                    v-if="track.actions.length > 0"
                    class="track-actions-count"
                  >
                    {{ track.actions.length }} 个动作
                  </span>
                </label>
              </div>
            </div>
            <div
              v-if="groupedTracks.length === 0"
              class="empty-state"
            >
              <span>暂无可筛选的对象</span>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="footer-info">
              已选择 <strong>{{ customFilterPopover.selectedTrackIds.length }}</strong> / {{ allTracks.length }} 个对象
            </div>
            <div class="footer-actions">
              <button
                class="btn-secondary"
                @click="selectAllTracks"
              >
                全选
              </button>
              <button
                class="btn-secondary"
                @click="clearSelection"
              >
                清空
              </button>
              <button
                class="btn-primary"
                @click="applyCustomFilter"
              >
                应用筛选
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount,onMounted, reactive, ref, watch } from 'vue'

import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { CompositeObject } from '@/types/sceneObject'
import type { Action, DurationAction, RuntimeSlot, SceneObject, ScriptBlock } from '@/types/screenplay'
import { BIRTH_ACTION_ICON, DEATH_ACTION_ICON,isBirthAction, isDeathAction } from '@/utils/actionHelpers'
import { sortActionsForEvaluation } from '@/utils/actionOrder'
import { findCameraConflict, isCameraActionType } from '@/utils/cameraActionRules'
import { parseBlockToSlots } from '@/utils/slotUtils'

// ==================== Props & Emits ====================

interface Props {
  block: ScriptBlock | null
  actions: Action[]
  currentSlotIndex: number
  selectedActionId: string | null
  selectedObjectId: string | null
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isPlaying: false
})

const emit = defineEmits<{
  'update:currentSlotIndex': [index: number]
  'select-slot': [index: number]
  'select-action': [action: Action | null]
  'select-object': [objectId: string | null]
  'update-action': [action: Action, updates: Partial<Action>]
  'delete-action': [action: Action]
  'reorder-actions': [slotIndex: number, actionIds: string[]]
  'reset-action-order': [slotIndex: number]
  'add-action': [type: string, target: string, slotIndex: number]
  'play': []
  'pause': []
  'stop': []
  'collapse-change': [collapsed: boolean]
}>()

// ==================== Stores ====================

const sceneObjectStore = useSceneObjectStore()

// ==================== State ====================

// 容器状态
const isCollapsed = ref(false)
const panelHeight = ref(250)
const minHeight = 150
const maxHeight = 600

// 工具栏状态
const filterMode = ref<'active' | 'all' | 'selected' | 'custom'>('active')
const zoomLevel = ref(1)
const showActionOrder = ref(false)

// 自定义筛选器状态
const filterWrapperRef = ref<HTMLElement>()
const customFilterPopover = ref({
  visible: false,
  searchText: '',
  selectedTrackIds: [] as string[],
  collapsedGroups: new Set<string>()
})

// P2: 组合轨道折叠状态
const collapsedComposites = reactive(new Set<string>())

// 右键菜单
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  track: null as TrackData | null,
  slotIndex: 0
})

// 拖拽状态
const isDragging = ref(false)
const isResizing = ref(false)
const dragAction = ref<Action | null>(null)
const dragStartX = ref(0)
const dragStartSlotIndex = ref(0)

// 滚动容器引用
const scrollContainer = ref<HTMLElement>()

const objectIndexMap = computed(() => {
  const map = new Map<string, number>()
  sceneObjectStore.objects.forEach((obj, index) => {
    map.set(obj.id, index)
  })
  return map
})

// ==================== Computed ====================

// 容器样式
const containerStyle = computed(() => ({
  height: isCollapsed.value ? '36px' : `${panelHeight.value}px`
}))

// 解析槽位
const slots = computed<RuntimeSlot[]>(() => {
  if (!props.block) return []
  return parseBlockToSlots(props.block)
})

// 轨道数据接口
interface TrackData {
  targetId: string
  targetName: string
  type: SceneObject['type']
  icon: string
  actions: Action[]
  parentId?: string  // P2: composite 分组
  compositeMode?: 'entity' | 'union'  // P2: 组合模式（用于默认折叠判断）
}

// 从场景对象和动作生成轨道数据
const allTracks = computed<TrackData[]>(() => {
  const tracks: TrackData[] = []
  const targetSet = new Set<string>()
  
  // 1. 从动作中收集目标
  for (const action of props.actions) {
    if (!targetSet.has(action.target)) {
      targetSet.add(action.target)
      tracks.push(createTrackFromTarget(action.target))
    }
  }
  
  // 2. 从场景对象补充（确保相机始终显示）
  for (const obj of sceneObjectStore.objects) {
    let targetId = ''
    if (obj.type === 'camera') {
      targetId = 'camera'
    } else {
      // v7.0: 其他对象（角色、道具、背景、音频等）都使用实例ID
      targetId = obj.id
    }
    
    if (targetId && !targetSet.has(targetId)) {
      targetSet.add(targetId)
      tracks.push(createTrackFromTarget(targetId))
    }
  }
  
  // 为每个轨道分配动作
  for (const track of tracks) {
    track.actions = props.actions.filter(a => a.target === track.targetId)
  }
  
  // 双层架构：parentId 已由 applySlotState() 写入 runtimeObjects
  // 不再需要 accumulatedParentIds 覆盖
  
  return tracks
})

// 根据过滤模式筛选轨道
const filteredTracks = computed<TrackData[]>(() => {
  switch (filterMode.value) {
    case 'active': {
      // 仅显示有动作的轨道 + 相机
      // P2: 后代活跃时，祖先 composite 也自动纳入
      const activeTracks = allTracks.value.filter(t => t.actions.length > 0 || t.type === 'camera')
      const activeIds = new Set(activeTracks.map(t => t.targetId))
      // 沿 parentId 链向上收集所有祖先
      for (const t of activeTracks) {
        let pid = t.parentId
        while (pid && !activeIds.has(pid)) {
          activeIds.add(pid)
          const parentTrack = allTracks.value.find(pt => pt.targetId === pid)
          pid = parentTrack?.parentId
        }
      }
      return allTracks.value.filter(t => activeIds.has(t.targetId))
    }
    case 'selected': {
      // 仅显示选中的对象 - 需要将 selectedObjectId 转换为 targetId
      if (!props.selectedObjectId) {
        return [] // 没有选中对象时显示空
      }
      const selectedObj = sceneObjectStore.getObject(props.selectedObjectId)
      if (!selectedObj) return []
      
      let matchTargetId = ''
      if (selectedObj.type === 'camera') {
        matchTargetId = 'camera'
      } else {
        // v7.0: 其他对象都使用实例ID
        matchTargetId = selectedObj.id
      }
      
      if (matchTargetId) {
        return allTracks.value.filter(t => t.targetId === matchTargetId)
      }
      return []
    }
    case 'custom':
      // 自定义筛选 - 根据用户选中的轨道ID过滤
      if (customFilterPopover.value.selectedTrackIds.length === 0) {
        return allTracks.value // 如果没有选择，显示全部
      }
      return allTracks.value.filter(t => 
        customFilterPopover.value.selectedTrackIds.includes(t.targetId)
      )
    case 'all':
    default:
      return allTracks.value
  }
})

// P2: 按 composite parent→children 排序的轨道列表（递归深度优先）
const sortedFilteredTracks = computed<TrackData[]>(() => {
  const tracks = filteredTracks.value
  const result: TrackData[] = []
  const childMap = new Map<string, TrackData[]>() // parentId → children
  const rootTracks: TrackData[] = []
  const inserted = new Set<string>()

  // 分类：root vs child
  for (const t of tracks) {
    if (t.parentId) {
      const children = childMap.get(t.parentId) ?? []
      children.push(t)
      childMap.set(t.parentId, children)
    } else {
      rootTracks.push(t)
    }
  }

  // 递归深度优先平铺
  function flattenTrack(track: TrackData): void {
    if (inserted.has(track.targetId)) return
    inserted.add(track.targetId)
    result.push(track)
    const children = childMap.get(track.targetId)
    if (children) {
      for (const child of children) {
        flattenTrack(child)
      }
    }
  }

  for (const track of rootTracks) {
    flattenTrack(track)
  }

  // 孤儿 children（parent 不在当前 filter 中）
  for (const [, children] of childMap) {
    for (const child of children) {
      if (!inserted.has(child.targetId)) {
        flattenTrack(child)
      }
    }
  }

  return result
})

// 轨道分组接口
interface TrackGroup {
  type: string
  label: string
  icon: string
  collapsed: boolean
  tracks: TrackData[]
}

// 按类型分组的轨道
const groupedTracks = computed<TrackGroup[]>(() => {
  const groups: Record<string, TrackGroup> = {
    camera: { type: 'camera', label: '相机', icon: '🎥', collapsed: false, tracks: [] },
    character: { type: 'character', label: '角色', icon: '👤', collapsed: false, tracks: [] },
    prop: { type: 'prop', label: '道具', icon: '📦', collapsed: false, tracks: [] },
    background: { type: 'background', label: '背景', icon: '🖼️', collapsed: false, tracks: [] },
    audio: { type: 'audio', label: '音频', icon: '🎵', collapsed: false, tracks: [] },
    screen_effect: { type: 'screen_effect', label: '画面特效', icon: '🌟', collapsed: false, tracks: [] },
    light: { type: 'light', label: '光源', icon: '💡', collapsed: false, tracks: [] },
    composite: { type: 'composite', label: '组合', icon: '🧩', collapsed: false, tracks: [] }
  }
  
  for (const track of allTracks.value) {
    const group = groups[track.type]
    if (group) {
      group.tracks.push(track)
    } else {
      // 未知类型放入道具组
      groups['prop']!.tracks.push(track)
    }
  }
  
  // 应用折叠状态
  for (const group of Object.values(groups)) {
    group.collapsed = customFilterPopover.value.collapsedGroups.has(group.type)
  }
  
  // 返回有轨道的分组
  return Object.values(groups).filter(g => g.tracks.length > 0)
})

const selectedActionOrderInfo = computed(() => {
  if (!props.selectedActionId) return null
  const selectedAction = props.actions.find(action => action.id === props.selectedActionId)
  if (!selectedAction) return null
  const slotActions = getOrderedActionsForSlot(selectedAction.slotIndex)
  const index = slotActions.findIndex(action => action.id === selectedAction.id)
  if (index === -1 || slotActions.length <= 1) return null
  return {
    action: selectedAction,
    index,
    total: slotActions.length,
  }
})

const currentSlotOrderActionCount = computed(() =>
  props.actions.filter(action => action.slotIndex === props.currentSlotIndex).length
)

// ==================== P2: 轨道折叠/展开 ====================

// 检查某个轨道是否有子轨道
function hasChildTracks(targetId: string): boolean {
  return sortedFilteredTracks.value.some(t => t.parentId === targetId)
}

// P2: 已手动切换过的 composite — 跳过自动折叠/展开
const manuallyToggledComposites = new Set<string>()

// P2: 根据 compositeMode 自动设置默认折叠状态
// union（联合）→ 默认展开，entity（实体）→ 默认折叠
// v19.x: 如果 entity 的后代有动作，则自动展开
watch(
  () => allTracks.value
    .filter(t => t.type === 'composite' && hasChildTracks(t.targetId))
    .map(t => ({ id: t.targetId, mode: t.compositeMode ?? 'union' as const })),
  (composites) => {
    for (const { id, mode } of composites) {
      if (manuallyToggledComposites.has(id)) continue
      if (mode === 'entity') {
        // 检查是否有后代存在动作
        const hasActiveDescendant = allTracks.value.some(t => {
          if (t.actions.length === 0) return false
          // 向上追溯 parentId，看是否属于当前 composite
          let currentParent = t.parentId
          while (currentParent) {
            if (currentParent === id) return true
            const parentTrack = allTracks.value.find(pt => pt.targetId === currentParent)
            currentParent = parentTrack?.parentId
          }
          return false
        })
        
        if (hasActiveDescendant) {
          collapsedComposites.delete(id)
        } else {
          collapsedComposites.add(id)
        }
      } else {
        collapsedComposites.delete(id)
      }
    }
  },
  { immediate: true }
)

// 切换轨道折叠状态
function toggleTrackCollapse(targetId: string): void {
  manuallyToggledComposites.add(targetId)
  if (collapsedComposites.has(targetId)) {
    collapsedComposites.delete(targetId)
  } else {
    collapsedComposites.add(targetId)
  }
}

// 折叠全部组合轨道
function collapseAllTracks(): void {
  for (const t of allTracks.value) {
    if (hasChildTracks(t.targetId)) {
      collapsedComposites.add(t.targetId)
      manuallyToggledComposites.add(t.targetId)
    }
  }
}

// 计算轨道嵌套深度（用于多级缩进）
function getTrackDepth(track: TrackData): number {
  let depth = 0
  let pid = track.parentId
  while (pid) {
    depth++
    const parentTrack = allTracks.value.find(t => t.targetId === pid)
    pid = parentTrack?.parentId
  }
  return depth
}

// 子轨道是否可见（检查祖先链是否全部展开）
function isTrackVisible(track: TrackData): boolean {
  if (!track.parentId) return true
  // 直接父级被折叠 → 不可见
  if (collapsedComposites.has(track.parentId)) return false
  // 递归检查祖先
  const parentTrack = sortedFilteredTracks.value.find(t => t.targetId === track.parentId)
  if (parentTrack) return isTrackVisible(parentTrack)
  return true
}

// ==================== Helper Functions ====================

function createTrackFromTarget(target: string): TrackData {
  if (target === 'camera') {
    return {
      targetId: 'camera',
      targetName: '相机',
      type: 'camera',
      icon: '🎥',
      actions: []
    }
  }

  if (target === '_scene_') {
    return {
      targetId: '_scene_',
      targetName: '当前场景',
      type: 'prop',
      icon: '🎬',
      actions: []
    }
  }
  
  // v11.1: 处理场景动画特殊 target
  if (target === '__scene_animation__') {
    return {
      targetId: '__scene_animation__',
      targetName: '场景动画',
      type: 'prop', // 使用 prop 类型图标
      icon: '🎬',
      actions: []
    }
  }
  
  // v7.0: target 现在是实例ID，直接从场景对象查找
  const obj = sceneObjectStore.getObject(target)
  if (obj) {
    // v7.1: 优先使用别名（确保非空字符串）
    const alias = obj.alias
    let displayName = target
    if (alias?.trim()) {
      displayName = alias
    } else if (obj.name?.trim()) {
      displayName = obj.name
    }
    
    
    // 双层架构：直接从 runtimeObjects 的 obj.parentId 读取（已由 applySlotState 写入）
    const effectiveParentId = obj.parentId
    // P2: 为 composite 类型对象附加 compositeMode
    const compositeMode = obj.type === 'composite'
      ? (obj as CompositeObject).compositeMode
      : undefined
    return {
      targetId: target,
      targetName: displayName,
      type: obj.type,
      icon: getTrackIcon(obj.type),
      actions: [],
      ...(effectiveParentId ? { parentId: effectiveParentId } : {}),
      ...(compositeMode ? { compositeMode } : {})
    }
  }
  
  // v7.1: 如果找不到对象，提供更友好的显示
  let fallbackName = target
  let fallbackType: SceneObject['type'] = 'prop'
  if (target.startsWith('char_')) {
    fallbackName = '角色 ' + target.substring(5, 13) + '...'
  } else if (target.startsWith('bg_')) {
    fallbackName = '背景 ' + target.substring(3, 11) + '...'
    fallbackType = 'background'
  }
  
  return {
    targetId: target,
    targetName: fallbackName,
    type: fallbackType,
    icon: '❓',
    actions: []
  }
}

// P1: 委托给 metadata 注册表，camera 在轨道视角使用 🎥
function getTrackIcon(type: string): string {
  if (type === 'camera') return '🎥'
  return getTypeIcon(type)
}

function getSlotStyle(slot: RuntimeSlot) {
  // PRD v6.10: preroll/postroll 基于时长计算宽度，subtitle 基于字数
  let width: number
  
  if (slot.type === 'preroll' || slot.type === 'postroll') {
    // 前置/后置槽位：基于时长计算宽度
    // 最小宽度 80px，每 100ms 增加 10px
    const minWidth = 80
    const durationFactor = 0.1  // 每 1ms = 0.1px
    width = (minWidth + slot.duration * durationFactor) * zoomLevel.value
    // 限制最大宽度
    width = Math.min(width, 200 * zoomLevel.value)
  } else {
    // 字幕槽位：基于字数计算宽度
    const basePadding = 60  // 基础内边距，保证短句也有点击区域
    const charFactor = 12   // 每字像素
    const charCount = slot.text?.length ?? 1
    width = (basePadding + charCount * charFactor) * zoomLevel.value
  }
  
  return {
    width: `${width}px`,
    minWidth: `${width}px`
  }
}

// 计算槽位像素宽度（v6.10: preroll/postroll 基于时长，subtitle 基于字数）
function getSlotPixelWidth(slot: RuntimeSlot): number {
  if (slot.type === 'preroll' || slot.type === 'postroll') {
    // 前置/后置槽位：基于时长计算宽度
    const minWidth = 80
    const durationFactor = 0.1
    const width = (minWidth + slot.duration * durationFactor) * zoomLevel.value
    return Math.min(width, 200 * zoomLevel.value)
  } else {
    // 字幕槽位：基于字数计算宽度
    const basePadding = 60
    const charFactor = 12
    const charCount = slot.text?.length ?? 1
    return (basePadding + charCount * charFactor) * zoomLevel.value
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.substring(0, maxLen) + '...'
}

// 格式化槽位时长显示 (v6.10)
function formatSlotDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

// 获取槽位显示编号 (v6.10: 调整 preroll 后的编号)
function getSlotIndexLabel(slot: RuntimeSlot): string {
  if (slot.type === 'preroll') return '◀ 前'
  if (slot.type === 'postroll') return '后 ▶'
  
  // 计算偏移量：如果有 preroll，需要减去 1
  const hasPreroll = slots.value.length > 0 && slots.value[0]?.type === 'preroll'
  const displayIndex = slot.index + 1 - (hasPreroll ? 1 : 0)
  
  return '#' + displayIndex
}

// 获取槽位显示文本 (v6.10: 估算时不显示时间)
function getSlotDisplayText(slot: RuntimeSlot): string {
  if (slot.type === 'preroll') {
    // preroll: 如果是估算值则不显示时间
    return slot.isEstimated ? '前置' : formatSlotDuration(slot.duration)
  } else if (slot.type === 'postroll') {
    // postroll: 如果是估算值则不显示时间
    return slot.isEstimated ? '后置' : formatSlotDuration(slot.duration)
  }
  // subtitle: 显示文本
  return truncateText(slot.text ?? '', 30)
}

function getActionColorClass(type: string): string {
  if (type.startsWith('camera')) return 'color-camera'
  // screen_effect 判断必须在 startsWith('tween') 之前，否则 tween_screen_effect 会被匹配为 color-transform
  if (type === 'set_screen_effect' || type === 'tween_screen_effect') return 'color-vfx'
  if (type === 'set_light' || type === 'tween_light') return 'color-light'
  if (type === 'set_text' || type === 'tween_text' || type === 'set_text_reveal') return 'color-text'
  if (type.startsWith('tween') || type === 'set_transform') return 'color-transform'
  if (type.startsWith('vfx')) return 'color-vfx'
  return 'color-default'
}

function getActionLabel(action: Action): string {
  switch (action.type) {
    case 'tween_transform': {
      const p = action.params
      if (p?.x !== undefined || p?.y !== undefined) return '移动'
      if (p?.scaleX !== undefined) return '缩放'
      if (p?.rotation !== undefined) return '旋转'
      if (p?.alpha !== undefined) return '透明度'
      return '变换'
    }
    case 'camera_move': return '运镜'
    case 'camera_shake': return '震动'
    case 'camera_follow': return '跟随'
    case 'set_screen_effect': return '🌟特效'
    case 'tween_screen_effect': return '🌟渐变'
    case 'set_light': return '💡灯光'
    case 'tween_light': return '💡渐变'
    case 'set_material': return '🎨素材'
    case 'set_text': return '📝文本'
    case 'set_text_reveal': {
      return action.params.action === 'stop' ? '⌨完整文本' : '⌨开始打字'
    }
    case 'tween_text': return '📝渐变'
    case 'set_mask': return '✂蒙版'
    default: return action.type
  }
}

function getPointActionIcon(action: Action): string {
  switch (action.type) {

    case 'set_lifecycle': {
      // v9.3: 生命周期 Action 使用专属图标
      if (isBirthAction(action)) return BIRTH_ACTION_ICON  // 🌱 出生
      if (isDeathAction(action)) return DEATH_ACTION_ICON  // 🍂 消亡
      return '◆'
    }
    case 'set_transform': {
      // v9.3: set_transform 仅处理几何+透明度，不再包含 spawned
      return '◆'
    }
    case 'set_visual': {
      // v9.3: 视觉属性 Action
      return '👁'
    }
    case 'camera_cut': return '🎥'
    // v6.4: set_anim 图标
    case 'set_anim': return '🎬'
    case 'set_audio': {
      const p = action.params
      if (p?.action === 'stop') return '🔇'
      return '🔊'
    }
    case 'set_screen_effect': return '🌟'
    case 'tween_screen_effect': return '🌟'
    case 'set_light': return '💡'
    case 'tween_light': return '💡'
    case 'set_scene_structure': return '🧭'   // 场景结构变更
    case 'set_composite': return '🧩'   // P2: 组合属性变更
    case 'set_mask': return '✂'         // Clip-Mask Phase 1: 蒙版属性变更
    case 'set_material': return '🎨'    // v16: 元件素材切换
    case 'set_text': return '📝'         // Text PRD: 文本属性
    case 'set_text_reveal': return '⌨'
    case 'tween_text': return '📝'       // Text PRD: 文本渐变
    default: return '◆'
  }
}

// Note: isBirthAction 和 isDeathAction 已从 @/utils/actionHelpers 导入

function getActionBarStyle(action: Action) {
  const startSlot = slots.value.find(s => s.index === action.slotIndex)
  if (!startSlot) return { display: 'none' }

  const span = 'slotSpan' in action ? action.slotSpan : 1
  let left = 0
  
  // 计算 left 位置（基于字数）
  for (let i = 0; i < action.slotIndex; i++) {
    const s = slots.value[i]
    if (s) {
      left += getSlotPixelWidth(s)
    }
  }
  
  // 计算宽度（基于字数）
  let width = 0
  for (let i = 0; i < span; i++) {
    const s = slots.value[action.slotIndex + i]
    if (s) {
      width += getSlotPixelWidth(s)
    }
  }
  
  return {
    left: `${left + 4}px`,
    width: `${width - 8}px`
  }
}

function getActionIconStyle(action: Action) {
  let left = 0
  
  // 计算 left 位置（基于字数）
  for (let i = 0; i < action.slotIndex; i++) {
    const s = slots.value[i]
    if (s) {
      left += getSlotPixelWidth(s)
    }
  }
  
  // 居中显示
  const currentSlot = slots.value[action.slotIndex]
  const slotWidth = currentSlot ? getSlotPixelWidth(currentSlot) : 80
  
  // v6.4: 同一 slot 同一对象的多个 point action 并排显示
  const sameSlotActions = props.actions.filter(
    a => a.target === action.target && a.slotIndex === action.slotIndex && a.category === 'point'
  )
  const orderedSameSlotActions = sortActionsForEvaluation(sameSlotActions, objectIndexMap.value)
  
  const iconWidth = 24
  const totalWidth = orderedSameSlotActions.length * iconWidth
  const startOffset = (slotWidth - totalWidth) / 2
  const actionIndex = orderedSameSlotActions.findIndex(a => a.id === action.id)
  const offset = startOffset + actionIndex * iconWidth
  
  return {
    left: `${left + offset}px`
  }
}

function getDurationActionsForTrack(targetId: string): Action[] {
  return sortActionsForEvaluation(
    props.actions.filter(a => a.target === targetId && a.category === 'duration'),
    objectIndexMap.value,
  )
}

function getPointActionsForTrack(targetId: string): Action[] {
  return sortActionsForEvaluation(
    props.actions.filter(a => a.target === targetId && a.category === 'point'),
    objectIndexMap.value,
  )
}

function getOrderedActionsForSlot(slotIndex: number): Action[] {
  return sortActionsForEvaluation(
    props.actions.filter(action => action.slotIndex === slotIndex),
    objectIndexMap.value,
  )
}

function getActionOrderLabel(action: Action): number {
  const slotActions = getOrderedActionsForSlot(action.slotIndex)
  const index = slotActions.findIndex(item => item.id === action.id)
  return index === -1 ? 1 : index + 1
}

function isActionOrderVisible(action: Action): boolean {
  return showActionOrder.value && action.slotIndex === props.currentSlotIndex
}

function handleMoveSelectedActionOrder(direction: -1 | 1): void {
  const info = selectedActionOrderInfo.value
  if (!info) return

  const slotActions = getOrderedActionsForSlot(info.action.slotIndex)
  const nextIndex = info.index + direction
  if (nextIndex < 0 || nextIndex >= slotActions.length) return

  const nextActions = [...slotActions]
  const current = nextActions[info.index]
  const next = nextActions[nextIndex]
  if (!current || !next) return

  nextActions[info.index] = next
  nextActions[nextIndex] = current
  emit('reorder-actions', info.action.slotIndex, nextActions.map(action => action.id))
}

function handleResetCurrentSlotActionOrder(): void {
  emit('reset-action-order', props.currentSlotIndex)
}

// ==================== Event Handlers ====================

// ==================== 自定义筛选器相关函数 ====================

function handleFilterChange() {
  if (filterMode.value === 'custom') {
    // 打开自定义筛选器面板
    customFilterPopover.value.visible = true
    // 初始化选中状态（如果之前没有选择，默认全选）
    if (customFilterPopover.value.selectedTrackIds.length === 0) {
      customFilterPopover.value.selectedTrackIds = allTracks.value.map(t => t.targetId)
    }
  }
}

function closeCustomFilterPopover() {
  customFilterPopover.value.visible = false
}

function toggleGroupCollapse(type: string) {
  if (customFilterPopover.value.collapsedGroups.has(type)) {
    customFilterPopover.value.collapsedGroups.delete(type)
  } else {
    customFilterPopover.value.collapsedGroups.add(type)
  }
}

function isGroupAllSelected(type: string): boolean {
  const group = groupedTracks.value.find(g => g.type === type)
  if (!group) return false
  return group.tracks.every(t => 
    customFilterPopover.value.selectedTrackIds.includes(t.targetId)
  )
}

function isGroupPartialSelected(type: string): boolean {
  const group = groupedTracks.value.find(g => g.type === type)
  if (!group) return false
  const selectedCount = group.tracks.filter(t => 
    customFilterPopover.value.selectedTrackIds.includes(t.targetId)
  ).length
  return selectedCount > 0 && selectedCount < group.tracks.length
}

function toggleGroupSelection(type: string) {
  const group = groupedTracks.value.find(g => g.type === type)
  if (!group) return
  
  const allSelected = isGroupAllSelected(type)
  if (allSelected) {
    // 取消全选
    for (const track of group.tracks) {
      const idx = customFilterPopover.value.selectedTrackIds.indexOf(track.targetId)
      if (idx !== -1) {
        customFilterPopover.value.selectedTrackIds.splice(idx, 1)
      }
    }
  } else {
    // 全选
    for (const track of group.tracks) {
      if (!customFilterPopover.value.selectedTrackIds.includes(track.targetId)) {
        customFilterPopover.value.selectedTrackIds.push(track.targetId)
      }
    }
  }
}

function getFilteredGroupTracks(group: TrackGroup): TrackData[] {
  const searchText = customFilterPopover.value.searchText.toLowerCase().trim()
  if (!searchText) return group.tracks
  return group.tracks.filter(t => 
    t.targetName.toLowerCase().includes(searchText) ||
    t.targetId.toLowerCase().includes(searchText)
  )
}

function selectAllTracks() {
  customFilterPopover.value.selectedTrackIds = allTracks.value.map(t => t.targetId)
}

function clearSelection() {
  customFilterPopover.value.selectedTrackIds = []
}

function applyCustomFilter() {
  customFilterPopover.value.visible = false
}

// 点击外部关闭 Popover
function handleClickOutside(event: MouseEvent) {
  if (
    customFilterPopover.value.visible &&
    filterWrapperRef.value &&
    !filterWrapperRef.value.contains(event.target as Node)
  ) {
    customFilterPopover.value.visible = false
  }
}

// 高度调整
let isResizingPanel = false
let resizeStartY = 0
let resizeStartHeight = 0

function startResize(e: MouseEvent) {
  if (isCollapsed.value) return
  
  isResizingPanel = true
  resizeStartY = e.clientY
  resizeStartHeight = panelHeight.value
  
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
  document.body.style.cursor = 'row-resize'
  e.preventDefault()
}

function handleResizeMove(e: MouseEvent) {
  if (!isResizingPanel) return
  
  const delta = resizeStartY - e.clientY
  const newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStartHeight + delta))
  panelHeight.value = newHeight
}

function handleResizeEnd() {
  isResizingPanel = false
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
  document.body.style.cursor = ''
}

// 折叠/展开
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  // 通知父组件折叠状态变化，以便刷新画布
  emit('collapse-change', isCollapsed.value)
}

// 缩放
function handleZoomIn() {
  if (zoomLevel.value < 2) {
    zoomLevel.value = Math.min(2, zoomLevel.value + 0.1)
  }
}

function handleZoomOut() {
  if (zoomLevel.value > 0.5) {
    zoomLevel.value = Math.max(0.5, zoomLevel.value - 0.1)
  }
}

// 槽位选择
function handleSelectSlot(index: number) {
  emit('update:currentSlotIndex', index)
  emit('select-slot', index)
}

// 轨道选择
function handleSelectTrack(track: TrackData) {
  // 查找对应的场景对象
  let objectId: string | null = null
  
  if (track.type === 'camera') {
    const cameraObj = sceneObjectStore.objects.find(o => o.type === 'camera')
    objectId = cameraObj?.id ?? null
  } else {
    // v7.0: targetId 现在是实例ID，直接查找
    const obj = sceneObjectStore.getObject(track.targetId)
    objectId = obj?.id ?? null
  }
  
  emit('select-object', objectId)
}

// 动作选择
// v8.8: 选中动作时自动选中其所在的 slot
function handleSelectAction(action: Action) {
  // 更新 slot 索引到动作的起始 slot
  // point 动作：slotIndex 即为其所在 slot
  // duration 动作：slotIndex 即为其开始 slot
  if (action.slotIndex !== props.currentSlotIndex) {
    emit('update:currentSlotIndex', action.slotIndex)
  }
  emit('select-action', action)
}

// 容器滚动处理
function handleContainerScroll(_e: Event) {
  // 统一滚动容器，无需额外同步
}

// 右键菜单 - 用于轨道头
function handleTrackHeaderContextMenu(e: MouseEvent, track: TrackData) {
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    track,
    slotIndex: 0
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

// 删除该对象的所有动作
function handleDeleteTrackActions() {
  if (contextMenu.value.track) {
    const targetId = contextMenu.value.track.targetId
    // 删除该目标的所有动作
    const actionsToDelete = props.actions.filter(a => a.target === targetId)
    for (const action of actionsToDelete) {
      emit('delete-action', action)
    }
  }
  closeContextMenu()
}

// 动作拖拽（移动）
function handleActionDragStart(e: MouseEvent, action: Action) {
  isDragging.value = true
  dragAction.value = action
  dragStartX.value = e.clientX
  dragStartSlotIndex.value = action.slotIndex
  
  document.addEventListener('mousemove', handleActionDragMove)
  document.addEventListener('mouseup', handleActionDragEnd)
}

function handleActionDragMove(e: MouseEvent) {
  if (!isDragging.value || !dragAction.value) return
  
  // 计算新的槽位索引
  const baseWidth = 80 * zoomLevel.value
  const deltaX = e.clientX - dragStartX.value
  const deltaSlots = Math.round(deltaX / baseWidth)
  const newSlotIndex = Math.max(0, Math.min(slots.value.length - 1, dragStartSlotIndex.value + deltaSlots))
  
  if (newSlotIndex !== dragAction.value.slotIndex) {
    const action = dragAction.value
    const span = action.category === 'duration' ? (action as DurationAction).slotSpan : 1
    const endSlotIndex = newSlotIndex + span - 1
    
    if (action.target === 'camera' && isCameraActionType(action.type)) {
      const candidate = { ...action, slotIndex: newSlotIndex } as Action
      const conflict = findCameraConflict(props.actions, candidate, { excludeId: action.id })
      if (conflict) return
    }
    
    if (action.target === 'camera' && isCameraActionType(action.type)) {
      emit('update-action', dragAction.value, { slotIndex: newSlotIndex })
      return
    }

    // 获取同一目标的同类型动作（排除当前拖动的动作）
    const sameTargetActions = props.actions.filter(a =>
      a.target === action.target &&
      a.id !== action.id &&
      a.category === action.category  // 同类型：补间与补间，瞬时与瞬时
    )

    // 检测重叠
    let hasOverlap = false
    for (const otherAction of sameTargetActions) {
      const otherSpan = otherAction.category === 'duration' ? (otherAction as DurationAction).slotSpan : 1
      const otherStart = otherAction.slotIndex
      const otherEnd = otherStart + otherSpan - 1

      // 检查范围是否重叠
      if (!(endSlotIndex < otherStart || newSlotIndex > otherEnd)) {
        hasOverlap = true
        break
      }
    }

    // 如果没有重叠，则更新位置
    if (!hasOverlap) {
      emit('update-action', dragAction.value, { slotIndex: newSlotIndex })
    }
  }
}

function handleActionDragEnd() {
  isDragging.value = false
  dragAction.value = null
  document.removeEventListener('mousemove', handleActionDragMove)
  document.removeEventListener('mouseup', handleActionDragEnd)
}

// 动作调整大小（Duration Action 的 slotSpan）
function handleActionResizeStart(e: MouseEvent, action: Action) {
  if (action.category !== 'duration') return
  
  isResizing.value = true
  dragAction.value = action
  dragStartX.value = e.clientX
  
  document.addEventListener('mousemove', handleActionResizeMove)
  document.addEventListener('mouseup', handleActionResizeEnd)
  document.body.style.cursor = 'col-resize'
}

function handleActionResizeMove(e: MouseEvent) {
  if (!isResizing.value || !dragAction.value) return
  
  const baseWidth = 80 * zoomLevel.value
  const deltaX = e.clientX - dragStartX.value
  const currentSpan = dragAction.value.category === 'duration' ? (dragAction.value as DurationAction).slotSpan : 1
  const deltaSpan = Math.round(deltaX / baseWidth)
  const maxSpan = slots.value.length - dragAction.value.slotIndex
  const newSpan = Math.max(1, Math.min(maxSpan, currentSpan + deltaSpan))
  
  if (newSpan !== currentSpan) {
    if (dragAction.value.target === 'camera' && isCameraActionType(dragAction.value.type)) {
      const candidate = { ...dragAction.value, slotSpan: newSpan } as Action
      const conflict = findCameraConflict(props.actions, candidate, { excludeId: dragAction.value.id })
      if (conflict) return
    }

    dragStartX.value = e.clientX
    emit('update-action', dragAction.value, { slotSpan: newSpan })
  }
}

function handleActionResizeEnd() {
  isResizing.value = false
  dragAction.value = null
  document.removeEventListener('mousemove', handleActionResizeMove)
  document.removeEventListener('mouseup', handleActionResizeEnd)
  document.body.style.cursor = ''
}

// ==================== Lifecycle ====================

onMounted(() => {
  // Access scrollContainer to satisfy unused variable check
  if (scrollContainer.value) {
    // nothing to do
  }

  document.addEventListener('click', closeContextMenu)
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
})
</script>

<style scoped>
.action-sequencer {
  position: relative;
  display: flex;
  flex-direction: column;
  background: white;
  border-top: 1px solid #e5e7eb;
  transition: height 0.2s ease;
  overflow: hidden;
}

.action-sequencer.collapsed {
  height: 36px !important;
}

/* Resizer */
.resizer-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  cursor: row-resize;
  z-index: 10;
}

.resizer-handle:hover {
  background: rgba(59, 130, 246, 0.3);
}

.resizer-grip {
  position: absolute;
  left: 50%;
  top: 1px;
  transform: translateX(-50%);
  width: 40px;
  height: 3px;
  background: #d1d5db;
  border-radius: 2px;
}

/* Toolbar */
.sequencer-toolbar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  gap: 16px;
}

.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-center {
  flex: 1;
}

.toolbar-btn {
  padding: 4px 8px;
  font-size: 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.toolbar-btn.active {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: #60a5fa;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.order-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid #e5e7eb;
}

.order-label {
  font-size: 12px;
  color: #4b5563;
}

.order-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 13px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  color: #374151;
  cursor: pointer;
}

.order-btn:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #60a5fa;
}

.order-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.order-default-btn {
  width: auto;
  padding: 0 8px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.play-btn.playing {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.filter-label {
  font-size: 12px;
  color: #6b7280;
}

.filter-select {
  padding: 4px 8px;
  font-size: 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  color: #374151;
  cursor: pointer;
}

/* 自定义筛选器对话框 */
.filter-wrapper {
  position: relative;
}

.custom-filter-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.custom-filter-dialog {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
}

.dialog-close {
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition: background 0.2s;
}

.dialog-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.dialog-search {
  padding: 16px 20px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-search .search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
  transition: all 0.2s;
}

.dialog-search .search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  min-height: 200px;
  max-height: 400px;
}

.track-group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.group-header:hover {
  background: #f3f4f6;
}

.group-icon {
  font-size: 12px;
  color: #6b7280;
  width: 16px;
  text-align: center;
  transition: transform 0.2s;
}

.group-type-icon {
  font-size: 18px;
}

.group-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.group-count {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
}

.group-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.group-checkbox:hover {
  background: #e5e7eb;
}

.group-checkbox input {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.checkbox-label {
  font-size: 12px;
  color: #6b7280;
}

.group-tracks {
  padding-left: 44px;
  background: #fafafa;
}

.track-item {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
  border-left: 3px solid transparent;
}

.track-item:hover {
  background: #f3f4f6;
}

.track-item.selected {
  background: #eff6ff;
  border-left-color: #3b82f6;
}

.track-item input {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.track-icon {
  font-size: 16px;
}

.track-name {
  flex: 1;
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-actions-count {
  font-size: 11px;
  color: #9ca3af;
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #9ca3af;
  font-size: 14px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.footer-info {
  font-size: 13px;
  color: #6b7280;
}

.footer-info strong {
  color: #3b82f6;
  font-weight: 600;
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  padding: 8px 16px;
  font-size: 13px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.btn-primary {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.zoom-label {
  font-size: 14px;
}

.zoom-slider {
  width: 80px;
  height: 4px;
  cursor: pointer;
}

.zoom-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 14px;
  font-weight: bold;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  color: #374151;
  cursor: pointer;
}

.zoom-btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.zoom-value {
  font-size: 11px;
  color: #6b7280;
  min-width: 36px;
  text-align: right;
}

.collapse-btn {
  padding: 4px 8px;
  font-size: 10px;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
}

.collapse-btn:hover {
  color: #374151;
}

/* Collapsed Header */
.collapsed-header {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  background: #f9fafb;
  cursor: pointer;
  gap: 12px;
}

.collapsed-header:hover {
  background: #f3f4f6;
}

.collapsed-title {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.collapsed-info {
  font-size: 11px;
  color: #9ca3af;
}

.collapsed-spacer {
  flex: 1;
}

/* Content Area - 统一滚动容器 */
.sequencer-content {
  flex: 1;
  overflow: auto;
  background: #fafafa;
}

/* 轨道行 - 包含左侧头和右侧内容 */
.track-row {
  display: flex;
  min-width: fit-content;
}

.track-row.subtitle-row {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #f3f4f6;
}

.track-row.selected {
  background: rgba(59, 130, 246, 0.05);
}

/* 左侧对象头 - 粘性定位 */
.track-header {
  position: sticky;
  left: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  width: 160px;
  min-width: 160px;
  height: 40px;
  padding: 0 12px;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  gap: 8px;
  flex-shrink: 0;
}

.track-header:hover {
  background: #f3f4f6;
}

.track-header.selected {
  background: #eff6ff;
}

.track-header.subtitle-header {
  background: #f3f4f6;
  cursor: default;
  z-index: 6;
}

/* 右侧轨道内容 */
.track-content {
  flex: 1;
  min-width: 0;
}

.header-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.header-label {
  flex: 1;
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Subtitle Track */
.subtitle-track {
  display: flex;
  height: 40px;
  background: #f3f4f6;
}

.slot-card {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4px 8px;
  border-right: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 0.2s;
}

.slot-card:hover {
  background: #e5e7eb;
}

.slot-card.active {
  background: #dbeafe;
  border-color: #3b82f6;
}

/* Preroll slot (前置) */
.slot-card.preroll {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-color: #f59e0b;
}

.slot-card.preroll .slot-index {
  color: #d97706;
}

.slot-card.preroll.active {
  background: linear-gradient(135deg, #fde68a, #fcd34d);
  border-color: #f59e0b;
}

/* Postroll slot (后置) */
.slot-card.postroll {
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  border-color: #6366f1;
}

.slot-card.postroll .slot-index {
  color: #4f46e5;
}

.slot-card.postroll.active {
  background: linear-gradient(135deg, #c7d2fe, #a5b4fc);
  border-color: #6366f1;
}

.slot-index {
  font-size: 10px;
  font-weight: 600;
  color: #3b82f6;
  margin-bottom: 2px;
}

.slot-text {
  font-size: 11px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Action Track */
.action-track {
  position: relative;
  height: 40px;
  border-bottom: 1px solid #e5e7eb;
}

.action-track.selected {
  background: rgba(59, 130, 246, 0.08);
}

/* Track Grid */
.track-grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  pointer-events: none;
}

.grid-cell {
  flex-shrink: 0;
  border-right: 1px dashed #e5e7eb;
}

.grid-cell.active {
  background: rgba(59, 130, 246, 0.08);
}

/* Track Actions */
.track-actions {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* Action Bar (Duration) */
.action-bar {
  position: absolute;
  top: 6px;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  cursor: move;
  font-size: 11px;
  color: white;
  overflow: visible;
  transition: box-shadow 0.2s;
}

.action-bar:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.action-bar.selected {
  box-shadow: 0 0 0 2px #3b82f6;
}

.action-bar.color-transform {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.action-bar.color-camera {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.action-bar.color-vfx {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
}

.action-bar.color-default {
  background: linear-gradient(135deg, #6b7280, #4b5563);
}

.action-bar.color-light {
  background: linear-gradient(135deg, #ffb347, #ff9500);
}

.action-bar.color-text {
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
}

.action-bar-label {
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
}

.resize-handle:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Action Icon (Point) */
.action-icon {
  position: absolute;
  top: 10px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: move;
  transition: all 0.2s;
}

.action-icon:hover {
  background: #f3f4f6;
  transform: scale(1.1);
}

.action-icon.selected {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.action-order-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  color: white;
  background: #111827;
  border-radius: 999px;
  pointer-events: none;
}

.action-order-badge-bar {
  left: -8px;
  right: auto;
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  overflow: hidden;
  min-width: 160px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: #374151;
  cursor: pointer;
  text-align: left;
}

.menu-item:hover:not(:disabled) {
  background: #f3f4f6;
}

.menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}

/* P2: composite 子对象轨道缩进（padding-left 由 :style 动态计算） */
.track-row.child-track .track-header {
  border-left: 2px solid #93c5fd;
  font-size: 11px;
}

/* P2: 轨道折叠按钮 */
.track-collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  font-size: 10px;
  color: #9ca3af;
  line-height: 1;
  flex-shrink: 0;
}

.track-collapse-btn:hover {
  color: #6366f1;
}

.track-indent {
  color: #d1d5db;
  font-size: 10px;
  padding: 0 2px;
  flex-shrink: 0;
}
</style>
