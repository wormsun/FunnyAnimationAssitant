/**
 * 导出适配器 (v6.0)
 * 将 Episode 结构转换为导出所需的格式
 */

import type { Episode } from '@/stores/episodeStore'
import type { Action, ActorConfig, SceneContainer, ScriptBlock } from '@/types/screenplay'

export function getBlockDurationMs(block: ScriptBlock): number {
  if (block.type === 'dialogue' || block.type === 'narration') {
    return block.ttsConfig?.duration ?? 1000
  }

  if (block.type === 'action') {
    return block.duration || 0
  }

  return 1000
}

/**
 * 导出时遍历所有场景和脚本块的迭代器
 * 用于视频导出系统
 */
export function* iterateScenesForExport(episode: Episode) {
  for (const scene of episode.scenes) {
    // 重置场景状态（应用 scene.setup）
    yield {
      type: 'scene_setup' as const,
      sceneId: scene.id,
      sceneTitle: scene.title,
      setup: scene.setup
    }

    // 遍历场景中的所有脚本块
    for (const block of scene.script) {
      yield {
        type: 'script_block' as const,
        sceneId: scene.id,
        blockId: block.id,
        blockType: block.type,
        block: block
      }
    }
  }
}

/**
 * 计算导出总时长（秒）
 * 遍历所有场景和脚本块，累加 TTS 时长和动作时长
 */
export function calculateExportDuration(episode: Episode): number {
  let totalDuration = 0

  for (const scene of episode.scenes) {
    for (const block of scene.script) {
      totalDuration += getBlockDurationMs(block)
    }
  }

  return totalDuration
}

/**
 * 获取导出时需要的所有资源 ID
 */
export function getExportAssetIds(episode: Episode, _actors: ActorConfig[]): {
  backgrounds: string[]
  bgms: string[]
} {
  const backgrounds = new Set<string>()
  const bgms = new Set<string>()


  for (const scene of episode.scenes) {
    // 从 setup 中收集资源
    for (const obj of scene.setup.objects) {
      if (obj.type === 'background' && obj.refId) {
        // Unify to use refId for background as well (v6.0 standard)
        backgrounds.add(obj.refId)
      } else if (((obj.type as string) === 'bgm' || obj.type === 'audio') && obj.refId) {
        bgms.add(obj.refId)
      }
    }

    // v7.0: 从脚本块中收集资源（通过 instanceId 查找实例，获取其关联的角色）
    for (const block of scene.script) {
      if (block.type === 'dialogue') {
        // Character instance lookup removed — character type已删除
      }
    }
  }

  return {
    backgrounds: Array.from(backgrounds),
    bgms: Array.from(bgms),
  }
}

/**
 * 导出时的场景状态快照
 */
export interface ExportSceneSnapshot {
  sceneId: string
  sceneTitle: string
  setup: SceneContainer['setup']
  currentTime: number // 场景开始时间（秒）
}

/**
 * 导出时的脚本块执行信息
 */
export interface ExportBlockExecution {
  sceneId: string
  blockId: string
  blockType: ScriptBlock['type']
  startTime: number // 块开始时间（秒）
  duration: number // 块时长（秒）
  actions: Action[] // 块中的动作列表
}

/**
 * 生成导出时间线
 * 返回按时间顺序排列的场景快照和脚本块执行信息
 */
export function generateExportTimeline(episode: Episode): {
  snapshots: ExportSceneSnapshot[]
  executions: ExportBlockExecution[]
} {
  const snapshots: ExportSceneSnapshot[] = []
  const executions: ExportBlockExecution[] = []
  let currentTime = 0

  for (const scene of episode.scenes) {
    // 场景快照（在场景开始时）
    snapshots.push({
      sceneId: scene.id,
      sceneTitle: scene.title,
      setup: scene.setup,
      currentTime
    })

    // 遍历场景中的所有脚本块
    for (const block of scene.script) {
      const blockDuration = getBlockDurationMs(block)

      executions.push({
        sceneId: scene.id,
        blockId: block.id,
        blockType: block.type,
        startTime: currentTime,
        duration: blockDuration,
        actions: block.actions
      })

      currentTime += blockDuration
    }
  }

  return { snapshots, executions }
}

