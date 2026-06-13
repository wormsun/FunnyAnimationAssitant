import { describe, expect, it } from 'vitest'

import { collectNonEmptyTextures } from '@/utils/textureUpgradeUtils'

describe('textureUpgradeUtils', () => {
  it('filters undefined urls and empty textures', () => {
    const EMPTY = Symbol('empty')
    const T1 = Symbol('t1')
    const T2 = Symbol('t2')

    const map = new Map<string, symbol>([
      ['a', T1],
      ['b', EMPTY],
      ['c', T2],
    ])

    const result = collectNonEmptyTextures(
      [undefined, 'a', 'b', 'c'],
      (url) => map.get(url) ?? EMPTY,
      EMPTY
    )

    expect(result).toEqual([T1, T2])
  })

  it('returns empty array when all textures are empty placeholders', () => {
    const EMPTY = { kind: 'empty' }
    const result = collectNonEmptyTextures(
      ['a', 'b'],
      () => EMPTY,
      EMPTY
    )

    expect(result).toEqual([])
  })
})

