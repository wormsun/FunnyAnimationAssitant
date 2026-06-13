/**
 * TTS 预处理共享工具函数
 *
 * 统一了 ActionPreviewDialog / ScenePreviewDialog / ScriptPreviewDialog 三处
 * 重复的 TTS 逻辑，使所有消费方（包括视频导出）共享同一管线。
 *
 * 核心设计原则：
 * - 纯函数，不依赖任何 Store（通过 TTSContext 参数传入数据）
 * - 统一使用 scene.setup.objects 作为数据源（actorId 是 setup 级属性）
 * - 单 Block 粒度处理，调用方控制循环
 */

import { DEFAULT_VOLUME, FALLBACK_VOICE_ID, getValidSpeedValue, getValidVolumeValue, getVoiceEngine } from '@/constants/voiceOptions'
import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import type { SceneObject } from '@/types/sceneObject'
import type { ActorConfig, NarratorConfig, SceneContainer, ScriptBlock, TTSConfig } from '@/types/screenplay'

import { ttsClient } from './ttsClient'
import { decodeBase64AudioToAudioBuffer } from './ttsTiming'

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** TTS 处理上下文（纯数据，无 Store 依赖） */
export interface TTSContext {
    sceneObjects: SceneObject[]       // 场景的 setup.objects（用于查找角色 → actor）
    actors: ActorConfig[]             // 项目演员列表
    narrator: NarratorConfig | null   // 旁白配置
    episodeId: string
    sceneId: string
    onProgress?: ((msg: string) => void) | undefined // 进度回调
}

/** ensureBlockTTS 返回值：null 表示该 block 不需要 TTS（如 action block） */
export interface TTSResult {
    ttsConfig: TTSConfig
    regenerated: boolean
}

// ─────────────────────────────────────────────────────────────
// 纯函数：音色 / 语速解析
// ─────────────────────────────────────────────────────────────

/**
 * 在 actors 列表中查找与指定 sceneObject 关联的 actor。
 * 优先通过 extraInfo (v20) 精确匹配，回退到 refId 兼容旧数据。
 */
function findActorForInstance(
    instance: SceneObject,
    actors: ActorConfig[]
): ActorConfig | undefined {
    // v20: 通过 extraInfo 精确匹配（最优先）
    const info = instance.extraInfo
    if (info?.kind === 'actor') {
        const actor = actors.find(a => a.id === info.actorId)
        if (actor) return actor
    }

    // 通过 refId 匹配 characterId（兼容旧数据）
    if (instance.refId) {
        return actors.find(a => a.characterId === instance.refId)
    }

    return undefined
}

/**
 * 解析 Block 对应的 VoiceId（纯函数，无 Store 依赖）
 */
export function resolveVoiceId(
    block: ScriptBlock,
    sceneObjects: SceneObject[],
    actors: ActorConfig[],
    narrator: NarratorConfig | null
): number {
    if (block.type === 'dialogue') {
        const instance = sceneObjects.find(o => o.id === block.instanceId)
        if (instance) {
            const actor = findActorForInstance(instance, actors)
            if (actor?.voice?.voiceId) {
                return parseInt(String(actor.voice.voiceId))
            }
        }
        return FALLBACK_VOICE_ID
    }

    if (block.type === 'narration') {
        return narrator?.voice?.voiceId
            ? parseInt(String(narrator.voice.voiceId))
            : FALLBACK_VOICE_ID
    }

    return FALLBACK_VOICE_ID
}

/**
 * 解析 Block 对应的语速（纯函数，无 Store 依赖）
 */
export function resolveVoiceSpeed(
    block: ScriptBlock,
    sceneObjects: SceneObject[],
    actors: ActorConfig[],
    narrator: NarratorConfig | null
): number {
    if (block.type === 'dialogue') {
        const instance = sceneObjects.find(o => o.id === block.instanceId)
        if (instance) {
            const actor = findActorForInstance(instance, actors)
            if (actor?.voice?.speed !== undefined) {
                return getValidSpeedValue(actor.voice.speed)
            }
        }
        return 0
    }

    if (block.type === 'narration') {
        if (narrator?.voice?.speed !== undefined) {
            return getValidSpeedValue(narrator.voice.speed)
        }
        return 0
    }

    return 0
}

/**
 * 解析 Block 对应的音量（纯函数，无 Store 依赖）
 */
export function resolveVoiceVolume(
    block: ScriptBlock,
    sceneObjects: SceneObject[],
    actors: ActorConfig[],
    narrator: NarratorConfig | null
): number {
    if (block.type === 'dialogue') {
        const instance = sceneObjects.find(o => o.id === block.instanceId)
        if (instance) {
            const actor = findActorForInstance(instance, actors)
            if (actor?.voice?.volume !== undefined) {
                return getValidVolumeValue(actor.voice.volume)
            }
        }
        return 0
    }

    if (block.type === 'narration') {
        if (narrator?.voice?.volume !== undefined) {
            return getValidVolumeValue(narrator.voice.volume)
        }
        return 0
    }

    return 0
}

// ─────────────────────────────────────────────────────────────
// 核心管线：单 Block TTS 确保
// ─────────────────────────────────────────────────────────────

/**
 * 检查单个 Block 是否需要重新生成 TTS。
 * 返回 true 表示需要重新生成。
 */
async function checkNeedRegenerate(
    originalBlock: ScriptBlock,
    voiceId: number,
    speed: number,
    checkAudioExists: (audioPath: string) => Promise<boolean>
): Promise<boolean> {
    if (originalBlock.type !== 'dialogue' && originalBlock.type !== 'narration') {
        return false
    }

    const existingConfig = originalBlock.ttsConfig

    // 1. 无 audioPath  或 blob:/data: 脏数据
    if (
        !existingConfig?.audioPath ||
        existingConfig.audioPath.startsWith('blob:') ||
        existingConfig.audioPath.startsWith('data:')
    ) {
        return true
    }

    // 2. 磁盘文件不存在
    const audioFileExists = await checkAudioExists(existingConfig.audioPath)
    if (!audioFileExists) {
        return true
    }

    // 3. 无时长
    if (!existingConfig.duration) {
        return true
    }

    // 4. 内容变更检测
    if (existingConfig.generatedFrom) {
        const gen = existingConfig.generatedFrom
        const currentText = originalBlock.text
        if (
            gen.text !== currentText ||
            String(gen.voiceId) !== String(voiceId) ||
            gen.speed !== speed 
        ) {
            return true
        }

        // 对话 Block 检查 instanceId 变更
        if (originalBlock.type === 'dialogue' && gen.instanceId !== originalBlock.instanceId) {
            return true
        }
    } else {
        // 旧数据无 generatedFrom：强制重新生成
        return true
    }

    return false
}

/**
 * 确保单个 Block 的 TTS 已生成。
 *
 * @param originalBlock  原始 Store 中的 Block（用于读取/对比 ttsConfig）
 * @param copyBlock      副本中的 Block（用于更新副本数据）
 * @param ctx            TTS 上下文
 *
 * @returns TTSResult 或 null（action block 或空文本不需要 TTS）
 * @throws  如果 TTS 合成失败，会向上抛出错误
 */
export async function ensureBlockTTS(
    originalBlock: ScriptBlock,
    copyBlock: ScriptBlock,
    ctx: TTSContext
): Promise<TTSResult | null> {
    // 只处理 dialogue 和 narration
    if (originalBlock.type !== 'dialogue' && originalBlock.type !== 'narration') {
        return null
    }
    if (copyBlock.type !== 'dialogue' && copyBlock.type !== 'narration') {
        return null
    }

    const projectStore = useProjectStore()
    const episodeStore = useEpisodeStore()

    const voiceId = resolveVoiceId(originalBlock, ctx.sceneObjects, ctx.actors, ctx.narrator)
    const speed = resolveVoiceSpeed(originalBlock, ctx.sceneObjects, ctx.actors, ctx.narrator)

    const needRegenerate = await checkNeedRegenerate(
        originalBlock,
        voiceId,
        speed,
        (audioPath) => projectStore.checkTTSAudioExists(audioPath)
    )

    if (needRegenerate) {
        const text = originalBlock.text
        if (!text || text.trim().length === 0) {
            throw new Error('文本内容为空')
        }

        ctx.onProgress?.(`正在生成语音: ${text.substring(0, 10)}...`)

        const result = await ttsClient.synthesize({
            text,
            engine: getVoiceEngine(voiceId),
            voiceType: voiceId,
            volume: DEFAULT_VOLUME,
            speed,
        })

        let actualDuration = result.duration
        if (!actualDuration || actualDuration <= 0) {
            actualDuration = await ttsClient.estimateDuration(text, speed)
        }

        if (!result.audioBase64) {
            throw new Error('TTS生成结果缺少Base64数据，无法保存')
        }

        const cacheKey = `${text}_${voiceId}_${speed}`
        const audioPath = await projectStore.saveTTSAudio(result.audioBase64, cacheKey)
        await ensureTimingSidecar(audioPath, result.audioBase64, projectStore.ensureTTSTiming)

        const generatedFrom: NonNullable<TTSConfig['generatedFrom']> = {
            text,
            voiceId,
            speed
        }
        if (originalBlock.type === 'dialogue') {
            generatedFrom.instanceId = originalBlock.instanceId
        }

        const ttsConfig: TTSConfig = {
            audioPath,
            duration: actualDuration,
            voiceId,
            generatedFrom
        }

        // 更新原始 Store（持久化）
        episodeStore.updateBlockInScene(ctx.episodeId, ctx.sceneId, originalBlock.id, { ttsConfig })

        // 同步更新副本
        copyBlock.ttsConfig = JSON.parse(JSON.stringify(ttsConfig)) as TTSConfig

        return { ttsConfig, regenerated: true }
    }

    // 不需要重新生成：确保副本也有 Config
    const existingConfig = originalBlock.ttsConfig
    if (existingConfig) {
        copyBlock.ttsConfig = JSON.parse(JSON.stringify(existingConfig)) as TTSConfig
    }

    return existingConfig
        ? { ttsConfig: existingConfig, regenerated: false }
        : null
}

async function ensureTimingSidecar(
    audioPath: string,
    audioBase64: string,
    ensureTTSTiming: (audioPath: string, audioBuffer: AudioBuffer) => Promise<string>
): Promise<void> {
    const audioBuffer = await decodeBase64AudioToAudioBuffer(audioBase64)
    if (!audioBuffer) return

    try {
        await ensureTTSTiming(audioPath, audioBuffer)
    } catch (error) {
        console.warn('[TTS] timing sidecar 生成失败，继续使用音频:', error)
    }
}

/**
 * 确保整个场景的所有 Block 都已完成 TTS。
 *
 * @param originalScene 原始 Store 中的场景
 * @param copyScene     副本中的场景
 * @param ctx           TTS 上下文（sceneId 从 ctx 获取）
 */
export async function ensureSceneTTS(
    originalScene: SceneContainer,
    copyScene: SceneContainer,
    ctx: Omit<TTSContext, 'sceneId'>
): Promise<void> {
    const sceneCtx: TTSContext = {
        ...ctx,
        sceneId: originalScene.id
    }

    ctx.onProgress?.('正在检查语音资源...')

    for (let i = 0; i < originalScene.script.length; i++) {
        const originalBlock = originalScene.script[i]
        const copyBlock = copyScene.script[i]
        if (!originalBlock || !copyBlock) continue

        await ensureBlockTTS(originalBlock, copyBlock, sceneCtx)
    }
}

/**
 * 确保整个 Episode 的所有场景都已完成 TTS（用于视频导出）。
 *
 * @param episode     原始 Episode（原始 Store 数据）
 * @param episodeCopy 副本 Episode
 * @param ctx         简化上下文
 */
export async function ensureEpisodeTTS(
    episode: { id: string; scenes: SceneContainer[] },
    episodeCopy: { scenes: SceneContainer[] },
    ctx: {
        actors: ActorConfig[]
        narrator: NarratorConfig | null
        onProgress?: (msg: string) => void
    }
): Promise<void> {
    for (let i = 0; i < episode.scenes.length; i++) {
        const originalScene = episode.scenes[i]
        const copyScene = episodeCopy.scenes[i]
        if (!originalScene || !copyScene) continue

        ctx.onProgress?.(`正在处理场景 ${i + 1}/${episode.scenes.length}: ${originalScene.title || '未命名'}`)

        await ensureSceneTTS(originalScene, copyScene, {
            sceneObjects: originalScene.setup.objects,
            actors: ctx.actors,
            narrator: ctx.narrator,
            episodeId: episode.id,
            onProgress: ctx.onProgress
        })
    }
}
