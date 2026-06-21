---

# 场景编辑器 Action 功能详解 - PRD v6.2

> **文档最后更新**: 2025-12-13  
> **代码位置**: `src/types/screenplay.ts`

## 实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| v6.2 槽位系统数据结构 | ✅ 已实现 | slotIndex/slotSpan 替代 startRatio/duration |
| Duration Action 类型定义 | ✅ 已实现 | tween_transform, camera_move 等 |
| Point Action 类型定义 | ✅ 已实现 | set_character, camera_cut 等 |
| 拖拽录制生成动作 | ✅ 已实现 | tween_transform 自动创建 |
| Ghosting 可视化 | ✅ 已实现 | 起点虚影 + 路径线 |

## 1. 功能概述 (Overview)

在 **导戏模式 (Action Mode)** 下，用户基于 **槽位系统 (Slot System)** 编排对象的动态行为。

**v6.2 核心变化**：
- **废弃**: 基于毫秒/比例的自由时间轴编辑 (`startRatio`, `duration(ms)`)
- **新增**: 基于 TTS 分句的槽位编辑系统 (`slotIndex`, `slotSpan`)

系统将 Action 分为两类：
1.  **瞬时动作 (Point Action)**：锁定在 Slot 起始点触发，立即改变状态（如：切换表情、瞬移、显隐）。
2.  **持续动作 (Duration Action)**：填满 Slot（或合并后的 Super Slot）全时长，进行插值变化（如：移动、缩放、运镜）。

## 2. 数据结构定义 (Data Schema) - v6.2 槽位系统

位置: `src/types/screenplay.ts`

```typescript
// 动作类型枚举
export type ActionType = 
  // --- 瞬时动作 (Point Actions) ---
  | 'set_active'      // 显隐
  | 'set_transform'   // 瞬间改变变换
  | 'set_character'   // 切换人物状态 (姿态/表情)
  | 'control_anim'    // 动画播放控制
  | 'camera_cut'      // 镜头切
  | 'vfx_trigger'     // 触发一次性特效
  // --- 持续动作 (Duration Actions) ---
  | 'tween_transform' // 补间变换
  | 'camera_move'     // 运镜
  | 'camera_shake'    // 震动
  | 'vfx_emit'        // 特效发射

// 动作分类 (v6.2 新增)
export type ActionCategory = 'point' | 'duration'

// 基础接口 (v6.2 - 槽位定位)
export interface BaseAction {
  id: string              // UUID
  target: string          // 目标标识 (Actor Alias 或 Object ID)
  type: ActionType
  category: ActionCategory // 动作分类
  slotIndex: number       // 依附的起始槽位下标
}

// ---------------- 瞬时动作 (Point Actions) ----------------
// 触发时机: Slot.startTime

export interface SetActiveAction extends BaseAction {
  type: 'set_active'
  category: 'point'
  visible: boolean
}

export interface SetTransformAction extends BaseAction {
  type: 'set_transform'
  category: 'point'
  params: {
    x?: number; y?: number
    scaleX?: number; scaleY?: number
    rotation?: number
    alpha?: number
    zIndex?: number
  }
}

export interface SetCharacterAction extends BaseAction {
  type: 'set_character'
  category: 'point'
  params: {
    pose?: string       // 姿态 Key
    expression?: string // 表情 ID
  }
}

export interface ControlAnimAction extends BaseAction {
  type: 'control_anim'
  category: 'point'
  params: {
    command: 'play' | 'stop' | 'pause' | 'gotoAndPlay' | 'gotoAndStop'
    frame?: number
    loop?: boolean
    speed?: number
  }
}

export interface CameraCutAction extends BaseAction {
  type: 'camera_cut'
  category: 'point'
  target: 'camera'
  params: {
    x: number; y: number; zoom: number; rotation?: number
  }
}

export interface VFXTriggerAction extends BaseAction {
  type: 'vfx_trigger'
  category: 'point'
  params: {
    assetId: string
    x?: number
    y?: number
  }
}

// ---------------- 持续动作 (Duration Actions) ----------------
// 触发时机: Slot.startTime
// 持续时长: Sum(Slot[i]...Slot[i+span-1].duration)

interface BaseDurationAction extends BaseAction {
  category: 'duration'
  slotSpan: number     // 槽位跨度，默认 1
  easing?: string      // 缓动函数: 'linear', 'easeInOutQuad' 等
}

export interface TweenTransformAction extends BaseDurationAction {
  type: 'tween_transform'
  params: {
    x?: number; y?: number
    scaleX?: number; scaleY?: number
    rotation?: number
    alpha?: number
  }
}

export interface CameraMoveAction extends BaseDurationAction {
  type: 'camera_move'
  target: 'camera'
  params: {
    x?: number; y?: number
    zoom?: number
    rotation?: number
  }
}

export interface CameraShakeAction extends BaseDurationAction {
  type: 'camera_shake'
  target: 'camera'
  params: {
    intensity: number  // 震动强度 (px)
    decay: boolean     // 是否衰减
    frequency: number  // 震动频率 (Hz)
  }
}

export interface VFXEmitAction extends BaseDurationAction {
  type: 'vfx_emit'
  params: {
    assetId: string
    loop: boolean
  }
}

// 联合类型
export type Action = 
  | SetActiveAction | SetTransformAction | SetCharacterAction 
  | ControlAnimAction | CameraCutAction | VFXTriggerAction
  | TweenTransformAction | CameraMoveAction | CameraShakeAction | VFXEmitAction
```

### 2.1 运行时槽位结构 (RuntimeSlot)

位置: `src/types/screenplay.ts`

```typescript
// 槽位是编辑器运行时的临时容器，由 TTS 数据动态计算生成
export interface RuntimeSlot {
  index: number          // 槽位序号 (0, 1, 2...)
  text: string           // 该分句的文本内容
  startTime: number      // 相对于 Block 开始的绝对时间 (ms)
  duration: number       // 该分句 TTS 时长 (ms)
  
  // UI 状态标识
  isMerged?: boolean     // 是否是被合并的槽位
  parentIndex?: number   // 如果被合并，指向的主槽位索引
  spanCount?: number     // 如果是主槽位，表示跨越了几个原始槽位
}
```

---

## 3. 场景编辑页面 UI 变更 (UI Changes)

### 3.1 总体布局调整
*   **左侧面板**：动作列表 (ActionListPanel)，按槽位索引排序显示。
*   **底部面板**：槽位编辑器 (MiniTimeline)，显示 TTS 分句对应的槽位卡片。
*   **右侧面板**：动作属性检查器 (ActionInspector)。

### 3.2 左侧面板：Action List Panel (动作列表)

**代码位置**: `src/components/ActionListPanel.vue`

**设计目标**：按槽位顺序展示动作清单。

*   **列表项设计**：
    ```text
    [Icon] [Slot] [Target] [Description]        [Del]
      ◆    #0     小明     切换姿态: 跑步         x
    [===]  #1     小明     移动到 (500, 200)      x
      ◆    #2     相机     镜头切: 特写           x
    ```
*   **交互**：
    *   点击列表项 -> 选中该 Action，槽位切换到对应 `slotIndex`。
    *   Hover 列表项 -> 画布上高亮对应对象。

### 3.3 底部面板：槽位编辑器 (Slot Editor / MiniTimeline)

**设计目标**：显示 TTS 分句对应的槽位卡片，支持槽位选择和合并。

*   **布局**：水平排列的卡片流，禁止重叠。
*   **卡片内容**：
    *   **Header**：分句文本缩略 + 时长 (e.g., "1.2s")。
    *   **Body**：
        *   **Point Row**：显示菱形图标 (◆)。
        *   **Duration Row**：显示进度条/箭头 (=====>)。
*   **状态**：
    *   **Active**：当前选中的 Slot（高亮边框）。画布操作将记录在此 Slot。
    *   **Merged**：多个卡片边框合并，中间分割线消失或变为虚线。

### 3.4 右侧面板：Action Inspector (属性面板)

**代码位置**: `src/components/ActionInspector.vue`

**设计目标**：根据当前选中的 Action 类型，动态展示配置表单。

*   **未选中 Action 时**：显示“录制设置”或“当前槽位信息”。
*   **选中 Action 时**：
    *   **通用头部**：
        *   目标对象显示。
        *   槽位索引：Input (slotIndex)。
    *   **持续动作特有**：
        *   槽位跨度：Input (slotSpan)。
        *   缓动函数选择 (Easing)。
    *   **类型特有表单**：
        *   *Set Character*: 表情选择器、姿态选择器。
        *   *Tween/Move*: X, Y 输入框。

### 3.5 画布区域 (Canvas) - Ghosting & Recording

**代码位置**: `src/composables/useSceneRenderer.ts`

*   **录制指示器**：当处于 Action Mode 时，画布四周显示红色边框。
*   **Ghosting (洋葱皮)** ✅ 已实现：
    *   选中一个 Tween Action 时：
        *   显示 **起点**（半透明虚影）。
        *   显示 **终点**（实心对象）。
        *   显示 **路径线**。
*   **所见即所得录制 (WYSIWYG Recording)** ✅ 已实现：
    *   **操作**：拖动画布上的对象。
    *   **逻辑**：
        1.  如果在当前槽位已有该对象的 Action，则**更新**该 Action 的参数。
        2.  如果没有，则**新建**一个 `tween_transform` Action。

---

## 4. 详细交互逻辑 (Interaction Logic)

### 4.1 添加 Action (两种方式)

1.  **画布拖拽录制 (Canvas Recording)** ✅ 已实现:
    *   选择当前槽位 (slotIndex)。
    *   拖动人物“小明”到新位置。
    *   系统检测到位置变化，自动创建一个 `tween_transform` Action。
        *   `slotIndex`: 当前选中的槽位。
        *   `slotSpan`: 1 (默认)。
        *   `params`: { x: newX, y: newY }。
        *   `easing`: 'linear'。

### 4.2 删除 Action

*   在左侧列表点击删除按钮。
*   在底部时间轴选中 Action 按 Delete 键。
*   **逻辑处理**：直接从数组移除，触发 `ActionEvaluator` 重新计算后续状态。

### 4.3 修改槽位跨度

*   在右侧属性面板修改 `slotSpan` 数值。
*   **效果**：动作将填满 `slotSpan` 个槽位的总时长。

---

## 5. 技术实现要点 (Implementation)

### 5.1 槽位解析 (Slot Parsing)

**代码位置**: `src/utils/slotUtils.ts` - `parseBlockToSlots()`

```typescript
function parseBlockToSlots(block: DialogueBlock | NarrationBlock): RuntimeSlot[] {
  // 1. 优先使用 TTS 字幕时间戳聚合分句
  if (block.ttsConfig?.subtitles?.length > 0) {
    return aggregateSubtitlesToSlots(block.text, block.ttsConfig.subtitles)
  }
  
  // 2. 备用方案：按标点分句 + 字数比例估算
  const totalDuration = block.ttsConfig?.duration || (block.text.length * 250)
  return splitTextToSlotsByPunctuation(block.text, totalDuration)
}
```

### 5.2 动作时间计算 (Action Timing)

**代码位置**: `src/utils/slotUtils.ts` - `getActionTiming()`

```typescript
function getActionTiming(action: Action, allSlots: RuntimeSlot[]) {
  const startSlot = allSlots[action.slotIndex]
  if (!startSlot) return null
  
  const startTime = startSlot.startTime
  let duration = 0
  
  if (action.category === 'duration') {
    const span = (action as DurationAction).slotSpan || 1
    for (let i = 0; i < span; i++) {
      const s = allSlots[action.slotIndex + i]
      if (s) duration += s.duration
    }
  }
  
  return { startTime, duration }
}
```

### 5.3 拖拽录制流程

**代码位置**: 
- `src/composables/useSceneRenderer.ts` - `handleGlobalPointerUp()`
- `src/components/SceneEditMode.vue` - `handleActionUpdate()`

```
用户拖拽对象
  ↓
useSceneRenderer.handleDrag() - 实时更新容器位置
  ↓
createGhostingSprite() - 创建起点虚影
  ↓
用户释放鼠标
  ↓
handleGlobalPointerUp() - 检测拖拽结束
  ↓
计算移动距离，确定 target (actor.alias / 'camera' / objectId)
  ↓
调用 onActionUpdate 回调
  ↓
SceneEditMode.handleActionUpdate()
  ↓
查找/创建动作 (基于 slotIndex + target 匹配)
  ↓
episodeStore.updateBlockInScene() 保存
```

### 5.4 补间计算 (Tweening)

对于 `tween_transform`，求值器需要：
1.  找到该 Action 的 `startTime` (通过 slotIndex 获取)。
2.  计算该 Action 开始那一刻对象的状态 `startValue`。
3.  获取 Action 定义的 `targetValue`。
4.  根据 `(currentTime - startTime) / duration` 计算进度 `p`。
5.  应用缓动函数 `p = ease(p)`。
6.  计算插值：`currentValue = startValue + (targetValue - startValue) * p`。

### 5.5 相机特殊处理

相机对象在数据上与其他对象一致，但在渲染时，需要将其变换**反向应用**到 Stage 上（用于预览）。

---

## 6. 关键代码位置

| 模块 | 文件路径 | 说明 |
|------|----------|------|
| 类型定义 | `src/types/screenplay.ts` | Action 类型定义、RuntimeSlot |
| 槽位解析 | `src/utils/slotUtils.ts` | parseBlockToSlots, getActionTiming |
| 拖拽录制 | `src/composables/useSceneRenderer.ts` | handleGlobalPointerUp, createGhostingSprite |
| 动作创建 | `src/components/SceneEditMode.vue` | handleActionUpdate |
| 属性面板 | `src/components/ActionInspector.vue` | 动作属性编辑 |
| 动作列表 | `src/components/ActionListPanel.vue` | 动作列表显示 |

---

*文档最后更新：2025-12-13*
