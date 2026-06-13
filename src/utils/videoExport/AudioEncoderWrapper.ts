import type { MP4MuxerWrapper } from './MP4MuxerWrapper'
import type { VideoExportConfig } from './types'

/**
 * 音频编码器封装类
 */
export class AudioEncoderWrapper {
    private encoder: AudioEncoder | null = null
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
            this.encoder = new AudioEncoder({
                output: (chunk, meta) => {
                    try {
                        this.muxer.addAudioChunk(chunk, meta)
                    } catch (error) {
                        console.error('[AudioEncoder] 添加音频块失败:', error)
                    }
                },
                error: (error) => {
                    console.error('[AudioEncoder] 编码错误:', error)
                    reject(error)
                },
            })

            // 配置编码器
            const encoderConfig: AudioEncoderConfig = {
                codec: this.config.audioCodec,
                sampleRate: this.config.audioSampleRate,
                numberOfChannels: 2,
                bitrate: this.config.audioBitrate,
            }

            this.encoder.configure(encoderConfig)
            this.isConfigured = true

            resolve()
        })
    }

    /**
     * 编码 AudioData
     */
    encode(audioData: AudioData): void {
        if (!this.encoder || !this.isConfigured) {
            throw new Error('Encoder not initialized')
        }

        try {
            this.encoder.encode(audioData)
        } catch (error) {
            console.error('[AudioEncoder] 编码失败:', error)
            throw error
        }
    }

    /**
     * 批量编码 AudioBuffer
     */
    encodeBuffer(buffer: AudioBuffer): Promise<void> {
        if (!this.encoder || !this.isConfigured) {
            throw new Error('Encoder not initialized')
        }

        const sampleRate = buffer.sampleRate
        const numberOfChannels = buffer.numberOfChannels
        const length = buffer.length

        // 将 AudioBuffer 转换为 AudioData
        // 每次传递一小块数据以避免内存问题
        const chunkSize = sampleRate // 1秒的数据

        for (let offset = 0; offset < length; offset += chunkSize) {
            const frameLength = Math.min(chunkSize, length - offset)

            // 提取平面数据（通道连续排列）
            const planarData = new Float32Array(frameLength * numberOfChannels)
            for (let ch = 0; ch < numberOfChannels; ch++) {
                const channelSamples = buffer.getChannelData(ch)
                const channelSlice = channelSamples.subarray(offset, offset + frameLength)
                planarData.set(channelSlice, ch * frameLength)
            }

            // 创建 AudioData - 使用 f32-planar 格式
            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: sampleRate,
                numberOfFrames: frameLength,
                numberOfChannels: numberOfChannels,
                timestamp: (offset / sampleRate) * 1_000_000, // 转为微秒
                data: planarData,
            })

            this.encode(audioData)
            audioData.close()
        }
        return Promise.resolve()
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
     * 清理资源
     */
    async destroy(): Promise<void> {
        if (this.encoder) {
            try {
                await this.flush()
                this.encoder.close()
            } catch (error) {
                console.error('[AudioEncoder] 清理失败:', error)
            }
            this.encoder = null
        }
        this.isConfigured = false
    }
}
