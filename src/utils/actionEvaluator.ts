/**
 * Action 杩愯鏃舵眰鍊煎櫒
 * 鐢ㄤ簬鍦ㄦ瘡涓€甯ф覆鏌撳惊鐜腑锛岃绠楀嚭褰撳墠鏃堕棿鐐逛笅姣忎釜瀵硅薄鐨勬渶缁堝睘鎬х姸鎬?
 * 
 * v6.3 鏇存柊锛?
 * - 绮剧畝 Action 绫诲瀷锛宻et_transform 浠呭寘鍚瑙夊睘鎬?(alpha/visible/flipX/zIndex)
 * - tween_transform 浠呭寘鍚嚑浣曞睘鎬?(x/y/scaleX/scaleY/rotation)
 * 
 * v6.5 鏇存柊锛?
 * - 鏂板 RuntimeCameraState 鎺ュ彛
 * - 鏂板 evaluateCameraState() 鍑芥暟鐢ㄤ簬璁＄畻鐩告満鐘舵€?
 */

import type { SceneObject, ScreenEffectObject } from '@/types/sceneObject'
import type { Action, DurationAction, RuntimeSlot } from '@/types/screenplay'
import { type ActionType, getHandler } from '@/utils/actionHandlers'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'
import { sortActionsForEvaluation } from '@/utils/actionOrder'
import { sortCameraActionsForEvaluation } from '@/utils/cameraActionRules'

/**
 * 杩愯鏃剁浉鏈虹姸鎬?(v6.5)
 * 鐢ㄤ簬 ActionPreviewDialog 涓殑鐩告満鍙樻崲璁＄畻
 */
export interface RuntimeCameraState {
  // 鐩告満浣嶇疆 (鐢诲竷鍧愭爣)
  x: number
  y: number

  // 缂╂斁绾у埆 (1 = 姝ｅ父, >1 = 鏀惧ぇ, <1 = 缂╁皬)
  zoom: number

  // 闇囧姩鍋忕Щ (涓存椂鏁堟灉)
  shakeOffsetX: number
  shakeOffsetY: number
}

function getFollowTargetCenter(
  followTarget: string,
  visualCenters?: Map<string, { x: number, y: number }>,
): { x: number, y: number } | undefined {
  return visualCenters?.get(followTarget)
}

// 缂撳姩鍑芥暟搴?
const EasingFunctions: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
}

/**
 * 璁＄畻鍔ㄤ綔鐨勭粷瀵规椂闂磋寖鍥?(ms)
 * v6.2: 鍩轰簬 slotIndex + slotSpan 鐨勬Ы浣嶆椂闂磋绠?
 */
function getActionTimeRange(
  action: Action,
  slots?: RuntimeSlot[]
): { start: number; end: number; duration: number } {
  let start = 0
  let duration = 0

  if (!slots || slots.length === 0) {
    return { start: 0, end: 0, duration: 0 }
  }

  const slot = slots[action.slotIndex]
  if (slot) {
    start = slot.startTime

    // 鎸佺画鍔ㄤ綔锛氭牴鎹?slotSpan 璁＄畻鏃堕暱
    if (action.category === 'duration') {
      const span = (action as { slotSpan?: number }).slotSpan ?? 1
      for (let i = 0; i < span; i++) {
        const s = slots[action.slotIndex + i]
        if (s) duration += s.duration
      }
    }
  }

  return { start, end: start + duration, duration }
}

/**
 * 绾挎€ф彃鍊?
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/**
 * 鏍稿績锛氳瘎浼板崟涓璞″湪鐗瑰畾鏃堕棿鐐圭殑鐘舵€?
 * @param startState Block寮€濮嬫椂鐨勫垵濮嬬姸鎬?(setup + prevReplay)
 * @param actions 褰撳墠Block鍐呯殑鍔ㄤ綔鍒楄〃 (宸茬瓫閫夊嚭閽堝璇ュ璞＄殑鍔ㄤ綔)
 * @param currentTime 褰撳墠鎾斁鏃堕棿 (ms)
 * @param totalDuration Block鎬绘椂闀?(ms)
 * @param slots 杩愯鏃舵Ы浣嶅垪琛紙鐢ㄤ簬璁＄畻鍔ㄤ綔鏃堕棿鑼冨洿锛?
 */
export function evaluateObjectState(
  startState: SceneObject,
  actions: Action[],
  currentTime: number,
  _totalDuration: number,
  slots?: RuntimeSlot[],
  currentSlotIndex = -1,
  context?: ActionHandlerContext
): SceneObject {

  // 1. 鍏嬮殕鍒濆鐘舵€?
  const baseState = { ...startState } as SceneObject & Record<string, unknown>
  const finalState = { ...startState } as SceneObject & Record<string, unknown>

  // 鐢婚潰鐗规晥锛氭繁鎷疯礉 params 閬垮厤 baseState/finalState 鍏变韩寮曠敤
  if (startState.type === 'screen_effect') {
    const p = (startState as unknown as ScreenEffectObject).params
    if (p) {
      ; (baseState as unknown as ScreenEffectObject).params = { ...p }
        ; (finalState as unknown as ScreenEffectObject).params = { ...p }
    }
  }

  // 2. 鎸夋Ы浣嶇储寮曟帓搴忓姩浣?
  // v17: 鍚?slotIndex 涓?Point Action 鎺掑湪 Duration Action 鍓嶉潰锛堜笌 evaluateObjectStateBySlot 淇濇寔涓€鑷达級
  // 纭繚 set_transform 鍏堝簲鐢紙璁剧疆 transformOrigin 绛夛級锛宼ween_transform 鍚庡熀浜庢璧峰鐘舵€佽繘琛屾彃鍊?
  const sortedActions = sortActionsForEvaluation(actions)

  for (const action of sortedActions) {
    const { start, end, duration } = getActionTimeRange(action, slots)

    // v7.16: Logic replacement - use Slot Index for Control Flow if available
    let isStarted = false
    let isFinished = false

    if (currentSlotIndex !== -1 && slots) {
      // Slot-based logic
      const actionStartSlot = action.slotIndex

      // Point actions happen at the start of the slot
      // Duration actions start at the start of the slot

      if (currentSlotIndex < actionStartSlot) {
        isStarted = false
      } else {
        isStarted = true

        // Check finish condition
        if (action.category === 'point' || duration === 0) {
          isFinished = true
        } else {
          const span = (action as DurationAction).slotSpan ?? 1
          const actionEndSlot = action.slotIndex + span
          if (currentSlotIndex >= actionEndSlot) {
            isFinished = true
          }
        }
      }
    } else {
      // Time-based logic (Fallback)
      if (currentTime >= start) {
        isStarted = true
        if (action.category === 'point' || duration === 0 || currentTime >= end) {
          isFinished = true
        }
      }
    }

    // Apply Logic
    if (!isStarted) continue

    // Instant Action
    if (action.category === 'point' || duration === 0) {
      applyPointAction(baseState, action, context)
      applyPointAction(finalState, action, context)
      continue
    }

    // Duration Action
    if (isFinished) {
      applyDurationActionFinal(baseState, action, context)
      applyDurationActionFinal(finalState, action, context)
    } else {
      // Interpolating
      // For interpolation value, we still rely on time as it provides sub-slot precision
      let progress = 0
      if (duration > 0) {
        progress = (currentTime - start) / duration
      }
      progress = Math.min(1, Math.max(0, progress))

      const easingName = (action as DurationAction).easing ?? 'linear'
      const ease = EasingFunctions[easingName] ?? EasingFunctions['linear']
      const easedProgress = ease ? ease(progress) : progress

      applyDurationActionTween(finalState, baseState, action, easedProgress, context)
    }
  }

  return finalState
}

/**
 * 鏍稿績锛氬熀浜?Slot 璇勪及鍗曚釜瀵硅薄鐨勭姸鎬?(Target State Mode)
 * 涓撶敤浜庡満鏅紪杈戦〉闈?(Action Mode)锛屼笉渚濊禆姣绾ф椂闂达紝鏃犳彃鍊?
 * @param startState Block寮€濮嬫椂鐨勫垵濮嬬姸鎬?
 * @param actions 褰撳墠Block鍐呯殑鍔ㄤ綔鍒楄〃
 * @param currentSlotIndex 褰撳墠妲戒綅绱㈠紩
 * @param slots 杩愯鏃舵Ы浣嶅垪琛?
 */
export function evaluateObjectStateBySlot(
  startState: SceneObject,
  actions: Action[],
  currentSlotIndex: number,
  _slots?: RuntimeSlot[],
  context?: ActionHandlerContext
): SceneObject {

  // 1. 鍏嬮殕鍒濆鐘舵€?
  const finalState = { ...startState } as SceneObject & Record<string, unknown>

  // 鐢婚潰鐗规晥锛氭繁鎷疯礉 params 閬垮厤鍏变韩寮曠敤
  if (startState.type === 'screen_effect') {
    const p = (startState as unknown as ScreenEffectObject).params
    if (p) {
      ; (finalState as unknown as ScreenEffectObject).params = { ...p }
    }
  }

  // 2. 鎸夋Ы浣嶇储寮曟帓搴忓姩浣?
  // v14.1: 鍚?slotIndex 涓?Point Action 鎺掑湪 Duration Action 鍓嶉潰
  // 纭繚 set_transform 鍏堝簲鐢紝tween_transform 鍚庤鐩栵紙鏈€缁堜互 tween 涓哄噯锛?
  const sortedActions = sortActionsForEvaluation(actions)

  for (const action of sortedActions) {
    if (action.slotIndex > currentSlotIndex) {
      continue
    }

    // 只应用当前 Slot 之前已经开始生效的动作状态
    if (action.category === 'point') {
      applyPointAction(finalState, action, context)
    } else {
      applyDurationActionFinal(finalState, action as DurationAction, context)
    }
  }

  return finalState
}

/**
 * 鏍稿績锛氬熀浜?Slot 璇勪及鐩告満鐘舵€?(Target State Mode)
 * 涓撶敤浜庡満鏅紪杈戦〉闈?(Action Mode)锛屼笉渚濊禆姣绾ф椂闂达紝鏃犳彃鍊?
 */
export function evaluateCameraStateBySlot(
  defaultState: RuntimeCameraState,
  actions: Action[],
  _currentSlotIndex: number,
  _slots?: RuntimeSlot[],
  visualCenters?: Map<string, { x: number, y: number }>,
  lastFollowPosition?: { x: number, y: number } | null,
): RuntimeCameraState {

  // 1. 绛涢€夌浉鏈哄姩浣?
  const cameraActions = actions.filter(a => a.target === 'camera')

  // console.log('[Camera Debug] evaluateCameraStateBySlot called:')
  // console.log('[Camera Debug]   _currentSlotIndex:', _currentSlotIndex)
  // console.log('[Camera Debug]   cameraActions count:', cameraActions.length)
  // console.log('[Camera Debug]   cameraActions slotIndexes:', cameraActions.map(a => a.slotIndex))

  if (cameraActions.length === 0) {
    // console.log('[Camera Debug]   No camera actions, returning default state')
    return { ...defaultState, shakeOffsetX: 0, shakeOffsetY: 0 }
  }

  // 2. 鍒濆鐘舵€?
  const finalState: RuntimeCameraState = { ...defaultState, shakeOffsetX: 0, shakeOffsetY: 0 }

  // 3. 鎸夋Ы浣嶇储寮曟帓搴?
  const sortedActions = sortCameraActionsForEvaluation(cameraActions)

  for (const action of sortedActions) {
    // v8.3: 鎭㈠ Slot 闄愬埗锛屼娇鐩告満鏄剧ず褰撳墠 slot 鍓嶇殑绱Н鐘舵€?
    if (action.slotIndex > _currentSlotIndex) {
      // console.log('[Camera Debug]   Skipping action at slotIndex', action.slotIndex, '> currentSlotIndex', _currentSlotIndex)
      continue
    }
    // console.log('[Camera Debug]   Applying action at slotIndex', action.slotIndex, 'type:', action.type)

    // 5. 搴旂敤鍔ㄤ綔鏁堟灉
    // 鐬椂鍔ㄤ綔
    if (action.type === 'camera_cut') {
      if (action.params.x !== undefined) finalState.x = action.params.x
      if (action.params.y !== undefined) finalState.y = action.params.y
      if (action.params.zoom !== undefined) finalState.zoom = action.params.zoom
      continue
    }

    // 鎸佺画鍔ㄤ綔 (鐩存帴搴旂敤鏈€缁堢姸鎬?
    if (action.type === 'camera_move') {
      const params = action.params
      if (params.x !== undefined) finalState.x = params.x
      if (params.y !== undefined) finalState.y = params.y
      if (params.zoom !== undefined) finalState.zoom = params.zoom
    } else if (action.type === 'camera_follow') {
      const params = action.params
      const followTarget = params.followTarget
      const offsetX = params.offsetX ?? 0
      const offsetY = params.offsetY ?? -50

      let finalX = finalState.x
      let finalY = finalState.y

      const targetCenter = getFollowTargetCenter(followTarget, visualCenters)
      if (targetCenter) {
        finalX = targetCenter.x + offsetX
        finalY = targetCenter.y + offsetY
      } else if (lastFollowPosition) {
        finalX = lastFollowPosition.x
        finalY = lastFollowPosition.y
      }

      // v7.21: 杈圭晫绾︽潫 - 淇閬撳叿瀵硅薄璺熼殢鏃剁浉鏈鸿秴鍑虹敾甯冪殑闂
      // 杈圭晫绾︽潫搴旇鍩轰簬鐩告満鑷韩鐨勫昂瀵?鑰屼笉鏄洰鏍囧璞＄殑灏哄
      if (params.constrainBounds) {
        const targetZoom = params.zoom ?? finalState.zoom
        const cameraWidth = CAMERA_BASE_WIDTH / targetZoom
        const cameraHeight = CAMERA_BASE_HEIGHT / targetZoom
        const halfW = cameraWidth / 2
        const halfH = cameraHeight / 2

        // 纭繚鐩告満涓績鐐瑰湪鐢诲竷鑼冨洿鍐?浣跨浉鏈烘涓嶄細瓒呭嚭鐢诲竷杈圭晫
        finalX = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, finalX))
        finalY = Math.max(halfH, Math.min(CANVAS_HEIGHT - halfH, finalY))
      }

      finalState.x = finalX
      finalState.y = finalY
      if (params.zoom !== undefined) {
        finalState.zoom = params.zoom
      }
    }
    // camera_shake 鍦ㄧ紪杈戞ā寮忎笅閫氬父蹇界暐锛屽洜涓哄畠闇€瑕佹椂闂撮┍鍔ㄧ殑闇囧姩鏁堟灉
  }

  return finalState
}

/**
 * 璇勪及瀵硅薄鐨勭洰鏍囩姸鎬?(v7.9)
 * 璁＄畻濡傛灉鎵€鏈夋鍦ㄨ繘琛岀殑鍔ㄤ綔绔嬪嵆瀹屾垚锛屽璞＄殑鏈€缁堢姸鎬?
 */
export function evaluateObjectTargetState(
  currentState: SceneObject,
  actions: Action[],
  currentTime: number,
  _totalDuration: number,
  slots?: RuntimeSlot[],
  currentSlotIndex = -1
): SceneObject | null {

  // 1. 绛涢€夊嚭褰撳墠姝ｅ湪鎵ц鐨?DurationAction
  const activeActions = actions.filter(action => {
    // 蹇呴』鏄寔缁姩浣?
    if (action.category !== 'duration') return false

    // v7.16: Slot logic
    if (currentSlotIndex !== -1 && slots) {
      const span = (action as unknown as { slotSpan?: number }).slotSpan ?? 1
      const startSlot = action.slotIndex
      const endSlot = action.slotIndex + span
      return currentSlotIndex >= startSlot && currentSlotIndex < endSlot
    }

    const { start, end } = getActionTimeRange(action, slots)
    return currentTime >= start && currentTime < end
  })

  if (activeActions.length === 0) {
    return null
  }

  // 2. 鍩轰簬褰撳墠鐘舵€侊紝搴旂敤鎵€鏈夋鍦ㄨ繘琛岀殑鍔ㄤ綔鐨勬渶缁堟晥鏋?
  const targetState = { ...currentState } as SceneObject & Record<string, unknown>

  // 鎸夋Ы浣嶆帓搴忥紝纭繚瑕嗙洊椤哄簭姝ｇ‘
  activeActions.sort((a, b) => a.slotIndex - b.slotIndex)

  // v7.10: 娣峰悎澶勭悊 Point Action 鍜?Duration Action
  // 鍘熷垯锛?
  // 1. Point Action 搴旇鍦?Duration Action 涔嬪墠琚鏌ュ拰搴旂敤 (濡傛灉瀹冧滑閮藉湪鍚屼竴涓?Slot)
  //    鍥犱负 Point Action 閫氬父鏄灛鏃剁殑鐘舵€佸彉鏇达紙濡傝缃垵濮嬩綅缃€佸垏鎹㈣〃鎯咃級锛岃€?Duration Action 鏄熀浜庤繖涓垵濮嬬姸鎬佽繘琛岀殑娓愬彉銆?
  //    濡傛灉 Duration Action 鐢熸晥锛屽畠鐨勬渶缁堢姸鎬佸簲璇ヨ鐩?Point Action 鐨勮缃紙閽堝鐩稿悓灞炴€э級銆?
  // 2. Preroll Slot 鐨?Duration Action 涔熼渶瑕佽澶勭悊銆?

  // 鏀堕泦褰撳墠 Slot 鐨?Point Actions
  const currentSlotPointActions = actions.filter(action => {
    if (action.category !== 'point') return false

    // v7.16: Slot logic
    if (currentSlotIndex !== -1 && slots) {
      return action.slotIndex === currentSlotIndex
    }

    const { start } = getActionTimeRange(action, slots)
    return start >= currentTime // 绠€鍗曞垽瀹氾細灞炰簬褰撳墠鏃堕棿绐楀彛涔嬪悗锛堝惈锛?
  })

  // 鍚堝苟鍒楄〃骞舵寜 slotIndex 鎺掑簭锛屽鏋?slotIndex 鐩稿悓锛岃 Point Action 鎺掑湪 Duration Action 鍓嶉潰
  const allTargetActions = [...activeActions, ...currentSlotPointActions].sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) {
      return a.slotIndex - b.slotIndex
    }
    // slotIndex 鐩稿悓锛孭oint Action 浼樺厛
    const aIsPoint = a.category === 'point'
    const bIsPoint = b.category === 'point'
    if (aIsPoint && !bIsPoint) return -1
    if (!aIsPoint && bIsPoint) return 1
    return 0
  })

  for (const action of allTargetActions) {
    if (action.category === 'point') {
      // 搴旂敤鐬椂鍔ㄤ綔
      applyPointAction(targetState, action)
    } else {
      // 搴旂敤鎸佺画鍔ㄤ綔鏈€缁堢姸鎬?
      applyDurationActionFinal(targetState, action as DurationAction)
    }
  }

  return targetState
}

// 鐢诲竷鍜岀浉鏈哄父閲忥紙浠庣粺涓€甯搁噺鏂囦欢瀵煎叆锛?
import {
  CAMERA_BASE_HEIGHT,
  CAMERA_BASE_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH
} from '@/constants/canvas'

/**
 * 璁＄畻鐩告満鍦ㄧ壒瀹氭椂闂寸偣鐨勭姸鎬?(v6.6)
 * @param defaultState 鐩告満榛樿鐘舵€?
 * @param actions 褰撳墠Block鍐呯殑鎵€鏈夊姩浣滃垪琛?
 * @param currentTime 褰撳墠鎾斁鏃堕棿 (ms)
 * @param totalDuration Block鎬绘椂闀?(ms)
 * @param slots 杩愯鏃舵Ы浣嶅垪琛?
 * @param visualCenters 瀵硅薄瑙嗚涓績浣嶇疆鏄犲皠锛堢敤浜庤窡闅忓姩浣滆绠楋級
 * @param lastFollowPosition 涓婁竴娆¤窡闅忎綅缃紙鐢ㄤ簬鐩爣娑堝け鏃朵繚鎸佷綅缃級
 */
export function evaluateCameraState(
  defaultState: RuntimeCameraState,
  actions: Action[],
  currentTime: number,
  _totalDuration: number,
  slots?: RuntimeSlot[],
  visualCenters?: Map<string, { x: number, y: number }>,
  lastFollowPosition?: { x: number, y: number } | null,
  frameDeltaMs = 16.67,
  previousFrameState?: RuntimeCameraState | null,
  currentSlotIndex = -1 // v7.16
): RuntimeCameraState {
  // 绛涢€夌浉鏈哄姩浣?
  const cameraActions = actions.filter(a => a.target === 'camera')

  if (cameraActions.length === 0) {
    return { ...defaultState, shakeOffsetX: 0, shakeOffsetY: 0 }
  }

  // 鍒濆鐘舵€?
  const baseState: RuntimeCameraState = { ...defaultState, shakeOffsetX: 0, shakeOffsetY: 0 }
  const finalState: RuntimeCameraState = { ...defaultState, shakeOffsetX: 0, shakeOffsetY: 0 }

  // 鎸夋Ы浣嶇储寮曟帓搴?
  const sortedActions = sortCameraActionsForEvaluation(cameraActions)

  for (const action of sortedActions) {
    const { start, end, duration } = getActionTimeRange(action, slots)

    // v7.16: Logic replacement - use Slot Index for Control Flow
    let isStarted = false
    let isFinished = false

    if (currentSlotIndex !== -1 && slots) {
      const actionStartSlot = action.slotIndex
      if (currentSlotIndex < actionStartSlot) {
        isStarted = false
      } else {
        isStarted = true
        if (action.category === 'point' || duration === 0) {
          isFinished = true
        } else {
          const span = (action as DurationAction).slotSpan ?? 1
          const actionEndSlot = action.slotIndex + span
          if (currentSlotIndex >= actionEndSlot) {
            isFinished = true
          }
        }
      }
    } else {
      // Time-based
      if (currentTime >= start) {
        isStarted = true
        if (action.category === 'point' || duration === 0 || currentTime >= end) {
          isFinished = true
        }
      }
    }

    if (!isStarted) continue

    // 鐬椂鍔ㄤ綔 (camera_cut)
    if (action.category === 'point' || duration === 0) {
      if (action.type === 'camera_cut') {
        // v6.6: 娣诲姞 undefined 妫€鏌ワ紝淇濈暀鍘熸湁鍊?
        if (action.params.x !== undefined) {
          baseState.x = action.params.x
          finalState.x = action.params.x
        }
        if (action.params.y !== undefined) {
          baseState.y = action.params.y
          finalState.y = action.params.y
        }
        if (action.params.zoom !== undefined) {
          baseState.zoom = action.params.zoom
          finalState.zoom = action.params.zoom
        }
      }
      continue
    }

    // 鎸佺画鍔ㄤ綔
    if (isFinished) {
      // 鍔ㄤ綔宸插畬鎴?
      if (action.type === 'camera_move') {
        const params = action.params
        if (params.x !== undefined) baseState.x = params.x
        if (params.y !== undefined) baseState.y = params.y
        if (params.zoom !== undefined) baseState.zoom = params.zoom
        finalState.x = baseState.x
        finalState.y = baseState.y
        finalState.zoom = baseState.zoom
      } else if (action.type === 'camera_follow') {
        // v6.7: camera_follow 瀹屾垚鍚庯紝鐩告満鍋滅暀鍦ㄦ渶鍚庝綅缃紙涓嶅啀璺熼殢锛?
        const params = action.params
        const followTarget = params.followTarget
        const offsetX = params.offsetX ?? 0
        const offsetY = params.offsetY ?? -50

        let finalX = baseState.x
        let finalY = baseState.y

        // 浼樺厛浣跨敤褰撳墠鎻愪緵鐨勮瑙変腑蹇冭绠楁渶鍚庝綅缃?
        const targetCenter = getFollowTargetCenter(followTarget, visualCenters)
        if (targetCenter) {
          finalX = targetCenter.x + offsetX
          finalY = targetCenter.y + offsetY
        } else if (lastFollowPosition) {
          finalX = lastFollowPosition.x
          finalY = lastFollowPosition.y
        }

        // v7.21: 杈圭晫绾︽潫 - 淇閬撳叿瀵硅薄璺熼殢鏃剁浉鏈鸿秴鍑虹敾甯冪殑闂
        // 杈圭晫绾︽潫搴旇鍩轰簬鐩告満鑷韩鐨勫昂瀵?鑰屼笉鏄洰鏍囧璞＄殑灏哄
        if (params.constrainBounds) {
          const targetZoom = params.zoom ?? baseState.zoom
          const cameraWidth = CAMERA_BASE_WIDTH / targetZoom
          const cameraHeight = CAMERA_BASE_HEIGHT / targetZoom
          const halfW = cameraWidth / 2
          const halfH = cameraHeight / 2

          // 纭繚鐩告満涓績鐐瑰湪鐢诲竷鑼冨洿鍐?浣跨浉鏈烘涓嶄細瓒呭嚭鐢诲竷杈圭晫
          finalX = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, finalX))
          finalY = Math.max(halfH, Math.min(CANVAS_HEIGHT - halfH, finalY))
        }

        baseState.x = finalX
        baseState.y = finalY
        finalState.x = finalX
        finalState.y = finalY

        // zoom 淇濇寔鏈€鍚庤缃殑鍊?
        if (params.zoom !== undefined) {
          baseState.zoom = params.zoom
          finalState.zoom = params.zoom
        }
      }
      // camera_shake 瀹屾垚鍚庝笉褰卞搷鍩虹鐘舵€?
    } else {
      // 鍔ㄤ綔杩涜涓?
      let progress = (currentTime - start) / duration
      progress = Math.min(1, Math.max(0, progress))

      const easingName = (action as DurationAction).easing ?? 'linear'
      const ease = EasingFunctions[easingName] ?? EasingFunctions['linear']
      const easedProgress = ease ? ease(progress) : progress

      if (action.type === 'camera_move') {
        const moveAction = action as unknown as { params: { x?: number, y?: number, zoom?: number } }
        const params = moveAction.params
        if (params.x !== undefined) {
          finalState.x = lerp(baseState.x, params.x, easedProgress)
        }
        if (params.y !== undefined) {
          finalState.y = lerp(baseState.y, params.y, easedProgress)
        }
        if (params.zoom !== undefined) {
          finalState.zoom = lerp(baseState.zoom, params.zoom, easedProgress)
        }
      } else if (action.type === 'camera_shake') {
        // 闇囧姩鏁堟灉璁＄畻
        const shakeAction = action as unknown as { params: { intensity?: number, frequency?: number, decay?: boolean } }
        const params = shakeAction.params
        let intensity = params.intensity ?? 10
        const frequency = params.frequency ?? 30

        // 琛板噺鏁堟灉
        if (params.decay) {
          intensity *= (1 - easedProgress)
        }

        // 鍩轰簬鏃堕棿鍜岄鐜囪绠楅渿鍔ㄥ亸绉伙紙浣跨敤姝ｅ鸡娉級
        const elapsed = currentTime - start
        const phase = (elapsed / 1000) * frequency * Math.PI * 2

        // 浣跨敤澶氫釜姝ｅ鸡娉㈠彔鍔犱骇鐢熸洿鑷劧鐨勯渿鍔ㄦ晥鏋?
        finalState.shakeOffsetX = intensity * (
          Math.sin(phase) * 0.6 +
          Math.sin(phase * 1.7) * 0.3 +
          Math.sin(phase * 2.3) * 0.1
        )
        finalState.shakeOffsetY = intensity * (
          Math.cos(phase * 0.9) * 0.6 +
          Math.cos(phase * 1.5) * 0.3 +
          Math.cos(phase * 2.1) * 0.1
        )
      } else if (action.type === 'camera_follow' && visualCenters) {
        // 璺熼殢鍔ㄤ綔璁＄畻 (v6.6, v15: smooth entry + 鑷姩鎺ㄦ媺)
        const followAction = action as unknown as { params: { followTarget: string, damping?: number, offsetX?: number, offsetY?: number, zoom?: number, smoothEntry?: boolean, smoothEntryDuration?: number, autoZoom?: boolean, autoZoomRange?: number, autoZoomCycles?: number, constrainBounds?: boolean } }
        const params = followAction.params
        const followTarget = params.followTarget
        const offsetX = params.offsetX ?? 0
        const offsetY = params.offsetY ?? -50  // 榛樿鍋忕Щ锛岃浜虹墿绋嶅井鍋忎笅
        const damping = Math.max(0, params.damping ?? 0)
        const targetZoom = params.zoom  // 鍙€夌殑 zoom 鍙傛暟
        const smoothEntry = params.smoothEntry ?? false  // v15: 榛樿涓嶅惎鐢ㄥ钩婊戝叆鍦?
        const smoothEntryDuration = params.smoothEntryDuration ?? 300  // v15: 榛樿 300ms
        const constrainBounds = params.constrainBounds ?? false  // v6.9: 杈圭晫绾︽潫

        // v6.6: 鑾峰彇璺熼殢鐩爣鐨勮瑙変腑蹇冧綅缃?
        const targetCenter = getFollowTargetCenter(followTarget, visualCenters)

        // 璁＄畻鐩爣浣嶇疆
        let targetX: number
        let targetY: number

        if (targetCenter) {
          // 鐩爣鍙锛岀洿鎺ヤ娇鐢ㄨ瑙変腑蹇冧綅缃?
          targetX = targetCenter.x + offsetX
          targetY = targetCenter.y + offsetY
        } else if (lastFollowPosition) {
          // 鐩爣涓嶅彲瑙侊紝淇濇寔鏈€鍚庝綅缃?
          targetX = lastFollowPosition.x
          targetY = lastFollowPosition.y
        } else {
          // 娌℃湁鐩爣淇℃伅锛屼繚鎸佸綋鍓嶇浉鏈轰綅缃?
          targetX = baseState.x
          targetY = baseState.y
        }

        // v15: 骞虫粦鍏ュ満 vs 鐬棿鍒囨崲
        let newX: number
        let newY: number
        let newZoom = baseState.zoom
        const elapsed = currentTime - start

        if (smoothEntry && elapsed < smoothEntryDuration) {
          // 骞虫粦鍏ュ満锛氫粠 baseState 浣嶇疆鎻掑€煎埌鐩爣浣嶇疆
          const entryProgress = Math.min(1, elapsed / smoothEntryDuration)
          // easeOutCubic: 蹇€熸帴杩戠洰鏍囷紝灏鹃儴鍑忛€?
          const eased = 1 - Math.pow(1 - entryProgress, 3)
          newX = lerp(baseState.x, targetX, eased)
          newY = lerp(baseState.y, targetY, eased)
          if (targetZoom !== undefined) {
            newZoom = lerp(baseState.zoom, targetZoom, eased)
          }
        } else {
          // damping 闇€瑕佷互涓婁竴甯х浉鏈虹姸鎬佷负璧风偣锛屽惁鍒欐瘡甯ч兘浼氫粠鍧楄捣濮嬬姸鎬侀噸鏂版彃鍊?
          if (damping > 0) {
            const factor = Math.min(1, Math.max(0, frameDeltaMs / damping))
            const dampingStartX = previousFrameState?.x ?? finalState.x
            const dampingStartY = previousFrameState?.y ?? finalState.y
            const dampingStartZoom = params.autoZoom
              ? (targetZoom ?? finalState.zoom)
              : (previousFrameState?.zoom ?? finalState.zoom)
            newX = lerp(dampingStartX, targetX, factor)
            newY = lerp(dampingStartY, targetY, factor)
            if (targetZoom !== undefined) {
              newZoom = lerp(dampingStartZoom, targetZoom, factor)
            }
          } else {
            newX = targetX
            newY = targetY
            if (targetZoom !== undefined) {
              newZoom = targetZoom
            }
          }
        }

        // v15: 鑷姩鎺ㄦ媺锛堟寮︽尝缂╂斁鎸崱锛?
        const baseZoomBeforeAutoZoom = newZoom
        if (params.autoZoom && baseZoomBeforeAutoZoom > 0) {
          const range = params.autoZoomRange ?? 5
          const cycles = params.autoZoomCycles ?? 0.5
          const amplitude = baseZoomBeforeAutoZoom * (range / 100)
          const actionDuration = end - start
          if (actionDuration > 0 && cycles > 0) {
            const cycleDuration = actionDuration / cycles
            const phase = (elapsed / cycleDuration) * Math.PI * 2
            newZoom = Math.max(0.1, baseZoomBeforeAutoZoom + amplitude * Math.sin(phase))
          }
        }

        // v7.21: 杈圭晫绾︽潫 - 淇閬撳叿瀵硅薄璺熼殢鏃剁浉鏈鸿秴鍑虹敾甯冪殑闂
        // 杈圭晫绾︽潫搴旇鍩轰簬鐩告満鑷韩鐨勫昂瀵?鑰屼笉鏄洰鏍囧璞＄殑灏哄
        if (constrainBounds) {
          // 鏍规嵁 zoom 璁＄畻鐩告満瀹為檯灏哄
          const cameraWidth = CAMERA_BASE_WIDTH / newZoom
          const cameraHeight = CAMERA_BASE_HEIGHT / newZoom
          const halfW = cameraWidth / 2
          const halfH = cameraHeight / 2

          // 纭繚鐩告満涓績鐐瑰湪鐢诲竷鑼冨洿鍐?浣跨浉鏈烘涓嶄細瓒呭嚭鐢诲竷杈圭晫
          newX = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, newX))
          newY = Math.max(halfH, Math.min(CANVAS_HEIGHT - halfH, newY))
        }

        finalState.x = newX
        finalState.y = newY
        finalState.zoom = newZoom
        // v15: 鍚屾鏇存柊 baseState锛岀‘淇濆悗缁姩浣滐紙濡傜浜屼釜 camera_follow 鐨?smooth entry锛?
        // 浠庡綋鍓嶈窡闅忎綅缃紑濮嬭繃娓★紝鑰岄潪浠庤窡闅忓姩浣滃紑濮嬪墠鐨勪綅缃?
        baseState.x = newX
        baseState.y = newY
        baseState.zoom = newZoom
      }
    }
  }

  return finalState
}

/**
 * 璇勪及鐩告満鐨勭洰鏍囩姸鎬?(v7.9)
 * 璁＄畻濡傛灉鎵€鏈夋鍦ㄨ繘琛岀殑鍔ㄤ綔绔嬪嵆瀹屾垚锛岀浉鏈虹殑鏈€缁堢姸鎬?
 */
export function evaluateCameraTargetState(
  currentState: RuntimeCameraState,
  actions: Action[],
  currentTime: number,
  _totalDuration: number,
  slots?: RuntimeSlot[],
  visualCenters?: Map<string, { x: number, y: number }>,
  lastFollowPosition?: { x: number, y: number } | null,
  currentSlotIndex = -1 // v7.16
): RuntimeCameraState | null {

  // 1. 绛涢€夊嚭褰撳墠姝ｅ湪鎵ц鐨?DurationAction (閽堝鐩告満)
  const activeActions = actions.filter(action => {
    if (action.target !== 'camera') return false
    if (action.category !== 'duration') return false

    // v7.16: Slot logic
    if (currentSlotIndex !== -1 && slots) {
      const span = (action as unknown as { slotSpan?: number }).slotSpan ?? 1
      const startSlot = action.slotIndex
      const endSlot = action.slotIndex + span
      // Active: start <= current < end
      return currentSlotIndex >= startSlot && currentSlotIndex < endSlot
    }

    const { start, end } = getActionTimeRange(action, slots)
    return currentTime >= start && currentTime < end
  })

  if (activeActions.length === 0) {
    return null
  }

  // 2. 璁＄畻鐩爣鐘舵€?
  const targetState: RuntimeCameraState = { ...currentState, shakeOffsetX: 0, shakeOffsetY: 0 }

  activeActions.sort((a, b) => a.slotIndex - b.slotIndex)

  for (const action of activeActions) {
    if (action.type === 'camera_move') {
      const moveAction = action as unknown as { params: { x?: number, y?: number, zoom?: number } }
      const params = moveAction.params
      if (params.x !== undefined) targetState.x = params.x
      if (params.y !== undefined) targetState.y = params.y
      if (params.zoom !== undefined) targetState.zoom = params.zoom
    } else if (action.type === 'camera_follow') {
      // camera_follow 鐨勭洰鏍囩姸鎬佽绠楅€昏緫
      const followAction = action as unknown as { params: { followTarget: string, damping?: number, offsetX?: number, offsetY?: number, zoom?: number, constrainBounds?: boolean } }
      const params = followAction.params
      const followTarget = params.followTarget
      const offsetX = params.offsetX ?? 0
      const offsetY = params.offsetY ?? -50

      let finalX = targetState.x
      let finalY = targetState.y

      // 浣跨敤褰撳墠鐨?visualCenters (鍋囪鐩爣鏈韩鐨勪綅缃湪鍔ㄤ綔缁撴潫鏃跺彲鑳戒篃浼氬彉锛屼絾杩欓噷鍙兘鍙栧埌褰撳墠鐨勫弬鑰冪偣)
      // 涓ユ牸鏉ヨ锛宑amera_follow 鐨勭洰鏍囦綅缃緷璧栦簬鐩爣瀵硅薄鐨勪綅缃€?
      // 濡傛灉鐩爣瀵硅薄涔熷湪绉诲姩锛岄偅涔堢浉鏈哄姩浣滅粨鏉熸椂鐨勭洰鏍囦綅缃叾瀹炴槸 (鐩爣瀵硅薄鐨勬渶缁堜綅缃?+ offset)銆?
      // 浣嗚繖閲屼负浜嗙畝鍖栵紝鎴戜滑鍏堜娇鐢ㄥ綋鍓嶄紶鍏ョ殑 visualCenters (瀹冨彲鑳芥槸褰撳墠甯х殑浣嶇疆锛屼篃鍙兘鏄紶鍏ョ殑鐩爣浣嶇疆)
      // 鏇村ソ鐨勫仛娉曟槸鍦ㄨ皟鐢ㄦ鍑芥暟鍓嶏紝鍏堣绠楀ソ鎵€鏈夊璞＄殑 TargetState锛屽苟浣滀负 visualCenters 浼犲叆銆?
      const targetCenter = getFollowTargetCenter(followTarget, visualCenters)
      if (targetCenter) {
        finalX = targetCenter.x + offsetX
        finalY = targetCenter.y + offsetY
      } else if (lastFollowPosition) {
        finalX = lastFollowPosition.x
        finalY = lastFollowPosition.y
      }

      // v7.21: 杈圭晫绾︽潫 - 淇閬撳叿瀵硅薄璺熼殢鏃剁浉鏈鸿秴鍑虹敾甯冪殑闂
      // 杈圭晫绾︽潫搴旇鍩轰簬鐩告満鑷韩鐨勫昂瀵?鑰屼笉鏄洰鏍囧璞＄殑灏哄
      if (params.constrainBounds) {
        const targetZoom = params.zoom ?? targetState.zoom
        const cameraWidth = CAMERA_BASE_WIDTH / targetZoom
        const cameraHeight = CAMERA_BASE_HEIGHT / targetZoom
        const halfW = cameraWidth / 2
        const halfH = cameraHeight / 2

        // 纭繚鐩告満涓績鐐瑰湪鐢诲竷鑼冨洿鍐?浣跨浉鏈烘涓嶄細瓒呭嚭鐢诲竷杈圭晫
        finalX = Math.max(halfW, Math.min(CANVAS_WIDTH - halfW, finalX))
        finalY = Math.max(halfH, Math.min(CANVAS_HEIGHT - halfH, finalY))
      }

      targetState.x = finalX
      targetState.y = finalY
      if (params.zoom !== undefined) {
        targetState.zoom = params.zoom
      }
    }
    // camera_shake 娌℃湁鏄庣‘鐨勨€滅洰鏍囩姸鎬佲€濇蹇碉紝閫氬父褰掗浂鎴栧拷鐣?
  }

  return targetState
}

/**
 * 搴旂敤鐬椂鍔ㄤ綔 (v6.3)
 * v8.6 P2: 浣跨敤 Handler Registry 缁熶竴澶勭悊
 * set_transform: 瑙嗚灞炴€?(alpha, visible, flipX, zIndex)
 * set_character: 瑙嗚灞炴€?+ 瑙掕壊鐘舵€?(pose, expression)
 */
function applyPointAction(state: WriteableState, action: Action, context?: ActionHandlerContext) {
  const handler = getHandler(action.type as ActionType)
  if (handler) {
    handler.applyToState(state, action, context)
  }
}

/**
 * 搴旂敤鎸佺画鍔ㄤ綔鐨勬渶缁堝€硷紙鍔ㄤ綔缁撴潫鍚庯級(v6.3)
 * v17: 缁熶竴濮旀墭缁?Handler锛坱ween_transform 闇€瑕?context 鐢ㄤ簬鍏ㄥ眬鈫掓湰鍦板潗鏍囪浆鎹級
 */
function applyDurationActionFinal(state: WriteableState, action: DurationAction, context?: ActionHandlerContext) {
  if (action.type === 'camera_move') {
    // 鐩告満鍔ㄤ綔锛氱洿鎺ヨ祴鍊硷紙鏃犲潗鏍囩郴杞崲闇€姹傦級
    const params = action.params
    if (params.x !== undefined) state.x = params.x
    if (params.y !== undefined) state.y = params.y
    if (params.zoom !== undefined) state.zoom = params.zoom
  } else {
    // tween_transform / tween_screen_effect 绛夛細缁熶竴濮旀墭缁?Handler
    const handler = getHandler(action.type as ActionType)
    if (handler) {
      handler.applyToState(state, action, context)
    }
  }
}

/**
 * 搴旂敤鎸佺画鍔ㄤ綔鐨勬彃鍊硷紙鍔ㄤ綔杩涜涓級(v6.3)
 * v17: 缁熶竴濮旀墭缁?Handler锛坱ween_transform 闇€瑕?context 鐢ㄤ簬鍏ㄥ眬绌洪棿鎻掑€硷級
 */
function applyDurationActionTween(
  finalState: WriteableState,
  baseState: WriteableState,
  action: DurationAction,
  progress: number,
  context?: ActionHandlerContext
) {
  if (action.type === 'camera_move') {
    // 鐩告満杩愰暅锛氱洿鎺?lerp锛堟棤鍧愭爣绯昏浆鎹㈤渶姹傦級
    const moveAction = action as unknown as { params: { x?: number, y?: number, zoom?: number } }
    const params = moveAction.params
    if (params.x !== undefined) {
      finalState.x = lerp(baseState.x!, params.x, progress)
    }
    if (params.y !== undefined) {
      finalState.y = lerp(baseState.y!, params.y, progress)
    }
    if (params.zoom !== undefined) {
      finalState.zoom = lerp((baseState.zoom!) ?? 1, params.zoom, progress)
    }
  }
  else if (action.type === 'camera_shake') {
    // 鐩告満鎶栧姩锛氶殢鏈哄亸绉?
    const shakeAction = action as unknown as { params: { intensity: number, decay?: boolean } }
    const params = shakeAction.params
    let intensity = params.intensity
    if (params.decay) {
      intensity *= (1 - progress)
    }
    const angle = Math.random() * Math.PI * 2
    finalState.shakeOffsetX = Math.cos(angle) * intensity * (Math.random() * 0.5 + 0.5)
    finalState.shakeOffsetY = Math.sin(angle) * intensity * (Math.random() * 0.5 + 0.5)
  }
  else {
    // tween_transform / tween_screen_effect 绛夛細缁熶竴濮旀墭缁?Handler 鐨?interpolate
    const handler = getHandler(action.type as ActionType)
    if (handler?.interpolate) {
      handler.interpolate(
        finalState,
        action,
        progress,
        baseState,
        context
      )
    }
  }
}
