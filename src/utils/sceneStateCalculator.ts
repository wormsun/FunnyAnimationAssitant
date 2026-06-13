/**
 * 鍦烘櫙鐘舵€佽绠楀櫒
 * 鐢ㄤ簬瀵兼垙妯″紡鐨勮繍琛屾椂鐘舵€佸洖婧?
 * 
 * v6.3 鏇存柊锛?
 * - set_transform 浠呭鐞嗚瑙夊睘鎬?(alpha, visible, flipX, zIndex)
 * - set_character 缁ф壙 set_transform + 瑙掕壊鐘舵€?(pose, expression)
 * - tween_transform 浠呭鐞嗗嚑浣曞睘鎬?(x, y, scaleX, scaleY, rotation)
 */

import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import type { Action, BaseDurationAction, GroupSceneStructureOperation, RuntimeSceneSnapshot, SceneContainer, SceneSetup, ScriptBlock, SetSceneStructureAction } from '@/types/screenplay'
import { createRuntimeSnapshot, SCENE_ACTION_TARGET } from '@/types/screenplay'
import { type ActionType, getHandler, isObjectStateAction } from '@/utils/actionHandlers'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'
import { getSceneStructureSpawnedTargetsForSlot, hasCustomActionOrderForSlot, isSceneStructureSpawnedTargetTransform, sortActionsForEvaluation } from '@/utils/actionOrder'
import { getChildIdsByParentId, rebuildChildIdsFromParentIds } from '@/utils/hierarchyUtils'
import { isAllowedMaskTargetType } from '@/utils/maskUtils'
import { buildParentOverridesForSlot, sortObjectsBySlotActionOrder, sortObjectsForEvaluation } from '@/utils/objectEvaluationOrder'
import { reconcileRenderChain } from '@/utils/renderChainUtils'
import { applySetSceneStructureActionToObjects, flattenSetSceneStructureParams } from '@/utils/setSceneStructureAction'
import { parseBlockToSlots } from '@/utils/slotUtils'

// ==================== Ghost Mode Types ====================

/**
 * 杩愯鏃剁浉鏈虹姸鎬?(鐢ㄤ簬 Ghost Mode)
 */
export interface RuntimeCameraState {
  x: number
  y: number
  zoom: number
}

/**
 * 鍗曚釜瀵硅薄鐨勫菇鐏?瀹炰綋鐘舵€佸
 */
export interface GhostStateResult {
  ghost: SceneObject | null  // null 琛ㄧず鏃犻渶鏄剧ず骞界伒
  real: SceneObject
}

/**
 * 鐩告満鐨勫菇鐏?瀹炰綋鐘舵€佸
 */
export interface CameraGhostStateResult {
  ghost: RuntimeCameraState | null  // null 琛ㄧず鏃犻渶鏄剧ず骞界伒
  real: RuntimeCameraState
}

/**
 * 鏁翠釜 Slot 鐨勭姸鎬佽绠楃粨鏋?
 */
export interface SlotStatesResult {
  objects: Map<string, GhostStateResult>
  camera: CameraGhostStateResult
  /** runtime 鍦烘櫙绾ф覆鏌撻摼锛堢粡 reconcileRenderChain 鍗忚皟鍚庯級 */
  renderChain: string[]
}

/**
 * 璁＄畻鎸囧畾 Block 寮€濮嬪墠鐨勫満鏅繍琛屾椂蹇収锛坧revContext锛?
 * @param scene 鍦烘櫙瀹瑰櫒
 * @param blockId 褰撳墠 Block 鐨?ID
 * @returns 涓婁竴 Block 缁撴潫鏃剁殑 RuntimeSceneSnapshot
 */
export function calculatePrevContext(scene: SceneContainer, blockId: string): RuntimeSceneSnapshot {
  // 鏌ユ壘褰撳墠 Block 鐨勭储寮?
  const blockIndex = scene.script.findIndex(b => b.id === blockId)

  // 濡傛灉鎵句笉鍒版垨杩欐槸绗竴涓?Block锛岀洿鎺ヤ粠 setup 鍒涘缓 snapshot
  if (blockIndex <= 0) {
    const snapshot = createRuntimeSnapshot(scene.setup)
    return snapshot
  }

  // 浠庡満鏅?setup 寮€濮嬶紝閫愪釜搴旂敤涔嬪墠鎵€鏈?Block 鐨?actions
  let currentState: RuntimeSceneSnapshot = createRuntimeSnapshot(scene.setup)

  for (let i = 0; i < blockIndex; i++) {
    const block = scene.script[i]
    if (block) {
      currentState = applyBlockActionsToState(currentState, block, scene)
    }
  }

  return currentState
}

/**
 * 灏?SceneSetup 杞崲涓?RuntimeSceneSnapshot锛堟棤娣辨嫹璐濓紝鍏变韩寮曠敤锛?
 */
export function toRuntimeSnapshot(setup: SceneSetup): RuntimeSceneSnapshot {
  return {
    objects: setup.objects,
    renderChain: setup.renderChain,
    camera: {
      x: setup.camera.x,
      y: setup.camera.y,
      zoom: setup.camera.zoom,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
    },
  }
}

function reconcileRuntimeHierarchy(state: RuntimeSceneSnapshot): void {
  rebuildChildIdsFromParentIds(state.objects)

  for (const obj of state.objects) {
    if (obj.type !== 'composite') continue
    const comp = obj as CompositeObject
    if (comp.compositeMode !== 'entity') continue
    comp.renderChain = reconcileRenderChain(comp.renderChain ?? [], state.objects, obj.id)
  }

  state.renderChain = reconcileRenderChain(state.renderChain ?? [], state.objects)
}

function applySceneStructureActionToRuntimeState(state: RuntimeSceneSnapshot, action: Action): void {
  if (action.type !== 'set_scene_structure') return
  const result = applySetSceneStructureActionToObjects(state.objects, action, state.renderChain)
  if (result.renderChain) {
    state.renderChain = result.renderChain
  }
  reconcileRuntimeHierarchy(state)
}

function createSceneStructureRestoreAction(
  state: RuntimeSceneSnapshot,
  action: SetSceneStructureAction,
): SetSceneStructureAction | null {
  const operations = action.params.operations
    .filter((operation): operation is GroupSceneStructureOperation =>
      operation.kind === 'group' && operation.autoRestoreOnBlockEnd !== false
    )
    .map(operation => ({
      id: `${operation.id}_auto_restore`,
      kind: 'ungroup' as const,
      groupId: operation.groupId,
      memberIds: [...operation.memberIds],
      groupParentId: operation.parentId,
      restoreParentId: operation.parentId,
    }))

  if (operations.length === 0) return null

  const existingObjectIds = new Set(state.objects.map(obj => obj.id))
  const filteredOperations = operations
    .map(operation => ({
      ...operation,
      memberIds: operation.memberIds.filter(id => existingObjectIds.has(id)),
    }))
    .filter(operation => existingObjectIds.has(operation.groupId) || operation.memberIds.length > 0)

  if (filteredOperations.length === 0) return null

  return {
    id: `${action.id}_auto_restore`,
    type: 'set_scene_structure',
    category: 'point',
    target: SCENE_ACTION_TARGET,
    slotIndex: action.slotIndex,
    params: {
      operations: filteredOperations,
    },
  }
}

/**
 * 搴旂敤 Block 鐨勬墍鏈?actions 鍒扮姸鎬佸揩鐓?
 * 娉ㄦ剰锛氳繖涓柟娉曠敤浜庤绠桞lock缁撴潫鏃剁殑鏈€缁堢姸鎬侊紝鍙鐞嗕細褰卞搷闈欐€佺姸鎬佺殑Action
 * @param prevState 鍓嶄竴鐘舵€?
 * @param block 鑴氭湰鍧?
 * @param scene 鍦烘櫙瀹瑰櫒锛堢敤浜庢煡鎵炬紨鍛橀厤缃紝鍙€夛級
 * @param forceAllActions 鏄惁寮哄埗搴旂敤鎵€鏈夊姩浣滐紙蹇界暐鏃堕暱闄愬埗锛岀敤浜庣紪杈戝櫒棰勮锛?
 * @returns 搴旂敤 actions 鍚庣殑鏂扮姸鎬?
 */
export function applyBlockActionsToState(prevState: RuntimeSceneSnapshot, block: ScriptBlock, scene?: SceneContainer, forceAllActions = false, skipAutoDespawn = false): RuntimeSceneSnapshot {
  const newState: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(prevState)) as RuntimeSceneSnapshot
  reconcileRuntimeHierarchy(newState)

  if (!block.actions || block.actions.length === 0) {
    return newState
  }

  // 璁＄畻Block鐨勬€绘椂闀匡紙鐢ㄤ簬璁＄畻鎸佺画鍔ㄤ綔鐨勬渶缁堝€硷級
  // let blockDuration = 0 // Unused
  // if (block.type === 'dialogue' || block.type === 'narration') {
  //   blockDuration = block.ttsConfig?.duration ?? 0
  // } else if ((block as unknown as { type: string }).type === 'action') {
  //   blockDuration = (block as unknown as { duration: number }).duration ?? 0
  // }

  // 瑙ｆ瀽妲戒綅淇℃伅
  const slots = parseBlockToSlots(block)

  // 寤虹珛 objectId 鈫?prevState.objects 绱㈠紩鏄犲皠锛堢敤浜庡悓 slot 鐨?set_parent 鎺掑簭锛?
  const objectIndexMap = new Map<string, number>()
  prevState.objects.forEach((obj, idx) => {
    objectIndexMap.set(obj.id, idx)
  })

  // 搴旂敤姣忎釜 action锛堟寜妲戒綅绱㈠紩椤哄簭锛屽悓 slot 鐨?set_parent 鎸?target 瀵硅薄浣嶇疆鎺掑簭锛?
  const sortedActions = sortActionsForEvaluation(block.actions, objectIndexMap)
  const sceneStructureRestoreActions: SetSceneStructureAction[] = []

  // P2 + v17: 闇€瑕佽法瀵硅薄鐘舵€佽闂殑 action 绫诲瀷鍏变韩 context
  // - set_parent: 鍧愭爣琛ュ伩闇€瑕佽鍙?parent 瀵硅薄鐨勪綅缃?
  // - set_lifecycle: composite 娑堜骸鏃堕渶瑕佺骇鑱?鍐掓场瀛愬璞?
  // - set_transform / tween_transform: 鍏ㄥ眬鈫掓湰鍦板潗鏍囪浆鎹?
  const ctx: import('@/utils/actionHandlers/types').ActionHandlerContext = {
    getObjectState: (id: string) => {
      const obj = newState.objects.find(o => o.id === id)
      return obj ? (obj as unknown as WriteableState) : undefined
    },
    objects: newState.objects as unknown as WriteableState[],
  }

  for (const action of sortedActions) {
    if (action.type === 'set_scene_structure') {
      const restoreAction = createSceneStructureRestoreAction(newState, action)
      if (restoreAction) sceneStructureRestoreActions.push(restoreAction)
      const result = applySetSceneStructureActionToObjects(newState.objects, action, newState.renderChain)
      if (result.renderChain) newState.renderChain = result.renderChain
      continue
    }

    // 鑾峰彇 Handler锛堟棤 Handler 鐨?action 绫诲瀷鑷姩璺宠繃锛屽 set_anim/camera_shake/camera_follow锛?
    const handler = getHandler(action.type as ActionType)
    if (!handler) continue

    // 鎸佺画鍔ㄤ綔锛氬垽鏂槸鍚﹀湪 Block 鍐呭畬鎴?
    if (handler.isDurationAction) {
      const durationAction = action as BaseDurationAction
      if (durationAction.slotIndex >= slots.length) continue
      const endSlotIndex = durationAction.slotIndex + (durationAction.slotSpan || 1)
      const isActionCompleted = endSlotIndex <= slots.length
      if (!forceAllActions && !isActionCompleted) continue
    }

    // 鐩告満鍔ㄤ綔锛氬簲鐢ㄥ埌 newState.camera
    if (action.target === 'camera') {
      handler.applyToState(newState.camera as WriteableState, action)
      continue
    }

    // 瀵硅薄鍔ㄤ綔锛氭煡鎵剧洰鏍囧璞?
    const targetObj = findTargetObject(newState, action.target, scene)
    if (!targetObj) continue

    // 鐢婚潰鐗规晥鍔ㄤ綔锛欻andler 宸茬洿鎺ユ搷浣?state.params锛屾棤闇€ flat 鈫?params 閫傞厤
    if (action.type === 'set_screen_effect' || action.type === 'tween_screen_effect') {
      handler.applyToState(targetObj as unknown as WriteableState, action)
      continue
    }

    // 光源动作：Handler 直接操作 state 上的 light 字段（对标 screen_effect 分支）
    if (action.type === 'set_light' || action.type === 'tween_light') {
      handler.applyToState(targetObj as unknown as WriteableState, action)
      continue
    }

    // 闇€瑕佽法瀵硅薄鐘舵€佽闂殑 action 浼犲叆 ctx锛屽叾浠栫洿鎺ュ鎵?
    if (action.type === 'set_lifecycle' || action.type === 'set_transform' || action.type === 'tween_transform') {
      handler.applyToState(targetObj as WriteableState, action, ctx)
    } else if (action.type === 'set_mask') {
      // Clip-Mask Phase 1: set_mask 不在主循环里直接应用，
      // 由下方 mask post-pass 统一进行同 slot 折叠 + 跨 mask 独占裁决（D1.5）。
      continue
    } else {
      handler.applyToState(targetObj as WriteableState, action)
    }

  }

  reconcileRuntimeHierarchy(newState)

  // ========== Clip-Mask Phase 1: Mask post-pass (D1.5 同槽 target 归并) ==========
  // 详见 doc-prd/clip-mask-implementation-plan.md §3 D1.5
  applyMaskPostPass(prevState, newState, sortedActions)

  // v9.5: 搴旂敤鎵€鏈?action 鍚庯紝澶勭悊 autoDespawnOnBlockEnd
  // skipAutoDespawn=true 鏃惰烦杩囨姝ラ锛堢敤浜?accumulatedParentIds 绛夐渶瑕佽幏鍙?set_parent 鍚庣湡瀹炵姸鎬佺殑鍦烘櫙锛?
  if (!skipAutoDespawn) {
    // 瀵逛簬鍑虹敓 Action (spawned=true) 涓?autoDespawnOnBlockEnd !== false 鐨勫璞★紝
    // 濡傛灉鍚?Block 鍐呮病鏈夋墜鍔ㄦ秷浜?Action锛屽垯鑷姩灏嗗叾 spawned 璁句负 false
    const birthActions = sortedActions.filter(
      a => a.type === 'set_lifecycle'
        && (a.params as { spawned: boolean; autoDespawnOnBlockEnd?: boolean }).spawned === true
    )
    for (const birthAction of birthActions) {
      const lifecycleParams = birthAction.params as { spawned: boolean; autoDespawnOnBlockEnd?: boolean }
      if (lifecycleParams.autoDespawnOnBlockEnd === false) continue

      // 妫€鏌ュ悓 Block 鍐呮槸鍚﹀凡鏈夋墜鍔ㄦ秷浜?
      const hasManualDespawn = sortedActions.some(
        a => a.type === 'set_lifecycle'
          && a.target === birthAction.target
          && (a.params as { spawned: boolean }).spawned === false
      )
      if (hasManualDespawn) continue

      // 鑷姩娑堜骸锛氫慨鏀圭姸鎬?
      const autoDespawnTarget = findTargetObject(newState, birthAction.target, scene)
      if (autoDespawnTarget) {
        autoDespawnTarget.spawned = false

        if (autoDespawnTarget.type === 'composite') {
          const childIds = getChildIdsByParentId(newState.objects, autoDespawnTarget.id)
          const compositeMode = (autoDespawnTarget as unknown as { compositeMode?: string }).compositeMode ?? 'entity'
          if (childIds.length > 0 && compositeMode === 'entity') {
            for (const childId of childIds) {
              const childObj = findTargetObject(newState, childId, scene)
              if (childObj) childObj.spawned = false
            }
          }
        }
      }
    }

  } // end if (!skipAutoDespawn)

  for (const action of sceneStructureRestoreActions.reverse()) {
    const result = applySetSceneStructureActionToObjects(newState.objects, action, newState.renderChain)
    if (result.renderChain) newState.renderChain = result.renderChain
  }

  reconcileRuntimeHierarchy(newState)

  return newState
}

/** * Clip-Mask Phase 1: D1.5 同槽 target 归并 + 跨 mask 独占裁决
 *
 * 详见 doc-prd/clip-mask-implementation-plan.md §3 D1.5 与
 * doc-prd/clip-mask-design.md §11.4.3。
 *
 * 算法（按 slotIndex 升序逐 slot 处理）：
 *   1. 折叠：参与 mask 的 set_mask 在槽内按时间顺序套用部分更新（targetIds 整段替换、shape/width/height 覆盖）
 *      → 得每个参与 mask 的 candidate.targetIds。
 *   2. 构造 Claimers(t)：参与 mask（candidate 含 t）∪ 上游已占 t 且本 slot 未参与的 owner。
 *   3. 裁决：|Claimers| ≥ 2 时按 newState.objects 中 mask 的稳定索引升序取首位，
 *      其余从 candidate 中剔除并聚合 1 条 warn；非参与 mask 静默保留（"无隐式释放"）。
 *   4. 写回：仅 *显式参与* 本 slot 的 mask 被修改，未参与者（含原 owner）状态不动。
 *
 * 导出以供 ScenePlayer.evaluateStates / FrameCapture 等 细颗度的交互预览复用同一后处理逻辑，
 * 避免 在 applyPreviewObjectAction 中逐对象应用 set_mask 时丢失跨 mask 独占 / 順序无关转移 语义。
 */
export function applyMaskPostPass(
  prevState: RuntimeSceneSnapshot,
  newState: RuntimeSceneSnapshot,
  sortedActions: Action[],
): void {
  type MaskLikeObj = SceneObject & { type: 'mask'; targetIds: string[]; shape: 'rectangle' | 'ellipse'; width: number; height: number }

  // 收集 set_mask（按 slotIndex 分组；组内顺序保留 sortedActions 顺序）
  const setMasksBySlot = new Map<number, import('@/types/screenplay').SetMaskAction[]>()
  for (const a of sortedActions) {
    if (a.type !== 'set_mask') continue
    const list = setMasksBySlot.get(a.slotIndex) ?? []
    list.push(a)
    setMasksBySlot.set(a.slotIndex, list)
  }
  if (setMasksBySlot.size === 0) return

  // 初始化 mask running state（来自 prevState）
  const running = new Map<string, string[]>() // maskId → targetIds
  for (const obj of prevState.objects) {
    if (obj.type === 'mask') {
      running.set(obj.id, [...((obj as MaskLikeObj).targetIds ?? [])])
    }
  }
  // 还需补上本 block 内新出生的 mask（在 prevState 不存在但在 newState 存在）
  for (const obj of newState.objects) {
    if (obj.type === 'mask' && !running.has(obj.id)) {
      // 新出生 mask 初始 targetIds 取 setupState 默认（newState 中的 mask 已被主循环跳过 set_mask
      // 故其 targetIds 当前是 setup 原值；将其作为 pre-block running）
      running.set(obj.id, [...((obj as MaskLikeObj).targetIds ?? [])])
    }
  }

  // mask 稳定索引（newState.objects 顺序）
  const maskIndex = new Map<string, number>()
  newState.objects.forEach((o, i) => {
    if (o.type === 'mask') maskIndex.set(o.id, i)
  })

  // 目标合法性索引：仅活在 newState 中且类型允许（与 maskUtils.isAllowedMaskTargetType 一致）
  // 用于剔除 set_mask 通过手改 / 旧版工程残留 / 反序列化漏网带入的非法或死引用 targetIds。
  const validTargetIds = new Set<string>()
  for (const o of newState.objects) {
    if (isAllowedMaskTargetType(o.type)) validTargetIds.add(o.id)
  }
  const sanitize = (ids: string[], maskId: string): { kept: string[]; dropped: string[] } => {
    const kept: string[] = []
    const dropped: string[] = []
    for (const id of ids) {
      // 不允许 mask 自指
      if (id === maskId) { dropped.push(id); continue }
      if (validTargetIds.has(id)) kept.push(id)
      else dropped.push(id)
    }
    return { kept, dropped }
  }

  // 按 slotIndex 升序处理
  const slotOrder = [...setMasksBySlot.keys()].sort((a, b) => a - b)
  for (const slot of slotOrder) {
    const actions = setMasksBySlot.get(slot)!

    // 1. 槽内折叠：每个参与 mask 在 slot 内按时间顺序合并字段
    interface Folded { targetIds?: string[]; shape?: 'rectangle' | 'ellipse'; width?: number; height?: number }
    const folded = new Map<string, Folded>()
    for (const a of actions) {
      const cur = folded.get(a.target) ?? {}
      if (a.params.targetIds !== undefined) cur.targetIds = [...a.params.targetIds]
      if (a.params.shape !== undefined) cur.shape = a.params.shape
      if (a.params.width !== undefined && Number.isFinite(a.params.width) && a.params.width > 0) cur.width = a.params.width
      if (a.params.height !== undefined && Number.isFinite(a.params.height) && a.params.height > 0) cur.height = a.params.height
      folded.set(a.target, cur)
    }

    // 2. 候选 targetIds：参与 mask 取 folded.targetIds（若 undefined 则保持 running）
    //    同步执行 sanitize：剔除非法类型 / 死引用 / 自指。
    const candidate = new Map<string, string[]>() // 仅 *参与* mask
    const sanitizeWarnings: string[] = []
    for (const [maskId, f] of folded) {
      const raw = f.targetIds !== undefined
        ? [...f.targetIds]
        : [...(running.get(maskId) ?? [])]
      const { kept, dropped } = sanitize(raw, maskId)
      if (dropped.length > 0) {
        sanitizeWarnings.push(`mask=${maskId} dropped=${dropped.join(',')}`)
      }
      candidate.set(maskId, kept)
    }
    // 同步对未参与 mask 的 running 也做一次 sanitize，避免它们在下方 Claimers 计算中
    // 把已删除 / 非法 id 引入裁决（不写回 running 本身——保持"无隐式释放"语义）。
    const runningSanitized = new Map<string, string[]>()
    for (const [maskId, ids] of running) {
      if (folded.has(maskId)) continue
      const { kept } = sanitize(ids, maskId)
      runningSanitized.set(maskId, kept)
    }
    if (sanitizeWarnings.length > 0) {
      console.warn(`[set_mask] slot ${slot}: invalid targetIds dropped — ${sanitizeWarnings.join('; ')}`)
    }

    // 3. 构造 Claimers(t)
    const claimers = new Map<string, string[]>() // targetId → maskId[]
    const pushClaimer = (t: string, m: string) => {
      const arr = claimers.get(t)
      if (arr) {
        if (!arr.includes(m)) arr.push(m)
      } else {
        claimers.set(t, [m])
      }
    }
    for (const [maskId, targets] of candidate) {
      for (const t of targets) pushClaimer(t, maskId)
    }
    for (const [maskId, targets] of runningSanitized) {
      for (const t of targets) pushClaimer(t, maskId)
    }

    // 4. 裁决：稳定索引升序取首位
    const evicted: { maskId: string; target: string; winner: string }[] = []
    for (const [t, masks] of claimers) {
      if (masks.length < 2) continue
      const sorted = [...masks].sort(
        (a, b) => (maskIndex.get(a) ?? Number.POSITIVE_INFINITY) - (maskIndex.get(b) ?? Number.POSITIVE_INFINITY),
      )
      const winner = sorted[0]!
      for (const loser of sorted.slice(1)) {
        // 非参与 mask（原 owner）静默保留 t —— 不修改其 running
        if (!folded.has(loser)) continue
        const arr = candidate.get(loser)
        if (!arr) continue
        const idx = arr.indexOf(t)
        if (idx !== -1) arr.splice(idx, 1)
        evicted.push({ maskId: loser, target: t, winner })
      }
    }

    if (evicted.length > 0) {
      const summary = evicted
        .map(e => `target=${e.target} winner=${e.winner} loser=${e.maskId}`)
        .join('; ')
      console.warn(`[set_mask] slot ${slot}: contested targets resolved by stable index — ${summary}`)
    }

    // 5. 写回：仅参与 mask
    for (const [maskId, f] of folded) {
      const obj = newState.objects.find(o => o.id === maskId) as MaskLikeObj | undefined
      if (!obj || obj.type !== 'mask') continue
      const finalTargets = candidate.get(maskId) ?? []
      obj.targetIds = [...finalTargets]
      if (f.shape !== undefined) obj.shape = f.shape
      if (f.width !== undefined) obj.width = f.width
      if (f.height !== undefined) obj.height = f.height
      running.set(maskId, [...finalTargets])
    }
  }
}

/** * 鏌ユ壘鐩爣瀵硅薄
 * @param setup 鍦烘櫙璁剧疆
 * @param target 鐩爣鏍囪瘑锛堝彲鑳芥槸actorAlias鎴杘bjectId锛?
 * @param scene 鍦烘櫙瀹瑰櫒锛堝彲閫夛紝鐢ㄤ簬鏌ユ壘婕斿憳閰嶇疆锛?
 */
function findTargetObject(
  setup: { objects: SceneObject[] },
  target: string,
  _scene?: SceneContainer
): SceneObject | null {
  // 棣栧厛灏濊瘯閫氳繃objectId鏌ユ壘
  let targetObj = setup.objects.find(obj => obj.id === target)
  if (targetObj) return targetObj

  // 濡傛灉鏄?camera'锛岃繑鍥炵浉鏈哄璞★紙闇€瑕佺壒娈婂鐞嗭級
  if (target === 'camera') {
    // 鐩告満涓嶅湪objects涓紝闇€瑕佺壒娈婂鐞?
    return null
  }

  // v7.0: target 鐜板湪鏄疄渚婭D锛岀洿鎺ラ€氳繃ID鏌ユ壘
  targetObj = setup.objects.find(obj => obj.id === target)
  if (targetObj) return targetObj

  return null
}

/**
 * 鏇存柊 Block 涓殑 action
 * @param scene 鍦烘櫙瀹瑰櫒
 * @param blockId Block ID
 * @param actionIndex action 绱㈠紩
 * @param updates 鏇存柊鍐呭
 */
export function updateActionInBlock(
  scene: SceneContainer,
  blockId: string,
  actionIndex: number,
  updates: Partial<Action>
): void {
  const block = scene.script.find(b => b.id === blockId)
  if (!block?.actions) return

  if (actionIndex >= 0 && actionIndex < block.actions.length) {
    const targetAction = block.actions[actionIndex]
    if (targetAction) {
      Object.assign(targetAction, updates)
    }
  }
}

/**
 * 娣诲姞 action 鍒?Block
 * @param scene 鍦烘櫙瀹瑰櫒
 * @param blockId Block ID
 * @param action 鏂扮殑 action
 */
export function addActionToBlock(
  scene: SceneContainer,
  blockId: string,
  action: Action
): void {
  const block = scene.script.find(b => b.id === blockId)
  if (!block) return

  if (!block.actions) {
    block.actions = []
  }

  block.actions.push(action)
}

// ==================== Ghost Mode Core Functions ====================

/**
 * 鍒ゆ柇鍔ㄤ綔鏄惁褰卞搷鐩爣瀵硅薄锛堢灛鏃跺姩浣滐級
 */
function isPointActionForTarget(action: Action, targetId: string): boolean {
  if (action.target !== targetId) return false
  return action.category === 'point' && isObjectStateAction(action)
}

/**
 * 鍒ゆ柇鍔ㄤ綔鏄惁褰卞搷鐩爣瀵硅薄锛堟寔缁姩浣滐級
 */
function isDurationActionForTarget(action: Action, targetId: string): boolean {
  if (action.target !== targetId) return false
  return action.category === 'duration' && isObjectStateAction(action)
}

function getSceneStructureParentTargetsForSlot(actions: readonly Action[], slotIndex: number): Set<string> {
  const parentTargets = new Set<string>()
  for (const action of actions) {
    if (action.slotIndex !== slotIndex || action.type !== 'set_scene_structure') continue
    const patch = flattenSetSceneStructureParams(action.params)
    for (const parentId of Object.values(patch.parentById)) {
      if (parentId) parentTargets.add(parentId)
    }
  }
  return parentTargets
}

const SPATIAL_TRANSFORM_KEYS = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'transformOriginX',
  'transformOriginY',
] as const

/**
 * Ghost is a spatial before/after aid. Non-spatial state changes still apply
 * to real state at the current slot, but they should not create a ghost layer.
 */
function shouldCreateObjectGhost(action: Action): boolean {
  if (action.type !== 'set_transform' && action.type !== 'tween_transform') {
    return false
  }

  const params = action.params as Record<string, unknown> | undefined
  return SPATIAL_TRANSFORM_KEYS.some(key => params?.[key] !== undefined)
}

function isPreStructurePointAction(
  action: Action,
  currentSlotSceneStructureSpawnedTargets: ReadonlySet<string>,
): boolean {
  if (action.category !== 'point') return false
  if (!isObjectStateAction(action)) return false
  if (action.type === 'set_scene_structure') return false

  if (action.type === 'set_lifecycle' || action.type === 'set_visual') {
    return true
  }

  if (action.type === 'set_transform') {
    return !isSceneStructureSpawnedTargetTransform(action, currentSlotSceneStructureSpawnedTargets)
  }

  return false
}

function isPostStructurePointAction(
  action: Action,
  currentSlotSceneStructureSpawnedTargets: ReadonlySet<string>,
): boolean {
  if (action.category !== 'point') return false
  if (!isObjectStateAction(action)) return false
  if (action.type === 'set_scene_structure') return false
  return !isPreStructurePointAction(action, currentSlotSceneStructureSpawnedTargets)
}

function getObjectStateBeforeActionSlot(
  prevContext: RuntimeSceneSnapshot,
  sortedActions: Action[],
  objId: string,
  actionSlotIndex: number,
  fallback: SceneObject,
): SceneObject {
  const ghostState: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(prevContext)) as RuntimeSceneSnapshot

  for (const action of sortedActions) {
    if (action.target !== objId) continue
    if (action.slotIndex >= actionSlotIndex) break

    if (action.category === 'point' && isObjectStateAction(action)) {
      const idx = ghostState.objects.findIndex(o => o.id === objId)
      if (idx !== -1) {
        ghostState.objects[idx] = applyActionToObjectWithContext(ghostState.objects[idx]!, action, ghostState)
        rebuildChildIdsFromParentIds(ghostState.objects)
      }
    } else if (action.category === 'duration' && isDurationActionForTarget(action, objId)) {
      const span = (action as { slotSpan?: number }).slotSpan ?? 1
      if (action.slotIndex + span <= actionSlotIndex) {
        const idx = ghostState.objects.findIndex(o => o.id === objId)
        if (idx !== -1) {
          ghostState.objects[idx] = applyActionToObjectWithContext(ghostState.objects[idx]!, action, ghostState)
          rebuildChildIdsFromParentIds(ghostState.objects)
        }
      }
    }
  }

  return ghostState.objects.find(o => o.id === objId) ?? fallback
}

/**
 * 鍒ゆ柇鐩告満鐬椂鍔ㄤ綔
 */
function isCameraPointAction(action: Action): boolean {
  return action.target === 'camera' && action.type === 'camera_cut'
}

/**
 * 鍒ゆ柇鐩告満鎸佺画鍔ㄤ綔 (浠?camera_move 鏀寔 Ghost)
 */
function isCameraDurationAction(action: Action): boolean {
  return action.target === 'camera' && action.type === 'camera_move'
}

/**
 * 甯?context 鐨勫姩浣滃簲鐢紙set_parent / set_lifecycle 闇€瑕佽闂叾浠栧璞＄姸鎬侊級
 * - set_parent: 鍧愭爣琛ュ伩闇€瑕佽鍙?parent 瀵硅薄鐨勪綅缃?
 * - set_lifecycle: composite 娑堜骸鏃堕渶瑕佺骇鑱?鍐掓场瀛愬璞?
 */
function applyActionToObjectWithContext(
  state: SceneObject,
  action: Action,
  allState: { objects: SceneObject[] }
): SceneObject {
  const newState: SceneObject = JSON.parse(JSON.stringify(state)) as SceneObject

  const handler = getHandler(action.type as ActionType)
  if (handler) {
    if (action.type === 'set_lifecycle' || action.type === 'set_transform' || action.type === 'tween_transform') {
      const ctx: ActionHandlerContext = {
        getObjectState: (id: string) => {
          const obj = allState.objects.find(o => o.id === id)
          return obj ? (obj as unknown as WriteableState) : undefined
        },
        objects: allState.objects as unknown as WriteableState[],
      }
      handler.applyToState(newState as unknown as WriteableState, action, ctx)
    } else {
      handler.applyToState(newState as unknown as WriteableState, action)
    }
  }

  return newState
}

/**
 * 搴旂敤鍔ㄤ綔鍒扮浉鏈虹姸鎬?
 */
function applyActionToCamera(state: RuntimeCameraState, action: Action): RuntimeCameraState {
  const newState: RuntimeCameraState = { ...state }

  if (action.type === 'camera_cut' || action.type === 'camera_move') {
    if (action.params.x !== undefined) newState.x = action.params.x
    if (action.params.y !== undefined) newState.y = action.params.y
    if (action.params.zoom !== undefined) newState.zoom = action.params.zoom
  }

  return newState
}

/**
 * 璁＄畻鎸囧畾 Slot 鐨勬墍鏈夊璞″拰鐩告満鐨?Ghost/Real 鐘舵€?
 * 
 * @param scene 鍦烘櫙瀹瑰櫒
 * @param block 褰撳墠 Block
 * @param slotIndex 褰撳墠閫変腑鐨?Slot 绱㈠紩
 * @returns SlotStatesResult 鍖呭惈鎵€鏈夊璞″拰鐩告満鐨勭姸鎬佸
 */
export function calculateSlotStates(
  scene: SceneContainer,
  block: ScriptBlock,
  slotIndex: number,
  prevContextOverride?: RuntimeSceneSnapshot
): SlotStatesResult {
  const results = new Map<string, GhostStateResult>()

  // 1. 璁＄畻 Block 寮€濮嬪墠鐨勫熀纭€鐘舵€?(PrevContext)
  const prevContext = prevContextOverride ?? calculatePrevContext(scene, block.id)
  const actions = block.actions || []

  // 2. 璁＄畻 BaseState: 搴旂敤鎵€鏈?slotIndex < currentSlot 鐨勫凡瀹屾垚鍔ㄤ綔
  // 杩欐槸"褰撳墠 Slot 寮€濮嬫椂"鐨勭姸鎬?
  const baseState: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(prevContext)) as RuntimeSceneSnapshot
  reconcileRuntimeHierarchy(baseState)

  // 寤虹珛 objectId 鈫?prevContext.objects 绱㈠紩鏄犲皠锛堢敤浜庡悓 slot 鐨?set_parent 鎺掑簭锛?
  const objectIndexMap = new Map<string, number>()
  prevContext.objects.forEach((obj, idx) => {
    objectIndexMap.set(obj.id, idx)
  })

  const sortedActions = sortActionsForEvaluation(actions, objectIndexMap)
  const currentSlotSceneStructureSpawnedTargets = getSceneStructureSpawnedTargetsForSlot(sortedActions, slotIndex)
  const currentSlotSceneStructureParentTargets = getSceneStructureParentTargetsForSlot(sortedActions, slotIndex)

  for (const action of sortedActions) {
    if (action.type === 'set_scene_structure') {
      if (action.slotIndex < slotIndex) {
        applySceneStructureActionToRuntimeState(baseState, action)
      }
      continue
    }

    // 鍙鐞嗗湪褰撳墠 Slot 涔嬪墠宸插畬鎴愮殑鍔ㄤ綔
    if (action.category === 'point' && action.slotIndex < slotIndex) {
      // Point action: 鍦?slotIndex 涔嬪墠瑙﹀彂鐨?
      const targetObj = findTargetObject(baseState, action.target, scene)
      if (targetObj) {
        const idx = baseState.objects.findIndex(o => o.id === action.target)
        if (idx !== -1) {
          baseState.objects[idx] = applyActionToObjectWithContext(targetObj, action, baseState)
          reconcileRuntimeHierarchy(baseState)
        }
      }
      // 鐩告満鍔ㄤ綔
      if (action.target === 'camera' && action.type === 'camera_cut') {
        baseState.camera = {
          ...baseState.camera,
          ...applyActionToCamera({
            x: baseState.camera.x,
            y: baseState.camera.y,
            zoom: baseState.camera.zoom
          }, action)
        }
      }
    } else if (action.category === 'duration') {
      const span = (action as { slotSpan?: number }).slotSpan ?? 1
      const endSlot = action.slotIndex + span
      // 鎸佺画鍔ㄤ綔: 鍦ㄥ綋鍓?Slot 涔嬪墠宸插畬鎴愮殑
      if (endSlot <= slotIndex) {
        const targetObj = findTargetObject(baseState, action.target, scene)
        if (targetObj) {
          const idx = baseState.objects.findIndex(o => o.id === action.target)
          if (idx !== -1) {
            baseState.objects[idx] = applyActionToObjectWithContext(targetObj, action, baseState)
            reconcileRuntimeHierarchy(baseState)
          }
        }
        // 鐩告満鍔ㄤ綔
        if (action.target === 'camera' && action.type === 'camera_move') {
          baseState.camera = {
            ...baseState.camera,
            ...applyActionToCamera({
              x: baseState.camera.x,
              y: baseState.camera.y,
              zoom: baseState.camera.zoom
            }, action)
          }
        }
      }
    }
  }

  // 3. 閬嶅巻鎵€鏈夊璞★紝璁＄畻 Ghost/Real 鐘舵€?
  if (hasCustomActionOrderForSlot(sortedActions, slotIndex)) {
    const slotStartState: RuntimeSceneSnapshot = JSON.parse(JSON.stringify(baseState)) as RuntimeSceneSnapshot
    const directPointGhostTargets = new Set<string>()

    for (const action of sortedActions) {
      if (action.category !== 'point' || action.slotIndex !== slotIndex) continue

      if (action.type === 'set_scene_structure') {
        applySceneStructureActionToRuntimeState(baseState, action)
        continue
      }

      if (action.target === 'camera' || !isObjectStateAction(action)) continue

      const idx = baseState.objects.findIndex(o => o.id === action.target)
      if (idx === -1) continue

      if (shouldCreateObjectGhost(action)) {
        directPointGhostTargets.add(action.target)
      }
      baseState.objects[idx] = applyActionToObjectWithContext(baseState.objects[idx]!, action, baseState)
      reconcileRuntimeHierarchy(baseState)
    }

    const sortedObjects = sortObjectsForEvaluation(baseState.objects)
    for (const objSetup of sortedObjects) {
      const objId = objSetup.id
      const slotStartObj = slotStartState.objects.find(o => o.id === objId)
      let realState = JSON.parse(JSON.stringify(baseState.objects.find(o => o.id === objId) ?? objSetup)) as SceneObject
      let ghostState = directPointGhostTargets.has(objId) && slotStartObj
        ? JSON.parse(JSON.stringify(slotStartObj)) as SceneObject
        : null

      const activeDurationActions = sortedActions.filter(a => {
        if (!isDurationActionForTarget(a, objId)) return false
        const span = (a as { slotSpan?: number }).slotSpan ?? 1
        return a.slotIndex <= slotIndex && slotIndex < a.slotIndex + span
      })
      const activeGhostDurationActions = activeDurationActions.filter(shouldCreateObjectGhost)

      if (activeDurationActions.length > 0) {
        if (!ghostState && activeGhostDurationActions.length > 0) {
          const earliestGhostAction = activeGhostDurationActions.reduce((prev, curr) =>
            curr.slotIndex < prev.slotIndex ? curr : prev
          )
          ghostState = JSON.parse(JSON.stringify(
            getObjectStateBeforeActionSlot(prevContext, sortedActions, objId, earliestGhostAction.slotIndex, objSetup)
          )) as SceneObject
        }
        for (const action of activeDurationActions) {
          realState = applyActionToObjectWithContext(realState, action, baseState)
        }
        const baseIdx = baseState.objects.findIndex(o => o.id === objId)
        if (baseIdx !== -1) {
          baseState.objects[baseIdx] = JSON.parse(JSON.stringify(realState)) as SceneObject
          reconcileRuntimeHierarchy(baseState)
        }
      }

      results.set(objId, {
        ghost: ghostState,
        real: realState,
      })
    }
  } else {
  const parentOverrides = buildParentOverridesForSlot(sortedActions, slotIndex)
  const sortedObjects = sortObjectsForEvaluation(
    sortObjectsBySlotActionOrder(baseState.objects, sortedActions, slotIndex),
    parentOverrides,
  )
  for (const objSetup of sortedObjects) {
    const objId = objSetup.id
    const baseObj = baseState.objects.find(o => o.id === objId) ?? objSetup

    // Phase A: pre-structure actions keep WYSIWYG reparent/grouping behavior.
    const preStructurePointActions = sortedActions.filter(a =>
      isPointActionForTarget(a, objId)
      && a.slotIndex === slotIndex
      && isPreStructurePointAction(a, currentSlotSceneStructureSpawnedTargets)
    )

    const activeDurationActions = sortedActions.filter(a => {
      if (!isDurationActionForTarget(a, objId)) return false
      if (currentSlotSceneStructureSpawnedTargets.has(objId)) return false
      if (currentSlotSceneStructureParentTargets.has(objId)) return false
      const span = (a as { slotSpan?: number }).slotSpan ?? 1
      return a.slotIndex <= slotIndex && slotIndex < a.slotIndex + span
    })
    const hasPointGhostAction = preStructurePointActions.some(shouldCreateObjectGhost)
    const activeGhostDurationActions = activeDurationActions.filter(shouldCreateObjectGhost)

    // 鎯呭喌 A: 鏈夌灛鏃跺姩浣?
    if (preStructurePointActions.length > 0) {
      let realState = JSON.parse(JSON.stringify(baseObj)) as SceneObject
      for (const action of preStructurePointActions) {
        realState = applyActionToObjectWithContext(realState, action, baseState)
      }
      // 鍚屾椂搴旂敤娲昏穬鐨勬寔缁姩浣滅洰鏍囩姸鎬?
      for (const action of activeDurationActions) {
        realState = applyActionToObjectWithContext(realState, action, baseState)
      }

      // v19: GCA 淇 鈥?灏嗗綋鍓?slot 鍐呯殑璇勪及缁撴灉鍐欏洖 baseState锛?
      // 浣垮悗缁瓙瀵硅薄鐨?globalToLocal 鑳借鍙栧埌 parent 鐨勬渶鏂颁綅缃€?
      // 鍚﹀垯 child 鐨?globalToLocal 浣跨敤鐨勬槸 slot 寮€濮嬫椂鐨?parent 浣嶇疆锛岃€岄潪绱Н鏇存柊鍚庣殑銆?
      const baseIdx = baseState.objects.findIndex(o => o.id === objId)
      if (baseIdx !== -1) {
        baseState.objects[baseIdx] = JSON.parse(JSON.stringify(realState)) as SceneObject
        reconcileRuntimeHierarchy(baseState)
      }

      let ghostState: SceneObject | null = null
      if (hasPointGhostAction) {
        ghostState = JSON.parse(JSON.stringify(baseObj)) as SceneObject
      } else if (activeGhostDurationActions.length > 0) {
        const earliestGhostAction = activeGhostDurationActions.reduce((prev, curr) =>
          curr.slotIndex < prev.slotIndex ? curr : prev
        )
        ghostState = JSON.parse(JSON.stringify(
          getObjectStateBeforeActionSlot(prevContext, sortedActions, objId, earliestGhostAction.slotIndex, baseObj)
        )) as SceneObject
      }

      results.set(objId, {
        ghost: ghostState,
        real: realState
      })
      continue
    }

    // 鎯呭喌 B: 鏈夎繘琛屼腑鐨勬寔缁姩浣?
    if (activeDurationActions.length > 0) {
      const earliestGhostAction = activeGhostDurationActions.length > 0
        ? activeGhostDurationActions.reduce((prev, curr) =>
          curr.slotIndex < prev.slotIndex ? curr : prev
        )
        : null
      const ghostObj = earliestGhostAction
        ? getObjectStateBeforeActionSlot(prevContext, sortedActions, objId, earliestGhostAction.slotIndex, baseObj)
        : null

      // Real State: 搴旂敤鎵€鏈夋椿璺冩寔缁姩浣滅殑鐩爣鐘舵€?
      let realState = JSON.parse(JSON.stringify(baseObj)) as SceneObject
      for (const action of activeDurationActions) {
        realState = applyActionToObjectWithContext(realState, action, baseState)
      }

      // v19: GCA 淇 鈥?鍚屾儏鍐?A锛屽啓鍥?baseState 渚涘悗缁瓙瀵硅薄浣跨敤
      const baseIdx = baseState.objects.findIndex(o => o.id === objId)
      if (baseIdx !== -1) {
        baseState.objects[baseIdx] = JSON.parse(JSON.stringify(realState)) as SceneObject
        reconcileRuntimeHierarchy(baseState)
      }

      results.set(objId, {
        ghost: ghostObj ? JSON.parse(JSON.stringify(ghostObj)) as SceneObject : null,
        real: realState
      })
      continue
    }

    // 鎯呭喌 C: 鏃犲姩浣?(Idle)
    results.set(objId, {
      ghost: null,
      real: JSON.parse(JSON.stringify(baseObj)) as SceneObject
    })
  }

  for (const action of sortedActions) {
    if (action.type === 'set_scene_structure' && action.slotIndex === slotIndex) {
      applySceneStructureActionToRuntimeState(baseState, action)
    }
  }

  // Phase C: relationship-dependent actions see the final current-slot tree.
  for (const action of sortedActions) {
    if (action.slotIndex !== slotIndex) continue
    if (!isPostStructurePointAction(action, currentSlotSceneStructureSpawnedTargets)) continue

    const idx = baseState.objects.findIndex(o => o.id === action.target)
    if (idx === -1) continue

    const nextState = applyActionToObjectWithContext(baseState.objects[idx]!, action, baseState)
    baseState.objects[idx] = nextState
    reconcileRuntimeHierarchy(baseState)

    const result = results.get(action.target)
    if (result) {
      result.real = JSON.parse(JSON.stringify(nextState)) as SceneObject
    } else {
      results.set(action.target, {
        ghost: null,
        real: JSON.parse(JSON.stringify(nextState)) as SceneObject,
      })
    }
  }

  const delayedDurationTargets = new Set([
    ...currentSlotSceneStructureSpawnedTargets,
    ...currentSlotSceneStructureParentTargets,
  ])
  for (const objId of delayedDurationTargets) {
    const activeDurationActions = sortedActions.filter(a => {
      if (!isDurationActionForTarget(a, objId)) return false
      const span = (a as { slotSpan?: number }).slotSpan ?? 1
      return a.slotIndex <= slotIndex && slotIndex < a.slotIndex + span
    })
    if (activeDurationActions.length === 0) continue
    const activeGhostDurationActions = activeDurationActions.filter(shouldCreateObjectGhost)

    const idx = baseState.objects.findIndex(o => o.id === objId)
    if (idx === -1) continue

    const beforeDelayedDuration = JSON.parse(JSON.stringify(baseState.objects[idx]!)) as SceneObject
    let nextState = baseState.objects[idx]!
    for (const action of activeDurationActions) {
      nextState = applyActionToObjectWithContext(nextState, action, baseState)
    }
    baseState.objects[idx] = nextState
    reconcileRuntimeHierarchy(baseState)

    const result = results.get(objId)
    if (result) {
      if (!result.ghost && activeGhostDurationActions.length > 0) {
        if (currentSlotSceneStructureSpawnedTargets.has(objId)) {
          result.ghost = beforeDelayedDuration
        } else {
          const earliestGhostAction = activeGhostDurationActions.reduce((prev, curr) =>
            curr.slotIndex < prev.slotIndex ? curr : prev
          )
          result.ghost = JSON.parse(JSON.stringify(
            getObjectStateBeforeActionSlot(prevContext, sortedActions, objId, earliestGhostAction.slotIndex, beforeDelayedDuration)
          )) as SceneObject
        }
      }
      result.real = JSON.parse(JSON.stringify(nextState)) as SceneObject
    } else {
      let ghost: SceneObject | null = null
      if (activeGhostDurationActions.length > 0) {
        if (currentSlotSceneStructureSpawnedTargets.has(objId)) {
          ghost = beforeDelayedDuration
        } else {
          const earliestGhostAction = activeGhostDurationActions.reduce((prev, curr) =>
            curr.slotIndex < prev.slotIndex ? curr : prev
          )
          ghost = JSON.parse(JSON.stringify(
            getObjectStateBeforeActionSlot(prevContext, sortedActions, objId, earliestGhostAction.slotIndex, beforeDelayedDuration)
          )) as SceneObject
        }
      }
      results.set(objId, {
        ghost,
        real: JSON.parse(JSON.stringify(nextState)) as SceneObject,
      })
    }
  }
  }

  // 3.5 Post-process: 鍚屾 composite 鐨?childIds + 瀛愬璞＄殑 parentId
  // Phase 3 閫愬璞¤瘎浼版椂锛宧andler 鐨勮法瀵硅薄淇敼锛堥€氳繃 ctx.getObjectState锛夊啓鍏?baseState锛?
  // 浣嗚淇敼瀵硅薄鐨?results.real 鍙兘宸茬敓鎴愶紙璇勪及椤哄簭闂锛夛紝闇€瑕佷粠 baseState 鍚屾銆?

  reconcileRuntimeHierarchy(baseState)

  // Pass 1: 鍚屾 composite 鐨?childIds 鍜?renderChain
  for (const [objId, result] of results) {
    const baseObj = baseState.objects.find(o => o.id === objId)
    if (baseObj?.type !== 'composite') continue

    const baseChildIds = (baseObj as unknown as { childIds?: string[] }).childIds
    if (baseChildIds) {
      ; (result.real as unknown as { childIds: string[] }).childIds = [...baseChildIds]
      if (result.ghost) {
        ; (result.ghost as unknown as { childIds: string[] }).childIds = [...baseChildIds]
      }
    }

    // v19: 澧為噺鍗忚皟 entity 鐨?renderChain
    const baseMode = (baseObj as CompositeObject).compositeMode
    if (baseMode === 'entity') {
      const existingChain = (baseObj as CompositeObject).renderChain ?? []
      const reconciledChain = reconcileRenderChain(existingChain, baseState.objects, objId)
      ;(result.real as CompositeObject).renderChain = reconciledChain
      if (result.ghost) {
        ;(result.ghost as CompositeObject).renderChain = reconciledChain
      }
    }
  }

  // v21: 澧為噺鍗忚皟鍦烘櫙绾?renderChain锛堝鐞?spawn/despawn 寮曡捣鐨勬牴绾у璞￠泦鍚堝彉鍖栵級
  baseState.renderChain = reconcileRenderChain(
    baseState.renderChain ?? [], baseState.objects
  )

  // Pass 2: 鍚屾鎵€鏈夊璞＄殑 parentId 鍜屽潗鏍?
  // SetLifecycleHandler锛堝嚭鐢熼檮鍔?娑堜骸鍐掓场锛夊拰 SetParentHandler 鍙兘閫氳繃 ctx 淇敼浜?
  // baseState 涓叾浠栧璞＄殑 parentId/鍧愭爣/spawned锛屼絾杩欎簺瀵硅薄鐨?results.real 鍙兘宸插湪 Phase 3 涓敓鎴愩€?
  // 鍏ㄥ眬閬嶅巻纭繚鏃犺璇勪及椤哄簭濡備綍锛屾墍鏈夎法瀵硅薄淇敼閮借兘鍚屾鍒?results銆?
  for (const [objId, result] of results) {
    const baseObj = baseState.objects.find(o => o.id === objId)
    if (!baseObj) continue
    // parentId 鍙樺寲锛氬悓姝?parentId + 鍧愭爣 + flipX锛堝嚭鐢熼檮鍔?娑堜骸鍐掓场/set_parent锛?
    if (result.real.parentId !== baseObj.parentId) {
      ;(result.real as unknown as { parentId: string | undefined }).parentId = baseObj.parentId
      result.real.x = baseObj.x
      result.real.y = baseObj.y
      result.real.scaleX = baseObj.scaleX
      result.real.scaleY = baseObj.scaleY
      result.real.rotation = baseObj.rotation
      ;(result.real as unknown as { flipX: boolean }).flipX = (baseObj as unknown as { flipX?: boolean }).flipX ?? false
    }
    // spawned 鍙樺寲锛氬悓姝?spawned锛坋ntity 绾ц仈鍑虹敓/娑堜骸锛宲arentId 鍙兘涓嶅彉锛?
    if (result.real.spawned !== baseObj.spawned) {
      ;(result.real as unknown as { spawned: boolean }).spawned = (baseObj as unknown as { spawned?: boolean }).spawned !== false
    }

  }

  // 4. 璁＄畻鐩告満鐨?Ghost/Real 鐘舵€?
  const baseCameraState: RuntimeCameraState = {
    x: baseState.camera.x,
    y: baseState.camera.y,
    zoom: baseState.camera.zoom
  }

  const cameraPointActions = actions.filter(a =>
    isCameraPointAction(a) && a.slotIndex === slotIndex
  )

  const cameraDurationActions = actions.filter(a => {
    if (!isCameraDurationAction(a)) return false
    const span = (a as { slotSpan?: number }).slotSpan ?? 1
    return a.slotIndex <= slotIndex && slotIndex < a.slotIndex + span
  })

  let cameraResult: CameraGhostStateResult

  if (cameraPointActions.length > 0) {
    let realCamera = { ...baseCameraState }
    for (const action of cameraPointActions) {
      realCamera = applyActionToCamera(realCamera, action)
    }
    for (const action of cameraDurationActions) {
      realCamera = applyActionToCamera(realCamera, action)
    }
    cameraResult = { ghost: { ...baseCameraState }, real: realCamera }
  }
  else if (cameraDurationActions.length > 0) {
    const earliestCameraAction = cameraDurationActions.reduce((prev, curr) =>
      curr.slotIndex < prev.slotIndex ? curr : prev
    )

    let ghostCameraState: RuntimeCameraState = {
      x: prevContext.camera.x,
      y: prevContext.camera.y,
      zoom: prevContext.camera.zoom
    }
    for (const action of sortedActions) {
      if (action.target !== 'camera') continue
      if (action.slotIndex >= earliestCameraAction.slotIndex) break
      ghostCameraState = applyActionToCamera(ghostCameraState, action)
    }

    let realCamera = { ...baseCameraState }
    for (const action of cameraDurationActions) {
      realCamera = applyActionToCamera(realCamera, action)
    }

    cameraResult = { ghost: ghostCameraState, real: realCamera }
  }
  else {
    cameraResult = { ghost: null, real: baseCameraState }
  }

  const result = {
    objects: results,
    camera: cameraResult,
    renderChain: baseState.renderChain ?? [],
  }
  return result
}

/**
 * 璁＄畻鍦烘櫙鐨勬渶缁堢姸鎬?(鐢ㄤ簬鍦烘櫙缁ф壙)
 * @param scene 鍦烘櫙瀵硅薄
 * @returns 鏈€缁堢殑SceneSetup
 */
export function calculateFinalSceneState(scene: SceneContainer): SceneSetup {
  // 1. 浠庡垵濮婼etup鍒涘缓 RuntimeSceneSnapshot
  let currentState: RuntimeSceneSnapshot = createRuntimeSnapshot(scene.setup)

  // 2. 閬嶅巻鎵€鏈夎剼鏈潡骞跺簲鐢ㄥ姩浣?
  for (const block of scene.script) {
    // forceAllActions = true: 寮哄埗搴旂敤鎵€鏈夊姩浣滅殑鏈€缁堢姸鎬?(蹇界暐鏃堕暱)
    currentState = applyBlockActionsToState(currentState, block, scene, true)
  }

  // 3. 杞洖 SceneSetup锛堟寔涔呭寲鏍煎紡锛?
  return {
    camera: {
      x: currentState.camera.x,
      y: currentState.camera.y,
      width: scene.setup.camera.width,
      height: scene.setup.camera.height,
      zoom: currentState.camera.zoom,
    },
    objects: currentState.objects,
    renderChain: currentState.renderChain,
  }
}

/**
 * 鍒涘缓缁ф壙鐨凷etup (杩囨护鎺?spawn: false 鐨勫璞?
 * @param sourceScene 婧愬満鏅?
 * @returns 鏂板満鏅殑Setup
 */
export function createInheritedSetup(sourceScene: SceneContainer): SceneSetup {
  const finalState = calculateFinalSceneState(sourceScene)

  // 杩囨护瀵硅薄: 绉婚櫎鎵€鏈?spawned 涓?false 鐨勫璞?
  const filteredObjects = finalState.objects.filter(obj => {
    // undefined 榛樿涓?true (v9.3 鍏煎)
    return obj.spawned !== false
  })

  // 杩斿洖鏂扮殑 Setup
  // v19: 缁ф壙 renderChain 骞惰繃婊ゆ帀宸茬Щ闄ょ殑瀵硅薄 ID
  const survivingIds = new Set(filteredObjects.map(o => o.id))
  const inheritedRenderChain = (finalState.renderChain ?? []).filter(id => survivingIds.has(id))
  return {
    camera: finalState.camera,
    objects: filteredObjects,
    renderChain: inheritedRenderChain,
  }
}
