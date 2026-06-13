/**
 * 剧本编辑器类型定义
 * 对应 ScreenPlayEditor_PRD.md
 */

import type { AnimationTimingMode } from './animation'
import type { SceneObject } from './sceneObject'
export type { SceneObject }

export const SCENE_ACTION_TARGET = '_scene_' as const

// ==================== 场景状态快照 ====================

/**
 * 相机状态
 */
export interface CameraState {
  x: number
  y: number
  zoom: number
  transition?: 'cut' | 'fade' // 转场方式
}

/**
 * 演员状态
 */
export interface ActorState {
  x: number
  y: number
  state: string // 人物姿态名称，如 "stand_nervous"
  expression?: string // 表情名称，如 "blush"
}



// ==================== 动作系统 ====================

/**
 * 动作类型枚举 (v6.3 精简版)
 * 瞬时动作 (Point Actions): 在特定时间点触发，立即改变状态
 * 持续动作 (Duration Actions): 在一段时间内持续进行插值变化
 * 
 * 设计原则：
 * - set_transform: 控制视觉属性 (alpha, visible, flipX, zIndex)
 * - tween_transform: 控制几何属性的渐变 (x, y, scaleX, scaleY, rotation)
 */
export type ActionType =
  // --- 瞬时动作 (Point Actions) ---
  | 'set_scene_structure'   // 场景级父子结构状态补丁
  | 'set_transform'   // 瞬间改变几何属性 (x/y/scale/rotation/alpha)
  | 'set_visual'      // 瞬间改变视觉属性 (visible/flipX/zIndex) v9.3新增
  | 'set_lifecycle'   // 控制对象出生/消亡 (spawned) v9.3新增
  | 'set_composite'   // P2: 修改组合对象自身属性 (compositeMode/renderChain)
  | 'set_mask'        // Clip-Mask Phase 1: 修改蒙版对象自身属性 (targetIds/shape)

  | 'set_anim'        // 设置组件动画状态 (v6.3 新增, v10.0 重命名)
  | 'set_audio'       // 设置音频播放状态 (v7.5 新增, v10.0 重命名)
  | 'set_screen_effect' // 瞬时设置画面特效参数 (Phase 1 新增)
  | 'set_light'        // 瞬时设置光源参数 (点光源 PRD Phase 0.5)
  | 'set_material'    // v16: 切换 SymbolObject 的当前素材
  | 'set_text'        // 瞬时设置文本属性 (Text PRD Phase 0)
  | 'set_text_reveal' // 文本显现/打字机播放控制
  | 'camera_cut'      // 镜头切 (瞬间切换机位)
  // --- 持续动作 (Duration Actions) ---
  | 'tween_transform' // 补间变换 (x/y/scale/rotation/alpha)
  | 'tween_screen_effect' // 渐变画面特效参数 (Phase 1 新增)
  | 'tween_light'      // 渐变光源参数 (点光源 PRD Phase 0.5)
  | 'tween_text'       // 渐变文本属性 (Text PRD Phase 1)
  | 'camera_move'     // 运镜 (推拉摇移)
  | 'camera_shake'    // 震动
  | 'camera_follow'   // 跟随 (v6.5 新增)

/**
 * 动作分类 (v6.2)
 * point: 瞬时动作，在 Slot 起始点触发
 * duration: 持续动作，填满 Slot 全时长
 */
export type ActionCategory = 'point' | 'duration'

/**
 * 动作基础接口 (v6.2)
 */
export interface BaseAction {
  id: string           // UUID
  target: string       // 目标标识 (通常是 Actor Alias 或 Object ID)
  type: ActionType
  category: ActionCategory // 动作分类
  slotIndex: number    // 依附的起始槽位下标
  order?: number        // 同一 slot 内的显式执行顺序；旧数据为空时使用兼容排序
}

// ==================== 瞬时动作 (Point Actions) ====================

/**
 * 几何变换参数 (v9.3 重新定义)
 * 包含几何变换和透明度
 * 可与 tween_transform 共存：set_transform 设置初始状态，tween_transform 从该状态开始渐变
 */
export interface SetTransformParams {
  // 几何属性
  x?: number          // X 坐标
  y?: number          // Y 坐标
  scaleX?: number     // X 缩放
  scaleY?: number     // Y 缩放
  rotation?: number   // 旋转角度 (弧度)
  // 透明度 (可即时设置或动画过渡)
  alpha?: number      // 透明度 (0-1)
  // 变换原点覆盖（像素偏移，覆盖 SceneObjectBase 的基线值）
  transformOriginX?: number
  transformOriginY?: number
}

/**
 * 视觉属性参数 (v9.3 新增)
 * 控制对象的显示属性，与所有 Action 可共存
 */
export interface SetVisualParams {
  visible?: boolean   // 可见性
  flipX?: boolean     // 水平翻转
  zIndex?: number     // 层级
  receiveLighting?: boolean // 是否受全局光照影响
  castShadow?: boolean // 是否投射脚底阴影
}

/**
 * 生命周期参数 (v9.3 新增)
 * 控制动态对象的出生和消亡
 */
export interface SetLifecycleParams {
  spawned: boolean    // true=出生, false=消亡
  /**
   * 本段结束后自动消亡（仅对出生 Action 生效）
   * - true（默认）：Block 结束时，如果该对象没有被手动消亡，则自动消亡
   * - false：对象在 Block 结束后继续存活，继承到后续 Block
   */
  autoDespawnOnBlockEnd?: boolean
}

export type SceneStructureOperation =
  | GroupSceneStructureOperation
  | UngroupSceneStructureOperation
  | ReparentSceneStructureOperation

export interface BaseSceneStructureOperation {
  id: string
  kind: 'group' | 'ungroup' | 'reparent'
}

export interface GroupSceneStructureOperation extends BaseSceneStructureOperation {
  kind: 'group'
  groupId: string
  memberIds: string[]
  parentId: string | null
  /**
   * 本段结束后自动解除结构（仅对成组操作生效）。
   * - undefined / true：Block 结束时自动停用结构对象，并恢复成员父级
   * - false：结构对象及其成员结构继承到后续 Block
   */
  autoRestoreOnBlockEnd?: boolean
}

export interface UngroupSceneStructureOperation extends BaseSceneStructureOperation {
  kind: 'ungroup'
  groupId: string
  memberIds: string[]
  groupParentId: string | null
  restoreParentId: string | null
}

export interface ReparentSceneStructureOperation extends BaseSceneStructureOperation {
  kind: 'reparent'
  objectIds: string[]
  parentId: string | null
}

export interface SetSceneStructureParams {
  operations: SceneStructureOperation[]
}

/**
 * 瞬间改变几何属性动作 (v9.3 重新定义)
 * 用于即时变换对象位置、缩放、旋转和透明度
 * 可与 tween_transform 共存：先瞬时设置，再开始补间渐变
 */
export interface SetTransformAction extends BaseAction {
  type: 'set_transform'
  category: 'point'
  params: SetTransformParams
}

/**
 * 视觉属性动作 (v9.3 新增)
 * 瞬间改变对象的显示属性，与所有 Action 可共存
 */
export interface SetVisualAction extends BaseAction {
  type: 'set_visual'
  category: 'point'
  params: SetVisualParams
}

/**
 * 生命周期动作 (v9.3 新增)
 * 控制动态对象的出生和消亡
 * 图标: 🌱 (出生) / 🍂 (消亡)
 */
export interface SetLifecycleAction extends BaseAction {
  type: 'set_lifecycle'
  category: 'point'
  params: SetLifecycleParams
}

export interface SetSceneStructureAction extends BaseAction {
  type: 'set_scene_structure'
  category: 'point'
  target: typeof SCENE_ACTION_TARGET
  params: SetSceneStructureParams
}

/**
 * P2: Params for modifying composite object properties
 * Follows the "field-group-in-one" pattern (like set_visual groups visible/flipX/zIndex)
 */
export interface SetCompositeParams {
  compositeMode?: 'entity' | 'union'
  renderChain?: string[]  // entity 内部渲染链排序
}

/**
 * P2: Modify composite object properties (compositeMode, childIds ordering, etc.)
 * Target = composite object ID
 */
export interface SetCompositeAction extends BaseAction {
  type: 'set_composite'
  category: 'point'
  params: SetCompositeParams
}

/**
 * Clip-Mask Phase 1: Params for modifying mask object properties
 *
 * 字段族合一（同 set_composite / set_visual）：所有 mask 专属字段聚合到一个 Action 类型。
 * 不包含 mode（Phase 1 锁定 inside_visible，UI 不暴露）。
 * width/height 属于 mask 几何定义；transform 仍走 set_transform。
 */
export interface SetMaskParams {
  /** 替换 mask.targetIds（部分更新语义：未提供 = 不变） */
  targetIds?: string[]
  /** 蒙版形状切换 */
  shape?: 'rectangle' | 'ellipse'
  /** 蒙版原始宽度（部分更新语义：未提供 = 不变） */
  width?: number
  /** 蒙版原始高度（部分更新语义：未提供 = 不变） */
  height?: number
}

/**
 * Clip-Mask Phase 1: 修改蒙版对象自身属性 (targetIds / shape / width / height)
 * Target = mask object ID
 */
export interface SetMaskAction extends BaseAction {
  type: 'set_mask'
  category: 'point'
  params: SetMaskParams
}



/**
 * 镜头切动作
 */
export interface CameraCutAction extends BaseAction {
  type: 'camera_cut'
  category: 'point'
  target: 'camera' // 固定
  params: {
    x: number
    y: number
    zoom: number
  }
}

/**
 * 设置动画播放状态动作 (v11.0)
 * 统一控制所有类型的动画（帧序列、变换、特效等）
 * 
 * 使用 animName 引用目标对象资源中定义的 AnimationDefinition
 * 
 * v11.88: 新增 autoStopOnBlockEnd 属性控制 Block 结束时是否自动停止（放在每个动画项内）
 *         移除旧格式向后兼容属性
 * v12.x:  恢复 loop 覆盖能力，放在每个动画项内独立控制
 */
export interface SetAnimAction extends BaseAction {
  type: 'set_anim'
  category: 'point'
  params: {
    /**
     * v11.88: 多动画控制
     * - animName: 引用目标对象资源中定义的 Animation
     * - action: 控制指令，默认 'play'
     * - autoStopOnBlockEnd: 是否在 Block 结束时自动停止
     * - loop: 覆盖 AnimationDefinition.loop（undefined = 跟随定义）
     * - timingMode: 覆盖 AnimationDefinition.timingMode（undefined = 跟随定义）
     */
    animations: {
      animName: string
      action?: 'play' | 'stop'
      /**
       * v11.88: 本段结束后停止
       * - true (默认): Block 结束时自动停止此动画
       * - false: 动画持续到后续 Block，直到被显式停止
       */
      autoStopOnBlockEnd?: boolean
      /**
       * v12.x: 循环覆盖（三态）
       * - undefined (默认): 跟随 AnimationDefinition.loop
       * - true: 强制循环
       * - false: 强制不循环
       */
      loop?: boolean
      /**
       * v21: 播放方式覆盖（三态）
       * - undefined (默认): 跟随 AnimationDefinition.timingMode
       * - continuous: 动作触发后连续播放
       * - tts_speech: 仅在 TTS 有声片段内播放
       */
      timingMode?: AnimationTimingMode
    }[]

    /**
     * 可选：播放参数（应用于所有动画）
     */
    reset?: boolean       // play 时是否从头开始，默认 true
  }
}

/**
 * 设置音频播放状态动作 (v7.5, v10.0 重命名)
 */
export interface SetAudioAction extends BaseAction {
  type: 'set_audio'
  category: 'point'
  params: {
    action: 'play' | 'stop' | 'pause' | 'resume'
    volume?: number
    loop?: boolean
    fadeIn?: number
    fadeOut?: number
  }
}

/**
 * 画面特效参数 (Phase 1 新增)
 * 用于 set_screen_effect 和 tween_screen_effect 动作
 */
export interface SetScreenEffectParams {
  // 覆盖不透明度统一由 SceneObject.alpha 控制，不再使用 coverOpacity
  baseColor?: string          // 覆盖颜色
  holeShape?: 'circle' | 'horizontal_ellipse' | 'vertical_ellipse' | 'rectangle'
  holeCenterX?: number
  holeCenterY?: number
  holeWidth?: number
  holeHeight?: number
  openRatio?: number          // 开合比例 0~1
  feather?: number            // 羽化半径
  targetId?: string           // 跟随目标 ID
  offsetX?: number
  offsetY?: number
}

/**
 * 瞬时设置画面特效参数 (Phase 1 新增)
 */
export interface SetScreenEffectAction extends BaseAction {
  type: 'set_screen_effect'
  category: 'point'
  params: SetScreenEffectParams
}

/**
 * v16: 切换元件素材参数
 */
export interface SetMaterialParams {
  materialId: string  // 目标素材 ID
}

/**
 * v16: 切换元件素材动作
 * 目标必须是 SymbolObject
 */
export interface SetMaterialAction extends BaseAction {
  type: 'set_material'
  category: 'point'
  params: SetMaterialParams
}

/**
 * 文本属性参数 (Text PRD Phase 0 + Phase 1)
 * 用于 set_text 动作
 */
export interface SetTextParams {
  content?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  color?: string
  align?: 'left' | 'center' | 'right'
  wordWrap?: boolean
  wordWrapWidth?: number
  // Phase 1: 视觉增强
  stroke?: string
  strokeThickness?: number
  letterSpacing?: number
  lineHeight?: number
  textBoxMode?: 'auto-width' | 'auto-height' | 'auto-size' | 'fixed'
  writingMode?: 'horizontal' | 'vertical'
  dropShadow?: boolean
  dropShadowColor?: string
  dropShadowBlur?: number
  dropShadowAngle?: number
  dropShadowDistance?: number
  // Phase 2: 动画
  revealSpeed?: number
  fillType?: 'linear_gradient'
  gradientStops?: { offset: number; color: string }[]
  gradientAngle?: number
  textBackgroundEnabled?: boolean
  textBackgroundColor?: string
  textBackgroundAlpha?: number
  textBackgroundPaddingX?: number
  textBackgroundPaddingY?: number
  textBackgroundRadius?: number
}

/**
 * 瞬时设置文本属性 (Text PRD Phase 0)
 */
export interface SetTextAction extends BaseAction {
  type: 'set_text'
  category: 'point'
  params: SetTextParams
}

/**
 * 文本显现动作
 * 用于触发 TextObject 的程序化显现效果，例如打字机。
 */
export interface SetTextRevealAction extends BaseAction {
  type: 'set_text_reveal'
  category: 'point'
  params: {
    action: 'play' | 'stop'
    mode?: 'typewriter'
  }
}

/**
 * 文本渐变参数 (Text PRD Phase 1)
 * 可插值的文本属性子集
 */
export interface TweenTextParams {
  color?: string
  fontSize?: number
  letterSpacing?: number
  strokeThickness?: number
}

/**
 * 渐变文本属性动作 (Text PRD Phase 1)
 * 控制文本颜色/字号/字距/描边粗细的平滑过渡
 */
export interface TweenTextAction extends BaseDurationAction {
  type: 'tween_text'
  params: TweenTextParams
}

/**
 * 光源参数 (点光源 PRD Phase 0.5)
 * 用于 set_light 和 tween_light 动作
 * 环境光与点光源共用同一接口，运行时根据 lightType 忽略不适用字段
 */
export interface SetLightParams {
  lightColor?: string       // 光照颜色 (hex)，环境光+点光源均有效
  lightIntensity?: number   // 光照强度 0~2，环境光+点光源均有效
  lightRadius?: number      // 光照半径（像素），仅 point 有效
  // Phase 1: 闪烁和方向性
  flicker?: number          // 闪烁强度 0~1
  flickerSpeed?: number     // 闪烁速度 0~1
  directionMode?: 'omni' | 'cone'  // 发光模式
  directionAngle?: number   // 方向角（弧度）
  coneAngle?: number        // 扇形开角（角度制）
}

/**
 * 瞬时设置光源参数 (点光源 PRD Phase 0.5)
 */
export interface SetLightAction extends BaseAction {
  type: 'set_light'
  category: 'point'
  params: SetLightParams
}

// ==================== 持续动作 (Duration Actions) ====================

/**
 * 持续动作基础接口 (v6.2)
 */
export interface BaseDurationAction extends BaseAction {
  category: 'duration'
  slotSpan: number     // 槽位跨度，默认 1，>1 表示跨槽位动作
  easing?: string      // 缓动函数名，如 'linear', 'easeInOutQuad'
}

/**
 * 补间变换参数 (v9.3 更新)
 * 包含几何变换和透明度，用于渐变动画
 * 可与 set_transform 共存：set_transform 设置初始状态，tween_transform 从该状态渐变到目标
 */
export interface TweenTransformParams {
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  alpha?: number      // v9.3: 透明度动画过渡 (0-1)
}

/**
 * 补间变换动作 (v6.3)
 * 控制对象的几何属性渐变
 */
export interface TweenTransformAction extends BaseDurationAction {
  type: 'tween_transform'
  params: TweenTransformParams
}

/**
 * 渐变画面特效参数动作 (Phase 1 新增)
 * 控制特效参数的平滑过渡（如 openRatio、feather 等）
 */
export interface TweenScreenEffectAction extends BaseDurationAction {
  type: 'tween_screen_effect'
  params: SetScreenEffectParams
}

/**
 * 渐变光源参数动作 (点光源 PRD Phase 0.5)
 * 控制光源颜色/强度/半径的平滑过渡
 */
export interface TweenLightAction extends BaseDurationAction {
  type: 'tween_light'
  params: SetLightParams
}

/**
 * 运镜动作
 */
export interface CameraMoveAction extends BaseDurationAction {
  type: 'camera_move'
  target: 'camera'
  params: {
    x?: number
    y?: number
    zoom?: number
  }
}

/**
 * 震动动作
 */
export interface CameraShakeAction extends BaseDurationAction {
  type: 'camera_shake'
  target: 'camera'
  params: {
    intensity: number // 震动强度 (像素)
    decay: boolean    // 是否随时间衰减
    frequency: number // 震动频率 (Hz)
  }
}

/**
 * 跟随动作 (v6.5 新增)
 * 将相机中心锁定在指定对象上
 */
export interface CameraFollowAction extends BaseDurationAction {
  type: 'camera_follow'
  target: 'camera'
  params: {
    followTarget: string  // 跟随目标 (actor alias 或 object id)
    damping?: number      // 阻尼系数 (0=死跟，>0=平滑跟随)，默认 0
    offsetX?: number      // X 偏移量，默认 0
    offsetY?: number      // Y 偏移量，默认 -50（人物稍微偏下）
    zoom?: number         // 缩放级别，不设置则保持当前 zoom
    smoothEntry?: boolean      // v15: 平滑入场（默认 false），从当前位置滑动到目标
    smoothEntryDuration?: number // v15: 平滑入场时长（ms），默认 300
    autoZoom?: boolean         // v15: 自动推拉（默认 false），正弦波缩放振荡
    autoZoomRange?: number     // v15: 推拉幅度（基准 zoom 的百分比），默认 5
    autoZoomCycles?: number    // v15: 推拉次数（完整周期数），默认 0.5
    constrainBounds?: boolean  // v6.9: 边界约束，限制相机在画布范围内
  }
}

// ==================== 动作联合类型 ====================

/**
 * 所有动作类型的联合 (v9.3 更新)
 */
export type Action =
  | SetSceneStructureAction
  | SetTransformAction
  | SetVisualAction      // v9.3 新增
  | SetLifecycleAction   // v9.3 新增
  | SetCompositeAction   // P2
  | SetMaskAction        // Clip-Mask Phase 1

  | SetAnimAction
  | SetAudioAction
  | SetScreenEffectAction  // Phase 1 新增
  | SetLightAction         // 点光源 PRD Phase 0.5
  | SetMaterialAction      // v16 新增
  | SetTextAction          // Text PRD Phase 0
  | SetTextRevealAction
  | CameraCutAction
  | TweenTransformAction
  | TweenScreenEffectAction // Phase 1 新增
  | TweenLightAction       // 点光源 PRD Phase 0.5
  | TweenTextAction        // Text PRD Phase 1
  | CameraMoveAction
  | CameraShakeAction
  | CameraFollowAction

/**
 * 瞬时动作类型（用于类型守卫）(v9.3 更新)
 */
export type PointAction =
  | SetSceneStructureAction
  | SetTransformAction
  | SetVisualAction      // v9.3 新增
  | SetLifecycleAction   // v9.3 新增
  | SetCompositeAction   // P2
  | SetMaskAction        // Clip-Mask Phase 1

  | SetAnimAction
  | SetAudioAction
  | SetScreenEffectAction  // Phase 1 新增
  | SetLightAction         // 点光源 PRD Phase 0.5
  | SetMaterialAction      // v16 新增
  | SetTextAction          // Text PRD Phase 0
  | SetTextRevealAction
  | CameraCutAction

/**
 * 持续动作类型（用于类型守卫）
 */
export type DurationAction =
  | TweenTransformAction
  | TweenScreenEffectAction // Phase 1 新增
  | TweenLightAction       // 点光源 PRD Phase 0.5
  | TweenTextAction        // Text PRD Phase 1
  | CameraMoveAction
  | CameraShakeAction
  | CameraFollowAction

// ==================== 场景容器系统 (v5.0) ====================

/**
 * 场景容器的 Setup 数据
 */
export interface SceneSetup {
  camera: {
    x: number
    y: number
    width: number
    height: number
    zoom: number
  }
  objects: SceneObject[]
  /** 根级渲染链（有序 ID 列表）。union composite 不出现，其子对象展开平铺。 */
  renderChain: string[]
}

/**
 * 运行时相机状态
 * 从 actionEvaluator.ts 提升到 types 层统一定义
 */
export interface RuntimeCameraState {
  x: number
  y: number
  zoom: number
  shakeOffsetX: number
  shakeOffsetY: number
}

/**
 * 场景的运行时快照（Runtime 工作副本）
 * 由 SceneSetup 深拷贝后，经 Action 链评估产生。
 *
 * 三个消费者各自持有独立实例：
 * - 编辑器: sceneObjectStore.runtimeState (ref, 响应式, Slot 粒度)
 * - ScenePlayer: runtimeSnapshot (局部变量, 时间粒度)
 * - FrameCapture: this.runtimeSnapshot (类成员, 时间粒度)
 *
 * 生命周期：
 * - 创建: 进入 Action Mode / 开始播放 / 开始导出 时
 * - 更新: 每次 Block 切换由 applyBlockActionsToState 重新计算
 * - 销毁: 退出 Action Mode / 播放结束 / 导出结束 后丢弃
 */
export interface RuntimeSceneSnapshot {
  /** runtime 对象列表（经 Action 评估后的状态） */
  objects: SceneObject[]
  /** runtime 渲染链（经 reconcileRenderChain 协调后） */
  renderChain: string[]
  /** runtime 相机状态 */
  camera: RuntimeCameraState
}

/**
 * 从 SceneSetup 创建 RuntimeSceneSnapshot
 * 这是 Runtime 层的唯一创建入口
 */
export function createRuntimeSnapshot(setup: SceneSetup): RuntimeSceneSnapshot {
  const cloned = JSON.parse(JSON.stringify(setup)) as SceneSetup
  return {
    objects: cloned.objects,
    renderChain: cloned.renderChain,
    camera: {
      x: cloned.camera.x,
      y: cloned.camera.y,
      zoom: cloned.camera.zoom,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
    },
  }
}

/**
 * 单个 Block 的播放信息
 * 由 prepareBlockPlayInfos 预计算，三个消费者共用。
 */
export interface BlockPlayInfo {
  /** Block 开始时的场景 runtime 快照 */
  startSnapshot: RuntimeSceneSnapshot
  block: ScriptBlock
  startTime: number
  endTime: number
  duration: number
  slots: RuntimeSlot[]
  blockActions: Action[]
  audioUrl?: string
}

/**
 * 场景容器
 */
export interface SceneContainer {
  id: string
  type: 'scene_container'
  title: string
  setup: SceneSetup
  script: ScriptBlock[] // DialogueBlock | NarrationBlock
}

// ==================== 脚本块系统 ====================

/**
 * 脚本块类型
 */
export type ScriptBlockType = 'dialogue' | 'narration' | 'action'

/**
 * 脚本块基础接口
 */
export interface BaseScriptBlock {
  id: string // 唯一标识
  type: ScriptBlockType
}

/**
 * TTS 配置接口
 * 用于 DialogueBlock 和 NarrationBlock
 * v12.8: audio 改为 audioPath，TTS 音频外置到文件系统
 */
export interface TTSConfig {
  duration?: number // TTS 估算时长（毫秒）
  audioPath?: string // v12.8: TTS 音频文件相对路径 (如 "project_cache/tts/{hash}.mp3")
  timingAudioPath?: string // 导出预加载后保留的原始音频路径，用于读取 TTS timing sidecar
  voiceId?: number // 使用的音色ID
  // 生成时的快照信息，用于检测内容变更
  generatedFrom?: {
    instanceId?: string // v7.0: 生成时的实例ID (仅对话)
    text: string // 生成时的文本内容
    voiceId: number // 生成时的音色ID
    speed: number // 生成时的语速
    volume?: number // 生成时的音量
  }
}


/**
 * 对话块
 * v7.0: actorAlias 改为 instanceId，使用场景中角色实例的ID
 */
export interface DialogueBlock extends BaseScriptBlock {
  type: 'dialogue'
  instanceId: string // v7.0: 角色实例ID (SceneObject.id)
  text: string // 对话文本
  state?: string // 人物姿态（姿势key）
  expression?: string // 表情ID
  speed?: number // 语速倍率，默认 1.0
  ttsConfig?: TTSConfig
  actions: Action[] // 挂载的动作列表
}

/**
 * 旁白块
 */
export interface NarrationBlock extends BaseScriptBlock {
  type: 'narration'
  text: string // 旁白文本
  speed?: number // 语速倍率，默认 1.0
  ttsConfig?: TTSConfig
  actions: Action[] // 挂载的动作列表
}

/**
 * 演出块 (v11.1 新增)
 * 纯粹的动作展示，不包含文本
 */
export interface ActionBlock extends BaseScriptBlock {
  type: 'action'
  duration: number
  actions: Action[]
}

/**
 * 联合脚本块类型
 */
export type ScriptBlock = DialogueBlock | NarrationBlock | ActionBlock



// ==================== 演员配置 ====================

/**
 * 演员配置
 * v7.0: 添加 id 字段，移除 alias（别名移至 SceneObject）
 */
export interface ActorConfig {
  id: string // v7.0: 唯一稳定ID
  characterId: string // 人物资源 ID
  name: string // 显示名称,如 "小明", "阿强"
  alias?: string // 剧本中的别名
  voice?: {
    // TTS 配置
    voiceId?: string
    speed?: number // 语速倍率 (0.5 - 2.0)
    volume?: number // 音量 (-10 - 10)
  }
}

/**
 * 旁白配置
 */
export interface NarratorConfig {
  voice?: {
    voiceId?: string
    speed?: number // 语速倍率 (0.5 - 2.0)
    volume?: number // 音量 (-10 - 10)
  }
}



// ==================== 槽位系统 (v6.2) ====================

/**
 * 槽位类型 (v6.10 新增)
 * - preroll: Block 开始到第一个字幕开始之间的时间段
 * - subtitle: 字幕对应的时间段
 * - postroll: 最后一个字幕结束到 Block 结束之间的时间段
 */
export type SlotType = 'preroll' | 'subtitle' | 'postroll'

/**
 * 运行时槽位结构 (v6.10 更新)
 * 槽位是编辑器运行时的临时容器，由 TTS 数据动态计算生成
 * 不直接存储在数据库中
 * 
 * v6.10: 添加 type 字段区分 preroll/subtitle/postroll
 * v6.10: 添加 isEstimated 字段标识时间是否为估算值
 */
export interface RuntimeSlot {
  type: SlotType         // 槽位类型 (v6.10 新增)
  index: number          // 槽位序号 (0, 1, 2...)
  text?: string          // 该分句的文本内容 (preroll/postroll 无文本)
  startTime: number      // 相对于 Block 开始的绝对时间 (ms)
  duration: number       // 该分句 TTS 时长 (ms)
  isEstimated?: boolean  // 时间是否为估算值 (v6.10 新增，无 TTS 数据时为 true)

  // UI 状态标识
  isMerged?: boolean     // 是否是被合并的槽位
  parentIndex?: number   // 如果被合并，指向的主槽位索引
  spanCount?: number     // 如果是主槽位，表示跨越了几个原始槽位
}

/**
 * 显示用槽位（处理过合并逻辑后的槽位）
 */
export interface DisplaySlot extends RuntimeSlot {
  spanCount: number      // 跨越的原始槽位数，默认 1
}

// ==================== 配乐管理 (v7.5) ====================

/**
 * BGM 轨道定义
 * 用于跨场景背景音乐管理
 */
export interface BGMTrack {
  id: string             // 唯一标识
  assetId: string        // 关联的音频资源ID (projectStore.assets)

  // 开始位置
  start: {
    sceneId: string
    blockId: string | null // null 表示场景开始
  }

  // 结束位置
  end: {
    sceneId: string
    blockId: string | null // null 表示场景结束
  }

  volume: number         // 0.0 ~ 1.0
  loop: boolean          // 是否循环

  // 预留字段
  fadeIn?: number        // 淡入时长 (秒)
  fadeOut?: number       // 淡出时长 (秒)
}
