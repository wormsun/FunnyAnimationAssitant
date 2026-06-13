<template>
  <div
    class="dialogue-block"
    :class="{ selected: isSelected }"
    @click="handleClick"
  >
    <!-- 第一行：控制行 -->
    <div class="control-row">
      <!-- 人物标签 -->
      <div class="dialogue-header">
        <span class="dialogue-icon">👤</span>
        <span class="dialogue-title">人物</span>
      </div>

      <!-- 头像/角色名 -->
      <button
        class="actor-selector"
        @click.stop="$emit('selectActor')"
      >
        <span class="actor-avatar">🧑</span>
        <span class="actor-name">{{ actorName }}</span>
      </button>

      <!-- 占位符,把场景编辑按钮推到右侧 -->
      <div style="flex: 1;" />

      <!-- 编排动作按钮 -->
      <button 
        class="btn-action-mode" 
        :class="{ active: block.actions.length > 0 }"
        title="编排动作"
        @click.stop="$emit('enter-action-mode')"
      >
        🎬 编排动作
      </button>

      <!-- 删除按钮 -->
      <button 
        class="btn-delete" 
        title="删除" 
        @click.stop="$emit('delete')"
      >
        🗑️
      </button>
    </div>

    <!-- 第二行：文本行 -->
    <textarea
      v-model="localText"
      class="text-area full-width"
      placeholder="输入台词内容..."
      rows="2"
      @input="handleTextInput"
      @click.stop
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { DialogueBlock } from '@/types/screenplay'

const props = defineProps<{
  block: DialogueBlock
  isSelected: boolean
  actorName?: string // 演员显示名称
  characterId?: string // 人物ID
}>()

const emit = defineEmits<{
  select: []
  delete: []
  update: [updates: Partial<DialogueBlock>]
  selectActor: []
  'enter-action-mode': []
}>()

// 本地状态
const localText = ref(props.block.text)

// 监听 block 变化,同步本地状态
watch(() => props.block, (newBlock) => {
  localText.value = newBlock.text
}, { deep: true })

function handleClick() {
  emit('select')
}

function handleTextInput() {
  emit('update', { text: localText.value })
}
</script>

<style scoped>
.dialogue-block {
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.dialogue-block:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
}

.dialogue-block.selected {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 第一行：控制行 */
.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.dialogue-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dialogue-icon {
  font-size: 18px;
}

.dialogue-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.actor-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.actor-selector:hover {
  background: #e5e7eb;
}

.actor-avatar {
  font-size: 18px;
}

.actor-name {
  color: #1f2937;
}

.btn-action-mode {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action-mode:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.btn-action-mode.active {
  background: #1d4ed8;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.btn-delete {
  padding: 6px 10px;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin-left: auto;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #fecaca;
}

/* 第二行：文本行 */
.text-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.text-area {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  margin-bottom: 8px;
}

.text-area.full-width {
  box-sizing: border-box;
}

.text-area:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.speed-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.speed-input {
  width: 50px;
  padding: 4px 6px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  text-align: center;
}

.speed-unit {
  font-size: 12px;
  color: #9ca3af;
}

</style>
