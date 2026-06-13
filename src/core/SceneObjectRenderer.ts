/**
 * 统一场景对象渲染器
 *
 * 提取 4 引擎（useSceneGraph、ScenePlayer、ActionPreviewDialog、FrameCapture）
 * 的共享渲染逻辑，消除重复代码。
 *
 * 职责：
 * 1. 从 SceneObject 创建 PIXI 容器（道具/背景/角色）
 * 2. 应用运行时状态到已有容器（applyObjectState）
 *
 * 不负责：
 * - GenericAnimationPlayer 创建（依赖各引擎的 renderer 实例）
 * - 交互层逻辑（拖拽、选中高亮 — 编辑器特有）
 * - 音频对象（无 PIXI 渲染内容）
 */

import * as PIXI from 'pixi.js'

import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { Z_INDEX_CAMERA_OVERLAY, Z_INDEX_LIGHT_OVERLAY } from '@/constants/zIndex'
import type { useBackgroundStore } from '@/stores/backgroundStore'
import type { useExpressionStore } from '@/stores/expressionStore'
import type { usePropStore } from '@/stores/propStore'
import type { CameraObject, CompositeObject, LightObject, SceneObject, ScreenEffectObject, ScreenEffectParams, SymbolObject } from '@/types/sceneObject'
import type { RuntimeCameraState } from '@/utils/actionEvaluator'
import { restoreAnimatedSpriteStillFrame } from '@/utils/animationUtils'
import { drawScreenEffectGraphics } from '@/utils/screenEffectRenderer'
import { getAutoTextLeading, normalizeTextContent, resolveTextGradient, resolveTextLineHeight } from '@/utils/textUtils'

import type { TextureProvider } from './TextureProvider'

// ============================================================================
// Types
// ============================================================================

/** Store 引用集合 */
export interface RenderStores {
    propStore: ReturnType<typeof usePropStore>
    backgroundStore: ReturnType<typeof useBackgroundStore>
    expressionStore: ReturnType<typeof useExpressionStore>
}

/** 对象尺寸与 pivot 信息 */
export interface ObjectDimensions {
    width: number
    height: number
    pivotX?: number
    pivotY?: number
    boundsX?: number
    boundsY?: number
}

/**
 * 对象状态宿主接口
 *
 * applyObjectState 依赖引擎特有的缓存（objectDimensions）。
 * 各引擎通过实现此接口将这些缓存桥接给统一渲染器，避免 SceneObjectRenderer 直接持有引擎状态。
 */
export interface ObjectStateHost {
    /** 获取对象尺寸缓存 */
    getObjectDimensions(objectId: string): ObjectDimensions | undefined
    /** 设置对象尺寸缓存 */
    setObjectDimensions(objectId: string, dims: ObjectDimensions): void
    /** 检查对象是否正在被交互（拖拽/缩放/旋转），如果是则跳过 transform 写入以避免竞态覆盖 */
    isInteractionLocked?(objectId: string): boolean
}

const GROUND_SHADOW_NAME = '__ground_shadow_ellipse'

function supportsCastShadow(state: SceneObject): boolean {
    if (state.type === 'prop' || state.type === 'symbol' || state.type === 'expression') return true
    if (state.type === 'composite') {
        return (state as CompositeObject).compositeMode === 'entity'
    }
    return false
}

function getLocalBoundsIgnoringGroundShadow(container: PIXI.Container): PIXI.Rectangle {
    const shadow = container.getChildByName(GROUND_SHADOW_NAME)
    if (!shadow) {
        return container.getLocalBounds()
    }

    const prevVisible = shadow.visible
    const prevRenderable = shadow.renderable
    shadow.visible = false
    shadow.renderable = false
    const bounds = container.getLocalBounds()
    shadow.visible = prevVisible
    shadow.renderable = prevRenderable
    return bounds
}

// ============================================================================
// SceneObjectRenderer
// ============================================================================

export class SceneObjectRenderer {
    private textureProvider: TextureProvider
    private stores: RenderStores

    constructor(textureProvider: TextureProvider, stores: RenderStores) {
        this.textureProvider = textureProvider
        this.stores = stores
    }

    // --------------------------------------------------------------------------
    // Prop 渲染
    // --------------------------------------------------------------------------

    /**
     * 创建道具 PIXI 容器
     * 支持静态道具和帧动画道具
     */
    createPropContainer(obj: SceneObject): PIXI.Container {
        const propData = this.stores.propStore.getProp(obj.refId)
        if (!propData) {
            throw new Error(`[SceneObjectRenderer] Prop data not found: refId=${obj.refId}`)
        }

        const container = new PIXI.Container()
        container.name = obj.id
        container.zIndex = obj.zIndex ?? 0

        // 1. 静态道具
        if (propData.type === 'static' && propData.url) {
            const imageUrl = this.textureProvider.getImageUrl(propData.url)
            if (imageUrl) {
                const texture = this.textureProvider.getTexture(propData.url)
                const sprite = new PIXI.Sprite(texture)
                sprite.name = 'prop_sprite'
                sprite.anchor.set(0.5)
                container.addChild(sprite)
            }
        }
        // 2. 帧动画道具
        else if (propData.type === 'animation' && propData.frames && propData.frames.length > 0) {
            const textures: PIXI.Texture[] = []
            for (const frame of propData.frames) {
                if (frame.url) {
                    const tex = this.textureProvider.getTexture(frame.url)
                    textures.push(tex)
                }
            }
            if (textures.length > 0) {
                const animatedSprite = new PIXI.AnimatedSprite(textures)
                animatedSprite.name = 'prop_animation'
                animatedSprite.anchor.set(0.5)
                animatedSprite.animationSpeed = (propData.fps ?? 25) / 60
                animatedSprite.autoUpdate = false  // 手动推进，消除出生帧延迟
                // 使用配置的静止帧
                restoreAnimatedSpriteStillFrame(animatedSprite, {
                    stillFrameSource: propData.stillFrameSource,
                    stillFrameIndex: propData.stillFrameIndex,
                    url: propData.stillFrameCustomUrl,
                }, (url: string) => this.textureProvider.getTexture(url))

                container.addChild(animatedSprite)
            }
        }

        return container
    }

    // --------------------------------------------------------------------------
    // Symbol 渲染 (v16)
    // --------------------------------------------------------------------------

    /**
     * 创建元件 PIXI 容器
     * 根据 currentMaterialId 加载对应素材的纹理
     */
    createSymbolContainer(obj: SceneObject): PIXI.Container {
        const symbolObj = obj as SymbolObject
        const container = new PIXI.Container()
        container.name = obj.id
        container.zIndex = obj.zIndex ?? 0

        const materialId = symbolObj.currentMaterialId
        const material = materialId
            ? symbolObj.materials.find(m => m.id === materialId)
            : symbolObj.materials[0]

        if (!material) {
            // 无素材时绘制占位符，确保画布上可见、可交互
            const PLACEHOLDER_SIZE = 200
            const halfSize = PLACEHOLDER_SIZE / 2

            const graphics = new PIXI.Graphics()
            graphics.name = 'symbol_placeholder'

            // 半透明圆角矩形背景
            graphics.beginFill(0x3a3a4a, 0.85)
            graphics.drawRoundedRect(-halfSize, -halfSize, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, 16)
            graphics.endFill()

            // 虚线边框效果
            graphics.lineStyle(3, 0x7a7a9a, 0.8)
            graphics.drawRoundedRect(-halfSize, -halfSize, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, 16)

            container.addChild(graphics)

            // 齿轮图标
            const iconText = new PIXI.Text('🔧', {
                fontSize: 48,
                fill: 0xcccccc,
            })
            iconText.anchor.set(0.5)
            iconText.position.set(0, -20)
            container.addChild(iconText)

            // "元件" 标签
            const labelText = new PIXI.Text(symbolObj.alias ?? symbolObj.name ?? '元件', {
                fontFamily: 'Arial, sans-serif',
                fontSize: 18,
                fill: 0xaaaaaa,
                align: 'center',
            })
            labelText.anchor.set(0.5)
            labelText.position.set(0, 35)
            container.addChild(labelText)

            return container
        }

        if (material.type === 'static' && material.url) {
            const resolvedUrl = this.textureProvider.getImageUrl(material.url)
            const texture = this.textureProvider.getTexture(resolvedUrl || material.url)
            const sprite = new PIXI.Sprite(texture)
            sprite.name = 'symbol_sprite'
            sprite.anchor.set(0.5)
            container.addChild(sprite)
        } else if (material.type === 'animation' && material.frames && material.frames.length > 0) {
            const textures: PIXI.Texture[] = []
            for (const frame of material.frames) {
                if (frame.url) {
                    const fUrl = this.textureProvider.getImageUrl(frame.url)
                    textures.push(this.textureProvider.getTexture(fUrl || frame.url))
                }
            }
            if (textures.length > 0) {
                const animatedSprite = new PIXI.AnimatedSprite(textures)
                animatedSprite.name = 'symbol_animation'
                animatedSprite.anchor.set(0.5)
                animatedSprite.animationSpeed = (material.fps ?? 12) / 60
                animatedSprite.loop = material.loop ?? true
                animatedSprite.autoUpdate = false  // 手动推进，消除出生帧延迟

                // v16: 使用配置的静止帧（与道具/背景一致），不自动播放
                restoreAnimatedSpriteStillFrame(animatedSprite, {
                    stillFrameSource: material.stillFrameSource,
                    stillFrameIndex: material.stillFrameIndex,
                    url: material.url,
                }, (url: string) => this.textureProvider.getTexture(url))
                container.addChild(animatedSprite)
            }
        }

        // v16: 记录当前渲染的素材 ID，供 applySymbolState 变更检测用
        const renderedId = material?.id ?? '__placeholder__'
            ; (container as PIXI.Container & { _renderedMaterialId?: string })._renderedMaterialId = renderedId

        return container
    }

    // --------------------------------------------------------------------------
    // Text 渲染 (Text PRD Phase 0)
    // --------------------------------------------------------------------------

    /**
     * 创建文本 PIXI 容器
     * 根据 TextObject 所有属性构建完整的 PIXI.TextStyle
     */
    createTextContainer(obj: SceneObject): PIXI.Container {
        const textObj = obj as import('@/types/sceneObject').TextObject
        const container = new PIXI.Container()
        container.name = obj.id
        container.zIndex = obj.zIndex ?? 0

        const styleOpts = this.buildTextStyleOpts(textObj)

        // Phase 1: 竖排文字分支
        if (textObj.writingMode === 'vertical') {
            const vertContainer = this.createVerticalTextLayout(textObj, styleOpts)
            vertContainer.name = 'text_vertical_group'
            container.addChild(vertContainer)
            this.syncTextBackground(container, textObj, vertContainer, textObj.textBoxMode ?? 'auto-size')
        } else {
            const style = new PIXI.TextStyle(styleOpts)
            const normalizedContent = normalizeTextContent(textObj.content ?? '文本')
            const text = new PIXI.Text(normalizedContent, style)
            text.name = 'text_content'
            text.anchor.set(0.5)
            container.addChild(text)
            this.syncTextBackground(container, textObj, text, textObj.textBoxMode ?? 'auto-size')
        }

        return container
    }

    private syncTextBackground(
        container: PIXI.Container,
        textState: import('@/types/sceneObject').TextObject,
        contentNode: PIXI.Container | PIXI.Text | undefined,
        boxMode: 'auto-width' | 'auto-height' | 'auto-size' | 'fixed',
    ): void {
        const enabled = textState.textBackgroundEnabled === true
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

        const colorHex = (textState.textBackgroundColor ?? '#000000').replace('#', '')
        const colorNum = Number.parseInt(colorHex, 16)
        const alpha = Math.max(0, Math.min(1, textState.textBackgroundAlpha ?? 0.35))
        const padX = Math.max(0, textState.textBackgroundPaddingX ?? 16)
        const padY = Math.max(0, textState.textBackgroundPaddingY ?? 10)
        const radius = Math.max(0, textState.textBackgroundRadius ?? 8)

        let width = 0
        let height = 0
        let cx = 0
        let cy = 0

        if (boxMode === 'fixed' && textState.width > 0 && textState.height > 0) {
            width = textState.width
            height = textState.height
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
     * Phase 1: 创建竖排文字布局
     * 将内容拆分为单字，沿 Y 轴排列，超过容器高度时自右向左折列。
     * CJK 标点（。，、！？）自动旋转。
     */
    private createVerticalTextLayout(
        textObj: import('@/types/sceneObject').TextObject,
        styleOpts: Partial<PIXI.ITextStyle>,
    ): PIXI.Container {
        const group = new PIXI.Container()
        const content = normalizeTextContent(textObj.content ?? '文本')
        const fontSize = textObj.fontSize ?? 72
        const lineHeight = resolveTextLineHeight(textObj.fontFamily, fontSize, textObj.lineHeight).lineHeight
        const columnGap = fontSize * 1.2
        const maxHeight = textObj.wordWrapWidth ?? 400 // 竖排时复用 wordWrapWidth 作为列高

        // CJK 竖排标点需要旋转的字符集
        const ROTATE_PUNCTUATION = new Set('。，、！？；：（）「」『』【】〈〉《》…—')

        let currentX = 0
        let currentY = 0

        for (let i = 0; i < content.length; i++) {
            const char = content[i]!
            if (char === '\n') {
                // 换行 = 换列（向左移动）
                currentX -= columnGap
                currentY = 0
                continue
            }

            const charText = new PIXI.Text(char, styleOpts)
            charText.anchor.set(0.5)
            charText.x = currentX
            charText.y = currentY

            // CJK 标点旋转
            if (ROTATE_PUNCTUATION.has(char)) {
                charText.rotation = Math.PI / 2
            }

            group.addChild(charText)
            currentY += lineHeight

            // 列高溢出，换列
            if (currentY >= maxHeight && i < content.length - 1) {
                currentX -= columnGap
                currentY = 0
            }
        }

        return group
    }

    // --------------------------------------------------------------------------
    // Background 渲染
    // --------------------------------------------------------------------------

    /**
     * 创建背景 PIXI 容器
     * 支持静态背景和帧动画背景，使用 obj.width/height 控制 sprite 尺寸
     */
    createBackgroundContainer(obj: SceneObject): PIXI.Container {
        const background = this.stores.backgroundStore.getBackground(obj.refId)
        if (!background) {
            throw new Error(`[SceneObjectRenderer] Background data not found: refId=${obj.refId}`)
        }

        const container = new PIXI.Container()
        container.name = obj.id
        container.position.set(obj.x ?? 0, obj.y ?? 0)
        container.scale.set(obj.scaleX ?? 1, obj.scaleY ?? 1)
        container.zIndex = obj.zIndex ?? 0

        let spriteCreated = false

        // 1. 帧动画背景
        if (background.type === 'animation' && background.frames && background.frames.length > 0) {
            const textures: PIXI.Texture[] = []
            for (const frame of background.frames) {
                const f = frame as { url?: string }
                if (f.url) {
                    const tex = this.textureProvider.getTexture(f.url)
                    textures.push(tex)
                }
            }

            if (textures.length > 0) {
                const animatedSprite = new PIXI.AnimatedSprite(textures)
                animatedSprite.name = 'bg_animation'
                animatedSprite.anchor.set(0, 0)
                animatedSprite.animationSpeed = (background.fps ?? 25) / 60
                animatedSprite.autoUpdate = false  // 手动推进，消除出生帧延迟

                // 使用 obj.width/height（编辑器已计算好的尺寸），无数据时回退到纹理原始尺寸
                if (obj.width > 0 && obj.height > 0) {
                    animatedSprite.width = obj.width
                    animatedSprite.height = obj.height
                }

                // 使用配置的静止帧
                restoreAnimatedSpriteStillFrame(animatedSprite, {
                    stillFrameSource: background.stillFrameSource,
                    stillFrameIndex: background.stillFrameIndex,
                    url: background.stillFrameCustomUrl,
                }, (url: string) => this.textureProvider.getTexture(url))

                container.addChild(animatedSprite)
                spriteCreated = true
            }
        }

        // 2. 静态背景（或帧动画无帧时的回退）
        if (!spriteCreated) {
            const bgUrl = background.url ?? background.backgroundImage
            if (!bgUrl) {
                throw new Error(`[SceneObjectRenderer] Background missing image URL: refId=${obj.refId}`)
            }

            const texture = this.textureProvider.getTexture(bgUrl)
            const sprite = new PIXI.Sprite(texture)
            sprite.name = 'background_sprite'
            sprite.anchor.set(0, 0)

            // 使用 obj.width/height（编辑器已计算好的尺寸），无数据时回退到纹理原始尺寸
            if (obj.width > 0 && obj.height > 0) {
                sprite.width = obj.width
                sprite.height = obj.height
            }

            container.addChild(sprite)
        }

        return container
    }



    // --------------------------------------------------------------------------
    // 状态应用（P0 统一）
    // --------------------------------------------------------------------------

    /**
     * 应用运行时状态到对象容器
     *
     * 统一了 ScenePlayer.applyObjectState 和 FrameCapture.applyObjectState 的四分支逻辑。
     * character 分支通过 CharacterStateHost 回调注入引擎特有缓存。
     *
     * composite 子对象的渲染顺序由 childIds 插入顺序决定（PIXI stable sort），
     * 无需微偏移机制。各引擎需确保按 childIds 顺序 addChild。
     *
     * @returns 对象的视觉中心位置（用于 camera_follow 计算），部分类型可能返回 null
     */
    applyObjectState(
        container: PIXI.Container,
        state: SceneObject,
        objSetup: SceneObject,
        host: ObjectStateHost
    ): { x: number; y: number } | null {
        let result: { x: number; y: number } | null = null
        if (objSetup.type === 'prop') {
            result = this.applySimpleTransform(container, state, host.getObjectDimensions(objSetup.id))
        } else if (objSetup.type === 'background') {
            result = this.applySimpleTransform(container, state, host.getObjectDimensions(objSetup.id))
        } else if (objSetup.type === 'screen_effect') {
            result = this.applyScreenEffectState(container, state, objSetup)
        } else if (objSetup.type === 'composite') {
            result = this.applyCompositeState(container, state, host.getObjectDimensions(objSetup.id))
        } else if (objSetup.type === 'symbol') {
            result = this.applySymbolState(container, state, objSetup, host)
        } else if (objSetup.type === 'expression') {
            result = this.applyExpressionState(container, state, objSetup, host)
        } else if (objSetup.type === 'camera') {
            result = this.applyCameraState(container, state, host)
        } else if (objSetup.type === 'light') {
            result = this.applyLightState(container, state)
        } else if (objSetup.type === 'text') {
            result = this.applyTextState(container, state, host.getObjectDimensions(objSetup.id))
        } else if (objSetup.type === 'mask') {
            // Clip-Mask Phase 1：mask 容器无可视内容，仅承载 worldTransform 用于 maskRenderer 计算几何。
            result = this.applySimpleTransform(container, state, host.getObjectDimensions(objSetup.id))
        }

        return result
    }

    /**
     * P2: 应用组合对象状态（composite 分支）
     *
     * composite 容器本身只需基础变换（位置/缩放/旋转/透明度/可见性/层级），
     * 子对象的状态由各自独立的 applyObjectState 调用处理。
     */
    private applyCompositeState(
        container: PIXI.Container,
        state: SceneObject,
        dims: ObjectDimensions | undefined
    ): { x: number; y: number } {
        const scaleX = state.scaleX * (state.flipX ? -1 : 1)
        const scaleY = state.scaleY
        container.scale.set(scaleX, scaleY)
        container.rotation = state.rotation
        container.alpha = state.alpha
        container.visible = (state.spawned ?? true) && state.visible
        container.zIndex = state.zIndex

        // v21: composite 的 pivotBase = (0, 0)，pivot 直接等于 originOffset
        const originX = state.transformOriginX ?? 0
        const originY = state.transformOriginY ?? 0
        container.pivot.set(originX, originY)

        // v21: 位置补偿使用简单偏移（与非 composite 一致）
        // 旧公式 posComp = originX*sx*cos - originY*sy*sin 随 rotation 变化，
        // 导致 PIXI 世界坐标 tx=obj.x 恒成立 → 旋转围绕原点而非 pivot。
        // 新公式 position 不随 rotation 变化 → pivot 在世界中固定 → 旋转围绕 pivot ✅
        const cx = state.flipX ? -originX : originX
        const cy = originY
        const posX = state.x + cx
        const posY = state.y + cy
        container.position.set(posX, posY)
        this.syncGroundShadow(container, state, dims)

        return { x: posX, y: posY }
    }



    /**
     * Transform Origin 补偿（像素偏移方案）
     *
     * transformOriginX/Y 是相对于 PivotBase 的像素偏移，默认 0 = 不偏移。
     * 直接将像素偏移加到 pivot 上，无需 dims 乘法。
     *
     * @returns 位置补偿量 { cx, cy }，调用者需加到 position 上
     */
    private applyTransformOriginPivot(
        container: PIXI.Container,
        state: SceneObject,
        dims: ObjectDimensions | undefined
    ): { cx: number; cy: number } {
        const originX = state.transformOriginX ?? 0
        const originY = state.transformOriginY ?? 0

        // v18: expression 对象使用锚点定位（pivot 固定在 (0,0) = sprite.anchor 位置），
        // 不使用 bounds 中心定位，确保切换不同表情时锚点对齐
        if (state.type === 'expression') {
            container.pivot.set(0, 0)
            return { cx: 0, cy: 0 }
        }

        // 默认情况（无偏移）：将 pivot 重置到几何中心，确保无残留偏移
        // 不能跳过 pivot 设置！否则容器可能残留其他渲染路径设置的自定义 pivot
        if (originX === 0 && originY === 0) {
            if (dims && dims.width > 0 && dims.height > 0) {
                const defaultPivotX = dims.pivotX ?? (dims.boundsX ?? 0) + dims.width / 2
                const defaultPivotY = dims.pivotY ?? (dims.boundsY ?? 0) + dims.height / 2
                container.pivot.set(defaultPivotX, defaultPivotY)
            }
            return { cx: 0, cy: 0 }
        }

        // 像素偏移直接使用，在默认 pivot 基础上加偏移
        if (dims && dims.width > 0 && dims.height > 0) {
            const defaultPivotX = dims.pivotX ?? (dims.boundsX ?? 0) + dims.width / 2
            const defaultPivotY = dims.pivotY ?? (dims.boundsY ?? 0) + dims.height / 2
            container.pivot.set(defaultPivotX + originX, defaultPivotY + originY)
        } else {
            // 无 dims 时也应用偏移（如 composite），pivot 直接加 originX/Y
            container.pivot.set(container.pivot.x + originX, container.pivot.y + originY)
        }

        // v20: flipX 补偿方向修正
        // PIXI worldMatrix: tx = posX - pivotX * scaleX * cos(rot) + ...
        // 当 flipX 时 scaleX < 0，pivot 增量的影响方向与 position 补偿方向相反
        // 必须翻转 cx 才能保持 pivot 变更时视觉位置不跳
        const flipX = state.flipX ?? false
        const cx = flipX ? -originX : originX
        return { cx, cy: originY }
    }

    /**
     * 应用简单变换（prop / background / symbol 共用分支）
     *
     * 两者使用完全相同的 scale → visible → pivot 位置补偿逻辑。
     */
    private applySimpleTransform(
        container: PIXI.Container,
        state: SceneObject,
        dims: ObjectDimensions | undefined
    ): { x: number; y: number } {
        const scaleX = state.scaleX * (state.flipX ? -1 : 1)
        const scaleY = state.scaleY
        container.scale.set(scaleX, scaleY)
        container.rotation = state.rotation
        container.alpha = state.alpha
        // spawned 控制对象存在性，优先级高于 visible
        container.visible = (state.spawned ?? true) && state.visible
        container.zIndex = state.zIndex

        // Transform Origin 位置补偿
        // dims 可能为 undefined（prop/background/symbol 对象不填充 objectDimensionsCache），
        // 此时从 container.getLocalBounds() 计算 fallback dims
        let effectiveDims = dims
        if (!effectiveDims) {
            const localBounds = container.getLocalBounds()
            if (localBounds.width > 0 && localBounds.height > 0) {
                effectiveDims = {
                    width: localBounds.width,
                    height: localBounds.height,
                    pivotX: localBounds.x + localBounds.width / 2,
                    pivotY: localBounds.y + localBounds.height / 2,
                    boundsX: localBounds.x,
                    boundsY: localBounds.y,
                }
            }
        }
        const { cx, cy } = this.applyTransformOriginPivot(container, state, effectiveDims)

        // v2.0.0: 统一中心坐标 — obj.x/y 已是中心坐标，加上变换原点补偿
        // 不使用 Math.round — 亚像素渲染避免 transform origin 旋转时的整数截断抖动
        const posX = state.x + cx
        const posY = state.y + cy
        container.position.set(posX, posY)
        this.syncGroundShadow(container, state, effectiveDims)

        return { x: posX, y: posY }
    }

    private syncGroundShadow(
        container: PIXI.Container,
        state: SceneObject,
        dims: ObjectDimensions | undefined
    ): void {
        if (!supportsCastShadow(state) || state.castShadow !== true || !dims) {
            const existing = container.getChildByName(GROUND_SHADOW_NAME)
            if (existing) {
                container.removeChild(existing)
                existing.destroy()
            }
            return
        }

        let shadow = container.getChildByName<PIXI.Graphics>(GROUND_SHADOW_NAME)
        if (!shadow) {
            shadow = new PIXI.Graphics()
            shadow.name = GROUND_SHADOW_NAME
            container.addChildAt(shadow, 0)
        }

        const baseSize = Math.min(dims.width, dims.height)
        const shadowW = Math.max(dims.width * 0.82, 28)
        const shadowH = Math.max(baseSize * 0.14, 10)
        const shadowY = (dims.boundsY ?? 0) + dims.height - shadowH * 0.2

        shadow.clear()
        // 两层椭圆叠加，提升近地阴影的可见性，同时保留边缘过渡。
        shadow.beginFill(0x000000, 0.16)
        shadow.drawEllipse(0, shadowY, shadowW * 0.58, shadowH * 0.72)
        shadow.endFill()

        shadow.beginFill(0x000000, 0.28)
        shadow.drawEllipse(0, shadowY, shadowW * 0.42, shadowH * 0.42)
        shadow.endFill()
    }

    /**
     * 应用元件状态（symbol 分支）
     *
     * 检测 currentMaterialId 变化，如果素材切换则重建容器内部的 sprite。
     * 几何变换委托给 applySimpleTransform。
     */
    private applySymbolState(
        container: PIXI.Container,
        state: SceneObject,
        objSetup: SceneObject,
        host: ObjectStateHost
    ): { x: number; y: number } {
        const symbolState = state as SymbolObject
        const symbolSetup = objSetup as SymbolObject
        const targetMaterialId = symbolState.currentMaterialId ?? symbolSetup.materials?.[0]?.id ?? '__placeholder__'
        const extContainer = container as PIXI.Container & { _renderedMaterialId?: string }
        const currentRenderedId = extContainer._renderedMaterialId ?? '__placeholder__'

        if (targetMaterialId !== currentRenderedId) {
            // 素材变更：销毁旧 children，重建新 sprite
            while (container.children.length > 0) {
                const child = container.children[0]
                if (child) {
                    container.removeChild(child)
                    child.destroy({ children: true })
                }
            }

            // 查找目标素材（优先从 state 的 materials 查找，回退到 setup 的 materials）
            const materials = symbolState.materials?.length > 0 ? symbolState.materials : symbolSetup.materials
            const material = targetMaterialId !== '__placeholder__'
                ? materials?.find(m => m.id === targetMaterialId)
                : materials?.[0]

            if (material) {
                if (material.type === 'static' && material.url) {
                    const resolvedUrl = this.textureProvider.getImageUrl(material.url)
                    const texture = this.textureProvider.getTexture(resolvedUrl || material.url)
                    const sprite = new PIXI.Sprite(texture)
                    sprite.name = 'symbol_sprite'
                    sprite.anchor.set(0.5)
                    container.addChild(sprite)
                } else if (material.type === 'animation' && material.frames && material.frames.length > 0) {
                    const textures: PIXI.Texture[] = []
                    for (const frame of material.frames) {
                        if (frame.url) {
                            const fUrl = this.textureProvider.getImageUrl(frame.url)
                            textures.push(this.textureProvider.getTexture(fUrl || frame.url))
                        }
                    }
                    if (textures.length > 0) {
                        const animatedSprite = new PIXI.AnimatedSprite(textures)
                        animatedSprite.name = 'symbol_animation'
                        animatedSprite.anchor.set(0.5)
                        animatedSprite.animationSpeed = (material.fps ?? 12) / 60
                        animatedSprite.loop = material.loop ?? true
                        animatedSprite.autoUpdate = false  // 手动推进，消除出生帧延迟

                        // v16: 使用配置的静止帧，不自动播放（由 initialAnimations/set_anim 控制）
                        restoreAnimatedSpriteStillFrame(animatedSprite, {
                            stillFrameSource: material.stillFrameSource,
                            stillFrameIndex: material.stillFrameIndex,
                            url: material.url,
                        }, (url: string) => this.textureProvider.getTexture(url))

                        container.addChild(animatedSprite)
                    }
                }
            }

            extContainer._renderedMaterialId = targetMaterialId
        }

        return this.applySimpleTransform(container, state, host.getObjectDimensions(objSetup.id))
    }

    // --------------------------------------------------------------------------
    // Expression 渲染 (v18)
    // --------------------------------------------------------------------------

    /**
     * 创建独立表情 PIXI 容器
     * 从 expressionStore 获取表情数据，渲染为 Sprite 或 AnimatedSprite
     */
    createExpressionContainer(obj: SceneObject): PIXI.Container {
        const container = new PIXI.Container()
        container.name = obj.id
        container.zIndex = obj.zIndex ?? 0

        this.buildExpressionSprite(container, obj.refId)

        return container
    }

    /**
     * 构建表情 sprite 并添加到容器
     * 可复用于初始创建和 refId 变更时的重建
     */
    private getExpressionRenderKey(refId: string): string {
        const expression = this.stores.expressionStore.getExpression(refId)
        if (!expression) return `${refId}:missing`

        return JSON.stringify({
            refId,
            defaultFrameUrl: expression.defaultFrame?.url ?? '',
            speakingFrameUrls: expression.speakingFrames?.map(frame => frame.url ?? '') ?? [],
            anchor: expression.anchor ?? { x: 0.5, y: 0.5 },
            defaultScale: expression.defaultScale ?? 1,
            flipHorizontal: expression.flipHorizontal ?? false,
            blendMode: expression.blendMode ?? 'normal',
            speakingFps: expression.speakingFps ?? 12,
            speakingLoop: expression.speakingLoop ?? true,
        })
    }

    private buildExpressionSprite(container: PIXI.Container, refId: string): void {
        const expression = this.stores.expressionStore.getExpression(refId)
        if (!expression) {
            // refId 为空或表情不存在：渲染占位符（与 Symbol 占位符一致）
            const PLACEHOLDER_SIZE = 200
            const halfSize = PLACEHOLDER_SIZE / 2

            const graphics = new PIXI.Graphics()
            graphics.name = 'expression_placeholder'

            // 半透明圆角矩形背景
            graphics.beginFill(0x3a3a4a, 0.85)
            graphics.drawRoundedRect(-halfSize, -halfSize, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, 16)
            graphics.endFill()

            // 虚线边框效果
            graphics.lineStyle(3, 0x7a7a9a, 0.8)
            graphics.drawRoundedRect(-halfSize, -halfSize, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, 16)

            container.addChild(graphics)

            // 表情图标
            const iconText = new PIXI.Text('🎭', {
                fontSize: 48,
                fill: 0xcccccc,
            })
            iconText.anchor.set(0.5)
            iconText.position.set(0, -20)
            container.addChild(iconText)

            // "表情" 标签
            const labelText = new PIXI.Text('表情', {
                fontFamily: 'Arial, sans-serif',
                fontSize: 18,
                fill: 0xaaaaaa,
                align: 'center',
            })
            labelText.anchor.set(0.5)
            labelText.position.set(0, 35)
            container.addChild(labelText)

            ;(container as PIXI.Container & { _renderedRefId?: string; _expressionRenderKey?: string })._renderedRefId = refId
            ;(container as PIXI.Container & { _expressionRenderKey?: string })._expressionRenderKey = this.getExpressionRenderKey(refId)
            return
        }

        const anchor = {
            x: expression.anchor?.x ?? 0.5,
            y: expression.anchor?.y ?? 0.5
        }
        const defaultScale = expression.defaultScale ?? 1
        const flipH = expression.flipHorizontal ?? false

        // 判断是帧动画还是静态
        const speakingFrames = expression.speakingFrames ?? []
        const hasSpeakingFrames = speakingFrames.length > 0

        if (hasSpeakingFrames) {
            // 帧动画表情：使用 speakingFrames 创建 AnimatedSprite
            const textures: PIXI.Texture[] = []
            for (const frame of speakingFrames) {
                if (frame.url) {
                    const tex = this.textureProvider.getTexture(frame.url)
                    textures.push(tex)
                }
            }

            if (textures.length > 0) {
                const animatedSprite = new PIXI.AnimatedSprite(textures)
                animatedSprite.name = 'expression_animation'
                animatedSprite.anchor.set(anchor.x, anchor.y)
                animatedSprite.animationSpeed = (expression.speakingFps ?? 12) / 60
                animatedSprite.loop = expression.speakingLoop ?? true
                animatedSprite.autoUpdate = false  // 手动推进，消除出生帧延迟
                animatedSprite.scale.set(
                    defaultScale * (flipH ? -1 : 1),
                    defaultScale
                )

                // 静止帧：默认显示 defaultFrame
                const defaultFrameUrl = expression.defaultFrame?.url
                if (defaultFrameUrl) {
                    const stillTexture = this.textureProvider.getTexture(defaultFrameUrl)
                    if (stillTexture && stillTexture !== PIXI.Texture.EMPTY) {
                        animatedSprite.texture = stillTexture
                    }
                } else {
                    animatedSprite.gotoAndStop(0)
                }

                // 混合模式
                if (expression.blendMode === 'multiply') {
                    animatedSprite.blendMode = PIXI.BLEND_MODES.MULTIPLY
                }

                container.addChild(animatedSprite)
            }
        } else {
            // 静态表情：使用 defaultFrame
            const defaultFrameUrl = expression.defaultFrame?.url
            if (defaultFrameUrl) {
                const texture = this.textureProvider.getTexture(defaultFrameUrl)
                const sprite = new PIXI.Sprite(texture)
                sprite.name = 'expression_sprite'
                sprite.anchor.set(anchor.x, anchor.y)
                sprite.scale.set(
                    defaultScale * (flipH ? -1 : 1),
                    defaultScale
                )

                // 混合模式
                if (expression.blendMode === 'multiply') {
                    sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY
                }

                container.addChild(sprite)
            }
        }

        // 记录当前渲染的 refId
        ;(container as PIXI.Container & { _renderedRefId?: string; _expressionRenderKey?: string })._renderedRefId = refId
        ;(container as PIXI.Container & { _expressionRenderKey?: string })._expressionRenderKey = this.getExpressionRenderKey(refId)
    }

    /**
     * 应用表情状态（expression 分支）
     *
     * 检测 refId 变化，如果表情切换则重建容器内部 sprite。
     * 几何变换委托 applySimpleTransform。
     */
    private applyExpressionState(
        container: PIXI.Container,
        state: SceneObject,
        objSetup: SceneObject,
        host: ObjectStateHost
    ): { x: number; y: number } {
        const targetRefId = state.refId
        const extContainer = container as PIXI.Container & { _renderedRefId?: string; _expressionRenderKey?: string }
        const currentRenderedId = extContainer._renderedRefId ?? ''
        const targetRenderKey = this.getExpressionRenderKey(targetRefId)

        if (targetRefId !== currentRenderedId || targetRenderKey !== extContainer._expressionRenderKey) {
            // refId 或表情资源配置变更：销毁旧 children，重建新 sprite
            while (container.children.length > 0) {
                const child = container.children[0]
                if (child) {
                    container.removeChild(child)
                    child.destroy({ children: true })
                }
            }

            this.buildExpressionSprite(container, targetRefId)
        }

        return this.applySimpleTransform(container, state, host.getObjectDimensions(objSetup.id))
    }

    /**
     * 应用画面特效状态（screen_effect 分支）
     *
     * Phase 4b: 直接从 SceneObject 的 params 嵌套结构读取画面特效参数，
     * 而非从 ObjectStateSnapshot 的平铺顶层读取（消除结构断层）。
     */
    private applyScreenEffectState(
        container: PIXI.Container,
        state: SceneObject,
        objSetup: SceneObject
    ): null {
        const scaleX = state.scaleX * (state.flipX ? -1 : 1)
        const scaleY = state.scaleY
        container.scale.set(scaleX, scaleY)
        container.rotation = state.rotation
        container.alpha = state.alpha
        container.visible = (state.spawned !== false) && state.visible
        container.zIndex = state.zIndex

        // 位置：直接赋值（不做 halfW/halfH 补偿，与 Editor 和 ScenePlayer 统一）
        container.position.set(state.x, state.y)

        // 重绘 Graphics：直接使用 ScreenEffectObject.params
        const screenEffectObj = state as ScreenEffectObject
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const graphics = container.getChildByName('screen_effect_graphics') as PIXI.Graphics | null
        if (graphics && screenEffectObj.params) {
            // 防抖：参数未变化时跳过重绘，避免每次 render 都 remove/add 羽化 sprite
            // 这在 Action Mode + ghost 高频更新时可显著降低显示树抖动。
            const drawKey = `${objSetup.width}x${objSetup.height}:${JSON.stringify(screenEffectObj.params)}`
            const extContainer = container as PIXI.Container & { _screenEffectDrawKey?: string }
            if (extContainer._screenEffectDrawKey !== drawKey) {
                drawScreenEffectGraphics(graphics, screenEffectObj.params, objSetup.width, objSetup.height, container)
                extContainer._screenEffectDrawKey = drawKey
            }
        }

        return null
    }

    /**
     * 应用相机状态（camera 分支）
     *
     * 相机与普通对象不同：
     * - 不使用 scaleX/scaleY（固定为 1,1），zoom 通过重绘 Graphics 边框实现
     * - 不旋转（rotation 固定为 0）
     * - visible 由编辑器工具栏的 cameraEditorVisible 控制
     * - zIndex 固定为 Z_INDEX_CAMERA_OVERLAY
     *
     * 此方法与 updateActionModeObjects 中的相机内联逻辑对齐，
     * 用于 syncContainerFromStore 路径（拖拽/缩放交互期间的即时视觉反馈）。
     */
    private applyCameraState(
        container: PIXI.Container,
        state: SceneObject,
        _host: ObjectStateHost
    ): { x: number; y: number } {
        const cameraState = state as CameraObject
        const zoom = cameraState.zoom || 1.0
        const actionWidth = CAMERA_BASE_WIDTH / zoom
        const actionHeight = CAMERA_BASE_HEIGHT / zoom

        // 重绘 camera_border 以匹配当前 zoom 下的尺寸
        const graphics = container.getChildByName('camera_border') as PIXI.Graphics | undefined
        if (graphics) {
            graphics.clear()
            graphics.lineStyle(20, 0x00ff00)
            graphics.beginFill(0x000000, 0.001)
            graphics.drawRect(0, 0, actionWidth, actionHeight)
            graphics.endFill()
        }

        // pivot 居中
        container.pivot.set(actionWidth / 2, actionHeight / 2)

        // 位置
        container.position.set(state.x, state.y)

        // 固定属性
        container.scale.set(1, 1)
        container.rotation = 0
        container.alpha = 1
        container.zIndex = Z_INDEX_CAMERA_OVERLAY

        // 可见性由穿透列表在渲染管线层统一控制，此处使用 state 默认值
        container.visible = state.visible

        return { x: state.x, y: state.y }
    }

    /**
     * 应用光源对象状态
     * 编辑器中绘制可视化指示器（环境光=小圆圈，点光源=范围圆圈+中心点）
     * 实际光照效果由 LightingFilter 在渲染管线层统一处理
     */
    private applyLightState(
        container: PIXI.Container,
        state: SceneObject,
    ): { x: number; y: number } {
        const lightState = state as LightObject
        const colorNum = parseInt((lightState.lightColor || '#ffffff').replace('#', ''), 16)
        const ambientCoreRadius = 18
        const ambientHaloRadius = 34
        const pointCoreRadius = 10
        const pointHandleRadius = 22
        const pointRadius = Math.max(lightState.lightRadius, pointHandleRadius + 12)

        // 重绘指示器图形
        let graphics = container.getChildByName('light_indicator') as PIXI.Graphics | undefined
        if (!graphics) {
            graphics = new PIXI.Graphics()
            graphics.name = 'light_indicator'
            container.addChild(graphics)
        }
        graphics.clear()

        if (lightState.lightType === 'ambient') {
            // 环境光：小尺寸全局光照徽记，强调“可选中但不占画布”
            graphics.beginFill(colorNum, 0.16)
            graphics.drawCircle(0, 0, ambientHaloRadius)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.55)
            graphics.drawCircle(0, 0, ambientHaloRadius)

            graphics.beginFill(colorNum, 0.85)
            graphics.drawCircle(0, 0, ambientCoreRadius)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.9)
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI / 4) * i
                const inner = ambientCoreRadius + 6
                const outer = ambientHaloRadius + (i % 2 === 0 ? 10 : 4)
                graphics.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
                graphics.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
            }

            graphics.beginFill(0xffffff, 0.9)
            graphics.drawCircle(0, 0, 4)
            graphics.endFill()

            container.hitArea = new PIXI.Rectangle(-96, -96, 192, 192)
        } else if (lightState.lightType === 'spot') {
            const directionAngle = lightState.directionAngle ?? 0
            const coneAngleDeg = lightState.coneAngle ?? 100
            const coneHalfRad = (coneAngleDeg * Math.PI / 180) / 2
            const outerRadius = pointRadius

            graphics.beginFill(colorNum, 0.08)
            graphics.moveTo(0, 0)
            graphics.arc(0, 0, outerRadius, directionAngle - coneHalfRad, directionAngle + coneHalfRad)
            graphics.lineTo(0, 0)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.45)
            graphics.moveTo(0, 0)
            graphics.arc(0, 0, outerRadius, directionAngle - coneHalfRad, directionAngle + coneHalfRad)
            graphics.lineTo(0, 0)

            graphics.beginFill(colorNum, 0.18)
            graphics.drawCircle(0, 0, pointHandleRadius)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.95)
            graphics.drawCircle(0, 0, pointHandleRadius)

            graphics.beginFill(colorNum, 0.92)
            graphics.drawCircle(0, 0, pointCoreRadius)
            graphics.endFill()

            const arrowLength = Math.max(40, Math.min(outerRadius, 80))
            const arrowTipX = Math.cos(directionAngle) * arrowLength
            const arrowTipY = Math.sin(directionAngle) * arrowLength
            graphics.lineStyle(3, colorNum, 0.9)
            graphics.moveTo(0, 0)
            graphics.lineTo(arrowTipX, arrowTipY)
            graphics.lineTo(
                arrowTipX - Math.cos(directionAngle - Math.PI / 6) * 12,
                arrowTipY - Math.sin(directionAngle - Math.PI / 6) * 12,
            )
            graphics.moveTo(arrowTipX, arrowTipY)
            graphics.lineTo(
                arrowTipX - Math.cos(directionAngle + Math.PI / 6) * 12,
                arrowTipY - Math.sin(directionAngle + Math.PI / 6) * 12,
            )

            container.hitArea = new PIXI.Rectangle(-96, -96, 192, 192)
        } else {
            // 点光源：显示光照范围 + 中心控制柄，兼顾可读性和命中性
            graphics.lineStyle(2, colorNum, 0.4)
            graphics.drawCircle(0, 0, pointRadius)

            graphics.lineStyle(1, colorNum, 0.2)
            graphics.drawCircle(0, 0, pointRadius * 0.66)

            graphics.beginFill(colorNum, 0.08)
            graphics.drawCircle(0, 0, pointRadius)
            graphics.endFill()

            graphics.beginFill(colorNum, 0.18)
            graphics.drawCircle(0, 0, pointHandleRadius)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.9)
            graphics.drawCircle(0, 0, pointHandleRadius)

            graphics.beginFill(colorNum, 0.85)
            graphics.drawCircle(0, 0, pointCoreRadius)
            graphics.endFill()

            graphics.lineStyle(2, colorNum, 0.8)
            graphics.moveTo(-pointHandleRadius - 8, 0)
            graphics.lineTo(pointHandleRadius + 8, 0)
            graphics.moveTo(0, -pointHandleRadius - 8)
            graphics.lineTo(0, pointHandleRadius + 8)

            container.hitArea = new PIXI.Rectangle(-96, -96, 192, 192)
        }

        // 位置
        container.position.set(state.x, state.y)
        // 固定属性
        container.scale.set(1, 1)
        container.rotation = 0
        container.alpha = 1
        container.zIndex = Z_INDEX_LIGHT_OVERLAY
        container.visible = state.visible

        return { x: state.x, y: state.y }
    }

    /**
     * 应用文本对象状态（text 分支）
     *
     * 更新 PIXI.Text 的内容和样式，然后委托 applySimpleTransform 处理几何变换。
     */
    private applyTextState(
        container: PIXI.Container,
        state: SceneObject,
        dims: ObjectDimensions | undefined,
    ): { x: number; y: number } {
        const textState = state as import('@/types/sceneObject').TextObject
        const normalizedContent = normalizeTextContent(textState.content)
        const effectiveWordWrap = textState.wordWrap ?? true
        const isVertical = textState.writingMode === 'vertical'

        // Phase 1: 检测 writingMode 切换 → 需要重建子结构
        const hasHorizontal = container.getChildByName('text_content') !== null
        const hasVertical = container.getChildByName('text_vertical_group') !== null

        if (isVertical && hasHorizontal) {
            // 横排 → 竖排：销毁现有 text_content，创建 vertical group
            const old = container.getChildByName('text_content')
            if (old) container.removeChild(old)
            const styleOpts = this.buildTextStyleOpts(textState)
            const vertGroup = this.createVerticalTextLayout(textState, styleOpts)
            vertGroup.name = 'text_vertical_group'
            container.addChild(vertGroup)
        } else if (!isVertical && hasVertical) {
            // 竖排 → 横排：销毁 vertical group，创建 text_content
            const old = container.getChildByName('text_vertical_group')
            if (old) container.removeChild(old)
            const styleOpts = this.buildTextStyleOpts(textState)
            const text = new PIXI.Text(textState.content ?? '', new PIXI.TextStyle(styleOpts))
            text.name = 'text_content'
            text.anchor.set(0.5)
            container.addChild(text)
        }

        if (isVertical) {
            // 竖排模式：重建 vertical group 内容
            const vertGroup = container.getChildByName('text_vertical_group') as PIXI.Container | undefined
            if (vertGroup) {
                // 清空并重新布局
                vertGroup.removeChildren()
                const styleOpts = this.buildTextStyleOpts(textState)
                const newGroup = this.createVerticalTextLayout(textState, styleOpts)
                while (newGroup.children.length > 0) {
                    const child = newGroup.children[0]!
                    newGroup.removeChild(child)
                    vertGroup.addChild(child)
                }
            }
            const currentVert = container.getChildByName('text_vertical_group') as PIXI.Container | undefined
            this.syncTextBackground(container, textState, currentVert, textState.textBoxMode ?? 'auto-size')
        } else {
            // 横排模式：更新 PIXI.Text 属性
            const textChild = container.getChildByName('text_content') as PIXI.Text | undefined
            if (textChild) {
                const lineHeightInfo = resolveTextLineHeight(textState.fontFamily, textState.fontSize, textState.lineHeight)
                const gradient = textState.fillType === 'linear_gradient'
                    ? resolveTextGradient(textState.gradientStops, textState.gradientAngle)
                    : null
                const fillValue = gradient ? gradient.colors : (textState.color ?? '#ffffff')
                const boxMode = textState.textBoxMode ?? 'auto-size'
                const styleOpts: Partial<PIXI.ITextStyle> = {
                    fontFamily: textState.fontFamily ?? 'Noto Sans SC',
                    fontSize: textState.fontSize ?? 72,
                    fontWeight: textState.fontWeight ?? 'normal',
                    fontStyle: textState.fontStyle ?? 'normal',
                    fill: fillValue,
                    align: (textState.align ?? 'center'),
                    breakWords: true,
                    whiteSpace: 'pre-line',
                    strokeThickness: textState.strokeThickness ?? 0,
                    dropShadow: textState.dropShadow ?? false,
                    dropShadowColor: textState.dropShadowColor ?? '#000000',
                    dropShadowBlur: textState.dropShadowBlur ?? 4,
                    dropShadowAngle: textState.dropShadowAngle ?? Math.PI / 4,
                    dropShadowDistance: textState.dropShadowDistance ?? 4,
                    lineHeight: lineHeightInfo.lineHeight,
                    leading: getAutoTextLeading(
                        textState.fontFamily,
                        textState.fontSize,
                        lineHeightInfo.source === 'explicit' ? lineHeightInfo.lineHeight : undefined,
                    ),
                    letterSpacing: textState.letterSpacing ?? 0,
                }
                if (gradient) {
                    styleOpts.fillGradientType = gradient.gradientType
                    styleOpts.fillGradientStops = gradient.gradientStops
                }
                if (textState.stroke) styleOpts.stroke = textState.stroke
                if (boxMode === 'auto-width' || boxMode === 'auto-size') {
                    styleOpts.wordWrap = false
                } else {
                    const wrapWidth = boxMode === 'fixed'
                        ? Math.max(50, textState.width ?? 400)
                        : Math.max(50, textState.wordWrapWidth ?? 400)
                    styleOpts.wordWrap = effectiveWordWrap
                    styleOpts.wordWrapWidth = wrapWidth
                }
                const content = normalizedContent
                const ws = state as unknown as import('@/utils/actionHandlers/types').WriteableState
                let displayText = content
                if (ws.revealProgress !== undefined) {
                    const visibleCount = Math.ceil(content.length * ws.revealProgress)
                    displayText = content.substring(0, visibleCount)
                }
                const rebuiltText = new PIXI.Text(displayText, new PIXI.TextStyle(styleOpts))
                rebuiltText.name = 'text_content'
                rebuiltText.anchor.set(0.5)
                container.removeChild(textChild)
                textChild.destroy()
                container.addChild(rebuiltText)
                this.syncTextBackground(container, textState, rebuiltText, boxMode)
            }
        }

        // Phase 1: fixed 模式 — 添加/更新/移除矩形 mask 裁切溢出
        const boxMode = textState.textBoxMode ?? 'auto-size'
        const existingMask = container.getChildByName('text_box_mask') as PIXI.Graphics | undefined
        if (boxMode === 'fixed' && state.width > 0 && state.height > 0) {
            const w = state.width
            const h = state.height
            if (existingMask) {
                existingMask.clear()
                existingMask.beginFill(0xffffff)
                existingMask.drawRect(-w / 2, -h / 2, w, h)
                existingMask.endFill()
            } else {
                const mask = new PIXI.Graphics()
                mask.name = 'text_box_mask'
                mask.beginFill(0xffffff)
                mask.drawRect(-w / 2, -h / 2, w, h)
                mask.endFill()
                container.addChild(mask)
                container.mask = mask
            }
        } else if (existingMask) {
            // 非 fixed 模式：移除 mask
            container.mask = null
            container.removeChild(existingMask)
        }

        return this.applySimpleTransform(container, state, dims)
    }

    /**
     * 构建 TextStyle 选项对象（横排/竖排共用）
     */
    private buildTextStyleOpts(textState: import('@/types/sceneObject').TextObject): Partial<PIXI.ITextStyle> {
        const effectiveWordWrap = textState.wordWrap ?? true
        const boxMode = textState.textBoxMode ?? 'auto-size'
        // Phase 2: 渐变填充：当 fillType=linear_gradient 时使用颜色数组
        const gradient = textState.fillType === 'linear_gradient'
            ? resolveTextGradient(textState.gradientStops, textState.gradientAngle)
            : null
        const fillValue = gradient ? gradient.colors : (textState.color ?? '#ffffff')

        const opts: Partial<PIXI.ITextStyle> = {
            fontFamily: textState.fontFamily ?? 'Noto Sans SC',
            fontSize: textState.fontSize ?? 72,
            fontWeight: textState.fontWeight ?? 'normal',
            fontStyle: textState.fontStyle ?? 'normal',
            fill: fillValue,
            align: (textState.align ?? 'center'),
            breakWords: true,
            whiteSpace: 'pre-line',
            strokeThickness: textState.strokeThickness ?? 0,
            dropShadow: textState.dropShadow ?? false,
            dropShadowColor: textState.dropShadowColor ?? '#000000',
            dropShadowBlur: textState.dropShadowBlur ?? 4,
            dropShadowAngle: textState.dropShadowAngle ?? Math.PI / 4,
            dropShadowDistance: textState.dropShadowDistance ?? 4,
            letterSpacing: textState.letterSpacing ?? 0,
        }
        const lineHeightInfo = resolveTextLineHeight(textState.fontFamily, textState.fontSize, textState.lineHeight)
        opts.leading = getAutoTextLeading(
            textState.fontFamily,
            textState.fontSize,
            lineHeightInfo.source === 'explicit' ? lineHeightInfo.lineHeight : undefined,
        )
        if (gradient) {
            opts.fillGradientType = gradient.gradientType
            opts.fillGradientStops = gradient.gradientStops
        }
        if (boxMode === 'auto-width' || boxMode === 'auto-size') {
            opts.wordWrap = false
        } else {
            const wrapWidth = boxMode === 'fixed'
                ? Math.max(50, textState.width ?? 400)
                : Math.max(50, textState.wordWrapWidth ?? 400)
            opts.wordWrap = effectiveWordWrap
            opts.wordWrapWidth = wrapWidth
        }
        if (textState.stroke) opts.stroke = textState.stroke
        // 始终设置 lineHeight：自动与显式统一通过 resolveTextLineHeight 解析
        opts.lineHeight = lineHeightInfo.lineHeight
        return opts
    }

    // --------------------------------------------------------------------------
    // 尺寸测量
    // --------------------------------------------------------------------------

    /**
     * 测量场景中所有对象的 localBounds 并缓存到 ObjectStateHost
     *
     * 在所有对象容器创建后调用一次，确保 bounds 测量准确。
     */
    measureObjectBounds(
        objects: readonly SceneObject[],
        containers: Map<string, PIXI.Container>,
        host: ObjectStateHost
    ): void {
        for (const objSetup of objects) {
            if (objSetup.type === 'audio') continue
            // v25: 光源对象不需要测量边界
            if (objSetup.type === 'light') continue
            const container = containers.get(objSetup.id)
            if (!container) continue

            // v19: composite 容器（尤其 union proxy）本身可能为空，
            // 从子对象位置计算虚拟边界以支持 transform origin
            if (objSetup.type === 'composite') {
                const comp = objSetup as CompositeObject
                const childIds = comp.childIds ?? []
                if (childIds.length > 0) {
                    // 从子对象的 position 计算包围盒
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
                    for (const childId of childIds) {
                        const childObj = objects.find(o => o.id === childId)
                        if (!childObj) continue
                        // 子对象位置是中心坐标，使用子对象的 width/height 估算边界
                        // 如果没有 width/height，使用子对象的已测量 dims
                        const childDims = host.getObjectDimensions(childId)
                        const hw = childDims ? childDims.width / 2 : 50
                        const hh = childDims ? childDims.height / 2 : 50
                        minX = Math.min(minX, childObj.x - hw)
                        maxX = Math.max(maxX, childObj.x + hw)
                        minY = Math.min(minY, childObj.y - hh)
                        maxY = Math.max(maxY, childObj.y + hh)
                    }
                    if (minX < Infinity) {
                        const width = maxX - minX
                        const height = maxY - minY
                        const pivotX = minX + width / 2
                        const pivotY = minY + height / 2
                        host.setObjectDimensions(objSetup.id, {
                            width, height, pivotX, pivotY,
                            boundsX: minX, boundsY: minY
                        })
                    }
                }
                continue
            }

            const localBounds = getLocalBoundsIgnoringGroundShadow(container)
            if (localBounds.width <= 0 || localBounds.height <= 0) continue

            const pivotX = localBounds.x + localBounds.width / 2
            const pivotY = localBounds.y + localBounds.height / 2

            // prop/background/symbol 设置 pivot
            // v18: expression 不设 pivot（保持 (0,0) = 锚点位置，由 applyTransformOriginPivot 统一处理）
            if (objSetup.type === 'prop' || objSetup.type === 'background' || objSetup.type === 'symbol') {
                container.pivot.set(pivotX, pivotY)
            }

            host.setObjectDimensions(objSetup.id, {
                width: localBounds.width,
                height: localBounds.height,
                pivotX,
                pivotY,
                boundsX: localBounds.x,
                boundsY: localBounds.y
            })
        }
    }

    // --------------------------------------------------------------------------
    // 相机变换
    // --------------------------------------------------------------------------

    /**
     * 应用相机变换到 contentViewport 容器
     *
     * 统一了 ScenePlayer.applyCameraTransform 和 FrameCapture.applyCameraTransform 的逻辑。
     * 包含相机边界限制（确保相机不超出画布范围）。
     *
     * @param contentViewport  相机视口容器
     * @param cameraState  运行时相机状态
     */
    static applyCameraTransform(
        contentViewport: PIXI.Container,
        cameraState: RuntimeCameraState,
        snapToPixel = false
    ): void {
        const { x, y, zoom, shakeOffsetX, shakeOffsetY } = cameraState

        // 相机边界限制
        const halfViewWidth = (CAMERA_BASE_WIDTH / 2) / zoom
        const halfViewHeight = (CAMERA_BASE_HEIGHT / 2) / zoom
        const minX = halfViewWidth
        const maxX = CANVAS_WIDTH - halfViewWidth
        const minY = halfViewHeight
        const maxY = CANVAS_HEIGHT - halfViewHeight
        const clampedX = Math.max(minX, Math.min(maxX, x))
        const clampedY = Math.max(minY, Math.min(maxY, y))

        // pivot 方式实现相机跟随
        let pivotX = clampedX + shakeOffsetX
        let pivotY = clampedY + shakeOffsetY

        // 导出路径：对齐到物理像素网格，消除亚像素纹理采样抖动
        // 屏幕物理像素 = pivot × zoom × resolution(2)
        // 要求 pivot × zoom × 2 为整数 → 对齐步长 = 1 / (zoom × 2)
        if (snapToPixel) {
            const snapGrid = zoom * 2
            pivotX = Math.round(pivotX * snapGrid) / snapGrid
            pivotY = Math.round(pivotY * snapGrid) / snapGrid
        }

        contentViewport.pivot.set(pivotX, pivotY)
        contentViewport.position.set(CAMERA_BASE_WIDTH / 2, CAMERA_BASE_HEIGHT / 2)
        contentViewport.scale.set(zoom, zoom)
    }

    // --------------------------------------------------------------------------
    // P2: 通用子容器创建（组合对象的子对象）
    // --------------------------------------------------------------------------

    /**
     * 为组合对象的子对象创建 PIXI 容器
     *
     * 使用内部 dispatch Map 实现多态分发，消除 renderComposite 中的 if/else 链。
     * 调用者只需遍历 childIds，对每个子对象调用本方法。
     */
    async createChildContainer(obj: SceneObject): Promise<PIXI.Container | null> {
        const dispatch: Record<string, (o: SceneObject) => PIXI.Container | Promise<PIXI.Container>> = {
            prop: (o) => this.createPropContainer(o),
            background: (o) => this.createBackgroundContainer(o),
            symbol: (o) => this.createSymbolContainer(o),
            expression: (o) => this.createExpressionContainer(o),
        }

        const factory = dispatch[obj.type]
        if (!factory) {
            // 不支持的子类型（audio/text/camera 等不嵌套）
            return null
        }

        const container = await factory(obj)
        return container
    }

    // --------------------------------------------------------------------------
    // Screen Effect 渲染
    // --------------------------------------------------------------------------

    /**
     * 创建画面特效 PIXI 容器（Container + Graphics）
     *
     * Phase 3 归一化：统一 useSceneGraph 和 renderPipeline 的 screen_effect 容器创建路径。
     */
    createScreenEffectContainer(
        id: string,
        params: ScreenEffectParams,
        width: number,
        height: number,
        zIndex: number
    ): { container: PIXI.Container; graphics: PIXI.Graphics } {
        const container = new PIXI.Container()
        container.name = id
        container.zIndex = zIndex
        container.sortableChildren = false

        const graphics = new PIXI.Graphics()
        graphics.name = 'screen_effect_graphics'

        // 先添加 graphics 到容器，再绘制（羽化需要在 graphics 之后添加 sprite）
        container.addChild(graphics)
        drawScreenEffectGraphics(graphics, params, width, height, container)

        return { container, graphics }
    }

    // --------------------------------------------------------------------------
    // P2: 基础变换应用（DRY）
    // --------------------------------------------------------------------------

    /**
     * 应用基础几何变换到容器
     *
     * 用于 renderComposite 等场景中只需设置 position/scale/rotation/alpha/zIndex/visible、
     * 不涉及 pivot 补偿和动画状态的简单变换。
     */
    static applyBasicTransform(container: PIXI.Container, obj: SceneObject): void {
        container.position.set(obj.x, obj.y)
        container.scale.set(obj.scaleX ?? 1, obj.scaleY ?? 1)
        container.rotation = obj.rotation ?? 0
        container.alpha = obj.alpha ?? 1
        container.zIndex = obj.zIndex
        container.visible = obj.visible ?? true
    }
}
