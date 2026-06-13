<template>
  <div
    class="scene-container-header"
    :class="{ selected: isSelected }"
    @click="handleClick"
  >
    <div class="header-content">
      <!-- 展开/折叠图标 -->
      <span 
        class="toggle-icon" 
        :title="isExpanded ? '折叠' : '展开'"
      >
        {{ isExpanded ? '▼' : '▶' }}
      </span>
      
      <span class="scene-icon">🎬</span>
      <input
        v-model="localTitle"
        class="scene-title-input"
        placeholder="场景标题..."
        @blur="handleTitleBlur"
        @click.stop
      >
      
      <!-- 显示block数量 -->
      <span
        v-if="blockCount && blockCount > 0"
        class="block-count"
      >
        {{ blockCount }} 个块
      </span>
      
      <!-- 占位符,把按钮推到右侧 -->
      <div style="flex: 1;" />
      
      <!-- 上移/下移按钮组 -->
      <div class="move-buttons" @click.stop>
        <button
          class="btn-move"
          title="上移场景"
          :disabled="!canMoveUp"
          @click="$emit('move-up')"
        >
          ↑
        </button>
        <button
          class="btn-move"
          title="下移场景"
          :disabled="!canMoveDown"
          @click="$emit('move-down')"
        >
          ↓
        </button>
      </div>
      
      <button
        class="btn-preview"
        title="预览场景"
        @click.stop="handlePreviewScene"
      >
        ▶️ 预览场景
      </button>
      <button
        class="btn-setup"
        title="编辑场景初始状态"
        @click.stop="handleEnterSetupMode"
      >
        🏗️ 编辑场景初始状态
      </button>
      <button
        class="btn-delete"
        title="删除场景"
        @click.stop="$emit('delete')"
      >
        🗑️
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { SceneContainer } from '@/types/screenplay'

const props = defineProps<{
  scene: SceneContainer
  isSelected?: boolean
  isExpanded?: boolean
  blockCount?: number
  canMoveUp?: boolean
  canMoveDown?: boolean
}>()

const emit = defineEmits<{
  select: []
  delete: []
  'toggle-expand': []
  'enter-setup-mode': []
  'preview-scene': []
  'update-title': [title: string]
  'move-up': []
  'move-down': []
}>()

const localTitle = ref(props.scene.title)

watch(() => props.scene.title, (newTitle) => {
  localTitle.value = newTitle
})

function handleClick() {
  // 点击场景容器时，切换展开/折叠状态
  emit('toggle-expand')
  // 同时选中场景
  emit('select')
}

function handleTitleBlur() {
  if (localTitle.value !== props.scene.title) {
    emit('update-title', localTitle.value)
  }
}

function handleEnterSetupMode() {
  emit('enter-setup-mode')
}

function handlePreviewScene() {
  emit('preview-scene')
}
</script>

<style scoped>
.scene-container-header {
  background: #ffffff;
  /* 1. 修改默认边框为灰色 (从 #3b82f6 改为 #e5e7eb) */
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  /* 默认阴影可以淡一点 */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s;
}

.scene-container-header:hover {
  /* 悬停时稍微加深边框，提示可交互 */
  border-color: #9ca3af;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
}

.scene-container-header.selected {
  /* 2. 选中时变为蓝色边框 */
  border-color: #3b82f6;
  /* 3. 选中时添加浅蓝色背景，这一步最关键 */
  background-color: #eff6ff;
  /* 加强阴影 */
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.toggle-icon {
  width: 20px;
  height: 20px;
  font-size: 12px;
  color: #6b7280;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

.scene-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.scene-title-input {
  flex: 0.5;
  max-width: 200px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 14px;
  font-weight: 600;
  background: #f9fafb;
  transition: all 0.2s;
}

.block-count {
  padding: 4px 8px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  font-size: 12px;
  color: #1e40af;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.scene-title-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 上移/下移按钮组 */
.move-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-move {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #6b7280;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #ffffff;
  transition: all 0.2s;
  line-height: 1;
}

.btn-move:hover:not(:disabled) {
  background: #4b5563;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(107, 114, 128, 0.3);
}

.btn-move:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-preview {
  padding: 6px 12px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-preview:hover {
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
}

.btn-setup {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-setup:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.btn-delete {
  padding: 6px 10px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #dc2626;
  transform: translateY(-1px);
}
</style>
