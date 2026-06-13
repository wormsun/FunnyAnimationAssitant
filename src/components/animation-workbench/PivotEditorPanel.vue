<!--
  PivotEditorPanel.vue — 变换点可视化编辑面板

  设计要点（由 Phase 3 PRD 锁定）：
  1. 使用独立 PIXI 子 app（复用 LightweightCanvas + useSceneRenderer），不与主画布共享状态；
  2. 仅显示目标对象本身（无父级上下文）；
  3. 对象处于"裸姿态"——不应用任何动画评估，便于用户精确定位变换点；
  4. 画布上的橙色变换点手柄是可拖拽的；主画布上的同手柄为灰色只读 gizmo。

  数据流：
  用户拖动 → LightweightCanvas 内部 useSceneRenderer(mode='setup', storeOverride=隔离 store)
           → onSetupChange(type='origin', pivot)
           → 本组件 emit('pivot-change', pivot)
           → 父组件（AnimationWorkbench）做逐关键帧补偿 + ctx.updatePivot
-->
<template>
  <div class="pivot-editor-panel">
    <div class="header">
      <span class="title">变换点编辑</span>
      <button
        v-if="canReset"
        type="button"
        class="reset-btn"
        title="恢复默认变换点"
        @click="onResetClick"
      >
        重置
      </button>
    </div>
    <div class="canvas-wrap">
      <LightweightCanvas
        ref="panelCanvasRef"
        :resource-type="resourceType"
        :resource-id="resourceId"
        :scene-object-id="sceneObjectId"
        :target-object-id="targetObjectId"
        origin-handle-mode="editable"
        fit-mode="fit-content"
        :lock-object-interaction="true"
        :disable-viewport-pan-zoom="true"
        @container-ready="applyEffectivePivotToPanel"
        @setup-change="onPanelSetupChange"
      />
    </div>
    <p class="hint">
      拖动橙色十字可调整变换点；{{ pivotSetHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { SetupChangePayload, useSceneRenderer } from '@/composables/useSceneRenderer'
import type { WorkbenchPreviewStore } from '@/types/WorkbenchPreviewStore'

import LightweightCanvas from './LightweightCanvas.vue'

export interface PivotEditorPanelProps {
    resourceType: 'prop' | 'background' | 'symbol' | 'composite' | 'expression'
    resourceId: string
  sceneObjectId?: string | undefined
    /** 当前 active track 的 targetObjectId——决定面板编辑哪个子对象 */
  targetObjectId?: string | undefined
    /** 当前 track.pivot 是否已被显式设置（决定是否显示"重置"按钮） */
    hasPivotSet: boolean
    /** 当前轨道正在使用的有效 pivot（自定义 pivot 或对象默认 pivot），像素本地坐标。 */
    effectivePivot: { x: number; y: number }
}

const props = defineProps<PivotEditorPanelProps>()

const emit = defineEmits<{
    /**
     * 用户在面板画布上拖拽变换点结束时触发。
     * payload 携带的是对象本地坐标系的像素值，与 track.pivot / container.pivot 同坐标系。
     */
    'pivot-change': [pivot: { x: number; y: number }, objectId: string]
    /** 用户点击"重置"按钮——将 track.pivot 清除为默认值。 */
    'pivot-reset': []
}>()

const panelCanvasRef = ref<InstanceType<typeof LightweightCanvas> | null>(null)

const canReset = computed(() => props.hasPivotSet)
const pivotSetHint = computed(() =>
    props.hasPivotSet ? '已设定自定义变换点' : '当前使用对象默认变换点'
)

watch(
    () => [props.effectivePivot.x, props.effectivePivot.y, props.sceneObjectId, props.targetObjectId] as const,
    () => {
        void nextTick(() => applyEffectivePivotToPanel())
    },
    { immediate: true },
)

function resolvePanelObjectId(): string | undefined {
    return props.targetObjectId ?? props.sceneObjectId
}

/**
 * LightweightCanvas 通过 defineExpose 暴露的 getter 属性，
 * Vue 的 InstanceType 推断会将其标注为 error 类型。
 * 此处显式声明窄接口以保证类型安全。
 */
interface LightweightCanvasExposed {
    renderer: ReturnType<typeof useSceneRenderer> | null
    previewStore: WorkbenchPreviewStore | null
    sceneGraph: ReturnType<ReturnType<typeof useSceneRenderer>['getSceneGraph']> | null
}

function applyEffectivePivotToPanel(): void {
    const panel = panelCanvasRef.value as LightweightCanvasExposed | null
    const renderer = panel?.renderer
    const store = panel?.previewStore
    const sceneGraph = panel?.sceneGraph
    const objectId = resolvePanelObjectId()
    if (!renderer || !store || !sceneGraph || !objectId) return

    const obj = store.getObject(objectId)
    const container = sceneGraph.getContainer(objectId)
    if (!obj || !container || container.destroyed) return

    const currentOriginX = obj.transformOriginX ?? 0
    const currentOriginY = obj.transformOriginY ?? 0
    const pivotBaseX = container.pivot.x - currentOriginX
    const pivotBaseY = container.pivot.y - currentOriginY
    const nextOriginX = props.effectivePivot.x - pivotBaseX
    const nextOriginY = props.effectivePivot.y - pivotBaseY

    if (
        Math.abs(currentOriginX - nextOriginX) < 0.001 &&
        Math.abs(currentOriginY - nextOriginY) < 0.001
    ) {
        renderer.selectObject(objectId)
        renderer.updateSelectionBox()
        return
    }

    // 这里写入的是面板内部隔离 store，仅用于定位小画布 gizmo；
    // track.pivot 的持久化与主画布 runtime 同步由 AnimationWorkbench 处理。
    store.updateObject(objectId, {
        transformOriginX: nextOriginX,
        transformOriginY: nextOriginY,
    })
    renderer.syncObjectFromStore(objectId)
    renderer.selectObject(objectId)
    renderer.updateSelectionBox()
}

function onPanelSetupChange(change: SetupChangePayload): void {
    if (change.type !== 'origin') {
        // 面板仅关心变换点编辑；对象整体的 transform 变更由主画布处理。
        // 这里忽略即可，面板用户不期望在小窗里做整体拖拽。
        return
    }
    emit('pivot-change', { x: change.pivot.x, y: change.pivot.y }, change.objectId)
}

function onResetClick(): void {
    emit('pivot-reset')
}
</script>

<style scoped>
.pivot-editor-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: #1e1e1e;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.title {
    font-size: 12px;
    color: #ddd;
    font-weight: 600;
}

.reset-btn {
    font-size: 11px;
    padding: 2px 8px;
    background: #2a2a2a;
    color: #ddd;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
}

.reset-btn:hover {
    background: #3a3a3a;
    color: #fff;
}

.canvas-wrap {
    position: relative;
    width: 100%;
    height: 200px;
    background: #111;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    overflow: hidden;
}

.canvas-wrap :deep(.lightweight-canvas) {
    width: 100%;
    height: 100%;
}

.hint {
    font-size: 11px;
    color: #888;
    margin: 0;
    line-height: 1.4;
}
</style>
