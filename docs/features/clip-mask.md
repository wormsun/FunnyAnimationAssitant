# 裁切蒙版 (Clip Mask) 需求设计

> **本版本说明（v2.1，2026-04-30）**：本 PRD 采用"独立蒙版对象"方案（Unity / Figma 风格）。蒙版本身是普通场景对象，通过 `targetIds` 引用被裁切的对象。
>
## 1. 背景

### 1.1 创作需求

在沙雕动画、短剧分镜和角色演出中，经常需要让某个对象的局部区域不可见，而不是让整个对象消失。例如角色进入门后只露出上半身、人物掉进水里后水面以下被遮住、道具从画面边缘滑入时只显示进入画面内的部分。

当前系统已有对象移动、透明度、画面特效和屏幕遮罩能力，但它们更偏向"整对象变化"或"整画面覆盖"。如果用户想让一个角色的局部被门框、水面、窗口或边缘遮挡，通常需要拆分素材、额外制作遮挡道具，或者手动调整层级，制作成本高且不稳定。

裁切蒙版的目标是提供一种面向创作者的对象级裁切能力。

### 1.2 设计哲学：蒙版即对象

与"在每个支持类型上加一个 `clipMask` 属性"的方案不同，本设计将蒙版本身视为一个**独立的场景对象**（type 为 `mask`）。蒙版有自己的位置、尺寸、形状、变换、生命周期，并通过显式引用 `targetIds: string[]` 关联到一个或多个被裁切的目标对象。

这种思路与 Unity 的 `Mask` / `RectMask2D`、Figma 的剪切蒙版图层、Photoshop 的剪贴蒙版一致：蒙版与被裁对象解耦，二者通过引用建立关系，渲染时由系统按引用关系决定遮罩归属。

### 1.3 与"内嵌属性"方案的对比

| 维度 | 内嵌属性方案 | 蒙版对象方案（本 PRD） |
|---|---|---|
| Schema 影响面 | 6 类对象都新增 `clipMask?` 字段 + 6 个 serializer 守卫 | 仅新增 `MaskObject` 一种类型，旧类型零修改 |
| Action 体系 | 必须新增 `set_clip_mask` / `tween_clip_mask` 两个 handler 并自实现插值 | transform 类字段复用 `set_transform` / `tween_transform`；蒙版专属字段（targetIds / shape）通过 1 个新 handler `set_mask` 修改（参照 `set_composite`）；`mode` 保留为对象字段，当前仅保留一种值 |
| 旋转 / 锚点 | 矩形轴对齐，无法表达旋转裁切 | 天然支持（蒙版的 worldTransform 直接作用于 PIXI mask） |
| 多目标共享 | 不支持（1:1 内嵌） | 一个蒙版 `targetIds` 多元素，可同时裁多个对象 |
| 生命周期 | 跟随宿主对象 | 独立生死，可用 `set_active`、出生/消亡 Action 控制"裁切 3 秒后消失" |
| 时间轴可见性 | 隐藏在对象内部 | 蒙版以独立轨道出现，可像普通对象一样 ghost / real 预览 |
| 序列化 | 6 个 serializer 都要 round-trip | 1 个 `maskSerializer` |
| 自动化测试 | `SetMaskHandler.spec.ts` 与 `maskRenderer.spec.ts` | 覆盖 set_mask、序列化和渲染包装层 |

唯一新成本是**引用安全**（蒙版被删时清理目标对象的反向索引；目标被删时清理蒙版的 `targetIds`）。但项目中已存在 4 处指针式引用（`parentId` / `screen_effect.params.targetId` / `camera_follow.target` / pass-through target），引用清理是已被验证的成熟模式，不构成新风险。

## 2. 需求目标

### 2.1 核心目标

- 用户可以在场景中添加"蒙版"对象，将它关联到一个或多个被裁切的目标。
- 蒙版的位置、形状、显隐均可在 Setup 配置，并通过 Action 时间线驱动。
- 蒙版作为普通 SceneObject，自然继承移动、缩放、旋转、淡入淡出、补间等所有现有能力。
- 蒙版专属字段（targetIds / shape）可在时间线上通过 `set_mask` Action 动态修改，命名与 `set_composite` / `set_screen_effect` 保持一致。`mode` 在 Phase 1 仅一种值，不入 `set_mask` 参数。
- 预览 (ScenePlayer) 与导出 (FrameCapture) 像素一致。
- 不污染既有对象的 schema；新增 Action handler 限定为 1 个（`set_mask`）。

### 2.2 非目标

- 不提供路径、自由钢笔等向量编辑能力。
- 不提供柔化边缘 / 反向挖洞效果（蒙版自身有 `mode` 字段预留，但 Phase 1 仅实现 `inside_visible`）。
- 不提供把现有 SceneObject（道具、文本……）"借用"为蒙版的能力——蒙版就是 `MaskObject`。
- 不提供蒙版批量操作 UI（如"把当前选中的 N 个对象一起加进 targetIds"），只提供单选/多选下拉。
- 不提供跨场景共享蒙版。

## 3. 用户场景

### 3.1 角色进入门内（单目标）

用户添加一个矩形蒙版覆盖门洞，将其 `targetIds` 设为 `[character.id]`。角色走进门时，超出门洞的部分自动被裁掉。门、背景、其他角色不受影响。

### 3.2 水面遮挡（多目标共享）

用户添加一个矩形蒙版作为"水面以上"的可见区域，将 `targetIds` 设为 `[characterA, characterB, fish]`。这三个对象在下沉过程中都按同一水面规则裁切，`tween_transform` 让蒙版整体上移即可制造水位上升效果。

### 3.3 旋转裁切框（旋转门、舱门）

用户给蒙版加一个 `set_transform` 把 `rotation` 改成 30°，蒙版本身就是带旋转的矩形——被裁对象的可见区域自然是斜向矩形。不需要专门的 OBB 裁切实现。

### 3.4 蒙版动画

用户为蒙版自身创建一段 `tween_transform`：从画外滑入、放大、淡出。被裁对象的可见区域随之滑入、放大、消失。这一切完全复用普通对象的 transform 能力，无需新概念。

## 4. 产品概念

### 4.1 蒙版对象（MaskObject）

蒙版是 `type === 'mask'` 的 SceneObject。它具有：

- 全部 `SceneObjectBase` 字段：x, y, width, height, scaleX, scaleY, rotation, alpha, visible, zIndex, spawned, parentId, transformOriginX/Y 等。
- 蒙版专属字段：`shape`、`mode`、`targetIds`。
- 不可见性：蒙版自身**不参与画布渲染**，它只通过 `targetIds` 影响目标对象的可见区域。
- 可选辅助渲染：编辑器中以虚线框 + 半透明黄色显示，便于编辑；导出时不渲染。

### 4.2 形状

Phase 1 支持两种形状：

| shape | 几何 |
|---|---|
| `rectangle` | 由 width × height 定义的轴对齐矩形（蒙版自身 transform 决定旋转/缩放） |
| `ellipse` | 内切于 width × height 的椭圆 |


### 4.3 模式

| mode | 语义 |
|---|---|
| `inside_visible` | 形状内可见，形状外隐藏（Phase 1 默认/唯一） |

### 4.4 目标引用

`targetIds: string[]`：蒙版作用于哪些 SceneObject。规则：

- 目标对象类型限制：`prop / symbol / text / background / composite / expression`（`light / audio / camera / screen_effect / mask` 不可作为 target）。
- 目标被删除时，自动从所有蒙版的 `targetIds` 中清除。
- 蒙版被删除时，所有目标对象自动恢复完整显示，无需额外清理。

### 4.5 坐标语义

蒙版使用与普通 SceneObject **完全相同**的坐标系——它就是普通对象。其变换语义一致：

- `x, y` 是 pivot（默认中心）的世界坐标。
- `scaleX, scaleY, rotation` 作用于 width × height 形成的局部矩形。
- 蒙版处于 composite 内时，其 worldTransform 由父级合成。

被裁对象的可见区域 = 蒙版自身的 worldTransform × 形状几何。这与"画布坐标"语义在视觉上等价（蒙版在世界中），但**比"内嵌属性方案"多了完整的变换体系**。

不再有"裁切框是否跟随目标"的开关——蒙版要不要跟随某个对象，用 `parentId` 指向那个对象即可（这是已经存在的能力）。

## 5. 第一阶段范围

### 5.1 必须支持

| 能力 | 说明 |
|---|---|
| 添加蒙版 | 大纲/添加菜单中可"添加蒙版"，默认 rectangle / inside_visible |
| 编辑形状 | 矩形 / 椭圆切换；width / height 编辑 |
| 编辑变换 | x / y / scale / rotation 走普通对象 transform 路径 |
| 关联目标 | 多选下拉，可对一个蒙版选择多个目标对象 |
| 显隐 / 启用 | 通过 `visible` 或 `spawned` 控制蒙版是否生效 |
| Action 驱动（transform） | `set_transform` / `tween_transform` 驱动位置/缩放/旋转/alpha，与普通对象完全一致 |
| Action 驱动（蒙版专属） | `set_mask` 驱动 targetIds / shape（瞬时赋值） |
| 单目标 / 多目标 | targetIds 长度 1 ~ N 都能正确生效 |
| 预览导出一致 | ScenePlayer 与 FrameCapture 像素一致 |
| 兼容旧数据 | 旧场景文件不含 mask 对象，正常加载 |

## 6. 功能设计

### 6.1 创建蒙版

**入口**：

- 大纲面板 / 添加菜单："添加蒙版" → 弹出形状选择（矩形 / 椭圆）。
- 默认值：

| 字段 | 默认 |
|---|---|
| shape | `rectangle` |
| mode | `inside_visible` |
| width / height | 400 × 400 |
| x / y | 画布中心 |
| scaleX / scaleY / rotation | 1 / 1 / 0 |
| alpha / visible / spawned | 1 / true / true |
| zIndex | 自动分配（与普通对象同规则） |
| targetIds | `[]` |
| name | "蒙版 N"（自动编号） |
| alias | 同 name |

- 创建后默认选中蒙版，属性面板进入"蒙版编辑"状态，画布显示虚线辅助框。

### 6.2 关联目标

蒙版属性面板顶部的 **"裁切目标"** 区块：

- 当前 targetIds 列表（每行一个目标，显示别名 + 缩略图 + 删除按钮）。
- "+ 添加目标"按钮：弹出对象选择器，多选模式，过滤掉不可作为 target 的类型（light / audio / camera / screen_effect / 自身）。
- 已选目标点击可跳转选中该对象。

被裁目标的属性面板上不显示"我被谁裁了"——这是隐式信息，可在大纲中以图标提示（每个被裁目标右侧显示小蒙版图标，hover 显示蒙版列表）。

### 6.3 编辑形状与变换

- 形状切换：`shape` 下拉（rectangle / ellipse）。
- width / height：标准数值输入，与现有对象的 width/height 一致。
- 位置 / 缩放 / 旋转：完全复用 ObjectPropertiesPanel 的通用 transform 区块——蒙版就是普通对象。

### 6.4 画布交互

选中蒙版时：

- 显示蒙版自身的 9-handle 选框（4 角 resize + 4 边中点 resize + 1 中心 move），与普通对象选框完全一致。
- 选框颜色与普通对象区分（建议黄色虚线 + 内部半透明黄色填充 alpha 0.15，提示蒙版区域）。
- 选中状态下蒙版"自身"在画布上以半透明颜色提示（仅编辑器，不进入导出）。

未选中蒙版时：

- 蒙版不在画布上显示（仅通过其作用于目标对象的裁切效果间接可见）。
- 大纲中可以手动切换"蒙版预览"开关，开启后所有蒙版都以虚线形式显示。

### 6.5 显隐与启用

- `visible: false` → 蒙版当前帧不裁切（目标对象完整显示）。`visible` 在时间线上通过 `set_transform` / `tween_transform` 控制（与普通对象一致）。
- `spawned: false` → 蒙版未出生 / 已消亡，等同于不存在；生命周期由出生 / 消亡 Action 管理。

### 6.6 Action 模式

蒙版的 transform 动画完全复用普通对象路径；蒙版专属字段通过新增的 `set_mask` Action 驱动（命名与 `set_composite` / `set_screen_effect` 一致）：

| Action | 类型 | 用途 |
|---|---|---|
| `set_transform` | 现有 | 瞬时改变蒙版 x / y / scaleX / scaleY / rotation / alpha / visible / zIndex |
| `tween_transform` | 现有 | 补间蒙版 x / y / scaleX / scaleY / rotation / alpha |
| `set_mask` | **新增** | 瞬时修改蒙版 targetIds / shape（部分更新语义，params 中给哪些字段就改哪些；`mode` 不入参，Phase 1 仅一种值） |
| 出生 / 消亡 Action | 现有 | 蒙版生命周期管理 |

`set_mask` 的详细 schema 与实现见 §11.4。

**为什么不拆分为 `set_mask_targets` / `set_mask_shape` / `set_mask_mode` 三个 Action？**

- 三个字段都是蒙版专属且极少同时变动，同一个 slot 上多个 `set_mask` 的 upsert 合并起来表达力完全够用。
- 与 `set_composite` 同样采用部分更新语义，表单 / Inspector / serializer 代码路径可复用 set_composite 模板。
- 后续若蒙版增加专属字段（如 `feather`），补充 `set_mask` 的 params 即可，不需频繁新增 Action 类型。

**不实现 `tween_mask` 的原因**：targetIds 为集合、shape 为枚举，都无插值语义。若后期增加可插值字段（如 feather），单独增加 `tween_mask`。

### 6.7 时间线展示

蒙版作为独立对象，在时间线上拥有自己的轨道，与普通对象一致：

- 轨道名 = 蒙版别名。
- 轨道图标使用专用蒙版图标（剪刀或菱形）。
- 轨道上的 Action 显示"移动 / 缩放 / 旋转 / 淡入淡出"等通用名称（不是"裁切变化"）。
- 用户的心智完全统一为"操作一个对象"。

## 7. 状态规则

### 7.1 Setup 状态

蒙版作为 SceneObject 持久化在 `setupState.objects` 中，与其他对象一同序列化到磁盘。无需新增任何外层结构。

### 7.2 Runtime 状态

进入 Action 模式 / 预览 / 导出时，蒙版同样通过 `actionEvaluator.evaluateObjectStateBySlot` 计算 Runtime 状态，与普通对象走完全相同的路径。`set_mask` Action 的应用以合并语义覆盖 Runtime 的 targetIds / shape（参§11.4）。渲染层在每帧应用蒙版前读取其 Runtime 状态。

### 7.3 复制蒙版

复制蒙版时：

- `targetIds` 默认 **不复制**（避免创建副本时把多个对象同时变成被裁——这通常不是用户意图）。复制后蒙版的 targetIds 为空，需要用户手动设置。
- 其他字段（位置、形状、变换）按普通对象复制规则处理（含 +50 偏移）。

### 7.4 删除蒙版

蒙版被删除时：

- 直接从 `setupState.objects` 移除。
- 所有目标对象在下一帧自动恢复完整显示（渲染层在帧开始时重建反向索引，无需主动清理）。

### 7.5 删除目标

目标对象被删除时：

- 遍历所有蒙版，把 `targetIds` 中等于该目标 id 的元素移除（在 `removeObject` 的清理 hook 中完成）。
- 与现有 `parentId` / `screen_effect.params.targetId` / `camera_follow.target` 的清理路径并列。

### 7.6 成组与解组

- 蒙版可以作为 composite 子对象。这种情况下蒙版的 worldTransform 由组合合成（与普通子对象一致），自然支持"一个组合内的蒙版裁切组合内/外的目标"。
- composite 解组时，蒙版按普通子对象规则处理（变换补偿到世界坐标），`targetIds` 不变。
- composite 自身可以作为目标加入 `targetIds`（裁切整个组合输出）——见 §11.3。

## 8. UI 需求

### 8.1 大纲面板

- 大纲列表中蒙版以专用图标（虚线矩形 + 剪刀）展示。
- 默认与普通对象同列显示，可由"按类型分组"开关分到独立的"蒙版"组。
- 大纲右键菜单："新增蒙版（矩形 / 椭圆）"。
- 被任一蒙版引用的目标对象，行尾显示"已被 N 个蒙版裁切"指示器（hover 显示列表与跳转链接）。

### 8.2 蒙版属性面板

蒙版选中时，ObjectPropertiesPanel 走专用渲染分支：

- 顶部："裁切目标" 区块（多选下拉 + 已选列表）。
- 中部："形状" 区块（shape 下拉、mode 下拉、width / height）。
- 下部：通用 transform / 显隐 / zIndex 区块（与普通对象一致）。
- 隐藏：素材选择、动画轨道、初始动画、字体、灯光参数等不适用项。

### 8.3 画布编辑选框

蒙版的选框已在 §6.4 描述。要点：

- 复用现有 9-handle 选框组件，仅换颜色与样式。
- 拖拽内部 → 平移；拖角 → 双轴 resize；拖边中点 → 单轴 resize；不显示旋转手柄（旋转通过属性面板输入或 Action 实现，与普通对象一致）。
- 蒙版的辅助矩形/椭圆轮廓只在编辑器渲染，FrameCapture 路径不绘制。

### 8.4 添加菜单

`SetupEditor` 与 `ActionEditor` 的添加菜单都新增"蒙版"分组，包含：

- 矩形蒙版
- 椭圆蒙版

### 8.5 错误与提示

- 蒙版的 targetIds 为空时，蒙版属性面板显示提示"该蒙版尚未关联任何目标，添加目标后才会生效"。
- 蒙版以一个被禁用的目标类型（如 light、mask 本身）作为 target 时，UI 阻止选择并提示。
- 同一目标已被另一个有效蒙版占用时，UI 阻止加入并提示“该目标已被蒙版《XX》裁切”。
- targetIds 中包含已不存在的 id（数据损坏）时，加载阶段静默剔除。

## 9. 验收标准

### 9.1 基础验收

- 用户可创建矩形 / 椭圆蒙版。
- 关联单个目标后，蒙版形状内可见、形状外不可见，其他对象不受影响。
- 一个蒙版关联多个目标时，所有目标都按蒙版规则裁切。
- 蒙版 visible=false 或 spawned=false 时，目标完整显示。
- 删除蒙版后所有目标恢复完整显示。
- 删除目标后蒙版的 targetIds 自动同步。
- Phase 1 单蒙版独占：尝试在 UI 中给某目标加第二个蒙版时被拒绝并提示；脏数据场景下加载静默剔除。

### 9.2 Action 验收

- `set_transform` 改变蒙版位置 / 缩放 / 旋转，被裁目标的可见区域随之改变。
- `tween_transform` 在持续时间内平滑驱动蒙版变换。
- `set_mask` 修改 targetIds / shape：部分更新语义生效，同一 slot 内 upsert 合并。
- 蒙版与目标对象同时各有 Action 时，互不干扰。
- 蒙版本身的出生 / 消亡 Action 正常工作。

### 9.3 预览 / 导出

- ScenePlayer 与 FrameCapture 像素一致。
- 多分辨率（720p / 1080p / 4K）导出无错位。
- 蒙版的 transform 变化在导出视频中正确呈现。

### 9.4 回归

- 不创建任何蒙版的旧场景，渲染、Action、导出零回归。
- 既有 `text_box_mask`、`screen_effect` 的遮罩功能不受影响。
- 性能：场景中有 0/5/20 个蒙版时，编辑器和预览的 FPS 无明显劣化（≥ 95%）。

### 9.5 引用安全

- 删除目标对象后，立即检查所有蒙版的 targetIds，确认目标 id 已剔除。
- 删除蒙版后，立即检查所有目标对象渲染恢复正常。
- 反序列化时，targetIds 中的死引用被静默剔除，加载继续。

## 11. 技术方案

### 11.1 数据模型

新增 `MaskObject` 接口：

```typescript
// src/types/sceneObject.ts

export type MaskShape = 'rectangle' | 'ellipse'

export interface MaskObject extends SceneObjectBase {
  type: 'mask'
  shape: MaskShape
  mode: MaskMode
  targetIds: string[]
  // 继承自 SceneObjectBase：x, y, width, height, scaleX, scaleY, rotation,
  // alpha, visible, spawned, parentId, transformOriginX/Y, zIndex, name, alias …
}
```

`SceneObject` 联合类型新增成员：

```typescript
export type SceneObject =
  | PropObject | SymbolObject | TextObject | BackgroundObject
  | CompositeObject | ExpressionObject | LightObject | AudioObject
  | CameraObject | ScreenEffectObject
  | MaskObject  // 新增
```

`SceneObjectType` 联合追加 `'mask'`。

**已支持类型零修改**——这是本方案最大的好处。

### 11.2 序列化

当前序列化器 `src/core/sceneObjectProviders/serialization/maskSerializer.ts`，注册到 `getTypeSerializer` registry：

```typescript
const maskSerializer: TypeSerializer = {
  serializeFields(obj, base) {
    const m = obj as MaskObject
    base['shape'] = m.shape
    base['mode'] = m.mode
    base['targetIds'] = [...m.targetIds]
  },
  deserialize(objData, ctx) {
    const m = objData as MaskObject
    ctx.createMaskObject(m.id, m.alias ?? '', m.shape, m.mode)
    ctx.updateObject(m.id, {
      x: m.x, y: m.y, width: m.width, height: m.height,
      scaleX: m.scaleX, scaleY: m.scaleY, rotation: m.rotation,
      alpha: m.alpha, visible: m.visible, spawned: m.spawned,
      zIndex: m.zIndex, parentId: m.parentId,
      transformOriginX: m.transformOriginX, transformOriginY: m.transformOriginY,
    })
    // targetIds 不能在这里直接赋值：反序列化是逐对象进行的，
    // 被引用的其他对象可能还未创建。
    // 记录到 ctx.pendingMaskTargets，在所有对象创建完成后统一处理。
    ctx.pendingMaskTargets.push({ maskId: m.id, targetIds: [...(m.targetIds ?? [])] })
  },
}
registerTypeSerializer('mask', maskSerializer)
```

**两阶段加载**（在 `fromSetupObject` 末尾调用）：

```typescript
// 阶段 2：创建完所有对象后，回填 targetIds 并过滤死引用 / 非法类型 / 重复占用
for (const { maskId, targetIds } of ctx.pendingMaskTargets) {
  const validIds = targetIds.filter(id => {
    const obj = ctx.getObject(id)
    if (!obj) return false                                  // 死引用
    if (!isAllowedMaskTargetType(obj.type)) return false    // 非法类型（含 mask 本身）
    return true
  })
  // Phase 1 单蒙版独占检查：如果某个 target 已被其他 mask 占用，则跳过并 warning
  const finalIds = validIds.filter(id => !ctx.isTargetClaimed(id, maskId))
  ctx.updateObject(maskId, { targetIds: finalIds })
  for (const id of finalIds) ctx.claimTarget(id, maskId)
}
```

`DeserializeContext` 新增：

- `createMaskObject` 工厂方法（与现有 `createPropObject` 等并列）。
- `pendingMaskTargets: Array<{ maskId, targetIds }>`：阶段 1 收集、阶段 2 回填。
- `claimedTargets: Map<targetId, maskId>`：Phase 1 单蒙版独占检查辅助。

两阶段加载同时处理：死引用、非法类型（含 mask→mask 嵌套）、Phase 1 单蒙版独占冲突三种场景，都静默剔除并打 warning。

### 11.3 渲染管线

当前实现文件 `src/core/maskRenderer.ts`，**取代**此前设想的 `clipMaskRenderer.ts`。

**坐标原则**（与审查反馈对齐）：蒙版的幾何以 **worldTransform** 为准。Phase 1 实现上，将 mask 的 `PIXI.Graphics` 节点作为 wrapper 的子节点时，必须把 mask 的 worldTransform 转换为 wrapper 的局部变换后再赋值，不能直接拷贝 `mask.x / y / scale / rotation`。

核心结构：

```typescript
export interface MaskRendererResources {
  maskGraphicsMap: Map<string, PIXI.Graphics>          // maskId → 蒙版图形节点
  wrapperMap: Map<string, PIXI.Container>              // targetId → 包装层
  // 反向索引每帧重建
}

/**
 * 每帧渲染前调用：根据当前 setup + runtime 状态，重建"目标 → 蒙版"反向索引，
 * 并把 PIXI mask 应用到对应的包装层。
 */
export function applyAllMasks(
  resources: MaskRendererResources,
  objects: SceneObject[],
  getContainer: (id: string) => PIXI.Container | undefined,
  getRuntimeState: (id: string) => SceneObject,
): void {
  // 1. 反向索引：targetId → MaskObject（Phase 1 单蒙版独占；
  const reverse = new Map<string, MaskObject>()
  for (const obj of objects) {
    if (obj.type !== 'mask') continue
    const mask = getRuntimeState(obj.id) as MaskObject
    if (!mask.spawned || !mask.visible) continue
    if (!mask.targetIds?.length) continue
    // Phase 1 仅支持 inside_visible；outer 出现时降级并 warning（防御脏数据）
    if (mask.mode !== 'inside_visible') {
      console.warn(`[maskRenderer] mode=${mask.mode} not supported in Phase 1, fallback to inside_visible`)
    }
    for (const tid of mask.targetIds) {
      if (reverse.has(tid)) {
        console.warn(`[maskRenderer] target ${tid} already claimed; ignoring mask ${mask.id}`)
        continue
      }
      reverse.set(tid, mask)
    }
  }

  // 2. 对每个被引用目标：应用 mask
  for (const [tid, mask] of reverse) {
    const targetContainer = getContainer(tid)
    if (!targetContainer) continue
    applyMaskTo(resources, targetContainer, tid, mask)
  }

  // 3. 拆除：上一帧有 wrapper 但本帧不应用的目标
  for (const [tid, wrapper] of resources.wrapperMap) {
    if (!reverse.has(tid)) {
      detachWrapper(wrapper, tid, resources)
    }
  }
}

function applyMaskTo(
  resources: MaskRendererResources,
  targetContainer: PIXI.Container,
  targetId: string,
  mask: MaskObject,
): void {
  // 确保包装层存在（从原父级摘下、用 wrapper 包住、放回原位）
  let wrapper = resources.wrapperMap.get(targetId)
  if (!wrapper) wrapper = createWrapper(targetContainer, targetId, resources)

  // 确保 mask 图形存在
  let g = resources.maskGraphicsMap.get(mask.id)
  if (!g) {
    g = new PIXI.Graphics()
    g.name = `mask_${mask.id}`
    // mask 图形作为 wrapper 的子节点（不参与渲染，仅用于变换）
    wrapper.addChild(g)
    resources.maskGraphicsMap.set(mask.id, g)
  }

  // 绘制形状（局部坐标，由 mask.transform 决定世界位置）
  g.clear()
  g.beginFill(0xffffff)
  if (mask.shape === 'ellipse') {
    g.drawEllipse(0, 0, mask.width / 2, mask.height / 2)
  } else {
    g.drawRect(-mask.width / 2, -mask.height / 2, mask.width, mask.height)
  }
  g.endFill()

  // 坐标依据：mask 的 worldTransform 转换为 wrapper 的局部变换
  // 原因：mask 的 SceneObject 变换以世界（或其 parentId composite）为参考；
  // 但 g 处于 wrapper 之下，wrapper 处于 target 的原父级之下，二者 worldTransform 不同。
  // 必须做：g.worldTransform := mask.worldTransform
  //   → 数学定义：local := multiply( invert(wrapperWorld), maskWorld )
  //     严格定义：对任意列向量 p，local · p == invert(wrapperWorld) · (maskWorld · p)
  //   在 PIXI v7 中一种实现（代码上线前必须跟 PIXI Matrix 语义逐行验证）：
  //     const local = wrapperWorld.clone().invert()    // local := invert(wrapperWorld)
  //     local.append(maskWorld)                        // local := local * maskWorld
  //   ⚠️ PIXI 的 append / prepend 语义在版本间有过变动，实现时必须用一对验证用例
  //     （例如让 mask 在 composite 中偏移 并检查实际位置），避免 “调用顺序看起来对但乘法顺序错” 的陷阱。
  const local = computeLocalTransform(wrapper.worldTransform, computeMaskWorldTransform(mask))
  g.transform.setFromMatrix(local)
  // ⚠️ 严禁直接 g.position.set(mask.x, mask.y) / g.scale.set(…) / g.rotation = mask.rotation——
  //    那会把世界坐标当作 wrapper 局部坐标，在 composite / 相机缩放 / 任何父级 transform 下错位。

  wrapper.mask = g
}
```

要点：

- `applyAllMasks` 在 `SceneObjectRenderer.applyObjectState` 全部完成之后、composite RenderTexture 更新之前调用一次，整帧统一处理。调用前需确保 PIXI 已递归计算了 wrapper.worldTransform（必要时调用 `wrapper.updateTransform()`）。
- 反向索引每帧重建，运行时新增/删除蒙版自动生效，无需事件订阅。
- Phase 1 单蒙版独占：reverse 为 `Map<targetId, MaskObject>`；后来者被丢弃并 warning。
- Phase 1 仅支持 `mode === 'inside_visible'`；其他值仅 warning + 降级（防御脏数据）。
- 包装层与现有 `text_box_mask`、`screen_effect` mask 互不干扰。

### 11.4 Action 体系

蒙版的 transform 动画零新增 handler（复用现有路径）；蒙版专属字段新增 **1 个** handler：`set_mask`（参照 `set_composite` 模式）。

#### 11.4.1 复用现有 handler

| Action | 适用蒙版字段 | 说明 |
|---|---|---|
| `set_transform` | x, y, scaleX, scaleY, rotation, alpha, visible, zIndex | 与普通对象完全一致 |
| `tween_transform` | x, y, scaleX, scaleY, rotation, alpha | 与普通对象完全一致 |
| 出生 / 消亡 Action | spawned | 生命周期 |

#### 11.4.2 新增 `set_mask` handler

```typescript
// src/utils/actionHandlers/handlers/SetMaskHandler.ts

export interface SetMaskParams {
  targetIds?: string[]      // 可选：整体替换蒙版的裁切目标列表
  shape?: MaskShape         // 可选：rectangle | ellipse
}

export interface SetMaskAction {
  type: 'set_mask'
  target: string            // mask 对象的 alias / id
  slotIndex: number
  params: SetMaskParams
}

const setMaskHandler: ActionHandler<SetMaskAction> = {
  type: 'set_mask',
  applyToState(state, action) {
    const obj = state.objects.find(o => o.id === resolveTargetId(action.target, state))
    if (!obj || obj.type !== 'mask') return
    const m = obj as MaskObject
    const p = action.params

    if (p.targetIds !== undefined) {
      // Phase 1 检查：过滤不存在 / 非法类型 / 嵌套 / 已被其他蒙版独占的 id
      m.targetIds = p.targetIds.filter(id => {
        const tgt = state.objects.find(o => o.id === id)
        if (!tgt || !isAllowedMaskTargetType(tgt.type)) return false
        const claimed = state.objects.find(
          o => o.type === 'mask' && o.id !== m.id && (o as MaskObject).targetIds?.includes(id),
        )
        if (claimed) {
          console.warn(`[set_mask] target ${id} already claimed by mask ${claimed.id}; dropped`)
          return false
        }
        return true
      })
    }
    if (p.shape !== undefined) m.shape = p.shape
  },
  // 不实现 interpolate——瞬时型 Action，与 set_active / set_composite 一致
}
registerHandler(setMaskHandler)
```

**Upsert 语义**（与 `set_composite` 一致）：在 `ActionEditor.handleObjectUpdateInActionMode` 中，同 slot + 同 target 的 `set_mask` 合并 params，同名字段后者覆盖前者。

#### 11.4.3 同槽跨蒙版 target 转移语义

场景：用户在同一个 slot 内把目标 X 从 mask A 转移给 mask B，需同时生成 “`A.targetIds` 移除 X” 与 “`B.targetIds` 加入 X” 两个 `set_mask` Action。若各自独立应用，独占检查会依赖 Action 顺序（先应用 B 则 X 仍被 A 独占→ B 会被丢弃）。定义以下两重保证：

1. **ActionEditor 生成顺序**（预防）：当同一次用户操作产生多个 `set_mask` 时，必须按“先释放后占用”排序写入：先 push 减少 targetIds 的 Action，后 push 增加 targetIds 的 Action。该顺序需体现在 `handleObjectUpdateInActionMode` 的 diff 处理中（参§11.6）。
2. **Evaluator 同槽 target 维度归并**（兑底）：`actionEvaluator` 不能按 Action 级别分类“释放/占用”——`set_mask.targetIds` 是整体替换，单个 Action 可能同时释放 X 并新增 Z（例如 A 从 `[X,Y]` 改为 `[Y,Z]`），新集合既非旧的子集也非超集。正确做法是**先按 mask 折叠、再按 target 维度归并**：
   1. **折叠**：对当前 slot 的所有 `set_mask`，按目标 mask 分组，组内按时间顺序套用 upsert 合并（§11.4.2），得到每个 mask 的最终 `targetIds_final`（仅取本 slot 显式声明 `targetIds` 的 mask 参与；未声明者沿用上游状态）。
   2. **归并裁决**：对每个 target id `t`，构造 `Claimers(t)` 集合：
      - 本 slot 中 `targetIds_final` 含 `t` 的所有 mask；
      - **另加上“上游已占用 `t` 且本 slot 未参与”的原 owner mask**——未参与表示本 slot 没有针对该 mask 的 `set_mask`，意图上仍维持占用。
      裁决规则：
      - `|Claimers(t)| === 0`：`t` 被释放，从参与 mask 的 `targetIds_final` 中确认移除。
      - `|Claimers(t)| === 1`：唯一占用者拿到 `t`；如果它是原 owner（未参与），本 slot 不写回。
      - `|Claimers(t)| >= 2`：发生冲突，按 mask 在 `state.objects` 中的稳定索引升序取首位（与反序列化/handler 同潜规则一致：后来者被剔），其余从其 `targetIds_final` 中剔除并 warn `[set_mask] target ${t} contested by [...]; granted to ${winner}`。**原 owner 因起始索引较小，默认胜出**，避免“本 slot 只靠 B 声明就能隐式抢到 A 的 X”。
   3. **写回**：只修改本 slot 显式参与的 mask——把它们的 `targetIds` 设为裁决后的 `targetIds_final`；**未参与的 mask（含原 owner）不受影响**，避免隐式释放造成静默数据转移。“从 A 到 B”的跨蒙版转移要求上游显式生成 `A.targetIds` 不含 X 的 `set_mask`（该 Action 会使 A 成为参与者且 `Claimers(t)` 不含它），ActionEditor 的 “释放优先”生成顺序（§11.4.3 第 1 条）保证了这一点。

  该归并算法对“A: `[X,Y]` → `[Y,Z]`，B: `[]` → `[X]`”的同槽转移给出确定结果（A 最终 `[Y,Z]`、B 最终 `[X]`），与 Action 在 slot 内的排序无关。`SetMaskHandler.applyToState` 的独占校验仅作为单 Action 路径上的防御（`SetMaskHandler` 仍按 §11.4 实现，但 evaluator 在同 slot 多 `set_mask` 场景下用归并结果覆盖）。

两重保证采用 “AND”：ActionEditor 保证“干净”的预期顺序便于人读时间线，evaluator 保证即使顺序被人为交换（如手动拖动时间轴上的 Action）表现仍然正确。单个 slot 内同一 mask 的 set_mask 仍走 upsert 合并（§11.4.2），归并阶段读取的是合并后结果，二者不冲突。

**不实现 `tween_mask`**：targetIds 为集合、shape 为枚举，都无插值语义。

**SetTransformHandler 的蒙版专属字段隔离**：`shape` / `mode` / `targetIds` 不在 transform 字段白名单，现有 schema 守卫天然拒绝，无额外代码。

### 11.5 引用清理

在 `sceneObjectStore.removeObject` 的 lifecycle hook 中追加蒙版引用清理：

```typescript
function cleanupMaskReferences(removedId: string) {
  const masks = setupState.value.objects.filter(o => o.type === 'mask') as MaskObject[]
  for (const m of masks) {
    if (m.targetIds.includes(removedId)) {
      m.targetIds = m.targetIds.filter(id => id !== removedId)
    }
  }
}
```

蒙版自身被删除时，无需主动清理目标——下一帧 `applyAllMasks` 重建反向索引时，该 mask 已不在 objects 中，自然不进入索引，对应 wrapper 在 step 3 被拆除。

### 11.6 编辑器集成

**画布选框**（`useSceneRenderer.ts`）：

- 蒙版选中时复用现有 9-handle 选框逻辑（4 角 + 4 边 + 中心 move），仅替换 handle 颜色配色（黄色系）和 outline 虚线样式。
- 完全不需要"hitArea 空心环"、"dragBody 多边形"等任何 hack——蒙版选框就是普通对象选框。

**属性面板**（`ObjectPropertiesPanel.vue`）：

- 加 `obj.type === 'mask'` 分支：
  - 顶部 `<MaskTargetsSection>` 多选目标。
  - 中部 `<MaskShapeSection>` 形状/模式/尺寸。
  - 下部复用 transform / display 通用区块。
- 隐藏：素材区、灯光区、文本区、动画区等。

**ActionInspector**：

- transform Action 表单天然可用（mask 作为普通 SceneObject）。
- 新增 `set_mask` 表单分支（参照 [ActionInspector.vue#L380](../../src/components/ActionInspector.vue#L380) 的 `set_composite` 实现）：列出 params 中已设的字段（targetIds / shape）+ “添加字段”下拉（未设字段可加入）+ 每字段可移除。不提供 `mode` 选项。
- targetIds 表单使用与 MaskTargetsSection 同一个多选下拉组件。

**ActionEditor `handleObjectUpdateInActionMode`**：

- 拖拽蒙版改变 transform → upsert `set_transform` / `tween_transform`，与普通对象走相同的 diff 路径。
- 修改蒙版的 `targetIds` / `shape` → upsert `set_mask`（参照 [ActionEditor.vue#L1645](../../src/components/ActionEditor.vue#L1645) 的 `set_composite` upsert 模板），同 slot + 同 target 合并 params。`mode` 在 Phase 1 不进入 diff。
- Setup 模式下修改这些字段则直接写入 `setupState`，不生成 Action（与现有 Setup 模式表现一致）。

### 11.7 添加菜单

`SetupEditor` 与 `ActionEditor` 的添加菜单加 "蒙版" 分组：

```typescript
// 添加蒙版逻辑（伪代码）
function handleAddMask(shape: MaskShape) {
  const mask = sceneObjectStore.createMaskObject({
    shape, mode: 'inside_visible',
    width: 400, height: 400,
    x: canvasWidth / 2, y: canvasHeight / 2,
    targetIds: [],
  })
  sceneObjectStore.addSetupObject(mask)
  sceneObjectStore.selectObject(mask.id)
}
```

`createMaskObject` 是 store 新增工厂方法（与 `createPropObject` 等并列），生成默认值并分配 id / zIndex。

### 11.8 类型守卫与白名单

- `selectableTargetTypes` = `{ prop, symbol, text, background, composite, expression }`：MaskTargetsSection 的多选下拉过滤（`mask` 不在该集合中，Phase 1 不支持嵌套裁切）。
- `isAllowedMaskTargetType(type)` 实用函数在 Setup、Action、反序列化三处复用，作为唯一查验点。
- `maskCompatibleParents` = 与普通对象一致：mask 可以作为 composite 子对象，可以作为 root 对象。
- 反序列化时发现以下任一场景，静默剔除并打 warning：死引用（id 不存在）、非法类型（含 mask）、Phase 1 独占冲突、`mode !== 'inside_visible'`。

### 11.9 测试

| 测试 | 内容 |
|---|---|
| `MaskObject.spec.ts` | 创建 / 序列化 round-trip（含非空 targetIds） / targetIds 添加删除 / 引用清理 / 反序列化死引用与独占冲突剔除 |
| `maskRenderer.spec.ts` | 反向索引构建 / 包装层创建拆除幂等性 / 单目标 / world→local 坐标转换正确（含 composite 与相机缩放） |
| `SetMaskHandler.spec.ts` | 部分更新语义 / Upsert 合并 / Slot 跨帧状态 / target 不存在时静默 / Phase 1 独占冲突剔除 |
| `transform.spec.ts` (扩展) | mask 类型走 set_transform / tween_transform 与 prop 行为一致 |
| 集成（手动 / 浏览器） | §9 全部验收清单 |

不再需要专属的 `Set/TweenClipMaskHandler.spec.ts`（v1 设计遗留）。

### 11.10 与现有 mask 的隔离

| 层级 | mask 用途 | 由谁管理 |
|---|---|---|
| `wrapper.mask = maskGraphics` | 蒙版对象裁切（本 PRD） | `maskRenderer.ts` |
| `objectContainer.mask = text_box_mask` | 固定文本框裁切 | `useSceneGraph.ts` |
| `objectContainer.mask = screenEffectMask` | 屏幕特效遮罩 | `SceneObjectRenderer.ts` |

三者作用于不同 DisplayObject，互不冲突。文本对象 `textBoxMode='fixed'` + 蒙版裁切时，外层 wrapper 裁画布形状、内层文本框裁字符区域，最终可见区域 = 两者交集。

## 12. 已锁定决策

| 议题 | 决定 |
|---|---|
| 数据形态 | 独立 SceneObject `type: 'mask'`，不内嵌属性 |
| transform 动画 | 复用 `set_transform` / `tween_transform`，零新增 handler |
| 蒙版专属字段可时间线驱动 | 是。`targetIds` / `shape` 通过新增 `set_mask` Action 修改（`mode` 阶段性只有一种值，暂不入参） |
| 新增 Action 数量 | 1 个：`set_mask`（名与 `set_composite` / `set_screen_effect` 保持一致风格） |
| `set_mask` 语义 | 部分更新 + Upsert（与 `set_composite` 一致）；不实现 `tween_mask` |
| Phase 1 形状 | rectangle、ellipse |
| Phase 1 模式 | 仅 inside_visible；MaskMode 联合类型只含该一个值 |
| 目标引用 | `targetIds: string[]`，多对一允许（一个蒙版裁多个目标） |
| 旋转 | 通过蒙版自身 rotation 字段实现，天然支持 |
| **坐标依据** | 蒙版几何以 worldTransform 为准；Graphics 在 wrapper 下需 `wrapper.worldTransform.invert() * mask.worldTransform` 转换 |
| 跟随目标 | 通过 `parentId` 实现（与组合对象同机制），不引入专用开关 |
| 复制语义 | 不复制 targetIds（避免副本意外影响多对象） |
| 引用清理位置 | `removeObject` lifecycle hook + 反序列化死引用与冲突剔除 |

## 13. 状态

需求已锁定（§1–§10、§12）。技术方案（§11）通过设计评审，进入实施。

实施进度跟踪：见 §14 各 Stage 的 Gate 与 §15 风险表。

## 14. 实施方案

按"小步快走、可独立回滚"原则分 5 个 Stage。每个 Stage 末尾设置 Gate，Gate 不通过不进入下一 Stage。

### 14.1 Stage A：类型与序列化骨架

**目标**：在不影响任何现有行为的前提下，引入 `MaskObject` 类型并能 round-trip 持久化。本 Stage **不修改任何渲染逻辑**，蒙版创建后在画布上不可见、不裁切。

| 任务 | 文件 |
|---|---|
| A1 | `src/types/sceneObject.ts` — 新增 `MaskObject` / `MaskShape` / `MaskMode`（`MaskMode = 'inside_visible'` 仅一种值）；`SceneObject` 联合追加；`SceneObjectType` 联合追加 `'mask'` |
| A2 | `src/stores/sceneObjectStore.ts` — 新增 `createMaskObject` 工厂方法；扩展 `DeserializeContext`（`pendingMaskTargets` / `claimedTargets`） |
| A3 | `src/core/sceneObjectProviders/serialization/maskSerializer.ts` 新建并注册；两阶段加载中回填 targetIds 并执行死引用 / 非法类型 / 独占冲突剔除 |
| A4 | `src/core/sceneObjectProviders/serialization/registerAll.ts` — import 触发注册 |
| A5 | `isAllowedMaskTargetType()` 实用函数集中定义（供 serializer / SetMaskHandler / UI 复用） |
| A6 | 单元测试：round-trip 完整保留**非空** targetIds；含死引用 / mask→mask 嵌套 / 独占冲突的场景加载后被静默剔除 |

**Gate A**：场景中加一个 mask + 含 1–3 个 targetIds（用 devtools 或测试），保存后重新加载，字段完整保留（含非空 targetIds）。加载含脏数据（死引用 / 非法类型 / 冲突）的场景不崩溃。其他类型零回归。

### 14.2 Stage B：渲染管线

**目标**：让蒙版真正裁切目标对象。

| 任务 | 文件 |
|---|---|
| B1 | 当前实现文件 `src/core/maskRenderer.ts`，实现 §11.3 的 `applyAllMasks` / `applyMaskTo` / wrapper 创建拆除 / 资源清理；包含 world→local 矩阵转换与 `computeMaskWorldTransform` |
| B2 | `src/core/SceneObjectRenderer.ts` — 在 `applyObjectState` 全部完成后调用一次 `applyAllMasks`（调用前确保 PIXI 已递归计算 worldTransform）；mask 类型本身的 `applyObjectState` 是 no-op |
| B3 | `src/components/screenplay/ScenePlayer.vue` 与 `src/utils/videoExport/FrameCapture.ts` — 各自构造 `MaskRendererResources` 独立实例 |
| B4 | `src/composables/useSceneRenderer.ts` — 编辑器构造 `MaskRendererResources` |
| B5 | `removeObject` 中接入 `cleanupMaskReferences`（§11.5） |
| B6 | 反序列化死引用 / 独占冲突 / 嵌套 / 非法模式 统一清理（A3 已覆盖） |
| B7 | 单元测试：反向索引正确 / 包装层幂等 / 坐标转换在 composite 与相机缩放下位置准确 / Phase 1 单蒙版独占冲突 warning |

**Gate B**：

1. 创建一个 mask + 关联一个 prop，prop 在 mask 形状内可见、形状外隐藏。
2. 蒙版移动 / 缩放 / 旋转 → 裁切区域同步；**蒙版作为 composite 子对象时位置准确**；相机缩放下裁切区域位置与预期一致。
3. 一个 mask 关联 3 个目标，三个目标都正确裁切。
4. 删除 mask → 目标恢复完整显示；删除目标 → mask.targetIds 自动同步。
5. ScenePlayer 与 FrameCapture 像素一致。

### 14.3 Stage C：编辑器集成

**目标**：用户可以在 UI 中创建、编辑、关联蒙版，无需 devtools。

| 任务 | 文件 |
|---|---|
| C1 | 大纲面板 / 添加菜单（`SetupEditor.vue` / `ActionEditor.vue`）— 新增"添加蒙版（矩形 / 椭圆）"菜单项 |
| C2 | 新建 `src/components/animation-workbench/MaskTargetsSection.vue` — 多选下拉 + 已选列表 |
| C3 | 新建 `src/components/animation-workbench/MaskShapeSection.vue` — shape / width / height（mode 在 Phase 1 仅渲染为只读提示） |
| C4 | `src/components/ObjectPropertiesPanel.vue` — `obj.type === 'mask'` 分支组合上述区块 + 通用 transform 区块 |
| C5 | 大纲右键菜单 + 蒙版图标 |
| C6 | `useSceneRenderer.ts` — 蒙版选框样式（黄色虚线），handles 复用现有 9-handle |
| C7 | 被裁目标的大纲行尾"已被蒙版裁切"指示器 |

**Gate C**：

1. 走通完整 UI 流程：菜单添加蒙版 → 编辑形状 → 添加目标 → 看到裁切效果，全程无需 devtools。
2. 画布上拖拽蒙版的 9 个 handle 行为正确。
3. 删除目标后，蒙版属性面板的目标列表实时同步。

### 14.4 Stage D：Action 集成

**目标**：蒙版的运动与属性变更可被 Action 录制和回放。

| 任务 | 文件 |
|---|---|
| D1 | `src/utils/actionHandlers/handlers/SetMaskHandler.ts` 新建并注册（`applyToState` 部分更新；不实现 interpolate） |
| D2 | `ActionEditor.handleObjectUpdateInActionMode` — transform 走现有路径；蒙版专属字段 diff 后 upsert `set_mask`（参照 set_composite upsert 模板） |
| D3 | `ActionInspector.vue` — 新增 `set_mask` 表单分支（参照 `set_composite`），含字段添加/移除 + targetIds 多选下拉 |
| D4 | 时间线渲染：蒙版作为独立轨道（已通过§11.4 通用机制实现，仅需图标）；`set_mask` 轨道上的点状 Action 显示 |
| D5 | `SetMaskHandler.spec.ts` + 集成测试：set_transform / tween_transform / set_mask 全部生效；ScenePlayer / FrameCapture 一致 |

**Gate D**：

1. Action 模式下拖拽蒙版生成 set_transform / tween_transform。
2. Action 模式下修改 targetIds / shape 生成 set_mask，同 slot 多次修改正确合并。
3. tween_transform 期间，被裁目标的可见区域平滑变化。
4. set_mask 生效后，被裁目标集合随之变化；Slot 切换 / 跨 Block 状态计算正确。
5. Setup 模式下修改蒙版专属字段仍为直写 setupState，不生成 Action。

### 14.5 Stage E：条件类型与回归

**目标**：扩展类型支持与稳定性。

| 任务 | 内容 |
|---|---|
| E1 | composite 作为 target 验证（含嵌套 1 层） |
| E2 | expression 作为 target 验证 |
| E3 | 相机变换下蒙版位置正确（mask 作为普通对象自然跟随相机） |
| E4 | 多分辨率（720p / 1080p / 4K）导出像素比对 |
| E5 | 性能测试：0 / 5 / 20 个蒙版下 FPS 对比 |

**Gate E**：§9.3 / §9.4 / §9.5 全部通过。

## 15. 风险与回滚

| 风险 | 触发 | 回滚 |
|---|---|---|
| FrameCapture 与 ScenePlayer 像素不一致 | E4 失败 | 定位到具体子系统（相机 / composite RT / wrapper transform），修复后重测 |
| 蒙版作为 composite 子对象时 worldTransform 不对 | B / C 阶段发现 | 把 maskRenderer.ts 的 transform 来源改成"组合后的 worldTransform"而不是 mask 自身字段 |
| 引用清理未触达旧数据 | 加载老场景时报错 | 反序列化阶段强制对所有 mask 做 targetIds 死引用过滤，已在 §11.5 设计中包含 |

每个 Stage 一组 PR，可独立 revert。Stage A → B → C → D → E 顺序提交，B 之后即可在 devtools 看到裁切，C 之后可视化可用，D 之后 Action 可用。
