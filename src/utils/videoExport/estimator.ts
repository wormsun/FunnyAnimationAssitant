/**
 * 视频导出文件大小预估工具
 */

/**
 * 预估文件大小（字节）
 * @param durationMs 视频时长（毫秒）
 * @param videoBitrate 视频码率（bps）
 * @param audioBitrate 音频码率（bps）
 * @returns 预估文件大小（字节）
 */
export function estimateFileSize(
    durationMs: number,
    videoBitrate: number,
    audioBitrate: number
): number {
    const durationSec = durationMs / 1000

    // VBR 模式下，实际码率通常是目标码率的 60-80%
    // 对于动画内容（静态画面多），使用 70% 作为预估系数
    // 这样预估会偏保守，实际文件通常会比预估小，用户体验更好
    const effectiveVideoBitrate = videoBitrate * 0.7

    // 音频也使用 VBR，实际约为目标的 90%
    const effectiveAudioBitrate = audioBitrate * 0.9

    // 文件大小 = (有效视频码率 + 有效音频码率) × 时长 / 8
    // 除以 8 是因为码率单位是 bits per second，需要转换为 bytes
    const sizeBytes = ((effectiveVideoBitrate + effectiveAudioBitrate) * durationSec) / 8

    // 添加 5% 的容器开销（MP4 header、metadata 等）
    return Math.ceil(sizeBytes * 1.05)
}

/**
 * 格式化文件大小为可读字符串
 * @param bytes 文件大小（字节）
 * @returns 格式化后的字符串（如 "45.2 MB"）
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

/**
 * 格式化时长为可读字符串
 * @param ms 时长（毫秒）
 * @returns 格式化后的字符串（如 "2:35"）
 */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
