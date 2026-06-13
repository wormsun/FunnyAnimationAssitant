<template>
  <!-- Overlay 对话框容器 -->
  <div
    class="editor-overlay"
    @click.self="handleReturn"
  >
    <div
      ref="characterEditorContainer"
      class="editor-dialog"
    >
      <!-- P1: 页面级工具栏 — 文档元数据 & 全局操作 -->
      <div class="editor-toolbar">
        <div class="toolbar-left-page">
          <button
            class="cancel-btn"
            @click="handleReturn"
          >
            ← 返回
          </button>
          <div class="character-title">
            <span class="mode-icon">👤</span>
            <input
              v-model="characterName"
              class="title-input"
              placeholder="输入人物名称"
              @blur="handleNameCommit"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            >
          </div>

          <!-- 性别选择器 -->
          <div class="gender-selector">
            <button
              v-for="opt in genderOptions"
              :key="opt.value"
              class="gender-btn"
              :class="{ active: selectedGender === opt.value }"
              @click="handleGenderChange(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- 标签编辑区 -->
          <div class="tag-editor-container">
            <span
              v-for="tag in selectedTags.slice(0, 1)"
              :key="tag"
              class="inline-tag"
            >
              {{ tag }}
              <button
                class="tag-remove-inline"
                @click="removeTag(tag)"
              >
                ×
              </button>
            </span>
            <span
              v-if="selectedTags.length > 1"
              class="more-tags-hint"
            >
              +{{ selectedTags.length - 1 }}
            </span>

            <button
              class="toolbar-btn icon-only"
              title="编辑标签"
              @click="showTagEditor = !showTagEditor"
            >
              🏷️
            </button>

            <!-- 标签编辑弹出面板 -->
            <div
              v-if="showTagEditor"
              class="tag-editor-popover"
              @click.stop
            >
              <div class="popover-header">
                编辑标签
              </div>
              <div class="popover-body">
                <div class="popover-tags-display">
                  <span
                    v-for="tag in selectedTags"
                    :key="tag"
                    class="popover-tag-chip"
                  >
                    {{ tag }}
                    <button
                      class="popover-tag-remove"
                      @click="removeTag(tag)"
                    >
                      ×
                    </button>
                  </span>
                  <span
                    v-if="selectedTags.length === 0"
                    class="no-tags-hint"
                  >
                    暂无标签
                  </span>
                </div>
                <input
                  v-model="newTagInput"
                  class="popover-tag-input"
                  placeholder="输入标签后按回车"
                  @keydown.enter="addTag"
                >
                <div
                  v-if="recommendedTags.length > 0"
                  class="popover-recommended-tags"
                >
                  <span class="recommend-label">推荐：</span>
                  <span
                    v-for="tag in recommendedTags"
                    :key="tag"
                    class="popover-recommend-tag"
                    @click="addTagDirectly(tag)"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="toolbar-right-page">
          <button
            class="action-btn"
            title="预定义名称检查（重复名称 / 缺推荐名 / 非规范命名）"
            :disabled="!rootCompositeId"
            @click="showNamingCheck = true"
          >
            🔍 预定义名称检查
          </button>
          <button
            class="action-btn"
            title="生成缩略图"
            @click="handleGenerateThumbnail"
          >
            📷 缩略图
          </button>
          <button
            class="action-btn"
            title="导入 config.json"
            @click="handleImportConfig"
          >
            📥 导入
          </button>
          <button
            class="action-btn"
            title="从其他人物复制 composite 结构和动画"
            @click="handleStartSync"
          >
            📋 从其他人物复制结构
          </button>

          <button
            class="save-btn"
            @click="handleSaveCharacter"
          >
            保存
          </button>
        </div>
      </div>

      <!-- Main Content: 与 SetupEditor 共享的工作区布局 -->
      <div class="editor-body">
        <main class="canvas-area">
          <!-- P2: 画布级工具栏 — 对象操作 & 视图控制 -->
          <div class="setup-toolbar">
            <div class="toolbar-left">
              <span
                class="save-status"
                :class="{ unsaved: hasLocalChanges }"
              >
                {{ hasLocalChanges ? '● 未保存' : '✓ 已保存' }}
              </span>
              <span class="mouse-position">
                ({{ renderer?.mousePosition?.x || 0 }}, {{ renderer?.mousePosition?.y || 0 }})
              </span>
            </div>
            <div class="toolbar-right">
              <button
                class="toolbar-btn preview-btn"
                title="预览人物"
                :disabled="!originalCharacter"
                @click="showPreview = true"
              >
                <span class="btn-icon">🔍</span>
                <span class="btn-text">预览</span>
              </button>
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
                    @click="handleMenuItemClick('expression')"
                  >
                    <span class="menu-icon">🎭</span>
                    <span>表情</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('backgrounds')"
                  >
                    <span class="menu-icon">🖼️</span>
                    <span>背景</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('props')"
                  >
                    <span class="menu-icon">📦</span>
                    <span>道具</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('sounds')"
                  >
                    <span class="menu-icon">🔊</span>
                    <span>音效</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('screen_effects')"
                  >
                    <span class="menu-icon">🌟</span>
                    <span>画面特效</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('symbol')"
                  >
                    <span class="menu-icon">🔧</span>
                    <span>元件</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('scene_templates')"
                  >
                    <span class="menu-icon">🧩</span>
                    <span>场景模板</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('characters')"
                  >
                    <span class="menu-icon">👤</span>
                    <span>人物</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('light')"
                  >
                    <span class="menu-icon">💡</span>
                    <span>光源</span>
                  </button>
                  <button
                    class="menu-item"
                    @click="handleMenuItemClick('text')"
                  >
                    <span class="menu-icon">📝</span>
                    <span>文本</span>
                  </button>
                </div>
              </div>
              <button
                class="toolbar-btn icon-only"
                title="复制选中对象"
                :disabled="sceneObjectStore.getSelectedObject()?.type === 'camera'"
                @click="handleCopyObject"
              >
                ❐
              </button>
              <button
                class="toolbar-btn icon-only"
                title="组合"
                :disabled="sceneObjectStore.getSelectedObject()?.type === 'camera'"
                @click="handleStartGrouping"
              >
                🔗
              </button>
              <button
                class="toolbar-btn danger icon-only"
                title="删除选中对象"
                :disabled="sceneObjectStore.getSelectedObject()?.type === 'camera'"
                @click="handleDeleteObject()"
              >
                🗑️
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
                  @remove="removeFromPassThrough"
                  @toggle-visible="togglePassThroughVisible"
                  @select-object="handleSelectObject"
                  @close="showPassThroughPanel = false"
                />
              </div>
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
            v-if="groupingState"
            v-model:composite-mode="selectedCompositeMode"
            :mode="groupingState.mode === 'create' ? 'create' : 'addTo'"
            :composite-name="groupingState.mode === 'addTo' ? getCompositeDisplayName(groupingState.compositeId) : undefined"
            :pending-ids="groupingState.pendingIds"
            :tree-nodes="groupingEligibleObjects"
            :locked-parent-id="lockedParentId"
            @toggle="handleGroupingToggleById"
            @confirm="handleGroupingConfirm(selectedCompositeMode)"
            @cancel="handleGroupingCancel"
          />



          <!-- 画布容器 -->
          <div
            ref="canvasContainer"
            class="canvas-container"
            @click="handleCanvasClick"
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
            <!-- 导入源路径浮动标签 -->
            <div
              v-if="characterImportSourcePath"
              class="import-source-tag"
              :title="characterImportSourcePath"
            >
              📂 {{ characterImportSourcePath }}
            </div>
          </div>
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
            <span class="panel-title">📋 属性</span>
          </div>

          <!-- 属性面板 -->
          <ObjectPropertiesPanel
            :selected-object="sceneObjectStore?.getSelectedObject()"
            :canvas-width="renderer?.canvasSize?.width || 1920"
            :canvas-height="renderer?.canvasSize?.height || 1080"
            :is-pass-through="selectedObjectIsPassThrough"
            :pass-through-visible="selectedObjectPassThroughVisible"
            :persist-changes="handleSaveCharacter"
            v-bind="rootCompositeId ? { rootCompositeId } : {}"
            @update="handleUpdateObject"
            @initial-state-update="handleInitialStateUpdate"
            @move-up="handleMoveUp"
            @move-down="handleMoveDown"
            @trigger-anim="handleTriggerAnim"
            @select-object="handleSelectObject"
            @edit-alias="handleEditAlias"
            @composite-action="handleCompositeAction"
            @animations-updated="() => workspace.markLocalChange()"
            @pass-through-toggle="handlePassThroughToggle"
            @pass-through-visible-toggle="togglePassThroughVisible"
          />
        </aside>
      </div>

      <!-- 素材选择对话框 -->
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

      <!-- 命名检查面板 -->
      <NamingCheckPanel
        v-if="showNamingCheck"
        v-bind="rootCompositeId ? { rootCompositeId } : {}"
        @close="showNamingCheck = false"
        @update-alias="handleNamingUpdateAlias"
        @update-name="handleNamingUpdateName"
        @select-object="handleSelectObject"
      />
      <ScreenEffectPickerDialog
        v-if="showScreenEffectPicker"
        @select="handleScreenEffectSelect"
        @close="showScreenEffectPicker = false"
      />
      <SceneTemplatePickerDialog
        v-if="showTemplatePicker"
        @select="handleTemplateSelect"
        @close="showTemplatePicker = false"
      />

      <!-- 导入文件浏览器 -->
      <FileBrowserDialog
        v-if="showImportBrowser"
        title="选择 config.json 文件"
        :file-filter="importFileFilter"
        :multiple="false"
        @select="handleImportFileSelect"
        @close="showImportBrowser = false"
      />

      <!-- v18: 表情选择对话框 -->
      <ExpressionSelectorDialog
        v-if="showExpressionPicker"
        @select="handleExpressionSelect"
        @close="showExpressionPicker = false"
      />

      <!-- v19: 添加素材菜单中的人物选择 -->
      <CompositeCharacterPickerDialog
        v-if="showCharacterPicker"
        @select="handleCompositeCharacterSelect"
        @close="showCharacterPicker = false"
      />

      <!-- 结构复制对话框（步骤1：选择源人物） -->
      <CompositeCharacterPickerDialog
        v-if="showSyncSourceDialog"
        title="选择源人物"
        confirm-text="下一步"
        :exclude-ids="currentExcludeIds"
        @select="handleSyncSourceSelect"
        @close="showSyncSourceDialog = false"
      />

      <!-- 结构复制对话框（步骤2：预览确认） -->
      <CharacterSyncPreviewDialog
        v-if="showSyncPreviewDialog && syncPreviewData"
        :source-name="syncPreviewData.sourceName"
        :match-result="syncPreviewData.matchResult"
        :animation-count="syncPreviewData.animationCount"
        :skipped-animations="syncPreviewData.skippedAnimations"
        :trimmed-animations="syncPreviewData.trimmedAnimations"
        @confirm="handleSyncConfirm"
        @close="showSyncPreviewDialog = false"
      />

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

      <!-- 实例别名输入对话框 -->
      <InstanceAliasDialog
        v-if="showAliasDialog"
        :actor-name="aliasDialogActorName"
        :suggested-alias="aliasDialogSuggestedAlias"
        :existing-aliases="existingAliases"
        :current-alias="aliasDialogCurrentAlias || ''"
        :object-type="aliasDialogObjectType"
        @confirm="handleAliasConfirm"
        @cancel="handleAliasCancel"
      />

      <!-- 场景 Render Chain 对话框 -->
      <SceneRenderChainDialog
        v-if="showRenderChainDialog"
        mode-description="Character Editor objects"
        @close="showRenderChainDialog = false"
      />
    </div>
  </div>

  <!-- 预览对话框 — 从编辑器触发（使用编辑器实时数据，无需先保存） -->
  <ObjectCollectionPreviewDialog
    v-if="showPreview"
    :title="`预览: ${characterName}`"
    :objects="sceneObjectStore.objects.filter(o => o.type !== 'camera')"
    :editor-anchor="originalCharacter?.editorAnchor"
    :restore-anchor-offset="false"
    :render-chain="sceneObjectStore.getSceneRenderChain()"
    :info="{ name: characterName, createdAt: originalCharacter?.createdAt ?? Date.now(), tags: selectedTags }"
    @close="showPreview = false"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAssetLoader } from '@/composables/useAssetLoader'
import { useSetupWorkspace } from '@/composables/useSetupWorkspace'
import { useToast } from '@/composables/useToast'
import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useCompositeCharacterStore } from '@/stores/compositeCharacterStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { SelectedFile } from '@/types/fileBrowser'
import type { Gender } from '@/types/project'
import type { SceneObject } from '@/types/sceneObject'
import type { SceneSetup } from '@/types/screenplay'
import type { CharacterSyncResult, NameMatchResult } from '@/utils/characterSyncUtils'
import { buildNameMatch, syncCharacterStructure } from '@/utils/characterSyncUtils'
import {
  collectAllFramePaths,
  convertConfigToSceneObjects,
  parseConfigJson,
  validateConfigResources,
} from '@/utils/configImporter'
import { getDirectoryHandleSafe } from '@/utils/fileSystem'
import { loadSetupToSceneObjects } from '@/utils/sceneLoader'
import { buildTemplateFromObjects } from '@/utils/sceneTemplateEngine'

import BackgroundPickerDialog from './BackgroundPickerDialog.vue'
import CanvasScrollbars from './CanvasScrollbars.vue'
import CharacterSyncPreviewDialog from './character-editor/dialogs/CharacterSyncPreviewDialog.vue'
import NamingCheckPanel from './character-editor/NamingCheckPanel.vue'
import CompositeCharacterPickerDialog from './CompositeCharacterPickerDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import FileBrowserDialog from './FileBrowserDialog.vue'
import GroupingModePanel from './GroupingModePanel.vue'
import InstanceAliasDialog from './InstanceAliasDialog.vue'
import ObjectCollectionPreviewDialog from './ObjectCollectionPreviewDialog.vue'
import ObjectPropertiesPanel from './ObjectPropertiesPanel.vue'
import PassThroughPanel from './PassThroughPanel.vue'
import PropPickerDialog from './PropPickerDialog.vue'
import SaveConfirmDialog from './SaveConfirmDialog.vue'
import SceneRenderChainDialog from './SceneRenderChainDialog.vue'
import SceneTemplatePickerDialog from './SceneTemplatePickerDialog.vue'
import ScreenEffectPickerDialog from './ScreenEffectPickerDialog.vue'
import ExpressionSelectorDialog from './screenplay/ExpressionSelectorDialog.vue'
import SoundPickerDialog from './SoundPickerDialog.vue'
import ZoomControls from './ZoomControls.vue'

const props = defineProps<{
  characterId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'created', characterId: string): void
}>()

const projectStore = useProjectStore()
const characterStore = useCompositeCharacterStore()
const sceneObjectStore = useSceneObjectStore()
const isDev = import.meta.env.DEV

const toast = useToast()

// 画布容器元素
const canvasContainer = ref<HTMLElement>()
const characterEditorContainer = ref<HTMLElement>()

// 人物特有状态
const characterName = ref('')
const selectedGender = ref<Gender>('male')
const originalCharacter = ref<CompositeCharacter | null>(null)

const rootCompositeId = ref<string>()
const showPreview = ref(false)
const showNamingCheck = ref(false)


// 导入源目录路径
const characterImportSourcePath = ref('')

// 性别选项
const genderOptions: { label: string; value: Gender }[] = [
  { label: '♂ 男', value: 'male' },
  { label: '♀ 女', value: 'female' },
  { label: '⚧ 其他', value: 'other' },
]

// 标签编辑状态
const selectedTags = ref<string[]>([])
const newTagInput = ref('')
const showTagEditor = ref(false)

const recommendedTags = computed(() =>
  characterStore.allTags.filter(t => !selectedTags.value.includes(t))
)

function addTag(): void {
  const tag = newTagInput.value.trim()
  if (tag && !selectedTags.value.includes(tag)) {
    selectedTags.value.push(tag)
    workspace.markLocalChange()
  }
  newTagInput.value = ''
}

function addTagDirectly(tag: string): void {
  if (!selectedTags.value.includes(tag)) {
    selectedTags.value.push(tag)
    workspace.markLocalChange()
  }
}

function removeTag(tag: string): void {
  selectedTags.value = selectedTags.value.filter(t => t !== tag)
  workspace.markLocalChange()
}

function handleGenderChange(gender: Gender): void {
  selectedGender.value = gender
  workspace.markLocalChange()
}

function isTopLevelComposite(object: SceneObject): boolean {
  return object.type === 'composite' && !object.parentId
}

function isValidRootCompositeId(
  candidateId: string | undefined,
  objects: SceneObject[]
): candidateId is string {
  if (!candidateId) return false
  return objects.some(obj => obj.id === candidateId && isTopLevelComposite(obj))
}

function resolveRootCompositeId(
  objects: SceneObject[],
  preferredId?: string
): string | undefined {
  if (isValidRootCompositeId(preferredId, objects)) {
    return preferredId
  }

  const topLevelComposites = objects.filter(isTopLevelComposite)
  return topLevelComposites.length === 1 ? topLevelComposites[0]?.id : undefined
}

function normalizeRootComposite(objects: SceneObject[]): void {
  rootCompositeId.value = resolveRootCompositeId(objects, rootCompositeId.value)
}

function handleCanvasClick(_event: MouseEvent): void {
  handleCanvasClickForGrouping()
}



// ===== 结构复制 =====
const showSyncSourceDialog = ref(false)
const showSyncPreviewDialog = ref(false)
const syncPreviewData = ref<{
  sourceName: string
  sourceObjects: SceneObject[]
  matchResult: NameMatchResult
  animationCount: number
  skippedAnimations: string[]
  trimmedAnimations: string[]
} | null>(null)

function handleStartSync(): void {
  showSyncSourceDialog.value = true
}

/** 排除当前正在编辑的人物 */
const currentExcludeIds = computed(() =>
  props.characterId ? [props.characterId] : []
)

function handleSyncSourceSelect(sourceCharacter: CompositeCharacter): void {
  showSyncSourceDialog.value = false

  // 获取当前编辑器中的对象作为目标
  const targetObjects = sceneObjectStore.objects.filter(o => o.type !== 'camera')

  // 计算预览数据
  const matchResult = buildNameMatch(sourceCharacter.objects, targetObjects)

  // 试运行 sync 来获取动画统计
  const trialResult: CharacterSyncResult = syncCharacterStructure(
    sourceCharacter.objects,
    targetObjects,
  )

  // 计算动画数量
  let animCount = 0
  for (const obj of trialResult.objects) {
    if (obj.animations) {
      animCount += Object.keys(obj.animations).length
    }
  }

  syncPreviewData.value = {
    sourceName: sourceCharacter.name,
    sourceObjects: sourceCharacter.objects,
    matchResult,
    animationCount: animCount,
    skippedAnimations: trialResult.skippedAnimations,
    trimmedAnimations: trialResult.trimmedAnimations,
  }

  showSyncPreviewDialog.value = true
}

function handleSyncConfirm(): void {
  showSyncPreviewDialog.value = false

  if (!syncPreviewData.value) return

  const targetObjects = sceneObjectStore.objects.filter(o => o.type !== 'camera')
  const result = syncCharacterStructure(
    syncPreviewData.value.sourceObjects,
    targetObjects,
  )

  // 将重组后的对象加载到编辑器（loadSetupToSceneObjects 内部会 clearObjects）
  const setup: SceneSetup = {
    camera: { x: 0, y: 0, width: 0, height: 0, zoom: 1.0 },
    objects: result.objects,
    renderChain: [],
  }
  loadSetupToSceneObjects(setup, { skipCamera: true, skipAmbientLight: true })

  // 选中第一个非相机对象
  const firstObj = sceneObjectStore.objects.find(o => o.type !== 'camera')
  if (firstObj) {
    sceneObjectStore.selectObject(firstObj.id)
  }

  normalizeRootComposite(sceneObjectStore.objects.filter(o => o.type !== 'camera'))

  workspace.markLocalChange()

  const msg = result.skippedAnimations.length > 0
    ? `结构复制成功（${result.skippedAnimations.length} 个动画因目标缺失被跳过）`
    : '结构复制成功'
  toast.success(msg)

  syncPreviewData.value = null
}


// ===== 导入 config.json =====
const selectedCompositeMode = ref<'entity' | 'union'>('union')

const showImportBrowser = ref(false)

/** 文件过滤器：显示 config.json 和图片文件 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
function importFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  if (name === 'config.json') return true
  const ext = name.split('.').pop() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

function handleImportConfig(): void {
  if (!projectStore.projectHandle) {
    toast.error('请先打开项目')
    return
  }
  showImportBrowser.value = true
}

/** 处理导入文件选择 */
async function handleImportFileSelect(files: SelectedFile[]): Promise<void> {
  const file = files[0]
  if (!file) return

  if (file.name !== 'config.json') {
    toast.error('请选择 config.json 文件')
    return
  }

  try {
    // 1. 从文件路径推导目录句柄
    const pathParts = file.path.split('/').slice(0, -1) // 移除 'config.json'
    let dirHandle = projectStore.projectHandle!
    for (const part of pathParts) {
      if (!part) continue
      dirHandle = await getDirectoryHandleSafe(dirHandle, part)
    }
    const importDirPath = pathParts.join('/')

    // 2. 读取并解析 config.json
    const configFile = await file.handle.getFile()
    const config = parseConfigJson(await configFile.text())

    // 3. 收集帧路径 → 资源校验
    const allPaths = collectAllFramePaths(config)
    const validation = await validateConfigResources(allPaths, dirHandle)

    if (!validation.valid) {
      console.warn('[CompositeCharacterEditor] 部分资源缺失:', validation.missingFiles)
    }

    // 4. 转换为场景对象
    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      validation.foundFiles, validation.resolvedRelativePaths,
      importDirPath, 'entity',
      { width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT }
    )

    // 5. 预加载导入对象的纹理资源
    //    configImporter 通过 resolveFrameUrl 为 static material 设置了 _runtimeUrl（Blob URL），
    //    但渲染管线只通过 material.url（持久化路径）查找纹理。
    //    必须在添加到 Store 之前将这些 URL 加载到 textureCache，
    //    否则 watcher 触发 renderObjects 时纹理未就绪，sprite 为空白。
    {
      const { loadAssets } = useAssetLoader()
      const imageUrls = new Set<string>()
      for (const obj of objects) {
        if (obj.type === 'symbol') {
          const symbolObj = obj as import('@/types/sceneObject').SymbolObject
          for (const material of (symbolObj.materials ?? [])) {
            if (material.type === 'static' && material.url) {
              imageUrls.add(material.url)
            } else if (material.type === 'animation' && material.frames) {
              for (const frame of material.frames) {
                if (frame.url) imageUrls.add(frame.url)
              }
              // 静止帧
              if (material.url) imageUrls.add(material.url)
            }
          }
        }
      }
      if (imageUrls.size > 0) {
        await loadAssets(imageUrls, new Set(), 'CompositeCharacterEditor.configImport')
      }
    }

    // 6. 添加到 Store
    for (const obj of objects) {
      sceneObjectStore.addObject(obj)
    }

    // 7. 选中第一个对象
    if (objects.length > 0 && objects[0]) {
      sceneObjectStore.selectObject(objects[0].id)
    }

    workspace.markLocalChange()

    // 8. 记录导入源路径
    if (importDirPath) {
      characterImportSourcePath.value = importDirPath
    }

    normalizeRootComposite(sceneObjectStore.objects.filter(o => o.type !== 'camera'))

    // 9. 显式触发重渲染（确保纹理已加载后完整渲染）
    if (renderer.value) {
      await renderer.value.renderObjects()
    }

    toast.success(`导入成功: ${objects.length} 个对象`)
  } catch (e) {
    console.error('[CompositeCharacterEditor] 导入失败:', e)
    toast.error(`导入失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  showImportBrowser.value = false
}

// ===== 人物特有：保存逻辑 =====
async function handleSaveCharacter(): Promise<void> {
  const objects = sceneObjectStore.objects.filter(o => o.type !== 'camera')
  const tags = selectedTags.value.length > 0 ? [...selectedTags.value] : undefined
  const normalizedRootCompositeId = resolveRootCompositeId(objects, rootCompositeId.value)

  if (!originalCharacter.value) {
    // ===== 新建模式：首次保存 =====
    const templateData = buildTemplateFromObjects(
      objects,
      sceneObjectStore.objects,
      characterName.value,
      tags,
      sceneObjectStore.getSceneRenderChain(),
    )

    const newCharacter: CompositeCharacter = {
      id: characterStore.generateId(),
      name: characterName.value,
      gender: selectedGender.value,
      createdAt: Date.now(),
      objects: templateData.objects,
      ...(templateData.renderChain ? { renderChain: templateData.renderChain } : {}),
      ...(tags ? { tags } : {}),
      ...(templateData.editorAnchor ? { editorAnchor: templateData.editorAnchor } : {}),
      ...(characterImportSourcePath.value ? { importSourcePath: characterImportSourcePath.value } : {}),
      ...(normalizedRootCompositeId ? { rootCompositeId: normalizedRootCompositeId } : {}),
    }

    characterStore.addCharacter(newCharacter)
    originalCharacter.value = newCharacter

    try {
      await projectStore.saveProject()
      workspace.resetLocalChanges()
      toast.success('人物创建成功')
      emit('created', newCharacter.id)
    } catch (error) {
      console.error('[CompositeCharacterEditor] 保存失败:', error)
      toast.error('保存失败: ' + ((error as Error).message || '未知错误'))
    }
  } else {
    // ===== 编辑模式：更新现有人物 =====
    const templateData = buildTemplateFromObjects(
      objects,
      sceneObjectStore.objects,
      characterName.value,
      tags,
      sceneObjectStore.getSceneRenderChain(),
    )

    const updatePayload: Partial<CompositeCharacter> = {
      name: characterName.value,
      gender: selectedGender.value,
      objects: templateData.objects,
      ...(templateData.renderChain ? { renderChain: templateData.renderChain } : {}),
      ...(templateData.editorAnchor ? { editorAnchor: templateData.editorAnchor } : {}),
      ...(normalizedRootCompositeId ? { rootCompositeId: normalizedRootCompositeId } : {}),
    }
    // rootCompositeId 清空时需显式删除旧值（Object.assign 只覆盖不删除）
    if (!normalizedRootCompositeId && originalCharacter.value.rootCompositeId) {
      delete (originalCharacter.value as Record<string, unknown>)['rootCompositeId']
    }
    if (tags) {
      updatePayload.tags = tags
    }
    if (characterImportSourcePath.value) {
      updatePayload.importSourcePath = characterImportSourcePath.value
    }
    characterStore.updateCharacter(originalCharacter.value.id, updatePayload)

    try {
      await projectStore.saveProject()
      workspace.resetLocalChanges()
      toast.success('人物保存成功')
    } catch (error) {
      console.error('[CompositeCharacterEditor] 保存失败:', error)
      toast.error('保存失败: ' + ((error as Error).message || '未知错误'))
    }
  }
}

function handleNameCommit(): void {
  if (characterName.value !== originalCharacter.value?.name) {
    workspace.markLocalChange()
  }
}

// ===== 缩略图生成 =====
async function handleGenerateThumbnail(): Promise<void> {
  const pixiApp = renderer.value?.getPixiApp()
  const app = pixiApp?.app
  const pixiCtx = pixiApp?.getContext()
  const contentLayer = pixiCtx?.contentLayer
  if (!app || !contentLayer || !originalCharacter.value) {
    toast.error('请先保存人物后再生成缩略图')
    return
  }

  try {
    // 使用 contentLayer 而非 stage：
    // - 排除 lighting_bounds_anchor（位于 activeLayer，覆盖整张画布导致 bounds 过大）
    // - renderer.render(contentLayer, ...) 将 contentLayer 视为根节点，自动排除 viewportLayer 的缩放/平移变换
    const bounds = contentLayer.getLocalBounds()
    if (bounds.width <= 0 || bounds.height <= 0) {
      toast.error('画布中没有可渲染的对象')
      return
    }

    const THUMB_MAX = 512
    const scale = Math.min(1, THUMB_MAX / Math.max(bounds.width, bounds.height))
    const texWidth = Math.ceil(bounds.width * scale)
    const texHeight = Math.ceil(bounds.height * scale)

    const PIXI = await import('pixi.js')
    const renderTexture = PIXI.RenderTexture.create({ width: texWidth, height: texHeight })

    // 临时调整 contentLayer 的位移和缩放，使对象边界填满 RenderTexture
    const origX = contentLayer.x
    const origY = contentLayer.y
    const origSX = contentLayer.scale.x
    const origSY = contentLayer.scale.y

    contentLayer.x = -bounds.x * scale
    contentLayer.y = -bounds.y * scale
    contentLayer.scale.set(scale, scale)

    app.renderer.render(contentLayer, { renderTexture })

    // 恢复 contentLayer 状态
    contentLayer.x = origX
    contentLayer.y = origY
    contentLayer.scale.set(origSX, origSY)

    const sourceCanvas = app.renderer.extract.canvas(renderTexture) as HTMLCanvasElement
    renderTexture.destroy(true)

    const canvas = document.createElement('canvas')
    canvas.width = texWidth
    canvas.height = texHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, texWidth, texHeight)
    ctx.drawImage(sourceCanvas, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    characterStore.updateCharacter(originalCharacter.value.id, {
      _runtimeThumbnailUrl: dataUrl,
    })
    workspace.markLocalChange()
    toast.success('缩略图已生成')
  } catch (error) {
    console.error('[CompositeCharacterEditor] 缩略图生成失败:', error)
    toast.error('缩略图生成失败: ' + ((error as Error).message || '未知错误'))
  }
}

// ===== 命名检查面板处理 =====
function handleNamingUpdateAlias(objectId: string, newAlias: string): void {
  sceneObjectStore.updateObject(objectId, { alias: newAlias })
  workspace.markLocalChange()
  toast.success(`已将别名改为 "${newAlias}"`)
}

function handleNamingUpdateName(objectId: string, newName: string): void {
  sceneObjectStore.updateObject(objectId, { name: newName })
  workspace.markLocalChange()
  toast.success(`已将名称改为 "${newName}"`)
}

// ===== 初始化 composable =====
const workspace = useSetupWorkspace({
  canvasContainer,
  editorContainer: characterEditorContainer,
  rendererExtras: {},
  onDataChange: () => projectStore.markAsUnsaved(),
  onSave: handleSaveCharacter,
  onExit: () => emit('close'),
})

// 从 composable 解构所有需要的变量
const {
  renderer,
  hasLocalChanges,
  rightPanelCollapsed,
  rightPanelWidth,

  startResizeRightPanel,
  handleSelectObject,
  handleUpdateObject,
  handleDeleteObject,
  handleCopyObject,
  handleMoveUp,
  handleMoveDown,
  handleInitialStateUpdate,
  showBackgroundPicker,
  showPropPicker,
  showSoundPicker,
  showScreenEffectPicker,
  showTemplatePicker,
  showAddMenu,
  toggleAddMenu,
  handleMenuItemClick,
  handleBackgroundSelect,
  handlePropSelect,
  showExpressionPicker,
  handleExpressionSelect,
  handleSoundSelect,
  handleScreenEffectSelect,
  handleTemplateSelect,
  showCharacterPicker,
  handleCompositeCharacterSelect,
  groupingState,

  getCompositeDisplayName,
  handleStartGrouping,
  handleCompositeAction,
  handleCanvasClickForGrouping,
  handleGroupingConfirm,
  handleGroupingCancel,
  handleGroupingToggleById,
  groupingEligibleObjects,
  lockedParentId,
  showAliasDialog,
  aliasDialogActorName,
  aliasDialogSuggestedAlias,
  aliasDialogCurrentAlias,
  aliasDialogObjectType,
  existingAliases,
  handleAliasConfirm,
  handleAliasCancel,
  handleEditAlias,
  handleTriggerAnim,
  showPassThroughTip,
  addToPassThrough,
  removeFromPassThrough,
  togglePassThroughVisible,
  getPassThroughEntries,
  isObjectPassThrough,
  isFullscreen,
  toggleFullscreen,
  showConfirmDialog,
  confirmDialogConfig,
  showSaveConfirmDialog,
  handleReturn,
  handleSaveAndExit,
  handleDiscardAndExit,
  initCanvas,
  destroyCanvas,
  setupWatchers,
  setupEventListeners,
  cleanupEventListeners,
} = workspace

// 人物编辑器没有相机对象，不需要显示"相机已设为穿透模式"提示
showPassThroughTip.value = false

// ===== 穿透列表 UI 状态 =====
const showPassThroughPanel = ref(false)
const showRenderChainDialog = ref(false)

const passThroughCount = computed(() => {
  return getPassThroughEntries().size
})

const passThroughPanelEntries = computed(() => {
  const entries = getPassThroughEntries()
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
  const entries = getPassThroughEntries()
  const entry = entries.get(selected.id)
  return entry?.visible ?? true
})

function handlePassThroughToggle(objectId: string) {
  if (isObjectPassThrough(objectId)) {
    removeFromPassThrough(objectId)
  } else {
    addToPassThrough(objectId)
  }
}

// ===== 生命周期 =====

onMounted(async () => {
  sceneObjectStore.setActionMode(false)
  sceneObjectStore.clearObjects()
  let initialSetup: SceneSetup | null = null

  if (props.characterId) {
    // ===== 编辑模式：加载现有人物 =====
    const character = characterStore.getCharacter(props.characterId)
    if (!character) {
      throw new Error(`[CompositeCharacterEditor] 人物 ${props.characterId} 不存在`)
    }

    originalCharacter.value = character
    characterName.value = character.name
    selectedGender.value = character.gender
    selectedTags.value = [...(character.tags ?? [])]
    characterImportSourcePath.value = character.importSourcePath ?? ''

    rootCompositeId.value = resolveRootCompositeId(character.objects, character.rootCompositeId)

    // v19: 使用 loadSetupToSceneObjects 替代 instantiateTemplate，
    // 避免 ID 重映射导致 renderChain 中的引用失效
    // 注意：保存时坐标已归零（减去 editorAnchor），加载时需恢复偏移
    const anchor = character.editorAnchor ?? { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y }
    const restoredObjects = JSON.parse(JSON.stringify(character.objects)) as SceneObject[]
    for (const obj of restoredObjects) {
      // 仅对顶层对象（无 parentId）恢复偏移，composite 子对象使用局部坐标
      if (!obj.parentId) {
        obj.x += anchor.x
        obj.y += anchor.y
      }
    }
    const setup: SceneSetup = {
      camera: { x: 0, y: 0, width: 0, height: 0, zoom: 1.0 },
      objects: restoredObjects,
      renderChain: character.renderChain ?? [],  // v19: 使用人物保存的渲染链（旧数据无此字段时自动 rebuild）
    }
    initialSetup = setup
    loadSetupToSceneObjects(setup, { skipCamera: true, skipAmbientLight: true })

    // 选中第一个非相机对象
    const firstObj = sceneObjectStore.objects.find(o => o.type !== 'camera')
    if (firstObj) {
      sceneObjectStore.selectObject(firstObj.id)
    }
  } else {
    // ===== 新建模式：自动创建含表情对象的初始结构 =====
    originalCharacter.value = null

    // 自动生成去重名称
    const baseName = '新建人物'
    const existingNames = new Set(characterStore.characters.map(c => c.name))
    let name = baseName
    let counter = 2
    while (existingNames.has(name)) {
      name = `${baseName} ${counter}`
      counter++
    }
    characterName.value = name
    selectedTags.value = []
    rootCompositeId.value = undefined
  }

  // 初始化画布
  await initCanvas()

  if (initialSetup) {
    const { collectEditorFirstPaintAssets, loadAssets } = useAssetLoader()
    const { imageUrls, audioUrls } = collectEditorFirstPaintAssets(initialSetup, null)
    if (imageUrls.size > 0 || audioUrls.size > 0) {
      await loadAssets(
        imageUrls,
        audioUrls,
        `CompositeCharacterEditor.sceneAssets(${props.characterId ?? 'new'})`
      )
    }
  }

  if (renderer.value) {
    await renderer.value.renderObjects()
  }

  // 人物编辑默认使用「实际像素」(1:1) 缩放
  renderer.value?.zoomTo100()
  // 延迟刷新：等待异步纹理加载完成后 getLocalBounds 返回正确边界
  setTimeout(() => {
    renderer.value?.updateSelectionBox()
  }, 200)

  // 设置 watchers 和事件监听
  setupWatchers()
  setupEventListeners()
})

onBeforeUnmount(() => {
  cleanupEventListeners()
  destroyCanvas()
  sceneObjectStore.clearObjects()
})

// 标签弹出面板：点击外部关闭
function handleTagEditorClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (showTagEditor.value && !target.closest('.tag-editor-container')) {
    showTagEditor.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleTagEditorClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleTagEditorClickOutside)
})
</script>

<style scoped>
/* ===== 全屏 Overlay 样式 ===== */
.editor-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000;
  background: #1a1a1a;
}

.editor-dialog {
  background: #ffffff;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== 页面级工具栏 ===== */
.editor-toolbar {
  height: 48px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.toolbar-left-page,
.toolbar-right-page {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cancel-btn {
  background: white;
  border: 1px solid #d1d5db;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cancel-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.action-btn {
  background: white;
  border: 1px solid #d1d5db;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.save-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}

.save-btn:hover {
  background: #2563eb;
}

/* 人物名称编辑器 */
.character-title {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.character-title .mode-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.title-input {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  background: transparent;
  width: 160px;
  outline: none;
  transition: all 0.2s;
}

.title-input:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}

.title-input:focus {
  border-color: #3b82f6;
  background: white;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

/* 性别选择器 */
.gender-selector {
  display: flex;
  background: #f3f4f6;
  padding: 2px;
  border-radius: 6px;
}

.gender-btn {
  padding: 4px 12px;
  border: none;
  background: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.gender-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ===== 复用 SetupEditor 的工作区样式 ===== */

.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  min-width: 0;
  position: relative;
}

.setup-toolbar {
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
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

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.toolbar-btn {
  background: white;
  border: 1px solid #d1d5db;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: #f3f4f6;
}

.toolbar-btn.icon-only {
  padding: 6px 10px;
}

.toolbar-btn.danger:hover {
  background: #fef2f2;
  border-color: #ef4444;
  color: #ef4444;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.add-btn:hover {
  background: #2563eb;
}

.preview-btn {
  background: #8b5cf6;
  border-color: #8b5cf6;
  color: white;
}

.preview-btn:hover {
  background: #7c3aed;
}

.preview-btn:disabled {
  background: #c4b5fd;
  border-color: #c4b5fd;
}

.btn-icon {
  font-weight: bold;
  font-size: 16px;
}

/* 成组模式提示栏 */
/* 成组模式 CSS 已移至 GroupingModePanel.vue */

/* ===== 右侧面板样式 ===== */
.resizer {
  width: 4px;
  background: #e5e7eb;
  cursor: col-resize;
  flex-shrink: 0;
}

.resizer:hover {
  background: #3b82f6;
}

.right-panel {
  display: flex;
  flex-direction: column;
  background: white;
  border-left: 1px solid #e5e7eb;
  overflow: hidden;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: #374151;
}

.part-assignment-panel {
  margin: 0 12px 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fbff;
}

.part-assignment-header {
  margin-bottom: 10px;
}

.part-assignment-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.part-assignment-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.part-assignment-empty,
.part-assignment-note {
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.part-assignment-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.part-assignment-object {
  font-size: 12px;
  color: #334155;
}

.part-assignment-select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: white;
  padding: 10px 12px;
  font-size: 13px;
  color: #0f172a;
}

.collapse-btn,
.expand-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  color: #6b7280;
}

.expand-btn.right {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background: white;
  border-radius: 4px 0 0 4px;
  padding: 8px 4px;
}

/* ===== 标签编辑器弹出面板 ===== */
.tag-editor-container {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.inline-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  color: #4b5563;
}

.tag-remove-inline {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 14px;
  cursor: pointer;
  color: #9ca3af;
}

.more-tags-hint {
  font-size: 11px;
  color: #9ca3af;
}

.tag-editor-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  min-width: 280px;
}

.popover-header {
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.popover-body {
  padding: 8px 12px;
}

.popover-tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
  min-height: 24px;
}

.popover-tag-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #3b82f6;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.popover-tag-remove {
  border: none;
  background: none;
  color: white;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.no-tags-hint {
  font-size: 12px;
  color: #d1d5db;
  padding: 2px 0;
}

.popover-tag-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.popover-tag-input:focus {
  border-color: #3b82f6;
}

.popover-recommended-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  align-items: center;
}

.recommend-label {
  font-size: 11px;
  color: #9ca3af;
}

.popover-recommend-tag {
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  transition: background-color 0.2s;
}

.popover-recommend-tag:hover {
  background: #e5e7eb;
}

/* 导入源路径浮动标签 */
.import-source-tag {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #e5e7eb;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 穿透提示气泡 ===== */
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
