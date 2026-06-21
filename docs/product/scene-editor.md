这是一份基于 **沙雕动画小助手 v6.2 槽位驱动架构**（Episode合并Screenplay + 场景容器 + 双模式编辑 + 槽位系统）全面更新后的 **场景编辑器 (Scene Editor) PRD**。

这份文档保留了原文档中关于 **PixiJS 渲染、坐标系统、画布尺寸** 等依然有效的底层技术规范，并重构了 **页面布局、交互逻辑和数据流** 以适配 v6.2 的槽位系统需求。

> **文档最后更新**: 2025-12-13

---

# 场景编辑器 (Scene Editor) - PRD v6.2

## 实现状态

| 功能                          | 状态     | 说明                               |
| ----------------------------- | -------- | ---------------------------------- |
| 双模式路由与布局切换          | ✅ 已实现 | Setup Mode / Action Mode           |
| Setup Mode 资源添加与层级管理 | ✅ 已实现 |                                    |
| Action Mode Ghosting 渲染     | ✅ 已实现 | 起点虚影 + 路径线                  |
| Action Mode 拖拽录制          | ✅ 已实现 | tween_transform 自动创建           |
| v6.2 槽位系统                 | ✅ 已实现 | slotIndex/slotSpan 替代 startRatio |
| 槽位解析 (TTS 字幕)           | ✅ 已实现 | parseBlockToSlots                  |
| MiniTimeline 基础渲染         | ✅ 已实现 |                                    |
| Point Action 录制             | ✅ 已实现 | 表情/姿态切换                      |

## 1. 概述与核心逻辑

### 1.1 页面定位
场景编辑器是 沙雕动画小助手 的核心视觉工作台。它不再是一个单一的静态编辑器，而是一个根据 URL 参数动态切换的 **双模式单页应用 (SPA)**。

*   **v6.0 路由规则**：
    *   **装修模式 (Setup Mode)**: `/episode/{episodeId}/edit?mode=setup&sceneId={sceneId}`
    *   **导戏模式 (Action Mode)**: `/episode/{episodeId}/edit?mode=action&sceneId={sceneId}&blockId={blockId}`

*   **核心变化**：
    *   路由中增加 `episodeId` 参数，明确当前编辑的剧集
    *   场景和脚本块都属于 `Episode.scenes` 数组
    *   演员配置从 `ProjectData.actors` 获取（项目级共享）

### 1.2 v6.0 数据架构

**整体数据层级关系**：

```typescript
Project (项目)
├── actors: ActorConfig[]          // 项目级演员阵容（全局共享）
├── narrator: NarratorConfig       // 项目级旁白配置（全局共享）
└── episodes: Episode[]            // 剧集列表
    └── Episode (单个剧集)
        ├── id: string
        ├── scenes: SceneContainer[]   // 场景容器列表
        └── ...

SceneContainer (场景容器 - 编辑目标)
├── id: string
├── type: 'scene_container'
├── title: string
├── setup: SceneSetup              // 装修模式编辑目标
│   ├── camera: CameraConfig       // 相机配置
│   └── objects: SceneSetupObject[] // 场景对象列表
└── script: ScriptBlock[]          // 脚本块列表
    └── DialogueBlock/NarrationBlock/ActionBlock
        └── actions: Action[]      // 导戏模式编辑目标
```

### 1.3 核心视口规范 (保留)
*   **固定画布尺寸**：**2240 × 1400 px**。这是所有数据的存储基准，保证运镜空间和多端一致性。
*   **相机对象尺寸**：默认 **1456 × 819 px** (16:9)，作为画布上的一个可操作对象存在。

---

## 2. 模式 A：装修模式 (Setup Mode)

## 2.1 功能定义
**"建筑师视角"**。用于定义场景容器的 `setup` 数据，即 $t=0$ 时刻的绝对状态。
*   **核心任务**：选背景、定角色、摆道具、调层级、定初相。
*   **时间概念**：无时间轴，仅静态布局。
*   **数据来源**：
    *   当前场景：`episodeStore.getScene(episodeId, sceneId)`
    *   演员列表：`projectStore.actors`（项目级共享）
    *   人物资源：`projectStore.characters`
    *   背景资源：`projectStore.backgrounds`

### 2.2 页面布局 (Setup Layout)

采用 **三栏式布局**：

*   **顶部栏**：资源入口（模态框触发）。
*   **左侧栏 (图层)**：场景对象列表 (Outliner)，管理 Z-Index。
*   **中间 (画布)**：所见即所得布局。
*   **右侧栏 (属性)**：设置对象的**初始状态** (Initial State)。

### 2.3 UI 线框图

```text
+-----------------------------------------------------------------------------------------------+
| [🔙 保存并返回]   🏗️ 装修模式：场景 1 - "教室(日)"                           [↩️ 撤销] [↪️ 重做] |
+-----------------------+-------------------------------------------------------+---------------+
| 📑 场景对象 (图层)     |   (顶部工具栏：资源入口)                               | ⚙️ 属性面板    |
| (Outliner) | [🖼️ 换背景]  [+ 👥 加演员]  [+ 🪑 加道具] |  |
| ---------- | -------------------------------------- |[ 选中: 小明 ] |
| [ 🔍 搜索对象...    ] |                                                       |               |
|                       |   (画布区域：2240 x 1400)                             | 📍 基础变换    |
| 1. [🎥 相机对象]      |   +-----------------------------------------------+   | X: [ 200 ]    |
|    (始终在顶层)       |   | [ 灰色遮罩 (非可视区) ]                       |   | Y: [ 500 ]    |
|                       |   |                                               |   | 缩放: [1.0]   |
| 2. [👥 小明]          |   |    +-------------------------------------+    |   | 翻转: [水平]  |
|    🔓 👁️             |   |    | [ 🟩 绿色相机框 (1456x819) ]        |    |   |               |
|                       |   |    |                                     |    | 🎭 初始状态    |
| 3. [🪑 课桌]          |   |    |      [小明]          [小红]         |    | (InitialState)|
|    🔓 👁️             |   |    |      (Stand)         (Sit)          |    |               |
|                       |   |    |                                     |    | 姿态: [站立 v]|
| 4. [🖼️ 背景图]        |   |    +-------------------------------------+    | 表情: [微笑 v]|
|    🔒 (底层)          |   |                                               |               |
|     | +-----------------------------------------------+ | 🗑️ 删除对象 |
| --- ||               |
| 💡 拖拽调整遮挡层级   |   (底部状态栏) [ 🔍 缩放: 60% ]  [🖐️ 抓手工具]        |               |
+-----------------------+-------------------------------------------------------+---------------+
```

### 2.4 核心交互逻辑
1.  **添加资源**：点击顶部按钮 -> 弹出系统素材库 -> 选择后实例化到画布中心。
2.  **层级调整**：在左侧列表拖拽 Item 排序（上方遮挡下方）。
3.  **初始状态**：在右侧属性面板设置 `initialState.pose` (姿态) 和 `initialState.expression` (表情)。
4.  **数据产出**：保存时调用 `episodeStore.updateScene(episodeId, sceneId, { setup })` 更新场景的 setup 数据。
5.  **返回流程**：保存后返回剧本编辑页面 `/screenplay/{episodeId}`。

### 2.5 SceneSetup 数据结构

```typescript
interface SceneSetup {
  camera: {
    x: number          // 相机中心 X，默认 1120
    y: number          // 相机中心 Y，默认 700
    width: number      // 相机宽度，默认 1456
    height: number     // 相机高度，默认 819
    zoom: number       // 缩放比例，默认 1.0
  }
  objects: SceneSetupObject[]  // 场景对象列表
}

interface SceneSetupObject {
  id: string                     // 对象实例 ID
  refId: string                  // 引用资源 ID
  type: 'character' | 'background' | 'bgm' | 'prop' | 'effect' | 'camera'
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  zIndex: number
  initialState?: {               // 仅 character 类型有效
    pose?: string                // 姿态 key
    expression?: string          // 表情 ID
  }
}
```

**关键字段说明**：
- `refId`：引用项目资源库中的资源 ID（characterId, backgroundId, bgmId 等）
- `initialState.pose`：引用 Character.states 中的姿态 key
- `initialState.expression`：引用项目表情库中的表情 ID

---

## 3. 模式 B：导戏模式 (Action Mode)

## 3.1 功能定义
**"导演视角"**。基于"上一刻"的状态，编排当前 Block 时间段内的动态演出。
*   **核心任务**：录制移动、切换表情、相机运镜、调整时序。
*   **前置逻辑 (Runtime Replay)**：进入时，系统自动回溯计算从 `Scene Start` 到 `Current Block` 之前的状态，作为画布起点。
*   **数据来源**：
    *   当前场景：`episodeStore.getScene(episodeId, sceneId)`
    *   当前脚本块：`scene.script.find(b => b.id === blockId)`
    *   场景初始状态：`scene.setup`
    *   演员配置：`projectStore.actors`（获取演员对应的人物资源）

### 3.2 页面布局 (Action Layout)

采用 **上下布局**：

*   **左侧栏**：在场对象列表（只读）+ 手动添加动作入口。
*   **中间 (画布)**：交互式录制区，支持 Ghosting（洋葱皮）。
*   **底部面板**：Mini-Timeline（迷你时间轴）+ 动作属性。

### 3.3 UI 线框图

```text
+-----------------------------------------------------------------------------------------------+
| [🔙 完成]  🎬 正在编排: 小明 - "大家早上好呀！" (TTS: 2.5s)           [⏮️] [▶ 播放] [🔁 循环] |
+-----------------------+-----------------------------------------------------------------------+
| 🎭 演员表 (只读)       |                                                                       |
|                       |   (画布区域：交互式录制区)                                            |
| [ 🎥 相机 ]           |                                                                       |
| Status: 推近中...     |       +-------------------------------------------------------+       |
|                       |       |                                                       |       |
| [ 👦 小明 ]           |       |      (A) 起点 (半透明虚影)                            |       |
| Status: 移动中...     |       |      [ 👻 ] .........................                 |       |
|                       |       |      Start: 0%                      :                 |       |
| [ 👧 小红 ]           |       |                                     v                 |       |
| Status: 静止          |       |                                   [ 👦 ] (B) 终点     |       |
|     |  |  |  |
| --- |+-------------------------------------------------------+       |
| ➕ 手动添加           |                                                                       |
| [✨ 特效] [🔊 音效]   |   (拖拽对象 -> 自动生成下方动作胶囊)                                  |
|                       |                                                                       |
+-----------------------+-----------------------------------------------------------------------+
| ⏱️ 迷你时间轴 (Mini-Timeline)                                                               |
+-----------------------------------------------------------------------------------------------+
| 🗣️ 参考轨      |  "大  家  早  上  好  呀 ！"      (~~~~~~ TTS 音频波形 ~~~~~~)               |
| (只读)        |  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|  |
|               |  0% (0s)    20%         40%         60%         80%         100% (2.5s)     |
+---------------+-------------------------------------------------------------------------------+
|               |  [ 🟦 移动: 小明 (Duration: Auto) ------------------------> ]                 |
| ⚡ 动作轨      |              [ 🟨 表情: 开心 (◇) ]                                            |
| (堆叠显示)    |                          [ 🟥 特效: 爱心冒出 (====) ]                         |
|               |                                                [ 🟩 相机: Zoom In (====>) ]   |
+---------------+-------------------------------------------------------------------------------+
| ⚙️ 动作属性   |  [选中: 小明移动]  开始: [ 0% ]   持续: [ 1500 ] ms   缓动: [ Ease-Out ]      |
+---------------+-------------------------------------------------------------------------------+
```

### 3.4 核心交互逻辑
1.  **所见即所得录制**：拖拽画布上的人物 -> 自动生成 `Move` 动作胶囊。
2.  **Ghosting (洋葱皮)**：拖拽时保留起点的半透明虚影，并在起点终点间绘制虚线轨迹。
3.  **时间轴控制**：
    *   拖拽胶囊位置 -> 调整 `startRatio` (触发时机 0.0-1.0)。
    *   拖拽胶囊边缘 -> 调整持续时长参数。
    *   吸附功能 -> 自动吸附到上方 TTS 文字的间隙。
4.  **数据产出**：保存时调用 `episodeStore.updateBlockInScene(episodeId, sceneId, blockId, { actions })` 更新脚本块的 actions 数组。
5.  **返回流程**：保存后返回剧本编辑页面 `/screenplay/{episodeId}`。

### 3.5 Action 数据结构 (v6.2 槽位系统)

**代码位置**: `src/types/screenplay.ts`

```typescript
// 动作分类
export type ActionCategory = 'point' | 'duration'

// 基础接口 (v6.2 - 槽位定位)
export interface BaseAction {
  id: string              // UUID
  target: string          // 目标标识 (Actor Alias 或 Object ID)
  type: ActionType
  category: ActionCategory // 动作分类
  slotIndex: number       // 依附的起始槽位下标
}

// 持续动作基础接口
interface BaseDurationAction extends BaseAction {
  category: 'duration'
  slotSpan: number        // 槽位跨度，默认 1
  easing?: string         // 缓动函数
}

// 补间变换动作
export interface TweenTransformAction extends BaseDurationAction {
  type: 'tween_transform'
  params: {
    x?: number; y?: number
    scaleX?: number; scaleY?: number
    rotation?: number; alpha?: number
  }
}

// 切换人物状态动作 (瞬时)
export interface SetCharacterAction extends BaseAction {
  type: 'set_character'
  category: 'point'
  params: {
    pose?: string       // 姿态 Key
    expression?: string // 表情 ID
  }
}

// 镜头切动作 (瞬时)
export interface CameraCutAction extends BaseAction {
  type: 'camera_cut'
  category: 'point'
  target: 'camera'
  params: { x: number; y: number; zoom: number }
}

// 运镜动作 (持续)
export interface CameraMoveAction extends BaseDurationAction {
  type: 'camera_move'
  target: 'camera'
  params: { x?: number; y?: number; zoom?: number }
}
```

**v6.2 关键变化**：
- **废弃** `startRatio` 和 `duration(ms)`
- **新增** `slotIndex` 和 `slotSpan` 用于槽位定位
- **新增** `category` 字段区分瞬时/持续动作
- **触发时机**：通过 `Slot[slotIndex].startTime` 获取
- **持续时长**：通过 `Sum(Slot[i]...Slot[i+slotSpan-1].duration)` 计算

---

## 4. 坐标系统与渲染规范 (保留与增强)

### 4.1 双坐标体系
*   **画布坐标 (Canvas Coordinates)**：数据层。固定 **6720×2800**。所有存储数据 (`x`, `y`) 均基于此；相机视口基准为 1456×819。
*   **视口坐标 (Viewport Coordinates)**：渲染层。根据浏览器窗口大小动态缩放。

### 4.2 相机对象 (Camera Object)
*   **定义**：在画布坐标系中的一个矩形框对象。
*   **默认属性**：
    *   `width`: 1456, `height`: 819 (16:9)
    *   `x`: 1120, `y`: 700 (画布中心)
*   **渲染规则**：
    *   编辑器中：显示为绿色描边框，周围区域有半透明遮罩。
    *   导出视频时：PixiJS 根据相机对象的参数计算 Transform Matrix，只渲染框内内容。

### 4.3 背景图片处理
*   **缩放规则**：高度固定缩放至 1400px，宽度按比例缩放。
*   **对齐规则**：背景中心始终与画布中心 (1120, 700) 对齐。

---

## 5. 对象管理与调试

### 5.1 对象通用属性 (v6.0 更新)
```typescript
// Setup模式：SceneSetupObject（存储到scene.setup.objects）
interface SceneSetupObject {
  id: string              // 对象实例 ID
  refId: string           // 引用资源 ID（characterId, backgroundId等）
  type: 'character' | 'background' | 'bgm' | 'prop' | 'effect' | 'camera'
  
  // 变换属性
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  zIndex: number
  
  // 初始状态（仅character类型）
  initialState?: {
    pose?: string         // 姿态 key
    expression?: string   // 表情 ID
  }
}

// Action模式：运行时对象状态（从scene.setup + block.actions计算得出）
interface RuntimeSceneObject extends SceneSetupObject {
  // 运行时状态（从actions计算）
  currentPose?: string
  currentExpression?: string
  
  // 编辑器辅助属性（不存储）
  locked?: boolean
  visible?: boolean
}
```

**v6.0 关键变化**：
1. `refId` 直接引用资源 ID，不再使用别名映射
2. 对于 character 类型，`refId` 是 `characterId`，需要通过演员配置反查演员别名
3. `initialState` 只在 Setup 模式设置，Action 模式通过 actions 计算当前状态
4. `zIndex` 直接存储，不再通过数组索引推导

### 5.2 PixiJS 调试增强
*   保留原有的 `displayObject.debugInfo` 机制。
*   **Action Mode 新增**：在调试信息中增加 `actionSource` 字段，标识当前状态是由哪个动作触发的。

---

## 6. 技术实现细节 (Implementation Details)

### 6.1 渲染器架构 (useSceneRenderer)
需支持根据 Mode 切换交互策略：
*   **Setup Mode**：启用 `Drag`, `Resize`, `Rotate` 交互，数据双向绑定到 `SceneStore`。
*   **Action Mode**：
    *   启用 `GhostingDrag` 交互（不直接修改对象坐标，而是生成 Action）。
    *   禁用 `Delete` 和 `Create` 操作。

### 6.2 状态回溯 (Runtime Replay)
*   实现函数 `calculatePrevContext(scene, blockId)`。
*   在 Action Mode 初始化时调用，快速模拟执行当前 block 之前的所有动作，将结果作为初始状态渲染。
*   状态计算流程：
    1. 从 `scene.setup` 获取初始状态
    2. 按顺序执行 `scene.script[0...n-1]` 的所有 actions
    3. 返回计算后的对象状态（位置、姿态、表情等）

```typescript
// 工具函数（已实现）
import { 
  calculatePrevContext,           // 计算前置状态
  applyBlockActionsToState,       // 应用block的actions到状态
  updateActionInBlock,            // 更新block中的action
  addActionToBlock                // 添加action到block
} from '@/utils/sceneStateCalculator'

// 使用示例
const prevState = calculatePrevContext(scene, blockId)
// prevState 包含所有对象在当前block开始时的状态
```

---

## 8. v6.0 数据流与状态管理

### 8.1 Setup 模式数据流

```
用户操作（添加/移动/删除对象）
  ↓
sceneObjectStore 更新本地状态
  ↓
点击「保存画面设置」
  ↓
episodeStore.updateScene(episodeId, sceneId, { setup })
  ↓
更新 Episode.scenes[].setup
  ↓
返回剧本编辑页面 /screenplay/{episodeId}
```

### 8.2 Action 模式数据流 (v6.2 槽位系统)

```
进入页面
  ↓
从 episodeStore.getScene(episodeId, sceneId) 获取场景
  ↓
从 scene.script 获取当前 block
  ↓
calculatePrevContext(scene, blockId) 计算前置状态
  ↓
parseBlockToSlots(block) 解析槽位列表
  ↓
渲染画布（显示block开始时的状态）
  ↓
用户操作（拖拽对象）
  ↓
useSceneRenderer.handleGlobalPointerUp() 检测拖拽结束
  ↓
SceneEditMode.handleActionUpdate() 创建/更新 Action
  - 设置 slotIndex = currentSlotIndex
  - 设置 slotSpan = 1
  - 设置 easing = 'linear'
  ↓
episodeStore.updateBlockInScene(episodeId, sceneId, blockId, { actions })
  ↓
更新 Episode.scenes[].script[].actions
  ↓
返回剧本编辑页面 /screenplay/{episodeId}
```

### 8.3 演员别名与人物资源映射

```typescript
// 获取演员对应的人物资源
function getCharacterByActorAlias(actorAlias: string) {
  const actor = projectStore.actors.find(a => a.alias === actorAlias)
  if (!actor) return null
  return projectStore.characters[actor.characterId]
}

// 在Setup模式添加人物时
function addCharacterToSetup(characterId: string) {
  // 创建SceneSetupObject
  const obj: SceneSetupObject = {
    id: generateId('char'),
    refId: characterId,      // 直接存储characterId
    type: 'character',
    x: 1120, y: 700,
    scaleX: 1, scaleY: 1,
    rotation: 0,
    zIndex: 10,
    initialState: {
      pose: 'stand_calm',    // 默认姿态
      expression: undefined  // 可选表情
    }
  }
  scene.setup.objects.push(obj)
}

// 在Action模式创建移动动作时
function createMoveAction(actorAlias: string, targetX: number, targetY: number) {
  const action: MoveAction = {
    type: 'move',
    target: actorAlias,      // 使用演员别名，不是characterId
    startRatio: 0.0,
    params: {
      x: targetX,
      y: targetY,
      speed: 'auto'
    }
  }
  addActionToBlock(block, action)
}
```

---

## 9. 技术实现要点

### 9.1 Store 分层职责

**episodeStore（剧集数据管理）**：
- 管理 `Episode.scenes` 数组
- 提供场景和脚本块的 CRUD 方法
- 场景级别：`addScene`, `getScene`, `updateScene`, `deleteScene`
- 脚本块级别：`addBlockToScene`, `updateBlockInScene`, `deleteBlockFromScene`

**projectStore（项目资源管理）**：
- 管理项目级资源：`actors`, `narrator`, `characters`, `backgrounds`, `expressions`
- 提供演员管理方法：`addActor`, `updateActor`, `deleteActor`
- 提供旁白管理方法：`updateNarrator`

**sceneObjectStore（场景编辑运行时状态）**：
- 仅用于场景编辑器内部状态管理（不持久化）
- 管理当前编辑场景的对象列表
- 提供选择、拖拽、变换等编辑操作
- 保存时将数据写回 episodeStore

### 9.2 演员别名解析

在 Action 模式下，需要将 `action.target`（演员别名）映射到场景对象：

```typescript
// 从scene.setup.objects中查找演员对应的场景对象
function findSceneObjectByActorAlias(scene: SceneContainer, actorAlias: string) {
  // 1. 从projectStore获取演员配置
  const actor = projectStore.actors.find(a => a.alias === actorAlias)
  if (!actor) return null
  
  // 2. 在scene.setup.objects中查找refId匹配的对象
  return scene.setup.objects.find(obj => 
    obj.type === 'character' && obj.refId === actor.characterId
  )
}
```

### 9.3 状态计算缓存

为提升性能，状态回溯结果应缓存：

```typescript
const stateCache = new Map<string, RuntimeSceneObject[]>()

function getCachedPrevContext(scene: SceneContainer, blockId: string) {
  const cacheKey = `${scene.id}_${blockId}`
  if (!stateCache.has(cacheKey)) {
    const state = calculatePrevContext(scene, blockId)
    stateCache.set(cacheKey, state)
  }
  return stateCache.get(cacheKey)!
}

// 当scene或block的actions变化时，清除缓存
watch(() => currentScene.value?.script, () => {
  stateCache.clear()
}, { deep: true })
```

---

---

