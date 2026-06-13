/**
 * PixiJS 对象调试工具
 * 为 PixiJS 对象添加调试信息，方便开发调试
 */

import type { Container } from 'pixi.js'

import type { SceneObject } from '@/stores/sceneObjectStore'

/**
 * 为 PixiJS 对象添加调试信息
 * @param displayObject PixiJS 显示对象
 * @param obj 场景对象数据
 * @param extraInfo 额外的调试信息
 */
export function addPixiDebugInfo(
  displayObject: Container,
  obj: SceneObject,
  extraInfo?: Record<string, unknown>
): void {
  // 设置对象名称，方便在控制台中识别
  displayObject.name = `${obj.type}_${obj.name}_${obj.id.slice(-6)}`

    // 挂载自定义调试数据
    ; (displayObject as unknown as { debugInfo: unknown }).debugInfo = {
      // 基础信息
      id: obj.id,
      type: obj.type,
      name: obj.name,

      // 位置和尺寸
      position: { x: obj.x, y: obj.y },
      size: { width: obj.width, height: obj.height },

      // 变换信息
      transform: {
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        rotation: obj.rotation,
        alpha: obj.alpha
      },

      // 层级和状态
      zIndex: obj.zIndex,
      visible: obj.visible,

      // 时间戳
      createdTime: Date.now(),

      // 额外信息
      ...extraInfo
    }
}

/**
 * 更新 PixiJS 对象的调试信息
 * @param displayObject PixiJS 显示对象
 * @param updates 要更新的字段
 */
export function updatePixiDebugInfo(
  displayObject: Container,
  updates: Record<string, unknown>
): void {
  const debugInfo = (displayObject as unknown as { debugInfo: Record<string, unknown> }).debugInfo
  if (debugInfo) {
    Object.assign(debugInfo, {
      ...updates,
      lastUpdated: Date.now()
    })
  }
}

/**
 * 打印 PixiJS 对象的调试信息
 * @param displayObject PixiJS 显示对象
 */
export function logPixiDebugInfo(displayObject: Container): void {
  const debugInfo = (displayObject as unknown as { debugInfo: unknown }).debugInfo
  if (debugInfo) {
    //console.log(`[PixiDebug] ${displayObject.name}:`, debugInfo)
  } else {
    console.warn('[PixiDebug] 对象没有调试信息:', displayObject)
  }
}

/**
 * 为子对象添加调试信息（部件、精灵等）
 * @param displayObject PixiJS 显示对象
 * @param name 子对象名称
 * @param info 调试信息
 */
export function addChildDebugInfo(
  displayObject: Container,
  name: string,
  info: Record<string, unknown>
): void {
  displayObject.name = name
    ; (displayObject as unknown as { debugInfo: unknown }).debugInfo = {
      name,
      ...info,
      createdTime: Date.now()
    }
}
