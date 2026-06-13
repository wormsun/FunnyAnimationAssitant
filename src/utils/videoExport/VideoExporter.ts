import { useAssetAudio } from '@/composables/useAssetAudio'
import { getPlaybackVolumeGain } from '@/constants/voiceOptions'
import type { Episode } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { AudioObject } from '@/types/sceneObject'
import type { Action, RuntimeSlot, SceneContainer, ScriptBlock } from '@/types/screenplay'
import { parseBlockToSlots } from '@/utils/slotUtils'
import { audioKit } from '@/utils/WebAudioKit'

import { AudioEncoderWrapper } from './AudioEncoderWrapper'
import { AudioMixer } from './AudioMixer'
import { ERROR_CODES } from './constants'
import { FrameCapture } from './FrameCapture'
import { MP4MuxerWrapper } from './MP4MuxerWrapper'
import { ResourcePreloader } from './ResourcePreloader'
import type { AudioTrack, VideoExportConfig, VideoExportOptions, VideoExportProgress } from './types'
import { VideoEncoderWrapper } from './VideoEncoderWrapper'

/**
 * 视频导出核心类
 * 协调整个导出流程
 */
export class VideoExporter {
    private episode: Episode
    private episodeWithResources: Episode | null = null  // 预加载后的副本
    private config: VideoExportConfig
    private options: VideoExportOptions

    private frameCapture: FrameCapture | null = null
    private videoEncoder: VideoEncoderWrapper | null = null
    private audioEncoder: AudioEncoderWrapper | null = null
    private audioMixer: AudioMixer | null = null
    private muxer: MP4MuxerWrapper | null = null
    private resourcePreloader: ResourcePreloader | null = null

    private aborted = false
    private startTime = 0

    // 时间线数据（从预加载器获取）
    private totalDuration = 0
    private sceneDurations: number[] = []
    private sceneStartTimes: number[] = []

    constructor(episode: Episode, config: VideoExportConfig, options: VideoExportOptions = {}) {
        this.episode = episode
        this.config = config
        this.options = options

        // 监听取消信号
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                this.aborted = true
            })
        }
    }

    /**
     * 执行导出
     */
    async export(): Promise<Blob> {
        this.startTime = Date.now()

        try {
            // 阶段 1: 准备资源
            await this.prepareResources()
            this.checkAborted()

            // 阶段 2: 初始化编码器
            await this.initializeEncoders()
            this.checkAborted()

            // 阶段 3: 编码视频
            await this.encodeVideo()
            this.checkAborted()

            // 阶段 4: 编码音频
            await this.encodeAudio()
            this.checkAborted()

            // 阶段 5: 封装 MP4
            const blob = await this.finalize()

            return blob

        } catch (error: unknown) {
            // 用户取消是正常操作,不记录为错误
            const message = error instanceof Error ? error.message : String(error)
            if (message !== ERROR_CODES.CANCELLED) {
                console.error('[VideoExporter] 导出失败:', error)
            }
            throw error
        } finally {
            await this.cleanup()
        }
    }

    /**
     * 阶段 1: 准备资源
     */
    private async prepareResources(): Promise<void> {

        // 创建资源预加载器
        this.resourcePreloader = new ResourcePreloader(this.episode, (progress) => {
            this.updateProgress(progress)
        })

        // 执行预加载，获取包含 Blob URL 的副本
        this.episodeWithResources = await this.resourcePreloader.preloadAll()

        // 保存时间线数据
        this.totalDuration = this.resourcePreloader.totalDuration
        this.sceneDurations = this.resourcePreloader.sceneDurations
        this.sceneStartTimes = this.resourcePreloader.sceneStartTimes
    }

    /**
     * 阶段 2: 初始化编码器
     */
    private async initializeEncoders(): Promise<void> {
        if (!this.episodeWithResources) {
            throw new Error('Resources not prepared')
        }

        // 初始化 MP4 Muxer
        this.muxer = new MP4MuxerWrapper()
        this.muxer.initialize(this.config)

        // 初始化视频编码器
        this.videoEncoder = new VideoEncoderWrapper(this.muxer, this.config)
        await this.videoEncoder.initialize()

        // 初始化音频编码器
        this.audioEncoder = new AudioEncoderWrapper(this.muxer, this.config)
        await this.audioEncoder.initialize()

        // 初始化帧捕获
        this.frameCapture = new FrameCapture(this.episodeWithResources, this.config)
        await this.frameCapture.initialize()

    }

    /**
     * 阶段 3: 编码视频
     */
    private async encodeVideo(): Promise<void> {
        if (!this.frameCapture || !this.videoEncoder) {
            throw new Error('Encoders not initialized')
        }


        // 使用真实的总时长
        const totalFrames = Math.ceil((this.totalDuration / 1000) * this.config.frameRate)

        // 批处理参数：每处理一定帧数后暂停
        const BATCH_SIZE = 100  // 每批处理100帧
        const MAX_QUEUE_SIZE = 10  // 编码队列最大允许积压
        let processedFrames = 0

        // 逐帧渲染和编码
        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
            this.checkAborted()

            const time = (frameIndex / this.config.frameRate) * 1000 // 毫秒

            try {
                // 计算当前帧对应的场景和场景内时间
                const { sceneIndex, timeInScene } = this.getSceneAtTime(time)

                // 渲染帧（传递绝对时间）
                // v11.81: renderFrame 现在是 async，需要 await
                const videoFrame = await this.frameCapture.renderFrame(sceneIndex, timeInScene, time)

                // 编码帧
                const isKeyFrame = frameIndex % 30 === 0 // 每30帧一个关键帧
                this.videoEncoder.encode(videoFrame, isKeyFrame)

                // 关闭 VideoFrame 释放内存
                videoFrame.close()
            } catch (e) {
                console.error(`[VideoExporter] 帧 ${frameIndex} 处理失败:`, e)
                throw e
            }

            processedFrames++

            // 计算当前场景信息
            const { sceneIndex, timeInScene: _ } = this.getSceneAtTime(time)
            const currentScene = this.episodeWithResources!.scenes[sceneIndex]
            const sceneName = currentScene?.title ?? `场景 ${sceneIndex + 1}`

            // 更新进度
            const percentage = ((frameIndex + 1) / totalFrames) * 50 // 视频编码占50%
            const elapsedTime = Date.now() - this.startTime
            const estimatedTotal = (elapsedTime / percentage) * 100
            const estimatedRemaining = estimatedTotal - elapsedTime

            this.updateProgress({
                currentFrame: frameIndex + 1,
                totalFrames,
                percentage,
                elapsedTime,
                estimatedRemaining,
                stage: 'encoding',
                stageMessage: `正在编码视频: ${frameIndex + 1} / ${totalFrames}`,
                currentScene: sceneName,
                currentSceneIndex: sceneIndex,
                totalScenes: this.episodeWithResources!.scenes.length
            })

            // 队列流控：等待编码器处理积压的帧
            const queueSize = this.videoEncoder.getQueueSize()
            if (queueSize >= MAX_QUEUE_SIZE) {
                // 等待队列清空到可接受水平
                while (this.videoEncoder.getQueueSize() > MAX_QUEUE_SIZE / 2) {
                    await new Promise(resolve => setTimeout(resolve, 10))
                }
            }

            // 批处理：每处理 BATCH_SIZE 帧后暂停
            if (processedFrames >= BATCH_SIZE) {
                processedFrames = 0
            }
        }

        // 刷新编码器缓冲区
        await this.videoEncoder.flush()
    }

    /**
     * 阶段 4: 编码音频
     */
    private getBlockPlaybackVolume(scene: SceneContainer, block: ScriptBlock): number {
        const projectStore = useProjectStore()

        if (block.type === 'dialogue') {
            const instance = scene.setup.objects.find((object) => object.id === block.instanceId)
            const actorId = instance?.extraInfo?.kind === 'actor' ? instance.extraInfo.actorId : undefined
            const actor = actorId
                ? projectStore.actors.find((item) => item.id === actorId)
                : (instance?.refId ? projectStore.actors.find((item) => item.characterId === instance.refId) : undefined)
            return getPlaybackVolumeGain(actor?.voice?.volume)
        }

        if (block.type === 'narration') {
            return getPlaybackVolumeGain(projectStore.narrator?.voice?.volume)
        }

        return 1
    }

    private async encodeAudio(): Promise<void> {
        if (!this.audioEncoder || !this.episodeWithResources) {
            throw new Error('Audio encoder not initialized or resources not loaded')
        }

        const audioTracks: AudioTrack[] = []
        const soundStore = useSoundStore()

        // 1. 收集 TTS 音轨

        for (let sceneIdx = 0; sceneIdx < this.episodeWithResources.scenes.length; sceneIdx++) {
            const scene = this.episodeWithResources.scenes[sceneIdx]
            const sceneStartTime = this.sceneStartTimes[sceneIdx] ?? 0
            let blockStartTime = sceneStartTime

            if (scene?.script) {
                for (const block of scene.script) {
                    if ((block.type === 'dialogue' || block.type === 'narration') && block.ttsConfig?.audioPath) {
                        const audioPath = block.ttsConfig.audioPath

                        // v12.8: audioPath 可能已经是 blob URL（由 ResourcePreloader 预加载）
                        // 在这种情况下，直接使用它；否则通过 useAssetAudio 加载
                        let blobUrl: string | undefined

                        if (audioPath.startsWith('blob:')) {
                            // 已经是 blob URL，直接使用
                            blobUrl = audioPath
                        } else {
                            // 相对路径，需要通过 useAssetAudio 加载
                            const { loadAudioUrl, getAudioUrl } = useAssetAudio()
                            await loadAudioUrl(audioPath)
                            blobUrl = getAudioUrl(audioPath)
                        }

                        if (blobUrl?.startsWith('blob:')) {
                            try {
                                // audioKit.load() 会返回 AudioBuffer
                                const audioBuffer = await audioKit.load(blobUrl)
                                if (audioBuffer) {
                                    const actualDuration = Math.round(audioBuffer.duration * 1000)
                                    const blockDuration = Math.max(block.ttsConfig.duration ?? 0, actualDuration)
                                    block.ttsConfig.duration = blockDuration
                                    audioTracks.push({
                                        buffer: audioBuffer,
                                        startTime: blockStartTime,
                                        duration: blockDuration,
                                        volume: this.getBlockPlaybackVolume(scene, block),
                                        source: 'tts'
                                    })
                                }
                            } catch (e) {
                                console.warn(`[VideoExporter] 无法获取 TTS 音频:`, e)
                            }
                        } else {
                            console.warn(`[VideoExporter] TTS 音频不是 Blob URL: ${blobUrl?.substring(0, 50)}...`)
                        }

                        blockStartTime += block.ttsConfig.duration ?? 1000
                    } else {
                        blockStartTime += (block as { duration?: number }).duration ?? 1000
                    }
                }
            }
        }

        // 2. 收集全局 BGM 音轨
        const bgmTracks = this.episodeWithResources.bgmTracks || []

        for (const bgmTrack of bgmTracks) {

            if (bgmTrack.assetId) {
                try {
                    const bgmSound = soundStore.getSound(bgmTrack.assetId)

                    if (bgmSound?.url) {
                        // 先通过 asset 加载系统获取 Blob URL
                        const { loadAudioUrl, getAudioUrl } = useAssetAudio()
                        await loadAudioUrl(bgmSound.url)
                        const blobUrl = getAudioUrl(bgmSound.url)

                        if (blobUrl) {
                            const audioBuffer = await audioKit.load(blobUrl)
                            if (audioBuffer) {
                                // 处理循环：如果 BGM 需要循环且时长不够，需要多次添加
                                const bgmDuration = audioBuffer.duration * 1000 // 毫秒
                                const shouldLoop = bgmTrack.loop === true

                                // 计算 BGM 的实际开始和结束时间
                                const bgmStartTime = this.calculateTimeFromPosition(
                                    bgmTrack.start.sceneId,
                                    bgmTrack.start.blockId,
                                    false // 开始位置
                                )
                                const bgmEndTime = this.calculateTimeFromPosition(
                                    bgmTrack.end.sceneId,
                                    bgmTrack.end.blockId,
                                    true // 结束位置
                                )

                                if (shouldLoop && bgmDuration < (bgmEndTime - bgmStartTime)) {
                                    // 需要循环：多次添加音轨
                                    let currentStart = bgmStartTime
                                    let loopCount = 0
                                    while (currentStart < bgmEndTime) {
                                        const remainingTime = bgmEndTime - currentStart
                                        const clipDuration = Math.min(bgmDuration, remainingTime)

                                        const track: AudioTrack = {
                                            buffer: audioBuffer,
                                            startTime: currentStart,
                                            duration: clipDuration,
                                            volume: bgmTrack.volume ?? 0.3,
                                            source: 'bgm'
                                        }
                                        if (loopCount === 0 && bgmTrack.fadeIn) track.fadeIn = bgmTrack.fadeIn
                                        if (currentStart + clipDuration >= bgmEndTime && bgmTrack.fadeOut) track.fadeOut = bgmTrack.fadeOut
                                        audioTracks.push(track)

                                        currentStart += bgmDuration
                                        loopCount++
                                    }
                                } else {
                                    // 不循环：单次添加
                                    const track: AudioTrack = {
                                        buffer: audioBuffer,
                                        startTime: bgmStartTime,
                                        duration: Math.min(bgmDuration, bgmEndTime - bgmStartTime),
                                        volume: bgmTrack.volume ?? 0.3,
                                        source: 'bgm'
                                    }
                                    if (bgmTrack.fadeIn) track.fadeIn = bgmTrack.fadeIn
                                    if (bgmTrack.fadeOut) track.fadeOut = bgmTrack.fadeOut
                                    audioTracks.push(track)
                                }
                            }
                        } else {
                            console.warn(`[VideoExporter] 无法获取 BGM Blob URL`)
                        }
                    }
                } catch (e) {
                    console.warn(`[VideoExporter] 无法获取 BGM 音频:`, e)
                }
            }
        }

        // 3. 收集场景音效对象 (SFX)

        // 获取区块时间线，用于计算 set_audio 触发时间
        const blockTimeline = this.getBlockTimeline()

        // 预加载所有音效资源
        const sfxBufferCache = new Map<string, AudioBuffer>()

        for (let sceneIdx = 0; sceneIdx < this.episodeWithResources.scenes.length; sceneIdx++) {
            const scene = this.episodeWithResources.scenes[sceneIdx]
            const sceneStartTime = this.sceneStartTimes[sceneIdx] ?? 0
            const sceneEndTime = sceneIdx < this.sceneDurations.length
                ? sceneStartTime + (this.sceneDurations[sceneIdx] ?? 0)
                : this.totalDuration

            if (scene?.setup?.objects) {
                for (const obj of scene.setup.objects) {
                    // 只处理音频类型的对象
                    if (obj.type === 'audio') {
                        const sound = soundStore.getSound(obj.refId)
                        if (!sound?.url) continue

                        try {
                            // 获取或缓存音频 buffer
                            let audioBuffer = sfxBufferCache.get(obj.refId)
                            if (!audioBuffer) {
                                const { loadAudioUrl, getAudioUrl } = useAssetAudio()
                                await loadAudioUrl(sound.url)
                                const blobUrl = getAudioUrl(sound.url)
                                if (blobUrl) {
                                    audioBuffer = await audioKit.load(blobUrl) ?? undefined
                                    if (audioBuffer) {
                                        sfxBufferCache.set(obj.refId, audioBuffer)
                                    }
                                }
                            }

                            if (!audioBuffer) continue

                            const sfxDuration = audioBuffer.duration * 1000

                            // 收集播放事件
                            const playEvents: {
                                startTime: number
                                endTime: number
                                volume: number
                                loop: boolean
                                fadeIn?: number
                                fadeOut?: number
                            }[] = []

                            // 获取当前场景的所有区块
                            const sceneBlocks = blockTimeline.filter(b => b.sceneIndex === sceneIdx)

                            // 1. 初始状态：如果 playbackState === 'play'，从场景开始播放
                            const audioObj = obj as AudioObject
                            if (audioObj.playbackState === 'play') {
                                // 计算消亡时间：检查 set_lifecycle (spawned=false) 和 autoDespawnOnBlockEnd
                                const despawnTime = this.findDespawnTime(obj.id, sceneBlocks, sceneEndTime)
                                let effectiveEndTime = Math.min(sceneEndTime, despawnTime)

                                // 查找首个 set_audio stop/play 动作截断初始播放
                                for (const laterBlock of sceneBlocks) {
                                    for (const laterAction of laterBlock.actions) {
                                        if (laterAction.type === 'set_audio' &&
                                            laterAction.target === obj.id &&
                                            (laterAction.params?.action === 'stop' || laterAction.params?.action === 'play')) {
                                            const laterSlot = laterBlock.slots?.[laterAction.slotIndex]
                                            const laterTime = laterBlock.startTime + (laterSlot?.startTime ?? 0)
                                            if (laterTime <= sceneStartTime) continue
                                            effectiveEndTime = Math.min(effectiveEndTime, laterTime)
                                            break
                                        }
                                    }
                                    if (effectiveEndTime < Math.min(sceneEndTime, despawnTime)) break
                                }

                                if (effectiveEndTime > sceneStartTime) {
                                    const event: typeof playEvents[number] = {
                                        startTime: sceneStartTime,
                                        endTime: effectiveEndTime,
                                        volume: audioObj.volume ?? 1.0,
                                        loop: audioObj.loop === true
                                    }
                                    if (audioObj.fadeIn !== undefined) event.fadeIn = audioObj.fadeIn
                                    if (audioObj.fadeOut !== undefined) event.fadeOut = audioObj.fadeOut
                                    playEvents.push(event)
                                }
                            }

                            // 2. 遍历当前场景的所有区块，查找 set_audio 动作
                            for (const blockInfo of sceneBlocks) {
                                for (const action of blockInfo.actions) {
                                    if (action.type === 'set_audio' && action.target === obj.id) {
                                        const params = action.params || {}

                                        // 计算动作触发时间（区块开始时间 + 槽位偏移）
                                        const slot = blockInfo.slots?.[action.slotIndex]
                                        const triggerTime = blockInfo.startTime + (slot?.startTime ?? 0)

                                        if (params.action === 'play') {
                                            // 找到下一个终止点（stop 动作、后续 play 动作、或场景结束）
                                            let stopTime = sceneEndTime

                                            // 查找后续的 stop 或 play 动作（后续 play 隐式截断前一个 play）
                                            for (const laterBlock of sceneBlocks) {
                                                for (const laterAction of laterBlock.actions) {
                                                    if (laterAction.type === 'set_audio' &&
                                                        laterAction.target === obj.id &&
                                                        (laterAction.params?.action === 'stop' || laterAction.params?.action === 'play')) {
                                                        const laterSlot = laterBlock.slots?.[laterAction.slotIndex]
                                                        const laterTime = laterBlock.startTime + (laterSlot?.startTime ?? 0)
                                                        if (laterTime <= triggerTime) continue
                                                        stopTime = Math.min(stopTime, laterTime)
                                                        break
                                                    }
                                                }
                                                if (stopTime < sceneEndTime) break
                                            }

                                            // 检查消亡时间：set_lifecycle (spawned=false) 或 autoDespawnOnBlockEnd
                                            const despawnTime = this.findDespawnTime(obj.id, sceneBlocks, sceneEndTime, triggerTime)
                                            stopTime = Math.min(stopTime, despawnTime)

                                            const event: typeof playEvents[number] = {
                                                startTime: triggerTime,
                                                endTime: stopTime,
                                                volume: params.volume ?? audioObj.volume ?? 1.0,
                                                loop: params.loop ?? audioObj.loop === true
                                            }
                                            const fadeIn = params.fadeIn ?? audioObj.fadeIn
                                            const fadeOut = params.fadeOut ?? audioObj.fadeOut
                                            if (fadeIn !== undefined) event.fadeIn = fadeIn
                                            if (fadeOut !== undefined) event.fadeOut = fadeOut
                                            playEvents.push(event)
                                        }
                                    }
                                }
                            }

                            // 3. 将播放事件转换为音轨
                            for (const event of playEvents) {
                                const duration = event.endTime - event.startTime

                                if (event.loop && sfxDuration < duration) {
                                    // 循环播放
                                    let currentStart = event.startTime
                                    let loopCount = 0
                                    while (currentStart < event.endTime) {
                                        const remainingTime = event.endTime - currentStart
                                        const clipDuration = Math.min(sfxDuration, remainingTime)

                                        const track: AudioTrack = {
                                            buffer: audioBuffer,
                                            startTime: currentStart,
                                            duration: clipDuration,
                                            volume: event.volume,
                                            source: 'sfx'
                                        }
                                        if (loopCount === 0 && event.fadeIn !== undefined) track.fadeIn = event.fadeIn
                                        if (currentStart + clipDuration >= event.endTime && event.fadeOut !== undefined) track.fadeOut = event.fadeOut
                                        audioTracks.push(track)

                                        currentStart += sfxDuration
                                        loopCount++
                                    }
                                } else {
                                    // 单次播放
                                    const track: AudioTrack = {
                                        buffer: audioBuffer,
                                        startTime: event.startTime,
                                        duration: Math.min(sfxDuration, duration),
                                        volume: event.volume,
                                        source: 'sfx'
                                    }
                                    if (event.fadeIn !== undefined) track.fadeIn = event.fadeIn
                                    if (event.fadeOut !== undefined) track.fadeOut = event.fadeOut
                                    audioTracks.push(track)
                                }
                            }
                        } catch (e) {
                            console.warn(`[VideoExporter] 无法获取 SFX 音频:`, e)
                        }
                    }
                }
            }
        }

        this.updateProgress({
            currentFrame: 0,
            totalFrames: 0,
            percentage: 60,
            elapsedTime: Date.now() - this.startTime,
            estimatedRemaining: 0,
            stage: 'encoding',
            stageMessage: '正在混合音频...'
        })

        // 初始化音频混合器
        this.audioMixer = new AudioMixer()
        this.audioMixer.initialize(this.totalDuration, this.config.audioSampleRate)

        // 添加所有音轨
        for (const track of audioTracks) {
            this.audioMixer.addTrack(track)
        }

        // 渲染混合音频
        const mixedAudio = await this.audioMixer.render()

        this.updateProgress({
            currentFrame: 0,
            totalFrames: 0,
            percentage: 75,
            elapsedTime: Date.now() - this.startTime,
            estimatedRemaining: 0,
            stage: 'encoding',
            stageMessage: '正在编码音频...'
        })

        // 编码音频
        await this.audioEncoder.encodeBuffer(mixedAudio)

        // 刷新编码器缓冲区
        await this.audioEncoder.flush()
    }

    /**
     * 阶段 5: 封装 MP4
     */
    private async finalize(): Promise<Blob> {
        await Promise.resolve()
        if (!this.muxer) {
            throw new Error('Muxer not initialized')
        }

        this.updateProgress({
            currentFrame: 0,
            totalFrames: 0,
            percentage: 95,
            elapsedTime: Date.now() - this.startTime,
            estimatedRemaining: 0,
            stage: 'muxing',
            stageMessage: '正在封装 MP4...'
        })

        const blob = this.muxer.finalize()

        this.updateProgress({
            currentFrame: 0,
            totalFrames: 0,
            percentage: 100,
            elapsedTime: Date.now() - this.startTime,
            estimatedRemaining: 0,
            stage: 'muxing',
            stageMessage: '导出完成'
        })

        return blob
    }

    /**
     * 清理资源
     */
    private async cleanup(): Promise<void> {

        if (this.frameCapture) {
            this.frameCapture.destroy()
            this.frameCapture = null
        }

        if (this.videoEncoder) {
            await this.videoEncoder.destroy()
            this.videoEncoder = null
        }

        if (this.audioEncoder) {
            await this.audioEncoder.destroy()
            this.audioEncoder = null
        }

        if (this.audioMixer) {
            this.audioMixer.destroy()
            this.audioMixer = null
        }

        if (this.muxer) {
            this.muxer.destroy()
            this.muxer = null
        }
    }

    /**
     * 更新进度
     */
    private updateProgress(progress: VideoExportProgress): void {
        if (this.options.onProgress) {
            this.options.onProgress(progress)
        }
    }

    /**
     * 检查是否已取消
     */
    private checkAborted(): void {
        if (this.aborted) {
            throw new Error(ERROR_CODES.CANCELLED)
        }
    }

    /**
     * 计算指定场景和区块的绝对时间
     * @param sceneId 场景ID
     * @param blockId 区块ID，null 表示场景边界
     * @param isEnd 是否是结束位置（true=场景/区块结束，false=场景/区块开始）
     */
    private calculateTimeFromPosition(
        sceneId: string,
        blockId: string | null,
        isEnd: boolean
    ): number {
        if (!this.episodeWithResources) return 0

        // 找到场景索引
        const sceneIndex = this.episodeWithResources.scenes.findIndex(s => s.id === sceneId)
        if (sceneIndex === -1) return isEnd ? this.totalDuration : 0

        const sceneStartTime = this.sceneStartTimes[sceneIndex] ?? 0
        const sceneDuration = this.sceneDurations[sceneIndex] ?? 0

        // 如果没有指定 blockId，返回场景边界
        if (!blockId) {
            return isEnd ? sceneStartTime + sceneDuration : sceneStartTime
        }

        // 计算区块的时间
        const scene = this.episodeWithResources.scenes[sceneIndex]
        if (!scene?.script) {
            return isEnd ? sceneStartTime + sceneDuration : sceneStartTime
        }

        let blockTime = sceneStartTime
        for (const block of scene.script) {
            const blockDuration = this.getBlockDurationMs(block)

            if (block.id === blockId) {
                // 找到了目标区块
                return isEnd ? blockTime + blockDuration : blockTime
            }

            blockTime += blockDuration
        }

        // 没找到区块，返回场景边界
        return isEnd ? sceneStartTime + sceneDuration : sceneStartTime
    }

    /**
     * 获取区块的时间线信息
     * 返回每个区块的 { sceneIndex, blockId, startTime, duration }
     */
    private getBlockTimeline(): {
        sceneIndex: number
        blockId: string
        startTime: number
        duration: number
        actions: Action[]
        slots: RuntimeSlot[]
    }[] {
        if (!this.episodeWithResources) return []

        const timeline: {
            sceneIndex: number
            blockId: string
            startTime: number
            duration: number
            actions: Action[]
            slots: RuntimeSlot[]
        }[] = []

        for (let sceneIdx = 0; sceneIdx < this.episodeWithResources.scenes.length; sceneIdx++) {
            const scene = this.episodeWithResources.scenes[sceneIdx]
            let blockStartTime = this.sceneStartTimes[sceneIdx] ?? 0

            if (scene?.script) {
                for (const block of scene.script) {
                    const blockDuration = this.getBlockDurationMs(block)

                    timeline.push({
                        sceneIndex: sceneIdx,
                        blockId: block.id,
                        startTime: blockStartTime,
                        duration: blockDuration,
                        actions: block.actions || [],
                        slots: parseBlockToSlots(block)
                    })

                    blockStartTime += blockDuration
                }
            }
        }

        return timeline
    }

    private getBlockDurationMs(block: Episode['scenes'][number]['script'][number]): number {
        if (block.type === 'action') {
            return block.duration ?? 1000
        }
        return block.ttsConfig?.duration ?? 1000
    }

    /**
     * 查找音频对象的消亡时间
     * 检查 set_lifecycle (spawned=false) 和 autoDespawnOnBlockEnd
     * @param objectId 音频对象 ID
     * @param sceneBlocks 当前场景的区块时间线
     * @param sceneEndTime 场景结束时间（默认返回值）
     * @param afterTime 只查找此时间之后的消亡事件（可选）
     */
    private findDespawnTime(
        objectId: string,
        sceneBlocks: { startTime: number; duration: number; actions: Action[]; slots: RuntimeSlot[] }[],
        sceneEndTime: number,
        afterTime = 0
    ): number {
        let earliestDespawn = sceneEndTime

        for (const blockInfo of sceneBlocks) {
            const blockEndTime = blockInfo.startTime + blockInfo.duration

            for (const action of blockInfo.actions) {
                // 显式 set_lifecycle spawned=false → 对象消亡
                if (
                    action.type === 'set_lifecycle' &&
                    action.target === objectId &&
                    action.params?.spawned === false
                ) {
                    const slot = blockInfo.slots?.[action.slotIndex]
                    const despawnTime = blockInfo.startTime + (slot?.startTime ?? 0)
                    if (despawnTime > afterTime && despawnTime < earliestDespawn) {
                        earliestDespawn = despawnTime
                    }
                }

                // autoDespawnOnBlockEnd：如果该 Block 中有 set_lifecycle spawned=true（出生）
                // 且 autoDespawnOnBlockEnd !== false 且同 Block 内无手动消亡，
                // 则对象在 Block 结束时消亡
                if (
                    action.type === 'set_lifecycle' &&
                    action.target === objectId &&
                    action.params?.spawned === true &&
                    action.params?.autoDespawnOnBlockEnd !== false
                ) {
                    // 检查同 Block 内是否已有手动消亡
                    const hasManualDespawn = blockInfo.actions.some(
                        a => a.type === 'set_lifecycle' &&
                            a.target === objectId &&
                            a.params?.spawned === false
                    )
                    if (!hasManualDespawn && blockEndTime > afterTime && blockEndTime < earliestDespawn) {
                        earliestDespawn = blockEndTime
                    }
                }
            }
        }

        return earliestDespawn
    }

    /**
     * 根据绝对时间获取场景索引和场景内时间
     */
    private getSceneAtTime(absoluteTime: number): { sceneIndex: number; timeInScene: number } {
        let accumulatedTime = 0

        for (let i = 0; i < this.sceneDurations.length; i++) {
            const sceneDuration = this.sceneDurations[i] ?? 0

            if (absoluteTime < accumulatedTime + sceneDuration) {
                // 找到对应的场景
                return {
                    sceneIndex: i,
                    timeInScene: absoluteTime - accumulatedTime
                }
            }

            accumulatedTime += sceneDuration
        }

        // 超出范围，返回最后一个场景
        const lastIndex = this.sceneDurations.length - 1
        return {
            sceneIndex: Math.max(0, lastIndex),
            timeInScene: 0
        }
    }
}

