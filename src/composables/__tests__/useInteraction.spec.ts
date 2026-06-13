import { describe, expect, it } from 'vitest'

import { accumulateRotationDelta, normalizeAngleDelta } from '../useInteraction'

describe('normalizeAngleDelta', () => {
  it('将跨越 +pi/-pi 边界的小角度旋转归一化为最短弧', () => {
    const startAngle = 179 * Math.PI / 180
    const currentAngle = -171 * Math.PI / 180

    const normalized = normalizeAngleDelta(currentAngle - startAngle)

    expect(normalized).toBeCloseTo(10 * Math.PI / 180, 6)
  })

  it('保留本来就在最短弧范围内的角度差', () => {
    const normalized = normalizeAngleDelta(-20 * Math.PI / 180)

    expect(normalized).toBeCloseTo(-20 * Math.PI / 180, 6)
  })
})

describe('accumulateRotationDelta', () => {
  it('跨越 +pi/-pi 边界时仍能连续累计正向旋转', () => {
    const firstStep = accumulateRotationDelta(
      170 * Math.PI / 180,
      -170 * Math.PI / 180,
      0
    )
    const secondStep = accumulateRotationDelta(
      firstStep.currentAngle,
      -150 * Math.PI / 180,
      firstStep.accumulatedDelta
    )

    expect(firstStep.accumulatedDelta).toBeCloseTo(20 * Math.PI / 180, 6)
    expect(secondStep.accumulatedDelta).toBeCloseTo(40 * Math.PI / 180, 6)
  })

  it('支持单次拖拽累计超过 180 度', () => {
    let state = {
      currentAngle: 0,
      accumulatedDelta: 0
    }

    state = accumulateRotationDelta(state.currentAngle, 100 * Math.PI / 180, state.accumulatedDelta)
    state = accumulateRotationDelta(state.currentAngle, 170 * Math.PI / 180, state.accumulatedDelta)
    state = accumulateRotationDelta(state.currentAngle, -120 * Math.PI / 180, state.accumulatedDelta)

    expect(state.accumulatedDelta).toBeCloseTo(240 * Math.PI / 180, 6)
  })
})
