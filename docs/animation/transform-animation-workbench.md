# 动画 WYSIWYG 编辑器 — 需求定义与 UI 设计

> 沙雕动画小助手 Animation 所见即所得编辑器 PRD
>
> **版本**: v5.0 (多轨道架构) | **上一版本**: v4.1

---

## 1. 背景与目标

### 1.1 当前痛点

当前 `TransformTrackEditor` 的编辑流程完全基于**数值表单输入**：

```
当前流程 (7+ 步交互):
┌─────────────────────────────────────────────────────────────────┐
│ AnimationEditorModal                                            │
│ ┌──────────────┬────────────────────────────────────────────┐   │
│ │ 📐 变换      │  变换轨道                                  │   │
│ │ (选中)       │  时长模式: ○固定 ●自动                     │   │
│ │              │  缓动函数: [线性 ▾]                        │   │
│ │              │  旋转/缩放锚点: X(50%) Y(50%)              │   │
│ │              │                                            │   │
│ │              │  关键帧            [+ 添加帧]              │   │
│ │              │  ┌────────────────────────────────┐        │   │
│ │              │  │ 0%  x:0 y:0 rot:0°            │        │   │
│ │              │  │ 100% x:0 y:0 rot:0°    [×]    │        │   │
│ │              │  └────────────────────────────────┘        │   │
│ │              │                                            │   │
│ │              │  编辑关键帧 2                               │   │
│ │              │  时间 [100] %                              │   │
│ │              │  X偏移 [___] px → 必须手动输入数值！         │   │
│ │              │  Y偏移 [___] px → 必须手动输入数值！         │   │
│ │              │  缩放X [100] %  → 必须手动输入数值！         │   │
│ │              │  缩放Y [100] %  → 必须手动输入数值！         │   │
│ │              │  旋转  [___] °  → 必须手动输入数值！         │   │
│ │              │  ☐ 水平翻转                                │   │
│ └──────────────┴────────────────────────────────────────────┘   │
│                                          [取消]  [保存]         │
└─────────────────────────────────────────────────────────────────┘
```

**核心问题：**

| # | 问题 | 影响 |
|---|------|------|
| 1 | 对象变换（位移/旋转/缩放）全部依赖手动数值输入 | 用户只能靠想象推断效果，编辑效率极低 |
| 2 | AnimationEditorModal 是纯表单模态框，完全遮挡画布 | 编辑动画时看不到舞台，无法所见即所得 |
| 3 | 关键帧添加是线性追加（+0.25），无法按视觉意图定位 | 用户想定义"中间状态"只能手动输入时间百分比 |
| 4 | 无 Scrub 预览能力 | 编辑关键帧后无法拖拽时间轴实时查看插值效果 |
| 5 | 缓动函数仅 linear/step 两个选项 | 无法创建自然运动（虽 EasingType 定义了 21+ 种，但 UI 未暴露） |
| 6 | 编辑→预览→修改循环过长 | 修改一个关键帧需要 5+ 次点击才能看到效果 |

### 1.2 设计目标

| 优先级 | 目标 | 衡量标准 |
|:------:|------|---------|
| 核心 | 在画布上通过 Gizmo 直接拖拽编辑变换关键帧 | 位移/旋转/缩放无需手动输入数值即可完成 |
| 核心 | 编辑时画布上实时反映关键帧的变换效果 | 选择任一关键帧时画布立即显示该帧状态 |
| 核心 | 支持自动关键帧录制模式 | 在画布上操作对象后自动创建/更新对应时间点关键帧 |
| 增强 | 时间轴 Scrub 拖拽预览 | 拖拽播放头可实时看到对象插值动画效果 |
| 增强 | 暴露全部 21+ 种 Easing 预设 | 用户可从预设列表选择并即时预览缓动差异 |
| 增强 | AnimationEditorModal 内嵌预览功能 | 在现有表单编辑器中可 Scrub/播放预览动画效果 |
| 可视化 | 运动路径可视化 | 画布上显示对象各关键帧之间的运动轨迹虚线 |

### 1.3 设计原则

1. **画布优先** — 所有变换操作首先在画布上完成，数值面板作为精确微调的辅助入口
2. **双向同步** — 画布操作实时更新数值面板；数值面板修改实时更新画布显示
3. **完全隔离** — 独立画布 + 独立数据，对现有 `useSceneRenderer` / `useInteraction` / `ActionEditor` / `SetupEditor` **零改动**
4. **渐进增强** — 原有数值编辑流程作为兜底保留；先交付内嵌预览（P1），再交付完整 WYSIWYG 工作台（P0）

---

## 2. 整体架构：独立轻量画布 (AnimationWorkbench)

### 2.1 架构决策

> **方案选型**：经过对"复用现有画布"方案的详尽分析，确认其不可行——
> - 动画编辑的入口有 **5 个宿主**：SetupEditor、ActionEditor、CompositeCharacterEditor、SceneTemplateEditor、PropEditorModal
> - `ObjectPropertiesPanel` 的"🎬 动画管理"按钮**不区分模式**（仅检查 object type）
> - 复用画布会导致 Gizmo 操作污染 Setup Mode 的场景状态或 Action Mode 的指令录制
> - PropEditorModal 根本没有 PixiJS 画布，复用不可能
>
> **因此采用独立轻量画布方案（方案 C）**：新建专用 `PIXI.Application`，复用现有 `SceneObjectRenderer` 渲染对象，对现有渲染管线**零改动**。

### 2.2 架构对比

```
当前架构:
┌─ 各编辑器 (Setup/Action/Composite/Template/PropEditor) ─────────┐
│  ObjectPropertiesPanel → "🎬 动画管理"                            │
│    → AnimationManagerDialog (固定叠加层 z:1000)                    │
│      → AnimationManager (动画列表)                                │
│        → AnimationEditorModal (又一层叠加层，纯表单，无画布)        │
└──────────────────────────────────────────────────────────────────┘

目标架构:
┌─ 任何编辑器 ──────────────────────────────────────────────────────┐
│  ObjectPropertiesPanel → "🎬 动画管理"                            │
│    → AnimationManagerDialog                                      │
│      → AnimationManager → 点击 ✏️ 编辑                           │
│        ┌────────────────────────────────────────────────────────┐ │
│        │  AnimationWorkbench (全屏叠加层，替代 AnimationEditorModal) │
│        │  ┌── 独立轻量画布 ──────────────┬── 右侧面板 ──────┐  │ │
│        │  │ new PIXI.Application()       │ 关键帧属性       │  │ │
│        │  │ SceneObjectRenderer 渲染对象  │ 数值编辑         │  │ │
│        │  │ SimpleGizmo 变换交互          │ 缓动选择         │  │ │
│        │  │   ├─ 拖拽 → keyframe.x/y    │ Pivot 设置       │  │ │
│        │  │   ├─ 缩放 → keyframe.scaleX/Y│                 │  │ │
│        │  │   └─ 旋转 → keyframe.rotation│                 │  │ │
│        │  └──────────────────────────────┴──────────────────┘  │ │
│        │  ┌── AnimationTimeline (底部时间轴) ──────────────────┐│ │
│        │  │ ◆──────●───▲──────────●──────────◆  [▶] [⏸]       ││ │
│        │  └────────────────────────────────────────────────────┘│ │
│        └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 关键架构优势

| 维度 | 说明 |
|------|------|
| **入口统一** | 从 Setup / Action / Composite / Template / PropEditor 五个编辑器都能打开同一个 AnimationWorkbench |
| **对现有代码零改动** | 不改 `useSceneRenderer`、`useInteraction`、`useSceneGraph`、`ActionEditor`、`SetupEditor` — 一行都不改 |
| **数据完全隔离** | Gizmo 操作直接写入本地 keyframe 数据，**编辑期间对 `sceneObjectStore` 零写入**（入口时只读快照） |
| **对象渲染** | 复用现有 `SceneObjectRenderer`（~20 行创建容器），不需要重建渲染管线 |
| **Gizmo 轻量** | 只需处理单个对象的 drag/resize/rotate，不需要多选、分组、摄像机、Pass-through 等 |

### 2.4 新增组件清单

| 组件 | 类型 | 职责 | 预估代码量 |
|------|------|------|:----------:|
| `AnimationWorkbench.vue` | Vue 组件 | 全屏 overlay + 三区布局（画布/属性面板/时间轴） | ~150 行 |
| `LightweightCanvas.vue` | Vue 组件 | 独立 PIXI.Application + 对象渲染 + viewport | ~200 行 |
| `SimpleGizmo.ts` | PixiJS 层 | 变换控制框（移动/旋转/缩放手柄） | ~250 行 |
| `AnimationTimeline.vue` | Vue 组件 | 底部关键帧时间轴（Scrub、关键帧增删、播放控制） | ~250 行 |
| `KeyframePropertyPanel.vue` | Vue 组件 | 右侧面板关键帧属性编辑（数值微调） | ~200 行 |
| `useAnimationEdit.ts` | Composable | 关键帧 CRUD + seek + 排序 + Auto-Key | ~150 行 |
| `MotionPathOverlay.ts` | PixiJS 层 | 画布运动路径可视化 | ~100 行 |
| `AnimationPreviewPlayer.vue` | Vue 组件 | AnimationEditorModal 内嵌预览（P1） | ~150 行 |
| **总计** | | | **~1450 行** |

### 2.5 复用的现有模块（不修改）

| 模块 | 复用方式 |
|------|----------|
| `SceneObjectRenderer` | 创建目标对象的 PIXI.Container（prop/symbol/composite） |
| `TextureProvider` / `useAssetLoader` | 加载对象纹理 |
| `AnimationTrackEvaluator` | 纯函数，计算任意时间点的关键帧插值 |
| `AnimationPlayer` | 播放预览：`play()` → `seek()` → `getCurrentOutput()` |
| `easing.ts` | 21+ 种缓动函数的纯数学实现 |
| `animation.ts` 类型定义 | `AnimationDefinition`、`TransformTrack`、`TransformKeyframe` 等 |

### 2.6 入口与调用链

**动画管理按钮**（`ObjectPropertiesPanel.vue`）对 `prop`、`background`、`symbol`、`composite` 类型对象均可见，**不区分 Setup/Action 模式**。

```
任何编辑器 (SetupEditor / ActionEditor / CompositeCharacterEditor / SceneTemplateEditor)
  └─ ObjectPropertiesPanel
       └─ "🎬 动画管理" button (v-if: type in [prop, background, symbol, composite])
            └─ AnimationManagerDialog (fixed overlay z:1000)
                 └─ AnimationManager.vue (动画列表 + ✏️ 编辑按钮)
                      └─ 点击 ✏️
                           ├─ [默认] AnimationEditorModal (现有表单 — 保留不变)
                           └─ [新增] AnimationWorkbench (WYSIWYG 编辑器)
```

**两种编辑器共存策略**：AnimationManager 的"编辑"按钮改为双入口——默认打开 AnimationWorkbench；如果用户偏好表单或 AnimationWorkbench 不可用（如资源级别编辑），回退到 AnimationEditorModal。

> **PropEditorModal 特殊处理**：PropEditorModal 内置的 AnimationManager 是资源级别编辑，没有场景对象上下文。此路径下 AnimationWorkbench 的画布以**资源原始尺寸**渲染（从 `propStore.getProp(refId)` 获取纹理），不依赖 `sceneObjectStore`。

### 2.7 需要的最小改动（现有文件）

| 文件 | 改动 | 行数 |
|------|------|:----:|
| `AnimationManager.vue` | "编辑"按钮增加分支：打开 AnimationWorkbench 或 AnimationEditorModal | ~10 行 |
| `AnimationManagerDialog.vue` | 透传 AnimationWorkbench 的事件（save/close） | ~5 行 |
| **总计** | | **~15 行** |

> 除上述两处，**不改动任何现有文件**。
>
> **关于"零交互"的精确定义**：AnimationWorkbench 在**打开时**会从 `sceneObjectStore`（场景级入口）或 `compositeCharacterStore`（资源级入口）**只读深拷贝**目标对象及其子树信息作为渲染初始数据。整个**编辑过程中不再读写 `sceneObjectStore`**，所有变换操作仅写入本地 keyframe 数据。保存时结果写回 `animationStore`，不经过 `sceneObjectStore`。

---

## 3. 核心：LightweightCanvas 独立轻量画布

### 3.1 画布创建

AnimationWorkbench 创建专属的 `PIXI.Application`，不共享任何现有编辑器的画布或渲染上下文。

```typescript
// LightweightCanvas.vue 核心逻辑 (PIXI v7 API)
function initCanvas(containerEl: HTMLElement) {
  const app = new PIXI.Application({
    width: containerEl.clientWidth,
    height: containerEl.clientHeight,
    backgroundColor: 0xe8eaee,    // 浅灰背景 + 棋盘格透明指示
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  })
  containerEl.appendChild(app.view as HTMLCanvasElement)

  // 层级结构（从下到上：背景 → 内容 → 洋葱皮 → 路径 → Gizmo）
  const backgroundLayer = new PIXI.Container()  // 棋盘格透明度指示
  const contentLayer = new PIXI.Container()      // 目标对象
  const onionSkinLayer = new PIXI.Container()    // 洋葱皮帧 
  const pathLayer = new PIXI.Container()          // 运动路径 
  const gizmoLayer = new PIXI.Container()        // SimpleGizmo (最上层)
  app.stage.addChild(backgroundLayer, contentLayer, onionSkinLayer, pathLayer, gizmoLayer)
  
  return { app, contentLayer, onionSkinLayer, pathLayer, gizmoLayer }
}
```

### 3.2 对象渲染（复用 SceneObjectRenderer）

动画编辑只需渲染**单个目标对象**（或 composite 的子部件），复用现有 `SceneObjectRenderer` 即可：

```typescript
async function loadTargetObject(
  objectOrResource: { type: string, refId: string, /* ... */ },
  contentLayer: PIXI.Container
) {
  // 1. 预加载纹理
  const { loadAssets } = useAssetLoader()
  const assetData = getAssetData(objectOrResource)  // 从 propStore/expressionStore 获取
  await loadAssets(new Set([assetData.url]), new Set(), 'anim-preview')

  // 2. 创建容器（复用现有渲染器，~15 行核心代码）
  const renderer = new SceneObjectRenderer(textureProvider, { propStore, expressionStore })
  let container: PIXI.Container

  switch (objectOrResource.type) {
    case 'prop':
    case 'background':
      container = renderer.createPropContainer(objectOrResource)
      break
    case 'symbol':
      container = renderer.createSymbolContainer(objectOrResource)
      break
    case 'composite':
      container = await loadCompositeObject(objectOrResource) // 见 §3.3
      break
    default:
      container = renderer.createPropContainer(objectOrResource)
  }

  // 3. 设置初始 transform（基础状态）
  applyBaseTransform(container, objectOrResource)
  
  contentLayer.addChild(container)
  return container
}
```

### 3.3 Composite 对象渲染

Composite（复合对象）包含多个子部件，渲染需要额外处理。

#### 3.3.1 Composite 数据来源

**现有代码中 composite 的真实结构**：

| 层级 | 数据位置 | 关键字段 |
|------|----------|----------|
| **场景级 composite** | `sceneObjectStore.objects[]` 中 `type: 'composite'` 的对象 | `childIds: string[]`、`parentId?`、`renderChain?: string[]`、`compositeMode: 'entity' \| 'union'` |
| **资源级 composite** | `compositeCharacterStore.getCharacter(id)` 返回 `CompositeCharacter` | `objects: SceneObject[]`（同结构扁平列表）、`rootCompositeId` |

> 系统中**不存在** `compositeStore.getComposite()` 这样的通用接口。Composite 的子部件树由 `childIds` + 递归查找 `objects[]` 中的子对象构成——场景级查 `sceneObjectStore`，资源级查 `CompositeCharacter.objects[]`。
>
> `targetObjectId` 始终是**场景对象 ID**（即 `sceneObjectStore` 中对象的 `id` 字段），不是 rig 语义标签。

#### 3.3.2 AnimationWorkbench 入口时的数据快照

AnimationWorkbench **打开时** 对 composite 子树做一次性只读深拷贝，后续编辑不再访问 store：

```typescript
// AnimationWorkbench 入口数据准备
// 
// **设计理想态 vs 当前实现**：
// 理想态：通过 CompositeSnapshot 做一次性深拷贝，完全隔离于 sceneObjectStore。
// 当前实现：LightweightCanvas 直接从 sceneObjectStore 只读查找子对象（不写入）。
// 理由：当前方案更简洁，且在 AnimationWorkbench 生命周期内 store 不会被外部修改。
// 如果未来需要严格隔离（如支持编辑期间的 Undo/Redo），可引入此快照模型。
//
// ⚠️ 注意：不要使用 structuredClone()——SceneObject 可能引用 PIXI.Texture 等
// 不可序列化对象，会导致 DataCloneError。使用 JSON.parse(JSON.stringify()) 代替。

interface CompositeSnapshot {
  root: SceneObject                    // composite 根对象（深拷贝）
  children: Map<string, SceneObject>   // childId → 子对象（深拷贝）
  renderOrder: string[]                // entity mode: renderChain; union mode: childIds
}

function snapshotComposite(
  compositeId: string,
  source: 'scene' | 'resource',
  resourceId?: string
): CompositeSnapshot {
  if (source === 'scene') {
    // 场景级入口：从 sceneObjectStore 只读深拷贝
    // ⚠️ 禁止 structuredClone — 使用 JSON 深拷贝避免 DataCloneError
    const root = JSON.parse(JSON.stringify(
      sceneObjectStore.objects.find(o => o.id === compositeId)
    )) as SceneObject
    const children = new Map<string, SceneObject>()
    
    function collectChildren(obj: CompositeObject) {
      for (const childId of obj.childIds) {
        const child = JSON.parse(JSON.stringify(
          sceneObjectStore.objects.find(o => o.id === childId)
        )) as SceneObject
        children.set(childId, child)
        if (child.type === 'composite') collectChildren(child as CompositeObject)
      }
    }
    collectChildren(root as CompositeObject)
    
    return {
      root,
      children,
      renderOrder: (root as CompositeObject).renderChain?.length
        ? (root as CompositeObject).renderChain!
        : (root as CompositeObject).childIds,
    }
  } else {
    // 资源级入口（CompositeCharacterEditor / PropEditorModal）
    const character = compositeCharacterStore.getCharacter(resourceId!)
    const allObjects = JSON.parse(JSON.stringify(character.objects)) as SceneObject[]
    const objMap = new Map(allObjects.map(o => [o.id, o]))
    const root = objMap.get(character.rootCompositeId!)!
    const children = new Map(
      allObjects.filter(o => o.id !== root.id).map(o => [o.id, o])
    )
    
    return { root, children, renderOrder: (root as CompositeObject).childIds }
  }
}
```

#### 3.3.3 Composite 渲染

| 场景 | 策略 |
|------|------|
| 编辑整体变换轨道 (`targetObjectId: TARGET_SELF`) | 将 composite 作为整体渲染，子部件按快照中的层级 + 变换组装 |
| 编辑子部件变换轨道 (`targetObjectId: 'child_obj_id'`) | 渲染完整 composite 作为上下文，Gizmo 仅聚焦 `children.get(targetObjectId)` 对应的子容器 |

```typescript
async function loadCompositeObject(
  snapshot: CompositeSnapshot
): Promise<{
  rootContainer: PIXI.Container
  partContainers: Map<string, PIXI.Container>
}> {
  const rootContainer = new PIXI.Container()
  const partContainers = new Map<string, PIXI.Container>()
  
  for (const childId of snapshot.renderOrder) {
    const childObj = snapshot.children.get(childId)
    if (!childObj) continue
    
    const partContainer = renderer.createPropContainer(childObj)
    applyBaseTransform(partContainer, childObj)
    rootContainer.addChild(partContainer)
    partContainers.set(childId, partContainer)
  }
  
  return { rootContainer, partContainers }
}

// Gizmo 聚焦子部件
function focusGizmoOnTarget(
  targetObjectId: string,
  rootContainer: PIXI.Container,
  partContainers: Map<string, PIXI.Container>
) {
  if (targetObjectId === TARGET_SELF) {
    gizmo.attach(rootContainer)       // 整体
  } else {
    const target = partContainers.get(targetObjectId)
    gizmo.attach(target!)             // 子部件
  }
}
```

> **外观保真度约定**：独立画布以"编辑时 90% 还原、保存后回到场景 100% 正确"为原则。以下不在独立画布中复现：
> - 滤镜（blur、colorMatrix 等）
> - 裁剪蒙版（clip mask）
> - 环境光照效果
>
> 这些效果不影响变换动画的编辑准确性。

### 3.4 Viewport 控制

画布需要基础的缩放/平移能力，以便用户调整视角：

| 操作 | 行为 |
|------|------|
| 鼠标滚轮 | 缩放 viewport（以鼠标指针为中心） |
| 鼠标中键拖拽 / Alt+左键拖拽 | 平移 viewport |
| 双击画布空白 | 重置缩放到"适配对象"（Fit to object） |

```typescript
// 简单的 viewport 实现
function setupViewport(stage: PIXI.Container, canvasEl: HTMLElement) {
  let scale = 1, panX = 0, panY = 0

  canvasEl.addEventListener('wheel', (e) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    scale = Math.max(0.1, Math.min(5, scale * factor))
    updateStageTransform()
  })

  function fitToObject(objectBounds: PIXI.Rectangle) {
    const padding = 80
    const scaleX = (canvasEl.clientWidth - padding * 2) / objectBounds.width
    const scaleY = (canvasEl.clientHeight - padding * 2) / objectBounds.height
    scale = Math.min(scaleX, scaleY, 2)
    panX = canvasEl.clientWidth / 2 - objectBounds.x * scale
    panY = canvasEl.clientHeight / 2 - objectBounds.y * scale
    updateStageTransform()
  }
}
```

---

## 4. 核心：SimpleGizmo 画布变换交互

### 4.1 需求概述

在独立画布上渲染 **SimpleGizmo**（变换控制框），用户通过鼠标拖拽手柄完成移动、旋转、缩放操作，操作结果**直接写入关键帧数据**（不经过 `sceneObjectStore`）。

### 4.2 Gizmo 视觉设计

```
                     旋转手柄 (蓝色圆点)
                         ●
                         │  连接线(蓝色虚线)
                         │
    旋转感应区    ╭───── ■ ──────── ■ ─────╮    旋转感应区
    (手柄外20px)  │      (角点)      (角点)   │   (手柄外20px)
                  │                         │
                  ■         ⊕              ■    ⊕ = 锚点(橙色)
                 (边)    (可拖拽)           (边)
                  │                         │
                  │                         │
                  ╰───── ■ ──────── ■ ─────╯
                
    边框: 2px 青色(#00BCD4)实线      角点手柄: 10×10 白色填充+青色描边
    边中点手柄: 8×8 白色填充+青色描边   锚点: 8px 橙色(#FF9800)圆点
    旋转手柄: 8px 蓝色(#2196F3)圆点   连接线: 1px 青色虚线
```

### 4.3 交互定义

#### 4.3.1 移动 (Translate)

| 属性 | 定义 |
|------|------|
| **触发** | 鼠标在 Gizmo 内部区域（非手柄）按下并拖拽 |
| **光标** | `move` (十字箭头) |
| **约束** | 按住 Shift → 限制水平/垂直方向（45° 吸附） |
| **数据映射** | 拖拽 delta(px) → `keyframe.x += deltaX`, `keyframe.y += deltaY` |
| **视觉反馈** | 画布上对象实时跟随移动；属性面板 X/Y 数值实时更新 |
| **提示** | 拖拽时显示浮动标签 `X: +120 Y: -45` (相对起点偏移量) |

```
  鼠标按下          拖拽中                 释放
  ┌────────┐      ┌────────┐           ┌────────┐
  │ ⊕ obj  │ ───→ │    ⊕ obj │  ───→  │    ⊕ obj │
  └────────┘      └────────┘           └────────┘
  [X:0 Y:0]       [X:+80 Y:-30]       keyframe.x = 80
                   (浮动标签)           keyframe.y = -30
                                       commitKeyframe()
```

#### 4.3.2 旋转 (Rotate)

| 属性 | 定义 |
|------|------|
| **触发** | 鼠标在角点手柄**外围区域**（距手柄 20px 以内）按下并拖拽；或拖拽顶部旋转手柄 |
| **光标** | 自定义旋转光标 `url(rotate.svg)` 或系统 `crosshair` |
| **约束** | 按住 Shift → 15° 步进吸附 |
| **数据映射** | 角度 delta → `keyframe.rotation += deltaAngle(rad)` |
| **视觉反馈** | 画布上对象实时旋转；显示浮动角度标签 `45.0°` |
| **计算** | `angle = Math.atan2(mouseY - pivotY, mouseX - pivotX) - startAngle` |

#### 4.3.3 缩放 (Scale)

| 属性 | 定义 |
|------|------|
| **触发** | 拖拽角点手柄(等比缩放) 或 边中点手柄(单轴缩放) |
| **光标** | 角点: `nwse-resize`/`nesw-resize`; 边中点: `ew-resize`/`ns-resize`（根据对象旋转动态计算） |
| **约束** | 默认等比缩放(角点)；按住 Alt → 从中心缩放(锚点不移动) |
| **数据映射** | 缩放比例 → `keyframe.scaleX *= ratio`, `keyframe.scaleY *= ratio` |
| **视觉反馈** | 画布上对象实时缩放；显示浮动标签 `150% × 150%` |
| **计算** | `ratio = currentDistance(mouse, pivot) / startDistance(startMouse, pivot)` |

#### 4.3.4 锚点调整 (Pivot)

| 属性 | 定义 |
|------|------|
| **触发** | 拖拽橙色锚点标记 ⊕ |
| **光标** | `crosshair` |
| **数据映射** | 新锚点位置 → `track.pivot = { x: normX, y: normY }` (归一化 0-1) |
| **视觉反馈** | 画布上锚点标记实时跟随；锚点坐标浮动标签 `Pivot: 30%, 70%` |

> **Pivot 坐标系约定**：`TransformTrack.pivot` 使用**归一化 0-1 百分比**（`animation.ts` `TransformTrack.pivot`），与 UI 层（`TransformTrackEditor`、`SceneObjectAnchorCanvas`）和 `AnimationWorkbench` 中的使用一致。~~原注释为"像素偏移"~~ 已于 v4.1 修正。

#### 4.3.5 Pivot vs TransformOrigin 的关系

动画编辑在独立画布上进行，**不涉及 `SceneObject.transformOriginX/Y`**：

| 机制 | 作用范围 | 独立画布中的行为 |
|------|----------|------------------|
| `TransformTrack.pivot` | 仅此动画轨道的旋转/缩放基准 | Gizmo 围绕此 pivot 旋转/缩放 |
| `SceneObject.transformOriginX/Y` | 对象全局旋转/缩放基准 | **不参与**——独立画布中不存在 SceneObject |

> 运行时播放时 `GenericAnimationPlayer` 会正确处理 pivot compensation + transformOrigin 的叠加。编辑器只需确保 `track.pivot` 值正确。

### 4.4 Gizmo 状态管理

```typescript
/** SimpleGizmo 交互状态机 */
type GizmoInteractionState = 
  | { type: 'idle' }
  | { type: 'translating', startX: number, startY: number, startKfX: number, startKfY: number }
  | { type: 'rotating', startAngle: number, startKfRotation: number, pivotGlobal: Point }
  | { type: 'scaling', startDistance: number, startKfScaleX: number, startKfScaleY: number,
      handleType: 'corner' | 'edge-h' | 'edge-v', pivotGlobal: Point }
  | { type: 'pivot-dragging', startPivotX: number, startPivotY: number }
```

### 4.5 Gizmo 数据流（与 useSceneRenderer 完全无关）

```
SimpleGizmo (独立画布内)
  │
  ├── pointerdown → 判断 hit 区域 → 进入交互状态
  ├── pointermove → 计算 delta → 更新关键帧数据 + 更新容器 transform + 更新面板数值
  └── pointerup  → 提交关键帧（Auto-Key ON → commit; OFF → restore）
         │
         ▼
  useAnimationEdit composable (独立数据)
    ├── keyframe.x/y/scaleX/scaleY/rotation
    ├── AnimationTrackEvaluator.evaluateTransform()  ← 纯函数，零依赖
    └── 保存 → animationStore.updateAnimation()
```

**关键区别**：整个 Gizmo 交互链完全在 AnimationWorkbench 内部闭环，不涉及 `sceneObjectStore`、`useInteraction`、`InteractionCallbacks` 中的任何代码。
---

## 5. 核心：关键帧画布可视化与自动记录

### 5.1 关键帧画布预览

**需求：** 选中某个关键帧时，独立画布上的对象立即显示该关键帧的变换状态。

**行为定义：**

```
用户操作                    画布反应
────────────────────        ──────────────────────────────────
点击关键帧 0% (起始帧)  →   对象显示在 {x:0, y:0, scale:1, rot:0} 状态
点击关键帧 50%          →   对象显示在该帧记录的 {x:80, y:-30, scale:1.2, rot:π/4} 状态
点击关键帧 100% (末帧)  →   对象显示在末帧记录的变换状态
拖拽播放头到任意位置    →   AnimationTrackEvaluator.evaluate() 计算插值，对象显示中间态
```

**实现思路：**

`AnimationTrackEvaluator` 是纯函数（无 PIXI 依赖），可直接在独立画布中调用：

```typescript
function applyTimeToCanvas(time: number) {
  // 1. 用纯函数计算当前时间的变换输出（只需 track + 归一化进度，无需 duration）
  const output = AnimationTrackEvaluator.evaluateTransform(
    currentTrack, time
  )
  
  // 2. 直接应用到独立画布中的 PIXI 容器
  targetContainer.position.set(
    baseX + output.x,
    baseY + output.y
  )
  targetContainer.scale.set(
    baseScaleX * output.scaleX * (output.flipX ? -1 : 1),
    baseScaleY * output.scaleY
  )
  targetContainer.rotation = baseRotation + output.rotation
  
  // 3. 更新 Gizmo 位置
  simpleGizmo.updateFromContainer(targetContainer)
  
  // 4. 更新属性面板数值
  updatePropertyPanel(output)
}
```

**多轨道 / 多目标处理：**

一个 `AnimationDefinition` 可能包含多条 TransformTrack，分别指向不同子对象：

| 场景 | 独立画布中的处理 |
|------|------------------|
| 编辑 `targetObjectId: TARGET_SELF` 轨道 | Gizmo 附着在整个对象上 |
| 编辑 `targetObjectId: 'left_hand'` 轨道 | Gizmo 切换到 composite 中的 `left_hand` 子容器 |
| 切换编辑轨道 | 还原当前轨道预览 → 重建 Gizmo 附着到新轨道的目标容器 |

### 5.2 自动关键帧录制 (Auto-Key)

**需求：** 提供"自动录制"开关，开启后用户在画布上通过 Gizmo 操作对象，系统自动在当前播放头时间点创建或更新关键帧。

#### 5.2.1 UI 设计 — Auto-Key 开关

```
┌─ 动画编辑工具栏 ──────────────────────────────────────────────────────┐
│                                                                      │
│  [◀ 退出编辑]  │  ▶ ⏸  ⏮ ⏭  │  🔴 自动记录  │  ⏱ 00:00.500      │
│                │  播放 暂停    │  [ON] / OFF   │  当前时间           │
│                │  上帧 下帧    │               │                     │
└──────────────────────────────────────────────────────────────────────┘
```

**状态指示：**
- `Auto-Key ON` — 工具栏背景微红色(rgba(255,0,0,0.05))，录制按钮红色脉动动画
- `Auto-Key OFF` — 默认样式，画布操作仅为临时预览

#### 5.2.2 行为矩阵

| 操作 | Auto-Key ON | Auto-Key OFF |
|------|:----------:|:------------:|
| Gizmo 移动 | 自动创建/更新当前帧的 x, y | 仅画布预览，释放后复原 |
| Gizmo 旋转 | 自动创建/更新当前帧的 rotation | 仅画布预览，释放后复原 |
| Gizmo 缩放 | 自动创建/更新当前帧的 scaleX, scaleY | 仅画布预览，释放后复原 |
| 锚点拖拽 | 更新 track.pivot（不关联关键帧） | 更新 track.pivot（不关联关键帧） |
| 属性面板输入 | 始终更新当前帧对应属性 | 始终更新当前帧对应属性 |
| 播放头移动 | 画布显示插值状态 | 画布显示插值状态 |

#### 5.2.3 关键帧自动创建逻辑

```typescript
/**
 * @param finalKeyframeValues 关键帧空间的最终值（非增量）
 *   位移: keyframe.x = 拖拽后画布位置 - 基础位置
 *   缩放: keyframe.scaleX = 拖拽后画布缩放 / 基础缩放
 *   旋转: keyframe.rotation = 拖拽后画布旋转 - 基础旋转
 */
function onGizmoInteractionEnd(finalKeyframeValues: Partial<TransformKeyframe>) {
  if (!autoKeyEnabled.value) {
    restoreKeyframeState()
    return
  }
  
  const currentTime = playheadPosition.value  // 归一化 0-1
  const existingIndex = findKeyframeAtTime(track.keyframes, currentTime, tolerance = 0.01)
  
  if (existingIndex >= 0) {
    // 更新已有关键帧
    Object.assign(track.keyframes[existingIndex], finalKeyframeValues)
  } else {
    // 创建新关键帧 — 以当前插值状态为基础，覆盖被操作的属性
    const interpolated = AnimationTrackEvaluator.evaluateTransform(track, currentTime)
    const newKeyframe: TransformKeyframe = {
      time: currentTime,
      x: interpolated.x,
      y: interpolated.y,
      scaleX: interpolated.scaleX,
      scaleY: interpolated.scaleY,
      rotation: interpolated.rotation,
      ...finalKeyframeValues,
    }
    insertKeyframeSorted(track.keyframes, newKeyframe)
  }
  
  emitUpdate()
}
```

### 5.3 关键帧选择与画布联动

**交互流程：**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 底部时间轴                                                          │
│                                                                     │
│   ◆───────────────●────────────────●───────────────◆                │
│   0%    ▲        33%              66%             100%              │
│    [起始帧]    [播放头]         [关键帧]          [末帧]             │
│         │                         │                                 │
│         ▼                         ▼                                 │
│   ┌──────────┐              ┌──────────┐                            │
│   │ 评估插值  │ evaluate()   │ 直接显示  │  如果播放头恰好在关键帧上   │
│   │ (中间态)  │              │ (关键帧值) │                           │
│   └──────┬───┘              └──────┬───┘                            │
│          │                         │                                │
│          ▼                         ▼                                │
│   ┌──────────────────────────────────────┐                          │
│   │ 独立画布：对象显示对应变换状态        │                          │
│   │ Gizmo：手柄位置同步更新              │                          │
│   │ 面板：数值同步更新                   │                          │
│   └──────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 核心：AnimationWorkbench UI 布局

### 6.1 进入 AnimationWorkbench

**触发方式：**

```
任何编辑器
  └─ ObjectPropertiesPanel → "🎬 动画管理"
       └─ AnimationManagerDialog
            └─ AnimationManager → 点击 ✏️ 编辑按钮
                 └─ 打开 AnimationWorkbench（全屏叠加层）
```

| 入口编辑器 | 有底层画布？ | AnimationWorkbench 行为 |
|-----------|:-----------:|------------------------|
| SetupEditor | 是 | 覆盖在 SetupEditor 画布之上（不交互） |
| ActionEditor | 是 | 覆盖在 ActionEditor 画布之上（不交互） |
| CompositeCharacterEditor | 是 | 覆盖在 CompositeCharacterEditor 画布之上 |
| SceneTemplateEditor | 是 | 覆盖在 SceneTemplateEditor 画布之上 |
| PropEditorModal | 否 | 覆盖在 PropEditorModal 之上 |

> AnimationWorkbench 作为全屏 `position: fixed; z-index: 1100` 叠加层（高于 AnimationManagerDialog 的 z:1000），底层编辑器的画布和模式**完全不受影响**。

**进入时的数据准备：**

```typescript
interface AnimationWorkbenchProps {
  // 动画定义（深拷贝，编辑期间不影响原始数据）
  animation: AnimationDefinition
  // 对象信息（用于渲染）
  resourceType: 'prop' | 'background' | 'symbol' | 'composite'
  resourceId: string
  // 场景对象信息（可选，有则使用场景中的 transform 作为基础状态）
  sceneObjectId?: string
  // composite 子对象映射（可选）
  availableParts?: { id: string, name: string }[]
}
```

### 6.2 整体布局

```
┌─ AnimationWorkbench (全屏叠加层 z:1100) ────────────────────────────────┐
│ ┌─ 工具栏 ────────────────────────────────────────────────────────────┐ │
│ │ [◀ 退出] │ 动画: idle │ ▶ ⏸ ⏮ ⏭ │ 🔴 Auto-Key │ ⏱ 00:00.500 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┬─────────────────────────────┐ │
│ │                                       │  关键帧属性面板             │ │
│ │     LightweightCanvas (独立 PIXI)     │  ┌───────────────────────┐  │ │
│ │                                       │  │ 时间: [50] %          │  │ │
│ │       ╭──── ■ ──── ■ ────╮           │  │ X偏移: [80] px        │  │ │
│ │       │                  │           │  │ Y偏移: [-30] px       │  │ │
│ │       ■       ⊕         ■           │  │ 缩放X: [120] %        │  │ │
│ │       │   (SimpleGizmo)  │           │  │ 缩放Y: [120] %        │  │ │
│ │       ╰──── ■ ──── ■ ────╯           │  │ 旋转:  [45] °         │  │ │
│ │                                       │  │ ☐ 水平翻转            │  │ │
│ │  (浅灰背景 #e8eaee + 棋盘格)              │  │                       │  │ │
│ │                                       │  │ ── 轨道设置 ──        │  │ │
│ │                                       │  │ 时长: [1000] ms       │  │ │
│ │                                       │  │ 缓动: [easeInOut ▾]  │  │ │
│ │                                       │  │ 锚点X: [50] %        │  │ │
│ │                                       │  │ 锚点Y: [50] %        │  │ │
│ │                                       │  └───────────────────────┘  │ │
│ ├───────────────────────────────────────┴─────────────────────────────┤ │
│ │ ┌─ AnimationTimeline ───────────────────────────────────────────┐   │ │
│ │ │ 轨道     │ 0%     25%     50%      75%     100%               │   │ │
│ │ │──────────┼────────────────────────────────────────             │   │ │
│ │ │ ► 变换   │ ◆──────────────●──────────────────◆                │   │ │
│ │ │   ├ X    │ ◇──────────────○──────────────────◇                │   │ │
│ │ │   ├ Y    │ ◇──────────────○──────────────────◇                │   │ │
│ │ │   ├ 缩放 │ ◆─────────────────────────────────◆                │   │ │
│ │ │   └ 旋转 │ ◆──────────────●──────────────────◆                │   │ │
│ │ │          │         ▲                                          │   │ │
│ │ │          │      [播放头]                                      │   │ │
│ │ ├──────────┴────────────────────────────────────────────────────┤   │ │
│ │ │ ⏮  ▶/⏸  ⏭  │  ⏱ 500ms / 1000ms  │ 🔴 Auto-Key │ 🔄 Loop  │   │ │
│ │ └──────────────────────────────────────────────────────────────┘   │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                    [取消]  [保存]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 退出 AnimationWorkbench

**触发方式：**
- 点击 "◀ 退出" 按钮
- 点击 "取消" 按钮
- 按 ESC 键
- 如有未保存修改，弹出确认对话框：`"动画已修改，是否保存？" [放弃] [保存并退出]`

**退出时行为：**
1. 销毁独立 PIXI.Application（释放 GPU 资源）
2. 保存/放弃动画数据（`emit('save', animationDefinition)` 或 `emit('close')`）
3. AnimationWorkbench 叠加层关闭
4. 控制权回到 AnimationManagerDialog → 底层编辑器状态**完全未改变**

---

## 7. 核心：AnimationTimeline（底部时间轴）

### 7.1 整体设计

AnimationWorkbench 底部的关键帧时间轴（内嵌在 AnimationWorkbench 内，非独立面板）。

```
┌─ AnimationTimeline ─────────────────────────────────────────────────────┐
│ ┌─ 轨道头 ───┬─ 时间线区域 ─────────────────────────────────────────┐  │
│ │            │  0ms      250ms     500ms     750ms     1000ms       │  │
│ │            │  │         │         │         │         │           │  │
│ │  ► 位置    │  ◆─────────────────────────────●────────◆            │  │
│ │    ├ X     │  ◇─────────────────────────────○────────◇            │  │
│ │    └ Y     │  ◇─────────────────────────────○────────◇            │  │
│ │  ► 缩放    │  ◆────────────────────────────────────────◆          │  │
│ │    ├ X     │  ◇────────────────────────────────────────◇          │  │
│ │    └ Y     │  ◇────────────────────────────────────────◇          │  │
│ │  ► 旋转    │  ◆─────────────────────────────●────────◆            │  │
│ │    翻转    │  ◆                                      ◆            │  │
│ │            │           ▲                                          │  │
│ │            │        [播放头]                                      │  │
│ └────────────┴──────────────────────────────────────────────────────┘  │
│                                                                        │
│ ┌─ 播放控制 ────────────────────────────────────────────────────────┐  │
│ │ ⏮  ▶/⏸  ⏭  │  ⏱ 500ms / 1000ms  │  🔴 Auto-Key [ON]  │ 🔄 Loop │  │
│ └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 时间轴元素定义

| 元素 | 视觉 | 交互 |
|------|------|------|
| **播放头** | 红色三角 ▼ + 垂直红线 | 拖拽 → Scrub 预览（画布实时更新插值状态） |
| **关键帧菱形** (◆) | 彩色实心菱形(属性组级别) | 点击选中 → 属性面板更新 → 画布跳到该帧状态 |
| **子属性关键帧** (◇) | 灰色小菱形(展开后可见) | 点击选中 → 编辑单属性值 |
| **属性组行** | 可折叠 ► 标签 | 点击 ► 展开/收起子属性行 |
| **时间刻度尺** | 顶部毫秒刻度 | 点击 → 播放头跳到该时间点 |
| **关键帧连接线** | 属性行上的浅色水平线 | 指示关键帧之间的插值区间 |

### 7.3 关键帧操作

#### 7.3.1 添加关键帧

| 方式 | 操作 |
|------|------|
| 右键菜单 | 在时间线空白区域右键 → "在此处添加关键帧" |
| 快捷键 | K 键 → 在播放头位置添加关键帧(基于当前插值状态) |
| Auto-Key | Gizmo 操作自动在播放头位置创建(见 §5.2) |
| 点击空行 | 双击属性行的时间位置 → 在该 time 添加关键帧 |

#### 7.3.2 编辑关键帧

> 关键帧数组在编辑态必须始终保持按 `time` 排序（Hard Constraint）。`AnimationTrackEvaluator.findKeyframes()` 假设输入数组已按 `time` 升序排列。如果编辑期间允许乱序，则 Scrub/预览插值会取到错误的前后帧，导致画布闪跳。

**排序策略：**

| 操作 | 排序时机 |
|------|----------|
| 拖拽关键帧修改 `time` | `pointerup` 时立即重排 |
| 属性面板修改 `time` 数值 | `input` 事件去抖后立即重排 |
| Auto-Key 创建新帧 | 插入时即保持有序（`insertKeyframeSorted()`） |
| 复制粘贴关键帧 | 粘贴后立即重排 |

| 操作 | 时间轴内行为 |
|------|-------------|
| **拖拽关键帧** | 水平拖拽 → 修改 `keyframe.time` → 松开时立即重排 → 画布实时更新 |
| **多选** | Shift + 点击多个关键帧 → 批量移动/删除 |
| **框选** | 在时间线区域拖拽矩形 → 选中范围内所有关键帧 |
| **删除** | 选中关键帧 → Delete 键（保留最少 2 帧约束） |
| **复制** | Ctrl+C / Ctrl+V → 复制关键帧到播放头位置 |

#### 7.3.3 Scrub 预览

```
拖拽播放头:
                     
  时间轴: ◆─────▲───────────●──────────◆
                 │                      
                 ▼                      
  AnimationTrackEvaluator.evaluateTransform(track, time)
                 │                      
                 ▼                      
  独立画布: 对象实时显示插值状态      
  面板: 数值实时显示插值结果 (只读灰色样式)
```

**性能优化：**
- `requestAnimationFrame` 节流，避免高频 pointermove 导致卡顿
- 仅评估当前编辑的 track，跳过无关轨道

### 7.4 播放控制

| 按钮 | 功能 | 快捷键 |
|------|------|--------|
| ▶ / ⏸ | 播放/暂停 | Space |
| ⏮ | 跳到上一关键帧 | ← |
| ⏭ | 跳到下一关键帧 | → |
| ⏮⏮ | 跳到起始帧 | Home |
| ⏭⏭ | 跳到末尾帧 | End |

**播放行为：**
- 使用 `AnimationPlayer`（无 PIXI 依赖）：`play()` → `requestAnimationFrame` 循环 → `seek(progress)` → `getCurrentOutput()` → 应用到独立画布容器
- 播放头在时间轴上同步移动
- 到达末帧：如 `loop=true` 则循环，否则自动暂停
- Gizmo 在播放中隐藏，暂停后重新显示

### 7.5 时间轴渲染实现

使用 HTML Canvas（非 PixiJS）渲染时间轴，因为：
- 时间轴是 DOM 面板，不在独立 PIXI Stage 内
- 需与属性面板 Vue 组件联动
- 拖拽关键帧的精度控制更方便

```vue
<!-- AnimationTimeline.vue 核心结构 -->
<template>
  <div class="animation-timeline">
    <canvas ref="rulerCanvas" class="timeline-ruler" />
    <div class="track-rows">
      <div v-for="prop in displayProperties" :key="prop.key" class="track-row">
        <div class="row-label">{{ prop.label }}</div>
        <canvas :ref="el => propCanvases[prop.key] = el" class="row-canvas" />
      </div>
    </div>
    <div class="playhead" :style="{ left: playheadX + 'px' }"
         @pointerdown="startScrub" />
    <div class="playback-controls">
      <button @click="skipPrev">⏮</button>
      <button @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
      <button @click="skipNext">⏭</button>
      <span class="time-display">{{ formatTime(currentTimeMs) }}</span>
      <button :class="{ active: autoKey }" @click="toggleAutoKey">🔴 自动记录</button>
    </div>
  </div>
</template>
```

---

## 8. 核心：KeyframePropertyPanel (右侧属性面板)

### 8.1 面板设计

```
┌─ 关键帧属性 ─────────────────────────┐
│                                       │
│  ┌─ 当前帧 ─────────────────────────┐ │
│  │ 帧 #3 / 5    时间: [66.0] %     │ │
│  │ ⏮ ⏭  跳到上一帧 / 下一帧        │ │
│  └──────────────────────────────────┘ │
│                                       │
│  ┌─ 变换 ───────────────────────────┐ │
│  │                                   │ │
│  │  位移    X  [  80 ] px           │ │
│  │          Y  [ -30 ] px           │ │
│  │                                   │ │
│  │  缩放    X  [ 120 ] %   🔗       │ │
│  │          Y  [ 120 ] %            │ │
│  │                    (🔗=等比锁定)  │ │
│  │                                   │ │
│  │  旋转       [  45 ] °            │ │
│  │                                   │ │
│  │  ☐ 水平翻转 (flipX)              │ │
│  │                                   │ │
│  └──────────────────────────────────┘ │
│                                       │
│  ┌─ 轨道设置 ───────────────────────┐ │
│  │                                   │ │
│  │  时长   ○ 固定 [1000] ms         │ │
│  │         ● 自动                   │ │
│  │                                   │ │
│  │  缓动   [ easeInOutCubic  ▾ ]   │ │
│  │         ╭────────────────╮       │ │
│  │         │   ╱──────╮     │  预览  │ │
│  │         │ ╱        │     │  曲线  │ │
│  │         ╰──────────╯─────╯       │ │
│  │                                   │ │
│  │  锚点   X [50] %  Y [50] %      │ │
│  │         [画布上拖拽锚点]          │ │
│  │                                   │ │
│  └──────────────────────────────────┘ │
│                                       │
│  ┌─ 快捷操作 ───────────────────────┐ │
│  │ [+帧] [删除帧] [复制帧] [重置帧] │ │
│  └──────────────────────────────────┘ │
│                                       │
└───────────────────────────────────────┘
```

### 8.2 关键交互点

**数值输入与画布双向绑定：**

| 方向 | 触发 | 行为 |
|------|------|------|
| 面板 → 画布 | 用户修改面板数值 | 立即更新独立画布上对象变换 + Gizmo 位置 |
| 画布 → 面板 | 用户通过 Gizmo 拖拽 | 立即更新面板数值(实时，非仅 mouseup) |
| 时间轴 → 面板 | 选中关键帧/拖拽播放头 | 面板显示该帧/插值的属性值 |

**缩放等比锁定 🔗：**
- 默认开启(🔗 链接态)
- 修改 scaleX 时自动同步 scaleY，保持比例
- 点击 🔗 解除关联 → 可独立设置 scaleX / scaleY

---

## 9. 增强：AnimationEditorModal 内嵌预览

### 9.1 功能概述

在现有 `AnimationEditorModal`（表单编辑器）中增加**内嵌预览**功能，让用户无需打开 AnimationWorkbench 即可实时预览动画效果。这是一个**轻量级增强**，对现有表单编辑流程影响极小。

### 9.2 可行性分析

| 条件 | 状态 |
|------|------|
| `AnimationTrackEvaluator` 是纯函数（无 PIXI 依赖） | ✅ 直接调用 |
| `AnimationPlayer` 可独立运行（`play()` → `seek()` → `getCurrentOutput()`） | ✅ 零 PIXI 依赖 |
| 对象缩略图已有先例（`SceneObjectAnchorCanvas` 用于 pivot 预览） | ✅ 可参考 |
| 编辑时所有数据（tracks, keyframes, easing）都在 `formData` 中 | ✅ 完整可用 |

### 9.3 预览方式：CSS Transform

最轻量的预览方案——用 CSS `transform` 驱动对象缩略图的变换：

```
┌─ AnimationEditorModal ──────────────────────────────────────────────┐
│ ┌──────────────┬────────────────────────────────────────────────┐   │
│ │              │  变换轨道                                      │   │
│ │   🎬 预览    │  ...（现有表单字段不变）...                     │   │
│ │  ┌────────┐  │                                                │   │
│ │  │  ╱╲    │  │  ┌─ 预览控制 ──────────────────────────────┐  │   │
│ │  │ ╱  ╲   │  │  │ ▶/⏸  │ ──────●──────── │ 50%  │ 🔄    │  │   │
│ │  │╱ obj ╲ │  │  │       │   [进度滑块]    │      │ Loop  │  │   │
│ │  │       │  │  └────────────────────────────────────────────┘  │   │
│ │  └────────┘  │                                                │   │
│ │  (CSS变换驱动) │                                               │   │
│ │              │                                                │   │
│ └──────────────┴────────────────────────────────────────────────┘   │
│                                          [取消]  [WYSIWYG 编辑] [保存] │
└─────────────────────────────────────────────────────────────────────┘
```

**实现（~150 行新增组件 `AnimationPreviewPlayer.vue`）：**

```typescript
// 纯计算，零 PIXI 依赖
function updatePreview(progress: number) {
  const output = AnimationTrackEvaluator.evaluateTransform(
    currentTrack, progress
  )
  
  // 用 CSS 变换驱动缩略图（含 flipX 镜像）
  const flipScale = output.flipX ? -1 : 1
  thumbnailStyle.value = {
    transform: `translate(${output.x}px, ${output.y}px) 
                scale(${output.scaleX * flipScale}, ${output.scaleY}) 
                rotate(${output.rotation}rad)`,
    transformOrigin: `${pivotX}% ${pivotY}%`,
  }
}

// Scrub：拖拽进度滑块
function onScrub(progress: number) {
  playheadPosition.value = progress
  updatePreview(progress)
}

// 自动播放：requestAnimationFrame 循环
function play() {
  const player = new AnimationPlayer()
  player.play(animationDefinition)
  
  function tick() {
    if (!isPlaying.value) return
    player.update(deltaTime)
    updatePreview(player.progress)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
```

**缩略图来源**：
- 场景级对象：从 `sceneObjectStore.getObject(id)` 获取纹理 URL → `<img>` 标签
- 资源级对象：从 `propStore.getProp(refId)` 获取纹理 URL → `<img>` 标签
- 已有先例：`SceneObjectAnchorCanvas` 已用类似模式渲染对象缩略图

### 9.4 预览控制元素

| 元素 | 行为 |
|------|------|
| ▶ / ⏸ 按钮 | 播放/暂停预览动画 |
| 进度滑块 | 拖拽 Scrub，实时预览任意时间点 |
| 百分比显示 | 当前进度 (0%-100%) |
| 🔄 Loop 开关 | 循环播放（使用动画定义的 `loop` 属性默认值） |

### 9.5 与 AnimationWorkbench 的关系

| | AnimationPreviewPlayer (§9) | AnimationWorkbench (§2-8) |
|---|---|---|
| **位置** | 嵌在 AnimationEditorModal 内 | 独立全屏叠加层 |
| **渲染** | CSS transform + `<img>` 缩略图 | 独立 PIXI.Application |
| **交互** | 仅 Scrub/播放预览 | Gizmo 拖拽编辑 + 时间轴 + 属性面板 |
| **编辑能力** | 无（只读预览） | 完整 WYSIWYG 编辑 |
| **改动量** | ~150 行新增 | ~1200 行新增 |
| **入口** | 直接在现有表单中可用 | AnimationManager "✏️ 编辑" 按钮 |

> AnimationEditorModal 新增 "WYSIWYG 编辑" 按钮，可一键跳转到 AnimationWorkbench。

---

## 10. 增强：缓动函数完整暴露

### 10.1 当前差距

`EasingType` 定义了 21 种缓动，但 `TransformTrackEditor` 的 `<select>` 仅有 2 个选项：

```html
<!-- 当前 -->
<select v-model="localTrack.easing">
  <option value="linear">线性</option>
  <option value="step">阶跃 - 无插值</option>
</select>
```

### 10.2 完整缓动预设列表

| 分组 | 选项 | 中文名 | 适用场景 |
|------|------|--------|---------|
| 基础 | `linear` | 线性(匀速) | 机械运动、匀速滚动 |
| 基础 | `step` | 阶跃(不插值) | 瞬间切换、帧动画对齐 |
| 常用 | `easeIn` | 缓入(慢→快) | 物体开始运动 |
| 常用 | `easeOut` | 缓出(快→慢) | 物体到达终点 |
| 常用 | `easeInOut` | 缓入缓出 | 自然运动(最常用) |
| Quad | `easeInQuad`~`easeInOutQuad` | 二次缓动 | 轻微加速/减速 |
| Cubic | `easeInCubic`~`easeInOutCubic` | 三次缓动 | 明显加速/减速 |
| Sine | `easeInSine`~`easeInOutSine` | 正弦缓动 | 最轻柔的过渡 |
| 弹性 | `easeInElastic`~`easeInOutElastic` | 弹性缓动 | 弹簧/果冻效果 |
| 弹跳 | `easeInBounce`~`easeInOutBounce` | 弹跳缓动 | 球落地弹跳 |

### 10.3 缓动选择器 UI

```
┌─ EasingPicker ─────────────────────────────────────┐
│   ┌─ 缩略曲线预览 ──────────────────────┐           │
│   │        ╱──────                       │           │
│   │      ╱            当前: easeInOut    │           │
│   │    ╱                                 │           │
│   └─────────────────────────────────────┘           │
│                                                     │
│   ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                   │
│   │╱  │ │ ╱ │ │╱╲ │ │╱╲ │ │___│  ← 分组缩略图      │
│   └───┘ └───┘ └───┘ └───┘ └───┘                    │
│  linear easeIn easeOut easeInOut step                │
│                                                     │
│   ▸ Quad (3)  ▸ Cubic (3)  ▸ Sine (3)             │
│   ▸ Elastic (3)  ▸ Bounce (3)                      │
└─────────────────────────────────────────────────────┘
```

**每个缓动按钮**：40×30px 缩略图(SVG 曲线)，悬浮时展示放大预览 + tooltip。

> **缓动粒度**：当前 `easing` 定义在 `TransformTrack` 级别（`animation.ts` L100），整条轨道共用一个缓动。关键帧级别独立缓动保持为当前限制。

---

## 11. 可视化：运动路径可视化 (Motion Path)

### 11.1 视觉设计

```
独立画布上:

    ☆ (关键帧0: 起点)
     ╲
      ╲   ← 运动路径线 (2px, 青色半透明虚线)
       ╲
        ● (关键帧1: time=0.5, 拐点)  ← 可拖拽
       ╱ ╲
      ╱    ╲
     ╱      ╲
    ★ (关键帧2: 终点)

关键帧标记:
  - 圆点 ●  直径 8px, 白色填充+青色描边
  - 当前选中帧: 12px, 蓝色填充
  - 起点/终点: 与中间帧相同但略大 (10px)
```

---

## 12. v5.0 变更：多轨道动画工作台

> v5.0 对 AnimationWorkbench 进行架构升级，从"仅支持 TransformTrack"扩展为支持全部 4 种轨道类型，
> 时间轴从"按属性分行"改为 Adobe Animate 风格的"按轨道分行"范式，属性面板支持三态动态切换。

### 12.1 v5.0 变更摘要

| 编号 | 变更 | 优先级 |
|:----:|------|:------:|
| NR-1 | 删除工具栏中的循环复选框（时间轴已有） | 增强 |
| NR-2 | 时间轴循环控件显示 "循环" 文本 | 增强 |
| NR-3 | 时间轴改为轨道行模式（一行一条 Track） | 增强 |
| NR-4 | 移除底部轨道 Tab 切换按钮 | 增强 |
| NR-5 | 时间轴区域支持折叠和拖拽调节高度 | 增强 |
| NR-6 | 属性面板三态切换（动画级 / 轨道级 / 帧级） | 增强 |
| NR-7 | 支持全部 4 种轨道类型编辑 | 增强 |

### 12.2 工具栏精简

**v4.x 工具栏：**
```
[动画名称]    [☑ 循环]    [时间显示] │ [取消] [保存]
```

**v5.0 工具栏（删除循环控件 NR-1）：**
```
[动画名称]                [时间显示] │ [取消] [保存]
```

循环控件仅保留在时间轴播放控制栏中，避免重复。

### 12.3 时间轴重设计（NR-2, NR-3, NR-4, NR-5）

#### 12.3.1 轨道行模式

**v4.x**（按属性分 4 行，一条 TransformTrack 占 4 行）：
```
位移    ◆─────◆
缩放    ◆─────◆
旋转    ◆─────◆
翻转    ◆─────◆
```

**v5.0**（一行一条 Track）：
```
┌──────────┬───────────────────────────────────────────┐
│ 轨道头    │ 时间区域                                   │
├──────────┼───────────────────────────────────────────┤
│ 🔵 自身   │  ◆──────────◆────────────◆                │
│   变换    │                                           │
├──────────┼───────────────────────────────────────────┤
│ 🟢 自身   │  ◆───────────────────────◆                │
│   透明度  │                                           │
├──────────┼───────────────────────────────────────────┤
│ ⚪ 自身   │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬   │
│   帧序列  │                                           │
├──────────┼───────────────────────────────────────────┤
│ 🟣 自身   │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬   │
│ 特效:wave │                                           │
├──────────┼───────────────────────────────────────────┤
│ 🔵 部件1  │  ◆──────────◆───────────────────◆        │
│   变换    │                                           │
└──────────┴───────────────────────────────────────────┘
```

**轨道头（左侧 label）** 每行分两行文字：
- 第一行：目标对象图标 + 名称（`自身` 或 `部件 N`）
- 第二行：轨道类型标签

**轨道类型视觉规范：**

| trackType | 颜色 | 标签 | 关键帧显示 |
|---|---|---|---|
| `transform` | 🔵 蓝色 #3B82F6 | `变换` | ◆ 蓝色菱形（可交互） |
| `visibility` | 🟢 绿色 #22C55E | `透明度` | ◆ 绿色菱形（可交互） |
| `frame_sequence` | ⚪ 灰色 #9CA3AF | `帧序列` | ▬ 灰色整条色带（不可编辑时间） |
| `effect` | 🟣 紫色 #A855F7 | `特效:${type}` | ▬ 紫色整条色带（不可编辑时间） |

#### 12.3.2 轨道交互

| 操作 | 行为 |
|------|------|
| 点击轨道行 | 选中该轨道 → 属性面板显示轨道级属性 |
| 点击关键帧 ◆ | 选中该关键帧 → 属性面板显示帧级属性 |
| 拖拽关键帧 ◆ | 水平拖拽改变 time → Shift 吸附到 1% 网格 |
| 双击空白区域 | 在该时间点添加关键帧（仅 transform / visibility） |
| 右键轨道头 | 上下文菜单：删除轨道 |
| 点击空白区域 | 取消选中 → 属性面板显示动画级属性 |

#### 12.3.3 播放控制栏（NR-2）

```
[⏮] [▶/⏸] [⏭]  00:500/1000ms  50%           [🔄 循环]
```

循环控件从纯图标 `🔄` 改为带文字 `🔄 循环`。

#### 12.3.4 折叠与拖拽缩放（NR-5）

- **拖拽手柄**：时间轴面板顶部 4px 手柄条，鼠标 `row-resize` 光标
- **高度范围**：100px – 400px，默认 200px
- **折叠按钮**：控制栏右侧 `▼` 按钮，折叠后显示一行摘要 `🎬 N 条轨道 [▲]`

#### 12.3.5 移除底部轨道 Tab（NR-4）

v4.x 的底部 `track-selector` 按钮组完全删除。轨道切换改为直接点击时间轴行。

### 12.4 属性面板三态切换（NR-6）

属性面板根据选中状态动态显示不同内容：

#### 状态 A：无选中（动画级属性）

当无轨道/帧选中，或点击时间轴空白区域时：

```
┌─ 关键帧 ─────────────────────┐
│ --- 动画设置 ---               │
│ 循环: [☑]                     │
│ 填充模式: [none ▼]            │
│                               │
│ --- 轨道列表 ---               │
│ [+ 添加轨道 ▼]                │
│  · 🔵 变换 (自身)             │
│  · 🟢 透明度 (自身)           │
│  · 🟣 特效:wave (自身)        │
└───────────────────────────────┘
```

**添加轨道下拉菜单**：
- 变换轨道（指定目标：自身 / 各部件）
- 透明度轨道（指定目标）
- 帧序列轨道（指定目标 + 选择素材）
- 特效轨道（指定目标 + 选择特效类型）

#### 状态 B：选中轨道（轨道级属性）

点击时间轴的轨道行（非关键帧位置）时：

**TransformTrack：**
```
│ --- 轨道: 变换 ---            │
│ 目标: 自身                    │
│ 时长: ○ 固定 [1000] ms       │
│       ○ 自动                  │
│ 缓动: [线性 ▼]               │
│ 锚点: X [50]% Y [50]%        │
│ [删除轨道]                    │
```

**VisibilityTrack：**
```
│ --- 轨道: 透明度 ---          │
│ 目标: 自身                    │
│ 时长: ○ 固定 [1000] ms       │
│       ○ 自动                  │
│ 缓动: [线性 ▼]               │
│ [删除轨道]                    │
```

**FrameSequenceTrack：**
```
│ --- 轨道: 帧序列 ---          │
│ 目标: 自身                    │
│ 素材: [xxxx]                  │
│ 帧率: [25] fps                │
│ 循环: [☑]                     │
│ [删除轨道]                    │
```

**EffectTrack：**
```
│ --- 轨道: 特效 (wave) ---     │
│ 目标: 自身                    │
│ [特效类型特有参数]             │
│  速度: [1.0]                  │
│  幅度: [10]                   │
│  频率: [0.5]                  │
│  方向: [horizontal ▼]         │
│ [删除轨道]                    │
```

#### 状态 C：选中关键帧（帧级属性）

点击时间轴上的关键帧 ◆ 时：

**TransformKeyframe：**
```
│ --- 帧 3/5 ---                │
│ [⬅] [➡] │ [+] [⎘] [−]       │
│ 时间: [50] %                  │
│ --- 变换 ---                  │
│ 位移 X: [10] Y: [20]         │
│ 缩放 X: [100]% 🔗 Y: [100]% │
│ 旋转: [0] ° ☑ 翻转           │
│ [重置帧]                      │
```

**VisibilityKeyframe：**
```
│ --- 帧 2/3 ---                │
│ [⬅] [➡] │ [+] [⎘] [−]       │
│ 时间: [30] %                  │
│ 透明度: [0.5] (0-1)           │
│ [重置帧]                      │
```

### 12.5 useAnimationEdit 泛化（NR-7）

#### 12.5.1 选中状态机

```typescript
// 三态选中模型
type SelectionMode = 'none' | 'track' | 'keyframe'

const selectionMode = computed<SelectionMode>(() => {
    if (currentTrackIndex.value < 0) return 'none'
    if (selectedKeyframeIndex.value < 0) return 'track'
    return 'keyframe'
})
```

#### 12.5.2 新增 API

```typescript
// === 轨道列表（所有类型） ===
allTracks: Computed<{ track: AnimationTrack; index: number }[]>

// === 泛化的当前轨道 ===
currentTrackAny: Computed<AnimationTrack | null>

// === 轨道是否支持关键帧编辑 ===
isKeyframable: Computed<boolean>  // transform | visibility

// === Visibility 轨道操作 ===
evaluateVisibilityAtTime(time): VisibilityTrackOutput | null
addVisibilityKeyframeAtPlayhead(): number
updateVisibilityKeyframe(index, values: Partial<VisibilityKeyframe>): void
commitVisibilityAtPlayhead(values: Partial<VisibilityKeyframe>): void

// === 轨道 CRUD ===
addTrack(track: AnimationTrack): number
removeTrack(index: number): void

// === 选中轨道切换（不再限制 trackType） ===
selectTrack(index: number): void  // 支持任意 trackType
```

#### 12.5.3 数据流

```
时间轴点击轨道行 → selectTrack(i) → selectionMode = 'track'
                                     → 属性面板显示轨道设置
时间轴点击关键帧 → selectKeyframe(i) → selectionMode = 'keyframe'
                                       → 属性面板显示帧属性
时间轴点击空白   → deselect() → selectionMode = 'none'
                                → 属性面板显示动画级属性
画布 Gizmo 拖拽 → commitTransformAtPlayhead()
                  commitVisibilityAtPlayhead()
属性面板输入     → updateKeyframe() → evaluateAtTime() → 画布更新
播放             → rAF → playheadPosition++ → evaluateAtTime() → 画布更新
```

### 12.6 画布联动扩展

| 轨道类型 | 画布行为 |
|---|---|
| `transform` | Gizmo 可交互，拖拽自动录制关键帧（现有行为） |
| `visibility` | 画布显示当前 alpha 状态，属性面板编辑 alpha 值联动画布 |
| `frame_sequence` | 仅属性编辑（素材/帧率/循环），画布无 Gizmo 交互 |
| `effect` | 仅属性编辑（特效参数），画布可预览特效效果但无 Gizmo |

### 12.7 组件改造清单

| 组件 | 改造内容 |
|---|---|
| `AnimationWorkbench.vue` | 删除工具栏循环控件；时间轴加拖拽手柄/折叠 |
| `AnimationTimeline.vue` | 重写为轨道行模式；删除 PROPERTY_ROWS；删除底部 Tab；Canvas 绘制 N 行（N=tracks.length） |
| `KeyframePropertyPanel.vue` | 重命名为 `WorkbenchPropertyPanel.vue`；三态面板 |
| `useAnimationEdit.ts` | 泛化支持全部轨道；新增 visibility 操作；轨道 CRUD；selectionMode |
| `EasingPicker.vue` | 已精简为 linear/step，无需再改 |

### 11.2 路径交互

| 操作 | 行为 |
|------|------|
| 拖拽路径上的关键帧圆点 | 修改对应 `keyframe.x`、`keyframe.y`，实时更新路径线 |
| 点击路径上的关键帧圆点 | 选中该帧 → 时间轴 + 属性面板 + 画布同步高亮 |
| 悬浮路径线 | 显示该段的两端帧序号和时间 |

### 11.3 渲染层级（独立画布内部）

```
LightweightCanvas 内部层级:
  ┌──────────────────────────────────┐
  │ gizmoLayer (z: top)              │  ← SimpleGizmo
  ├──────────────────────────────────┤
  │ pathLayer (z: top-1)             │  ← 运动路径线 + 关键帧点
  ├──────────────────────────────────┤
  │ onionSkinLayer (z: top-2)        │  ← 洋葱皮帧 
  ├──────────────────────────────────┤
  │ contentLayer (z: normal)         │  ← 目标对象
  ├──────────────────────────────────┤
  │ backgroundLayer (z: bottom)      │  ← 棋盘格 / 深色背景
  └──────────────────────────────────┘
```

---

## 12. 可视化：洋葱皮 (Onion Skin)

### 12.1 显示规则

```
独立画布上:

    ┌─────┐          ┌─────┐          ┌─────┐
    │前一帧│          │当前帧│         │后一帧│
    │ 蓝色 │          │ 正常 │         │ 绿色 │
    │ 30%α │          │100%α│         │ 30%α│
    └─────┘          └─────┘          └─────┘
    kf[i-1]           kf[i]           kf[i+1]
```

| 设置项 | 默认值 | 范围 |
|--------|--------|------|
| 开启/关闭 | OFF | toggle |
| 前方帧数 | 1 | 0-3 |
| 后方帧数 | 1 | 0-3 |
| 前方颜色 | 蓝色(#2196F3) + alpha 0.3 | 可配 |
| 后方颜色 | 绿色(#4CAF50) + alpha 0.3 | 可配 |

### 12.2 实现

在独立画布的 `onionSkinLayer` 中：
1. 克隆目标对象容器 → 应用相邻关键帧的 `evaluateTransform()` 输出
2. 设置半透明 + 着色（PixiJS `ColorMatrixFilter` 或 `tint`）
3. 选中帧切换时重新计算

---

## 13. 快捷键定义

| 快捷键 | 功能 | 作用域 |
|--------|------|--------|
| Space | 播放/暂停 | AnimationWorkbench |
| K | 在播放头位置添加关键帧 | AnimationWorkbench |
| Delete | 删除选中关键帧 | 关键帧选中时 |
| ← / → | 跳到上一帧/下一帧 | AnimationWorkbench |
| Home / End | 跳到首帧/末帧 | AnimationWorkbench |
| Ctrl+C / Ctrl+V | 复制/粘贴关键帧 | 关键帧选中时 |
| Shift + 拖拽(移动) | 约束水平/垂直 | Gizmo 移动中 |
| Shift + 拖拽(旋转) | 15° 步进吸附 | Gizmo 旋转中 |
| Alt + 拖拽(缩放) | 从中心缩放 | Gizmo 缩放中 |
| ESC | 退出 AnimationWorkbench | AnimationWorkbench |
| R | 切换 Auto-Key 开关 | AnimationWorkbench |

---

## 14. 数据流总览

```
┌─ AnimationWorkbench 数据流 ────────────────────────────────────────────┐
│                                                                        │
│  SimpleGizmo 拖拽         属性面板输入           时间轴操作              │
│       │                      │                     │                   │
│       ▼                      ▼                     ▼                   │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │           useAnimationEdit (composable)                      │      │
│  │                                                              │      │
│  │  animationDef: AnimationDefinition (深拷贝, reactive)       │      │
│  │  currentTrack: TransformTrack                               │      │
│  │  selectedKeyframeIndex: number                              │      │
│  │  playheadPosition: number (0-1)                             │      │
│  │  autoKeyEnabled: boolean                                    │      │
│  │  isPlaying: boolean                                         │      │
│  │                                                              │      │
│  │  方法:                                                       │      │
│  │  - updateKeyframe(index, partial<TransformKeyframe>)        │      │
│  │  - addKeyframeAtPlayhead()                                  │      │
│  │  - removeKeyframe(index)                                    │      │
│  │  - evaluateAtTime(time) → TransformTrackOutput              │      │
│  │  - onGizmoChange(values) → auto-key 逻辑                   │      │
│  │  - play() / pause() / seekTo(time)                          │      │
│  └─────────────────────────┬────────────────────────────────────┘      │
│                             │                                          │
│              ┌──────────────┼──────────────┐                           │
│              ▼              ▼              ▼                            │
│     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│     │ LightweightCanvas │ 属性面板  │ │ 时间轴       │                │
│     │ 对象变换状态  │ │ 数值反映      │ │ 播放头位置   │                │
│     │ Gizmo 位置   │ │ 选中帧高亮    │ │ 关键帧标记   │                │
│     │ 运动路径     │ │              │ │              │                │
│     └──────────────┘ └──────────────┘ └──────────────┘                │
│                                                                        │
│  保存时:                                                                │
│  emit('save', animationDef) → AnimationManager → animationStore        │
│                                                                        │
│  ※ 入口时从 sceneObjectStore / compositeCharacterStore 只读深拷贝（§3.3.2）│
│  ※ 编辑期间对 sceneObjectStore 零写入                                    │
│  ※ 与 useSceneRenderer 零交互                                          │
│  ※ 与 useInteraction 零交互                                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 16. 兼容性与降级

| 场景 | 策略 |
|------|------|
| 用户不使用 AnimationWorkbench | 现有 AnimationEditorModal 表单编辑流程完全保留，不受影响 |
| 从 AnimationWorkbench 退出 | 底层编辑器（Setup/Action/Composite/Template）状态完全未改变 |
| 浏览器性能不足 | 运动路径和洋葱皮作为可开关选项，默认关闭 |
| Composite 子对象动画编辑 | Gizmo 聚焦 `targetObjectId` 对应的子容器 |
| 同时打开多个编辑路径 | 每个 AnimationWorkbench 使用独立 PIXI.Application，互不干扰 |

### 16.1 多轨道动画编辑策略

当前 `AnimationDefinition` 支持**多轨道**（一个动画包含多个 transform/visibility/effect track）。

| 场景 | 策略 |
|------|------|
| 同一动画有 2+ 个 transform track（不同 `targetObjectId`） | 时间轴左侧轨道列表按 targetObject 分组；选中轨道时 Gizmo 切换到对应子对象 |
| 有 visibility track | Phase 1 不支持画布交互编辑；属性面板中显示 alpha 滑块 |
| 有 effect track | Phase 1 不支持画布交互编辑；保留现有 EffectTrackEditor 表单 |
| 选择编辑轨道 | 时间轴中点击轨道行 → 该轨道进入编辑态；Gizmo 仅对当前 transform track 生效 |

### 16.2 缓动粒度限制

当前 `easing` 定义在 `TransformTrack` 级别（`animation.ts` L100），整个轨道共用一个缓动。

**当前版本约束：** 本 PRD 范围内仅支持 **track 级别缓动**。

### 16.3 现有代码改动影响总结

| 现有文件 | 改动内容 | 改动量 |
|----------|----------|:------:|
| `AnimationManager.vue` | "编辑"按钮增加 AnimationWorkbench 入口 | ~10 行 |
| `AnimationManagerDialog.vue` | 透传 AnimationWorkbench 事件 | ~5 行 |
| `AnimationEditorModal.vue`  | 嵌入 AnimationPreviewPlayer + "WYSIWYG 编辑"按钮 | ~20 行 |
| **任何 useSceneRenderer / useInteraction / ActionEditor / SetupEditor** | **无改动** | **0 行** |
