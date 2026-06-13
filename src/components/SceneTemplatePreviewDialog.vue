<template>
  <div
    class="modal-overlay"
    @click.self="emit('close')"
  >
    <div class="preview-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <h3 class="dialog-title">
          预览: {{ templateName }}
        </h3>
        <div class="header-actions">
          <button
            class="btn-close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <!-- Canvas Area -->
        <div class="canvas-area">
          <div
            ref="canvasContainerRef"
            class="canvas-container"
          />

          <!-- Animation Controls -->
          <div class="animation-controls">
            <button
              class="ctrl-btn"
              :class="{ active: isAnimating }"
              @click="toggleAnimations"
            >
              {{ isAnimating ? '⏹ 停止动画' : '▶ 播放动画' }}
            </button>
            <span class="anim-hint">
              {{ animatableCount > 0 ? `${animatableCount} 个对象有初始动画` : '无初始动画' }}
            </span>
          </div>
        </div>

        <!-- Info Sidebar -->
        <div class="info-sidebar">
          <div class="info-section">
            <h4>模板信息</h4>
            <div class="info-row">
              <span class="info-label">名称</span>
              <span class="info-value">{{ templateName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">包含对象</span>
              <span class="info-value">{{ objectCount }} 个</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ createdAtFormatted }}</span>
            </div>
          </div>

          <!-- Tags -->
          <div
            v-if="templateTags.length > 0"
            class="info-section"
          >
            <h4>标签</h4>
            <div class="tags-list">
              <span
                v-for="tag in templateTags"
                :key="tag"
                class="tag-chip"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <!-- Object List -->
          <div class="info-section">
            <h4>对象列表</h4>
            <div class="object-list">
              <div
                v-for="obj in objectInfos"
                :key="obj.id"
                class="object-item"
              >
                <span class="obj-icon">{{ getTypeIcon(obj.type) }}</span>
                <span class="obj-name">{{ obj.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useSceneRenderer } from '@/composables/useSceneRenderer'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import { useSceneTemplateStore } from '@/stores/sceneTemplateStore'
import type { AnimationDefinition } from '@/types/animation'
import type { SceneObjectType } from '@/types/sceneObject'
import type { SceneTemplate } from '@/types/sceneTemplate'
import { instantiateTemplate } from '@/utils/sceneTemplateEngine'

interface Props {
  templateId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit', templateId: string): void
}>()

const templateStore = useSceneTemplateStore()
const sceneObjectStore = useSceneObjectStore()

const canvasContainerRef = ref<HTMLElement | null>(null)
const isAnimating = ref(false)

// 渲染器和临时对象 ID
const renderer = ref<ReturnType<typeof useSceneRenderer> | null>(null)
const templateObjectIds = ref<string[]>([])

// 模板数据
const template = computed<SceneTemplate | undefined>(
  () => templateStore.getTemplate(props.templateId)
)

const templateName = computed(() => template.value?.name ?? '未知模板')
const objectCount = computed(() => template.value?.objects.length ?? 0)
const templateTags = computed(() => template.value?.tags ?? [])

const objectInfos = computed(() => {
  if (!template.value) return []
  return template.value.objects.map(obj => ({
    id: obj.id,
    name: obj.name,
    type: obj.type,
  }))
})

const createdAtFormatted = computed(() => {
  if (!template.value) return ''
  const d = new Date(template.value.createdAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

// 计算有初始动画的对象数量
const animatableCount = computed(() => {
  if (!template.value) return 0
  let count = 0
  for (const obj of template.value.objects) {
    if (obj.initialAnimations && obj.initialAnimations.length > 0) {
      count++
    }
  }
  return count
})

function getTypeIcon(type: SceneObjectType): string {
  switch (type) {
    case 'background': return '🖼️'
    case 'prop': return '📦'
    case 'text': return '📝'
    case 'composite': return '📦'
    case 'symbol': return '🧩'
    default: return '❓'
  }
}

onMounted(async () => {
  const tpl = template.value
  if (!tpl) {
    throw new Error(`[SceneTemplatePreviewDialog] 模板 ${props.templateId} 不存在`)
  }

  // 实例化模板对象到场景 Store
  const result = instantiateTemplate(tpl, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, { autoWrapComposite: false })
  for (const obj of result.objects) {
    sceneObjectStore.addObject(obj)
  }
  templateObjectIds.value = result.objects.map(o => o.id)

  // 初始化 PIXI 渲染器（只读 Setup 模式）
  if (canvasContainerRef.value) {
    const rendererInstance = useSceneRenderer({
      canvasContainer: canvasContainerRef.value,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      mode: 'setup',
    })
    renderer.value = rendererInstance
    await rendererInstance.initRenderer()
    await rendererInstance.renderObjects()

    // 居中滚动
    setTimeout(() => {
      rendererInstance.scrollToCanvasCenter()
    }, 100)

    // 自动播放初始动画（如果有）
    if (animatableCount.value > 0) {
      setTimeout(() => {
        startAnimations()
      }, 300)
    }
  }
})

onBeforeUnmount(() => {
  // 停止所有动画
  stopAnimations()

  // 清理 PIXI 渲染器
  if (renderer.value) {
    renderer.value.destroyRenderer()
  }

  // 清理临时对象
  for (const id of templateObjectIds.value) {
    sceneObjectStore.removeObject(id)
  }
})

function toggleAnimations() {
  if (isAnimating.value) {
    stopAnimations()
  } else {
    startAnimations()
  }
}

/**
 * 启动所有对象的 initialAnimations
 */
function startAnimations() {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  const tpl = template.value
  if (!tpl) return

  const originalObjects = tpl.objects

  for (let i = 0; i < originalObjects.length; i++) {
    const originalObj = originalObjects[i]
    if (!originalObj) continue
    const runtimeId = templateObjectIds.value[i]
    if (!runtimeId) continue

    const initialAnims = originalObj.initialAnimations
    if (!initialAnims || initialAnims.length === 0) continue

    const animDefs = originalObj.animations

    if (originalObj.type === 'prop' || originalObj.type === 'background' || originalObj.type === 'symbol') {
      const player = sceneGraph.getGenericAnimationPlayer(runtimeId)
      if (!player) continue
      for (const animItem of initialAnims) {
        const definition = findAnimationByName(animDefs, animItem.name)
        if (definition) {
          player.playAnimation(animItem.name, definition, { loop: animItem.loop })
        }
      }
    }
  }

  isAnimating.value = true
}

/**
 * 停止所有对象的动画
 */
function stopAnimations() {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  for (const runtimeId of templateObjectIds.value) {
    const obj = sceneObjectStore.getObject(runtimeId)
    if (!obj) continue

    if (obj.type === 'prop' || obj.type === 'background' || obj.type === 'symbol') {
      const player = sceneGraph.getGenericAnimationPlayer(runtimeId)
      if (player) {
        player.stopAllAnimations()
      }
    }
  }

  isAnimating.value = false
}

/**
 * 从对象的 animations 字典中按名称查找动画定义
 */
function findAnimationByName(
  animations: Record<string, AnimationDefinition> | undefined,
  name: string
): AnimationDefinition | undefined {
  if (!animations) return undefined
  for (const def of Object.values(animations)) {
    if (def.name === name) return def
  }
  return undefined
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.preview-dialog {
  background: #ffffff;
  width: 90vw;
  max-width: 1200px;
  height: 80vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-close {
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #fee2e2;
  border-color: #ef4444;
  color: #ef4444;
}

.dialog-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.canvas-container {
  flex: 1;
  background: #e2e8f0;
  position: relative;
  overflow: hidden;
}

.animation-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.ctrl-btn {
  padding: 6px 16px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #374151;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.ctrl-btn:hover {
  background: #f0f9ff;
  border-color: #3b82f6;
  color: #2563eb;
}

.ctrl-btn.active {
  background: #fef2f2;
  border-color: #ef4444;
  color: #ef4444;
}

.anim-hint {
  font-size: 12px;
  color: #9ca3af;
}

.info-sidebar {
  width: 260px;
  background: #f9fafb;
  border-left: 1px solid #e2e8f0;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 16px;
}

.info-section {
  margin-bottom: 20px;
}

.info-section h4 {
  margin: 0 0 10px;
  font-size: 13px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
}

.info-label {
  color: #9ca3af;
}

.info-value {
  color: #1e293b;
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  display: inline-block;
  padding: 2px 10px;
  background: #eff6ff;
  color: #3b82f6;
  border-radius: 12px;
  font-size: 12px;
}

.object-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.object-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
}

.object-item.root {
  background: #eff6ff;
  color: #2563eb;
}

.obj-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.obj-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obj-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border-radius: 8px;
  flex-shrink: 0;
}
</style>
