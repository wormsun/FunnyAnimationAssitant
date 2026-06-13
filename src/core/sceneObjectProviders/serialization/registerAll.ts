/**
 * 序列化器入口文件 — 确保所有序列化器注册到 registry
 *
 * sceneObjectStore 在使用序列化器前 import 此文件，触发所有 registerTypeSerializer() 调用。
 */

// 注意：import 顺序不影响功能，模块加载时自动执行 registerTypeSerializer()
// characterSerializer 已移除
import './backgroundSerializer'
import './audioSerializer'
import './propSerializer'
import './screenEffectSerializer'
import './compositeSerializer'
import './symbolSerializer'
import './expressionSerializer'
import './maskSerializer'
import './lightSerializer'
import './textSerializer'

// P2: 注册 composite 生命周期钩子（无 PIXI 依赖，安全用于测试环境）
import { registerCompositeLifecycleHooks } from '@/core/sceneObjectProviders/compositeProvider'
registerCompositeLifecycleHooks()
