/**
 * v12.x: Auto Duration 标记值
 * 当轨道 duration === 'auto' 时，getTrackDuration 返回此值
 * AnimationPlayer 会将其替换为运行时注入的 runtimeDuration
 */
export const AUTO_DURATION_MARKER = -1

/**
 * Animation Track Evaluator (v11.0)
 * 轨道求值器，负责根据轨道定义和进度计算输出值
 */

import type {
    AnimationOutput,
    AnimationTrack,
    EffectTrack,
    EffectTrackOutput,
    TrackOutput,
    TransformKeyframe,
    TransformTrack,
    TransformTrackOutput,
    VisibilityKeyframe,
    VisibilityTrack,
    VisibilityTrackOutput,
} from '@/types/animation'
import { applyEasing, lerp } from '@/utils/easing'

import { DynamicEffectManager } from './animation/DynamicEffectManager'

/**
 * v13 Scheme B helpers — 分裂关键帧的左右值解析
 *
 * 段 [prev, next] 内插值：start = resolveRightSide(prev), end = resolveLeftSide(next)
 * - resolveLeftSide(kf): 顶层字段，代表 valueIn（从左段进入时的值 / 段的结束值）
 * - resolveRightSide(kf): kf.out 覆写后的字段，代表 valueOut（段的起始值）
 * 未设置 out 的关键帧，左右两侧相等（连续，兼容旧数据）
 */
function transformKfRight(kf: TransformKeyframe): {
    x: number; y: number; scaleX: number; scaleY: number; rotation: number; flipX: boolean | undefined
} {
    const o = kf.out
    return {
        x: o?.x ?? kf.x ?? 0,
        y: o?.y ?? kf.y ?? 0,
        scaleX: o?.scaleX ?? kf.scaleX ?? 1,
        scaleY: o?.scaleY ?? kf.scaleY ?? 1,
        rotation: o?.rotation ?? kf.rotation ?? 0,
        flipX: o?.flipX ?? kf.flipX,
    }
}

function transformKfLeft(kf: TransformKeyframe): {
    x: number; y: number; scaleX: number; scaleY: number; rotation: number; flipX: boolean | undefined
} {
    return {
        x: kf.x ?? 0,
        y: kf.y ?? 0,
        scaleX: kf.scaleX ?? 1,
        scaleY: kf.scaleY ?? 1,
        rotation: kf.rotation ?? 0,
        flipX: kf.flipX,
    }
}

function visibilityKfRight(kf: VisibilityKeyframe): { alpha: number } {
    return { alpha: kf.out?.alpha ?? kf.alpha ?? 1 }
}

function visibilityKfLeft(kf: VisibilityKeyframe): { alpha: number } {
    return { alpha: kf.alpha ?? 1 }
}

/**
 * 轨道求值器
 * 纯函数，根据轨道定义和进度计算输出值
 */
export class AnimationTrackEvaluator {
    /**
     * 求值轨道
     * @param track 轨道定义
     * @param progress 归一化进度 (0-1)
     * @param duration 动画时长 (ms)，用于进度驱动的特效计算
     * v11.52: 移除 frame_sequence case，帧动画直接使用 AnimatedSprite.play()
     * v11.70: 新增 duration 参数支持进度驱动模式
     */
    static evaluate(track: AnimationTrack, progress: number, duration = 1000): TrackOutput {
        switch (track.trackType) {
            case 'frame_sequence':
                // v11.52: 帧序列轨道不再需要评估，返回空输出
                // 帧动画直接使用 AnimatedSprite.play() 播放
                throw new Error('frame_sequence tracks should not be evaluated. Use AnimatedSprite.play() instead.')
            case 'transform':
                return this.evaluateTransform(track, progress)
            case 'visibility':
                return this.evaluateVisibility(track, progress)
            case 'effect':
                return this.evaluateEffect(track, progress, duration)
            default:
                throw new Error(`Unknown track type: ${(track as AnimationTrack).trackType}`)
        }
    }

    /**
     * 求值变换轨道
     */
    static evaluateTransform(track: TransformTrack, progress: number): TransformTrackOutput {
        const keyframes = track.keyframes
        if (keyframes.length === 0) {
            return {
                targetObjectId: track.targetObjectId,
                x: 0,
                y: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                flipX: undefined,
                pivot: track.pivot,
            }
        }

        if (keyframes.length === 1) {
            const kf = keyframes[0]
            if (!kf) throw new Error('Keyframe is undefined')
            // 单帧：按 valueOut 展示（forward-facing）
            const r = transformKfRight(kf)
            return {
                targetObjectId: track.targetObjectId,
                x: r.x,
                y: r.y,
                scaleX: r.scaleX,
                scaleY: r.scaleY,
                rotation: r.rotation,
                flipX: r.flipX,
                pivot: track.pivot,
            }
        }

        // 找到前后关键帧并插值
        const { prev, next, t, atEnd } = this.findKeyframes(keyframes, progress)
        const eased = applyEasing(t, track.easing ?? 'linear')

        // v13 Scheme B:
        //   atEnd=true  → 已到达/越过最后一帧 → 使用 next 的 valueIn（顶层）
        //   atEnd=false → 段内插值 / 首帧之前 → start=prev.valueOut, end=next.valueIn
        const start = atEnd ? transformKfLeft(prev) : transformKfRight(prev)
        const end = transformKfLeft(next)

        // flipX 使用 Step 逻辑：不插值，取当前时间点对应的关键帧值
        // 当 t >= 0.5 时使用 next 的值，否则使用 prev 的值
        const flipX = t >= 0.5 ? end.flipX : start.flipX

        return {
            targetObjectId: track.targetObjectId,
            x: lerp(start.x, end.x, eased),
            y: lerp(start.y, end.y, eased),
            scaleX: lerp(start.scaleX, end.scaleX, eased),
            scaleY: lerp(start.scaleY, end.scaleY, eased),
            rotation: lerp(start.rotation, end.rotation, eased),
            flipX,
            pivot: track.pivot,
        }
    }

    /**
     * 求值可见性轨道
     */
    static evaluateVisibility(track: VisibilityTrack, progress: number): VisibilityTrackOutput {
        const keyframes = track.keyframes
        if (keyframes.length === 0) {
            return {
                targetObjectId: track.targetObjectId,
                alpha: 1,
            }
        }

        if (keyframes.length === 1) {
            const kf = keyframes[0]
            if (!kf) throw new Error('Keyframe is undefined')
            return {
                targetObjectId: track.targetObjectId,
                alpha: visibilityKfRight(kf).alpha,
            }
        }

        const { prev, next, t, atEnd } = this.findKeyframes(keyframes, progress)
        const eased = applyEasing(t, track.easing ?? 'linear')

        const start = atEnd ? visibilityKfLeft(prev) : visibilityKfRight(prev)
        const end = visibilityKfLeft(next)

        return {
            targetObjectId: track.targetObjectId,
            alpha: lerp(start.alpha, end.alpha, eased),
        }
    }

    // v11.52: evaluateFrameSequence 已删除。帧动画直接使用 AnimatedSprite.play()

    /**
     * 求值特效轨道
     * v11.70: 新增 progress 和 duration 参数，支持进度驱动模式
     * 对于阻尼类特效（jelly/squash），直接使用 progress 计算输出
     */
    static evaluateEffect(track: EffectTrack, progress: number, duration: number): EffectTrackOutput {
        const effectType = track.effectParams.type

        // v11.70: 阻尼类特效使用进度驱动模式，直接计算输出
        // 这些特效依赖时间衰减，循环时需要 progress 归零来重置
        if (effectType === 'jelly' || effectType === 'squash') {
            const effectOutput = DynamicEffectManager.calculateWithProgress(
                track.effectParams,
                progress,
                duration
            )
            return {
                targetObjectId: track.targetObjectId,
                effectType: track.effectParams.type,
                effectParams: track.effectParams,
                active: true,
                // v11.70: 直接携带计算结果
                ...effectOutput
            }
        }

        // 非阻尼类特效：返回参数，由 DynamicEffectManager 实时计算
        return {
            targetObjectId: track.targetObjectId,
            effectType: track.effectParams.type,
            effectParams: track.effectParams,
            active: true,
        }
    }

    /**
     * 查找前后关键帧
     * @param keyframes 关键帧数组（按 time 排序）
     * @param progress 归一化进度 (0-1)
     *
     * v13 Scheme B 增强返回字段 `atEnd`：
     * - true：progress ≥ 最后一帧时间（已到达末尾，应显示末帧的 valueIn/顶层）
     * - false：其它（段内 / 首帧之前，应使用 prev.valueOut → next.valueIn 语义）
     */
    private static findKeyframes<T extends { time: number }>(
        keyframes: T[],
        progress: number
    ): { prev: T; next: T; t: number; atEnd: boolean } {
        // 确保数组非空
        if (keyframes.length === 0) {
            throw new Error('Keyframes array is empty')
        }

        const first = keyframes[0]
        const last = keyframes[keyframes.length - 1]

        if (!first || !last) {
            throw new Error('Keyframes array contains undefined elements')
        }

        // 边界情况：进度小于第一帧（atEnd=false，使用首帧 valueOut）
        if (progress <= first.time) {
            return {
                prev: first,
                next: first,
                t: 0,
                atEnd: false,
            }
        }

        // 边界情况：进度大于最后一帧（atEnd=true，使用末帧 valueIn）
        if (progress >= last.time) {
            return {
                prev: last,
                next: last,
                t: 0,
                atEnd: true,
            }
        }

        // v13 Scheme B: 精确落在中间关键帧时使用其 valueOut（forward-facing）
        // 这样分裂关键帧产生的跳变在 playhead 停在关键帧位置时显示"右侧"值
        for (let i = 1; i < keyframes.length - 1; i++) {
            const kf = keyframes[i]
            if (kf && kf.time === progress) {
                return { prev: kf, next: kf, t: 0, atEnd: false }
            }
        }

        // 查找包含 progress 的区间
        for (let i = 0; i < keyframes.length - 1; i++) {
            const prev = keyframes[i]
            const next = keyframes[i + 1]

            if (!prev || !next) continue

            if (progress >= prev.time && progress <= next.time) {
                const duration = next.time - prev.time
                const t = duration > 0 ? (progress - prev.time) / duration : 0

                return { prev, next, t, atEnd: false }
            }
        }

        // 不应该到达这里，返回最后一帧作为 fallback
        return {
            prev: last,
            next: last,
            t: 0,
            atEnd: true,
        }
    }

    /**
     * 计算轨道持续时间
     * v11.2: 帧序列轨道根据帧数和帧率计算时长
     */
    static getTrackDuration(track: AnimationTrack): number {
        switch (track.trackType) {
            case 'transform':
            case 'visibility':
                // v12.x: 'auto' 时长由运行时解析
                if (track.duration === 'auto') return AUTO_DURATION_MARKER
                return track.duration ?? 1000
            case 'frame_sequence': {
                // v11.52: 帧序列时长由运行时动态计算，这里使用默认值
                // 实际时长由 AnimationPlayer 根据 AnimatedSprite.textures.length 计算
                return 1000
            }
            case 'effect': {
                // v11.70: 根据特效类型返回适当的时长
                const effectType = track.effectParams.type
                const params = track.effectParams

                // 阻尼类特效：使用 duration 参数或默认 1000ms
                if (effectType === 'jelly' || effectType === 'squash') {
                    return (params as { duration?: number }).duration ?? 1000
                }

                // 一次性特效：使用自身的 duration 参数 (ms)
                if (effectType === 'petrify') {
                    return (params as { duration?: number }).duration ?? 1000
                }
                if (effectType === 'shatter') {
                    return (params as { duration?: number }).duration ?? 1500
                }

                // 持续性特效（wave/breathe/float/glow/shake/motion_blur）：无限时长
                return Infinity
            }
            default:
                return 1000
        }
    }
}

/**
 * 合并多个轨道输出为统一的 AnimationOutput
 * v11.52: frameSequences 已移除
 */
export function mergeTrackOutputs(outputs: TrackOutput[]): AnimationOutput {
    const result: AnimationOutput = {
        transforms: [],
        visibilities: [],
        effects: [],
    }

    for (const output of outputs) {
        if ('x' in output && 'y' in output) {
            result.transforms.push(output)
        } else if ('alpha' in output && !('effectType' in output)) {
            result.visibilities.push(output)
        } else if ('effectType' in output) {
            result.effects.push(output as EffectTrackOutput)
        }
        // v11.52: frameSequences case 已删除
    }

    return result
}
