/**
 * GenericAnimationPlayer
 * 通用动画播放器，适用于道具、背景等简单对象
 * 
 * 与 CharacterSprite 的区别：
 * - 不支持 Part 级别的动画（无多部位组装）
 * - 直接应用到单个 PIXI.Container
 * - 更轻量级，复用核心 AnimationPlayer 逻辑
 */

import * as PIXI from 'pixi.js'
import { GlowFilter, MotionBlurFilter } from 'pixi-filters'

import type { AnimationDefinition, AnimationOutput, AnimationPlayParams, AnimationTrack, EffectTrackOutput } from '@/types/animation'
import { TARGET_SELF } from '@/types/animation'
import { restoreAnimatedSpriteStillFrame, type StillFrameConfig, type TextureGetter } from '@/utils/animationUtils'

import { createDynamicEffectManager, type DynamicEffectManager } from './animation/DynamicEffectManager'
import {
    composeAnimationOutputs,
    type CompositionContext,
    type EffectNumericDelta,
} from './AnimationComposition'
import { AnimationPlayer } from './AnimationPlayer'
import { CompositeRenderTarget } from './CompositeRenderTarget'
import { createRibbonEffect, type RibbonEffect } from './effects/RibbonEffect'
import { createWaveEffect, type WaveEffect } from './effects/WaveEffect'

/**
 * v18: 跨对象 Player 解析器（委托模式用）
 * 根据对象 ID 获取对应的 GenericAnimationPlayer
 */
export type PlayerResolver = (objectId: string) => GenericAnimationPlayer | null

export interface GenericAnimationPlayerConfig {
    target: PIXI.Container
    /** 动画所属对象的 ID */
    ownerObjectId?: string
    /** v18: 跨对象 Player 查找回调（委托模式用） */
    playerResolver?: PlayerResolver

    /** v11.52: 对象类型（用于自动从 Store 获取静止帧配置） */
    objectType?: 'prop' | 'background'
    /** v11.52: 对象 ID（用于自动从 Store 获取静止帧配置） */
    objectId?: string
    /** v11.52: 纹理获取器（用于自定义静止图片恢复） */
    textureGetter?: TextureGetter
    /** v11.52: 静止帧配置（可选，会被 objectType+objectId 自动覆盖） */
    stillFrameConfig?: StillFrameConfig
    frameSequencePlayback?: 'auto' | 'named_only' | 'disabled'
    /** v11.60: 是否启用离屏合成模式（用于多部件角色整体变换） */
    compositeMode?: boolean
    /** v11.60: PIXI 渲染器引用（compositeMode 需要） */
    renderer?: PIXI.Renderer
}

export class GenericAnimationPlayer {
    private target: PIXI.Container
    private players = new Map<string, AnimationPlayer>()
    private effectManager: DynamicEffectManager
    private waveEffect: WaveEffect
    private ribbonEffect: RibbonEffect

    // 基准变换（用于 Base + Delta 模式）
    private baseX = 0
    private baseY = 0
    private baseScaleX = 1
    private baseScaleY = 1
    private baseRotation = 0
    private baseAlpha = 1

    // 对象边界尺寸和起点（用于 pivot 位置补偿）
    private objectWidth = 0
    private objectHeight = 0
    private objectBoundsX = 0
    private objectBoundsY = 0

    // v19: 动画位置增量（含 pivot 补偿），供 propagateUnionAnimations 读取
    private lastDeltaX = 0
    private lastDeltaY = 0

    // Filter 缓存
    private glowFilter: GlowFilter | null = null
    private motionBlurFilter: MotionBlurFilter | null = null

    // v11.52: 静止帧配置（用于停止动画时恢复）
    private stillFrameIndex = 0
    private stillFrameConfig: StillFrameConfig | null = null
    private textureGetter: TextureGetter | null = null

    // v11.52: 对象标识（用于从 Store 获取配置）
    private objectType: 'prop' | 'background' | null = null
    private objectId: string | null = null
    private frameSequencePlayback: 'auto' | 'named_only' | 'disabled' = 'auto'

    // v18: 跨对象委托模式
    // @ts-expect-error TS6133: 保留用于调试和日志
    private ownerObjectId: string | null = null
    private playerResolver: PlayerResolver | null = null
    /** 已委托的动画跟踪：animName → Map<targetPlayerId, delegatedAnimName> */
    private delegatedAnimations = new Map<string, Map<string, string>>()


    // v11.60: 离屏合成模式支持
    private compositeTarget: CompositeRenderTarget | null = null
    private compositeMode = false

    constructor(config: GenericAnimationPlayerConfig) {
        this.target = config.target
        this.ownerObjectId = config.ownerObjectId ?? null
        this.playerResolver = config.playerResolver ?? null

        this.textureGetter = config.textureGetter ?? null
        this.objectType = config.objectType ?? null
        this.objectId = config.objectId ?? null
        this.frameSequencePlayback = config.frameSequencePlayback ?? 'auto'
        this.compositeMode = config.compositeMode ?? false

        // 优先使用传入的 stillFrameConfig，否则从 Store 自动获取
        if (config.stillFrameConfig) {
            this.stillFrameConfig = config.stillFrameConfig
            if (config.stillFrameConfig.stillFrameIndex !== undefined) {
                this.stillFrameIndex = config.stillFrameConfig.stillFrameIndex
            }
        } else if (config.objectType && config.objectId) {
            // 自动从 Store 获取
            this.loadStillFrameConfigFromStore()
        }

        this.effectManager = createDynamicEffectManager()
        this.waveEffect = createWaveEffect()
        this.ribbonEffect = createRibbonEffect()
        this.cacheBaseTransform()

        // v11.60: 初始化离屏合成目标
        if (this.compositeMode && config.renderer) {
            this.compositeTarget = new CompositeRenderTarget({
                source: this.target,
                renderer: config.renderer
            })
            // 启用离屏模式
            this.compositeTarget.enable()
        }
    }

    private syncFrameSequenceSpriteState(): void {
        const animatedSprite = this.findAnimatedSprite()
        if (!animatedSprite) return

        const activePlayback = this.getActiveFrameSequencePlayback()
        const playableSprite = animatedSprite as PIXI.AnimatedSprite & { _shouldPlay?: boolean }

        if (activePlayback && animatedSprite.textures.length > 1) {
            animatedSprite.loop = activePlayback.loop
            animatedSprite.animationSpeed = activePlayback.fps / 60
            playableSprite._shouldPlay = true
            return
        }

        playableSprite._shouldPlay = false
    }

    /**
     * 解析素材源 FPS
     * 当 track.fps 未定义时，从 AnimatedSprite 当前 animationSpeed 读取
     * animationSpeed 由 sprite 创建代码根据素材实时 FPS 设置（如 expression.speakingFps）
     */
    private resolveSourceFps(): number {
        const sprite = this.findAnimatedSprite()
        if (sprite && sprite.animationSpeed > 0) {
            return Math.round(sprite.animationSpeed * 60)
        }
        return 25
    }

    private getActiveFrameSequencePlayback(): { fps: number; loop: boolean } | null {
        for (const player of this.players.values()) {
            if (!player.isPlaying) continue
            const definition = player.currentAnimation
            if (definition?.type !== 'track') continue

            const frameTrack = definition.tracks.find(
                (track): track is Extract<AnimationTrack, { trackType: 'frame_sequence' }> =>
                    track.trackType === 'frame_sequence' && (!track.targetObjectId || track.targetObjectId === TARGET_SELF)
            )
            if (!frameTrack) continue

            return {
                fps: frameTrack.fps ?? this.resolveSourceFps(),
                loop: player.loop,
            }
        }

        return null
    }

    private getFrameSequenceFps(definition: AnimationDefinition): number {
        if (definition.type !== 'track') return this.resolveSourceFps()

        const frameTrack = definition.tracks.find(
            (track): track is Extract<AnimationTrack, { trackType: 'frame_sequence' }> =>
                track.trackType === 'frame_sequence' && (!track.targetObjectId || track.targetObjectId === TARGET_SELF)
        )
        return frameTrack?.fps ?? this.resolveSourceFps()
    }

    /**
     * 缓存基准变换
     */
    cacheBaseTransform(): void {
        const t = this.getBaseTransformTarget()
        if (!this.isContainerUsable(t)) return
        this.baseX = t.x
        this.baseY = t.y
        this.baseScaleX = t.scale.x
        this.baseScaleY = t.scale.y
        this.baseRotation = t.rotation
        this.baseAlpha = t.alpha

        // v21: 统一使用 getLocalBounds 测量对象边界
        try {
            const bounds = this.target.getLocalBounds()
            if (bounds.width > 0 && bounds.height > 0) {
                this.objectWidth = bounds.width
                this.objectHeight = bounds.height
                this.objectBoundsX = bounds.x
                this.objectBoundsY = bounds.y
            }
        } catch {
            // getLocalBounds 可能在容器没有子元素时抛出异常，忽略
        }
    }

    /**
     * 设置对象边界尺寸和起点坐标（用于 pivot 位置补偿计算）
     * 由 ScenePlayer / FrameCapture 在 measureObjects() 后调用
     *
     * @param boundsX 边界的局部坐标起点 X，可选（用于 composite 等 PIXI pivot 不在 bounds 中心的情况）
     * @param boundsY 边界的局部坐标起点 Y，可选
     */
    setObjectBounds(width: number, height: number, boundsX?: number, boundsY?: number): void {
        this.objectWidth = width
        this.objectHeight = height
        if (boundsX !== undefined) this.objectBoundsX = boundsX
        if (boundsY !== undefined) this.objectBoundsY = boundsY
    }

    /**
     * v19: 获取当前动画帧的位置增量（含 pivot 补偿）
     * propagateUnionAnimations 使用此增量将动画驱动的位移传播到 union 子对象
     */
    getAnimationPositionDelta(): { x: number; y: number } {
        return { x: this.lastDeltaX, y: this.lastDeltaY }
    }

    /**
     * 每帧更新
     * @param deltaTime 距上一帧的时间 (ms)
     */
    update(deltaTime: number): void {
        if (!this.isContainerUsable(this.getBaseTransformTarget())) return

        // 1. 更新特效管理器的时间
        this.effectManager.update(deltaTime)
        this.waveEffect.update(deltaTime)
        this.ribbonEffect.update(deltaTime)

        // 2. 收集所有播放器输出
        const outputs: AnimationOutput[] = []
        for (const player of this.players.values()) {
            const output = player.update(deltaTime)
            if (output) {
                outputs.push(output)
            }
        }

        // 3. 合并并应用输出
        if (outputs.length > 0) {
            this.applyOutputs(outputs)
        }

        // 4. 更新 Wave 特效
        this.syncFrameSequenceSpriteState()
        this.waveEffect.updateAllEffects()
        // v12.0: 更新 Ribbon 特效
        this.ribbonEffect.updateAllEffects()

        // 5. v11.60: 离屏模式下更新 RenderTexture
        if (this.compositeTarget) {
            this.compositeTarget.updateRenderTexture()
        }
    }

    private getFilterTarget(): PIXI.Container {
        if (this.compositeTarget) {
            return this.compositeTarget.getOutputContainer()
        }
        return this.target
    }

    /**
     * 播放动画
     * v11.52: 帧动画直接使用 AnimatedSprite.play()
     * v11.60: 添加 setOnLoop 和 setOnStop 回调，支持果冻特效循环
     */
    playAnimation(name: string, definition: AnimationDefinition, params?: AnimationPlayParams): void {
        // v21: 延迟边界测量（解决创建时序问题）
        // 创建 Player 时子容器可能尚未就绪，bounds 为 0。
        // 播放时子容器已全部就绪，重新测量。
        if (this.objectWidth === 0 && this.objectHeight === 0) {
            try {
                const bounds = this.target.getLocalBounds()
                if (bounds.width > 0 && bounds.height > 0) {
                    this.objectWidth = bounds.width
                    this.objectHeight = bounds.height
                    this.objectBoundsX = bounds.x
                    this.objectBoundsY = bounds.y
                }
            } catch {
                // 容器没有子元素时 getLocalBounds 可能异常，忽略
            }
        }

        // v18: 委托模式——将跨对象轨道委托给子对象的 Player
        if (definition.type === 'track' && this.playerResolver) {
            const { selfTracks, crossGroups } = this.splitTracksByTarget(definition.tracks)

            // 委托跨对象轨道
            if (crossGroups.size > 0) {
                const delegationMap = new Map<string, string>()
                for (const [targetId, tracks] of crossGroups) {
                    const targetPlayer = this.playerResolver(targetId)
                    if (!targetPlayer) {
                        console.warn(`[GenericAnimationPlayer] 委托目标 ${targetId} 不存在，动画 "${name}" 中该目标的轨道已跳过`)
                        continue
                    }
                    // 构造子 definition：移除 targetObjectId，让子 Player 走 self-transform 路径
                    const subDef = {
                        ...definition,
                        tracks: tracks.map(t => {
                            const { targetObjectId: _tid, ...rest } = t
                            return rest
                        })
                    } as AnimationDefinition
                    const delegatedName = `__d_${name}`
                    targetPlayer.playAnimation(delegatedName, subDef, params)
                    delegationMap.set(targetId, delegatedName)
                }
                this.delegatedAnimations.set(name, delegationMap)

                // 无自身轨道时跳过自身播放
                if (selfTracks.length === 0) return
                // 重建 definition 仅含自身轨道
                definition = {
                    ...definition,
                    tracks: selfTracks
                } as AnimationDefinition
            }
        }

        let player = this.players.get(name)
        if (!player) {
            player = new AnimationPlayer()

            player.setOnLoop((def) => {
                void def
            })

            player.setOnStop((def) => {
                if (def.type !== 'track') return
                for (const track of def.tracks) {
                    if (track.trackType === 'effect') {
                        const effectType = track.effectParams?.type
                        if (effectType !== 'jelly' && effectType !== 'squash') {
                            this.effectManager.removeEffect(`dyn_${effectType}`)
                        }
                    }
                }
            })

            this.players.set(name, player)
        }

        const playParams: AnimationPlayParams = {
            loop: params?.loop ?? definition.loop ?? true,
            speed: params?.speed ?? 1.0,
            reset: params?.reset ?? true
        }
        if (params?.runtimeDuration != null) {
            playParams.runtimeDuration = params.runtimeDuration
        }

        player.play(definition, playParams)

        // v11.52: 直接启动 frame_sequence 轨道的 AnimatedSprite
        this.startFrameSequenceAnimations(definition, playParams.loop ?? true)
    }

    /**
     * 停止动画
     * v11.52: 同时停止帧动画
     */
    stopAnimation(name: string): void {
        // v18: 停止委托的子动画
        this.stopDelegatedAnimations(name)

        const player = this.players.get(name)
        if (!player) {
            return
        }

        player.stop()

        // v11.52: 停止帧动画
        this.stopFrameSequenceAnimations()

        // v18: 清理特效（ribbon/wave/glow/motion_blur 等非 effectManager 管理的特效）
        this.effectManager.clear()
        this.removeAllFilters()

        // 恢复基准变换
        this.restoreBaseTransform()
    }

    /**
     * 停止所有动画
     */
    stopAllAnimations(): void {
        // v18: 停止所有委托的子动画
        for (const animName of this.delegatedAnimations.keys()) {
            this.stopDelegatedAnimations(animName)
        }
        this.delegatedAnimations.clear()

        for (const player of this.players.values()) {
            player.stop()
        }
        this.players.clear()

        // 清理特效
        this.effectManager.clear()
        this.removeAllFilters()

        // 恢复基准变换
        this.restoreBaseTransform()
    }

    /**
     * v18: 停止指定动画的所有委托
     */
    private stopDelegatedAnimations(name: string): void {
        const delegations = this.delegatedAnimations.get(name)
        if (!delegations || !this.playerResolver) return
        for (const [targetId, delegatedName] of delegations) {
            const targetPlayer = this.playerResolver(targetId)
            if (targetPlayer) {
                targetPlayer.stopAnimation(delegatedName)
            }
        }
        this.delegatedAnimations.delete(name)
    }

    /**
     * 恢复基准变换
     */
    private restoreBaseTransform(): void {
        const t = this.getBaseTransformTarget()
        if (!this.isContainerUsable(t)) return
        t.x = this.baseX
        t.y = this.baseY
        t.scale.x = this.baseScaleX
        t.scale.y = this.baseScaleY
        t.rotation = this.baseRotation
        t.alpha = this.baseAlpha
        // v19: 重置动画增量
        this.lastDeltaX = 0
        this.lastDeltaY = 0

        if (this.compositeTarget) {
            const compositeSprite = this.compositeTarget.getCompositeSprite()
            if ((compositeSprite as unknown as { destroyed?: boolean }).destroyed) return
            compositeSprite.rotation = 0
            compositeSprite.scale.set(1, 1)
            compositeSprite.alpha = 1
        }
    }

    private getBaseTransformTarget(): PIXI.Container {
        if (this.compositeTarget) {
            return this.compositeTarget.getOutputContainer()
        }
        return this.target
    }

    /**
     * 合并并应用动画输出
     * v18: 委托模式下所有输出均为 self-target，无需跨对象分发
     * v24: 合成逻辑（transform 累加 / visibility 相乘 / effect 数值 delta）
     *      抽取到共享模块 AnimationComposition，与动画编辑工作台预览复用。
     */
    private applyOutputs(outputs: AnimationOutput[]): void {
        const compositionCtx: CompositionContext = {
            baseRotation: this.baseRotation,
            baseScaleX: this.baseScaleX,
            baseScaleY: this.baseScaleY,
            objectBoundsX: this.objectBoundsX,
            objectBoundsY: this.objectBoundsY,
            objectWidth: this.objectWidth,
            objectHeight: this.objectHeight,
            pivotX: this.target.pivot.x,
            pivotY: this.target.pivot.y,
        }

        // 先应用所有特效（安装/更新滤镜、启动粒子等 stateful 资源），再取 numeric deltas。
        // 与旧实现一致：applyEffect 在 evaluateDynamicEffectDeltas 之前调用。
        for (const output of outputs) {
            for (const e of output.effects) {
                this.applyEffect(e)
            }
        }

        const evaluateEffect = (e: EffectTrackOutput): EffectNumericDelta | null => {
            return this.evaluateDynamicEffectDeltas(e)
        }

        const composed = composeAnimationOutputs(outputs, compositionCtx, evaluateEffect)

        const deltaX = composed.deltaX
        const deltaY = composed.deltaY
        const deltaRotation = composed.deltaRotation
        const scaleMultX = composed.scaleMultX
        const scaleMultY = composed.scaleMultY
        const alphaProduct = composed.alphaProduct

        // ── 应用变换 ──
        // v19: 缓存动画位置增量（含 pivot 补偿），供 propagateUnionAnimations 使用
        this.lastDeltaX = deltaX
        this.lastDeltaY = deltaY

        if (this.compositeTarget) {
            const outputContainer = this.compositeTarget.getOutputContainer()
            if (!this.isContainerUsable(outputContainer)) return
            outputContainer.x = this.baseX + deltaX
            outputContainer.y = this.baseY + deltaY
            outputContainer.rotation = this.baseRotation + deltaRotation
            outputContainer.scale.x = this.baseScaleX * scaleMultX
            outputContainer.scale.y = this.baseScaleY * scaleMultY
            outputContainer.alpha = this.baseAlpha * alphaProduct

            const compositeSprite = this.compositeTarget.getCompositeSprite()
            if (!(compositeSprite as unknown as { destroyed?: boolean }).destroyed) {
                compositeSprite.rotation = 0
                compositeSprite.scale.set(1, 1)
                compositeSprite.alpha = 1
            }
        } else {
            if (!this.isContainerUsable(this.target)) return
            this.target.x = this.baseX + deltaX
            this.target.y = this.baseY + deltaY
            this.target.rotation = this.baseRotation + deltaRotation
            this.target.scale.x = this.baseScaleX * scaleMultX
            this.target.scale.y = this.baseScaleY * scaleMultY
            this.target.alpha = this.baseAlpha * alphaProduct
        }
    }

    /**
     * v18: 按 targetObjectId 拆分轨道
     */
    private splitTracksByTarget(tracks: AnimationTrack[]) {
        const selfTracks: AnimationTrack[] = []
        const crossGroups = new Map<string, AnimationTrack[]>()
        for (const track of tracks) {
            const tid = track.targetObjectId
            if (!tid || tid === TARGET_SELF) {
                selfTracks.push(track)
            } else {
                let group = crossGroups.get(tid)
                if (!group) { group = []; crossGroups.set(tid, group) }
                group.push(track)
            }
        }
        return { selfTracks, crossGroups }
    }

    // ===== v11.52: 帧动画直接播放支持 =====

    /**
     * 查找容器中的 AnimatedSprite
     * v18: 接受容器参数，支持跨对象查找
     */
    private findAnimatedSpriteInContainer(container: PIXI.Container): PIXI.AnimatedSprite | null {
        if (this.frameSequencePlayback === 'disabled') return null

        // 1. 尝试按名称查找
        const names = ['prop_animation', 'bg_animation', 'symbol_animation', 'expression_animation', 'animation']
        for (const name of names) {
            const child = container.getChildByName(name)
            if (child && child instanceof PIXI.AnimatedSprite) {
                return child
            }
        }

        if (this.frameSequencePlayback === 'named_only') return null

        // 2. Fallback: 查找第一个 AnimatedSprite
        for (const child of container.children) {
            if (child instanceof PIXI.AnimatedSprite) {
                return child
            }
        }

        return null
    }

    /**
     * 向后兼容：在自身容器中查找 AnimatedSprite
     */
    private findAnimatedSprite(): PIXI.AnimatedSprite | null {
        return this.findAnimatedSpriteInContainer(this.target)
    }

    /**
     * v11.52: 直接启动 frame_sequence 轨道的 AnimatedSprite 帧动画
     * v18: 委托模式下，跨对象帧动画已由子 Player 处理，此处仅处理自身
     */
    private startFrameSequenceAnimations(_definition: AnimationDefinition, loop: boolean): void {
        const animatedSprite = this.findAnimatedSprite()
        if (animatedSprite && animatedSprite.textures.length > 1) {
            const activePlayback = this.getActiveFrameSequencePlayback()
            const fps = activePlayback?.fps ?? this.getFrameSequenceFps(_definition)
            animatedSprite.loop = activePlayback?.loop ?? loop
            animatedSprite.animationSpeed = fps / 60
            animatedSprite.gotoAndPlay(0)
            ; (animatedSprite as PIXI.AnimatedSprite & { _shouldPlay?: boolean })._shouldPlay = true
        }
    }

    /**
     * v11.52: 停止帧动画并恢复静止帧
     */
    private stopFrameSequenceAnimations(): void {
        const animatedSprite = this.findAnimatedSprite()
        if (animatedSprite) {
            ; (animatedSprite as PIXI.AnimatedSprite & { _shouldPlay?: boolean })._shouldPlay = false
            this.stopAndRestoreAnimatedSprite(animatedSprite)
        }
    }

    /**
     * 停止 AnimatedSprite 并恢复静止帧
     */
    private stopAndRestoreAnimatedSprite(animatedSprite: PIXI.AnimatedSprite): void {
        animatedSprite.stop()
        if (animatedSprite.textures.length === 0) return

        if (this.stillFrameConfig && this.textureGetter) {
            restoreAnimatedSpriteStillFrame(animatedSprite, this.stillFrameConfig, this.textureGetter)
        } else {
            const safeIndex = Math.min(Math.max(0, this.stillFrameIndex), animatedSprite.textures.length - 1)
            animatedSprite.gotoAndStop(safeIndex)
        }
    }

    /**
     * v11.52: 设置静止帧配置
     * 用于道具/背景在渲染时配置静止帧
     */
    setStillFrameConfig(config: StillFrameConfig, textureGetter?: TextureGetter): void {
        this.stillFrameConfig = config
        if (textureGetter) {
            this.textureGetter = textureGetter
        }
        if (config.stillFrameIndex !== undefined) {
            this.stillFrameIndex = config.stillFrameIndex
        }
    }

    /**
     * v11.52: 设置静止帧索引（简化版本）
     */
    setStillFrameIndex(index: number): void {
        this.stillFrameIndex = index
    }

    /**
     * v11.52: 从 Store 加载静止帧配置
     * 根据 objectType 自动从 propStore 或 backgroundStore 获取
     */
    private loadStillFrameConfigFromStore(): void {
        if (!this.objectType || !this.objectId) return

        if (this.objectType === 'prop') {
            // 延迟导入避免循环依赖
            void import('@/stores/propStore').then(({ usePropStore }) => {
                const propStore = usePropStore()
                const prop = propStore.getProp(this.objectId!)
                if (prop) {
                    this.stillFrameConfig = {
                        stillFrameSource: prop.stillFrameSource,
                        stillFrameIndex: prop.stillFrameIndex,
                        url: prop.stillFrameSource === 'custom' ? prop.stillFrameCustomUrl : undefined,
                    }
                    if (prop.stillFrameIndex !== undefined) {
                        this.stillFrameIndex = prop.stillFrameIndex
                    }
                }
            })
        } else if (this.objectType === 'background') {
            void import('@/stores/backgroundStore').then(({ useBackgroundStore }) => {
                const backgroundStore = useBackgroundStore()
                const bg = backgroundStore.getBackground(this.objectId!)
                if (bg) {
                    this.stillFrameConfig = {
                        stillFrameSource: bg.stillFrameSource,
                        stillFrameIndex: bg.stillFrameIndex,
                        url: bg.stillFrameSource === 'custom' ? bg.stillFrameCustomUrl : undefined,
                    }
                    if (bg.stillFrameIndex !== undefined) {
                        this.stillFrameIndex = bg.stillFrameIndex
                    }
                }
            })
        }
    }

    /**
     * 应用特效
     */
    private applyEffect(effect: EffectTrackOutput): void {
        const effectType = effect.effectType
        if (!effectType) return

        if (effect.active === false) {
            if (effectType === 'glow' && this.glowFilter) {
                this.removeFilter(this.glowFilter)
                this.glowFilter = null
            }
            if (effectType === 'motion_blur' && this.motionBlurFilter) {
                this.removeFilter(this.motionBlurFilter)
                this.motionBlurFilter = null
            }
            if (effectType === 'wave') {
                // v12.1: 添加 isContainerUsable 检查，防止容器已销毁时访问 position
                if (this.isContainerUsable(this.target)) {
                    this.waveEffect.removeEffect('_root', this.target)
                }
                if (this.compositeTarget) {
                    const outputContainer = this.compositeTarget.getOutputContainer()
                    if (this.isContainerUsable(outputContainer)) {
                        this.waveEffect.removeEffect('_composite', outputContainer)
                    }
                }
            }
            if (effectType === 'ribbon') {
                // v12.1: 添加 isContainerUsable 检查
                if (this.isContainerUsable(this.target)) {
                    this.ribbonEffect.removeEffect('_root', this.target)
                }
                if (this.compositeTarget) {
                    const outputContainer = this.compositeTarget.getOutputContainer()
                    if (this.isContainerUsable(outputContainer)) {
                        this.ribbonEffect.removeEffect('_composite', outputContainer)
                    }
                }
            }
            return
        }

        const params = effect.effectParams as unknown as Record<string, unknown>

        switch (effectType) {
            case 'glow':
                this.applyGlowEffect(params)
                break
            case 'motion_blur':
                this.applyMotionBlurEffect(params)
                break
            case 'wave':
                // Wave 使用 WaveEffect 服务
                this.applyWaveEffect(params)
                break
            case 'ribbon':
                // Ribbon 使用 RibbonEffect 服务（头部固定，尾部飘动）
                this.applyRibbonEffect(params)
                break
            case 'breathe':
            case 'float':
            case 'shake':
            case 'squash':
            case 'jelly':
            case 'petrify':
            case 'shatter':
                // 这些特效通过 DynamicEffectManager 计算增量，在 applyOutputs 里合并到 Transform
                break
        }
    }

    private evaluateDynamicEffectDeltas(effect: EffectTrackOutput) {
        const params = effect.effectParams
        const effectType = effect.effectType
        if (!effectType) return null
        if (effect.active === false) {
            this.effectManager.pauseEffect(`dyn_${effectType}`)
            return null
        }

        // v11.70: jelly/squash 使用进度驱动模式，直接使用预计算的结果
        // 不再通过 effectManager 计算，避免绝对时间依赖
        if (effectType === 'jelly' || effectType === 'squash') {
            // 使用 EffectTrackOutput 中的预计算结果
            if (effect.deltaScaleX !== undefined || effect.deltaScaleY !== undefined) {
                return {
                    deltaScaleX: effect.deltaScaleX,
                    deltaScaleY: effect.deltaScaleY,
                    deltaX: effect.deltaX,
                    deltaY: effect.deltaY,
                    deltaRotation: effect.deltaRotation,
                    deltaAlpha: undefined as number | undefined
                }
            }
            // Fallback: 如果没有预计算结果，使用 effectManager（兼容旧逻辑）
            const effectId = `dyn_${effectType}`
            this.effectManager.addEffect(effectId, params)
            return this.effectManager.evaluate(effectId)
        }

        if (
            effectType !== 'breathe' &&
            effectType !== 'float' &&
            effectType !== 'shake'
        ) {
            return null
        }

        const effectId = `dyn_${effectType}`
        this.effectManager.addEffect(effectId, params)
        return this.effectManager.evaluate(effectId)
    }

    /**
     * 应用 Glow 特效
     */
    private applyGlowEffect(params: Record<string, unknown>): void {
        const rawColor = params['color'] as string | number | undefined
        const intensity = params['intensity'] as number | undefined
        const size = params['size'] as number | undefined
        const color = typeof rawColor === 'string'
            ? parseInt(rawColor.replace('#', ''), 16)
            : rawColor

        if (!this.glowFilter) {
            this.glowFilter = new GlowFilter({
                color: color ?? 0xffffff,
                outerStrength: intensity ?? 2,
                distance: size ?? 4,
                quality: 0.5
            })
            this.addFilter(this.glowFilter)
        } else {
            if (color !== undefined) this.glowFilter.color = color
            if (intensity !== undefined) this.glowFilter.outerStrength = intensity
            if (size !== undefined) (this.glowFilter as unknown as { distance: number }).distance = size
        }
    }

    /**
     * 应用 MotionBlur 特效
     */
    private applyMotionBlurEffect(params: Record<string, unknown>): void {
        const velocityX = params['velocityX'] as number | undefined
        const velocityY = params['velocityY'] as number | undefined
        const velocity = params['velocity'] as number | undefined
        const angleDeg = params['angle'] as number | undefined
        const kernelSize = params['kernelSize'] as number | undefined

        let vx = velocityX ?? 0
        let vy = velocityY ?? 0

        if ((velocityX === undefined || velocityY === undefined) && velocity !== undefined) {
            const rad = ((angleDeg ?? 0) * Math.PI) / 180
            vx = Math.cos(rad) * velocity
            vy = Math.sin(rad) * velocity
        }

        if (!this.motionBlurFilter) {
            this.motionBlurFilter = new MotionBlurFilter([vx, vy], kernelSize ?? 5)
            this.addFilter(this.motionBlurFilter)
        } else if (kernelSize !== undefined) {
            this.motionBlurFilter.kernelSize = kernelSize
        }

        this.motionBlurFilter.velocity.x = vx
        this.motionBlurFilter.velocity.y = vy
    }

    /**
     * 应用 Wave 特效
     * v11.60: 离屏模式下直接使用 compositeSprite
     */
    private applyWaveEffect(params: Record<string, unknown>): void {
        const speed = params['speed'] as number ?? 1.0
        const amplitude = params['amplitude'] as number ?? 10
        const frequency = params['frequency'] as number ?? 1.0

        // v11.60: 离屏模式下，Wave 应用到 compositeSprite
        if (this.compositeTarget) {
            this.compositeTarget.updateRenderTexture()
            const compositeSprite = this.compositeTarget.getCompositeSprite()
            const outputContainer = this.compositeTarget.getOutputContainer()
            this.waveEffect.applyEffect('_composite', compositeSprite, outputContainer, { speed, amplitude, frequency })
        } else {
            // 非离屏模式：查找第一个 Sprite 子对象
            const sprite = this.findSprite()
            if (!sprite) return
            this.waveEffect.applyEffect('_root', sprite, this.target, { speed, amplitude, frequency })
        }
    }

    /**
     * 应用 Ribbon 特效（飘带）
     * 头部几乎不动，尾部大幅度飘动
     */
    private applyRibbonEffect(params: Record<string, unknown>): void {
        const speed = params['speed'] as number ?? 1.0
        const amplitude = params['amplitude'] as number ?? 15
        const frequency = params['frequency'] as number ?? 2
        const damping = params['damping'] as number ?? 2.0
        const phaseScale = params['phaseScale'] as number ?? 1.5

        if (this.compositeTarget) {
            this.compositeTarget.updateRenderTexture()
            const compositeSprite = this.compositeTarget.getCompositeSprite()
            const outputContainer = this.compositeTarget.getOutputContainer()
            this.ribbonEffect.applyEffect('_composite', compositeSprite, outputContainer, { speed, amplitude, frequency, damping, phaseScale })
        } else {
            const sprite = this.findSprite()
            if (!sprite) return
            this.ribbonEffect.applyEffect('_root', sprite, this.target, { speed, amplitude, frequency, damping, phaseScale })
        }
    }

    /**
     * 查找容器中的 Sprite
     */
    private findSprite(): PIXI.Sprite | null {
        for (const child of this.target.children) {
            if (child instanceof PIXI.Sprite) {
                return child
            }
        }
        return null
    }

    /**
     * 添加 Filter
     */
    private addFilter(filter: PIXI.Filter): void {
        const target = this.getFilterTarget()
        const filters = target.filters ?? []
        filters.push(filter)
        target.filters = filters
    }

    /**
     * 移除所有 Filters
     */
    private removeAllFilters(): void {
        if (this.glowFilter) {
            this.removeFilter(this.glowFilter)
            this.glowFilter = null
        }
        if (this.motionBlurFilter) {
            this.removeFilter(this.motionBlurFilter)
            this.motionBlurFilter = null
        }

        // 清理 Wave
        if (this.isContainerUsable(this.target)) {
            this.waveEffect.removeEffect('_root', this.target)
            this.ribbonEffect.removeEffect('_root', this.target)
        }
        if (this.compositeTarget) {
            const outputContainer = this.compositeTarget.getOutputContainer()
            if (this.isContainerUsable(outputContainer)) {
                this.waveEffect.removeEffect('_composite', outputContainer)
                this.ribbonEffect.removeEffect('_composite', outputContainer)
            }
        }
    }

    /**
     * 移除单个 Filter
     */
    private removeFilter(filter: PIXI.Filter): void {
        const target = this.getFilterTarget()
        if (!this.isContainerUsable(target)) return
        const filters = target.filters
        if (!filters) return

        const index = filters.indexOf(filter)
        if (index >= 0) {
            filters.splice(index, 1)
            target.filters = filters.length > 0 ? filters : null
        }
    }

    /**
     * 检查是否有任何动画正在播放
     */
    hasPlayingAnimations(): boolean {
        for (const player of this.players.values()) {
            if (player.isPlaying) return true
        }
        return false
    }

    /**
     * 销毁
     */
    destroy(): void {
        this.stopAllAnimations()
        this.players.clear()
        this.effectManager.clear()

        // v11.60: 销毁离屏合成目标
        if (this.compositeTarget) {
            this.compositeTarget.destroy()
            this.compositeTarget = null
        }
    }

    /**
     * v11.60: 获取输出容器
     * 离屏模式下返回 CompositeRenderTarget 的输出容器
     * 非离屏模式下返回原始目标容器
     */
    getOutputContainer(): PIXI.Container {
        if (this.compositeTarget) {
            return this.compositeTarget.getOutputContainer()
        }
        return this.target
    }

    private isContainerUsable(container: PIXI.Container | null | undefined): container is PIXI.Container {
        if (!container) return false
        const anyContainer = container as unknown as { destroyed?: boolean; transform?: unknown }
        if (anyContainer.destroyed) return false
        return !!anyContainer.transform
    }

    /**
     * v11.60: 检查是否启用了离屏合成模式
     */
    isCompositeMode(): boolean {
        return this.compositeMode && this.compositeTarget !== null
    }
}

/**
 * 创建 GenericAnimationPlayer 的工厂函数
 * @param targetOrConfig Container 或完整配置对象
 */
export function createGenericAnimationPlayer(
    targetOrConfig: PIXI.Container | GenericAnimationPlayerConfig
): GenericAnimationPlayer {
    if (targetOrConfig instanceof PIXI.Container) {
        // 兼容旧方式：只传入 Container
        return new GenericAnimationPlayer({ target: targetOrConfig })
    }
    return new GenericAnimationPlayer(targetOrConfig)
}

