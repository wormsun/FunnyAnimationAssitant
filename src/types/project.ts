/**
 * 沙雕动画小助手 Project JSON Schema
 * 基于 PRD v2.4
 */

import type { AnimationDefinition } from './animation'
import type { CompositeCharacter } from './compositeCharacter'
import type { PresetAnimationTemplate } from './presetAnimation'
import type { SceneTemplate } from './sceneTemplate'
import type { ActorConfig, NarratorConfig } from './screenplay'

// ===== 元信息 =====
export interface ProjectMeta {
  name: string
  resolution: { w: number; h: number }
  fps: number
  version: string
}

// ===== 演员定义 =====
// 使用 screenplay.ts 中的 ActorConfig 和 NarratorConfig


// ===== 资源定义 =====

/**
 * 性别
 */
export type Gender = 'male' | 'female' | 'other'

// ===== 表情系统 (Independent Expression System) =====

/**
 * 表情帧定义
 * 每一帧包含图片URL和可选的原始文件对象
 */
export interface ExpressionFrame {
  id: string                // UUID
  url: string               // 图片地址：路径（如 "assets/expressions/expr_123/default.png"）- 持久化存储
  _runtimeUrl?: string      // [非持久化] 运行时 Blob URL，用于前端显示
  file?: File              // 原始文件对象 (仅前端上传时存在)
}

/**
 * 锚点坐标 (相对比例)
 */
export interface AnchorPoint {
  x: number                // 0.0 - 1.0 (默认 0.5)
  y: number                // 0.0 - 1.0 (默认 0.5)
}

/**
 * 表情资产定义（多图表情动画系统）
 * 支持单张图片（静态表情）或多张图片（动画表情）
 */
export interface Expression {
  id: string                // 表情唯一ID
  name: string              // 表情名称，如 "开心"
  tags: string[]            // 标签分类
  gender?: Gender           // 性别 (v8.0 新增)


  // 核心资源
  defaultFrame: ExpressionFrame      // 默认状态（必填）：不说话时的静止图
  speakingFrames: ExpressionFrame[]  // 说话状态（可选）：说话时的动画序列

  // 核心配置
  anchor: AnchorPoint       // 锚点坐标，用于对齐面部中心
  speakingFps: number       // 帧率，默认 30
  speakingLoop: boolean     // 是否循环，默认 true

  // 显示变换属性（封装处理，外部通过 expressionStore 方法访问）
  flipHorizontal: boolean   // 水平翻转，默认 false
  blendMode?: 'normal' | 'multiply'  // 混合模式，默认 'normal'，'multiply' 用于白背景表情
  lockEdit?: boolean        // 是否锁定编辑（禁止修改尺寸/缩放），默认 false
  defaultScale?: number     // 默认缩放比例 (0.1-5.0)，始终生效

  // v6.5: 静止帧来源标识（仅当 speakingFrames.length > 0 时有意义）
  // 'frame' = defaultFrame 使用 speakingFrames 中的某一帧，修改序列帧时同步更新
  // 'custom' = defaultFrame 是用户单独上传的图片，修改序列帧时不变
  stillFrameSource?: 'frame' | 'custom'
  stillFrameIndex?: number   // 当 stillFrameSource='frame' 时，记录使用的 speakingFrames 索引

  // 元数据
  createdAt: number         // 创建时间戳 (用于排序)
}

/**
 * 表情显示变换参数（封装后的结果）
 */
export interface ExpressionDisplayTransform {
  scale: number             // 有效缩放比例
  flipX: boolean            // 是否需要水平翻转
}

export interface PropAsset {
  id: string
  url?: string
  name?: string
  type: 'static' | 'animation'
  createdAt?: number
  tags?: string[]
  frames?: { url: string;[key: string]: unknown }[]
  fps?: number
  loop?: boolean
  _runtimeUrl?: string
  _runtimeStillUrl?: string
  stillFrameCustomUrl?: string
  stillFrameSource?: 'frame' | 'custom'
  stillFrameIndex?: number
  backgroundImage?: string // compat
  // v11.0: Animation 预设库
  animations?: Record<string, AnimationDefinition>
  [key: string]: unknown
}

export interface SoundAsset {
  id: string
  url: string
  name: string
  type: 'bgm' | 'sfx'
  tags?: string[]
  duration?: number
  volume?: number
  loop?: boolean
  fadeIn?: number
  fadeOut?: number
  createdAt?: number
  _runtimeUrl?: string
  [key: string]: unknown
}

export interface Background {
  id: string
  name: string
  type: 'static' | 'animation'
  url?: string
  tags?: string[]
  createdAt?: number
  fps?: number
  loop?: boolean
  frames?: { url: string; _runtimeUrl?: string;[key: string]: unknown }[]
  _runtimeUrl?: string
  _runtimeStillUrl?: string
  stillFrameCustomUrl?: string
  stillFrameSource?: 'frame' | 'custom'
  stillFrameIndex?: number
  backgroundImage?: string // compat
  // v11.0: Animation 预设库
  animations?: Record<string, AnimationDefinition>
  [key: string]: unknown
}

export interface Scene {
  id: string
  name: string
  duration?: number
  actors: ActorConfig[]
  script: TimelineNode[]

  [key: string]: unknown
}

export interface TimelineNode {
  id: string
  start: number
  duration: number
  [key: string]: unknown
}

export interface Assets {
  backgrounds: Background[]
  props: PropAsset[]
  musics: SoundAsset[]
  sounds: SoundAsset[]
  [key: string]: unknown
}

export interface ProjectData {
  meta: ProjectMeta
  assets?: {
    backgrounds?: Background[]
    props?: PropAsset[]
    sounds?: SoundAsset[]
    [key: string]: unknown
  }
  backgrounds?: Record<string, unknown> // 兼容旧版
  expressions?: Record<string, Expression>
  episodes?: unknown[]
  actors?: ActorConfig[]
  narrator?: NarratorConfig
  sceneTemplates?: SceneTemplate[]
  compositeCharacters?: CompositeCharacter[]
  /** v20: 用户自定义预定义动作模板（项目级） */
  customPresetAnimations?: PresetAnimationTemplate[]
  [key: string]: unknown
}
