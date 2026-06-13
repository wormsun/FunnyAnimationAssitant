<template>
  <div
    class="narration-block"
    :class="{ selected: isSelected }"
    @click="handleClick"
  >
    <!-- 第一行：控制行 -->
    <div class="control-row">
      <!-- 旁白图标和标题 -->
      <div class="narration-header">
        <span class="narration-icon">📢</span>
        <span class="narration-title">旁白</span>
      </div>

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
      placeholder="输入旁白内容..."
      rows="2"
      @input="handleTextInput"
      @click.stop
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { NarrationBlock } from '@/types/screenplay'

const props = defineProps<{
  block: NarrationBlock
  isSelected: boolean
}>()

const emit = defineEmits<{
  select: []
  delete: []
  update: [updates: Partial<NarrationBlock>]
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
.narration-block {
  background: #fefce8;
  border: 2px solid #fde047;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.narration-block:hover {
  border-color: #facc15;
  box-shadow: 0 2px 8px rgba(250, 204, 21, 0.2);
}

.narration-block.selected {
  border-color: #eab308;
  background: #fef9c3;
  box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.1);
}

/* 第一行：控制行 */
.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.narration-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.narration-icon {
  font-size: 20px;
}

.narration-title {
  font-size: 15px;
  font-weight: 600;
  color: #713f12;
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
  border: 1px solid #fde047;
  border-radius: 6px;
  background: white;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.text-area:focus {
  outline: none;
  border-color: #eab308;
  box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.1);
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #fffbeb;
  border: 1px solid #fde047;
  border-radius: 6px;
}

.speed-label {
  font-size: 12px;
  color: #92400e;
  white-space: nowrap;
}

.speed-input {
  width: 50px;
  padding: 4px 6px;
  font-size: 13px;
  border: 1px solid #fde047;
  border-radius: 4px;
  text-align: center;
}

.speed-unit {
  font-size: 12px;
  color: #a16207;
}

</style>
