/**
 * AnimationController — 统一动画控制模块
 *
 * 从 ScenePlayer.vue 和 FrameCapture.ts 提取共享的动画控制逻辑，
 * 消除两个渲染引擎之间的代码重复。
 *
 * 设计原则：
 * - 通过 AnimationHost 接口抽象引擎差异（播放器注册表、资源查找等）
 * - 所有动画命令处理逻辑集中在此模块
 * - 引擎特有行为（如 FrameCapture 的 _shouldPlay）通过 onAnimationTriggered 钩子注入
 * - v16: 统一 getAnimationDefinition(objectId, animName) 签名，消除三分支硬编码
 *
 * 职责：
 * - processSetAnimActions()        — 对象级 set_anim 动作处理
 * - processAutoStopOnBlockEnd()    — Block 结束时自动停止动画
 * - processInitialAnimationStates() — 应用初始动画状态
 */

import type * as PIXI from 'pixi.js'

import type { GenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import type {
    AnimationDefinition,
    AnimationPlayParams,
    AnimationTimingMode,
} from '@/types/animation'
import type { SceneObject } from '@/types/sceneObject'
import type {
    Action,
    RuntimeSlot,
    SetAnimAction,
} from '@/types/screenplay'
import type { TTSTimingFile } from '@/utils/ttsTiming'

// ============================================================================
// Types
// ============================================================================

/**
 * AnimationHost 接口
 *
 * 各渲染引擎（ScenePlayer / FrameCapture）实现此接口，
 * 将自身的播放器注册表和资源查找能力暴露给 AnimationController。
 */
export interface AnimationHost {
    // ─── 播放器注册表访问 ───
    getAnimationPlayer(objectId: string): GenericAnimationPlayer | null
    getObjectContainer(objectId: string): PIXI.Container | null

    // ─── 场景数据访问 ───
    getSceneObjects(): SceneObject[]

    // ─── 动画定义解析 ───
    // v16: 统一签名，通过 objectId 获取动画定义
    // 宿主负责决定查找策略（对象级 animations 字段、资源级 store、隐式帧动画等）
    getAnimationDefinition(
        objectId: string,
        animName: string,
    ): AnimationDefinition | null

    /**
     * 宿主特有的 post-play 钩子
     *
     * FrameCapture 使用此钩子设置 _shouldPlay 标志和 animationSpeed。
     * ScenePlayer 不需要此钩子（PIXI ticker 自动驱动帧动画）。
     *
     * @param objectId   对象 ID
     * @param animName   动画名称
     * @param cmd        'play' | 'stop'
     */
    onAnimationTriggered?(
        objectId: string,
        animName: string,
        cmd: 'play' | 'stop',
    ): void
}

export interface AnimationControlContext {
    blockId?: string
    ttsTiming?: TTSTimingFile | null | undefined
}

type SetAnimItem = SetAnimAction['params']['animations'][number]

// ============================================================================
// Helper Functions (shared pure logic)
// ============================================================================

/**
 * 获取 Action 在 Block 中的开始时间
 */
export function getActionStartTime(action: Action, slots: RuntimeSlot[]): number {
    if (!slots || slots.length === 0) return 0
    const slot = slots[action.slotIndex]
    return slot ? slot.startTime : 0
}

/**
 * 检查动画定义是否包含 Auto Duration 轨道
 */
export function hasAutoDuration(
    definition: { type?: string; tracks?: { trackType: string; duration?: number | 'auto' }[] },
): boolean {
    if (!definition.tracks) return false
    return definition.tracks.some(
        t => (t.trackType === 'transform' || t.trackType === 'visibility') && t.duration === 'auto',
    )
}

/**
 * 计算 Auto Duration 的运行时时长
 *
 * 在同 Block 内查找匹配的 stop 动作时间，若无则延伸到 Block 结束。
 */
export function calculateRuntimeDuration(
    blockActions: Action[],
    slots: RuntimeSlot[],
    blockDuration: number,
    targetId: string,
    animName: string,
    playStartTime: number,
): number {
    for (const action of blockActions) {
        if (action.type !== 'set_anim' || action.target !== targetId) continue
        const setAnimAction: SetAnimAction = action
        const actionTime = getActionStartTime(action, slots)
        if (actionTime <= playStartTime) continue
        const stopItem = setAnimAction.params.animations?.find(
            (item: { animName: string; action?: string }) =>
                item.animName === animName && item.action === 'stop',
        )
        if (stopItem) {
            const duration = actionTime - playStartTime
            return duration > 0 ? duration : 1000
        }
    }
    const duration = blockDuration - playStartTime
    return duration > 0 ? duration : 1000
}

function isTimeInSegments(
    segments: { startMs: number; endMs: number }[] | undefined,
    currentTime: number,
): boolean {
    if (!segments || segments.length === 0) return false
    return segments.some(segment =>
        currentTime >= segment.startMs && currentTime < segment.endMs,
    )
}

function resolveAnimationTimingMode(
    animItem: SetAnimItem,
    definition: AnimationDefinition | null,
): AnimationTimingMode {
    return animItem.timingMode ?? definition?.timingMode ?? 'continuous'
}

function findNextStopTime(
    blockActions: Action[],
    slots: RuntimeSlot[],
    targetId: string,
    animName: string,
    playStartTime: number,
    blockDuration: number,
): number {
    for (const action of blockActions) {
        if (action.type !== 'set_anim' || action.target !== targetId) continue
        const actionTime = getActionStartTime(action, slots)
        if (actionTime <= playStartTime) continue
        const hasStop = action.params.animations?.some(
            item => item.animName === animName && item.action === 'stop',
        )
        if (hasStop) return actionTime
    }
    return blockDuration
}

// ============================================================================
// AnimationController
// ============================================================================

export class AnimationController {
    private host: AnimationHost
    private triggeredAnimations: Set<string>
    private deferredInitialAnimationObjectIds = new Set<string>()
    private ttsGatedAnimationStates = new Map<string, { playing: boolean }>()

    constructor(host: AnimationHost, triggeredAnimations: Set<string>) {
        this.host = host
        this.triggeredAnimations = triggeredAnimations
    }

    /**
     * 更新宿主引用（用于引擎在场景切换时更新注册表）
     */
    updateHost(host: AnimationHost): void {
        this.host = host
    }

    /**
     * 重置触发记录（用于 Block 切换或重播时）
     */
    resetTriggeredAnimations(): void {
        this.triggeredAnimations.clear()
        this.ttsGatedAnimationStates.clear()
    }

    // ════════════════════════════════════════════════════════════════════════
    // 统一 Player 获取 — 消除按类型分发的 if/else
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 获取对象对应的 GenericAnimationPlayer
     *
     * 统一 prop/background/symbol 等类型的 player 获取逻辑。
     */
    private getPlayerForObject(objSetup: SceneObject): GenericAnimationPlayer | null {
        return this.host.getAnimationPlayer(objSetup.id)
    }

    // ════════════════════════════════════════════════════════════════════════
    // processSetAnimActions — 统一 set_anim 动作处理
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 处理 Block 中的所有 set_anim 动作
     *
     * 对应 ScenePlayer.applyAnimationControl + FrameCapture.updateAnimationStates
     */
    processSetAnimActions(
        blockActions: Action[],
        slots: RuntimeSlot[],
        currentTime: number,
        blockDuration: number,
        context: AnimationControlContext = {},
    ): void {
        // 对象级动画处理
        const setupObjects = this.host.getSceneObjects()
        for (const objSetup of setupObjects) {
            const targetId = objSetup.id
            const animActions = blockActions.filter(
                (a): a is SetAnimAction =>
                    a.type === 'set_anim' && a.target === targetId,
            )
            if (animActions.length === 0) continue

            // v16: 统一分发，不再区分 character/prop/background
            this.processObjectAnimActions(
                objSetup, animActions, slots, currentTime, blockActions, blockDuration, context,
            )
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // processAutoStopOnBlockEnd — Block 结束时自动停止动画
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Block 结束时自动停止 autoStopOnBlockEnd !== false 的动画
     */
    processAutoStopOnBlockEnd(blockActions: Action[]): void {
        const setAnimActions = blockActions.filter(
            (a): a is SetAnimAction => a.type === 'set_anim',
        )

        for (const action of setAnimActions) {
            const targetId = action.target

            for (const anim of action.params.animations || []) {
                const shouldAutoStop = anim.autoStopOnBlockEnd !== false
                if (!shouldAutoStop) continue

                // 只停止 play 动作的动画
                if (anim.action === 'stop') continue

                const animName = anim.animName
                this.stopObjectAnimation(targetId, animName)
                this.clearTTSGatedState(targetId, animName)
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // processInitialAnimationStates — 初始动画状态应用
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 应用场景中所有对象的初始动画状态
     *
     * 对应 ScenePlayer.applyInitialAnimationStates + FrameCapture.applyInitialAnimationStates
     */
    processInitialAnimationStates(): void {
        this.deferredInitialAnimationObjectIds.clear()
        const setupObjects = this.host.getSceneObjects()

        // v16: 统一初始动画处理，不再按类型分支
        for (const objSetup of setupObjects) {
            this.applyObjectInitialAnimations(objSetup)
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Private: 对象级动画处理（v16: 统一，消除三分支）
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 统一对象级动画动作处理
     *
     * v16: 合并 processCharacterAnimActions + processGenericAnimActions，
     * Character 仍通过 CharacterSprite 独立 API 播放，其余通过 GenericAnimationPlayer。
     * 动画定义统一通过 host.getAnimationDefinition(objectId, animName) 获取。
     */
    private processObjectAnimActions(
        objSetup: SceneObject,
        animActions: SetAnimAction[],
        slots: RuntimeSlot[],
        currentTime: number,
        blockActions: Action[],
        blockDuration: number,
        context: AnimationControlContext,
    ): void {
        // 统一使用 GenericAnimationPlayer
        const player = this.getPlayerForObject(objSetup)
        const container = this.host.getObjectContainer(objSetup.id)
        for (const action of animActions) {
            const actionStartTime = getActionStartTime(action, slots)
            if (actionStartTime > currentTime) continue

            for (const animItem of action.params.animations || []) {
                const animName = animItem.animName
                const cmd = animItem.action ?? 'play'
                const triggerKey = `${objSetup.id}:${animName}:${actionStartTime}:${cmd}`

                if (cmd === 'play') {
                    // v21: TTS 有声片段门控模式需要在 action 生效后持续按当前帧状态切换，
                    // 不能使用一次性 triggeredAnimations 机制。
                    const definition = this.host.getAnimationDefinition(objSetup.id, animName)
                    const timingMode = resolveAnimationTimingMode(animItem, definition)
                    if (timingMode === 'tts_speech') {
                        if (context.ttsTiming === undefined) {
                            continue
                        }
                        if (context.ttsTiming) {
                            this.processTTSSpeechGatedPlay(
                                objSetup,
                                animItem,
                                action,
                                actionStartTime,
                                currentTime,
                                blockActions,
                                slots,
                                blockDuration,
                                context,
                                definition,
                            )
                            continue
                        }
                        // timing 已确认不存在时，降级为连续播放。
                    }

                    if (this.triggeredAnimations.has(triggerKey)) continue

                    this.playObjectAnimation(
                        objSetup,
                        animItem,
                        action,
                        actionStartTime,
                        blockActions,
                        slots,
                        blockDuration,
                        definition,
                        player,
                        container,
                    )
                    this.triggeredAnimations.add(triggerKey)
                    this.host.onAnimationTriggered?.(
                        objSetup.id, animName, 'play',
                    )
                } else if (cmd === 'stop') {
                    if (!this.triggeredAnimations.has(triggerKey)) {
                        this.stopObjectAnimation(objSetup.id, animName)
                        this.clearTTSGatedState(objSetup.id, animName)
                        this.triggeredAnimations.add(triggerKey)
                        this.host.onAnimationTriggered?.(
                            objSetup.id, animName, 'stop',
                        )
                    }
                }
            }
        }
    }

    private processTTSSpeechGatedPlay(
        objSetup: SceneObject,
        animItem: SetAnimItem,
        action: SetAnimAction,
        actionStartTime: number,
        currentTime: number,
        blockActions: Action[],
        slots: RuntimeSlot[],
        blockDuration: number,
        context: AnimationControlContext,
        definition: AnimationDefinition | null,
    ): void {
        const animName = animItem.animName
        const playEndTime = findNextStopTime(
            blockActions,
            slots,
            objSetup.id,
            animName,
            actionStartTime,
            blockDuration,
        )
        const gatedKey = this.getTTSGatedKey(context, objSetup.id, animName, actionStartTime)

        if (currentTime >= playEndTime) {
            return
        }

        const shouldPlay = isTimeInSegments(
            context.ttsTiming?.animationSpeechSegments,
            currentTime,
        )
        if (shouldPlay) {
            this.ensureTTSGatedPlaying(
                gatedKey,
                objSetup,
                animItem,
                action,
                actionStartTime,
                blockActions,
                slots,
                blockDuration,
                definition,
            )
        } else {
            this.ensureTTSGatedStopped(gatedKey, objSetup.id, animName)
        }
    }

    private ensureTTSGatedPlaying(
        gatedKey: string,
        objSetup: SceneObject,
        animItem: SetAnimItem,
        action: SetAnimAction,
        actionStartTime: number,
        blockActions: Action[],
        slots: RuntimeSlot[],
        blockDuration: number,
        definition: AnimationDefinition | null,
    ): void {
        const state = this.ttsGatedAnimationStates.get(gatedKey)
        if (state?.playing) return

        this.playObjectAnimation(
            objSetup,
            animItem,
            action,
            actionStartTime,
            blockActions,
            slots,
            blockDuration,
            definition,
            this.getPlayerForObject(objSetup),
            this.host.getObjectContainer(objSetup.id),
        )
        this.ttsGatedAnimationStates.set(gatedKey, { playing: true })
        this.host.onAnimationTriggered?.(objSetup.id, animItem.animName, 'play')
    }

    private ensureTTSGatedStopped(
        gatedKey: string,
        targetId: string,
        animName: string,
    ): void {
        const state = this.ttsGatedAnimationStates.get(gatedKey)
        if (state?.playing === false) return

        this.stopObjectAnimation(targetId, animName)
        this.ttsGatedAnimationStates.set(gatedKey, { playing: false })
        this.host.onAnimationTriggered?.(targetId, animName, 'stop')
    }

    private playObjectAnimation(
        objSetup: SceneObject,
        animItem: SetAnimItem,
        action: SetAnimAction,
        actionStartTime: number,
        blockActions: Action[],
        slots: RuntimeSlot[],
        blockDuration: number,
        definition: AnimationDefinition | null,
        player: GenericAnimationPlayer | null,
        container: PIXI.Container | null,
    ): void {
        const animName = animItem.animName
        if (definition) {
            // 轨道动画 → 直接播放
            const playParams: AnimationPlayParams = {
                loop: animItem.loop ?? definition.loop,
                reset: action.params.reset ?? true,
            }
            if (hasAutoDuration(definition)) {
                playParams.runtimeDuration = calculateRuntimeDuration(
                    blockActions, slots, blockDuration,
                    objSetup.id, animName, actionStartTime,
                )
            }
            if (player) {
                player.playAnimation(animName, definition, playParams)
            }
        } else if (objSetup.type === 'prop' && container) {
            // 回退：直接控制 AnimatedSprite（prop 专用）
            this.fallbackPlayPropSprite(container, objSetup)
        }
    }

    private getTTSGatedKey(
        context: AnimationControlContext,
        targetId: string,
        animName: string,
        actionStartTime: number,
    ): string {
        return `${context.blockId ?? 'block'}:${targetId}:${animName}:${actionStartTime}`
    }

    private clearTTSGatedState(targetId: string, animName: string): void {
        const prefix = ':'
        for (const key of [...this.ttsGatedAnimationStates.keys()]) {
            if (key.includes(`${prefix}${targetId}:${animName}:`)) {
                this.ttsGatedAnimationStates.delete(key)
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Private: 停止对象动画 (autoStop 使用)
    // ════════════════════════════════════════════════════════════════════════

    private stopObjectAnimation(targetId: string, animName: string): void {
        const setupObjects = this.host.getSceneObjects()
        const objSetup = setupObjects.find((o: SceneObject) => o.id === targetId)
        if (!objSetup) return

        // 统一处理：通过 Player 或 Prop 回退
        const player = this.getPlayerForObject(objSetup)
        if (player) {
            player.stopAnimation(animName)
        } else if (objSetup.type === 'prop') {
            const container = this.host.getObjectContainer(objSetup.id)
            if (container) this.fallbackStopPropSprite(container)
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Private: 初始动画状态应用
    // ════════════════════════════════════════════════════════════════════════

    /**
     * 统一初始动画应用
     *
     * v16: 合并 applyCharacterInitialAnimations + applyPropInitialAnimations + applyGenericInitialAnimations
     * 消除 as unknown as 断言，直接使用 SceneObjectBase.initialAnimations。
     */
    private applyObjectInitialAnimations(objSetup: SceneObject): void {
        // SceneObjectBase 已有 initialAnimations 字段，无需断言
        const animItems = this.parseInitialAnimationItems(objSetup.initialAnimations)

        if (animItems.length === 0) {
            // 无初始动画 — 通知宿主停止（prop 需要恢复 stillFrame）
            this.deferredInitialAnimationObjectIds.delete(objSetup.id)
            if (objSetup.type === 'prop') {
                this.host.onAnimationTriggered?.(objSetup.id, '_initial', 'stop')
            }
            return
        }

        if (!this.canStartInitialAnimations(objSetup)) {
            this.deferredInitialAnimationObjectIds.add(objSetup.id)
            if (objSetup.type === 'prop') {
                this.host.onAnimationTriggered?.(objSetup.id, '_initial', 'stop')
            }
            return
        }

        this.startInitialAnimationsForObject(objSetup, animItems)
    }

    private processDeferredInitialAnimations(): void {
        if (this.deferredInitialAnimationObjectIds.size === 0) return

        for (const objectId of [...this.deferredInitialAnimationObjectIds]) {
            const objSetup = this.host.getSceneObjects().find((o: SceneObject) => o.id === objectId)
            if (!objSetup) {
                this.deferredInitialAnimationObjectIds.delete(objectId)
                continue
            }

            const animItems = this.parseInitialAnimationItems(objSetup.initialAnimations)
            if (animItems.length === 0) {
                this.deferredInitialAnimationObjectIds.delete(objectId)
                continue
            }

            if (!this.canStartInitialAnimations(objSetup)) continue

            this.startInitialAnimationsForObject(objSetup, animItems)
        }
    }

    /**
     * 在布局/可见性更新后，立即补启动之前因 spawned=false / visible=false 延迟的初始动画。
     */
    syncDeferredInitialAnimations(): void {
        this.processDeferredInitialAnimations()
    }

    private parseInitialAnimationItems(initialAnims: SceneObject['initialAnimations']): { name: string; loop: boolean }[] {
        const animItems: { name: string; loop: boolean }[] = []
        if (!Array.isArray(initialAnims)) return animItems

        if (initialAnims.length > 0 && typeof initialAnims[0] === 'string') {
            for (const name of initialAnims as unknown as string[]) {
                animItems.push({ name, loop: true })
            }
            return animItems
        }

        for (const item of initialAnims) {
            if (item?.name) animItems.push({ name: item.name, loop: item.loop ?? true })
        }

        return animItems
    }

    private canStartInitialAnimations(objSetup: SceneObject): boolean {
        const runtimeState = this.host.getSceneObjects().find((o: SceneObject) => o.id === objSetup.id) ?? objSetup
        const container = this.host.getObjectContainer(objSetup.id)
        // 对于延迟启动的初始动画，容器可见性已经包含了 spawned + visible 的最终结果。
        // scene setup 中的 objSetup 可能仍保留初始 spawned=false，不能再拿它阻断补启动。
        if (container) return container.visible

        const spawned = (runtimeState as SceneObject & { spawned?: boolean }).spawned ?? true
        return spawned && runtimeState.visible !== false
    }

    private startInitialAnimationsForObject(
        objSetup: SceneObject,
        animItems: { name: string; loop: boolean }[],
    ): void {
        const player = this.getPlayerForObject(objSetup)

        for (const anim of animItems) {
            const definition = this.host.getAnimationDefinition(objSetup.id, anim.name)
            if (!definition) continue

            if (player) {
                player.playAnimation(anim.name, definition, {
                    loop: anim.loop,
                    speed: 1.0,
                    reset: true,
                })
            }
        }

        this.deferredInitialAnimationObjectIds.delete(objSetup.id)
        this.host.onAnimationTriggered?.(objSetup.id, '_initial', 'play')
    }

    // ════════════════════════════════════════════════════════════════════════
    // Private: AnimatedSprite 回退控制（prop 专用）
    // ════════════════════════════════════════════════════════════════════════

    private fallbackPlayPropSprite(
        container: PIXI.Container,
        objSetup: SceneObject,
    ): void {
        const animatedSprite = container.getChildByName('prop_animation') as
            | (PIXI.AnimatedSprite & { _shouldPlay?: boolean })
            | undefined
        if (!animatedSprite) return

        // 保底逻辑：直接启动 AnimatedSprite
        // 具体的 fps/loop/播放方式由宿主的 onAnimationTriggered 处理
        // 但如果没有钩子，就使用默认行为
        if (!this.host.onAnimationTriggered) {
            // ScenePlayer 路径：直接 gotoAndPlay
            if (!animatedSprite.playing) {
                animatedSprite.loop = true
                animatedSprite.gotoAndPlay(0)
            }
        }
        // FrameCapture 路径由 onAnimationTriggered 处理
        void objSetup // 使用 objSetup 避免 lint 警告（fps 通过钩子获取）
    }

    private fallbackStopPropSprite(container: PIXI.Container): void {
        const animatedSprite = container.getChildByName('prop_animation') as
            | (PIXI.AnimatedSprite & { _shouldPlay?: boolean })
            | undefined
        if (!animatedSprite) return

        if (!this.host.onAnimationTriggered) {
            // ScenePlayer 路径
            if (animatedSprite.playing) {
                animatedSprite.gotoAndStop(0)
            }
        }
        // FrameCapture 路径由 onAnimationTriggered 处理
    }
}
