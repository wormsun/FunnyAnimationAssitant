
// 场景对象类型定义
// 从 src/stores/sceneObjectStore.ts 提取以解决循环依赖

// 场景对象类型
export type SceneObjectType = 'background' | 'audio' | 'prop' | 'text' | 'camera' | 'light' | 'screen_effect' | 'composite' | 'symbol' | 'expression' | 'mask'

// 场景对象基础接口（基类）
// 所有子类型通过 interface extends 继承此基类
export interface SceneObjectBase {
  // 基础标识
  id: string
  type: SceneObjectType
  name: string             // 显示名
  alias?: string           // v7.1: 场景内别名，除相机外所有对象都需要
  refId: string            // 统一引用字段，指向 Asset ID（无引用的类型赋 ''）

  // 位置和尺寸（画布坐标系）
  x: number               // X 坐标
  y: number               // Y 坐标
  width: number           // 宽度
  height: number          // 高度

  // 变换属性
  scaleX: number          // X 轴缩放（默认 1.0）
  scaleY: number          // Y 轴缩放（默认 1.0）
  rotation: number        // 旋转角度（弧度）
  alpha: number           // 透明度（0-1）
  flipX: boolean          // 是否水平翻转（默认false）

  // 变换原点（相对于 PivotBase 的像素偏移，默认 0 = 围绕 PivotBase 旋转）
  transformOriginX?: number   // 像素偏移，0=不偏移
  transformOriginY?: number   // 像素偏移，0=不偏移

  // 层级和状态
  zIndex: number          // 渲染层级
  visible: boolean        // 是否可见

  // 光照行为
  receiveLighting?: boolean  // 是否受全局光照影响，默认 true（undefined = true）
  castShadow?: boolean       // 是否投射脚底阴影，默认 false（undefined = false）

  // v9.3: 生命周期状态
  spawned?: boolean       // 是否已出生（动态对象 Setup 中为 false）

  // P2: 组合对象归属
  parentId?: string       // 父组合对象 ID（无父对象时 undefined）

  // 初始动画（角色/背景/道具共用，保留在基类）
  initialAnimations?: InitialAnimationItem[]

  // v13.x: 动画定义（对象自身携带，随模板保存/实例化）
  animations?: Record<string, AnimationDefinition>

  // v20: 附加信息 — 标识对象的来源身份及关联数据
  extraInfo?: CompositeExtraInfo
}

/** 组合对象附加信息（鉴别式联合） */
export type CompositeExtraInfo =
  | { kind: 'actor'; actorId: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'template'; templateId: string }

import type { AnimationDefinition, InitialAnimationItem } from './animation'



// 背景对象
export interface BackgroundObject extends SceneObjectBase {
  type: 'background'
  refId: string        // 统一引用字段 → Background.id
  // PT Phase 6: backgroundId 已删除，统一使用 refId
}

// 音频对象 (BGM/SFX 统一)
export interface AudioObject extends SceneObjectBase {
  type: 'audio'
  refId: string        // SoundAsset ID

  // 属性 (支持从 SoundAsset 继承默认值，但在此处存储覆盖值)
  volume: number       // 0-1
  loop: boolean
  fadeIn: number       // 秒
  fadeOut: number      // 秒
  playbackState: 'play' | 'stop' // 默认播放状态
}

// 道具对象
// v11.0: 移除旧的 animState，动画通过 AnimationPlayer 管理
export interface PropObject extends SceneObjectBase {
  type: 'prop'
  refId: string        // 统一引用字段 → PropAsset.id
  // PT Phase 6: propId 已删除，统一使用 refId
}

// 文本对象
export interface TextObject extends SceneObjectBase {
  type: 'text'
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  color: string
  align: 'left' | 'center' | 'right'
  wordWrap: boolean
  wordWrapWidth: number

  // === Phase 1: 视觉增强 ===
  stroke?: string                   // 描边颜色(hex)，undefined=无描边
  strokeThickness?: number          // 描边粗细(px)，默认 0
  dropShadow?: boolean              // 投影开关，默认 false
  dropShadowColor?: string          // 投影颜色，默认 '#000000'
  dropShadowBlur?: number           // 投影模糊，默认 4
  dropShadowAngle?: number          // 投影角度(弧度)，默认 Math.PI/4
  dropShadowDistance?: number       // 投影距离，默认 4
  lineHeight?: number               // 行高(px)，undefined=自动
  letterSpacing?: number            // 字距(px)，默认 0
  textBoxMode?: 'auto-width' | 'auto-height' | 'auto-size' | 'fixed'  // 默认 'auto-size'
  writingMode?: 'horizontal' | 'vertical'  // 默认 'horizontal'

  // === Phase 2: 动画 ===
  revealInitialState?: 'complete' | 'typewriter' // 默认显示方式，complete=完整文本，typewriter=开场打字
  revealSpeed?: number                 // 逐字速度(chars/sec)，默认 8
  fillType?: 'linear_gradient'          // 文字渐变开关（undefined=使用文字颜色）
  gradientStops?: { offset: number; color: string }[]  // 渐变色标
  gradientAngle?: number               // 渐变角度(度)
  textBackgroundEnabled?: boolean      // 文本框背景填充开关
  textBackgroundColor?: string         // 文本框背景颜色
  textBackgroundAlpha?: number         // 文本框背景透明度 0~1
  textBackgroundPaddingX?: number      // 文本框背景水平内边距
  textBackgroundPaddingY?: number      // 文本框背景垂直内边距
  textBackgroundRadius?: number        // 文本框背景圆角
}

// 相机对象
export interface CameraObject extends SceneObjectBase {
  type: 'camera'
  zoom: number  // 缩放级别，1.0 = 正常
}

// 光源对象 — 环境光 (ambient) 和点光源 (point)
// ambient: 场景唯一，自动创建，不可删除（与 Camera 相同模式）
// point: 可多个，带位置/半径，渲染时按强度取 top 8
export interface LightObject extends SceneObjectBase {
  type: 'light'
  /** 光源类型 */
  lightType: 'ambient' | 'point' | 'spot'
  /** 光照颜色 (hex) */
  lightColor: string
  /** 光照强度 0~2 */
  lightIntensity: number
  /** 光照半径（像素），仅 point 有效 */
  lightRadius: number

  // === Phase 1: 简化动态参数 ===
  /** 闪烁强度 0~1，0=无闪烁 */
  flicker?: number
  /** 闪烁速度 0~1 */
  flickerSpeed?: number
  /** 发光模式，默认 omni（全向）；cone 时启用方向性 */
  directionMode?: 'omni' | 'cone'
  /** 方向角（弧度），仅 directionMode=cone 生效 */
  directionAngle?: number
  /** 扇形开角（角度制，10~360），默认 100，仅 directionMode=cone 生效 */
  coneAngle?: number
}

// 画面特效参数 (Phase 1: 覆盖型 + 孔洞 + 跟随)
export interface ScreenEffectParams {
  // --- 覆盖型通用参数 ---
  baseColor?: string          // 覆盖颜色，默认 '#000000'
  // 覆盖不透明度统一由 SceneObjectBase.alpha 控制，不再使用 coverOpacity

  // --- 孔洞参数 ---
  holeShape?: 'circle' | 'horizontal_ellipse' | 'vertical_ellipse' | 'rectangle'
  holeCenterX?: number        // 孔洞中心 X
  holeCenterY?: number        // 孔洞中心 Y
  holeWidth?: number          // 孔洞宽度
  holeHeight?: number         // 孔洞高度
  openRatio?: number          // 开合比例 0~1
  feather?: number            // 边缘羽化半径 (px)

  // --- 跟随参数 ---
  targetId?: string           // 绑定的跟随对象 ID
  offsetX?: number            // 跟随偏移 X
  offsetY?: number            // 跟随偏移 Y

  // --- 光照模式参数 ---
  /** 光照模式：additive=叠加发光(ADD), soft=柔和照亮(SCREEN) */
  lightMode?: 'additive' | 'soft'
  /** 光斑颜色，默认 '#ffffff' */
  lightColor?: string
  /** 衰减曲线，默认 'smooth' */
  lightFalloff?: 'linear' | 'quadratic' | 'smooth'
}

// 画面特效对象
export interface ScreenEffectObject extends SceneObjectBase {
  type: 'screen_effect'
  effectClass: string         // 特效种类标识，如 'spotlight', 'fullscreen_cover'
  customName?: string         // 轨道上显示的名称，如 "黑幕_1"
  params: ScreenEffectParams
}

// 画面特效预设 (用于 Picker 弹窗选择结果)
export interface ScreenEffectPreset {
  effectClass: string
  name: string
  params: ScreenEffectParams
  defaultAlpha?: number  // 覆盖不透明度，由调用端设置到 SceneObjectBase.alpha
}

// P2: 组合对象
export interface CompositeObject extends SceneObjectBase {
  type: 'composite'
  childIds: string[]      // 子对象 ID 列表（平铺存储，通过双向引用维护）
  compositeLocked: boolean  // 锁定模式：true=点击子对象选中整体，false=可独立操作子对象
  compositeMode: 'entity' | 'union'  // entity=实体模式（级联删除），union=联合模式（子对象冒泡）
  /** 仅 entity：内部渲染链（有序 ID 列表）。嵌套 union 不出现，其子对象展开平铺。 */
  renderChain?: string[]

  /** 场景实例级 rootComposite ID（导入人物时由 idMap 从 CompositeCharacter.rootCompositeId 重映射而来） */
  instanceRootCompositeId?: string
}

// v16: 元件素材
export interface SymbolMaterial {
  id: string
  name: string
  type: 'static' | 'animation'
  /** 静态图片 URL / 动画静止帧 URL（type === 'static' 时为主图，type === 'animation' 时为静止帧） */
  url?: string
  /** 序列帧（type === 'animation' 时使用） */
  frames?: { url: string }[]
  /** 帧率（type === 'animation' 时使用） */
  fps?: number
  /** 是否循环播放 */
  loop?: boolean
  /** 静止帧来源：'frame' = 从序列帧选择，'custom' = 自定义上传 */
  stillFrameSource?: 'frame' | 'custom'
  /** 当 stillFrameSource === 'frame' 时，使用的帧索引 */
  stillFrameIndex?: number

}

// v16: 元件对象 — 填补道具（单资源）和角色（多部件）之间的空白
// 素材直接存在对象上（自包含），不依赖外部资源 Store
export interface SymbolObject extends SceneObjectBase {
  type: 'symbol'
  /** 素材列表 */
  materials: SymbolMaterial[]
  /** 当前显示的素材 ID */
  currentMaterialId?: string
}

// v18: 独立表情对象 — 引用 expressionStore 中的表情资源
// refId 可变，支持运行时切换不同表情（类似 SymbolObject.currentMaterialId）
export interface ExpressionObject extends SceneObjectBase {
  type: 'expression'
  refId: string  // → Expression.id (expressionStore)，可变
  defaultRefId?: string  // → 默认表情 ID（创建时自动设置，用于恢复默认）
}

// Clip-Mask Phase 1: 蒙版对象 — 独立 SceneObject，作为裁切源裁切 targetIds 列表中的目标对象
// 详见 doc-prd/clip-mask-design.md（v2.1）
export type MaskShape = 'rectangle' | 'ellipse'
/** Phase 1 仅支持 inside_visible（形状内可见、形状外隐藏）。
 *  outer / outside_visible 等模式 Phase 2 引入并扩展该联合类型。 */
export type MaskMode = 'inside_visible'

export interface MaskObject extends SceneObjectBase {
  type: 'mask'
  refId: ''                 // mask 不引用任何 Asset，固定空串以满足基类约束
  /** 形状类型，几何由 SceneObjectBase 的 width/height/rotation/scale 等提供 */
  shape: MaskShape
  /** 裁切模式（Phase 1 锁定为 'inside_visible'） */
  mode: MaskMode
  /** 被该蒙版裁切的目标对象 id 列表；Phase 1 单蒙版独占——同一 id 同一时刻只能出现在一个 mask 的 targetIds 中。 */
  targetIds: string[]
}

// SceneObject = 基类（多态引用，消费者通过 as SubType 在类型判断分支内访问子类型字段）
export type SceneObject = SceneObjectBase

/**
 * updateObject 的参数类型（泛型版本）。
 *
 * - `SceneObjectUpdateFor<SceneObject>` — 基类属性更新
 * - `SceneObjectUpdateFor<CompositeObject>` — 包含 compositeLocked/compositeMode 等子类型字段
 *
 * 每个属性显式允许 `undefined` 值，语义 = **删除该属性**（绕过 exactOptionalPropertyTypes 限制）。
 */
export type SceneObjectUpdateFor<T extends SceneObject = SceneObject> = {
  [K in keyof T]?: T[K] | undefined
}

/** 基类属性更新（最常用场景的简写） */
export type SceneObjectUpdate = SceneObjectUpdateFor<SceneObject>
