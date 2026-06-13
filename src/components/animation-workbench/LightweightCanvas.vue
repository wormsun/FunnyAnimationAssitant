<!--
  LightweightCanvas.vue — 动画编辑独立画布（v2: 复用 useSceneRenderer 管线）
  
  使用 useSceneRenderer + AnimationSceneObjectStore 实现完全数据隔离，
  渲染、拾取、拖拽逻辑与场景编辑 setup 模式完全一致。
-->
<template>
  <div
    ref="containerRef"
    class="lightweight-canvas"
  >
    <CanvasScrollbars
      v-if="rendererReady && renderer && !props.disableViewportPanZoom"
      :canvas-width="rendererCanvasSize.width"
      :canvas-height="rendererCanvasSize.height"
      :viewport-width="viewportSize.width"
      :viewport-height="viewportSize.height"
      :effective-scale="rendererTransform.scale"
      :pan-x="rendererPanOffset.x"
      :pan-y="rendererPanOffset.y"
      @pan-change="(x: number, y: number) => renderer?.setPanOffset(x, y)"
    />
  </div>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'

import CanvasScrollbars from '@/components/CanvasScrollbars.vue'
import { type SetupChangePayload, useSceneRenderer } from '@/composables/useSceneRenderer'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { type AnimationSceneObjectRuntimeStore,createAnimationSceneObjectStore } from '@/stores/AnimationSceneObjectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import type { WorkbenchPreviewStore } from '@/types/WorkbenchPreviewStore'

// ===== Props & Emits =====

export interface LightweightCanvasProps {
  /** 对象类型 */
  resourceType: 'prop' | 'background' | 'symbol' | 'composite' | 'expression'
  /** 资源引用 ID */
  resourceId: string
  /** 场景对象 ID（场景级入口） */
  sceneObjectId?: string | undefined
  /** composite 子对象目标 ID（编辑子部件变换时） */
  targetObjectId?: string | undefined
  /** 变换点手柄模式：'editable'（默认）或 'readonly'（只读灰色 gizmo） */
  originHandleMode?: 'editable' | 'readonly'
  /**
   * 初始缩放模式：
   *   'zoom-100'（默认）—— 1:1 像素显示，适合主工作台画布；
   *   'fit-content' —— 根据对象包围盒自适应缩放，适合小面板（如 PivotEditorPanel）。
   */
  fitMode?: 'zoom-100' | 'fit-content'
  /**
   * 锁定对象交互：不允许拖拽/缩放/旋转对象本体。
   * 变换点手柄仍然可用。主要用于 PivotEditorPanel。
   */
  lockObjectInteraction?: boolean
  /**
   * 禁用视口 pan/zoom：滚轮、中键/Space 拖拽都不再触发视口移动或缩放。
   * 用于固定视图面板，避免对象被滚动或拖拽带离可视区。
   */
  disableViewportPanZoom?: boolean
}

const props = defineProps<LightweightCanvasProps>()

const emit = defineEmits<{
  'container-ready': [payload: {
    container: PIXI.Container
    partContainers?: Map<string, PIXI.Container>
    objectBounds: { width: number; height: number }
  }]
  'canvas-app-ready': [app: PIXI.Application]
  /** 画布上拖拽/缩放/旋转结束后触发 */
  'setup-change': [payload: SetupChangePayload]
}>()

// ===== Refs =====

const containerRef = ref<HTMLElement | null>(null)
const rendererReady = ref(false)
const viewportSize = ref({ width: 1, height: 1 })
const rendererCanvasSize = computed(() => {
  void rendererReady.value
  return renderer?.canvasSize.value ?? { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
})
const rendererTransform = computed(() => {
  void rendererReady.value
  return renderer?.transformParams.value ?? { scale: 1, offsetX: 0, offsetY: 0 }
})
const rendererPanOffset = computed(() => {
  void rendererReady.value
  return renderer?.panOffset.value ?? { x: 0, y: 0 }
})

// Resolved containers from sceneGraph after rendering
const targetContainer = shallowRef<PIXI.Container | null>(null)
const partContainers = shallowRef<Map<string, PIXI.Container> | null>(null)

// Renderer instance & isolated store
let renderer: ReturnType<typeof useSceneRenderer> | null = null
let baseStoreRef: AnimationSceneObjectRuntimeStore | null = null
let runtimeStoreRef: AnimationSceneObjectRuntimeStore | null = null
let currentRootObjectId: string | null = null
let resizeObserver: ResizeObserver | null = null

// ===== Lifecycle =====

onMounted(async () => {
  await nextTick()
  await initCanvas()
})

// Prop 变更时（例如切换 track 导致 targetObjectId 改变，或场景对象切换），
// 销毁当前渲染器并重新初始化——这是保持画布 + 隔离 store + 选中状态一致的最安全做法。
watch(
  () => [
    props.resourceType,
    props.resourceId,
    props.sceneObjectId ?? '',
    props.targetObjectId ?? '',
  ],
  async (next, prev) => {
    if (!prev) return
    if (next.join('|') === prev.join('|')) return
    destroyCanvas()
    await nextTick()
    await initCanvas()
  },
)

onBeforeUnmount(() => {
  destroyCanvas()
})

// ===== Canvas Init/Destroy =====

async function initCanvas() {
  const el = containerRef.value
  if (!el) return

  // 1. 创建隔离 store（从全局 store 深拷贝目标对象，或构造合成对象）
  const globalStore = useSceneObjectStore()

  let rootObjectId = resolveRootObjectId(globalStore)
  let prebuiltObjects: SceneObject[] | undefined

  if (!rootObjectId) {
    // 资源级预览：当前场景中无此资源的实例，构造合成对象
    const syntheticId = `__anim_preview_${Date.now()}__`
    rootObjectId = syntheticId
    prebuiltObjects = [{
      id: syntheticId,
      type: props.resourceType as SceneObject['type'],
      refId: props.resourceId,
      name: 'preview',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      zIndex: 0,
      width: 0,
      height: 0,
      visible: true,
    } as SceneObject]
  }

  currentRootObjectId = rootObjectId

  const baseStore = createAnimationSceneObjectStore({
    rootObjectId,
    globalStore,
    ...(prebuiltObjects ? { prebuiltObjects } : {}),
  })
  const runtimeStore = createAnimationSceneObjectStore({
    rootObjectId,
    globalStore: baseStore,
    prebuiltObjects: baseStore.cloneObjects(),
    prebuiltRenderChain: baseStore.getSceneRenderChain(),
  })
  baseStoreRef = baseStore
  runtimeStoreRef = runtimeStore

  // 2. 创建 useSceneRenderer，注入隔离 store
  renderer = useSceneRenderer({
    canvasContainer: el,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    mode: 'setup',
    storeOverride: runtimeStore,
    wheelZoomAnchor: 'pointer',
    readonlyOriginHandle: props.originHandleMode === 'readonly',
    lockObjectInteraction: props.lockObjectInteraction === true,
    disableViewportPanZoom: props.disableViewportPanZoom === true,
    onSetupChange: (change) => {
      // 画布拖拽/缩放/旋转结束后，通知父组件将变换写入关键帧
      emit('setup-change', change)
    },
  })

  // 3. 初始化渲染器
  await renderer.initRenderer()
  rendererReady.value = true
  observeCanvasSize(el)

  const pixiApp = renderer.getPixiApp()
  const app = pixiApp.app
  if (!app) {
    console.error('[LightweightCanvas] PixiJS init failed')
    return
  }

  // 4. 隐藏 safe area overlay（动画编辑不需要）
  const safeAreaOverlay = pixiApp.getContext()?.safeAreaOverlay
  if (safeAreaOverlay) {
    safeAreaOverlay.visible = false
  }

  // 5. 禁用自动渲染（等待 renderObjects 完成后再开启）
  renderer.setAutoRenderEnabled(false)

  // 6. 渲染对象
  await renderer.renderObjects()

  // 7. 恢复自动渲染
  renderer.setAutoRenderEnabled(true)

  emit('canvas-app-ready', app)

  // 8. 解析容器并发射 container-ready 事件
  resolveContainersAndEmit()

  // 9. 默认缩放：fit-content 按对象包围盒自适应；zoom-100 为 1:1 像素
  if (props.fitMode === 'fit-content') {
    // 必须等一拍让 PIXI 完成首次渲染，否则 getLocalBounds 可能返回空。
    // 参考 ObjectCollectionPreviewDialog 的 fitContent 流程：用 contentLayer 的
    // local bounds 作为 fit 目标（世界坐标系，未经 stage 缩放），
    // 比在尚未纳入 stage 变换链的 rootContainer.getBounds 更稳定。
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    const pixiCtx = pixiApp.getContext()
    const contentLayer = pixiCtx?.contentLayer
    const bounds = contentLayer?.getLocalBounds()
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      renderer.fitContent({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
    } else {
      renderer.fitAll()
    }
  } else {
    renderer.zoomTo100()
    renderer.scrollToCanvasCenter()
  }

  // 10. 自动选中目标（变换点编辑面板依赖选中态来渲染变换点手柄）：
  //   - 有 targetObjectId（composite 子部件）→ 选中子部件
  //   - 否则选中根对象
  // 注意：lockObjectInteraction 会禁用容器 pointer 事件，因此必须通过 API 主动选中。
  const selectId = props.targetObjectId ?? rootObjectId
  if (selectId) {
    renderer.selectObject(selectId)
  }
}

function destroyCanvas() {
  resizeObserver?.disconnect()
  resizeObserver = null
  rendererReady.value = false
  if (renderer) {
    renderer.destroyRenderer()
    renderer = null
  }
  baseStoreRef = null
  runtimeStoreRef = null
  currentRootObjectId = null
}

function observeCanvasSize(el: HTMLElement) {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    viewportSize.value = {
      width: Math.max(1, el.clientWidth),
      height: Math.max(1, el.clientHeight),
    }
    if (!renderer) return
    const width = viewportSize.value.width
    const height = viewportSize.value.height
    renderer.handleResize(width, height)
    renderer.updateSelectionBox()
    // 强制 PIXI 重绘当前帧，避免侧边栏折叠/展开后场景对象消失
    renderer.getPixiApp().app?.render()
  })
  viewportSize.value = {
    width: Math.max(1, el.clientWidth),
    height: Math.max(1, el.clientHeight),
  }
  resizeObserver.observe(el)
}

// ===== Object ID Resolution =====

/**
 * 从 props 解析需要渲染的根对象 ID。
 * 场景级入口使用 sceneObjectId，否则查找匹配 resourceId 的对象。
 */
function resolveRootObjectId(globalStore: ReturnType<typeof useSceneObjectStore>): string | null {
  if (props.sceneObjectId) {
    return props.sceneObjectId
  }

  // 查找 store 中 refId 匹配的对象
  const obj = globalStore.objects.find(
    o => o.refId === props.resourceId && o.type === props.resourceType,
  )
  return obj?.id ?? null
}

// ===== Container Resolution =====

/**
 * 渲染完成后，从 sceneGraph 获取容器，构造 partContainers map，
 * 然后发射 container-ready 事件。
 */
function resolveContainersAndEmit() {
  if (!renderer || !runtimeStoreRef || !currentRootObjectId) return

  const sceneGraph = renderer.getSceneGraph()
  const rootId = currentRootObjectId

  const rootContainer = sceneGraph.getContainer(rootId)
  if (!rootContainer) {
    console.warn('[LightweightCanvas] Root container not found in sceneGraph:', rootId)
    return
  }

  // 收集 composite 子对象容器（从隔离 store 读取）
  const rootObj = runtimeStoreRef.getObject(rootId)
  const parts = new Map<string, PIXI.Container>()

  if (rootObj?.type === 'composite') {
    collectPartContainers(rootObj as CompositeObject, sceneGraph, runtimeStoreRef, parts)
  }

  targetContainer.value = rootContainer
  partContainers.value = parts.size > 0 ? parts : null

  // 计算包围盒
  const bounds = rootContainer.getLocalBounds()

  emit('container-ready', {
    container: rootContainer,
    ...(parts.size > 0 ? { partContainers: parts } : {}),
    objectBounds: {
      width: bounds.width || 200,
      height: bounds.height || 200,
    },
  })
}

/**
 * 递归收集 composite 的所有子对象容器
 */
function collectPartContainers(
  compositeObj: CompositeObject,
  sceneGraph: ReturnType<ReturnType<typeof useSceneRenderer>['getSceneGraph']>,
  store: { getObject(id: string): SceneObject | undefined },
  parts: Map<string, PIXI.Container>,
) {
  const childIds = compositeObj.childIds ?? []
  for (const childId of childIds) {
    const childContainer = sceneGraph.getContainer(childId)
    if (childContainer) {
      parts.set(childId, childContainer)
    }

    const childObj = store.getObject(childId)
    if (childObj?.type === 'composite') {
      collectPartContainers(childObj as CompositeObject, sceneGraph, store, parts)
    }
  }
}

// ===== Viewport =====

function fitToObject() {
  if (!renderer || !currentRootObjectId) return

  const container = renderer.getSceneGraph().getContainer(currentRootObjectId)
  if (!container) return

  const el = containerRef.value
  if (!el) return

  const bounds = container.getLocalBounds()
  if (bounds.width <= 0 || bounds.height <= 0) return

  const padding = 80
  const scaleX = (el.clientWidth - padding * 2) / bounds.width
  const scaleY = (el.clientHeight - padding * 2) / bounds.height
  const fitZoom = Math.min(scaleX, scaleY, 2)

  renderer.setZoomLevel(fitZoom)
  renderer.scrollToCanvasCenter()
}

// ===== Expose =====

defineExpose({
  get app() { return renderer?.getPixiApp().app ?? null },
  get contentLayer() { return renderer?.getPixiApp().getContext()?.contentLayer ?? null },
  targetContainer,
  partContainers,
  fitToObject,
  /** 获取底层 renderer 实例 */
  get renderer() { return renderer },
  /** 获取隔离 sceneGraph */
  get sceneGraph() { return renderer?.getSceneGraph() ?? null },
  /**
   * 获取预览 store（窄接口）。
   * 本 getter 只暴露 WorkbenchPreviewStore 定义的 5 项能力；底层仍是
   * AnimationSceneObjectStore 返回的 reactive 实例，因此 objects / selectedObjectId
   * 作为响应式字段直接在 computed 中访问即可。
   */
  get previewStore(): WorkbenchPreviewStore | null { return runtimeStoreRef as WorkbenchPreviewStore | null },
  get baseStore(): WorkbenchPreviewStore | null { return baseStoreRef as WorkbenchPreviewStore | null },
  resetRuntimeFromBase() {
    if (!baseStoreRef || !runtimeStoreRef) return
    runtimeStoreRef.replaceObjects(baseStoreRef.cloneObjects(), baseStoreRef.getSceneRenderChain())
  },
})
</script>

<style scoped>
.lightweight-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  cursor: default;
  background: #e8eaee;
}

.lightweight-canvas canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
