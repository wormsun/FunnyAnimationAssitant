import type { AudioTrack } from './types'

/**
 * 音频混合器
 * 使用 OfflineAudioContext 预渲染所有音频轨道
 */
export class AudioMixer {
    private offlineCtx: OfflineAudioContext | null = null
    private audioTracks: AudioTrack[] = []
    // private totalDuration: number = 0 // ms (Unused)

    /**
     * 初始化混音器
     * @param duration 总时长（毫秒）
     * @param sampleRate 采样率
     */
    initialize(duration: number, sampleRate = 48000): void {
        // this.totalDuration = duration
        const lengthInSamples = Math.ceil((duration / 1000) * sampleRate)

        this.offlineCtx = new OfflineAudioContext({
            numberOfChannels: 2,
            length: lengthInSamples,
            sampleRate: sampleRate,
        })
    }

    /**
     * 添加音频轨道
     */
    addTrack(track: AudioTrack): void {
        this.audioTracks.push(track)
    }

    /**
     * 渲染并混合所有音频轨道
     */
    async render(): Promise<AudioBuffer> {
        if (!this.offlineCtx) {
            throw new Error('AudioMixer not initialized')
        }



        // 为每个轨道创建音频图
        for (const track of this.audioTracks) {
            await this.addTrackToContext(track)
        }

        // 开始离线渲染
        const renderedBuffer = await this.offlineCtx.startRendering()
        return renderedBuffer
    }

    /**
     * 将音轨添加到音频上下文
     */
    private addTrackToContext(track: AudioTrack): Promise<void> {
        if (!this.offlineCtx) {
            return Promise.resolve()
        }

        const ctx = this.offlineCtx
        const startTimeSec = track.startTime / 1000

        // 创建音频源
        const source = ctx.createBufferSource()
        source.buffer = track.buffer

        // 创建增益节点
        const gainNode = ctx.createGain()

        // 设置音量
        gainNode.gain.value = track.volume

        // 应用淡入淡出（fadeIn/fadeOut 单位已经是秒）
        if (track.fadeIn && track.fadeIn > 0) {
            this.applyFadeIn(gainNode, startTimeSec, track.fadeIn)
        }

        // 处理淡出
        const AUTO_FADE_OUT = 0.1 // 100ms 自动淡出（与 WebAudioKit 一致）
        const trackDurationSec = track.duration / 1000
        const hasUserFadeOut = track.fadeOut && track.fadeOut > 0

        if (hasUserFadeOut) {
            // 用户设置了淡出，使用用户的设置
            const fadeOutStart = startTimeSec + trackDurationSec - track.fadeOut!
            this.applyFadeOut(gainNode, fadeOutStart, track.fadeOut!)
        } else {
            // 自动淡出：防止音频突然结束时的爆音（仅针对足够长的音轨）
            // 只有时长 > 淡入 + 自动淡出时才应用
            const fadeInDuration = track.fadeIn ?? 0
            if (trackDurationSec > fadeInDuration + AUTO_FADE_OUT) {
                const fadeOutStart = startTimeSec + trackDurationSec - AUTO_FADE_OUT
                this.applyFadeOut(gainNode, fadeOutStart, AUTO_FADE_OUT)
            }
        }

        // 连接音频图
        source.connect(gainNode)
        gainNode.connect(ctx.destination)

        //  开始播放
        source.start(startTimeSec)

        // 如果有指定时长，在时长结束时停止
        if (track.duration) {
            source.stop(startTimeSec + track.duration / 1000)
        }
        return Promise.resolve()
    }

    /**
     * 应用淡入效果
     */
    private applyFadeIn(gainNode: GainNode, startTime: number, duration: number): void {
        if (!this.offlineCtx) return

        const gain = gainNode.gain

        // 淡入曲线：从 0 到当前音量
        const currentVolume = gain.value
        gain.setValueAtTime(0, startTime)
        gain.linearRampToValueAtTime(currentVolume, startTime + duration)
    }

    /**
     * 应用淡出效果
     */
    private applyFadeOut(gainNode: GainNode, startTime: number, duration: number): void {
        if (!this.offlineCtx) return

        const gain = gainNode.gain

        // 淡出曲线：从当前音量到 0
        const currentVolume = gain.value
        gain.setValueAtTime(currentVolume, startTime)
        gain.linearRampToValueAtTime(0, startTime + duration)
    }

    /**
     * 清理资源
     */
    destroy(): void {
        this.offlineCtx = null
        this.audioTracks = []
    }
}
