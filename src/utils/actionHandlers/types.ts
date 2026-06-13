/**
 * Action Handler 类型定义
 * v11.0: 移除旧的 AnimPartState/animStates
 * v11.8x: 移除 activeAnimations（死写入，无读取处）
 * Phase 4e: 移除 objectStateTypes 依赖，引用 sceneObject.ts 的原始类型
 */

import type {
    CompositeObject,
    SceneObjectBase,
    ScreenEffectParams
} from '@/types/sceneObject'
import type { Action } from '@/types/screenplay'

// 子类型可写字段切片
type CompositeWriteable = Partial<Pick<CompositeObject, 'compositeMode' | 'childIds' | 'renderChain'>>

// Clip-Mask Phase 1：mask 子类型可写字段
interface MaskWriteable {
    /** mask.targetIds — set_mask Handler 会整段替换（部分更新语义） */
    targetIds?: string[]
    /** mask.shape — set_mask Handler 切换 */
    shape?: 'rectangle' | 'ellipse'
}

/**
 * v11.0 统一的可写状态接口
 *
 * 基于 SceneObjectBase + 各子类型 Pick 组合，
 * 覆盖 Handler 所有可能写入的字段。
 */
export interface WriteableState extends
    Omit<Partial<SceneObjectBase>, 'parentId'>,
    CompositeWriteable,
    MaskWriteable {
    // parentId 需显式覆盖：Handler 可能赋值 null（移出组合），
    // 而 SceneObjectBase.parentId?: string 不包含 null
    parentId?: string | null
    // camera
    zoom?: number
    shakeOffsetX?: number
    shakeOffsetY?: number
    // 画面特效参数（Handler 直接操作嵌套结构，消除 flat state 中间层）
    params?: ScreenEffectParams
    // v16: 元件当前素材 ID
    currentMaterialId?: string
    // 光源参数（Handler 直接操作，点光源 PRD Phase 0.5）
    lightColor?: string
    lightIntensity?: number
    lightRadius?: number
    // Phase 1: 闪烁和方向性
    flicker?: number
    flickerSpeed?: number
    directionMode?: 'omni' | 'cone'
    directionAngle?: number
    coneAngle?: number
    // 文本属性（Text PRD Phase 0 + Phase 1）
    content?: string
    fontSize?: number
    fontFamily?: string
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    color?: string
    align?: 'left' | 'center' | 'right'
    wordWrap?: boolean
    wordWrapWidth?: number
    stroke?: string
    strokeThickness?: number
    dropShadow?: boolean
    dropShadowColor?: string
    dropShadowBlur?: number
    dropShadowAngle?: number
    dropShadowDistance?: number
    lineHeight?: number
    letterSpacing?: number
    textBoxMode?: 'auto-width' | 'auto-height' | 'auto-size' | 'fixed'
    writingMode?: 'horizontal' | 'vertical'
    // Phase 2: 打字机效果
    revealInitialState?: 'complete' | 'typewriter'
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
    revealProgress?: number  // 0~1, 运行时驱动的显示进度
}

/**
 * Action Handler 上下文
 */
export interface ActionHandlerContext {
    /**
     * P2: 获取指定对象的当前累积状态（用于 SetParentHandler 坐标补偿）
     * 在 sceneStateCalculator 中，返回 newState.objects 中匹配 ID 的对象
     * 可选：不提供时 SetParentHandler 跳过坐标补偿（向后兼容）
     */
    getObjectState?: (targetId: string) => WriteableState | undefined
    /**
     * Current runtime object list. Handlers should treat parentId as the
     * authoritative relationship and use this list to derive children when
     * needed. Optional for backward compatibility with unit tests and previews.
     */
    objects?: WriteableState[]
}

/**
 * Action Handler 接口
 */
export interface ActionHandler<T extends Action = Action> {
    /** Action 类型标识 */
    readonly type: T['type']

    /** 是否为瞬时动作（立即生效） */
    readonly isPointAction: boolean

    /** 是否为持续动作（需要插值） */
    readonly isDurationAction: boolean

    /** 是否影响对象状态（用于 prepareBlocks 等过滤）— 相机 Action 为 false */
    readonly affectsObjectState: boolean

    /**
     * 应用动作到状态（瞬时生效）
     * @param state 目标状态对象
     * @param action 动作
     * @param context 可选的上下文（用于 SceneObject 模式等）
     */
    applyToState(state: WriteableState, action: T, context?: ActionHandlerContext): void

    /**
     * 计算插值状态（持续动作）
     * @param state 目标状态对象
     * @param action 动作
     * @param progress 进度 (0-1)
     * @param startState 起始状态
     */
    interpolate?(
        state: WriteableState,
        action: T,
        progress: number,
        startState: WriteableState,
        context?: ActionHandlerContext
    ): void

    /**
     * 获取动作完成后的目标状态
     * @param state 当前状态对象
     * @param action 动作
     */
    getTargetState?(state: WriteableState, action: T): void
}

/**
 * Action 类型枚举 (v11.0 更新)
 */
export type ActionType =
    | 'set_scene_structure'
    | 'set_transform'
    | 'set_visual'      // v9.3
    | 'set_lifecycle'   // v9.3
    | 'set_composite'   // P2
    | 'set_mask'        // Clip-Mask Phase 1

    | 'set_anim'        // v10.0 重命名 (原 trigger_anim), 由 ScenePlayer 直接处理
    | 'set_audio'       // v10.0 重命名 (原 trigger_audio)
    | 'set_screen_effect' // Phase 1 新增: 瞬时设置画面特效参数
    | 'set_light'          // 点光源 PRD Phase 0.5: 瞬时设置光源参数
    | 'set_material'    // v16: 切换 SymbolObject 的当前素材
    | 'set_text'        // Text PRD Phase 0: 瞬时设置文本属性
    | 'set_text_reveal' // TextObject 程序化显现播放控制
    | 'tween_transform'
    | 'tween_screen_effect' // Phase 1 新增: 渐变画面特效参数
    | 'tween_light'        // 点光源 PRD Phase 0.5: 渐变光源参数
    | 'tween_text'         // Text PRD Phase 1: 渐变文本属性
    | 'camera_cut'
    | 'camera_move'
    | 'camera_shake'
    | 'camera_follow'
