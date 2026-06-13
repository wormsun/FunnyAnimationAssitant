<template>
  <div class="action-list-panel">
    <!-- 动作列表 -->
    <div class="action-list">
      <div
        v-for="(action, index) in sortedActions"
        :key="action.id || index"
        :data-action-id="action.id"
        class="action-item"
        :class="{ selected: action.id === selectedActionId }"
        @click="handleSelectAction(action)"
        @mouseenter="handleHoverAction(action)"
      >
        <!-- 动作图标 -->
        <div
          class="action-icon"
          :class="getActionIconClass(action.type)"
        >
          <span v-if="isPointAction(action)">◆</span>
          <span
            v-else
            class="duration-bar"
          >|</span>
        </div>

        <!-- 动作信息 -->
        <div class="action-info">
          <div class="action-time">
            #{{ action.slotIndex + 1 }}
          </div>
          <div class="action-target">
            {{ getTargetName(action.target) }}
          </div>
          <div class="action-description">
            {{ getActionDescription(action) }}
          </div>
        </div>

        <!-- 删除按钮 -->
        <button
          class="delete-btn"
          title="删除动作"
          @click.stop="handleDeleteAction(action, index)"
        >
          ×
        </button>
      </div>

      <div
        v-if="sortedActions.length === 0"
        class="empty-state"
      >
        <p>暂无动作</p>
        <p class="hint">
          在画布上操作对象将自动录制为动作
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { Action } from '@/types/screenplay'
import { SCENE_ACTION_TARGET } from '@/types/screenplay'

interface LegacySetTransformParams {
  alpha?: number
  visible?: boolean
  flipX?: boolean
  zIndex?: number
}

interface LegacyTriggerAnimParams {
  action?: string
  partId?: string
}

const props = defineProps<{
  actions: Action[]
  blockDuration: number // Block总时长（毫秒）
  selectedActionId?: string | null
}>()

const emit = defineEmits<{
  selectAction: [action: Action | null]
  deleteAction: [action: Action, index: number]
  hoverAction: [action: Action | null]
  requestDeleteConfirm: [action: Action, index: number]
}>()

const sceneObjectStore = useSceneObjectStore()


// 监听选中动作变化，自动滚动到视口中间 (已移除：根据需求取消关联滚动)
// watch(() => props.selectedActionId, async (newId) => {
//   ...
// })

// 按槽位索引排序的动作列表
const sortedActions = computed(() => {
  return [...props.actions].sort((a, b) => a.slotIndex - b.slotIndex)
})

// 判断是否为瞬时动作
function isPointAction(action: Action): boolean {
  return action.category === 'point'
}

// 获取动作图标样式类
function getActionIconClass(type: string): string {
  return `action-icon-${type}`
}

// 获取目标对象名称
function getTargetName(target: string): string {
  // 如果是相机
  if (target === 'camera') {
    return '相机'
  }
  if (target === SCENE_ACTION_TARGET) {
    return '当前场景'
  }

  // v7.0: target 现在是实例ID，直接通过 sceneObjectStore 查找
  const obj = sceneObjectStore.getObject(target)
  if (obj) {
    // v7.1: 优先使用实例别名（确保非空字符串）
    const alias = obj.alias
    if (alias?.trim()) {
      return alias
    }
    if (obj.name?.trim()) {
      return obj.name
    }
  }

  // 如果找不到对象，尝试从 target 中提取可读名称
  // target 可能是 "char_xxx" 格式的ID，返回更友好的显示
  if (target.startsWith('char_')) {
    return '角色 ' + target.substring(5, 13) + '...'
  }
  if (target.startsWith('bg_')) {
    return '背景 ' + target.substring(3, 11) + '...'
  }
  
  return target
}

// 获取动作描述 (v6.3)
function getActionDescription(action: Action): string {
  switch (action.type) {
    case 'set_transform': {
      const params = action.params as LegacySetTransformParams
      const transformParts: string[] = []
      if (params.alpha !== undefined) transformParts.push('透明度')
      if (params.visible !== undefined) transformParts.push(params.visible ? '显示' : '隐藏')
      if (params.flipX !== undefined) transformParts.push('翻转')
      if (params.zIndex !== undefined) transformParts.push('层级')
      return transformParts.length > 0 ? transformParts.join('/') : '视觉变换'
    }

    case 'camera_cut':
      return '镜头切'
    case 'set_scene_structure':
      return '结构变更'
    case 'tween_transform': {
      const tweenAction = action
      const tweenParts: string[] = []
      if (tweenAction.params?.x !== undefined || tweenAction.params?.y !== undefined) {
        tweenParts.push('移动')
      }
      if (tweenAction.params?.scaleX !== undefined || tweenAction.params?.scaleY !== undefined) {
        tweenParts.push('缩放')
      }
      if (tweenAction.params?.rotation !== undefined) {
        tweenParts.push('旋转')
      }
      return tweenParts.length > 0 ? `补间: ${tweenParts.join('/')}` : '补间变换'
    }
    case 'camera_move':
      return '运镜'
    case 'camera_shake': {
      const shakeAction = action
      return `震动: ${shakeAction.params?.intensity || 0}px`
    }
    case 'camera_follow': {
      const followAction = action
      const followTargetId = followAction.params?.followTarget || ''
      // v7.0: 使用 getTargetName 获取别名
      const followTargetName = followTargetId ? getTargetName(followTargetId) : '未设置'
      return `跟随: ${followTargetName}`
    }
    case 'set_anim': {
      const params = action.params as unknown as LegacyTriggerAnimParams
      const animCmd = params.action ?? 'play'
      const animPartId = params.partId ?? (params.partId === '' ? '全部' : '默认')
      // Try to find part name if possible, otherwise use ID
      // But here we rely on what's stored. 
      // Ideally we would look up part name but ID is acceptable for now.
      return `动画: ${animCmd} (${animPartId})`
    }
    default:
      return '未知动作'
  }
}


// 处理选中动作
function handleSelectAction(action: Action) {
  emit('selectAction', action)
}

// 处理悬停动作
function handleHoverAction(action: Action) {
  emit('hoverAction', action)
}

// 处理删除动作
function handleDeleteAction(action: Action, index: number) {
  // 发出请求确认事件，让父组件显示确认对话框
  emit('requestDeleteConfirm', action, index)
}
</script>

<style scoped>
.action-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.action-list-header {
  position: relative;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.add-action-btn {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background: #3b82f6;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-action-btn:hover {
  background: #2563eb;
}

.add-action-menu {
  position: absolute;
  top: 100%;
  left: 12px;
  right: 12px;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  font-size: 13px;
  background: white;
  border: none;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.action-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.action-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.action-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.action-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #6b7280;
}

.action-icon .duration-bar {
  width: 2px;
  height: 16px;
  background: currentColor;
  border-radius: 1px;
}

.action-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-time {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  font-family: 'Courier New', monospace;
}

.action-target {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.action-description {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: #9ca3af;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-btn:hover {
  color: #ef4444;
  background: #fef2f2;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: #9ca3af;
}

.empty-state p {
  margin: 0 0 8px 0;
}

.empty-state .hint {
  font-size: 12px;
  color: #d1d5db;
}
</style>

