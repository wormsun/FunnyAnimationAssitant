<template>
  <div class="canvas-scrollbars">
    <!-- 横向滚动条 -->
    <div
      v-if="showHorizontal"
      ref="hTrackRef"
      class="scrollbar-track horizontal"
      @mousedown="startHorizontalDrag"
    >
      <div
        class="scrollbar-thumb"
        :style="horizontalThumbStyle"
      />
    </div>

    <!-- 纵向滚动条 -->
    <div
      v-if="showVertical"
      ref="vTrackRef"
      class="scrollbar-track vertical"
      @mousedown="startVerticalDrag"
    >
      <div
        class="scrollbar-thumb"
        :style="verticalThumbStyle"
      />
    </div>

    <!-- 右下角空白方块（两条滚动条都显示时占位） -->
    <div
      v-if="showHorizontal && showVertical"
      class="scrollbar-corner"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  /** 画布逻辑宽度 */
  canvasWidth: number
  /** 画布逻辑高度 */
  canvasHeight: number
  /** 视口宽度（像素） */
  viewportWidth: number
  /** 视口高度（像素） */
  viewportHeight: number
  /** effectiveScale = fitScale * userZoom */
  effectiveScale: number
  /** 当前平移偏移 */
  panX: number
  panY: number
}>()

const emit = defineEmits<{
  'pan-change': [x: number, y: number]
}>()

const TRACK_SIZE = 10       // 滚动条轨道宽度
const MIN_THUMB_SIZE = 30   // 最小滑块长度

const hTrackRef = ref<HTMLElement>()
const vTrackRef = ref<HTMLElement>()

// ========== 计算属性 ==========

/** 画布渲染后的像素尺寸 */
const canvasPixelWidth = computed(() => props.canvasWidth * props.effectiveScale)
const canvasPixelHeight = computed(() => props.canvasHeight * props.effectiveScale)

/** 总可滚动区域（画布超出视口的部分） */
const totalWidth = computed(() => Math.max(canvasPixelWidth.value, props.viewportWidth))
const totalHeight = computed(() => Math.max(canvasPixelHeight.value, props.viewportHeight))

/** 是否需要显示滚动条 */
const showHorizontal = computed(() => canvasPixelWidth.value > props.viewportWidth + 1)
const showVertical = computed(() => canvasPixelHeight.value > props.viewportHeight + 1)

/** 滑块占比 */
const hThumbRatio = computed(() => Math.min(1, props.viewportWidth / totalWidth.value))
const vThumbRatio = computed(() => Math.min(1, props.viewportHeight / totalHeight.value))

/** 滑块位置（0~1） */
const hScrollRatio = computed(() => {
  const maxScroll = canvasPixelWidth.value - props.viewportWidth
  if (maxScroll <= 0) return 0
  return Math.max(0, Math.min(1, -props.panX / maxScroll))
})

const vScrollRatio = computed(() => {
  const maxScroll = canvasPixelHeight.value - props.viewportHeight
  if (maxScroll <= 0) return 0
  return Math.max(0, Math.min(1, -props.panY / maxScroll))
})

/** 横向轨道可用长度 */
const hTrackLength = computed(() => {
  const margin = showVertical.value ? TRACK_SIZE : 0
  return props.viewportWidth - margin
})

const vTrackLength = computed(() => {
  const margin = showHorizontal.value ? TRACK_SIZE : 0
  return props.viewportHeight - margin
})

/** 横向滑块样式 */
const horizontalThumbStyle = computed(() => {
  const thumbLen = Math.max(MIN_THUMB_SIZE, hTrackLength.value * hThumbRatio.value)
  const maxTravel = hTrackLength.value - thumbLen
  const left = maxTravel * hScrollRatio.value
  return {
    width: `${thumbLen}px`,
    left: `${left}px`,
  }
})

/** 纵向滑块样式 */
const verticalThumbStyle = computed(() => {
  const thumbLen = Math.max(MIN_THUMB_SIZE, vTrackLength.value * vThumbRatio.value)
  const maxTravel = vTrackLength.value - thumbLen
  const top = maxTravel * vScrollRatio.value
  return {
    height: `${thumbLen}px`,
    top: `${top}px`,
  }
})

// ========== 拖拽逻辑 ==========

let dragAxis: 'h' | 'v' | null = null
let dragStartMouse = 0
let dragStartScroll = 0

function startHorizontalDrag(e: MouseEvent) {
  e.preventDefault()
  dragAxis = 'h'

  // 计算点击位置是否在滑块上
  const track = hTrackRef.value
  if (!track) return
  const trackRect = track.getBoundingClientRect()
  const clickPos = e.clientX - trackRect.left

  const thumbLen = Math.max(MIN_THUMB_SIZE, hTrackLength.value * hThumbRatio.value)
  const maxTravel = hTrackLength.value - thumbLen
  const currentThumbLeft = maxTravel * hScrollRatio.value

  if (clickPos >= currentThumbLeft && clickPos <= currentThumbLeft + thumbLen) {
    // 点击在滑块上：拖拽模式
    dragStartMouse = e.clientX
    dragStartScroll = hScrollRatio.value
  } else {
    // 点击在轨道上：跳转到点击位置
    const newRatio = Math.max(0, Math.min(1, (clickPos - thumbLen / 2) / maxTravel))
    const maxScroll = canvasPixelWidth.value - props.viewportWidth
    emit('pan-change', -newRatio * maxScroll, props.panY)
    dragStartMouse = e.clientX
    dragStartScroll = newRatio
  }

  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
}

function startVerticalDrag(e: MouseEvent) {
  e.preventDefault()
  dragAxis = 'v'

  const track = vTrackRef.value
  if (!track) return
  const trackRect = track.getBoundingClientRect()
  const clickPos = e.clientY - trackRect.top

  const thumbLen = Math.max(MIN_THUMB_SIZE, vTrackLength.value * vThumbRatio.value)
  const maxTravel = vTrackLength.value - thumbLen
  const currentThumbTop = maxTravel * vScrollRatio.value

  if (clickPos >= currentThumbTop && clickPos <= currentThumbTop + thumbLen) {
    dragStartMouse = e.clientY
    dragStartScroll = vScrollRatio.value
  } else {
    const newRatio = Math.max(0, Math.min(1, (clickPos - thumbLen / 2) / maxTravel))
    const maxScroll = canvasPixelHeight.value - props.viewportHeight
    emit('pan-change', props.panX, -newRatio * maxScroll)
    dragStartMouse = e.clientY
    dragStartScroll = newRatio
  }

  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
}

function handleDrag(e: MouseEvent) {
  if (dragAxis === 'h') {
    const thumbLen = Math.max(MIN_THUMB_SIZE, hTrackLength.value * hThumbRatio.value)
    const maxTravel = hTrackLength.value - thumbLen
    if (maxTravel <= 0) return

    const delta = e.clientX - dragStartMouse
    const ratioDelta = delta / maxTravel
    const newRatio = Math.max(0, Math.min(1, dragStartScroll + ratioDelta))
    const maxScroll = canvasPixelWidth.value - props.viewportWidth
    emit('pan-change', -newRatio * maxScroll, props.panY)
  } else if (dragAxis === 'v') {
    const thumbLen = Math.max(MIN_THUMB_SIZE, vTrackLength.value * vThumbRatio.value)
    const maxTravel = vTrackLength.value - thumbLen
    if (maxTravel <= 0) return

    const delta = e.clientY - dragStartMouse
    const ratioDelta = delta / maxTravel
    const newRatio = Math.max(0, Math.min(1, dragStartScroll + ratioDelta))
    const maxScroll = canvasPixelHeight.value - props.viewportHeight
    emit('pan-change', props.panX, -newRatio * maxScroll)
  }
}

function stopDrag() {
  dragAxis = null
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped>
.canvas-scrollbars {
  pointer-events: none;
}

.scrollbar-track {
  position: absolute;
  pointer-events: auto;
  z-index: 101;
}

.scrollbar-track.horizontal {
  left: 0;
  bottom: 0;
  right: 0;
  height: 10px;
}

.scrollbar-track.vertical {
  top: 0;
  right: 0;
  bottom: 0;
  width: 10px;
}

.scrollbar-thumb {
  position: absolute;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.25);
  transition: background 0.15s;
}

.scrollbar-track.horizontal .scrollbar-thumb {
  height: 6px;
  top: 2px;
  min-width: 30px;
}

.scrollbar-track.vertical .scrollbar-thumb {
  width: 6px;
  left: 2px;
  min-height: 30px;
}

.scrollbar-thumb:hover,
.scrollbar-track:active .scrollbar-thumb {
  background: rgba(255, 255, 255, 0.45);
}

.scrollbar-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
</style>
