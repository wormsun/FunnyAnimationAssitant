// Types are defined inline in this file

/**
 * 硬件加速模式
 */
export type HardwareAcceleration = 'prefer-hardware' | 'prefer-software'

/**
 * 导出配置
 */
export interface VideoExportConfig {
    // 导出范围
    episodeId: string

    // 视频参数
    resolution: {
        width: number   // 像素宽度
        height: number  // 像素高度
        scale: number   // 相机视口倍数 (1x, 1.5x, 2x)
    }
    frameRate: number
    videoBitrate: number  // bps，如 8_000_000 = 8Mbps

    // 音频参数
    audioBitrate: number  // bps，如 128_000 = 128kbps
    audioSampleRate: 48000  // 固定 48kHz

    // 编码器配置
    videoCodec: 'avc1.640028'  // H.264 High Profile Level 4.0
    audioCodec: 'mp4a.40.2'    // AAC-LC

    // 硬件加速
    hardwareAcceleration: HardwareAcceleration  // 编码器类型

    // 水印配置
    showWatermark?: boolean  // 是否显示水印，默认 false

    // 字幕配置
    showSubtitles?: boolean  // 是否显示字幕，默认 false
    subtitleStyle?: SubtitleStyle
}

/**
 * 导出字幕样式
 */
export interface SubtitleStyle {
    fontFamily: string
    fontSize: number
    textColor: string
    backgroundColor: string
    backgroundOpacity: number
    maxWidthPercent: number
    bottomPercent: number
}

/**
 * 导出状态
 */
export type VideoExportStatus =
    | 'idle'
    | 'preparing'   // 准备资源
    | 'encoding'    // 编码中
    | 'muxing'      // 封装中
    | 'completed'
    | 'error'
    | 'cancelled'

/**
 * 导出进度信息
 */
export interface VideoExportProgress {
    currentFrame: number
    totalFrames: number
    percentage: number  // 0-100

    // 时间信息
    elapsedTime: number      // ms
    estimatedRemaining: number  // ms

    // 当前阶段
    stage: 'preparing' | 'encoding' | 'muxing'
    stageMessage: string

    // 场景信息（新增）
    currentScene?: string       // 当前场景名称
    currentSceneIndex?: number  // 当前场景索引
    totalScenes?: number        // 总场景数
}

/**
 * 导出状态数据
 */
export interface VideoExportState {
    status: VideoExportStatus
    progress: VideoExportProgress

    // 错误信息
    error?: {
        code: string
        message: string
        details?: unknown
    }

    // 输出
    outputBlob?: Blob
    outputFileName?: string
}

/**
 * 音频轨道信息
 */
export interface AudioTrack {
    buffer: AudioBuffer
    startTime: number      // ms
    duration: number       // ms
    volume: number         // 0-1
    fadeIn?: number        // ms
    fadeOut?: number       // ms
    source: 'tts' | 'bgm' | 'sfx'
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: VideoExportProgress) => void

/**
 * 导出选项
 */
export interface VideoExportOptions {
    onProgress?: ProgressCallback
    signal?: AbortSignal
}

/**
 * 用户导出设置（可配置项）
 */
export interface ExportSettings {
    resolution: '1080p' | '720p'
    frameRate: 60
    quality: 'low' | 'medium' | 'high' | 'ultra'
    encoder: 'hardware' | 'software'  // 编码器类型
    showWatermark: boolean  // 是否显示水印,默认 false
    showSubtitles: boolean  // 是否显示字幕,默认 false
    subtitleStyle: SubtitleStyle
}

/**
 * 导出结果信息
 */
export interface ExportResult {
    success: boolean
    fileSize: number           // 文件大小（字节）
    duration: number           // 导出耗时（毫秒）
    totalFrames: number        // 总帧数
    resolution: {
        width: number
        height: number
    }
    frameRate: number
    quality: string
    errorMessage?: string      // 错误消息
    errorDetails?: string      // 错误详情
}
