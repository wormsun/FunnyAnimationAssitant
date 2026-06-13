import type { MP4MuxerWrapper } from './MP4MuxerWrapper'
import type { VideoExportConfig } from './types'

/**
 * 视频编码器封装类
 */
export class VideoEncoderWrapper {
    private encoder: VideoEncoder | null = null
    private muxer: MP4MuxerWrapper
    private config: VideoExportConfig
    private isConfigured = false

    constructor(muxer: MP4MuxerWrapper, config: VideoExportConfig) {
        this.muxer = muxer
        this.config = config
    }

    /**
     * 初始化并配置编码器
     */
    async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.encoder = new VideoEncoder({
                output: (chunk, meta) => {
                    try {
                        this.muxer.addVideoChunk(chunk, meta)
                    } catch (error) {
                        console.error('[VideoEncoder] 添加视频块失败:', error)
                    }
                },
                error: (error) => {
                    console.error('[VideoEncoder] 编码错误:', error)
                    reject(error)
                },
            })

            // 配置编码器
            // 硬件编码器码率效率较低（NVENC/QSV/AMF），需要 1.5x 码率补偿以达到同等画质
            const effectiveBitrate = this.config.hardwareAcceleration === 'prefer-hardware'
                ? Math.round(this.config.videoBitrate * 1.5)
                : this.config.videoBitrate

            const encoderConfig: VideoEncoderConfig = {
                codec: this.config.videoCodec,
                width: this.config.resolution.width,
                height: this.config.resolution.height,
                bitrate: effectiveBitrate,
                framerate: this.config.frameRate,
                // 使用用户选择的编码器类型
                hardwareAcceleration: this.config.hardwareAcceleration,
                // 软件编码时启用质量优先模式，牺牲速度换取更高画质
                ...(this.config.hardwareAcceleration === 'prefer-software'
                    ? { latencyMode: 'quality' as const }
                    : {}),
                // AVC 配置
                avc: { format: 'avc' },
            }

            this.encoder.configure(encoderConfig)
            this.isConfigured = true

            resolve()
        })
    }

    /**
     * 编码一帧
     */
    encode(frame: VideoFrame, keyFrame = false): void {
        if (!this.encoder || !this.isConfigured) {
            throw new Error('Encoder not initialized')
        }

        try {
            this.encoder.encode(frame, { keyFrame })
        } catch (error) {
            console.error('[VideoEncoder] 编码帧失败:', error)
            throw error
        }
    }

    /**
     * 刷新编码器缓冲区
     */
    async flush(): Promise<void> {
        if (!this.encoder) {
            return
        }

        return this.encoder.flush()
    }

    /**
     * 获取编码器队列大小（调试用）
     */
    getQueueSize(): number {
        if (!this.encoder) {
            return 0
        }
        return this.encoder.encodeQueueSize
    }

    /**
     * 清理资源
     */
    async destroy(): Promise<void> {
        if (this.encoder) {
            try {
                await this.flush()
                this.encoder.close()
            } catch (error) {
                console.error('[VideoEncoder] 清理失败:', error)
            }
            this.encoder = null
        }
        this.isConfigured = false
    }
}
