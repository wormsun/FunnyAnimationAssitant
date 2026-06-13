/**
 * AudioController — 统一音频状态计算模块
 *
 * 从 ScenePlayer.vue 的 updateAudio() 提取状态计算逻辑为纯函数。
 * 实际的 WebAudio I/O 仍由 ScenePlayer 控制。
 *
 * 设计原则：
 * - 纯函数，无副作用，不依赖任何 PIXI/WebAudio API
 * - 可单元测试，不需要 mock 任何浏览器 API
 * - FrameCapture 不播放音频，但如果未来需要音频时间轴信息，可直接使用此模块
 */

import type { SceneObject } from '@/types/sceneObject'
import type {
    Action,
    RuntimeSlot,
    SetAudioAction,
} from '@/types/screenplay'

// ============================================================================
// Types
// ============================================================================

/**
 * BlockPlayInfo 的精简版本，仅包含音频计算所需字段
 */
export interface AudioBlockInfo {
    startTime: number
    blockActions: Action[]
    slots?: RuntimeSlot[]
}

/**
 * 音频状态计算结果
 */
export interface AudioStateResult {
    /** 是否应该播放 */
    shouldPlay: boolean
    /** 目标音量 (0-1) */
    targetVolume: number
    /** 是否循环 */
    loop: boolean
    /** 播放起始时间 (绝对时间, ms) */
    playTime: number
    /** 淡入时长 (秒) */
    fadeIn: number
    /** 是否处于 FadeOut 尾部 */
    inFadeOutTail: boolean
    /** FadeOut 时长 (秒) */
    fadeOutDuration: number
    /** Stop 时间 (绝对时间, ms) */
    stopTime: number
}

// ============================================================================
// Core Pure Function
// ============================================================================

/**
 * 计算音频对象在给定绝对时间的播放状态
 *
 * 此函数是纯函数，不产生任何副作用：
 * - 不访问任何 WebAudio API
 * - 不修改任何外部状态
 * - 仅基于输入数据计算并返回结果
 *
 * @param objSetup         音频对象的 Setup 定义
 * @param blockPlayInfos   所有 Block 的播放信息（用于回溯历史 set_audio 动作）
 * @param currentAbsTime   当前绝对时间 (ms)
 * @param audioDurationSec 已知的音频实际时长 (秒)，用于自然结束时的 fadeOut 计算。
 *                         如果音频尚未加载则传 0。
 */
export function computeAudioState(
    objSetup: SceneObject,
    blockPlayInfos: AudioBlockInfo[],
    currentAbsTime: number,
    audioDurationSec: number,
): AudioStateResult {
    const result: AudioStateResult = {
        shouldPlay: false,
        targetVolume: 1.0,
        loop: false,
        playTime: 0,
        fadeIn: 0,
        inFadeOutTail: false,
        fadeOutDuration: 0,
        stopTime: 0,
    }

    // ──── 1. 确定初始播放状态 ────
    let activePlayAction: {
        params: SetAudioAction['params']
        virtualTime: number
    } | null = null
    let activeStopAction: {
        params: SetAudioAction['params']
        virtualTime: number
    } | null = null

    const audioProps = objSetup as unknown as {
        playbackState?: string
        volume?: number
        loop?: boolean | string
    }
    const initialPlaybackState =
        audioProps.playbackState === 'play' ? 'play' : 'stop'

    if (initialPlaybackState === 'play') {
        activePlayAction = {
            params: {
                action: 'play',
                volume: audioProps.volume ?? 1.0,
                loop: audioProps.loop === true || audioProps.loop === 'true',
                fadeIn: 0,
            },
            virtualTime: 0,
        }
    }

    // ──── 2. 遍历所有 Block 的 set_audio 动作，确定最终状态 ────
    for (const info of blockPlayInfos) {
        const actions = info.blockActions.filter(
            (a: Action) => a.type === 'set_audio' && a.target === objSetup.id,
        )
        for (const action of actions) {
            let t = info.startTime
            const slot = info.slots?.[action.slotIndex]
            if (slot) t += slot.startTime

            const audioParams = action.params as SetAudioAction['params']
            if (audioParams.action === 'play') {
                if (t <= currentAbsTime) {
                    activePlayAction = {
                        ...action,
                        params: audioParams,
                        virtualTime: t,
                    }
                    activeStopAction = null
                }
            } else {
                if (activePlayAction && t >= activePlayAction.virtualTime) {
                    activeStopAction ??= {
                        ...action,
                        params: audioParams,
                        virtualTime: t,
                    }
                }
            }
        }
    }

    // ──── 3. 根据 Play/Stop/FadeOut 状态计算最终结果 ────
    if (!activePlayAction) {
        return result
    }

    const playParams = activePlayAction.params
    result.playTime = activePlayAction.virtualTime
    result.loop =
        playParams.loop === true || String(playParams.loop) === 'true'
    const parsedVolume = Number(playParams.volume)
    result.targetVolume = isNaN(parsedVolume) ? 1.0 : parsedVolume
    result.fadeIn = Number(playParams.fadeIn) || 0
    result.shouldPlay = true

    if (activeStopAction) {
        const stopParams = activeStopAction.params
        result.stopTime = activeStopAction.virtualTime
        result.fadeOutDuration = Number(stopParams.fadeOut) || 0
        if (
            currentAbsTime
            < result.stopTime + result.fadeOutDuration * 1000
        ) {
            if (currentAbsTime >= result.stopTime) {
                result.inFadeOutTail = true
            }
        } else {
            result.shouldPlay = false
        }
    } else if (
        !result.loop
        && (Number(playParams.fadeOut) || 0) > 0
        && audioDurationSec > 0
    ) {
        // 非循环 + 有 fadeOut + 已知时长 → 计算自然结束前的 FadeOut
        const fadeOutSec = Number(playParams.fadeOut) || 0
        const durationMs = audioDurationSec * 1000
        const fadeOutMs = fadeOutSec * 1000
        const naturalEndTime = result.playTime + durationMs
        const autoStopStartTime = naturalEndTime - fadeOutMs
        if (currentAbsTime >= autoStopStartTime) {
            result.stopTime = autoStopStartTime
            result.fadeOutDuration = fadeOutSec
            if (currentAbsTime < naturalEndTime) {
                result.inFadeOutTail = true
            } else {
                result.shouldPlay = false
            }
        }
    }

    return result
}
