/**
 * Action Handlers 统一导出
 * v8.6 P2: 统一 Action 处理逻辑
 * v9.3: 添加 SetVisualHandler 和 SetLifecycleHandler
 * v10.0: TriggerAnimHandler → SetAnimHandler
 */

// 类型导出
export * from './registry'
export * from './types'

// Handler 导出
export { CameraCutHandler } from './handlers/CameraCutHandler'
export { CameraMoveHandler } from './handlers/CameraMoveHandler'
export { SetCompositeHandler } from './handlers/SetCompositeHandler'
export { SetLifecycleHandler } from './handlers/SetLifecycleHandler'
export { SetLightHandler } from './handlers/SetLightHandler'
export { SetMaskHandler } from './handlers/SetMaskHandler'
export { SetMaterialHandler } from './handlers/SetMaterialHandler'
export { SetScreenEffectHandler } from './handlers/SetScreenEffectHandler'
export { SetTextHandler } from './handlers/SetTextHandler'
export { SetTransformHandler } from './handlers/SetTransformHandler'
export { SetVisualHandler } from './handlers/SetVisualHandler'
export { TweenLightHandler } from './handlers/TweenLightHandler'
export { TweenScreenEffectHandler } from './handlers/TweenScreenEffectHandler'
export { TweenTextHandler } from './handlers/TweenTextHandler'
export { TweenTransformHandler } from './handlers/TweenTransformHandler'

// 自动注册所有 Handler
import { CameraCutHandler } from './handlers/CameraCutHandler'
import { CameraMoveHandler } from './handlers/CameraMoveHandler'
import { SetCompositeHandler } from './handlers/SetCompositeHandler'
import { SetLifecycleHandler } from './handlers/SetLifecycleHandler'
import { SetLightHandler } from './handlers/SetLightHandler'
import { SetMaskHandler } from './handlers/SetMaskHandler'
import { SetMaterialHandler } from './handlers/SetMaterialHandler'
import { SetScreenEffectHandler } from './handlers/SetScreenEffectHandler'
import { SetTextHandler } from './handlers/SetTextHandler'
import { SetTransformHandler } from './handlers/SetTransformHandler'
import { SetVisualHandler } from './handlers/SetVisualHandler'
import { TweenLightHandler } from './handlers/TweenLightHandler'
import { TweenScreenEffectHandler } from './handlers/TweenScreenEffectHandler'
import { TweenTextHandler } from './handlers/TweenTextHandler'
import { TweenTransformHandler } from './handlers/TweenTransformHandler'
import { registerHandler } from './registry'

// 注册 Handler
registerHandler(SetTransformHandler)
registerHandler(SetVisualHandler)      // v9.3 新增
registerHandler(SetLifecycleHandler)   // v9.3
registerHandler(SetCompositeHandler)   // P2
registerHandler(SetMaskHandler)        // Clip-Mask Phase 1

registerHandler(TweenTransformHandler)
registerHandler(SetScreenEffectHandler)   // Phase 1 新增
registerHandler(SetLightHandler)          // 点光源 PRD Phase 0.5
registerHandler(SetMaterialHandler)       // v16 新增
registerHandler(SetTextHandler)           // Text PRD Phase 0
registerHandler(TweenScreenEffectHandler) // Phase 1 新增
registerHandler(TweenLightHandler)        // 点光源 PRD Phase 0.5
registerHandler(TweenTextHandler)         // Text PRD Phase 1
registerHandler(CameraCutHandler)
registerHandler(CameraMoveHandler)
