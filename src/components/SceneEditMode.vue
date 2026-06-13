<!--
  SceneEditMode.vue - 路由分发组件
  
  职责：根据 mode 参数分发到对应的编辑器组件
  - mode='setup' -> SetupEditor.vue (场景初始状态编辑)
  - mode='action' -> ActionEditor.vue (导戏模式/动作编辑)
  
  架构优化说明：
  将原本2000+行的混合组件拆分为两个独立的编辑器组件：
  1. SetupEditor.vue - 只处理场景初始状态设置，没有时间轴、Ghosting、ActionEvaluator
  2. ActionEditor.vue - 处理动作编辑，包含Timeline、Ghosting、Playback等功能
  
  优势：
  - 心智负担降低：写 Setup 逻辑时不需要考虑是否影响 Action Mode
  - 代码瘦身：每个组件只加载自己需要的逻辑
  - 状态管理清晰：Setup 修改 Scene Object，Action 修改 Script Block
-->
<template>
  <SetupEditor 
    v-if="mode === 'setup' && sceneId" 
    :episode="episode"
    :scene-id="sceneId"
    @exit-scene-edit="handleExitSceneEdit"
    @save-setup="handleSaveSetup"
  />
  <ActionEditor 
    v-else-if="mode === 'action' && sceneId && blockId" 
    :key="`action-${sceneId}-${blockId}`"
    :episode="episode"
    :scene-id="sceneId"
    :block-id="blockId"
    @exit-scene-edit="handleExitSceneEdit"
  />
  <div
    v-else
    class="loading-placeholder"
  >
    <span>正在加载...</span>
  </div>
</template>

<script setup lang="ts">
import type { Episode } from '@/stores/episodeStore'
import type { SceneSetup } from '@/types/screenplay'

import ActionEditor from './ActionEditor.vue'
import SetupEditor from './SetupEditor.vue'

defineProps<{
  episode: Episode | undefined
  editLine?: number
  mode?: 'setup' | 'action'
  sceneId?: string | null
  blockId?: string | null
}>()

const emit = defineEmits<{
  exitSceneEdit: []
  saveSetup: [sceneId: string, setup: SceneSetup]
}>()

/**
 * 处理退出场景编辑
 */
function handleExitSceneEdit() {
  emit('exitSceneEdit')
}

/**
 * 处理保存Setup（转发事件）
 */
function handleSaveSetup(sceneId: string, setup: SceneSetup) {
  emit('saveSetup', sceneId, setup)
}
</script>

<style scoped>
.loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  color: #888;
  font-size: 14px;
}
</style>
