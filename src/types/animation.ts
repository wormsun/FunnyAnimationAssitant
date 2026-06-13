/**
 * Animation System Types (v11.0)
 * 沙雕动画小助手 可复用动画系统类型定义
 */

// ===== 基础类型 =====

/**
 * 轨道类型枚举
 */
export type AnimationTrackType = 'frame_sequence' | 'transform' | 'visibility' | 'effect'

/**
 * 缓动函数类型
 */
export type EasingType =
    | 'linear'
    | 'step'  // v11.1: 阶跃函数，无插值，保持前一帧的值直到下一帧
    | 'easeIn' | 'easeOut' | 'easeInOut'
    | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
    | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
    | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
    | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
    | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce'

/**
 * 动态特效类型 (Phase 1: 5 种)
 */
export type DynamicEffectType = 'wave' | 'ribbon' | 'breathe' | 'float' | 'glow' | 'motion_blur' | 'jelly' | 'squash' | 'shake' | 'petrify' | 'shatter'

/**
 * 初始动画配置项 (v11.x)
 * 用于 Setup 模式配置场景对象的初始播放动画
 */
export interface InitialAnimationItem {
    name: string      // 动画名称（资源级或场景级 Animation 的 name）
    loop: boolean     // 是否循环播放
}

// ===== 关键帧类型 =====

/**
 * 变换关键帧
 * 所有属性均为相对于基准的增量
 *
 * v13 (Scheme B) 分裂关键帧：
 * - 顶层字段 (x/y/...) 代表 valueIn —— 从左段进入本关键帧时看到的值（段的结束值）
 * - 可选 `out` 覆写 valueOut —— 从本关键帧继续到右段时使用的起始值
 * - 未设置 `out` 时 valueIn===valueOut（连续关键帧，完全等同旧数据）
 * - `out` 仅需声明差异字段：未覆写的字段继承顶层（fall-through）
 */
export interface TransformKeyframe {
    time: number              // 归一化时间 (0-1)
    x?: number                // X 偏移量 (像素)
    y?: number                // Y 偏移量 (像素)
    scaleX?: number           // X 缩放乘数 (1.0 = 无变化)
    scaleY?: number           // Y 缩放乘数
    rotation?: number         // 旋转角度 (弧度)
    flipX?: boolean           // v11.1: 水平翻转 (离散状态，不插值)
    /** v13: 可选 valueOut 覆写；存在任一字段即视为本关键帧在时间轴上产生跳变 */
    out?: {
        x?: number
        y?: number
        scaleX?: number
        scaleY?: number
        rotation?: number
        flipX?: boolean
    }
}

/**
 * 可见性关键帧
 * v13 (Scheme B) 分裂：顶层=valueIn，`out`=valueOut 覆写
 */
export interface VisibilityKeyframe {
    time: number              // 归一化时间 (0-1)
    alpha?: number            // 透明度 (0-1)
    /** v13: 可选 valueOut 覆写 */
    out?: {
        alpha?: number
    }
}

// ===== 轨道目标常量 =====

/**
 * 轨道目标对象 ID 的“自身”哨兵值
 * 当 targetObjectId === TARGET_SELF 时，变换应用到动画所属对象自身
 */
export const TARGET_SELF = '_self' as const

// ===== 轨道类型 =====

/**
 * 帧序列轨道
 * 支持两种模式：
 * 1. 引用模式：通过 assetId 引用旧资源模型中的动画素材
 * 2. 直接定义模式：通过 frames 直接定义帧序列
 */
export interface FrameSequenceTrack {
    trackType: 'frame_sequence'
    displayName?: string     // 轨道显示名（仅用于编辑器展示，不改变目标对象名称）
    targetObjectId?: string   // 目标对象 ID（'_self' = 自身，或后代对象 ID）

    assetId?: string          // 引用帧动画素材 ID
    // === 通用设置（可覆盖素材默认值）===
    fps?: number              // 帧率，不填则使用素材定义或默认 25
    loop?: boolean            // 是否循环，不填则使用素材定义或默认 true
    // 时长由 frames.length / fps 或 frameCount / fps 自动计算
}

/**
 * 变换轨道
 * 使用 keyframes 定义关键帧（至少 2 帧）
 */
export interface TransformTrack {
    trackType: 'transform'
    displayName?: string     // 轨道显示名（仅用于编辑器展示，不改变目标对象名称）
    targetObjectId?: string   // 目标对象 ID（'_self' = 自身，或后代对象 ID）
    duration?: number | 'auto' // 动画时长 (ms)，默认 1000；'auto' = 运行时自动确定
    easing?: EasingType       // 缓动函数，默认 'linear'
    keyframes: TransformKeyframe[]  // 关键帧列表（至少 2 帧）

    // 旋转/缩放变换点（可选，对象本地坐标系的像素值，与 PIXI container.pivot 同坐标系）
    // 未设置时表示不覆盖对象默认 pivot（即维持当前 container.pivot 不变，无位置补偿）。
    pivot?: {
        x: number   // 对象本地坐标 X（像素）
        y: number   // 对象本地坐标 Y（像素）
    }
}

/**
 * 可见性轨道
 * 使用 keyframes 定义关键帧
 */
export interface VisibilityTrack {
    trackType: 'visibility'
    displayName?: string     // 轨道显示名（仅用于编辑器展示，不改变目标对象名称）
    targetObjectId?: string   // 目标对象 ID（'_self' = 自身，或后代对象 ID）
    duration?: number | 'auto' // 动画时长 (ms)，默认 1000；'auto' = 运行时自动确定
    easing?: EasingType
    keyframes: VisibilityKeyframe[]
}

// ===== 特效参数类型 =====

/**
 * Wave 特效参数 (波浪飘动)
 */
export interface WaveEffectParams {
    type: 'wave'
    speed?: number            // 波浪速度，默认 1.0
    amplitude?: number        // 波浪幅度，默认 10
    frequency?: number        // 波浪频率，默认 0.5
    direction?: 'horizontal' | 'vertical' | 'both'  // 波浪方向，默认 'horizontal'
}

/**
 * Ribbon 特效参数 (飘带)
 */
export interface RibbonEffectParams {
    type: 'ribbon'
    speed?: number            // 速度 (默认 1.0)
    amplitude?: number        // 最大振幅 (默认 10)
    frequency?: number        // 频率 (默认 0.5)
    direction?: 'horizontal' | 'vertical' | 'both'
    segments?: number         // 网格分段 (默认 10)
    damping?: number          // 衰减指数 (默认 1.5)
    phaseScale?: number       // 相位累积 (默认 0.5)
}

/**
 * Breathe 特效参数 (呼吸起伏)
 */
export interface BreatheEffectParams {
    type: 'breathe'
    intensity?: number        // 呼吸强度 (缩放幅度)，默认 0.02
    speed?: number            // 呼吸速度，默认 1.0
}

/**
 * Float 特效参数 (漂浮悬浮)
 */
export interface FloatEffectParams {
    type: 'float'
    amplitude?: number        // 漂浮幅度 (像素)，默认 5
    speed?: number            // 漂浮速度，默认 1.0
}

/**
 * Glow 特效参数 (发光轮廓)
 */
export interface GlowEffectParams {
    type: 'glow'
    color?: string            // 发光颜色，默认 '#ffffff'
    intensity?: number        // 发光强度，默认 1.0
    size?: number             // 发光大小 (像素)，默认 4
}

/**
 * MotionBlur 特效参数 (运动模糊)
 */
export interface MotionBlurEffectParams {
    type: 'motion_blur'
    velocity?: number         // 模糊速度，默认 20
    angle?: number            // 模糊角度 (度数)，默认 0 (水平)
    kernelSize?: number       // 核大小，默认 5
}

/**
 * Jelly 特效参数 (果冻抖动)
 * v11.70: 新增 duration 属性支持自定义衰减时长
 */
export interface JellyEffectParams {
    type: 'jelly'
    stiffness?: number        // 刚度，默认 8
    damping?: number          // 阻尼，默认 0.3
    intensity?: number        // 强度，默认 0.3
    duration?: number         // 特效时长 (ms)，默认 1000
}

/**
 * Squash 特效参数 (挤压拉伸)
 * v11.70: 新增 duration 属性支持自定义特效时长
 */
export interface SquashEffectParams {
    type: 'squash'
    intensity?: number        // 强度，默认 0.2
    speed?: number            // 速度，默认 2
    duration?: number         // 特效时长 (ms)，默认 1000
}

/**
 * Shake 特效参数 (震动/点头)
 */
export interface ShakeEffectParams {
    type: 'shake'
    speed?: number            // 震动速度，默认 5
    range?: number            // 震动幅度 (角度或像素)，默认 10
    axis?: 'x' | 'y' | 'rotation'  // 震动轴向，默认 rotation
}

/**
 * Petrify 特效参数 (石化)
 */
export interface PetrifyEffectParams {
    type: 'petrify'
    duration?: number         // 石化过程时长 (ms)，默认 1000
    intensity?: number        // 最终硬化程度 (0-1)，默认 1.0
    grayScale?: boolean       // (Legacy) 是否去色，默认 true
    seed?: number             // (New) 随机种子，用于纹理噪声，不填则随机生成
}

/**
 * Shatter 特效参数 (碎裂)
 */
export interface ShatterEffectParams {
    type: 'shatter'
    pieceCount?: number       // 碎片密度 (1-10)，默认 5
    explodeForce?: number     // 爆炸扩散力度，默认 10.0
    duration?: number         // 动画总时长 (ms)，默认 1500
}

/**
 * 特效参数联合类型
 */
export type EffectParams =
    | WaveEffectParams
    | RibbonEffectParams
    | BreatheEffectParams
    | FloatEffectParams
    | GlowEffectParams
    | MotionBlurEffectParams
    | JellyEffectParams
    | SquashEffectParams
    | ShakeEffectParams
    | PetrifyEffectParams
    | ShatterEffectParams

/**
 * 特效轨道
 * 使用引擎内置算法，无需手动关键帧
 */
export interface EffectTrack {
    trackType: 'effect'
    displayName?: string     // 轨道显示名（仅用于编辑器展示，不改变目标对象名称）
    targetObjectId?: string   // 目标对象 ID（'_self' = 自身，或后代对象 ID）
    effectParams: EffectParams
}

/**
 * 轨道联合类型
 */
export type AnimationTrack = FrameSequenceTrack | TransformTrack | VisibilityTrack | EffectTrack

// ===== Animation 定义 =====

export type AnimationTimingMode = 'continuous' | 'tts_speech'

/**
 * 动画定义基类：所有动画类型共享的字段
 */
export interface AnimationDefinitionBase {
    type: string              // 判别字段（'track'）
    id: string                // UUID
    name: string              // 语义化名称 (如 "speak", "idle")
    description?: string | undefined      // 描述说明
    tags?: string[] | undefined           // 标签分类
    loop: boolean             // 是否循环，默认 false
    timingMode?: AnimationTimingMode // 默认播放方式，缺省为 continuous
    origin?: 'auto' | 'user'  // 'auto' = 对象创建时自动生成的帧动画, 'user' = 用户手动创建

    // 元数据（必填，创建时自动生成）
    createdAt: number
    updatedAt: number
}

/**
 * 轨道动画（直接驱动属性变化）
 * 注意：不再有全局 duration，时长由各轨道自己决定
 */
export interface TrackAnimationDefinition extends AnimationDefinitionBase {
    type: 'track'
    tracks: AnimationTrack[]
    duration?: number         // 可选的显式总时长 (ms)
    /**
     * 动画结束后的填充行为
     * - 'none' (默认): 停止后 delta 清零，回到基线
     * - 'forwards': 停止后保持最后一帧的 delta 值
     */
    fillMode?: 'none' | 'forwards'
}

/**
 * Animation 定义类型
 *
 * 旧数据兼容：缺少 type 字段的旧 AnimationDefinition 在反序列化时
 * 应自动注入 type: 'track'（见 sceneLoader.ts 迁移逻辑）。
 */
export type AnimationDefinition = TrackAnimationDefinition

/**
 * 创建 AnimationDefinition 时的输入类型（省略自动生成字段）
 */
export type AnimationDefinitionInput = Omit<TrackAnimationDefinition, 'id' | 'createdAt' | 'updatedAt'>



// ===== 运行时类型 =====

/**
 * Animation 播放状态
 */
export type AnimationPlayState = 'stopped' | 'playing' | 'paused' | 'filled'

/**
 * Animation 播放参数
 */
export interface AnimationPlayParams {
    speed?: number            // 播放速度，默认 1.0
    loop?: boolean            // 覆盖默认循环设置
    reset?: boolean           // 是否从头开始，默认 true
    // v11.52: 运行时帧数，用于帧序列轨道计算正确的帧索引
    // 由 GenericAnimationPlayer 从 AnimatedSprite.textures.length 获取并传入
    runtimeFrameCount?: number
    // v12.x: Auto Duration 解析后的实际时长 (ms)
    // 当轨道 duration === 'auto' 时，由播放引擎计算后注入
    runtimeDuration?: number
}

/**
 * 轨道输出结果（变换）
 */
export interface TransformTrackOutput {
    targetObjectId?: string | undefined
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    flipX?: boolean | undefined  // v11.1: 水平翻转 (离散状态)
    pivot: { x: number; y: number } | undefined
}

/**
 * 轨道输出结果（可见性）
 */
export interface VisibilityTrackOutput {
    targetObjectId?: string | undefined
    alpha: number
}

// v11.52: FrameSequenceTrackOutput 已删除
// 帧动画直接使用 AnimatedSprite.play() 播放

/**
 * 轨道输出结果（特效）
 * v11.70: 新增进度驱动模式的预计算结果字段
 */
export interface EffectTrackOutput {
    targetObjectId?: string | undefined
    effectType: DynamicEffectType
    effectParams: EffectParams
    active: boolean

    // v11.70: 进度驱动模式的预计算结果（jelly/squash 等阻尼类特效）
    deltaScaleX?: number
    deltaScaleY?: number
    deltaX?: number
    deltaY?: number
    deltaRotation?: number
}

/**
 * 轨道输出联合类型
 */
export type TrackOutput =
    | TransformTrackOutput
    | VisibilityTrackOutput
    // v11.52: FrameSequenceTrackOutput 已移除
    | EffectTrackOutput

/**
 * Animation 输出状态
 * 由 AnimationPlayer 计算后输出
 * v11.52: frameSequences 已移除，帧动画直接使用 AnimatedSprite.play()
 */
export interface AnimationOutput {
    transforms: TransformTrackOutput[]
    visibilities: VisibilityTrackOutput[]
    effects: EffectTrackOutput[]
}

// ===== 辅助类型 =====

/**
 * 资源类型（用于 Animation 管理）
 */
export type AnimationResourceType = 'character' | 'prop' | 'background' | 'scene' | 'composite'

/**
 * Animation 列表项（用于 UI 显示）
 */
export interface AnimationListItem {
    id: string
    name: string
    loop: boolean
    trackCount: number
    estimatedDuration: number  // 估算时长 (ms)
}
