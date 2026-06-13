/**
 * 槽位工具函数 (v6.2)
 * 负责将 Block 的文本和 TTS 配置转换为 RuntimeSlot 列表
 */

import type { Action, BaseDurationAction, DisplaySlot, RuntimeSlot, ScriptBlock } from '@/types/screenplay'

/**
 * 清洗字幕显示文本：只移除内部控制符，保留正常标点以避免改变语义
 * 用于预览/播放时的字幕渲染
 */
export function cleanTextForSubtitle(text: string): string {
  return text.replace(/#/g, '')
}

const STRONG_SUBTITLE_BREAK_REGEX = /[。.！!？?…]/
const SUBTITLE_LENGTH_PUNCTUATION_REGEX = /[，,。.！!？?…;；:：#\s]/g
const DISPLAY_SEPARATOR_SUFFIX_REGEX = /[，,。.！!？?…;；:：\n#]+$/
const MIN_STRONG_SEGMENT_CHARS = 4
const MIN_WEAK_SEGMENT_CHARS = 14
const MAX_SEGMENT_CHARS = 24

function getSubtitleReadableLength(text: string): number {
  return text.replace(SUBTITLE_LENGTH_PUNCTUATION_REGEX, '').length
}

function shouldFlushDisplaySegment(buffer: string, separator: string): boolean {
  const length = getSubtitleReadableLength(buffer)
  if (length === 0) return false
  if (separator.includes('\n')) return true
  if (length >= MAX_SEGMENT_CHARS) return true
  if (STRONG_SUBTITLE_BREAK_REGEX.test(separator)) return length >= MIN_STRONG_SEGMENT_CHARS
  if (separator.replace(/#/g, '').length === 0) return false
  return length >= MIN_WEAK_SEGMENT_CHARS
}

/**
 * 构建字幕显示槽位。
 * 只显示 subtitle slot。# 仅作为隐藏控制符，不参与显示层断句或合并。
 */
export function buildSubtitleDisplaySlots(slots: RuntimeSlot[]): RuntimeSlot[] {
  const subtitleSlots = slots.filter(slot => slot.type === 'subtitle')
  const displaySlots: RuntimeSlot[] = []
  let bufferText = ''
  let bufferStartTime = 0
  let bufferDuration = 0

  const pushDisplaySlot = (): void => {
    const text = bufferText.trim()
    if (!text) return

    const length = getSubtitleReadableLength(text)
    const previous = displaySlots[displaySlots.length - 1]
    const shouldMergeTrailingShortSegment = Boolean(previous)
      && length > 0
      && length < MIN_STRONG_SEGMENT_CHARS
      && getSubtitleReadableLength(previous?.text ?? '') + length <= MAX_SEGMENT_CHARS

    if (shouldMergeTrailingShortSegment && previous) {
      previous.text = `${previous.text ?? ''}${text}`
      previous.duration += bufferDuration
    } else {
      displaySlots.push({
        type: 'subtitle',
        index: displaySlots.length,
        text,
        startTime: bufferStartTime,
        duration: bufferDuration,
        isEstimated: true,
      })
    }

    bufferText = ''
    bufferDuration = 0
  }

  for (const slot of subtitleSlots) {
    if (!bufferText) {
      bufferStartTime = slot.startTime
    }

    bufferText += slot.text ?? ''
    bufferDuration += slot.duration

    const separator = (DISPLAY_SEPARATOR_SUFFIX_REGEX.exec(bufferText))?.[0] ?? ''
    if (shouldFlushDisplaySegment(bufferText, separator)) {
      pushDisplaySlot()
    }
  }

  pushDisplaySlot()
  return displaySlots
}

/**
 * 获取指定 Block 局部时间应显示的字幕文本。
 * 供 ScenePlayer 和视频导出共用，避免两端字幕切分/清洗规则漂移。
 */
export function getSubtitleTextAtTime(block: ScriptBlock, slots: RuntimeSlot[], localTime: number): string {
  if (block.type === 'action') {
    return ''
  }

  const subtitleSlots = buildSubtitleDisplaySlots(slots)
  if (subtitleSlots.length === 0) {
    return cleanTextForSubtitle(block.text ?? '')
  }

  for (const slot of subtitleSlots) {
    const slotEndTime = slot.startTime + slot.duration
    if (localTime >= slot.startTime && localTime < slotEndTime) {
      return cleanTextForSubtitle(slot.text ?? '')
    }
  }

  return ''
}

/**
 * 将文本切分为槽位
 * 根据标点符号将文本切分为多个分句，每个分句对应一个槽位
 * v6.10 更新：自动添加 preroll 和 postroll slot
 * 
 * @param block 脚本块
 * @returns RuntimeSlot 数组
 */
export function parseBlockToSlots(block: ScriptBlock): RuntimeSlot[] {
  if (block.type === 'action') {
    // ActionBlock 默认只有一个槽位
    return [{
      type: 'subtitle',
      index: 0,
      startTime: 0,
      duration: block.duration,
      text: ''
    }]
  }

  const text = block.text || ''
  const ttsConfig = block.ttsConfig as unknown as { duration?: number }
  const totalDuration = ttsConfig?.duration ?? (text.length * 250) // 兆底时长: 每字250ms

  // 如果文本为空，返回空数组
  if (!text.trim()) {
    return []
  }

  // 统一使用估算模式：按标点符号分句 + 字数比例估算
  const subtitleSlots = splitTextToSlotsByPunctuation(text, totalDuration)
  return addPrerollPostrollEstimated(subtitleSlots, totalDuration)
}

/**
 * 为估算的字幕槽位添加 preroll 和 postroll slot
 * 预留固定时间作为 preroll/postroll
 * @param subtitleSlots 字幕槽位数组
 * @param totalDuration Block 总时长
 */
function addPrerollPostrollEstimated(subtitleSlots: RuntimeSlot[], totalDuration: number): RuntimeSlot[] {
  if (subtitleSlots.length === 0) return []

  // 默认 preroll/postroll 时长固定为 100ms
  const estimatedDuration = 100

  const result: RuntimeSlot[] = []
  let currentIndex = 0

  // 1. 添加 preroll slot
  result.push({
    type: 'preroll',
    index: currentIndex++,
    startTime: 0,
    duration: estimatedDuration,
    isEstimated: true
  })

  // 2. 添加 subtitle slots (更新 index，调整 startTime)
  const availableDuration = totalDuration - estimatedDuration * 2
  const originalTotalDuration = subtitleSlots.reduce((sum, s) => sum + s.duration, 0)
  const ratio = availableDuration / originalTotalDuration

  let currentTime = estimatedDuration
  for (const slot of subtitleSlots) {
    const adjustedDuration = Math.floor(slot.duration * ratio)
    result.push({
      ...slot,
      type: 'subtitle',
      index: currentIndex++,
      startTime: currentTime,
      duration: adjustedDuration,
      isEstimated: true
    })
    currentTime += adjustedDuration
  }

  // 3. 添加 postroll slot
  result.push({
    type: 'postroll',
    index: currentIndex++,
    startTime: currentTime,
    duration: totalDuration - currentTime,
    isEstimated: true
  })

  return result
}

/**
 * 按标点符号分句 + 字数比例估算时长。
 * Slot 是动作时间锚点，拆分规则必须稳定：所有分句标点和静默分句符 # 都创建 Slot。
 */
function splitTextToSlotsByPunctuation(text: string, totalDuration: number): RuntimeSlot[] {
  const punctuationRegex = /[，,。.！!？?…;；:：\n#]+/
  const parts = text.split(punctuationRegex)
  const separators = text.match(new RegExp(punctuationRegex.source, 'g')) ?? []
  const contentSegments: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = (parts[i] ?? '').trim()
    if (!part) continue

    const separator = separators[i] ?? ''
    contentSegments.push(part + separator)
  }

  // 如果没有有效分句，整句作为一个 Slot
  if (contentSegments.length === 0 && text.trim()) {
    return [{
      type: 'subtitle',
      index: 0,
      text: text,
      startTime: 0,
      duration: totalDuration
    }]
  }

  // 计算每个 Slot 的时长（按字数比例分配）
  const totalLength = contentSegments.reduce((sum, s) => sum + s.length, 0)
  let currentTime = 0

  return contentSegments.map((seg, index) => {
    const ratio = seg.length / totalLength
    const dur = Math.floor(totalDuration * ratio)
    const slot: RuntimeSlot = {
      type: 'subtitle',
      index,
      text: seg,
      startTime: currentTime,
      duration: dur
    }
    currentTime += dur
    return slot
  })
}

/**
 * 根据 Block 中的 Actions 计算显示用槽位
 * 处理槽位合并逻辑，将 slotSpan > 1 的 DurationAction 对应的槽位合并显示
 * 
 * @param rawSlots 原始槽位列表
 * @param actions Block 中的动作列表
 * @returns DisplaySlot 数组
 */
export function calculateDisplaySlots(rawSlots: RuntimeSlot[], actions: Action[]): DisplaySlot[] {
  if (rawSlots.length === 0) return []

  const displaySlots: DisplaySlot[] = []
  const skipIndices = new Set<number>()

  // 查找所有跨槽位的 DurationAction
  const spanActions = actions.filter(
    a => a.category === 'duration' && (a as unknown as { slotSpan: number }).slotSpan > 1
  )

  // 建立槽位索引到跨度的映射
  const spanMap = new Map<number, number>()
  for (const action of spanActions) {
    const span = (action as unknown as { slotSpan: number }).slotSpan ?? 1
    const currentSpan = spanMap.get(action.slotIndex) ?? 1
    // 取最大跨度
    spanMap.set(action.slotIndex, Math.max(currentSpan, span))
  }

  for (let i = 0; i < rawSlots.length; i++) {
    if (skipIndices.has(i)) continue

    const slot = rawSlots[i]
    if (!slot) continue
    const span = spanMap.get(i) ?? 1

    // 标记后续槽位为跳过
    for (let k = 1; k < span; k++) {
      if (i + k < rawSlots.length) {
        skipIndices.add(i + k)
      }
    }

    // 计算合并后的总时长和文本
    let mergedText = slot.text
    let mergedDuration = slot.duration

    for (let k = 1; k < span; k++) {
      const next = rawSlots[i + k]
      if (next) {
        mergedText = (mergedText ?? '') + (next.text ?? '')
        mergedDuration += next.duration
      }
    }

    displaySlots.push({
      ...slot,
      text: mergedText ?? '',
      duration: mergedDuration,
      spanCount: span,
      isMerged: span > 1
    })
  }

  return displaySlots
}

/**
 * 根据槽位索引和跨度计算动作的时间信息
 * 
 * @param action 动作对象
 * @param allSlots 所有原始槽位
 * @returns 包含 startTime 和 duration 的对象，或 null（如果槽位不存在）
 */
export function getActionTiming(
  action: Action,
  allSlots: RuntimeSlot[]
): { startTime: number; duration: number } | null {
  const startSlot = allSlots[action.slotIndex]

  if (!startSlot) {
    // 容错：槽位不存在（可能文本已修改）
    console.warn(`[slotUtils] Slot ${action.slotIndex} not found, total slots: ${allSlots.length}`)
    return null
  }

  const startTime = startSlot.startTime
  let duration = 0

  if (action.category === 'duration') {
    const span = (action as unknown as { slotSpan: number }).slotSpan ?? 1
    // 累加跨越的所有槽位时长
    for (let i = 0; i < span; i++) {
      const s = allSlots[action.slotIndex + i]
      if (s) duration += s.duration
    }
  }

  return { startTime, duration }
}

/**
 * 判断是否为瞬时动作
 */
export function isPointAction(action: Action): boolean {
  return action.category === 'point'
}

/**
 * 判断是否为持续动作
 */
export function isDurationAction(action: Action): boolean {
  return action.category === 'duration'
}

/**
 * 获取指定槽位的瞬时动作列表
 */
export function getPointActionsForSlot(slotIndex: number, actions: Action[]): Action[] {
  return actions.filter(a => a.category === 'point' && a.slotIndex === slotIndex)
}

/**
 * 获取指定槽位的持续动作列表
 */
export function getDurationActionsForSlot(slotIndex: number, actions: Action[]): Action[] {
  return actions.filter(a => a.category === 'duration' && a.slotIndex === slotIndex)
}

/**
 * 验证动作的槽位索引是否有效
 * 
 * @param action 动作对象
 * @param totalSlots 总槽位数
 * @returns 是否有效
 */
export function isActionSlotValid(action: Action, totalSlots: number): boolean {
  if (action.slotIndex < 0 || action.slotIndex >= totalSlots) {
    return false
  }

  if (action.category === 'duration') {
    const span = (action as unknown as { slotSpan?: number }).slotSpan ?? 1
    // 检查跨度是否超出范围
    if (action.slotIndex + span > totalSlots) {
      return false
    }
  }

  return true
}

/**
 * 清理无效的动作（槽位索引超出范围的动作）
 * 
 * @param actions 动作列表
 * @param totalSlots 总槽位数
 * @returns 过滤后的有效动作列表
 */
export function cleanInvalidActions(actions: Action[], totalSlots: number): Action[] {
  return actions.filter(action => isActionSlotValid(action, totalSlots))
}

/**
 * 检查槽位选择是否连续
 * 
 * @param indices 选中的槽位索引数组
 * @returns 是否连续
 */
export function isSelectionContinuous(indices: number[]): boolean {
  if (indices.length <= 1) return true

  const sorted = [...indices].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const prev = sorted[i - 1]
    if (current === undefined || prev === undefined) continue;
    if (current - prev !== 1) {
      return false
    }
  }
  return true
}

/**
 * 创建新的瞬时动作
 */
export function createPointAction(
  type: Action['type'],
  target: string,
  slotIndex: number,
  params: Record<string, unknown> = {}
): Action {
  return {
    id: generateActionId(),
    type,
    category: 'point',
    target,
    slotIndex,
    ...params
  } as Action
}

/**
 * 创建新的持续动作
 */
export function createDurationAction(
  type: Action['type'],
  target: string,
  slotIndex: number,
  slotSpan = 1,
  params: Record<string, unknown> = {},
  easing = 'linear'
): Action {
  return {
    id: generateActionId(),
    type,
    category: 'duration',
    target,
    slotIndex,
    slotSpan,
    easing,
    params
  } as Action
}

/**
 * 生成动作 ID
 */
function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ==================== Slot 变化时 Action 迁移 ====================

/**
 * Slot 变化的检测结果
 */
export type SlotChange =
  | { type: 'insert'; index: number; count: number }
  | { type: 'delete'; index: number; count: number }
  | { type: 'complex' }

/**
 * Slot 插入时的 Action 迁移
 *
 * 三种 Case：
 * - Case 1: 起始点在插入点之前（含等于）且不跨越 → 不变
 * - Case 2: 起始点在插入点之后（严格大于）→ slotIndex += insertCount
 * - Case 3: Duration Action 起始点在插入点（含等于）或之前，span 跨越插入点 → slotSpan += insertCount
 *
 * @param actions  Block 中的所有 action（in-place 修改）
 * @param insertIndex 新 slot 插入的位置
 * @param insertCount 插入的 slot 数量
 */
export function migrateActionsOnSlotInsert(
  actions: Action[],
  insertIndex: number,
  insertCount: number
): void {
  for (const action of actions) {
    if (action.slotIndex > insertIndex) {
      // Case 2: 起始点在插入点之后 → 整体后移
      action.slotIndex += insertCount
    } else if (action.category === 'duration') {
      // 起始点在插入点或之前，检查 span 是否跨越插入点
      const dAction = action as BaseDurationAction
      const span = dAction.slotSpan ?? 1
      if (action.slotIndex + span > insertIndex) {
        // Case 3: span 跨越插入点 → 扩展 span
        dAction.slotSpan = span + insertCount
      }
    }
    // Case 1: 起始点在插入点之前（含等于）且不跨越 → 不变
  }
}

/**
 * Slot 删除时的 Action 迁移
 *
 * ⚠️ 核心约束：绝不删除任何 action，只做 slotIndex 和 slotSpan 的调整
 *
 * 四种 Case：
 * - Case 1: 起始点在删除区间之前 且不跨越 → 不变
 * - Case 2: 起始点在删除区间之后 → slotIndex -= deleteCount
 * - Case 3: Duration 跨越删除区间 → slotSpan 收缩（保底 1）
 * - Case 4: 起始点落在被删 slot 上 → 后移合并 + Duration span 保底 1
 *
 * @param actions  Block 中的所有 action（in-place 修改）
 * @param deleteIndex 被删除 slot 的起始位置
 * @param deleteCount 被删除的 slot 数量
 */
export function migrateActionsOnSlotDelete(
  actions: Action[],
  deleteIndex: number,
  deleteCount: number
): void {
  const deleteEnd = deleteIndex + deleteCount // exclusive

  for (const action of actions) {
    const startIdx = action.slotIndex

    if (startIdx >= deleteEnd) {
      // ── Case 2: 起始点在删除区间之后 → 前移 ──
      action.slotIndex -= deleteCount

    } else if (startIdx >= deleteIndex) {
      // ── Case 4: 起始点落在被删除的 slot 上 → 后移合并 ──
      action.slotIndex = deleteIndex // 新索引体系中 = 删除区间之后的第一个幸存 slot

      if (action.category === 'duration') {
        const dAction = action as BaseDurationAction
        const span = dAction.slotSpan ?? 1
        const originalEnd = startIdx + span
        dAction.slotSpan = Math.max(1, originalEnd - deleteEnd)
      }

    } else if (action.category === 'duration') {
      // ── 起始点在删除区间之前，检查 span 是否跨越 ──
      const dAction = action as BaseDurationAction
      const span = dAction.slotSpan ?? 1
      const endIdx = startIdx + span // exclusive

      if (endIdx > deleteEnd) {
        // Case 3a: span 完全跨越删除区间 → 收缩 span
        dAction.slotSpan = span - deleteCount
      } else if (endIdx > deleteIndex) {
        // Case 3b: span 尾部落入删除区间 → 截断，最小为 1
        dAction.slotSpan = Math.max(1, deleteIndex - startIdx)
      }
    }
    // Case 1: Point Action 在删除区间之前 → 不变
  }
}

/**
 * 获取 slot 的文本指纹，用于变化检测
 * preroll/postroll 使用 type，subtitle 使用 text
 */
function getSlotFingerprint(slot: RuntimeSlot): string {
  if (slot.type === 'preroll' || slot.type === 'postroll') {
    return `__${slot.type}__`
  }
  return slot.text ?? ''
}

/**
 * 基于 slot 文本内容对比，检测插入/删除变化
 *
 * 使用前缀-后缀匹配算法：
 * 1. 从头部找到第一个不匹配的位置（公共前缀长度 P）
 * 2. 从尾部找到最后一个不匹配的位置（公共后缀长度 S）
 * 3. 中间的差异区间决定变化类型
 *
 * 相比双指针算法，前缀-后缀天然支持 slot 分裂（用户在文本中间插入 # 或标点）
 * 和 slot 合并（用户删除分句标点导致两个 slot 合并为一个）。
 *
 * @param oldSlots 编辑前的 slot 列表
 * @param newSlots 编辑后的 slot 列表
 * @returns 变化描述，或 null 表示无变化
 */
export function detectSlotTextChanges(
  oldSlots: RuntimeSlot[],
  newSlots: RuntimeSlot[]
): SlotChange | null {
  const oldLen = oldSlots.length
  const newLen = newSlots.length

  // 长度相同：检查内容是否完全一致
  if (oldLen === newLen) {
    const allMatch = oldSlots.every(
      (s, i) => getSlotFingerprint(s) === getSlotFingerprint(newSlots[i]!)
    )
    return allMatch ? null : { type: 'complex' }
  }

  const minLen = Math.min(oldLen, newLen)

  // 从头部匹配：找到公共前缀长度
  let prefixLen = 0
  while (prefixLen < minLen &&
         getSlotFingerprint(oldSlots[prefixLen]!) === getSlotFingerprint(newSlots[prefixLen]!)) {
    prefixLen++
  }

  // 从尾部匹配：找到公共后缀长度
  let suffixLen = 0
  while (suffixLen < (minLen - prefixLen) &&
         getSlotFingerprint(oldSlots[oldLen - 1 - suffixLen]!) === getSlotFingerprint(newSlots[newLen - 1 - suffixLen]!)) {
    suffixLen++
  }

  // 差异区间
  // oldDivergent = old[prefixLen .. oldLen - suffixLen)
  // newDivergent = new[prefixLen .. newLen - suffixLen)
  const changeIndex = prefixLen

  if (newLen > oldLen) {
    // 新比旧多 → 插入（含 slot 分裂场景）
    return { type: 'insert', index: changeIndex, count: newLen - oldLen }
  } else {
    // 旧比新多 → 删除（含 slot 合并场景）
    return { type: 'delete', index: changeIndex, count: oldLen - newLen }
  }
}
