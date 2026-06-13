<!--
  AnimationWorkbench.vue — 动画 WYSIWYG 编辑器（全屏叠加层）
  
  架构：复用 useSceneRenderer setup 模式交互 + useAnimationEdit 关键帧引擎
  数据隔离：编辑期间通过 AnimationSceneObjectStore 隔离，不影响全局场景数据
  入口：ObjectPropertiesPanel / PropEditorModal → 打开此组件
  左侧面板：动画列表 + 动作库（列表模式时）
-->
<template>
  <Teleport to="body">
    <div v-if="visible" ref="overlayRef" class="animation-workbench-overlay" tabindex="0" @keydown="onKeydown">
      <!-- 工具栏 -->
      <div class="workbench-toolbar">
        <div class="toolbar-left">
          <input
            v-if="hasActiveAnimation"
            v-model="animationDef.name"
            class="anim-name-input"
            placeholder="动画名称"
            maxlength="50"
            @keydown.stop
          >
          <span v-else class="empty-toolbar-hint">请先在左侧点击“新建”创建动画</span>
        </div>

        <div class="toolbar-right">
          <div class="toolbar-popover" @pointerdown.stop>
            <button
              class="btn-toolbar object-tree-trigger"
              :class="{ active: showSceneObjectPanel }"
              title="场景对象列表"
              @click="toggleSceneObjectPanel"
            >
              <span class="object-tree-trigger-label">{{ selectedWorkbenchObjectLabel }}</span>
              <span class="object-tree-trigger-arrow">{{ showSceneObjectPanel ? '▲' : '▼' }}</span>
            </button>
            <div v-if="showSceneObjectPanel" class="workbench-popover object-list-popover">
              <div class="popover-header">
                <span>场景对象</span>
              </div>
              <div class="popover-content">
                <div v-if="flatSceneObjectNodes.length === 0" class="popover-empty">暂无对象</div>
                <button
                  v-for="node in flatSceneObjectNodes"
                  :key="node.id"
                  class="object-list-row"
                  :class="{ selected: node.id === selectedWorkbenchObjectId }"
                  :style="node.depth > 0 ? { paddingLeft: (10 + node.depth * 18) + 'px' } : {}"
                  @click="selectWorkbenchObject(node.id)"
                >
                  <span
                    v-if="node.hasChildren"
                    class="tree-toggle"
                    @click.stop="toggleObjectExpanded(node.id)"
                  >
                    {{ expandedObjectIds.has(node.id) ? '▼' : '▶' }}
                  </span>
                  <span v-else class="tree-spacer" />
                  <span class="object-icon">{{ node.icon }}</span>
                  <span class="object-name">{{ node.name }}</span>
                  <span v-if="passThroughIds.includes(node.id)" class="object-badge">穿透</span>
                </button>
              </div>
            </div>
          </div>
          <button
            v-if="selectedWorkbenchObjectId"
            class="btn-toolbar pass-through-set-btn"
            :class="{ active: selectedObjectIsPassThrough }"
            :disabled="selectedObjectIsPassThrough"
            :title="selectedObjectIsPassThrough ? '当前对象已在穿透列表中' : '将选中对象设为穿透'"
            @click="addSelectedObjectToPassThrough"
          >
            设为穿透
          </button>
          <div class="toolbar-popover" @pointerdown.stop>
            <button
              class="btn-toolbar icon-toolbar-btn"
              :class="{ active: showPassThroughPanel }"
              :title="`穿透列表：${passThroughEntries.length} 个对象`"
              @click="togglePassThroughPanel"
            >
              👻<span v-if="passThroughEntries.length > 0" class="icon-count">{{ passThroughEntries.length }}</span>
            </button>
            <div v-if="showPassThroughPanel" class="workbench-popover pass-through-popover">
              <div class="popover-header">
                <span>穿透列表</span>
              </div>
              <div class="popover-content">
                <div v-if="passThroughEntries.length === 0" class="popover-empty">
                  选择对象后点击“设为穿透”
                </div>
                <button
                  v-for="entry in passThroughEntries"
                  :key="entry.objectId"
                  class="object-list-row"
                  :class="{ selected: entry.objectId === selectedWorkbenchObjectId }"
                  @click="selectWorkbenchObject(entry.objectId)"
                >
                  <span class="object-icon">{{ entry.icon }}</span>
                  <span class="object-name">{{ entry.name }}</span>
                  <span class="pass-through-actions">
                    <button
                      class="mini-icon-btn"
                      :class="{ muted: !entry.visible }"
                      :title="entry.visible ? '隐藏穿透对象' : '显示穿透对象'"
                      @click.stop="togglePassThroughVisible(entry.objectId)"
                    >
                      {{ entry.visible ? '👁' : '🚫' }}
                    </button>
                    <button
                      class="mini-icon-btn danger"
                      title="移出穿透列表"
                      @click.stop="removeFromPassThrough(entry.objectId)"
                    >
                      ×
                    </button>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <span class="toolbar-divider" />
          <button class="btn-toolbar" @click="handleClose">返回</button>
          <button class="btn-save" :disabled="(!hasActiveAnimation && !hasPendingProjectChanges) || isSavingProject" @click="handleSave">
            {{ isSavingProject ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="workbench-body">
        <!-- 左侧动画列表面板（列表模式） -->
        <aside
          v-if="listMode"
          v-show="!leftPanelCollapsed"
          class="left-panel"
          :style="{ width: leftPanelWidth + 'px' }"
        >
          <div class="panel-header left-panel-header">
            <h3>动画列表</h3>
            <button
              class="collapse-btn"
              title="折叠面板"
              @click="leftPanelCollapsed = true"
            >
              ◀
            </button>
          </div>
          <AnimationListPanel
            :animations="allAnimationsList"
            :current-animation-id="hasActiveAnimation ? animationDef.id : null"
            :is-object-mode="isObjectMode"
            :is-composite-mode="isCompositeMode"
            v-bind="listPanelOptionalProps"
            @select="handleListSelect"
            @edit="handleListEdit"
            @delete="handleListDelete"
            @create="handleListCreate"
            @copy-from-self="handleCopyFromSelf"
            @save-as-preset="handleSaveAsPreset"
            @preset-applied="handlePresetApplied"
            @update:animations="handleAnimationsUpdate"
          />
        </aside>

        <!-- 左侧分隔条 -->
        <div
          v-if="listMode && !leftPanelCollapsed"
          class="resizer left-resizer"
          @mousedown="startResizeLeftPanel"
        />

        <!-- 左侧折叠按钮 -->
        <button
          v-if="listMode && leftPanelCollapsed"
          class="expand-left-btn"
          title="展开动画列表"
          @click="leftPanelCollapsed = false"
        >
          ▶
        </button>

        <!-- 画布 -->
        <div class="canvas-area">
          <LightweightCanvas
            ref="canvasRef"
            :resource-type="resourceType"
            :resource-id="resourceId"
            origin-handle-mode="readonly"
            v-bind="canvasOptionalProps"
            @container-ready="onContainerReady"
            @canvas-app-ready="onCanvasAppReady"
            @setup-change="onSetupChange"
          />
          <ZoomControls
            v-if="canvasRef?.renderer"
            :current-zoom="canvasZoom"
            @zoom-change="(z: number) => canvasRef?.renderer?.setZoomLevel(z)"
            @fit="() => canvasRef?.renderer?.resetView()"
            @fit-all="() => canvasRef?.renderer?.fitAll()"
            @zoom-100="() => canvasRef?.renderer?.zoomTo100()"
          />
        </div>

        <!-- 右侧分隔条 -->
        <div
          v-show="!rightPanelCollapsed"
          class="resizer right-resizer"
          @mousedown="startResizeRightPanel"
        />

        <!-- 右侧折叠按钮（面板折叠时显示） -->
        <button
          v-show="rightPanelCollapsed"
          class="expand-btn"
          title="展开面板"
          @click="rightPanelCollapsed = false"
        >
          ◀
        </button>

        <!-- 右侧属性面板 -->
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
            <h3>{{ rightPanelTitle }}</h3>
          </div>
          <div v-if="!hasActiveAnimation" class="panel-empty-state">
            从左侧动画列表新建或选择一条动画后，才可以编辑关键帧和轨道属性。
          </div>
          <KeyframePropertyPanel
            v-else
            :ctx="ctx"
            :scene-object="sceneObject"
            :scene-objects="propertyPanelSceneObjects"
            :target-options="trackTargetOptions"
            :target-tree-nodes="trackTargetTreeNodes"
            :get-default-pivot="getDefaultTrackPivot"
            @pivot-change="onPropertyPanelPivotChange"
            @pivot-reset="onPropertyPanelPivotReset"
          />
        </aside>
      </div>

      <!-- 底部时间轴（可拖拽调节高度 / 折叠） -->
      <div
        v-if="hasActiveAnimation"
        class="timeline-section"
        :style="{ height: timelineCollapsed ? '32px' : timelineHeight + 'px' }"
      >
        <div
          v-show="!timelineCollapsed"
          class="timeline-resizer"
          @mousedown="startResizeTimeline"
        />
        <AnimationTimeline
          v-show="!timelineCollapsed"
          :ctx="ctx"
          :scene-object="sceneObject"
          :preview-mode="previewMode"
          :preview-track-indexes="activePreviewTrackIndexes"
          style="flex:1;min-height:0"
          @collapse="timelineCollapsed = true"
          @update:preview-mode="previewMode = $event"
          @update:preview-track-indexes="customPreviewTrackIndexes = $event"
          @add-track="addTrackByType"
          @duplicate-track="duplicateTrack"
          @delete-track="deleteTrack"
          @focus-track="handleFocusTrack"
                    @track-selected="locateTrackTarget"
        />
        <div v-if="timelineCollapsed" class="timeline-collapsed-bar" @click="timelineCollapsed = false">
          🎬 {{ animationDef.tracks.length }} 条轨道
          <button class="expand-timeline-btn">▲</button>
        </div>
      </div>
      <div v-else class="timeline-empty-state">暂无动画时间轴</div>

      <!-- 退出确认对话框（有未保存修改时显示） -->
      <div v-if="showCloseConfirm" class="close-confirm-overlay" @click.self="showCloseConfirm = false">
        <div class="close-confirm-dialog">
          <p class="close-confirm-msg">动画已修改，请选择退出方式：</p>
          <div class="close-confirm-actions">
            <button class="btn-cancel-close" @click="showCloseConfirm = false">继续编辑</button>
            <button class="btn-discard" @click="handleConfirmDiscard">放弃修改</button>
            <button class="btn-save-exit" @click="handleSaveAndExit">保存并退出</button>
          </div>
        </div>
      </div>

      <!-- 删除轨道确认对话框 -->
      <div v-if="trackDeleteDialog" class="close-confirm-overlay" @click.self="cancelDeleteTrack">
        <div class="close-confirm-dialog">
          <p class="close-confirm-title">{{ trackDeleteDialog.title }}</p>
          <p class="close-confirm-msg">{{ trackDeleteDialog.message }}</p>
          <div class="close-confirm-actions">
            <button class="btn-cancel-close" @click="cancelDeleteTrack">取消</button>
            <button class="btn-discard" @click="confirmDeleteTrack">删除</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { GlowFilter, MotionBlurFilter } from 'pixi-filters'
import { computed, isRef, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import ZoomControls from '@/components/ZoomControls.vue'
import { type AnimationEditContext,useAnimationEdit } from '@/composables/useAnimationEdit'
import { runPreviewTracksOnCanvas } from '@/composables/useAnimationWorkbenchRenderer'
import { useAssetLoader } from '@/composables/useAssetLoader'
import type { SetupChangePayload } from '@/composables/useSceneRenderer'
import { useToast } from '@/composables/useToast'
import { DynamicEffectManager } from '@/core/animation/DynamicEffectManager'
import {
    accumulateEffectDelta,
    applyComposedTransformToContainer,
    createEmptyComposedTransform,
} from '@/core/AnimationComposition'
import { AnimationTrackEvaluator, AUTO_DURATION_MARKER } from '@/core/AnimationTrackEvaluator'
import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { applyContainerBaseTransform, captureContainerBaseState, type ContainerBaseState } from '@/core/WorkbenchBaseTransformSnapshot'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePropStore } from '@/stores/propStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { AnimationDefinition, TransformTrackOutput, VisibilityTrackOutput } from '@/types/animation'
import type { AnimationTrack, AnimationTrackType, EffectParams } from '@/types/animation'
import { TARGET_SELF } from '@/types/animation'
import type { CompositeObject, SceneObject, SymbolObject } from '@/types/sceneObject'
import type { WorkbenchPreviewStore } from '@/types/WorkbenchPreviewStore'
import { restoreAnimatedSpriteStillFrame } from '@/utils/animationUtils'
import { extractPresetTargetsFromAnimation } from '@/utils/presetAnimationMapper'

import AnimationListPanel from './AnimationListPanel.vue'
import AnimationTimeline from './AnimationTimeline.vue'
import KeyframePropertyPanel from './KeyframePropertyPanel.vue'
import LightweightCanvas from './LightweightCanvas.vue'

// ===== Props & Emits =====

const props = defineProps<{
  visible: boolean
  animation?: AnimationDefinition | undefined
  resourceType: 'prop' | 'background' | 'symbol' | 'composite'
  resourceId: string
  sceneObjectId?: string
  targetObjectId?: string
  /** 已有动画名称列表（用于防重名） */
  existingNames?: string[]
  /** 原始动画名称（编辑模式允许保留原名） */
  originalName?: string | undefined
  // === 列表模式（Phase 3）===
  /** 全部动画列表（列表模式） */
  animations?: AnimationDefinition[]
  /** 对象模式 */
  isObjectMode?: boolean
  /** 场景对象 */
  sceneObject?: SceneObject
  /** 根 Composite ID */
  rootCompositeId?: string
  /** 上层编辑器的持久化流程（如人物编辑器需先汇总对象再保存项目） */
  persistChanges?: (() => Promise<void>) | undefined
}>()

const emit = defineEmits<{
  save: [animation: AnimationDefinition]
  close: []
  // 列表模式事件
  'animation-saved': [animation: AnimationDefinition]
  'animation-deleted': [animationId: string]
  'animation-created': [animation: AnimationDefinition]
  'copy-from-self': []
  'preset-applied': []
  'update:animations': [animations: Record<string, AnimationDefinition>]
}>()

// ===== Refs =====

const overlayRef = ref<HTMLElement | null>(null)
const canvasRef = ref<InstanceType<typeof LightweightCanvas> | null>(null)
const projectStore = useProjectStore()
const toast = useToast()
const isSavingProject = ref(false)

// 右侧面板折叠 / 拉伸
const rightPanelCollapsed = ref(false)
const rightPanelWidth = ref(360)

// 左侧面板折叠 / 拉伸（列表模式）
const leftPanelCollapsed = ref(false)
const leftPanelWidth = ref(320)

// 底部时间轴折叠 / 拉伸
const timelineCollapsed = ref(false)
const timelineHeight = ref(300)
const hasPendingProjectChanges = ref(false)

// 画布工具栏：场景对象 / 穿透列表
const showSceneObjectPanel = ref(false)
const showPassThroughPanel = ref(false)
const expandedObjectIds = ref(new Set<string>())
const passThroughRevision = ref(0)
const workbenchStoreRevision = ref(0)

interface WorkbenchObjectNode {
    id: string
    name: string
    icon: string
    depth: number
    parentId?: string
    children: WorkbenchObjectNode[]
}

interface FlatWorkbenchObjectNode {
    id: string
    name: string
    icon: string
    depth: number
    hasChildren: boolean
}

interface PassThroughEntry {
    visible: boolean
}

interface WorkbenchSceneGraph {
    addPassThrough(objectId: string, visible?: boolean): void
    removePassThrough(objectId: string): void
    setPassThroughVisible(objectId: string, visible: boolean): void
    getPassThroughEntry(objectId: string): PassThroughEntry | undefined
    getPassThroughEntries(): ReadonlyMap<string, PassThroughEntry>
    getContainer(objectId: string): PIXI.Container | undefined
    getGenericAnimationPlayer(objectId: string): WorkbenchAnimationPlayer | undefined
    getGenericAnimationPlayers(): Map<string, WorkbenchAnimationPlayer>
}

interface WorkbenchRenderer {
    renderObjects(): Promise<void>
    syncObjectFromStore(objectId: string): void
    updateSelectionBox(): void
    setAutoRenderEnabled(enabled: boolean): void
    getSceneGraph(): WorkbenchSceneGraph
}

interface WorkbenchAnimationPlayer {
    playAnimation(name: string, definition: AnimationDefinition, params?: {
        loop?: boolean
        speed?: number
        reset?: boolean
        runtimeDuration?: number
    }): void
    stopAnimation(name: string): void
    cacheBaseTransform(): void
}

interface TrackDeleteDialogState {
    trackIndex: number
    title: string
    message: string
}

// === 列表模式判断 ===
const listMode = computed(() => !!props.animations)
const isObjectMode = computed(() => props.isObjectMode ?? false)
const isCompositeMode = computed(() =>
  isObjectMode.value && props.sceneObject?.type === 'composite'
)
const allAnimationsList = computed(() => props.animations ?? [])
const hasActiveAnimation = ref(!!props.animation)
const rightPanelTitle = computed(() => {
    if (!hasActiveAnimation.value) return '未选择动画'
    if (ctx.selectionMode.value === 'keyframe') return '关键帧属性'
    if (ctx.selectionMode.value === 'track') return '轨道属性'
    return '动画概览'
})

const listPanelOptionalProps = computed(() => {
    const p: Record<string, unknown> = {}
    if (props.sceneObject) p['sceneObject'] = props.sceneObject
    if (props.rootCompositeId) p['rootCompositeId'] = props.rootCompositeId
    return p
})

function startResizeTimeline(event: MouseEvent) {
    event.preventDefault()
    const startY = event.clientY
    const startH = timelineHeight.value
    const onMove = (e: MouseEvent) => {
        timelineHeight.value = Math.max(160, Math.min(520, startH - (e.clientY - startY)))
    }
    const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
}

function startResizeRightPanel(event: MouseEvent) {
    event.preventDefault()
    const onMove = (e: MouseEvent) => {
        rightPanelWidth.value = Math.max(320, Math.min(620, window.innerWidth - e.clientX))
    }
    const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
}

function startResizeLeftPanel(event: MouseEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startW = leftPanelWidth.value
    const onMove = (e: MouseEvent) => {
        leftPanelWidth.value = Math.max(240, Math.min(480, startW + (e.clientX - startX)))
    }
    const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
}

const targetContainer = shallowRef<PIXI.Container | null>(null)
const rootContainer = shallowRef<PIXI.Container | null>(null)
const allPartContainers = shallowRef<Map<string, PIXI.Container> | null>(null)
const objectBounds = ref({ width: 200, height: 200 })

// Base transform (object's scene-level transform, used to compute keyframe deltas)
const basePosition = ref({ x: 0, y: 0 })
const baseScale = ref({ x: 1, y: 1 })
const baseRotation = ref(0)
const baseAlpha = ref(1)
const baseObjectPosition = ref({ x: 0, y: 0 })
const baseObjectScale = ref({ x: 1, y: 1 })
const baseObjectRotation = ref(0)
const baseObjectFlipX = ref(false)
const baseBounds = ref({ width: 0, height: 0, x: 0, y: 0 })

interface ObjectTransformBaseState {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    alpha: number
    flipX: boolean
    transformOriginX: number
    transformOriginY: number
    visible: boolean
}

const baseStateCache = new Map<string, ContainerBaseState>()
const initialContainerBaseStateCache = new Map<string, ContainerBaseState>()
const objectBaseStateCache = new Map<string, ObjectTransformBaseState>()

/** 当前编辑的对象在隔离 store 中的 ID */
let currentTargetObjectId: string | null = null
let pivotPreviewObjectId: string | null = null
const WORKBENCH_STANDARD_PREVIEW_NAME = '__workbench_standard_preview__'
const isStandardPlaybackActive = ref(false)
let standardPlaybackRootObjectId: string | null = null
let standardPlaybackStartVersion = 0

const propStore = usePropStore()
const backgroundStore = useBackgroundStore()
const expressionStore = useExpressionStore()
const sceneObjectStore = useSceneObjectStore()
const { getTexture, loadAssets } = useAssetLoader()

// ===== 特效预览滤镜状态（effect 轨道 WYSIWYG 预览用） =====
// v24: 按 target objectId 分别缓存，避免多部位预览时互相覆盖/清理
interface PreviewFilterBundle {
    glow: GlowFilter | null
    motionBlur: MotionBlurFilter | null
    colorMatrix: PIXI.ColorMatrixFilter | null
}

const previewFilterBundles = new Map<string, PreviewFilterBundle>()

function getOrCreateFilterBundle(key: string): PreviewFilterBundle {
    let bundle = previewFilterBundles.get(key)
    if (!bundle) {
        bundle = { glow: null, motionBlur: null, colorMatrix: null }
        previewFilterBundles.set(key, bundle)
    }
    return bundle
}

function clearEffectPreviewFiltersForKey(container: PIXI.Container, key: string) {
    const bundle = previewFilterBundles.get(key)
    if (!bundle) return
    const filtersToRemove = [bundle.glow, bundle.motionBlur, bundle.colorMatrix].filter(Boolean) as PIXI.Filter[]
    if (filtersToRemove.length > 0) {
        container.filters = (container.filters ?? []).filter(f => !filtersToRemove.includes(f))
    }
    bundle.glow = null
    bundle.motionBlur = null
    bundle.colorMatrix = null
}

/**
 * 单容器预览（previewMode === 'current' 等单轨预览入口）的滤镜清理辅助。
 * 使用当前编辑目标的 key 作为缓存键。
 */
function clearEffectPreviewFilters(container: PIXI.Container) {
    clearEffectPreviewFiltersForKey(container, currentTargetObjectId ?? TARGET_SELF)
}

function resetContainerPreviewState(container: PIXI.Container, objectId: string | null) {
    const key = getContainerBaseKey(objectId)
    const state = initialContainerBaseStateCache.get(key) ?? baseStateCache.get(key)
    if (state) {
        resetContainerToBaseStateWithKey(container, state, key)
        return
    }

    clearEffectPreviewFilters(container)
    container.position.set(basePosition.value.x, basePosition.value.y)
    container.scale.set(baseScale.value.x, baseScale.value.y)
    container.rotation = baseRotation.value
    container.alpha = baseAlpha.value
    restoreAnimatedSpriteBaseFrame(container, objectId)
}

// ===== Animation Edit Context =====

function createPlaceholderAnimation(): AnimationDefinition {
    const now = Date.now()
    return {
        type: 'track',
        id: '__placeholder_animation__',
        name: '',
        loop: false,
        tracks: [],
        createdAt: now,
        updatedAt: now,
    }
}

const ctx: AnimationEditContext = useAnimationEdit({
    animation: props.animation ?? createPlaceholderAnimation(),
})
ctx.deselectAll()

const animationDef = ctx.animationDef
const hasUnsavedWorkbenchChanges = computed(() =>
    ctx.hasUnsavedChanges.value || hasPendingProjectChanges.value
)

/** 当前正在编辑的动画的"原始名称"，用于防重名校验，切换动画时同步更新 */
const currentOriginalName = ref<string>(props.originalName ?? props.animation?.name ?? '')

type PreviewMode = 'current' | 'all' | 'custom'

const previewMode = ref<PreviewMode>('all')
const customPreviewTrackIndexes = ref<number[]>([])
const activePreviewTrackIndexes = computed(() => {
    if (!hasActiveAnimation.value) return []
    const indexes = ctx.allTracks.value.map(item => item.index)
    if (previewMode.value === 'all') return indexes
    if (previewMode.value === 'current') {
        const idx = ctx.currentTrackIndex.value
        return idx >= 0 ? [idx] : []
    }
    return customPreviewTrackIndexes.value.filter(index => indexes.includes(index))
})



watch(
    () => animationDef.loop,
    (loop) => {
        ctx.loopPlayback.value = loop
    },
    { immediate: true }
)

const trackTargetOptions = computed(() => {
    const options: { id: string; label: string }[] = [{ id: TARGET_SELF, label: '自身' }]
    const seen = new Set<string>([TARGET_SELF])

    // 统一通过树遍历构建层级列表
    if (props.sceneObject?.type === 'composite') {
        buildTargetHierarchy(props.sceneObject as CompositeObject, 1, seen, options)
    }

    return options
})

/**
 * 递归构建 composite 子对象层级树，通过缩进前缀表达父子关系。
 */
function buildTargetHierarchy(
    composite: CompositeObject,
    depth: number,
    seen: Set<string>,
    options: { id: string; label: string }[],
) {
    const childIds = composite.childIds ?? []
    for (const childId of childIds) {
        if (seen.has(childId)) continue
        seen.add(childId)
        const child = sceneObjectStore.getObject(childId)
        const name = child?.alias?.trim() || child?.name?.trim() || childId
        const indent = '　'.repeat(depth - 1) + (depth > 0 ? '└ ' : '')
        options.push({ id: childId, label: `${indent}${name}` })

        if (child?.type === 'composite') {
            buildTargetHierarchy(child as CompositeObject, depth + 1, seen, options)
        }
    }
}

function getTrackTargetLabel(targetObjectId: string | undefined): string {
    return trackTargetOptions.value.find(option => option.id === (targetObjectId ?? TARGET_SELF))?.label ?? '自身'
}

// Optional props for LightweightCanvas (avoid passing undefined with exactOptionalPropertyTypes)
const canvasOptionalProps = computed(() => {
    const p: Record<string, string> = {}
    if (props.sceneObjectId) p['scene-object-id'] = props.sceneObjectId
    if (props.targetObjectId) p['target-object-id'] = props.targetObjectId
    return p
})

// Zoom value (unwrap Ref from renderer exposed via defineExpose)
const canvasZoom = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const zoom = canvasRef.value?.renderer?.userZoom
    if (zoom == null) return 1
    return isRef(zoom) ? (zoom.value as number) : (zoom as number)
})

const workbenchAnimStore = computed<WorkbenchPreviewStore | null>(() => {
    void workbenchStoreRevision.value
    return (canvasRef.value?.previewStore as WorkbenchPreviewStore | null) ?? null
})

const propertyPanelSceneObjects = computed(() => {
    const store = workbenchAnimStore.value
    if (store?.objects.length) return store.objects
    return props.sceneObject ? [props.sceneObject] : []
})

const selectedWorkbenchObjectId = computed(() => {
    void workbenchStoreRevision.value
    return workbenchAnimStore.value?.selectedObjectId ?? null
})

const selectedWorkbenchObjectLabel = computed(() => {
    const selectedId = selectedWorkbenchObjectId.value
    const selected = selectedId ? workbenchAnimStore.value?.getObject(selectedId) : null
    if (!selected) return '选择场景对象'
    return `${getTypeIcon(selected.type)} ${getObjectDisplayName(selected)}`
})

const sceneObjectTreeNodes = computed<WorkbenchObjectNode[]>(() => {
    void workbenchStoreRevision.value
    const store = workbenchAnimStore.value
    const objects = store?.objects ?? []
    const objectMap = new Map(objects.map(obj => [obj.id, obj]))
    const roots = objects.filter(obj => !obj.parentId || !objectMap.has(obj.parentId))
    const sceneOrder = new Map<string, number>()
    store?.getSceneRenderChain().forEach((id, index) => sceneOrder.set(id, index))

    function getObjectOrder(obj: SceneObject): number {
        if (sceneOrder.has(obj.id)) return sceneOrder.get(obj.id)!
        if (obj.parentId) {
            const parent = objectMap.get(obj.parentId)
            if (parent?.type === 'composite') {
                const parentComp = parent as CompositeObject
                const renderIndex = parentComp.renderChain?.indexOf(obj.id) ?? -1
                if (renderIndex >= 0) return renderIndex
                const childIndex = parentComp.childIds?.indexOf(obj.id) ?? -1
                if (childIndex >= 0) return childIndex
            }
        }
        return obj.zIndex
    }

    function buildNode(obj: SceneObject, depth: number): WorkbenchObjectNode {
        const comp = obj.type === 'composite' ? obj as CompositeObject : null
        const childIds = comp
            ? (comp.childIds ?? [])
            : objects.filter(child => child.parentId === obj.id).map(child => child.id)

        const children = childIds
            .map(childId => objectMap.get(childId))
            .filter((child): child is SceneObject => Boolean(child))
            .sort((a, b) => getObjectOrder(a) - getObjectOrder(b))
            .map(child => buildNode(child, depth + 1))

        return {
            id: obj.id,
            name: getObjectDisplayName(obj),
            icon: getTypeIcon(obj.type),
            depth,
            ...(obj.parentId ? { parentId: obj.parentId } : {}),
            children,
        }
    }

    return roots
        .sort((a, b) => getObjectOrder(a) - getObjectOrder(b))
        .map(obj => buildNode(obj, 0))
})

const trackTargetTreeNodes = computed<WorkbenchObjectNode[]>(() => {
    const rootId = getRootPreviewObjectId()
    const roots = sceneObjectTreeNodes.value
    const rootNode = roots.find(node => node.id === rootId)
    const targetRoots = rootNode ? rootNode.children : roots
    return targetRoots
})

const flatSceneObjectNodes = computed<FlatWorkbenchObjectNode[]>(() => {
    const result: FlatWorkbenchObjectNode[] = []

    function walk(nodes: WorkbenchObjectNode[]): void {
        for (const node of nodes) {
            result.push({
                id: node.id,
                name: node.name,
                icon: node.icon,
                depth: node.depth,
                hasChildren: node.children.length > 0,
            })
            if (node.children.length > 0 && expandedObjectIds.value.has(node.id)) {
                walk(node.children)
            }
        }
    }

    walk(sceneObjectTreeNodes.value)
    return result
})

const passThroughIds = computed(() => {
    void passThroughRevision.value
    const sceneGraph = getWorkbenchSceneGraph()
    if (!sceneGraph) return []
    return [...sceneGraph.getPassThroughEntries().keys()]
})

const passThroughEntries = computed(() => {
    void passThroughRevision.value
    const sceneGraph = getWorkbenchSceneGraph()
    const store = workbenchAnimStore.value
    if (!sceneGraph || !store) return []

    return [...sceneGraph.getPassThroughEntries()].flatMap(([objectId, entry]) => {
        const obj = store.getObject(objectId)
        if (!obj) return []
        return [{
            objectId,
            name: getObjectDisplayName(obj),
            icon: getTypeIcon(obj.type),
            visible: entry.visible,
        }]
    })
})

const selectedObjectIsPassThrough = computed(() => {
    const selectedId = selectedWorkbenchObjectId.value
    if (!selectedId) return false
    return passThroughIds.value.includes(selectedId)
})

function getObjectDisplayName(obj: SceneObject): string {
    return obj.alias?.trim() || obj.name?.trim() || obj.id
}

function toggleSceneObjectPanel(): void {
    showSceneObjectPanel.value = !showSceneObjectPanel.value
    if (showSceneObjectPanel.value) showPassThroughPanel.value = false
}

function togglePassThroughPanel(): void {
    showPassThroughPanel.value = !showPassThroughPanel.value
    if (showPassThroughPanel.value) showSceneObjectPanel.value = false
}

function toggleObjectExpanded(objectId: string): void {
    const next = new Set(expandedObjectIds.value)
    if (next.has(objectId)) {
        next.delete(objectId)
    } else {
        next.add(objectId)
    }
    expandedObjectIds.value = next
}

function selectWorkbenchObject(objectId: string): void {
    workbenchAnimStore.value?.selectObject(objectId)
    workbenchStoreRevision.value++
    showSceneObjectPanel.value = false
    void getWorkbenchRenderer()?.renderObjects()
}

function addSelectedObjectToPassThrough(): void {
    const selectedId = selectedWorkbenchObjectId.value
    if (!selectedId || selectedObjectIsPassThrough.value) return
    addToPassThrough(selectedId)
}

function addToPassThrough(objectId: string): void {
    const renderer = getWorkbenchRenderer()
    const sceneGraph = renderer?.getSceneGraph()
    if (!renderer || !sceneGraph) return
    sceneGraph.addPassThrough(objectId)
    passThroughRevision.value++
    void renderer.renderObjects()
}

function removeFromPassThrough(objectId: string): void {
    const renderer = getWorkbenchRenderer()
    const sceneGraph = renderer?.getSceneGraph()
    if (!renderer || !sceneGraph) return
    sceneGraph.removePassThrough(objectId)
    passThroughRevision.value++
    void renderer.renderObjects()
}

function togglePassThroughVisible(objectId: string): void {
    const renderer = getWorkbenchRenderer()
    const sceneGraph = renderer?.getSceneGraph()
    const entry = sceneGraph?.getPassThroughEntry(objectId)
    if (!renderer || !sceneGraph || !entry) return
    sceneGraph.setPassThroughVisible(objectId, !entry.visible)
    passThroughRevision.value++
    void renderer.renderObjects()
}

function closeToolbarPopovers(): void {
    showSceneObjectPanel.value = false
    showPassThroughPanel.value = false
}

function getWorkbenchRenderer(): WorkbenchRenderer | null {
    return canvasRef.value?.renderer as unknown as WorkbenchRenderer | null
}

function getWorkbenchSceneGraph(): WorkbenchSceneGraph | null {
    return getWorkbenchRenderer()?.getSceneGraph() ?? null
}

function resetRuntimeStoreFromBase(): void {
    canvasRef.value?.resetRuntimeFromBase?.()
    const renderer = getWorkbenchRenderer()
    const store = workbenchAnimStore.value
    if (!renderer || !store) return
    for (const obj of store.objects) {
        renderer.syncObjectFromStore(obj.id)
    }
}

// ===== Canvas Ready =====

function onCanvasAppReady(_app: PIXI.Application) {
    void nextTick(() => overlayRef.value?.focus())
}

function onContainerReady(payload: {
    container: PIXI.Container
    partContainers?: Map<string, PIXI.Container>
    objectBounds: { width: number; height: number }
}) {
    workbenchStoreRevision.value++
    passThroughRevision.value++
    rootContainer.value = payload.container
    allPartContainers.value = payload.partContainers ?? null
    objectBounds.value = payload.objectBounds

    const resolved = resolveTargetContainer()
    targetContainer.value = resolved

    // 记录当前目标对象 ID（用于从 store 读取拖拽后的值）
    resolveCurrentTargetObjectId()

    captureObjectBaseStateCache()
    captureInitialContainerBaseStateCache()
    syncCurrentTrackPivotPreview()
    captureBaseTransform(resolved)
    warmPreviewBaseStateCache()
    syncRuntimeTrackDuration()
    expandRootObjectNodes()

    // Apply initial keyframe state
    if (hasActiveAnimation.value) {
        applyTimeToCanvas(ctx.playheadPosition.value)
    }
}

function expandRootObjectNodes(): void {
    if (expandedObjectIds.value.size > 0) return
    const rootIds = sceneObjectTreeNodes.value
        .filter(node => node.children.length > 0)
        .map(node => node.id)
    if (rootIds.length === 0) return
    expandedObjectIds.value = new Set(rootIds)
}

// ===== Multi-track target resolution =====

function resolveTargetContainer(): PIXI.Container {
    const track = ctx.currentTrackAny.value
    return resolveTargetContainerForTrack(track)
}

function resolveTargetContainerForTrack(track: AnimationTrack | null | undefined): PIXI.Container {
    const targetId = track?.targetObjectId
    const parts = allPartContainers.value
    const root = rootContainer.value!

    if (targetId && targetId !== TARGET_SELF && parts?.has(targetId)) {
        return parts.get(targetId)!
    }
    return root
}

/** 解析当前目标对象在隔离 store 中的 ID */
function resolveCurrentTargetObjectId() {
    const track = ctx.currentTrackAny.value
    currentTargetObjectId = resolveTargetObjectIdForTrack(track)
}

function resolveTargetObjectIdForTrack(track: AnimationTrack | null | undefined): string | null {
    const targetId = track?.targetObjectId

    if (targetId && targetId !== TARGET_SELF) {
        return targetId
    }

    let objectId = props.sceneObjectId ?? null
    if (!objectId) {
        const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
        if (store) {
            objectId = store.selectedObjectId
        }
    }
    return objectId
}

function getRootPreviewObjectId(): string | null {
    return props.sceneObjectId ?? props.sceneObject?.id ?? null
}

function getContainerBaseKey(objectId: string | null): string {
    return objectId ?? TARGET_SELF
}

function captureInitialContainerBaseStateCache() {
    initialContainerBaseStateCache.clear()

    const root = rootContainer.value
    if (root) {
        const rootObjectId = getRootPreviewObjectId()
        const state = captureContainerBaseState(root, rootObjectId)
        initialContainerBaseStateCache.set(getContainerBaseKey(rootObjectId), state)
        initialContainerBaseStateCache.set(TARGET_SELF, state)
    }

    for (const [objectId, container] of allPartContainers.value ?? []) {
        initialContainerBaseStateCache.set(objectId, captureContainerBaseState(container, objectId))
    }
}

function getInitialContainerBaseState(key: string, container?: PIXI.Container | null, objectId?: string | null): ContainerBaseState | null {
    const cached = initialContainerBaseStateCache.get(key)
    if (cached) return cached
    if (!container) return null

    const state = captureContainerBaseState(container, objectId ?? (key === TARGET_SELF ? getRootPreviewObjectId() : key))
    initialContainerBaseStateCache.set(key, state)
    return state
}

function captureObjectBaseStateCache() {
    objectBaseStateCache.clear()
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!store) return

    for (const obj of store.objects) {
        objectBaseStateCache.set(obj.id, {
            x: obj.x,
            y: obj.y,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
            rotation: obj.rotation,
            alpha: obj.alpha,
            flipX: obj.flipX,
            transformOriginX: obj.transformOriginX ?? 0,
            transformOriginY: obj.transformOriginY ?? 0,
            visible: obj.visible,
        })
    }

}

function getObjectBaseState(objectId: string | null): ObjectTransformBaseState | null {
    if (!objectId) return null
    const cached = objectBaseStateCache.get(objectId)
    if (cached) return cached

    const obj = getSceneObjectById(objectId)
    if (!obj) return null
    const state: ObjectTransformBaseState = {
        x: obj.x,
        y: obj.y,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        rotation: obj.rotation,
        alpha: obj.alpha,
        flipX: obj.flipX,
        transformOriginX: obj.transformOriginX ?? 0,
        transformOriginY: obj.transformOriginY ?? 0,
        visible: obj.visible,
    }
    objectBaseStateCache.set(objectId, state)
    return state
}

function resolveObjectIdForPreviewKey(key: string): string | null {
    if (key !== TARGET_SELF) return key
    return getRootPreviewObjectId() ?? currentTargetObjectId
}

function restoreStoreObjectToBase(objectId: string | null) {
    if (!objectId) return
    const state = objectBaseStateCache.get(objectId)
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!state || !store) return
    store.updateObject(objectId, {
        x: state.x,
        y: state.y,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        rotation: state.rotation,
        alpha: state.alpha,
        flipX: state.flipX,
        transformOriginX: state.transformOriginX,
        transformOriginY: state.transformOriginY,
        visible: state.visible,
    })
}

function syncObjectOriginPreview(objectId: string, transformOriginX: number, transformOriginY: number): boolean {
    const renderer = getWorkbenchRenderer()
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!renderer || !store) return false

    const obj = store.getObject(objectId)
    if (!obj) return false

    const containerKey = getContainerBaseKey(objectId)
    const baseContainer = getInitialContainerBaseState(containerKey, resolveContainerForKey(containerKey), objectId)
    const container = resolveContainerForKey(containerKey)
    const baseObj = getObjectBaseState(objectId)
    if (!baseContainer || !container || container.destroyed || !baseObj) return false

    const pivotBaseX = baseContainer.pivot.x - baseObj.transformOriginX
    const pivotBaseY = baseContainer.pivot.y - baseObj.transformOriginY
    const expectedPivotX = pivotBaseX + transformOriginX
    const expectedPivotY = pivotBaseY + transformOriginY
    const dOX = transformOriginX - baseObj.transformOriginX
    const dOY = transformOriginY - baseObj.transformOriginY
    const flipSign = baseObj.flipX ? -1 : 1
    const expectedPositionX = baseContainer.position.x + flipSign * dOX
    const expectedPositionY = baseContainer.position.y + dOY

    const visualMatches =
        Math.abs(container.pivot.x - expectedPivotX) < 0.001 &&
        Math.abs(container.pivot.y - expectedPivotY) < 0.001 &&
        Math.abs(container.position.x - expectedPositionX) < 0.001 &&
        Math.abs(container.position.y - expectedPositionY) < 0.001

    if (visualMatches) {
        return false
    }

    // 轨道 pivot 是动画轨道级状态，不应写入 preview store 的对象 transformOrigin。
    // 否则预览合成会把 track.pivot 当成对象基准 pivot，导致 pivot delta 为 0。
    container.pivot.set(expectedPivotX, expectedPivotY)
    container.position.set(expectedPositionX, expectedPositionY)
    return true
}

function restoreObjectPivotPreview(objectId: string | null): boolean {
    if (!objectId) return false
    const base = getObjectBaseState(objectId)
    if (!base) return false
    return syncObjectOriginPreview(objectId, base.transformOriginX, base.transformOriginY)
}

function getDefaultTrackPivot(objectId: string | null): { x: number; y: number } | null {
    const resolvedObjectId = objectId && objectId !== TARGET_SELF ? objectId : getRootPreviewObjectId()
    const key = getContainerBaseKey(resolvedObjectId)
    const baseContainer = initialContainerBaseStateCache.get(key) ?? baseStateCache.get(key)
    if (!baseContainer) return null
    return { x: baseContainer.pivot.x, y: baseContainer.pivot.y }
}

function applyTrackPivotPreview(objectId: string, pivot: { x: number; y: number }): boolean {
    const baseObject = getObjectBaseState(objectId)
    const containerKey = getContainerBaseKey(objectId)
    const baseContainer = getInitialContainerBaseState(containerKey, resolveContainerForKey(containerKey), objectId)
    if (!baseObject || !baseContainer) return false

    const pivotBaseX = baseContainer.pivot.x - baseObject.transformOriginX
    const pivotBaseY = baseContainer.pivot.y - baseObject.transformOriginY
    return syncObjectOriginPreview(
        objectId,
        pivot.x - pivotBaseX,
        pivot.y - pivotBaseY,
    )
}

function syncCurrentTrackPivotPreview(): void {
    const renderer = getWorkbenchRenderer()
    if (!renderer) return

    const activeTrack = ctx.currentTrack.value
    const activeObjectId = resolveTargetObjectIdForTrack(activeTrack)
    const activePivot = activeTrack?.pivot
    let selectionChanged = false

    if (pivotPreviewObjectId && (pivotPreviewObjectId !== activeObjectId || !activePivot)) {
        selectionChanged = restoreObjectPivotPreview(pivotPreviewObjectId) || selectionChanged
    }

    if (activeTrack && activeObjectId && activePivot) {
        selectionChanged = applyTrackPivotPreview(activeObjectId, activePivot) || selectionChanged
        pivotPreviewObjectId = activeObjectId
    } else {
        pivotPreviewObjectId = null
    }

    if (selectionChanged) {
        renderer.updateSelectionBox()
    }
}

function captureBaseTransform(container: PIXI.Container) {
    const baseObjectFromCache = getObjectBaseState(currentTargetObjectId)
    const baseObjectFromStore = getSceneObjectById(currentTargetObjectId)
    const cacheKey = getContainerBaseKey(currentTargetObjectId)
    const initialContainerBase = getInitialContainerBaseState(cacheKey, container, currentTargetObjectId)
    const transformBase = initialContainerBase ?? captureContainerBaseState(container, currentTargetObjectId)

    basePosition.value = {
        x: transformBase.position.x,
        y: transformBase.position.y,
    }
    baseScale.value = {
        x: transformBase.scale.x,
        y: transformBase.scale.y,
    }
    baseRotation.value = transformBase.rotation
    baseAlpha.value = transformBase.alpha
    const localBounds = transformBase.bounds
    baseBounds.value = {
        width: localBounds.width,
        height: localBounds.height,
        x: localBounds.x,
        y: localBounds.y,
    }

    const baseObject = baseObjectFromCache ?? baseObjectFromStore
    if (baseObject) {
        baseObjectPosition.value = {
            x: baseObject.x,
            y: baseObject.y,
        }
        baseObjectScale.value = {
            x: baseObject.scaleX,
            y: baseObject.scaleY,
        }
        baseObjectRotation.value = baseObject.rotation
        baseObjectFlipX.value = baseObject.flipX ?? false
    } else {
        baseObjectPosition.value = { x: container.position.x, y: container.position.y }
        baseObjectScale.value = { x: Math.abs(container.scale.x), y: container.scale.y }
        baseObjectRotation.value = container.rotation
        baseObjectFlipX.value = container.scale.x < 0
    }

    baseStateCache.set(cacheKey, transformBase)
}

function warmPreviewBaseStateCache() {
    baseStateCache.clear()
    for (const { track } of ctx.allTracks.value) {
        const container = resolveTargetContainerForTrack(track)
        const objectId = resolveTargetObjectIdForTrack(track)
        const key = getContainerBaseKey(objectId)
        const state = getInitialContainerBaseState(key, container, objectId)
        if (state) baseStateCache.set(key, state)
    }
}

function getBaseStateForTrack(track: AnimationTrack): ContainerBaseState {
    const objectId = resolveTargetObjectIdForTrack(track)
    const key = getContainerBaseKey(objectId)
    const cached = baseStateCache.get(key)
    if (cached) return cached

    const container = resolveTargetContainerForTrack(track)
    const state = getInitialContainerBaseState(key, container, objectId) ?? captureContainerBaseState(container, objectId)
    baseStateCache.set(key, state)
    return state
}

function getSceneObjectById(objectId: string | null): SceneObject | null {
    if (!objectId) return props.sceneObject ?? null
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!store) return props.sceneObject ?? null
    const obj = store.getObject(objectId)
    return obj ?? props.sceneObject ?? null
}

function restoreAnimatedSpriteBaseFrame(container: PIXI.Container, objectId: string | null) {
    const sprite = findAnimatedSprite(container)
    if (!sprite) return

    const obj = getSceneObjectById(objectId)
    if (!obj) {
        sprite.gotoAndStop(0)
        return
    }

    if (obj.type === 'prop') {
        const prop = propStore.getProp(obj.refId)
        if (prop?.type === 'animation') {
            restoreAnimatedSpriteStillFrame(sprite, {
                stillFrameSource: prop.stillFrameSource,
                stillFrameIndex: prop.stillFrameIndex,
                url: prop.stillFrameCustomUrl,
            }, getTexture)
            return
        }
    }

    if (obj.type === 'background') {
        const background = backgroundStore.getBackground(obj.refId)
        if (background?.type === 'animation') {
            restoreAnimatedSpriteStillFrame(sprite, {
                stillFrameSource: background.stillFrameSource,
                stillFrameIndex: background.stillFrameIndex,
                url: background.stillFrameCustomUrl,
            }, getTexture)
            return
        }
    }

    if (obj.type === 'symbol') {
        const symbol = obj as SymbolObject
        const materialId = symbol.currentMaterialId
        const material = materialId
            ? symbol.materials.find(m => m.id === materialId)
            : symbol.materials[0]
        if (material?.type === 'animation') {
            restoreAnimatedSpriteStillFrame(sprite, {
                stillFrameSource: material.stillFrameSource,
                stillFrameIndex: material.stillFrameIndex,
                url: material.url,
            }, getTexture)
            return
        }
    }

    if (obj.type === 'expression') {
        const expression = expressionStore.getExpression(obj.refId)
        const defaultFrameUrl = expression?.defaultFrame?.url
        if (defaultFrameUrl) {
            const defaultTexture = getTexture(defaultFrameUrl)
            if (defaultTexture && defaultTexture !== PIXI.Texture.EMPTY) {
                sprite.texture = defaultTexture
                return
            }
        }
    }

    sprite.gotoAndStop(0)
}

function getFrameSequencePreviewDurationMs(
    track: AnimationTrack & { trackType: 'frame_sequence' },
    container: PIXI.Container | null,
): number | null {
    if (!track || !container) return null
    const sprite = findAnimatedSprite(container)
    if (!sprite || sprite.totalFrames <= 0) return null
    // track.fps 优先，否则从 sprite 的 animationSpeed 反推资源 FPS（与角色预览对话框一致）
    const resolvedFps = track.fps ?? (sprite.animationSpeed > 0 ? sprite.animationSpeed * 60 : 25)
    if (resolvedFps <= 0) return null
    return (sprite.totalFrames / resolvedFps) * 1000
}

function findAnimatedSprite(container: PIXI.Container): PIXI.AnimatedSprite | null {
    const names = ['prop_animation', 'bg_animation', 'background_animation', 'symbol_animation', 'expression_animation', 'animation']
    for (const name of names) {
        const child = container.getChildByName(name)
        if (child instanceof PIXI.AnimatedSprite) return child
    }
    return null
}

interface FrameSequencePreviewSource {
    spriteName: string
    frameUrls: string[]
    stillFrameSource: 'frame' | 'custom' | undefined
    stillFrameIndex: number | undefined
    stillFrameUrl: string | undefined
    fps: number
    loop: boolean
    anchor: [number, number]
    width?: number
    height?: number
}

function collectNonEmptyTextures(urls: string[]): PIXI.Texture[] {
    const textures: PIXI.Texture[] = []
    for (const url of urls) {
        const texture = getTexture(url)
        if (texture && texture !== PIXI.Texture.EMPTY) {
            textures.push(texture)
        }
    }
    return textures
}

function resolveFrameSequencePreviewSource(
    track: AnimationTrack & { trackType: 'frame_sequence' },
): FrameSequencePreviewSource | null {
    const objectId = resolveTargetObjectIdForTrack(track)
    const obj = getSceneObjectById(objectId)
    if (!obj) return null

    if (obj.type === 'prop') {
        const prop = propStore.getProp(obj.refId)
        if (prop?.type !== 'animation' || !prop.frames?.length) return null
        return {
            spriteName: 'prop_animation',
            frameUrls: prop.frames.map(frame => frame.url).filter(Boolean),
            stillFrameSource: prop.stillFrameSource,
            stillFrameIndex: prop.stillFrameIndex,
            stillFrameUrl: prop.stillFrameCustomUrl,
            fps: track.fps ?? prop.fps ?? 25,
            loop: track.loop ?? prop.loop ?? true,
            anchor: [0.5, 0.5],
        }
    }

    if (obj.type === 'background') {
        const background = backgroundStore.getBackground(obj.refId)
        if (background?.type !== 'animation' || !background.frames?.length) return null
        return {
            spriteName: 'bg_animation',
            frameUrls: background.frames.map(frame => frame.url).filter(Boolean),
            stillFrameSource: background.stillFrameSource,
            stillFrameIndex: background.stillFrameIndex,
            stillFrameUrl: background.stillFrameCustomUrl,
            fps: track.fps ?? background.fps ?? 25,
            loop: track.loop ?? background.loop ?? true,
            anchor: [0, 0],
            width: obj.width,
            height: obj.height,
        }
    }

    if (obj.type === 'symbol') {
        const symbol = obj as SymbolObject
        const materialId = symbol.currentMaterialId
        const material = materialId
            ? symbol.materials.find(item => item.id === materialId)
            : symbol.materials[0]
        if (material?.type !== 'animation' || !material.frames?.length) return null
        return {
            spriteName: 'symbol_animation',
            frameUrls: material.frames.map(frame => frame.url).filter(Boolean),
            stillFrameSource: material.stillFrameSource,
            stillFrameIndex: material.stillFrameIndex,
            stillFrameUrl: material.url,
            fps: track.fps ?? material.fps ?? 12,
            loop: track.loop ?? material.loop ?? true,
            anchor: [0.5, 0.5],
        }
    }

    return null
}

async function ensureFrameSequencePreviewSprite(
    track: AnimationTrack & { trackType: 'frame_sequence' },
    container: PIXI.Container,
): Promise<void> {
    if (findAnimatedSprite(container)) return

    const stillSprite = container.getChildByName('editor_still_sprite')
    if (!stillSprite) return

    const source = resolveFrameSequencePreviewSource(track)
    if (!source || source.frameUrls.length <= 1) return

    const urlsToLoad = new Set<string>(source.frameUrls)
    if (source.stillFrameUrl) urlsToLoad.add(source.stillFrameUrl)
    await loadAssets(urlsToLoad, new Set(), 'AnimationWorkbench.frameSequencePreview')

    const textures = collectNonEmptyTextures(source.frameUrls)
    if (textures.length <= 1) return

    container.removeChild(stillSprite)
    stillSprite.destroy()

    const animatedSprite = new PIXI.AnimatedSprite(textures)
    animatedSprite.name = source.spriteName
    animatedSprite.anchor.set(source.anchor[0], source.anchor[1])
    animatedSprite.animationSpeed = source.fps / 60
    animatedSprite.loop = source.loop
    animatedSprite.autoUpdate = false
    if (source.width !== undefined && source.width > 0) animatedSprite.width = source.width
    if (source.height !== undefined && source.height > 0) animatedSprite.height = source.height
    restoreAnimatedSpriteStillFrame(animatedSprite, {
        stillFrameSource: source.stillFrameSource,
        stillFrameIndex: source.stillFrameIndex,
        url: source.stillFrameUrl,
    }, getTexture)
    container.addChild(animatedSprite)
}

async function prepareFrameSequencePreviewSprites(definition: AnimationDefinition): Promise<void> {
    if (definition.type !== 'track') return
    for (const track of definition.tracks) {
        if (track.trackType !== 'frame_sequence') continue
        const container = resolveTargetContainerForTrack(track)
        await ensureFrameSequencePreviewSprite(track, container)
    }
}

function syncRuntimeTrackDuration() {
    if (previewMode.value !== 'current') {
        const durations = activePreviewTrackIndexes.value
            .map(index => animationDef.tracks[index])
            .filter((track): track is AnimationTrack => !!track)
            .map(track => getTrackDurationMs(track))
            .filter(duration => Number.isFinite(duration) && duration > 0)
        ctx.setTrackDurationOverride(durations.length > 0 ? Math.max(...durations) : 1000)
        return
    }
    const track = ctx.currentTrackAny.value
    if (track?.trackType === 'frame_sequence') {
        ctx.setTrackDurationOverride(getFrameSequencePreviewDurationMs(track, targetContainer.value))
    } else if (track?.trackType === 'effect') {
        const duration = getTrackDurationMs(track)
        ctx.setTrackDurationOverride(Number.isFinite(duration) && duration > 0 ? duration : 1000)
    } else {
        ctx.setTrackDurationOverride(null)
    }
}

const trackDurationSignature = computed(() => animationDef.tracks.map(track => {
    if (track.trackType === 'transform' || track.trackType === 'visibility') {
        return `${track.trackType}:${track.duration ?? 'default'}`
    }
    if (track.trackType === 'frame_sequence') {
        return `${track.trackType}:${track.targetObjectId ?? TARGET_SELF}:${track.assetId ?? ''}:${track.fps ?? 25}`
    }
    return `${track.trackType}:${track.targetObjectId ?? TARGET_SELF}:${getTrackDurationMs(track)}`
}).join('|'))

// Watch for track switches → rebind to correct container
watch(() => ctx.currentTrackIndex.value, () => {
    if (!hasActiveAnimation.value) return
    if (!rootContainer.value) return

    const newTarget = resolveTargetContainer()
    const prevTarget = targetContainer.value
    const prevTargetObjectId = currentTargetObjectId

    // 无论是否切到同一目标，都先清除当前预览状态，避免上一条轨道残留
    if (prevTarget) {
        resetContainerPreviewState(prevTarget, prevTargetObjectId)
    }

    targetContainer.value = newTarget
    resolveCurrentTargetObjectId()
    syncCurrentTrackPivotPreview()
    captureBaseTransform(newTarget)
    syncRuntimeTrackDuration()

    applyTimeToCanvas(ctx.playheadPosition.value)
    locateTrackTarget(ctx.currentTrackIndex.value)
})

watch(() => ctx.currentFrameSequenceTrack.value?.fps, () => {
    syncRuntimeTrackDuration()
})

watch(trackDurationSignature, () => {
    if (!hasActiveAnimation.value) return
    syncRuntimeTrackDuration()
    if (ctx.isPlaying.value && isStandardPlaybackActive.value) {
        restartStandardWorkbenchPlayback()
        return
    }
    applyTimeToCanvas(ctx.playheadPosition.value)
})

watch(() => ctx.currentTrackAny.value?.targetObjectId, () => {
    if (!hasActiveAnimation.value) return
    if (!rootContainer.value) return
    const newTarget = resolveTargetContainer()
    targetContainer.value = newTarget
    resolveCurrentTargetObjectId()
    syncCurrentTrackPivotPreview()
    captureBaseTransform(newTarget)
    warmPreviewBaseStateCache()
    applyTimeToCanvas(ctx.playheadPosition.value)
    locateTrackTarget(ctx.currentTrackIndex.value)
})

watch(
    () => {
        const track = ctx.currentTrack.value
        const pivot = track?.pivot
        const objectId = resolveTargetObjectIdForTrack(track)
        return pivot ? `${objectId ?? TARGET_SELF}:${pivot.x}:${pivot.y}` : 'none'
    },
    () => {
        if (!hasActiveAnimation.value) return
        if (!rootContainer.value) return
        syncCurrentTrackPivotPreview()
        const container = resolveTargetContainer()
        targetContainer.value = container
        captureBaseTransform(container)
        applyTimeToCanvas(ctx.playheadPosition.value)
    },
)

watch([previewMode, activePreviewTrackIndexes], () => {
    if (!hasActiveAnimation.value) return
    syncRuntimeTrackDuration()
    if (ctx.isPlaying.value && isStandardPlaybackActive.value) {
        restartStandardWorkbenchPlayback()
        return
    }
    applyTimeToCanvas(ctx.playheadPosition.value)
})

// ===== Store Change → Keyframe =====

/**
 * 统一的变换点提交入口。供以下三处调用：
 * 1. 主画布 onSetupChange('origin')（向后兼容，主画布已改为只读 gizmo）
 * 2. KeyframePropertyPanel 的数字输入框
 * 3. PivotEditorPanel 的可视化拖拽
 *
 * 只更新 transform track 自己的 pivot。该 pivot 是动画求值的基准点，
 * 不再反向补偿关键帧；当前帧会从 base 姿态重新计算并应用新 pivot。
 */
function commitTrackPivotChange(targetObjectId: string, newPivot: { x: number; y: number }) {
    const activeTrack = ctx.currentTrack.value
    const activeTargetObjectId = resolveTargetObjectIdForTrack(activeTrack)

    if (!activeTrack || activeTargetObjectId !== targetObjectId) {
        restoreObjectPivotPreview(targetObjectId)
        syncCurrentTrackPivotPreview()
        applyTimeToCanvas(ctx.playheadPosition.value)
        toast.info('当前仅在对应的变换轨道上编辑变换点。')
        return
    }

    ctx.updatePivot(newPivot)
    currentTargetObjectId = activeTargetObjectId
    targetContainer.value = resolveTargetContainerForTrack(activeTrack)
    applyTimeToCanvas(ctx.playheadPosition.value)
    if (previewMode.value === 'current') {
        syncTrackPivotToRuntimeTarget(activeTargetObjectId)
    }
}

/**
 * 属性面板（KeyframePropertyPanel）事件回调。
 * 轨道目标由当前 active track 决定，无需显式 targetObjectId。
 */
function onPropertyPanelPivotChange(pivot: { x: number; y: number }) {
    const activeTargetObjectId = resolveTargetObjectIdForTrack(ctx.currentTrack.value)
    if (!activeTargetObjectId) return
    commitTrackPivotChange(activeTargetObjectId, pivot)
}

function onPropertyPanelPivotReset() {
    const activeTrack = ctx.currentTrack.value
    const activeTargetObjectId = resolveTargetObjectIdForTrack(activeTrack)
    if (!activeTrack || !activeTargetObjectId) return

    ctx.clearPivot()
    applyTimeToCanvas(ctx.playheadPosition.value)
}

/**
 * 画布上拖拽/缩放/旋转结束后，从隔离 store 读取对象最新状态，
 * 计算与基准姿态的差值，写入当前播放头位置的关键帧。
 */
function onSetupChange(change: SetupChangePayload) {
    if (change.type === 'origin') {
        // v26: 主画布上的变换点手柄现在是只读 gizmo，不应再触发 origin 事件。
        // 若收到（兼容旧路径），统一走 commitTrackPivotChange。
        commitTrackPivotChange(change.objectId, change.pivot)
        return
    }

    // 从隔离 store 读取实际被拖动的对象 ID，优先级高于 currentTargetObjectId
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    const draggedObjectId = change.objectId || store?.selectedObjectId || currentTargetObjectId
    if (!draggedObjectId) return

    // 归一化根对象 ID：统一 TARGET_SELF / sceneObjectId / sceneObject.id 的比较语义
    const rootId = getRootPreviewObjectId()
    const isRootDrag = draggedObjectId === rootId ||
        (rootId === null && draggedObjectId === currentTargetObjectId)

    // Auto-Key: 如果当前没有匹配的 transform 轨道，自动创建/选中一条
    const currentResolvedTarget = ctx.currentTrack.value
        ? resolveTargetObjectIdForTrack(ctx.currentTrack.value)
        : null
    const needsTrackSwitch = !ctx.currentTrack.value ||
        (currentResolvedTarget !== draggedObjectId && !(isRootDrag && currentResolvedTarget === rootId))

    if (needsTrackSwitch) {
        const savedPlayhead = ctx.playheadPosition.value

        // 查找匹配轨道：归一化 TARGET_SELF 与根对象 ID 的等价关系
        const existingTransformTrack = animationDef.tracks.find(t => {
            if (t.trackType !== 'transform') return false
            // 轨道的 TARGET_SELF 等价于根对象 ID
            if (t.targetObjectId === TARGET_SELF || !t.targetObjectId) {
                return isRootDrag
            }
            return t.targetObjectId === draggedObjectId
        })

        if (!existingTransformTrack) {
            // 仅当拖动的是根对象时使用 TARGET_SELF，否则用具体 ID
            const trackTargetId = isRootDrag ? TARGET_SELF : draggedObjectId
            const track = buildDefaultTrack('transform', trackTargetId)
            const idx = ctx.addTrack(track)
            ctx.selectTrackOnly(idx)
        } else {
            // 找到了匹配的 transform 轨道但未选中，自动选中（不重置播放头）
            const matchIdx = animationDef.tracks.indexOf(existingTransformTrack)
            if (matchIdx >= 0) ctx.selectTrackOnly(matchIdx)
        }

        // 同步刷新目标对象 ID 和 base 变换（不等异步 watcher）
        currentTargetObjectId = draggedObjectId
        const newContainer = resolveTargetContainerForTrack(ctx.currentTrackAny.value)
        targetContainer.value = newContainer
        captureBaseTransform(newContainer)
        warmPreviewBaseStateCache()
        syncRuntimeTrackDuration()

        // 恢复播放头到用户实际操作位置
        ctx.playheadPosition.value = savedPlayhead
    }
    const obj = store?.getObject(draggedObjectId)
    if (!obj) return

    // 计算差值（关键帧存储的是相对于基准姿态的偏移量）
    const deltaX = obj.x - baseObjectPosition.value.x
    const deltaY = obj.y - baseObjectPosition.value.y
    const deltaScaleX = obj.scaleX / baseObjectScale.value.x
    const deltaScaleY = obj.scaleY / baseObjectScale.value.y
    const deltaRotation = obj.rotation - baseObjectRotation.value

    const result = ctx.commitTransformAtPlayhead({
        x: deltaX,
        y: deltaY,
        scaleX: deltaScaleX,
        scaleY: deltaScaleY,
        rotation: deltaRotation,
    })

    // 若播放头不在任何已有关键帧上，不自动创建关键帧：还原画布到插值姿态并提示用户。
    if (result.status === 'skipped-no-keyframe-at-playhead') {
        applyTimeToCanvas(ctx.playheadPosition.value)
        toast.info('当前播放头位置没有关键帧，变换已还原。请先在时间轴上添加关键帧再编辑。')
    }
}

// ===== Playhead → Canvas Sync =====

watch(() => ctx.playheadPosition.value, (time) => {
    if (!hasActiveAnimation.value) return
    if (isStandardPlaybackActive.value) return
    applyTimeToCanvas(time)
})

watch(() => ctx.selectedKeyframeIndex.value, () => {
    if (!hasActiveAnimation.value) return
    const idx = ctx.selectedKeyframeIndex.value
    const kf = idx >= 0 ? ctx.activeKeyframes.value[idx] : null
    if (kf) {
        ctx.playheadPosition.value = kf.time
    }
})

function applyTimeToCanvas(time: number) {
    if (isStandardPlaybackActive.value) return

    const container = targetContainer.value
    if (!container) return

    resetRuntimeStoreFromBase()

    if (previewMode.value !== 'current') {
        applyPreviewTracksToCanvas(time)
        syncRuntimeStoreFromRenderedContainers()
        getWorkbenchRenderer()?.updateSelectionBox()
        return
    }

    const trackType = ctx.currentTrackAny.value?.trackType

    if (trackType === 'transform' || trackType === undefined) {
        clearEffectPreviewFilters(container)
        const output = ctx.evaluateAtTime(time)
        if (!output) return
        applyOutputToContainer(container, output)
        // 同步隔离 store（使选择框位置与容器一致）
        syncRuntimeStoreFromRenderedContainer(currentTargetObjectId, container)
        getWorkbenchRenderer()?.updateSelectionBox()
    } else if (trackType === 'visibility') {
        clearEffectPreviewFilters(container)
        const output = ctx.evaluateVisibilityAtTime(time)
        if (!output) return
        applyVisibilityToContainer(container, output)
        syncRuntimeStoreFromRenderedContainer(currentTargetObjectId, container)
        getWorkbenchRenderer()?.updateSelectionBox()
    } else if (trackType === 'effect') {
        const track = ctx.currentEffectTrack.value
        if (track) {
            const globalDurationMs = ctx.trackDuration.value
            const trackDurationMs = getTrackDurationMs(track)
            const normalizedTrackProgress = computeTrackProgress(time * globalDurationMs, trackDurationMs, globalDurationMs, animationDef.loop === true)
            const effectDurationMs = Number.isFinite(trackDurationMs) && trackDurationMs > 0 ? trackDurationMs : globalDurationMs
            if (ctx.isPlaying.value) {
                const effectOutput = DynamicEffectManager.calculateWithProgress(track.effectParams, normalizedTrackProgress, effectDurationMs)
                applyEffectDeltaToContainer(container, effectOutput)
                syncRuntimeStoreFromRenderedContainer(currentTargetObjectId, container)
            } else {
                clearEffectPreviewFilters(container)
                syncRuntimeStoreFromRenderedContainer(currentTargetObjectId, container)
            }
            getWorkbenchRenderer()?.updateSelectionBox()
        }
    } else if (trackType === 'frame_sequence') {
        clearEffectPreviewFilters(container)
        if (ctx.isPlaying.value) applyFrameSequenceToContainer(container, time)
        syncRuntimeStoreFromRenderedContainer(currentTargetObjectId, container)
        getWorkbenchRenderer()?.updateSelectionBox()
    }
}

/**
 * 上一轮预览涉及到的 target keys，用于在本轮预览范围收窄时，把那些不再被覆盖的
 * 目标也恢复到 base state，避免残留上一轮动画写入的变换。
 */
const previouslyAffectedKeys = new Set<string>()

function restoreAllPreviewTargetsToBase() {
    if (!rootContainer.value) return

    const keys = new Set<string>([
        ...objectBaseStateCache.keys(),
        ...initialContainerBaseStateCache.keys(),
        ...baseStateCache.keys(),
        ...previouslyAffectedKeys,
        getContainerBaseKey(currentTargetObjectId),
    ])

    for (const key of keys) {
        const objectId = resolveObjectIdForPreviewKey(key)
        const container = resolveContainerForKey(key)
        const state = initialContainerBaseStateCache.get(key) ?? baseStateCache.get(key)
        restoreStoreObjectToBase(resolveObjectIdForPreviewKey(key))
        if (!state || !container) continue
        resetContainerToBaseStateWithKey(container, state, key)
        void objectId
    }

    previouslyAffectedKeys.clear()
}

function applyPreviewTracksToCanvas(time: number) {
    // Phase 2b: 实际合成逻辑已迁移到 useAnimationWorkbenchRenderer.ts。
    // 本函数仅负责把组件内局部状态 / 解析器 / 回调组装成 deps，调用底层纯命令式 helper。
    runPreviewTracksOnCanvas({
        rootContainer: rootContainer.value,
        activePreviewTrackIndexes: activePreviewTrackIndexes.value,
        animationDef,
        globalDurationMs: ctx.trackDuration.value,
        includeTemporalTracks: ctx.isPlaying.value,

        previouslyAffectedKeys,
        baseStateCache,
        initialContainerBaseStateCache,
        objectBaseStateCache,

        resolveTargetObjectIdForTrack,
        resolveTargetContainerForTrack,
        resolveContainerForKey,
        resolveObjectIdForPreviewKey,
        getBaseStateForTrack,
        getSceneObjectById,

        resetContainerToBaseStateWithKey,
        applyFrameSequenceTrackToContainer,
        applyEffectFiltersForKey,
        getTrackDurationMs,
    }, time)
}

/**
 * 按正式 AnimationPlayer 的规则计算单条轨道的归一化进度（0..1）。
 * - 轨道时长 >= 动画时长：使用全局进度
 * - 轨道时长 < 动画时长 且 动画循环：按轨道时长循环
 * - 轨道时长 < 动画时长 且 不循环：播放到末帧后停在 1
 */
function computeTrackProgress(
    elapsedMs: number,
    trackDurationMs: number,
    globalDurationMs: number,
    loop: boolean,
): number {
    if (trackDurationMs <= 0) return 0
    if (globalDurationMs <= 0) return 0
    if (!Number.isFinite(trackDurationMs)) return Math.min(1, Math.max(0, elapsedMs / globalDurationMs))
    if (trackDurationMs >= globalDurationMs) {
        return Math.min(1, Math.max(0, elapsedMs / globalDurationMs))
    }
    if (loop) {
        return (elapsedMs % trackDurationMs) / trackDurationMs
    }
    return Math.min(1, elapsedMs / trackDurationMs)
}

/** 按 target key 查找对应容器（cross-target 或 self） */
function resolveContainerForKey(key: string): PIXI.Container | null {
    if (key !== TARGET_SELF && allPartContainers.value?.has(key)) {
        return allPartContainers.value.get(key) ?? null
    }
    return rootContainer.value ?? null
}

function resetContainerToBaseStateWithKey(container: PIXI.Container, state: ContainerBaseState, key: string) {
    clearEffectPreviewFiltersForKey(container, key)
    // Phase 1b: 几何量（position/scale/rotation/alpha/pivot）由 WorkbenchBaseTransformSnapshot 模块统一还原，
    // 其中 pivot 必须被还原——切空动画时不恢复会残留上一条轨道的 track.pivot，导致对象整体偏移。
    applyContainerBaseTransform(container, state)
    restoreAnimatedSpriteBaseFrame(container, state.objectId)
}

/**
 * 按 target key 为容器安装/更新/清理特效滤镜（glow / motion blur / petrify colorMatrix）。
 * 合并当轮所有 effect deltas 的滤镜字段。
 */
function applyEffectFiltersForKey(
    container: PIXI.Container,
    key: string,
    deltas: {
        glowColor?: string; glowIntensity?: number; glowSize?: number
        motionBlurVelocity?: [number, number]; motionBlurKernelSize?: number
        petrifyProgress?: number; petrifyGrayScale?: boolean
    }[],
) {
    const bundle = getOrCreateFilterBundle(key)

    // 合并字段（后者覆盖前者，与旧单轨行为一致）
    let glowColor: string | undefined
    let glowIntensity: number | undefined
    let glowSize: number | undefined
    let motionBlurVelocity: [number, number] | undefined
    let motionBlurKernelSize: number | undefined
    let petrifyProgress: number | undefined
    let petrifyGrayScale: boolean | undefined

    for (const d of deltas) {
        if (d.glowColor !== undefined) glowColor = d.glowColor
        if (d.glowIntensity !== undefined) glowIntensity = d.glowIntensity
        if (d.glowSize !== undefined) glowSize = d.glowSize
        if (d.motionBlurVelocity !== undefined) motionBlurVelocity = d.motionBlurVelocity
        if (d.motionBlurKernelSize !== undefined) motionBlurKernelSize = d.motionBlurKernelSize
        if (d.petrifyProgress !== undefined) petrifyProgress = d.petrifyProgress
        if (d.petrifyGrayScale !== undefined) petrifyGrayScale = d.petrifyGrayScale
    }

    // Glow
    if (glowColor !== undefined || glowIntensity !== undefined || glowSize !== undefined) {
        if (!bundle.glow) {
            bundle.glow = new GlowFilter()
            container.filters = [...(container.filters ?? []), bundle.glow]
        }
        if (glowColor !== undefined) bundle.glow.color = parseInt(glowColor.replace('#', ''), 16)
        if (glowIntensity !== undefined) bundle.glow.outerStrength = glowIntensity
        if (glowSize !== undefined) (bundle.glow as GlowFilter & { distance?: number }).distance = glowSize
    } else if (bundle.glow) {
        container.filters = (container.filters ?? []).filter(f => f !== bundle.glow)
        bundle.glow = null
    }

    // Motion blur
    if (motionBlurVelocity !== undefined) {
        if (!bundle.motionBlur) {
            bundle.motionBlur = new MotionBlurFilter()
            container.filters = [...(container.filters ?? []), bundle.motionBlur]
        }
        bundle.motionBlur.velocity = new PIXI.Point(...motionBlurVelocity)
        if (motionBlurKernelSize !== undefined) bundle.motionBlur.kernelSize = motionBlurKernelSize
    } else if (bundle.motionBlur) {
        container.filters = (container.filters ?? []).filter(f => f !== bundle.motionBlur)
        bundle.motionBlur = null
    }

    // Petrify（灰度）
    if (petrifyProgress !== undefined && petrifyProgress > 0) {
        if (!bundle.colorMatrix) {
            bundle.colorMatrix = new PIXI.ColorMatrixFilter()
            container.filters = [...(container.filters ?? []), bundle.colorMatrix]
        }
        if (petrifyGrayScale) {
            bundle.colorMatrix.reset()
            bundle.colorMatrix.saturate(-petrifyProgress, false)
        }
    } else if (bundle.colorMatrix) {
        container.filters = (container.filters ?? []).filter(f => f !== bundle.colorMatrix)
        bundle.colorMatrix = null
    }
}

function getTrackDurationMs(track: AnimationTrack): number {
    if (track.trackType === 'frame_sequence') {
        const duration = getFrameSequencePreviewDurationMs(track, resolveTargetContainerForTrack(track))
        if (duration) return duration
    }
    const duration = AnimationTrackEvaluator.getTrackDuration(track)
    if (duration === AUTO_DURATION_MARKER) return 1000
    return duration
}

function applyVisibilityToContainer(container: PIXI.Container, output: VisibilityTrackOutput) {
    container.alpha = baseAlpha.value * output.alpha
}

/**
 * v24: 单轨 effect 预览（previewMode === 'current'）的应用入口。
 * 内部使用共享的 ComposedTransform + per-target 滤镜缓存，与多轨预览一致。
 */
function applyEffectDeltaToContainer(container: PIXI.Container, delta: {
    deltaX?: number; deltaY?: number
    deltaScaleX?: number; deltaScaleY?: number
    deltaRotation?: number; deltaAlpha?: number
    glowColor?: string; glowIntensity?: number; glowSize?: number
    motionBlurVelocity?: [number, number]; motionBlurKernelSize?: number
    petrifyProgress?: number; petrifyGrayScale?: boolean
    shatterProgress?: number; shatterAlpha?: number
}) {
    const key = currentTargetObjectId ?? TARGET_SELF
    const base: ContainerBaseState = {
        objectId: currentTargetObjectId,
        position: basePosition.value,
        scale: baseScale.value,
        pivot: targetContainer.value
            ? { x: targetContainer.value.pivot.x, y: targetContainer.value.pivot.y }
            : { x: 0, y: 0 },
        rotation: baseRotation.value,
        alpha: baseAlpha.value,
        bounds: baseBounds.value,
    }

    // 1) Transform + alpha：走共享合成（等价于 base + effect delta）
    const composed = createEmptyComposedTransform()
    accumulateEffectDelta(composed, delta)
    if (delta.shatterAlpha !== undefined) {
        composed.alphaProduct *= Math.max(0, delta.shatterAlpha)
    } else if (delta.shatterProgress !== undefined) {
        composed.alphaProduct *= Math.max(0, 1 - delta.shatterProgress)
    }
    applyComposedTransformToContainer(container, {
        x: base.position.x,
        y: base.position.y,
        scaleX: base.scale.x,
        scaleY: base.scale.y,
        rotation: base.rotation,
        alpha: base.alpha,
    }, composed)

    // 2) 滤镜：复用 per-target 缓存
    applyEffectFiltersForKey(container, key, [delta])
}

function applyFrameSequenceToContainer(container: PIXI.Container, time: number) {
    const track = ctx.currentFrameSequenceTrack.value
    if (!track) return
    applyFrameSequenceTrackToContainer(track, container, time)
}

function applyFrameSequenceTrackToContainer(track: AnimationTrack & { trackType: 'frame_sequence' }, container: PIXI.Container, time: number) {
    const sprite = findAnimatedSprite(container)
    if (!sprite || sprite.totalFrames <= 1) return
    // time 是归一化进度 (0-1)，直接映射到帧索引即可
    // 无需通过 getTrackDurationMs() + fps 反推——那条路径在容器未就绪时
    // 会退化为固定 1000ms，导致帧索引计算严重偏快
    const frameIndex = Math.min(sprite.totalFrames - 1, Math.floor(time * sprite.totalFrames))
    sprite.gotoAndStop(frameIndex)
    void track // track.fps 已隐含在 getTrackDurationMs 用于 computeTrackProgress 中
}

function applyOutputToContainer(container: PIXI.Container, output: TransformTrackOutput) {
    applyOutputToContainerForObject(currentTargetObjectId, container, output)
}

function applyOutputToContainerForObject(objectId: string | null, container: PIXI.Container, output: TransformTrackOutput) {
    const key = getContainerBaseKey(objectId)
    const cachedBase = initialContainerBaseStateCache.get(key) ?? baseStateCache.get(key)
    applyOutputToContainerWithBase(container, output, {
        objectId,
        position: cachedBase?.position ?? basePosition.value,
        scale: cachedBase?.scale ?? baseScale.value,
        pivot: cachedBase?.pivot ?? { x: container.pivot.x, y: container.pivot.y },
        rotation: cachedBase?.rotation ?? baseRotation.value,
        alpha: cachedBase?.alpha ?? baseAlpha.value,
        bounds: cachedBase?.bounds ?? baseBounds.value,
    })
}

function applyOutputToContainerWithBase(container: PIXI.Container, output: TransformTrackOutput, base: ContainerBaseState) {
    const flipFactor = output.flipX ? -1 : 1
    const sx = (output.scaleX ?? 1) * flipFactor
    const sy = output.scaleY ?? 1
    const rot = output.rotation ?? 0

    let basePositionX = base.position.x
    let basePositionY = base.position.y

    const pivot = output.pivot
    if (pivot) {
        const dx = pivot.x - base.pivot.x
        const dy = pivot.y - base.pivot.y
        const baseFlipSign = base.scale.x < 0 ? -1 : 1
        basePositionX += baseFlipSign * dx
        basePositionY += dy
        container.pivot.set(pivot.x, pivot.y)
    } else {
        container.pivot.set(base.pivot.x, base.pivot.y)
    }

    container.position.set(
        basePositionX + (output.x ?? 0),
        basePositionY + (output.y ?? 0),
    )
    container.scale.set(
        base.scale.x * sx,
        base.scale.y * sy,
    )
    container.rotation = base.rotation + rot
}

function syncRuntimeStoreFromRenderedContainers(): void {
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!store) return
    for (const obj of store.objects) {
        const key = getContainerBaseKey(obj.id)
        const container = resolveContainerForKey(key)
        if (container) syncRuntimeStoreFromRenderedContainer(obj.id, container)
    }
}

function syncRuntimeStoreFromRenderedContainer(objectId: string | null, container: PIXI.Container): void {
    if (!objectId || container.destroyed) return
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    if (!store) return

    const baseObj = getObjectBaseState(objectId)
    if (!baseObj) return

    const flipX = container.scale.x < 0

    // 从 container.pivot 反推当前应写回 store 的 transformOrigin：
    //   pivotBase = baseContainer.pivot − baseObj.transformOrigin   （对象几何中心）
    //   newOrigin = container.pivot − pivotBase
    // 无 track.pivot 时，container.pivot 仍为 baseContainer.pivot，newOrigin 退化为 baseObj.transformOrigin，
    // 写入为 no-op；存在 track.pivot（或用户刚刚在 PivotEditorPanel 调整过 pivot）时，
    // newOrigin 会随 container.pivot 同步更新——这样 Vue 深观察触发的 renderObjects
    // 重新用 applyObjectState 应用 store 状态时，container.pivot 会稳定落在 track.pivot 上，
    // 主画布的只读变换点手柄也会在下一次 updateSelectionBox 中绘制到正确位置。
    const containerKey = getContainerBaseKey(objectId)
    const baseContainer = initialContainerBaseStateCache.get(containerKey) ?? baseStateCache.get(containerKey)
    const baseOriginX = baseObj.transformOriginX ?? 0
    const baseOriginY = baseObj.transformOriginY ?? 0
    let newOriginX = baseOriginX
    let newOriginY = baseOriginY
    if (baseContainer) {
        const pivotBaseX = baseContainer.pivot.x - baseOriginX
        const pivotBaseY = baseContainer.pivot.y - baseOriginY
        newOriginX = container.pivot.x - pivotBaseX
        newOriginY = container.pivot.y - pivotBaseY
    }

    // 反算 store.x/y：renderObjects 下次会用 container.position = store.x + flipSign*newOrigin
    // 重放，因此这里必须用 newOrigin 来反推，才能保证回传闭环不漂移。
    const cx = flipX ? -newOriginX : newOriginX

    store.updateObject(objectId, {
        x: container.position.x - cx,
        y: container.position.y - newOriginY,
        scaleX: Math.abs(container.scale.x),
        scaleY: container.scale.y,
        rotation: container.rotation,
        alpha: container.alpha,
        flipX,
        transformOriginX: newOriginX,
        transformOriginY: newOriginY,
    })
}

function syncTrackPivotToRuntimeTarget(objectId: string | null): void {
    if (!objectId) return
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    const renderer = getWorkbenchRenderer()
    if (!store || !renderer) return

    const container = resolveContainerForKey(getContainerBaseKey(objectId))
    if (!container || container.destroyed) return

    const track = ctx.currentTrack.value
    const trackTargetObjectId = resolveTargetObjectIdForTrack(track)
    if (track?.pivot && trackTargetObjectId === objectId) {
        const output = ctx.evaluateAtTime(ctx.playheadPosition.value)
        if (output) {
            applyOutputToContainerForObject(objectId, container, { ...output, pivot: track.pivot })
        }
    }

    syncRuntimeStoreFromRenderedContainer(objectId, container)
    renderer.syncObjectFromStore(objectId)
    store.selectObject(objectId)
    workbenchStoreRevision.value++
    renderer.updateSelectionBox()
}

function buildStandardPlaybackDefinition(): AnimationDefinition | null {
    const tracks = activePreviewTrackIndexes.value
        .map(index => animationDef.tracks[index])
        .filter((track): track is AnimationTrack => !!track)

    if (tracks.length === 0) return null

    return {
        ...JSON.parse(JSON.stringify(animationDef)) as AnimationDefinition,
        id: WORKBENCH_STANDARD_PREVIEW_NAME,
        name: WORKBENCH_STANDARD_PREVIEW_NAME,
        tracks: JSON.parse(JSON.stringify(tracks)) as AnimationTrack[],
    }
}

function getStandardPlaybackRootObjectId(): string | null {
    const explicitRootId = getRootPreviewObjectId()
    if (explicitRootId) return explicitRootId

    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    const rootObj = store?.objects.find(obj => !obj.parentId)
    return rootObj?.id ?? currentTargetObjectId
}

function getStandardPlaybackRootPlayer(): WorkbenchAnimationPlayer | null {
    const sceneGraph = getWorkbenchSceneGraph()
    if (!sceneGraph) return null

    const rootId = getStandardPlaybackRootObjectId()
    if (!rootId) return null

    const player = sceneGraph.getGenericAnimationPlayer(rootId)
    if (!player) return null

    standardPlaybackRootObjectId = rootId
    return player
}

function cacheStandardPlaybackBaseTransforms(): void {
    const sceneGraph = getWorkbenchSceneGraph()
    if (!sceneGraph) return
    for (const player of sceneGraph.getGenericAnimationPlayers().values()) {
        player.cacheBaseTransform()
    }
}

function stopStandardWorkbenchPlayback(restoreEditFrame: boolean): void {
    if (!isStandardPlaybackActive.value && !standardPlaybackRootObjectId) return

    const sceneGraph = getWorkbenchSceneGraph()
    const rootPlayer = standardPlaybackRootObjectId
        ? sceneGraph?.getGenericAnimationPlayer(standardPlaybackRootObjectId)
        : null

    rootPlayer?.stopAnimation(WORKBENCH_STANDARD_PREVIEW_NAME)
    isStandardPlaybackActive.value = false
    standardPlaybackRootObjectId = null

    restoreAllPreviewTargetsToBase()
    resetRuntimeStoreFromBase()

    if (restoreEditFrame && hasActiveAnimation.value) {
        applyTimeToCanvas(ctx.playheadPosition.value)
    }
}

async function startStandardWorkbenchPlayback(startVersion: number): Promise<boolean> {
    const renderer = getWorkbenchRenderer()
    const definition = buildStandardPlaybackDefinition()
    const player = getStandardPlaybackRootPlayer()

    if (!renderer || !definition || !player) {
        isStandardPlaybackActive.value = false
        standardPlaybackRootObjectId = null
        return false
    }

    renderer.setAutoRenderEnabled(true)
    restoreAllPreviewTargetsToBase()
    resetRuntimeStoreFromBase()
    await prepareFrameSequencePreviewSprites(definition)
    if (startVersion !== standardPlaybackStartVersion || !ctx.isPlaying.value) {
        return false
    }
    syncRuntimeTrackDuration()
    cacheStandardPlaybackBaseTransforms()

    player.playAnimation(WORKBENCH_STANDARD_PREVIEW_NAME, definition, {
        loop: ctx.loopPlayback.value,
        reset: true,
        runtimeDuration: ctx.trackDuration.value,
    })
    isStandardPlaybackActive.value = true
    return true
}

function restartStandardWorkbenchPlayback(): void {
    stopStandardWorkbenchPlayback(false)
    const renderer = getWorkbenchRenderer()
    const startVersion = ++standardPlaybackStartVersion
    void startStandardWorkbenchPlayback(startVersion).then(started => {
        if (!started && startVersion === standardPlaybackStartVersion && ctx.isPlaying.value) {
            renderer?.setAutoRenderEnabled(false)
        }
    })
}

// ===== Playback: hide selection box =====

watch(() => ctx.isPlaying.value, (playing) => {
    const renderer = getWorkbenchRenderer()
    if (playing) {
        const startVersion = ++standardPlaybackStartVersion
        void startStandardWorkbenchPlayback(startVersion).then(started => {
            if (!started && startVersion === standardPlaybackStartVersion && ctx.isPlaying.value) {
                renderer?.setAutoRenderEnabled(false)
            }
        })
    } else {
        standardPlaybackStartVersion++
        stopStandardWorkbenchPlayback(true)
        renderer?.setAutoRenderEnabled(true)
    }
})

// ===== Keyboard Shortcuts =====

function onKeydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return

    switch (e.key) {
        case ' ':
            e.preventDefault()
            ctx.togglePlay()
            break
        case 'k':
        case 'K':
            e.preventDefault()
            ctx.addKeyframeAtPlayhead()
            break
        case 'Delete':
            ctx.removeKeyframe(ctx.selectedKeyframeIndex.value)
            break
        case 'ArrowLeft':
            e.preventDefault()
            ctx.seekPrevKeyframe()
            break
        case 'ArrowRight':
            e.preventDefault()
            ctx.seekNextKeyframe()
            break
        case 'Home':
            e.preventDefault()
            ctx.seekTo(0)
            break
        case 'End':
            e.preventDefault()
            ctx.seekTo(1)
            break
        case 'Escape':
            if (trackDeleteDialog.value) {
                cancelDeleteTrack()
                break
            }
            if (showCloseConfirm.value) {
                showCloseConfirm.value = false
                break
            }
            handleClose()
            break
        case 'c':
        case 'C':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                ctx.copyKeyframe()
            }
            break
        case 'v':
        case 'V':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                if (ctx.canPasteKeyframeToCurrentTrack()) {
                    ctx.pasteKeyframe()
                }
            }
            break
    }
}

// ===== Save / Close =====

/**
 * 执行名称校验 + 关键帧清理 + emit save。
 * 返回 true 表示保存成功，false 表示校验未通过（已向用户 alert）。
 */
function trySave(): boolean {
    if (!hasActiveAnimation.value) return false
    const trimmedName = animationDef.name.trim()
    if (!trimmedName) {
        alert('请输入动画名称')
        return false
    }
    if (props.existingNames && currentOriginalName.value !== undefined) {
        if (trimmedName !== currentOriginalName.value && props.existingNames.includes(trimmedName)) {
            alert(`动画名称 "${trimmedName}" 已存在，请使用其他名称`)
            return false
        }
    }
    animationDef.name = trimmedName

    // 保存前关键帧清理：排序 + 过滤 NaN/超范围帧
    for (const track of animationDef.tracks) {
        if (track.trackType === 'transform' || track.trackType === 'visibility') {
            const kfs = (track as { keyframes: { time: number }[] }).keyframes
            if (kfs && kfs.length > 0) {
                const validKfs = kfs.filter(kf => !isNaN(kf.time) && kf.time >= 0 && kf.time <= 1)
                validKfs.sort((a, b) => a.time - b.time)
                ;(track as { keyframes: typeof validKfs }).keyframes = validKfs
            }
        }
    }

    animationDef.updatedAt = Date.now()
    currentOriginalName.value = trimmedName
    emit('save', JSON.parse(JSON.stringify(animationDef)) as AnimationDefinition)
    markPendingProjectChange()
    return true
}

async function saveCurrentAnimationToProject(): Promise<boolean> {
    if (isSavingProject.value) return false
    if (!hasActiveAnimation.value && !hasPendingProjectChanges.value) return false

    if (hasActiveAnimation.value && !trySave()) return false

    isSavingProject.value = true
    try {
        if (props.persistChanges) {
            await props.persistChanges()
        } else {
            await projectStore.saveProject()
        }
        ctx.markSaved()
        hasPendingProjectChanges.value = false
        return true
    } catch (error) {
        console.error('[AnimationWorkbench] 保存项目失败:', error)
        alert(`保存项目失败：${error instanceof Error ? error.message : String(error)}`)
        return false
    } finally {
        isSavingProject.value = false
    }
}

async function handleSave() {
    await saveCurrentAnimationToProject()
}

function handleSaveAsPreset(): void {
    if (!hasActiveAnimation.value) return
    // 需要一个 SceneObject Map 以便通过 targetObjectId 反查 alias/name
    const sceneObjectsMap = new Map<string, SceneObject>()
    for (const obj of sceneObjectStore.objects) sceneObjectsMap.set(obj.id, obj)

    const extract = extractPresetTargetsFromAnimation(animationDef, sceneObjectsMap)
    if (extract.expectedTargets.length === 0) {
        toast.error('当前动画没有可导出的轨道（所有轨道均指向 _self 或缺失 alias/name）')
        return
    }

    const defaultName = animationDef.name || '未命名动作'
    const userName = window.prompt('请输入预定义动作名称：', defaultName)
    const trimmedName = userName?.trim()
    if (!trimmedName) return

    const template = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: trimmedName,
        category: 'custom' as const,
        origin: 'user' as const,
        loop: animationDef.loop === true,
        ...(animationDef.duration !== undefined ? { duration: animationDef.duration } : {}),
        ...(animationDef.fillMode !== undefined ? { fillMode: animationDef.fillMode } : {}),
        expectedTargets: extract.expectedTargets,
        targetTracks: extract.targetTracks,
    }

    projectStore.addCustomPreset(template)

    if (extract.warnings.length > 0) {
        toast.info(`已保存预定义动作 "${trimmedName}"（含 ${extract.warnings.length} 条警告，请查看控制台）`)
        console.warn('[AnimationWorkbench] 导出预定义动作警告:', extract.warnings)
    } else {
        toast.success(`已保存预定义动作 "${trimmedName}"`)
    }
}

/** 控制退出确认对话框可见性 */
const showCloseConfirm = ref(false)
const trackDeleteDialog = ref<TrackDeleteDialogState | null>(null)

function handleClose() {
    if (hasUnsavedWorkbenchChanges.value) {
        showCloseConfirm.value = true
        return
    }
    stopStandardWorkbenchPlayback(false)
    restoreAllPreviewTargetsToBase()
    ctx.dispose()
    emit('close')
}

function handleConfirmDiscard() {
    showCloseConfirm.value = false
    stopStandardWorkbenchPlayback(false)
    restoreAllPreviewTargetsToBase()
    ctx.dispose()
    emit('close')
}

async function handleSaveAndExit() {
    showCloseConfirm.value = false
    if (await saveCurrentAnimationToProject()) {
        stopStandardWorkbenchPlayback(false)
        restoreAllPreviewTargetsToBase()
        ctx.dispose()
        emit('close')
    }
}

function markPendingProjectChange(): void {
    hasPendingProjectChanges.value = true
}

// ===== Track Management =====

function buildDefaultTrack(trackType: AnimationTrackType, targetObjectId: string): AnimationTrack {
    const target = targetObjectId === TARGET_SELF ? TARGET_SELF : targetObjectId

    if (trackType === 'visibility') {
        return {
            trackType,
            targetObjectId: target,
            duration: 1000,
            easing: 'linear',
            keyframes: [
                { time: 0, alpha: 1 },
                { time: 1, alpha: 1 },
            ],
        }
    }

    if (trackType === 'effect') {
        const effectParams: EffectParams = { type: 'float', amplitude: 5, speed: 1 }
        return {
            trackType,
            targetObjectId: target,
            effectParams,
        }
    }

    if (trackType === 'frame_sequence') {
        return {
            trackType,
            targetObjectId: target,
        }
    }

    return {
        trackType: 'transform',
        targetObjectId: target,
        duration: 1000,
        easing: 'linear',
        keyframes: [
            { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            { time: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        ],
    }
}

function addTrackByType(trackType: AnimationTrackType) {
    const track = buildDefaultTrack(trackType, TARGET_SELF)
    const idx = ctx.addTrack(track)
    ctx.selectTrackOnly(idx)
}

function duplicateTrack(trackIndex: number) {
    const source = animationDef.tracks[trackIndex]
    if (!source) return
    const cloned = JSON.parse(JSON.stringify(source)) as AnimationTrack
    if (cloned.displayName) cloned.displayName = `${cloned.displayName} 副本`
    const idx = ctx.addTrack(cloned)
    ctx.selectTrackOnly(idx)
}

function deleteTrack(trackIndex: number) {
    const track = animationDef.tracks[trackIndex]
    if (!track) return
    const keyframeCount = track.trackType === 'transform' || track.trackType === 'visibility' ? track.keyframes.length : 0
    const label = track.displayName?.trim() || getTrackTargetLabel(track.targetObjectId)
    trackDeleteDialog.value = {
        trackIndex,
        title: `删除轨道「${label}」`,
        message: keyframeCount > 0
            ? `该轨道包含 ${keyframeCount} 个关键帧，删除后不可恢复。`
            : '该轨道删除后不可恢复。',
    }
}

function cancelDeleteTrack(): void {
    trackDeleteDialog.value = null
}

function confirmDeleteTrack(): void {
    const target = trackDeleteDialog.value
    trackDeleteDialog.value = null
    if (!target) return
    if (!animationDef.tracks[target.trackIndex]) return
    ctx.removeTrack(target.trackIndex)
}

function handleFocusTrack(trackIndex: number) {
    ctx.selectTrackOnly(trackIndex)
    locateTrackTarget(trackIndex)
}

function locateTrackTarget(trackIndex: number) {
    const track = animationDef.tracks[trackIndex]
    if (!track) return
    const targetId = resolveTargetObjectIdForTrack(track)
    const store = (canvasRef.value?.previewStore as WorkbenchPreviewStore | null)
    store?.selectObject(targetId)
    workbenchStoreRevision.value++
    getWorkbenchRenderer()?.updateSelectionBox()
}

// ===== 列表模式事件 =====

function handleListSelect(animationId: string) {
    // 单击：先经过完整的保存校验和关键帧清理，再切换动画
    const target = props.animations?.find(a => a.id === animationId)
    if (!target) return
    if (target.id === animationDef.id) {
        ctx.deselectAll()
        return
    }
    // 若校验未通过（空名称/重名），放弃切换
    if (hasActiveAnimation.value && ctx.hasUnsavedChanges.value && !trySave()) return
    restoreAllPreviewTargetsToBase()
    // 更新防重名基线
    currentOriginalName.value = target.name
    hasActiveAnimation.value = true
    // 重置编辑上下文为目标动画
    ctx.resetAnimation(target)
    ctx.deselectAll()
    warmPreviewBaseStateCache()
    syncRuntimeTrackDuration()
    applyTimeToCanvas(ctx.playheadPosition.value)
}

function handleListEdit(animationId: string) {
    // 双击：与单击等效（已在 select 中切换），无需额外操作
    void animationId
}

function handleCopyFromSelf(): void {
    emit('copy-from-self')
    markPendingProjectChange()
}

function handleAnimationsUpdate(animations: Record<string, AnimationDefinition>) {
    emit('update:animations', animations)
    markPendingProjectChange()
    if (!hasActiveAnimation.value) return

    const updatedCurrent = animations[animationDef.id]
    if (!updatedCurrent) return

    animationDef.name = updatedCurrent.name
    animationDef.loop = updatedCurrent.loop
    if (updatedCurrent.fillMode !== undefined) {
        animationDef.fillMode = updatedCurrent.fillMode
    } else {
        delete animationDef.fillMode
    }
    animationDef.updatedAt = updatedCurrent.updatedAt
    currentOriginalName.value = updatedCurrent.name
}

function handleListDelete(animationId: string) {
    const animations = props.animations ?? []
    const remaining = animations.filter(item => item.id !== animationId)
    emit('update:animations', Object.fromEntries(remaining.map(item => [item.id, item])) as Record<string, AnimationDefinition>)
    emit('animation-deleted', animationId)
    markPendingProjectChange()

    if (animationDef.id !== animationId) return
    restoreAllPreviewTargetsToBase()

    const fallback = remaining[0]
    if (fallback) {
        currentOriginalName.value = fallback.name
        hasActiveAnimation.value = true
        ctx.resetAnimation(fallback)
        ctx.deselectAll()
        warmPreviewBaseStateCache()
        syncRuntimeTrackDuration()
        applyTimeToCanvas(ctx.playheadPosition.value)
    } else {
        hasActiveAnimation.value = false
        currentOriginalName.value = ''
        ctx.resetAnimation(createPlaceholderAnimation())
        warmPreviewBaseStateCache()
    }
}

function handleListCreate(animation: AnimationDefinition) {
    restoreAllPreviewTargetsToBase()
    currentOriginalName.value = animation.name
    hasActiveAnimation.value = true
    ctx.resetAnimation(animation)
    ctx.deselectAll()
    warmPreviewBaseStateCache()
    syncRuntimeTrackDuration()
    applyTimeToCanvas(ctx.playheadPosition.value)
    emit('animation-created', animation)
    markPendingProjectChange()
}

function handlePresetApplied(animation: AnimationDefinition) {
    restoreAllPreviewTargetsToBase()
    currentOriginalName.value = animation.name
    hasActiveAnimation.value = true
    ctx.resetAnimation(animation)
    ctx.deselectAll()
    warmPreviewBaseStateCache()
    syncRuntimeTrackDuration()
    applyTimeToCanvas(ctx.playheadPosition.value)
    emit('preset-applied')
    markPendingProjectChange()
}

// ===== Cleanup =====

onMounted(() => {
    document.addEventListener('pointerdown', closeToolbarPopovers)
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeToolbarPopovers)
    stopStandardWorkbenchPlayback(false)
    restoreAllPreviewTargetsToBase()
    ctx.dispose()
})
</script>

<style scoped>
.animation-workbench-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  background: #f5f6f8;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* Toolbar */
.workbench-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #e0e3e8;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #e0e3e8;
}

.anim-name-input {
  color: #222;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  max-width: 200px;
  transition: border-color 0.2s;
}

.anim-name-input:hover {
  border-color: #d0d3d9;
}

.anim-name-input:focus {
  border-color: #3b82f6;
  background: #fff;
}

.btn-toolbar {
  background: #f0f1f3;
  border: 1px solid #d0d3d9;
  color: #444;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn-toolbar:hover {
  background: #e4e6ea;
}

.btn-toolbar.active {
  color: #2563eb;
  background: #eff6ff;
  border-color: #93c5fd;
}

.btn-toolbar:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.object-tree-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  width: 190px;
  padding: 4px 8px 4px 10px;
}

.object-tree-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-tree-trigger-arrow {
  flex-shrink: 0;
  margin-left: 8px;
  color: #6b7280;
  font-size: 10px;
}

.object-list-popover {
  left: 0;
  right: auto;
}

.pass-through-set-btn {
  color: #2563eb;
}

.icon-toolbar-btn {
  position: relative;
  width: 34px;
  height: 30px;
  padding: 0;
  font-size: 15px;
}

.icon-count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  background: #2563eb;
  border-radius: 999px;
}

.toolbar-popover {
  position: relative;
  display: flex;
  align-items: center;
}

.workbench-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 300px;
  max-width: min(360px, calc(100vw - 24px));
  overflow: hidden;
  background: #fff;
  border: 1px solid #e0e3e8;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  z-index: 40;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.popover-content {
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
}

.popover-empty {
  padding: 18px 12px;
  color: #9ca3af;
  font-size: 12px;
  text-align: center;
}

.object-list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  color: #374151;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.object-list-row:hover {
  background: #f3f4f6;
}

.object-list-row.selected {
  color: #1d4ed8;
  font-weight: 600;
  background: #eff6ff;
}

.tree-toggle,
.tree-spacer {
  width: 16px;
  flex-shrink: 0;
  color: #6b7280;
  font-size: 10px;
  text-align: center;
}

.tree-toggle:hover {
  color: #2563eb;
}

.object-icon {
  width: 18px;
  flex-shrink: 0;
  font-size: 14px;
  text-align: center;
}

.object-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  color: #2563eb;
  font-size: 10px;
  font-weight: 500;
  background: #dbeafe;
  border-radius: 4px;
}

.pass-through-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}

.mini-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #4b5563;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.mini-icon-btn:hover {
  background: #e5e7eb;
}

.mini-icon-btn.muted {
  opacity: 0.5;
}

.mini-icon-btn.danger:hover {
  color: #dc2626;
  background: #fee2e2;
}

.empty-toolbar-hint {
  font-size: 12px;
  color: #888;
}

/* Body */
.workbench-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left panel (list mode) */
.left-panel {
  background: #f9fafb;
  border-right: 1px solid #e0e3e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.left-panel-header {
  justify-content: space-between;
}

.resizer.left-resizer {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.2s;
}

.resizer.left-resizer:hover {
  background: #3b82f6;
}

.expand-left-btn {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  width: 24px;
  height: 48px;
  cursor: pointer;
  font-size: 12px;
  color: #888;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-left-btn:hover {
  background: #f0f1f3;
  color: #444;
}

.canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* Right panel resize / collapse */
.resizer.right-resizer {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  transition: background 0.2s;
}

.resizer.right-resizer:hover {
  background: #3b82f6;
}

.resizer.right-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  left: -2px;
}

.expand-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  width: 24px;
  height: 48px;
  cursor: pointer;
  font-size: 12px;
  color: #888;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-btn:hover {
  background: #f0f1f3;
  color: #444;
}

.right-panel {
  background: #ffffff;
  border-left: 1px solid #e0e3e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.panel-empty-state,
.timeline-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a94a6;
  font-size: 12px;
  padding: 20px;
  text-align: center;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #e0e3e8;
  flex-shrink: 0;
}

.panel-header h3 {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  margin: 0;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
}

.collapse-btn:hover {
  background: #f0f1f3;
  color: #444;
}

/* Save button (in toolbar) */
.btn-save {
  background: #2563eb;
  border: 1px solid #3b82f6;
  color: #fff;
  border-radius: 4px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
}

.btn-save:hover {
  background: #1d4ed8;
}

/* Timeline section: collapse / resize */
.timeline-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  border-top: 1px solid #e0e3e8;
  overflow: hidden;
}

.timeline-empty-state {
  height: 44px;
  border-top: 1px solid #e0e3e8;
  background: #fff;
}



.timeline-resizer {
  height: 4px;
  background: transparent;
  cursor: row-resize;
  flex-shrink: 0;
  transition: background 0.2s;
}

.timeline-resizer:hover {
  background: #3b82f6;
}

.timeline-collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  background: #fff;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.timeline-collapsed-bar:hover {
  background: #f0f1f3;
}

.expand-timeline-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  font-size: 10px;
}

/* ===== 退出确认对话框 ===== */
.close-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.close-confirm-dialog {
  background: #fff;
  border-radius: 8px;
  padding: 24px 28px;
  min-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.close-confirm-msg {
  margin: 0;
  font-size: 14px;
  color: #333;
  text-align: center;
}

.close-confirm-title {
  margin: 0 0 -8px 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  text-align: center;
}

.close-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.close-confirm-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  transition: opacity 0.15s;
}

.btn-cancel-close {
  background: #f0f1f3;
  color: #555;
}

.btn-discard {
  background: #ff4d4f;
  color: #fff;
}

.btn-save-exit {
  background: #1677ff;
  color: #fff;
}

.close-confirm-actions button:hover {
  opacity: 0.85;
}
</style>
