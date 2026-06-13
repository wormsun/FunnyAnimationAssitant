import { ArrayBufferTarget,Muxer } from 'mp4-muxer'

import type { VideoExportConfig } from './types'

/**
 * MP4 封装器封装类
 */
export class MP4MuxerWrapper {
    private muxer: Muxer<ArrayBufferTarget> | null = null
    private target: ArrayBufferTarget | null = null

    /**
     * 初始化 Muxer
     */
    initialize(config: VideoExportConfig): void {
        this.target = new ArrayBufferTarget()

        this.muxer = new Muxer({
            target: this.target,
            video: {
                codec: 'avc',
                width: config.resolution.width,
                height: config.resolution.height,
            },
            audio: {
                codec: 'aac',
                numberOfChannels: 2,
                sampleRate: config.audioSampleRate,
            },
            fastStart: 'in-memory', // 启用快速启动模式
            firstTimestampBehavior: 'offset', // 自动处理时间戳偏移
        })
    }

    /**
     * 添加视频块
     */
    addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void {
        if (!this.muxer) {
            throw new Error('Muxer not initialized')
        }

        this.muxer.addVideoChunk(chunk, meta)
    }

    /**
     * 添加音频块
     */
    addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void {
        if (!this.muxer) {
            throw new Error('Muxer not initialized')
        }

        this.muxer.addAudioChunk(chunk, meta)
    }

    /**
     * 完成封装并返回 Blob
     */
    finalize(): Blob {
        if (!this.muxer || !this.target) {
            throw new Error('Muxer not initialized')
        }

        this.muxer.finalize()

        const blob = new Blob([this.target.buffer], { type: 'video/mp4' })

        return blob
    }

    /**
     * 清理资源
     */
    destroy(): void {
        this.muxer = null
        this.target = null
    }
}
