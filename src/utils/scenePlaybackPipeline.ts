/**
 * 场景播放管线 — 共享预计算逻辑
 *
 * 将 ScenePlayer 和 FrameCapture 中重复的 prepareBlockPlayInfos 提取为统一入口。
 * 核心思想：
 * - 以 applyBlockActionsToState 为唯一状态推进引擎
 * - 每次迭代记录 Block 开始时的 RuntimeSceneSnapshot
 * - 输出 BlockPlayInfo[] 供三个消费者（编辑器 / ScenePlayer / FrameCapture）使用
 */

import type { Action, BlockPlayInfo, RuntimeSceneSnapshot, SceneContainer, ScriptBlock } from '@/types/screenplay'
import { applyBlockActionsToState } from '@/utils/sceneStateCalculator'
import { parseBlockToSlots } from '@/utils/slotUtils'

/**
 * Block 时长解析回调
 * 消费者可注入自定义逻辑（如 FrameCapture 从预渲染 TTS 获取时长）
 */
export interface BlockDurationResolver {
  /** 获取 Block 时长（ms）。返回 0 表示使用默认值。 */
  getDuration(block: ScriptBlock): number
  /** 获取 Block 的音频 URL（可选） */
  getAudioUrl?(block: ScriptBlock): string | undefined
}

/**
 * 默认的 Block 时长解析器
 * 从 ScriptBlock 的 ttsConfig.duration 或 action block 的 duration 字段读取
 */
export const defaultDurationResolver: BlockDurationResolver = {
  getDuration(block: ScriptBlock): number {
    if (block.type === 'action') {
      return block.duration || 0
    }
    return block.ttsConfig?.duration ?? 0
  },
}

/**
 * 构建 Block 播放信息列表
 *
 * @param initialSnapshot 场景初始 RuntimeSceneSnapshot
 * @param blocks 要处理的 Block 列表
 * @param scene 场景容器（用于查找演员配置，可选）
 * @param resolver 时长/音频解析器（默认从 ttsConfig 读取）
 * @param startTimeOffset 起始时间偏移量（ms），默认 0
 * @returns BlockPlayInfo[] — 每个 Block 的播放信息（含 startSnapshot）
 */
export function prepareBlockPlayInfos(
  initialSnapshot: RuntimeSceneSnapshot,
  blocks: ScriptBlock[],
  scene?: SceneContainer,
  resolver: BlockDurationResolver = defaultDurationResolver,
  startTimeOffset = 0,
): BlockPlayInfo[] {
  const result: BlockPlayInfo[] = []
  let accumulatedTime = startTimeOffset

  // 当前迭代状态
  let currentState: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(initialSnapshot)) as RuntimeSceneSnapshot

  for (const block of blocks) {
    // 1. 解析时长
    let duration = resolver.getDuration(block)
    if (duration <= 0) {
      duration = 1000 // 默认 1 秒
    }

    // 2. 解析音频
    const audioUrl = resolver.getAudioUrl?.(block)

    // 3. 解析槽位
    const slots = parseBlockToSlots(block)
    const blockActions: Action[] = block.actions || []

    // 4. 记录当前状态快照作为本 Block 的 startSnapshot
    const startSnapshot: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(currentState)) as RuntimeSceneSnapshot

    const startTime = accumulatedTime
    const endTime = accumulatedTime + duration

    result.push({
      startSnapshot,
      block,
      startTime,
      endTime,
      duration,
      slots,
      blockActions,
      ...(audioUrl ? { audioUrl } : {}),
    })

    // 5. 推进状态到本 Block 结束（使用 applyBlockActionsToState，包含 autoDespawn + renderChain 协调）
    currentState = applyBlockActionsToState(currentState, block, scene)

    accumulatedTime += duration
  }

  return result
}

/**
 * 从 BlockPlayInfo.startSnapshot 构建 Map<string, SceneObject>
 * 兼容层：供尚未迁移到 RuntimeSceneSnapshot 的消费者使用
 */
export function snapshotToObjectMap(snapshot: RuntimeSceneSnapshot): Map<string, import('@/types/sceneObject').SceneObject> {
  const map = new Map<string, import('@/types/sceneObject').SceneObject>()
  for (const obj of snapshot.objects) {
    map.set(obj.id, obj)
  }
  return map
}
