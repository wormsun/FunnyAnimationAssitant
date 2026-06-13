/**
 * useAnimationWorkbenchRenderer — 工作台预览渲染辅助
 *
 * 现状（Phase 2b 结束后）：
 *   本模块仅保留一个顶层命令式 helper —— runPreviewTracksOnCanvas()，
 *   它承载了原本内联在 AnimationWorkbench.vue 里的 applyPreviewTracksToCanvas 主体：
 *     1) 按 target 分组 active preview 轨道
 *     2) 对上一轮受影响但本轮不再覆盖的目标做残留清理
 *     3) 对每个目标：reset + origin-delta 补偿 + transform/visibility/effect 合成
 *     4) 一次性写回容器；更新 previouslyAffectedKeys
 *
 *   所有依赖（rootContainer / 缓存 Map / resolver 回调 / side-effect 回调等）
 *   通过 PreviewTracksRenderDeps 注入——调用方（AnimationWorkbench.vue）负责
 *   持有并装配这些本地状态，本模块不持有任何可变状态。
 *
 * 历史说明：
 *   先前版本曾包含一个 useAnimationWorkbenchRenderer() composable 骨架，
 *   设计目标是把基准缓存 / 播放头 / keyframe commit 都内聚进来，
 *   但始终未被任何地方 wire，且主工作台短期内也不便切换到它
 *   （PivotEditorPanel 仍依赖 LightweightCanvas + AnimationSceneObjectStore
 *   这条独立数据隔离路径，详见 /memories/repo/animation-workbench-pivot.txt）。
 *   Phase 4 已把骨架整体删除；若未来要恢复 composable 形态，应在
 *   "主画布不再直连 AnimationSceneObjectStore" 之后再启动。
 */

import * as PIXI from 'pixi.js'

import { DynamicEffectManager } from '@/core/animation/DynamicEffectManager'
import {
    accumulateEffectDelta,
    accumulateTransformOutput,
    accumulateVisibilityOutput,
    applyComposedTransformToContainer,
    type CompositionContext,
    createEmptyComposedTransform,
} from '@/core/AnimationComposition'
import { AnimationTrackEvaluator } from '@/core/AnimationTrackEvaluator'
import type { ContainerBaseState } from '@/core/WorkbenchBaseTransformSnapshot'
import {
    type AnimationDefinition,
    type AnimationTrack,
    TARGET_SELF,
    type TransformTrackOutput,
    type VisibilityTrackOutput,
} from '@/types/animation'

// Phase 2b: 预览轨道合成迁移
// ----------------------------------------------------------------------------
// 将原本内联在 AnimationWorkbench.vue 中的 applyPreviewTracksToCanvas 整体
// 迁移到本模块，作为一个纯"命令式"顶层函数：调用方提供所有必需的容器引用 /
// 缓存 / 解析回调（PreviewTracksRenderDeps），函数按时间 time 在这些容器上
// 执行一次合成并写回。
//
// 目的：
//   1) 代码位置与 Phase 2 骨架统一 —— 后续把 caches 也内聚到 composable 时，
//      调用方替换成 composable 提供的同名 deps 即可；
//   2) AnimationWorkbench.vue 的同名函数降级为一层薄壳（一次性组织 deps），
//      便于后续整体删除；
//   3) 纯函数参数 + 显式依赖注入，便于未来补 workbench 合成级单测。
// ============================================================================

export interface PreviewTracksEffectDelta {
    glowColor?: string
    glowIntensity?: number
    glowSize?: number
    motionBlurVelocity?: [number, number]
    motionBlurKernelSize?: number
    petrifyProgress?: number
    petrifyGrayScale?: boolean
    shatterAlpha?: number
    shatterProgress?: number
    deltaX?: number
    deltaY?: number
    deltaScaleX?: number
    deltaScaleY?: number
    deltaRotation?: number
    deltaAlpha?: number
}

export interface PreviewTracksRenderDeps {
    /** 根容器（若为 null 则整个函数短路） */
    rootContainer: PIXI.Container | null
    /** 当前参与预览的轨道下标（来自 previewMode 计算） */
    activePreviewTrackIndexes: readonly number[]
    /** 完整动画定义（用于按下标取轨道 + 读 loop） */
    animationDef: AnimationDefinition
    /** 全局时长（ms），通常等于 ctx.trackDuration.value */
    globalDurationMs: number
    /** 拖动播放头时关闭帧序列/滤镜类时序轨道；播放预览时打开。 */
    includeTemporalTracks?: boolean

    // 可变缓存（函数会读取并更新）
    previouslyAffectedKeys: Set<string>
    baseStateCache: Map<string, ContainerBaseState>
    initialContainerBaseStateCache: Map<string, ContainerBaseState>
    objectBaseStateCache: Map<string, { transformOriginX: number; transformOriginY: number }>

    // Resolver 回调
    resolveTargetObjectIdForTrack: (track: AnimationTrack) => string | null
    resolveTargetContainerForTrack: (track: AnimationTrack) => PIXI.Container
    resolveContainerForKey: (key: string) => PIXI.Container | null
    resolveObjectIdForPreviewKey: (key: string) => string | null
    getBaseStateForTrack: (track: AnimationTrack) => ContainerBaseState
    getSceneObjectById: (objectId: string | null) => { flipX?: boolean; transformOriginX?: number; transformOriginY?: number } | null

    // Side-effect 回调（由调用方持有本地状态，如 filter bundles、sprite frame）
    resetContainerToBaseStateWithKey: (container: PIXI.Container, state: ContainerBaseState, key: string) => void
    applyFrameSequenceTrackToContainer: (track: AnimationTrack & { trackType: 'frame_sequence' }, container: PIXI.Container, progress: number) => void
    applyEffectFiltersForKey: (container: PIXI.Container, key: string, deltas: PreviewTracksEffectDelta[]) => void
    getTrackDurationMs: (track: AnimationTrack) => number
}

/**
 * 按当前时间在 deps.rootContainer / partContainers 上合成并写回所有激活的预览轨道。
 *
 * 语义等价于原 AnimationWorkbench.applyPreviewTracksToCanvas（Phase 2b 迁移前的实现）。
 * 调用完成后：
 *   - previouslyAffectedKeys 被更新为本轮 affected；
 *   - 受影响容器的 position/scale/rotation/pivot/alpha/filters/sprite frame 已写到最终态；
 *   - 单轨 'current' 模式不使用本函数（仍走 applyTimeToCanvas 分支）。
 */
export function runPreviewTracksOnCanvas(deps: PreviewTracksRenderDeps, time: number): void {
    if (!deps.rootContainer) return

    const tracks = deps.activePreviewTrackIndexes
        .map(index => deps.animationDef.tracks[index])
        .filter((track): track is AnimationTrack => !!track)

    // 1) 按 target 分组（等价于正式播放器的"跨对象委托"）
    const tracksByKey = new Map<string, AnimationTrack[]>()
    for (const track of tracks) {
        const key = deps.resolveTargetObjectIdForTrack(track) ?? TARGET_SELF
        let group = tracksByKey.get(key)
        if (!group) { group = []; tracksByKey.set(key, group) }
        group.push(track)
    }

    const affectedKeys = new Set<string>(tracksByKey.keys())

    // 2) 先把上一轮有、本轮没有的目标恢复到 base（含滤镜清理）
    for (const prevKey of deps.previouslyAffectedKeys) {
        if (affectedKeys.has(prevKey)) continue
        const state = deps.initialContainerBaseStateCache.get(prevKey) ?? deps.baseStateCache.get(prevKey)
        if (!state) continue
        const container = deps.resolveContainerForKey(prevKey)
        if (!container) continue
        deps.resetContainerToBaseStateWithKey(container, state, prevKey)
    }

    // 3) 对每个 target：reset + 合成 + 一次性写回
    const globalDurationMs = deps.globalDurationMs
    const loop = deps.animationDef.loop === true
    const elapsedMs = Math.max(0, time) * globalDurationMs

    for (const [key, groupTracks] of tracksByKey) {
        const representative = groupTracks[0]!
        const container = deps.resolveTargetContainerForTrack(representative)
        const base = deps.baseStateCache.get(key) ?? deps.getBaseStateForTrack(representative)

        // reset：清滤镜并还原变换
        deps.resetContainerToBaseStateWithKey(container, base, key)

        // v: 若当前 store 中的 transformOrigin 与 mount 时相比已改变（例如用户通过
        // PivotEditorPanel 拖动了十字），则按"delta"补偿到 container.pivot / base.position。
        // baseStateCache 捕获自 onContainerReady（此时 SceneObjectRenderer 已执行 applyObjectState），
        // 因此 base.pivot = PivotBase + originAtMount，base.position 同理含 flipSign*originAtMount；
        // 不能按"当前 origin"全量再加一次，否则在 origin != 0 的子对象上会双加 origin，
        // 引起旋转时 (I − R(θ))·origin 的轴心漂移（表现为腿在 50% 进度处脱离身体）。
        let basePositionX = base.position.x
        let basePositionY = base.position.y
        let effectivePivotX = base.pivot.x
        let effectivePivotY = base.pivot.y
        let baseFlipSign = base.scale.x < 0 ? -1 : 1
        {
            const storeObjId = deps.resolveObjectIdForPreviewKey(key)
            const storeObj = deps.getSceneObjectById(storeObjId)
            const mountBase = storeObjId ? deps.objectBaseStateCache.get(storeObjId) : null
            if (storeObj && mountBase) {
                const originX = storeObj.transformOriginX ?? 0
                const originY = storeObj.transformOriginY ?? 0
                const mountOriginX = mountBase.transformOriginX ?? 0
                const mountOriginY = mountBase.transformOriginY ?? 0
                const dOX = originX - mountOriginX
                const dOY = originY - mountOriginY
                if (dOX !== 0 || dOY !== 0) {
                    baseFlipSign = storeObj.flipX ? -1 : 1
                    effectivePivotX = base.pivot.x + dOX
                    effectivePivotY = base.pivot.y + dOY
                    container.pivot.set(effectivePivotX, effectivePivotY)
                    basePositionX = base.position.x + baseFlipSign * dOX
                    basePositionY = base.position.y + dOY
                } else {
                    // origin 未变：base.pivot 已包含正确的 PivotBase + origin，
                    // 此处仅防御 reset 残留（resetContainerToBaseStateWithKey 已设过，这里等价保险）。
                    container.pivot.set(base.pivot.x, base.pivot.y)
                }
            }
        }

        // 分类评估：transform/visibility/effect 参与合成；frame_sequence 独立处理
        const transforms: TransformTrackOutput[] = []
        const visibilities: VisibilityTrackOutput[] = []
        const effectDeltas: ReturnType<typeof DynamicEffectManager.calculateWithProgress>[] = []
        const rawEffectTracks: (AnimationTrack & { trackType: 'effect' })[] = []
        let visualPivot: { x: number; y: number } | null = null

        for (const track of groupTracks) {
            const trackDurationMs = deps.getTrackDurationMs(track)
            const normalizedTrackProgress = computeTrackProgressInternal(elapsedMs, trackDurationMs, globalDurationMs, loop)

            if (track.trackType === 'transform') {
                const output = AnimationTrackEvaluator.evaluateTransform(track, normalizedTrackProgress)
                transforms.push(output)
                if (output.pivot) visualPivot = output.pivot
            } else if (track.trackType === 'visibility') {
                visibilities.push(AnimationTrackEvaluator.evaluateVisibility(track, normalizedTrackProgress))
            } else if (track.trackType === 'effect' && deps.includeTemporalTracks === true) {
                const effectOutput = DynamicEffectManager.calculateWithProgress(track.effectParams, normalizedTrackProgress, trackDurationMs)
                effectDeltas.push(effectOutput)
                rawEffectTracks.push(track)
            } else if (track.trackType === 'frame_sequence' && deps.includeTemporalTracks === true) {
                deps.applyFrameSequenceTrackToContainer(track, container, normalizedTrackProgress)
            }
        }

        if (visualPivot) {
            // track.pivot 是当前 transform 轨道的动画基准点。先把 base 姿态平移到
            // 新 pivot 下的等价静止姿态：无旋转/缩放输出时对象不动；有旋转/缩放时，
            // 后续 transform 会自然围绕新 pivot 计算出位置变化。
            const dPX = visualPivot.x - effectivePivotX
            const dPY = visualPivot.y - effectivePivotY
            basePositionX += baseFlipSign * dPX
            basePositionY += dPY
            effectivePivotX = visualPivot.x
            effectivePivotY = visualPivot.y
            container.pivot.set(effectivePivotX, effectivePivotY)
        }

        // 合成：复用正式播放器的 transform 累加 / visibility 相乘 / effect numeric delta 相乘规则
        const composed = createEmptyComposedTransform()
        const compositionCtx: CompositionContext = {
            baseRotation: base.rotation,
            baseScaleX: base.scale.x,
            baseScaleY: base.scale.y,
            objectBoundsX: base.bounds.x,
            objectBoundsY: base.bounds.y,
            objectWidth: base.bounds.width,
            objectHeight: base.bounds.height,
            pivotX: effectivePivotX,
            pivotY: effectivePivotY,
        }
        for (const t of transforms) accumulateTransformOutput(composed, t, compositionCtx)
        for (const v of visibilities) accumulateVisibilityOutput(composed, v)
        for (const d of effectDeltas) {
            accumulateEffectDelta(composed, d)
            // shatter 的额外 alpha 衰减（与旧实现一致，只是现在叠加进 alphaProduct）
            if (d.shatterAlpha !== undefined) {
                composed.alphaProduct *= Math.max(0, d.shatterAlpha)
            } else if (d.shatterProgress !== undefined) {
                composed.alphaProduct *= Math.max(0, 1 - d.shatterProgress)
            }
        }

        // 写回（一次性）
        applyComposedTransformToContainer(container, {
            x: basePositionX,
            y: basePositionY,
            scaleX: base.scale.x,
            scaleY: base.scale.y,
            rotation: base.rotation,
            alpha: base.alpha,
        }, composed)

        // 单独处理特效滤镜（stateful，按 target key 缓存）
        if (rawEffectTracks.length > 0) {
            deps.applyEffectFiltersForKey(container, key, effectDeltas)
        }
    }

    // 4) 记录本轮 affected，供下一轮做残留清理
    deps.previouslyAffectedKeys.clear()
    for (const k of affectedKeys) deps.previouslyAffectedKeys.add(k)
}

/**
 * 顶层内部 helper：与旧 AnimationWorkbench.computeTrackProgress 等价。
 * 单独命名以避免与 composable 内部的同名私有函数冲突。
 */
function computeTrackProgressInternal(
    elapsedMs: number,
    trackDurationMs: number,
    globalDurationMs: number,
    loop: boolean,
): number {
    if (trackDurationMs <= 0) return 0
    if (globalDurationMs <= 0) return 0
    if (!Number.isFinite(trackDurationMs)) return Math.min(1, Math.max(0, elapsedMs / globalDurationMs))
    if (trackDurationMs >= globalDurationMs) {
        return Math.min(1, Math.max(0, elapsedMs / globalDurationMs))
    }
    if (loop) {
        return (elapsedMs % trackDurationMs) / trackDurationMs
    }
    return Math.min(1, elapsedMs / trackDurationMs)
}
