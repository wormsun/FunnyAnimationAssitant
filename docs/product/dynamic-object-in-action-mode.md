# PRD: Action Mode 动态对象与瞬时变换

**版本**: 2.0 (v9.2 spawned 重构)  
**日期**: 2026-01-15  
**状态**: ✅ 已实现  

---

## 目录

1. [概述](#1-概述)
2. [背景与问题](#2-背景与问题)
3. [目标](#3-目标)
4. [核心概念](#4-核心概念)
5. [详细设计](#5-详细设计)
6. [数据模型变更](#6-数据模型变更)
7. [UI 变更](#7-ui-变更)
8. [交互流程](#8-交互流程)
9. [边界情况与约束](#9-边界情况与约束)
10. [验证清单](#10-验证清单)
11. [实现阶段](#11-实现阶段)
12. [附录：决策记录](#12-附录决策记录)

---

## 1. 概述

本 PRD 定义了 沙雕动画小助手 场景编辑器中 **Action Mode (动作模式)** 的两项核心增强功能：

1. **动态对象注入**：允许用户在 Action Mode 的任意时间槽 (Slot) 动态添加场景对象（道具、人物、音频、背景），无需事先在 Scene Setup 中定义。
2. **瞬时几何变换**：扩展 Action 系统，支持对象在某一帧瞬间移动到指定位置（Point Action），而非仅支持补间动画（Duration Action）。

---

## 2. 背景与问题

### 2.1 当前架构

沙雕动画小助手 的场景编辑分为两个模式：
- **Scene Mode (场景布局模式)**：编辑 `SceneSetup`，定义场景中的所有对象及其初始状态。
- **Action Mode (动作模式)**：编辑 `Actions`，定义对象在时间轴上的状态变化。

当前架构要求：**所有参与演出的对象必须在 Scene Setup 中预先定义。**

### 2.2 存在的问题

| 问题                 | 描述                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **临时元素管理不便** | 闪现的特效（爆炸、光效）、临时道具（突然拿出的剑）需要在 Setup 中预设为"不可见"，再通过 Action 控制显隐，导致 Setup 列表臃肿。 |
| **缺少瞬时变换能力** | 当前系统只支持 `tween_transform` (Duration Action) 来控制几何属性。无法实现"对象瞬间跳跃到某位置"的效果（剪辑式切换）。        |
| **交互意图模糊**     | 用户拖拽对象时，系统无法区分用户是想"定位/布局"还是"制作动画"。                                                                |

---

## 3. 目标

| 目标   | 描述                                                    |
| ------ | ------------------------------------------------------- |
| **G1** | 用户能够在 Action Mode 的任意 Slot 动态添加场景对象。   |
| **G2** | 用户能够让对象在某一帧瞬间移动到指定位置（瞬移/Snap）。 |
| **G3** | 用户能够通过明确的 UI 操作区分"布局"和"动画"意图。      |
| **G4** | 动态添加的对象能够跨 Block 持久化存在。                 |
| **G5** | 保持与现有系统的兼容性，不破坏 Scene Mode 的逻辑。      |

---

## 4. 核心概念

### 4.1 影子池 (Shadow Pool)

一种管理动态对象生命周期的策略。

**核心思想**：
- 动态添加的对象在数据层面是**真实的 Setup 对象**。
- 它被创建时处于"未出生"状态 (`spawned: false`)。
- 通过 Action 控制其"出生"时机 (`spawned: true`)。
- UI 层通过过滤，让用户感觉它是"临时创建"的。

> **v9.2 重要变更**：使用 `spawned` 属性分离"生命周期"与"可见性"。
> - `spawned`: 控制对象是否存在于场景（生命周期）
> - `visible`: 控制对象是否可见（视觉效果）

**优势**：
- 复用现有数据结构，无需引入新的对象类型。
- 人物、音频等复杂对象的所有属性天然支持。
- Setup 中需要"初始隐藏"的静态对象可正常使用 `visible: false`。

### 4.2 模式切换 (Mode Toggle)

通过 UI 开关区分用户的操作意图。

| 模式                | UI 文案 | 拖拽行为 | 生成的 Action                |
| ------------------- | ------- | -------- | ---------------------------- |
| **动画模式** (默认) | `动画`  | 平滑移动 | `tween_transform` (Duration) |
| **布局模式**        | `布局`  | 瞬间跳跃 | `set_transform` (Point)      |

### 4.3 全参数瞬时动作 (Extended Point Action)

扩展 `set_transform` Action，使其能够控制几何属性。

**扩展前**：
- `set_transform` 仅能控制视觉属性：`alpha`, `visible`, `flipX`, `zIndex`

**扩展后**：
- `set_transform` 额外支持几何属性：`x`, `y`, `scaleX`, `scaleY`, `rotation`

---

## 5. 详细设计

### 5.1 对象生命周期

#### 5.1.1 存储位置
动态对象存储在 `SceneSetup.objects[]` 中，与普通 Setup 对象无区别。

#### 5.1.2 初始状态
| 属性         | 值                                   |
| ------------ | ------------------------------------ |
| `spawned`    | `false` (动态对象未出生)             |
| `visible`    | `true` (可见性独立于生命周期)        |
| `x`, `y`     | `0` (或其他默认值，会被 Action 覆盖) |
| 其他几何属性 | 默认值                               |

#### 5.1.3 激活方式
通过在目标 Slot 插入包含 `spawned: true` 和几何属性的 `set_transform` Action。

```
set_transform {
  target: "object_id",
  params: {
    spawned: true,  // v9.2: 对象出生
    x: 500,
    y: 300,
    scaleX: 1,
    scaleY: 1
  }
}
```

#### 5.1.4 生命周期范围
- **出生 (Birth)**：第一个 `spawned: true` Action 所在的 Slot。
- **死亡 (Death)**：最后一个 `spawned: false` Action 所在的 Slot，或 Scene 结束。
- **跨 Block 持久化**：是。系统需在计算每个 Block 的初始状态时，向前回溯所有 Block 的 Actions。

### 5.2 模式切换逻辑

#### 5.2.1 UI 位置
- 跟随选中对象显示，位于属性面板顶部。
- 按钮文案：`动画` / `布局`

#### 5.2.2 默认模式
- **动画模式** (默认)
- 拖拽对象默认创建/更新 `tween_transform`

#### 5.2.3 切换行为
| 当前模式 | 拖拽操作 | 结果                        |
| -------- | -------- | --------------------------- |
| 动画模式 | 拖拽对象 | 创建/更新 `tween_transform` |
| 布局模式 | 拖拽对象 | 创建/更新 `set_transform`   |

#### 5.2.4 冲突处理
同一 Slot 内，`set_transform` (几何) 与 `tween_transform` **互斥**。

当用户尝试在已有 `tween_transform` 的 Slot 切换到布局模式并操作时：
- **提示用户**："当前 Slot 已有动画 Action，请先删除后再添加瞬移 Action。"
- **不自动替换**。

### 5.3 删除逻辑

| 删除时机                  | 行为                                    |
| ------------------------- | --------------------------------------- |
| 在 **出生 Slot** 删除对象 | 真正删除 Setup 数据 + 所有相关 Actions  |
| 在 **其他 Slot** 删除对象 | 插入 `set_transform { spawned: false }` |

### 5.4 对象类型特殊处理

#### 5.4.1 人物对象 (Character)
- 动态添加时使用**角色资源的默认值**（第一个 Pose、第一个 Expression）。
- 后续通过 `set_character` Action 修改 Pose/Expression。

#### 5.4.2 音频对象 (Audio / BGM)
- **不支持** `set_transform` / `tween_transform` 几何操作。
- 模式切换对音频无意义。
- 出生/控制使用 `trigger_audio`。

#### 5.4.3 背景对象 (Background)
- 支持 `set_transform` / `tween_transform`。
- 与道具对象行为一致。

### 5.5 出生 Action 约束

- **出生 Action 不可移动**。
- 在 ActionSequencer 中，出生 Action 的位置被锁定，用户不能将其拖拽到其他 Slot。
- 使用 🌱 图标标识出生 Action (`spawned: true`)。

---

## 6. 数据模型变更

### 6.1 SetTransformParams 扩展

**文件**：`src/types/screenplay.ts`

**变更后 (v9.2)**：
```typescript
interface SetTransformParams {
  // 视觉属性 (现有)
  alpha?: number;
  visible?: boolean;
  flipX?: boolean;
  zIndex?: number;
  
  // 几何属性 (v9.1 新增)
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  
  // 生命周期属性 (v9.2 新增)
  spawned?: boolean;  // true=存在于场景, false=未出生/已消亡
}
```

### 6.2 SceneSetupObject 扩展

**文件**：`src/types/screenplay.ts`

```typescript
interface SceneSetupObject {
  // ... 现有属性
  
  visible?: boolean   // 可见性（视觉层面）
  
  // v9.2: 生命周期属性 (分离存在性与可见性)
  // Setup 添加的对象: spawned 默认为 true (或 undefined 等价于 true)
  // Action Mode 动态添加的对象: spawned = false，需通过 Action 激活
  spawned?: boolean
}
```

### 6.3 其他类型变更

| 文件                      | 变更                                        |
| ------------------------- | ------------------------------------------- |
| `src/types/sceneObject.ts` | `SceneObjectBase` 已包含 `spawned?: boolean` |
| `src/types/screenplay.ts` | `SetLifecycleAction` 通过 `params.spawned` 控制出生/消亡 |
| `src/utils/actionHandlers/types.ts` | `WriteableState` 直接支持 `spawned` 写入 |
| `src/utils/actionHandlers/handlers/SetLifecycleHandler.ts` | 应用 `set_lifecycle`，entity composite 会级联子对象 |
| `src/utils/shadowObject.ts` | 创建 Shadow Object，并生成出生 Action |

### 6.4 兼容性说明

- 新增字段均为可选 (`?`)。
- 当前公开代码不提供独立迁移脚本。动态对象以 `spawned=false` 存在于 Setup 层，并通过 `set_lifecycle { spawned: true }` 在 Action Mode 中出生。

```bash
# 分析模式
python scripts/migrate_spawned.py project.anime --dry-run

# 执行迁移
python scripts/migrate_spawned.py project.anime
```

---

## 7. UI 变更

### 7.1 属性面板

| 变更项       | 说明                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| 模式切换按钮 | 增加 `[动画]` / `[布局]` 切换按钮，位于面板顶部                         |
| visible 属性 | ✅ **已恢复显示** (v9.2: spawned 分离生命周期后，visible 可用于视觉控制) |
| 冲突警告图标 | 新增 ⚠️ 图标，当 set_transform 几何属性与 tween_transform 冲突时显示     |

### 7.2 对象列表

| 变更项        | 说明                                                       |
| ------------- | ---------------------------------------------------------- |
| Show All 开关 | 增加 `[显示全部]` 开关                                     |
| 隐藏对象样式  | 当 Show All 开启时，`spawned=false` 的对象以半透明样式显示 |
| 画布不显示    | 即使 Show All 开启，画布上仍不显示未出生对象               |

### 7.3 工具栏

| 变更项       | 说明                                             |
| ------------ | ------------------------------------------------ |
| 添加对象按钮 | 增加 `[+ 道具]` / `[+ 人物]` / `[+ 音频]` 按钮组 |

### 7.4 ActionSequencer

| 变更项           | 说明                       |
| ---------------- | -------------------------- |
| 出生 Action 标识 | 使用 🌱 图标标识出生 Action |
| 死亡 Action 标识 | 使用 🍂 图标标识消亡 Action |
| 出生 Action 锁定 | 出生 Action 不可拖拽移动   |

---

## 8. 交互流程

### 8.1 动态添加对象

**前置条件**：用户处于 Action Mode，时间轴停留在 Slot N。

**操作步骤**：
1. 用户点击工具栏 `[+ 道具]` 按钮。
2. 弹出资源选择器，用户选择一个道具资源。
3. 系统执行：
   - 在 `SceneSetup.objects` 中创建影子对象 (`spawned: false`, `visible: true`, `x: 0`, `y: 0`)。
   - 在当前 Block 的 `actions` 中插入 `set_transform` Action：
     ```
     {
       type: 'set_transform',
       target: 'new_object_id',
       slotIndex: N,
       params: { spawned: true, x: 相机中心X, y: 相机中心Y }
     }
     ```
4. 对象立即出现在画布中央，并被选中。

### 8.2 调整出生位置

**前置条件**：用户已添加对象，时间轴停留在出生 Slot。

**操作步骤**：
1. 用户选中对象。
2. 确认当前模式为 `布局` (如需切换)。
3. 在画布上拖拽对象到新位置。
4. 系统更新出生 Slot 的 `set_transform` Action 中的 `x`, `y` 参数。

### 8.3 创建入场动画

**前置条件**：用户已添加对象，时间轴停留在出生 Slot。

**操作步骤**：
1. 用户选中对象。
2. 切换到 `动画` 模式。
3. 在画布上拖拽对象。
4. 系统检测到已有 `set_transform`，弹出提示：
   - "当前 Slot 已有布局 Action，请先删除后再添加动画。"
   - 或：系统在该 Slot 创建 `tween_transform` (如果 `set_transform` 只含 `visible` 无几何属性)。
5. 用户确认后，系统创建 `tween_transform` Action。

### 8.4 后续瞬时跳跃 (Teleport)

**前置条件**：用户已添加对象，时间轴停留在后续 Slot M (M > 出生 Slot)。

**操作步骤**：
1. 用户选中对象。
2. 切换到 `布局` 模式。
3. 在画布上拖拽对象到新位置。
4. 系统在 Slot M 创建新的 `set_transform` Action (仅含几何属性)。

### 8.5 删除动态对象

#### 8.5.1 在出生 Slot 删除

**操作步骤**：
1. 用户在对象列表中右键点击对象 -> `删除`。
2. 系统检测：当前 Slot == 出生 Slot。
3. 系统执行：
   - 删除 `SceneSetup.objects` 中的对象数据。
   - 删除所有引用该对象的 Actions。
4. 对象彻底消失。

#### 8.5.2 在其他 Slot 删除

**操作步骤**：
1. 用户在对象列表中右键点击对象 -> `删除`。
2. 系统检测：当前 Slot != 出生 Slot。
3. 系统执行：
   - 在当前 Slot 插入 `set_transform { spawned: false }` Action。
4. 对象从当前 Slot 开始退出场景，但 Setup 数据保留。

### 8.6 选中尚未出生的对象

**前置条件**：用户开启 "Show All"，时间轴停留在对象出生前的 Slot。

**操作步骤**：
1. 用户在列表中看到半透明的对象名称。
2. 用户点击选中该对象。
3. 对象变为选中状态，但：
   - 画布上不显示该对象。
   - 属性面板显示为**只读**。
   - 提供 `[跳转到出生点]` 按钮。
4. 用户点击 `[跳转到出生点]`，时间轴跳转到出生 Slot。

---

## 9. 边界情况与约束

### 9.1 Scene Mode 行为

- 动态添加的影子对象（`spawned: false`）在 Scene Mode 中**不可见、不可编辑**。
- Scene Mode 只显示 `spawned: true` 或 `spawned: undefined` 的 Setup 对象。

### 9.2 跨 Block 持久化

- 动态对象在 Block A 添加后，在后续 Block B、C... 中持续存在。
- 系统需在计算每个 Block 的 `prevContext` 时，回溯所有前置 Block 的 Actions。

### 9.3 Action 互斥

- 同一 Slot 内，针对同一对象的 `set_transform` (几何) 与 `tween_transform` 不可共存。
- 用户切换模式时，若存在冲突，弹出提示要求先删除现有 Action。

### 9.4 出生 Action 不可移动

- 标识对象生命周期起点的 `set_transform(spawned=true)` Action 不能被拖拽到其他 Slot。
- 在 ActionSequencer 中以 🌱 图标标识，且禁用拖拽。

### 9.5 撤销不单独实现

- 删除出生 Action = 撤销添加对象（同时删除 Setup 数据）。
- 无需实现专门的 Undo 逻辑。

---

## 10. 验证清单

| #     | 验证项                                | 预期结果                               | 状态 |
| ----- | ------------------------------------- | -------------------------------------- | ---- |
| TC-01 | 在 Slot 5 添加一个道具                | 道具立即出现在画布，列表中显示该道具   | ⬜    |
| TC-02 | 将时间轴拖到 Slot 3 (出生前)          | 道具从画布和列表中消失                 | ⬜    |
| TC-03 | 开启 Show All，在 Slot 3              | 列表中显示半透明的道具名称             | ⬜    |
| TC-04 | 选中未出生的道具                      | 属性面板只读，提供跳转按钮             | ⬜    |
| TC-05 | 将时间轴拖回 Slot 5，布局模式拖动道具 | 道具瞬间移动，出生位置更新             | ⬜    |
| TC-06 | 在 Slot 5 切换到动画模式，拖动道具    | 提示冲突，要求先删除布局 Action        | ⬜    |
| TC-07 | 将时间轴拖到 Slot 8，布局模式拖动道具 | 道具瞬间跳跃，产生 Point Action        | ⬜    |
| TC-08 | 在 Slot 8 动画模式拖动道具            | 道具产生移动动画                       | ⬜    |
| TC-09 | 在 Slot 8 删除道具                    | 道具从 Slot 8 开始退出场景，Setup 保留 | ⬜    |
| TC-10 | 在 Slot 5 (出生点) 删除道具           | 道具彻底删除，所有 Actions 清除        | ⬜    |
| TC-11 | 尝试拖抽出生 Action 到其他 Slot       | 拖拽被禁止                             | ⬜    |
| TC-12 | 在 Scene Mode 查看                    | 影子对象不可见                         | ⬜    |
| TC-13 | 添加人物对象                          | 使用默认 Pose/Expression               | ⬜    |
| TC-14 | 添加音频对象                          | 无几何操作，使用 trigger_audio         | ⬜    |
| TC-15 | 预览整个 Block                        | 动画按预期播放（瞬移 + 补间混合）      | ⬜    |
| TC-16 | 保存并重新加载项目                    | 动态对象和所有动作正确恢复             | ⬜    |

---

## 11. 实现阶段

| Phase       | 任务                                              | 优先级 |
| ----------- | ------------------------------------------------- | ------ |

---

## 12. 附录：决策记录

本节记录在需求讨论过程中做出的所有关键决策。

| #    | 问题                          | 决策                               | 理由                                     |
| ---- | ----------------------------- | ---------------------------------- | ---------------------------------------- |
| D-01 | 动态对象跨 Block 持久化？     | 是                                 | 道具（如武器）需要跨 Block 持续存在。    |
| D-02 | 录制模式 UI 位置？            | 跟随选中对象，在属性面板           | 更直观，与对象操作关联。                 |
| D-03 | 默认模式是什么？              | 动画模式 (tween)                   | 与当前系统行为一致。                     |
| D-04 | 删除对象的行为？              | 出生 Slot 真删，其他 Slot 退出场景 | 区分"撤销创建"和"在某时刻移除"。         |
| D-05 | Scene Mode 是否显示影子对象？ | 否                                 | 保持 Scene Mode 的简洁性。               |
| D-06 | 音频对象是否支持几何操作？    | 否                                 | 音频无坐标概念。                         |
| D-07 | Action 冲突如何处理？         | 互斥，提示用户删除                 | 避免语义混乱。                           |
| D-08 | 是否需要向后兼容？            | 需要迁移脚本                       | v9.2 引入了 spawned 属性，旧数据需迁移。 |
| D-09 | visible 属性是否在面板显示？  | 是 (v9.2 恢复)                     | spawned 分离后，visible 可用于视觉控制。 |
| D-10 | 人物对象的初始状态？          | 使用角色资源默认值                 | 简化添加流程。                           |
| D-11 | 如何标识"影子对象"？          | 通过 `spawned=false` 过滤。        | v9.2 分离生命周期与可见性。              |
| D-12 | 出生 Slot 如何定义？          | 出生 Action 不可移动               | 避免定义歧义。                           |
| D-13 | 选中未出生对象能做什么？      | 只读，仅允许跳转到出生点           | 防止无意义编辑。                         |
| D-14 | 模式切换按钮的文案？          | "动画" / "布局"                    | 直接语义，易于理解。                     |
| D-15 | 是否需要实现撤销？            | 否                                 | 删除 Action 即为撤销。                   |

---

**文档结束**
