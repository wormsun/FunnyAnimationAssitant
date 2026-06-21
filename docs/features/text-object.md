# TextObject PRD — 文本对象功能需求定义

> 版本: v1.3.1  
> 日期: 2026-04-12  
> 状态: 已评审  
> 参考: 主流软件 (Unity TextMeshPro, Godot RichTextLabel, After Effects Text Animator, Figma, Canva) 及 FunnyAnimationAssistant 现有架构模式 (LightObject, ScreenEffectObject, SymbolObject)

---

## 1. 背景与目标

### 1.1 产品定位

FunnyAnimationAssistant 是一个 2D 场景动画/剧本编辑器，TextObject（文本对象）的主要使用场景包括：

| 场景 | 示例 |
|------|------|
| **标题字幕** | 章节标题、片头片尾文字 |
| **信息叠加** | 地点、时间、旁白说明 |
| **装饰文字** | 漫画风拟声词、感叹词（如 "轰！"、"嘿嘿"） |
| **对话气泡** | 与 PropObject 背景组合成 Composite（SceneTemplate PRD 已规划） |
| **画中画标注** | 场景内标签、箭头注释 |
| **字幕/台词叠加** | 固定在相机视口底部的字幕条 |

### 1.2 设计原则

1. **遵循既有架构模式** — 参照 LightObject / ScreenEffectObject 的实现模式（数据模型 + 序列化器 + Action Handler + 渲染管线分支），确保一致性
2. **PIXI.js 可行性优先** — 所有特性必须在 PIXI.js v7 TextStyle API 范围内可实现（或通过 Filter 辅助）
3. **能力闭环** — 覆盖基础编辑、视觉样式和动画能力
4. **简洁数据模型** — 参考 Figma 的文本属性设计，避免过度复杂的 rich text 混排（FunnyAnimationAssistant 不是排版工具）

---

## 2. 竞品特性分析摘要

### 2.1 各平台文本特性矩阵

| 特性类别 | Unity TMP | Godot | After Effects | Figma | Canva | **FunnyAnimationAssistant 优先级** |
|----------|-----------|-------|---------------|-------|-------|-------------------|
| 字体族 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 字号 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 颜色 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 对齐 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 粗体/斜体 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 文本描边 | ✅ (SDF) | ✅ | ✅ | ✅ | ✅ | **视觉增强** |
| 投影 | ✅ | ✅ | ✅ | ✅ | ✅ | **视觉增强** |
| 行距/字距 | ✅ | ✅ | ✅ | ✅ | 基础 | **视觉增强** |
| 自动换行 | ✅ | ✅ | ✅ | ✅ | ✅ | **基础** |
| 文本框模式 | — | — | ✅ | ✅ (3种) | 基础 | **视觉增强** |
| **竖排文字** | ✅ | ✅ | ✅ | — | — | **视觉增强** |
| 渐变填充 | ✅ | ✅ | ✅ | ✅ | ✅ | **动画增强** |
| 逐字动画 | ✅ (Animator) | ✅ (Effect) | ✅ (Animator) | — | — | **动画增强** |
| 打字机效果 | 自定义 | 内置 | 预设 | — | — | **动画增强** |

### 2.2 关键结论

- **基础能力**: 基础排版属性（字体、字号、颜色、对齐、粗体/斜体、自动换行）+ 双击编辑 + 完整的创建→编辑→保存→预览→导出闭环
- **高频视觉需求**: 描边、投影、行距/字距、文本框模式、**竖排文字** — 几乎所有标题和装饰文字都需要
- **动画能力**: 逐字显示/打字机效果 — FunnyAnimationAssistant 作为动画工具的核心差异化

---

## 3. 数据模型定义

### 3.1 TextObject 接口 

```typescript
export interface TextObject extends SceneObjectBase {
  type: 'text'

  // === Phase 0: 基础属性 ===
  content: string                          // 文本内容（支持 \n 换行）
  fontSize: number                         // 字号（px），默认 32
  fontFamily: string                       // 字体族，默认 'Noto Sans SC'（见 3.2 字体列表）
  fontWeight: 'normal' | 'bold'            // 字重，默认 'normal'
  fontStyle: 'normal' | 'italic'           // 字体风格，默认 'normal'
  color: string                            // 填充颜色（hex），默认 '#ffffff'
  align: 'left' | 'center' | 'right'      // 水平对齐，默认 'center'

  // 自动换行
  wordWrap: boolean                        // 是否启用自动换行，默认 true
  wordWrapWidth: number                    // 换行宽度（px），默认 400

  // === Phase 1: 视觉增强 ===
  // 描边
  stroke?: string                          // 描边颜色（hex），undefined=无描边
  strokeThickness?: number                 // 描边粗细（px），默认 0

  // 投影
  dropShadow?: boolean                     // 是否启用投影，默认 false
  dropShadowColor?: string                 // 投影颜色，默认 '#000000'
  dropShadowBlur?: number                  // 投影模糊，默认 4
  dropShadowAngle?: number                 // 投影角度（弧度），默认 Math.PI/4
  dropShadowDistance?: number              // 投影距离，默认 4

  // 间距
  lineHeight?: number                      // 行高（px），undefined=自动
  letterSpacing?: number                   // 字距（px），默认 0

  // 文本框模式 (参考 Figma)
  textBoxMode?: 'auto-width' | 'auto-height' | 'fixed'  // 默认 'auto-height'
  // auto-width: 宽度随内容增长，不自动换行（单行模式，忽略 wordWrap）
  // auto-height: 宽度固定（= wordWrapWidth），高度随内容增长
  // fixed: 宽高都固定，溢出裁切

  // 书写方向 (Phase 1)
  writingMode?: 'horizontal' | 'vertical'  // 默认 'horizontal'
  // horizontal: 从左到右、从上到下（默认）
  // vertical: 从上到下、从右到左（CJK 竖排）

  // === 动画增强 ===
  // revealMode?: 'none' | 'typewriter'    // 逐字显示模式
  // revealSpeed?: number                  // 逐字显示速度 (chars/sec)
}
```

### 3.2 预置字体列表

FunnyAnimationAssistant 面向中文用户，预置字体选型遵循以下原则：
- 优先选择允许公开发布和分发、嵌入、打包和再分发的开源字体
- 优先选择中文覆盖完整、社区成熟、来源稳定的字体项目
- 上线前逐个核验字体许可证、版权声明、Reserved Font Name（如适用）及 Webfont 分发条件
- 所有预置字体的许可证文本、版权声明和来源链接必须随项目一并留档

| 分类 | 字体族 | 许可类型 | 备注 |
|------|--------|----------|------|
| **默认黑体** | `Noto Sans SC` (思源黑体) | SIL OFL | 默认首选，适合 UI / 标题 / 正文，7种字重 |
| **宋体** | `Noto Serif SC` (思源宋体) | SIL OFL | 正式感较强，适合传统/正式内容 |
| **手写楷体** | `LXGW WenKai` (霞鹜文楷) | SIL OFL | 文艺/内容型场景，清秀手写感 |
| **活泼标题** | `ZCOOL QingKe HuangYou` (站酷庆科黄油体) | SIL OFL | 适合装饰性标题，手写风格 |
| **毛笔书法** | `Ma Shan Zheng` (马善政毛笔楷体) | SIL OFL | 仅建议短标题使用，毛笔书法风格 |

> 用户可输入自定义 `fontFamily`。Phase 0/1 仅使用当前设备本地已安装的字体进行渲染，不保证跨设备一致性，也不进入平台托管、切片或再分发链路。**用户需自行确保所使用的自定义字体具备相应的使用授权**（包括但不限于发布、视频嵌入等场景）。

### 3.3 默认字体选择：Noto Sans SC

选择 `Noto Sans SC`（思源黑体）作为默认字体，理由如下：

| 维度 | Noto Sans SC | Arial |
|------|-------------|-------|
| **中文支持** | ✅ 完整覆盖 GB18030，7万+字符 | ❌ 无中文字形，回退到系统默认 |
| **跨平台一致性** | ✅ 开源字体，所有平台渲染一致 | ⚠️ 各系统内置版本可能不同 |
| **字重丰富度** | ✅ 7种字重 (Thin~Black) | ⚠️ 仅 Regular/Bold |
| **版权与分发** | ✅ 许可宽松，适合发布使用、嵌入和随产品分发；需保留许可证文本 | ⚠️ 系统内置字体通常不适合作为可控的产品分发资产 |
| **视频导出** | ✅ Web Font 可控加载 | ⚠️ 依赖运行环境内置 |
| **设计品质** | ✅ Google+Adobe 专业级 | 一般 |

### 3.4 字体加载策略

#### 3.4.1 核心方案：cn-font-split + 自托管部署

不依赖 Google Fonts 或第三方 CDN。所有预置字体在完成许可证核验后，通过 [cn-font-split](https://github.com/nicepkg/cn-font-split) 分片，直接部署在网站服务器上，与主站同域、同生命周期。若使用 cn-font-split 或其他子集化工具生成 Webfont，需视为字体分发链路的一部分，保留对应许可证文本，并逐个确认是否存在命名或修改后的再分发限制。

**工作原理：**

```
构建阶段 (one-time):
  原始字体 (.ttf/.otf, ~15MB/个)
    ↓ cn-font-split
  分片文件 (~200个 .woff2, ~70KB/个, 总计~5MB/个字体)
  + result.css (包含所有 @font-face + unicode-range 声明)
    ↓ 放入 public/fonts/（连同 OFL.txt 许可证文件）
  随网站一起部署

运行时:
  用户输入 "你好世界"
    ↓ 浏览器通过 unicode-range 自动判断
  只下载包含这 4 个字的分片 (~70KB)
    ↓ 强缓存 (max-age=31536000)
  回访用户零流量
```

#### 3.4.2 部署结构

```
public/
└── fonts/
    ├── noto-sans-sc/           ← 默认字体
    │   ├── OFL.txt               ← 许可证文本（必须保留）
    │   ├── result.css            ← @font-face 声明（含 unicode-range）
    │   ├── chunk-xxxxx.woff2    ← 字体分片
    │   └── ...
    ├── noto-serif-sc/
    ├── lxgw-wenkai/
    ├── zcool-qingke-huangyou/
    └── ma-shan-zheng/
```

#### 3.4.3 加载机制

```css
/* 默认字体在全局 CSS 中引入 */
@import url('/fonts/noto-sans-sc/result.css');

/* 其他字体按需动态加载：用户选择某字体时，动态插入对应的 <link> 标签 */
```

| 加载时机 | 字体 | 方式 |
|----------|------|------|
| **页面初始化** | Noto Sans SC (默认) | 全局 CSS `@import`，始终可用 |
| **用户切换字体** | 其他预置字体 | 动态插入 `<link href="/fonts/xxx/result.css">`，加载后刷新渲染 |
| **视频导出前** | 场景中所有用到的字体 | 预加载确保字体完整可用（`document.fonts.ready`） |
| **用户自定义字体** | 任意 fontFamily | 仅限当前设备本地已安装字体，不进入平台分发链路 |

#### 3.4.4 流量估算

| 用户规模 | 单次访问字体流量 | 月总流量（无缓存） | 实际流量（有缓存） |
|----------|----------------|----------------|----------------|
| 100 人/天 | ~200 KB | ~600 MB | ~60-120 MB |
| 1,000 人/天 | ~200 KB | ~6 GB | ~0.6-1.2 GB |
| 10,000 人/天 | ~200 KB | ~60 GB | ~6-12 GB |

> 字体分片文件名含 hash，设置永久缓存 (`Cache-Control: max-age=31536000, immutable`)，回访用户零流量。实际流量约为无缓存估算的 1/5 ~ 1/10。

#### 3.4.6 字体合规要求

**预置字体合规清单：**

所有预置字体必须记录以下信息，并随项目留档：

| 字体族 | 版权声明 | 许可证 | RFN 状态 | 来源 |
|--------|---------|--------|---------|------|
| Noto Sans SC | Copyright 2014-2021 Adobe | SIL OFL 1.1 | ❌ 无 RFN | [notofonts/noto-cjk](https://github.com/googlefonts/noto-cjk) |
| Noto Serif SC | Copyright 2017 Adobe | SIL OFL 1.1 | ❌ 无 RFN | [notofonts/noto-cjk](https://github.com/googlefonts/noto-cjk) |
| LXGW WenKai | Copyright 2021-2026 LXGW | SIL OFL 1.1 | ❌ 无 RFN | [lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai) |
| ZCOOL QingKe HuangYou | Copyright 2018 The ZCOOL QingKe HuangYou Project Authors | SIL OFL 1.1 | ❌ 无 RFN | [googlefonts/zcool-qingke-huangyou](https://github.com/googlefonts/zcool-qingke-huangyou) |
| Ma Shan Zheng | Copyright 2018 The Ma Shan Zheng Project Authors | SIL OFL 1.1 | ❌ 无 RFN | [googlefonts/mashanzheng](https://github.com/googlefonts/mashanzheng) |

> 以上 5 种字体的 OFL.txt 均未在版权声明后声明 Reserved Font Name，因此 cn-font-split 切片后可继续使用原字体名称分发。核验日期：2026-04-12。

**合规操作要求：**

- 每个字体的切片目录下必须包含原始 `OFL.txt` 许可证文件
- 字体文件、切片产物、生成的 `result.css` 均纳入同一套版权留档
- 产品发布时须在站点或应用内提供「第三方字体许可证说明」页面，列出所有预置字体的名称、版权持有者和许可证类型
- 若未来新增预置字体，必须在加入前核验：许可证类型、RFN 状态、是否允许子集化后以原名分发
- 自定义字体（用户输入的 fontFamily）不进入服务端存储、切片、CDN 分发或共享导出链路

### 3.5 默认值表

| 字段 | 默认值 | 说明 |
|------|--------|------|
| content | `'文本'` | 占位内容 |
| fontSize | `32` | 适中大小 |
| fontFamily | `'Noto Sans SC'` | 中文默认（见 3.3 理由） |
| fontWeight | `'normal'` | — |
| fontStyle | `'normal'` | — |
| color | `'#ffffff'` | 白色（深色背景常用） |
| align | `'center'` | — |
| wordWrap | `true` | — |
| wordWrapWidth | `400` | — |
| textBoxMode | `'auto-height'` | 参考 Figma 默认 |
| writingMode | `'horizontal'` | 横排（默认） |
| width | `400` | 初始宽度 |
| height | `100` | 初始高度（会随内容自动更新） |
| zIndex | `Z_INDEX_TEXT` | 文本层（高于道具、低于相机） |

---

## 4. 功能需求

### 4.1 基础闭环

> 目标：实现 **创建 → 编辑 → 保存 → 预览播放 → 视频导出** 的完整闭环

#### 4.1.1 Setup Mode — 创建与编辑

**FR-0.1 添加文本对象**
- 在 SetupEditor 左侧工具栏添加「文本」按钮（图标：**T**）
- 点击后在画布中心创建一个默认 TextObject
- 自动选中新创建的对象，进入编辑状态

**FR-0.2 属性面板 — 基础属性编辑**

在 ObjectPropertiesPanel 中，当选中的对象类型为 `text` 时，显示文本专属属性编辑区域：

| 控件类型 | 属性 | UI 描述 |
|----------|------|---------|
| 多行文本框 | `content` | 支持换行的 textarea，实时预览 |
| 下拉列表 | `fontFamily` | 预置字体列表（含预览），支持输入自定义（仅限本地字体） |
| 数字滑块 | `fontSize` | 范围 8~200，步长 1 |
| 切换按钮组 | `fontWeight` | Normal / **B** |
| 切换按钮组 | `fontStyle` | Normal / *I* |
| 颜色选择器 | `color` | 与现有颜色选择器复用 |
| 三按钮组 | `align` | ≡左 / ≡中 / ≡右 |
| 开关 | `wordWrap` | — |
| 数字输入 | `wordWrapWidth` | 仅 wordWrap=true 时显示 |

**FR-0.3 画布交互**
- 文本对象在画布上显示实际渲染效果（PIXI.Text）
- 支持拖动定位、选择框选中、变换手柄（缩放/旋转）
- **双击进入内联文本编辑模式**（Phase 0 必须实现）

**FR-0.3.1 双击编辑模式**
- 双击文本对象进入内联文本编辑状态
- 实现方式：在文本对象位置叠加一个 DOM `<textarea>` 元素
  - textarea 的位置/大小/字体/颜色与 PIXI.Text 对齐
  - 期间隐藏 PIXI.Text，显示 textarea
  - 支持多行编辑、选择、复制/粘贴
- 退出条件：点击 textarea 外部区域 或 按 Escape
- 退出时将 textarea 内容回写到 TextObject.content 并恢复 PIXI.Text 显示
- 进入编辑模式时隐藏变换手柄，退出后恢复

**FR-0.4 文本内容实时同步**
- `updateObjectContainer` 中新增 text 类型处理分支
- 当 `content`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `color`, `align`, `wordWrap`, `wordWrapWidth` 任一属性变化时，同步更新 PIXI.Text 的 text 和 style
- 更新后自动重算容器尺寸并回写 `width`/`height` 到 Store

#### 4.1.2 序列化/持久化

**FR-0.5 文本序列化器**
- 新建 `textSerializer.ts`，注册到 `registerAll.ts`
- `serializeFields`: 序列化 `content`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `color`, `align`, `wordWrap`, `wordWrapWidth`
- `deserialize`: 调用 `createTextObject` 重建对象，通过 `updateObject` 回写所有子类型字段

**FR-0.6 DeserializeContext 扩展**
- 在 `DeserializeContext` 接口中添加 `createTextObject` 方法声明

#### 4.1.3 运行时渲染

**FR-0.7 renderPipeline — text 分支**
- 在 `renderObject()` 的 switch 中添加 `case 'text'`
- 通过 `SceneObjectRenderer` 创建文本容器（或直接创建 PIXI.Text）
- 调用 `applyBasicTransform` 应用位置/缩放/旋转
- 创建 `GenericAnimationPlayer` 以支持 `tween_transform` 动画

**FR-0.8 SceneObjectRenderer — 文本容器创建**
- 新增 `createTextContainer(obj: SceneObject): PIXI.Container` 方法
- 根据 TextObject 所有文本属性构建完整的 PIXI.TextStyle
- 创建 PIXI.Text 实例并设置 name = `'text_content'`

#### 4.1.4 Action Mode — 基础集成

**FR-0.9 通用变换动作支持**
- TextObject 作为普通 SceneObject，自动支持：
  - `set_transform` / `tween_transform`（位置/缩放/旋转/透明度）
  - `set_visual`（visible/flipX/zIndex）
  - `set_lifecycle`（spawn/despawn）
  - `set_parent`（加入/脱离 Composite）
- 无需额外开发，已有 Handler 通用适用

**FR-0.10 文本专属动作 — set_text**
- 新增 ActionType: `'set_text'`
- 新增 ActionHandler: `SetTextHandler`
- 用于在 Action Mode 中瞬时修改文本属性：

```typescript
export interface SetTextParams {
  content?: string            // 修改文本内容
  fontSize?: number           // 修改字号
  fontFamily?: string         // 修改字体族
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  color?: string              // 修改颜色
  align?: 'left' | 'center' | 'right'
}

export interface SetTextAction extends BaseAction {
  type: 'set_text'
  category: 'point'
  params: SetTextParams
}
```

- `applyToState`: 将 params 合并到 WriteableState（遵循 SetScreenEffectHandler 模式）

#### 4.1.5 合规 — 字体许可证说明

**FR-0.11 第三方字体许可证说明页**
- 在产品内提供可访问的「第三方字体许可证说明」页面（可为独立路由或设置/关于弹窗内的子页面）
- 页面内容包括：所有预置字体的名称、版权持有者、许可证类型（SIL OFL 1.1）、官方来源链接
- 数据来源：从 `public/fonts/` 各目录下的 `OFL.txt` 或静态 JSON 配置文件读取
- **此需求为 Phase 0 上线的阻塞项**
- 当用户选择非预置字体时，在 fontFamily 下拉框或属性面板中显示非阻断性提示：「自定义字体需用户自行确保使用授权」

---

### 4.2 视觉增强

> 目标：提供专业级文本视觉效果，让文本对象具备"标题"和"装饰"能力

#### 4.2.1 描边与投影

**FR-1.1 描边属性编辑**
- 属性面板新增「描边」分栏
- 颜色选择器 + 粗细滑块（0~20px）
- PIXI.TextStyle.stroke + strokeThickness 映射

**FR-1.2 投影属性编辑**
- 属性面板新增「投影」分栏
- 开关 + 颜色 + 模糊 + 角度 + 距离
- PIXI.TextStyle.dropShadow* 映射

#### 4.2.2 间距控制

**FR-1.3 行距与字距**
- 属性面板新增行距（lineHeight）和字距（letterSpacing）数字输入
- PIXI.TextStyle.lineHeight + letterSpacing 映射

#### 4.2.3 文本框模式

**FR-1.4 三种文本框模式**
- 属性面板新增下拉选择：自动宽度 / 自动高度 / 固定
- `auto-width`: 禁用 wordWrap，宽度跟随内容
- `auto-height`: 启用 wordWrap，高度跟随内容
- `fixed`: 启用 wordWrap，溢出裁切（通过 PIXI mask 实现）

#### 4.2.4 竖排文字

**FR-1.5 竖排书写方向**
- TextObject 新增 `writingMode: 'horizontal' | 'vertical'`，默认 `'horizontal'`
- 属性面板新增「书写方向」切换按钮组：横排 / 竖排

**实现方案：逐字排列法（Character-by-Character Positioning）**

PIXI.js 不原生支持竖排文字。采用逐字排列方案，将 PIXI.Text 替换为自定义容器：

1. 将 `content` 拆分为单个字符数组
2. 每个字符创建独立的 PIXI.Text 实例
3. 字符依次沿 Y 轴排列，列间沿 X 轴反向排列（从右到左）
4. 标点符号处理：CJK 标点（。，！？）在竖排时旋转 90° 或使用竖排字形
5. 换行处理：当字符数超过容器高度时，自动折列到左侧新列

```
竖排渲染示例:

原文: "你好世界！"   渲染结果:
                    ┌───┐
                    │ 你 │
                    │ 好 │
                    │ 世 │
                    │ 界 │
                    │ ！ │
                    └───┘
```

**技术约束:**
- CJK 字符天然等宽，逐字排列效果良好
- 混排 Latin 字母时需旋转 90°（或保持横排，短单词整体旋转）
- 性能：单个文本对象通常不超过几十个字符，逐字排列的开销可忽略

#### 4.2.5 文本动作增强

**FR-1.6 tween_text — 渐变文本属性**
- 新增 ActionType: `'tween_text'`
- 支持颜色渐变（color 从 A 过渡到 B）
- 支持字号渐变（fontSize 从 A 过渡到 B）
- 遵循 TweenScreenEffectHandler 的插值模式

```typescript
export interface TweenTextParams {
  color?: string          // 目标颜色
  fontSize?: number       // 目标字号
  letterSpacing?: number  // 目标字距
  strokeThickness?: number // 目标描边粗细
}

export interface TweenTextAction extends BaseDurationAction {
  type: 'tween_text'
  params: TweenTextParams
}
```

#### 4.2.6 序列化扩展

**FR-1.7 扩展序列化字段**
- textSerializer 追加序列化 Phase 1 所有新增字段（含 writingMode）
- 反序列化时对缺失字段使用默认值（向后兼容）

---

### 4.3 动画能力

> 目标：提供 FunnyAnimationAssistant 作为动画工具的差异化文本动画能力

#### 4.3.1 打字机效果

**FR-2.1 逐字显示（Typewriter）**
- TextObject 新增 `revealMode: 'none' | 'typewriter'`
- `revealSpeed: number` (chars/sec)，默认 20
- 运行时通过 `ScenePlayer` / `FrameCapture` 按时间进度截取 `content.substring(0, visibleCharCount)`
- Action Mode 中通过 set_text 的 `revealMode` 参数控制

#### 4.3.2 渐变填充

**FR-2.3 渐变色填充**
- 当前支持线性渐变。
- 数据模型: `fillType?: 'linear_gradient'`，未设置时使用 `color` 纯色。
- 渐变定义: `gradientStops: { offset: number, color: string }[]`，并通过 `gradientAngle` 控制方向。

---

## 5. 架构适配点

### 5.1 当前实现文件清单

#### 基础能力

| 路径 | 状态 | 说明 |
|------|------|------|
| `types/sceneObject.ts` | 已实现 | 扩展 TextObject 接口（添加 fontWeight、fontStyle、wordWrap 等新字段） |
| `types/screenplay.ts` | 已实现 | 新增 SetTextAction、SetTextParams、ActionType 联合 |
| `stores/sceneObjectStore.ts` | 已实现 | 更新 createTextObject 签名和默认值 |
| `core/sceneObjectProviders/serialization/textSerializer.ts` | 已实现 | 文本序列化器 |
| `core/sceneObjectProviders/serialization/registerAll.ts` | 已实现 | 注册 textSerializer |
| `core/sceneObjectProviders/serialization/index.ts` | 已实现 | DeserializeContext 添加 createTextObject |
| `utils/actionHandlers/handlers/SetTextHandler.ts` | 已实现 | set_text 动作处理器 |
| `utils/actionHandlers/registry.ts` (或等效) | 已实现 | 注册 SetTextHandler |
| `core/renderPipeline.ts` | 已实现 | renderObject 添加 case 'text' |
| `core/SceneObjectRenderer.ts` | 已实现 | 添加 createTextContainer |
| `composables/useSceneGraph.ts` | 已实现 | updateObjectContainer 添加 text 分支 |
| `components/ObjectPropertiesPanel.vue` | 已实现 | 文本属性编辑 UI |
| `components/SetupEditor.vue` | 已实现 | 添加「文本」创建按钮 |
| `src/views/AboutPage.vue` | 已实现 | 第三方字体许可证说明页 |
| `public/fonts/font-licenses.json` | 已实现 | 预置字体许可证元数据（名称、版权、类型、来源） |

#### 视觉增强

| 路径 | 状态 | 说明 |
|------|------|------|
| `types/sceneObject.ts` | 已实现 | TextObject 追加 stroke/shadow/spacing 字段 |
| `types/screenplay.ts` | 已实现 | 新增 TweenTextAction |
| `utils/actionHandlers/handlers/TweenTextHandler.ts` | 已实现 | tween_text 动作处理器 |
| `components/ObjectPropertiesPanel.vue` | 已实现 | 描边/投影/间距 UI |
| 序列化器 / 渲染管线 | 已实现 | 同步新字段 |

### 5.2 PIXI.TextStyle 映射表

| TextObject 字段 | PIXI.TextStyle 属性 | 说明 |
|-----------------|---------------------|------|
| fontFamily | fontFamily | 直接映射 |
| fontSize | fontSize | 直接映射 |
| fontWeight | fontWeight | 'normal' \| 'bold' |
| fontStyle | fontStyle | 'normal' \| 'italic' |
| color | fill | hex string |
| align | align | 'left' \| 'center' \| 'right' |
| wordWrap | wordWrap | boolean |
| wordWrapWidth | wordWrapWidth | number |
| stroke | stroke | hex string |
| strokeThickness | strokeThickness | number |
| dropShadow | dropShadow | boolean |
| dropShadowColor | dropShadowColor | hex string |
| dropShadowBlur | dropShadowBlur | number |
| dropShadowAngle | dropShadowAngle | radians |
| dropShadowDistance | dropShadowDistance | number |
| lineHeight | lineHeight | number |
| letterSpacing | letterSpacing | number |
| writingMode | *(自定义渲染)* | 竖排时不使用 PIXI.Text，改用逐字排列 |

### 5.3 与现有系统的集成

| 已有系统 | 集成方式 | 备注 |
|----------|----------|------|
| **变换系统** | 零改动 — text 走通用 applyTransform 分支 | pivot 使用 localBounds 中心 |
| **动画系统** | Phase 0 创建 GenericAnimationPlayer | 支持 tween_transform |
| **Composite 系统** | 零改动 — text 可作为 Composite 子对象 | 对话气泡 = TextObject + PropObject 背景 |
| **光照系统** | 已集成 — supportsReceiveLightingControl 已含 text | 支持 receiveLighting 开关 |
| **渲染链系统** | 零改动 — text 作为普通对象参与 renderChain | — |
| **复制/删除** | 零改动 — 通用浅复制足够（无子对象、无外部资源） | — |
| **别名系统** | 已集成 — InstanceAliasDialog 已含 text 类型映射 | — |

---

## 6. UI 设计指引

### 6.1 属性面板布局

```
┌─ 文本属性 ─────────────────────────────┐
│                                         │
│  内容:                                   │
│  ┌─────────────────────────────────────┐│
│  │ 文本内容多行输入框                    ││
│  │ (textarea, 3-5行)                    ││
│  └─────────────────────────────────────┘│
│                                         │
│  字体: [Noto Sans SC     ▾]             │
│  字号: [32___] px    [B] [I]            │
│  颜色: [■ #ffffff]                      │
│  对齐: [≡左] [≡中·] [≡右]                │
│                                         │
│  ─── 换行设置 ───                        │
│  自动换行: [✓]                           │
│  换行宽度: [400___] px                   │
│  文本框模式: [自动高度  ▾]                │
│                                         │
├─ 描边 (Phase 1) ────────────────────────┤
│  启用: [·]                              │
│  颜色: [■ #000000]   粗细: [0___] px    │
│                                         │
├─ 投影 (Phase 1) ────────────────────────┤
│  启用: [·]                              │
│  颜色: [■ #000000]   模糊: [4__]        │
│  角度: [45__]°       距离: [4__] px     │
│                                         │
├─ 间距 (Phase 1) ────────────────────────┤
│  行距: [自动__]   字距: [0___]           │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 SetupEditor 工具栏

在左侧竖向工具栏中，按照现有按钮排列顺序，在合适位置添加：

```
[📷 相机]
[🖼️ 背景]
[🎭 角色]  
[🔧 道具]
[🔤 文本]    ← 新增
[💡 灯光]
[✨ 特效]
```

---

## 7. 边界约束与风险

### 7.1 明确不做 (Out of Scope)

| 功能 | 原因 |
|------|------|
| **富文本混排** (单对象内混合颜色/字号) | PIXI.Text 不支持内联 tag；需 PIXI HTMLText 插件，复杂度高 |
| **曲线文字** (沿路径排列) | PIXI 不原生支持，需自定义渲染，ROI 低 |
| **文字蒙版** (图片填充文字) | 需 AlphaFilter + RenderTexture，复杂度高 |
| **自定义字体上传** | 涉及服务端存储/切片/再分发，字体版权合规设计复杂度高，ROI 低；不纳入当前规划 |

### 7.2 技术风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **字体加载延迟** | 低 | 自托管部署，与网站同域，无跨域延迟；cn-font-split 分片按需加载，单次仅 ~70KB |
| **PIXI.Text 大字号性能** | 低 | PIXI.Text 使用 Canvas2D 绘制，单个文本对象不构成瓶颈 |
| **CJK 字体包体积** | 低 | cn-font-split 将字体拆为 ~70KB 分片，浏览器通过 unicode-range 按需加载；强缓存后回访零流量 |
| **视频导出字体一致性** | 低 | 导出前通过 `document.fonts.ready` 确保字体完整加载；自托管无第三方依赖 |
| **部署包体积增大** | 低 | 5种字体分片后总计 ~25-35MB，为静态文件不参与构建，不影响构建速度 |

### 7.3 合规风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **预置字体许可证遗漏** | 低 | 已逐个核验并留档（见 §3.4.6 合规清单）；每个切片目录附带 OFL.txt |
| **预置字体 RFN 命名冲突** | 低 | 已核验全部 5 种字体均无 Reserved Font Name 声明；新增字体时需重新核验 |
| **用户自定义字体侵权** | 中 | Phase 0/1 仅支持本地已安装字体的本地渲染与本地导出；平台不接收、不存储、不分发该类字体文件。UI 展示免责提示；相关授权责任由用户承担 |
| **字体许可证说明页维护** | 低 | 当前由 `src/views/AboutPage.vue` 加载 `/fonts/font-licenses.json` 与许可证文本 |

---

## 附录 A: 与 ScriptBlock.text 的区别

| 维度 | ScriptBlock.text | TextObject.content |
|------|------------------|--------------------|
| 定位 | 剧本对白/旁白文本 | 场景画布上的可视文字元素 |
| 渲染位置 | 字幕条 (DOM overlay) | 画布内 (PIXI) |
| 交互 | 剧本编辑器内编辑 | Setup/Action 编辑器内编辑 |
| 导出 | 字幕轨道 | 画面内容 |
| 典型用途 | 角色台词 | 标题、标注、装饰 |

两者完全独立，互不影响。
