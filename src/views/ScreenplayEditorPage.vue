<template>
  <div class="screenplay-editor-page">
    <!-- 剧本流（内置工具栏） -->
    <ScreenplayStream
      ref="screenplayStreamRef"
      :episode-name="episodeName"
      @back="handleBack"
      @update:episode-name="handleUpdateEpisodeName"
      @edit-narrator="handleEditNarrator"
      @manage-actors="handleManageActors"
      @manage-bgm="handleManageBGM"
      @save="handleSave"
      @preview="handlePreview"
      @export="handleExport"
      @select-actor="handleSelectActor"
      @select-state="handleSelectState"
      @select-expression="handleSelectExpression"
      @edit-setup="handleEditSetup"
      @enter-setup-mode="handleEnterSetupMode"
      @enter-action-mode="handleEnterActionMode"
      @preview-scene="handlePreviewScene"
    />
    
    <!-- v6.10: 场景编辑器 Overlay 覆盖层 -->
    <Transition name="scene-editor-overlay">
      <div
        v-if="sceneEditorState.visible"
        class="scene-editor-overlay"
      >
        <SceneEditMode
          :episode="currentEpisode"
          :mode="sceneEditorState.mode"
          :scene-id="sceneEditorState.sceneId"
          :block-id="sceneEditorState.blockId"
          @exit-scene-edit="handleExitSceneEdit"
          @save-setup="handleSaveSetup"
        />
      </div>
    </Transition>
    
    <!-- 旁白配置对话框 -->
    <NarratorConfigDialog
      v-if="narratorConfigVisible"
      :narrator="projectStore.narrator"
      @close="narratorConfigVisible = false"
      @save="handleSaveNarrator"
    />
    
    <!-- 演员管理对话框 -->
    <ActorManagementDialog
      v-if="actorManagementVisible"
      :actors="projectStore.actors"
      @close="actorManagementVisible = false"
      @add-actor="handleAddActorFromManagement"
      @update-actor="handleUpdateActorFromManagement"
      @delete-actor="handleDeleteActorFromManagement"
    />
    
    <!-- BGM 管理对话框 -->
    <div
      v-if="soundManagerVisible"
      class="modal-overlay"
      @click.self="soundManagerVisible = false"
    >
      <div class="sound-manager-modal">
        <div class="modal-header">
          <h3 class="modal-title">
            背景音乐管理
          </h3>
          <button
            class="btn-close"
            @click="soundManagerVisible = false"
          >
            ✕
          </button>
        </div>
        <div class="modal-body">
          <SoundManager initial-type="bgm" />
        </div>
      </div>
    </div>

    <!-- 剧本配乐管理对话框 (v7.5) -->
    <BGMManagerDialog
      v-if="bgmManagerVisible"
      :episode-id="episodeId"
      @close="bgmManagerVisible = false"
    />

    <!-- v7.0: 实例选择对话框（选择场景中的角色实例） -->
    <InstanceSelectorDialog
      v-if="instanceSelectorState.visible"
      :scene-objects="instanceSelectorState.sceneObjects"
      v-bind="instanceSelectorState.currentInstanceId ? { 'current-instance-id': instanceSelectorState.currentInstanceId } : {}"
      @close="instanceSelectorState.visible = false"
      @select="handleInstanceSelect"
    />
    

    
    <!-- 表情选择对话框 -->
    <ExpressionSelectorDialog
      v-if="expressionSelectorState.visible"
      v-bind="expressionSelectorState.currentExpression ? { 'current-expression': expressionSelectorState.currentExpression } : {}"
      @close="expressionSelectorState.visible = false"
      @select="handleExpressionSelect"
    />
    
    <!-- 场景预览对话框 -->
    <ScenePreviewDialog
      v-if="scenePreviewState.visible && currentEpisode"
      :visible="scenePreviewState.visible"
      :episode-id="episodeId"
      :scene-id="scenePreviewState.sceneId"
      :episode="currentEpisode"
      @close="scenePreviewState.visible = false"
    />
    
    <!-- 剧本预览对话框 -->
    <ScriptPreviewDialog
      v-if="scriptPreviewState.visible && currentEpisode"
      :visible="scriptPreviewState.visible"
      :episode-id="episodeId"
      :episode="currentEpisode"
      @close="scriptPreviewState.visible = false"
    />
    

    
    <!-- 导出确认对话框 -->
    <ExportConfirmDialog
      v-if="showConfirmDialog"
      :episode-id="episodeId"
      :settings="exportSettings"
      @confirm="confirmExport"
      @cancel="cancelExport"
    />
    
    <!-- 导出进度对话框 -->
    <ExportProgressDialog
      v-if="showProgressDialog"
      :status="exportState.status"
      :progress="exportState.progress"
      v-bind="exportState.error ? { error: exportState.error } : {}"
      @cancel="cancelExport"
      @close="showProgressDialog = false"
    />
    
    <!-- 导出结果对话框 -->
    <ExportResultDialog
      v-if="showResultDialog && exportResult"
      :result="exportResult"
      @close="closeResultDialog"
      @export-again="exportAgain"
      @retry="retryExport"
    />

    <!-- 返回确认对话框 -->
    <ConfirmDialog
      v-if="showBackConfirm"
      title="未保存的修改"
      message="当前有未保存的修改，确定要返回吗？"
      confirm-text="返回"
      :is-danger="true"
      @confirm="confirmBack"
      @cancel="showBackConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { type ComponentPublicInstance, computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ExportConfirmDialog from '@/components/export/ExportConfirmDialog.vue'
import ExportProgressDialog from '@/components/export/ExportProgressDialog.vue'
import ExportResultDialog from '@/components/export/ExportResultDialog.vue'
import SceneEditMode from '@/components/SceneEditMode.vue'
import ActorManagementDialog from '@/components/screenplay/ActorManagementDialog.vue'
import BGMManagerDialog from '@/components/screenplay/BGMManagerDialog.vue'
import ExpressionSelectorDialog from '@/components/screenplay/ExpressionSelectorDialog.vue'
import InstanceSelectorDialog from '@/components/screenplay/InstanceSelectorDialog.vue'
import NarratorConfigDialog from '@/components/screenplay/NarratorConfigDialog.vue'
import ScenePreviewDialog from '@/components/screenplay/ScenePreviewDialog.vue'
import ScreenplayStream from '@/components/screenplay/ScreenplayStream.vue'
import ScriptPreviewDialog from '@/components/screenplay/ScriptPreviewDialog.vue'
import SoundManager from '@/components/SoundManager.vue'
import { useToast } from '@/composables/useToast'
import { useVideoExport } from '@/composables/useVideoExport'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import type { ActorConfig, NarratorConfig, SceneObject, SceneSetup, ScriptBlock } from '@/types/screenplay'
import { applyBlockActionsToState, calculatePrevContext } from '@/utils/sceneStateCalculator'

const route = useRoute()
const router = useRouter()
const episodeStore = useEpisodeStore()
const projectStore = useProjectStore()
const screenplayStreamRef = ref<ComponentPublicInstance | null>(null)
const { success, error } = useToast()

// 视频导出
const { 
  exportState, 
  exportSettings, 
  exportResult,
  showConfirmDialog, 
  showProgressDialog,
  showResultDialog,
  startExport, 
  confirmExport, 
  cancelExport,
  closeResultDialog,
  exportAgain,
  retryExport
} = useVideoExport()

const episodeId = route.params['episodeId'] as string

// v6.0: 从 episodeStore 获取当前剧集
const currentEpisode = computed(() => episodeStore.getEpisode(episodeId))
const episodeName = computed(() => currentEpisode.value?.name || '')
const scenes = computed(() => currentEpisode.value?.scenes || [])

// v7.0: 实例选择对话框状态（替代原来的演员选择）
const instanceSelectorState = ref<{
  visible: boolean
  sceneId: string | null
  blockId: string | null
  sceneObjects: SceneObject[]
  currentInstanceId?: string
}>({
  visible: false,
  sceneId: null,
  blockId: null,
  sceneObjects: []
})



// 演员管理对话框状态
const actorManagementVisible = ref(false)

// BGM 管理对话框状态
const soundManagerVisible = ref(false)
const bgmManagerVisible = ref(false)

// BGM 选择对话框状态 (v7.5)
// const bgmSelectorState = ref<{
//   visible: boolean
//   sceneId: string | null
//   currentBgmId?: string
// }>({
//   visible: false,
//   sceneId: null
// })

// 旁白配置对话框状态
const narratorConfigVisible = ref(false)

// 表情选择对话框状态
const expressionSelectorState = ref<{
  visible: boolean
  sceneId: string | null
  blockId: string | null
  currentExpression?: string
}>({
  visible: false,
  sceneId: null,
  blockId: null
})

// 场景预览对话框状态
const scenePreviewState = ref<{
  visible: boolean
  sceneId: string
}>({
  visible: false,
  sceneId: ''
})

// 剧本预览对话框状态
const scriptPreviewState = ref<{
  visible: boolean
}>({
  visible: false
})

// v6.10: 场景编辑器 Overlay 状态
const sceneEditorState = ref<{
  visible: boolean
  mode: 'setup' | 'action'
  sceneId: string | null
  blockId: string | null
}>({
  visible: false,
  mode: 'setup',
  sceneId: null,
  blockId: null
})

// 自动保存状态
const lastSaveTime = ref<number>(0)
let autoSaveTimer: number | null = null

// 返回确认对话框
const showBackConfirm = ref(false)

// 初始化剧本
onMounted(() => {
  // v6.0: 不再需要初始化 screenplay，直接使用 episode
  if (!currentEpisode.value) {
    void router.replace('/project')
    return
  }
  
  // 设置当前剧集ID到Store，供子组件(如BGMManagerDialog)使用
  episodeStore.setCurrentEpisode(episodeId)
  
  // 初始化 lastSaveTime 为当前 episode 的 modifiedAt，避免误判为有未保存修改
  lastSaveTime.value = currentEpisode.value.modifiedAt || Date.now()
  
  // 启动自动保存
  startAutoSave()
  
  // 添加快捷键监听
  document.addEventListener('keydown', handleGlobalKeyDown)
})

// 组件销毁时清理
onBeforeUnmount(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  document.removeEventListener('keydown', handleGlobalKeyDown)
})

// 启动自动保存
function startAutoSave() {
  // v6.0: 监听 episode 的 modifiedAt 变化
  watch(
    () => currentEpisode.value?.modifiedAt,
    (newTime) => {
      if (newTime && newTime > lastSaveTime.value) {
        // 清除之前的定时器
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer)
        }
        
        // 3秒后自动保存
        autoSaveTimer = window.setTimeout(() => {
          void autoSave()
        }, 3000)
      }
    }
  )
}

// 自动保存
async function autoSave() {
  if (!currentEpisode.value) return
  if (!projectStore.isProjectOpen) {
    return
  }
  
  try {
    await projectStore.saveProject()
    lastSaveTime.value = Date.now()
  } catch (error) {
    console.error('[自动保存] 失败:', error)
  }
}

// 全局快捷键处理
function handleGlobalKeyDown(event: KeyboardEvent) {
  // Ctrl+S / Cmd+S: 保存
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    void handleSave()
  }
}

// 返回剧集列表
function handleBack() {
  // v6.0: 检查 episode 的修改时间
  const lastModified = currentEpisode.value?.modifiedAt || 0
  const hasUnsavedChanges = lastModified > lastSaveTime.value
  
  if (hasUnsavedChanges) {
    showBackConfirm.value = true
    return
  }
  
  void router.push('/project')
}

// 确认返回（放弃未保存的修改）
function confirmBack() {
  showBackConfirm.value = false
  void router.push('/project')
}

// 注意：添加和插入 Block 的逻辑现在由 ScreenplayStream 组件内部处理

// 保存
async function handleSave() {
  // v6.0: 检查当前 episode 是否有场景
  if (scenes.value.length === 0) {
    error('剧本必须至少包含一个场景！请先添加场景。', 3000)
    return
  }
  
  if (!projectStore.isProjectOpen) {
    error('项目未打开，无法保存剧本！', 3000)
    return
  }
  
  try {
    await projectStore.saveProject()
    lastSaveTime.value = Date.now()
    success('剧本已保存!')
  } catch (err: unknown) {
    console.error('[手动保存] 失败:', err)
    const message = err instanceof Error ? err.message : '未知错误'
    error('保存失败：' + message, 3000)
  }
}

// 预览
function handlePreview() {
  // v6.0: 检查当前 episode 是否有场景
  if (scenes.value.length === 0) {
    alert('剧本必须至少包含一个场景！请先添加场景。')
    return
  }
  
  scriptPreviewState.value = {
    visible: true
  }
}

// 导出
function handleExport() {
  // v6.0: 检查当前 episode 是否有场景
  if (scenes.value.length === 0) {
    alert('剧本必须至少包含一个场景！请先添加场景。')
    return
  }
  
  // 调用导出功能
  void startExport(episodeId)
}

// 编辑旁白配置
function handleEditNarrator() {
  narratorConfigVisible.value = true
}

// 保存旁白配置
function handleSaveNarrator(narrator: NarratorConfig) {
  projectStore.updateNarrator(narrator)
  narratorConfigVisible.value = false
}

// 打开演员管理对话框
function handleManageActors() {
  actorManagementVisible.value = true
}

// 打开 BGM 管理对话框
function handleManageBGM() {
  bgmManagerVisible.value = true
}

// 从演员管理添加演员
function handleAddActorFromManagement(actor: ActorConfig) {
  projectStore.addActor(actor)
}

// 从演员管理更新演员
function handleUpdateActorFromManagement(alias: string, actor: ActorConfig) {
  projectStore.updateActor(alias, actor)
}

// 从演员管理删除演员
function handleDeleteActorFromManagement(alias: string) {
  projectStore.deleteActor(alias)
}

// v7.0: 选择角色实例(对话块) - 使用场景中的实例而不是演员
function handleSelectActor(sceneId: string, blockId: string) {
  // 获取当前场景
  const scene = episodeStore.getScene(episodeId, sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === blockId)
  if (block?.type === 'dialogue') {
    // v20: 计算截至当前 Block 的 runtime objects（包含 spawned 状态）
    const runtimeSetup = applyBlockActionsToState(
      calculatePrevContext(scene, blockId),
      block,
      scene
    )

    instanceSelectorState.value = {
      visible: true,
      sceneId,
      blockId,
      sceneObjects: runtimeSetup.objects,
      currentInstanceId: block.instanceId
    }
  }
}

// v7.0: 角色实例选择确认
function handleInstanceSelect(instanceId: string) {
  const { sceneId, blockId } = instanceSelectorState.value
  if (sceneId && blockId) {
    // v7.0: 更新 instanceId 而不是 actorAlias
    episodeStore.updateBlockInScene(episodeId, sceneId, blockId, { instanceId })
  }
  instanceSelectorState.value.visible = false
}

// 姿态选择功能已随人物系统移除
function handleSelectState(_sceneId: string, _blockId: string) {
  // no-op: character pose selection removed
}

/* 已废弃的 BGM 处理逻辑
// 选择 BGM (v5.0: 从场景的 setup.objects 中获取和更新)
function handleSelectBGM(sceneId: string) {
...
}
*/

// 选择表情
function handleSelectExpression(sceneId: string, blockId: string) {
  const scene = episodeStore.getScene(episodeId, sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === blockId)
  if (block?.type === 'dialogue') {
    expressionSelectorState.value = {
      visible: true,
      sceneId,
      blockId,
      ...(block.expression ? { currentExpression: block.expression } : {})
    }
  }
}

// 表情选择确认
function handleExpressionSelect(expressionId: string) {
  const { sceneId, blockId } = expressionSelectorState.value
  if (sceneId && blockId) {
    episodeStore.updateBlockInScene(episodeId, sceneId, blockId, { expression: expressionId })
  }
  expressionSelectorState.value.visible = false
}

// 进入 Setup Mode (编辑初始布局) - v6.10: 使用 Overlay 模式
function handleEnterSetupMode(sceneId: string) {
  sceneEditorState.value = {
    visible: true,
    mode: 'setup',
    sceneId,
    blockId: null
  }
}

// 进入 Action Mode (编排动作) - v6.10: 使用 Overlay 模式
function handleEnterActionMode(sceneId: string, blockId: string) {
  sceneEditorState.value = {
    visible: true,
    mode: 'action',
    sceneId,
    blockId
  }
}

// v6.10: 退出场景编辑 (Overlay 模式)
function handleExitSceneEdit() {
  sceneEditorState.value.visible = false
}

// v6.10: 保存 Setup 后退出 (Overlay 模式)
function handleSaveSetup(_savedSceneId: string, _setup: SceneSetup) {
  // SceneEditMode 已经调用了 episodeStore.updateScene，这里只需要关闭 Overlay
  sceneEditorState.value.visible = false
}

// 编辑画面(兼容旧接口，已废弃)
function handleEditSetup(sceneId: string, blockId: string) {
  // 对于脚本块，进入 Action Mode
  handleEnterActionMode(sceneId, blockId)
}

// 预览场景
function handlePreviewScene(sceneId: string) {
  const scene = episodeStore.getScene(episodeId, sceneId)
  if (!scene) {
    error('场景不存在')
    return
  }
  
  if (scene.script.length === 0) {
    error('场景中没有内容，无法预览')
    return
  }
  
  scenePreviewState.value = {
    visible: true,
    sceneId
  }
}

// 更新动画名称
function handleUpdateEpisodeName(name: string) {
  if (currentEpisode.value) {
    episodeStore.updateEpisode(episodeId, { name })
  }
}
</script>

<style scoped>
.screenplay-editor-page {
  padding: 24px;
  background: #f9fafb;
  min-height: calc(100vh - 60px);
  position: relative;
}

/* v6.10: 场景编辑器 Overlay 样式 */
.scene-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: #1a1a1a;
}

/* Overlay 过渡动画 */
.scene-editor-overlay-enter-active {
  animation: overlay-slide-up 0.3s ease-out;
}

.scene-editor-overlay-leave-active {
  animation: overlay-slide-down 0.25s ease-in;
}

@keyframes overlay-slide-up {
  from {
    transform: translateY(100%);
    opacity: 0.8;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes overlay-slide-down {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(100%);
    opacity: 0.8;
  }
}


/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.sound-manager-modal {
  background: white;
  width: 900px;
  height: 80vh;
  max-width: 95vw;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #4b5563;
}

.modal-body {
  flex: 1;
  overflow: hidden;
}
</style>
