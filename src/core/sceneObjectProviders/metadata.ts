/**
 * 场景对象类型元数据注册表
 *
 * P1: 统一管理各 SceneObjectType 的图标、标签、AnimationResourceType 映射等元信息，
 * 消除 UI 层各处独立 switch/if-else 散弹式修改。
 *
 * 新增对象类型只需在此注册 metadata，所有消费方自动生效。
 */

import type { AnimationResourceType } from '@/types/animation'
import type { SceneObjectType } from '@/types/sceneObject'

// ============================================================================
// Types
// ============================================================================

export interface SceneObjectTypeMetadata {
    /** 类型图标 emoji */
    icon: string
    /** 类型中文标签 */
    label: string
    /**
     * 对应的 AnimationResourceType（用于查询 animationStore）。
     * 无动画能力的类型（如 camera/text/audio）不设置此字段。
     */
    animationResourceType?: AnimationResourceType
}

// ============================================================================
// Registry
// ============================================================================

const metadataRegistry = new Map<SceneObjectType, SceneObjectTypeMetadata>()

function register(type: SceneObjectType, metadata: SceneObjectTypeMetadata): void {
    metadataRegistry.set(type, metadata)
}

// ============================================================================
// 注册所有内置类型
// ============================================================================


register('background', { icon: '🖼️', label: '背景', animationResourceType: 'background' })
register('prop', { icon: '📦', label: '道具', animationResourceType: 'prop' })
register('audio', { icon: '🔊', label: '音频' })
register('camera', { icon: '📷', label: '相机' })
register('text', { icon: '📝', label: '文字' })
register('screen_effect', { icon: '🌟', label: '画面特效' })
register('composite', { icon: '🧩', label: '组合', animationResourceType: 'composite' })
register('symbol', { icon: '🔧', label: '元件' })
register('expression', { icon: '😀', label: '表情' })
register('light', { icon: '💡', label: '光源' })
// Clip-Mask Phase 1: 蒙版（图标用矩形样式 ▭，按 SceneObjectList 的 ellipse 分支单独覆盖）
register('mask', { icon: '▭', label: '蒙版' })

// ============================================================================
// 查询 API
// ============================================================================

/** 获取类型图标，未注册类型返回 '❓' */
export function getTypeIcon(type: string): string {
    return metadataRegistry.get(type as SceneObjectType)?.icon ?? '❓'
}

/** 获取类型标签，未注册类型返回 type 原值 */
export function getTypeLabel(type: string): string {
    return metadataRegistry.get(type as SceneObjectType)?.label ?? type
}

/**
 * 获取类型对应的 AnimationResourceType。
 * 返回 undefined 表示该类型不支持动画。
 */
export function getAnimationResourceType(type: string): AnimationResourceType | undefined {
    return metadataRegistry.get(type as SceneObjectType)?.animationResourceType
}

/** 获取完整的类型元数据 */
export function getTypeMetadata(type: string): SceneObjectTypeMetadata | undefined {
    return metadataRegistry.get(type as SceneObjectType)
}
