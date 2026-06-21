/**
 * Clip-Mask Phase 1 共享工具
 *
 * 详见 docs/features/clip-mask.md（v2.1）。
 * 本模块的实用函数被 maskSerializer / SetMaskHandler / Mask UI 等多个模块共用。
 */

import type { SceneObjectType } from '@/types/sceneObject'

/**
 * 判断给定 SceneObjectType 是否允许作为蒙版的裁切目标。
 *
 * Phase 1 允许：visual / spatial 类型（prop / text / symbol / expression / composite / background）
 * Phase 1 禁止：
 * - 'mask'：避免蒙版嵌套（Phase 1.5 才支持）
 * - 'camera' / 'audio' / 'light' / 'screen_effect'：非空间像素对象，无裁切语义
 */
export function isAllowedMaskTargetType(type: SceneObjectType): boolean {
  switch (type) {
    case 'prop':
    case 'text':
    case 'symbol':
    case 'expression':
    case 'composite':
    case 'background':
      return true
    case 'mask':
    case 'camera':
    case 'audio':
    case 'light':
    case 'screen_effect':
      return false
    default: {
      // 兜底：未知类型按禁用处理（出现新类型时强制走显式分支）
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}
