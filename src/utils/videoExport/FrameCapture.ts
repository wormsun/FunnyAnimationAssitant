import * as PIXI from 'pixi.js'

import { useAssetImage } from '@/composables/useAssetImage'
import { useAssetLoader } from '@/composables/useAssetLoader'
import { AnimationController, type AnimationHost } from '@/core/AnimationController'
import { CompositeRenderTarget } from '@/core/CompositeRenderTarget'
import { type GenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import {
    applyAllMasks,
    createMaskRendererResources,
    disposeMaskRendererResources,
    type MaskRendererResources,
} from '@/core/maskRenderer'
import { installRootRenderChainRenderer } from '@/core/RenderChainStage'
import {
    applyLightingFilter,
    type LightingFilterCache,
    type RenderHost,
    renderObject as sharedRenderObject,
    sortCompositeContainers as sharedSortCompositeContainers,
    syncObjectBoundsToPlayers as sharedSyncObjectBoundsToPlayers,
    updateCompositeRenderTargetsInOrder,
} from '@/core/renderPipeline'
import { type ObjectStateHost, SceneObjectRenderer } from '@/core/SceneObjectRenderer'
import { advanceAllObjectAnimations } from '@/core/spriteAnimationDriver'
import { computeTextRevealState } from '@/core/TextRevealController'
import type { TextureProvider } from '@/core/TextureProvider'
import { useAnimationStore } from '@/stores/animationStore'
import { useBackgroundStore } from '@/stores/backgroundStore'
import type { Episode } from '@/stores/episodeStore'
// v7.3: effectStore 已删除
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePropStore } from '@/stores/propStore'
// Phase 4e: ObjectStateSnapshot 已由 SceneObject 替代
import type { CompositeObject, SceneObject, SymbolObject } from '@/types/sceneObject'
import type { Action, BlockPlayInfo, RuntimeSceneSnapshot, RuntimeSlot, SetSceneStructureAction } from '@/types/screenplay'
import {
    evaluateCameraState,
    evaluateObjectState,
    type RuntimeCameraState,
} from '@/utils/actionEvaluator'
import { type ActionType,getHandler } from '@/utils/actionHandlers'
import { isObjectStateAction } from '@/utils/actionHandlers/registry'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'
import { sortActionsForEvaluation } from '@/utils/actionOrder'
import { collectSceneFontPreloadObjects, ensureFontLoaded, preloadSceneFonts } from '@/utils/fontLoader'
import { rebuildChildIdsFromParentIds } from '@/utils/hierarchyUtils'
import { buildParentOverridesForTime, sortObjectsBySlotActionOrder, sortObjectsForEvaluation } from '@/utils/objectEvaluationOrder'
import { reconcileRenderChain, sortRenderChainByZIndex } from '@/utils/renderChainUtils'
import { prepareBlockPlayInfos as buildBlockPlayInfos } from '@/utils/scenePlaybackPipeline'
import { applyMaskPostPass } from '@/utils/sceneStateCalculator'
import { applySetSceneStructureActionToObjects } from '@/utils/setSceneStructureAction'
import { getSubtitleTextAtTime } from '@/utils/slotUtils'
import { FONT_SIZE_PRESETS } from '@/utils/textStylePresets'
import type { TTSTimingFile } from '@/utils/ttsTiming'

import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH, DEFAULT_SUBTITLE_STYLE } from './constants'
import type { SubtitleStyle, VideoExportConfig } from './types'

function cloneSceneObject<T extends SceneObject>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T
}

function getSlotIndexAtTime(slots: RuntimeSlot[], localTime: number): number {
    if (slots.length === 0) return -1
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]
        if (!slot) continue
        const slotEndTime = slot.startTime + slot.duration
        if (localTime >= slot.startTime && localTime < slotEndTime) {
            return i
        }
    }
    return slots.length - 1
}

function getActionTimeRangeForPreview(
    action: Action,
    slots: RuntimeSlot[],
): { start: number; end: number; duration: number } {
    let start = 0
    let duration = 0

    const slot = slots[action.slotIndex]
    if (slot) {
        start = slot.startTime
        if (action.category === 'duration') {
            const span = (action as { slotSpan?: number }).slotSpan ?? 1
            for (let i = 0; i < span; i++) {
                const currentSlot = slots[action.slotIndex + i]
                if (currentSlot) duration += currentSlot.duration
            }
        }
    }

    return { start, end: start + duration, duration }
}

function applyPreviewObjectAction(
    state: SceneObject,
    action: Action,
    stateMap: Map<string, SceneObject>,
): SceneObject {
    const nextState = cloneSceneObject(state)
    const handler = getHandler(action.type as ActionType)
    if (!handler) return nextState

    const context: ActionHandlerContext = {
        getObjectState: (id: string) => {
            const current = stateMap.get(id)
            return current ? (current as unknown as WriteableState) : undefined
        },
    }

    handler.applyToState(nextState as unknown as WriteableState, action, context)
    return nextState
}

function applyPreviewSceneStructureAction(
    stateMap: Map<string, SceneObject>,
    action: SetSceneStructureAction,
): void {
    const objects = [...stateMap.values()]
    applySetSceneStructureActionToObjects(objects, action)
    stateMap.clear()
    for (const obj of objects) {
        stateMap.set(obj.id, obj)
    }
}

// PlayableSprite 接口已提取到 spriteAnimationDriver 共享模块

// v11.80: AnimStateParam 已移除，使用内联类型定义

/**
 * 帧捕获模块
 * 负责离屏渲染并提取视频帧
 */
export class FrameCapture {
    private renderer: PIXI.Renderer | null = null
    private offscreenCanvas: OffscreenCanvas | null = null
    private config: VideoExportConfig
    private episode: Episode

    // 渲染容器层级
    private stage: PIXI.Container | null = null
    private scaleContainer: PIXI.Container | null = null
    private contentViewport: PIXI.Container | null = null
    private sceneStage: PIXI.Container | null = null

    // Stores
    private backgroundStore = useBackgroundStore()
    private propStore = usePropStore()
    // v7.3: effectStore 已删除
    private expressionStore = useExpressionStore()
    private projectStore = useProjectStore()

    // Asset helper
    private assetImage = useAssetImage()
    private getImageUrl = this.assetImage.getImageUrl
    private assetLoader = useAssetLoader()
    private getTexture = this.assetLoader.getTexture

    // 当前场景缓存
    private currentSceneIndex = -1
    private objectContainers = new Map<string, PIXI.Container>()

    private objectDimensions = new Map<string, {
        width: number, height: number,
        pivotX?: number, pivotY?: number,
        boundsX?: number, boundsY?: number
    }>()

    // v14.2: 追踪每个角色最后一次测量 bounds 时的姿态
    private lastMeasuredPose = new Map<string, string>()

    // Block 播放信息（每个场景）
    private blockPlayInfos: BlockPlayInfo[] = []
    private ttsTimingCache = new Map<string, TTSTimingFile | null>()
    private pendingTTSTimingLoads = new Map<string, Promise<TTSTimingFile | null>>()

    // camera_follow 最后跟随位置
    private lastFollowPosition: { x: number; y: number } | null = null
    private lastEvaluatedCameraState: RuntimeCameraState | null = null

    // 水印
    private watermarkSprite: PIXI.Sprite | null = null

    // 字幕
    private subtitleContainer: PIXI.Container | null = null
    private subtitleBackground: PIXI.Graphics | null = null
    private subtitleText: PIXI.Text | null = null

    // v11.60: Animation Player 注册表（统一 Map，消除按类型分发的 if/else 分支）
    private objectAnimationPlayers = new Map<string, GenericAnimationPlayer>()
    private triggeredAnimations = new Set<string>()


    // P2: Composite own 模式离屏渲染目标
    private compositeRenderTargets = new Map<string, CompositeRenderTarget>()

    // 方案B: camera_follow 首帧 BBox 偏移量缓存
    private followBBoxOffsets = new Map<string, { dx: number, dy: number }>()

    // v25: 光照滤镜缓存
    private lightingFilterCache: LightingFilterCache = {}

    // Clip-Mask Phase 1：蒙版渲染器资源（FrameCapture 路径）
    private maskRendererResources: MaskRendererResources = createMaskRendererResources()

    // RenderHost 桥接（共享渲染管线依赖注入）
    private renderHost: RenderHost

    private animationStore = useAnimationStore()
    private lastFrameTimeInScene = 0  // 用于计算 deltaTime
    // v11.82: 帧动画时间累积器（基于 deltaTime 推进，避免绝对时间计算的精度问题）
    private spriteAnimTimeAccumulator = new WeakMap<PIXI.AnimatedSprite, number>()
    // v11.88: 追踪上一个 Block 用于 autoStopOnBlockEnd 处理
    private previousBlockInfo: BlockPlayInfo | null = null

    // v14.x: 统一渲染器实例
    private sceneObjectRenderer: SceneObjectRenderer

    // 导出路径临时覆盖 PIXI 分辨率设置，销毁时恢复，避免影响编辑器/预览
    private previousPixiResolution = PIXI.settings.RESOLUTION
    private didOverridePixiSettings = false

    // PA: AnimationController 集成
    private currentScene: Episode['scenes'][number] | null = null
    private animationController: AnimationController

    // P0: ObjectStateHost — 桥接本地缓存给统一渲染器
    private objectStateHost: ObjectStateHost

    private createAnimationHost(): AnimationHost {
        return {
            getAnimationPlayer: (id: string) => this.objectAnimationPlayers.get(id) ?? null,
            getObjectContainer: (id: string) => this.objectContainers.get(id) ?? null,
            getSceneObjects: () => this.currentScene?.setup.objects ?? [],
            getAnimationDefinition: (objectId: string, animName: string) => {
                // v16: 统一从 SceneObject.animations 查找（hydrate 保证已填充）
                const obj = this.currentScene?.setup.objects.find(o => o.id === objectId)
                if (!obj) return null
                return this.animationStore.getObjectAnimationByName(obj, animName) ?? null
            },
            onAnimationTriggered: (objectId: string, animName: string, cmd: 'play' | 'stop') => {
                this.handleAnimationTriggered(objectId, animName, cmd)
            },
        }
    }

    /**
     * 统一获取对象的 GenericAnimationPlayer
     * 消除按类型分发的 if/else 链
     */
    private getAnimationPlayerForObject(objId: string): GenericAnimationPlayer | null {
        return this.objectAnimationPlayers.get(objId) ?? null
    }

    constructor(episode: Episode, config: VideoExportConfig) {
        this.episode = episode
        this.config = config

        // v14.x: 初始化统一渲染器
        const textureProvider: TextureProvider = {
            getTexture: (url: string) => {
                const tex = this.getTexture(url)
                if (tex !== PIXI.Texture.EMPTY) return tex
                const fullUrl = this.getImageUrl(url)
                return fullUrl ? PIXI.Texture.from(fullUrl) : PIXI.Texture.EMPTY
            },
            getImageUrl: (url: string) => this.getImageUrl(url)
        }
        this.sceneObjectRenderer = new SceneObjectRenderer(
            textureProvider,
            {
                propStore: this.propStore,
                backgroundStore: this.backgroundStore,
                expressionStore: this.expressionStore
            }
        )

        // PA: 初始化 AnimationController
        this.animationController = new AnimationController(this.createAnimationHost(), this.triggeredAnimations)

        // P0: 构造 ObjectStateHost
        this.objectStateHost = {
            getObjectDimensions: (id: string) => this.objectDimensions.get(id),
            setObjectDimensions: (id: string, dims: { width: number; height: number }) => this.objectDimensions.set(id, dims),
        }

        // 构造 RenderHost（共享渲染管线依赖注入）
        this.renderHost = {
            sceneObjectRenderer: this.sceneObjectRenderer,
            objectContainers: this.objectContainers,
            objectAnimationPlayers: this.objectAnimationPlayers,

            compositeRenderTargets: this.compositeRenderTargets,
            getRenderer: () => this.renderer ?? undefined,
            getSceneObjects: () => this.currentScene?.setup.objects ?? [],
        }
    }

    /**
     * 初始化
     */
    async initialize(): Promise<void> {

        if (typeof OffscreenCanvas === 'undefined') {
            throw new Error('当前浏览器不支持 OffscreenCanvas')
        }

        // 方案 D: 直接渲染到目标视频分辨率，避免 1456×819×2 -> 1920×1080
        // 的非整数下采样重新引入采样相位闪烁。不要开启 ROUND_PIXELS：
        // 相机/角色动画含亚像素移动时，像素取整会把平滑运动变成 1px 跳格。
        const exportPixelRatio = this.config.resolution.width / CAMERA_BASE_WIDTH

        this.previousPixiResolution = PIXI.settings.RESOLUTION
        this.didOverridePixiSettings = true
        PIXI.settings.RESOLUTION = exportPixelRatio

        this.offscreenCanvas = new OffscreenCanvas(
            this.config.resolution.width,
            this.config.resolution.height
        )

        this.renderer = new PIXI.Renderer({
            view: this.offscreenCanvas as unknown as HTMLCanvasElement,
            width: CAMERA_BASE_WIDTH,
            height: CAMERA_BASE_HEIGHT,
            resolution: exportPixelRatio,
            backgroundColor: 0x000000,
            backgroundAlpha: 1,
            antialias: true,
            preserveDrawingBuffer: false,
            autoDensity: false,
            powerPreference: 'high-performance',
            // 禁用事件系统，因为 OffscreenCanvas 不需要处理 DOM 事件
            // 这可以防止渲染器销毁后产生 "lastObjectRendered" 错误
            eventMode: 'none',
            eventFeatures: {
                move: false,
                globalMove: false,
                click: false,
                wheel: false,
            },
        })

        // 手动禁用事件系统，确保不会注册任何 DOM 事件监听器
        const rendererWithEvents = this.renderer as unknown as { events: { destroy: () => void } }
        if (rendererWithEvents.events) {
            try {
                rendererWithEvents.events.destroy()
            } catch (e) {
                // 忽略
            }
        }

        this.stage = new PIXI.Container()
        this.stage.name = 'frame-capture-root-stage'
        this.stage.sortableChildren = true

        // resolution 已处理像素密度放大，scaleContainer 不再需要额外缩放
        this.scaleContainer = new PIXI.Container()
        this.scaleContainer.name = 'frame-capture-scale-container'
        this.scaleContainer.scale.set(1, 1)

        this.contentViewport = new PIXI.Container()
        this.contentViewport.sortableChildren = true

        this.scaleContainer.addChild(this.contentViewport)
        this.stage.addChild(this.scaleContainer)

        // 只有在明确启用水印时才加载
        if (this.config.showWatermark === true) {
            await this.loadWatermark()
        }

        if (this.config.showSubtitles === true) {
            await ensureFontLoaded(this.getSubtitleStyle().fontFamily, this.collectSubtitleFontSample())
            this.createSubtitleOverlay()
        }
    }

    private collectSubtitleFontSample(): string {
        const samples: string[] = []
        for (const scene of this.episode.scenes) {
            for (const block of scene.script ?? []) {
                if (block.type === 'dialogue' || block.type === 'narration') {
                    samples.push(block.text ?? '')
                }
            }
        }

        const sample = samples.join('\n').replace(/#/g, '')
        return sample.trim() || '测试字幕'
    }

    /**
     * 渲染指定场景和时间点的帧
     * v11.81: 改为 async，确保场景完全加载
     */
    async renderFrame(sceneIndex: number, timeInScene: number, absoluteTime: number): Promise<VideoFrame> {
        if (!this.renderer || !this.offscreenCanvas || !this.stage || !this.contentViewport) {
            throw new Error('FrameCapture not initialized')
        }

        const scene = this.episode.scenes[sceneIndex]
        if (!scene) {
            throw new Error(`Scene ${sceneIndex} not found`)
        }

        // 如果切换场景，重新创建对象
        if (sceneIndex !== this.currentSceneIndex) {
            // v11.81: await loadScene 确保场景完全加载
            await this.loadScene(scene)
            this.prepareBlockPlayInfos(scene)
            await this.preloadTTSTimingsForBlockInfos()
            this.currentSceneIndex = sceneIndex
            // PA: 更新 currentScene 给 AnimationController 使用
            this.currentScene = scene
            // v11.60: 应用初始动画状态
            this.applyInitialAnimationStates(scene)
            this.lastFrameTimeInScene = 0
        }

        // 找到当前时间对应的 Block
        const currentInfo = this.getBlockAtTime(timeInScene)
        let blockLocalTime = 0
        let currentPivotCenters: Map<string, { x: number; y: number }> | null = null
        // Phase 2 Fix: 提升 states 到外层，供光照滤镜使用 Action 评估后的对象状态
        let evaluatedStates: Map<string, SceneObject> | null = null

        if (currentInfo) {
            // v11.88: 检测 Block 切换，处理 autoStopOnBlockEnd
            if (this.previousBlockInfo && this.previousBlockInfo !== currentInfo) {
                this.applyAutoStopOnBlockEnd(this.previousBlockInfo)
                // v11.88: Block 切换时清空动画触发状态，确保新 Block 中的动画能够正常触发
                this.triggeredAnimations.clear()
                this.followBBoxOffsets.clear()
            }
            this.previousBlockInfo = currentInfo

            blockLocalTime = timeInScene - currentInfo.startTime

            // 1. 评估所有对象状态
            const states = this.evaluateStates(currentInfo, blockLocalTime)
            evaluatedStates = states
            currentPivotCenters = this.applyStates(states, scene, currentInfo.startSnapshot.renderChain)

            // 1.5: 对象刚变为可见时，立即补启动延迟的初始动画，
            // 减少出生同帧的首帧静止感。
            this.animationController.syncDeferredInitialAnimations()

            // 2. 更新动画状态（处理 set_anim）
            this.updateAnimationStates(currentInfo, blockLocalTime)
        } else {
            // 没有 Block，使用初始状态
            this.applyInitialCameraTransform(scene)
            this.lastEvaluatedCameraState = null
        }

        // 5. 计算 deltaTime（必须在帧动画更新之前）
        const deltaTime = timeInScene - this.lastFrameTimeInScene
        this.lastFrameTimeInScene = timeInScene

        // 6. 更新所有帧动画（基于 deltaTime 推进 AnimatedSprite）
        // v11.82: 使用 deltaTime 累积机制，避免绝对时间计算的精度问题和跳帧
        this.updateAnimations(Math.max(0, deltaTime))

        // 7. 更新动画 Player（手动推进 deltaTime）
        this.objectAnimationPlayers.forEach(player => player.update(Math.max(0, deltaTime)))

        // v20: union 子对象在容器内，动画变换自动传播，无需 sharedPropagateUnionAnimations

        // P2: 更新 composite own 模式的离屏渲染纹理（必须在 player.update 之后、renderer.render 之前）
        updateCompositeRenderTargetsInOrder(
            this.compositeRenderTargets,
            evaluatedStates ? [...evaluatedStates.values()] : (this.currentScene?.setup?.objects ?? [])
        )

        if (currentInfo && currentPivotCenters) {
            // 方案B: 统一通过首帧 BBox 偏移量计算稳定的跟随点
            const followCenters = this.computeFollowVisualCenters(currentPivotCenters, currentInfo.blockActions, evaluatedStates)
            this.updateCamera(currentInfo, blockLocalTime, followCenters, Math.max(0, deltaTime))
        }

        this.updateSubtitleOverlay(currentInfo, blockLocalTime)

        // 6. 显示水印
        if (this.watermarkSprite) {
            this.watermarkSprite.visible = true
        }

        // v25.3: 光照滤镜 — 通过 updateTransform + toGlobal 获取精确屏幕坐标
        // Phase 2 Fix: 使用 evaluatedStates（含 Action 产生的光照变化）+ absoluteTime（视频时间轴）
        if (this.sceneStage && this.contentViewport && scene) {
            this.contentViewport.updateTransform()
            const lightObjects = evaluatedStates
                ? [...evaluatedStates.values()]
                : scene.setup.objects
            applyLightingFilter(
                lightObjects,
                this.sceneStage,
                CANVAS_WIDTH,
                CANVAS_HEIGHT,
                this.lightingFilterCache,
                new PIXI.Rectangle(0, 0, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT),
                (id) => this.objectContainers.get(id),
                absoluteTime,
                this.renderer ?? undefined,
                this.compositeRenderTargets,
            )
        }

        // Clip-Mask Phase 1：在 render 之前更新 worldTransform 并应用所有蒙版
        if (this.stage && scene) {
            // 根 stage 没有 parent，直接 updateTransform 会 NPE，逐子节点刷新。
            for (const child of this.stage.children) {
                child.updateTransform()
            }
            const maskStateObjects = evaluatedStates ? [...evaluatedStates.values()] : scene.setup.objects
            applyAllMasks(maskStateObjects, (id) => this.objectContainers.get(id), this.maskRendererResources)
        }

        // 渲染
        this.renderer.render(this.stage)

        // 隐藏水印（避免影响下一帧）
        if (this.watermarkSprite) {
            this.watermarkSprite.visible = false
        }

        const timestamp = (absoluteTime / 1000) * 1_000_000
        const frameDuration = (1 / this.config.frameRate) * 1_000_000

        try {
            return new VideoFrame(this.offscreenCanvas, {
                timestamp: timestamp,
                duration: frameDuration,
            })
        } catch (e) {
            try {
                const bitmap = await createImageBitmap(this.offscreenCanvas)
                const videoFrame = new VideoFrame(bitmap, {
                    timestamp: timestamp,
                    duration: frameDuration,
                })
                bitmap.close()
                return videoFrame
            } catch (fallbackError) {
                console.error('[FrameCapture] 创建 VideoFrame 失败:', fallbackError)
                throw fallbackError
            }
        }
    }

    /**
     * 准备 Block 播放信息
     */
    private prepareBlockPlayInfos(scene: Episode['scenes'][number]): void {
        this.ttsTimingCache.clear()
        this.pendingTTSTimingLoads.clear()
        const initialSnapshot: RuntimeSceneSnapshot = {
            objects: scene.setup.objects.map(obj => cloneSceneObject(obj)),
            renderChain: reconcileRenderChain(scene.setup.renderChain ? [...scene.setup.renderChain] : [], scene.setup.objects),
            camera: {
                x: scene.setup.camera.x ?? CANVAS_WIDTH / 2,
                y: scene.setup.camera.y ?? CANVAS_HEIGHT / 2,
                zoom: scene.setup.camera.zoom ?? 1,
                shakeOffsetX: 0,
                shakeOffsetY: 0,
            },
        }

        this.blockPlayInfos = buildBlockPlayInfos(initialSnapshot, scene.script ?? [], scene, {
            getDuration: (block) => {
                if (block.type === 'action') return block.duration ?? 0
                return block.ttsConfig?.duration ?? 0
            },
        })
    }

    private async preloadTTSTimingsForBlockInfos(): Promise<void> {
        const audioPaths = new Set<string>()
        for (const info of this.blockPlayInfos) {
            const audioPath = this.getBlockTTSAudioPath(info.block)
            if (audioPath) audioPaths.add(audioPath)
        }
        await Promise.all([...audioPaths].map(audioPath => this.loadTTSTimingForAudioPath(audioPath)))
    }

    private getBlockTTSAudioPath(block: BlockPlayInfo['block']): string | undefined {
        if (block.type === 'action') return undefined
        const config = block.ttsConfig
        if (!config) return undefined
        if (config.timingAudioPath) return config.timingAudioPath

        const audioPath = config.audioPath
        if (!audioPath || audioPath.startsWith('blob:') || audioPath.startsWith('data:')) {
            return undefined
        }
        return audioPath
    }

    private getTTSTimingForBlock(block: BlockPlayInfo['block']): TTSTimingFile | null | undefined {
        const audioPath = this.getBlockTTSAudioPath(block)
        if (!audioPath) return null
        if (this.ttsTimingCache.has(audioPath)) return this.ttsTimingCache.get(audioPath) ?? null
        void this.loadTTSTimingForAudioPath(audioPath)
        return undefined
    }

    private async loadTTSTimingForAudioPath(audioPath: string): Promise<TTSTimingFile | null> {
        if (this.ttsTimingCache.has(audioPath)) return this.ttsTimingCache.get(audioPath) ?? null

        const pending = this.pendingTTSTimingLoads.get(audioPath)
        if (pending) return pending

        const promise = this.projectStore.loadTTSTiming(audioPath)
            .then(timing => {
                this.ttsTimingCache.set(audioPath, timing)
                return timing
            })
            .catch(error => {
                console.warn('[FrameCapture] 加载 TTS timing 失败，降级为连续播放:', audioPath, error)
                this.ttsTimingCache.set(audioPath, null)
                return null
            })
            .finally(() => {
                this.pendingTTSTimingLoads.delete(audioPath)
            })

        this.pendingTTSTimingLoads.set(audioPath, promise)
        return promise
    }

    /**
     * 获取当前时间对应的 Block
     */
    private getBlockAtTime(timeInScene: number): BlockPlayInfo | null {
        for (const info of this.blockPlayInfos) {
            if (timeInScene >= info.startTime && timeInScene < info.endTime) {
                return info
            }
        }
        // 如果超出范围，返回最后一个
        if (this.blockPlayInfos.length > 0) {
            const lastInfo = this.blockPlayInfos[this.blockPlayInfos.length - 1]
            if (lastInfo && timeInScene >= lastInfo.endTime) {
                return lastInfo
            }
        }
        return this.blockPlayInfos[0] ?? null
    }

    /**
     * 评估所有对象状态
     */
    private evaluateStates(
        currentInfo: BlockPlayInfo,
        blockLocalTime: number,
    ): Map<string, SceneObject> {
        const objectIndexMap = new Map<string, number>()
        currentInfo.startSnapshot.objects.forEach((obj, idx) => {
            objectIndexMap.set(obj.id, idx)
        })
        const orderedBlockActions = sortActionsForEvaluation(currentInfo.blockActions, objectIndexMap)
        const objectStateActions = orderedBlockActions.filter((action) =>
            action.target !== 'camera' && isObjectStateAction(action)
        )
        const currentSlotIndex = getSlotIndexAtTime(currentInfo.slots, blockLocalTime)

        const baseStates = new Map<string, SceneObject>()
        for (const obj of currentInfo.startSnapshot.objects) {
            baseStates.set(obj.id, cloneSceneObject(obj))
        }

        for (const action of orderedBlockActions) {
            if (currentSlotIndex === -1) continue

            if (action.type === 'set_scene_structure') {
                if (action.slotIndex < currentSlotIndex) {
                    applyPreviewSceneStructureAction(baseStates, action)
                }
                continue
            }

            if (action.target === 'camera' || !isObjectStateAction(action)) continue

            const currentState = baseStates.get(action.target)
            if (!currentState) continue

            if (action.category === 'point') {
                if (action.slotIndex < currentSlotIndex) {
                    baseStates.set(action.target, applyPreviewObjectAction(currentState, action, baseStates))
                }
                continue
            }

            const span = (action as { slotSpan?: number }).slotSpan ?? 1
            const endSlot = action.slotIndex + span
            if (endSlot <= currentSlotIndex) {
                baseStates.set(action.target, applyPreviewObjectAction(currentState, action, baseStates))
            }
        }

        const pointStates = new Map<string, SceneObject>()
        for (const [id, state] of baseStates) {
            pointStates.set(id, cloneSceneObject(state))
        }

        for (const action of orderedBlockActions) {
            if (action.category !== 'point' || action.slotIndex !== currentSlotIndex) continue

            if (action.type === 'set_scene_structure') {
                applyPreviewSceneStructureAction(pointStates, action)
                continue
            }

            if (action.target === 'camera' || !isObjectStateAction(action)) continue

            const currentState = pointStates.get(action.target)
            if (!currentState) continue
            pointStates.set(action.target, applyPreviewObjectAction(cloneSceneObject(currentState), action, pointStates))
        }

        const parentOverrides = buildParentOverridesForTime(orderedBlockActions, blockLocalTime, currentInfo.slots)
        const sortedObjects = sortObjectsForEvaluation(
            sortObjectsBySlotActionOrder([...pointStates.values()], orderedBlockActions, currentSlotIndex),
            parentOverrides,
        )

        // Clip-Mask Phase 1 — D1.5 mask post-pass（与 ScenePlayer.evaluateStates / applyBlockActionsToState 一致）
        if (currentSlotIndex !== -1) {
            const setMaskActionsThroughCurrentSlot = orderedBlockActions.filter(
                a => a.type === 'set_mask' && a.slotIndex <= currentSlotIndex,
            )
            if (setMaskActionsThroughCurrentSlot.length > 0) {
                const prevSnapshot = {
                    ...currentInfo.startSnapshot,
                    objects: currentInfo.startSnapshot.objects,
                }
                const newSnapshot = {
                    ...currentInfo.startSnapshot,
                    objects: [...pointStates.values()],
                }
                applyMaskPostPass(prevSnapshot, newSnapshot, setMaskActionsThroughCurrentSlot)
            }
        }

        const states = new Map<string, SceneObject>()
        for (const objSetup of sortedObjects) {
            const targetId = objSetup.id
            const pointState = pointStates.get(targetId)
            if (!pointState) continue

            const activeDurationActions = objectStateActions.filter((action) => {
                if (action.target !== targetId || action.category !== 'duration') return false
                const { start, end, duration } = getActionTimeRangeForPreview(action, currentInfo.slots)
                const isBlockEndFrame = blockLocalTime === currentInfo.duration && end === currentInfo.duration
                return duration > 0 && blockLocalTime >= start && (blockLocalTime < end || isBlockEndFrame)
            })

            if (activeDurationActions.length === 0) {
                states.set(targetId, cloneSceneObject(pointState))
                continue
            }

            const ctx: ActionHandlerContext = {
                getObjectState: (id: string) => {
                    const evaluated = states.get(id)
                    if (evaluated) return evaluated as unknown as WriteableState
                    const candidate = pointStates.get(id)
                    return candidate ? (candidate as unknown as WriteableState) : undefined
                },
            }

            const currentState = evaluateObjectState(
                pointState,
                activeDurationActions,
                blockLocalTime,
                currentInfo.duration,
                currentInfo.slots,
                -1,
                ctx
            )
            states.set(targetId, currentState)
        }

        this.rebuildCompositeChildIdsInStateMap(states)
        this.reconcileEntityRenderChainsInStateMap(states)

        // Text reveal actions — 注入 revealProgress
        for (const [, state] of states) {
            if (state.type !== 'text') continue
            const textState = state as import('@/types/sceneObject').TextObject
            const currentAbsTime = currentInfo.startTime + blockLocalTime
            const revealState = computeTextRevealState(
                this.blockPlayInfos,
                currentInfo,
                state.id,
                currentAbsTime,
            )
            if (!revealState) continue
            textState.content = revealState.content
            ;(state as unknown as WriteableState).revealProgress = revealState.progress
        }

        return states
    }

    private rebuildCompositeChildIdsInStateMap(states: Map<string, SceneObject>): void {
        rebuildChildIdsFromParentIds([...states.values()])
    }

    private reconcileEntityRenderChainsInStateMap(states: Map<string, SceneObject>): void {
        const runtimeObjects = [...states.values()]
        for (const state of runtimeObjects) {
            if (state.type !== 'composite') continue
            const comp = state as CompositeObject
            if ((comp.compositeMode ?? 'entity') !== 'entity') continue
            comp.renderChain = reconcileRenderChain(comp.renderChain ?? [], runtimeObjects, comp.id)
        }
    }

    /**
     * 应用对象状态并返回视觉中心位置
     */
    private applyStates(
        states: Map<string, SceneObject>,
        scene: Episode['scenes'][number],
        renderChain?: readonly string[],
    ): Map<string, { x: number; y: number }> {
        const pivotCenters = new Map<string, { x: number; y: number }>()

        if (this.sceneStage && this.contentViewport) {
            for (const objSetup of scene.setup.objects) {
                const container = this.objectContainers.get(objSetup.id)
                if (!container) continue
                const state = states.get(objSetup.id)
                if (!state) continue

                const newParentId = state.parentId ?? null
                // v20: union/entity 统一挂载到 parentId 对应的容器
                let targetParent: PIXI.Container
                if (!newParentId) {
                    targetParent = this.sceneStage
                } else {
                    const parentCrt = this.compositeRenderTargets.get(newParentId)
                    targetParent = parentCrt?.getSourceContainer() ?? (this.objectContainers.get(newParentId) ?? this.sceneStage)
                }

                if (container.parent !== targetParent) {
                    if (container.parent) container.parent.removeChild(container)
                    targetParent.addChild(container)
                }
            }
        }

        for (const objSetup of scene.setup.objects) {
            const container = this.objectContainers.get(objSetup.id)
            const state = states.get(objSetup.id)
            if (!container || !state) continue

            const center = this.applyObjectState(container, state, objSetup, states)
            if (center) {
                pivotCenters.set(objSetup.id, center)
            }

            // 灯光对象：renderable=false 隐藏渲染，保留 transform 更新
            if (objSetup.type === 'light') {
                container.renderable = false
            }

            // v11.82: 与 ScenePlayer.applyStatesAndCacheTransforms 保持一致
            const player = this.getAnimationPlayerForObject(objSetup.id)
            if (player) player.cacheBaseTransform()
        }

        // v23: 为根级容器安装/更新 renderChain 驱动的渲染逻辑
        // 渲染顺序完全由 renderChain + sortRenderChainByZIndex 决定
        const activeRenderChain = reconcileRenderChain(
            renderChain ?? scene.setup.renderChain ?? [],
            [...states.values()],
        )
        if (this.sceneStage && activeRenderChain.length > 0) {
            const capturedChain = activeRenderChain
            const capturedStates = states
            const capturedObjects = scene.setup.objects
            installRootRenderChainRenderer(
                this.sceneStage,
                () => sortRenderChainByZIndex(
                    capturedChain,
                    (id) => capturedStates.get(id)?.zIndex ?? capturedObjects.find(o => o.id === id)?.zIndex ?? 0
                ),
                (id) => this.objectContainers.get(id),
            )
        }
        // 关键：导出也需基于 runtime 状态排序 entity 内部 renderChain，避免与预览行为不一致
        const runtimeObjectsToSort = scene.setup.objects.map(obj => states.get(obj.id) ?? obj)
        // v22: entity composite 内部排序 + 根级 union 排序，传入 getZIndex
        sharedSortCompositeContainers(
            runtimeObjectsToSort, this.objectContainers, this.compositeRenderTargets,
            (id) => states.get(id)?.zIndex ?? scene.setup.objects.find(o => o.id === id)?.zIndex ?? 0,
        )

        // P2: 将子对象的本地坐标 visual center 转换为场景世界坐标
        if (this.contentViewport) {
            this.contentViewport.updateTransform()
            for (const objSetup of scene.setup.objects) {
                const state = states.get(objSetup.id)
                if (!state?.parentId) continue
                const container = this.objectContainers.get(objSetup.id)
                if (!container) continue
                const localCenter = pivotCenters.get(objSetup.id)
                if (!localCenter) continue
                const scenePoint = this.projectContainerParentPointToScene(
                    objSetup.id,
                    container,
                    new PIXI.Point(localCenter.x, localCenter.y),
                    states,
                )
                pivotCenters.set(objSetup.id, { x: scenePoint.x, y: scenePoint.y })
            }
        }

        return pivotCenters
    }

    private findCompositeRenderTargetChain(
        objectId: string,
        states: Map<string, SceneObject>,
    ): { source: PIXI.Container; output: PIXI.Container }[] {
        const chain: { source: PIXI.Container; output: PIXI.Container }[] = []
        let currentId = states.get(objectId)?.parentId

        while (currentId) {
            const crt = this.compositeRenderTargets.get(currentId)
            if (crt) {
                chain.push({
                    source: crt.getSourceContainer(),
                    output: crt.getOutputContainer(),
                })
            }
            currentId = states.get(currentId)?.parentId
        }

        return chain
    }

    private projectGlobalPointThroughCompositeChain(
        objectId: string,
        globalPoint: PIXI.Point,
        states: Map<string, SceneObject>,
    ): PIXI.Point {
        if (!this.contentViewport) return globalPoint

        let projectedGlobalPoint = globalPoint
        for (const crtProjection of this.findCompositeRenderTargetChain(objectId, states)) {
            const sourceLocalPoint = crtProjection.source.toLocal(projectedGlobalPoint)
            projectedGlobalPoint = crtProjection.output.toGlobal(sourceLocalPoint)
        }

        return this.contentViewport.toLocal(projectedGlobalPoint)
    }

    private projectContainerParentPointToScene(
        objectId: string,
        container: PIXI.Container,
        pointInParent: PIXI.Point,
        states: Map<string, SceneObject>,
    ): PIXI.Point {
        if (!this.contentViewport) return pointInParent

        const globalPoint = container.parent.toGlobal(pointInParent)
        if (this.findCompositeRenderTargetChain(objectId, states).length > 0) {
            return this.projectGlobalPointThroughCompositeChain(objectId, globalPoint, states)
        }

        return this.contentViewport.toLocal(globalPoint)
    }

    private projectContainerLocalPointToScene(
        objectId: string,
        container: PIXI.Container,
        pointInContainer: PIXI.Point,
        states: Map<string, SceneObject>,
    ): PIXI.Point {
        if (!this.contentViewport) return pointInContainer

        const globalPoint = container.toGlobal(pointInContainer)
        if (this.findCompositeRenderTargetChain(objectId, states).length > 0) {
            return this.projectGlobalPointThroughCompositeChain(objectId, globalPoint, states)
        }

        return this.contentViewport.toLocal(globalPoint)
    }

    /**
     * 应用单个对象状态
     * P0: 委托给统一渲染器
     */
    private applyObjectState(
        container: PIXI.Container,
        state: SceneObject,
        objSetup: SceneObject,
        _runtimeStates?: Map<string, SceneObject>
    ): { x: number; y: number } | null {
        const result = this.sceneObjectRenderer.applyObjectState(container, state, objSetup, this.objectStateHost)

        // v20: union 子对象在容器内（真实 PIXI 父子关系），变换自动传播，无需 applyUnionProxyChain

        return result
    }

    /**
     * 方案B: 统一首帧 BBox 偏移量锁定
     */
    private computeFollowVisualCenters(
        pivotCenters: Map<string, { x: number; y: number }>,
        blockActions: Action[],
        states: Map<string, SceneObject> | null,
    ): Map<string, { x: number; y: number }> {
        const result = new Map(pivotCenters)
        if (!this.contentViewport) return result
        this.contentViewport.updateTransform()

        const followActions = blockActions.filter(
            (a: Action) => a.target === 'camera' && a.type === 'camera_follow'
        )

        for (const action of followActions) {
            const followTarget = (action.params as { followTarget?: string })?.followTarget
            if (!followTarget) continue

            const pivotCenter = pivotCenters.get(followTarget)
            if (!pivotCenter) continue

            // 检查缓存
            if (this.followBBoxOffsets.has(action.id)) {
                const offset = this.followBBoxOffsets.get(action.id)!
                result.set(followTarget, {
                    x: pivotCenter.x + offset.dx,
                    y: pivotCenter.y + offset.dy,
                })
                continue
            }

            // 首帧：从 PIXI 容器计算 BBox 中心偏移量
            const container = this.objectContainers.get(followTarget)
            if (!container) continue

            const bounds = container.getLocalBounds()
            if (bounds.width <= 0 || bounds.height <= 0) continue

            const bboxLocalCenter = new PIXI.Point(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
            )
            const bboxSceneCenter = states
                ? this.projectContainerLocalPointToScene(followTarget, container, bboxLocalCenter, states)
                : this.contentViewport.toLocal(container.toGlobal(bboxLocalCenter))

            const dx = bboxSceneCenter.x - pivotCenter.x
            const dy = bboxSceneCenter.y - pivotCenter.y

            this.followBBoxOffsets.set(action.id, { dx, dy })

            result.set(followTarget, {
                x: pivotCenter.x + dx,
                y: pivotCenter.y + dy,
            })
        }

        return result
    }

    /**
     * 更新相机
     */
    private updateCamera(
        currentInfo: BlockPlayInfo,
        blockLocalTime: number,
        centers: Map<string, { x: number; y: number }>,
        frameDeltaMs: number,
    ): void {
        // 处理 camera_follow
        const cameraActions = currentInfo.blockActions.filter((a: Action) => a.target === 'camera')

        // 遍历所有 camera_follow 动作，更新 lastFollowPosition
        for (const action of cameraActions) {
            if (action.type === 'camera_follow') {
                const followTarget = action.params?.followTarget
                if (followTarget && centers.has(followTarget)) {
                    const targetCenter = centers.get(followTarget)!
                    const offsetX = action.params?.offsetX ?? 0
                    const offsetY = action.params?.offsetY ?? -50
                    this.lastFollowPosition = {
                        x: targetCenter.x + offsetX,
                        y: targetCenter.y + offsetY,
                    }
                }
            }
        }

        const cameraState = evaluateCameraState(
            currentInfo.startSnapshot.camera,
            currentInfo.blockActions,
            blockLocalTime,
            currentInfo.duration,
            currentInfo.slots,
            centers,
            this.lastFollowPosition,
            frameDeltaMs,
            this.lastEvaluatedCameraState,
        )

        this.lastEvaluatedCameraState = { ...cameraState }
        this.applyCameraTransform(cameraState)
    }

    /**
     * 应用相机变换 — P0 委托给统一渲染器
     */
    private applyCameraTransform(cameraState: RuntimeCameraState): void {
        if (!this.contentViewport) return
        SceneObjectRenderer.applyCameraTransform(this.contentViewport, cameraState)
    }

    /**
     * 应用初始相机变换
     */
    private applyInitialCameraTransform(scene: Episode['scenes'][number]): void {
        if (!this.contentViewport) return

        const camera = scene.setup.camera
        this.contentViewport.position.set(
            -camera.x + (CAMERA_BASE_WIDTH / 2),
            -camera.y + (CAMERA_BASE_HEIGHT / 2)
        )
        this.contentViewport.scale.set(camera.zoom, camera.zoom)
    }

    /**
     * 加载场景对象
     * v11.81: 改为 async，确保角色完全初始化
     */
    private async loadScene(scene: Episode['scenes'][number]): Promise<void> {
        if (!this.contentViewport) return

        this.clearScene()

        this.sceneStage = new PIXI.Container()
        this.sceneStage.name = 'frame-capture-scene-stage'
        this.sceneStage.sortableChildren = true
        this.contentViewport.addChild(this.sceneStage)

        // v19: 优先按 renderChain 排序，fallback 到 zIndex
        const objects = scene.setup.objects

        // Text PRD Phase 0: 预加载 setup 字体，以及 Action Mode 的 set_text 字体切换
        // 阻塞导出，确保字体在渲染前可用（与 ScenePlayer.syncResources 一致）
        await preloadSceneFonts(collectSceneFontPreloadObjects(objects, scene.script ?? []))

        // v16: animations 已持久化，不再需要运行时 hydrate

        for (const obj of objects) {
            try {
                await sharedRenderObject(obj, this.sceneStage, this.renderHost)
            } catch (e) {
                console.error(`[FrameCapture] 渲染对象失败: ${obj.type} ${obj.id}`, e)
            }
        }

        // v11.81: 在所有对象创建后进行测量（与 ScenePlayer.measureObjects 一致）
        this.measureObjects(scene)
        sharedSyncObjectBoundsToPlayers(this.objectDimensions, this.objectAnimationPlayers)

        const initialStates = new Map<string, SceneObject>()
        for (const objSetup of scene.setup.objects) {
            initialStates.set(objSetup.id, { ...objSetup })
        }
        this.applyStates(initialStates, scene, scene.setup.renderChain)
    }

    /**
     * 测量对象尺寸 — P0 委托给统一渲染器
     */
    private measureObjects(scene: Episode['scenes'][number]): void {
        this.sceneObjectRenderer.measureObjectBounds(
            scene.setup.objects,
            this.objectContainers,
            this.objectStateHost
        )
    }

    /**
     * 加载水印
     */
    private async loadWatermark(): Promise<void> {
        try {
            const watermarkUrl = '/watermark.svg'
            const img = new Image()
            img.crossOrigin = 'anonymous'

            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve()
                img.onerror = (e) => reject(new Error(`无法加载水印图片${typeof e === 'string' ? ': ' + e : ''}`))
                img.src = watermarkUrl
            })

            const texture = PIXI.Texture.from(img)
            this.watermarkSprite = new PIXI.Sprite(texture)

            const padding = 15
            // 水印尺寸基于输出缩放比（而非内部超采样 pixelRatio）
            const outputScale = this.config.resolution.width / CAMERA_BASE_WIDTH
            const watermarkWidth = 480 / outputScale
            const watermarkHeight = 96 / outputScale
            const scale = watermarkWidth / img.width
            this.watermarkSprite.scale.set(scale)
            this.watermarkSprite.x = CAMERA_BASE_WIDTH - watermarkWidth - padding
            this.watermarkSprite.y = CAMERA_BASE_HEIGHT - watermarkHeight - padding
            this.watermarkSprite.visible = false
            this.watermarkSprite.zIndex = 10000
            this.stage!.addChild(this.watermarkSprite)
        } catch (error) {
            console.warn('[FrameCapture] 水印加载失败，将继续导出（无水印）:', error)
            this.watermarkSprite = null
        }
    }

    /**
     * 创建导出字幕覆盖层。
     * 坐标使用 CAMERA_BASE_* 逻辑尺寸，由 renderer resolution 映射到实际视频像素。
     */
    private createSubtitleOverlay(): void {
        if (!this.stage) return

        const style = this.getSubtitleStyle()
        const paddingX = 16
        const wordWrapWidth = CAMERA_BASE_WIDTH * (style.maxWidthPercent / 100) - paddingX * 2

        const container = new PIXI.Container()
        container.name = 'frame-capture-subtitle-overlay'
        container.visible = false
        container.zIndex = 9000

        const background = new PIXI.Graphics()
        const text = new PIXI.Text('', new PIXI.TextStyle({
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fill: style.textColor,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: Math.max(120, wordWrapWidth),
            lineHeight: Math.round(style.fontSize * 1.33),
        }))

        container.addChild(background)
        container.addChild(text)
        this.stage.addChild(container)

        this.subtitleContainer = container
        this.subtitleBackground = background
        this.subtitleText = text
    }

    private updateSubtitleOverlay(currentInfo: BlockPlayInfo | null, blockLocalTime: number): void {
        if (
            this.config.showSubtitles !== true
            || !this.subtitleContainer
            || !this.subtitleBackground
            || !this.subtitleText
        ) {
            return
        }

        const subtitle = currentInfo
            ? getSubtitleTextAtTime(currentInfo.block, currentInfo.slots, blockLocalTime)
            : ''

        if (!subtitle) {
            this.subtitleContainer.visible = false
            return
        }

        const style = this.getSubtitleStyle()
        const paddingX = 16
        const paddingY = 8
        const radius = 4

        this.subtitleText.text = subtitle
        this.subtitleText.position.set(paddingX, paddingY)

        const boxWidth = this.subtitleText.width + paddingX * 2
        const boxHeight = this.subtitleText.height + paddingY * 2

        this.subtitleBackground.clear()
        this.subtitleBackground.beginFill(
            this.parseHexColor(style.backgroundColor, DEFAULT_SUBTITLE_STYLE.backgroundColor),
            this.clampNumber(style.backgroundOpacity, 0, 1, DEFAULT_SUBTITLE_STYLE.backgroundOpacity)
        )
        this.subtitleBackground.drawRoundedRect(0, 0, boxWidth, boxHeight, radius)
        this.subtitleBackground.endFill()

        this.subtitleContainer.position.set(
            (CAMERA_BASE_WIDTH - boxWidth) / 2,
            CAMERA_BASE_HEIGHT * (1 - style.bottomPercent / 100) - boxHeight
        )
        this.subtitleContainer.visible = true
    }

    private getSubtitleStyle(): SubtitleStyle {
        const style = {
            ...DEFAULT_SUBTITLE_STYLE,
            ...(this.config.subtitleStyle ?? {}),
        }

        return {
            ...style,
            fontSize: this.clampNumber(
                style.fontSize,
                FONT_SIZE_PRESETS[0] ?? 8,
                FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1] ?? 500,
                DEFAULT_SUBTITLE_STYLE.fontSize
            ),
            backgroundOpacity: this.clampNumber(
                style.backgroundOpacity,
                0,
                1,
                DEFAULT_SUBTITLE_STYLE.backgroundOpacity
            ),
            maxWidthPercent: this.clampNumber(
                style.maxWidthPercent,
                50,
                95,
                DEFAULT_SUBTITLE_STYLE.maxWidthPercent
            ),
            bottomPercent: this.clampNumber(
                style.bottomPercent,
                2,
                20,
                DEFAULT_SUBTITLE_STYLE.bottomPercent
            ),
        }
    }

    private clampNumber(value: number, min: number, max: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback
        return Math.min(max, Math.max(min, value))
    }

    private parseHexColor(value: string, fallback: string): number {
        const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
        return Number.parseInt(normalized.slice(1), 16)
    }

    /**
     * PA: 更新动画状态 — 委托给 AnimationController
    */
    private updateAnimationStates(
        currentInfo: BlockPlayInfo,
        blockLocalTime: number,
    ): void {
        this.animationController.processSetAnimActions(
            currentInfo.blockActions,
            currentInfo.slots,
            blockLocalTime,
            currentInfo.duration,
            {
                blockId: currentInfo.block.id,
                ttsTiming: this.getTTSTimingForBlock(currentInfo.block),
            },
        )
    }

    /**
     * PA: Block 结束时自动停止动画 — 委托给 AnimationController
     */
    private applyAutoStopOnBlockEnd(prevBlockInfo: BlockPlayInfo): void {
        this.animationController.processAutoStopOnBlockEnd(prevBlockInfo.blockActions)
    }

    /**
     * PA: 应用初始动画状态 — 委托给 AnimationController
     * 保留 FrameCapture 特有的 prop _shouldPlay 管理
     */
    private applyInitialAnimationStates(scene: Episode['scenes'][number]): void {
        this.currentScene = scene
        // v16: 资源动画已在对象创建时深克隆到 obj.animations（PRD 7.5）
        this.animationController.processInitialAnimationStates()
        // FrameCapture 特有：prop 初始动画的 _shouldPlay 管理
        // 由 handleAnimationTriggered 钩子在 processInitialAnimationStates 内部处理
    }

    /**
     * PA: 处理动画触发后的 FrameCapture 特有行为
     * 主要管理 _shouldPlay 标志（离屏渲染时 PIXI ticker 不运行）
     * 角色动画由 CharacterSprite 内部管理，无需处理
     *
     * v16: 从 scene objects 推导 objectType 和 refId，不再由调用方传入
     */
    private handleAnimationTriggered(
        objectId: string,
        _animName: string,
        cmd: 'play' | 'stop',
    ): void {
        // 从场景对象中获取 objectType 和 refId
        const obj = this.currentScene?.setup.objects.find(o => o.id === objectId)
        if (!obj) return

        const objectType = obj.type

        // 帧动画子节点名称映射
        const spriteNameMap: Record<string, string> = {
            prop: 'prop_animation',
            background: 'bg_animation',
            symbol: 'symbol_animation',
            expression: 'expression_animation',
        }
        const spriteName = spriteNameMap[objectType]
        if (!spriteName) return

        const container = this.objectContainers.get(objectId)
        if (!container) return
        const animatedSprite = container.getChildByName(spriteName) as
            | (PIXI.AnimatedSprite & { _shouldPlay?: boolean })
            | undefined
        if (!animatedSprite) return

        if (cmd === 'play') {
            const fps = this.getAssetFps(obj)
            animatedSprite.animationSpeed = fps / 60
            ; (animatedSprite as PIXI.AnimatedSprite & { _shouldPlay?: boolean })._shouldPlay = true
            this.spriteAnimTimeAccumulator.set(animatedSprite, 0)
        } else {
            ; (animatedSprite as PIXI.AnimatedSprite & { _shouldPlay?: boolean })._shouldPlay = false
        }
    }

    /** 获取资源的帧率 */
    private getAssetFps(obj: SceneObject): number {
        const objectType = obj.type
        const refId = obj.refId

        if (objectType === 'prop') {
            return this.propStore.getProp(refId)?.fps ?? 25
        }
        if (objectType === 'background') {
            return this.backgroundStore.getBackground(refId)?.fps ?? 25
        }
        if (objectType === 'symbol') {
            const symbol = obj as SymbolObject
            const material = symbol.currentMaterialId
                ? symbol.materials.find(item => item.id === symbol.currentMaterialId)
                : symbol.materials[0]
            return material?.fps ?? 12
        }
        if (objectType === 'expression') {
            return this.expressionStore.getExpression(refId)?.speakingFps ?? 12
        }
        return 25
    }

    /**
     * 更新所有帧动画（手动推进 AnimatedSprite）
     * v11.82: 使用 deltaTime 累积机制，与 ScenePlayer ticker 行为一致
     * @param deltaTime 距上一帧的时间差 (ms)
     */
    private updateAnimations(deltaTime: number): void {
        advanceAllObjectAnimations(this.objectContainers, deltaTime, this.spriteAnimTimeAccumulator)
    }

    /**
     * 清理当前场景的所有资源
     */
    private clearScene(): void {
        if (!this.contentViewport) return

        // P2: 先清理离屏渲染目标
        this.compositeRenderTargets.forEach(crt => crt.destroy())
        this.compositeRenderTargets.clear()

        // Clip-Mask Phase 1：清理蒙版渲染资源
        disposeMaskRendererResources(this.maskRendererResources)

        // v11.60: 销毁 Animation Player 实例
        this.objectAnimationPlayers.forEach(player => player.destroy())
        this.objectAnimationPlayers.clear()

        this.triggeredAnimations.clear()
        this.objectContainers.forEach(container => {
            container.removeFromParent()
            container.destroy({ children: true })
        })
        this.objectContainers.clear()
        this.objectDimensions.clear()
        this.lastMeasuredPose.clear()
        this.blockPlayInfos = []
        this.lastFollowPosition = null
        this.lastEvaluatedCameraState = null
        this.followBBoxOffsets.clear()
        this.previousBlockInfo = null

        this.contentViewport.removeChildren()
        this.sceneStage = null
    }


    /**
     * 清理资源
     */
    destroy(): void {
        this.clearScene()

        if (this.renderer) {
            try {
                // OffscreenCanvas 没有 style 属性，需要特殊处理
                // 先手动销毁事件系统，避免它尝试访问 canvas.style
                const renderer = this.renderer as unknown as { events?: { domElement: object | null; destroy: () => void } }
                const events = renderer.events
                if (events) {
                    // 清除事件系统的目标元素引用，防止访问 canvas.style
                    if (events.domElement) {
                        events.domElement = null
                    }
                    // 销毁事件系统
                    try {
                        events.destroy()
                    } catch (e) {
                        // 忽略事件系统销毁错误
                    }
                }

                // 现在可以安全销毁渲染器
                // 传递 false 避免尝试移除 view
                this.renderer.destroy(false)
            } catch (error) {
                console.warn('[FrameCapture] 销毁渲染器时出现警告:', error)
            }
            this.renderer = null
        }

        if (this.stage) {
            this.stage.destroy({ children: true, texture: true, baseTexture: true })
            this.stage = null
        }

        this.offscreenCanvas = null
        this.scaleContainer = null
        this.contentViewport = null
        this.sceneStage = null
        this.subtitleContainer = null
        this.subtitleBackground = null
        this.subtitleText = null

        // v25: 清理光照滤镜缓存
        if (this.lightingFilterCache.instance) {
            this.lightingFilterCache.instance.destroy()
            delete this.lightingFilterCache.instance
        }
        if (this.lightingFilterCache.maskRT) {
            this.lightingFilterCache.maskRT.destroy(true)
            delete this.lightingFilterCache.maskRT
        }

        if (this.didOverridePixiSettings) {
            PIXI.settings.RESOLUTION = this.previousPixiResolution
            this.didOverridePixiSettings = false
        }
    }
}
