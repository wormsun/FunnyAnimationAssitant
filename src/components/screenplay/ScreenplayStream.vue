<template>
  <div class="screenplay-stream">
    <!-- 嵌入式工具栏 -->
    <div class="embedded-toolbar">
      <!-- 左侧：返回按钮 + 动画名称 -->
      <div class="toolbar-left">
        <button
          class="toolbar-btn back-btn"
          title="返回剧集列表"
          @click="$emit('back')"
        >
          ← 返回剧集列表
        </button>
        
        <div class="toolbar-divider" />
        
        <div class="episode-name-editor">
          <label class="name-label">动画名称:</label>
          <input 
            type="text" 
            :value="episodeName" 
            class="name-input"
            placeholder="请输入动画名称"
            @input="$emit('update:episode-name', ($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>
      
      <!-- 中间：添加按钮组 -->
      <div class="toolbar-center">
        <div class="add-button-wrapper">
          <button
            class="toolbar-btn"
            title="添加内容"
            @click="showAddMenu"
          >
            ➕ 添加
          </button>
          <!-- 添加菜单 -->
          <div
            v-if="addMenuVisible"
            class="add-menu"
            @click.stop
          >
            <button
              class="menu-item"
              @click="handleAddMenuItem('scene')"
            >
              🎬 场景
            </button>
            <button 
              class="menu-item" 
              :disabled="!hasAnyScene"
              :class="{ disabled: !hasAnyScene }"
              @click="handleAddMenuItem('dialogue')"
            >
              💬 对话
            </button>
            <button 
              class="menu-item" 
              :disabled="!hasAnyScene"
              :class="{ disabled: !hasAnyScene }"
              @click="handleAddMenuItem('narration')"
            >
              📢 旁白
            </button>
          </div>
        </div>
        
        <div class="toolbar-divider" />
        
        <button
          class="toolbar-btn"
          title="旁白配置"
          @click="$emit('edit-narrator')"
        >
          🎙️ 旁白配置
        </button>
        <button
          class="toolbar-btn"
          title="演员管理"
          @click="$emit('manage-actors')"
        >
          👥 演员管理
        </button>
        <button
          class="toolbar-btn"
          title="配乐管理"
          @click="$emit('manage-bgm')"
        >
          🎵 配乐管理
        </button>
      </div>
      
      <!-- 右侧：操作按钮 -->
      <div class="toolbar-right">
        <button
          class="toolbar-btn"
          title="保存 (Ctrl+S)"
          @click="$emit('save')"
        >
          💾 保存
        </button>
        <button
          class="toolbar-btn btn-preview"
          title="预览"
          @click="$emit('preview')"
        >
          ▶️ 预览
        </button>
        <button
          class="toolbar-btn btn-primary"
          title="导出"
          @click="$emit('export')"
        >
          📤 导出
        </button>
      </div>
    </div>
    
    <!-- 场景容器列表 -->
    <div
      ref="containerRef"
      class="scenes-container"
    >
      <div
        v-if="scenes.length === 0"
        class="empty-state"
      >
        <p class="empty-icon">
          📝
        </p>
        <p class="empty-text">
          暂无剧本内容
        </p>
        <p class="empty-hint">
          点击工具栏按钮添加场景
        </p>
      </div>

      <template
        v-for="(scene, sceneIndex) in scenes"
        :key="scene.id"
      >
        <!-- 场景容器头部 -->
        <div :data-scene-id="scene.id">
          <SceneContainerHeader
            :scene="scene"
            :is-selected="isSceneSelected(scene.id)"
            :is-expanded="isSceneExpanded(scene.id)"
            :block-count="scene.script.length"
            :can-move-up="sceneIndex > 0"
            :can-move-down="sceneIndex < scenes.length - 1"
            @select="handleSelectScene(scene.id)"
            @delete="handleDeleteScene(scene.id)"
            @toggle-expand="toggleSceneExpanded(scene.id)"
            @enter-setup-mode="handleEnterSetupMode(scene.id)"
            @preview-scene="handlePreviewScene(scene.id)"
            @update-title="handleUpdateSceneTitle(scene.id, $event)"
            @move-up="handleMoveScene(scene.id, 'up')"
            @move-down="handleMoveScene(scene.id, 'down')"
          />
        </div>

        <!-- 场景容器下方的+按钮及菜单 (仅在选中且展开时显示) -->
        <div
          v-if="selectedSceneId === scene.id && isSceneExpanded(scene.id)"
          class="insert-button-wrapper bottom"
        >
          <button
            class="btn-insert"
            @click.stop="showSceneAddMenu(scene.id, $event)"
          >
            ➕
          </button>
          <!-- 场景级添加菜单（包含场景选项） -->
          <div
            v-if="sceneAddMenuVisible === scene.id"
            class="insert-menu scene-menu"
            @click.stop
          >
            <button
              class="menu-item"
              @click="handleSceneAddMenuItem(scene.id, 'scene')"
            >
              🎬 场景
            </button>
            <button
              class="menu-item"
              @click="handleSceneAddMenuItem(scene.id, 'dialogue')"
            >
              💬 对话
            </button>
            <button
              class="menu-item"
              @click="handleSceneAddMenuItem(scene.id, 'narration')"
            >
              📢 旁白
            </button>
          </div>
        </div>

        <!-- 脚本块列表（仅在展开时显示） -->
        <template v-if="isSceneExpanded(scene.id)">
          <template
            v-for="block in scene.script"
            :key="block.id"
          >
            <!-- Block上方的+按钮 (仅在选中时显示) -->
            <div
              v-if="selectedBlockId === block.id"
              class="insert-button-wrapper top"
            >
              <button
                class="btn-insert"
                @click.stop="showInsertMenu(scene.id, block.id, 'before', $event)"
              >
                ➕
              </button>
            </div>

            <!-- Block组件 -->
            <div
              class="block-container"
              :data-block-id="block.id"
            >
              <component
                :is="getBlockComponent(block.type)"
                :block="block"
                :is-selected="selectedBlockId === block.id"
                :actor-name="getActorName(block, scene)"
                :character-id="getCharacterId(block, scene)"
                @select="handleSelectBlock(block.id)"
                @delete="handleDeleteBlock(scene.id, block.id)"
                @update="handleUpdateBlock(scene.id, block.id, $event)"
                @select-actor="handleSelectActor(scene.id, block.id)"
                @select-state="handleSelectState(scene.id, block.id)"
                @select-expression="handleSelectExpression(scene.id, block.id)"
                @enter-action-mode="handleEnterActionMode(scene.id, block.id)"
              />
            </div>

            <!-- Block下方的+按钮 (仅在选中时显示) -->
            <div
              v-if="selectedBlockId === block.id"
              class="insert-button-wrapper bottom"
            >
              <button
                class="btn-insert"
                @click.stop="showInsertMenu(scene.id, block.id, 'after', $event)"
              >
                ➕
              </button>
            </div>
          </template>
        </template>

        <!-- 场景之间的分隔 -->
        <div
          v-if="sceneIndex < scenes.length - 1"
          class="scene-divider"
        />
      </template>

      <!-- 底部半屏空白 -->
      <div class="bottom-spacer" />
    </div>

    <!-- 插入菜单（block级别，不包含场景选项）-->
    <div 
      v-if="insertMenuVisible" 
      class="insert-menu" 
      :style="{ top: insertMenuPosition.y + 'px', left: insertMenuPosition.x + 'px' }"
      @click.stop
    >
      <button
        class="menu-item"
        @click="handleInsertBlock('dialogue')"
      >
        💬 对话
      </button>
      <button
        class="menu-item"
        @click="handleInsertBlock('narration')"
      >
        📢 旁白
      </button>
    </div>

    <!-- 点击其他地方关闭菜单 -->
    <div
      v-if="insertMenuVisible"
      class="menu-overlay"
      @click="insertMenuVisible = false"
    />
    <div
      v-if="addMenuVisible"
      class="menu-overlay"
      @click="addMenuVisible = false"
    />
    <div
      v-if="sceneAddMenuVisible !== null"
      class="menu-overlay"
      @click="sceneAddMenuVisible = null"
    />

    <!-- 新建场景对话框 -->
    <SceneCreationDialog
      v-if="sceneCreationState.visible"
      :scenes="scenes"
      v-bind="sceneCreationState.defaultSourceId ? { 'default-source-id': sceneCreationState.defaultSourceId } : {}"
      @close="sceneCreationState.visible = false"
      @confirm="handleConfirmCreateScene"
    />

    <!-- 删除场景确认对话框 -->
    <ConfirmDialog
      v-if="deleteSceneConfirm.visible"
      title="删除场景"
      :message="deleteSceneConfirm.message"
      confirm-text="删除"
      :is-danger="true"
      @confirm="confirmDeleteScene"
      @cancel="deleteSceneConfirm.visible = false"
    />

    <!-- 删除 Block 确认对话框 -->
    <ConfirmDialog
      v-if="deleteBlockConfirm.visible"
      title="删除确认"
      message="确定要删除这个 Block 吗?"
      confirm-text="删除"
      :is-danger="true"
      @confirm="confirmDeleteBlock"
      @cancel="deleteBlockConfirm.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick,onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { CAMERA_BASE_HEIGHT,CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
// v6.0: 使用 episodeStore 和 projectStore 替代 screenplayStore
import { useEpisodeStore } from '@/stores/episodeStore'
import type { Action, SceneContainer, SceneSetup, ScriptBlock, ScriptBlockType } from '@/types/screenplay'
import { createInheritedSetup } from '@/utils/sceneStateCalculator'
import { generateId } from '@/utils/uuid'

import DialogueBlock from './DialogueBlock.vue'
import NarrationBlock from './NarrationBlock.vue'
import SceneContainerHeader from './SceneContainerHeader.vue'
import SceneCreationDialog from './SceneCreationDialog.vue'

// Props
defineProps<{
  episodeName?: string
}>()

const emit = defineEmits<{
  back: []
  'update:episode-name': [value: string]
  'edit-narrator': []
  'manage-actors': []
  'manage-bgm': []
  save: []
  preview: []
  export: []
  'select-actor': [sceneId: string, blockId: string]
  'select-state': [sceneId: string, blockId: string]
  'select-expression': [sceneId: string, blockId: string]
  'edit-setup': [sceneId: string, blockId: string]
  'enter-setup-mode': [sceneId: string]
  'enter-action-mode': [sceneId: string, blockId: string]
  'preview-scene': [sceneId: string]
}>()

// v6.0: 使用新的 store
const route = useRoute()
const episodeStore = useEpisodeStore()
const episodeId = route.params['episodeId'] as string

const containerRef = ref<HTMLElement>()

// 场景折叠状态
const sceneExpandedMap = ref<Record<string, boolean>>({})

// v6.0: 从当前 episode 获取数据
const currentEpisode = computed(() => episodeStore.getEpisode(episodeId))
const scenes = computed(() => currentEpisode.value?.scenes || [])
const selectedBlockId = ref<string | null>(null)
const selectedSceneId = ref<string | null>(null)

// 判断是否有任何场景（只要有场景就可以添加对话、旁白、演出）
const hasAnyScene = computed(() => {
  return scenes.value.length > 0
})

// 判断场景是否应该显示为选中状态
// 规则：只有当场景被选中，且该场景内没有任何子 Block 被选中时，才显示为选中
function isSceneSelected(sceneId: string): boolean {
  // 如果场景本身没有被选中，直接返回 false
  if (selectedSceneId.value !== sceneId) {
    return false
  }
  
  // 如果场景被选中，但该场景内有子 Block 被选中，则不显示为选中
  const scene = scenes.value.find((s) => s.id === sceneId)
  if (scene && selectedBlockId.value) {
    const hasSelectedBlock = scene.script.some((block) => block.id === selectedBlockId.value)
    if (hasSelectedBlock) {
      return false
    }
  }
  
  return true
}

// 获取 Block 组件
function getBlockComponent(type: ScriptBlockType) {
  switch (type) {
    case 'dialogue':
      return DialogueBlock
    case 'narration':
      return NarrationBlock
    default:
      return 'div'
  }
}

// v7.0: 获取角色实例名称（从场景对象中获取 alias）
function getActorName(block: ScriptBlock, scene: SceneContainer): string | undefined {
  if (block.type === 'dialogue') {
    // v7.0: 从场景对象中查找实例
    const instance = scene?.setup?.objects?.find((obj) => obj.id === block.instanceId)
    if (instance) {
      return instance.alias || '未命名'
    }
    return '选择演员实例'
  }
  return undefined
}

// v7.0: 获取角色实例对应的人物ID
function getCharacterId(block: ScriptBlock, scene: SceneContainer): string | undefined {
  if (block.type === 'dialogue') {
    // v7.0: 从场景对象中查找实例
    const instance = scene?.setup?.objects?.find((obj) => obj.id === block.instanceId)
    return instance?.refId
  }
  return undefined
}

// 切换场景展开/折叠状态
function toggleSceneExpanded(sceneId: string) {
  sceneExpandedMap.value[sceneId] = !sceneExpandedMap.value[sceneId]
}

// 获取场景展开状态（默认展开）
function isSceneExpanded(sceneId: string): boolean {
  return sceneExpandedMap.value[sceneId] !== false
}

// 选中场景
function handleSelectScene(sceneId: string) {
  // v6.0: 直接修改 ref
  const scene = scenes.value.find((s) => s.id === sceneId)
  if (scene && selectedBlockId.value) {
    const hasSelectedBlock = scene.script.some((block) => block.id === selectedBlockId.value)
    if (hasSelectedBlock) {
      selectedBlockId.value = null
    }
  }
  
  selectedSceneId.value = sceneId
}

// 删除场景确认对话框状态
const deleteSceneConfirm = ref<{
  visible: boolean
  sceneId: string
  message: string
}>({
  visible: false,
  sceneId: '',
  message: ''
})

// 删除场景
function handleDeleteScene(sceneId: string) {
  // v6.0: 从 episodes 查找场景
  const scene = scenes.value.find((s) => s.id === sceneId)
  if (!scene) return
  
  // 构建提示信息
  let message = `确定要删除场景「${scene.title}」吗？`
  
  if (scene.script.length > 0) {
    const blockCounts = {
      dialogue: 0,
      narration: 0,
      action: 0
    }
    
    scene.script.forEach((block: ScriptBlock) => {
      if (block.type in blockCounts) {
        blockCounts[block.type]++
      }
    })
    
    const parts: string[] = []
    if (blockCounts.dialogue > 0) parts.push(`${blockCounts.dialogue}个对话块`)
    if (blockCounts.narration > 0) parts.push(`${blockCounts.narration}个旁白块`)
    if (blockCounts.action > 0) parts.push(`${blockCounts.action}个演出块`)
    
    message += `\n\n该场景包含：${parts.join('、')}\n删除后将无法恢复！`
  }
  
  deleteSceneConfirm.value = {
    visible: true,
    sceneId,
    message
  }
}

// 确认删除场景
function confirmDeleteScene() {
  const { sceneId } = deleteSceneConfirm.value
  episodeStore.deleteScene(episodeId, sceneId)
  deleteSceneConfirm.value.visible = false
}

// 更新场景标题
function handleUpdateSceneTitle(sceneId: string, title: string) {
  // v6.0: 使用 episodeStore 更新场景
  episodeStore.updateScene(episodeId, sceneId, { title })
}

// 移动场景顺序（上移/下移）
function handleMoveScene(sceneId: string, direction: 'up' | 'down') {
  episodeStore.moveScene(episodeId, sceneId, direction)
}

// 进入 Setup Mode - v6.10: 使用 Overlay 模式，组件不会被卸载，无需保存状态
function handleEnterSetupMode(sceneId: string) {
  emit('enter-setup-mode', sceneId)
}

// 进入 Action Mode - v6.10: 使用 Overlay 模式，组件不会被卸载，无需保存状态
function handleEnterActionMode(sceneId: string, blockId: string) {
  emit('enter-action-mode', sceneId, blockId)
}

// 预览场景
function handlePreviewScene(sceneId: string) {
  emit('preview-scene', sceneId)
}

// 选中 Block
function handleSelectBlock(blockId: string) {
  // v6.0: 直接修改 ref
  selectedBlockId.value = blockId
  
  if (selectedSceneId.value) {
    selectedSceneId.value = null
  }
}

// 删除 Block 确认对话框状态
const deleteBlockConfirm = ref<{
  visible: boolean
  sceneId: string
  blockId: string
}>({
  visible: false,
  sceneId: '',
  blockId: ''
})

// 删除 Block
function handleDeleteBlock(sceneId: string, blockId: string) {
  deleteBlockConfirm.value = {
    visible: true,
    sceneId,
    blockId
  }
}

// 确认删除 Block
function confirmDeleteBlock() {
  const { sceneId, blockId } = deleteBlockConfirm.value
  episodeStore.deleteBlockFromScene(episodeId, sceneId, blockId)
  deleteBlockConfirm.value.visible = false
}

// 更新 Block
function handleUpdateBlock(sceneId: string, blockId: string, updates: Partial<ScriptBlock>) {
  // v6.0: 使用 episodeStore 更新 block
  episodeStore.updateBlockInScene(episodeId, sceneId, blockId, updates)
}

// 显示添加菜单
function showAddMenu() {
  addMenuVisible.value = !addMenuVisible.value
}

// 显示场景级添加菜单
function showSceneAddMenu(sceneId: string, event: MouseEvent) {
  event.stopPropagation()
  // 切换菜单状态
  sceneAddMenuVisible.value = sceneAddMenuVisible.value === sceneId ? null : sceneId
}

// 处理场景级添加菜单项点击
function handleSceneAddMenuItem(sceneId: string, type: 'scene' | 'dialogue' | 'narration' | 'action') {
  sceneAddMenuVisible.value = null
  
  if (type === 'scene') {
    // 在当前场景之后插入新场景
    selectedSceneId.value = null
    selectedBlockId.value = null
    
    // 查找当前场景索引
    const currentSceneIndex = scenes.value.findIndex(s => s.id === sceneId)
    
    // 打开新建场景弹窗
    sceneCreationState.value = {
      visible: true,
      insertIndex: currentSceneIndex !== -1 ? currentSceneIndex + 1 : -1,
      defaultSourceId: sceneId
    }
  } else {
    // 在场景开头添加 block
    const scene = scenes.value.find((s) => s.id === sceneId)
    if (!scene) return

    let newBlock: ScriptBlock | undefined
    switch (type) {
      case 'dialogue': {
        newBlock = {
          id: generateId(),
          type: 'dialogue' as const,
          instanceId: '',  // 留空，等用户手动选择演员实例
          text: '',
          actions: [] as Action[]
        }
        break
      }
      case 'narration':
        newBlock = {
          id: generateId('block'),
          type: 'narration' as const,
          text: '',
          actions: [] as Action[]
        }
        break
      case 'action':
        newBlock = {
          id: generateId('block'),
          type: 'action' as const,
          duration: 2000,
          actions: [] as Action[]
        }
        break
    }
    
    if (newBlock) {
      episodeStore.addBlockToScene(episodeId, sceneId, newBlock)
      sceneExpandedMap.value[sceneId] = true
      selectedSceneId.value = null
      selectedBlockId.value = null
      selectedBlockId.value = newBlock.id
      void nextTick(() => {
        void scrollToBlock(newBlock.id)
      })
    }
  }
}

// 处理添加菜单项点击
function handleAddMenuItem(type: 'scene' | 'dialogue' | 'narration' | 'action') {
  addMenuVisible.value = false
  
  if (type === 'scene') {
    handleAddScene()
  } else if (type === 'dialogue') {
    handleAddDialogue()
  } else if (type === 'narration') {
    handleAddNarration()
  } else if (type === 'action') {
    handleAddAction()
  }
}

// v6.0: 创建场景辅助函数
function createEmptySetup(): SceneSetup {
  return {
    camera: {
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: CAMERA_BASE_WIDTH,
      height: CAMERA_BASE_HEIGHT,
      zoom: 1.0
    },
    objects: [],
    renderChain: [],
  }
}

function createScene(title?: string, setup?: SceneSetup): SceneContainer {
  // 如果有传入 setup 则复制，否则创建空的
  const newSetup = setup ? JSON.parse(JSON.stringify(setup)) as SceneSetup : createEmptySetup()
  
  return {
    id: generateId('scene'),
    type: 'scene_container',
    title: title || `场景 ${scenes.value.length + 1}`,
    setup: newSetup,
    script: []
  }
}

// 确认创建场景
async function handleConfirmCreateScene(payload: { mode: 'copy' | 'empty' | 'inherit', sourceId?: string }) {
  sceneCreationState.value.visible = false
  
  let setup: SceneSetup | undefined
  
  if (payload.mode === 'copy' && payload.sourceId) {
    const sourceScene = scenes.value.find(s => s.id === payload.sourceId)
    if (sourceScene) {
      setup = sourceScene.setup
    }
  } else if (payload.mode === 'inherit' && payload.sourceId) {
    const sourceScene = scenes.value.find(s => s.id === payload.sourceId)
    if (sourceScene) {
      setup = createInheritedSetup(sourceScene)
    }
  }
  
  const newScene = createScene(undefined, setup)
  
  if (sceneCreationState.value.insertIndex !== -1) {
    // 插入到指定位置
    episodeStore.insertScene(episodeId, newScene, sceneCreationState.value.insertIndex)
  } else {
    // 添加到末尾
    episodeStore.addScene(episodeId, newScene)
  }
  
  selectedSceneId.value = newScene.id
  sceneExpandedMap.value[newScene.id] = true
  
  await nextTick()
  setTimeout(() => {
    if (containerRef.value) {
      const sceneElement = containerRef.value.querySelector(`[data-scene-id="${newScene.id}"]`)!
      if (sceneElement) {
        sceneElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      } else {
        containerRef.value?.scrollTo({ top: containerRef.value.scrollHeight, behavior: 'smooth' })
      }
    }
  }, 100)
}

// 添加场景（点击底部添加按钮）
function handleAddScene() {
  selectedSceneId.value = null
  selectedBlockId.value = null
  
  // 默认复制最后一个场景
  const lastScene = scenes.value.length > 0 ? scenes.value[scenes.value.length - 1] : undefined
  
  sceneCreationState.value = {
    visible: true,
    insertIndex: -1, // append
    ...(lastScene?.id ? { defaultSourceId: lastScene.id } : {})
  }
}

// 添加对话块到最后一个场景
function handleAddDialogue() {
  if (scenes.value.length === 0) {
    handleAddScene()
    return
  }
  const lastScene = scenes.value[scenes.value.length - 1]
  if (!lastScene) return
  selectedSceneId.value = null
  selectedBlockId.value = null
  const newBlock = {
    id: generateId('block'),
    type: 'dialogue' as const,
    instanceId: '',  // 留空，等用户手动选择演员实例
    text: '',
    actions: [] as Action[]
  }
  episodeStore.addBlockToScene(episodeId, lastScene.id, newBlock)
  selectedBlockId.value = newBlock.id
  void scrollToBottom()
}

// 添加旁白块到最后一个场景
function handleAddNarration() {
  if (scenes.value.length === 0) {
    handleAddScene()
    return
  }
  const lastScene = scenes.value[scenes.value.length - 1]
  if (!lastScene) return
  selectedSceneId.value = null
  selectedBlockId.value = null
  const newBlock = {
    id: generateId('block'),
    type: 'narration' as const,
    text: '',
    actions: [] as Action[]
  }
  episodeStore.addBlockToScene(episodeId, lastScene.id, newBlock)
  selectedBlockId.value = newBlock.id
  void scrollToBottom()
}

// 添加演出块
function handleAddAction() {
  if (scenes.value.length === 0) {
    handleAddScene()
    return
  }
  const lastScene = scenes.value[scenes.value.length - 1]
  if (!lastScene) return
  selectedSceneId.value = null
  selectedBlockId.value = null
  const newBlock = {
    id: generateId('block'),
    type: 'action' as const,
    duration: 2000,
    actions: [] as Action[]
  }
  episodeStore.addBlockToScene(episodeId, lastScene.id, newBlock)
  selectedBlockId.value = newBlock.id
  void scrollToBottom()
}

// 选择演员
function handleSelectActor(sceneId: string, blockId: string) {
  emit('select-actor', sceneId, blockId)
}

// 选择状态
function handleSelectState(sceneId: string, blockId: string) {
  emit('select-state', sceneId, blockId)
}

// 选择表情
function handleSelectExpression(sceneId: string, blockId: string) {
  emit('select-expression', sceneId, blockId)
}

// 工具栏添加菜单状态
const addMenuVisible = ref(false)

// 场景级添加菜单状态（记录当前显示菜单的场景ID）
const sceneAddMenuVisible = ref<string | null>(null)

// 插入菜单状态
const insertMenuVisible = ref(false)
const insertMenuPosition = ref({ x: 0, y: 0 })
const insertMenuContext = ref<{ sceneId: string; blockId: string; position: 'before' | 'after' } | null>(null)

// 新建场景弹窗状态
const sceneCreationState = ref<{
  visible: boolean
  insertIndex: number // -1 表示添加到末尾
  defaultSourceId?: string
}>({
  visible: false,
  insertIndex: -1
})

// 显示插入菜单（block级别）
function showInsertMenu(sceneId: string, blockId: string, position: 'before' | 'after', event: MouseEvent) {
  const button = event.target as HTMLElement
  const rect = button.getBoundingClientRect()
  insertMenuPosition.value = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height + 5
  }
  insertMenuContext.value = { sceneId, blockId, position }
  insertMenuVisible.value = true
}

// 处理插入block（仅处理 block 级别的插入）
function handleInsertBlock(type: 'dialogue' | 'narration' | 'action') {
  if (!insertMenuContext.value) return

  const { sceneId, blockId, position } = insertMenuContext.value
  const scene = scenes.value.find((s) => s.id === sceneId)
  if (!scene) return

  const blockIndex = scene.script.findIndex((b) => b.id === blockId)
  if (blockIndex === -1) return

  const insertIndex = position === 'before' ? blockIndex : blockIndex + 1

  let newBlock: ScriptBlock
  switch (type) {
    case 'dialogue': {
      newBlock = {
        id: generateId('block'),
        type: 'dialogue',
        instanceId: '',  // 留空，等用户手动选择演员实例
        text: '',
        actions: []
      }
      break
    }
    case 'narration':
      newBlock = {
        id: generateId('block'),
        type: 'narration',
        text: '',
        actions: []
      }
      break
    case 'action':
      newBlock = {
        id: generateId('block'),
        type: 'action',
        duration: 2000,
        actions: [] as Action[]
      }
      break
  }

  if (newBlock) {
    scene.script.splice(insertIndex, 0, newBlock)
    sceneExpandedMap.value[sceneId] = true
    selectedSceneId.value = null
    selectedBlockId.value = null
    selectedBlockId.value = newBlock.id
    void nextTick(() => {
      void scrollToBlock(newBlock.id)
    })
  }

  insertMenuVisible.value = false
  insertMenuContext.value = null
}

function handleKeyDown(event: KeyboardEvent) {
  // 如果在输入框中,不处理快捷键
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault()
    if (scenes.value.length === 0) {
      handleAddScene()
      return
    }
    const lastScene = scenes.value[scenes.value.length - 1]
    if (!lastScene) return
    // v7.0: 使用场景中的第一个对象实例
    const firstInstance = lastScene.setup?.objects?.[0]
    if (!firstInstance) {
      alert('场景中没有对象，请先在Setup模式中添加对象')
      return
    }
    selectedSceneId.value = null
    selectedBlockId.value = null
    const newBlock = {
      id: generateId('block'),
      type: 'dialogue' as const,
      instanceId: firstInstance.id,  // v7.0: 使用实例ID
      text: '',
      actions: [] as Action[]
    }
    episodeStore.addBlockToScene(episodeId, lastScene.id, newBlock)
    selectedBlockId.value = newBlock.id
    void scrollToBottom()
  }
  
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    event.preventDefault()
    if (scenes.value.length === 0) {
      handleAddScene()
      return
    }
    const lastScene = scenes.value[scenes.value.length - 1]
    if (!lastScene) return
    selectedSceneId.value = null
    selectedBlockId.value = null
    const newBlock = {
      id: generateId('block'),
      type: 'narration' as const,
      text: '',
      actions: [] as Action[]
    }
    episodeStore.addBlockToScene(episodeId, lastScene.id, newBlock)
    selectedBlockId.value = newBlock.id
    void scrollToBottom()
  }
  
  // Shift+Enter: 添加演出块
  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault()
    handleAddAction()
  }
  
  if (event.key === 'Delete' && selectedBlockId.value) {
    event.preventDefault()
    for (const scene of scenes.value) {
      const block = scene.script.find((b) => b.id === selectedBlockId.value)
      if (block) {
        handleDeleteBlock(scene.id, block.id)
        break
      }
    }
  }
}

onMounted(() => {
  // console.log('[ScreenplayStream] onMounted, episodeId:', episodeId)
  document.addEventListener('keydown', handleKeyDown)
  // v6.10: 使用 Overlay 模式后，组件不会被卸载，无需恢复状态
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
})



async function scrollToBlock(blockId: string) {
  const scene = scenes.value.find((s) => s.script.some((b) => b.id === blockId))
  if (scene) {
    sceneExpandedMap.value[scene.id] = true
  }
  
  // 2. 等待 Vue 渲染 DOM
  await nextTick()
  
  // 3. 查找 DOM 元素
  if (!containerRef.value) {
    console.warn('scrollToBlock: containerRef is null')
    return
  }
  
  // 使用更稳健的查找逻辑，配合简单的延时重试
  // 减少等待时间，提升响应感，但增加检查频次
  const findElement = () => containerRef.value?.querySelector(`[data-block-id="${blockId}"]`)
  
  let blockElement = findElement()
  let attempts = 0
  
  // 如果找不到，尝试轮询几次（解决异步渲染延迟）
  while (!blockElement && attempts < 5) {
    await new Promise(resolve => setTimeout(resolve, 50)) // 50ms 检查一次
    blockElement = findElement()
    attempts++
  }
  
  if (blockElement) {
    // ✅ 核心修改：使用原生 API，且 block: 'center' 确保新元素在视野中间或可见
    blockElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',  // 垂直方向居中
      inline: 'nearest' 
    })
    
    // 给一点高亮反馈（可选，提升体验）
    blockElement.classList.add('highlight-flash')
    setTimeout(() => blockElement.classList.remove('highlight-flash'), 1000)
  } else {
    // 兜底方案：如果实在找不到元素（极其罕见），则滚动到底部
    console.warn(`scrollToBlock: element not found for ${blockId}, falling back to bottom`)
    containerRef.value.scrollTo({
      top: containerRef.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

// 滚动到最后一个内容
async function scrollToBottom() {
  // 1. 找到最后一个场景
  if (scenes.value.length === 0) return
  const lastScene = scenes.value[scenes.value.length - 1]
  if (!lastScene) return
  
  // 2. 确保最后一个场景展开
  sceneExpandedMap.value[lastScene.id] = true
  
  await nextTick()

  // 3. 判断最后场景是否有 Block
  if (lastScene.script.length > 0) {
    // 如果有 Block，滚动到最后一个 Block
    const lastBlock = lastScene.script[lastScene.script.length - 1]
    if (lastBlock) {
      await scrollToBlock(lastBlock.id)
    }
  } else {
    // 如果没有 Block (空场景)，滚动到场景头部
    // 我们可以给 SceneContainerHeader 加一个 id 或者 data 属性来定位
    // 这里使用兜底的 scrollHeight，但在 nextTick 后通常是准的
    setTimeout(() => {
      if (containerRef.value) {
        containerRef.value.scrollTo({
          top: containerRef.value.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 100)
  }
}

// 暴露给父组件调用
defineExpose({
  scrollToBottom
})
</script>

<style scoped>
.screenplay-stream {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* 嵌入式工具栏 */
.embedded-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #d1d5db;
  margin: 0 4px;
}

.toolbar-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.toolbar-btn.back-btn {
  color: #3b82f6;
  border-color: #3b82f6;
}

.toolbar-btn.back-btn:hover {
  background: #eff6ff;
  border-color: #2563eb;
}

.toolbar-btn.btn-primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.toolbar-btn.btn-primary:hover {
  background: #2563eb;
  border-color: #2563eb;
}

.episode-name-editor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-label {
  font-size: 14px;
  color: #6b7280;
  white-space: nowrap;
}

.name-input {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
  width: 200px;
  transition: all 0.2s;
}

.name-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.name-input::placeholder {
  color: #9ca3af;
}

.scenes-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  padding-bottom: 80px;
  background: #f9fafb;
}

.scene-divider {
  height: 24px;
  margin: 16px 0;
  border-bottom: 2px dashed #e5e7eb;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
}

/* 底部悬浮栏 */
.floating-action-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 70%, transparent 100%);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(229, 231, 235, 0.5);
}

.btn-add {
  padding: 10px 20px;
  background: white;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #3b82f6;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
}

.btn-add:hover {
  background: #3b82f6;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.2);
}

.btn-add:active {
  transform: translateY(0);
}

/* 滚动条样式 */
.blocks-container::-webkit-scrollbar {
  width: 8px;
}

.blocks-container::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.blocks-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.blocks-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.bottom-spacer {
  height: 50vh;
  min-height: 300px;
}

.block-container {
  margin-left: 24px;
  position: relative;
}

.block-container::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #e5e7eb 0%, #e5e7eb 100%);
}

.insert-button-wrapper {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  position: relative;
}

.insert-button-wrapper.top {
  margin-bottom: -4px;
}

.insert-button-wrapper.bottom {
  margin-top: -4px;
}

.btn-insert {
  width: 36px;
  height: 24px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.btn-insert:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  transform: scale(1.05);
}

.insert-menu {
  position: fixed;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 1000;
  min-width: 120px;
  transform: translateX(-50%);
}

/* 场景级菜单（相对于+按钮定位） */
.insert-menu.scene-menu {
  position: absolute;
  top: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 160px;
}

.menu-item {
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-item:disabled,
.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #9ca3af;
}

.menu-item:disabled:hover,
.menu-item.disabled:hover {
  background: white;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

.add-button-wrapper {
  position: relative;
}

.add-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 1000;
  min-width: 180px;
}

.add-menu .menu-item {
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-menu .menu-item:hover {
  background: #f3f4f6;
}

/* 新增 Block 高亮动画 */
.highlight-flash {
  animation: flash-bg 1s ease-out;
}

@keyframes flash-bg {
  0% { background-color: #dbeafe; } /* 浅蓝色高亮 */
  100% { background-color: transparent; }
}

.btn-preview {
  background-color: #10b981;
  color: white;
  border-color: #059669;
  font-weight: 600;
}

.btn-preview:hover {
  background-color: #059669;
  border-color: #047857;
}
</style>
