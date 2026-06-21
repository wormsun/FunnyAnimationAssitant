# 场景模板（Scene Template）PRD

> **文档状态**：当前实现说明与设计记录  
> **日期**：2026-03-05  
> **版本**：v9.0

---

## 一、概念定义

### 1.1 问题背景

FunnyAnimationAssistant 的组合对象（CompositeObject）支持将多个场景对象组合为整体，但仅限当前场景内使用。用户在多个场景/动画中需要重复搭建相同的组合（如桌椅、车辆、带背景框的文字），导致重复劳动和一致性差。

### 1.2 场景模板的定位

**场景模板**是**一级素材资源**，地位与角色、道具、背景平级。它是"复杂资源"的统一管理容器——任何由多个对象组成的组合、或者需要独立管理的特殊对象（元件、带背景的文本等），都通过场景模板来管理。

### 1.3 资源管理体系全景

```
简单资源（单文件）：               复杂资源（多对象/多素材组合）：
  ├─ 道具管理页面（PropAsset）        └─ 场景模板管理页面（SceneTemplate）
  ├─ 背景管理页面（Background）            ├─ 车辆模板（组合 + 子道具）
  ├─ 音频管理页面（Sound）                 ├─ 对话气泡模板（文本 + 背景道具）
  └─ 人物编辑页面（Character）             ├─ 可切换的门（单个元件对象）
                                           └─ 讲台模板（组合 + 元件 + 道具）
```

### 1.4 命名约定

| 场景     | 名称            |
| :------- | :-------------- |
| 用户界面 | **场景模板**    |
| 代码内部 | `SceneTemplate` |

---

## 二、使用场景与用户流程

### 2.1 流程 A：从场景编辑器保存

```
场景编辑器（Setup 或 Action Mode）→ 选中组合对象
  → 右键 / 属性面板 → [保存为场景模板]
  → 弹窗：输入名称、选择标签
  → 确认 → 序列化 + 生成缩略图 → 存入模板库
```

- Setup Mode：保存 setupObjects 中的组合对象快照
- Action Mode：保存 runtimeObjects 中的组合对象快照（含 Action 叠加后的状态）

### 2.2 流程 B：从场景模板管理页面创建

```
场景模板管理页面 → [新建场景模板]
  → 进入模板编辑器（简化版场景编辑器，无时间轴/剧本）
  → 从道具/背景/已有场景模板库拖入元素，自由摆放、组合
  → 保存 → 模板存入资源库
```

> 模板嵌套复用：编辑器中可拖入已有的场景模板进行二次组合。

### 2.3 流程 C：使用场景模板

```
场景编辑器 → 左侧资源面板 → [场景模板] Tab
  → 找到模板 → 拖入画布（或点击添加）
  → 系统实例化：生成新对象 + 重建关系
```

---

## 三、数据模型

### 3.1 核心原则

- 模板内部直接使用现有的 `SceneObject` 类型
- 场景模板可包含单个对象（不强制 Composite 包裹）

### 3.2 场景模板数据

```typescript
export interface SceneTemplate {
  id: string
  name: string
  tags?: string[]
  createdAt: number
  updatedAt?: number
  thumbnailPath?: string
  _runtimeThumbnailUrl?: string

  /** 根对象（可以是 Composite，也可以是单个 Symbol/Text/Prop 等） */
  rootObject: SceneObject

  /** 子孙对象（rootObject 为 Composite 时才有） */
  childObjects: SceneObject[]
}
```

### 3.3 存储位置

| 内容     | 文件路径                                       |
| :------- | :--------------------------------------------- |
| 模板数据 | `{ProjectName}/resources/scene_templates.json` |
| 缩略图   | `{ProjectName}_cache/scene_template_{id}.jpg`  |

---

## 四、场景模板管理页面

### 4.1 入口

一级素材资源管理入口，与"角色管理""道具管理""背景管理"平级。

### 4.2 UI 设计（参考人物管理页面）

- 网格缩略图展示
- 标签筛选 + 搜索
- 右键菜单：编辑、重命名、修改标签、删除
- 双击进入模板编辑器
- 工具栏：[➕ 新建] [导入]

---

## 五、模板编辑器

### 5.1 UI 设计（参考场景编辑器 Setup 模式，去掉左侧素材面板）

```
┌──────────────────────────────────────────────────────┐
│  场景模板编辑器 — 车辆               [保存] [返回]    │
├──────────────────────────────────────┬────────────────┤
│                                      │ 右侧属性面板    │
│                                      │ 选中: 📦轮子    │
│          [画布区域]                   │ X: 120         │
│                                      │ Y: -60         │
│           🚗                         │ Scale: 1.0     │
│                                      │ 📎 所属: 🧩车辆 │
├──────────────────────────────────────┴────────────────┤
│ 底部: [添加道具] [添加背景] [添加已有模板]             │
│       [成组] [拆分] [删除]                            │
└──────────────────────────────────────────────────────┘
```

**能力**：添加对象、摆放、缩放、旋转、成组/拆分、调整层级、设置 initialAnimations。  
**不含**：Action Mode / 剧本 / 时间轴。

---

## 六、核心功能

### 6.1 保存为场景模板

**入口**：右键菜单 / 属性面板 → [保存为场景模板]（选中组合对象时，Setup 或 Action Mode 均可）

**流程**：深克隆对象 → 坐标标准化（根中心归零）→ 生成缩略图 → 弹窗确认 → 持久化

### 6.2 实例化场景模板

1. 依赖校验：检查 `refId` 引用的资源是否存在
2. UUID 重生成 + 关系重建（childIds / parentId）
3. 坐标还原（根对象 = 拖拽落点）
4. 别名生成 + 按拓扑顺序 addObject()
5. animations / initialAnimations 自动携带

---

## 七、动画架构变更

### 7.1 取消资源级动画，保留对象级与场景级

```
旧架构（3 层）：                     新架构（2 层）：
  资源级 Character.animations          对象级 SceneObjectBase.animations ← 随模板携带
  场景级 Scene.animations[]     →      场景级 Scene.animations[]        ← 仅本场景
  对象级 initialAnimations             initialAnimations                ← 播放配置
```

**取消资源级动画的理由**：动画统一存储在对象上，资源仅作为模板默认值。

**保留场景级动画的理由**：
- 为对象制作**仅适用于本场景**的动画（不随模板携带到其他场景）
- 跨对象协调动画（不属于任何单个 Composite）
- 场景级动画不会被模板的保存/实例化流程影响

| 存储层级   | 存储位置                     | 生命周期 | 随模板携带 |
| :--------- | :--------------------------- | :------- | :--------- |
| **对象级** | `SceneObjectBase.animations` | 跟随对象 | ✅ 是       |
| **场景级** | `Scene.animations[]`         | 跟随场景 | ❌ 否       |

### 7.2 AnimationDefinition 类型体系（继承 + 联合）

```typescript
/** 基类：所有动画类型共享的字段 */
interface AnimationDefinitionBase {
  type: string
  id: string
  name: string
  description?: string
  tags?: string[]
  loop: boolean             // 必填，默认 false
  createdAt: number
  updatedAt: number
}

/** 轨道动画（直接驱动属性变化） */
interface TrackAnimationDefinition extends AnimationDefinitionBase {
  type: 'track'
  tracks: AnimationTrack[]
  duration?: number
}

/** 编排动画（驱动多个对象动画的协调播放） */
interface PlaylistAnimationDefinition extends AnimationDefinitionBase {
  type: 'playlist'
  playMode: 'parallel' | 'sequence'  // 并行 or 顺序
  cascadeStop?: boolean              // 停止时是否级联停止子动画，默认 true
  entries: PlaylistEntry[]
}

interface PlaylistEntry {
  objectId: string       // 目标对象 ID（可为子对象或场景中任意对象）
  animName: string       // 目标对象上的动画名称
  delay?: number         // 延迟启动（ms），默认 0
  action?: 'play' | 'stop'  // 默认 play
}

/** 联合类型（用于类型窄化） */
type AnimationDefinition = TrackAnimationDefinition | PlaylistAnimationDefinition
```

**运行时行为分发**（Strategy 模式，与 ActionHandler 一致）：
```typescript
const handlers: Record<string, AnimationTypeHandler> = {
  'track': new TrackAnimationHandler(),
  'playlist': new PlaylistAnimationHandler(),
}
```

### 7.3 SceneObjectBase 变更

```typescript
export interface SceneObjectBase {
  // ... 现有字段 ...

  /** 动画定义（对象自身携带） */
  animations?: Record<string, AnimationDefinition>

  /** 初始播放配置 */
  initialAnimations?: InitialAnimationItem[]
}
```

> **当前实现**：`initialAnimations` 保留在 `SceneObjectBase`，`AnimationController` 直接读取基类字段。

### 7.4 动画创建与编辑（详细说明）

动画编辑分为两个层级：**资源模板级**（在资源管理页面/对话框中编辑，作为默认值）和**对象实例级**（在场景编辑器/模板编辑器中编辑，跟随对象）。

#### 7.4.1 总览表

| 对象类型      | 资源模板级编辑                         | 对象实例级编辑                   | 支持的动画类型   |
| :------------ | :------------------------------------- | :------------------------------- | :--------------- |
| **道具**      | 道具管理页面 / 场景编辑器内 [编辑资源] | 场景编辑器 / 模板编辑器 属性面板 | track            |
| **背景**      | 背景管理页面 / 场景编辑器内 [编辑资源] | 场景编辑器 / 模板编辑器 属性面板 | track            |
| **角色**      | 人物编辑页面（独立）                   | 场景编辑器 属性面板              | track            |
| **组合对象**  | —                                      | 场景编辑器 / 模板编辑器 属性面板 | track + playlist |
| **元件**      | —                                      | 场景编辑器 / 模板编辑器 属性面板 | track            |
| **文本/特效** | —                                      | 场景编辑器 属性面板              | track            |

#### 7.4.2 道具/背景：双入口编辑

**入口 A：资源模板级（道具管理页面 / 场景编辑器 [编辑资源]）**

```
道具管理页面 → 选择道具 → 动画管理Tab
  ┌── AnimationManager ────────────────┐
  │ [+ 新增 ▾]                          │
  │                                     │
  │ 🎬 帧动画     🔄循环  ✏️ 🗑️       │ ← 资源级动画
  │ 🎬 旋转效果   ⏱ 一次  ✏️ 🗑️       │
  └─────────────────────────────────────┘
  点击 ✏️ → 打开 AnimationEditorModal（轨道编辑器）
```

编辑的动画写入 **PropAsset.animations**（模板），放置到场景时一次性复制到 PropObject.animations。

**入口 B：对象实例级（场景编辑器属性面板）**

```
场景编辑器 → 选中道具对象 → 属性面板
  ┌── 动画 ─────────────────────────────┐
  │                                     │
  │ ▸ 资源动画 (2)        [重新应用]     │ ← 从模板复制来的，可重新同步
  │   🎬 帧动画       初始播放: ☑ 循环: ☑│
  │   🎬 旋转效果     初始播放: ☐ 循环: ☐│
  │                                     │
  │ ▸ 实例动画 (1)        [+ 新建动画]   │ ← 仅本实例拥有的动画
  │   🎬 抖动效果     初始播放: ☐ 循环: ☐│
  │                                     │
  │   [编辑资源]                         │ ← 打开资源编辑对话框（修改模板）
  └─────────────────────────────────────┘
```

用户在属性面板中可以：
- **配置初始播放 / 循环**：设置 `initialAnimations`（Setup Mode）
- **新建实例级动画**：[+ 新建动画] → 打开 `AnimationEditorModal` → 写入该 PropObject.animations
- **重新应用资源动画**：将 PropAsset 的最新模板动画重新覆盖到当前实例
- **编辑资源**：打开道具编辑对话框，修改资源模板级的动画（影响所有新实例）

背景对象的流程与道具完全一致。

#### 7.4.3 角色：独立编辑页面 + 场景内配置

角色动画在**人物编辑页面**通过 `AnimationManager` + `AnimationEditorModal` 创建，存储在 Character.animations。

场景编辑器中，选中角色对象后，属性面板仅显示动画列表供配置初始播放，不直接新建：

```
场景编辑器 → 选中角色 → 属性面板
  ┌── 动画 ─────────────────────────────┐
  │ 🎬 说话       初始播放: ☑ 循环: ☑    │
  │ 🎬 走路       初始播放: ☐ 循环: ☐    │
  │ 🎬 挥手       初始播放: ☐ 循环: ☐    │
  │                                     │
  │ [前往人物编辑页面]                    │ ← 角色动画编辑入口
  └─────────────────────────────────────┘
```

#### 7.4.4 组合对象：场景/模板编辑器内直接编辑

组合对象没有外部资源模板，动画直接在场景编辑器或模板编辑器中创建：

```
场景编辑器 → 选中组合对象 → 属性面板
  ┌── 动画 ─────────────────────────────┐
  │                                     │
  │ 🎬 整体旋转   track  ✏️ 🗑️         │
  │ 📋 启动运行   playlist ✏️ 🗑️       │ ← 编排动画
  │                                     │
  │ [+ 新建轨道动画]  [+ 新建编排动画]    │
  └─────────────────────────────────────┘
```

- **[+ 新建轨道动画]**：打开 `AnimationEditorModal` → 创建 TrackAnimationDefinition
- **[+ 新建编排动画]**：打开 `PlaylistEditorModal`（新组件）→ 创建 PlaylistAnimationDefinition，选择子对象及其动画名称

#### 7.4.5 元件/文本/特效：场景/模板编辑器内直接编辑

与组合对象相同的场景内编辑模式，但仅支持 track 类型：

```
场景编辑器 → 选中元件 → 属性面板
  ┌── 动画 ─────────────────────────────┐
  │ 🎬 开门效果   初始播放: ☐ 循环: ☐    │
  │                                     │
  │ [+ 新建动画]                         │
  └─────────────────────────────────────┘
```

#### 7.4.6 AnimationManager 组件复用计划

当前 `AnimationManager.vue` 通过 `resourceType + resourceId` 从 `animationStore` 读写动画。改造后需支持两种数据源模式：

| 模式         | 数据源                                   | 使用场景                               |
| :----------- | :--------------------------------------- | :------------------------------------- |
| **资源模式** | `animationStore.getAnimations(type, id)` | 道具/背景/角色编辑页面（保留现有逻辑） |
| **对象模式** | `sceneObject.animations`                 | 场景编辑器/模板编辑器属性面板          |

```typescript
// AnimationManager props 扩展
interface Props {
  // 资源模式（现有）
  resourceType?: AnimationResourceType
  resourceId?: string
  // 对象模式（新增）
  sceneObject?: SceneObject
  // 是否允许 Playlist 类型
  allowPlaylist?: boolean
}
```

### 7.5 资源模板 → 实例 复制语义

> 道具/背景/角色的资源（PropAsset/Background/Character）保留 `.animations` 字段作为**模板默认值**。

**复制规则**：
- **创建时一次性复制**：对象放置到场景时，模板动画深克隆到对象实例的 `animations`
- **独立副本**：复制后实例的动画与资源模板完全解耦，互不影响
- **资源模板更新不回溯**：修改 PropAsset 的模板动画后，已有的 PropObject 实例**不会自动同步**
- **手动重新应用**：如需同步，用户可通过属性面板 [重新应用资源动画] 操作

### 7.6 场景编辑器中打开资源编辑对话框

在场景编辑器中选中道具/背景/音效对象时，属性面板增加 **[编辑资源]** 入口，打开对应的资源编辑对话框。在资源编辑对话框中可以：
- 修改资源本身的图片/音频等属性
- 管理资源级动画（模板默认值）

修改资源级动画后，**仅影响未来新放置的实例**；已有实例需手动 [重新应用资源动画]。

### 7.7 帧动画自动发现与隐式动画迁移

```
旧：道具放入场景 → autoDiscover → 写入 PropAsset._runtimeAnimations
新：道具放入场景 → autoDiscover → 写入 PropObject.animations
```

> **当前实现**：对象可携带自身 `animations`，资源级动画作为模板默认值参与实例化；自动发现的帧动画由 Store 写入对象动画数据。

### 7.8 `set_anim` Action 播放链路变更

```
旧链路（通过 refId 间接查资源）：
  AnimationHost.getAnimationDefinition(type, refId, animName)
    → animationStore.getAnimationByName('prop', refId, '旋转')

新链路（优先对象级，回退场景级）：
  AnimationHost.getAnimationDefinition(objectId, animName)
    → 1. sceneObject.animations[animName]          ← 优先查对象级
    → 2. scene.animations.find(a => a.name === animName) ← 回退查场景级
    → type === 'track'?    → TrackAnimationHandler.play()
    → type === 'playlist'? → PlaylistAnimationHandler.play() → 级联触发子动画
```

> 场景级动画的 `target === '__scene_animation__'` 机制保留，用于在 ActionInspector 中区分场景级动画来源。

**AnimationHost 接口签名变更**：
```typescript
// 旧
getAnimationDefinition(type: AnimationResourceType, refId: string, animName: string)
getOrCreateImplicitAnimation(type: 'prop'|'background', refId: string, animName: string)

// 新
getAnimationDefinition(objectId: string, animName: string)
getSceneAnimationByName(name: string)  // 保留，用于场景级动画
```

### 7.9 需改造的模块

| 模块                                           | 变更                                                                                                                               |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| `SceneObjectBase` (sceneObject.ts)             | 新增 `animations` 字段；删除子类（Character/Background/Prop）重复的 `initialAnimations` 声明                                       |
| `SceneObjectType` (sceneObject.ts)             | 枚举增加 `'symbol'`                                                                                                                |
| `AnimationDefinition` (animation.ts)           | 改造为 `AnimationDefinitionBase`（新增 `description`/`tags`）+ `TrackAnimationDefinition` + `PlaylistAnimationDefinition` 联合类型 |
| `AnimationHost` 接口 (AnimationController.ts)  | `getAnimationDefinition` 签名从 `(type, refId, animName)` 改为 `(objectId, animName)`；删除 `getOrCreateImplicitAnimation`         |
| `AnimationController` (AnimationController.ts) | 消除按类型硬编码三分支分发（character/prop/background）；消除 `as unknown as` 断言；支持 symbol + playlist 类型                    |
| `ScenePlayer.vue`                              | `scenePlayerAnimationHost` 实现适配新签名；`getSceneAnimationByName` 保留                                                          |
| `FrameCapture.ts`                              | 同上                                                                                                                               |
| `animationStore`                               | 改为从 SceneObject 读写，删除资源级 switch 分发；删除 `getOrCreateImplicitAnimation`                                               |
| `sceneAnimationStore`                          | **保留**，继续管理场景级动画                                                                                                       |
| `SceneAnimationPanel.vue`                      | **保留**，继续作为场景级动画的编辑 UI                                                                                              |
| `ActionInspector.vue`                          | `__scene_animation__` 分支保留；对象动画来源改为从 `sceneObject.animations` 读取；新增 `set_material` Action 的属性编辑面板        |
| `ObjectPropertiesPanel.vue`                    | `resourceAnimations` 改为从 `localObject.animations` 读取                                                                          |
| `metadata.ts`                                  | `animationResourceType` 字段废弃；新增 `symbol` 类型注册                                                                           |
| `autoDiscoverForPropOrBackground`              | 改为写入 SceneObject，废弃隐式动画临时创建模式                                                                                     |
| `SceneContainer` (screenplay.ts)               | `animations?: SceneAnimation[]` 字段**保留**                                                                                       |
| `SceneAnimation` (animation.ts)                | **保留**，`definition` 字段改为 `AnimationDefinition` 联合类型（支持 track + playlist）                                            |
| `ActionType` 联合类型 (screenplay.ts)          | 新增 `'set_material'`                                                                                                              |
| `SetMaterialHandler` (actionHandlers/)         | **新增**，处理元件素材切换逻辑                                                                                                     |

---

## 八、元件与文本对象

### 8.1 管理方式：统一在场景模板中

元件（Symbol）和带背景的文本对象不需要单独的管理页面，统一在**场景模板**中管理：

| 场景               | 表现形式                                            |
| :----------------- | :-------------------------------------------------- |
| 可切换外观的门     | 场景模板（仅含 1 个 SymbolObject）                  |
| 带背景框的对话气泡 | 场景模板（Composite: TextObject + PropObject 背景） |
| 车辆组合           | 场景模板（Composite + 多个子道具）                  |
| 独立元件（少量）   | 场景模板（仅含 1 个 SymbolObject）                  |

### 8.2 元件（Symbol）对象类型

元件是新增的场景对象类型，填补道具（单资源）和角色（多部件）之间的空白。

> **当前实现**：`SceneObjectType` 已包含 `'symbol'`，并由 metadata/serializer/provider 体系注册。

#### 8.2.1 数据模型

```typescript
export interface SymbolObject extends SceneObjectBase {
  type: 'symbol'
  /** 素材列表（自包含，类似角色部位的 assets）*/
  materials: SymbolMaterial[]
  /** 当前显示的素材 ID */
  currentMaterialId?: string
}

export interface SymbolMaterial {
  id: string
  name: string
  type: 'static' | 'animation'
  url?: string
  frames?: { url: string; _runtimeUrl?: string }[]
  fps?: number
  loop?: boolean
  _runtimeUrl?: string
}
```

**关键特点**：
- 素材直接存在对象上（自包含），不依赖外部资源 Store
- 无需 symbolStore 或独立管理页面
- 运行时通过 `set_material` Action 切换显示素材

> **类型复用**：`SymbolMaterial` 与现有 `PartAsset` 结构高度相似（`id/name/type/url/frames/fps/loop/_runtimeUrl`）。当前通过 `SymbolMaterial` 描述元件素材，并由 `SymbolMaterialManagerDialog.vue` 管理。

#### 8.2.2 创建入口

| 入口               | 操作                       | 说明                                               |
| :----------------- | :------------------------- | :------------------------------------------------- |
| **场景编辑器**     | 添加素材菜单 → [添加元件]  | 创建空白 SymbolObject 放置到画布，用户后续编辑素材 |
| **模板编辑器**     | 底部工具栏 → [添加元件]    | 同上                                               |
| **场景模板实例化** | 拖入含 SymbolObject 的模板 | 自动实例化，UUID 重映射                            |

```
场景编辑器 → 添加素材下拉菜单
  ┌─────────────────┐
  │ 📦 添加道具      │
  │ 🖼️ 添加背景      │
  │ 🔊 添加音频      │
  │ 🔧 添加元件      │ ← 新增
  │ 📐 添加场景模板  │
  └─────────────────┘
```

#### 8.2.3 元件素材管理对话框（参考 ResourceDrawer）

选中 SymbolObject 后，通过属性面板 **[编辑元件]** 按钮打开素材管理对话框：

```
┌─ 元件素材管理 — 可切换的门 ──────────────────────────────── ✕ ─┐
│                                                                  │
│  [➕ 添加素材]                              [🏗️ 批量管理]        │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                │
│  │        │  │        │  │        │  │        │                │
│  │  �️   │  │  🖼️   │  │  🎬   │  │  🖼️   │                │
│  │        │  │        │  │        │  │        │                │
│  ├────────┤  ├────────┤  ├────────┤  ├────────┤                │
│  │门_关闭 │  │门_半开 │  │门_全开 │  │门_损坏 │                │
│  │ 静态   │  │ 静态   │  │ 动画   │  │ 静态   │                │
│  │ ✏️ 🗑️ │  │ ✏️ 🗑️ │  │ ✏️ 🗑️ │  │ ✏️ 🗑️ │                │
│  └────────┘  └────────┘  └────────┘  └────────┘                │
│                                                                  │
│                                                    [关闭]        │
└──────────────────────────────────────────────────────────────────┘

批量管理模式：
┌──────────────────────────────────────────────────────────────────┐
│  [➕ 添加素材]                              [🔙 退出管理]        │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                │
│  │ ☑      │  │ ☐      │  │ ☑      │  │ ☐      │                │
│  │  🖼️   │  │  🖼️   │  │  🎬   │  │  🖼️   │                │
│  │        │  │        │  │        │  │        │                │
│  ├────────┤  ├────────┤  ├────────┤  ├────────┤                │
│  │门_关闭 │  │门_半开 │  │门_全开 │  │门_损坏 │                │
│  └────────┘  └────────┘  └────────┘  └────────┘                │
│                                                                  │
│  ☐ 全选 (2/4)                         [🗑️ 批量删除 (2)]        │
└──────────────────────────────────────────────────────────────────┘
```

**UI 设计说明**（参考 `ResourceDrawer`）：
- **缩略图网格**：每项显示素材预览图 + 名称 + 类型标签（静态/动画）
- **单项操作**：✏️ 编辑（打开素材编辑对话框）/ 🗑️ 删除
- **批量管理模式**：勾选框 + 底部全选/批量删除
- **[➕ 添加素材]**：打开 `SymbolMaterialEditorModal`（参考 `PartAssetEditorModal`）创建新素材

#### 8.2.4 素材编辑对话框（参考 PartAssetEditorModal）

点击 ✏️ 编辑或 [➕ 添加素材] 时，打开独立的素材编辑对话框：

```
┌─ 素材编辑 ────────────────────────────────── ✕ ─┐
│                                                    │
│  ┌──────────────────┐                              │
│  │                  │   素材名称 *                  │
│  │                  │   [门_关闭              ]     │
│  │    [预览区域]     │                              │
│  │                  │   类型                        │
│  │                  │   ◉ 静态图片  ○ 序列帧        │
│  │                  │                              │
│  └──────────────────┘   图片资源 *                  │
│                         ┌──────┐                   │
│  📂 assets/door.png     │  🖼️ │  [选择文件]       │
│                         └──────┘                   │
│                                                    │
│                              [取消]  [保存]         │
└────────────────────────────────────────────────────┘

序列帧模式：
┌────────────────────────────────────────────────────┐
│  ...                    类型                        │
│                         ○ 静态图片  ◉ 序列帧        │
│                                                    │
│                         序列帧 *                    │
│                         ┌──┐ ┌──┐ ┌──┐ ┌──┐ [+]   │
│                         │1 │ │2 │ │3 │ │4 │       │
│                         └──┘ └──┘ └──┘ └──┘       │
│                                                    │
│                         FPS: [12    ]              │
│                         循环: ☑                    │
│                         默认静止图: [从帧选择 ▾]    │
└────────────────────────────────────────────────────┘
```

#### 8.2.5 场景编辑器属性面板集成

选中 SymbolObject 时，属性面板以**缩略图网格**展示素材列表，支持快速切换：

```
┌─ 属性面板 ────────────────────────────────┐
│ 🔧 可切换的门                              │
│                                            │
│ ▸ 变换属性 (X/Y/Scale/Rotation)            │
│                                            │
│ ▼ 素材                           [编辑元件] │ ← 打开素材管理对话框
│   ┌──────┐  ┌──────┐  ┌──────┐            │
│   │ 🖼️  │  │ 🖼️  │  │ 🎬  │            │
│   │      │  │      │  │      │            │
│   │门_关闭│  │门_半开│  │门_全开│            │ ← 点击缩略图切换素材
│   │ ★当前 │  │      │  │      │            │
│   └──────┘  └──────┘  └──────┘            │
│                                            │
│ ▼ 动画                                     │
│   🎬 开门动画   初始播放: ☐  循环: ☐        │
│   [+ 新建动画]                              │
└────────────────────────────────────────────┘
```

#### 8.2.6 `set_material` Action

```typescript
export interface SetMaterialAction extends BaseAction {
  type: 'set_material'
  category: 'point'
  params: {
    materialId: string  // 目标素材 ID
  }
}
```

在 Action Mode 中，用户通过 `set_material` 动态切换元件外观：
- ActionInspector 中列出 SymbolObject 的所有 `materials` 供选择
- 播放引擎根据 `materialId` 查找对应素材并切换 PIXI 纹理

**需改造点**：
- `ActionType` 联合类型新增 `'set_material'`
- 新增 `SetMaterialHandler`（参考 `SetAnimHandler` 模式）
- `ActionInspector` 新增 `set_material` 的属性编辑面板（素材下拉列表）
- `ScenePlayer` / `FrameCapture` 在渲染时根据 `currentMaterialId` 切换纹理

### 8.3 文本对象扩展

带背景框的文本通过场景模板解决（Composite 包含 TextObject + PropObject 背景），无需修改 TextObject 类型本身。

---

## 九、限制与约束

- 不支持包含相机/音频/画面特效

---

## 十、演进路线

| 阶段       | 范围                                                                                                                                                                               |
| :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **第一期** | 动画架构统一：AnimationDefinition 类型体系（track + playlist）+ 取消资源级动画 + 保留场景级动画 → SceneObjectBase.animations + AnimationHost 重构 + AnimationController 三分支消除 |
| **第二期** | 场景模板：管理页面 + 模板编辑器 + 保存/实例化 + 编排动画 UI + SymbolObject 类型定义                                                                                                |
| **第三期** | 元件 (Symbol) 完整实现：素材管理 UI + set_material Action + 渲染引擎适配                                                                                                           |

---

## 十一、术语对照表

| 用户界面术语 | 代码术语                       | 描述                           |
| :----------- | :----------------------------- | :----------------------------- |
| 场景模板     | `SceneTemplate`                | 可复用的复杂资源容器           |
| 模板编辑器   | `SceneTemplateEditor`          | 简化版场景编辑器               |
| 元件         | `Symbol` / `SymbolObject`      | 多素材自包含对象               |
| 实例化       | `instantiateTemplate()`        | 从模板创建运行时对象           |
| 编辑资源     | 场景编辑器内打开资源编辑对话框 | 在场景中直接编辑道具/背 景资源 |
| 编排动画     | `PlaylistAnimationDefinition`  | 驱动多个子动画的组合动画       |
