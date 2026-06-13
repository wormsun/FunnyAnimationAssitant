import { describe, expect, it } from 'vitest'

import type { RuntimeSlot, ScriptBlock } from '@/types/screenplay'
import { buildSubtitleDisplaySlots, getSubtitleTextAtTime, parseBlockToSlots } from '@/utils/slotUtils'

function makeNarration(text: string, duration = 6000): ScriptBlock {
    return {
        id: 'test_block',
        type: 'narration',
        text,
        ttsConfig: { duration },
        actions: [],
    }
}

function subtitleSlots(slots: RuntimeSlot[]): RuntimeSlot[] {
    return slots.filter(slot => slot.type === 'subtitle')
}

describe('slotUtils subtitle segmentation', () => {
    it('# splits runtime slots and is hidden from preview subtitle text', () => {
        const block = makeNarration('前半句#后半句。')
        const slots = parseBlockToSlots(block)
        const rawSubtitleTexts = subtitleSlots(slots).map(slot => slot.text)
        const displaySubtitleTexts = buildSubtitleDisplaySlots(slots).map(slot => slot.text)

        expect(rawSubtitleTexts).toEqual(['前半句#', '后半句。'])
        expect(displaySubtitleTexts).toEqual(['前半句#后半句。'])
        const displaySlots = buildSubtitleDisplaySlots(slots)
        expect(getSubtitleTextAtTime(block, slots, displaySlots[0]!.startTime)).toBe('前半句后半句。')
    })

    it('keeps a Chinese period as display break even when # follows it', () => {
        const block = makeNarration('三人站在山崖边向下张望。#只见山脚下的徐家村方向，')
        const slots = parseBlockToSlots(block)
        const displaySlots = buildSubtitleDisplaySlots(slots)

        expect(displaySlots.map(slot => slot.text)).toEqual([
            '三人站在山崖边向下张望。#',
            '只见山脚下的徐家村方向，',
        ])
        expect(getSubtitleTextAtTime(block, slots, displaySlots[0]!.startTime)).toBe('三人站在山崖边向下张望。')
        expect(getSubtitleTextAtTime(block, slots, displaySlots[1]!.startTime)).toBe('只见山脚下的徐家村方向，')
    })

    it('splits display subtitles at a normal Chinese period', () => {
        const block = makeNarration('三人冲出破旧的炭棚，站在山崖边向下张望。只见山脚下的徐家村方向，')
        const slots = parseBlockToSlots(block)
        const displaySlots = buildSubtitleDisplaySlots(slots)

        expect(displaySlots.map(slot => slot.text)).toEqual([
            '三人冲出破旧的炭棚，站在山崖边向下张望。',
            '只见山脚下的徐家村方向，',
        ])
        expect(getSubtitleTextAtTime(block, slots, displaySlots[0]!.startTime)).toBe('三人冲出破旧的炭棚，站在山崖边向下张望。')
        expect(getSubtitleTextAtTime(block, slots, displaySlots[1]!.startTime)).toBe('只见山脚下的徐家村方向，')
    })

    it('splits runtime slots at every supported punctuation mark for action anchoring', () => {
        const block = makeNarration('徐小满进入棚中，看着冒烟的灶台和收拾妥当的空地，一脸羡慕。', 6372)
        const slots = parseBlockToSlots(block)
        const rawSubtitleTexts = subtitleSlots(slots).map(slot => slot.text)

        expect(rawSubtitleTexts).toEqual([
            '徐小满进入棚中，',
            '看着冒烟的灶台和收拾妥当的空地，',
            '一脸羡慕。',
        ])
        expect(slots).toHaveLength(5)
    })
})
