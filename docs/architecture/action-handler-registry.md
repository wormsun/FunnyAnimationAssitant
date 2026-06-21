# Action Handler Registry 实现说明

## 1. 背景：Switch-Case 的局限性

早期 `sceneStateCalculator.ts` 和 `actionEvaluator.ts` 曾依赖较大的 `switch-case` 语句分发动作逻辑。这种方式在项目初期简单直接，但随着动作类型的增加，已暴露以下严重问题：

### 1.1 违反“开闭原则” (Open-Closed Principle)
每次新增一种动作类型（例如新增 `trigger_vfx` 特效动作），都需要修改核心的计算文件（如 `sceneStateCalculator.ts`）。
- **风险**：修改核心文件容易意外破坏现有的稳定逻辑。
- **冲突**：多人协作时，核心文件的冲突概率极高。

### 1.2 逻辑分散与重复
同一个动作的逻辑散落在多个地方：
- **静态计算** (`sceneStateCalculator`): 用于 Ghost Mode。
- **动态插值** (`actionEvaluator`): 用于预览和导出。
- **UI 面板** (`ActionInspector`): 用于属性编辑。
例如 `set_character` 的属性赋值逻辑，在 Calculator 和 Evaluator 中几乎被复制了一遍（参见 `applyActionToObject` 与 `applyPointAction`）。

### 1.3 代码膨胀与认知高负荷
`applyBlockActionsToState` 函数已包含数百行代码。开发者在阅读时需要过滤大量无关的 `case` 分支才能找到目标逻辑，维护成本高。

---

## 2. 当前实现：Action Handler Registry 模式

**Action Registry（动作注册表）** 是一种策略模式的变体。核心思想是将每种动作的“执行逻辑”封装成独立的 **Action Handler（处理器）**，并通过一个中心化的 **Registry** 进行管理。

### 2.1 核心架构设计

当前代码在 `src/utils/actionHandlers/` 下定义 `ActionHandler`、注册表和各类 Handler，统一约束动作的状态写入、插值和元信息。

```typescript
// src/utils/actionHandlers/types.ts（摘要）
export interface ActionHandler<T extends Action = Action> {
  readonly type: T['type']
  readonly isPointAction: boolean
  readonly isDurationAction: boolean
  readonly affectsObjectState?: boolean

  applyToState?(target: WriteableState, action: T, context?: ActionHandlerContext): void
  interpolate?(start: WriteableState, end: WriteableState, action: T, progress: number): WriteableState
}
```

### 2.2 注册表实现

```typescript
// src/utils/actionHandlers/registry.ts（摘要）
const handlerRegistry = new Map<ActionType, ActionHandler>()

export function registerHandler<T extends Action>(handler: ActionHandler<T>): void {
  handlerRegistry.set(handler.type as ActionType, handler as ActionHandler)
}

export function getHandler(type: ActionType): ActionHandler | undefined {
  return handlerRegistry.get(type)
}

export function isObjectStateAction(action: Action): boolean {
  const handler = getHandler(action.type as ActionType)
  return handler?.affectsObjectState ?? false
}
```

### 2.3 处理器示例

将原来的 `case 'set_transform': ...` 逻辑提取为独立文件：

```typescript
// handlers/SetTransformHandler.ts
export const SetTransformHandler: ActionHandler<SetTransformAction> = {
  applyState(target, action) {
    const { alpha, visible, flipX, zIndex } = action.params;
    if (alpha !== undefined) target.alpha = alpha;
    if (visible !== undefined) target.visible = visible;
    if (flipX !== undefined) target.flipX = flipX;
    if (zIndex !== undefined) target.zIndex = zIndex;
  }
};

// 注册
actionRegistry.register('set_transform', SetTransformHandler);
```

---

## 3. 改造前后的代码对比

### Before (Current Switch-Case)

```typescript
// sceneStateCalculator.ts
function applyActionToObject(state: SceneSetupObject, action: Action) {
  switch (action.type) {
    case 'set_transform':
      // 逻辑 A ...
      break;
    case 'set_character':
      // 逻辑 A ...
      // 逻辑 B (角色特有) ...
      break;
    case 'trigger_anim':
      // 逻辑 C ...
      break;
    // ... 更多 case
  }
}
```

### After (Registry Pattern)

```typescript
// sceneStateCalculator.ts (改造后)
function applyActionToObject(state: SceneSetupObject, action: Action) {
  // 核心代码不再随动作类型增加而改变
  actionRegistry.execute(state, action);
}
```

## 4. 收益总结

1.  **极佳的可扩展性**：新增 `trigger_vfx` 动作时，只需新建 `TriggerVfxHandler.ts` 并注册，无需触碰 `sceneStateCalculator.ts` 等核心文件。
2.  **单一数据源 (SSOT)**：`applyState` 逻辑只写一次，Calculator 和 Evaluator 都可以调用同一个 Handler，彻底消除逻辑不一致的风险。
3.  **易于测试**：每个 Handler 都是纯函数对象，可以单独编写单元测试，无需构建复杂的 Scene 上下文。
4.  **代码瘦身**：核心引擎文件将大幅缩减，只保留调度逻辑。

## 5. 当前代码位置

| 模块 | 当前路径 |
|------|----------|
| Handler 接口 | `src/utils/actionHandlers/types.ts` |
| Handler 注册表 | `src/utils/actionHandlers/registry.ts` |
| Handler 注册入口 | `src/utils/actionHandlers/index.ts` |
| 具体 Handler | `src/utils/actionHandlers/handlers/` |
| Handler 单测 | `src/utils/actionHandlers/__tests__/` |
