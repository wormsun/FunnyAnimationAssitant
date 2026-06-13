<!--
  AnimationTimeline.vue — 底部时间轴组件（HTML Canvas 渲染）
  
  v5.0: 轨道行模式 — 一行一条 Track（Adobe Animate 风格）
  - 时间刻度尺 + 播放头（可拖拽 Scrub）
  - 轨道行：每行一条 AnimationTrack，左侧显示目标名+轨道类型
  - transform / visibility: ◆ 关键帧菱形
  - frame_sequence / effect: 整条色带
  - 关键帧交互：单击选中/拖拽改时间/多选/删除
  - 播放控制条：⏮ ▶/⏸ ⏭ | 时间显示 | 循环
-->
<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div ref="rootRef" class="animation-timeline" tabindex="0" @contextmenu.prevent="onContextMenu">
    <!-- 播放控制栏 -->
    <div class="timeline-controls">
      <div class="controls-left">
        <button class="btn-ctrl" title="上一帧 (←)" @click="ctx.seekPrevKeyframe()">⏮</button>
        <button class="btn-ctrl btn-play" :title="ctx.isPlaying.value ? '暂停 (Space)' : '播放 (Space)'" @click="ctx.togglePlay()">
          {{ ctx.isPlaying.value ? '⏸' : '▶' }}
        </button>
        <button class="btn-ctrl" title="下一帧 (→)" @click="ctx.seekNextKeyframe()">⏭</button>
        <span class="time-label">
          {{ formatTimeMs(ctx.playheadPosition.value * ctx.trackDuration.value) }}
          / {{ ctx.trackDuration.value }}ms
        </span>
        <span class="progress-label">{{ Math.round(ctx.playheadPosition.value * 100) }}%</span>
        <span class="control-divider" />
        <label class="preview-range-label">
          预览
          <select :value="previewMode" class="preview-range-select" @change="onPreviewModeChange">
            <option value="current">当前轨道</option>
            <option value="all">全部轨道</option>
            <option value="custom">选择轨道...</option>
          </select>
        </label>
        <button
          v-if="previewMode === 'custom'"
          class="btn-ctrl"
          title="选择参与预览的轨道"
          @click="showPreviewPicker = !showPreviewPicker"
        >
          {{ previewTrackIndexes.length }} 条
        </button>
      </div>
      <div class="track-toolbar">
        <div class="track-toolbar-title">轨道</div>
        <div class="add-track-dropdown-wrap">
          <button class="btn-track-add" title="新增轨道" @click="showAddTrackMenu = !showAddTrackMenu">+ 新增</button>
          <div v-if="showAddTrackMenu" class="add-track-menu">
            <button class="add-track-menu-item" @click="onAddTrackType('transform')">
              <span class="add-track-dot" style="background:#3B82F6" />变换
            </button>
            <button class="add-track-menu-item" @click="onAddTrackType('visibility')">
              <span class="add-track-dot" style="background:#22C55E" />透明度
            </button>
            <button class="add-track-menu-item" @click="onAddTrackType('effect')">
              <span class="add-track-dot" style="background:#A855F7" />特效
            </button>
            <button class="add-track-menu-item" @click="onAddTrackType('frame_sequence')">
              <span class="add-track-dot" style="background:#9CA3AF" />帧序列
            </button>
          </div>
        </div>
        <template v-if="hasSelectedTrack">
          <span class="toolbar-sep" />
          <button class="btn-track-tool" title="在右侧编辑轨道" @click="onToolbarFocusTrack">📝 编辑</button>
          <button class="btn-track-tool" title="复制轨道" @click="onToolbarDuplicateTrack">📋 复制</button>
          <button class="btn-track-tool danger" title="删除轨道" @click="onToolbarDeleteTrack">删除</button>
        </template>
        <template v-if="hasKeyframableTrack">
          <span class="toolbar-sep" />
          <div class="track-toolbar-title">关键帧</div>
          <button
            class="btn-track-tool"
            title="在播放头位置添加关键帧"
            @click="onToolbarAddKeyframe"
          >+ 添加</button>
          <button
            class="btn-track-tool"
            title="复制当前选中关键帧 (Ctrl+C)"
            :disabled="!hasSelectedKeyframe"
            @click="onToolbarCopyKeyframe"
          >📋 复制</button>
          <button
            class="btn-track-tool"
            title="将当前选中关键帧直接复制到播放头"
            :disabled="!canDuplicateSelectedKeyframe"
            @click="onToolbarDuplicateKeyframe"
          >📑 复制到此处</button>
          <button
            class="btn-track-tool"
            title="粘贴关键帧到播放头 (Ctrl+V)"
            :disabled="!canPasteKeyframeToCurrentTrack"
            @click="onToolbarPasteKeyframe"
          >📌 粘贴</button>
          <button
            class="btn-track-tool danger"
            title="删除当前选中关键帧"
            :disabled="!canDeleteSelectedKeyframe"
            @click="onToolbarDeleteKeyframe"
          >删除帧</button>
        </template>
        <div v-if="showPreviewPicker" class="preview-picker">
          <div class="preview-picker-actions">
            <button @click="selectAllPreviewTracks">全选</button>
            <button @click="clearPreviewTracks">清空</button>
            <button @click="selectCurrentPreviewTrack">仅当前</button>
          </div>
          <label
            v-for="{ track, index } in ctx.allTracks.value"
            :key="index"
            class="preview-track-option"
          >
            <input
              type="checkbox"
              :checked="previewTrackIndexes.includes(index)"
              @change="onPreviewTrackToggle(index, $event)"
            >
            <span class="preview-track-dot" :style="{ background: TRACK_COLORS[track.trackType] }" />
            <span>{{ getTrackDisplayName(track) }}</span>
          </label>
        </div>
      </div>
      <div class="controls-right">
        <button class="btn-ctrl btn-collapse" title="折叠时间轴" @click="emit('collapse')">▾</button>
      </div>
    </div>

    <!-- 时间轴画布 -->
    <div ref="canvasWrapRef" class="timeline-canvas-wrap">
      <canvas
        ref="canvasRef"
        @pointerdown="onPointerDown"
        @pointermove="onCanvasHover"
        @mouseleave="resetCanvasCursor"
        @dblclick="onDblClick"
      />
    </div>
    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuRef"
        class="timeline-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <div v-if="contextMenuCanAddKeyframe || contextMenuHasKeyframe || contextMenuCanPasteKeyframe" class="context-menu-group">
          <div class="context-menu-title">关键帧</div>
          <button
            v-if="contextMenuCanAddKeyframe"
            class="context-menu-item"
            @click="onContextAddKeyframe"
          >添加关键帧</button>
          <button
            v-if="contextMenuCanCopyKeyframe"
            class="context-menu-item"
            @click="onContextCopyKeyframe"
          >复制关键帧</button>
          <button
            v-if="contextMenuCanPasteKeyframe"
            class="context-menu-item"
            @click="onContextPasteKeyframe"
          >粘贴关键帧</button>
          <button
            v-if="contextMenuCanSplitKeyframe"
            class="context-menu-item"
            @click="onContextSplitKeyframe"
          >改为瞬变帧</button>
          <button
            v-if="contextMenuCanMergeKeyframe"
            class="context-menu-item"
            @click="onContextMergeKeyframe"
          >改为平滑帧</button>
          <button
            v-if="contextMenuHasKeyframe"
            class="context-menu-item danger"
            :disabled="!contextMenuCanDeleteKeyframe"
            @click="onContextDeleteKeyframe"
          >删除关键帧</button>
        </div>
        <span v-if="contextMenuCanAddKeyframe || contextMenuHasKeyframe || contextMenuCanPasteKeyframe" class="context-menu-divider" />
        <div class="context-menu-group">
          <div class="context-menu-title">轨道</div>
          <button class="context-menu-item" @click="onContextFocusTrack">编辑轨道</button>
          <button
            v-if="contextMenuCanDuplicateTrack"
            class="context-menu-item"
            @click="onContextDuplicateTrack"
          >复制轨道</button>
          <button
            v-if="contextMenuCanDeleteTrack"
            class="context-menu-item danger"
            @click="onContextDeleteTrack"
          >删除轨道</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- ctx is an intentional shared mutable context object */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AnimationEditContext } from '@/composables/useAnimationEdit'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type {
  AnimationTrack,
  AnimationTrackType,
  TransformKeyframe,
  VisibilityKeyframe,
} from '@/types/animation'
import type { SceneObject } from '@/types/sceneObject'

import { resolveTrackTargetDisplay } from './trackDisplay'

type PreviewMode = 'current' | 'all' | 'custom'

interface TimelineContextMenuState {
  x: number
  y: number
  trackIndex: number
  keyframeIndex: number | null
  time: number
  /** true 表示未直接命中轨道/关键帧，由回退选中的轨道提供上下文时为 true 。 */
  fromFallback: boolean
}

const props = defineProps<{
  ctx: AnimationEditContext
  sceneObject?: SceneObject | undefined
  previewMode: PreviewMode
  previewTrackIndexes: number[]
}>()
const emit = defineEmits<{
  collapse: []
  'update:preview-mode': [mode: PreviewMode]
  'update:preview-track-indexes': [indexes: number[]]
  'add-track': [trackType: AnimationTrackType]
  'duplicate-track': [trackIndex: number]
  'delete-track': [trackIndex: number]
  'focus-track': [trackIndex: number]
  'track-selected': [trackIndex: number]
}>()

// ===== Refs =====
const rootRef = ref<HTMLElement | null>(null)
const canvasWrapRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const sceneObjectStore = useSceneObjectStore()

// ===== Layout Constants =====
const RULER_HEIGHT = 24
const ROW_HEIGHT = 36
const DIAMOND_SIZE = 7
const PLAYHEAD_WIDTH = 2
const LEFT_LABEL_WIDTH = 176
const TRACK_EDGE_PADDING = 10

// ===== Track Type Visual Config =====
const TRACK_COLORS: Record<AnimationTrackType, string> = {
  transform: '#3B82F6',
  visibility: '#22C55E',
  frame_sequence: '#9CA3AF',
  effect: '#A855F7',
}

const TRACK_LABELS: Record<AnimationTrackType, string> = {
  transform: '变换',
  visibility: '透明度',
  frame_sequence: '帧序列',
  effect: '特效',
}

const CONTEXT_MENU_GAP = 8

// ===== Canvas State =====
let canvasWidth = 0
let canvasHeight = 0
let dpr = 1

// Interaction state
let interactionMode: 'none' | 'scrub' | 'drag-keyframe' = 'none'
let dragTrackIndex = -1
let dragKeyframeIndex = -1

// Selected keyframes (for multi-select)
const selectedKeyframes = ref<Set<number>>(new Set())

// 预览轨道选择器浮层
const showPreviewPicker = ref(false)

// 新增轨道下拉菜单
const showAddTrackMenu = ref(false)
const contextMenu = ref<TimelineContextMenuState | null>(null)

function onAddTrackType(trackType: AnimationTrackType) {
  showAddTrackMenu.value = false
  emit('add-track', trackType)
}

// ===== 工具栏：选中轨道派生状态 =====
const hasSelectedTrack = computed(() => props.ctx.currentTrackIndex.value >= 0)
const hasKeyframableTrack = computed(() => {
  const track = props.ctx.currentTrackAny.value
  return !!track && isKeyframable(track.trackType)
})
const hasSelectedKeyframe = computed(() =>
  hasKeyframableTrack.value && props.ctx.selectedKeyframeIndex.value >= 0,
)
const canDuplicateSelectedKeyframe = computed(() => props.ctx.canDuplicateKeyframeToPlayhead())
const canPasteKeyframeToCurrentTrack = computed(() => props.ctx.canPasteKeyframeToCurrentTrack())
const canDeleteSelectedKeyframe = computed(() => {
  if (!hasSelectedKeyframe.value) return false
  const track = props.ctx.currentTrackAny.value
  if (!track) return false
  return getTrackKeyframes(track).length > 2
})
const contextMenuTrack = computed(() => {
  const menu = contextMenu.value
  if (!menu) return null
  return props.ctx.allTracks.value.find(item => item.index === menu.trackIndex)?.track ?? null
})
const contextMenuCanAddKeyframe = computed(() => {
  const track = contextMenuTrack.value
  if (!track || !isKeyframable(track.trackType)) return false
  // 回退菜单（未直接命中轨道行）时，隐藏添加关键帧（使用轨道上的点可能不是用户预期的位置）。
  return !contextMenu.value?.fromFallback
})
const contextMenuHasKeyframe = computed(() => contextMenu.value?.keyframeIndex != null)
const contextMenuCanCopyKeyframe = computed(() => contextMenuHasKeyframe.value)
const contextMenuCanDeleteKeyframe = computed(() => {
  const track = contextMenuTrack.value
  const keyframeIndex = contextMenu.value?.keyframeIndex
  return !!track && keyframeIndex !== null && keyframeIndex !== undefined && getTrackKeyframes(track).length > 2
})
const contextMenuKeyframeIsSplit = computed(() => {
  const track = contextMenuTrack.value
  const idx = contextMenu.value?.keyframeIndex
  if (!track || idx == null) return false
  const kf = getTrackKeyframes(track)[idx]
  return !!kf?.out && Object.keys(kf.out).length > 0
})
const contextMenuCanSplitKeyframe = computed(() => {
  const track = contextMenuTrack.value
  if (!track) return false
  // 仅 transform / visibility 支持拆分
  if (track.trackType !== 'transform' && track.trackType !== 'visibility') return false
  return contextMenuHasKeyframe.value && !contextMenuKeyframeIsSplit.value
})
const contextMenuCanMergeKeyframe = computed(() =>
  contextMenuHasKeyframe.value && contextMenuKeyframeIsSplit.value,
)
// 粘贴关键帧：剪贴板非空 + 上下文轨道可承载关键帧 + 非回退菜单
const contextMenuCanPasteKeyframe = computed(() => {
  if (contextMenu.value?.fromFallback) return false
  const track = contextMenuTrack.value
  if (!track || !isKeyframable(track.trackType)) return false
  return props.ctx.keyframeClipboardType.value === track.trackType
})
// 回退菜单时隐藏所有破坏性/状态性的轨道操作，避免对非预期轨道执行删除/复制等动作。
const contextMenuCanDeleteTrack = computed(() => !contextMenu.value?.fromFallback)
const contextMenuCanDuplicateTrack = computed(() => !contextMenu.value?.fromFallback)

// ===== Helpers =====

function formatTimeMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const rem = Math.round(ms % 1000)
  return `${s.toString().padStart(2, '0')}:${rem.toString().padStart(3, '0')}`
}

function getTargetLabel(track: AnimationTrack): string {
  if (track.displayName?.trim()) return track.displayName.trim()
  return resolveTrackTargetDisplay({
    track,
    sceneObject: props.sceneObject,
    getObjectName,
  }).primary
}

function getTrackDisplayName(track: AnimationTrack): string {
  const secondary = getTargetSecondaryLabel(track)
  return secondary
    ? `${getTargetLabel(track)} · ${getTrackTypeLabel(track)} · ${secondary}`
    : `${getTargetLabel(track)} · ${getTrackTypeLabel(track)}`
}

function onPreviewModeChange(e: Event) {
  const mode = (e.target as HTMLSelectElement).value as PreviewMode
  emit('update:preview-mode', mode)
  if (mode === 'current') selectCurrentPreviewTrack()
  if (mode === 'all') selectAllPreviewTracks()
  if (mode === 'custom') showPreviewPicker.value = true
}

function onPreviewTrackToggle(trackIndex: number, e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  const next = new Set(props.previewTrackIndexes)
  if (checked) next.add(trackIndex)
  else next.delete(trackIndex)
  emit('update:preview-track-indexes', [...next].sort((a, b) => a - b))
}

function selectAllPreviewTracks() {
  emit('update:preview-track-indexes', props.ctx.allTracks.value.map(item => item.index))
}

function clearPreviewTracks() {
  emit('update:preview-track-indexes', [])
}

function selectCurrentPreviewTrack() {
  const idx = props.ctx.currentTrackIndex.value
  emit('update:preview-track-indexes', idx >= 0 ? [idx] : [])
}

function getTargetSecondaryLabel(track: AnimationTrack): string | undefined {
  return resolveTrackTargetDisplay({
    track,
    sceneObject: props.sceneObject,
    getObjectName,
  }).secondary
}

function getTrackTypeLabel(track: AnimationTrack): string {
  if (track.trackType === 'effect') {
    const effectTrack = track
    return `特效:${effectTrack.effectParams.type}`
  }
  return TRACK_LABELS[track.trackType] ?? track.trackType
}

function getObjectName(objectId: string): string | undefined {
  const object = sceneObjectStore.getObject(objectId)
  return object?.alias?.trim() || object?.name?.trim() || undefined
}

function drawTruncatedText(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  if (maxWidth <= 0) return
  if (c.measureText(text).width <= maxWidth) {
    c.fillText(text, x, y)
    return
  }

  const ellipsis = '...'
  let truncated = text
  while (truncated.length > 0 && c.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  c.fillText((truncated || text[0] || '') + ellipsis, x, y)
}

function isKeyframable(trackType: AnimationTrackType): boolean {
  return trackType === 'transform' || trackType === 'visibility'
}

/** Get the keyframes array from a keyframable track */
function getTrackKeyframes(track: AnimationTrack): (TransformKeyframe | VisibilityKeyframe)[] {
  if (track.trackType === 'transform') return (track).keyframes
  if (track.trackType === 'visibility') return (track).keyframes
  return []
}

function getTrackDrawBounds() {
  const startX = LEFT_LABEL_WIDTH + TRACK_EDGE_PADDING
  const endX = Math.max(startX, canvasWidth - TRACK_EDGE_PADDING)
  return { startX, endX, width: Math.max(0, endX - startX) }
}

/** Convert a normalized time (0-1) to canvas pixel X */
function timeToX(time: number): number {
  const { startX, width } = getTrackDrawBounds()
  return startX + time * width
}

/** Convert canvas pixel X to normalized time (0-1) */
function xToTime(x: number): number {
  const { startX, width: trackWidth } = getTrackDrawBounds()
  if (trackWidth <= 0) return 0
  return Math.max(0, Math.min(1, (x - startX) / trackWidth))
}

/** Get the track row index from a Y coordinate */
function yToTrackIndex(y: number): number {
  if (y < RULER_HEIGHT) return -1
  const idx = Math.floor((y - RULER_HEIGHT) / ROW_HEIGHT)
  const trackCount = props.ctx.allTracks.value.length
  return idx >= 0 && idx < trackCount ? idx : -1
}

// ===== Canvas Rendering =====

function resizeCanvas() {
  const canvas = canvasRef.value
  const wrap = canvasWrapRef.value
  if (!canvas || !wrap) return

  dpr = window.devicePixelRatio || 1
  // 使用 canvas 自身的 rect 而非 wrap 的 rect，
  // 因为 wrap 的 scrollbar-gutter: stable both-edges 会在两侧预留 gutter 空间，
  // 导致 wrap.width > canvas.width，使绘图坐标系与 getCanvasPos 的点击坐标系产生偏移。
  const rect = canvas.getBoundingClientRect()
  canvasWidth = rect.width
  const trackCount = Math.max(1, props.ctx.allTracks.value.length)
  canvasHeight = RULER_HEIGHT + trackCount * ROW_HEIGHT + 4
  canvas.width = canvasWidth * dpr
  canvas.height = canvasHeight * dpr
  canvas.style.width = '100%'
  canvas.style.height = `${canvasHeight}px`
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const c = canvas.getContext('2d')
  if (!c) return

  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, canvasWidth, canvasHeight)

  drawRuler(c)
  drawTrackRows(c)
  drawPlayhead(c)
}

function drawRuler(c: CanvasRenderingContext2D) {
  const y = RULER_HEIGHT
  const { startX, endX, width: trackW } = getTrackDrawBounds()

  // Ruler background
  c.fillStyle = '#f0f1f3'
  c.fillRect(0, 0, canvasWidth, RULER_HEIGHT)

  // Ticks
  c.strokeStyle = '#c0c4cc'
  c.lineWidth = 1
  c.fillStyle = '#888'
  c.font = '9px monospace'
  c.textAlign = 'center'

  // Major ticks at 0%, 25%, 50%, 75%, 100%
  for (let pct = 0; pct <= 100; pct += 25) {
    const x = startX + (pct / 100) * trackW
    c.textAlign = pct === 0 ? 'left' : pct === 100 ? 'right' : 'center'
    c.beginPath()
    c.moveTo(x, RULER_HEIGHT - 10)
    c.lineTo(x, RULER_HEIGHT)
    c.stroke()
    c.fillText(`${pct}%`, x, RULER_HEIGHT - 12)
  }
  c.textAlign = 'center'

  // Minor ticks at 5% intervals
  for (let pct = 0; pct <= 100; pct += 5) {
    if (pct % 25 === 0) continue
    const x = startX + (pct / 100) * trackW
    c.beginPath()
    c.moveTo(x, RULER_HEIGHT - 5)
    c.lineTo(x, RULER_HEIGHT)
    c.stroke()
  }

  // Bottom line
  c.beginPath()
  c.moveTo(startX, y)
  c.lineTo(endX, y)
  c.stroke()
}

function drawTrackRows(c: CanvasRenderingContext2D) {
  const tracks = props.ctx.allTracks.value
  const currentIdx = props.ctx.currentTrackIndex.value
  const selectedKfIdx = props.ctx.selectedKeyframeIndex.value
  const labelTextWidth = LEFT_LABEL_WIDTH - 20

  tracks.forEach(({ track, index: trackIdx }, rowIdx) => {
    const y = RULER_HEIGHT + rowIdx * ROW_HEIGHT
    const color = TRACK_COLORS[track.trackType]
    const isSelected = trackIdx === currentIdx

    // Row background
    if (isSelected) {
      c.fillStyle = 'rgba(37,99,235,0.06)'
    } else {
      c.fillStyle = rowIdx % 2 === 0 ? '#fafbfc' : '#f4f5f7'
    }
    c.fillRect(0, y, canvasWidth, ROW_HEIGHT)

    // Track color indicator (left strip)
    c.fillStyle = color
    c.fillRect(0, y, 3, ROW_HEIGHT)

    // Label area: two-line (mapped part/object + track type)
    c.textAlign = 'left'
    const targetLabel = getTargetLabel(track)
    const targetSecondary = getTargetSecondaryLabel(track)
    c.font = '600 10px sans-serif'
    c.fillStyle = '#555'
    drawTruncatedText(c, targetLabel, 8, y + 14, labelTextWidth)
    c.fillStyle = '#999'
    c.font = '9px sans-serif'
    const secondaryLine = targetSecondary
      ? `${getTrackTypeLabel(track)} · ${targetSecondary}`
      : getTrackTypeLabel(track)
    drawTruncatedText(c, secondaryLine, 8, y + 28, labelTextWidth)
    c.textAlign = 'left'

    // Row separator
    c.strokeStyle = '#e0e3e8'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(LEFT_LABEL_WIDTH, y + ROW_HEIGHT)
    c.lineTo(canvasWidth, y + ROW_HEIGHT)
    c.stroke()

    // Draw keyframes or color bar
    if (isKeyframable(track.trackType)) {
      drawTrackKeyframes(c, track, y, color, isSelected, trackIdx === currentIdx ? selectedKfIdx : -1)
    } else {
      drawTrackBar(c, y, color)
    }
  })

  // Left label area separator
  c.strokeStyle = '#d0d3d9'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(LEFT_LABEL_WIDTH, RULER_HEIGHT)
  c.lineTo(LEFT_LABEL_WIDTH, RULER_HEIGHT + tracks.length * ROW_HEIGHT)
  c.stroke()
}

function drawTrackKeyframes(
  c: CanvasRenderingContext2D,
  track: AnimationTrack,
  rowY: number,
  color: string,
  _isSelectedTrack: boolean,
  activeKfIdx: number,
) {
  const keyframes = getTrackKeyframes(track)
  const centerY = rowY + ROW_HEIGHT / 2

  keyframes.forEach((kf, kfIdx) => {
    const x = timeToX(kf.time)
    const isSelected = kfIdx === activeKfIdx || selectedKeyframes.value.has(kfIdx)
    const isSplit = !!kf.out && Object.keys(kf.out).length > 0

    const fill = isSelected ? '#2563eb' : color
    const stroke = isSelected ? '#1d4ed8' : color

    if (isSplit) {
      // 拆分关键帧：左半菱形 = valueIn，右半菱形 = valueOut（deeper 色）
      // 左半（valueIn）
      c.beginPath()
      c.moveTo(x, centerY - DIAMOND_SIZE)
      c.lineTo(x, centerY + DIAMOND_SIZE)
      c.lineTo(x - DIAMOND_SIZE, centerY)
      c.closePath()
      c.fillStyle = fill
      c.fill()
      if (isSelected) {
        c.strokeStyle = stroke
        c.lineWidth = 1.5
        c.stroke()
      }
      // 右半（valueOut，用稍深颜色叠加透明度以示区分）
      c.beginPath()
      c.moveTo(x, centerY - DIAMOND_SIZE)
      c.lineTo(x + DIAMOND_SIZE, centerY)
      c.lineTo(x, centerY + DIAMOND_SIZE)
      c.closePath()
      c.fillStyle = isSelected ? '#1d4ed8' : darkenColor(color)
      c.fill()
      if (isSelected) {
        c.strokeStyle = stroke
        c.lineWidth = 1.5
        c.stroke()
      }
      // 中间分隔线
      c.beginPath()
      c.moveTo(x, centerY - DIAMOND_SIZE)
      c.lineTo(x, centerY + DIAMOND_SIZE)
      c.strokeStyle = '#ffffff'
      c.lineWidth = 1
      c.stroke()
      return
    }

    // Diamond ◆
    c.beginPath()
    c.moveTo(x, centerY - DIAMOND_SIZE)
    c.lineTo(x + DIAMOND_SIZE, centerY)
    c.lineTo(x, centerY + DIAMOND_SIZE)
    c.lineTo(x - DIAMOND_SIZE, centerY)
    c.closePath()

    if (isSelected) {
      c.fillStyle = '#2563eb'
      c.strokeStyle = '#1d4ed8'
      c.lineWidth = 1.5
      c.fill()
      c.stroke()
    } else {
      c.fillStyle = color
      c.fill()
    }
  })
}

/** 将色值(#RRGGBB)加深 ~20% 用作 valueOut 半侧的视觉区分 */
function darkenColor(hex: string): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 50)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 50)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 50)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function drawTrackBar(c: CanvasRenderingContext2D, rowY: number, color: string) {
  const barY = rowY + ROW_HEIGHT / 2 - 4
  const barX = LEFT_LABEL_WIDTH + 4
  const barW = canvasWidth - LEFT_LABEL_WIDTH - 8

  c.fillStyle = color + '33' // 20% alpha
  c.fillRect(barX, barY, barW, 8)
  c.strokeStyle = color + '88'
  c.lineWidth = 1
  c.strokeRect(barX, barY, barW, 8)
}

function drawPlayhead(c: CanvasRenderingContext2D) {
  const x = timeToX(props.ctx.playheadPosition.value)
  const trackCount = props.ctx.allTracks.value.length
  const totalH = RULER_HEIGHT + trackCount * ROW_HEIGHT

  // Vertical line
  c.strokeStyle = '#f44336'
  c.lineWidth = PLAYHEAD_WIDTH
  c.beginPath()
  c.moveTo(x, 0)
  c.lineTo(x, totalH)
  c.stroke()

  // Top triangle
  c.fillStyle = '#f44336'
  c.beginPath()
  c.moveTo(x - 5, 0)
  c.lineTo(x + 5, 0)
  c.lineTo(x, 8)
  c.closePath()
  c.fill()
}

// ===== Hit Testing =====

function hitTestKeyframe(px: number, py: number): { trackIndex: number; kfIndex: number } | null {
  const tracks = props.ctx.allTracks.value
  const hitRadius = DIAMOND_SIZE + 3

  for (let rowIdx = tracks.length - 1; rowIdx >= 0; rowIdx--) {
    const { track, index: trackIdx } = tracks[rowIdx]!
    if (!isKeyframable(track.trackType)) continue

    const keyframes = getTrackKeyframes(track)
    const centerY = RULER_HEIGHT + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2

    for (let ki = keyframes.length - 1; ki >= 0; ki--) {
      const kf = keyframes[ki]!
      const x = timeToX(kf.time)
      if (Math.abs(px - x) <= hitRadius && Math.abs(py - centerY) <= hitRadius) {
        return { trackIndex: trackIdx, kfIndex: ki }
      }
    }
  }
  return null
}

function hitTestRuler(py: number): boolean {
  return py < RULER_HEIGHT
}

// ===== Pointer Interaction =====

function getCanvasPos(e: PointerEvent | MouseEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function getTrackEntryAtY(y: number) {
  const rowIdx = yToTrackIndex(y)
  if (rowIdx < 0) return null
  return props.ctx.allTracks.value[rowIdx] ?? null
}

function closeContextMenu() {
  contextMenu.value = null
}

function repositionContextMenu(): void {
  const menu = contextMenu.value
  const element = contextMenuRef.value
  if (!menu || !element) return

  const maxLeft = Math.max(CONTEXT_MENU_GAP, window.innerWidth - element.offsetWidth - CONTEXT_MENU_GAP)
  const maxTop = Math.max(CONTEXT_MENU_GAP, window.innerHeight - element.offsetHeight - CONTEXT_MENU_GAP)
  const nextX = Math.min(Math.max(CONTEXT_MENU_GAP, menu.x), maxLeft)

  const preferredBelowY = menu.y + CONTEXT_MENU_GAP
  const preferredAboveY = menu.y - element.offsetHeight - CONTEXT_MENU_GAP
  const fitsBelow = preferredBelowY + element.offsetHeight <= window.innerHeight - CONTEXT_MENU_GAP
  const unclampedY = fitsBelow ? preferredBelowY : preferredAboveY
  const nextY = Math.min(Math.max(CONTEXT_MENU_GAP, unclampedY), maxTop)

  if (nextX === menu.x && nextY === menu.y) return
  contextMenu.value = {
    ...menu,
    x: nextX,
    y: nextY,
  }
}

function resetCanvasCursor() {
  if (canvasRef.value) canvasRef.value.style.cursor = 'default'
}

function onCanvasHover(e: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const pos = getCanvasPos(e)
  if (hitTestKeyframe(pos.x, pos.y)) {
    canvas.style.cursor = 'pointer'
  } else if (hitTestRuler(pos.y)) {
    canvas.style.cursor = 'ew-resize'
  } else if (pos.x < LEFT_LABEL_WIDTH && yToTrackIndex(pos.y) >= 0) {
    canvas.style.cursor = 'pointer'
  } else {
    canvas.style.cursor = 'crosshair'
  }
}

function onPointerDown(e: PointerEvent) {
  rootRef.value?.focus()
  closeContextMenu()
  const pos = getCanvasPos(e)

  // 关闭浮层
  showPreviewPicker.value = false
  showAddTrackMenu.value = false

  // Ruler click → scrub
  if (hitTestRuler(pos.y)) {
    interactionMode = 'scrub'
    props.ctx.seekTo(xToTime(pos.x))
    startGlobalPointerTracking(e)
    draw()
    return
  }

  // Keyframe hit
  const hit = hitTestKeyframe(pos.x, pos.y)
  if (hit && e.button === 0) {
    // Select the track + keyframe
    props.ctx.selectTrack(hit.trackIndex)
    props.ctx.selectedKeyframeIndex.value = hit.kfIndex
    emit('track-selected', hit.trackIndex)
    const kfs = getTrackKeyframes(props.ctx.allTracks.value.find(t => t.index === hit.trackIndex)!.track)
    const kf = kfs[hit.kfIndex]
    if (kf) props.ctx.seekTo(kf.time)

    // Start drag
    interactionMode = 'drag-keyframe'
    dragTrackIndex = hit.trackIndex
    dragKeyframeIndex = hit.kfIndex
    startGlobalPointerTracking(e)
    draw()
    return
  }

  // Track row click (no keyframe) → select track only
  if (e.button === 0 && pos.x >= LEFT_LABEL_WIDTH) {
    const trackEntry = getTrackEntryAtY(pos.y)
    if (trackEntry) {
      props.ctx.selectTrackOnly(trackEntry.index)
      emit('track-selected', trackEntry.index)
      // Also scrub to clicked position
      props.ctx.seekTo(xToTime(pos.x))
    } else {
      // Click below all rows → deselect
      props.ctx.deselectAll()
    }
    draw()
    return
  }

  // Click on label area → select track
  if (e.button === 0 && pos.x < LEFT_LABEL_WIDTH) {
    const trackEntry = getTrackEntryAtY(pos.y)
    if (trackEntry) {
      props.ctx.selectTrackOnly(trackEntry.index)
      emit('track-selected', trackEntry.index)
    }
    draw()
  }
}

// ===== 工具栏操作 =====

function onToolbarFocusTrack() {
  const trackIndex = props.ctx.currentTrackIndex.value
  if (trackIndex < 0) return
  emit('focus-track', trackIndex)
  draw()
}

function onToolbarDuplicateTrack() {
  const trackIndex = props.ctx.currentTrackIndex.value
  if (trackIndex < 0) return
  emit('duplicate-track', trackIndex)
}

function onToolbarDeleteTrack() {
  const trackIndex = props.ctx.currentTrackIndex.value
  if (trackIndex < 0) return
  emit('delete-track', trackIndex)
}

// ---- 关键帧工具栏操作 ----

function currentTrackKeyframeCount(): number {
  const track = props.ctx.currentTrackAny.value
  if (!track) return 0
  return getTrackKeyframes(track).length
}

function onToolbarAddKeyframe() {
  const track = props.ctx.currentTrackAny.value
  if (!track || !isKeyframable(track.trackType)) return
  if (track.trackType === 'transform') props.ctx.addKeyframeAtPlayhead()
  else if (track.trackType === 'visibility') props.ctx.addVisibilityKeyframeAtPlayhead()
  draw()
}

function onToolbarCopyKeyframe() {
  if (props.ctx.selectedKeyframeIndex.value < 0) return
  props.ctx.copyKeyframe()
}

function onToolbarDuplicateKeyframe() {
  if (!canDuplicateSelectedKeyframe.value) return
  props.ctx.duplicateKeyframeToPlayhead()
  draw()
}

function onToolbarPasteKeyframe() {
  if (!canPasteKeyframeToCurrentTrack.value) return
  props.ctx.pasteKeyframe()
  draw()
}

function onToolbarDeleteKeyframe() {
  const idx = props.ctx.selectedKeyframeIndex.value
  if (idx < 0) return
  if (currentTrackKeyframeCount() <= 2) return
  props.ctx.removeKeyframe(idx)
  draw()
}

function selectContextTrackAndKeyframe(menu: TimelineContextMenuState) {
  if (menu.keyframeIndex == null) {
    props.ctx.selectTrackOnly(menu.trackIndex)
    props.ctx.seekTo(menu.time)
    return
  }

  props.ctx.selectTrack(menu.trackIndex)
  props.ctx.selectedKeyframeIndex.value = menu.keyframeIndex
  const track = props.ctx.allTracks.value.find(item => item.index === menu.trackIndex)?.track
  const keyframe = track ? getTrackKeyframes(track)[menu.keyframeIndex] : null
  if (keyframe) props.ctx.seekTo(keyframe.time)
}

function addKeyframeAtTime(trackIndex: number, time: number) {
  const track = props.ctx.allTracks.value.find(item => item.index === trackIndex)?.track
  if (!track || !isKeyframable(track.trackType)) return

  props.ctx.selectTrack(trackIndex)
  props.ctx.seekTo(time)
  if (track.trackType === 'transform') {
    props.ctx.addKeyframeAtPlayhead()
  } else if (track.trackType === 'visibility') {
    props.ctx.addVisibilityKeyframeAtPlayhead()
  }
}

function onContextMenu(e: MouseEvent) {
  rootRef.value?.focus()
  showPreviewPicker.value = false
  showAddTrackMenu.value = false

  const pos = getCanvasPos(e)
  const hit = hitTestKeyframe(pos.x, pos.y)
  let trackEntry = hit
    ? props.ctx.allTracks.value.find(item => item.index === hit.trackIndex)
    : getTrackEntryAtY(pos.y)
  const hitDirectly = !!trackEntry
  // 回退：点击位置未命中轨道（标尺、空白、控制栏等）时，使用当前选中的轨道，
  // 保证右键在时间轴任何位置都能弹出菜单。
  if (!trackEntry) {
    const currentIdx = props.ctx.currentTrackIndex.value
    if (currentIdx != null && currentIdx >= 0) {
      trackEntry = props.ctx.allTracks.value.find(item => item.index === currentIdx)
    }
    if (!trackEntry) {
      trackEntry = props.ctx.allTracks.value[0]
    }
  }
  if (!trackEntry) {
    closeContextMenu()
    return
  }

  const time = pos.x >= LEFT_LABEL_WIDTH && pos.x <= (canvasRef.value?.clientWidth ?? 0)
    ? xToTime(pos.x)
    : props.ctx.playheadPosition.value
  contextMenu.value = {
    x: e.clientX,
    y: e.clientY,
    trackIndex: trackEntry.index,
    keyframeIndex: hit?.kfIndex ?? null,
    time,
    fromFallback: !hitDirectly,
  }
  // 只有在直接命中轨道/关键帧时才变更选中状态；回退菜单仅展示，不改动当前轨道/播放头。
  if (hitDirectly) {
    selectContextTrackAndKeyframe(contextMenu.value)
    emit('track-selected', trackEntry.index)
  }
  void nextTick(() => repositionContextMenu())
  draw()
}

function onContextAddKeyframe() {
  const menu = contextMenu.value
  if (!menu) return
  addKeyframeAtTime(menu.trackIndex, menu.time)
  closeContextMenu()
  draw()
}

function onContextFocusTrack() {
  const menu = contextMenu.value
  if (!menu) return
  emit('focus-track', menu.trackIndex)
  closeContextMenu()
  draw()
}

function onContextDuplicateTrack() {
  const menu = contextMenu.value
  if (!menu || menu.fromFallback) return
  emit('duplicate-track', menu.trackIndex)
  closeContextMenu()
}

function onContextCopyKeyframe() {
  const menu = contextMenu.value
  if (menu?.keyframeIndex == null || !contextMenuCanCopyKeyframe.value) return
  props.ctx.selectTrack(menu.trackIndex)
  props.ctx.selectedKeyframeIndex.value = menu.keyframeIndex
  props.ctx.copyKeyframe()
  closeContextMenu()
  draw()
}

function onContextPasteKeyframe() {
  const menu = contextMenu.value
  if (!menu || !contextMenuCanPasteKeyframe.value) return
  props.ctx.selectTrack(menu.trackIndex)
  // 粘贴到右键点击位置（若回退/无效时间则保持当前播放头）
  if (Number.isFinite(menu.time)) props.ctx.seekTo(menu.time)
  props.ctx.pasteKeyframe()
  closeContextMenu()
  draw()
}

function onContextDeleteKeyframe() {
  const menu = contextMenu.value
  if (menu?.keyframeIndex == null || !contextMenuCanDeleteKeyframe.value) return
  props.ctx.selectTrack(menu.trackIndex)
  props.ctx.selectedKeyframeIndex.value = menu.keyframeIndex
  props.ctx.removeKeyframe(menu.keyframeIndex)
  closeContextMenu()
  draw()
}

function onContextSplitKeyframe() {
  const menu = contextMenu.value
  if (menu?.keyframeIndex == null) return
  props.ctx.selectTrack(menu.trackIndex)
  props.ctx.selectedKeyframeIndex.value = menu.keyframeIndex
  props.ctx.splitKeyframeAt(menu.keyframeIndex)
  closeContextMenu()
  draw()
}

function onContextMergeKeyframe() {
  const menu = contextMenu.value
  if (menu?.keyframeIndex == null) return
  props.ctx.selectTrack(menu.trackIndex)
  props.ctx.selectedKeyframeIndex.value = menu.keyframeIndex
  props.ctx.mergeKeyframeAt(menu.keyframeIndex)
  closeContextMenu()
  draw()
}

function onContextDeleteTrack() {
  const menu = contextMenu.value
  if (!menu || menu.fromFallback) return
  emit('delete-track', menu.trackIndex)
  closeContextMenu()
}

// ===== 双击添加关键帧 =====

function onDblClick(e: MouseEvent) {
  const pos = getCanvasPos(e)
  if (pos.y <= RULER_HEIGHT || pos.x < LEFT_LABEL_WIDTH) return
  if (hitTestKeyframe(pos.x, pos.y)) return

  const rowIdx = yToTrackIndex(pos.y)
  if (rowIdx < 0) return

  const trackEntry = props.ctx.allTracks.value[rowIdx]
  if (!trackEntry || !isKeyframable(trackEntry.track.trackType)) return

  const time = xToTime(pos.x)
  props.ctx.selectTrack(trackEntry.index)
  props.ctx.seekTo(time)

  if (trackEntry.track.trackType === 'transform') {
    props.ctx.addKeyframeAtPlayhead()
  } else if (trackEntry.track.trackType === 'visibility') {
    props.ctx.addVisibilityKeyframeAtPlayhead()
  }
  draw()
}

function onPointerMove(e: PointerEvent) {
  const pos = getCanvasPos(e)

  if (interactionMode === 'scrub') {
    props.ctx.seekTo(xToTime(pos.x))
    draw()
  } else if (interactionMode === 'drag-keyframe') {
    const newTime = xToTime(pos.x)
    const snappedTime = e.shiftKey
      ? Math.round(newTime * 100) / 100
      : newTime
    const clampedTime = Math.max(0, Math.min(1, snappedTime))

    // Update the keyframe in the correct track
    const trackEntry = props.ctx.allTracks.value.find(t => t.index === dragTrackIndex)
    if (trackEntry) {
      const track = trackEntry.track
      if (track.trackType === 'transform') {
        props.ctx.updateKeyframe(dragKeyframeIndex, { time: clampedTime })
      } else if (track.trackType === 'visibility') {
        props.ctx.updateVisibilityKeyframe(dragKeyframeIndex, { time: clampedTime })
      }
    }
    draw()
  }
}

function onPointerUp(_e: PointerEvent) {
  if (interactionMode === 'drag-keyframe') {
    props.ctx.sortKeyframes()
  }
  interactionMode = 'none'
  stopGlobalPointerTracking()
  draw()
}

function startGlobalPointerTracking(e: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.setPointerCapture(e.pointerId)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
}

function stopGlobalPointerTracking() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.removeEventListener('pointermove', onPointerMove)
  canvas.removeEventListener('pointerup', onPointerUp)
}

// ===== Keyboard =====

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (props.ctx.selectedKeyframeIndex.value >= 0) {
      props.ctx.removeKeyframe(props.ctx.selectedKeyframeIndex.value)
      draw()
      e.preventDefault()
    }
  }
}

// ===== Resize Observer =====

let resizeObserver: ResizeObserver | null = null

function setupResizeObserver() {
  const wrap = canvasWrapRef.value
  if (!wrap) return
  resizeObserver = new ResizeObserver(() => {
    resizeCanvas()
    draw()
  })
  resizeObserver.observe(wrap)
}

// ===== Watchers =====

watch(
  [
    () => props.ctx.playheadPosition.value,
    () => props.ctx.keyframes.value,
    () => props.ctx.selectedKeyframeIndex.value,
    () => props.ctx.isPlaying.value,
    () => props.ctx.currentTrackIndex.value,
    () => props.ctx.allTracks.value,
  ],
  () => {
    resizeCanvas()
    draw()
  },
  { deep: true }
)

// ===== Lifecycle =====

onMounted(() => {
  void nextTick(() => {
    resizeCanvas()
    draw()
    setupResizeObserver()
    rootRef.value?.addEventListener('keydown', onKeydown)
    document.addEventListener('pointerdown', closeContextMenu)
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopGlobalPointerTracking()
  rootRef.value?.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', closeContextMenu)
})
</script>

<style scoped>
.animation-timeline {
  position: relative;
  background: #fafbfc;
  border-top: 1px solid #e0e3e8;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  outline: none;
}

/* Controls bar */
.timeline-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 10px;
  height: 38px;
  background: #ffffff;
  border-bottom: 1px solid #e0e3e8;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.btn-ctrl {
  background: #f0f1f3;
  border: 1px solid #d0d3d9;
  color: #444;
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}

.btn-ctrl:hover {
  background: #e4e6ea;
}

.btn-play {
  min-width: 32px;
}

.btn-collapse {
  min-width: 28px;
  padding-inline: 6px;
}

.time-label {
  font-size: 11px;
  color: #888;
  font-family: monospace;
  margin-left: 8px;
}

.progress-label {
  font-size: 11px;
  color: #999;
  font-family: monospace;
}

.control-divider {
  width: 1px;
  height: 16px;
  background: #e0e3e8;
  margin: 0 2px;
}

.preview-range-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #666;
}

.preview-range-select {
  height: 24px;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  background: #fff;
  color: #444;
  font-size: 11px;
}

.track-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  height: 30px;
  padding: 0;
  background: transparent;
}

.track-toolbar-title {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}

.btn-track-add {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}

.btn-track-add:hover {
  background: #dbeafe;
}

.add-track-dropdown-wrap {
  position: relative;
}

.add-track-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 120px;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  z-index: 120;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-track-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: none;
  background: none;
  border-radius: 4px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.add-track-menu-item:hover {
  background: #f0f1f3;
}

.add-track-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.preview-picker {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  width: 260px;
  max-height: 280px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  z-index: 120;
  padding: 8px;
}

.preview-picker-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.preview-picker-actions button {
  border: 1px solid #d0d3d9;
  background: #f9fafb;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.preview-track-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  font-size: 11px;
  color: #374151;
  cursor: pointer;
}

.preview-track-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Canvas area */
.timeline-canvas-wrap {
  flex: 1;
  min-height: 115px;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable both-edges;
}

.timeline-canvas-wrap canvas {
  display: block;
  cursor: default;
}

.timeline-context-menu {
  position: fixed;
  /* AnimationWorkbench overlay uses z-index 1100 and is teleported to body;
     the context menu is also teleported to body, so it must sit above the
     overlay to be visible. */
  z-index: 2100;
  min-width: 132px;
  padding: 4px;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.context-menu-item:hover:not(:disabled) {
  background: #f3f4f6;
}

.context-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.context-menu-item.danger {
  color: #dc2626;
}

.context-menu-title {
  padding: 4px 8px 2px;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
}

.context-menu-divider {
  display: block;
  height: 1px;
  margin: 4px 0;
  background: #e5e7eb;
}

.btn-track-tool {
  border: 1px solid #d0d3d9;
  background: #f9fafb;
  color: #4b5563;
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 6px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-track-tool:hover {
  background: #e4e6ea;
  color: #1f2937;
}

.btn-track-tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-track-tool:disabled:hover {
  background: #f9fafb;
  color: #4b5563;
}

.btn-track-tool.danger {
  color: #dc2626;
}

.btn-track-tool.danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #b91c1c;
}

.toolbar-sep {
  width: 1px;
  height: 16px;
  background: #e0e3e8;
  flex-shrink: 0;
}
</style>
