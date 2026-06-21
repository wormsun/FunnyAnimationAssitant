# 场景编辑器幽灵模式 (Ghost Mode) - 设计文档 V3

## 1. 需求分析 (Analysis)

### 1.1 背景
用户希望在 Actions Mode（动作模式）下，通过选中**槽位 (Slot)** 来直观地查看和编辑场景对象的动作。为了方便对比动作前后的状态，需要引入"幽灵模式"，在同一画面中同时展示对象的"动作前状态"和"动作后状态"。

### 1.2 核心变更 (Key Changes)
*   **触发机制**: 从"选中 Action"变更为"选中 Slot"。
*   **作用范围**: 针对**所有**场景对象进行评估，包括**相机对象 (Camera)**。
*   **动作类型区分**: 针对 Point Action (瞬时) 和 Duration Action (持续) 定义了不同的幽灵逻辑。

### 1.3 适用对象范围
幽灵模式适用于以下场景对象类型：
| 对象类型          | 支持的动作类型                               | Ghost 渲染方式 |
| ----------------- | -------------------------------------------- | -------------- |
| Character (角色)  | `set_character`, `tween_transform`           | 半透明角色精灵 |
| Prop (道具)       | `set_transform`, `tween_transform`           | 半透明道具精灵 |
| Background (背景) | `tween_transform`                            | 半透明背景图层 |
| **Camera (相机)** | `camera_cut`, `camera_move`, `camera_follow` | 半透明相机框   |

---

## 2. 通用规则 (General Rules)

当用户选中 Slot $S$ 时，对于场景中的每一个对象 $O$：

### 2.1 情况 A：当前 Slot 存在 Point Action (瞬时动作)
*   **定义**: 对象 $O$ 在 Slot $S$ 有瞬时动作（如 `set_transform`, `set_character`, `camera_cut`）。
*   **Ghost (幽灵态)**: 显示动作执行**前**的状态 (State Before Action)。
*   **Real (实体态)**: 显示动作执行**后**的状态 (State After Action)。

### 2.2 情况 B：当前 Slot 涉及 Duration Action (持续动作)
*   **定义**: 对象 $O$ 有一个持续动作（如 `tween_transform`, `camera_move`, `camera_follow`），其时间跨度 $[Start, End)$ 覆盖了 Slot $S$。
*   **Ghost (幽灵态)**: 显示动作**开始前**的状态 (State at Action Start)。
*   **Real (实体态)**: 显示动作**完成后**的目标状态 (Target State)。

### 2.3 情况 C：当前 Slot 无动作 (Idle)
*   **定义**: 对象 $O$ 在 Slot $S$ 既无瞬时动作，也无进行中的持续动作。
*   **Ghost**: **不显示**。
*   **Real**: 显示 Slot $S$ 之前的累积状态 (State at Slot Start)。

---

## 3. 相机对象幽灵模式 (Camera Ghost Mode)

### 3.1 相机动作类型
| 动作类型        | Category | 描述                   | Ghost 模式支持 |
| --------------- | -------- | ---------------------- | -------------- |
| `camera_cut`    | Point    | 瞬时切换相机位置和缩放 | ✅ 支持         |
| `camera_move`   | Duration | 平滑移动/缩放相机      | ✅ 支持         |
| `camera_follow` | Duration | 跟随目标对象           | ❌ 不支持       |
| `camera_shake`  | Duration | 震动效果               | ❌ 不支持       |

> [!NOTE]
> **camera_follow 不支持 Ghost 模式的原因**：
> 1. 计算复杂度高（依赖目标对象的实时位置）。
> 2. 用户在跟随模式下没有手动调整相机位置的需求。

### 3.2 相机幽灵规则

#### 3.2.1 camera_cut (瞬时切换)
*   **触发条件**: `action.slotIndex === currentSlot && action.type === 'camera_cut'`
*   **Ghost Camera Frame**: 显示切换**前**的相机位置和缩放（虚线框，半透明）。
*   **Real Camera Frame**: 显示切换**后**的相机位置和缩放（实线框，正常）。

#### 3.2.2 camera_move (运镜)
*   **触发条件**: `startSlot <= currentSlot < startSlot + span && action.type === 'camera_move'`
*   **Ghost Camera Frame**: 显示运镜**开始前**的相机状态。
*   **Real Camera Frame**: 显示运镜**目标**状态。

#### 3.2.3 camera_follow / camera_shake
*   **Ghost 模式**: **不支持**。
*   **Real Camera Frame**: 显示当前累积状态（不含震动偏移）。

### 3.3 相机幽灵视觉规范

| 属性         | Ghost Camera   | Real Camera                           |
| ------------ | -------------- | ------------------------------------- |
| **边框样式** | 虚线 (Dashed)  | 实线 (Solid)                          |
| **边框颜色** | 灰色 (#888888) | 绿色 (#00FF00)                        |
| **透明度**   | 0.4            | 1.0                                   |
| **填充**     | 无填充         | 半透明灰（0.001 alpha，用于碰撞检测） |
| **交互**     | 不可交互       | 可拖拽修改动作目标位置                |

---

## 4. 产品需求文档 (PRD)

### 4.1 交互流程
1.  **选中 Slot**: 用户在时间轴上方点击 Slot 刻度。
2.  **计算状态**: 系统遍历所有对象（包括相机），判断其在当前 Slot 的状态（A/B/C）。
3.  **渲染画布**:
    *   对于 A/B 类对象，同时渲染 Ghost 和 Real。
    *   对于 C 类对象，仅渲染 Real。
    *   **相机特殊处理**: Ghost Camera Frame 和 Real Camera Frame 同时渲染。

### 4.2 视觉规范总览

#### 4.2.1 普通对象 (Character/Prop/Background)
*   **Ghost Object**:
    *   **样式**: 低透明度 (Alpha 0.3-0.5)，灰度滤镜 (Grayscale)。
    *   **层级**: 位于实体对象下方。
    *   **交互**: 不可交互。
*   **Real Object**:
    *   **样式**: 正常渲染。
    *   **交互**: 可拖拽/缩放/旋转。

#### 4.2.2 相机对象 (Camera)
*   **Ghost Camera Frame**:
    *   **样式**: 虚线边框，灰色，半透明。
    *   **层级**: 位于实体相机框下方，但高于普通对象（便于识别）。
    *   **交互**: 不可交互。
*   **Real Camera Frame**:
    *   **样式**: 实线边框，绿色，正常透明度。
    *   **交互**: 可拖拽移动、缩放。

### 4.3 边界与特殊情况
*   **重叠动作优先级**: 同一 Slot 多个动作时，Ghost 锚定在"所有动作发生前"，Real 锚定在"所有动作完成后"。
*   **camera_follow 依赖**: Real Camera 位置依赖目标对象的 Real State。计算顺序：先计算目标对象状态，再计算相机位置。
*   **整体视口**: 画布的实际渲染视口始终由 **Real Camera** 决定，而非 Ghost Camera。Ghost 只是可视化参考。

### 4.4 Real 对象交互与 Action 更新规则

当用户在画布上拖拽/缩放/旋转 **Real 对象** 时，遵循以下规则：

#### 4.4.1 Action 更新判定规则

| 条件                                  | 行为                           |
| ------------------------------------- | ------------------------------ |
| 当前 Slot **已有**该对象的相应 Action | **更新**现有 Action 的目标参数 |
| 当前 Slot **无**该对象的相应 Action   | **创建**新的 Action            |

#### 4.4.2 Action 匹配规则

| 操作类型 | 匹配的 Action 类型           | 更新的参数                       |
| -------- | ---------------------------- | -------------------------------- |
| 拖拽位置 | `tween_transform`            | `params.x`, `params.y`           |
| 缩放     | `tween_transform`            | `params.scaleX`, `params.scaleY` |
| 旋转     | `tween_transform`            | `params.rotation`                |
| 相机拖拽 | `camera_cut` / `camera_move` | `params.x`, `params.y`           |
| 相机缩放 | `camera_cut` / `camera_move` | `params.zoom`                    |

#### 4.4.3 状态重算流程

Action 更新后，必须执行以下步骤确保画布正确显示：

1. **保存 Action** → `episodeStore.updateBlockInScene()`
2. **重算状态** → `sceneGraph.updateSlotIndex(currentSlotIndex)` → 触发 `calculateSlotStates()`
3. **重新渲染** → `renderGhostObjects()` 应用新的 Ghost/Real 状态

> [!IMPORTANT]
> Ghost 对象始终锚定在 Action **执行前**的状态，不随 Real 对象的拖拽实时变化。
> 只有 Real 对象的位置/缩放/旋转会根据 Action 目标参数更新。

---

## 5. UI 设计 (Wireframe Description)

### 5.1 普通对象示例
**场景**: 角色 A 在 Slot 2 从 (0,0) 移动到 (100,0)。

#### 选中 Slot 2
*   **(0,0)**: 半透明灰色角色 A (Ghost)。
*   **(100,0)**: 正常角色 A (Real)。
*   *(可选)* 两者之间绘制虚线箭头表示运动轨迹。

### 5.2 相机对象示例
**场景**: 相机在 Slot 3 执行 camera_move，从 (500,400) 移动到 (800,600)。

#### 选中 Slot 3
*   **Ghost Camera Frame**: 中心在 (500,400) 的虚线灰色框。
*   **Real Camera Frame**: 中心在 (800,600) 的实线绿色框。
*   用户可以拖拽 Real Frame 来调整运镜的目标位置。

### 5.3 综合示例
**场景**: Slot 4 同时有角色移动 (A->B) 和相机运镜 (C1->C2)。

#### 选中 Slot 4
*   **角色 Ghost**: 位置 A，半透明灰色。
*   **角色 Real**: 位置 B，正常。
*   **相机 Ghost**: 位置 C1，虚线灰色框。
*   **相机 Real**: 位置 C2，实线绿色框。

---

## 6. 技术架构设计 (Technical Architecture)

### 6.1 核心数据结构

```typescript
interface GhostStateResult {
  ghost: SceneSetupObject | null; // Null = 无需 Ghost
  real: SceneSetupObject;
}

interface CameraGhostStateResult {
  ghost: RuntimeCameraState | null; // Null = 无需 Ghost
  real: RuntimeCameraState;
}

interface SlotStatesResult {
  objects: Map<string, GhostStateResult>;
  camera: CameraGhostStateResult;
}
```

### 6.2 计算函数签名

```typescript
function calculateSlotStates(
  scene: SceneContainer, 
  block: ScriptBlock, 
  slotIndex: number
): SlotStatesResult;
```

### 6.3 渲染流程 (useSceneGraph.ts)

1.  调用 `calculateSlotStates` 获取所有状态。
2.  遍历 `objects` Map：
    *   若 `ghost` 不为空，创建/更新 Ghost Container（灰度滤镜 + 低透明度）。
    *   更新 Real Container。
3.  处理相机：
    *   若 `camera.ghost` 不为空，渲染 Ghost Camera Frame（虚线）。
    *   渲染 Real Camera Frame（实线）。

---

## 7. 总结
V3 版本新增了对**相机对象**幽灵模式的完整支持。用户在编辑运镜动作时，可以同时看到运镜的起点和终点，极大地提升了编辑精确性和效率。整体设计遵循 Slot-Centric 原则，对所有对象（包括相机）统一处理。
