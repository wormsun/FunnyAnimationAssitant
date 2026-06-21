# 预定义动作系统 PRD（名称寻址版）

> **版本**: v6.0.0（重构）
> **创建日期**: 2026-04-24
> **状态**: 已实现并同步当前代码
> **取代**: 原 `ArticulatedCharacter_PRD.md`（Rig 机制）

---

## 1. 概述

### 1.1 背景

前代方案使用 `ArticulatedRig`（15 个固定绑定点 + `rigMapping` 映射）作为预定义动作的寻址协议。
其限制：
- 用户动作无法超出 15 个槽位表达其他部位；
- 角色编辑必须填 "部位设置" 面板，增加使用门槛；
- 模板表达能力与角色结构强耦合，用户自定义动作灵活性受限。

### 1.2 目标

**彻底废除 rig 机制**，改为以场景对象的 **`alias` / `name`** 作为预定义动作的寻址协议：

1. **零配置**：角色无需专门设置"部位映射"，alias / name 本身就是寻址标识
2. **灵活**：用户动作可以引用角色内任意子对象（只要有名称）
3. **检测保障**：对重名、缺失、非规范命名提供诊断与提示
4. **两级词表**：系统级推荐名（10 项人形部位）+ 用户级自定义名，互不阻塞

### 1.3 非目标

- 不改动动画运行时（`AnimationTrackEvaluator` / `GenericAnimationPlayer` / `useAnimationWorkbenchRenderer`）
- 不改 `AnimationTrack.targetObjectId` 语义（仍为场景对象 UUID 或 `_self`）
- 不改 `Keyframe / Track` 结构
- 不提供旧 Rig 数据迁移入口；当前公开代码中旧 Rig 类型与面板已清理
- 不引入 slot 概念

---

## 2. 寻址协议

### 2.1 核心契约

预定义动作模板用 **`targetName`（字符串）** 寻址轨道目标对象。
应用到具体角色实例时，解析器在角色根复合子树内以下列优先级查找：

1. **alias 精确匹配**（`sceneObject.alias === targetName`）
2. **name 精确匹配**（`sceneObject.name === targetName`）
3. **无命中** → 返回 `missing`
4. **多命中** → 返回 `ambiguous`（带候选列表）

作用域：始终限定在 "角色根复合对象子树" 内，不跨角色匹配。

### 2.2 系统推荐名词表

用于系统内置动作模板及 UI 提示：

```ts
export const RECOMMENDED_NAMES = [
  '身体', '头部',
  '左上臂', '左下臂',
  '右上臂', '右下臂',
  '左臂', '右臂',
  '左大腿', '左小腿',
  '右大腿', '右小腿',
  '左腿', '右腿',
] as const
```

（共 14 项，人形基础部位；**不含面部、手、脚**）

#### 2.2.1 语义回退关系

部分部位存在"粗细粒度"语义包含关系。解析器在精确命中失败时，按下表向粗粒度回退：

| 细粒度名称 | 回退至 |
|-----------|-------|
| 左上臂 / 左下臂 | 左臂 |
| 右上臂 / 右下臂 | 右臂 |
| 左大腿 / 左小腿 | 左腿 |
| 右大腿 / 右小腿 | 右腿 |

此回退仅用于"系统内置动作模板"寻址期望值；用户级模板的 `recommendedName` 不享受回退（因用户模板的名称来自项目内真实对象，不应跨粒度拼接）。回退行为通过模板字段 `ExpectedTarget.fallbackNames?: string[]` 显式声明。

### 2.3 用户级扩展

用户在工作台创建动作、点击"保存为预定义动作"时，系统扫描所有轨道 `targetObjectId`，把对应对象的 `alias`（回退 `name`）写入模板的 `expectedTargets[i].recommendedName`。
用户动作可以引用任意名称，不受系统词表限制。

---

## 3. 数据模型

### 3.1 模板协议（types/presetAnimation.ts）

```ts
export interface ExpectedTarget {
  /** 模板内稳定 key（不依赖名称改动） */
  key: string
  /** 推荐名（alias 或 name），解析器寻址用 */
  recommendedName: string
  /** 可选：名称回退序列，按顺序依次尝试（粗粒度回退） */
  fallbackNames?: string[]
  /** 可选：标注为辅助部位，缺失不阻塞应用 */
  optional?: boolean
  /** 可选：UI 提示 */
  hint?: string
}

export interface TargetTrackGroup {
  targetKey: string
  tracks: DistributiveOmit<AnimationTrack, 'targetObjectId'>[]
}

export interface PresetAnimationTemplate {
  id: string
  name: string
  description?: string
  tags?: string[]
  category: PresetAnimationCategory
  thumbnailUrl?: string
  origin: 'system' | 'user'

  expectedTargets: ExpectedTarget[]
  targetTracks: TargetTrackGroup[]

  loop: boolean
  fillMode?: 'none' | 'forwards'
  duration?: number
}
```

### 3.2 CompositeCharacter / CompositeObject 变更

- **删除** `CompositeCharacter.rigMapping`
- **删除** `CompositeObject.instanceRigMapping`
- **删除** `CompositeObject.instanceRootCompositeId` 继续保留（作为实例级 root 引用，其他场合仍需要）

### 3.3 场景对象字段

无新增。现有 `SceneObject.alias`（命名空间内唯一）+ `SceneObject.name`（显示）即是协议字段。

---

## 4. 解析器（utils/presetAnimationMapper.ts）

```ts
export interface ResolveResult {
  status: 'unique' | 'missing' | 'ambiguous'
  objectId?: string
  candidates?: string[]
}

export function resolveTargetByName(
  name: string,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): ResolveResult

export interface InstantiationDiagnostics {
  unique: Array<{ targetKey: string; objectId: string; recommendedName: string }>
  missing: Array<{ targetKey: string; recommendedName: string; optional: boolean }>
  ambiguous: Array<{ targetKey: string; recommendedName: string; candidates: string[] }>
}

export function canApplyPreset(
  template: PresetAnimationTemplate,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
): InstantiationDiagnostics

export function instantiatePresetAnimation(
  template: PresetAnimationTemplate,
  rootCompositeId: string,
  sceneObjects: Map<string, SceneObject>,
  /** 用户手动指定的 targetKey → objectId 覆盖（处理 missing / ambiguous） */
  overrides?: Record<string, string>,
): { animation: TrackAnimationDefinition; diagnostics: InstantiationDiagnostics }
```

应用前由 UI 调用 `canApplyPreset` 取诊断，若存在 `missing`（非 optional）或 `ambiguous`，弹出"匹配预览对话框"让用户覆盖或跳过。

---

## 5. 命名检测（utils/namingDiagnostics.ts）

- **D1 重复 alias**：同一角色根子树中存在同 alias 的多个对象
- **D2 缺推荐名**：推荐名词表中的项在角色内无对应 alias/name
- **D3 非规范命名**：对象 alias/name 与某推荐名"相似但不等"（编辑距离 ≤ 1 或含子串关系）
- **D4 改名影响**：重命名某对象时，遍历所有预定义动作，列出受影响模板

阈值：编辑距离 ≤ 1 或子串关系视为"相似"。

---

## 6. UI 变更

### 6.1 角色编辑器
- 当前使用 `src/components/character-editor/NamingCheckPanel.vue` 展示 D1/D2/D3 诊断，支持一键填入推荐名。
- 旧 Rig 映射面板已不在当前仓库中保留。

### 6.2 动画工作台
- `AnimationListPanel.vue`：应用预定义动作前弹出"匹配预览对话框"：展示 unique / missing / ambiguous，允许用户为 missing/ambiguous 指定对象
- `trackDisplay.ts`：移除 rig 标签相关显示
- `AnimationWorkbench.vue`：`buildTargetHierarchy` 去除 rig 前缀
- **新增** "保存为预定义动作" 按钮：调用 `projectStore.addCustomPreset`

---

## 7. 当前清理结果

旧 `ArticulatedRig`、`rigMapping`、`requiredRigs`、`rigTracks`、`instanceRigMapping` 相关类型、测试和 UI 面板已从当前公开代码中移除。当前实现以 `src/types/presetAnimation.ts`、`src/utils/presetAnimationMapper.ts`、`src/utils/namingDiagnostics.ts` 和 `src/presetAnimationCatalog.ts` 为准。

---

## 8. 验证

1. 单测 `resolveTargetByName` 四分支（unique / missing / ambiguous / alias 优先）
2. 默认角色应用系统内置 "走路"/"挥手" → 全部 unique 命中
3. 删除角色 "左臂" 对象 → 应用对话框弹出缺失提示
4. 创建两个 alias 均为 "头部" 的对象 → 编辑器 D1 警告
5. 工作台创建动作 → "保存为预定义动作" → 重启后可应用
6. 代码库 grep 确认旧 Rig 协议关键字已从实现路径消除

---

## 9. 范围边界

**包含**：模板协议、解析器、系统动作目录、命名检测、角色编辑面板替换、应用对话框、导出向导、旧代码清理

**排除**（显式）：动画运行时、`targetObjectId` 语义、`Keyframe / Track` 结构、slot 概念、数据迁移
