/**
 * 视频导出模块入口
 */

// 导出核心类
export { AudioEncoderWrapper } from './AudioEncoderWrapper'
export { AudioMixer } from './AudioMixer'
export { FrameCapture } from './FrameCapture'
export { MP4MuxerWrapper } from './MP4MuxerWrapper'
export { VideoEncoderWrapper } from './VideoEncoderWrapper'
export { VideoExporter } from './VideoExporter'

// 导出常量
export {
    CAMERA_BASE_HEIGHT,
    CAMERA_BASE_WIDTH,
    checkWebCodecsSupport,
    DEFAULT_EXPORT_CONFIG,
    DEFAULT_SUBTITLE_STYLE,
    ERROR_CODES,
    FRAMERATE_PRESETS,
    QUALITY_PRESETS,
    RESOLUTION_PRESETS
} from './constants'

// 导出类型
export type {
    AudioTrack,
    ExportResult,
    ExportSettings,
    SubtitleStyle,
    VideoExportConfig,
    VideoExportOptions,
    VideoExportProgress,
    VideoExportState,
    VideoExportStatus
} from './types'
