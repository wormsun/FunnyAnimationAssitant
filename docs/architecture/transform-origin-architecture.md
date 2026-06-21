# 场景对象变换体系设计：PivotBase、变换点与 Bounds

> 本文档整理了 FunnyAnimationAssistant 场景编辑器中，关于场景对象（composite 与非 composite）的 PivotBase、变换点（Transform Origin）以及 Bounds 的架构讨论与设计决策。

## 1. 核心概念定义

### 1.1 PivotBase（基准点）

**定义**：对象内部坐标系的**固定原点**，等价于 Adobe Animate 的「注册点」。

| 对象类型 | PivotBase 位置 | 来源 |
|---|---|---|
| 非 composite（Prop、Background、Symbol 等） | 几何中心 `(localBounds.center)` | 由 sprite/texture 尺寸自动确定 |
| Entity Composite | `(0, 0)` — 容器坐标原点 | 创建 composite 时自动计算为子对象的几何中心 |
| Union Composite | `(0, 0)` — 空代理容器坐标原点 | 同上 |

**关键特性**：
- PivotBase 创建后**永远固定**，不随子对象移动而变化
- `obj.x/y` 定义的是 PivotBase 在世界空间中的位置
- 用户**不需要也不能**直接设置 PivotBase

### 1.2 变换点（Transform Origin）

**定义**：旋转/缩放操作的中心点，表示为**相对于 PivotBase 的像素偏移**。等价于 Adobe Animate 的「变换点（Transformation Point）」。

```
pivot = PivotBase + (transformOriginX, transformOriginY)
position = obj.xy + (transformOriginX, transformOriginY)
```

- **默认值 `(0, 0)`**：围绕 PivotBase 旋转/缩放
- **非零值**：围绕偏移后的位置旋转/缩放
- **可逐帧变化**：在 Action Mode 中可通过 `set_origin` Action 修改
- **不依赖 Bounds**：直接使用存储的像素值，无需动态计算

### 1.3 Bounds（边界框）

**定义**：对象所有可见内容的最小包围矩形。

**用途**：**仅用于选择框的视觉显示**，不参与任何坐标/变换计算。

| 对象类型 | Bounds 来源 | 特性 |
|---|---|---|
| 非 composite | `container.getLocalBounds()` 或 `obj.width/height` | 固有稳定 |
| Entity Composite | `container.getLocalBounds()`（子容器嵌套） | 动态，随子对象变化 |
| Union Composite | 子容器角点换算到代理容器本地坐标 | 动态，随子对象变化 |

---

## 2. 与 Adobe Animate 的对齐

### 2.1 概念映射

| Adobe Animate | FunnyAnimationAssistant | 说明 |
|---|---|---|
| Registration Point（注册点） | PivotBase | 内部坐标原点，固定不变 |
| Transformation Point（变换点） | transformOriginX/Y（像素偏移） | 旋转/缩放中心 |
| Bounds | Bounds | 仅用于选择框显示 |
| Symbol.x/y | obj.x/y | 注册点的世界坐标 |

### 2.2 三者解耦

Animate 的核心设计：三个概念**完全独立**，互不影响。

```
子对象移动 → Bounds 变化 → 仅选择框变大
          → Registration Point 不变 ✓
          → Transformation Point 不变 ✓
          → 其他子对象位置不变 ✓
```

FunnyAnimationAssistant 采用相同设计：transformOrigin 存储为像素偏移，不依赖动态 Bounds，从根本上消除了坐标不稳定问题。

---

## 3. 各类型场景对象详细说明

### 3.1 非 Composite 对象

**类型列表**：`BackgroundObject`、`PropObject`、`SymbolObject`、`ExpressionObject`、`TextObject`、`CameraObject`、`AudioObject`、`ScreenEffectObject`

```typescript
interface SceneObjectBase {
  x: number              // PivotBase 的世界坐标 X
  y: number              // PivotBase 的世界坐标 Y
  width: number           // 固有宽度（像素）
  height: number          // 固有高度（像素）
  scaleX: number
  scaleY: number
  rotation: number        // 弧度
  transformOriginX?: number  // 像素偏移，默认 0（= 几何中心旋转）
  transformOriginY?: number  // 像素偏移，默认 0
}
```

**变换公式**：

```
PivotBase = (localBounds.centerX, localBounds.centerY)
pivot     = PivotBase + (transformOriginX, transformOriginY)
position  = (obj.x, obj.y) + (transformOriginX, transformOriginY)
```

**特性**：
- Bounds = `obj.width × obj.height`，由资源内容决定，交互中不变
- transformOrigin 默认 `(0, 0)` = 围绕几何中心旋转
- 公式简单、稳定，无 edge case

### 3.2 Entity Composite

```typescript
interface CompositeObject extends SceneObjectBase {
  type: 'composite'
  compositeMode: 'entity'
  childIds: string[]
  renderChain?: string[]
  compositeLocked: boolean
}
```

**PIXI 层级**：

```
Parent
 └── Composite Container
      ├── Child A Container
      └── Child B Container
```

**变换公式**：

```
PivotBase = (0, 0)   // 容器坐标原点，创建时 = 子对象几何中心
pivot     = (0, 0) + (transformOriginX, transformOriginY)
position  = (obj.x, obj.y) + (transformOriginX, transformOriginY)
```

**创建示例**：

```
组合前（世界坐标）：
  Object A: x=100, y=200
  Object B: x=300, y=400

创建 Composite：
  Composite.x = (100+300)/2 = 200  ← (0,0) 的世界坐标
  Composite.y = (200+400)/2 = 300
  Object A → 本地坐标 (-100, -100)  ← 相对于 (0,0)
  Object B → 本地坐标 (+100, +100)
```

**子对象移动后**：

```
Object A 移到 (+500, +500)：
  (0,0) 位置不变 ← PivotBase 固定
  Composite.x/y 不变
  Object B 位置不变 ← 不受影响 ✓
  Bounds 变大 ← 仅影响选择框
```

### 3.3 Union Composite

```typescript
interface CompositeObject extends SceneObjectBase {
  type: 'composite'
  compositeMode: 'union'
  childIds: string[]
}
```

**PIXI 层级**：

```
Parent
 ├── Union Proxy Container（空容器）
 ├── Child A Container（平级）
 └── Child B Container（平级）
```

**变换公式**：与 Entity Composite 完全相同。

```
PivotBase = (0, 0)
pivot     = (0, 0) + (transformOriginX, transformOriginY)
position  = (obj.x, obj.y) + (transformOriginX, transformOriginY)
```

Union 模式通过 `applyUnionProxyChain` 将 proxy 容器的变换传播到平级子容器上。公式统一意味着两种模式在 `applyTransform` 中**无需分支**。

---

## 4. 统一变换公式

### 4.1 所有对象类型的通用公式

```typescript
// 对所有对象类型完全统一：
const originX = obj.transformOriginX ?? 0
const originY = obj.transformOriginY ?? 0

container.pivot.set(pivotBaseX + originX, pivotBaseY + originY)
container.position.set(obj.x + originX, obj.y + originY)
container.rotation = obj.rotation
container.scale.set(obj.scaleX * (obj.flipX ? -1 : 1), obj.scaleY)
```

其中 `pivotBaseX/Y` 的值：

| 类型 | pivotBaseX | pivotBaseY |
|---|---|---|
| 非 composite | `localBounds.x + localBounds.width / 2` | `localBounds.y + localBounds.height / 2` |
| Composite（entity/union） | `0` | `0` |

### 4.2 位置补偿（变换点修改时）

当用户修改 transformOrigin 时，需要原子性地补偿 `obj.x/y` 以保持视觉不变：

```
Δoffset = (newTransformOrigin - oldTransformOrigin)
补偿量 = (R(θ) × S - I) × Δoffset

obj.x += adjustX
obj.y += adjustY
```

仅在对象已旋转/缩放时才需要补偿。

---

## 5. 此前的问题与修复记录

### 5.1 动态 Bounds 导致的位置漂移（已修复方向）

**问题**：Composite 使用 `container.getLocalBounds()` 动态计算 bounds，并基于 bounds 映射归一化 transformOrigin → 像素偏移。子对象移动 → bounds 变 → offset 变 → 所有子对象视觉位置漂移。

**修复**：将 transformOrigin 从「归一化 (0~1) + 动态 bounds」改为「像素偏移 + 不依赖 bounds」。

### 5.2 旋转后移动变换点导致视觉跳变（已修复）

**问题**：移动变换点时未计算 `(R(θ)×S - I) × Δoffset` 位置补偿。

**修复**：在画布拖拽路径（`useSceneRenderer.ts`）和属性面板路径（`ObjectPropertiesPanel.vue`）中均添加了补偿逻辑。

### 5.3 嵌套 flipX 导致交互方向反转（已修复）

**问题**：交互系统只检查 `obj.flipX`（自身），未计算从父级 composite 继承的累积翻转状态。

**修复**：实现 `getEffectiveFlipX(objectId)` 函数，沿 `parentId` 链 XOR 所有祖先的 `flipX`。

### 5.4 Composite 默认 (0.5, 0.5) 时旋转中心错误（已修复）

**问题**：`applyTransform` 中 `if (originX !== 0.5 || originY !== 0.5)` 跳过了 composite 的补偿逻辑，但 composite 的 pivotBase = (0,0) ≠ 几何中心。

**修复**：条件改为 `if (originX !== 0.5 || originY !== 0.5 || finalObj.type === 'composite')`。

> **注意**：以上 5.2~5.4 的修复是基于旧的归一化方案做的临时修复。当像素偏移方案实施后，这些修复逻辑将被简化或替代。
