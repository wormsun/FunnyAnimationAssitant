# 场景光照系统 PRD

> 文档目标：定义 FunnyAnimationAssistant 场景光照系统的首发版本方案。
>
> 本文档替代原《PointLight_Simplified_PRD.md》。
>
> 设计重点：
> - 用户交互保持简单
> - 灯光能力定义为“环境光 + 点光 + 聚光”
> - 环境光保留为特殊场景对象
> - Action Mode 统一使用 `set_light / tween_light`

---

## 1. 结论摘要

当前版本已经具备以下基础能力：

- 环境光
- 点光源
- 统一后处理光照滤镜
- 编辑器 / 播放器 / 导出一致的渲染链路
- `set_light / tween_light` 动作支持
- 点光源闪烁与方向性参数支持

首发版本的主线为：

1. 环境光保留为特殊单例对象
2. 聚光升级为独立灯型
3. 预设系统成为主入口
4. 属性面板分层为基础 / 高级
5. 保持统一 action 与数据模型

首发版本的用户层灯光模型为：

- 场景环境光
- 点光
- 聚光

---

## 2. 产品目标

### 2.1 用户目标

用户应当能够用尽可能少的操作完成以下常见需求：

- 调整整场氛围明暗与冷暖
- 放置一个局部发光点
- 做手电筒 / 壁灯 / 舞台追光
- 在 Action Mode 中驱动灯光变化

### 2.2 系统目标

系统应同时满足：

- 简单模式下低认知成本
- 编辑器、ScenePlayer、导出视频保持一致
- 为 2D 灯光能力保留清晰扩展边界

---

## 3. 设计原则

### 3.1 交互简单优先

默认用户只需要理解：

- 灯照哪里
- 灯有多亮
- 灯是什么感觉

不直接暴露引擎底层术语，例如：

- light layer
- receive mask
- occluder polygon
- normal map response

### 3.2 环境光是特殊对象，不是普通灯

环境光应被理解为：

- 场景基础光
- 场景曝光基线
- 氛围底色

但在实现上，它仍然应当保留为对象系统中的特殊单例对象，而不是脱离对象系统的独立场景配置。

### 3.3 能力增强，复杂度隐藏

底层能力可以增强，但上层交互应通过以下方式隐藏复杂度：

- 默认值
- 预设
- 分层面板
- 直接操控手柄
- 自动规则

### 3.4 统一动作模型

只保留一套灯光动作体系：

- `set_light`
- `tween_light`

---

## 4. 用户层灯光模型

### 4.1 环境光

用户语义：

- 属于场景级控制对象
- 每个场景唯一
- 默认存在
- 不可删除
- 不可复制
- 默认加入穿透列表
- 默认不参与普通拾取

用户可调整：

- 颜色
- 强度
- 氛围预设

入口：

- 对象列表中的 `环境光`
- Action 轨道中的环境光对象
- 从穿透列表移除后，可在画布中直接选中

### 4.2 点光

用户语义：

- 从一个点向四周发光

适合：

- 蜡烛
- 灯泡
- 小型局部补光
- 魔法发光点

### 4.3 聚光

用户语义：

- 朝某个方向投射的局部光

适合：

- 手电筒
- 舞台追光
- 壁灯
- 路灯
- 门口灯

---

## 5. 交互方案

### 5.1 添加入口

“添加灯光”按钮不再直接创建默认点光，而是弹出灯光选择对话框。

交互方式参考当前画面特效选择流程，采用与 `ScreenEffectPickerDialog` 类似的弹出式 Picker。

对话框中包含：

- 点光
- 聚光

环境光不在该对话框中出现。

### 5.1.1 `LightPickerDialog` 组件规格

建议新增：

- `src/components/LightPickerDialog.vue`

组件职责：

- 提供灯型选择入口
- 以卡片形式展示点光 / 聚光
- 返回一个“灯型默认配置”给调用方

#### Emit 设计

```ts
const emit = defineEmits<{
  select: [preset: LightPickerPreset]
  close: []
}>()
```

#### 推荐类型

```ts
export interface LightPickerPreset {
  lightType: 'point' | 'spot'
  name: string
  description: string
  defaults: {
    lightColor: string
    lightIntensity: number
    lightRadius: number
    directionAngle?: number
    coneAngle?: number
  }
}
```

#### UI 结构

- Overlay
- Dialog
- Header
- Body
- 卡片网格
- Footer

#### 第一阶段卡片列表

| id | 灯型 | 标题 | 描述 |
| --- | --- | --- | --- |
| `point_basic` | `point` | 点光 | 适合蜡烛、灯泡、局部补光 |
| `spot_basic` | `spot` | 聚光 | 适合手电筒、舞台追光、壁灯 |

#### 默认创建参数

| 灯型 | 默认参数 |
| --- | --- |
| 点光 | `lightColor=#ffffff`, `lightIntensity=1.0`, `lightRadius=300` |
| 聚光 | `lightColor=#ffffff`, `lightIntensity=1.0`, `lightRadius=320`, `directionAngle=0`, `coneAngle=100` |

### 5.1.2 `useSetupWorkspace.ts` 的状态与回调设计

建议新增状态：

```ts
const showLightPicker = ref(false)
```

建议更新 `handleMenuItemClick()`：

```ts
case 'light':
  showLightPicker.value = true
  break
```

建议新增回调：

```ts
function handleLightSelect(preset: LightPickerPreset): void
```

职责：

- 根据 `preset.lightType` 创建对应灯对象
- 写入默认参数
- 自动选中对象
- 关闭 Picker
- `markLocalChange()`

### 5.1.3 环境光对象的交互规则

环境光继续保留为特殊 `light object`，但交互上按“场景控制对象”处理。

规则：

- 场景内唯一
- 自动创建
- 不可删除
- 不可复制
- 显示在对象列表中
- 默认加入穿透列表
- 默认不参与普通拾取
- 从穿透列表移除后，可在画布中选中

### 5.1.4 对象列表与穿透列表规则

对象列表：

- 显示 `🌍 环境光`
- 不显示删除按钮
- 不参与普通拖拽排序
- 允许选中进入属性面板

穿透列表：

- 默认包含相机和环境光
- 环境光默认 `visible=false`
- 用户可将环境光从穿透列表移除，恢复画布拾取
- 用户可切换环境光在穿透状态下是否显示示意图标

### 5.1.5 画布拾取规则

默认行为：

- 环境光在画布上不参与普通拾取
- 避免遮挡用户拾取其他对象

当环境光从穿透列表移除时：

- 参与画布拾取
- 显示示意性图标
- 允许出现选中框
- 可直接通过属性面板编辑

### 5.2 属性面板分层

用户可见层级只保留：

- 基础
- 高级

不提供“专家级”用户入口。

#### 基础

默认展开：

- 预设
- 颜色
- 亮度
- 范围
- 方向（仅聚光）

#### 高级

折叠展开：

- 闪烁强度
- 闪烁速度

### 5.2.1 加入高级能力后仍保持简单的 UI 策略

在加入以下能力后：

- 阴影 / 遮挡
- mask / layer
- 对象级受光

仍应坚持“能力增强，但默认操作不变”的原则。

#### 基础模式

仅暴露最少字段：

- 颜色
- 强度
- 范围
- 方向
- 预设

> 注意：以下字段只有在底层能力落地后才可进入基础模式：
>
> - 阴影开关
> - 影响范围

#### 高级模式

在“更多效果”中补充：

- 闪烁强度
- 闪烁速度

> 注意：以下字段只有在底层能力落地后才可显示：
>
> - 投影对象
> - 阴影强度
> - 阴影柔和度
> - 受光对象范围

#### 内部预留能力

以下能力只作为系统设计预留，不进入用户可见面板：

- 遮挡轮廓覆盖
- 光照层
- 阴影层
- 材质响应参数

### 5.2.2 三项高级能力的用户包装方式

#### 阴影 / 遮挡

采用“中间路线”简单投影方案：
- 用户侧在属性面板看到：`脚底投影` 开关（原计划的“阴影”、“阴影柔和”等高级参数暂不暴露）。
- 仅对具有明显底边界的对象适用：`prop`、`symbol`、`expression` 以及 `composite (entity)`。
- 对于 `background`、`light`、`audio`、`camera`、`screen_effect` 甚至松散联合的 `composite (union)` 均隐藏该开关且禁止在 Action 中添加。
- 技术上采用硬编码的扁椭圆跟随对象移动，当前实现节点名为 `__ground_shadow_ellipse`。
- 作为 V1 已知限制，它会继承对象的旋转、Alpha 与光照剔除状态；`flipX` 不影响投影外观。

#### mask / layer

高级蒙版/图层分层功能暂不开放。当前通过 LightingFilter 的内部 `uExemptMask` 实现像素级光照隔离：

- `applyLightingFilter()` 会为所有 `receiveLighting === false` 且允许参与受光控制的对象绘制一张免疫蒙版 RenderTexture。
- shader 当前不再采用“命中即二值 passthrough”的硬切逻辑，而是采样 `uExemptMask.a` 作为免疫权重，在“正常受光结果”和“原始颜色”之间做 alpha 软混合。
- 该设计用于保留 sprite / text / composite(entity) 边缘的半透明抗锯齿，减少 `receiveLighting=false` 时的人物发脏、边缘发硬和颜色跳变问题。
- 蒙版 RT 由调用端缓存并复用，当前已在编辑器、`ScenePlayer`、`FrameCapture` 三条渲染链统一接入，并在销毁时释放。

#### 对象级受光

对象侧提供独立的控制开关，作为自发光和排除特殊受光的主要手段：
- 属性面板新增：`参与场景光照` 开关（默认开）。
- ActionMode 兼容：通过 `set_visual` Action，支持在时间轴上动态触发 `receiveLighting` 和 `castShadow` 的变化。
- 当前支持类型：`prop`、`symbol`、`expression`、`text` 以及 `composite (entity)`。
- 组合特性：`union` composite 自身不提供受光开关，由子对象各自决断；`entity` composite 作为一个独立渲染实体，整体受 `receiveLighting` 控制。
- 当前实现语义：`receiveLighting=false` 的目标会尽量恢复贴图原始观感，但由于采用 alpha 软混合而非完全替换，边缘半透明区域允许保留少量受光过渡，以换取更自然的轮廓质量。

### 5.2.3 `ObjectPropertiesPanel` 字段清单

#### 基础模式字段

| 字段 | ambient | point | spot |
| --- | --- | --- | --- |
| 预设 | 是 | 是 | 是 |
| 颜色 | 是 | 是 | 是 |
| 强度 | 是 | 是 | 是 |
| 半径 | 否 | 是 | 是 |
| 方向角 | 否 | 否 | 是 |
| 开角 | 否 | 否 | 是 |

#### 高级模式字段

| 字段 | ambient | point | spot |
| --- | --- | --- | --- |
| 闪烁强度 | 否 | 是 | 是 |
| 闪烁速度 | 否 | 是 | 是 |

#### 不对用户暴露的内部预留字段

- 遮挡轮廓覆盖
- 光照层
- 阴影层
- 材质响应
- 高级混合参数

#### 环境光规则

- 环境光主要通过对象列表、Action 轨道和画布选中来编辑
- 不显示位置、半径、方向、闪烁等字段

### 5.3 直接操控

画布中灯光对象应优先支持直接操控：

- 拖中心：移动
- 拖边缘：改范围
- 拖方向柄：改朝向
- 拖扇形边：改开角

---

## 6. 底层数据模型

### 6.1 LightObject 定义

首发版本按目标态直接定义：

```ts
type LightType = 'ambient' | 'point' | 'spot'

export interface LightObject extends SceneObjectBase {
  type: 'light'
  lightType: LightType

  lightColor: string
  lightIntensity: number
  lightRadius: number

  flicker?: number
  flickerSpeed?: number
  directionAngle?: number
  coneAngle?: number
}
```

> 注意：代码中保留了内部字段 `directionMode?: 'omni' | 'cone'`，
> 由 `lightType` 隐式决定（`point` → `omni`，`spot` → `cone`）。
> 该字段不序列化为用户可见概念，不在属性面板中暴露。

### 6.2 默认值规范

| 字段 | ambient | point | spot |
| --- | --- | --- | --- |
| `lightColor` | `#ffffff` | `#ffffff` | `#ffffff` |
| `lightIntensity` | `1.0` | `1.0` | `1.0` |
| `lightRadius` | `500` | `300` | `320` |
| `flicker` | `0` | `0` | `0` |
| `flickerSpeed` | `0.35` | `0.35` | `0.35` |
| `directionAngle` | `0` | `0` | `0` |
| `coneAngle` | `100` | `100` | `100` |

字段约束：

- `ambient` 仅使用 `lightColor` / `lightIntensity`
- `point` 全向发光，不使用方向性字段（内部 `directionMode='omni'`）
- `spot` 定向锥形光，使用 `directionAngle` / `coneAngle`（内部 `directionMode='cone'`）

### 6.3 SetLightParams 定义

```ts
export interface SetLightParams {
  lightColor?: string
  lightIntensity?: number
  lightRadius?: number

  flicker?: number
  flickerSpeed?: number

  directionAngle?: number
  coneAngle?: number
}
```

### 6.4 Action 字段适用矩阵

| 字段 | ambient | point | spot | 插值行为 |
| --- | --- | --- | --- | --- |
| `lightColor` | 使用 | 使用 | 使用 | 颜色插值 |
| `lightIntensity` | 使用 | 使用 | 使用 | 线性 |
| `lightRadius` | 忽略 | 使用 | 使用 | 线性 |
| `flicker` | 忽略 | 使用 | 使用 | 线性 |
| `flickerSpeed` | 忽略 | 使用 | 使用 | 线性 |
| `directionAngle` | 忽略 | 忽略 | 使用 | 线性 |
| `coneAngle` | 忽略 | 忽略 | 使用 | 线性 |

---

## 7. 环境光的产品层与底层关系

### 7.1 产品层

环境光在 UI 中归入“场景光照配置”。

建议行为：

- 场景加载时默认存在
- 不允许删除
- 不允许复制
- 不在“添加灯光”菜单中出现

### 7.2 底层

环境光继续保留为特殊 `ambient light object`，理由是：

- 当前渲染链已基于 light 对象聚合环境光
- `set_light / tween_light` 可直接控制环境光
- 可避免新增一套场景配置动画系统

---

## 8. Action Mode 方案

### 8.1 保持统一 action

继续保留：

- `set_light`
- `tween_light`

所有灯型统一走这一套动作。

### 8.2 target 语义

`target` 可以指向：

- 环境光对象
- 点光对象
- 聚光对象

### 8.3 录制规则

Action Mode 中的录制建议保持统一：

- 修改环境光字段 → 生成针对 ambient 对象的 `set_light / tween_light`
- 修改点光字段 → 生成针对 point 对象的 `set_light / tween_light`
- 修改聚光字段 → 生成针对 spot 对象的 `set_light / tween_light`

录制 diff 原则：

- 仅写入变化字段
- 环境光不记录无意义字段

---

## 9. 渲染与运行时策略

### 9.1 当前阶段

当前已经实现并应继续保留：

- 后处理 `LightingFilter`
- 统一 `applyLightingFilter()`
- 编辑器 / 播放器 / 导出一致的灯光求值与应用
- `applyLightingFilter()` 当前签名已扩展到 `renderer + LightingFilterCache(maskRT)`，用于 `uExemptMask` 免疫蒙版渲染与生命周期管理

### 9.2 点光 / 聚光

建议：

- `point`：继续走当前点光求值逻辑
- `spot`：沿用当前定向锥形光的 shader 方向衰减逻辑

### 9.3 `evaluatePointLight` 重命名策略

建议重命名为：

- `evaluateLight()`

内部再根据 `lightType` 分发。

### 9.4 下游代码影响清单

`lightType` 从 `'ambient' | 'point'` 扩展到含 `spot` 后，以下位置必须检查：

- `renderPipeline.ts`
- `useSceneRenderer.ts`
- `lightRuntime.ts`
- `syncFlickerTicker()`
- 所有 `lightType === 'point'` 的过滤条件

建议统一引入辅助判断：

```ts
isPointLikeLight(light) => light.lightType === 'point' || light.lightType === 'spot'
```

### 9.5 MAX_LIGHTS 策略

当前 `MAX_LIGHTS=8`。

建议明确：

- 点光与聚光共享同一 slot pool
- `MAX_LIGHTS` 适用于 `point + spot`

---

## 10. 预设体系

### 10.1 环境光预设

- 白天室内
- 夜晚室内
- 冷夜
- 黄昏
- 舞台暗场

### 10.2 点光预设

- 电灯
- 蜡烛
- 火把
- 故障灯
- 魔法光

### 10.3 聚光预设

- 手电
- 舞台追光
- 壁灯
- 路灯

---

## 11. 默认规则

- 每个场景默认存在唯一环境光
- 新建场景时环境光默认开启
- UI / 字幕默认不受场景灯影响
- 点光 / 聚光默认可见、可编辑
- 环境光默认仅在“场景光照”面板中编辑

### 11.1 属性面板显示矩阵

| 字段 | ambient | point | spot | Phase |
| --- | --- | --- | --- | --- |
| 预设 | 环境光预设 | 点光预设 | 聚光预设 | A |
| 颜色 | 显示 | 显示 | 显示 | A |
| 强度 | 显示 | 显示 | 显示 | A |
| 半径 | 隐藏 | 显示 | 显示 | A |
| 闪烁强度 | 隐藏 | 折叠显示 | 折叠显示 | A |
| 闪烁速度 | 隐藏 | 折叠显示 | 折叠显示 | A |
| 方向角 | 隐藏 | 隐藏 | 显示 | A |
| 开角 | 隐藏 | 隐藏 | 显示 | A |
| 阴影开关 | 隐藏 | 当前隐藏 | 当前隐藏 | D |
| 影响范围 | 隐藏 | 当前隐藏 | 当前隐藏 | D |

### 11.2 对象列表规则

- 环境光显示在对象列表中
- 环境光是特殊对象，不可删除、不可复制
- 环境光默认加入穿透列表
- 环境光默认不参与普通拾取
- 点光 / 聚光正常出现在对象列表

### 11.3 添加菜单规则

“添加灯光”按钮行为规范：

- 点击后打开 `LightPickerDialog`
- 用户选择灯型后再创建对象

### 11.4 画布手柄规则

| 灯型 | 手柄 |
| --- | --- |
| ambient | 无画布手柄或仅弱化选中态 |
| point | 中心点 + 半径环 |
| spot | 中心点 + 半径环 + 方向柄 + 开角边 |

---

## 12. 实施约束

由于该功能尚未对用户开放，本轮按“首发功能”设计，不承载历史兼容包袱。

约束：

- 不需要旧数据迁移策略
- 不需要过渡入口设计
- 数据结构按目标态直接设计

### 12.1 当前代码落点

| 文件 | 目标 |
| --- | --- |
| `src/types/sceneObject.ts` | 扩展 `LightObject` |
| `src/types/screenplay.ts` | 扩展 `SetLightParams` |
| `src/stores/sceneObjectStore.ts` | 扩展 `createLightObject()` 默认值 |
| `src/core/sceneObjectProviders/serialization/lightSerializer.ts` | 按目标态写入字段 |
| `src/components/ObjectPropertiesPanel.vue` | 按灯型分层展示字段 |
| `src/components/SceneObjectList.vue` | 环境光特殊对象显示规则 |
| `src/composables/useSetupWorkspace.ts` | 添加入口改为点光 / 聚光 |
| `src/utils/lightRuntime.ts` | `evaluateLight()` 或统一命名 |
| `src/core/filters/LightingFilter.ts` | 确认点光 / 聚光共享 shader 路径 |

---

## 13. 实施任务拆分与验收清单

### 13.1 Phase A：高 ROI 交互重构

目标：

- 用户能以更简单的方式使用现有光照能力
- 环境光保留为特殊对象，但默认不干扰拾取
- 添加灯光流程支持点光 / 聚光选择

任务：

- 环境光作为特殊对象保留在对象列表中
- 环境光默认加入穿透列表
- 添加灯光改为 `LightPickerDialog`
- 属性面板改为基础 / 高级两层
- 接入环境光 / 点光 / 聚光预设

验收：

- 环境光在对象列表中可见
- 环境光默认在穿透列表中
- 点击“光源”后可选择点光或聚光
- 普通用户只看基础区即可完成常见打灯

### 13.2 Phase B：数据模型与动作系统扩展

目标：

- 正式支持 `spot` 作为独立灯型
- 扩展 action 和数据字段

任务：

- 扩展 `LightObject.lightType`
- 扩展 `SetLightParams`
- 更新 serializer

验收：

- 新建聚光可正常保存、读取、播放
- `set_light / tween_light` 对环境光、点光、聚光都可用

### 13.3 Phase C：渲染与语义清理

目标：

- 点光与聚光在渲染上真正统一
- 清理 `lightType` 扩展后的所有过滤与命名问题

任务：

- 清理所有 `lightType === 'point'` 过滤逻辑
- 统一 point-like 灯型判断
- 评估 `evaluatePointLight` 是否改为 `evaluateLight`
- 明确 `MAX_LIGHTS` 为点光与聚光共享
- 收口点光 / 聚光的产品语义

验收：

- 聚光不会被光照聚合逻辑遗漏
- flicker ticker 对聚光正常工作
- 编辑器 / 播放器 / 导出表现一致

### 13.4 Phase D：高级能力预留

预留能力：

- 法线贴图（局部立体感）
- 真实遮挡与实时阴影层
- 基于图层的复杂光照隔离 (mask / layer 工具)

约束：

- 基础模式不得提前暴露无实现支撑的控件
- 高级模式以外的能力仅作为内部预留，不提供用户入口

### 13.5 Phase E：中间路线光照扩展（对象级受光与简单投影）

目标：

- 实现高优先级的基于对象的受光排除（如自发光道具）
- 提供简单的投影近似效果，增加空间感

任务：

- 在 `SceneObjectBase` 及 `SetVisualParams` 增加 `receiveLighting` (参与场景光照) 和 `castShadow` (投影)
- 收窄 ActionMode 在属性注入时的可用性：
  `castShadow` 仅对适用对象 (`prop / symbol / expression / composite(entity)`) 开放；
  `receiveLighting` 对 `prop / symbol / expression / text / composite(entity)` 开放；
  `union composite` 不提供组合级开关，也不允许在 Action 中新增
- 重构 `LightingFilter`，引入 `uExemptMask` 免疫蒙版机制实现像素级滤光
- 在统一渲染管线 `applyCompositeState` 及 `applySimpleTransform` 中内置基于椭圆 `Graphics` 的 `castShadow` 近似逻辑
- 统一编辑器、`ScenePlayer`、`FrameCapture` 的 `lightingFilterCache`，并负责 `maskRT` 与 filter instance 的销毁

验收：

- 属性面板正确根据对象类型过滤 `参与场景光照` 和 `脚底投影` 开关
- ActionMode 中 `set_visual` 的创建、编辑、回显、删除全链路连通
- Union 与 Entity Composite 在蒙版渲染中表现出正确的级联隔离逻辑
- 不受光对象在白昼 / 黑场下整体观感接近原图，且边缘半透明与抗锯齿不过度硬切
- `maskRT` 在场景切换 / 导出结束 / 渲染器销毁后无残留

### 13.6 模块级任务总表

| 模块 | Phase A | Phase B | Phase C | Phase E |
| --- | --- | --- | --- | --- |
| `SetupEditor` | 光源菜单与穿透管理 | - | - | - |
| 穿透列表 | 环境光默认规则 | - | - | - |
| `LightPickerDialog` | 新增 | - | - | - |
| `useSetupWorkspace.ts` | picker 状态与回调 | spot 创建逻辑 | - | - |
| `ObjectPropertiesPanel` | 分层面板 + 预设 | spot 字段支持 | 收口点光/聚光语义 | 新增并按类型过滤 `参与场景光照` 与 `脚底投影` 开关 |
| `SceneObjectList` | 环境光降级 | - | - | - |
| `sceneObject.ts` | - | lightType 扩展 | - | 增加受光/投影状态 |
| `screenplay.ts` | - | action 字段扩展 | - | 增加 `SetVisualParams` 字段 |
| `lightSerializer.ts` | - | 目标态字段写入 | - | - |
| `lightRuntime.ts` | - | 支持 spot | 命名与分发清理 | - |
| `ActionEditor.vue` | - | - | - | 扩展 `visualActionUpdate` 参数类型 |
| `ActionInspector.vue` | - | - | - | 扩展 `set_visual` 属性集并按目标类型限制新增 |
| `renderPipeline.ts` | - | - | point/spot 统一过滤 | 渲染免疫 RT 蒙版、缓存 `maskRT`、统一 renderer 接口 |
| `useSceneRenderer.ts` | - | - | point/spot 统一过滤 | 补充 `LightingFilterCache` 并清理 `maskRT` |
| `ScenePlayer.vue` | - | - | - | 接入 `maskRT` 缓存与销毁 |
| `FrameCapture.ts` | - | - | - | 接入 `maskRT` 缓存与销毁 |
| `LightingFilter.ts` | - | - | MAX_LIGHTS 策略确认 | 增加 `uExemptMask` / `uHasExemptMask` uniform，并基于 mask alpha 对受光结果与原图做软混合 |

### 13.7 验收优先级

#### 必须通过


- 环境光可通过对象列表和轨道编辑
- 添加灯光可选择点光 / 聚光
- 新建聚光可正常渲染
- 属性面板分层后，基础路径不变复杂

#### 建议通过

- 预设系统能显著减少手工调参
- 用户不再需要理解“点光 + 定向模式”这种工程师心智

---

## 14. 风险与依赖清单

本节用于判断当前方案是否具备直接开发条件，以及哪些任务必须先做。

### 14.1 当前计划完整性判断

当前 PRD 已满足以下开发前提：

- 灯光范围已收敛为 `ambient + point + spot`
- 用户主路径已明确
- 环境光入口已明确为特殊对象
- `LightPickerDialog` 方案已明确
- 属性面板分层已明确为基础 / 高级
- 数据模型方向已明确
- Phase A / B / C 顺序已明确

当前 PRD 仍需要通过“风险与依赖 + 测试计划”补全，才能进入更稳定的开发执行阶段。

结论：

- 当前文档已满足“需求评审 / 技术排期”要求
- 补完本节与下一节后，可视为“满足正式开发要求”

### 14.2 关键依赖关系

#### 依赖 1：环境光单例对象先于默认穿透

如果环境光不是单例特殊对象：

- 穿透默认值无法稳定初始化
- Action Mode 中的环境光轨道语义会混乱

因此依赖关系为：

- `ambient object 单例规则` → `默认加入穿透列表`

#### 依赖 2：LightPickerDialog 先于点光 / 聚光用户心智切换

如果“添加灯光”仍然是直接创建默认点光：

- 聚光独立灯型的产品语义无法成立

因此依赖关系为：

- `LightPickerDialog` → `点光 / 聚光作为独立灯型`

#### 依赖 3：数据模型先于运行时渲染清理

如果 `LightObject.lightType` 尚未扩展到 `spot`：

- 渲染层无法稳定落地 point-like 统一判断

因此依赖关系为：

- `sceneObject.ts / screenplay.ts / serializer` → `renderPipeline / useSceneRenderer / lightRuntime`

#### 依赖 4：属性面板分层先于高级能力扩展

如果当前仍是平铺面板：

- 阴影 / mask / 受光等扩展能力需要合理承载位置

因此依赖关系为：

- `属性面板分层` → `高级能力字段接入`

### 14.3 核心风险清单

#### 风险 1：环境光特殊对象规则不完整

风险描述：

- 如果环境光显示在对象列表中，但没有默认穿透和特殊规则，会导致误拾取和心智混乱

影响：

- 环境光会频繁干扰普通对象编辑
- Setup 和 Action 两条链路上的环境光心智会不一致

缓解：

- 明确环境光是“特殊对象”，不是普通灯
- 默认加入穿透列表
- 保持对象列表、属性面板、Action 轨道三者语义一致

#### 风险 2：`spot` 新增后渲染过滤条件漏改

风险描述：

- 当前大量逻辑可能仍写死 `lightType === 'point'`

影响：

- 聚光创建成功，但不渲染
- 聚光 flicker 不刷新
- 编辑器、播放器、导出不一致

缓解：

- Phase C 前列出函数级检查清单
- 引入 `isPointLikeLight()` 辅助判断

#### 风险 3：聚光新增后渲染过滤条件漏改

风险描述：

- 当前大量逻辑可能仍写死 `lightType === 'point'`

影响：

- 聚光创建成功，但不渲染
- 聚光 flicker 不刷新
- 编辑器、播放器、导出不一致

缓解：

- Phase C 前列出函数级检查清单
- 引入 `isPointLikeLight()` 辅助判断

#### 风险 4：基础面板提前暴露无底层支撑字段

风险描述：

- 如果阴影 / 影响范围等字段提前出现在基础面板，而缺少底层支撑，会造成伪完成

影响：

- 用户困惑
- 开发与测试误判完成度

缓解：

- 所有字段都标注依赖 Phase
- Phase D 字段不得提前进基础面板

#### 风险 5：预设体系与默认值不一致

风险描述：

- Picker 默认值、对象创建默认值、属性面板预设如果各自独立定义，容易漂移

影响：

- 同一个“手电”在不同入口效果不一致

缓解：

- 统一一处预设定义来源
- Picker 和属性面板引用同一配置

### 14.4 建议的先后顺序约束

必须先做：

1. 环境光特殊对象入口
2. LightPickerDialog
3. 属性面板分层

之后再做：

4. `spot` 数据模型
5. action / serializer

最后再做：

6. 渲染过滤与命名清理

不建议的顺序：

- 先改 shader / runtime，再改交互

因为那样很容易返工。

### 14.5 开发准备结论

当前文档在补完本节和下一节后，可以认为：

- 已满足正式开发要求

前提是开发执行时按依赖顺序推进，不跨 phase 抢做。

---

## 15. 测试计划与验收用例

本节用于保证编辑器、Action Mode、播放器、导出四条链路的一致性。

### 15.1 测试范围

需要覆盖：

- Setup 模式
- Action Mode
- ScenePlayer
- Video Export
- 环境光对象与穿透列表
- 点光 / 聚光创建与编辑

### 15.2 Setup 模式用例

#### 用例 A1：环境光通过对象列表编辑

步骤：

1. 打开 SetupEditor
2. 在对象列表中点击“环境光”
3. 修改环境光颜色和强度

期望：

- 右侧显示环境光属性
- 场景整体光照立即更新

#### 用例 A2：环境光默认不干扰拾取

步骤：

1. 打开 SetupEditor
2. 不操作穿透列表
3. 在画布中点击环境光附近的其他对象

期望：

- 环境光默认不参与普通拾取
- 不阻挡其他对象被点击

#### 用例 A3：添加点光

步骤：

1. 点击“添加灯光”
2. 在 `LightPickerDialog` 中选择点光
3. 确认添加

期望：

- 创建点光对象
- 自动选中新对象
- 右侧打开对象属性面板
- 画布显示点光控制手柄

#### 用例 A4：添加聚光

步骤：

1. 点击“添加灯光”
2. 选择聚光
3. 确认添加

期望：

- 创建聚光对象
- 右侧显示聚光字段
- 画布显示方向柄和开角控制

#### 用例 A4：点光基础属性编辑

步骤：

1. 选中点光
2. 修改颜色、强度、半径

期望：

- 预览即时更新
- 保存后重新打开场景仍一致

#### 用例 A5：聚光基础属性编辑

步骤：

1. 选中聚光
2. 修改颜色、强度、方向角、开角

期望：

- 预览即时更新
- 光照方向与面板参数一致

#### 用例 A6：面板切换

步骤：

1. 先选中环境光
2. 再选中一个点光对象

期望：

- 右侧持续为对象属性面板
- 不存在额外“场景设置态”

### 15.3 Action Mode 用例

#### 用例 B1：环境光录制 action

步骤：

1. 在 Action Mode 中选中环境光对象
2. 修改环境光颜色或强度

期望：

- 自动创建 `set_light` 或 `tween_light`
- target 指向环境光对象

#### 用例 B2：点光录制 action

步骤：

1. 在 Action Mode 中修改点光参数

期望：

- 正确生成 `set_light` / `tween_light`
- 仅写入变更字段

#### 用例 B3：聚光录制 action

步骤：

1. 在 Action Mode 中修改聚光方向角或开角

期望：

- 正确生成 `set_light` / `tween_light`
- 方向角和开角补间正确

### 15.4 ScenePlayer 用例

#### 用例 C1：环境光播放一致

期望：

- ScenePlayer 中环境光表现与编辑器一致

#### 用例 C2：点光播放一致

期望：

- 点光颜色、半径、闪烁表现与编辑器一致

#### 用例 C3：聚光播放一致

期望：

- 聚光方向、开角与编辑器一致

### 15.5 Video Export 用例

#### 用例 D1：导出与预览一致

期望：

- 环境光 / 点光 / 聚光在导出视频中与 ScenePlayer 基本一致

#### 用例 D2：Action 驱动的光照导出一致

期望：

- `set_light / tween_light` 在导出结果中正常表现

### 15.6 回归用例

#### 用例 E1：普通非光照对象不受影响

期望：

- 未使用灯光功能的场景编辑流程不被破坏

#### 用例 E2：点光不回归

期望：

- 现有点光创建、编辑、播放、导出能力不倒退

### 15.7 最终验收标准

必须通过：

- 环境光通过对象列表和轨道可编辑
- 环境光默认加入穿透列表且不干扰普通拾取
- 可通过 Picker 创建点光 / 聚光
- 点光 / 聚光在编辑器、播放器、导出中一致
- Action Mode 能正确驱动三类灯光对象
- 属性面板基础路径可完成主要创作需求

建议通过：

- 预设能显著减少手工调参
- 用户无需理解工程师语义即可完成聚光设置

---

## 16. 最终决策

1. 光照体系定义为“环境光 + 点光 + 聚光”。
2. 环境光在产品层表现为特殊场景对象。
3. 环境光在底层继续保留为特殊 `light object`。
4. `set_light / tween_light` 继续作为统一灯光动作体系，不新增平行动作系统。
5. 点光与聚光共享同一渲染 slot 池与 shader 主路径。

这套方案能在不显著提高用户复杂度的前提下，优先交付高 ROI 的灯光体验升级。
