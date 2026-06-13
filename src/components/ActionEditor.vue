<template>
  <div
    ref="actionEditorContainer"
    class="action-editor"
  >

    <!-- 中间：画布区域 -->
    <main class="canvas-area">
      <!-- 顶部工具栏 -->
      <div class="action-toolbar">
        <div class="toolbar-left">
          <button
            class="toolbar-btn icon-only"
            title="返回"
            @click="handleReturn"
          >
            🔙
          </button>
          <span
            class="save-status"
            :class="{ unsaved: hasLocalChanges }"
          >
            {{ hasLocalChanges ? '● 未保存' : '✓ 已保存' }}
          </span>
          <span class="mouse-position">
            ({{ currentMousePos.x }}, {{ currentMousePos.y }})
          </span>
          <div class="scene-title">
            <span class="mode-icon">🎬</span>
            <span class="block-description" :title="currentBlockDescription">{{ truncatedBlockDescription }}</span>
            <button 
              class="edit-text-btn" 
              title="编辑文字" 
              @click="openTextEditDialog"
            >
              ✏️
            </button>
          </div>
        </div>
        
        <!-- v9.2: 右侧工具栏（与 Setup 模式布局一致） -->
        <div class="toolbar-right">
          <!-- 添加素材 -->
          <div class="add-menu-container">
            <button
              class="toolbar-btn add-btn"
              title="添加素材"
              @click="toggleAddMenu"
            >
              <span class="btn-icon">+</span>
              <span class="btn-text">添加素材</span>
            </button>
            <div
              v-if="showAddMenu"
              class="add-menu"
            >

              <button
                class="menu-item"
                @click="handleAddMenuItemClick('backgrounds')"
              >
                <span class="menu-icon">🖼️</span>
                <span>背景</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('props')"
              >
                <span class="menu-icon">📦</span>
                <span>道具</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('sounds')"
              >
                <span class="menu-icon">🔊</span>
                <span>音效</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('screen_effects')"
              >
                <span class="menu-icon">🌟</span>
                <span>视觉效果</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('symbol')"
              >
                <span class="menu-icon">🔧</span>
                <span>元件</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('expression')"
              >
                <span class="menu-icon">😀</span>
                <span>表情</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('scene_templates')"
              >
                <span class="menu-icon">🧩</span>
                <span>场景模板</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('actors')"
              >
                <span class="menu-icon">🎭</span>
                <span>演员</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('characters')"
              >
                <span class="menu-icon">👤</span>
                <span>人物</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('light')"
              >
                <span class="menu-icon">💡</span>
                <span>光源</span>
              </button>
              <button
                class="menu-item"
                @click="handleAddMenuItemClick('text')"
              >
                <span class="menu-icon">📝</span>
                <span>文本</span>
              </button>
            </div>
          </div>
          <!-- 复制按钮 -->
          <button 
            class="toolbar-btn icon-only" 
            title="复制选中对象" 
            :disabled="!canCopySelectedObject"
            @click="handleCopyObject"
          >
            ❐
          </button>
          <!-- P2: 成组按钮 -->
          <button
            class="toolbar-btn icon-only"
            title="组合"
            :disabled="!canCopySelectedObject"
            @click="handleStartGrouping"
          >
            🔗
          </button>
          <!-- v17: 保存为场景模板 -->
          <button
            class="toolbar-btn icon-only"
            title="保存为场景模板"
            :disabled="aliveNonCameraObjects.length === 0"
            @click="showSaveTemplateDialog = true"
          >
            🧩
          </button>
          <!-- 删除按钮 -->
          <button 
            class="toolbar-btn danger icon-only" 
            title="删除选中对象"
            :disabled="!canDeleteSelectedObject"
            @click="handleDeleteDynamicObject"
          >
            🗑️
          </button>
          <!-- 预览 -->
          <button 
            class="toolbar-btn preview-btn icon-only" 
            title="预览效果" 
            @click="handlePreview"
          >
            👁️
          </button>
          <!-- 保存 -->
          <button 
            class="toolbar-btn primary icon-only" 
            title="保存" 
            @click="handleSaveAction"
          >
            💾
          </button>
          <button
            v-if="isDev"
            class="toolbar-btn icon-only"
            title="查看场景 Render Chain"
            @click="showRenderChainDialog = true"
          >
            RC
          </button>
          <div style="position: relative; display: flex; align-items: center;">
            <button
              class="toolbar-btn icon-only"
              :class="{ active: showPassThroughPanel }"
              title="穿透管理"
              @click="showPassThroughPanel = !showPassThroughPanel; showPassThroughTip = false"
            >
              👻{{ passThroughCount > 0 ? ` ${passThroughCount}` : '' }}
            </button>
            <div v-if="showPassThroughTip" class="pass-through-tip-bubble">
              相机已设为穿透模式，点击管理
            </div>
            <PassThroughPanel
              v-if="showPassThroughPanel"
              :entries="passThroughPanelEntries"
              @remove="handleRemoveFromPassThrough"
              @toggle-visible="handleTogglePassThroughVisible"
              @select-object="handleSelectObject"
              @close="showPassThroughPanel = false"
            />
          </div>
          <!-- 全屏 -->
          <button 
            class="toolbar-btn icon-only" 
            :title="isFullscreen ? '退出全屏' : '全屏'" 
            @click="toggleFullscreen"
          >
            {{ isFullscreen ? '⛶' : '⛶' }}
          </button>
        </div>
      </div>

      <!-- P2: 成组模式浮动栏 -->
      <GroupingModePanel
        v-if="actionGroupingState"
        v-model:composite-mode="selectedCompositeMode"
        :mode="actionGroupingState.mode === 'create' ? 'create' : 'addTo'"
        :composite-name="actionGroupingState.mode === 'addTo' ? getCompositeDisplayName(actionGroupingState.compositeId) : undefined"
        :pending-ids="actionGroupingState.pendingIds"
        :tree-nodes="actionGroupingTreeNodes"
        :locked-parent-id="lockedGroupingParentId"
        :hide-composite-mode="true"
        @toggle="handleGroupingToggleById"
        @confirm="handleGroupingConfirm"
        @cancel="handleGroupingCancel"
      />

      <!-- 画布容器 -->
      <div 
        ref="canvasContainer" 
        class="canvas-container recording-mode"
        @mousemove="handleMouseMove"
        @click="handleCanvasClickForGrouping"
      >
        <ZoomControls
          v-if="renderer"
          :current-zoom="renderer.userZoom"
          @zoom-change="(z: number) => renderer?.setZoomLevel(z)"
          @fit="() => renderer?.resetView()"
          @fit-all="() => renderer?.fitAll()"
          @zoom-100="() => renderer?.zoomTo100()"
        />
        <CanvasScrollbars
          v-if="renderer && canvasContainer"
          :canvas-width="renderer.canvasSize.width"
          :canvas-height="renderer.canvasSize.height"
          :viewport-width="canvasContainer.clientWidth"
          :viewport-height="canvasContainer.clientHeight"
          :effective-scale="renderer.transformParams.scale"
          :pan-x="renderer.panOffset.x"
          :pan-y="renderer.panOffset.y"
          @pan-change="(x: number, y: number) => renderer?.setPanOffset(x, y)"
        />
      </div>

      <!-- 底部动作编辑器 -->
      <ActionSequencer
        v-if="currentBlock"
        :block="currentBlock"
        :actions="currentBlockActions"
        :current-slot-index="currentSlotIndex"
        :selected-action-id="selectedAction?.id ?? null"
        :selected-object-id="sceneObjectStore.selectedObjectId"

        @update:current-slot-index="handleSlotIndexChange"
        @select-action="handleSelectAction"
        @select-object="handleSelectObject"
        @update-action="handleUpdateActionFromSequencer"
        @delete-action="handleDeleteActionFromSequencer"
        @reorder-actions="handleReorderActionsInSlot"
        @reset-action-order="handleResetActionOrderInSlot"
        @add-action="handleAddActionFromSequencer"
        @collapse-change="handleSequencerCollapseChange"
      />
    </main>

    <!-- 右侧分隔条 -->
    <div 
      v-show="!rightPanelCollapsed"
      class="resizer right-resizer" 
      @mousedown="startResizeRightPanel"
    />

    <!-- 右侧折叠按钮 -->
    <button
      v-show="rightPanelCollapsed"
      class="expand-btn right"
      title="展开面板"
      @click="rightPanelCollapsed = false"
    >
      ◀
    </button>

    <!-- 右侧：属性面板 -->
    <aside
      v-show="!rightPanelCollapsed"
      class="right-panel"
      :style="{ width: rightPanelWidth + 'px' }"
    >
      <div class="panel-header">
        <button
          class="collapse-btn"
          title="折叠面板"
          @click="rightPanelCollapsed = true"
        >
          ▶
        </button>
        <!-- 未选中 Action 时显示标题 -->
        <template v-if="!selectedAction">
          <h3>属性</h3>
        </template>
        <template v-else>
          <h3>动作属性</h3>
        </template>
      </div>
      
      <!-- 选中Action时显示ActionInspector -->
      <ActionInspector
        v-if="selectedAction"
        :action="selectedAction"
        :block-duration="currentBlockDuration"
        :slots="currentBlockSlots"
        :focus-field="actionFocusField"
        :alive-object-ids="aliveObjectIds"
        :episode-id="props.episode?.id"
        :scene-id="props.sceneId"
        @update="handleActionInspectorUpdate"
        @delete="handleActionInspectorDelete"
      />
      <!-- 未选中Action时显示属性面板 -->
      <template v-else>
        <!-- 属性面板 -->
        <ObjectPropertiesPanel
          :selected-object="sceneObjectStore?.getSelectedObject()"
          :object-record-mode="objectRecordMode"
          :runtime-state="null"
          :canvas-width="renderer?.canvasSize?.width ?? 1920"
          :canvas-height="renderer?.canvasSize?.height ?? 1080"
          :is-action-mode="true"
          :current-slot-index="currentSlotIndex"
          :current-slot-text="currentSlotText"
          :camera-record-mode="cameraRecordMode"
          :current-camera-action="currentSlotCameraAction"
          :current-slot-has-shake="currentSlotHasShake"
          :alive-object-ids="aliveObjectIds"
          :is-pass-through="selectedObjectIsPassThrough"
          :pass-through-visible="selectedObjectPassThroughVisible"
          :persist-changes="handleSaveActionAsync"

          @update="handleObjectUpdateInActionMode"
          @initial-state-update="handleInitialStateUpdate"
          @move-up="handleMoveUp"
          @move-down="handleMoveDown"
          @trigger-anim="handleTriggerAnim"
          @camera-record-mode-change="handleCameraRecordModeChange"
          @camera-action-update="handleCameraActionFromPanel"
          @trigger-audio="handleTriggerAudio"
          @trigger-text-reveal="handleTriggerTextReveal"

          @select-object="handleSelectObject"
          @record-mode-change="handleObjectRecordModeChange"
          @visual-action-update="handleVisualActionUpdate"
          @material-action-update="handleMaterialActionUpdate"
          @material-save="handleMaterialSave"
          @animations-updated="handleAnimationsUpdated"
          @edit-alias="handleEditAlias"
          @composite-action="handleCompositeAction"
          @pass-through-toggle="handlePassThroughToggle"
          @pass-through-visible-toggle="handleTogglePassThroughVisible"
        />
      </template>
    </aside>

    <!-- 确认对话框 -->
    <ConfirmDialog
      v-if="showConfirmDialog"
      :title="confirmDialogConfig.title"
      :message="confirmDialogConfig.message"
      :confirm-text="confirmDialogConfig.confirmText"
      :cancel-text="confirmDialogConfig.cancelText"
      :is-danger="confirmDialogConfig.isDanger"
      :show-secondary-confirm="confirmDialogConfig.showSecondaryConfirm"
      :secondary-confirm-text="confirmDialogConfig.secondaryConfirmText"
      @confirm="confirmDialogConfig.onConfirm"
      @secondary-confirm="confirmDialogConfig.onSecondaryConfirm"
      @cancel="showConfirmDialog = false"
    />
    
    <!-- 保存确认对话框 -->
    <SaveConfirmDialog
      v-if="showSaveConfirmDialog"
      title="保存更改"
      message="当前有未保存的修改，您想要如何处理？"
      @save-and-exit="handleSaveAndExit"
      @discard="handleDiscardAndExit"
      @cancel="showSaveConfirmDialog = false"
    />
    
    <!-- 动作预览对话框 -->
    <ActionPreviewDialog
      v-if="showPreviewDialog && episode"
      :visible="showPreviewDialog"
      :episode-id="episode.id"
      :scene-id="sceneId"
      :block-id="blockId"
      :episode="episode"
      @close="showPreviewDialog = false"
    />

    <!-- 保存提示 Toast -->
    <SceneRenderChainDialog
      v-if="showRenderChainDialog"
      mode-description="Runtime objects"
      @close="showRenderChainDialog = false"
    />

    <Transition name="toast">
      <div
        v-if="showSaveToast"
        class="save-toast"
        :class="saveToastType"
      >
        <span class="toast-icon">{{ saveToastType === 'success' ? '✓' : '✗' }}</span>
        <span class="toast-message">{{ saveToastMessage }}</span>
      </div>
    </Transition>

    <!-- v8.3: 文本编辑对话框 -->
    <div v-if="showTextEditDialog" class="text-edit-dialog-overlay" @click.self="showTextEditDialog = false">
      <div class="text-edit-dialog">
        <div class="dialog-header">
          <span>编辑文字</span>
          <button class="close-btn" @click="showTextEditDialog = false">×</button>
        </div>
        <div class="dialog-body">
          <textarea v-model="editingText" class="text-edit-textarea" rows="5" />
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="showTextEditDialog = false">取消</button>
          <button class="confirm-btn" @click="saveEditedText">确定</button>
        </div>
      </div>
    </div>


    <BackgroundPickerDialog
      v-if="showBackgroundPicker"
      @select="handleBackgroundSelect"
      @close="showBackgroundPicker = false"
    />
    <PropPickerDialog
      v-if="showPropPicker"
      @select="handlePropSelect"
      @close="showPropPicker = false"
    />
    <SoundPickerDialog
      v-if="showSoundPicker"
      @select="handleSoundSelect"
      @close="showSoundPicker = false"
    />
    <ScreenEffectPickerDialog
      v-if="showScreenEffectPicker"
      @select="handleScreenEffectSelect"
      @select-mask="handleAddMaskFromDialog"
      @close="showScreenEffectPicker = false"
    />
    <LightPickerDialog
      v-if="showLightPicker"
      @select="handleLightSelect"
      @close="showLightPicker = false"
    />
    <ExpressionSelectorDialog
      v-if="showExpressionPicker"
      @select="handleExpressionSelect"
      @close="showExpressionPicker = false"
    />
    <SceneTemplatePickerDialog
      v-if="showTemplatePicker"
      @select="handleTemplateSelect"
      @close="showTemplatePicker = false"
    />

    <!-- 演员选择对话框 -->
    <ActorPickerDialog
      v-if="showActorPicker"
      @select="handleActorSelect"
      @close="showActorPicker = false"
    />

    <!-- 人物选择对话框 -->
    <CompositeCharacterPickerDialog
      v-if="showCharacterPicker"
      @select="handleCharacterSelect"
      @close="showCharacterPicker = false"
    />

    <!-- v17: 保存为场景模板对话框 -->
    <SaveTemplateDialog
      v-if="showSaveTemplateDialog"
      :visible="showSaveTemplateDialog"
      :initial-selected-object-id="sceneObjectStore.getSelectedObject()?.id"
      :all-scene-objects="aliveNonCameraObjects"
      @cancel="showSaveTemplateDialog = false"
      @saved="handleSaveTemplateSaved"
    />

    <!-- 实例别名编辑对话框 -->
    <InstanceAliasDialog
      v-if="showAliasDialog"
      :actor-name="aliasDialogActorName"
      :suggested-alias="aliasDialogSuggestedAlias"
      :existing-aliases="existingAliases"
      :current-alias="aliasDialogCurrentAlias"
      :object-type="aliasDialogObjectType"
      @confirm="handleAliasConfirm"
      @cancel="handleAliasCancel"
    />

  </div>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { type ActionUpdatePayload, useSceneRenderer } from '@/composables/useSceneRenderer'
import { useToast } from '@/composables/useToast'
import { CAMERA_BASE_HEIGHT,CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { Z_INDEX_SCREEN_EFFECT, Z_INDEX_TEXT } from '@/constants/zIndex'
import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { logService } from '@/services/LogService'
import { useAnimationStore } from '@/stores/animationStore'
import { useBackgroundStore } from '@/stores/backgroundStore'  // v7.1: 用于获取背景名称
import type { Episode } from '@/stores/episodeStore'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
// P2: usePropStore 已不再需要（对象加载由 fromSetupObject 代理）
import type { AudioObject, CameraObject } from '@/stores/sceneObjectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
// v7.3: useEffectStore 已移除
import { useSoundStore } from '@/stores/soundStore'
import type { AnimationTimingMode } from '@/types/animation'
import type { CompositeCharacter } from '@/types/compositeCharacter'
// Phase 4e: ObjectStateSnapshot 已由 SceneObject 替代
import type { SceneObject as ActionRuntimeState } from '@/types/sceneObject'
import type { LightObject,MaskObject,ScreenEffectObject, ScreenEffectPreset, SymbolMaterial, TextObject } from '@/types/sceneObject'
import type { CompositeExtraInfo } from '@/types/sceneObject'
import type { SceneTemplate } from '@/types/sceneTemplate'
import type { 
  Action, 
  BaseDurationAction, 
  CameraCutAction, 
  CameraMoveAction, 
  SceneContainer, 
  SceneObject, 
  SceneSetup, 
  SceneStructureOperation,
  ScriptBlock, 
  SetAnimAction,
  SetLifecycleAction,
  SetMaskAction,
  SetMaterialAction,
  SetSceneStructureAction,
  SetTransformAction, 
  SetVisualAction, 
  TweenTransformAction 
} from '@/types/screenplay'
import { SCENE_ACTION_TARGET } from '@/types/screenplay'
import { 
  evaluateCameraStateBySlot,
  evaluateObjectStateBySlot,
  type RuntimeCameraState, 
} from '@/utils/actionEvaluator'
import { localToGlobal } from '@/utils/actionHandlers/matrixUtils'
import type { WriteableState } from '@/utils/actionHandlers/types'
// v9.3: 判断出生 action
import { isBirthAction } from '@/utils/actionHelpers'
import {
  getActionOrderModeForSlot,
  hasCustomActionOrderForSlot,
  reconcileActionOrderForSlot,
} from '@/utils/actionOrder'
import { getActorByCharacterId } from '@/utils/actorUtils'
import {
  findCameraConflict,
  findUpsertableCameraAction,
  isCameraActionType,
  isCameraFollowAction,
  isCameraPositionAction,
} from '@/utils/cameraActionRules'
import { applyMeasuredDefaultSize } from '@/utils/sceneObjectDefaultSize'
import { calculatePrevContext } from '@/utils/sceneStateCalculator'
import { instantiateTemplate, snapshotToTemplate } from '@/utils/sceneTemplateEngine'
// v9.1: Shadow Object 动态对象创建
import { createShadowObject } from '@/utils/shadowObject'
import { detectSlotTextChanges, migrateActionsOnSlotDelete, migrateActionsOnSlotInsert, parseBlockToSlots } from '@/utils/slotUtils'
import { 
  getObjectRuntimeState, 
  getTargetAliasFromObject,
} from '@/utils/stateUtils'
import { generateId } from '@/utils/uuid'

import ActionInspector from './ActionInspector.vue'
import ActionPreviewDialog from './ActionPreviewDialog.vue'
import ActionSequencer from './ActionSequencer.vue'
import ActorPickerDialog from './ActorPickerDialog.vue'
// v9.1: 添加素材 Picker 组件
import BackgroundPickerDialog from './BackgroundPickerDialog.vue'
import CanvasScrollbars from './CanvasScrollbars.vue'
import CompositeCharacterPickerDialog from './CompositeCharacterPickerDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import GroupingModePanel from './GroupingModePanel.vue'
import type { GroupingTreeNode } from './groupingTypes'
import InstanceAliasDialog from './InstanceAliasDialog.vue'
import LightPickerDialog from './LightPickerDialog.vue'
import ObjectPropertiesPanel from './ObjectPropertiesPanel.vue'
import PassThroughPanel from './PassThroughPanel.vue'
import PropPickerDialog from './PropPickerDialog.vue'
import SaveConfirmDialog from './SaveConfirmDialog.vue'
import SaveTemplateDialog from './SaveTemplateDialog.vue'
import SceneRenderChainDialog from './SceneRenderChainDialog.vue'
import SceneTemplatePickerDialog from './SceneTemplatePickerDialog.vue'
import ScreenEffectPickerDialog from './ScreenEffectPickerDialog.vue'
import ExpressionSelectorDialog from './screenplay/ExpressionSelectorDialog.vue'
import SoundPickerDialog from './SoundPickerDialog.vue'
import ZoomControls from './ZoomControls.vue'

const props = defineProps<{
  episode: Episode | undefined
  sceneId: string
  blockId: string
}>()

const emit = defineEmits<{
  exitSceneEdit: []
}>()

const route = useRoute()
const projectStore = useProjectStore()
const episodeStore = useEpisodeStore()
const sceneObjectStore = useSceneObjectStore()
const isDev = import.meta.env.DEV
const backgroundStore = useBackgroundStore()  // v7.1: 用于获取背景名称
// v7.3: effectStore 已移除
// P2: propStore 已不再直接使用（对象加载由 fromSetupObject 代理）
const soundStore = useSoundStore()
const canvasContainer = ref<HTMLElement>()
const actionEditorContainer = ref<HTMLElement>()

// 场景渲染器
const renderer = ref<ReturnType<typeof useSceneRenderer> | null>(null)

// 当前鼠标位置 (Canvas Physical Coordinates)
const currentMousePos = ref({ x: 0, y: 0 })

function handleMouseMove(event: MouseEvent) {
  if (!renderer.value) return
  
  const canvasElement = renderer.value.getPixiApp().canvasElement
  if (!canvasElement) return
  
  const rect = canvasElement.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  
  const worldPos = renderer.value.canvasToWorld(canvasX, canvasY)
  
  currentMousePos.value = {
    x: Math.round(worldPos.x),
    y: Math.round(worldPos.y)
  }
}

// 确认对话框状态
const showConfirmDialog = ref(false)
const confirmDialogConfig = ref({
  title: '确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  isDanger: false,
  showSecondaryConfirm: false,
  secondaryConfirmText: '',
  onConfirm: () => { /* empty */ },
  onSecondaryConfirm: () => { /* empty */ },
})

// v9.1: 添加素材菜单状态
const showAddMenu = ref(false)

const showBackgroundPicker = ref(false)
const showPropPicker = ref(false)
const showSoundPicker = ref(false)
const showScreenEffectPicker = ref(false)
const showTemplatePicker = ref(false)
const showExpressionPicker = ref(false)
const showActorPicker = ref(false)
const showLightPicker = ref(false)
const showCharacterPicker = ref(false)

// 演员关联的 characterId 列表（用于演员选择对话框的 includeIds）
// actorCharacterIds 已不再需要 — ActorPickerDialog 直接从 projectStore.actors 获取数据

// 穿透列表管理
const showPassThroughTip = ref(true)
const showPassThroughPanel = ref(false)
const showRenderChainDialog = ref(false)

function addToPassThrough(objectId: string): void {
  if (renderer.value) {
    renderer.value.getSceneGraph().addPassThrough(objectId)
    void renderer.value.renderObjects()
  }
}

function handleRemoveFromPassThrough(objectId: string): void {
  if (renderer.value) {
    renderer.value.getSceneGraph().removePassThrough(objectId)
    void renderer.value.renderObjects()
  }
}

function handleTogglePassThroughVisible(objectId: string): void {
  if (renderer.value) {
    const sceneGraph = renderer.value.getSceneGraph()
    const entry = sceneGraph.getPassThroughEntry(objectId)
    if (entry) {
      sceneGraph.setPassThroughVisible(objectId, !entry.visible)
      void renderer.value.renderObjects()
    }
  }
}

function isObjectPassThrough(objectId: string): boolean {
  if (renderer.value) {
    return renderer.value.getSceneGraph().isPassThrough(objectId)
  }
  return false
}

const passThroughCount = computed(() => {
  if (!renderer.value) return 0
  return renderer.value.getSceneGraph().getPassThroughEntries().size
})

const passThroughPanelEntries = computed(() => {
  if (!renderer.value) return []
  const entries = renderer.value.getSceneGraph().getPassThroughEntries()
  const result: { objectId: string; name: string; icon: string; visible: boolean; isDefault: boolean }[] = []
  for (const [objectId, entry] of entries) {
    const obj = sceneObjectStore.getObject(objectId)
    if (obj) {
      result.push({
        objectId,
        name: obj.alias ?? obj.name ?? objectId,
        icon: getTypeIcon(obj.type),
        visible: entry.visible,
        isDefault: obj.type === 'camera',
      })
    }
  }
  return result
})

const selectedObjectIsPassThrough = computed(() => {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return false
  return isObjectPassThrough(selected.id)
})

const selectedObjectPassThroughVisible = computed(() => {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return true
  if (!renderer.value) return true
  const entry = renderer.value.getSceneGraph().getPassThroughEntry(selected.id)
  return entry?.visible ?? true
})

function handlePassThroughToggle(objectId: string) {
  if (isObjectPassThrough(objectId)) {
    handleRemoveFromPassThrough(objectId)
  } else {
    addToPassThrough(objectId)
  }
}

// 别名编辑对话框状态
const showAliasDialog = ref(false)
const editingAliasObjectId = ref<string | null>(null)

const aliasDialogActorName = computed(() => {
  if (!editingAliasObjectId.value) return ''
  const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
  if (!obj) return ''
  if (obj.type === 'background') {
    const bgObj = obj as unknown as { refId: string }
    const bg = backgroundStore.getBackground(bgObj.refId)
    return bg?.name || obj.name || '背景'
  } else if (obj.type === 'audio') {
    const audioObj = obj as unknown as { refId: string }
    const sound = soundStore.getSound(audioObj.refId)
    return sound?.name || obj.name || '音效'
  }
  return obj.name || '未命名'
})

const aliasDialogSuggestedAlias = computed(() => {
  if (!editingAliasObjectId.value) return ''
  const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
  return obj?.alias || obj?.name || ''
})

const aliasDialogCurrentAlias = computed(() => {
  if (!editingAliasObjectId.value) return ''
  const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
  return obj?.alias || ''
})

const aliasDialogObjectType = computed(() => {
  if (!editingAliasObjectId.value) return 'prop' as const
  const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
  return (obj?.type || 'prop') as 'background' | 'bgm' | 'prop' | 'text'
})

const existingAliases = computed(() => {
  // v17: 命名空间感知 — 基于正在编辑的对象所在的命名空间收集 alias
  const nsRoot = editingAliasObjectId.value
    ? sceneObjectStore.resolveNamespaceRoot(editingAliasObjectId.value)
    : null
  return sceneObjectStore.getExistingAliases(nsRoot)
})

function handleEditAlias(objectId: string) {
  const obj = sceneObjectStore.getObject(objectId)
  if (!obj || obj.type === 'camera') return
  editingAliasObjectId.value = objectId
  showAliasDialog.value = true
}

async function handleAliasConfirm(alias: string) {
  if (!editingAliasObjectId.value) {
    showAliasDialog.value = false
    return
  }
  
  const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
  if (obj && obj.type !== 'camera') {
    const selectedObjectIdBeforeUpdate = sceneObjectStore.selectedObjectId
    // v24: 通过 updateSetupObject 同时写入 setupState + runtimeState + episode
    sceneObjectStore.updateSetupObject(obj.id, {
      alias: alias
    } as unknown as Partial<SceneObject>)
    if (selectedObjectIdBeforeUpdate === obj.id) {
      sceneObjectStore.selectObject(obj.id)
    }
    await refreshGhostRealStates()
    
    markLocalChange()
  }
  
  editingAliasObjectId.value = null
  showAliasDialog.value = false
}

function handleAliasCancel() {
  editingAliasObjectId.value = null
  showAliasDialog.value = false
}

// v9.1: 切换添加菜单显示
function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

// v9.1: 处理添加菜单项点击
function handleAddMenuItemClick(type: string) {
  showAddMenu.value = false
  
  switch(type) {    case 'backgrounds':
      showBackgroundPicker.value = true
      break
    case 'props':
      showPropPicker.value = true
      break
    case 'sounds':
      showSoundPicker.value = true
      break
    case 'screen_effects':
      showScreenEffectPicker.value = true
      break
    case 'symbol': {
      // v16: 走 Shadow Object 流程
      if (!props.sceneId || !props.episode) break
      const symScene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
      const symBlock = symScene?.script.find((b: ScriptBlock) => b.id === props.blockId)
      if (!symScene || !symBlock) break
      
      const symName = sceneObjectStore.generateUniqueAlias('元件')
      const symCameraCenter = getCameraCenterPosition()
      const { setupObject: symSetupObj, spawnAction: symSpawnAction } = createShadowObject({
        scene: symScene,
        block: symBlock,
        slotIndex: currentSlotIndex.value,
        objectType: 'symbol',
        resourceId: '',
        resourceName: symName,
        cameraCenterX: symCameraCenter.x,
        cameraCenterY: symCameraCenter.y
      })
      addShadowObjectToScene(symSetupObj, symSpawnAction)
      break
    }
    case 'scene_templates':
      showTemplatePicker.value = true
      break
    case 'expression':
      showExpressionPicker.value = true
      break
    case 'actors':
      showActorPicker.value = true
      break
    case 'characters':
      showCharacterPicker.value = true
      break
    case 'light': {
      showLightPicker.value = true
      break
    }
    case 'text': {
      if (!props.sceneId || !props.episode) break
      const textName = sceneObjectStore.generateUniqueAlias('文本')
      const textSetupObj: TextObject = {
        id: generateId('sceneobject'),
        type: 'text',
        name: '文本',
        refId: '',
        alias: textName,
        content: '文本',
        fontSize: 72,
        fontFamily: 'Noto Sans SC',
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#ffffff',
        align: 'center',
        wordWrap: false,
        wordWrapWidth: 400,
        textBoxMode: 'auto-size',
        revealInitialState: 'complete',
        x: CANVAS_CENTER_X,
        y: CANVAS_CENTER_Y,
        width: 400,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: Z_INDEX_TEXT,
        visible: true,
        spawned: false,
      }
      const textSpawnAction: SetLifecycleAction = {
        id: generateId(),
        type: 'set_lifecycle',
        category: 'point',
        target: textSetupObj.id,
        slotIndex: currentSlotIndex.value,
        params: {
          spawned: true,
          autoDespawnOnBlockEnd: true,
        },
      }
      addShadowObjectToScene(textSetupObj, textSpawnAction)
      break
    }
    case 'mask_rectangle':
    case 'mask_ellipse': {
      if (!props.sceneId || !props.episode) break
      const maskShape: 'rectangle' | 'ellipse' = type === 'mask_ellipse' ? 'ellipse' : 'rectangle'
      const maskName = sceneObjectStore.generateUniqueAlias(maskShape === 'ellipse' ? '椭圆蒙版' : '矩形蒙版')
      const maskCameraCenter = getCameraCenterPosition()
      const maskSetupObj: MaskObject = {
        id: generateId('sceneobject'),
        type: 'mask',
        name: maskShape === 'ellipse' ? '椭圆蒙版' : '矩形蒙版',
        refId: '',
        alias: maskName,
        shape: maskShape,
        mode: 'inside_visible',
        targetIds: [],
        x: maskCameraCenter.x,
        y: maskCameraCenter.y,
        width: 200,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: Z_INDEX_TEXT,
        visible: true,
        spawned: false,
      }
      const maskSpawnAction: SetLifecycleAction = {
        id: generateId(),
        type: 'set_lifecycle',
        category: 'point',
        target: maskSetupObj.id,
        slotIndex: currentSlotIndex.value,
        params: {
          spawned: true,
          autoDespawnOnBlockEnd: true,
        },
      }
      addShadowObjectToScene(maskSetupObj, maskSpawnAction)
      break
    }
  }
}

function handleLightSelect(result: { lightType: 'point' | 'spot'; params?: { lightColor?: string; lightIntensity?: number; lightRadius?: number; flicker?: number; flickerSpeed?: number; directionAngle?: number; coneAngle?: number } }) {
  showLightPicker.value = false

  if (!props.sceneId || !props.episode) return
  const lightScene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const lightBlock = lightScene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!lightScene || !lightBlock) return

  const isSpot = result.lightType === 'spot'
  const p = result.params
  const lightName = sceneObjectStore.generateUniqueAlias(isSpot ? '聚光灯' : '点光源')
  const lightCameraCenter = getCameraCenterPosition()
  const { setupObject: lightSetupObj, spawnAction: lightSpawnAction } = createShadowObject({
    scene: lightScene,
    block: lightBlock,
    slotIndex: currentSlotIndex.value,
    objectType: 'light',
    resourceId: '',
    resourceName: lightName,
    cameraCenterX: lightCameraCenter.x,
    cameraCenterY: lightCameraCenter.y,
  })

  const lightObject = lightSetupObj as SceneObject & {
    lightType: 'point' | 'spot'
    lightRadius: number
    lightColor: string
    lightIntensity: number
    directionMode?: 'omni' | 'cone'
    directionAngle?: number
    coneAngle?: number
    flicker?: number
    flickerSpeed?: number
  }
  lightObject.lightType = isSpot ? 'spot' : 'point'
  lightObject.lightRadius = p?.lightRadius ?? (isSpot ? 420 : 300)
  lightObject.lightColor = p?.lightColor ?? '#ffffff'
  lightObject.lightIntensity = p?.lightIntensity ?? 1.0
  lightObject.flicker = p?.flicker ?? 0
  lightObject.flickerSpeed = p?.flickerSpeed ?? 0.35
  lightObject.directionMode = isSpot ? 'cone' : 'omni'
  lightObject.directionAngle = p?.directionAngle ?? 0
  lightObject.coneAngle = p?.coneAngle ?? (isSpot ? 70 : 100)

  addShadowObjectToScene(lightSetupObj, lightSpawnAction)
}

// v16: 处理场景模板选择 — 实例化并放置到画布（Shadow Object 模式）
function handleTemplateSelect(template: SceneTemplate) {
  showTemplatePicker.value = false

  if (!props.sceneId || !props.episode) return
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  if (!block.actions) block.actions = []

  const result = instantiateTemplate(template, CANVAS_CENTER_X, CANVAS_CENTER_Y)
  
  let firstObjectId: string | undefined
  for (const obj of result.objects) {
    // 重新生成唯一 alias（基于场景命名空间）
    const uniqueAlias = sceneObjectStore.generateUniqueAlias(obj.alias ?? obj.name)
    if (uniqueAlias !== obj.alias) {
      obj.alias = uniqueAlias
    }

    // 所有对象 spawned=false（由 entity root 的 set_lifecycle 级联激活）
    obj.spawned = false

    // v24: 写入持久层（addSetupObject 自动同步到 episode）
    sceneObjectStore.addSetupObject(obj)
    
    if (!firstObjectId) firstObjectId = obj.id
  }

  // 仅对 entity root 创建 1 个 set_lifecycle
  const entityRoot = result.objects.find(o => !o.parentId)
  if (entityRoot) {
    const spawnAction: SetLifecycleAction = {
      id: generateId('action'),
      type: 'set_lifecycle',
      category: 'point',
      target: entityRoot.id,
      slotIndex: currentSlotIndex.value,
      params: { spawned: true, autoDespawnOnBlockEnd: true }
    }
    appendActionWithSlotOrder(block.actions, spawnAction as unknown as Action)
  }
  
  // 更新 Episode Store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // 刷新场景
  loadSetupToSceneObjects(scene.setup)
  void refreshGhostRealStates()
  
  // 设置顶层根对象的 alias 和 extraInfo
  const templateRoot = result.objects.find(o => !o.parentId)
  if (templateRoot) {
    const uniqueAlias = sceneObjectStore.generateUniqueAlias(template.name)
    const extraInfo: CompositeExtraInfo = { kind: 'template', templateId: template.id }
    // v24: updateSetupObject 同时写入 setupState + runtimeState + episode
    sceneObjectStore.updateSetupObject(templateRoot.id, { alias: uniqueAlias, extraInfo } as Partial<SceneObject>)
  }

  if (firstObjectId) {
    sceneObjectStore.selectObject(firstObjectId)
  }
  
  markLocalChange()
}

// 演员/人物选择 — 实例化为 entity 模式的组合对象（Shadow Object 模式）
function handleCompositeCharacterSelectInAction(character: CompositeCharacter, displayName?: string, extraInfo?: CompositeExtraInfo): void {
  if (!props.sceneId || !props.episode) return
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  if (!block.actions) block.actions = []

  const pseudoTemplate: SceneTemplate = {
    id: character.id,
    name: character.name,
    objects: character.objects,
    createdAt: character.createdAt,
    ...(character.tags ? { tags: character.tags } : {}),
    ...(character.editorAnchor ? { editorAnchor: character.editorAnchor } : {}),
    ...(character.renderChain ? { renderChain: character.renderChain } : {}),
  }

  const result = instantiateTemplate(pseudoTemplate, CANVAS_CENTER_X, CANVAS_CENTER_Y, {
    wrapperCompositeMode: 'entity',
  })

  let firstObjectId: string | undefined
  // 构建查找表
  for (const obj of result.objects) {
    const uniqueAlias = sceneObjectStore.generateUniqueAlias(obj.alias ?? obj.name)
    if (uniqueAlias !== obj.alias) {
      obj.alias = uniqueAlias
    }

    // 所有对象 spawned=false（由 entity root 的 set_lifecycle 级联激活）
    obj.spawned = false

    // v24: 写入持久层（addSetupObject 自动同步到 episode）
    sceneObjectStore.addSetupObject(obj)

    if (!firstObjectId) firstObjectId = obj.id
  }

  // 仅对 entity root 创建 1 个 set_lifecycle
  const entityRoot = result.objects.find(o => !o.parentId)
  if (entityRoot) {
    const spawnAction: SetLifecycleAction = {
      id: generateId('action'),
      type: 'set_lifecycle',
      category: 'point',
      target: entityRoot.id,
      slotIndex: currentSlotIndex.value,
      params: { spawned: true, autoDespawnOnBlockEnd: true }
    }
    appendActionWithSlotOrder(block.actions, spawnAction as unknown as Action)
  }

  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  loadSetupToSceneObjects(scene.setup)
  void refreshGhostRealStates()

  // 设置顶层根对象的 alias 和 extraInfo
  const targetName = displayName ?? character.name
  const resolvedExtraInfo = extraInfo ?? { kind: 'character' as const, characterId: character.id }
  const charRoot = result.objects.find(o => !o.parentId)
  if (charRoot) {
    const uniqueAlias = sceneObjectStore.generateUniqueAlias(targetName)
    // v24: updateSetupObject 同时写入 setupState + runtimeState + episode
    sceneObjectStore.updateSetupObject(charRoot.id, { alias: uniqueAlias, extraInfo: resolvedExtraInfo } as Partial<SceneObject>)

    // 重映射 rootCompositeId（使用 idMap 将模板对象 ID 转为场景实例 ID）
    if (character.rootCompositeId) {
      const remappedRoot = result.idMap.get(character.rootCompositeId)
      if (remappedRoot) {
        sceneObjectStore.updateSetupObject(charRoot.id, {
          instanceRootCompositeId: remappedRoot,
        } as Partial<SceneObject>)
      }
    }
  }

  if (firstObjectId) {
    sceneObjectStore.selectObject(firstObjectId)
  }

  markLocalChange()
}

function handleActorSelect(character: CompositeCharacter, actorName: string, actorId: string): void {
  showActorPicker.value = false
  handleCompositeCharacterSelectInAction(character, actorName, { kind: 'actor', actorId })
}

function handleCharacterSelect(character: CompositeCharacter): void {
  showCharacterPicker.value = false
  handleCompositeCharacterSelectInAction(character)
}

// Clip-Mask Phase 1：视觉效果对话框中选择"裁切蒙版"分组时回调，
// 复用现有 mask_rectangle / mask_ellipse 路径
function handleAddMaskFromDialog(shape: 'rectangle' | 'ellipse') {
  showScreenEffectPicker.value = false
  handleAddMenuItemClick(shape === 'ellipse' ? 'mask_ellipse' : 'mask_rectangle')
}

// Phase 1: 处理画面特效选择
function handleScreenEffectSelect(preset: ScreenEffectPreset) {
  showScreenEffectPicker.value = false

  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return

  const effectId = generateId('sceneobject')
  const effectAlias = sceneObjectStore.generateUniqueAlias(preset.name)

  // 将对象加入 Scene Setup (spawned: false, 动态对象)
  const setupObj = {
    id: effectId,
    refId: preset.effectClass,
    type: 'screen_effect' as const,
    name: preset.name,
    effectClass: preset.effectClass,
    params: {
      baseColor: preset.params.baseColor ?? '#000000',
      openRatio: preset.params.openRatio ?? 1.0,
      feather: preset.params.feather ?? 0,
      ...preset.params
    },
    alias: effectAlias,
    x: CANVAS_CENTER_X,
    y: CANVAS_CENTER_Y,
    width: Math.round(CAMERA_BASE_WIDTH * 1.1),
    height: Math.round(CAMERA_BASE_HEIGHT * 1.1),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    zIndex: Z_INDEX_SCREEN_EFFECT,
    flipX: false,
    alpha: preset.defaultAlpha ?? 1,
    visible: true,
    spawned: false
  } as SceneObject
  // v24: addSetupObject 自动同步到 episode
  sceneObjectStore.addSetupObject(setupObj)

  // 添加出生 Action (set_lifecycle)
  const birthAction: SetLifecycleAction = {
    id: generateId('action'),
    type: 'set_lifecycle',
    category: 'point',
    target: effectId,
    slotIndex: currentSlotIndex.value,
    params: { spawned: true }
  }
  if (!block.actions) block.actions = []
  appendActionWithSlotOrder(block.actions, birthAction as unknown as Action)

  // 更新 Store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  // 刷新状态
  void refreshGhostRealStates()
  markLocalChange()

  // 选中新对象
  sceneObjectStore.selectObject(effectId)
}

// 判断选中对象是否可复制（非相机 + 在当前 Slot 存活）
const canCopySelectedObject = computed(() => {
  const selectedObj = sceneObjectStore.getSelectedObject()
  if (!selectedObj) return false
  if (selectedObj.type === 'camera') return false
  return aliveObjectIds.value.includes(selectedObj.id)
})

// v9.1: 判断选中对象是否可移除（所有存活的非相机对象均可移除）
const canDeleteSelectedObject = computed(() => {
  const selectedObj = sceneObjectStore.getSelectedObject()
  if (!selectedObj) return false
  if (selectedObj.type === 'camera') return false
  // v25: 环境光不可删除
  if (selectedObj.type === 'light' && (selectedObj as unknown as import('@/types/sceneObject').LightObject).lightType === 'ambient') return false
  // 所有在当前 Slot 存活的非相机对象都可移除
  return aliveObjectIds.value.includes(selectedObj.id)
})

// v9.1: 处理删除动态对象
function handleDeleteDynamicObject() {
  const selectedObj = sceneObjectStore.getSelectedObject()
  if (!selectedObj) return
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  // v9.3: 查找对象的出生 Slot (使用 SetLifecycleAction)
  const lifecycleActions = (block.actions ?? []).filter(
    (a: Action) => a.type === 'set_lifecycle' && a.target === selectedObj.id
  ) as SetLifecycleAction[]
  
  // 查找第一个 spawned: true 的出生 Action
  const birthAction = lifecycleActions
    .filter(a => a.params.spawned === true)
    .sort((a, b) => a.slotIndex - b.slotIndex)[0]
  
  const birthSlotIndex = birthAction?.slotIndex ?? -1
  const isAtBirthSlot = currentSlotIndex.value === birthSlotIndex
  const isShadowObject = sceneObjectStore.getSetupObject(selectedObj.id)?.spawned === false
  
  if (isShadowObject && isAtBirthSlot) {
    // 出生 Slot 删除 = 真删 (Setup + 所有 Actions)
    const alias = (selectedObj as unknown as { alias?: string }).alias || selectedObj.name || '该对象'
    const isCompositeObj = selectedObj.type === 'composite'
    
    // 递归收集所有后代 ID（含孙对象），从 runtime 数据读取 childIds
    // 方案A: setup 中 childIds 为空，需使用 getObject（runtimeObjects）
    function collectAllDescendantIds(parentId: string): string[] {
      const parentObj = sceneObjectStore.getObject(parentId)
      if (parentObj?.type !== 'composite') return []
      const directChildIds = [...((parentObj as unknown as { childIds?: string[] }).childIds || [])]
      const allIds = [...directChildIds]
      for (const childId of directChildIds) {
        allIds.push(...collectAllDescendantIds(childId))
      }
      return allIds
    }
    
    const descendantIds = isCompositeObj ? collectAllDescendantIds(selectedObj.id) : []
    
    if (isCompositeObj && descendantIds.length > 0) {
      const compositeMode = (selectedObj as unknown as { compositeMode?: string }).compositeMode ?? 'entity'
      if (compositeMode === 'entity') {
        // entity: 直接级联删除（不提供"仅删除组合"选项）
        confirmDialogConfig.value = {
          title: '删除组合对象',
          message: `确定要删除 "${alias}" 及其 ${descendantIds.length} 个子对象吗？`,
          confirmText: '删除',
          cancelText: '取消',
          isDanger: true,
          showSecondaryConfirm: false,
          secondaryConfirmText: '',
          onConfirm: () => {
            deleteCompositeObjects([selectedObj.id, ...descendantIds], selectedObj.id)
            showConfirmDialog.value = false
          },
          onSecondaryConfirm: () => { /* empty */ },
        }
        showConfirmDialog.value = true
      } else {
        // union: 两选项对话框 — 仅删除组合（子对象由 onBeforeDelete 自动冒泡）
        confirmDialogConfig.value = {
          title: '解散分组',
          message: `确定要解散 "${alias}" 吗？`,
          confirmText: '删除',
          cancelText: '取消',
          isDanger: true,
          showSecondaryConfirm: false,
          secondaryConfirmText: '',
          onConfirm: () => {
            deleteCompositeObjects([selectedObj.id], selectedObj.id)
            showConfirmDialog.value = false
          },
          onSecondaryConfirm: () => { /* empty */ },
        }
        showConfirmDialog.value = true
      }
      return
    }
    
    // 非 union 或无子对象：普通两选项删除
    confirmDialogConfig.value = {
      title: '删除对象',
      message: `确定要删除 "${alias}" 吗？此操作将删除该对象及其所有关联动作。`,
      confirmText: '删除',
      cancelText: '取消',
      isDanger: true,
      showSecondaryConfirm: false,
      secondaryConfirmText: '',
      onConfirm: () => {
        deleteCompositeObjects([selectedObj.id], selectedObj.type === 'composite' ? selectedObj.id : undefined)
        showConfirmDialog.value = false
      },
      onSecondaryConfirm: () => { /* empty */ },
    }
  } else {
    // v9.2: 其他 Slot 删除 = 插入 spawned: false Action (逻辑删除)
    const objAlias = (selectedObj as unknown as { alias?: string }).alias || selectedObj.name || '该对象'
    const isUnionComposite = selectedObj.type === 'composite'
      && ((selectedObj as unknown as { compositeMode?: string }).compositeMode ?? 'entity') === 'union'

    confirmDialogConfig.value = {
      title: isUnionComposite ? '解散分组' : '移除对象',
      message: isUnionComposite
        ? `确定要解散 "${objAlias}" 吗？`
        : `确定要移除 "${objAlias}" 吗？该对象从此处开始将不再显示。`,
      confirmText: isUnionComposite ? '删除' : '移除',
      cancelText: '取消',
      isDanger: isUnionComposite,
      showSecondaryConfirm: false,
      secondaryConfirmText: '',
      onConfirm: () => {
        // v9.3: 插入 set_lifecycle Action (消亡)
        const despawnAction: SetLifecycleAction = {
          id: `action_despawn_${Date.now()}`,
          type: 'set_lifecycle',
          category: 'point',
          target: selectedObj.id,
          slotIndex: currentSlotIndex.value,
          params: {
            spawned: false
          }
        }
        
        if (!block.actions) {
          block.actions = []
        }
        appendActionWithSlotOrder(block.actions, despawnAction as unknown as Action)
        
        // 更新 Store
        const episodeId = route.params['id'] as string
        episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
          actions: block.actions
        })
        
        void refreshGhostRealStates()
        
        showConfirmDialog.value = false
        markLocalChange()
      },
      onSecondaryConfirm: () => { /* empty */ },
    }
  }
  showConfirmDialog.value = true
}

// P2: ActionEditor 成组模式状态机 (PRD 8.3/8.5)
type ActionGroupingState =
  | { mode: 'create'; pendingIds: string[] }
  | { mode: 'addTo'; compositeId: string; pendingIds: string[] }
  | null

const actionGroupingState = ref<ActionGroupingState>(null)

// P2: 获取对象显示名称
function getObjectDisplayName(objectId: string): string {
  const obj = sceneObjectStore.getObject(objectId)
  if (!obj) return objectId
  return (obj as unknown as { alias?: string }).alias ?? obj.name ?? '未命名'
}

// P2: 获取组合对象显示名称（addTo 模式用）
function getCompositeDisplayName(compositeId: string | undefined): string {
  if (!compositeId) return '未知'
  return getObjectDisplayName(compositeId)
}

function appendActionWithSlotOrder(actions: Action[], action: Action): void {
  const mode = getActionOrderModeForSlot(actions, action.slotIndex)
  actions.push(action)
  if (mode === 'custom') {
    reconcileActionOrderForSlot(actions, action.slotIndex, {
      mode: 'custom',
      appendActionId: action.id,
      objectIndexMap: getActionObjectIndexMap(),
    })
  } else {
    delete action.order
  }
}

// P2: 进入成组模式
function handleStartGrouping() {
  actionGroupingState.value = { mode: 'create', pendingIds: [] }
}

// v19: 成组模式 compositeMode 选择
const selectedCompositeMode = ref<'entity' | 'union'>('union')

/** 从运行时对象构建成组对象树（仅 spawned 且非 camera） */
const actionGroupingTreeNodes = computed<GroupingTreeNode[]>(() => {
  const objects: SceneObject[] = sceneObjectStore.objects.filter(
    (o): o is SceneObject => o.type !== 'camera' && (o as unknown as { spawned?: boolean }).spawned !== false
  )
  const objectMap = new Map<string, SceneObject>(objects.map(o => [o.id, o]))

  function buildNode(obj: SceneObject, depth: number): GroupingTreeNode {
    const displayName = (obj as unknown as { alias?: string }).alias ?? obj.name ?? '未命名'
    const children: GroupingTreeNode[] = []

    if (obj.type === 'composite') {
      const comp = obj as unknown as { childIds: string[]; compositeMode?: string }
      for (const childId of comp.childIds) {
        const child = objectMap.get(childId)
        if (child && child.type !== 'camera') {
          children.push(buildNode(child, depth + 1))
        }
      }
    }

    return {
      id: obj.id,
      name: displayName,
      icon: getTypeIcon(obj.type),
      depth,
      parentId: obj.parentId,
      children,
    }
  }

  return objects
    .filter((o): o is SceneObject => !o.parentId)
    .sort((a, b) => b.zIndex - a.zIndex)
    .map(o => buildNode(o, 0))
})

/** 当前层级锁定的 parentId（由第一个 pending 对象决定） */
const lockedGroupingParentId = computed<string | undefined | null>(() => {
  if (!actionGroupingState.value) return null
  const ids = actionGroupingState.value.pendingIds
  if (ids.length === 0) return null
  const firstObj = sceneObjectStore.getObject(ids[0]!)
  return firstObj?.parentId
})

/** 内联列表 toggle 选中 */
function handleGroupingToggleById(objectId: string): void {
  if (!actionGroupingState.value) return

  const selectedObj = sceneObjectStore.getObject(objectId)
  if (!selectedObj || selectedObj.type === 'camera') return

  const pendingIds = actionGroupingState.value.pendingIds

  // addTo 模式下：不可选择目标 composite 自身或其后代
  if (actionGroupingState.value.mode === 'addTo') {
    const compositeId = actionGroupingState.value.compositeId
    if (objectId === compositeId) return
    let current = selectedObj
    while (current.parentId) {
      if (current.parentId === compositeId) return
      const parent = sceneObjectStore.getObject(current.parentId)
      if (!parent) break
      current = parent
    }
  }

  // toggle
  const idx = pendingIds.indexOf(objectId)
  if (idx !== -1) {
    pendingIds.splice(idx, 1)
  } else {
    // 同级兄弟规则
    if (pendingIds.length > 0) {
      const firstObj = sceneObjectStore.getObject(pendingIds[0]!)
      const requiredParentId = firstObj?.parentId
      if (selectedObj.parentId !== requiredParentId) {
        const toast = useToast()
        toast.warning('仅支持选择同级对象进行成组')
        return
      }
    }
    pendingIds.push(objectId)
  }
}

// P2: 画布点击 — 成组模式下 toggle 对象选中
function handleCanvasClickForGrouping() {
  if (!actionGroupingState.value) return

  // 获取当前选中的对象（通过 useSceneRenderer 的 hit-test）
  const selectedObj = sceneObjectStore.getSelectedObject()
  if (!selectedObj || selectedObj.type === 'camera') return

  const objectId = selectedObj.id
  const pendingIds = actionGroupingState.value.pendingIds

  // addTo 模式下：不可选择目标 composite 自身或其后代
  if (actionGroupingState.value.mode === 'addTo') {
    const compositeId = actionGroupingState.value.compositeId
    if (objectId === compositeId) {
      const toast = useToast()
      toast.warning('不能将组合对象自身添加为其成员')
      return
    }
    // 沿 parentId 链向上遍历，检查是否已是目标 composite 的后代
    let current = selectedObj
    while (current.parentId) {
      if (current.parentId === compositeId) {
        const toast = useToast()
        toast.warning('该对象已是此组合对象的后代，不可重复添加')
        return
      }
      const parent = sceneObjectStore.getObject(current.parentId)
      if (!parent) break
      current = parent
    }
  }

  // toggle: 已在列表中则移除，否则添加
  const idx = pendingIds.indexOf(objectId)
  if (idx !== -1) {
    pendingIds.splice(idx, 1)
  } else {
    // 同级兄弟规则：参与成组的对象必须共享同一个 parentId
    // 第一个选入的对象确定 parentId 基准，后续选入的对象必须匹配
    if (pendingIds.length > 0) {
      const firstObj = sceneObjectStore.getObject(pendingIds[0]!)
      const requiredParentId = firstObj?.parentId
      if (selectedObj.parentId !== requiredParentId) {
        const toast = useToast()
        toast.warning('仅支持选择同级对象进行成组')
        return
      }
    }
    pendingIds.push(objectId)
  }
}

function getOrCreateSceneStructureAction(actions: Action[], slotIndex: number): SetSceneStructureAction {
  const existing = actions.find(
    (action): action is SetSceneStructureAction =>
      action.type === 'set_scene_structure'
      && action.target === SCENE_ACTION_TARGET
      && action.slotIndex === slotIndex
  )
  if (existing) return existing

  const structureAction: SetSceneStructureAction = {
    id: generateId('action'),
    type: 'set_scene_structure',
    category: 'point',
    target: SCENE_ACTION_TARGET,
    slotIndex,
    params: {
      operations: [],
    },
  }
  appendActionWithSlotOrder(actions, structureAction as Action)
  return structureAction
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function appendSceneStructureOperation(
  actions: Action[],
  slotIndex: number,
  operation: SceneStructureOperation,
): void {
  const structureAction = getOrCreateSceneStructureAction(actions, slotIndex)
  structureAction.params.operations.push(operation)
  selectedAction.value = structureAction as unknown as Action
}

function upsertGroupSceneStructureOperation(
  actions: Action[],
  slotIndex: number,
  groupId: string,
  memberIds: readonly string[],
  parentId: string | null,
): void {
  const structureAction = getOrCreateSceneStructureAction(actions, slotIndex)
  const existing = structureAction.params.operations.find(
    operation => operation.kind === 'group' && operation.groupId === groupId
  )
  if (existing?.kind === 'group') {
    existing.memberIds = uniqueIds([...existing.memberIds, ...memberIds])
    existing.parentId = parentId
    selectedAction.value = structureAction as unknown as Action
    return
  }

  structureAction.params.operations.push({
    id: generateId('structure_op'),
    kind: 'group',
    groupId,
    memberIds: uniqueIds(memberIds),
    parentId,
  })
  selectedAction.value = structureAction as unknown as Action
}

function appendUngroupSceneStructureOperation(
  actions: Action[],
  slotIndex: number,
  groupId: string,
  memberIds: readonly string[],
  restoreParentId: string | null,
  groupParentId: string | null = null,
): void {
  appendSceneStructureOperation(actions, slotIndex, {
    id: generateId('structure_op'),
    kind: 'ungroup',
    groupId,
    memberIds: uniqueIds(memberIds),
    groupParentId,
    restoreParentId,
  })
}

function appendReparentSceneStructureOperation(
  actions: Action[],
  slotIndex: number,
  objectIds: readonly string[],
  parentId: string | null,
): void {
  appendSceneStructureOperation(actions, slotIndex, {
    id: generateId('structure_op'),
    kind: 'reparent',
    objectIds: uniqueIds(objectIds),
    parentId,
  })
}

function getNamespaceRootForParentId(parentId: string | null): string | null {
  let currentId = parentId ?? undefined
  while (currentId) {
    const parent = sceneObjectStore.getObject(currentId)
    if (!parent) return null
    if (parent.type === 'composite') {
      const mode = (parent as unknown as { compositeMode?: string }).compositeMode ?? 'entity'
      if (mode === 'entity') return parent.id
    }
    currentId = parent.parentId
  }
  return null
}

function getGroupingCompositePlacement(
  pendingIds: readonly string[],
  fallbackParentId: string | null,
): { x: number; y: number; width: number; height: number } {
  const sceneGraph = renderer.value?.getSceneGraph()
  if (!sceneGraph) {
    return { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: 0, height: 0 }
  }

  const containers = pendingIds
    .map(id => sceneGraph.getContainer(id))
    .filter((container): container is PIXI.Container => Boolean(container && !container.destroyed))

  if (containers.length === 0) {
    return { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: 0, height: 0 }
  }

  const referenceContainer = containers[0]?.parent
    ?? (fallbackParentId ? sceneGraph.getContainer(fallbackParentId)?.parent : undefined)
    ?? (fallbackParentId ? sceneGraph.getContainer(fallbackParentId) : undefined)

  if (referenceContainer?.parent && !referenceContainer.destroyed) {
    referenceContainer.updateTransform()
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const container of containers) {
    if (container.parent && !container.destroyed) {
      container.updateTransform()
    }
    const bounds = container.getBounds()
    if (bounds.width > 0 || bounds.height > 0) {
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.width)
      maxY = Math.max(maxY, bounds.y + bounds.height)
      continue
    }

    const point = container.toGlobal(new PIXI.Point(0, 0))
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: 0, height: 0 }
  }

  const centerGlobal = new PIXI.Point((minX + maxX) / 2, (minY + maxY) / 2)
  const centerLocal = referenceContainer
    ? referenceContainer.toLocal(centerGlobal)
    : centerGlobal

  return {
    x: centerLocal.x,
    y: centerLocal.y,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * P2: 在同一 slot 下，确保一个 composite 对象只有一个 set_composite action（Upsert 语义）。
 * - 若已存在同 slot + 同 target 的 set_composite → 合并 params
 * - 若不存在 → 创建新 action 并 push
 * 创建/更新后自动选中该 action，跳转到 ActionInspector。
 */
function upsertSetCompositeAction(
  actions: Action[],
  target: string,
  slotIndex: number,
  params: { compositeMode?: 'entity' | 'union'; renderChain?: string[] }
): void {
  const existing = actions.find(
    (a) => a.type === 'set_composite' && a.target === target && a.slotIndex === slotIndex
  )
  if (existing) {
    // 合并 params（保留已有的其他字段）
    const existingParams = (existing as unknown as { params: Record<string, unknown> }).params
    Object.assign(existingParams, params)
    // 自动选中
    selectedAction.value = existing
  } else {
    const newAction: Action = {
      id: generateId('action'),
      type: 'set_composite',
      category: 'point',
      target,
      slotIndex,
      params: { ...params }
    } as unknown as Action
    appendActionWithSlotOrder(actions, newAction)
    // 自动选中
    selectedAction.value = newAction
  }
}

/**
 * Clip-Mask Phase 1 D2: Upsert set_mask Action（同 slot + 同 target 合并）。
 * - 若已存在同 slot + 同 target 的 set_mask → 合并 params（targetIds/shape/width/height 各自整段覆盖）
 * - 若不存在 → 创建新 action
 * 跨 mask 独占冲突由 sceneStateCalculator post-pass 处理（见 §3 D1.5）。
 */
function upsertSetMaskAction(
  actions: Action[],
  target: string,
  slotIndex: number,
  params: { targetIds?: string[]; shape?: 'rectangle' | 'ellipse'; width?: number; height?: number }
): void {
  const existing = actions.find(
    (a) => a.type === 'set_mask' && a.target === target && a.slotIndex === slotIndex
  )
  if (existing) {
    const existingParams = (existing as unknown as { params: Record<string, unknown> }).params
    if (params.targetIds !== undefined) existingParams['targetIds'] = [...params.targetIds]
    if (params.shape !== undefined) existingParams['shape'] = params.shape
    if (params.width !== undefined) existingParams['width'] = params.width
    if (params.height !== undefined) existingParams['height'] = params.height
    selectedAction.value = existing
  } else {
    const newAction: SetMaskAction = {
      id: generateId('action'),
      type: 'set_mask',
      category: 'point',
      target,
      slotIndex,
      params: {
        ...(params.targetIds !== undefined ? { targetIds: [...params.targetIds] } : {}),
        ...(params.shape !== undefined ? { shape: params.shape } : {}),
        ...(params.width !== undefined ? { width: params.width } : {}),
        ...(params.height !== undefined ? { height: params.height } : {}),
      },
    }
    appendActionWithSlotOrder(actions, newAction as unknown as Action)
    selectedAction.value = newAction as unknown as Action
  }
}

// P2: 确认成组（Action Mode 特有逻辑）
function handleGroupingConfirm() {
  if (!actionGroupingState.value) return
  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  if (!block.actions) {
    block.actions = []
  }

  if (actionGroupingState.value.mode === 'create') {
    if (actionGroupingState.value.pendingIds.length < 2) return

    const pendingIds = actionGroupingState.value.pendingIds

    // 1. 检测公共父对象（用于嵌套组合自动继承）
    let commonParentId: string | null = null
    let allSameParent = true
    for (const childId of pendingIds) {
      const childObj = sceneObjectStore.getObject(childId)
      const effectiveParentId = childObj?.parentId ?? null
      if (commonParentId === null && allSameParent) {
        commonParentId = effectiveParentId
      } else if (effectiveParentId !== commonParentId) {
        allSameParent = false
      }
    }

    const compositeParentId = allSameParent ? commonParentId : null
    const namespaceRootId = getNamespaceRootForParentId(compositeParentId)
    const placement = getGroupingCompositePlacement(pendingIds, compositeParentId)

    // 2. 在 sceneObjectStore + Setup 中创建 composite（spawned: false）
    // Action Mode 成组固定为 union 模式
    const composite = sceneObjectStore.createCompositeObject('组合', [], undefined, undefined, 'union', namespaceRootId)
    const compositeSetupObj = {
      id: composite.id,
      type: 'composite' as const,
      name: composite.name,
      alias: composite.alias,
      refId: '',
      childIds: [],
      compositeLocked: true,
      compositeMode: 'union' as const,
      x: placement.x,
      y: placement.y,
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: composite.zIndex,
      visible: true,
      spawned: false,
      // 嵌套组合：如果所有待组对象有相同的父对象，composite 直接继承
      ...(compositeParentId ? { parentId: compositeParentId } : {}),
    } as SceneObject
    // v24: addSetupObject 自动同步到 episode
    sceneObjectStore.addSetupObject(compositeSetupObj)
    // 3. 更新当前 slot 的唯一 set_scene_structure：保存这次用户成组操作
    upsertGroupSceneStructureOperation(block.actions, currentSlotIndex.value, composite.id, pendingIds, compositeParentId)

  } else if (actionGroupingState.value.mode === 'addTo') {
    if (actionGroupingState.value.pendingIds.length === 0) return

    appendReparentSceneStructureOperation(
      block.actions,
      currentSlotIndex.value,
      actionGroupingState.value.pendingIds,
      actionGroupingState.value.compositeId
    )
  }

  // 更新 Episode Store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  // 刷新渲染（重新加载 Setup 以反映新的 composite）
  loadSetupToSceneObjects(scene.setup)

  // 关键：loadSetupToSceneObjects 调用 setActionMode(true)，重建 runtimeObjects（无 parentId）。
  // 必须在 Vue 响应式 flush 前同步计算 slot states 并写入 parentId，
  // 否则 ActionSequencer.allTracks 会在 parentId=undefined 时重算，导致无法正确渲染树形结构。
  const sceneGraph = renderer.value?.getSceneGraph()
  if (sceneGraph) {
    sceneGraph.updateSlotIndex(currentSlotIndex.value)
    const slotStates = sceneGraph.getGhostStates()
    if (slotStates) {
      sceneObjectStore.applySlotState(slotStates)
    }
  }

  void refreshGhostRealStates()
  markLocalChange()

  actionGroupingState.value = null
}

// P2: 取消成组
function handleGroupingCancel() {
  actionGroupingState.value = null
}

// P2: 处理来自 ObjectPropertiesPanel 的 composite 操作事件 (方案 B)
function handleCompositeAction(payload: { action: 'removeChild'; childId: string } | { action: 'ungroupAll'; compositeId: string } | { action: 'addMember'; compositeId: string } | { action: 'setCompositeLocked'; compositeId: string; locked: boolean } | { action: 'reorderRenderChain'; compositeId: string; renderChain: string[] }) {
  if (payload.action === 'addMember') {
    // P2: Action Mode 下进入 addTo 模式，通过场景级结构动作添加成员
    actionGroupingState.value = {
      mode: 'addTo',
      compositeId: payload.compositeId,
      pendingIds: []
    }
    return
  }

  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  if (!block.actions) {
    block.actions = []
  }

  if (payload.action === 'removeChild') {
    const child = sceneObjectStore.getObject(payload.childId)
    const parent = child?.parentId ? sceneObjectStore.getObject(child.parentId) : undefined
    appendReparentSceneStructureOperation(block.actions, currentSlotIndex.value, [payload.childId], parent?.parentId ?? null)
  } else if (payload.action === 'ungroupAll') {
    const composite = sceneObjectStore.getObject(payload.compositeId)
    if (composite?.type !== 'composite') return

    const childIds = (composite as unknown as { childIds?: string[] }).childIds ?? []
    const nextParentId = composite.parentId ?? null
    appendUngroupSceneStructureOperation(block.actions, currentSlotIndex.value, payload.compositeId, childIds, nextParentId)
  } else if (payload.action === 'setCompositeLocked') {
    // compositeLocked 是 UI-only 属性，不创建 Action
    // 双层架构：通过 updateSetupObject 同时写入持久层和显示层
    // v24: updateSetupObject 自动同步到 episode
    sceneObjectStore.updateSetupObject(payload.compositeId, { compositeLocked: payload.locked } as Partial<SceneObject>)
    return  // 无需更新 block.actions
  } else if (payload.action === 'reorderRenderChain') {
    // P2: Upsert set_composite Action 修改 renderChain 排序
    upsertSetCompositeAction(
      block.actions,
      payload.compositeId,
      currentSlotIndex.value,
      { renderChain: payload.renderChain }
    )
  }

  // 更新 Store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  void refreshGhostRealStates()
  markLocalChange()
}

/**
 * 复制选中对象（快照式复制）
 * - 在当前 Slot 创建一个新的 Shadow Object
 * - 使用原对象在当前 Slot 的完整 SceneObject 状态
 * - 不复制原对象的 Actions
 */
function cloneSceneObjectSnapshot<T extends SceneObject>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}

function isActionTargetForObject(action: Action, obj: SceneObject): boolean {
  return action.target === obj.id || (!!obj.alias && action.target === obj.alias)
}

function getCurrentSlotObjectSnapshot(
  objectId: string,
  prevContextObjects: SceneObject[],
  block: ScriptBlock,
  slots: ReturnType<typeof parseBlockToSlots>
): SceneObject | undefined {
  const runtimeObj = sceneObjectStore.getObject(objectId)
  const contextObj = prevContextObjects.find(o => o.id === objectId)
  if (runtimeObj) {
    return cloneSceneObjectSnapshot(runtimeObj)
  }

  if (!contextObj) {
    return undefined
  }

  const objectActions = (block.actions ?? []).filter((a: Action) => isActionTargetForObject(a, contextObj))
  const evalState = evaluateObjectStateBySlot(
    contextObj,
    objectActions,
    currentSlotIndex.value,
    slots,
    {
      getObjectState: (id: string) => {
        const o = prevContextObjects.find(obj => obj.id === id)
        return o ? (o as unknown as WriteableState) : undefined
      }
    }
  )

  return cloneSceneObjectSnapshot(evalState)
}

function handleCopyObject() {
  const selectedObj = sceneObjectStore.getSelectedObject()
  if (!selectedObj || selectedObj.type === 'camera') return
  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return

  // 从持久层获取对象结构（type、refId 等不可变字段用于 spread 复制）
  const originalSetup = sceneObjectStore.getSetupObject(selectedObj.id)
  if (!originalSetup) return
  // 计算原对象在当前 Slot 的运行时状态
  const prevContext = calculatePrevContext(scene, block.id)
  const slots = currentBlockSlots.value
  const currentSnapshot = getCurrentSlotObjectSnapshot(selectedObj.id, prevContext.objects, block, slots)
  if (!currentSnapshot) return

  // 生成新 ID 和别名
  const newId = generateId('sceneobject')
  const newAlias = sceneObjectStore.generateUniqueAlias(
    originalSetup.alias || selectedObj.name || '副本'
  )

  // composite 复制：按“模板实例化”路径复制整棵子树（ID/childIds/renderChain 一次性重映射）
  if (originalSetup.type === 'composite') {
    const originalCompositeMode = (originalSetup as unknown as { compositeMode?: 'entity' | 'union' }).compositeMode ?? 'entity'
    const snapshotObjects = scene.setup.objects.map(obj =>
      getCurrentSlotObjectSnapshot(obj.id, prevContext.objects, block, slots) ?? cloneSceneObjectSnapshot(obj)
    )
    const template = snapshotToTemplate(
      [currentSnapshot],
      snapshotObjects,
      `${originalSetup.name} 副本`
    )
    const result = instantiateTemplate(template, currentSnapshot.x + 50, currentSnapshot.y + 50,
      originalCompositeMode === 'union'
        ? { autoWrapComposite: true, wrapperCompositeMode: 'entity' }
        : { autoWrapComposite: false }
    )
    const copiedRoot = result.objects.find(o => !o.parentId)
    if (!copiedRoot) return

    // union 复制时会自动包装 entity 根，运行时姿态应应用到 union 本体而非 wrapper
    let poseTargetId = copiedRoot.id
    if (originalCompositeMode === 'union') {
      const copiedUnion = result.objects.find(o =>
        o.type === 'composite'
        && (o as unknown as { compositeMode?: 'entity' | 'union' }).compositeMode === 'union'
        && o.parentId === copiedRoot.id
      )
      if (copiedUnion) {
        poseTargetId = copiedUnion.id
      }
    }

    for (const obj of result.objects) {
      obj.spawned = false
      sceneObjectStore.addSetupObject(obj)
    }

    // 根对象使用当前 Slot 的运行时姿态，保持“快照复制”语义。
    // 其他字段已由 snapshotToTemplate/instantiateTemplate 从当前快照复制。
    sceneObjectStore.updateSetupObject(poseTargetId, {
      alias: newAlias,
      x: currentSnapshot.x + 50,
      y: currentSnapshot.y + 50,
      scaleX: currentSnapshot.scaleX,
      scaleY: currentSnapshot.scaleY,
      rotation: currentSnapshot.rotation,
      alpha: currentSnapshot.alpha,
      spawned: false,
    } as Partial<SceneObject>)

    const spawnAction: SetLifecycleAction = {
      id: generateId(),
      type: 'set_lifecycle',
      category: 'point',
      target: copiedRoot.id,
      slotIndex: currentSlotIndex.value,
      params: {
        spawned: true,
        autoDespawnOnBlockEnd: true
      }
    }

    if (!block.actions) {
      block.actions = []
    }
    appendActionWithSlotOrder(block.actions, spawnAction as unknown as Action)

    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })

    loadSetupToSceneObjects(scene.setup)
    void refreshGhostRealStates()
    sceneObjectStore.selectObject(poseTargetId)
    markLocalChange()
    return
  }

  // 构造新的 Setup 对象 (spawned: false)
  const newSetupObject: SceneObject = {
    ...currentSnapshot,
    id: newId,
    alias: newAlias,
    x: currentSnapshot.x + 50,
    y: currentSnapshot.y + 50,
    spawned: false,

  }

  // 创建出生 Action
  const spawnAction: SetLifecycleAction = {
    id: generateId(),
    type: 'set_lifecycle',
    category: 'point',
    target: newId,
    slotIndex: currentSlotIndex.value,
    params: {
      spawned: true,
      autoDespawnOnBlockEnd: true
    }
  }

  // 注入场景（复用已有逻辑）
  addShadowObjectToScene(newSetupObject, spawnAction)
}

// v9.1: 获取相机中心位置
function getCameraCenterPosition(): { x: number; y: number } {
  const cameraObj = sceneObjectStore.objects.find(obj => obj.type === 'camera')
  if (cameraObj) {
    return { x: cameraObj.x, y: cameraObj.y }
  }
  // 默认画布中心
  return { x: 960, y: 540 }
}

// v9.1: 添加 Shadow Object 到场景
// v9.3: spawnAction 类型改为 SetLifecycleAction
function addShadowObjectToScene(
  setupObject: SceneObject,
  spawnAction: SetLifecycleAction
) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  // 1. v24: addSetupObject 自动同步到 episode
  sceneObjectStore.addSetupObject(setupObject)
  // v16: 注入帧动画定义（元件等对象需要自动发现帧动画）
  useAnimationStore().hydrateObjectAnimations(setupObject)
  // v24 (Review F1): hydration 修改了 setupObject.animations，需回写到 episode
  if (setupObject.animations && Object.keys(setupObject.animations).length > 0) {
    sceneObjectStore.updateSetupObject(setupObject.id, {
      animations: setupObject.animations,
    } as Partial<SceneObject>)
  }
  
  // 2. 添加出生 Action 到 Block
  if (!block.actions) {
    block.actions = []
  }
  appendActionWithSlotOrder(block.actions, spawnAction as unknown as Action)
  
  // 3. 更新 Episode Store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // 4. 刷新场景对象和渲染
  loadSetupToSceneObjects(scene.setup)
  void refreshGhostRealStates()
  
  // 5. 选中新添加的对象
  sceneObjectStore.selectObject(setupObject.id)
  
  markLocalChange()
}

// v24: syncEpisodeRenderChain 已迁移到 sceneObjectStore.syncRegisteredEpisodeRenderChain

// v9.1: 处理背景选择
async function handleBackgroundSelect(background: { id: string; name: string }) {
  showBackgroundPicker.value = false
  
  if (!props.sceneId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  
  const cameraCenter = getCameraCenterPosition()
  
  const { setupObject, spawnAction } = createShadowObject({
    scene,
    block,
    slotIndex: currentSlotIndex.value,
    objectType: 'background',
    resourceId: background.id,
    resourceName: background.name,
    cameraCenterX: cameraCenter.x,
    cameraCenterY: cameraCenter.y
  })
  await applyMeasuredDefaultSize(setupObject, (_id, updates) => {
    Object.assign(setupObject, updates)
  })
  
  addShadowObjectToScene(setupObject, spawnAction)
}

// v9.1: 处理道具选择
async function handlePropSelect(prop: { id: string; name?: string }) {
  showPropPicker.value = false
  
  if (!props.sceneId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  
  const cameraCenter = getCameraCenterPosition()
  
  const { setupObject, spawnAction } = createShadowObject({
    scene,
    block,
    slotIndex: currentSlotIndex.value,
    objectType: 'prop',
    resourceId: prop.id,
    resourceName: prop.name ?? '',
    cameraCenterX: cameraCenter.x,
    cameraCenterY: cameraCenter.y
  })
  await applyMeasuredDefaultSize(setupObject, (_id, updates) => {
    Object.assign(setupObject, updates)
  })
  
  addShadowObjectToScene(setupObject, spawnAction)
}

// v18: 处理表情选择 — 创建 Shadow Object
async function handleExpressionSelect(expressionId: string) {
  showExpressionPicker.value = false
  
  if (!props.sceneId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  
  const exprStore = useExpressionStore()
  const expr = exprStore.getExpression(expressionId)
  const exprName = expr?.name ?? '表情'
  
  const cameraCenter = getCameraCenterPosition()
  
  const { setupObject, spawnAction } = createShadowObject({
    scene,
    block,
    slotIndex: currentSlotIndex.value,
    objectType: 'expression',
    resourceId: expressionId,
    resourceName: exprName,
    cameraCenterX: cameraCenter.x,
    cameraCenterY: cameraCenter.y
  })
  await applyMeasuredDefaultSize(setupObject, (_id, updates) => {
    Object.assign(setupObject, updates)
  })
  
  addShadowObjectToScene(setupObject, spawnAction)
}

// v9.1: 处理音频选择
function handleSoundSelect(sound: { id: string; name: string }) {
  showSoundPicker.value = false
  
  if (!props.sceneId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!scene || !block) return
  
  const cameraCenter = getCameraCenterPosition()
  
  const { setupObject, spawnAction } = createShadowObject({
    scene,
    block,
    slotIndex: currentSlotIndex.value,
    objectType: 'audio',
    resourceId: sound.id,
    resourceName: sound.name,
    cameraCenterX: cameraCenter.x,
    cameraCenterY: cameraCenter.y
  })
  
  addShadowObjectToScene(setupObject, spawnAction)
}

// 预览对话框
const showPreviewDialog = ref(false)

// 保存提示状态
const showSaveToast = ref(false)
const saveToastMessage = ref('')
const saveToastType = ref<'success' | 'error'>('success')

// 全屏状态
const isFullscreen = ref(false)

// 侧边栏状态
// v8.6: leftPanelCollapsed 和 leftPanelWidth 已移除（左侧边栏删除）
const rightPanelCollapsed = ref(false)
const rightPanelWidth = ref(320)


// Action 相关状态
const selectedAction = ref<Action | null>(null)
const currentSlotIndex = ref<number>(0)
// v7.55: 进入 ActionInspector 时要自动聚焦的字段
const actionFocusField = ref<'pose' | 'layerPreset' | 'expression' | 'partAsset' | null>(null)
// const currentTime = ref(0) // v7.17: 已移除，Action Mode 仅依赖 Slot

// 页面级保存状态标记（仅跟踪本次编辑会话的修改）
const hasLocalChanges = ref(false)
function markLocalChange() {
  hasLocalChanges.value = true
  projectStore.markAsUnsaved()
}

// v6.5: 相机动作录制模式 (Cut: 瞬时, Move: 运镜)
const cameraRecordMode = ref<'camera_cut' | 'camera_move'>('camera_cut')

// v9.2: 对象录制模式 (动画: tween_transform, 布局: set_transform)
const objectRecordMode = ref<'animation' | 'layout'>('layout')

// 时间戳


// 保存确认对话框状态
const showSaveConfirmDialog = ref(false)

// v8.3: 文本编辑对话框状态
const showTextEditDialog = ref(false)
const editingText = ref('')

// 是否有未保存的修改


// v8.6: isResizingLeftPanel 已移除（左侧边栏删除）
let isResizingRightPanel = false

// 当前Block
const currentBlock = computed(() => {
  if (props.sceneId && props.blockId && props.episode) {
    const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
    if (scene) {
      return scene.script.find((b: ScriptBlock) => b.id === props.blockId) ?? null
    }
  }
  return null
})
const currentBlockDescription = computed(() => {
  if (props.sceneId && props.blockId && props.episode) {
    const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
    if (scene) {
      const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
      if (block) {
        if (block.type === 'dialogue') {
          const dialogueBlock = block
          const instanceId = dialogueBlock.instanceId
          const instance = sceneObjectStore.getObject(instanceId)
          
          let targetName = '未知角色'
          if (instance) {
            // v7.57: 优先使用别名，其次是演员名称，最后是ID
            // 使用 length 判断以避免 eslint prefer-nullish-coalescing 报错，同时确保空字符串回退
            if (instance.type === 'background') {
               // 背景对象
               targetName = instance.alias ?? instance.name ?? instance.id
            } else {
               const alias = instance.alias
               const refId = instance.refId
               targetName = (alias && alias.length > 0) ? alias : ((refId && refId.length > 0) ? refId : instance.id)
            }
          }
          
          return `${targetName}: ${dialogueBlock.text}`
        } else if (block.type === 'narration') {
          return `旁白: ${(block).text}`
        }
      }
    }
  }
  return '未知Block'
})

// v8.3: 截断显示的描述（最多10字+省略号）
const truncatedBlockDescription = computed(() => {
  const desc = currentBlockDescription.value
  if (desc.length > 10) {
    return desc.substring(0, 10) + '...'
  }
  return desc
})

const currentBlockDuration = computed(() => {
  if (!currentBlock.value) return 0
  if (currentBlock.value.type === 'action') {
    return currentBlock.value.duration
  }
  if (currentBlock.value.type === 'dialogue' || currentBlock.value.type === 'narration') {
    return (currentBlock.value).ttsConfig?.duration ?? 0
  }
  return 0
})

const currentBlockSlots = computed(() => {
  if (!currentBlock.value) return []
  return parseBlockToSlots(currentBlock.value)
})

const currentBlockActions = computed(() => {
  return currentBlock.value?.actions ?? []
})

// 双层架构：accumulatedParentIds 已移除
// parentId 由 applySlotState() 直接写入 runtimeObjects，所有消费者直接从 store 读取

// v12.7: 计算当前 Slot 有生命的对象 ID 列表（用于 ObjectPropertiesPanel 过滤）
// 由于 Action Mode 下 sceneObjectStore.objects 返回的是 runtimeState.objects，
// 它们已经经过 sceneStateCalculator 基于动作 (含 set_lifecycle 级联) 计算过了，
// 因此可以直接遍历出真正的生存状态。
// 响应性保证：slot 切换时 handleSlotIndexChange 同步调用 applySlotState，
// runtimeState.objects 在同一调用栈内完成更新，computed 惰性求值不会读到过期数据。
const aliveObjectIds = computed(() => {
  return sceneObjectStore.objects
    .filter(obj => obj.spawned !== false)
    .map(obj => obj.id)
})

// v17: 保存为场景模板
const showSaveTemplateDialog = ref(false)
const aliveNonCameraObjects = computed(() =>
  sceneObjectStore.objects.filter(o => o.type !== 'camera' && aliveObjectIds.value.includes(o.id))
)

function handleSaveTemplateSaved(_templateId: string) {
  showSaveTemplateDialog.value = false
}

// v9.3: 当 slot 切换导致选中对象失去生命时，自动取消选中
watch(aliveObjectIds, (newAliveIds) => {
  const selectedId = sceneObjectStore.selectedObjectId
  if (!selectedId) return
  
  // 相机始终保持选中（不受 spawned 影响）
  const selectedObj = sceneObjectStore.getObject(selectedId)
  if (selectedObj?.type === 'camera') return
  
  // 如果选中对象不在有生命列表中，取消选中
  if (!newAliveIds.includes(selectedId)) {
    sceneObjectStore.selectObject(null)
  }
})

const currentSlotText = computed(() => {
  const slots = currentBlockSlots.value
  if (!slots || slots.length === 0) return ''
  return slots[currentSlotIndex.value]?.text ?? ''
})

function loadSetupToSceneObjects(setup: SceneSetup) {
  // 双层架构：与 sceneLoader.ts 的 loadSetupToSceneObjects 一致，
  // 在 Action Mode 下临时切换为 Setup Mode 加载（确保 addObject 写入 setupObjects），
  // 完成后恢复 Action Mode 并重建 runtimeObjects。
  const wasActionMode = sceneObjectStore.getIsActionMode()
  if (wasActionMode) {
    sceneObjectStore.setActionMode(false)
  }

  sceneObjectStore.clearObjects()
  

  // v7.56: 修复 Action Mode 下相机丢失的问题
  // ActionEditor 之前只遍历 objects，忽略了 setup.camera 字段
  if (setup.camera) {
    const camera = setup.camera
    sceneObjectStore.createCameraObject('相机', {
      x: camera.x,
      y: camera.y
    }, camera.zoom ?? 1.0, 'camera')
    
    // 确保更新相机尺寸以匹配 zoom
    const cameraObj = sceneObjectStore.objects.find(obj => obj.type === 'camera')
    if (cameraObj) {
      const zoom = camera.zoom ?? 1.0
      sceneObjectStore.updateObject(cameraObj.id, {
        width: CAMERA_BASE_WIDTH / zoom,
        height: CAMERA_BASE_HEIGHT / zoom
      })
      ;(cameraObj as CameraObject).zoom = zoom
    }
  }

  // P2: 委托 Store 反序列化，消除散弹式 type switch
  // 与 sceneLoader.ts 一致，角色名称解析通过回调注入
  const resolveActorName = (refId: string, actorId?: string) => {
    const actor = actorId ? projectStore.getActor(actorId) : getActorByCharacterId(refId)
    if (!actor && !actorId) return null
    return {
      displayName: actor?.name ?? '未知角色',
      resolvedActorId: actorId ?? (actor?.id ?? '')
    }
  }

  for (const objData of setup.objects) {
    sceneObjectStore.fromSetupObject(objData, resolveActorName)
  }

  // v16: animations 已持久化，不再需要运行时 hydrate

  // 双层架构：恢复 Action Mode，重建 runtimeObjects
  if (wasActionMode) {
    sceneObjectStore.setActionMode(true) // 深拷贝 setupObjects → runtimeObjects
  }


}


/* 
 * v7.17: 重构：移除 BlockPlayer 和播放逻辑
 * 场景编辑页面不再负责播放，所有预览逻辑移至预览对话框
function initBlockPlayer() {
  // ... removed code
  // currentTime.value = time // removed
}
*/

/**
 * v8.4: 统一刷新 Ghost/Real 状态
 * v8.8: 修复异步时序问题 - setActionModeContext 必须等待完成
 * 在 Action 创建/更新后调用此函数，确保画布正确显示最新状态
 */
async function refreshGhostRealStates() {
  if (!renderer.value) return
  
  const sceneGraph = renderer.value.getSceneGraph()
  if (sceneGraph && props.sceneId && props.episode) {
    // v8.4 Fix: 先更新上下文，确保 sceneGraph 拿到最新的 block.actions
    const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
    const block = scene?.script?.find((b: ScriptBlock) => b.id === props.blockId)
    if (scene && block) {
      // v8.8 Fix: await 异步上下文更新，确保资源预加载完成
      await sceneGraph.setActionModeContext(scene, block)
      
      // v8.4 Fix: 同时更新 renderer 内部的 currentActions
      renderer.value.setActions(block.actions ?? [])
    }
    
    // 然后基于最新上下文重算 Slot 状态
    sceneGraph.updateSlotIndex(currentSlotIndex.value)
    // v21: 始终调用 applySlotState，但排除正在交互的对象（部分 apply）。
    // 旧逻辑在有交互锁时全量跳过 apply，导致所有非交互对象也停在旧 runtime 上。
    const slotStates = sceneGraph.getGhostStates()
    if (slotStates) {
      const excludeIds = renderer.value.getInteractionLockedIds()
      sceneObjectStore.applySlotState(slotStates, excludeIds.size > 0 ? excludeIds : undefined)
    }
  }
  
  // 重新渲染对象
  void renderer.value.renderObjects()
  renderer.value.updateSelectionBox()
}

async function refreshActionContextAndRender(scene: SceneContainer, block: ScriptBlock, updateSelectionBox = false) {
  if (!renderer.value) return

  const sceneGraph = renderer.value.getSceneGraph()
  await sceneGraph.setActionModeContext(scene, block)
  renderer.value.setActions(block.actions ?? [])
  sceneGraph.updateSlotIndex(currentSlotIndex.value)

  // v21: 始终调用 applySlotState，排除正在交互的对象（部分 apply）
  const slotStates = sceneGraph.getGhostStates()
  if (slotStates) {
    const excludeIds = renderer.value.getInteractionLockedIds()
    sceneObjectStore.applySlotState(slotStates, excludeIds.size > 0 ? excludeIds : undefined)
  }

  void renderer.value.renderObjects()
  if (updateSelectionBox) {
    renderer.value.updateSelectionBox()
  }
}

// v7.25: 判断动作是否在指定槽位处于活跃状态
// 逻辑：a. 动作以该 slot 为起始 slot；b. 动作的 span 通过或者到达该 slot
function isActionActiveAtSlot(action: Action, slotIndex: number): boolean {
  // a) 动作起始于该 slot
  if (action.slotIndex === slotIndex) return true
  
  // b) 持续动作且 span 覆盖该 slot
  if (action.category === 'duration') {
    const span = (action as { slotSpan?: number }).slotSpan ?? 1
    return slotIndex > action.slotIndex && slotIndex < action.slotIndex + span
  }
  
  return false
}

function getEvaluatedTransformState(targetId: string): SceneObject | undefined {
  const slotState = renderer.value?.getSceneGraph().getGhostStates()?.objects.get(targetId)?.real
  return slotState ?? sceneObjectStore.getObject(targetId)
}

function normalizeTransformPositionParams(action: ActionUpdatePayload, params: Record<string, number>): void {
  const hasPosition = params['x'] !== undefined || params['y'] !== undefined
  if (!hasPosition) return

  const globalX = 'globalX' in action.params ? action.params.globalX : undefined
  const globalY = 'globalY' in action.params ? action.params.globalY : undefined
  if (typeof globalX === 'number' && typeof globalY === 'number') {
    if (params['x'] !== undefined) params['x'] = globalX
    if (params['y'] !== undefined) params['y'] = globalY
    return
  }

  const evaluatedObj = getEvaluatedTransformState(action.target)
  if (!evaluatedObj?.parentId) {
    return
  }

  const tempState: WriteableState = {
    ...(evaluatedObj as unknown as WriteableState),
    x: params['x'] ?? evaluatedObj.x ?? 0,
    y: params['y'] ?? evaluatedObj.y ?? 0,
  }
  const getObjState = (id: string): WriteableState | undefined => {
    if (id === action.target) return tempState
    const obj = getEvaluatedTransformState(id)
    return obj ? (obj as unknown as WriteableState) : undefined
  }
  const globalCoords = localToGlobal(tempState, getObjState)
  if (params['x'] !== undefined) params['x'] = globalCoords.x
  if (params['y'] !== undefined) params['y'] = globalCoords.y
}

/**
 * 处理拖拽/缩放/旋转生成的Action更新
 * v9.2: 支持动画模式(tween_transform)和布局模式(set_transform)
 */
async function handleActionUpdate(action: ActionUpdatePayload): Promise<void> {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  // 相机特殊处理：使用 camera_move 动作
  if (action.target === 'camera') {
    await handleCameraActionUpdate(action, block)
    return
  }

  // v12.7: 检查对象是否已消亡，已消亡对象禁止创建 Action
  // 直接从 store 获取当前环境对象 (Action Mode 下是完全解算后的 runtimeObj)
  const currentObj = sceneObjectStore.getObject(action.target)
  if (currentObj?.spawned === false) {
    console.warn('[ActionEditor] v12.7: 已消亡对象不允许创建 Action')
    return
  }

  // Transform Origin 变更始终使用 set_transform（瞬时 Action），
  // 不能因为当前选中了 tween_transform 而被错误写入 duration action。
  if (action.type === 'set_origin') {
    handleSetTransformUpdate(action, block)
  // v14.1: 如果用户选中了 transform action，优先更新该 action（与相机逻辑对齐）
  } else if (selectedAction.value &&
      (selectedAction.value.type === 'set_transform' || selectedAction.value.type === 'tween_transform') &&
      selectedAction.value.target === action.target) {
    if (selectedAction.value.type === 'set_transform') {
      handleSetTransformUpdate(action, block)
    } else {
      handleTweenTransformUpdate(action, block)
    }
  } else if (objectRecordMode.value === 'layout') {
    // 瞬时模式 - 创建/更新 set_transform
    handleSetTransformUpdate(action, block)
  } else {
    // 补间模式 - 创建/更新 tween_transform
    handleTweenTransformUpdate(action, block)
  }
  
  // v8.4: 刷新 Ghost/Real 状态
  await refreshGhostRealStates()
  markLocalChange()
}

/**
 * v9.2: 处理布局模式下的拖拽 - 创建/更新 set_transform (point action)
 */
function handleSetTransformUpdate(action: ActionUpdatePayload, block: ScriptBlock) {
  // 查找当前槽位是否已有针对该目标的 set_transform 动作（含几何属性）
  const existingActionIndex = block.actions.findIndex((a: Action) => {
    if (a.type !== 'set_transform' || a.target !== action.target) return false
    return a.slotIndex === currentSlotIndex.value
  })

  // 根据操作类型构建 params
  let params: Record<string, number> = {}
  if (action.type === 'move') {
    params = { x: action.params.x, y: action.params.y }
  } else if (action.type === 'scale') {
    // v9.4: 缩放时同时保存位置补偿，确保视觉中心固定
    params = {
      scaleX: action.params.scaleX,
      scaleY: action.params.scaleY,
      ...(action.params.x !== undefined ? { x: action.params.x } : {}),
      ...(action.params.y !== undefined ? { y: action.params.y } : {})
    }
  } else if (action.type === 'rotate') {
    // Transform Origin 补偿：旋转改变逻辑中心，需同步保存 x/y
    params = {
      rotation: action.params.rotation,
      ...(action.params.x !== undefined ? { x: action.params.x } : {}),
      ...(action.params.y !== undefined ? { y: action.params.y } : {})
    }
  } else if (action.type === 'set_origin') {
    params = {
      transformOriginX: action.params.transformOriginX,
      transformOriginY: action.params.transformOriginY
    }
  }

  // v17/v27:
  // - x/y 存储为全局坐标
  // - rotation/scale/transformOrigin 保持对象自身局部值
  normalizeTransformPositionParams(action, params)

  if (existingActionIndex !== -1) {
    // 更新现有 set_transform 动作
    const existingAction = block.actions[existingActionIndex]! as SetTransformAction
    existingAction.params = { ...existingAction.params, ...params }
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = block.actions[existingActionIndex]!
  } else {
    // 创建新的 set_transform 动作 (point action)
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const newAction: Action = {
      id: actionId,
      type: 'set_transform',
      category: 'point',
      target: action.target,
      slotIndex: currentSlotIndex.value,
      params
    } as unknown as Action
    
    if (!block.actions) {
      block.actions = []
    }
    
    appendActionWithSlotOrder(block.actions, newAction)
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = newAction
  }
}

/**
 * v9.2: 处理动画模式下的拖拽 - 创建/更新 tween_transform (duration action)
 * 逻辑与原 handleActionUpdate 相同
 */
function handleTweenTransformUpdate(action: ActionUpdatePayload, block: ScriptBlock) {
  // 查找是否在当前槽位已有针对该目标的tween_transform动作（或覆盖该槽位的持续动作）
  const existingActionIndex = block.actions.findIndex((a: Action) => {
      if (a.type !== 'tween_transform' || a.target !== action.target) return false
      // v7.25: 使用 isActionActiveAtSlot 判断动作是否覆盖当前 slot
      return isActionActiveAtSlot(a as Action, currentSlotIndex.value)
    }
  )

  // 根据操作类型构建 params（统一在更新/创建之前构建）
  let params: Record<string, number> = {}
  if (action.type === 'move') {
    params = { x: action.params.x, y: action.params.y }
  } else if (action.type === 'scale') {
    // v9.4: 缩放时同时保存位置补偿
    params = {
      scaleX: action.params.scaleX,
      scaleY: action.params.scaleY,
      ...(action.params.x !== undefined ? { x: action.params.x } : {}),
      ...(action.params.y !== undefined ? { y: action.params.y } : {})
    }
  } else if (action.type === 'rotate') {
    // Transform Origin 补偿：旋转改变逻辑中心，需同步保存 x/y
    params = {
      rotation: action.params.rotation,
      ...(action.params.x !== undefined ? { x: action.params.x } : {}),
      ...(action.params.y !== undefined ? { y: action.params.y } : {})
    }
  } else if (action.type === 'set_origin') {
    params = {
      transformOriginX: action.params.transformOriginX,
      transformOriginY: action.params.transformOriginY
    }
  }

  // v17/v27:
  // - x/y 存储为全局坐标
  // - rotation/scale/transformOrigin 保持对象自身局部值
  normalizeTransformPositionParams(action, params)

  if (existingActionIndex !== -1) {
    // 更新现有动作（params 已转换为全局坐标）
    const existingAction = block.actions[existingActionIndex]! as TweenTransformAction
    if (existingAction.params) {
      Object.assign(existingAction.params, params)
    }
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = block.actions[existingActionIndex]!
  } else {
    // 创建新的tween_transform动作（params 已转换为全局坐标）
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const newAction: Action = {
      id: actionId,
      type: 'tween_transform',
      category: 'duration',
      target: action.target,
      slotIndex: currentSlotIndex.value,
      slotSpan: 1,
      easing: 'linear',
      params
    } as unknown as Action

    if (!block.actions) {
      block.actions = []
    }
    
    appendActionWithSlotOrder(block.actions, newAction)
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = newAction
  }
}

/**
 * 处理相机的Action更新
 * v6.5: 支持 camera_cut 和 camera_move 两种模式
 * - 如果当前已有选中的相机动作，则更新该动作
 * - 如果没有，则根据 cameraRecordMode 创建新动作
 */
async function handleCameraActionUpdate(action: ActionUpdatePayload, block: ScriptBlock): Promise<void> {
  const slotIndex = currentSlotIndex.value
  
  // 确定目标动作类型：
  // 1. 如果当前选中的是相机动作，保持其类型
  // 2. 否则使用 cameraRecordMode（默认 camera_cut）
  let targetActionType: 'camera_cut' | 'camera_move' = cameraRecordMode.value
  if (selectedAction.value && 
      (selectedAction.value.type === 'camera_cut' || selectedAction.value.type === 'camera_move')) {
    targetActionType = selectedAction.value.type
  }
  
  // v21: camera_cut + camera_move 允许共存（类比 set_transform + tween_transform）
  // camera_follow 独占 → 禁止编辑
  const hasFollow = block.actions.some((a: Action) =>
    a.type === 'camera_follow' && a.target === 'camera' && isActionActiveAtSlot(a, slotIndex)
  )
  if (hasFollow) return

  // 分别查找 cut 和 move
  const existingCutIndex = block.actions.findIndex((a: Action) =>
    a.type === 'camera_cut' && a.target === 'camera' && isActionActiveAtSlot(a, slotIndex)
  )
  const existingMoveIndex = block.actions.findIndex((a: Action) =>
    a.type === 'camera_move' && a.target === 'camera' && isActionActiveAtSlot(a, slotIndex)
  )

  // 确定编辑目标：优先 selectedAction > cut > move
  let editTargetIndex = -1
  if (selectedAction.value &&
      (selectedAction.value.type === 'camera_cut' || selectedAction.value.type === 'camera_move') &&
      selectedAction.value.target === 'camera' &&
      isActionActiveAtSlot(selectedAction.value, slotIndex)) {
    editTargetIndex = block.actions.indexOf(selectedAction.value)
  } else if (existingCutIndex !== -1) {
    editTargetIndex = existingCutIndex
  } else if (existingMoveIndex !== -1) {
    editTargetIndex = existingMoveIndex
  }
  
  // v6.5: 相机缩放反向逻辑
  let zoomValue: number | undefined
  if (action.type === 'scale') {
    const inverseScale = 1 / action.params.scaleX
    zoomValue = Math.round(inverseScale * 10) / 10
    zoomValue = Math.max(0.1, Math.min(10, zoomValue))
  }
  
  if (editTargetIndex !== -1) {
    // 更新已有的相机动作
    const existingAction = block.actions[editTargetIndex]! as CameraCutAction | CameraMoveAction
    if (!existingAction.params) existingAction.params = { x: 0, y: 0, zoom: 1 }
    
    if (action.type === 'move') {
      existingAction.params.x = Math.round(action.params.x)
      existingAction.params.y = Math.round(action.params.y)
    } else if (action.type === 'scale' && zoomValue !== undefined) {
      existingAction.params.zoom = zoomValue
    }
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = block.actions[editTargetIndex]!
  } else {
    // 创建新的相机动作（默认 camera_cut）
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let params: Record<string, number> = {}
    if (action.type === 'move') {
      // v21: 相机 zoom 已由 applySlotState 同步到 runtimeObjects
      const cameraObj = sceneObjectStore.objects.find(o => o.type === 'camera') as import('@/stores/sceneObjectStore').CameraObject | undefined
      const evaluatedZoom = cameraObj?.zoom ?? 1.0
      
      params = {
        x: Math.round(action.params.x),
        y: Math.round(action.params.y),
        zoom: evaluatedZoom
      }
    } else if (action.type === 'scale' && zoomValue !== undefined) {
      params = { zoom: zoomValue }
    }
    
    const isPointAction = targetActionType === 'camera_cut'
    
    const newAction = {
      id: actionId,
      type: targetActionType,
      category: isPointAction ? 'point' : 'duration',
      target: 'camera',
      slotIndex,
      ...(isPointAction ? {} : { slotSpan: 1, easing: 'linear' }),
      params
    } as unknown as Action
    
    if (!block.actions) {
      block.actions = []
    }
    
    appendActionWithSlotOrder(block.actions, newAction)
    
    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })
    
    selectedAction.value = newAction
  }
  
  // v8.4: 刷新 Ghost/Real 状态
  await refreshGhostRealStates()
  markLocalChange()
}

onMounted(async () => {
  if (!canvasContainer.value) {
    console.error('[ActionEditor] 画布容器未找到')
    return
  }

  const rendererInstance = useSceneRenderer({
    canvasContainer: canvasContainer.value,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    mode: 'action',
    episodeId: route.params['id'] as string,
    sceneId: props.sceneId,
    blockId: props.blockId,
    onActionUpdate: handleActionUpdate
  })
  
  renderer.value = rendererInstance
  rendererInstance.setAutoRenderEnabled(false)
  await rendererInstance.initRenderer()
  
  // 初始化穿透列表默认值移往加载场景状态后
  // 加载初始状态
  if (props.sceneId && props.blockId && props.episode) {
    const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
    if (scene) {
      // const prevContext... (removed)
      const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
      if (block) {
        // v24: 注册 episode 自动同步目标
        sceneObjectStore.registerEpisodeSync(scene.setup)

        // v7.24: Action Mode 下，sceneObjectStore 应始终存储 Scene Setup State (scene.setup)
        // 而不是 PrevContext 或 Final State，以确保属性面板显示场景的初始设定值
        loadSetupToSceneObjects(scene.setup)
        
        // 双层架构：初始进入 Action Mode 时，必须显式激活 Action Mode。
        // loadSetupToSceneObjects 将数据加载到 setupObjects，
        // setActionMode(true) 深拷贝 setupObjects → runtimeObjects，
        // 确保后续 applySlotState 能将 parentId 等计算属性写入 runtimeObjects。
        sceneObjectStore.setActionMode(true)
        // currentTime.value = 0 // removed
        // v7.17: 重构：移除 BlockPlayer 和播放逻辑
      // initBlockPlayer() // 移除
      
      // 设置Action Mode上下文
      const sceneGraph = rendererInstance.getSceneGraph()
      if (sceneGraph) {
        await sceneGraph.setActionModeContext(scene, block)
        
        // 同步计算并应用 slot states，确保 parentId 在 Vue 响应式 flush 前写入 runtimeObjects
        sceneGraph.updateSlotIndex(0) // 初始状态为 slot 0
        const slotStates = sceneGraph.getGhostStates()
        if (slotStates) {
          sceneObjectStore.applySlotState(slotStates)
        }
      }
      }
    }
  }
  
  // 初始化穿透列表默认值（相机自动加入，必须在 loadSetupToSceneObjects 之后）
  rendererInstance.getSceneGraph().initPassThroughDefaults()
  await rendererInstance.renderObjects()

  // v7.10: 初始状态下（Preroll），触发一次 Target State 计算与日志打印
  // 确保进入页面时就能看到 Preroll 的状态日志
  handleSceneUpdateBySlot()

  // 双层架构：parentId 已由 applySlotState() 在 updateActionModeObjects 中自动同步
  // 不再需要手动调用 setAccumulatedParentIds

  rendererInstance.setAutoRenderEnabled(true)
  setTimeout(() => {
    rendererInstance.scrollToCanvasCenter()
  }, 100)

  // 监听对象变化
  watch(
    () => sceneObjectStore.objects.length,
    () => {
      if (renderer.value && !sceneObjectStore.getIsActionMode()) {
        void renderer.value.renderObjects()
      }
    }
  )

  watch(
    () => sceneObjectStore.objects.map(o => ({ 
      id: o.id, 
      expression: undefined,
      visible: o.visible 
    })),
    () => {
      if (renderer.value && !sceneObjectStore.getIsActionMode()) {
        void renderer.value.renderObjects()
      }
    },
    { deep: true }
  )

  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('fullscreenchange', handleFullscreenChange)

  // v8.6: leftPanelCollapsed watcher 已移除（左侧边栏删除）
  watch([rightPanelCollapsed], () => {
    setTimeout(() => {
      if (renderer.value) {
        renderer.value.updateTransformParams()
        // v7.23: 使用 handleSceneUpdateBySlot() 确保 Action Mode 状态
        handleSceneUpdateBySlot()
      }
    }, 300)
  })

  // v8.6: leftPanelWidth watcher 已移除（左侧边栏删除）
  watch([rightPanelWidth], () => {
    requestAnimationFrame(() => {
      if (renderer.value) {
        renderer.value.updateTransformParams()
        // v7.23: 使用 handleSceneUpdateBySlot() 确保 Action Mode 状态
        handleSceneUpdateBySlot()
      }
    })
  })

  // P2: 组合模式高亮 — 监听 pendingIds 变化，同步到渲染器
  watch(
    () => actionGroupingState.value?.pendingIds.slice() ?? [],
    (ids) => {
      if (renderer.value) {
        renderer.value.setGroupingPendingIds(ids)
      }
    },
    { deep: true }
  )

  // 双层架构：accumulatedParentIds watcher 已移除
  // parentId 由 applySlotState() 在每次 updateActionModeObjects 时自动同步到 runtimeObjects

  // 监听Block的actions变化
  watch(
    () => {
      if (props.sceneId && props.blockId && props.episode) {
        const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
        const block = scene?.script.find((b: ScriptBlock) => b.id === props.blockId)
        return {
          blockActions: block?.actions ? JSON.stringify(block.actions) : null,
          blockId: props.blockId
        }
      }
      return null
    },
    (newVal, oldVal) => {
      if (!props.sceneId || !props.blockId || !props.episode) return
      if (newVal && oldVal && newVal.blockActions !== oldVal.blockActions) {
        const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
        if (scene && props.blockId) {
          const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
          if (block) {
            const prevContext = calculatePrevContext(scene, props.blockId)
            // v7.23: Action Mode 下，renderer 的基准状态应为 Setup State (prevContext)
            // 避免重复叠加 Action
            
            if (renderer.value?.updateActionModeState) {
              renderer.value.updateActionModeState(prevContext)
            }
          }
        }
      }
    },
    { deep: true }
  )
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  
  
  if (renderer.value) {
    // 清除Action Mode上下文
    const sceneGraph = renderer.value.getSceneGraph()
    if (sceneGraph) {
      sceneGraph.clearActionModeContext()
    }
    renderer.value.destroyRenderer()
    renderer.value = null
  }
  // v24: 解注册 episode 同步目标
  sceneObjectStore.registerEpisodeSync(null)
  sceneObjectStore.clearObjects()
})

// v24.1: 防御性 watch — 如果父组件在同一 sceneId+blockId 下替换了 episode 对象
// （例如 episodeStore 内部重建），需要重新注册同步目标，防止写入脱离的旧对象。
watch(
  () => {
    if (!props.episode || !props.sceneId) return null
    const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
    return scene?.setup ?? null
  },
  (newSetup) => {
    if (newSetup && sceneObjectStore.getIsActionMode()) {
      sceneObjectStore.registerEpisodeSync(newSetup)
    }
  },
)

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  setTimeout(() => {
    if (renderer.value) {
      renderer.value.updateTransformParams()
      // v7.23: 使用 handleSceneUpdateBySlot() 确保 Action Mode 状态
      handleSceneUpdateBySlot()
    }
  }, 100)
}

// v9.2: 点击外部区域关闭添加素材菜单
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.add-menu-container')) {
    showAddMenu.value = false
  }
}

function handleKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  // P2: ESC 退出成组模式
  if (event.key === 'Escape' && actionGroupingState.value) {
    actionGroupingState.value = null
    event.preventDefault()
  }
}

function handleSelectObject(objectId: string | null) {
  sceneObjectStore.selectObject(objectId)
  if (objectId) {
    selectedAction.value = null
    // v14.1: 切换对象时重置录制模式为瞬时（用户规则4）
    objectRecordMode.value = 'layout'
    
    // v6.9: 当选中相机对象时，检查当前槽位是否有 camera_cut/camera_move 动作
    // 只有存在这类动作时才允许拖动相机，否则不允许
    const selectedObj = sceneObjectStore.getObject(objectId)
    if (selectedObj?.type === 'camera' && renderer.value) {
      // 检查当前槽位是否有可拖动的相机动作
      const currentCameraAction = currentSlotCameraAction.value
      const canDrag = currentCameraAction?.type === 'camera_cut' || currentCameraAction?.type === 'camera_move'
      renderer.value.setSelectedActionType(canDrag ? currentCameraAction.type : null)
    }
  }
}

// v6.5: 监听选中的相机动作类型变化，同步到 cameraRecordMode
// v6.6: 同时通知渲染器当前选中的动作类型（用于限制相机拖动）
// v6.8: 扩展逻辑：当选中相机对象但没选中动作时，使用 cameraRecordMode
watch(selectedAction, (action) => {
  if (action && (action.type === 'camera_cut' || action.type === 'camera_move')) {
    cameraRecordMode.value = action.type
  }
  
  // v21: camera_follow 禁止拖动，其他情况允许
  if (renderer.value) {
    if (action?.type === 'camera_follow') {
      renderer.value.setSelectedActionType('camera_follow')
    } else if (action?.type === 'camera_cut' || action?.type === 'camera_move') {
      renderer.value.setSelectedActionType(action.type)
    } else {
      // 未选中相机 action → 使用 cameraRecordMode（默认 camera_cut）
      renderer.value.setSelectedActionType(cameraRecordMode.value)
    }
  }
})

// 监听场景对象选择变化：当用户在画布上拾取对象时，取消选中的 Action
watch(
  () => sceneObjectStore.selectedObjectId,
  (newObjectId, oldObjectId) => {
    // 仅当对象选择确实发生变化时处理
    if (newObjectId !== oldObjectId && newObjectId) {
      const currentAction = selectedAction.value
      const shouldKeepAction =
        currentAction?.type === 'set_transform' &&
        findObjectIdByTarget(currentAction.target) === newObjectId

      if (!shouldKeepAction) {
        selectedAction.value = null
      }
      
      // v21: 选中相机对象时，camera_follow 禁止拖动，其他情况允许
      const selectedObj = sceneObjectStore.getObject(newObjectId)
      if (selectedObj?.type === 'camera' && renderer.value) {
        const actions = currentBlock.value?.actions ?? []
        const hasFollow = actions.some((a: Action) =>
          a.type === 'camera_follow' && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
        )
        if (hasFollow) {
          renderer.value.setSelectedActionType('camera_follow')
        } else {
          // 有 cut/move 则使用其类型，否则使用 cameraRecordMode（默认 camera_cut）
          const posAction = actions.find((a: Action) =>
            (a.type === 'camera_cut' || a.type === 'camera_move') && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
          )
          renderer.value.setSelectedActionType(posAction?.type ?? cameraRecordMode.value)
        }
      }
    }
  }
)

// v6.9: 监听 cameraRecordMode 变化
// 当选中相机对象且没选中动作时，根据当前槽位的相机动作类型决定是否允许拖动
watch(cameraRecordMode, () => {
  // v21: 切换 cameraRecordMode 时同步拖动权限
  if (renderer.value && !selectedAction.value) {
    const selectedObj = sceneObjectStore.getSelectedObject()
    if (selectedObj?.type === 'camera') {
      const actions = currentBlock.value?.actions ?? []
      const hasFollow = actions.some((a: Action) =>
        a.type === 'camera_follow' && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
      )
      renderer.value.setSelectedActionType(hasFollow ? 'camera_follow' : cameraRecordMode.value)
    }
  }
})

// DEBUG: 监听相机对象在 store 中的变化，确保 Setup 数据不被污染
watch(() => {
  const camera = sceneObjectStore.objects.find(o => o.type === 'camera')
  return camera ? { zoom: (camera as { zoom?: number }).zoom, width: camera.width, height: camera.height } : null
}, (newVal, oldVal) => {
  if (newVal && oldVal && (newVal.zoom !== oldVal.zoom)) {
    logService.addLog(`[ActionEditor] Store Camera Zoom Changed: ${oldVal.zoom} -> ${newVal.zoom}`)
  }
}, { deep: true })

// v6.5: 处理相机录制模式切换
function handleCameraRecordModeChange(mode: 'camera_cut' | 'camera_move') {
  cameraRecordMode.value = mode
}

// v9.2: 处理对象录制模式切换 (动画/布局)
function handleObjectRecordModeChange(mode: 'animation' | 'layout') {
  objectRecordMode.value = mode
}

// v9.3: handleVisualActionUpdate 已移至第 2547 行，支持自动选中功能

// v21: 相机动作互斥策略重构
// camera_cut + camera_move 允许共存（类比 set_transform + tween_transform）
// camera_follow 独占（与 cut/move 互斥）
// camera_shake 与任何动作共存
// v6.5: 当前槽位的相机动作
// v6.7: 优先返回互斥类动作，震动可以共存
const currentSlotCameraAction = computed((): Action | null => {
  if (!currentBlock.value) return null
  const actions = currentBlock.value.actions ?? []
  
  // v21: 优先返回 camera_follow（独占类），然后 cut/move，最后 shake
  const followAction = actions.find(
    (a: Action) => isCameraFollowAction(a.type) && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
  )
  if (followAction) return followAction
  
  const posAction = actions.find(
    (a: Action) => isCameraPositionAction(a.type) && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
  )
  if (posAction) return posAction
  
  return actions.find(
    (a: Action) => a.type === 'camera_shake' && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
  ) as Action | null
})

// v6.7: 当前槽位是否存在震动动作
const currentSlotHasShake = computed((): boolean => {
  if (!currentBlock.value) return false
  const actions = currentBlock.value.actions ?? []
  return actions.some(
    (a: Action) => a.type === 'camera_shake' && a.target === 'camera' && isActionActiveAtSlot(a, currentSlotIndex.value)
  )
})

function pruneCameraConflicts(actions: Action[], keeper: Action): Action[] {
  return actions.filter(action => (
    action.id === keeper.id
    || findCameraConflict([action], keeper) !== action
  ))
}

function upsertCameraAction(actions: Action[], candidate: Action): Action {
  const existing = findUpsertableCameraAction(actions, candidate)

  if (existing) {
    existing.params = { ...(existing.params ?? {}), ...(candidate.params ?? {}) }
    if (candidate.category === 'duration') {
      const existingDuration = existing as unknown as BaseDurationAction
      const candidateDuration = candidate as unknown as BaseDurationAction
      existingDuration.easing = candidateDuration.easing ?? existingDuration.easing ?? 'linear'
    }
    const pruned = pruneCameraConflicts(actions, existing)
    actions.splice(0, actions.length, ...pruned)
    return existing
  }

  const pruned = pruneCameraConflicts(actions, candidate)
  actions.splice(0, actions.length, ...pruned)
  appendActionWithSlotOrder(actions, candidate)
  return candidate
}

// v6.5: 处理来自相机属性面板的动作创建/更新
// v6.7: 支持互斥逻辑 - camera_cut/camera_move/camera_follow 互斥，camera_shake 可共存
function handleCameraActionFromPanel(
  actionType: 'camera_cut' | 'camera_move' | 'camera_follow' | 'camera_shake',
  params: Record<string, unknown>
) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  const slotIndex = currentSlotIndex.value

  const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const category = actionType === 'camera_cut' ? 'point' : 'duration'
  const actionParams = { ...params }
  const easing = (actionParams['easing'] as string | undefined) ?? 'linear'
  delete actionParams['easing']

  const newAction: Action = {
    id: actionId,
    type: actionType,
    category,
    target: 'camera',
    slotIndex,
    params: actionParams,
  } as Action

  if (category === 'duration') {
    ;(newAction as unknown as BaseDurationAction).slotSpan = 1
    ;(newAction as unknown as BaseDurationAction).easing = easing
  }

  selectedAction.value = upsertCameraAction(block.actions, newAction)
  
  // 刷新 cameraRecordMode
  if (actionType === 'camera_cut' || actionType === 'camera_move') {
    cameraRecordMode.value = actionType
  }
  
  // 保存到 store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // v8.4: 使用统一刷新函数
  void refreshGhostRealStates()
  markLocalChange()
}

/**
 * v7.55: handleEnterSetCharacterAction 已移除 - character 类型已删除
 */

/**
 * 处理 Action Mode 下的对象属性更新
 * 自动生成 Point Action
 */
function handleObjectUpdateInActionMode(updatedObject: SceneObject) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return
  
  // 获取目标别名
  const targetAlias = getTargetAliasFromObject(selected)
  if (!targetAlias) {
    // 不支持的对象类型，仅更新显示
    // v7.20: Action Mode 下不应修改 Store，但如果不支持生成 Action，这里可能需要保留或者直接 return
    // 考虑到不支持的对象（如 BGM）通常没有可视属性，这里选择直接 return，避免污染 Store
    // sceneObjectStore.updateObject(selected.id, updatedObject)
    return
  }
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  // v7.22: 使用 Setup State 作为基准进行 Diff
  // 用户要求：属性面板仅显示 Setup 状态，因此这里的变更也是基于 Setup 值的
  // 不再使用 selectedObjectRuntimeState
  const updatedState = getObjectRuntimeState(updatedObject)
  const originalState = getObjectRuntimeState(selected)
  
  if (!originalState || !updatedState) {
    // sceneObjectStore.updateObject(selected.id, updatedObject)
    return
  }
  
  // v7.20: Action Mode 下禁止修改 Store，仅通过 Action 驱动
  // sceneObjectStore.updateObject(selected.id, updatedObject)
  
  // 判断是否为角色对象
  // character 类型已移除
  
  // v7.26: 音频对象处理
  if (selected.type === 'audio') {
    type LegacyAudioObject = AudioObject & { autoPlay?: boolean }
    const audioObj = selected as unknown as LegacyAudioObject
    const updatedAudio = updatedObject as unknown as LegacyAudioObject
    const diff: Record<string, unknown> = {}
    
    if (audioObj.volume !== updatedAudio.volume) diff['volume'] = updatedAudio.volume
    if (audioObj.loop !== updatedAudio.loop) diff['loop'] = updatedAudio.loop
    
    // autoPlay 映射为 action: play/stop
    if (audioObj.autoPlay !== updatedAudio.autoPlay) {
      diff['action'] = updatedAudio.autoPlay ? 'play' : 'stop'
    }
    
    if (Object.keys(diff).length > 0) {
      // 如果没有显式 action 变更，补充默认 action 以确保动作有效
      diff['action'] ??= updatedAudio.autoPlay ? 'play' : 'stop'
      upsertPointAction('set_audio', targetAlias, currentSlotIndex.value, { params: diff })
    }
    return
  }

  // 文本对象处理：计算 text params diff，创建/更新 set_text
  if (selected.type === 'text') {
    const textObj = selected as TextObject
    const updatedText = updatedObject as TextObject
    const textDiff: Record<string, unknown> = {}

    const textKeys: (keyof TextObject)[] = [
      'content', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
      'color', 'align', 'wordWrap', 'wordWrapWidth',
      'stroke', 'strokeThickness',
      'dropShadow', 'dropShadowColor', 'dropShadowBlur', 'dropShadowAngle', 'dropShadowDistance',
      'letterSpacing', 'lineHeight', 'textBoxMode', 'writingMode',
      'revealSpeed', 'fillType', 'gradientStops', 'gradientAngle',
      'textBackgroundEnabled', 'textBackgroundColor', 'textBackgroundAlpha',
      'textBackgroundPaddingX', 'textBackgroundPaddingY', 'textBackgroundRadius',
    ]

    for (const key of textKeys) {
      const oldVal = textObj[key]
      const newVal = updatedText[key]
      const changed = Array.isArray(oldVal) || Array.isArray(newVal)
        ? JSON.stringify(oldVal) !== JSON.stringify(newVal)
        : oldVal !== newVal
      if (changed && newVal !== undefined) {
        textDiff[key as string] = newVal
      }
    }

    if (Object.keys(textDiff).length > 0) {
      upsertPointAction('set_text', targetAlias, currentSlotIndex.value, { params: textDiff })
    }
    // 不 return，fall-through 到通用 transform diff（处理 alpha/visible/flipX/zIndex）
  }
  
  // 光源对象处理：计算 light params diff，根据录制模式创建 set_light 或 tween_light
  // 注意：不 return，让后续代码继续处理 transform 属性（alpha/visible/flipX/zIndex）
  if (selected.type === 'light') {
    const lightObj = selected as LightObject
    const updatedLight = updatedObject as LightObject
    const lightDiff: Record<string, unknown> = {}
    
    if (lightObj.lightColor !== updatedLight.lightColor) lightDiff['lightColor'] = updatedLight.lightColor
    if (lightObj.lightIntensity !== updatedLight.lightIntensity) lightDiff['lightIntensity'] = updatedLight.lightIntensity
    if (lightObj.lightRadius !== updatedLight.lightRadius) lightDiff['lightRadius'] = updatedLight.lightRadius
    // Phase 1: 闪烁和方向性
    if (lightObj.flicker !== updatedLight.flicker) lightDiff['flicker'] = updatedLight.flicker
    if (lightObj.flickerSpeed !== updatedLight.flickerSpeed) lightDiff['flickerSpeed'] = updatedLight.flickerSpeed
    if (lightObj.directionMode !== updatedLight.directionMode) lightDiff['directionMode'] = updatedLight.directionMode
    if (lightObj.directionAngle !== updatedLight.directionAngle) lightDiff['directionAngle'] = updatedLight.directionAngle
    if (lightObj.coneAngle !== updatedLight.coneAngle) lightDiff['coneAngle'] = updatedLight.coneAngle
    
    if (Object.keys(lightDiff).length > 0) {
      if (objectRecordMode.value === 'animation') {
        upsertDurationAction(targetAlias, currentSlotIndex.value, lightDiff, 'tween_light')
      } else {
        upsertPointAction('set_light', targetAlias, currentSlotIndex.value, { params: lightDiff })
      }
    }
    // 不 return，fall-through 到通用 transform diff（处理 alpha/visible 等）
  }
  
  // 画面特效对象处理：计算 params diff，根据录制模式创建 set_screen_effect 或 tween_screen_effect
  // 注意：不 return，让后续代码继续处理 transform 属性（x/y/scaleX/scaleY/rotation/alpha/visible/flipX/zIndex）
  if (selected.type === 'screen_effect') {
    const effectObj = selected
    const updatedEffect = updatedObject as ScreenEffectObject
    const paramsDiff: Record<string, unknown> = {}
    
    // 逐字段比较 params
    const paramKeys = [
      'baseColor',
      'holeShape', 'holeCenterX', 'holeCenterY', 'holeWidth', 'holeHeight',
      'openRatio', 'feather',
      'targetId', 'offsetX', 'offsetY'
    ] as const
    
    for (const key of paramKeys) {
      const effectParams = (effectObj as ScreenEffectObject).params
      if (!effectParams) throw new Error(`Screen effect object ${effectObj.id} has no params`)
      const oldVal = effectParams[key]
      const newVal = updatedEffect.params[key]
      if (oldVal !== newVal && newVal !== undefined) {
        paramsDiff[key] = newVal
      }
    }
    
    if (Object.keys(paramsDiff).length > 0) {
      if (objectRecordMode.value === 'animation') {
        // 补间模式：创建 tween_screen_effect
        upsertDurationAction(targetAlias, currentSlotIndex.value, paramsDiff, 'tween_screen_effect')
      } else {
        // 瞬时模式：创建 set_screen_effect
        upsertPointAction('set_screen_effect', targetAlias, currentSlotIndex.value, { params: paramsDiff })
      }
    }
    // 不 return，继续 fall-through 到下方的通用 transform diff 逻辑
  }
  
  // Clip-Mask Phase 1 D2: 蒙版专属字段 diff（targetIds / shape / width / height）→ set_mask
  // 注意：mask 的 transform 字段（x/y/scaleX/scaleY/rotation/alpha/visible/flipX/zIndex）
  // 仍走下方通用 transform diff。
  if (selected.type === 'mask') {
    const maskObj = selected as MaskObject
    const updatedMask = updatedObject as MaskObject
    const maskDiff: { targetIds?: string[]; shape?: 'rectangle' | 'ellipse'; width?: number; height?: number } = {}
    
    const oldTargets = maskObj.targetIds ?? []
    const newTargets = updatedMask.targetIds ?? []
    if (JSON.stringify(oldTargets) !== JSON.stringify(newTargets)) {
      maskDiff.targetIds = [...newTargets]
    }
    if (maskObj.shape !== updatedMask.shape) {
      maskDiff.shape = updatedMask.shape
    }
    if (maskObj.width !== updatedMask.width && Number.isFinite(updatedMask.width) && updatedMask.width > 0) {
      maskDiff.width = updatedMask.width
    }
    if (maskObj.height !== updatedMask.height && Number.isFinite(updatedMask.height) && updatedMask.height > 0) {
      maskDiff.height = updatedMask.height
    }
    
    if (Object.keys(maskDiff).length > 0) {
      upsertSetMaskAction(block.actions, targetAlias, currentSlotIndex.value, maskDiff)
    }
    // 不 return，fall-through 处理 transform 属性
  }
  
  // character 类型已移除，isCharacter 始终为 false——直接进入else分支
  {
    // 非角色对象：根据录制模式处理属性
    // v9.4: alpha 在补间模式下创建 tween_transform，其他视觉属性始终使用 set_transform
    const alphaChanged = originalState.alpha !== updatedState.alpha
    
    // 补间模式下的 alpha 变更 → tween_transform
    if (alphaChanged && objectRecordMode.value === 'animation') {
      upsertDurationAction(targetAlias, currentSlotIndex.value, { alpha: updatedState.alpha })
    }
    
    // 瞬时属性（alpha 瞬时模式 + visible/flipX/zIndex）→ set_transform
    const visualDiff: Record<string, unknown> = {}
    if (alphaChanged && objectRecordMode.value !== 'animation') {
      visualDiff['alpha'] = updatedState.alpha
    }
    if (originalState.visible !== updatedState.visible) {
      visualDiff['visible'] = updatedState.visible
    }
    if (originalState.flipX !== updatedState.flipX) {
      visualDiff['flipX'] = updatedState.flipX
    }
    if (originalState.zIndex !== updatedState.zIndex) {
      visualDiff['zIndex'] = updatedState.zIndex
    }
    
    if (Object.keys(visualDiff).length > 0) {
      upsertPointAction('set_transform', targetAlias, currentSlotIndex.value, { params: visualDiff })
    }
  }
  
  // v8.4: 使用统一刷新函数
  void refreshGhostRealStates()
}

/**
 * 创建或更新 Point Action
 * 同槽位同对象同类型的动作会被合并
 */
function upsertPointAction(
  type: 'set_transform' | 'set_active' | 'set_anim' | 'camera_cut' | 'set_audio' | 'set_screen_effect' | 'set_light' | 'set_text' | 'set_text_reveal',
  target: string,
  slotIndex: number,
  data: Partial<Action>
) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  // v6.4: trigger_anim 按 target + slotIndex 匹配，合并 animStates
  const existingIndex = block.actions.findIndex(
    (a: Action) => a.type === type && a.target === target && isActionActiveAtSlot(a, slotIndex)
  )
  
  if (existingIndex !== -1) {
    // 合并属性
    const existing = block.actions[existingIndex]!
    if (type === 'set_anim') {
      // v14.2: 按 animName 合并 animations 数组，避免整体替换丢失其他条目
      const existingParams = (existing.params ?? {}) as Record<string, unknown>
      const newParams = (data.params ?? {}) as Record<string, unknown>
      const existingAnims = (existingParams['animations'] ?? []) as {animName: string; [key: string]: unknown}[]
      const newAnims = (newParams['animations'] ?? []) as {animName: string; [key: string]: unknown}[]
      for (const newAnim of newAnims) {
        const idx = existingAnims.findIndex(a => a.animName === newAnim.animName)
        if (idx !== -1) {
          existingAnims[idx] = { ...existingAnims[idx], ...newAnim }
        } else {
          existingAnims.push(newAnim)
        }
      }
      existing.params = {
        ...existingParams,
        ...newParams,
        animations: existingAnims
      } as typeof existing.params
    } else if (type === 'set_transform') {
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_active') {
      (existing as unknown as { visible?: boolean }).visible = (data as unknown as { visible?: boolean }).visible ?? true
    } else if (type === 'camera_cut') {
      // 相机切换：合并 x, y, zoom 参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_audio') {
      // 音频触发：合并 action, volume, loop 参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_screen_effect') {
      // 画面特效：合并特效参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_light') {
      // 光源：合并光源参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_text') {
      // 文本：合并文本属性参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    } else if (type === 'set_text_reveal') {
      // 文本显现：合并播放/停止参数
      existing.params = { ...(existing.params ?? {}), ...(data.params ?? {}) }
    }
    
    // 选中更新的动作
    selectedAction.value = block.actions[existingIndex]!
  } else {
    // 创建新动作
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newAction = {
      id: actionId,
      type,
      category: 'point',
      target,
      slotIndex,
      ...data
    } as unknown as Action
    appendActionWithSlotOrder(block.actions, newAction)
    
    // 选中新创建的动作
    selectedAction.value = newAction
  }
  
  // 保存到 store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // v8.4: 使用统一刷新函数
  void refreshGhostRealStates()
  
  markLocalChange()
}

/**
 * v9.4: 创建或更新 tween_transform Duration Action
 * 用于从属性面板创建补间动作（如透明度渐变）
 */
function upsertDurationAction(
  target: string,
  slotIndex: number,
  params: Record<string, unknown>,
  actionType: 'tween_transform' | 'tween_screen_effect' | 'tween_light' = 'tween_transform'
) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  // 查找当前槽位是否已有针对该目标的同类型动作
  const existingIndex = block.actions.findIndex((a: Action) => {
    if (a.type !== actionType || a.target !== target) return false
    return isActionActiveAtSlot(a, slotIndex)
  })
  
  if (existingIndex !== -1) {
    // 合并到现有动作
    const existing = block.actions[existingIndex]!
    existing.params = { ...(existing.params ?? {}), ...params }
    selectedAction.value = existing
  } else {
    // 创建新的补间动作
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newAction = {
      id: actionId,
      type: actionType,
      category: 'duration',
      target,
      slotIndex,
      slotSpan: 1,
      easing: 'linear',
      params
    } as unknown as Action
    appendActionWithSlotOrder(block.actions, newAction)
    selectedAction.value = newAction
  }
  
  // 保存到 store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // 刷新状态
  void refreshGhostRealStates()
  markLocalChange()
}

/**
 * 插入或更新相机持续动作 (camera_move, camera_shake)
 */
// function upsertCameraDurationAction... (removed)

// v8.6: handleDeleteObject 已移除（左侧边栏删除，Action模式下不允许删除对象）

function handleSaveAction() {
  if (!props.sceneId || !props.blockId || !props.episode) {
    console.error('[ActionEditor] 保存需要 sceneId 和 blockId')
    return
  }

  const episodeId = route.params['id'] as string
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  if (!block.actions) {
    block.actions = []
  }

  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  projectStore.saveProject().then(() => {
    hasLocalChanges.value = false

    saveToastMessage.value = '保存成功'
    saveToastType.value = 'success'
    showSaveToast.value = true
    setTimeout(() => {
      showSaveToast.value = false
    }, 2000)
  }).catch((err: unknown) => {
    console.error('[ActionEditor] 保存失败:', err)
    saveToastMessage.value = '保存失败，请重试'
    saveToastType.value = 'error'
    showSaveToast.value = true
    setTimeout(() => {
      showSaveToast.value = false
    }, 3000)
  })
}

function handlePreview() {
  showPreviewDialog.value = true
}

function handleReturn() {
  if (hasLocalChanges.value) {
    showSaveConfirmDialog.value = true
  } else {
    emit('exitSceneEdit')
  }
}

// 保存并返回
async function handleSaveAndExit() {
  showSaveConfirmDialog.value = false
  await handleSaveActionAsync()
  emit('exitSceneEdit')
}

// 放弃修改并返回
function handleDiscardAndExit() {
  showSaveConfirmDialog.value = false
  emit('exitSceneEdit')
}

// v8.3: 打开文本编辑对话框
function openTextEditDialog() {
  const block = currentBlock.value
  if (block && (block.type === 'dialogue' || block.type === 'narration')) {
    editingText.value = block.text ?? ''
    showTextEditDialog.value = true
  }
}

// v8.3: 保存编辑的文本
function saveEditedText() {

  const block = currentBlock.value

  if (block && props.episode && props.sceneId && props.blockId) {
    // v9.3: 使用 props.episode.id 代替 route.params['id']
    const episodeId = props.episode.id
    const actions = block.actions ?? []

    // ① 保存旧 slots 快照（在更新文本之前）
    const oldSlots = parseBlockToSlots(block)

    // ② 更新文本
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      text: editingText.value
    })
    
    // ③ 解析新 slots
    const newSlots = parseBlockToSlots({ ...block, text: editingText.value } as ScriptBlock)
    const maxSlotIndex = Math.max(0, newSlots.length - 1)

    // ④ 检测 slot 变化并执行精确迁移
    let actionsModified = false
    const change = detectSlotTextChanges(oldSlots, newSlots)

    if (change?.type === 'insert') {
      migrateActionsOnSlotInsert(actions, change.index, change.count)
      actionsModified = true
    } else if (change?.type === 'delete') {
      migrateActionsOnSlotDelete(actions, change.index, change.count)
      actionsModified = true
    }

    // ⑤ 兜底：Cap and Clamp（处理 complex 变化或任何遗漏的越界情况）
    for (const action of actions) {
      if (action.slotIndex > maxSlotIndex) {
        action.slotIndex = maxSlotIndex
        actionsModified = true
      }
      // Duration slotSpan 越界修正
      if (action.category === 'duration') {
        const dAction = action as BaseDurationAction
        const maxSpan = maxSlotIndex - action.slotIndex + 1
        if ((dAction.slotSpan ?? 1) > maxSpan) {
          dAction.slotSpan = Math.max(1, maxSpan)
          actionsModified = true
        }
      }
    }
    
    // ⑥ 如果有 Action 被修正，更新 store
    if (actionsModified) {
      episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
        actions: actions
      })
    }
    
    // ⑦ 检查并修正 currentSlotIndex
    if (currentSlotIndex.value > maxSlotIndex) {
      currentSlotIndex.value = maxSlotIndex
    }
    
    showTextEditDialog.value = false
    markLocalChange()
    
    // v9.2: 文本修改后需要重新解析 slots 并刷新动作编辑器
    void refreshGhostRealStates()
  }
}

// 异步保存函数
async function handleSaveActionAsync() {
  if (!props.sceneId || !props.blockId || !props.episode) {
    console.error('[ActionEditor] 保存需要 sceneId 和 blockId')
    return
  }

  const episodeId = route.params['id'] as string
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  if (!block.actions) {
    block.actions = []
  }

  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  try {
    await projectStore.saveProject()
    hasLocalChanges.value = false

  } catch (error) {
    console.error('[ActionEditor] 保存失败:', error)
  }
}

function handleSelectAction(action: Action | null) {
  selectedAction.value = action
  
  if (action) {
    currentSlotIndex.value = action.slotIndex
    
    // v6.8: 选中动作时，同时选中对应的场景对象
    const targetObjectId = findObjectIdByTarget(action.target)
    if (targetObjectId) {
      sceneObjectStore.selectObject(targetObjectId)
      
      // 如果是相机动作，同步拖拽状态到渲染器
      if (action.target === 'camera' && renderer.value) {
        const canDrag = action.type === 'camera_cut' || action.type === 'camera_move'
        renderer.value.setSelectedActionType(canDrag ? action.type : null)
      }
    }
  }
}

/**
 * v7.0: 根据动作的 target 查找对应的场景对象 ID
 * target 现在是实例ID，可能是: 'camera' 或对象 ID
 */
function findObjectIdByTarget(target: string): string | null {
  // 1. 相机
  if (target === 'camera') {
    const cameraObj = sceneObjectStore.objects.find(obj => obj.type === 'camera')
    return cameraObj?.id ?? null
  }
  
  // 2. v7.0: 直接通过实例ID查找
  const directObj = sceneObjectStore.getObject(target)
  if (directObj) {
    return directObj.id
  }

  const aliasObj = sceneObjectStore.objects.find(obj => obj.type !== 'camera' && obj.alias === target)
  if (aliasObj) {
    return aliasObj.id
  }
  
  return null
}

// ActionSequencer 事件处理
function handleSlotIndexChange(index: number) {
  currentSlotIndex.value = index
  selectedAction.value = null
  handleSceneUpdateBySlot()
}


function handleUpdateActionFromSequencer(action: Action, updates: Partial<Action>) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block?.actions) return
  
  const index = block.actions.findIndex((a: Action) => a.id === action.id)
  if (index === -1) return
  
  const targetAction = block.actions[index]
  if (targetAction) {
    const previousSlotIndex = targetAction.slotIndex
    const nextSlotIndex = updates.slotIndex ?? previousSlotIndex
    const isMovingSlot = nextSlotIndex !== previousSlotIndex
    const nextUpdates = { ...updates }
    if (isMovingSlot) {
      delete nextUpdates.order
    }

    if (targetAction.target === 'camera' && isCameraActionType(targetAction.type)) {
      const candidate = { ...targetAction, ...nextUpdates } as Action
      const conflict = findCameraConflict(block.actions, candidate, { excludeId: targetAction.id })
      if (conflict) {
        saveToastMessage.value = '相机动作冲突：该时间段已有其他相机动作'
        saveToastType.value = 'error'
        showSaveToast.value = true
        setTimeout(() => {
          showSaveToast.value = false
        }, 3000)
        return
      }
    }

    Object.assign(targetAction, nextUpdates)
    if (isMovingSlot) {
      applyActionSlotMoveOrderPolicy(block.actions, targetAction, previousSlotIndex, targetAction.slotIndex)
    }
  }
  
  if (selectedAction.value?.id === action.id) {
    selectedAction.value = { ...selectedAction.value, ...targetAction } as Action
  }
  
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // Action Mode：更新场景图上下文并重新渲染
  const sceneGraph3 = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph3) {
    void refreshActionContextAndRender(scene, block)
  }
  
  markLocalChange()
}

function getActionObjectIndexMap(): Map<string, number> {
  const map = new Map<string, number>()
  sceneObjectStore.objects.forEach((obj, index) => {
    map.set(obj.id, index)
  })
  return map
}

function applyActionSlotMoveOrderPolicy(
  actions: Action[],
  action: Action,
  previousSlotIndex: number,
  nextSlotIndex: number
): void {
  if (nextSlotIndex === previousSlotIndex) return

  const sourceSlotWasCustom = hasCustomActionOrderForSlot(actions, previousSlotIndex)
  const targetSlotWasCustom = hasCustomActionOrderForSlot(
    actions.filter((existing: Action) => existing.id !== action.id),
    nextSlotIndex,
  )
  const objectIndexMap = getActionObjectIndexMap()

  if (sourceSlotWasCustom) {
    reconcileActionOrderForSlot(actions, previousSlotIndex, { mode: 'custom', objectIndexMap })
  }

  if (targetSlotWasCustom) {
    reconcileActionOrderForSlot(actions, nextSlotIndex, {
      mode: 'custom',
      appendActionId: action.id,
      objectIndexMap,
    })
  } else {
    delete action.order
  }
}

function handleReorderActionsInSlot(slotIndex: number, actionIds: string[]) {
  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block?.actions) return

  reconcileActionOrderForSlot(block.actions, slotIndex, {
    mode: 'custom',
    actionIds,
    objectIndexMap: getActionObjectIndexMap(),
  })

  if (selectedAction.value) {
    const latestSelected = block.actions.find((action: Action) => action.id === selectedAction.value?.id)
    if (latestSelected) {
      selectedAction.value = { ...latestSelected } as Action
    }
  }

  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  const sceneGraph = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph) {
    void refreshActionContextAndRender(scene, block)
  }

  markLocalChange()
}

function handleResetActionOrderInSlot(slotIndex: number) {
  if (!props.sceneId || !props.blockId || !props.episode) return

  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return

  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block?.actions) return

  const changed = reconcileActionOrderForSlot(block.actions, slotIndex, { mode: 'default' })
  if (!changed) return

  if (selectedAction.value) {
    const latestSelected = block.actions.find((action: Action) => action.id === selectedAction.value?.id)
    if (latestSelected) {
      selectedAction.value = { ...latestSelected } as Action
    }
  }

  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })

  const sceneGraph = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph) {
    void refreshActionContextAndRender(scene, block)
  }

  markLocalChange()
}


/**
 * P2: 统一删除对象（支持多 ID）— PIXI 摘离 + Store/Episode 移除 + Actions 过滤 + 持久化 + 重渲染
 */
function deleteCompositeObjects(idsToDelete: string[], compositeId?: string): void {
  const episode = props.episode
  if (!episode) return
  const scene = episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return

  // 1. PIXI 层级清理：composite 容器的子容器需先摘离
  const sceneGraphCleanup = renderer.value?.getSceneGraph()
  if (sceneGraphCleanup && compositeId) {
    const compositeContainer = sceneGraphCleanup.getContainer(compositeId)
    if (compositeContainer) {
      compositeContainer.removeChildren()
    }
  }

  // 2. 删除 Store + Episode 持久数据
  const allDeletedIds = new Set(idsToDelete)
  for (const id of idsToDelete) {
    sceneObjectStore.removeSetupObject(id)
  }
  // v24: removeSetupObject 内部自动整体覆盖到 episode（含 onBeforeDelete 级联修改 + renderChain）

  // 3. 过滤 actions（目标对象）
  block.actions = (block.actions ?? []).filter((a: Action) => !allDeletedIds.has(a.target))

  // 4. 持久化 + 重渲染
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  if (renderer.value && sceneGraphCleanup) {
    void refreshActionContextAndRender(scene, block)
  }
  markLocalChange()
}



function handleDeleteActionFromSequencer(action: Action) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block?.actions) return
  
  const index = block.actions.findIndex((a: Action) => a.id === action.id)
  if (index === -1) return
  
  // v9.3: 检查是否为出生 action，如果是则级联删除
  if (isBirthAction(action)) {
    const targetId = action.target
    
    // 双层架构：从持久层检查被删除的对象是否为 composite
    const setupObj = sceneObjectStore.getSetupObject(targetId)
    const isComposite = setupObj?.type === 'composite'
    
    // P2: composite 级联处理 — 必须在过滤 actions 之前收集信息
    if (isComposite) {
      // 递归收集所有后代 ID
      function collectAllDescendantIds(parentId: string): string[] {
        const parentSetup = sceneObjectStore.getSetupObject(parentId)
        let directChildIds: string[] = []
        if (parentSetup?.type === 'composite') {
          directChildIds = [...((parentSetup as unknown as { childIds: string[] }).childIds || [])]
        }
        const allIds = [...directChildIds]
        for (const childId of directChildIds) {
          const childObj = sceneObjectStore.getSetupObject(childId)
          if (childObj?.type === 'composite') {
            allIds.push(...collectAllDescendantIds(childId))
          }
        }
        return allIds
      }
      const affectedChildIds = collectAllDescendantIds(targetId)
      
      if (affectedChildIds.length > 0) {
        const compositeMode = (setupObj as unknown as { compositeMode?: string }).compositeMode ?? 'entity'
        if (compositeMode === 'entity') {
          // entity: 直接级联删除（不弹三选项对话框）
          deleteCompositeObjects([targetId, ...affectedChildIds], targetId)
          console.log(`[ActionEditor] 级联删除 entity composite ${targetId} + ${affectedChildIds.length} 个后代`)
        } else {
          // union: 仅删除组合（子对象由 onBeforeDelete 自动冒泡）
          deleteCompositeObjects([targetId], targetId)
          console.log(`[ActionEditor] 仅删除 union composite ${targetId}，解绑 ${affectedChildIds.length} 个子对象`)
        }
      } else {
        // 无子对象：直接删除
        deleteCompositeObjects([targetId], targetId)
        console.log(`[ActionEditor] 删除 composite ${targetId}（无子对象）`)
      }
    } else {
      // 非 composite：直接删除该对象
      deleteCompositeObjects([targetId])
      console.log(`[ActionEditor] 删除动态对象 ${targetId} 及其所有 action`)
    }
    // deleteCompositeObjects 已处理持久化 + 重渲染，清理选中状态后返回
    if (selectedAction.value?.id === action.id) {
      selectedAction.value = null
    }
    return
  } else {
    // 普通 action：只删除该 action
    block.actions.splice(index, 1)
  }
  
  if (selectedAction.value?.id === action.id) {
    selectedAction.value = null
  }
  
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // Action Mode：更新场景图上下文并重新渲染
  const sceneGraph4 = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph4) {
    void refreshActionContextAndRender(scene, block)
  }
  
  markLocalChange()
}

function handleAddActionFromSequencer(type: string, target: string, slotIndex: number) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }

  if (isCameraActionType(type)) {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const category = type === 'camera_cut' ? 'point' : 'duration'
    const params = type === 'camera_follow'
      ? { followTarget: '', damping: 0, offsetX: 0, offsetY: -50, zoom: 1, constrainBounds: true }
      : type === 'camera_shake'
        ? { intensity: 10, decay: true, frequency: 30 }
        : { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, zoom: 1 }

    const newAction: Action = {
      id: actionId,
      type,
      category,
      target: 'camera',
      slotIndex,
      params,
    } as Action

    if (category === 'duration') {
      ;(newAction as unknown as BaseDurationAction).slotSpan = 1
      ;(newAction as unknown as BaseDurationAction).easing = 'linear'
    }

    selectedAction.value = upsertCameraAction(block.actions, newAction)

    const episodeId = route.params['id'] as string
    episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
      actions: block.actions
    })

    markLocalChange()
    return
  }
  
  const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  let newAction: Action
  if (type === 'set_transform') {
    // 视觉属性动作（替代原来的 set_active）
    newAction = {
      id: actionId,
      type: 'set_transform',
      category: 'point',
      target,
      slotIndex,
      params: { visible: true }
    } as Action
  } else if (type === 'camera_cut') {
    // 相机切换（瞬时动作）
    newAction = {
      id: actionId,
      type: 'camera_cut',
      category: 'point',
      target: 'camera',
      slotIndex,
      params: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, zoom: 1 }  // 默认画布中心
    } as Action
  } else if (type === 'camera_move') {
    // 运镜（持续动作）
    newAction = {
      id: actionId,
      type: 'camera_move',
      category: 'duration',
      target: 'camera',
      slotIndex,
      slotSpan: 1,
      easing: 'linear',
      params: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, zoom: 1 }
    } as Action
  } else if (type === 'camera_shake') {
    // 震动（持续动作）
    newAction = {
      id: actionId,
      type: 'camera_shake',
      category: 'duration',
      target: 'camera',
      slotIndex,
      slotSpan: 1,
      easing: 'linear',
      params: { intensity: 10, decay: true, frequency: 30 }
    } as Action
  } else if (type === 'set_material') {
    // v16: 切换元件素材 / v18: 切换表情引用
    const symbolObj = sceneObjectStore.getObject(target)
    let currentMaterialId = ''
    if (symbolObj?.type === 'symbol') {
      currentMaterialId = (symbolObj as unknown as { currentMaterialId?: string }).currentMaterialId ?? ''
    } else if (symbolObj?.type === 'expression') {
      currentMaterialId = symbolObj.refId ?? ''
    }
    newAction = {
      id: actionId,
      type: 'set_material',
      category: 'point',
      target,
      slotIndex,
      params: { materialId: currentMaterialId }
    } as Action
  } else {
    return
  }
  
  appendActionWithSlotOrder(block.actions, newAction)
  
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  selectedAction.value = newAction
  markLocalChange()
}

/* 
 * v7.17: 重构：移除播放控制函数
 * 播放/暂停逻辑已完全移至预览对话框
function handlePlay() { ... }
function handlePause() { ... }
function handleStopPlayback() { ... }
*/

// v8.6: handleHoverAction 已移除（左侧边栏删除）

// v8.6: handleRequestDeleteActionConfirm 已移除（ActionListPanel 删除，但保留在 ActionSequencer 中有别的删除逻辑）

// v9.3: 处理视觉属性变更（创建或更新 set_visual action）
function handleVisualActionUpdate(params: { visible?: boolean; flipX?: boolean; zIndex?: number; receiveLighting?: boolean; castShadow?: boolean }) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const targetObject = sceneObjectStore.getSelectedObject()
  if (!targetObject) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  // 查找当前槽位是否已有该对象的 set_visual action
  const existingAction = block.actions.find((a: Action) => 
    a.type === 'set_visual' && 
    a.target === targetObject.id && 
    a.slotIndex === currentSlotIndex.value
  )
  
  if (existingAction) {
    // 更新已有的 set_visual action
    const visualAction = existingAction as SetVisualAction
    visualAction.params = { ...visualAction.params, ...params }
    
    // 选中这个 action
    selectedAction.value = visualAction
    
    console.log(`[ActionEditor] 更新 set_visual action: ${visualAction.id}`, params)
  } else {
    // 创建新的 set_visual action
    const actionId = generateId('action')
    const newAction: SetVisualAction = {
      id: actionId,
      type: 'set_visual',
      category: 'point',
      target: targetObject.id,
      slotIndex: currentSlotIndex.value,
      params: { ...params }
    }
    
    appendActionWithSlotOrder(block.actions, newAction)
    
    // 自动选中新创建的 action
    selectedAction.value = newAction
    
    console.log(`[ActionEditor] 创建 set_visual action: ${actionId}`, params)
  }
  
  // 更新 store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // 刷新场景图上下文
  const sceneGraph = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph) {
    void refreshActionContextAndRender(scene, block)
  }
  
  markLocalChange()
}

// v16: 处理元件素材切换（创建或更新 set_material Action）
function handleMaterialActionUpdate(materialId: string) {
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const targetObject = sceneObjectStore.getSelectedObject()
  // v18: 同时支持 symbol 和 expression 类型
  if (!targetObject || (targetObject.type !== 'symbol' && targetObject.type !== 'expression')) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  if (!block.actions) {
    block.actions = []
  }
  
  // 查找当前 Slot 是否已有该对象的 set_material Action
  const existingAction = block.actions.find((a: Action) => 
    a.type === 'set_material' && 
    a.target === targetObject.id && 
    a.slotIndex === currentSlotIndex.value
  )
  
  if (existingAction) {
    const materialAction = existingAction as SetMaterialAction
    materialAction.params = { materialId }
    selectedAction.value = materialAction
  } else {
    const actionId = generateId('action')
    const newAction: SetMaterialAction = {
      id: actionId,
      type: 'set_material',
      category: 'point',
      target: targetObject.id,
      slotIndex: currentSlotIndex.value,
      params: { materialId }
    }
    appendActionWithSlotOrder(block.actions, newAction)
    selectedAction.value = newAction
  }
  
  // 更新 store
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // 刷新场景图上下文
  const sceneGraph = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph) {
    void refreshActionContextAndRender(scene, block)
  }
  
  markLocalChange()
}

// v16: 处理元件素材列表保存（同步到 Setup 持久层）
function handleMaterialSave(materials: SymbolMaterial[], _currentMaterialId: string | undefined) {
  if (!props.sceneId || !props.episode) return
  
  const targetObject = sceneObjectStore.getSelectedObject()
  if (targetObject?.type !== 'symbol') return
  
  // v24: updateSetupObject 自动同步到 episode
  sceneObjectStore.updateSetupObject(targetObject.id, { materials } as Partial<SceneObject>)
  
  markLocalChange()
}

// v24: 处理动画更新（修复 bug：之前只写了 episode 未写 store）
function handleAnimationsUpdated(objectId: string, animations: Record<string, import('@/types/animation').AnimationDefinition>) {
  // v24: updateSetupObject 同时写入 setupState + runtimeState + episode
  sceneObjectStore.updateSetupObject(objectId, { animations } as Partial<SceneObject>)
  markLocalChange()
}

async function handleActionInspectorUpdate(updates: Partial<Action>) {
  if (!selectedAction.value || !props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block?.actions) return
  
  const index = block.actions.findIndex((a: Action) => a.id === selectedAction.value?.id)
  if (index === -1) return

  if ((updates.slotIndex !== undefined || (updates as { slotSpan?: number }).slotSpan !== undefined) &&
      selectedAction.value?.target === 'camera' &&
      isCameraActionType(selectedAction.value.type)) {
    const candidate = { ...selectedAction.value, ...updates } as Action
    const conflict = findCameraConflict(block.actions, candidate, { excludeId: selectedAction.value.id })

    if (conflict) {
      console.warn('[ActionEditor] Camera action conflict detected, update ignored')
      
      saveToastMessage.value = '相机动作冲突：该时间段已有其他相机动作'
      saveToastType.value = 'error'
      showSaveToast.value = true
      setTimeout(() => {
        showSaveToast.value = false
      }, 3000)
      
      // 强制刷新 Inspector 以回滚值 (通过重新赋值 selectedAction)
      selectedAction.value = { ...selectedAction.value } as Action
      return
    }
  }

  // v6.12: 通用持续动作互斥性检查 (针对非相机对象，如 tween_transform)
  // 确保 tween_transform 等持续动作不会重叠
  if ((updates.slotIndex !== undefined || (updates as { slotSpan?: number }).slotSpan !== undefined) && 
      selectedAction.value?.target !== 'camera' &&
      selectedAction.value.category === 'duration') {
      
      const newSlotIndex = updates.slotIndex ?? selectedAction.value.slotIndex
      const newSlotSpan = (updates as { slotSpan?: number }).slotSpan ?? ((selectedAction.value as { slotSpan?: number }).slotSpan ?? 1)
      
      const hasConflict = block.actions.some((a: Action) => {
          if (a.id === selectedAction.value?.id) return false
          if (a.target !== selectedAction.value?.target) return false
          if (a.category !== 'duration') return false
          
          const aSpan = (a as { slotSpan?: number }).slotSpan ?? 1
          const aStart = a.slotIndex
          const aEnd = aStart + aSpan - 1
          
          const newStart = newSlotIndex
          const newEnd = newStart + newSlotSpan - 1
          
          return !(newEnd < aStart || newStart > aEnd)
      })
      
      if (hasConflict) {
          console.warn('[ActionEditor] Duration action overlap detected, update ignored')
          
          saveToastMessage.value = '动作冲突：该对象在此时段已有其他持续动作'
          saveToastType.value = 'error'
          showSaveToast.value = true
          setTimeout(() => {
              showSaveToast.value = false
          }, 3000)
          
          selectedAction.value = { ...selectedAction.value } as Action
          return
      }
  }
  const targetAction = block.actions[index]
  if (targetAction) {
      const previousSlotIndex = targetAction.slotIndex
      const nextSlotIndex = updates.slotIndex ?? previousSlotIndex
      const nextUpdates = { ...updates }
      if (nextSlotIndex !== previousSlotIndex) {
        delete nextUpdates.order
      }

      Object.assign(targetAction, nextUpdates)
      applyActionSlotMoveOrderPolicy(block.actions, targetAction, previousSlotIndex, targetAction.slotIndex)
      selectedAction.value = { ...selectedAction.value, ...targetAction } as Action
  }
  
  const episodeId = route.params['id'] as string
  episodeStore.updateBlockInScene(episodeId, props.sceneId, props.blockId, {
    actions: block.actions
  })
  
  // Action Mode：更新场景图上下文并重新渲染
  // 必须先 await setActionModeContext（清除状态缓存），再 renderObjects
  const sceneGraph6 = renderer.value?.getSceneGraph()
  if (renderer.value && sceneGraph6) {
    await refreshActionContextAndRender(scene, block)
  }
  
  markLocalChange()
}

function handleActionInspectorDelete() {
  if (!selectedAction.value) return
  handleDeleteActionFromSequencer(selectedAction.value)
}

// v7.17: 重构：从 handleTimeUpdate 变更为 handleSceneUpdateBySlot
// 移除 time 参数，完全依赖 currentSlotIndex 驱动
function handleSceneUpdateBySlot() {
  if (!renderer.value || !currentBlock.value) return
  
  // 更新全局 currentTime (仅用于 UI 显示总时长等静态信息)
  const slots = currentBlockSlots.value
  // const currentSlot = slots.find(s => s.index === currentSlotIndex.value)
  // if (currentSlot) {
  //    currentTime.value = currentSlot.startTime
  // }
  
  if (!props.sceneId || !props.blockId || !props.episode) return
  
  const scene = props.episode.scenes.find((s: SceneContainer) => s.id === props.sceneId)
  if (!scene) return
  
  const block = scene.script.find((b: ScriptBlock) => b.id === props.blockId)
  if (!block) return
  
  const sceneGraph = renderer.value.getSceneGraph()
  const prevContext = sceneGraph.getActionModePrevContext?.() ?? calculatePrevContext(scene, props.blockId)
  
  if (renderer.value.updateSceneStateBySlot) {
    // v7.17: 使用纯 Slot 驱动模式
    // 注意：ActionSequencer 可能会提供 currentSlotIndex
    
    // v8.3: 使用当前选中的 Slot 索引进行渲染
    // 根据 Ghost Mode PRD 规范：
    // - 情况 C（无动作）：Real 显示 Slot S 之前的累积状态 (State at Slot Start)
    // 因此必须使用 currentSlotIndex 而非 finalSlotIndex
    
    // 驱动渲染器更新状态 (基于 Slot)
    renderer.value.updateSceneStateBySlot(
      currentSlotIndex.value, // v8.3: 使用当前选中的 Slot 索引
      block.actions ?? [],
      prevContext,
      slots
    )
    
    // v7.17: 日志逻辑
    // 为了保持调试信息的完整性，我们暂时保留 logTargetStates
    // 计算 Target State 仅用于日志
    // 注意：renderer 已经在内部计算并应用了，这里只是为了 logging
    
    // const slots = currentBlockSlots.value // defined above
    // 传递 0 作为 duration，因为 BySlot 函数不使用 duration
    
    const targetStates = new Map<string, ActionRuntimeState>()
    // 1. 计算对象 Target States
    // v7.18: 日志改为打印 Block 最终状态 (Final State)

    for (const obj of prevContext.objects) {
      const targetId = obj.id
      // Phase 4e: obj 已是 SceneObject，直接传入
      const objectActions = (block.actions ?? []).filter((a: Action) => a.target === targetId)
      
      const targetState = evaluateObjectStateBySlot(
          obj, 
          objectActions, 
          currentSlotIndex.value, 
          slots,
          {
            getObjectState: (id: string) => {
              const o = prevContext.objects.find(ob => ob.id === id)
              return o ? (o as unknown as WriteableState) : undefined
            }
          }
      )
      
      if (targetState) targetStates.set(targetId, targetState)
    }
    
    // 2. 计算相机 Target State
    const visualCenters = new Map<string, { x: number, y: number }>()
    for (const obj of prevContext.objects) {
      if (targetStates.has(obj.id)) {
          const s = targetStates.get(obj.id)!
          visualCenters.set(obj.id, { x: s.x, y: s.y })
      } else {
          visualCenters.set(obj.id, { x: obj.x, y: obj.y })
      }
    }
    
    const cameraActions = (block.actions ?? []).filter((a: Action) => a.target === 'camera')
    const startCameraState: RuntimeCameraState = {
        x: prevContext.camera.x, y: prevContext.camera.y, zoom: prevContext.camera.zoom,
        shakeOffsetX: 0, shakeOffsetY: 0
    }
    
    // 同样使用 BySlot 函数计算相机状态
    const cameraTargetState = evaluateCameraStateBySlot(
        startCameraState, 
        cameraActions, 
        currentSlotIndex.value, 
        slots, 
        visualCenters, 
        null
    )
    
    if (cameraTargetState) targetStates.set('camera', cameraTargetState as unknown as ActionRuntimeState)
    
  } else if (renderer.value.updateTime) {
    // 兼容旧模式 (Fallback - 虽然现在不应该走到这里)
    let blockDuration = 0
    if (block.type === 'dialogue' || block.type === 'narration') {
        blockDuration = block.ttsConfig?.duration ?? 0
    } else if ((block as { type: string }).type === 'action') {
        blockDuration = (block as { duration: number }).duration ?? 0
    }

    // 尝试用 Slot 时间模拟 updateTime
    const slots = currentBlockSlots.value
    const currentSlot = slots.find(s => s.index === currentSlotIndex.value)
    const time = currentSlot ? currentSlot.startTime : 0

    renderer.value.updateTime(
      time, 
      blockDuration, 
      block.actions ?? [], 
      prevContext,
      currentBlockSlots.value // Pass slots
    )
  }
}

function handleZIndexChanged() {
  if (renderer.value) {
    void renderer.value.renderObjects()
  }
}

function handleInitialStateUpdate(_pose?: string, _expression?: string) {
  // Action模式下不更新初始状态
}

function handleMoveUp() {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return
  
  const newZIndex = selected.zIndex + 1
  // v7.20: Action Mode 禁止修改 Store
  // sceneObjectStore.updateObject(selected.id, { zIndex: newZIndex })
  
  // 在 Action Mode 下，将 z-index 变化合并到瞬时动作中
  const targetAlias = getTargetAliasFromObject(selected)
  if (targetAlias) {
    // 所有对象统一使用 set_transform
    const actionType = 'set_transform' as const
    upsertPointAction(actionType, targetAlias, currentSlotIndex.value, { params: { zIndex: newZIndex } })
  }
  
  handleZIndexChanged()
}

function handleMoveDown() {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return
  
  const newZIndex = Math.max(-10, selected.zIndex - 1)
  // v7.20: Action Mode 禁止修改 Store
  // sceneObjectStore.updateObject(selected.id, { zIndex: newZIndex })
  
  // 在 Action Mode 下，将 z-index 变化合并到瞬时动作中
  const targetAlias = getTargetAliasFromObject(selected)
  if (targetAlias) {
    // 所有对象统一使用 set_transform
    const actionType = 'set_transform' as const
    upsertPointAction(actionType, targetAlias, currentSlotIndex.value, { params: { zIndex: newZIndex } })
  }
  
  handleZIndexChanged()
}

function handleTriggerAnim(payload: { action: 'play'|'stop', animName: string, loop?: boolean, speed?: number, timingMode?: AnimationTimingMode }) {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return
  if (!payload.animName) return

  const targetAlias = getTargetAliasFromObject(selected)
  if (!targetAlias) return

  const animItem: SetAnimAction['params']['animations'][number] = {
    animName: payload.animName,
    action: payload.action,
    autoStopOnBlockEnd: true
  }
  if (payload.loop !== undefined) {
    animItem.loop = payload.loop
  }
  if (payload.action === 'play' && payload.timingMode !== undefined) {
    animItem.timingMode = payload.timingMode
  }

  // v11.88: 使用 animations 数组格式
  const params: SetAnimAction['params'] = {
    animations: [animItem],
    ...(payload.speed !== undefined ? { speed: payload.speed } : {})
  }

  upsertPointAction('set_anim', targetAlias, currentSlotIndex.value, { params })
}

function handleTriggerAudio(payload: { action: 'play'|'stop', volume?: number, loop?: boolean, fadeIn?: number, fadeOut?: number }) {
  const selected = sceneObjectStore.getSelectedObject()
  if (!selected) return

  const targetAlias = getTargetAliasFromObject(selected)
  if (!targetAlias) return

  upsertPointAction('set_audio', targetAlias, currentSlotIndex.value, { params: payload })
}

function handleTriggerTextReveal(payload: { action: 'play'|'stop', mode?: 'typewriter' }) {
  const selected = sceneObjectStore.getSelectedObject()
  if (selected?.type !== 'text') return

  const targetAlias = getTargetAliasFromObject(selected)
  if (!targetAlias) return

  upsertPointAction('set_text_reveal', targetAlias, currentSlotIndex.value, { params: payload })
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const container = actionEditorContainer.value
    if (container) {
      container.requestFullscreen().then(() => {
        isFullscreen.value = true
      }).catch((err) => {
        console.error('[ActionEditor] 进入全屏失败:', err)
      })
    }
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
    }).catch((err) => {
      console.error('[ActionEditor] 退出全屏失败:', err)
    })
  }
}

// 处理底部动作编辑器折叠/展开状态变化
function handleSequencerCollapseChange(_collapsed: boolean) {
  // 等待 DOM 更新和 CSS 过渡动画完成后，重新计算视口尺寸
  setTimeout(() => {
    if (renderer.value) {
      renderer.value.updateTransformParams()
      // v7.23: 使用 handleSceneUpdateBySlot() 代替 renderObjects()
      // 确保 Action Mode 状态正确重新应用
      handleSceneUpdateBySlot()
    }
  }, 300)
}

// v8.6: startResizeLeftPanel 已移除（左侧边栏删除）

function startResizeRightPanel(event: MouseEvent) {
  isResizingRightPanel = true
  event.preventDefault()
  
  const handleMouseMove = (e: MouseEvent) => {
    if (isResizingRightPanel) {
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
      rightPanelWidth.value = newWidth
    }
  }
  
  const handleMouseUp = () => {
    isResizingRightPanel = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    
    if (renderer.value) {
      renderer.value.updateTransformParams()
      // v7.23: 使用 handleSceneUpdateBySlot() 确保 Action Mode 状态
      handleSceneUpdateBySlot()
    }
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

// 组件销毁时重置 Action Mode 标记，避免泄漏到 Setup Mode
onBeforeUnmount(() => {
  sceneObjectStore.setActionMode(false)
})
</script>

<style scoped>
.action-editor {
  display: flex;
  height: 100%;  /* v6.10: Overlay 模式下占满父容器 */
  background: #f9fafb;
}

.left-panel {
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.panel-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid #e5e7eb;
}

.panel-section:last-child {
  border-bottom: none;
}

.section-header {
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.section-header h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.panel-section > :not(.section-header) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.collapse-btn {
  padding: 4px 8px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.expand-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  padding: 8px 6px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  background: white;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.expand-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.expand-btn.left {
  left: 8px;
}

.expand-btn.right {
  right: 8px;
}

.resizer {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.2s;
}

.resizer:hover {
  background: #3b82f6;
}

.left-resizer::before,
.right-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  left: -2px;
}

.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  min-width: 0;
}

.action-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mouse-position {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #6b7280;
  min-width: 160px;
}

.save-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #dcfce7;
  color: #166534;
  font-weight: 500;
}

.save-status.unsaved {
  background: #fef3c7;
  color: #92400e;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scene-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
}

.mode-icon {
  font-size: 16px;
}

.mode-label {
  font-weight: 500;
  color: #6b7280;
}

.block-description {
  font-weight: 500;
  color: #111827;
}

.toolbar-btn {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn.icon-only {
  padding: 6px 10px;
  font-size: 16px;
  min-width: 36px;
}

.toolbar-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.toolbar-btn.primary:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}

.toolbar-btn.preview-btn {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border-color: #8b5cf6;
  color: white;
  font-weight: 500;
}

.toolbar-btn.preview-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border-color: #7c3aed;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #1a1a1a;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  min-height: 0;
}

.right-panel {
  flex-shrink: 0;
  background: white;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}

.right-panel > :not(.panel-header) {
  flex: 1;
  overflow-y: auto;
}

/* v11.0: Tab 切换样式 */
.panel-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  margin-left: 8px;
}

.panel-tab {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  white-space: nowrap;
}

.panel-tab:hover {
  background: #e5e7eb;
  color: #374151;
}

.panel-tab.active {
  background: #3b82f6;
  color: white;
}

.save-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  min-width: 200px;
  justify-content: center;
}

.save-toast.success {
  background: #10b981;
  color: white;
}

.save-toast.error {
  background: #ef4444;
  color: white;
}

.toast-icon {
  font-size: 18px;
  font-weight: bold;
}

.toast-message {
  font-size: 14px;
}

.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
}

.action-editor:fullscreen {
  height: 100vh;
}

.action-editor:fullscreen .canvas-area {
  height: 100%;
}

:deep(canvas) {
  display: block;
  flex-shrink: 0;
  margin: 0 auto;
}

/* v8.3: 文本编辑按钮样式 */
.edit-text-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
  margin-left: 4px;
}

.edit-text-btn:hover {
  opacity: 1;
}

/* v8.3: 文本编辑对话框样式 */
.text-edit-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.text-edit-dialog {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.text-edit-dialog .dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  font-weight: 500;
  color: #333;
}

.text-edit-dialog .close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  padding: 0 4px;
}

.text-edit-dialog .close-btn:hover {
  color: #333;
}

.text-edit-dialog .dialog-body {
  padding: 16px;
}

.text-edit-textarea {
  width: 100%;
  background: #f8f9fa;
  border: 1px solid #ced4da;
  border-radius: 4px;
  color: #333;
  font-size: 14px;
  padding: 10px;
  resize: vertical;
  min-height: 100px;
}

.text-edit-textarea:focus {
  outline: none;
  border-color: #0d6efd;
  box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.15);
}

.text-edit-dialog .dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
}

.text-edit-dialog .cancel-btn,
.text-edit-dialog .confirm-btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.text-edit-dialog .cancel-btn {
  background: #f8f9fa;
  border: 1px solid #ced4da;
  color: #333;
}

.text-edit-dialog .cancel-btn:hover {
  background: #e9ecef;
}

.text-edit-dialog .confirm-btn {
  background: #0d6efd;
  border: none;
  color: #fff;
}

.text-edit-dialog .confirm-btn:hover {
  background: #0b5ed7;
}

/* v9.2: 添加素材按钮样式 (与 Setup Mode 保持一致) */
.toolbar-btn.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: #3b82f6;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.toolbar-btn.add-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.add-menu-container {
  position: relative;
}

.add-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 160px;
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

.btn-icon {
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

.btn-text {
  font-size: 13px;
  font-weight: 500;
}

/* 成组模式 CSS 已移至 GroupingModePanel.vue */

.pass-through-tip-bubble {
  position: absolute;
  top: 125%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #3b82f6;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: bounceTip 1.5s infinite;
}
.pass-through-tip-bubble::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: transparent transparent #3b82f6 transparent;
}
@keyframes bounceTip {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -4px); }
}

</style>
