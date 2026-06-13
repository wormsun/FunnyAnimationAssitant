<template>
  <div
    class="modal-overlay"
    @click.self="emit('close')"
  >
    <div class="preview-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <h3 class="dialog-title">
          {{ title }}
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
          <!-- Loading Overlay -->
          <div
            v-if="isPreloading"
            class="loading-overlay"
          >
            <span class="loading-spinner" />
            <span class="loading-text">正在加载资源...</span>
          </div>
        </div>

        <!-- Info Sidebar -->
        <div class="info-sidebar">
          <!-- Template/Character Info -->
          <div class="info-section">
            <h4>基本信息</h4>
            <div class="info-row">
              <span class="info-label">名称</span>
              <span class="info-value">{{ info?.name ?? '未知' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">包含对象</span>
              <span class="info-value">{{ objects.length }} 个</span>
            </div>
            <div
              v-if="info?.createdAt"
              class="info-row"
            >
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ formatDate(info.createdAt) }}</span>
            </div>
          </div>

          <!-- Tags -->
          <div
            v-if="info?.tags && info.tags.length > 0"
            class="info-section"
          >
            <h4>标签</h4>
            <div class="tags-list">
              <span
                v-for="tag in info.tags"
                :key="tag"
                class="tag-chip"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <!-- Animation List -->
          <div class="info-section">
            <h4>🎬 动画列表</h4>
            <div
              v-if="animationGroups.length === 0"
              class="empty-hint"
            >
              无可用动画
            </div>
            <div
              v-for="group in animationGroups"
              :key="group.objectId"
              class="anim-group"
            >
              <div class="anim-group-header">
                <span class="anim-group-icon">{{ getTypeIcon(group.objectType) }}</span>
                <span class="anim-group-name">{{ group.objectName }}</span>
              </div>
              <div
                v-for="anim in group.animations"
                :key="anim.id"
                class="anim-item"
              >
                <div class="anim-item-info">
                  <span class="anim-name">{{ anim.name }}</span>
                  <span
                    class="anim-type-badge"
                    :class="anim.type"
                  >
                    轨道
                  </span>
                  <span
                    v-if="anim.loop"
                    class="anim-loop-badge"
                  >
                    🔁
                  </span>
                </div>
                <button
                  class="anim-play-btn"
                  :class="{ playing: playingAnimations.has(`${group.objectId}:${anim.name}`) }"
                  @click="toggleAnimation(group.objectId, anim)"
                >
                  {{ playingAnimations.has(`${group.objectId}:${anim.name}`) ? '⏹' : '▶' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as PIXI from 'pixi.js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAssetLoader } from '@/composables/useAssetLoader'
import { useSceneRenderer } from '@/composables/useSceneRenderer'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { createGenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { AnimationDefinition } from '@/types/animation'
import type { SceneObject, SceneObjectType, SymbolObject } from '@/types/sceneObject'
import type { SceneSetup } from '@/types/screenplay'
import { restoreAnimatedSpriteStillFrame } from '@/utils/animationUtils'
import { loadSetupToSceneObjects } from '@/utils/sceneLoader'

// ============================================================================
// Props & Emits
// ============================================================================

interface PreviewInfo {
  name: string
  createdAt?: number
  tags?: string[]
}

interface Props {
  title: string
  objects: SceneObject[]
  editorAnchor?: { x: number; y: number } | undefined
  /** 是否将顶层对象从归零坐标恢复到画布坐标（模板预览=true，人物编辑器预览=false） */
  restoreAnchorOffset?: boolean
  /** v19: 场景级渲染链（从模板的持久化数据传入，避免 rebuild） */
  renderChain?: string[]
  info?: PreviewInfo | undefined
}

const props = defineProps<Props>()

const emit = defineEmits<(e: 'close') => void>()

// ============================================================================
// Stores
// ============================================================================

const sceneObjectStore = useSceneObjectStore()
const propStore = usePropStore()
const backgroundStore = useBackgroundStore()
const expressionStore = useExpressionStore()

// ============================================================================
// State
// ============================================================================

const canvasContainerRef = ref<HTMLElement | null>(null)
const isAnimating = ref(false)
const isPreloading = ref(true)
const renderer = ref<ReturnType<typeof useSceneRenderer> | null>(null)

/** 备份编辑器的 sceneObjectStore 数据 */
const backupSceneObjects = ref<SceneObject[]>([])
/** v19: 备份编辑器的 sceneRenderChain */
const backupRenderChain = ref<string[]>([])

/** 当前正在播放的动画集合 (key: `objectId:animName`) */
const playingAnimations = ref<Set<string>>(new Set())



function collectNonEmptyTextures(
  urls: (string | undefined)[],
  getTexture: (url: string) => PIXI.Texture,
  emptyTexture: PIXI.Texture,
): PIXI.Texture[] {
  const textures: PIXI.Texture[] = []
  for (const url of urls) {
    if (!url) continue
    const texture = getTexture(url)
    if (texture && texture !== emptyTexture) {
      textures.push(texture)
    }
  }
  return textures
}

function choosePreviewFitBounds(
  contentLayerBounds: { x: number; y: number; width: number; height: number } | null | undefined,
  stageBounds: { x: number; y: number; width: number; height: number },
): { bounds: { x: number; y: number; width: number; height: number } } {
  if (contentLayerBounds && contentLayerBounds.width > 0 && contentLayerBounds.height > 0) {
    return { bounds: contentLayerBounds }
  }
  return { bounds: stageBounds }
}

// ============================================================================
// Computed
// ============================================================================

/** 有初始动画的对象数量 */
const animatableCount = computed(() => {
  let count = 0
  for (const obj of props.objects) {
    if (obj.initialAnimations && obj.initialAnimations.length > 0) {
      count++
    }
  }
  return count
})

void animatableCount.value // 保留计算属性供未来使用

/** 按对象分组的动画列表 */
interface AnimationInfo {
  id: string
  name: string
  type: 'track'
  loop: boolean
  definition: AnimationDefinition
}

interface AnimationGroup {
  objectId: string
  objectName: string
  objectType: SceneObjectType
  animations: AnimationInfo[]
}

const animationGroups = computed<AnimationGroup[]>(() => {
  const groups: AnimationGroup[] = []

  for (const obj of props.objects) {
    if (!obj.animations || Object.keys(obj.animations).length === 0) continue

    const animations: AnimationInfo[] = []
    for (const def of Object.values(obj.animations)) {
      // 过滤掉自动生成的帧播放动画（origin === 'auto'），
      // 但保留底层素材为动态多帧的对象（它们需要 auto 帧动画来驱动 AnimatedSprite）
      if (def.origin === 'auto' && !isObjectDynamic(obj)) continue

      animations.push({
        id: def.id,
        name: def.name,
        type: def.type,
        loop: def.loop,
        definition: def,
      })
    }

    if (animations.length > 0) {
      groups.push({
        objectId: obj.id,
        objectName: obj.name,
        objectType: obj.type,
        animations,
      })
    }
  }

  return groups
})

// ============================================================================
// Helpers
// ============================================================================

function getTypeIcon(type: SceneObjectType): string {
  switch (type) {
    case 'background': return '🖼️'
    case 'prop': return '📦'
    case 'text': return '📝'
    case 'composite': return '🔗'
    case 'symbol': return '🧩'
    case 'expression': return '😀'
    default: return '❓'
  }
}

/**
 * 检查场景对象的底层素材是否为动态多帧类型
 * - prop/background: 查询对应 Store 获取资源类型
 * - symbol: 检查当前素材的 type
 * - 其他类型: 返回 false
 */
function isObjectDynamic(obj: SceneObject): boolean {
  if (obj.type === 'prop') {
    const prop = propStore.getProp(obj.refId)
    return prop?.type === 'animation'
  }
  if (obj.type === 'background') {
    const bg = backgroundStore.getBackground(obj.refId)
    return bg?.type === 'animation'
  }
  if (obj.type === 'symbol') {
    const sym = obj as SymbolObject
    const currentId = sym.currentMaterialId ?? sym.materials?.[0]?.id
    const material = currentId
      ? sym.materials?.find(m => m.id === currentId)
      : sym.materials?.[0]
    return material?.type === 'animation'
  }
  if (obj.type === 'expression') {
    const expr = expressionStore.getExpression(obj.refId)
    return (expr?.speakingFrames?.length ?? 0) > 0
  }
  return false
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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

// ============================================================================
// Animation Playback
// ============================================================================

/**
 * 播放单个轨道动画
 */
function playTrackAnimation(objectId: string, animName: string, definition: AnimationDefinition): void {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  const player = sceneGraph.getGenericAnimationPlayer(objectId)
  if (player) {
    player.playAnimation(animName, definition, { loop: definition.loop, reset: true })
  }
}

/**
 * 停止单个对象的指定动画
 */
function stopTrackAnimation(objectId: string, animName: string): void {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  const player = sceneGraph.getGenericAnimationPlayer(objectId)
  if (player) {
    player.stopAnimation(animName)
  }
}



/**
 * 切换单个动画的播放/停止
 */
function toggleAnimation(objectId: string, anim: AnimationInfo): void {
  const key = `${objectId}:${anim.name}`

  if (playingAnimations.value.has(key)) {
    // 停止
    stopTrackAnimation(objectId, anim.name)
    playingAnimations.value.delete(key)
  } else {
    // 播放
    playTrackAnimation(objectId, anim.name, anim.definition)
    playingAnimations.value.add(key)
  }
}

/**
 * 播放所有初始动画
 */
function startInitialAnimations(): void {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  for (const obj of props.objects) {
    const initialAnims = obj.initialAnimations
    if (!initialAnims || initialAnims.length === 0) continue

    for (const animItem of initialAnims) {
      const definition = findAnimationByName(obj.animations, animItem.name)
      if (!definition) continue

      const player = sceneGraph.getGenericAnimationPlayer(obj.id)
      if (player) {
        player.playAnimation(animItem.name, definition, { loop: animItem.loop })
        playingAnimations.value.add(`${obj.id}:${animItem.name}`)
      }
    }
  }

  isAnimating.value = true
}


/**
 * 停止所有动画（初始 + 手动触发）
 */
function stopAllAnimations(): void {
  if (!renderer.value) return
  const sceneGraph = renderer.value.getSceneGraph()
  if (!sceneGraph) return

  // 停止所有 GenericAnimationPlayer
  for (const obj of sceneObjectStore.objects) {
    const player = sceneGraph.getGenericAnimationPlayer(obj.id)
    if (player) {
      player.stopAllAnimations()
    }
  }

  playingAnimations.value.clear()
  isAnimating.value = false
}

// ============================================================================
// Container Upgrade: Editor Sprite → Preview AnimatedSprite
// ============================================================================

/**
 * 将编辑器工厂创建的静止 Sprite 升级为播放级 AnimatedSprite
 *
 * 编辑器工厂的 createEditorAnimationSpriteContainer 为性能优化只创建 PIXI.Sprite（首帧），
 * 但预览对话框需要 PIXI.AnimatedSprite 才能播放帧序列动画。
 * 此函数检测 editor_still_sprite 并将其替换为完整的 AnimatedSprite。
 */
function upgradeToAnimatedSprite(
  obj: SceneObject,
  container: PIXI.Container,
  getTexture: (url: string) => PIXI.Texture
): void {
  if (obj.type === 'prop') {
    const propData = propStore.getProp(obj.refId)
    if (propData?.type !== 'animation' || !propData.frames?.length) return

    // 仅升级编辑器 Sprite 容器（SceneObjectRenderer 创建的已经是 AnimatedSprite）
    const stillSprite = container.getChildByName('editor_still_sprite')
    if (!stillSprite) return

    const textures = collectNonEmptyTextures(
      propData.frames.map(frame => frame.url),
      getTexture,
      PIXI.Texture.EMPTY
    )
    if (textures.length === 0) return

    container.removeChild(stillSprite)
    stillSprite.destroy()

    const animatedSprite = new PIXI.AnimatedSprite(textures)
    animatedSprite.name = 'prop_animation'
    animatedSprite.anchor.set(0.5)
    animatedSprite.animationSpeed = (propData.fps ?? 25) / 60
    restoreAnimatedSpriteStillFrame(animatedSprite, {
      stillFrameSource: propData.stillFrameSource,
      stillFrameIndex: propData.stillFrameIndex,
      url: propData.stillFrameCustomUrl,
    }, getTexture)
    container.addChild(animatedSprite)

  } else if (obj.type === 'symbol') {
    const symbolObj = obj as SymbolObject
    const materialId = symbolObj.currentMaterialId
    const material = materialId
      ? symbolObj.materials?.find(m => m.id === materialId)
      : symbolObj.materials?.[0]
    if (material?.type !== 'animation' || !material.frames?.length) return

    const stillSprite = container.getChildByName('editor_still_sprite')
    if (!stillSprite) return

    const textures = collectNonEmptyTextures(
      material.frames.map(frame => frame.url),
      getTexture,
      PIXI.Texture.EMPTY
    )
    if (textures.length === 0) return

    container.removeChild(stillSprite)
    stillSprite.destroy()

    const animatedSprite = new PIXI.AnimatedSprite(textures)
    animatedSprite.name = 'symbol_animation'
    animatedSprite.anchor.set(0.5)
    animatedSprite.animationSpeed = (material.fps ?? 12) / 60
    animatedSprite.loop = material.loop ?? true
    restoreAnimatedSpriteStillFrame(animatedSprite, {
      stillFrameSource: material.stillFrameSource,
      stillFrameIndex: material.stillFrameIndex,
      url: material.url,
    }, getTexture)
    container.addChild(animatedSprite)
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // 1. 备份当前 sceneObjectStore 数据和 renderChain
  backupSceneObjects.value = [...sceneObjectStore.setupState.objects]
  backupRenderChain.value = [...sceneObjectStore.getSceneRenderChain()]

  // 2. 准备预览对象（深拷贝 + 还原坐标偏移）
  const previewObjects = JSON.parse(JSON.stringify(props.objects)) as SceneObject[]
  if (props.restoreAnchorOffset !== false) {
    const anchor = props.editorAnchor ?? { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
    for (const obj of previewObjects) {
      if (!obj.parentId) {
        obj.x += anchor.x
        obj.y += anchor.y
      }
    }
  }

  // 3. 加载预览对象到 sceneObjectStore（保持原始 ID）
  const setup: SceneSetup = {
    camera: { x: 0, y: 0, width: 0, height: 0, zoom: 1.0 },
    objects: previewObjects,
    renderChain: props.renderChain ?? [],  // v19: 使用已保存的渲染链，避免 rebuild
  }

  loadSetupToSceneObjects(setup, { skipCamera: true, skipAmbientLight: true })

  // 4. 预加载全量资源（预览需要完整帧动画数据，而非编辑器 first-paint 最小集）
  const { collectAssets, loadAssets } = useAssetLoader()
  const { imageUrls, audioUrls } = collectAssets(
    { objects: previewObjects },
    null  // 预览不涉及 block actions
  )
  if (imageUrls.size > 0 || audioUrls.size > 0) {
    await loadAssets(
      imageUrls,
      audioUrls,
      'ObjectCollectionPreviewDialog.preload'
    )
  }
  isPreloading.value = false

  // 5. 初始化 PIXI 渲染器
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

    // 5.5 升级 prop/symbol 动画容器：
    // 编辑器工厂使用 Sprite（first-paint 优化），预览需要 AnimatedSprite 才能播放帧动画
    const sceneGraph = rendererInstance.getSceneGraph()
    const { getTexture } = useAssetLoader()
    for (const obj of sceneObjectStore.objects) {
      const objContainer = sceneGraph.getContainer(obj.id)
      if (!objContainer) continue
      upgradeToAnimatedSprite(obj, objContainer, getTexture)
    }

    // 6. 为有 animations 定义但没有 GenericAnimationPlayer 的对象补建 player
    //    useSceneGraph 仅为 prop/background 类型创建 player
    //    symbol/composite/expression 等类型需要手动补建
    const playerCache = sceneGraph.getGenericAnimationPlayers()
    for (const obj of sceneObjectStore.objects) {
      if (obj.animations && Object.keys(obj.animations).length > 0 && !playerCache.has(obj.id)) {
        const container = sceneGraph.getContainer(obj.id)
        if (container) {
          // v19 Fix: composite 对象需要 playerResolver（委托子对象变换）
          // 和 boundsProvider（union 空代理容器的动态虚拟边界）
          if (obj.type === 'composite') {
            const player = createGenericAnimationPlayer({
              target: container,
              ownerObjectId: obj.id,
              playerResolver: (targetId: string) => playerCache.get(targetId) ?? null,
            })
            player.cacheBaseTransform()
            playerCache.set(obj.id, player)
          } else {
            const player = createGenericAnimationPlayer(container)
            player.cacheBaseTransform()
            playerCache.set(obj.id, player)
          }
        }
      }
    }

    // 6. 隐藏安全区域遮罩
    const pixiApp = rendererInstance.getPixiApp()
    const ctx = pixiApp.getContext()
    if (ctx?.safeAreaOverlay) {
      ctx.safeAreaOverlay.visible = false
    }

    // 6. fitContent: 计算内容边界并自适应缩放
    setTimeout(() => {
      const stage = ctx?.stage
      if (stage) {
        // 优先使用 contentLayer 的边界，避免 stage 边界包含固定锚点图元导致 bbox 过大。
        const contentLayerBounds = ctx?.contentLayer?.getLocalBounds()
        const stageBounds = stage.getLocalBounds()
        const fitTarget = choosePreviewFitBounds(contentLayerBounds, stageBounds)
        const bounds = fitTarget.bounds

        if (bounds.width > 0 && bounds.height > 0) {
          rendererInstance.fitContent({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          })
        } else {
          rendererInstance.scrollToCanvasCenter()
        }
      }
    }, 100)

    // 7. 自动播放初始动画（如果有）
    if (animatableCount.value > 0) {
      setTimeout(() => {
        startInitialAnimations()
      }, 400)
    }
  }
})

onBeforeUnmount(() => {
  // 停止所有动画
  stopAllAnimations()

  // 清理 PIXI 渲染器
  if (renderer.value) {
    renderer.value.destroyRenderer()
  }

  // 还原 sceneObjectStore 数据和 renderChain
  if (backupSceneObjects.value.length > 0 || sceneObjectStore.objects.length === 0) {
    sceneObjectStore.initFromSetup(backupSceneObjects.value)
    sceneObjectStore.setSceneRenderChain(backupRenderChain.value)
    sceneObjectStore.rebuildEntityRenderChains()
    backupSceneObjects.value = []
    backupRenderChain.value = []
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.preview-dialog {
  background: #ffffff;
  width: 96vw;
  max-width: 1400px;
  height: 85vh;
  border-radius: 12px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.dialog-title {
  margin: 0;
  font-size: 15px;
  color: #1e293b;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-close {
  width: 30px;
  height: 30px;
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #1e293b;
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
  border-left: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  border-bottom-left-radius: 12px;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  background: #f1f5f9;
  position: relative;
  overflow: hidden;
}

/* ===== Sidebar ===== */

.info-sidebar {
  width: 280px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  border-bottom-right-radius: 12px;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 14px;
}

.info-section {
  margin-bottom: 18px;
}

.info-section h4 {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 12px;
}

.info-label {
  color: #64748b;
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
  gap: 4px;
}

.tag-chip {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border-radius: 10px;
  font-size: 11px;
}

.empty-hint {
  font-size: 12px;
  color: #94a3b8;
  padding: 4px 0;
}

/* ===== Animation Groups ===== */

.anim-group {
  margin-bottom: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}

.anim-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 12px;
  color: #475569;
}

.anim-group-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.anim-group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.anim-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid #f1f5f9;
}

.anim-item:last-child {
  border-bottom: none;
}

.anim-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.anim-name {
  font-size: 12px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anim-type-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

.anim-type-badge.track {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.anim-type-badge.playlist {
  background: rgba(168, 85, 247, 0.1);
  color: #7c3aed;
}

.anim-loop-badge {
  font-size: 10px;
  flex-shrink: 0;
}

.anim-play-btn {
  width: 26px;
  height: 26px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #475569;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.anim-play-btn:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.anim-play-btn.playing {
  background: #fef2f2;
  border-color: #ef4444;
  color: #dc2626;
}

/* ===== Object List ===== */

.object-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.object-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 11px;
  color: #475569;
}

.obj-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.obj-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== Loading Overlay ===== */

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(241, 245, 249, 0.85);
  z-index: 10;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}
</style>
