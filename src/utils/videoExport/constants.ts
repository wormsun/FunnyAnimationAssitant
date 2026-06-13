import type { SubtitleStyle } from './types'

/**
 * 画布尺寸常量（从统一常量文件导入）
 */
export {
    CAMERA_BASE_HEIGHT,
    CAMERA_BASE_WIDTH,
    CANVAS_CENTER_X,
    CANVAS_CENTER_Y,
    CANVAS_HEIGHT,
    CANVAS_WIDTH
} from '@/constants/canvas'

/**
 * 默认导出配置
 */
export const DEFAULT_EXPORT_CONFIG = {
    // 分辨率倍数
    resolutionScale: 1.0,  // 1x = 1456×819

    // 默认帧率
    frameRate: 60,

    // 视频码率 (15 Mbps，极高质量)
    videoBitrate: 15_000_000,

    // 音频码率 (128 kbps)
    audioBitrate: 128_000,

    // 音频采样率
    audioSampleRate: 48000,

    // 编码器配置
    videoCodec: 'avc1.640028' as const,  // H.264 High Profile Level 4.0
    audioCodec: 'mp4a.40.2' as const,    // AAC-LC
}

/**
 * 默认导出字幕样式
 * 与 ScenePlayer 当前字幕视觉保持一致：底部居中、白字、半透明黑底。
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
    fontFamily: 'Noto Sans SC',
    fontSize: 24,
    textColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
    maxWidthPercent: 80,
    bottomPercent: 5,
}

/**
 * 支持的分辨率预设
 */
export const RESOLUTION_PRESETS = [
    { id: '1080p', label: '1080P', width: 1920, height: 1080 },
    { id: '720p', label: '720P', width: 1280, height: 720 },
] as const

/**
 * 支持的帧率预设
 */
export const FRAMERATE_PRESETS = [
    { value: 60, label: '60 FPS' },
] as const

/**
 * 质量预设
 */
export const QUALITY_PRESETS = [
    { id: 'low', label: '低', videoBitrate: 2_000_000, description: '文件最小' },
    { id: 'medium', label: '中', videoBitrate: 5_000_000, description: '平衡' },
    { id: 'high', label: '高', videoBitrate: 8_000_000, description: '推荐' },
    { id: 'ultra', label: '极高', videoBitrate: 15_000_000, description: '最佳质量' },
] as const

/**
 * 错误代码
 */
export const ERROR_CODES = {
    BROWSER_NOT_SUPPORTED: 'BROWSER_NOT_SUPPORTED',
    RESOURCE_LOAD_FAILED: 'RESOURCE_LOAD_FAILED',
    ENCODER_INIT_FAILED: 'ENCODER_INIT_FAILED',
    ENCODING_FAILED: 'ENCODING_FAILED',
    MUXING_FAILED: 'MUXING_FAILED',
    CANCELLED: 'CANCELLED',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

/**
 * 检查浏览器是否支持 WebCodecs
 */
export function checkWebCodecsSupport(): { supported: boolean; error?: string } {
    if (typeof VideoEncoder === 'undefined') {
        return {
            supported: false,
            error: '当前浏览器不支持 WebCodecs API，请使用 Chrome 94+ 或 Edge 94+'
        }
    }

    if (typeof AudioEncoder === 'undefined') {
        return {
            supported: false,
            error: '当前浏览器不支持 WebCodecs AudioEncoder'
        }
    }

    return { supported: true }
}
