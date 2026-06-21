# ActionPreviewDialog 动画机制适配总结

## 概述

当前 `ActionPreviewDialog.vue` 不再维护独立渲染引擎，而是把单 Block 预览委托给 `ScenePlayer.vue` 的 `blockId` 模式。这样 Action 预览、单场景预览、全剧预览和视频导出可以复用同一套状态计算与渲染管线。

## 当前实现

| 模块 | 当前职责 |
|------|----------|
| `src/components/ActionPreviewDialog.vue` | 负责弹窗、目标 Block 定位、重置到上文状态、把 `blockId` 传给 ScenePlayer |
| `src/components/screenplay/ScenePlayer.vue` | 负责单 Block 播放、prevContext 初始状态、Shadow Object、相机初始状态、动画重播、音频与字幕同步 |
| `src/core/SceneObjectRenderer.ts` | 负责统一对象容器创建、状态应用、相机变换和渲染细节 |
| `src/core/AnimationController.ts` | 负责统一动画命令处理 |
| `src/core/GenericAnimationPlayer.ts` | 负责 prop/background/symbol/composite 等对象的通用动画播放 |

## 关键行为

1. `ActionPreviewDialog` 将 `sceneId`、`blockId`、当前 Episode 副本传入 `ScenePlayer`。
2. `ScenePlayer` 在 `blockId` 模式下只为目标 Block 生成播放信息。
3. 播放前通过 `calculatePrevContext` 获取目标 Block 之前的累计状态。
4. 动态对象通过 Shadow Object 机制进入单 Block 预览。
5. 跨 Block 的持续动画会在单 Block 初始帧中按当前状态重播，避免预览和全剧播放不一致。

## 历史问题的当前解法

| 历史问题 | 当前解法 |
|----------|----------|
| ActionPreviewDialog 曾有独立渲染分支，容易和 ScenePlayer 漂移 | 已改为直接使用 ScenePlayer `blockId` 模式 |
| 动态道具 / 背景帧动画重复触发 | 动画命令由统一 AnimationController / GenericAnimationPlayer 管线处理 |
| 角色或组合对象整体动画在局部预览中不一致 | 通过 SceneObjectRenderer、GenericAnimationPlayer 和 blockId prevContext 统一处理 |
| 资源预加载范围不足 | 资源收集和预加载逻辑集中在 ScenePlayer / useAssetLoader / ResourcePreloader 相关路径 |

## 验证重点

- Action Preview 与 Scene Preview 中同一个 Block 的初始姿态一致。
- 动态添加对象在目标 Block 中可见，且不会污染 Setup 状态。
- `set_anim`、`set_material`、`set_mask`、`set_light`、文本动画等 Action 在 Action Preview 中表现与全剧预览一致。
- 单 Block 预览不会重复触发帧动画，也不会在暂停/seek 后出现状态跳变。

## 当前代码位置

| 文件 | 说明 |
|------|------|
| `src/components/ActionPreviewDialog.vue` | 弹窗与 blockId 预览入口 |
| `src/components/screenplay/ScenePlayer.vue` | 单 Block / 单场景 / 全剧播放核心 |
| `src/utils/actionEvaluator.ts` | 动作运行时求值 |
| `src/utils/sceneStateCalculator.ts` | 静态状态计算 |
| `src/core/AnimationController.ts` | 动画 Action 控制 |
| `src/core/GenericAnimationPlayer.ts` | 通用动画播放器 |
