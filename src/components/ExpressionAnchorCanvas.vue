<template>
  <div class="anchor-canvas-container">
    <canvas
      ref="canvasRef"
      class="anchor-canvas"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick,onMounted, onUnmounted, ref, watch } from 'vue'

import type { AnchorPoint } from '@/types/project'

const props = defineProps<{
  imageUrl?: string
  anchor: AnchorPoint
  flipHorizontal?: boolean
}>()

const emit = defineEmits<{
  'update:anchor': [anchor: AnchorPoint]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDragging = ref(false)
const image = ref<HTMLImageElement | null>(null)
const canvasWidth = ref(400)
const canvasHeight = ref(400)
const imageScale = ref(1)
const imageOffsetX = ref(0)
const imageOffsetY = ref(0)

// 计算锚点在画布上的实际坐标
const anchorX = ref(0)
const anchorY = ref(0)

// 监听外部锚点变化
watch(() => props.anchor, (newAnchor) => {
  updateAnchorPosition(newAnchor)
}, { deep: true })

// 监听水平翻转变化
watch(() => props.flipHorizontal, () => {
  updateAnchorPosition(props.anchor)
  draw()
})

// 监听图片变化
watch(() => props.imageUrl, async (newUrl) => {
  if (newUrl) {
    await loadImage(newUrl)
    draw()
  }
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  if (props.imageUrl) {
    await loadImage(props.imageUrl)
  }
  updateAnchorPosition(props.anchor)
  draw()
})

function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      image.value = img
      calculateImageLayout()
      resolve()
    }
    img.onerror = reject
    img.src = url
  })
}

function calculateImageLayout() {
  if (!canvasRef.value || !image.value) return

  const canvas = canvasRef.value
  const img = image.value
  
  // 计算缩放比例，使图片适应画布
  const scaleX = canvas.width / img.width
  const scaleY = canvas.height / img.height
  imageScale.value = Math.min(scaleX, scaleY)
  
  // 计算居中偏移
  const scaledWidth = img.width * imageScale.value
  const scaledHeight = img.height * imageScale.value
  imageOffsetX.value = (canvas.width - scaledWidth) / 2
  imageOffsetY.value = (canvas.height - scaledHeight) / 2
}

function updateAnchorPosition(anchor: AnchorPoint) {
  if (!canvasRef.value || !image.value) return

  const img = image.value
  
  const scaledWidth = img.width * imageScale.value
  const scaledHeight = img.height * imageScale.value
  
  // 计算锚点在画布上的实际坐标
  // 如果水平翻转，x坐标需要镜像
  if (props.flipHorizontal) {
    anchorX.value = imageOffsetX.value + scaledWidth * (1 - anchor.x)
  } else {
    anchorX.value = imageOffsetX.value + scaledWidth * anchor.x
  }
  anchorY.value = imageOffsetY.value + scaledHeight * anchor.y
}

function draw() {
  if (!canvasRef.value || !image.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // 绘制白色背景
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // 绘制图片
  const img = image.value
  const scaledWidth = img.width * imageScale.value
  const scaledHeight = img.height * imageScale.value
  
  // 如果启用水平翻转，需要先保存上下文状态
  if (props.flipHorizontal) {
    ctx.save()
    // 移动到图片中心位置
    ctx.translate(imageOffsetX.value + scaledWidth, imageOffsetY.value)
    // 水平翻转
    ctx.scale(-1, 1)
    // 绘制图片（注意x坐标需要为负）
    ctx.drawImage(img, 0, 0, -scaledWidth, scaledHeight)
    ctx.restore()
  } else {
    ctx.drawImage(
      img,
      imageOffsetX.value,
      imageOffsetY.value,
      scaledWidth,
      scaledHeight
    )
  }
  
  // 绘制边框
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.strokeRect(
    imageOffsetX.value,
    imageOffsetY.value,
    scaledWidth,
    scaledHeight
  )
  
  // 绘制红色十字准星
  const crossSize = 20
  const lineWidth = 2
  
  ctx.strokeStyle = '#ff0000'
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  
  // 水平线
  ctx.moveTo(anchorX.value - crossSize, anchorY.value)
  ctx.lineTo(anchorX.value + crossSize, anchorY.value)
  
  // 垂直线
  ctx.moveTo(anchorX.value, anchorY.value - crossSize)
  ctx.lineTo(anchorX.value, anchorY.value + crossSize)
  
  ctx.stroke()
  
  // 绘制中心圆点
  ctx.fillStyle = '#ff0000'
  ctx.beginPath()
  ctx.arc(anchorX.value, anchorY.value, 4, 0, Math.PI * 2)
  ctx.fill()
}

function handleMouseDown(event: MouseEvent) {
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  // 检查是否点击在锚点附近
  const distance = Math.sqrt(
    Math.pow(x - anchorX.value, 2) + Math.pow(y - anchorY.value, 2)
  )
  
  if (distance < 30) {
    isDragging.value = true
    updateAnchorFromCanvas(x, y)
  }
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !canvasRef.value || !image.value) return
  
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  updateAnchorFromCanvas(x, y)
}

function handleMouseUp() {
  isDragging.value = false
}

function updateAnchorFromCanvas(canvasX: number, canvasY: number) {
  if (!image.value) return
  
  const img = image.value
  const scaledWidth = img.width * imageScale.value
  const scaledHeight = img.height * imageScale.value
  
  // 计算相对于图片的坐标
  let relativeX = (canvasX - imageOffsetX.value) / scaledWidth
  const relativeY = (canvasY - imageOffsetY.value) / scaledHeight
  
  // 如果水平翻转，x坐标需要镜像
  if (props.flipHorizontal) {
    relativeX = 1 - relativeX
  }
  
  // 限制在 0-1 范围内
  const newAnchor: AnchorPoint = {
    x: Math.max(0, Math.min(1, relativeX)),
    y: Math.max(0, Math.min(1, relativeY))
  }
  
  // 更新显示的锚点位置（考虑翻转）
  if (props.flipHorizontal) {
    anchorX.value = imageOffsetX.value + scaledWidth * (1 - newAnchor.x)
  } else {
    anchorX.value = imageOffsetX.value + scaledWidth * newAnchor.x
  }
  anchorY.value = imageOffsetY.value + scaledHeight * newAnchor.y
  
  emit('update:anchor', newAnchor)
  draw()
}

// 当画布尺寸变化时重新计算
function resizeCanvas() {
  if (!canvasRef.value) return
  
  const container = canvasRef.value.parentElement
  if (!container) return
  
  canvasWidth.value = container.clientWidth
  canvasHeight.value = container.clientHeight
  
  canvasRef.value.width = canvasWidth.value
  canvasRef.value.height = canvasHeight.value
  
  if (image.value) {
    calculateImageLayout()
    updateAnchorPosition(props.anchor)
    draw()
  }
}

onMounted(() => {
  if (canvasRef.value) {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.anchor-canvas-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.anchor-canvas {
  display: block;
  cursor: crosshair;
  max-width: 100%;
  max-height: 100%;
}
</style>

