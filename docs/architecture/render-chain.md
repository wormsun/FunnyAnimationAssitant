# 渲染链（Render Chain）PRD

## 1. 背景与问题

当前系统中，场景对象的渲染顺序由两个因素共同决定：

1. **zIndex**：不同 zIndex 的对象按值排序
2. **物理存储位置**：相同 zIndex 的对象按 `objects` 数组位置或 `childIds` 数组位置排序

这导致**物理存储逻辑与渲染顺序逻辑耦合**——任何改变对象存储位置的操作（成组、解组、`set_parent`）都会意外改变渲染顺序。特别是 union composite 要求子对象在 Transform 层面归属于 union，但在渲染层面保持原有位置不变，当前架构无法实现。

## 2. 目标

引入独立的**渲染链（Render Chain）**数据结构，将「物理存储/归属关系」与「渲染顺序」彻底解耦。

## 3. 核心概念

### 3.1 两棵树

| 概念 | 由什么构成 | 职责 |
|------|----------|------|
| **物理树（Transform Tree）** | `parentId` + `childIds` | 坐标系从属关系、变换继承、归属管理 |
| **渲染链（Render Chain）** | 独立的有序 ID 列表 | PIXI 容器挂载顺序、绘制先后 |

### 3.2 parentId 的职责收窄

`parentId` 保留，但语义收窄为**纯 Transform 继承链**：

| 职责 | 由谁承担 |
|------|---------|
| 坐标系从属（本地↔全局转换） | `parentId` |
| 坐标补偿（parent 变更防跳跃） | `parentId` |
| 拓扑排序（parent 先于 child 评估）| `parentId` |
| PIXI 容器挂载 | **渲染链** |
| 绘制顺序 | **渲染链** |

## 4. 数据结构

### 4.1 场景级

```typescript
interface SceneSetup {
    objects: SceneObject[]    // 物理存储（平铺，无固定顺序）
    renderChain: string[]     // 根级渲染链（有序 ID 列表）
}
```

### 4.2 Entity Composite

```typescript
interface CompositeObject {
    childIds: string[]        // 物理归属
    compositeMode: 'entity' | 'union'
    renderChain?: string[]    // 仅 entity 拥有（内部渲染链）
}
```

### 4.3 Union Composite

Union **不拥有** `renderChain`。Union 在渲染链中**透明**——其子对象直接平铺在上一级的渲染链中。

## 5. 渲染链的内容规则

| 渲染链层级 | 包含 | 不包含 |
|-----------|------|--------|
| 场景 `renderChain` | 根级对象 + entity composite + union 子对象（展开） | union composite 本身 |
| entity 的 `renderChain` | entity 直接子对象 + 嵌套 union 子对象（展开） | 嵌套 union 本身 |

**示例**：

```
物理树：
  entity_人物.childIds = [union_头部, 身体, 左手, 右手]
  union_头部.childIds = [后发, 脸, 前发]

渲染链：
  scene.renderChain = [背景, entity_人物]

  entity_人物.renderChain = [后发, 脸, 身体, 前发, 左手, 右手]
                             ↑ union_头部 不出现
                             ↑ 后发/脸/前发 从 union 中展开
                             ↑ 身体可以夹在 脸 和 前发 之间
```

## 6. 排序规则

### 6.1 核心规则

```
排序权重：zIndex（主键） > renderChain 位置（次键）
```

### 6.2 zIndex 有序不变量

渲染链在任何时刻都必须保持 **zIndex 非递减**：

```
∀ i < j  :  objects[chain[i]].zIndex ≤ objects[chain[j]].zIndex
```

### 6.3 图层面板拖拽

- **同 zIndex**：允许自由调换 renderChain 位置
- **不同 zIndex**：禁止跨层调换

## 7. 操作对渲染链的影响

### 7.1 Union 操作（对渲染链透明）

| 操作 | 物理树影响 | 渲染链影响 |
|------|----------|-----------|
| 创建 union | 创建 union 节点 + 修改 childIds/parentId | **无变化** |
| 解组 union | 删除 union 节点 + 恢复 childIds/parentId | **无变化** |
| union 内创建子 union | 嵌套 union 结构变更 | **无变化** |

### 7.2 Entity 操作（需同步渲染链）

| 操作 | 物理树影响 | 渲染链影响 |
|------|----------|-----------|
| 创建 entity | 创建 entity + 修改 childIds/parentId | 子对象从上级渲染链移入 entity.renderChain；entity 节点插入到**最后一个子对象的原始位置** |
| 从 entity 移出对象 | 修改 childIds/parentId | 子对象从 entity.renderChain 移到上级渲染链（插入到 entity 节点之后） |
| 解组 entity | 删除 entity + 恢复 childIds/parentId | entity 节点被其 renderChain 内容**原地展开**替换 |

### 7.3 Entity 成组时 zIndex 的处理

Entity 节点自身的 zIndex 取子对象的**最大 zIndex**，与「插入到最后一个子对象位置」的规则一致。

### 7.4 其他操作

| 操作 | 渲染链影响 |
|------|-----------|
| 新增对象 | 追加到对应层级 renderChain 末尾（受 zIndex 约束） |
| 删除对象 | 从 renderChain 中移除 |
| `set_parent`（运行时） | 默认不变。仅修改 Transform 继承，不影响渲染位置 |
| 图层面板拖拽 | 仅修改 renderChain，不影响物理树 |
| 修改 zIndex | 对象在 renderChain 中的位置需重新排序以维持有序不变量 |

## 8. PIXI 容器挂载映射

渲染链决定了 PIXI 容器的挂载关系：

| 渲染链节点类型 | PIXI 挂载策略 |
|-------------|-------------|
| 普通对象（prop/background/expression/symbol） | addChild 到该层级对应的 PIXI Container |
| entity composite | 创建 CRT 离屏渲染容器，renderChain 中的子节点 addChild 到 CRT source |
| union composite | 不出现在渲染链中，子对象直接平铺 |

## 9. `set_parent` Action 的行为

`set_parent` 仅操作物理树（Transform 继承），不自动修改渲染链：

- 修改 `parentId`（改变坐标系从属）
- 自动坐标补偿（防止视觉跳跃）
- 同步 `childIds`

如果需要同时改变渲染位置，应通过**显式的渲染链操作**实现。
