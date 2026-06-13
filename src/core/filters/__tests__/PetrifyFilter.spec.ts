import { describe, expect, it, vi } from 'vitest'

vi.mock('pixi.js', () => {
    class Filter {
        public uniforms: Record<string, unknown>

        constructor(_vertex?: string, _fragment?: string, uniforms?: Record<string, unknown>) {
            this.uniforms = uniforms ?? {}
        }
    }

    return { Filter }
})

import { PetrifyFilter } from '../PetrifyFilter'

describe('PetrifyFilter', () => {
    it('应该能被正确实例化', () => {
        const filter = new PetrifyFilter()
        expect(filter).toBeDefined()
        expect(filter.progress).toBe(0)
        expect(filter.intensity).toBe(1)
        expect(filter.seed).toBeDefined()
    })

    it('应该能更新 progress', () => {
        const filter = new PetrifyFilter()
        filter.progress = 0.5
        expect(filter.progress).toBe(0.5)
        expect(filter.uniforms['uProgress']).toBe(0.5)
    })

    it('应该能更新 intensity', () => {
        const filter = new PetrifyFilter()
        filter.intensity = 0.8
        expect(filter.intensity).toBe(0.8)
        expect(filter.uniforms['uIntensity']).toBe(0.8)
    })

    it('应该能更新 seed', () => {
        const filter = new PetrifyFilter()
        const newSeed = 12345
        filter.seed = newSeed
        expect(filter.seed).toBe(newSeed)
        expect(filter.uniforms['uSeed']).toBe(newSeed)
    })
})
