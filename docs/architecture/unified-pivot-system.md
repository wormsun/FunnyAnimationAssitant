# 统一变换点与 Pivot 系统设计说明

> **版本**: v2.0  
> **日期**: 2026-06-20  
> **状态**: 已按当前代码实现同步

---

## 1. 当前实现结论

当前代码没有在 `SceneObject` 上使用独立的 `pivot` 字段，也没有保留单独的 Python 数据迁移工具。公开代码中的变换点体系由两层组成：

| 层级 | 字段 / 模块 | 作用 |
|------|-------------|------|
| 场景对象变换原点 | `SceneObjectBase.transformOriginX/Y` | 相对对象默认 PivotBase 的像素偏移，用于编辑器中的旋转/缩放中心 |
| 动画轨道 pivot | `TransformTrack.pivot` | 动画轨道自己的像素级 pivot；未设置时沿用对象默认 pivot |
| 运行时补偿 | `SceneObjectRenderer`、`GenericAnimationPlayer`、`TransformPivotCompensation` | 在 pivot 或 transformOrigin 改变时补偿 position，避免画面跳动 |

## 2. SceneObject 的变换原点

`src/types/sceneObject.ts` 中的基础字段为：

```ts
transformOriginX?: number
transformOriginY?: number
```

语义：

- 单位是像素。
- 默认 `0, 0` 表示围绕对象的默认 PivotBase 旋转/缩放。
- 对非 composite 对象，PivotBase 通常来自对象几何中心或资源锚点。
- 对 union composite，PivotBase 由虚拟边界和 union 代理规则计算。
- 表情对象使用自身锚点语义，渲染时保持 anchor 位置稳定。

## 3. 动画轨道 Pivot

`src/types/animation.ts` 中 `TransformTrack.pivot` 是对象本地坐标系中的像素值：

```ts
pivot?: {
  x: number
  y: number
}
```

语义：

- 仅影响该 TransformTrack 的旋转/缩放中心。
- 未设置时不覆盖对象默认 pivot。
- 修改 track pivot 时，`TransformPivotCompensation.ts` 会按关键帧补偿位移，避免关键帧画面跳变。

## 4. 渲染与补偿路径

| 文件 | 当前职责 |
|------|----------|
| `src/core/SceneObjectRenderer.ts` | 根据对象尺寸、bounds、transformOrigin 计算 PIXI container.pivot 和 position 补偿 |
| `src/core/GenericAnimationPlayer.ts` | 播放动画时合成 transform 输出，并处理 pivot compensation |
| `src/core/TransformPivotCompensation.ts` | 编辑动画 pivot 时，对关键帧 x/y 做补偿 |
| `src/composables/useSceneRenderer.ts` | 编辑器中展示和拖拽变换点，写回 transformOriginX/Y |
| `src/components/character-editor/SceneObjectAnchorCanvas.vue` | 角色/部件锚点相关编辑界面 |

## 5. 设计取舍

1. 不额外引入 `SceneObject.pivot` 字段，避免与 `transformOriginX/Y`、PIXI `container.pivot`、动画 `TransformTrack.pivot` 三者混淆。
2. 场景编辑中的变换点使用像素偏移，便于和 PIXI 本地坐标、对象 bounds、composite 虚拟边界保持一致。
3. 动画轨道 pivot 与对象变换原点分离，允许同一个对象在不同动画中拥有不同旋转/缩放中心。
4. 所有 pivot 改动都必须配套 position 补偿，否则旋转/缩放中心改变时会出现视觉跳变。

## 6. 验证重点

| 场景 | 验证点 |
|------|--------|
| 拖拽对象变换点 | transformOriginX/Y 写入正确，画面不跳动 |
| 旋转/缩放对象 | 围绕当前变换点执行 |
| 编辑动画 pivot | 关键帧位置被补偿，动画画面连续 |
| union composite | 不依赖空代理容器的 localBounds，使用虚拟边界 |
| 预览 / 导出 | ScenePlayer 与 FrameCapture 的 pivot 表现一致 |
