/**
 * useSceneGraph - 图层与对象管理模块
 * 
 * 职责：
 * 1. 创建、更新、删除场景对象的 Pixi 容器
 * 2. 管理 renderCache（对象ID -> Pixi容器 的映射）
 * 3. 应用对象变换（位置、缩放、旋转等）
 * 
 * 解耦点：
 * - 只管把数据变成 Pixi 对象，不管交互
 * - 不依赖 Store 的 watch，由外部调用 renderObjects
 */

import * as PIXI from 'pixi.js'
import { reactive } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import { CANVAS_CENTER_X, CANVAS_CENTER_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { Z_INDEX_BACKGROUND, Z_INDEX_CAMERA_OVERLAY, Z_INDEX_DEFAULT, Z_INDEX_GHOST } from '@/constants/zIndex'
import { createGenericAnimationPlayer, GenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import { registerCompositeContainerFactory } from '@/core/sceneObjectProviders/compositeProvider'
import { getContainerFactory, registerContainerFactory } from '@/core/sceneObjectProviders/index'
import { SceneObjectRenderer } from '@/core/SceneObjectRenderer'
import type { TextureProvider } from '@/core/TextureProvider'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import { type BackgroundObject, type CameraObject, type PropObject, type SceneObject, type ScreenEffectObject, type SymbolObject, type TextObject, useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { LightObject } from '@/types/sceneObject'
import type { SceneObjectProvider } from '@/types/SceneObjectProvider'
import type { RuntimeSceneSnapshot, RuntimeSlot, SceneContainer, ScriptBlock } from '@/types/screenplay'
import { collectSceneFontPreloadObjects, ensureFontLoaded, preloadSceneFonts } from '@/utils/fontLoader'
import { addPixiDebugInfo, updatePixiDebugInfo } from '@/utils/pixiDebug'
import { applyBlockActionsToState, calculatePrevContext, calculateSlotStates, type RuntimeCameraState, type SlotStatesResult } from '@/utils/sceneStateCalculator'
import { drawScreenEffectGraphics } from '@/utils/screenEffectRenderer'
import { getAutoTextLeading, normalizeTextContent, resolveTextGradient, resolveTextLineHeight } from '@/utils/textUtils'

export interface UseSceneGraphOptions {
  mode: 'setup' | 'action'
  /** 可选的 store 覆盖，用于数据隔离场景（如动画编辑）。不传则使用全局 sceneObjectStore */
  storeOverride?: SceneObjectProvider
}

export function useSceneGraph(options: UseSceneGraphOptions) {
  const { mode } = options
  const PIXI_TREE_DEBUG_FLAG = '__AITALK_PIXI_TREE_DEBUG__'

  function isPixiTreeDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false
    const globalEnabled = (window as unknown as Record<string, unknown>)[PIXI_TREE_DEBUG_FLAG] === true
    const localEnabled = window.localStorage?.getItem('aitalk:pixi-tree-debug') === '1'
    return globalEnabled || localEnabled
  }

  function logPixiTree(event: string, payload: Record<string, unknown>): void {
    if (!isPixiTreeDebugEnabled()) return
    console.warn(`[PixiTreeDebug][SceneGraph] ${event}`, payload)
  }

  const backgroundStore = useBackgroundStore()
  const propStore = usePropStore()
  // v7.3: effectStore 已删除
  const _globalStore = useSceneObjectStore()
  const sceneObjectStore: SceneObjectProvider = options.storeOverride ?? _globalStore

  // v14.x: 统一渲染器
  const { getTexture: _getTexture } = useAssetLoader()
  const { getImageUrl: _getImageUrl } = useAssetImage()
  const textureProvider: TextureProvider = {
    getTexture: (url: string) => _getTexture(url),
    getImageUrl: (url: string) => _getImageUrl(url)
  }
  const sceneObjectRenderer = new SceneObjectRenderer(
    textureProvider,
    {
      propStore,
      backgroundStore,
      expressionStore: useExpressionStore()
    }
  )
  const noOpObjectStateHost = {
    getObjectDimensions: () => undefined,
    setObjectDimensions: () => undefined,
  }
  const textFontRenderTokens = new WeakMap<PIXI.Container, number>()

  async function ensureTextFontForRender(container: PIXI.Container, textObj: TextObject): Promise<boolean> {
    const token = (textFontRenderTokens.get(container) ?? 0) + 1
    textFontRenderTokens.set(container, token)
    await ensureFontLoaded(textObj.fontFamily ?? 'Noto Sans SC', textObj.content)
    return !container.destroyed && textFontRenderTokens.get(container) === token
  }

  function isAmbientLightObject(obj: SceneObject | undefined | null): obj is LightObject {
    return !!obj && obj.type === 'light' && (obj as LightObject).lightType === 'ambient'
  }

  // P1: 注册各类型的容器工厂（轻量注册：复用本地函数）
  registerContainerFactory('background', (obj) => createBackgroundContainer(obj as BackgroundObject))
  registerContainerFactory('camera', (obj) => Promise.resolve(createCameraContainer(obj as CameraObject)))
  registerContainerFactory('text', async (obj) => {
    const textObj = obj as TextObject
    await ensureFontLoaded(textObj.fontFamily ?? 'Noto Sans SC', textObj.content)
    return createTextContainer(textObj)
  })
  registerContainerFactory('prop', (obj) => createPropContainer(obj as PropObject))
  registerContainerFactory('screen_effect', (obj) => Promise.resolve(createScreenEffectContainer(obj as ScreenEffectObject)))
  // Clip-Mask Phase 1：mask 对象本身不渲染任何内容，只需一个空 Container 持有
  // worldTransform，供 maskRenderer.applyAllMasks 计算几何。
  registerContainerFactory('mask', (obj) => {
    const container = new PIXI.Container()
    container.name = `mask_container_${obj.id}`
    container.visible = true
    return Promise.resolve(container)
  })
  registerContainerFactory('symbol', async (obj) => {
    // v16: 预加载素材纹理后再创建容器
    const symbolObj = obj as SymbolObject
    const materialId = symbolObj.currentMaterialId
    const material = materialId
      ? symbolObj.materials?.find(m => m.id === materialId)
      : symbolObj.materials?.[0]
    if (material) {
      await preloadEditorSymbolMaterialTextures(material)
    }
    const container = createEditorSymbolContainer(obj)
    return container
  })
  // v18: 独立表情容器工厂（预加载表情纹理）
  registerContainerFactory('expression', async (obj) => {
    const expressionStore = useExpressionStore()
    const expr = expressionStore.getExpression(obj.refId)
    if (expr) {
      const urls = new Set<string>()
      if (expr.defaultFrame?.url) urls.add(expr.defaultFrame.url)
      expr.speakingFrames?.forEach(frame => {
        if (frame?.url) urls.add(frame.url)
      })
      if (urls.size > 0) {
        const { loadAssets } = useAssetLoader()
        await loadAssets(urls, new Set(), `SceneGraph.expression.create(${obj.id})`)
      }
    }
    return sceneObjectRenderer.createExpressionContainer(obj)
  })
  // v25: 光源容器工厂（编辑器指示器，不参与实际渲染）
  registerContainerFactory('light', (obj) => {
    const container = new PIXI.Container()
    container.name = `light_container_${obj.id}`
    // 光源使用与选择框一致的固定矩形命中区，避免只能点中图标本身
    container.eventMode = 'static'
    container.hitArea = new PIXI.Rectangle(-96, -96, 192, 192)
    return Promise.resolve(container)
  })
  // P2: composite 容器工厂（通过 compositeProvider 注册，注入 getObjects 回调）
  registerCompositeContainerFactory(() => sceneObjectStore.objects)

  /**
   * v16: 预加载 Symbol 素材的纹理到全局 textureCache
   * blob URL 直接通过 Image 创建 PIXI.Texture；项目文件路径走标准 loadAssets 管线
   */
  function collectAnimatedFirstPaintUrls(options: {
    url?: string | undefined
    backgroundImage?: string | undefined
    stillFrameCustomUrl?: string | undefined
    frames?: { url?: string }[] | undefined
  }): string[] {
    const urls: string[] = []
    if (options.stillFrameCustomUrl) urls.push(options.stillFrameCustomUrl)
    if (options.url) urls.push(options.url)
    if (options.backgroundImage) urls.push(options.backgroundImage)
    const firstFrameUrl = options.frames?.find(frame => frame.url)?.url
    if (firstFrameUrl) urls.push(firstFrameUrl)
    return Array.from(new Set(urls))
  }

  async function preloadSymbolMaterialTextures(material: { type: string; url?: string; frames?: { url?: string }[] }) {
    const urls = new Set<string>()
    if (material.type === 'static') {
      if (material.url) urls.add(material.url)
    } else if (material.frames) {
      for (const frame of material.frames) {
        if (frame.url) urls.add(frame.url)
      }
      // 静止帧 URL
      if (material.url) urls.add(material.url)
    }
    if (urls.size === 0) return

    const { loadAssets } = useAssetLoader()
    await loadAssets(urls, new Set(), 'SceneGraph.symbol.fullMaterial')
  }

  async function preloadEditorSymbolMaterialTextures(material: { type: string; url?: string; frames?: { url?: string }[] }) {
    const urls = new Set<string>(collectAnimatedFirstPaintUrls({
      url: material.url,
      frames: material.frames
    }))
    if (material.type === 'static' && material.url) {
      urls.add(material.url)
    }
    if (urls.size === 0) return

    const { loadAssets } = useAssetLoader()
    await loadAssets(urls, new Set(), 'SceneGraph.symbol.firstPaintMaterial')
  }

  function resolveEditorAnimationStillUrl(options: {
    stillFrameSource: 'frame' | 'custom' | undefined
    stillFrameIndex: number | undefined
    customUrl: string | undefined
    posterUrl: string | undefined
    frames: { url?: string }[] | undefined
  }): string | undefined {
    if (options.stillFrameSource === 'custom' && options.customUrl) {
      return options.customUrl
    }

    if (options.stillFrameSource === 'frame') {
      const indexedUrl = options.frames?.[options.stillFrameIndex ?? 0]?.url
      if (indexedUrl) return indexedUrl
    }

    return options.frames?.find(frame => frame.url)?.url ?? options.posterUrl
  }

  function createEditorAnimationSpriteContainer(options: {
    objectId: string
    zIndex: number | undefined
    stillUrl: string | undefined
  }): PIXI.Container {
    const container = new PIXI.Container()
    container.name = options.objectId
    container.zIndex = options.zIndex ?? 0

    if (options.stillUrl) {
      const resolvedUrl = textureProvider.getImageUrl(options.stillUrl)
      const texture = textureProvider.getTexture(resolvedUrl || options.stillUrl)
      const sprite = new PIXI.Sprite(texture)
      sprite.name = 'editor_still_sprite'
      sprite.anchor.set(0.5)
      container.addChild(sprite)
    }

    return container
  }

  function createEditorSymbolContainer(obj: SceneObject): PIXI.Container {
    const symbolObj = obj as SymbolObject
    const materialId = symbolObj.currentMaterialId
    const material = materialId
      ? symbolObj.materials?.find(m => m.id === materialId)
      : symbolObj.materials?.[0]

    if (material?.type !== 'animation') {
      return sceneObjectRenderer.createSymbolContainer(obj)
    }

    const stillUrl = resolveEditorAnimationStillUrl({
      stillFrameSource: material.stillFrameSource,
      stillFrameIndex: material.stillFrameIndex,
      customUrl: material.stillFrameSource === 'custom' ? material.url : undefined,
      posterUrl: material.url,
      frames: material.frames,
    })

    const container = createEditorAnimationSpriteContainer({
      objectId: obj.id,
      zIndex: obj.zIndex,
      stillUrl,
    })

    ; (container as PIXI.Container & { _renderedMaterialId?: string })._renderedMaterialId = material.id
    return container
  }

  function createEditorPropContainer(obj: PropObject): PIXI.Container {
    const propData = propStore.getProp(obj.refId)
    if (propData?.type !== 'animation') {
      return sceneObjectRenderer.createPropContainer(obj as unknown as import('@/types/sceneObject').SceneObject)
    }

    const stillUrl = resolveEditorAnimationStillUrl({
      stillFrameSource: propData.stillFrameSource,
      stillFrameIndex: propData.stillFrameIndex,
      customUrl: propData.stillFrameCustomUrl,
      posterUrl: propData.url,
      frames: propData.frames,
    })

    return createEditorAnimationSpriteContainer({
      objectId: obj.id,
      zIndex: obj.zIndex,
      stillUrl,
    })
  }

  // v11.0: 通用动画播放器缓存 (支持 Prop 和 Background)
  const genericAnimationPlayerCache = new Map<string, GenericAnimationPlayer>()

  // 渲染缓存（对象ID -> PIXI容器）
  const renderCache = new Map<string, PIXI.Container>()



  // 渲染锁
  let isRendering = false
  let pendingRender = false

  // Action Mode 状态缓存
  let currentScene: SceneContainer | null = null
  let currentBlock: ScriptBlock | null = null
  let cachedPrevContext: RuntimeSceneSnapshot | null = null
  let cachedPrevContextBlockId: string | null = null
  const slotStatesCache = new Map<number, SlotStatesResult>()

  // ==================== Ghost Mode State ====================
  // Ghost Container 缓存 (objectId -> ghost PIXI.Container)
  const ghostContainerCache = new Map<string, PIXI.Container>()
  // Ghost Camera Container
  let ghostCameraContainer: PIXI.Container | null = null
  // 当前 Slot 索引 (用于 Ghost 计算)
  let currentSlotIndex = 0
  // v8.6: 当前 Block 的 Slots (从 Renderer 迁移至此)
  let currentSlots: RuntimeSlot[] = []
  // 当前 Slot 状态结果缓存
  let currentSlotStates: SlotStatesResult | null = null

  /**
   * 获取 Action Mode 下当前 Slot 计算出的对象状态
   *
   * v21: applySlotState 已将评估结果写入 runtimeObjects，
   * sceneObjectStore.getObject(obj.id) 在 Action Mode 下直接返回 runtime 值。
   * obj 参数可能已经是 runtimeObjects 中的对象（来自 sceneObjectStore.objects），
   * 此时直接返回即可。
   */
  function getActionModeSlotObjectState(obj: SceneObject): SceneObject {
    return sceneObjectStore.getObject(obj.id) ?? obj
  }

  function clearActionModeCaches() {
    cachedPrevContext = null
    cachedPrevContextBlockId = null
    slotStatesCache.clear()
    currentSlotStates = null
  }

  function getPrevContext(): RuntimeSceneSnapshot | null {
    if (!currentScene || !currentBlock) return null

    if (cachedPrevContext && cachedPrevContextBlockId === currentBlock.id) {
      return cachedPrevContext
    }

    cachedPrevContext = calculatePrevContext(currentScene, currentBlock.id)
    cachedPrevContextBlockId = currentBlock.id
    return cachedPrevContext
  }

  /**
   * 设置Action Mode的上下文（异步版本，会预加载资源）
   */
  async function setActionModeContext(scene: SceneContainer, block: ScriptBlock) {
    currentScene = scene
    currentBlock = block
    // 清除状态缓存，强制重新计算
    clearActionModeCaches()

    // 预加载 Action Mode 中的覆盖素材
    await preloadActionModeAssets(scene, block)
  }

  /**
   * 清除Action Mode上下文
   */
  function clearActionModeContext() {
    currentScene = null
    currentBlock = null
    clearActionModeCaches()
    clearGhostContainers()
  }

  // ==================== Ghost Mode Functions ====================

  /**
   * 更新当前 Slot 索引并重新计算 Ghost 状态
   * @param slotIndex 新的 Slot 索引
   */
  function updateSlotIndex(slotIndex: number) {
    // console.log('[Ghost Debug] updateSlotIndex called:', slotIndex)
    // console.log('[Ghost Debug] currentScene:', currentScene ? 'exists' : 'null')
    // console.log('[Ghost Debug] currentBlock:', currentBlock ? currentBlock.id : 'null')

    currentSlotIndex = slotIndex
    const cachedSlotStates = slotStatesCache.get(slotIndex)
    if (cachedSlotStates) {
      currentSlotStates = cachedSlotStates
      return
    }

    // 清除之前的 Ghost 状态缓存
    currentSlotStates = null

    // 如果有有效的上下文，重新计算状态
    if (currentScene && currentBlock) {
      // console.log('[Ghost Debug] Calculating slot states...')
      const prevContext = getPrevContext()
      currentSlotStates = calculateSlotStates(currentScene, currentBlock, slotIndex, prevContext ?? undefined)
      slotStatesCache.set(slotIndex, currentSlotStates)
      // console.log('[Ghost Debug] Calculated states:', currentSlotStates)
      // console.log('[Ghost Debug] Objects with ghost:',
      //   Array.from(currentSlotStates.objects.entries())
      //     .filter(([_, v]) => v.ghost !== null)
      //     .map(([k, _]) => k)
      // )
    } else {
      // console.log('[Ghost Debug] No context, skipping calculation')
    }
  }

  /**
   * 获取当前 Slot 的 Ghost/Real 状态（写入管线专用）
   * 仅供 applySlotState / applySlotStateSilently 等写入路径使用。
   * 渲染层应使用 getGhostData() 获取 ghost 专用数据。
   */
  function getGhostStates(): SlotStatesResult | null {
    return currentSlotStates
  }

  /**
   * v21: 获取 Ghost 专用数据（仅供 ghost 渲染使用）
   *
   * 从 currentSlotStates 中提取 ghost 部分，不包含 real 状态。
   * 渲染层应使用此 API而非 getGhostStates()，
   * 避免意外读取 slotStates.real 导致状态分叉。
   */
  function getGhostData(): {
    objects: Map<string, import('@/types/sceneObject').SceneObject | null>
    camera: import('@/utils/sceneStateCalculator').RuntimeCameraState | null
  } | null {
    if (!currentSlotStates) return null
    const ghostObjects = new Map<string, import('@/types/sceneObject').SceneObject | null>()
    for (const [id, result] of currentSlotStates.objects) {
      ghostObjects.set(id, result.ghost)
    }
    return {
      objects: ghostObjects,
      camera: currentSlotStates.camera.ghost,
    }
  }

  /**
   * 获取当前 Slot 索引
   */
  function getCurrentSlotIndex(): number {
    return currentSlotIndex
  }

  // ==================== v8.6: P0 统一状态管理 ====================

  /**
   * 设置当前 Block 的 Slots
   * @param slots RuntimeSlot 数组
   */
  function setSlots(slots: RuntimeSlot[]): void {
    currentSlots = slots
  }

  /**
   * 获取当前 Block 的 Slots
   */
  function getSlots(): RuntimeSlot[] {
    return currentSlots
  }

  /**
   * 获取当前 Block 的 Actions
   * 单一数据源：从 currentBlock 读取，不维护副本
   */
  function getCurrentActions(): import('@/types/screenplay').Action[] {
    return [...(currentBlock?.actions ?? [])]
  }

  /**
   * 获取当前 Block
   */
  function getCurrentBlock(): ScriptBlock | null {
    return currentBlock
  }

  /**
   * 获取当前 Scene
   */
  function getCurrentScene(): SceneContainer | null {
    return currentScene
  }

  /**
   * 创建 Ghost 容器 (半透明 + 灰度)
   * @param originalContainer 原始对象容器
   * @param objectId 对象ID
   */
  function createGhostContainer(originalContainer: PIXI.Container, objectId: string): PIXI.Container {
    // 检查缓存中是否已有
    const existingGhost = ghostContainerCache.get(objectId)
    if (existingGhost) {
      return existingGhost
    }

    // 创建 Ghost 容器
    const ghostContainer = new PIXI.Container()
    ghostContainer.name = `ghost_${objectId}`
    ghostContainer.alpha = 0.4

    // 防御：检查 originalContainer 是否已被销毁（position 为 null）
    if (!originalContainer.position) {
      ghostContainerCache.set(objectId, ghostContainer)
      return ghostContainer
    }

    // 复制位置和变换
    ghostContainer.position.copyFrom(originalContainer.position)
    ghostContainer.scale.copyFrom(originalContainer.scale)
    ghostContainer.rotation = originalContainer.rotation
    ghostContainer.pivot.copyFrom(originalContainer.pivot)

    // 深度克隆子元素
    cloneChildrenRecursive(originalContainer, ghostContainer)

    // Ghost 不使用灰度滤镜，只使用半透明效果

    // 标记为不可交互
    ghostContainer.eventMode = 'none'
    ghostContainer.interactiveChildren = false

    // 设置 Ghost 的 zIndex
    ghostContainer.zIndex = Z_INDEX_GHOST

    // console.log('[Ghost Debug] Created ghost with', ghostContainer.children.length, 'children')

    ghostContainerCache.set(objectId, ghostContainer)
    return ghostContainer
  }

  /**
   * 递归克隆容器的子元素
   */
  function cloneChildrenRecursive(source: PIXI.Container, target: PIXI.Container) {
    for (const child of source.children) {
      let clonedChild: PIXI.DisplayObject | null = null

      if (child instanceof PIXI.Sprite) {
        // 克隆 Sprite
        const sprite = new PIXI.Sprite(child.texture)
        sprite.position.copyFrom(child.position)
        sprite.scale.copyFrom(child.scale)
        sprite.rotation = child.rotation
        sprite.anchor.copyFrom(child.anchor)
        sprite.alpha = child.alpha
        sprite.visible = child.visible
        sprite.pivot.copyFrom(child.pivot)
        clonedChild = sprite
      } else if (child instanceof PIXI.Graphics) {
        // 克隆 Graphics (简化：只复制几何数据)
        const graphics = child.clone()
        clonedChild = graphics
      } else if (child instanceof PIXI.Container) {
        // 递归克隆容器
        const container = new PIXI.Container()
        container.position.copyFrom(child.position)
        container.scale.copyFrom(child.scale)
        container.rotation = child.rotation
        container.alpha = child.alpha
        container.visible = child.visible
        container.pivot.copyFrom(child.pivot)
        cloneChildrenRecursive(child as PIXI.Container, container)
        clonedChild = container
      }

      if (clonedChild) {
        clonedChild.name = child.name
        target.addChild(clonedChild)
      }
    }
  }

  /**
   * 创建 Ghost 相机容器
   * v8.3: 使用实线渲染，边线粗度与实际相机一致
   * @param cameraState 相机状态
   * @param baseWidth 基准宽度
   * @param baseHeight 基准高度
   */
  function createGhostCameraContainer(cameraState: RuntimeCameraState, baseWidth: number, baseHeight: number): PIXI.Container {
    if (ghostCameraContainer) {
      // 更新位置
      const graphics = ghostCameraContainer.getChildByName('ghost_camera_border') as unknown as PIXI.Graphics
      if (graphics) {
        graphics.clear()
        const scaledWidth = baseWidth / cameraState.zoom
        const scaledHeight = baseHeight / cameraState.zoom

        // v8.3: 使用实线绘制，线宽与实际相机一致（20）
        graphics.lineStyle(20, 0x888888, 0.6)
        graphics.drawRect(0, 0, scaledWidth, scaledHeight)

        ghostCameraContainer.position.set(
          cameraState.x - scaledWidth / 2,
          cameraState.y - scaledHeight / 2
        )
      }
      return ghostCameraContainer
    }

    const container = new PIXI.Container()
    container.name = 'ghost_camera_container'

    const scaledWidth = baseWidth / cameraState.zoom
    const scaledHeight = baseHeight / cameraState.zoom

    const graphics = new PIXI.Graphics()
    graphics.name = 'ghost_camera_border'
    // v8.3: 使用实线绘制，线宽与实际相机一致（20）
    graphics.lineStyle(20, 0x888888, 0.6)
    graphics.drawRect(0, 0, scaledWidth, scaledHeight)

    container.addChild(graphics)
    container.position.set(
      cameraState.x - scaledWidth / 2,
      cameraState.y - scaledHeight / 2
    )
    container.alpha = 0.6
    container.eventMode = 'none'

    ghostCameraContainer = container
    return container
  }


  /**
   * 清除所有 Ghost 容器
   */
  function clearGhostContainers() {
    for (const [_id, container] of ghostContainerCache) {
      if (container.parent) {
        container.parent.removeChild(container)
      }
      container.destroy({ children: true })
    }
    ghostContainerCache.clear()

    if (ghostCameraContainer) {
      if (ghostCameraContainer.parent) {
        ghostCameraContainer.parent.removeChild(ghostCameraContainer)
      }
      ghostCameraContainer.destroy({ children: true })
      ghostCameraContainer = null
    }
  }

  /**
   * 获取 Ghost 容器缓存
   */
  function getGhostContainer(objectId: string): PIXI.Container | undefined {
    return ghostContainerCache.get(objectId)
  }

  /**
   * 获取 Ghost 相机容器
   */
  function getGhostCameraContainer(): PIXI.Container | null {
    return ghostCameraContainer
  }

  /**
   * 预加载 Action Mode 中 set_character 动作的覆盖素材
   * 解决初次进入 Action Mode 时覆盖素材未渲染的问题
   */
  async function preloadActionModeAssets(scene: SceneContainer, block: ScriptBlock) {
    const { collectEditorFirstPaintAssets, loadAssets } = useAssetLoader()
    // v8.2: 传入 prevContext 以便正确预加载 set_character action 中的表情
    // 否则 collectAssets 无法通过 action.target 找到对应的角色信息
    const prevContext = getPrevContext()
    if (!prevContext) {
      return
    }
    const { imageUrls, audioUrls } = collectEditorFirstPaintAssets(prevContext, block)
    const fontPreloadObjects = collectSceneFontPreloadObjects(prevContext.objects, [block])
    const preloadTasks: Promise<unknown>[] = [
      preloadSceneFonts(fontPreloadObjects),
    ]

    if (imageUrls.size > 0 || audioUrls.size > 0) {
      preloadTasks.push(loadAssets(imageUrls, audioUrls, `SceneGraph.preloadActionModeAssets(${scene.id}/${block.id})`))
    }

    await Promise.all(preloadTasks)
  }


  /**
   * 创建对象容器
   * P1: 通过 ContainerFactory registry 分发，替代 switch(obj.type)
   */
  async function createObjectContainer(obj: SceneObject): Promise<PIXI.Container | null> {
    const factory = getContainerFactory(obj.type)
    let container: PIXI.Container | null = null

    if (factory) {
      container = await factory(obj)
    } else {
      console.warn('[SceneGraph] 未注册的对象类型:', obj.type)
    }

    if (container) {
      const latestObj = sceneObjectStore.getObject(obj.id) ?? obj
      if (latestObj.type === 'light') {
        sceneObjectRenderer.applyObjectState(container, latestObj, latestObj, noOpObjectStateHost)
      } else {
        applyTransform(container, latestObj)
      }
      
      const isSpawned = (latestObj as unknown as { spawned?: boolean }).spawned !== false
      if (isSpawned) {
        // 穿透列表检查
        const ptEntry = passThroughMap.get(latestObj.id)
        if (ptEntry) {
          container.visible = ptEntry.visible
          container.eventMode = 'none'
          container.interactiveChildren = false
        } else {
          container.visible = latestObj.visible
          // 恢复正常交互状态（应对从穿透列表移除的情况）
          container.eventMode = 'static'
          container.interactiveChildren = true
        }
      }

      addPixiDebugInfo(container, latestObj)

      // v20: composite 对象创建 GenericAnimationPlayer（委托模式）
      // union 子对象在容器内后，getLocalBounds() 自然生效，不再需要 boundsProvider
      if (latestObj.type === 'composite') {
        const player = createGenericAnimationPlayer({
          target: container,
          ownerObjectId: latestObj.id,
          playerResolver: (targetId: string) => {
            return genericAnimationPlayerCache.get(targetId) ?? null
          },
        })
        player.cacheBaseTransform()
        genericAnimationPlayerCache.set(latestObj.id, player)
      } else if (latestObj.type === 'symbol' || latestObj.type === 'expression') {
        // v18: symbol/expression 对象也需要 GenericAnimationPlayer
        // 支持独立动画和作为 composite 后代时的 targetObjectId 分发
        const player = createGenericAnimationPlayer({
          target: container,
          ownerObjectId: latestObj.id,
        })
        player.cacheBaseTransform()
        genericAnimationPlayerCache.set(latestObj.id, player)
      }
    }
    return container
  }

  /**
   * Phase 3: 创建画面特效容器 — 委托 SOR 统一入口
   */
  function createScreenEffectContainer(obj: ScreenEffectObject): PIXI.Container {
    const { container } = sceneObjectRenderer.createScreenEffectContainer(
      `screen_effect_container_${obj.id}`,
      obj.params,
      obj.width,
      obj.height,
      obj.zIndex ?? 1000
    )
    return container
  }

  /**
   * Phase 1: 绘制画面特效图形 — 已提取到 @/utils/screenEffectRenderer.ts
   * createScreenEffectContainer / updateScreenEffectByState 直接使用顶部 import 的 drawScreenEffectGraphics
   */

  /**
   * 创建背景容器
   */
  async function createBackgroundContainer(obj: BackgroundObject): Promise<PIXI.Container> {
    const container = new PIXI.Container()
    const canvasWidth = CANVAS_WIDTH
    const canvasHeight = CANVAS_HEIGHT

    const shouldAutoSize = obj.width <= 0 || obj.height <= 0
    const shouldAutoPosition = (obj.x === 0 && obj.y === 0) ||
      (obj.x === CANVAS_CENTER_X && obj.y === CANVAS_CENTER_Y)
    const shouldDefaultFullCanvas =
      obj.width === canvasWidth &&
      obj.height === canvasHeight &&
      shouldAutoPosition &&
      obj.scaleX === 1 &&
      obj.scaleY === 1 &&
      obj.rotation === 0
    const shouldAutoLayout = shouldAutoSize || shouldDefaultFullCanvas

    const backgroundData = backgroundStore.getBackground(obj.refId)
    if (!backgroundData) {
      console.warn('[SceneGraph] 找不到背景:', obj.refId)
      return container
    }

    // 1. 动态背景
    if (backgroundData.type === 'animation') {
      const frames = backgroundData.frames ?? []

      if (frames.length > 0) {
        const frameUrls = collectAnimatedFirstPaintUrls({
          url: backgroundData.url,
          backgroundImage: backgroundData.backgroundImage,
          stillFrameCustomUrl: backgroundData.stillFrameCustomUrl,
          frames
        })
        const urlsToLoad = new Set(frameUrls)

        if (urlsToLoad.size > 0) {
          const { loadAssets, getTexture } = useAssetLoader()
          await loadAssets(urlsToLoad, new Set(), `SceneGraph.background.create(${obj.id})`)

          // 创建纹理数组
          const textures = frameUrls.map(url => getTexture(url))

          // 等待第一帧加载以获取尺寸
          const firstTexture = textures[0]
          if (firstTexture && !firstTexture.valid) {
            await new Promise<void>(resolve => {
              firstTexture.baseTexture.once('loaded', () => resolve())
            })
          }

          const animatedSprite = new PIXI.AnimatedSprite(textures)
          animatedSprite.name = 'background_animation'
          animatedSprite.anchor.set(0) // 背景通常使用 0,0 锚点
          animatedSprite.animationSpeed = (backgroundData.fps ?? 25) / 60
          animatedSprite.loop = backgroundData.loop ?? true

          const validTx = textures.find(t => t?.valid)
          if (validTx) {
            if (shouldAutoLayout) {
              // 仅当原图高度 >= 画布高度时才缩放到画布高度
              // 小于画布高度的背景保持原始尺寸，避免放大导致模糊
              const needsScale = validTx.height >= canvasHeight
              const scale = needsScale ? canvasHeight / validTx.height : 1
              const scaledWidth = validTx.width * scale
              const scaledHeight = validTx.height * scale
              const updates: Record<string, number> = {
                width: scaledWidth,
                height: scaledHeight
              }
              if (shouldAutoPosition) {
                // x,y 是中心点坐标（applyTransform 中 pivot 设为几何中心）
                updates['x'] = CANVAS_CENTER_X
                updates['y'] = CANVAS_CENTER_Y
              }
              // v24: updateSetupObject 同时写入 setupState + runtimeState + episode
              sceneObjectStore.updateSetupObject(obj.id, updates as Partial<SceneObject>)

              animatedSprite.width = scaledWidth
              animatedSprite.height = scaledHeight
            } else if (obj.width > 0 && obj.height > 0) {
              animatedSprite.width = obj.width
              animatedSprite.height = obj.height
            }
          }

          // v11.1: 默认停止在第 0 帧
          animatedSprite.gotoAndStop(0)

          container.addChild(animatedSprite)
        }
      }
    }

    // 2. 静态背景 (或者是动画背景加载失败/无帧时的回退，或者只是普通的静态背景)
    // 只有当容器没有子对象时（即上面没有成功创建动画）才执行
    if (container.children.length === 0) {
      if (backgroundData.url) {
        // Refactored to use useAssetLoader
        const { loadAssets, getTexture } = useAssetLoader()
        await loadAssets(new Set([backgroundData.url]), new Set(), `SceneGraph.background.fallback(${obj.id})`)

        // getTexture handles blob URLs internally if loaded via loadAssets
        const texture = getTexture(backgroundData.url)
        if (texture && texture !== PIXI.Texture.EMPTY) {
          const sprite = new PIXI.Sprite(texture)
          sprite.name = 'background_sprite'
          sprite.anchor.set(0)

          // Update dimensions logic
          // v7.21: 只有在首次创建时(width和height为0)才自动计算居中位置
          // 如果用户已经拖动过背景,改变了位置,那么就保留用户的位置
          if (texture.valid) {
            // 仅当原图高度 >= 画布高度时才缩放到画布高度
            // 小于画布高度的背景保持原始尺寸，避免放大导致导出视频模糊
            const needsScale = texture.height >= canvasHeight
            const scale = needsScale ? canvasHeight / texture.height : 1
            const scaledWidth = texture.width * scale
            const scaledHeight = texture.height * scale

            if (shouldAutoLayout) {
              const updates: Record<string, number> = {
                width: scaledWidth,
                height: scaledHeight
              }
              if (shouldAutoPosition) {
                // x,y 是中心点坐标（applyTransform 中 pivot 设为几何中心）
                updates['x'] = CANVAS_CENTER_X
                updates['y'] = CANVAS_CENTER_Y
              }
              // v24: updateSetupObject 同时写入 setupState + runtimeState + episode
              sceneObjectStore.updateSetupObject(obj.id, updates as Partial<SceneObject>)

              // Force sprite size to match desired visual size
              // This is critical because container.scale is usually 1
              sprite.width = scaledWidth
              sprite.height = scaledHeight
            } else {
              if (obj.width > 0 && obj.height > 0) {
                sprite.width = obj.width
                sprite.height = obj.height
              } else {
                sprite.width = scaledWidth
                sprite.height = scaledHeight
              }
            }
          }

          container.addChild(sprite)
        }
      }


      if (container.children.length === 0) {
        if (!backgroundData.url) {
          console.warn('[SceneGraph] 背景没有URL，使用占位符:', backgroundData)
        } else {
          console.warn('[SceneGraph] 背景图片加载失败，使用占位符:', backgroundData.url)
        }

        // 创建占位图显示，避免对象不可见
        const graphics = new PIXI.Graphics()
        graphics.name = 'background_placeholder'
        graphics.beginFill(0x333333)
        graphics.drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT) // 使用默认画布尺寸
        graphics.endFill()

        const text = new PIXI.Text(backgroundData.url ? 'Background Load Failed' : 'No Image', {
          fontFamily: 'Arial',
          fontSize: 48,
          fill: 0xffffff,
          align: 'center'
        })
        text.anchor.set(0.5)
        text.position.set(CANVAS_CENTER_X, CANVAS_CENTER_Y)
        graphics.addChild(text)

        container.addChild(graphics)

        // 更新对象尺寸，使其可选中
        sceneObjectStore.updateObject(obj.id, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT
        })
      }
    }

    // v11.0: 为背景创建 GenericAnimationPlayer
    // 无论是 static 还是 animation，都创建 Player 以便统一控制 (例如 Transform 轨道)
    // 并放入 genericAnimationPlayerCache 统一管理
    const player = createGenericAnimationPlayer({
      target: container,
      ownerObjectId: obj.id,
      objectType: 'background',
      objectId: obj.refId,
    })
    // Cache the base transforms that applyTransform set up (e.g. initial rotation/scale)
    player.cacheBaseTransform()

    genericAnimationPlayerCache.set(obj.id, player)

    return container
  }



  /**
   * 创建相机容器
   */
  function createCameraContainer(obj: CameraObject): PIXI.Container {
    const container = new PIXI.Container()
    container.name = `camera_container_${obj.id}`

    const graphics = new PIXI.Graphics()
    graphics.name = 'camera_border'
    graphics.lineStyle(20, 0x00ff00)
    graphics.beginFill(0x000000, 0.001)
    graphics.drawRect(0, 0, obj.width, obj.height)
    graphics.endFill()

    container.addChild(graphics)

    return container
  }

  /**
   * 创建文本容器
   */
  function createTextContainer(obj: TextObject): PIXI.Container {
    const container = new PIXI.Container()
    const normalizedContent = normalizeTextContent(obj.content)
    const effectiveWordWrap = obj.wordWrap ?? true
    const boxMode = obj.textBoxMode ?? 'auto-size'
    const lineHeightInfo = resolveTextLineHeight(obj.fontFamily, obj.fontSize, obj.lineHeight)
    const gradient = obj.fillType === 'linear_gradient'
      ? resolveTextGradient(obj.gradientStops, obj.gradientAngle)
      : null
    const fillValue = gradient ? gradient.colors : (obj.color ?? '#ffffff')

    const styleOpts: Partial<PIXI.ITextStyle> = {
      fontFamily: obj.fontFamily,
      fontSize: obj.fontSize,
      fill: fillValue,
      align: obj.align,
      // 强制可断字，避免超宽 token（尤其中文/无空格串）造成“看起来像空行”的异常断行
      breakWords: true,
      // 保留换行但折叠多余空白，避免行尾空格单独占一行
      whiteSpace: 'pre-line',
      fontWeight: obj.fontWeight ?? 'normal',
      fontStyle: obj.fontStyle ?? 'normal',
      // Phase 1: 描边
      strokeThickness: obj.strokeThickness ?? 0,
      // Phase 1: 投影
      dropShadow: obj.dropShadow ?? false,
      dropShadowColor: obj.dropShadowColor ?? '#000000',
      dropShadowBlur: obj.dropShadowBlur ?? 4,
      dropShadowAngle: obj.dropShadowAngle ?? Math.PI / 4,
      dropShadowDistance: obj.dropShadowDistance ?? 4,
      // Phase 1: 间距
      letterSpacing: obj.letterSpacing ?? 0,
    }
    if (boxMode === 'auto-width' || boxMode === 'auto-size') {
      styleOpts.wordWrap = false
    } else {
      const wrapWidth = boxMode === 'fixed'
        ? Math.max(50, obj.width ?? 400)
        : Math.max(50, obj.wordWrapWidth ?? 400)
      styleOpts.wordWrap = effectiveWordWrap
      styleOpts.wordWrapWidth = wrapWidth
    }
    if (gradient) {
      styleOpts.fillGradientType = gradient.gradientType
      styleOpts.fillGradientStops = gradient.gradientStops
    }
    if (obj.stroke) styleOpts.stroke = obj.stroke
    // 始终设置 lineHeight：自动与显式统一通过 resolveTextLineHeight 解析
    styleOpts.lineHeight = lineHeightInfo.lineHeight
    styleOpts.leading = getAutoTextLeading(
      obj.fontFamily,
      obj.fontSize,
      lineHeightInfo.source === 'explicit' ? lineHeightInfo.lineHeight : undefined,
    )
    const text = new PIXI.Text(normalizedContent, styleOpts)
    text.name = 'text_content'
    text.anchor.set(0.5)
    container.addChild(text)
    syncTextBackground(container, obj, text, boxMode)
    const existingMask = container.getChildByName('text_box_mask') as PIXI.Graphics | undefined
    if (boxMode === 'fixed' && obj.width > 0 && obj.height > 0) {
      const mask = existingMask ?? new PIXI.Graphics()
      if (!existingMask) {
        mask.name = 'text_box_mask'
      }
      mask.clear()
      mask.beginFill(0xffffff)
      mask.drawRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height)
      mask.endFill()
      if (!existingMask) container.addChild(mask)
      container.mask = mask
    } else if (existingMask) {
      container.mask = null
      container.removeChild(existingMask)
    }
    return container
  }

  function syncTextBackground(
    container: PIXI.Container,
    textObj: TextObject,
    contentNode: PIXI.Container | PIXI.Text | undefined,
    boxMode: 'auto-width' | 'auto-height' | 'auto-size' | 'fixed',
  ) {
    const enabled = textObj.textBackgroundEnabled === true
    const existing = container.getChildByName('text_background_fill') as PIXI.Graphics | undefined
    if (!enabled) {
      if (existing) {
        container.removeChild(existing)
        existing.destroy()
      }
      return
    }

    const bg = existing ?? new PIXI.Graphics()
    if (!existing) bg.name = 'text_background_fill'
    bg.clear()

    const colorHex = (textObj.textBackgroundColor ?? '#000000').replace('#', '')
    const colorNum = Number.parseInt(colorHex, 16)
    const alpha = Math.max(0, Math.min(1, textObj.textBackgroundAlpha ?? 0.35))
    const padX = Math.max(0, textObj.textBackgroundPaddingX ?? 16)
    const padY = Math.max(0, textObj.textBackgroundPaddingY ?? 10)
    const radius = Math.max(0, textObj.textBackgroundRadius ?? 8)

    let width = 0
    let height = 0
    let cx = 0
    let cy = 0
    if (boxMode === 'fixed' && textObj.width > 0 && textObj.height > 0) {
      width = textObj.width
      height = textObj.height
    } else {
      const bounds = (contentNode ?? container).getLocalBounds()
      width = bounds.width + padX * 2
      height = bounds.height + padY * 2
      cx = bounds.x + bounds.width / 2
      cy = bounds.y + bounds.height / 2
    }

    if (width <= 0 || height <= 0) {
      if (existing) {
        container.removeChild(existing)
        existing.destroy()
      }
      return
    }

    bg.beginFill(Number.isNaN(colorNum) ? 0x000000 : colorNum, alpha)
    bg.drawRoundedRect(cx - width / 2, cy - height / 2, width, height, radius)
    bg.endFill()
    if (!existing) container.addChildAt(bg, 0)
  }



  /**
   * 创建道具容器
   * v14.x: 核心精灵创建委托给 SceneObjectRenderer，保留编辑器特有的预加载和尺寸跟踪
   */
  async function createPropContainer(obj: PropObject): Promise<PIXI.Container> {
    const propData = propStore.getProp(obj.refId)

    if (!propData) {
      console.warn('[SceneGraph] 找不到道具:', obj.refId)
      return new PIXI.Container()
    }

    // 编辑器特有：先异步预加载资源
    const { loadAssets } = useAssetLoader()
    if (propData.type === 'static' && propData.url) {
      await loadAssets(new Set([propData.url]), new Set(), `SceneGraph.prop.createStatic(${obj.id})`)
    } else if (propData.type === 'animation' && propData.frames && propData.frames.length > 0) {
      const urlsToLoad = new Set(collectAnimatedFirstPaintUrls({
        url: propData.url,
        stillFrameCustomUrl: propData.stillFrameCustomUrl,
        frames: propData.frames
      }))
      if (urlsToLoad.size > 0) {
        await loadAssets(urlsToLoad, new Set(), `SceneGraph.prop.createAnimation(${obj.id})`)
      }
    }

    // v14.x: 委托给统一渲染器创建容器
    const container = createEditorPropContainer(obj)

    // Prop 在编辑态创建期不回写 store 尺寸，避免触发深度 watch 导致首屏 render 抖动。
    const measureStart = performance.now()

    // v11.0: 为所有道具创建 GenericAnimationPlayer（如果需要）
    // 只有 animation 类型的道具才真正需要，或者是 static 类型但可能被后续动画控制
    // 为一致性，我们对所有道具容器尝试创建 player
    void measureStart
    const player = createGenericAnimationPlayer({
      target: container,
      ownerObjectId: obj.id,
      objectType: 'prop',
      objectId: (obj).refId,
    })
    player.cacheBaseTransform()
    genericAnimationPlayerCache.set(obj.id, player)

    return container
  }

  // v7.3: createEffectContainer 函数已删除，特效已合并到道具

  /**
   * 更新对象容器
   */
  async function updateObjectContainer(container: PIXI.Container, obj: SceneObject): Promise<void> {
    if (obj.type === 'light') {
      const latestObj = sceneObjectStore.getObject(obj.id) ?? obj
      sceneObjectRenderer.applyObjectState(container, latestObj, latestObj, noOpObjectStateHost)

      const isSpawned = (latestObj as unknown as { spawned?: boolean }).spawned !== false
      if (isSpawned) {
        const ptEntry = passThroughMap.get(latestObj.id)
        if (ptEntry) {
          container.visible = ptEntry.visible
          container.eventMode = 'none'
          container.interactiveChildren = false
        } else {
          container.visible = latestObj.visible
          container.eventMode = 'static'
          container.interactiveChildren = true
          container.hitArea = new PIXI.Rectangle(-96, -96, 192, 192)
        }
      }

      updatePixiDebugInfo(container, {
        position: { x: latestObj.x, y: latestObj.y },
        size: { width: latestObj.width, height: latestObj.height },
        transform: {
          scaleX: latestObj.scaleX,
          scaleY: latestObj.scaleY,
          rotation: latestObj.rotation,
          alpha: latestObj.alpha,
          flipX: latestObj.flipX
        }
      })
      return
    }

    let transformApplied = true

    if (obj.type === 'prop') {
      // v11.0: 道具动画状态已迁移至 AnimationPlayer 系统
      transformApplied = applyTransform(container, obj)
      // v7.3: effect 类型已删除
    } else {
      applyTransform(container, obj)
    }

    // v19 Fix: visible 设置和 union proxy 传播必须紧跟 applyTransform，
    // 在任何 await 之前同步执行。
    // updateObjectContainer 是 async 函数，以 void (fire-and-forget) 方式并发调用。
    // 如果 ProxyChain 在 await 之后执行，第二轮 watcher 的 applyTransform 会重置 position，
    // 导致第一轮的 ProxyChain 在已变换的 position 上再次执行 → 双重变换。
    if (transformApplied) {
      const isSpawned = (obj as unknown as { spawned?: boolean }).spawned !== false
      if (isSpawned) {
        // 穿透列表检查：替代旧的 cameraEditorVisible 逻辑
        const ptEntry = passThroughMap.get(obj.id)
        if (ptEntry) {
          container.visible = ptEntry.visible
          container.eventMode = 'none'
          container.interactiveChildren = false
        } else {
          container.visible = obj.visible
          // 恢复正常交互状态（应对从穿透列表移除的情况）
          container.eventMode = 'static'
          container.interactiveChildren = true
        }
      }
    }

    // v20: union 子对象在容器内（真实 PIXI 父子关系），变换自动传播，无需 applyUnionProxyChain

    // 类型特定更新（可能含 await，必须在 proxy 传播之后）
    if (obj.type !== 'prop') {
      if (obj.type === 'background') {
        const sprite = container.getChildByName('background_sprite') as PIXI.Sprite | undefined
        if (sprite?.texture.valid) {
          sprite.width = obj.width
          sprite.height = obj.height
          sprite.anchor.set(0, 0)  // 背景使用左上角锚点
        }
      } else if (obj.type === 'camera') {
        const graphics = container.getChildByName('camera_border') as PIXI.Graphics | undefined
        if (graphics) {
          graphics.clear()
          graphics.lineStyle(20, 0x00ff00)
          graphics.beginFill(0x000000, 0.001)
          graphics.drawRect(0, 0, obj.width, obj.height)
          graphics.endFill()
        }
      } else if (obj.type === 'screen_effect') {
        // Handler 直接操作 params，applyBlockActionsToState 返回的 state 已包含正确的 params
        const effectiveObj = (mode === 'action'
          ? getActionModeSlotObjectState(obj)
          : obj) as ScreenEffectObject
        const graphics = container.getChildByName('screen_effect_graphics') as PIXI.Graphics | undefined
        if (graphics) {
          drawScreenEffectGraphics(graphics, effectiveObj.params, effectiveObj.width, effectiveObj.height, container)
        }
      } else if (obj.type === 'symbol') {
        // v16: 当 currentMaterialId 变化时，预加载纹理并重建容器内部的 sprite
        const symbolObj = obj as SymbolObject
        const currentRenderedId =
          (container as unknown as Record<string, string>)['_renderedMaterialId']
          ?? (container as unknown as Record<string, string>)['_symbolMaterialId']
        const targetId = symbolObj.currentMaterialId ?? symbolObj.materials?.[0]?.id
        if (currentRenderedId !== targetId) {
          // 预加载目标素材的纹理
          const material = targetId
            ? symbolObj.materials?.find(m => m.id === targetId)
            : symbolObj.materials?.[0]
          if (material) {
            await preloadEditorSymbolMaterialTextures(material)
          }
          // Clear old children
          container.removeChildren()
          // Rebuild via renderer
          const newContainer = createEditorSymbolContainer(obj)
          // Move children from new container to existing one
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
          // Track which material is rendered
          ; (container as unknown as Record<string, string>)['_renderedMaterialId'] = targetId ?? ''
          ; (container as unknown as Record<string, string>)['_symbolMaterialId'] = targetId ?? ''
        }
      } else if (obj.type === 'expression') {
        // v18: 当 refId 变化时，预加载纹理并重建容器内部的 sprite
        const currentRenderedRefId = (container as unknown as Record<string, string>)['_renderedRefId']
        if (currentRenderedRefId !== obj.refId) {
          // 预加载目标表情的纹理
          const expressionStore = useExpressionStore()
          const expr = expressionStore.getExpression(obj.refId)
          if (expr) {
            const urls = new Set<string>()
            if (expr.defaultFrame?.url) urls.add(expr.defaultFrame.url)
            expr.speakingFrames?.forEach(frame => {
              if (frame?.url) urls.add(frame.url)
            })
            if (urls.size > 0) {
              const { loadAssets } = useAssetLoader()
              await loadAssets(urls, new Set(), `SceneGraph.expression.update(${obj.id})`)
            }
          }
          // Clear old children
          container.removeChildren()
          // Rebuild via renderer
          const newContainer = sceneObjectRenderer.createExpressionContainer(obj)
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
          ;(container as unknown as Record<string, string>)['_renderedRefId'] = obj.refId
        }
      } else if (obj.type === 'text') {
        // Text PRD Phase 0 + Phase 1: 更新文本内容和样式
        const textObj = obj as import('@/types/sceneObject').TextObject
        if (!(await ensureTextFontForRender(container, textObj))) return
        const normalizedContent = normalizeTextContent(textObj.content)
        const effectiveWordWrap = textObj.wordWrap ?? true
        const boxMode = textObj.textBoxMode ?? 'auto-size'
        const gradient = textObj.fillType === 'linear_gradient'
          ? resolveTextGradient(textObj.gradientStops, textObj.gradientAngle)
          : null
        const fillValue = gradient ? gradient.colors : (textObj.color ?? '#ffffff')
        const isVertical = textObj.writingMode === 'vertical'
        const hasHorizontal = container.getChildByName('text_content') !== null
        const hasVertical = container.getChildByName('text_vertical_group') !== null

        // writingMode 切换时重建子结构
        if (isVertical && hasHorizontal) {
          container.removeChildren()
          const newContainer = sceneObjectRenderer.createTextContainer(obj)
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
        } else if (!isVertical && hasVertical) {
          container.removeChildren()
          const newContainer = sceneObjectRenderer.createTextContainer(obj)
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
        } else if (isVertical && hasVertical) {
          // 竖排内容更新：重建
          container.removeChildren()
          const newContainer = sceneObjectRenderer.createTextContainer(obj)
          while (newContainer.children.length > 0) {
            container.addChild(newContainer.children[0]!)
          }
      } else {
          // 横排更新
          const textChild = container.getChildByName('text_content') as PIXI.Text | undefined
          if (textChild) {
            const lineHeightInfo = resolveTextLineHeight(textObj.fontFamily, textObj.fontSize, textObj.lineHeight)
            const styleOpts: Partial<PIXI.ITextStyle> = {
              fontFamily: textObj.fontFamily ?? 'Noto Sans SC',
              fontSize: textObj.fontSize ?? 72,
              fill: fillValue,
              align: textObj.align ?? 'center',
              breakWords: true,
              whiteSpace: 'pre-line',
              fontWeight: textObj.fontWeight ?? 'normal',
              fontStyle: textObj.fontStyle ?? 'normal',
              strokeThickness: textObj.strokeThickness ?? 0,
              dropShadow: textObj.dropShadow ?? false,
              dropShadowColor: textObj.dropShadowColor ?? '#000000',
              dropShadowBlur: textObj.dropShadowBlur ?? 4,
              dropShadowAngle: textObj.dropShadowAngle ?? Math.PI / 4,
              dropShadowDistance: textObj.dropShadowDistance ?? 4,
              letterSpacing: textObj.letterSpacing ?? 0,
              lineHeight: lineHeightInfo.lineHeight,
              leading: getAutoTextLeading(
                textObj.fontFamily,
                textObj.fontSize,
                lineHeightInfo.source === 'explicit' ? lineHeightInfo.lineHeight : undefined,
              ),
            }
            if (boxMode === 'auto-width' || boxMode === 'auto-size') {
              styleOpts.wordWrap = false
            } else {
              const wrapWidth = boxMode === 'fixed'
                ? Math.max(50, textObj.width ?? 400)
                : Math.max(50, textObj.wordWrapWidth ?? 400)
              styleOpts.wordWrap = effectiveWordWrap
              styleOpts.wordWrapWidth = wrapWidth
            }
            if (gradient) {
              styleOpts.fillGradientType = gradient.gradientType
              styleOpts.fillGradientStops = gradient.gradientStops
            }
            if (textObj.stroke) styleOpts.stroke = textObj.stroke
            const rebuiltText = new PIXI.Text(normalizedContent, new PIXI.TextStyle(styleOpts))
            rebuiltText.name = 'text_content'
            rebuiltText.anchor.set(0.5)
            container.removeChild(textChild)
            textChild.destroy()
            container.addChild(rebuiltText)
            syncTextBackground(container, textObj, rebuiltText, boxMode)
          }
        }
        if (isVertical) {
          const verticalGroup = container.getChildByName('text_vertical_group') as PIXI.Container | undefined
          syncTextBackground(container, textObj, verticalGroup, boxMode)
        }
        const existingMask = container.getChildByName('text_box_mask') as PIXI.Graphics | undefined
        if (boxMode === 'fixed' && obj.width > 0 && obj.height > 0) {
          const mask = existingMask ?? new PIXI.Graphics()
          if (!existingMask) {
            mask.name = 'text_box_mask'
          }
          mask.clear()
          mask.beginFill(0xffffff)
          mask.drawRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height)
          mask.endFill()
          if (!existingMask) container.addChild(mask)
          container.mask = mask
        } else if (existingMask) {
          container.mask = null
          container.removeChild(existingMask)
        }
      }
    }

    updatePixiDebugInfo(container, {
      position: { x: obj.x, y: obj.y },
      size: { width: obj.width, height: obj.height },
      transform: {
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        rotation: obj.rotation,
        alpha: obj.alpha,
        flipX: obj.flipX
      }
    })
  }

  /**
   * 应用变换
   */
  function applyTransform(container: PIXI.Container, obj: SceneObject): boolean {
    // Action Mode 下使用当前 Slot 计算出的对象状态
    const finalObj = mode === 'action' ? getActionModeSlotObjectState(obj) : obj

    // v9.3: Setup Mode 下检查 spawned 状态
    // spawned=false 的对象（动态对象）在 Setup 模式下不应该渲染
    if (mode === 'setup' && obj.type !== 'camera') {
      const setupSpawned = (obj as unknown as { spawned?: boolean }).spawned
      if (setupSpawned === false) {
        container.visible = false
        container.eventMode = 'none'
        container.interactiveChildren = false
        return true
      }
    }

    // v9.2: 检查对象在当前 Slot 是否已消亡
    // 相机和非 Action Mode 不检查
    if (mode === 'action' && obj.type !== 'camera') {
      // v12.7: 使用 obj（来自 sceneObjectStore.objects = runtimeState.objects）的 spawned 属性。
      // 该属性由 calculateSlotStates + applySlotState 按当前 Slot 精确级联计算而得。
      // 注意：不使用 finalObj.spawned，避免把当前 slot 之外的生命周期结果误带入显示逻辑
      // （含 autoDespawnOnBlockEnd），可能导致当前 Slot 仍存活的对象被提前隐藏。
      const isAlive = obj.spawned !== false
      if (!isAlive) {
        container.visible = false
        container.eventMode = 'none'
        container.interactiveChildren = false
        return true
      } else {
        // 穿透列表优先：穿透对象保持可见但不可交互
        const ptEntry = passThroughMap.get(obj.id)
        if (ptEntry) {
          container.visible = ptEntry.visible
          container.eventMode = 'none'
          container.interactiveChildren = false
        } else {
          container.visible = true
          container.eventMode = 'static'
          container.interactiveChildren = true
        }
      }
    }

    let pivotX = 0
    let pivotY = 0

    // v7.13 Fix: 获取局部边界，供后续计算 Pivot 和 Offset 使用
    // 提到函数顶层以避免 ReferenceError
    const localBounds = container.getLocalBounds()

    // v7.13: 统一定义锚点/Pivot
    // 规则：所有对象统一使用 Top-Left (左上角) 作为坐标原点。
    // 特例：相机对象使用 Center (中心点)。
    // 
    // PIXI 的 pivot 属性定义了对象的旋转和缩放中心，同时也影响了 position 的含义。
    // 如果 pivot=(0,0) (Top-Left)，则 container.position 设置的是对象的左上角。
    // 如果 pivot=(w/2, h/2) (Center)，则 container.position 设置的是对象的中心点。

    // 我们希望 obj.x/y 存储的是左上角坐标（相机除外）。
    // 但是，为了让旋转和缩放围绕中心进行（更符合直觉），我们通常将 pivot 设置在中心。
    // 这样的话，obj.x/y 需要是中心坐标吗？
    // 不，用户期望 obj.x/y 是左上角。
    // 所以我们需要进行坐标转换：
    // PIXI Position (Pivot Center) = TopLeft(obj.x, obj.y) + CenterOffset(w/2, h/2)

    // 检查当前逻辑：
    // Character: Pivot = Center. Pos = obj.x + pivotX * scale. -> 意味着 obj.x 是 Top-Left。 (正确)
    // Background: Pivot = 0. Pos = obj.x. -> 意味着 obj.x 是 Top-Left。 (正确，且背景通常不旋转)
    // Camera: Pivot = 0? (Camera 容器只是个框). Pos = obj.x. -> 意味着 obj.x 是 Top-Left?
    //         但用户说相机使用中心点坐标。
    //         看 Camera 逻辑: container.position.set(obj.x, obj.y)。
    //         如果 pivot=0，那 obj.x 就是左上角。
    //         我们需要确认 Camera 的 pivot。
    //         Line 565: container.position.set(obj.x, obj.y)
    //         Line 540: else { pivotX = obj.width/2 ... } -> 这是默认分支。
    //         Camera 走的是 else 分支吗？ Line 539: else if (bgm)... else ...
    //         Camera 是 'camera' 类型。
    //         Wait, createCameraContainer 里没有设置 pivot。
    //         applyTransform 里 Camera 应该进哪个分支？
    //         Line 533 (char), 533 (bg), 536 (bgm). 
    //         Camera 实际上走了 else (Line 539)，设置了 Pivot = Center。
    //         但是 Line 565 又直接 set(obj.x, obj.y)。
    //         这意味着：如果 Camera 走 else 分支，Pivot=Center，然后 Pos=obj.x。
    //         那么 obj.x 就是 Camera 的中心点坐标（在 PIXI 看来）。
    //         这符合 "相机使用中心点坐标" 的要求。
    //         
    //         但是！Character 走的也是 Pivot=Center (Line 510)，但 Line 572 做了补偿：
    //         posX = obj.x + pivotX * scale
    //         这意味着 obj.x 是 Top-Left，我们把它转换成了 Center 给 PIXI。
    //         
    //         所以：
    //         Character: obj.x = Top-Left. PIXI Pos = Center. (Logic: obj.x + w/2)
    //         Camera:    obj.x = Center.   PIXI Pos = Center. (Logic: obj.x)
    //         Background: obj.x = Top-Left. PIXI Pos = Top-Left. (Pivot=0)

    // 验证逻辑一致性：

    if (finalObj.type === 'camera') {
      // 相机：Pivot = Center
      pivotX = finalObj.width / 2
      pivotY = finalObj.height / 2
    } else if (finalObj.type === 'screen_effect') {
      // 画面特效：Graphics 以原点为中心绘制 drawRect(-halfW, -halfH, w, h)
      // Pivot 固定为 (0, 0)，避免羽化 Sprite 改变 localBounds 导致尺寸漂移
      pivotX = 0
      pivotY = 0
    } else if (finalObj.type === 'composite') {
      // Composite 是纯变换容器，pivot 恒为 (0,0)
      // union 的 PIXI 容器是空代理，pivot/position 不影响子对象渲染
      // 子对象的 flipX 翻转基准点修正在 applyUnionProxyChain 中处理
      pivotX = 0
      pivotY = 0
    } else if (finalObj.type === 'mask') {
      // Mask 容器没有可见子节点，裁切几何与选框都以本地 (0,0) 为中心。
      // 不能落入下面的 width/height 兜底，否则 pivot 会变成右下角。
      pivotX = 0
      pivotY = 0
    } else {
      // 通用 (Background, Prop, Text, BGM): 使用 localBounds 计算几何中心
      if (localBounds.width > 0 && localBounds.height > 0) {
        pivotX = localBounds.x + localBounds.width / 2
        pivotY = localBounds.y + localBounds.height / 2
      } else {
        // Fallback: 如果没有 Bounds，根据对象类型猜测
        if (finalObj.type === 'prop') {
          // 中心对齐的对象
          pivotX = 0
          pivotY = 0
        } else {
          // 左上角对齐的对象 (Background, Text)
          pivotX = finalObj.width / 2
          pivotY = finalObj.height / 2
        }
      }
    }

    container.pivot.set(pivotX, pivotY)

    // Transform Origin 补偿（像素偏移方案）
    // transformOriginX/Y 是相对于 PivotBase 的像素偏移，默认 0 = 围绕 PivotBase 旋转
    // 统一公式适用于所有对象类型（含 composite），无需 bounds 计算
    const originX = finalObj.transformOriginX ?? 0
    const originY = finalObj.transformOriginY ?? 0
    let posCompX = 0
    let posCompY = 0

    if (originX !== 0 || originY !== 0) {
      container.pivot.set(pivotX + originX, pivotY + originY)

      if (finalObj.type === 'composite') {
        // v21: 简单偏移补偿（与非 composite 一致）
        // position 不随 rotation 变化 → pivot 在世界中固定 → 旋转/缩放围绕 pivot
        posCompX = finalObj.flipX ? -originX : originX
        posCompY = originY
      } else {
        // 非 composite 类型（prop/bg/text 等）：使用 bounds 中心 pivot，
        // 补偿量仅需 originX/Y 增量（bounds 中心部分由坐标模型统一处理）
        posCompX = finalObj.flipX ? -originX : originX
        posCompY = originY
      }
    }

    // 缩放设置
    {
      // 通用缩放处理 (Background, Prop, etc)
      const scaleX = finalObj.scaleX * (finalObj.flipX ? -1 : 1)
      const scaleY = finalObj.scaleY
      container.scale.set(scaleX, scaleY)
    }

    // v2.0.0: 坐标设置（统一中心坐标 + Transform Origin 补偿）
    // 所有对象的 obj.x/y 都是中心坐标，pivot 也在中心，加上变换原点补偿
    const finalPosX = Math.round(finalObj.x + posCompX)
    const finalPosY = Math.round(finalObj.y + posCompY)
    container.position.set(finalPosX, finalPosY)





    // 相机不旋转
    if (finalObj.type === 'camera') {
      container.rotation = 0
    }

    // v11.3 Fix: 每次应用变换后，如果存在 GenericAnimationPlayer，必须更新其 BaseTransform
    // 防止动画播放器在下一帧 update 时使用过期的 BaseTransform (导致位置跳变回 0,0)
    // 这对于 Setup 模式下即时拖拽且同时播放动画至关重要
    const player = getGenericAnimationPlayer(obj.id)
    if (player) {
      // v19: 为 composite（尤其 union proxy）注入虚拟边界
      // 使 GenericAnimationPlayer.applyOutputs 的 track.pivot 补偿在编辑器中生效
      if (finalObj.type === 'composite') {
        const comp = finalObj as import('@/types/sceneObject').CompositeObject
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const childId of comp.childIds) {
          const cc = renderCache.get(childId)
          if (!cc || cc.destroyed) continue
          const cl = cc.getLocalBounds()
          if (cl.width <= 0 || cl.height <= 0) continue
          const corners = [
            new PIXI.Point(cl.x, cl.y),
            new PIXI.Point(cl.x + cl.width, cl.y),
            new PIXI.Point(cl.x + cl.width, cl.y + cl.height),
            new PIXI.Point(cl.x, cl.y + cl.height),
          ]
          for (const corner of corners) {
            const g = cc.toGlobal(corner)
            const l = container.toLocal(g)
            minX = Math.min(minX, l.x)
            minY = Math.min(minY, l.y)
            maxX = Math.max(maxX, l.x)
            maxY = Math.max(maxY, l.y)
          }
        }
        if (isFinite(minX)) {
          player.setObjectBounds(maxX - minX, maxY - minY, minX, minY)
        }
      }

      player.cacheBaseTransform()
    }

    // 更新选中状态
    // 更新选中状态
    // const isSelected = sceneObjectStore.selectedObjectId === obj.id
    container.rotation = finalObj.rotation

    container.alpha = finalObj.alpha

    // 根据对象类型设置默认 zIndex
    let effectiveZIndex: number
    if (finalObj.type === 'background') {
      effectiveZIndex = finalObj.zIndex ?? Z_INDEX_BACKGROUND
    } else if (finalObj.type === 'camera') {
      // 相机置顶显示（10000），方便用户查看相机边界
      effectiveZIndex = Z_INDEX_CAMERA_OVERLAY
    } else {
      effectiveZIndex = finalObj.zIndex ?? Z_INDEX_DEFAULT
    }

    container.zIndex = effectiveZIndex

    // Action Mode: Handler 直接操作 params，绕过缓存直接计算最新状态即可
    if (mode === 'action' && finalObj.type === 'screen_effect' && currentScene && currentBlock) {
      const graphics = container.getChildByName('screen_effect_graphics') as PIXI.Graphics | undefined
      if (graphics) {
        // 直接计算最新状态（绕过缓存）
        const prevCtx = calculatePrevContext(currentScene, currentBlock.id)
        const freshState = applyBlockActionsToState(prevCtx, currentBlock, currentScene)
        const freshObjState = freshState.objects.find(o => o.id === obj.id) as ScreenEffectObject | undefined
        const effectiveParams = freshObjState?.params ?? (finalObj as ScreenEffectObject).params
        drawScreenEffectGraphics(graphics, effectiveParams, finalObj.width, finalObj.height, container)
      }
    }

    return true
  }

  /**
   * 从缓存获取容器
   */
  function getContainer(objectId: string): PIXI.Container | undefined {
    return renderCache.get(objectId)
  }

  /**
   * 设置容器到缓存
   */
  function setContainer(objectId: string, container: PIXI.Container): void {
    renderCache.set(objectId, container)
  }

  /**
   * 删除缓存的容器
   */
  function removeContainer(objectId: string): void {
    const container = renderCache.get(objectId)
    if (container) {
      if (container.destroyed) {
        logPixiTree('remove_container_already_destroyed', {
          objectId,
          containerName: container.name,
          parentName: container.parent?.name ?? null,
        })
        // 容器已被父级 composite 的 destroy({children:true}) 级联销毁
        // 只清理缓存，不再调用 destroy
        renderCache.delete(objectId)
      } else {
        logPixiTree('remove_container_begin', {
          objectId,
          containerName: container.name,
          parentName: container.parent?.name ?? null,
          childrenCount: container.children.length,
          destroyed: container.destroyed,
        })
        if (container.parent) {
          container.parent.removeChild(container)
        }
        container.destroy({ children: true })
        logPixiTree('remove_container_done', {
          objectId,
          containerName: container.name,
          parentName: container.parent?.name ?? null,
          destroyed: container.destroyed,
        })
        renderCache.delete(objectId)
      }
    }



    // 清理动画播放器
    const propPlayer = genericAnimationPlayerCache.get(objectId)
    if (propPlayer) {
      // (Optional) stop/destroy player logic if needed
      genericAnimationPlayerCache.delete(objectId)
    }
  }

  /**
   * 获取所有缓存的对象ID
   */
  function getCachedIds(): string[] {
    return Array.from(renderCache.keys())
  }



  /**
   * 获取通用动画播放器
   */
  function getGenericAnimationPlayer(objectId: string): GenericAnimationPlayer | undefined {
    return genericAnimationPlayerCache.get(objectId)
  }

  /**
   * 获取所有通用动画播放器
   */
  function getGenericAnimationPlayers(): Map<string, GenericAnimationPlayer> {
    return genericAnimationPlayerCache
  }

  /**
   * 清理所有缓存
   */
  function clearAll(): void {
    renderCache.forEach((container, _id) => {
      logPixiTree('clear_all_destroy_container', {
        objectId: _id,
        containerName: container.name,
        parentName: container.parent?.name ?? null,
        childrenCount: container.children.length,
        destroyed: container.destroyed,
      })
      if (container.parent && typeof container.parent.removeChild === 'function') {
        container.parent.removeChild(container)
      }
      container.destroy({ children: true })
    })
    renderCache.clear()



    genericAnimationPlayerCache.clear()
  }

  /**
   * 渲染锁状态
   */
  function getIsRendering(): boolean {
    return isRendering
  }

  function setIsRendering(value: boolean): void {
    isRendering = value
  }

  function getPendingRender(): boolean {
    return pendingRender
  }

  function setPendingRender(value: boolean): void {
    pendingRender = value
  }

  // ===== 编辑器专用：事件穿透列表（不影响数据层、不持久化） =====

  interface PassThroughEntry {
    visible: boolean  // true: 穿透+渲染  |  false: 穿透+隐藏
  }

  const passThroughMap = reactive(new Map<string, PassThroughEntry>())

  function addPassThrough(objectId: string, visible = true): void {
    passThroughMap.set(objectId, { visible })
  }

  function removePassThrough(objectId: string): void {
    passThroughMap.delete(objectId)
  }

  function setPassThroughVisible(objectId: string, visible: boolean): void {
    const entry = passThroughMap.get(objectId)
    if (entry) {
      entry.visible = visible
    }
  }

  function isPassThrough(objectId: string): boolean {
    return passThroughMap.has(objectId)
  }

  function getPassThroughEntry(objectId: string): PassThroughEntry | undefined {
    return passThroughMap.get(objectId)
  }

  function getPassThroughEntries(): ReadonlyMap<string, PassThroughEntry> {
    return passThroughMap
  }

  /** 初始化穿透列表默认值：将相机对象自动加入（visible=true） */
  function initPassThroughDefaults(): void {
    const camera = sceneObjectStore.objects.find(o => o.type === 'camera')
    if (camera && !passThroughMap.has(camera.id)) {
      passThroughMap.set(camera.id, { visible: true })
    }

    for (const obj of sceneObjectStore.objects) {
      if (isAmbientLightObject(obj)) {
        passThroughMap.set(obj.id, { visible: false })
      }
    }
  }

  return {
    // 容器创建和更新
    createObjectContainer,
    updateObjectContainer,
    applyTransform,

    // 缓存管理
    getContainer,
    setContainer,
    removeContainer,
    getCachedIds,

    getGenericAnimationPlayer,
    getGenericAnimationPlayers,
    clearAll,

    // 渲染锁
    getIsRendering,
    setIsRendering,
    getPendingRender,
    setPendingRender,

    // Action Mode 支持
    setActionModeContext,
    clearActionModeContext,
    getActionModeSlotObjectState,

    // v8.6: P0 统一状态管理
    setSlots,
    getSlots,
    getCurrentActions,
    getCurrentBlock,
    getCurrentScene,
    getActionModePrevContext: () => getPrevContext(),

    // Ghost Mode 支持
    updateSlotIndex,
    getCurrentSlotIndex,
    getGhostStates,
    getGhostData,
    createGhostContainer,
    createGhostCameraContainer,
    getGhostContainer,
    getGhostCameraContainer,
    clearGhostContainers,

    // v16: Symbol 素材预加载
    preloadSymbolMaterialTextures,
    preloadEditorSymbolMaterialTextures,

    // 编辑器专用：事件穿透列表
    addPassThrough,
    removePassThrough,
    setPassThroughVisible,
    isPassThrough,
    getPassThroughEntry,
    getPassThroughEntries,
    initPassThroughDefaults,
  }
}
