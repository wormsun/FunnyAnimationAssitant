/**
 * Slot 变化时 Action 迁移逻辑的单元测试
 * 覆盖插入(3 Case)和删除(4 Case)以及变化检测
 */
import { describe, expect, it } from 'vitest'

import type { Action, RuntimeSlot } from '@/types/screenplay'
import {
  detectSlotTextChanges,
  migrateActionsOnSlotDelete,
  migrateActionsOnSlotInsert,
} from '@/utils/slotUtils'

// ==================== 辅助工厂 ====================

function makePointAction(id: string, slotIndex: number, target = 'actor1'): Action {
  return {
    id,
    type: 'set_transform',
    category: 'point',
    target,
    slotIndex,
    params: { x: 0, y: 0 },
  } as Action
}

function makeDurationAction(id: string, slotIndex: number, slotSpan: number, target = 'actor1'): Action {
  return {
    id,
    type: 'tween_transform',
    category: 'duration',
    target,
    slotIndex,
    slotSpan,
    easing: 'linear',
    params: { x: 100 },
  } as Action
}

function makeSlot(index: number, type: 'preroll' | 'subtitle' | 'postroll', text?: string): RuntimeSlot {
  const slot: RuntimeSlot = {
    type,
    index,
    startTime: index * 500,
    duration: 500,
  }
  if (text !== undefined) {
    slot.text = text
  }
  return slot
}

// ==================== migrateActionsOnSlotInsert ====================

describe('migrateActionsOnSlotInsert', () => {
  it('Case 1: Point Action 在插入点之前 → 不变', () => {
    const actions = [makePointAction('a1', 1)]
    migrateActionsOnSlotInsert(actions, 3, 1)
    expect(actions[0]!.slotIndex).toBe(1)
  })

  it('Case 2: Point Action 在插入点之后 → slotIndex += N', () => {
    const actions = [makePointAction('a1', 3)]
    migrateActionsOnSlotInsert(actions, 2, 1)
    expect(actions[0]!.slotIndex).toBe(4)
  })

  it('Case 1: Point Action 恰好在插入点 → 不变（留在分裂后的前半部分）', () => {
    const actions = [makePointAction('a1', 2)]
    migrateActionsOnSlotInsert(actions, 2, 1)
    expect(actions[0]!.slotIndex).toBe(2)
  })

  it('Case 3: Duration Action 恰好在插入点 → span += N（覆盖分裂后两部分）', () => {
    const actions = [makeDurationAction('a1', 2, 1)]
    migrateActionsOnSlotInsert(actions, 2, 1)
    expect(actions[0]!.slotIndex).toBe(2) // 起始不变
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(2) // span 扩展
  })

  it('Case 2: Duration Action 完全在插入点之后 → slotIndex += N, span 不变', () => {
    const actions = [makeDurationAction('a1', 3, 2)]
    migrateActionsOnSlotInsert(actions, 2, 1)
    expect(actions[0]!.slotIndex).toBe(4)
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(2)
  })

  it('Case 3: Duration Action 跨越插入点 → slotSpan += N', () => {
    const actions = [makeDurationAction('a1', 1, 2)] // 覆盖 [1, 2]
    migrateActionsOnSlotInsert(actions, 2, 1) // 在 index=2 处插入
    expect(actions[0]!.slotIndex).toBe(1) // 起始不变
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(3) // span 扩展
  })

  it('Case 1: Duration Action 完全在插入点之前且不跨越 → 不变', () => {
    const actions = [makeDurationAction('a1', 0, 2)] // 覆盖 [0, 1]
    migrateActionsOnSlotInsert(actions, 2, 1) // 在 index=2 处插入
    expect(actions[0]!.slotIndex).toBe(0)
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(2)
  })

  it('插入 insertCount > 1', () => {
    const actions = [
      makePointAction('a1', 3),
      makeDurationAction('a2', 1, 3), // 覆盖 [1, 2, 3]
    ]
    migrateActionsOnSlotInsert(actions, 2, 2) // 在 index=2 处插入 2 个
    expect(actions[0]!.slotIndex).toBe(5) // 3 + 2
    expect(actions[1]!.slotIndex).toBe(1) // 不变
    expect((actions[1] as { slotSpan: number }).slotSpan).toBe(5) // 3 + 2
  })

  it('综合示例：多种 action 混合', () => {
    const actions = [
      makePointAction('A', 1),           // "你好"时瞬移
      makeDurationAction('B', 1, 2),     // "你好"到"世界"补间
      makePointAction('C', 2),           // "世界"时出生
      makeDurationAction('D', 2, 1),     // "世界"时运镜
    ]
    // 在 index=2 处插入 1 个 slot（"小明"）
    migrateActionsOnSlotInsert(actions, 2, 1)

    expect(actions[0]!.slotIndex).toBe(1) // A: 不变
    expect(actions[1]!.slotIndex).toBe(1) // B: 不变
    expect((actions[1] as { slotSpan: number }).slotSpan).toBe(3) // B: span 扩展
    expect(actions[2]!.slotIndex).toBe(2) // C: 恰好在插入点 → 不变（留在分裂后的前半部分）
    expect(actions[3]!.slotIndex).toBe(2) // D: 恰好在插入点 → 不变
    expect((actions[3] as { slotSpan: number }).slotSpan).toBe(2) // D: span 扩展（覆盖分裂后两部分）
  })
})

// ==================== migrateActionsOnSlotDelete ====================

describe('migrateActionsOnSlotDelete', () => {
  it('Case 1: Point Action 在删除区间之前 → 不变', () => {
    const actions = [makePointAction('a1', 1)]
    migrateActionsOnSlotDelete(actions, 3, 1)
    expect(actions[0]!.slotIndex).toBe(1)
  })

  it('Case 2: Point Action 在删除区间之后 → slotIndex -= N', () => {
    const actions = [makePointAction('a1', 4)]
    migrateActionsOnSlotDelete(actions, 2, 1)
    expect(actions[0]!.slotIndex).toBe(3)
  })

  it('Case 3a: Duration 完全跨越删除区间 → slotSpan -= N', () => {
    const actions = [makeDurationAction('a1', 1, 3)] // 覆盖 [1, 2, 3]
    migrateActionsOnSlotDelete(actions, 2, 1) // 删除 index=2
    expect(actions[0]!.slotIndex).toBe(1)
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(2)
  })

  it('Case 3b: Duration 尾部落入删除区间 → slotSpan 截断', () => {
    const actions = [makeDurationAction('a1', 1, 2)] // 覆盖 [1, 2]
    migrateActionsOnSlotDelete(actions, 2, 2) // 删除 [2, 3]
    expect(actions[0]!.slotIndex).toBe(1)
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(1) // 截断到 deleteIndex - startIdx = 1
  })

  it('Case 4 Point: 在被删 slot 上 → 后移合并', () => {
    const actions = [makePointAction('a1', 2)]
    migrateActionsOnSlotDelete(actions, 2, 1) // 删除 index=2
    expect(actions[0]!.slotIndex).toBe(2) // 后移到新 index=2（原来的 index=3）
  })

  it('Case 4 Duration: 起始于被删 slot，span 部分超出 → 后移 + 残余 span', () => {
    const actions = [makeDurationAction('a1', 2, 2)] // 覆盖 [2, 3]
    migrateActionsOnSlotDelete(actions, 2, 1) // 删除 index=2
    expect(actions[0]!.slotIndex).toBe(2) // 后移合并
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(1) // max(1, 4-3) = 1
  })

  it('Case 4 Duration: span 完全在删除区间内 → 后移 + span 保底 1（不删除 action）', () => {
    const actions = [makeDurationAction('a1', 2, 1)] // 覆盖 [2]
    migrateActionsOnSlotDelete(actions, 2, 1) // 删除 index=2
    expect(actions).toHaveLength(1) // 绝不删除！
    expect(actions[0]!.slotIndex).toBe(2)
    expect((actions[0] as { slotSpan: number }).slotSpan).toBe(1) // max(1, 0) = 1
  })

  it('deleteCount > 1', () => {
    const actions = [
      makePointAction('a1', 1),
      makePointAction('a2', 3),
      makeDurationAction('a3', 2, 1), // 完全在删除区间内
    ]
    migrateActionsOnSlotDelete(actions, 2, 2) // 删除 [2, 3]
    expect(actions).toHaveLength(3)
    expect(actions[0]!.slotIndex).toBe(1)  // Case 1: 不变
    expect(actions[1]!.slotIndex).toBe(2)  // Case 4: 后移合并（startIdx=3 在 [2,3] 内）
    expect(actions[2]!.slotIndex).toBe(2)  // Case 4: 后移合并
    expect((actions[2] as { slotSpan: number }).slotSpan).toBe(1) // 保底
  })

  it('不变量: action 数量始终不变', () => {
    const actions = [
      makePointAction('a1', 0),
      makePointAction('a2', 1),
      makeDurationAction('a3', 1, 3),
      makePointAction('a4', 2),
      makeDurationAction('a5', 2, 1),
      makePointAction('a6', 3),
    ]
    const originalCount = actions.length
    migrateActionsOnSlotDelete(actions, 2, 1)
    expect(actions).toHaveLength(originalCount) // 绝不删除
  })

  it('综合示例验证', () => {
    const actions = [
      makePointAction('A', 1),           // 在"你好"时瞬移
      makeDurationAction('B', 1, 3),     // 从"你好"经"小明"到"世界"补间
      makePointAction('C', 2),           // 在"小明"时出生
      makeDurationAction('D', 3, 1),     // 在"世界"时运镜
      makeDurationAction('E', 2, 2),     // 从"小明"到"世界"补间
      makeDurationAction('F', 2, 1),     // 在"小明"时震屏
    ]
    // 删除 index=2（"小明"）
    migrateActionsOnSlotDelete(actions, 2, 1)

    // A: Case 1, 不变
    expect(actions[0]!.slotIndex).toBe(1)
    // B: Case 3a, span 收缩 3-1=2
    expect(actions[1]!.slotIndex).toBe(1)
    expect((actions[1] as { slotSpan: number }).slotSpan).toBe(2)
    // C: Case 4 Point, 后移合并到 2
    expect(actions[2]!.slotIndex).toBe(2)
    // D: Case 2, 前移 3-1=2
    expect(actions[3]!.slotIndex).toBe(2)
    expect((actions[3] as { slotSpan: number }).slotSpan).toBe(1)
    // E: Case 4 Duration, 后移 + 残余 span=max(1, 4-3)=1
    expect(actions[4]!.slotIndex).toBe(2)
    expect((actions[4] as { slotSpan: number }).slotSpan).toBe(1)
    // F: Case 4 Duration, 后移 + span 保底=1
    expect(actions[5]!.slotIndex).toBe(2)
    expect((actions[5] as { slotSpan: number }).slotSpan).toBe(1)
  })
})

// ==================== detectSlotTextChanges ====================

describe('detectSlotTextChanges', () => {
  it('无变化 → null', () => {
    const slots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    expect(detectSlotTextChanges(slots, slots)).toBeNull()
  })

  it('中间插入 1 个 slot → insert', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '小明，'),
      makeSlot(3, 'subtitle', '世界'),
      makeSlot(4, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'insert', index: 2, count: 1 })
  })

  it('末尾插入 → insert at end', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'insert', index: 2, count: 1 })
  })

  it('中间删除 1 个 slot → delete', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '小明，'),
      makeSlot(3, 'subtitle', '世界'),
      makeSlot(4, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'delete', index: 2, count: 1 })
  })

  it('连续插入多个 → insert with count > 1', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '小明，'),
      makeSlot(3, 'subtitle', '小红，'),
      makeSlot(4, 'subtitle', '世界'),
      makeSlot(5, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'insert', index: 2, count: 2 })
  })

  it('同长度但内容变化 → complex', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '再见，'),
      makeSlot(2, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'complex' })
  })

  it('preroll/postroll 保持不变时只看 subtitle 变化', () => {
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好'),
      makeSlot(2, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'insert', index: 2, count: 1 })
  })

  it('slot 分裂：用户在文本中间插入 # → 检测为 insert', () => {
    // 用户将 "而是我陆长生不屑与尔等#" 中间插入 #，分裂为两个 slot
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '今日并非你们逐我，'),
      makeSlot(2, 'subtitle', '而是我陆长生不屑与尔等#'),
      makeSlot(3, 'subtitle', '为伍。'),
      makeSlot(4, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '今日并非你们逐我，'),
      makeSlot(2, 'subtitle', '而是#'),
      makeSlot(3, 'subtitle', '我陆长生不屑与尔等#'),
      makeSlot(4, 'subtitle', '为伍。'),
      makeSlot(5, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'insert', index: 2, count: 1 })
  })

  it('slot 合并：用户删除分句标点 → 检测为 delete', () => {
    // 用户删除逗号，导致两个 slot 合并为一个
    const oldSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好，'),
      makeSlot(2, 'subtitle', '小明，'),
      makeSlot(3, 'subtitle', '世界'),
      makeSlot(4, 'postroll'),
    ]
    const newSlots = [
      makeSlot(0, 'preroll'),
      makeSlot(1, 'subtitle', '你好小明，'),
      makeSlot(2, 'subtitle', '世界'),
      makeSlot(3, 'postroll'),
    ]
    const result = detectSlotTextChanges(oldSlots, newSlots)
    expect(result).toEqual({ type: 'delete', index: 1, count: 1 })
  })
})
