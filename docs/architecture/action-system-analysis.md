# 场景编辑页面 Action 系统深度分析

本文档对当前场景编辑页面的 Action 系统进行了全面的梳理和分析，涵盖了动作类型、技术架构、合理性评估及优化建议。

## 1. Action 类型概览

Action 系统采用 **Slot（槽位）** 作为核心时间单位，分为两类：**瞬时动作 (Point Actions)** 和 **持续动作 (Duration Actions)**。

### 1.1 瞬时动作 (Point Actions)
此类动作在特定槽位开始时立即触发，改变对象的状态。

| Action Type     | 描述                                    | 关键参数                                                                                            | 应用对象        |
| :-------------- | :-------------------------------------- | :-------------------------------------------------------------------------------------------------- | :-------------- |
| `set_transform` | 改变基础视觉属性                        | `alpha`, `visible`, `flipX`, `zIndex`                                                               | 所有可视对象    |
| `set_character` | 改变角色特有状态 (继承 `set_transform`) | `pose` (姿态), `expression` (表情), `layerPresetId` (层级预设), `partAssetOverrides` (部件素材覆盖) | Character       |
| `trigger_anim`  | 控制组件动画播放状态                    | `animStates` (play/stop, loop, speed)                                                               | Prop, Character |
| `trigger_audio` | 控制音频播放                            | `action` (play/stop/pause/resume), `volume`                                                         | Audio           |
| `camera_cut`    | 镜头瞬间切换                            | `x`, `y`, `zoom`                                                                                    | Camera          |

### 1.2 持续动作 (Duration Actions)
此类动作在一定槽位跨度 (`slotSpan`) 内持续进行，通常涉及插值计算。

| Action Type       | 描述             | 关键参数                                                        | 应用对象           |
| :---------------- | :--------------- | :-------------------------------------------------------------- | :----------------- |
| `tween_transform` | 几何属性补间动画 | `x`, `y`, `scaleX`, `scaleY`, `rotation`                        | All Visual Objects |
| `camera_move`     | 镜头推拉摇移     | `x`, `y`, `zoom`                                                | Camera             |
| `camera_shake`    | 镜头震动         | `intensity`, `frequency`, `decay`                               | Camera             |
| `camera_follow`   | 镜头跟随目标     | `followTarget`, `offsetX`, `offsetY`, `zoom`, `constrainBounds` | Camera             |

---

## 2. 技术架构分析

Action 系统的架构设计围绕 **"数据定义 - 状态计算 - 运行时评估 - UI交互"** 四个核心环节展开。

### 2.1 数据层 (`src/types/screenplay.ts`)
- **类型定义**：明确区分了 `PointAction` 和 `DurationAction`，利用 TypeScript 的联合类型 (`Union Types`) 实现了严格的类型安全。
- **Slot 系统**：引入 `RuntimeSlot` 概念，将 TTS 生成的不确定时长转化为确定的逻辑槽位，解决了音频驱动动画的对应难题。

### 2.2 核心计算层
系统存在两套并将行的状态计算逻辑，分别服务于不同场景：

#### A. 静态/编辑态计算 (`src/utils/sceneStateCalculator.ts`)
- **用途**：用于编辑器内的 "Ghost Mode" (幽灵模式)、操作回溯、以及无需播放的静态预览。
- **逻辑**：
    - `calculatePrevContext`: 递归计算当前 Block 之前的最终状态。
    - `calculateSlotStates`: 针对特定 Slot，计算该时刻的 "Ghost State" (动作开始前) 和 "Real State" (动作结束后/目标状态)。
    - **特点**：不依赖具体时间戳，纯逻辑推演，适合编辑器交互。

#### B. 动态/运行时计算 (`src/utils/actionEvaluator.ts`)
- **用途**：用于 `ActionPreviewDialog` 实时预览、视频合成渲染。
- **逻辑**：
    - `evaluateObjectState` / `evaluateCameraState`: 基于毫秒级时间戳 (`currentTime`)，结合缓动函数 (`EasingFunctions`) 计算插值。
    - **特点**：高频调用（每帧），关注平滑过渡和动画细节。

### 2.3 UI 交互层 (`src/components/ActionEditor.vue` & `ActionInspector.vue`)
- **ActionEditor**：负责动作的生命周期管理（创建、删除、选中）。它维护了 `currentSlotIndex`，并调用 `sceneStateCalculator` 来展示 Ghost 效果。
- **ActionInspector**：属性编辑器，根据 `ActionType` 动态渲染不同的配置面板（如角色的姿态选择、相机的跟随目标选择）。
- **交互细节**：
    - **Ghost Mode**：编辑器同时渲染对象的 "Ghost" (半透明) 和 "Real" (实体) 状态，直观展示动作前后的变化。
    - **Delta 编辑**：Inspector 仅显示被当前 Action 修改的属性，避免了全量属性编辑的混淆。

---

## 3. 合理性与优劣势评估

### 3.1 优势 (Pros)
1.  **Slot 机制极大降低了心智负担**：对于 TTS 驱动的内容，直接操作 "这句话开始时" (Slot) 比操作 "第 3.5 秒" 要直观且稳定得多（TTS 重生成后时间会变，但 Slot 逻辑不变）。
2.  **Ghost Mode 体验优秀**：允许用户在静态画面中直观看到动作的起止状态，是 2D 动画编辑器的核心亮`点。
3.  **类型系统严谨**：TypeScript 的深度应用保证了重构的安全性和代码的可维护性。
4.  **关注点分离**：静态计算与动态计算分离，既保证了编辑器的响应速度，又保证了运行时的动画质量。

### 3.2 劣势与挑战 (Cons)
1.  **代码重复**：`sceneStateCalculator.ts` 和 `actionEvaluator.ts` 中存在部分重复的属性赋值逻辑（如 `applyPointAction`）。新增属性时容易顾此失彼。
2.  **Switch-Case 膨胀**：随着 Action 类型的增加，核心计算函数中的 `switch` 语句日益庞大，难以维护。
3.  **状态回溯性能风险**：`calculatePrevContext` 需要从 Scene 开始从头即算整个状态流。如果 Scene 包含数百个 Block，计算量可能呈线性增长，导致编辑器卡顿。

---

## 4. 改善与优化建议

### 4.1 架构优化
1.  **统一属性应用逻辑**：提取 `applyStateChange` 通用函数，供 calculator 和 evaluator 共同调用，减少逻辑割裂。
2.  **引入 Action Registry**：废弃巨大的 `switch-case`，改用策略模式。建立 `ActionHandler` 注册表，每种 Action 自行定义 `apply` 和 `interpolate` 方法。

### 4.2 性能优化
1.  **Context 缓存 (Memoization)**：缓存每个 Block 结束时的 `StateSnapshot`。计算第 N 个 Block 的状态时，只需从第 N-1 个 Block 的快照开始，无需从头回溯。

### 4.3 功能扩展
1.  **贝塞尔曲线缓动编辑器**：目前仅支持预设缓动 (`linear`, `easeInQuad` 等)，建议支持自定义 Cubic Bezier 曲线。
2.  **多选编辑**：目前 `ActionInspector` 仅支持单选编辑，支持多选 Action 批量修改属性将大幅提升效率。

---

## 5. 总结
当前的 Action 系统架构设计清晰，核心的 Slot 机制和 Ghost Mode 准确切中了 AI 视频生成的痛点。代码质量较高，但在可扩展性和长序列性能上仍有优化空间。建议优先推进 **Context 缓存** 以解决潜在的性能瓶颈。
