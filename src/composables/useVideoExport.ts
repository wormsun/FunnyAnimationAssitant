import { ref } from 'vue'

import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { ensureEpisodeTTS } from '@/utils/ttsUtils'
import type { ExportResult, ExportSettings, VideoExportConfig, VideoExportProgress, VideoExportState } from '@/utils/videoExport'
import { checkWebCodecsSupport, DEFAULT_EXPORT_CONFIG, DEFAULT_SUBTITLE_STYLE, ERROR_CODES, QUALITY_PRESETS, RESOLUTION_PRESETS, VideoExporter } from '@/utils/videoExport'

/**
 * 视频导出 Composable
 */
export function useVideoExport() {
    const episodeStore = useEpisodeStore()
    const projectStore = useProjectStore()

    // 导出状态
    const exportState = ref<VideoExportState>({
        status: 'idle',
        progress: {
            currentFrame: 0,
            totalFrames: 0,
            percentage: 0,
            elapsedTime: 0,
            estimatedRemaining: 0,
            stage: 'preparing',
            stageMessage: ''
        }
    })

    // 显示确认对话框
    const showConfirmDialog = ref(false)

    // 显示进度对话框
    const showProgressDialog = ref(false)

    // 显示结果对话框
    const showResultDialog = ref(false)

    // 导出结果
    const exportResult = ref<ExportResult | null>(null)

    // 当前导出的剧集 ID
    const currentEpisodeId = ref<string | null>(null)

    // 导出开始时间
    let exportStartTime = 0

    // 导出设置（用户可配置）
    const exportSettings = ref<ExportSettings>(loadExportSettings())

    // 取消控制器
    let abortController: AbortController | null = null

    /**
     * 从 localStorage 加载导出设置
     */
    function loadExportSettings(): ExportSettings {
        const defaults: ExportSettings = {
            resolution: '1080p',
            frameRate: 60,
            quality: 'ultra',
            encoder: 'software',
            showWatermark: false,
            showSubtitles: false,
            subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE }
        }

        const stored = localStorage.getItem('animeStudio_exportSettings')
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as Partial<ExportSettings>
                // 帧率固定为 60，旧的本地设置不再影响导出帧率
                return {
                    ...defaults,
                    ...parsed,
                    subtitleStyle: {
                        ...defaults.subtitleStyle,
                        ...parsed.subtitleStyle,
                    },
                    frameRate: 60,
                }
            } catch (e) {
                console.warn('[useVideoExport] Failed to parse stored settings:', e)
            }
        }

        return defaults
    }

    /**
     * 保存导出设置到 localStorage
     */
    function saveExportSettings(settings: ExportSettings) {
        localStorage.setItem('animeStudio_exportSettings', JSON.stringify(settings))
        exportSettings.value = settings
    }

    /**
     * 开始导出
     */
    const startExport = async (episodeId: string) => {
        // 检查浏览器支持
        await Promise.resolve()
        const support = checkWebCodecsSupport()
        if (!support.supported) {
            alert(support.error ?? '当前浏览器不支持视频导出功能')
            return
        }

        // 获取剧集数据
        const episode = episodeStore.getEpisode(episodeId)
        if (!episode) {
            alert('剧集不存在')
            return
        }

        if (!episode.scenes || episode.scenes.length === 0) {
            alert('剧本必须至少包含一个场景')
            return
        }

        currentEpisodeId.value = episodeId

        // 显示确认对话框
        showConfirmDialog.value = true
    }

    /**
     * 确认导出
     */
    const confirmExport = async (settings?: ExportSettings) => {
        if (!currentEpisodeId.value) return

        const episodeId = currentEpisodeId.value
        const episode = episodeStore.getEpisode(episodeId)
        if (!episode) return

        // 如果传入了设置，保存到 localStorage
        if (settings) {
            saveExportSettings(settings)
        }

        // 关闭确认对话框，打开进度对话框
        showConfirmDialog.value = false
        showProgressDialog.value = true

        // 重置状态
        exportState.value.status = 'preparing'
        delete (exportState.value as { error?: unknown }).error
        delete (exportState.value as { outputBlob?: unknown }).outputBlob
        exportResult.value = null
        exportStartTime = Date.now()

        // 使用用户选择的设置（在 try 外部定义，以便 catch 块也能访问）
        const currentSettings = exportSettings.value

        // 获取分辨率预设
        const resolutionPreset = RESOLUTION_PRESETS.find((p: typeof RESOLUTION_PRESETS[number]) => p.id === currentSettings.resolution)
        if (!resolutionPreset) {
            alert('无效的分辨率设置')
            showProgressDialog.value = false
            return
        }

        try {
            // 创建取消控制器
            abortController = new AbortController()

            // ── TTS 预处理 ──────────────────────────────────────
            exportState.value.progress = {
                ...exportState.value.progress,
                stage: 'preparing',
                stageMessage: '正在检查并生成语音...'
            }

            // 深拷贝 Episode 用于 TTS 处理（避免导出器使用的副本被修改）
            const episodeCopy = JSON.parse(JSON.stringify(episode)) as typeof episode

            try {
                await ensureEpisodeTTS(episode, episodeCopy, {
                    actors: projectStore.actors,
                    narrator: projectStore.narrator,
                    onProgress: (msg) => {
                        exportState.value.progress = {
                            ...exportState.value.progress,
                            stageMessage: msg
                        }
                    }
                })
            } catch (ttsErr) {
                const ttsError = ttsErr as Error & { errorCode?: string }
                if (ttsError.errorCode === 'TTS_PROVIDER_NOT_CONFIGURED') {
                    throw new Error('本地 TTS Provider 尚未配置。请先为台词导入本地音频，或配置本地 TTS Provider。')
                }
                throw ttsErr
            }

            // TTS 完成后，使用最新的 episode 数据（已持久化到 Store）
            const freshEpisode = episodeStore.getEpisode(episodeId) ?? episode

            // 获取质量对应的码率
            const qualityPreset = QUALITY_PRESETS.find((p: typeof QUALITY_PRESETS[number]) => p.id === currentSettings.quality)
            const videoBitrate = qualityPreset?.videoBitrate ?? DEFAULT_EXPORT_CONFIG.videoBitrate

            const config: VideoExportConfig = {
                episodeId: episodeId,
                resolution: {
                    width: resolutionPreset.width,
                    height: resolutionPreset.height,
                    scale: 1 // 使用预设分辨率，不需要缩放
                },
                frameRate: 60,
                videoBitrate: videoBitrate,
                audioBitrate: DEFAULT_EXPORT_CONFIG.audioBitrate,
                audioSampleRate: 48000 as const,
                videoCodec: DEFAULT_EXPORT_CONFIG.videoCodec,
                audioCodec: DEFAULT_EXPORT_CONFIG.audioCodec,
                hardwareAcceleration: currentSettings.encoder === 'software' ? 'prefer-software' : 'prefer-hardware',
                showWatermark: currentSettings.showWatermark,  // 传递水印设置
                showSubtitles: currentSettings.showSubtitles,
                subtitleStyle: currentSettings.subtitleStyle
            }

            // 记录视频编码阶段的总帧数（因为音频编码和封装阶段会覆盖为 0）
            let videoTotalFrames = 0

            // 创建导出器
            const exporter = new VideoExporter(freshEpisode, config, {
                signal: abortController.signal,
                onProgress: (progress: VideoExportProgress) => {

                    // 保存视频编码阶段的总帧数
                    if (progress.stage === 'encoding' && progress.totalFrames > 0) {
                        videoTotalFrames = progress.totalFrames
                    }

                    exportState.value.progress = progress

                    // 更新状态
                    if (progress.stage === 'preparing') {
                        exportState.value.status = 'preparing'
                    } else if (progress.stage === 'encoding') {
                        exportState.value.status = 'encoding'
                    } else if (progress.stage === 'muxing') {
                        exportState.value.status = 'muxing'
                    }
                }
            })

            // 执行导出
            const blob = await exporter.export()

            // 导出成功
            exportState.value.status = 'completed'
            exportState.value.outputBlob = blob
            exportState.value.outputFileName = `${episode.name ?? '未命名剧本'}_${new Date().toISOString().slice(0, 10)}.mp4`

            // 收集导出结果信息
            const duration = Date.now() - exportStartTime
            const qualityLabel = QUALITY_PRESETS.find(p => p.id === currentSettings.quality)?.label ?? currentSettings.quality

            // 使用视频编码阶段保存的总帧数（音频/封装阶段会把 progress.totalFrames 覆盖为 0）
            const totalFrames = videoTotalFrames || exportState.value.progress.totalFrames || exportState.value.progress.currentFrame || 0



            exportResult.value = {
                success: true,
                fileSize: blob.size,
                duration: duration,
                totalFrames: totalFrames,
                resolution: {
                    width: resolutionPreset.width,
                    height: resolutionPreset.height
                },
                frameRate: 60,
                quality: qualityLabel
            }

            // 自动下载
            downloadBlob(blob, exportState.value.outputFileName)

            // 关闭进度对话框，显示结果对话框
            showProgressDialog.value = false
            showResultDialog.value = true

        } catch (error: unknown) {
            const err = error as { message?: string, stack?: string }
            if (err.message === ERROR_CODES.CANCELLED) {
                // 用户取消是正常操作,不记录为错误
                exportState.value.status = 'cancelled'
                exportState.value.error = {
                    code: ERROR_CODES.CANCELLED,
                    message: '导出已取消'
                }
                // 取消时不显示结果对话框
            } else {
                // 真正的错误才记录日志
                console.error('[useVideoExport] 导出失败:', error)
                exportState.value.status = 'error'
                exportState.value.error = {
                    code: ERROR_CODES.UNKNOWN_ERROR,
                    message: err.message ?? '导出失败',
                    details: error
                }

                // 收集错误结果信息
                const duration = Date.now() - exportStartTime
                const qualityLabel = QUALITY_PRESETS.find(p => p.id === currentSettings.quality)?.label ?? currentSettings.quality
                const resolutionPreset = RESOLUTION_PRESETS.find(p => p.id === currentSettings.resolution)

                exportResult.value = {
                    success: false,
                    fileSize: 0,
                    duration: duration,
                    totalFrames: exportState.value.progress.totalFrames,
                    resolution: {
                        width: resolutionPreset?.width ?? 1920,
                        height: resolutionPreset?.height ?? 1080
                    },
                    frameRate: 60,
                    quality: qualityLabel,
                    errorMessage: err.message ?? '导出失败',
                    errorDetails: err.stack ?? JSON.stringify(error, null, 2)
                }

                // 关闭进度对话框，显示结果对话框
                showProgressDialog.value = false
                showResultDialog.value = true
            }
        } finally {
            abortController = null
        }
    }

    /**
     * 取消导出
     */
    const cancelExport = () => {
        if (abortController) {
            abortController.abort()
            abortController = null
        }

        showConfirmDialog.value = false
        showProgressDialog.value = false
        currentEpisodeId.value = null
    }

    /**
     * 下载 Blob
     */
    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    /**
     * 关闭结果对话框
     */
    const closeResultDialog = () => {
        showResultDialog.value = false
        exportResult.value = null
    }

    /**
     * 再次导出
     */
    const exportAgain = () => {
        closeResultDialog()
        if (currentEpisodeId.value) {
            showConfirmDialog.value = true
        }
    }

    /**
     * 重试导出
     */
    const retryExport = () => {
        closeResultDialog()
        if (currentEpisodeId.value) {
            void confirmExport()
        }
    }

    return {
        exportState,
        exportSettings,
        exportResult,
        showConfirmDialog,
        showProgressDialog,
        showResultDialog,
        startExport,
        confirmExport,
        cancelExport,
        closeResultDialog,
        exportAgain,
        retryExport,
    }
}
