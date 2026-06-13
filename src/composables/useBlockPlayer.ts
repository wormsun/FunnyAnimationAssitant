/**
 * Block播放器 Composable
 * 统一封装TTS生成、播放控制、时间轴更新等逻辑
 * 
 * 使用场景：
 * 1. SceneEditMode.vue - Action模式预览
 * 2. 剧本编辑页面 - Block预览
 * 3. 全剧预览/导出 - 连续播放多个Block
 */

import { computed, ref } from 'vue'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { getPlaybackVolumeGain } from '@/constants/voiceOptions'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import type { ScriptBlock } from '@/types/screenplay'

// Block类型联合
export type PlayableBlock = ScriptBlock

// 播放状态
export interface PlaybackState {
  isPlaying: boolean
  isPaused: boolean
  currentTime: number      // 当前播放时间（毫秒）
  duration: number         // 总时长（毫秒）
  progress: number         // 播放进度 0-1
  error: string | null     // 错误信息
}

// 播放器配置
export interface BlockPlayerOptions {
  episodeId: string
  sceneId: string
  blockId: string
  onTimeUpdate?: (time: number) => void  // 时间更新回调
  onPlayEnd?: () => void                  // 播放结束回调
}

import { type AudioInstance, audioKit } from '@/utils/WebAudioKit'

/**
 * Block播放器 Composable
 * 仅负责播放控制，不负责资源生成
 */
export function useBlockPlayer(options: BlockPlayerOptions) {
  // 播放状态
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const currentTime = ref(0)
  const error = ref<string | null>(null)

  // 内部状态
  let animationFrame: number | null = null
  let playStartTime = 0
  let playStartOffset = 0
  let audioInstance: AudioInstance | null = null

  const projectStore = useProjectStore()

  function getBlockPlaybackVolume(block: ScriptBlock): number {
    if (block.type === 'dialogue') {
      const episode = useEpisodeStore().getEpisode(options.episodeId)
      const scene = episode?.scenes.find((s) => s.id === options.sceneId)
      const instance = scene?.setup.objects.find((o) => o.id === block.instanceId)
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

  // 获取当前Block
  const currentBlock = computed((): PlayableBlock | null => {
    const episodeStore = useEpisodeStore()
    const episode = episodeStore.getEpisode(options.episodeId)
    if (!episode) return null

    const scene = episode.scenes.find((s) => s.id === options.sceneId)
    if (!scene) return null

    return scene.script.find((b) => b.id === options.blockId) ?? null
  })

  // 获取Block时长
  const duration = computed((): number => {
    const block = currentBlock.value
    if (!block) return 0

    // 优先使用 action 类型的 duration
    if (block.type === 'action') {
      return block.duration || 0
    }

    // 对话/旁白使用 TTS duration
    return block.ttsConfig?.duration ?? 0
  })

  // 播放进度
  const progress = computed((): number => {
    if (duration.value <= 0) return 0
    return Math.min(currentTime.value / duration.value, 1)
  })

  // 聚合状态
  const state = computed((): PlaybackState => ({
    isPlaying: isPlaying.value,
    isPaused: isPaused.value,
    currentTime: currentTime.value,
    duration: duration.value,
    progress: progress.value,
    error: error.value
  }))

  /**
   * 开始播放
   * @param audioUrl 可选的音频地址（如果不传则尝试从 block.ttsConfig.audioPath 加载）
   */
  async function play(audioUrl?: string): Promise<void> {
    // 如果已经在播放，忽略
    if (isPlaying.value) return

    error.value = null

    // 检查时长
    if (duration.value <= 0) {
      error.value = 'Block时长为0，无法播放'
      return
    }

    // 如果已经播放到结尾，重置到开头
    if (currentTime.value >= duration.value) {
      currentTime.value = 0
    }

    // 如果是暂停状态，继续播放
    if (isPaused.value) {
      isPaused.value = false
    }

    isPlaying.value = true
    playStartTime = performance.now()
    playStartOffset = currentTime.value

    // 播放音频（如果有）
    const block = currentBlock.value
    if (block && (block.type === 'dialogue' || block.type === 'narration')) {
      // v12.8: 优先使用传入的 URL，否则通过 audioPath 懒加载
      let finalAudioUrl = audioUrl
      if (!finalAudioUrl && block.ttsConfig?.audioPath) {
        const { loadAudioUrl, getAudioUrl } = useAssetAudio()
        await loadAudioUrl(block.ttsConfig.audioPath)
        finalAudioUrl = getAudioUrl(block.ttsConfig.audioPath) || undefined
      }

      if (finalAudioUrl) {
        try {
          // 确保 AudioContext 已初始化
          await audioKit.init()

          // 加载音频 (如果是 Blob URL，load 会很快)
          await audioKit.load(finalAudioUrl)

          // 计算播放偏移 (currentTime是毫秒，audioKit需要秒)
          const startOffset = Math.max(0, currentTime.value / 1000)

          // 播放
          audioInstance = await audioKit.play(finalAudioUrl, {
            volume: getBlockPlaybackVolume(block),
            loop: false,
            startOffset: startOffset
          })

        } catch (err) {
          console.error('[BlockPlayer] 音频播放失败:', err)
          audioInstance = null
        }
      }
    }

    // 启动动画循环
    startPlaybackLoop()
  }

  /**
   * 暂停播放
   */
  function pause(): void {
    if (!isPlaying.value) return

    isPlaying.value = false
    isPaused.value = true

    // 停止动画循环
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }

    // 暂停音频
    if (audioInstance) {
      audioInstance.stop()
      audioInstance = null
    }

    // 记录暂停位置
    playStartOffset = currentTime.value
  }

  /**
   * 停止播放（重置到开头）
   */
  function stop(): void {
    isPlaying.value = false
    isPaused.value = false
    currentTime.value = 0

    // 停止动画循环
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }

    // 停止音频
    if (audioInstance) {
      audioInstance.stop()
      audioInstance = null
    }

    playStartOffset = 0
  }

  /**
   * 跳转到指定时间
   */
  function seek(time: number): void {
    currentTime.value = Math.max(0, Math.min(time, duration.value))

    // 如果正在播放，更新起始时间
    if (isPlaying.value) {
      playStartTime = performance.now()
      playStartOffset = currentTime.value

      // 同步音频 (AudioKit 不支持 seek instance，必须 stop 后重新 play)
      // 但由于 useBlockPlayer 的 play 逻辑是 based on currentTime 的，
      // 所以我们这里只需要停止当前音频，play() 会在下一次调用时（如果是 toggle）或者
      // 我们在 seek 中不应该自动 play，除非 isPlaying 是 true。
      // 但由于 AudioKit play 也是 async 的，且这里是 seek。
      // 最好的做法是：Stop 当前音频 -> 如果 isPlaying，重新调用 play()

      if (audioInstance) {
        audioInstance.stop()
        audioInstance = null
      }

      // 如果需要继续播放，则重新触发 play
      // 注意：play 是 async 的，这里直接调用可能会有竞态，但作为简单的播放器实现尚可接受
      void play() // 这里 play 会检查 isPlaying 状态吗？ play 函数开头检查了 flag，所以我们不能直接调 play 因为它会 return

      // 需要手动触发音频部分的重播逻辑。
      // 为了简单，我们只停止音频。用户 seek 后界面通常会暂停或继续。
      // 如果 isPlaying 保持 true，我们需要重播音频。

      // 重置 playStartTime 以匹配新的 offset
      playStartTime = performance.now()
      playStartOffset = currentTime.value

      // v12.8: Re-trigger audio if playing (使用 audioPath 懒加载)
      const block = currentBlock.value
      if (block && (block.type === 'dialogue' || block.type === 'narration') && block.ttsConfig?.audioPath) {
        const { loadAudioUrl, getAudioUrl } = useAssetAudio()
        const audioPath = block.ttsConfig.audioPath
        void loadAudioUrl(audioPath).then(() => {
          const finalAudioUrl = getAudioUrl(audioPath)
          if (finalAudioUrl) {
            void audioKit.play(finalAudioUrl, {
              volume: getBlockPlaybackVolume(block),
              loop: false,
              startOffset: currentTime.value / 1000
            }).then(inst => audioInstance = inst)
          }
        })
      }
    }

    // 触发时间更新回调
    options.onTimeUpdate?.(currentTime.value)
  }

  /**
   * 播放/暂停切换
   */
  async function toggle(): Promise<void> {
    if (isPlaying.value) {
      pause()
    } else {
      await play()
    }
  }

  /**
   * 播放动画循环
   */
  function startPlaybackLoop(): void {
    function loop() {
      if (!isPlaying.value) return

      const elapsed = performance.now() - playStartTime
      const newTime = playStartOffset + elapsed

      // 添加500ms的缓冲时间，避免突然中断
      const bufferTime = 500
      const effectiveDuration = duration.value + bufferTime

      if (newTime >= effectiveDuration) {
        // 播放结束
        currentTime.value = duration.value
        isPlaying.value = false
        isPaused.value = false

        // 触发回调
        options.onTimeUpdate?.(duration.value)
        options.onPlayEnd?.()

        // 停止音频
        if (audioInstance) {
          audioInstance.stop()
          audioInstance = null
        }
      } else {
        currentTime.value = newTime
        options.onTimeUpdate?.(newTime)
        animationFrame = requestAnimationFrame(loop)
      }
    }

    animationFrame = requestAnimationFrame(loop)
  }

  /**
   * 销毁播放器
   */
  function destroy(): void {
    stop()

    if (audioInstance) {
      audioInstance.stop()
      audioInstance = null
    }
  }

  return {
    // 状态
    state,
    isPlaying,
    isPaused,
    currentTime,
    duration,
    progress,
    error,
    currentBlock,

    // 方法
    play,
    pause,
    stop,
    seek,
    toggle,
    destroy
  }
}
