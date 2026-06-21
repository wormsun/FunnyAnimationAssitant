# 沙雕动画小助手 - 剧本编辑页面 (Screenplay Editor) PRD v6.1
**模块：剧本编辑与场景编辑系统**

> **v6.1 优化目标**：解决场景复用难、状态连续性差、演员删除导致的数据引用断裂问题。

---

## 1. 核心架构与概念 (Core Concepts)

### 1.1 设计哲学
*   **剧本即核心**：采用流式剧本驱动，而非传统的关键帧时间轴。
*   **场景即容器 (Scene Container)**：场景是时间和状态的**防火墙**。进入新场景时，舞台状态强制重置为该场景定义的初始快照，阻断"雪崩效应"。
*   **双模式编辑**：
    *   **装修模式 (Setup Mode)**：定义 t=0 时的静态世界（谁在场、在哪里）。
    *   **导戏模式 (Action Mode)**：定义时间段内的动态演出（做什么动作）。

### 1.2 数据结构 (v6.0 架构)

**v6.0 核心变化：**
1. **Episode 合并 Screenplay**：`Episode.scenes` 直接存储场景列表，不再有独立的 Screenplay 对象
2. **演员阵容全局化**：`actors` 和 `narrator` 从剧集级别提升到项目级别（`ProjectData`），所有剧集共享同一套演员配置
3. **场景容器双层架构**：`SceneContainer` = `setup`（装修） + `script`（导戏）
4. **三种脚本块类型**：`DialogueBlock`、`NarrationBlock`、`ActionBlock`

**整体数据层级关系：**

``typescript
Project (项目)
├── actors: ActorConfig[]          // 项目级演员阵容（全局共享）
├── narrator: NarratorConfig       // 项目级旁白配置（全局共享）
└── episodes: Episode[]            // 剧集列表
    └── Episode (单个剧集)
        ├── id: string
        ├── episodeNumber: number
        ├── name: string
        ├── scenes: SceneContainer[]   // 场景容器列表
        ├── duration: number
        ├── modifiedAt: number
        └── version: '6.0'

SceneContainer (场景容器)
├── id: string
├── type: 'scene_container'
├── title: string
├── setup: SceneSetup              // 场景初始布局（t=0 状态）
│   ├── camera: { x, y, width, height, zoom }
│   └── objects: SceneSetupObject[]   // 场景对象列表
│       ├── type: 'character' | 'background' | 'bgm' | 'prop' | 'effect' | 'camera'
│       ├── refId: string             // 引用资源 ID
│       ├── x, y, scaleX, scaleY, rotation, zIndex
│       └── initialState?: { pose?, expression? }
└── script: ScriptBlock[]          // 脚本块列表
    ├── DialogueBlock: { type: 'dialogue', actorAlias, text, state?, expression?, actions[] }
    ├── NarrationBlock: { type: 'narration', text, actions[] }
    └── ActionBlock: { type: 'action', duration, description?, actions[] }

Action (动作挂载)
├── type: 'move' | 'trigger_anim' | 'vfx' | 'sfx'
├── target?: string                // 目标对象（演员别名等）
├── startRatio: number             // 触发时机 0.0-1.0（相对于Block时长）
├── exclusive?: boolean            // 是否独占，默认 false
└── params: {...}                  // 动作参数
```

**示例数据片段：**

```json
{
  "episodes": [
    {
      "id": "episode_01",
      "name": "第一集",
      "version": "6.0",
      "scenes": [
        {
          "id": "scene_01",
          "type": "scene_container",
          "title": "教室 - 开场",
          "setup": {
            "camera": { "x": 1120, "y": 700, "width": 1456, "height": 819, "zoom": 1.0 },
            "objects": [
              { "id": "bg_01", "refId": "bg_classroom", "type": "background", "x": 0, "y": 0, "zIndex": 0 },
              { "id": "char_xm", "refId": "char_xiaoming", "type": "character", "x": 500, "y": 700, "zIndex": 10, 
                "initialState": { "pose": "stand_calm", "expression": "neutral" } },
              { "id": "bgm_01", "refId": "bgm_daily", "type": "bgm", "x": 0, "y": 0, "zIndex": 0 }
            ]
          },
          "script": [
            {
              "id": "block_01",
              "type": "dialogue",
              "actorAlias": "xm",
              "text": "大家早上好！",
              "state": "stand_calm",
              "expression": "smile",
              "ttsConfig": { "duration": 2500 },
              "actions": [
                { "type": "move", "target": "xm", "startRatio": 0.0, "params": { "x": 600, "y": 700, "speed": "auto" } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 2. 功能概述

剧本编辑页面是用户创作的主界面。用于构建剧情结构、编写台词，并作为进入视觉编辑（装修/导戏）的入口。

**核心特点**：
*   **流式剧本**：垂直滚动的无限画布，模拟剧本写作体验
*   **文本驱动时间**：TTS 语音时长自动计算，无需手动设置帧数
*   **场景容器机制**：每个场景都是独立的状态防火墙
*   **双模式入口**：通过不同按钮进入装修模式或导戏模式
*   **场景折叠功能**：支持场景展开/折叠，折叠时脚本块作为子条目显示
*   **项目级演员管理**：演员和旁白配置在项目级别统一管理，所有剧集共享

---

## 3. 界面布局

### 3.1 整体布局

页面采用简洁的单栏布局（根据实际实现）：

*   **顶部工具栏 (60px)**：标题、演员管理、旁白配置、保存、预览、导出等功能按钮
*   **中间主区 (flex)**：垂直流式剧本编辑器（核心区域）
    *   场景容器卡片（可折叠）
    *   脚本块列表（对话块、旁白块、演出块）
    *   添加按钮（场景/脚本块）

``text
+-------------------------------------------------------------------------------------------------------+
|  [🔙]  项目: 搞笑短剧 Ep1   [☁️ 已保存]                                    [🎬 预览] [📤 导出视频]    |
+-----------------------+-------------------------------------------------------------------------------+
| 📍 导航 & 剧组         |                                                                               |
| [📑 大纲] [👥 演员表] |  (中间主区：无限滚动的剧本流)                                                 |
|                       |                                                                               |
| 1. 🏫 教室 (日)       |  +=========================================================================+  |
|    - 00:00            |  | 🎬 场景 1: 教室 - 开场                                [🖼️ 换背景] [🗑️] |  |
|                       |  | ----------------------------------------------------------------------- |  |
| 2. 🛣️ 走廊 (日)       |  | [ 🖼️ 背景: bg_classroom ]   [ 🎵 BGM: bgm_daily ]                      |  |
|    - 00:30            |  |                                                                         |  |
|                       |  | 💡 状态防火墙已激活。此处修改初始布局，不影响上一场景。                     |  |
|                       |  |            [ 🏗️ 编辑初始布局 (进入 Setup Mode) ]                          |  |
|                       |  +=========================================================================+  |
|                       |       |                                                                       |
|                       |  +--- v (Block 1) ------------------------------------------------------+   |
|                       |  | 🎭 演出 (纯动作)                  ⏱️ 时长: [ 2.0s ]                    |   |
|                       |  | -------------------------------------------------------------------- |   |
|                       |  | 描述: (自动生成) 小明走向座位。                                          |   |
|                       |  | [⚡ 动作: 移动(小明)]                                                    |   |
|                       |  |                  [ 🎬 编排动作 (进入 Action Mode) ]                    |   |
|                       |  +----------------------------------------------------------------------+   |
|                       |       |                                                                       |
|                       |  +--- v (Block 2) ------------------------------------------------------+   |
|                       |  | [Avatar] 👦 小明 (xm)   [🙂 表情: 微笑 v]    [🔊 语速: 1.0x]             |   |
|                       |  | -------------------------------------------------------------------- |   |
|                       |  | 文本: 大家早上好呀！[✏️]                                                 |   |
|                       |  | (TTS 进度条) [========== 2.5s ==========]                            |   |
|                       |  | [⚡ 动作: 挥手, 镜头推近]                                                |   |
|                       |  |                  [ 🎬 编排动作 (进入 Action Mode) ]                    |   |
|                       |  +----------------------------------------------------------------------+   |
|                       |                                                                               |
|                       |  +=========================================================================+  |
|                       |  | 🎬 场景 2: 走廊                                                         |  |
|                       |  +=========================================================================+  |
|                       |                                                                               |
+-----------------------+-------------------------------------------------------------------------------+
| [ ➕ 💬 对话 (Enter) ]   [ ➕ 👤 旁白 (Cmd+Enter) ]   [ ➕ 🎭 演出 (Shift+Enter) ]   [ ➕ 🎬 新场景 ] |
+-------------------------------------------------------------------------------------------------------+
```

---

## 4. Block 组件详解 (Block Components)

剧本流包含两个层级的组件：

### 4.1 场景容器块 (Scene Container Block)

*   **定义**：场景是时间和状态的**防火墙**。进入新场景时，舞台状态强制重置。
*   **UI 结构**：
    *   **场景标题栏 (SceneContainerHeader)**：
        *   折叠/展开图标 `[▼]` 或 `[▶]`
        *   场景标题（可编辑）
        *   统计信息：`共 X 个 Block，预估时长 Y 秒`
        *   删除按钮（需确认，提示"将同时删除所有脚本块"）
    *   **场景配置区**（展开时显示）：
        *   背景选择：`[ 🖼️ 背景: bg_classroom ]` 点击打开资源库
        *   BGM 选择：`[ 🎵 BGM: bgm_daily ]` 点击打开资源库
        *   **核心按钮**：`[ 🏗️ 编辑初始布局 ]` - 进入装修模式 (Setup Mode)
    *   **脚本块区域**（展开时显示）：
        *   显示该场景的所有脚本块（DialogueBlock、NarrationBlock、ActionBlock）
        *   添加脚本块按钮
*   **折叠状态**：
    *   显示场景标题和统计信息
    *   脚本块作为子条目（缩略显示）
    *   点击展开后显示完整配置和脚本块列表
*   **功能**：
    *   定义该场景的初始状态（setup 数据）
    *   阻断上一场景的状态传递
    *   作为该场景所有脚本块的容器
    *   管理场景级资源（背景、BGM）

### 4.2 对话块 (Dialogue Block)

*   **定义**：角色说话的片段，承载台词和配套动作。
*   **UI 结构**：
    *   **第一行**：
        *   演员选择：`[👦 小明 (xm)]` - 点击打开演员选择对话框
        *   姿势选择：`[🧍 姿势: stand_calm]` - 点击打开姿势选择对话框
        *   表情选择：`[🙂 表情: smile]` - 点击打开表情选择对话框
        *   语速调节：`[🔊 语速: 1.0x]`
    *   **第二行**：文本输入框（支持多行）
    *   **第三行**：TTS 进度条（自动计算时长）
    *   **第四行**：动作标签展示区（显示已添加的动作概要）
    *   **第五行**：`[ 🎬 编排动作 ]` 按钮 - 进入导戏模式 (Action Mode)
*   **交互**：
    *   点击演员 - 打开 ActorSelectorDialog
    *   点击姿势 - 打开 PoseSelectorDialog
    *   点击表情 - 打开 ExpressionSelectorDialog
    *   输入文本 - 自动防抖计算 TTS 时长
    *   点击编排动作 - 进入导戏模式

### 4.3 旁白块 (Narration Block)

*   **定义**：画外音，不关联任何人物。
*   **UI 结构**：与对话块类似，但无演员、姿势、表情选择。
    *   **第一行**：旁白标识 `[📢 旁白]`、语速调节
    *   **第二行**：文本输入框
    *   **第三行**：TTS 进度条
    *   **第四行**：动作标签展示区
    *   **第五行**：`[ 🎬 编排动作 ]` 按钮
*   **特点**：
    *   必须包含文本内容
    *   可以添加镜头、特效等动作
    *   TTS 使用项目级旁白配置的音色

### 4.4 演出块 (Action Block)

*   **定义**：纯动作片段，无台词，仅包含动作演出。
*   **UI 结构**：
    *   **标题行**：🎭 演出 (纯动作)   ⏱️ 时长: [ 2.0s ]（可编辑）
    *   **描述行**：自动生成的动作描述（如"小明走向座位"）或用户自定义描述
    *   **动作标签**：显示已添加的动作概要
    *   **核心按钮**：`[ 🎬 编排动作 ]` - 进入导戏模式 (Action Mode)
*   **应用场景**：
    *   无声的肢体动作
    *   镜头运动
    *   环境变化

---

## 5. 关键交互逻辑

## 5.1 场景容器交互

1.  **创建新场景**：
    *   点击添加场景按钮
    *   创建新的 `SceneContainer`，包含空的 `setup` 和 `script`
    *   默认展开状态，等待用户配置

2.  **场景折叠/展开**：
    *   点击场景标题栏的折叠图标
    *   折叠时：仅显示标题和统计信息
    *   展开时：显示完整配置和所有脚本块

3.  **编辑初始布局 (Setup Mode)**：
    *   点击场景容器的 `[ 🏗️ 编辑初始布局 ]` 按钮
    *   跳转至场景编辑页面，URL: `/episode/{episodeId}/edit?mode=setup&sceneId={sceneId}`
    *   在装修模式下定义场景的 t=0 状态
    *   保存后返回剧本编辑页面，自动更新 `scene.setup` 数据

4.  **场景删除**：
    *   点击删除按钮
    *   弹出确认提示："删除场景将同时删除该场景的所有脚本块，确定要删除吗？"
    *   确认后调用 `episodeStore.deleteScene(episodeId, sceneId)`


### 5.2 脚本块交互

1.  **对话块/旁白块**：
    *   输入文本后，自动防抖计算 TTS 时长（显示在进度条上）
    *   点击 `[ 🎬 编排动作 ]` 按钮进入导戏模式
    *   URL: `/episode/{episodeId}/edit?mode=action&sceneId={sceneId}&blockId={blockId}`

2.  **演出块**：
    *   手动输入时长（秒）
    *   点击 `[ 🎬 编排动作 ]` 按钮进入导戏模式
    *   适用于无台词的纯动作片段

3.  **添加脚本块**：
    *   在场景内点击添加按钮
    *   选择脚本块类型：对话块、旁白块、演出块
    *   创建新的 ScriptBlock 并添加到 `scene.script` 数组

4.  **删除脚本块**：
    *   点击脚本块的删除按钮
    *   调用 `episodeStore.deleteBlockFromScene(episodeId, sceneId, blockId)`

### 5.3 演员与旁白管理

1.  **项目级演员管理**：
    *   点击顶部工具栏的 `[ 👥 演员管理 ]` 按钮
    *   打开 `ActorManagementDialogV2` 对话框
    *   在对话框中添加、编辑、删除演员配置
    *   演员配置存储在 `ProjectData.actors`，所有剧集共享

2.  **旁白配置**：
    *   点击顶部工具栏的 `[ 📢 旁白配置 ]` 按钮
    *   打开 `NarratorConfigDialog` 对话框
    *   配置旁白的音色、语速等参数
    *   旁白配置存储在 `ProjectData.narrator`，所有剧集共享

3.  **演员选择（对话块）**：
    *   在对话块中点击演员选择按钮
    *   打开 `ActorSelectorDialog`，显示项目级演员列表
    *   选择后更新 `block.actorAlias`


### 5.4 自动保存机制

1.  **监听数据变化**：
    *   监听 `currentEpisode.modifiedAt` 的变化
    *   任何对 `scenes`、`script`、`actions` 的修改都会更新 `modifiedAt`

2.  **3秒防抖保存**：
    *   数据变化后 3 秒内无新变化，自动调用 `projectStore.saveProject()`
    *   保存成功后更新 `lastSaveTime`

3.  **手动保存**：
    *   点击顶部工具栏的 `[ 💾 保存 ]` 按钮
    *   快捷键 `Ctrl+S` / `Cmd+S`
    *   立即保存当前剧本数据

### 5.5 数据流

```
用户输入文本/选择配置
  ↓
更新 Episode.scenes[].script[]
  ↓
触发 modifiedAt 更新
  ↓
3秒后自动保存 (projectStore.saveProject)
  ↓
更新 lastSaveTime

点击「编排动作」
  ↓
跳转至场景编辑页 (Action Mode)
  URL: /episode/{episodeId}/edit?mode=action&sceneId={sceneId}&blockId={blockId}
  ↓
系统加载 scene.setup 作为初始状态
  ↓
用户编排动作，保存到 block.actions[]
  ↓
返回剧本编辑页面
```

---

## 6. 演员与旁白系统 (v6.0)

### 6.1 项目级演员配置

**存储位置**：`ProjectData.actors: ActorConfig[]`

**ActorConfig 结构**：
```typescript
interface ActorConfig {
  alias: string           // 剧本别名，如 "xm", "boy"
  characterId: string     // 人物资源 ID
  name: string            // 显示名称，如 "小明", "阿强"
  defaultExpression?: string  // 默认表情
  voice?: {
    voiceId?: string      // TTS 音色 ID
    speed?: number        // 语速倍率 (0.5 - 2.0)
  }
}
```

**管理方式**：
- 在顶部工具栏点击 `[ 👥 演员管理 ]` 打开管理对话框
- 添加演员：选择人物资源，设置别名和显示名称
- 编辑演员：修改演员配置（别名不可修改）
- 删除演员：删除后，使用该演员的对话块会显示警告

### 6.2 项目级旁白配置

**存储位置**：`ProjectData.narrator: NarratorConfig`

**NarratorConfig 结构**：
```typescript
interface NarratorConfig {
  voice?: {
    voiceId?: string      // TTS 音色 ID
    speed?: number        // 语速倍率 (0.5 - 2.0)
  }
}
```

**管理方式**：
- 在顶部工具栏点击 `[ 📢 旁白配置 ]` 打开配置对话框
- 设置旁白的音色和语速
- 配置立即生效，影响所有旁白块的 TTS 生成

---

## 7. 页面流转与数据交互

### 7.1 页面路由

**剧本编辑页面**：`/screenplay/{episodeId}`
- 参数：`episodeId` - 当前编辑的剧集 ID
- 数据来源：`episodeStore.getEpisode(episodeId)`

**场景编辑页面**（装修模式）：`/episode/{episodeId}/edit?mode=setup&sceneId={sceneId}`
- 参数：
  - `episodeId` - 剧集 ID
  - `sceneId` - 场景 ID
  - `mode=setup` - 装修模式
- 编辑目标：`scene.setup`

**场景编辑页面**（导戏模式）：`/episode/{episodeId}/edit?mode=action&sceneId={sceneId}&blockId={blockId}`
- 参数：
  - `episodeId` - 剧集 ID
  - `sceneId` - 场景 ID
  - `blockId` - 脚本块 ID
  - `mode=action` - 导戏模式
- 编辑目标：`block.actions[]`

### 7.2 数据操作方法

**Episode 级别**：
- `episodeStore.updateEpisode(episodeId, data)` - 更新剧集信息
- `episodeStore.getEpisode(episodeId)` - 获取剧集数据

**Scene 级别**：
- `episodeStore.addScene(episodeId, scene)` - 添加场景
- `episodeStore.getScene(episodeId, sceneId)` - 获取场景
- `episodeStore.updateScene(episodeId, sceneId, updates)` - 更新场景
- `episodeStore.deleteScene(episodeId, sceneId)` - 删除场景
- `episodeStore.updateScenes(episodeId, scenes)` - 批量更新场景列表

**Block 级别**：
- `episodeStore.addBlockToScene(episodeId, sceneId, block)` - 添加脚本块
- `episodeStore.updateBlockInScene(episodeId, sceneId, blockId, updates)` - 更新脚本块
- `episodeStore.deleteBlockFromScene(episodeId, sceneId, blockId)` - 删除脚本块

**Actor 级别**（项目级）：
- `projectStore.addActor(actor)` - 添加演员
- `projectStore.updateActor(alias, actor)` - 更新演员
- `projectStore.deleteActor(alias)` - 删除演员

**Narrator 级别**（项目级）：
- `projectStore.updateNarrator(narrator)` - 更新旁白配置


---

## 8. 快捷键定义

*   `Enter` - 插入对话块
*   `Cmd/Ctrl + Enter` - 插入旁白块
*   `Shift + Enter` - 插入演出块
*   `Cmd/Ctrl + Shift + S` - 插入新场景
*   `Tab` - 在对话块中切换下一个演员
*   `Delete` - 删除当前选中的 Block
*   `Up/Down` - 选中上一个/下一个 Block
*   `Cmd/Ctrl + S` - 手动保存
*   `Space` - 预览播放/暂停

---

## 9. 技术实现要点

### 9.1 数据版本管理

**版本标识**：
- `Episode.version = '6.0'` - 标识数据结构版本
- 用于数据迁移和兼容性检查

**数据迁移**：
- 从 v5.0 迁移到 v6.0：
  - 将 `Screenplay.scenes` 合并到 `Episode.scenes`
  - 将 `Screenplay.actors` 和 `Screenplay.narrator` 提升到 `ProjectData` 级别
  - 删除独立的 `Screenplay` 对象

### 9.2 状态管理

**Pinia Store 分层**：
- `projectStore`：管理项目级数据（演员、旁白、资源）
- `episodeStore`：管理剧集级数据（scenes、script、actions）

**响应式更新**：
- 使用 Vue 3 的 `computed` 和 `watch` 监听数据变化
- 自动触发 UI 更新和自动保存

### 9.3 性能优化

**场景折叠**：
- 大型剧本场景过多时，默认折叠非当前编辑场景
- 减少 DOM 渲染数量，提升性能

**虚拟滚动**：
- 对于超长剧本（100+ 场景），考虑实现虚拟滚动
- 仅渲染可视区域的场景和脚本块

**防抖保存**：
- 文本输入使用 300ms 防抖
- 自动保存使用 3000ms 防抖
- 避免频繁触发 I/O 操作

### 9.4 错误处理

**数据完整性检查**：
- 保存前检查剧本必须至少包含一个场景
- 对话块必须关联有效的演员别名
- 演员别名必须在项目级演员列表中存在

**用户提示**：
- 删除场景时提示将同时删除所有脚本块
- 返回时检查是否有未保存的修改


---

## 附录：术语表

- **Episode (剧集)**：v6.0 中合并了 Screenplay，直接包含 scenes 字段
- **SceneContainer (场景容器)**：包含 setup 和 script 的完整场景结构
- **SceneSetup (场景装修)**：定义场景的 t=0 状态，包括相机、对象布局
- **ScriptBlock (脚本块)**：DialogueBlock、NarrationBlock 或 ActionBlock
- **Action (动作)**：挂载在脚本块上的动作，通过 startRatio 控制触发时机
- **ActorConfig (演员配置)**：项目级演员设置，包含别名、人物引用、音色等
- **Setup Mode (装修模式)**：编辑场景初始布局的模式
- **Action Mode (导戏模式)**：编排脚本块内动作的模式
- **startRatio (触发比例)**：动作触发时机，0.0-1.0 相对于 Block 时长的比例
- **Runtime State (运行时状态)** (*v6.1 新增*)：场景执行完所有脚本块后，对象的最终位置、姿态、表情等状态
- **Scene Template (场景模板)** (*v6.1 新增*)：保存的场景 setup 预设，可用于快速创建常用场景配置
- **Missing Reference (丢失引用)** (*v6.1 新增*)：对话块的 actorAlias 在项目演员列表中找不到对应项的错误状态
- **Reference Integrity (引用完整性)** (*v6.1 新增*)：确保所有演员引用都有效且可追溯的数据一致性保障机制

*Last update：2025-12-09*
*v6.1 当前版本功能：剧本驱动系统、场景容器双层架构、项目级演员管理*
