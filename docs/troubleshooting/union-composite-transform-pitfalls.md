# Union Composite 变换与渲染陷阱手册

> **目的**：记录 union composite 在变换、渲染过程中容易出现的问题模式，供后续开发参考。

## 核心架构特征

Union composite 的 PIXI 容器是**空代理**——子对象不在 PIXI 层级上挂载于 union 容器内，而是挂载到更上层的有效父容器（stage 或 entity）。Union 的变换通过 `applyUnionProxyChain`（`unionTransformResolver.ts`）以数学方式折叠到每个子对象的 PIXI 容器上。

```
[正常对象]  PIXI 层级 = 数据层级
[Union]     PIXI 层级 ≠ 数据层级，变换通过 localToGlobal 数学折叠
```

---

## 陷阱 1：async 交错导致双重变换

### 症状
子对象位置在 flipX 切换时大幅跳动/偏离，某些类型（如 symbol）受影响而其他类型（如 expression）正常。

### 根因
`updateObjectContainer` 是 `async` 函数，从 `renderObjects` 以 `void`（fire-and-forget）方式并发调用。函数内部结构为：

```typescript
async function updateObjectContainer(container, obj) {
    applyTransform(container, obj)         // ① 同步：重置 position
    // symbol: await preloadTextures()     // ② 异步挂起！
    // expression: await loadAssets()      // ② 异步挂起！
    container.visible = obj.visible        // ③ 延迟
    applyUnionProxyChain(container, ...)   // ④ 延迟：proxy 折叠
}
```

当 ② 处 `await` 挂起时，下一轮 watcher 的 `renderObjects` 对同一对象运行 ①（重置 position），然后第一轮恢复的 ④ 在已被重置的 position 上再次执行 → **双重变换**。

### 修复原则

> **`applyTransform` 和 `applyUnionProxyChain` 必须在同一个同步微任务中执行，中间不能有 `await`。**

```typescript
async function updateObjectContainer(container, obj) {
    applyTransform(container, obj)         // 同步
    container.visible = obj.visible        // 同步（紧跟）
    applyUnionProxyChain(container, ...)   // 同步（紧跟）
    
    // 类型特定更新（可能含 await，放在最后）
    if (obj.type === 'symbol') {
        await preloadSymbolMaterialTextures(...)
    }
}
```

---

## 陷阱 2：flipX 双重烘焙

### 症状
flipX 视觉上无效（翻转被取消），或子对象位置跳动。

### 根因
`applyTransform` 将 flipX 烘焙到 PIXI `scale.x`：

```typescript
container.scale.x = obj.scaleX * (obj.flipX ? -1 : 1)  // scale.x = -1
```

如果后续代码从 PIXI 容器读取 `scale.x`（已含 flipX），同时又透传数据模型的 `flipX: true`，则 `applyUnionProxyChain` 会双重处理：

```typescript
proxyEffScaleX = scaleX * (flipX ? -1 : 1)
             = (-1)    * (-1)               // = 1，flipX 被取消！
```

### 修复原则

> **从 PIXI 容器读取 scale 时，必须将 flipX 设为 false（已烘焙）。从数据模型读取 scaleX 时，保留 flipX 原值。**

---

## 陷阱 3：PIXI position 含 Transform Origin 补偿

### 症状
子对象在非默认变换原点（transformOriginX ≠ 0.5）时位置偏移。

### 根因
`applyTransform` 设置 position 时包含 transform origin 补偿 `posCompX`：

```typescript
container.position.set(obj.x + posCompX, obj.y + posCompY)
```

`applyUnionProxyChain` 的 `localToGlobal` 期望 `parent.x = obj.x`（数据模型原始值）。如果从 PIXI 容器读取 position（含 `posCompX`），会导致子对象被额外偏移。

### 修复原则

> **`getProxyState` 的 position 必须从数据模型读取（`compObj.x/y`），不能从 PIXI 容器读取。Scale/rotation/alpha 可从 PIXI 读取以捕获动画增量。**

---

## 陷阱 4：flipX 变换原点不以 ⊕ 为基准

### 症状
flipX 生效（内容确实镜像），但翻转的基准点不在用户设置的 ⊕ 变换点，而是在 union 的 `(0,0)` 坐标。

### 根因
`localToGlobal` 默认围绕 `(0,0)` 翻转（= union position）。普通对象的 PIXI flip 围绕 pivot（= 变换原点），但 union 的空代理容器的 pivot 不影响子对象渲染。

### 修复方案
在 `applyUnionProxyChain` 中添加 flipX 位置补偿：

```typescript
// 1. 从数据模型计算子对象 AABB [minX, maxX]
// 2. 映射 transformOriginX 到局部坐标：
//    pvx = minX + transformOriginX * (maxX - minX)
// 3. 位置补偿：
//    flipOffsetX = 2 * cos(rot) * |scaleX| * pvx
//    flipOffsetY = 2 * sin(rot) * |scaleX| * pvx
```

当 `transformOriginX = 0.5` 且子对象对称时，`pvx ≈ 0`，补偿 ≈ 0（无影响）。

---

## 陷阱 5：getProxyState 数据源不一致

### 症状
预览/导出时 union 的运行时 Action 变化（如 flipX 动画）不生效。

### 根因
`getProxyState` 从**初始 setup 对象**读取，而非从**运行时 evaluatedStates** 读取：

```typescript
// ❌ 错误：使用初始数据
(compositeId) => sceneSetup.objects.find(o => o.id === compositeId)

// ✅ 正确：优先使用运行时状态
(compositeId) => runtimeStates?.get(compositeId)
  ?? sceneSetup.objects.find(o => o.id === compositeId)
```

### 影响范围
| 引擎 | 正常路径（create/update） | 动画传播路径 |
|------|------------------------|------------|
| 编辑器 (useSceneGraph) | 数据模型 ✅ | 混合源（x/y 数据模型 + scale/rot PIXI）✅ |
| ScenePlayer | 实时 states Map ✅ | N/A |
| FrameCapture | 实时 states Map ✅ | N/A |

---

## 陷阱 6：getLocalBounds 返回空矩形

### 症状
对 union composite 的 PIXI 容器调用 `container.getLocalBounds()` 返回 `{x:0, y:0, width:0, height:0}`，导致依赖边界的功能（如 pivot 计算、碰撞检测、缩略图截取）全部失效。

### 根因
Union composite 的 PIXI 容器是**空代理**——子对象在 PIXI 层级上**不挂载**于该容器内。PIXI 的 `getLocalBounds()` 递归遍历子节点来计算边界，空容器自然返回空矩形。

```
Entity composite:
  PIXI Container  ← children 在这里
    ├── childA
    └── childB
  getLocalBounds() → 有效边界 ✅

Union composite:
  PIXI Container  ← 空！children 挂载在 stage/entity 上
  getLocalBounds() → {0, 0, 0, 0} ❌
```

### 影响范围
- `applyTransform` 中的 pivot 计算（使用 `localBounds`）
- Transform Origin 补偿计算
- 选择框 / OBB 绘制
- flipX 变换原点补偿中的 AABB 计算

### 修复原则

> **Union composite 不能使用 `container.getLocalBounds()`。必须从数据模型计算虚拟边界。**

替代方案：使用 `compositeBounds.ts` 中的 `computeUnionBounds()` 从子对象的数据模型属性（`x, y, width, height, scaleX, scaleY, rotation`）合成 AABB：

```typescript
// ❌ 错误
const bounds = unionContainer.getLocalBounds()

// ✅ 正确：从数据模型计算
let minX = Infinity, maxX = -Infinity
for (const childId of comp.childIds) {
    const child = allObjects.find(o => o.id === childId)
    if (!child) continue
    const halfW = (child.width / 2) * Math.abs(child.scaleX)
    minX = Math.min(minX, child.x - halfW)
    maxX = Math.max(maxX, child.x + halfW)
}
const virtualWidth = maxX - minX

// 旋转时需要用旋转 AABB 展开：
// rHalfW = halfW * |cos(θ)| + halfH * |sin(θ)|
```

### 注意事项
- `applyTransform` 中为 `composite` 类型特判了 `pivotX = 0, pivotY = 0`，绕过了 `getLocalBounds()` 的 pivot 计算
- flipX 补偿中的 AABB 计算已独立实现于 `applyUnionProxyChain` 内部，不依赖 `getLocalBounds()`


## 调试方法论

当 union composite 出现变换异常时，按以下步骤排查：

1. **标记调用来源**：给 `applyUnionProxyChain` 添加 `_caller` 参数，标记 `create` / `update` / `propagateAnim` 等来源
2. **打印 BEFORE/AFTER**：记录每次调用前后的 `container.position`
3. **检查 applyTransform 是否执行**：在 position.set 行添加日志，确认每次 ProxyChain 前都有 SET_POS
4. **检查 proxyState 数据源**：打印 `proxyState.x/y/scaleX/flipX`，确认是数据模型还是 PIXI 容器值
5. **检查 async 交错**：观察日志中 SET_POS 和 ProxyChain 是否紧密相邻（应无其他对象的日志插入）

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `unionTransformResolver.ts` | `applyUnionProxyChain` — union 变换折叠核心 |
| `compositeTransform.ts` | `localToGlobal` — 坐标变换数学 |
| `useSceneGraph.ts` | 编辑器 `updateObjectContainer` + `applyTransform` |
| `useSceneRenderer.ts` | 编辑器 `propagateUnionAnimations` |
| `ScenePlayer.vue` | 预览引擎 `applyObjectState` |
| `FrameCapture.ts` | 导出引擎 `applyObjectState` |
