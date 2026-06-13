import { describe, expect, it } from 'vitest'

import type { TextObject } from '@/types/sceneObject'
import type { Action, BlockPlayInfo, RuntimeSceneSnapshot, RuntimeSlot, ScriptBlock } from '@/types/screenplay'
import { computeTextRevealState } from '@/core/TextRevealController'

const slots: RuntimeSlot[] = [
  { type: 'subtitle', index: 0, startTime: 0, duration: 1000, text: 'a' },
  { type: 'subtitle', index: 1, startTime: 1000, duration: 1000, text: 'b' },
  { type: 'subtitle', index: 2, startTime: 2000, duration: 1000, text: 'c' },
]

function makeText(overrides: Partial<TextObject> = {}): TextObject {
  return {
    id: 'text_1',
    type: 'text',
    name: 'Text',
    alias: 'Text',
    refId: '',
    x: 0,
    y: 0,
    width: 400,
    height: 100,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1,
    flipX: false,
    zIndex: 1,
    visible: true,
    spawned: true,
    content: '测试文本',
    fontSize: 32,
    fontFamily: 'Noto Sans SC',
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#ffffff',
    align: 'center',
    wordWrap: true,
    wordWrapWidth: 400,
    revealSpeed: 2,
    ...overrides,
  }
}

function makeSnapshot(object: TextObject): RuntimeSceneSnapshot {
  return {
    objects: [object],
    renderChain: [object.id],
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
    },
  }
}

function makeBlockInfo(
  startTime: number,
  object: TextObject,
  actions: Action[] = [],
): BlockPlayInfo {
  const duration = 3000
  const block: ScriptBlock = {
    id: `block_${startTime}`,
    type: 'action',
    duration,
    actions,
  }

  return {
    startSnapshot: makeSnapshot(object),
    block,
    startTime,
    endTime: startTime + duration,
    duration,
    slots,
    blockActions: actions,
  }
}

function playAction(slotIndex: number, id = `play_${slotIndex}`): Action {
  return {
    id,
    type: 'set_text_reveal',
    category: 'point',
    target: 'text_1',
    slotIndex,
    params: { action: 'play', mode: 'typewriter' },
  }
}

describe('computeTextRevealState', () => {
  it('returns null when there is no reveal action', () => {
    const info = makeBlockInfo(0, makeText())
    expect(computeTextRevealState([info], info, 'text_1', 500)).toBeNull()
  })

  it('starts typewriter progress from the play action slot', () => {
    const info = makeBlockInfo(0, makeText({ content: 'abcd', revealSpeed: 2 }), [playAction(1)])
    const state = computeTextRevealState([info], info, 'text_1', 1500)

    expect(state?.playTime).toBe(1000)
    expect(state?.content).toBe('abcd')
    expect(state?.progress).toBeCloseTo(0.25)
  })

  it('continues progress across block boundaries', () => {
    const firstInfo = makeBlockInfo(0, makeText({ content: 'abcd', revealSpeed: 1 }), [playAction(1)])
    const secondInfo = makeBlockInfo(3000, makeText({ content: 'abcd', revealSpeed: 1 }))
    const state = computeTextRevealState([firstInfo, secondInfo], secondInfo, 'text_1', 3500)

    expect(state?.playTime).toBe(1000)
    expect(state?.progress).toBeCloseTo(0.625)
  })

  it('does not replay in a single-block preview without a play action', () => {
    const info = makeBlockInfo(0, makeText({ content: 'abcd', revealSpeed: 1 }))
    expect(computeTextRevealState([info], info, 'text_1', 500)).toBeNull()
  })

  it('starts from scene start when setup default is typewriter', () => {
    const info = makeBlockInfo(0, makeText({
      content: 'abcd',
      revealInitialState: 'typewriter',
      revealSpeed: 2,
    }))
    const state = computeTextRevealState([info], info, 'text_1', 500)

    expect(state?.playTime).toBe(0)
    expect(state?.content).toBe('abcd')
    expect(state?.progress).toBeCloseTo(0.25)
  })

  it('lets a stop action override the setup default typewriter state', () => {
    const info = makeBlockInfo(0, makeText({
      revealInitialState: 'typewriter',
      revealSpeed: 1,
    }), [
      {
        id: 'stop_default',
        type: 'set_text_reveal',
        category: 'point',
        target: 'text_1',
        slotIndex: 1,
        params: { action: 'stop', mode: 'typewriter' },
      },
    ])

    expect(computeTextRevealState([info], info, 'text_1', 1500)).toBeNull()
  })

  it('captures text content and speed at the play action time', () => {
    const actions: Action[] = [
      {
        id: 'set_before',
        type: 'set_text',
        category: 'point',
        target: 'text_1',
        slotIndex: 1,
        params: { content: 'hello', revealSpeed: 5 },
      },
      playAction(1),
      {
        id: 'set_after',
        type: 'set_text',
        category: 'point',
        target: 'text_1',
        slotIndex: 2,
        params: { content: 'later', revealSpeed: 1 },
      },
    ]
    const info = makeBlockInfo(0, makeText({ content: 'start', revealSpeed: 2 }), actions)
    const state = computeTextRevealState([info], info, 'text_1', 2500)

    expect(state?.content).toBe('hello')
    expect(state?.speed).toBe(5)
    expect(state?.progress).toBe(1)
  })

  it('stops reveal and returns null after a stop action', () => {
    const actions: Action[] = [
      playAction(0),
      {
        id: 'stop',
        type: 'set_text_reveal',
        category: 'point',
        target: 'text_1',
        slotIndex: 1,
        params: { action: 'stop', mode: 'typewriter' },
      },
    ]
    const info = makeBlockInfo(0, makeText(), actions)

    expect(computeTextRevealState([info], info, 'text_1', 1500)).toBeNull()
  })
})
