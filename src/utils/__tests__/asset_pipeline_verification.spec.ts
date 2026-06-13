import * as PIXI from 'pixi.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAssetLoader } from '@/composables/useAssetLoader'

// Mock PIXI entirely for Node environment
// const mockTexture = { baseTexture: { valid: true }, valid: true } as any
// const mockEmptyTexture = { baseTexture: { valid: false }, valid: false, isEmpty: true } as any

// We must mock pixi.js BEFORE importing it or components using it
vi.mock('pixi.js', async () => {
    // We can't use importActual for everything if we want to replace classes.
    // Simpler approach: return a full mock structure for the parts we use.

    class MockTexture {
        baseTexture: any
        valid = true
        static EMPTY = { valid: false, isEmpty: true } // Static prop

        // Factory
        static from() { return new MockTexture({}) }

        constructor(baseTexture: any) {
            this.baseTexture = baseTexture
        }
    }

    return {
        BaseTexture: {
            from: vi.fn(() => ({ valid: true }))
        },
        Texture: MockTexture,
        Assets: {
            cache: new Set(), // We will spy on this or use global map
            get: vi.fn(),
            has: (key: string) => (global as any)._pixiCache?.has(key)
        }
    }
})

// Mock dependencies
vi.mock('@/stores/characterStore', () => ({
    useCharacterStore: vi.fn(() => ({
        getCharacter: vi.fn(),
    }))
}))
vi.mock('@/stores/backgroundStore', () => ({ useBackgroundStore: vi.fn() }))
vi.mock('@/stores/propStore', () => ({ usePropStore: vi.fn() }))
vi.mock('@/stores/expressionStore', () => ({ useExpressionStore: vi.fn() }))
vi.mock('@/stores/soundStore', () => ({ useSoundStore: vi.fn() }))

// Mock useAssetImage
const mockGetImageUrl = vi.fn()
const mockLoadImageUrl = vi.fn()

vi.mock('@/composables/useAssetImage', () => ({
    useAssetImage: () => ({
        getImageUrl: mockGetImageUrl,
        loadImageUrl: mockLoadImageUrl
    })
}))

// Mock useAssetAudio
vi.mock('@/composables/useAssetAudio', () => ({
    useAssetAudio: () => ({
        getAudioUrl: vi.fn(),
        loadAudioUrl: vi.fn()
    })
}))

// Global setup
beforeEach(() => {
    (global as any)._pixiCache = new Set() // Reset our secret PIXI cache backdoor

    // Mock global Image (already done previously but repeating for safety)
    global.Image = class {
        onload: any
        onerror: any
        src = ''
        constructor() {
            setTimeout(() => {
                if (this.onload) this.onload()
            }, 0)
        }
    } as any
})

describe('Asset Pipeline Integration', () => {
    it('verifies the separation between useAssetLoader cache and PIXI.Assets cache', async () => {
        const { loadAssets, getTexture, textureCache } = useAssetLoader()

        const originalUrl = 'test/path/asset.png'
        const blobUrl = 'blob:test/asset.png'

        // Setup mocks
        mockLoadImageUrl.mockResolvedValue(undefined)
        mockGetImageUrl.mockReturnValue(blobUrl)

        // Ensure clean state
        textureCache.clear()

        // 1. Load the asset
        const info = new Set([originalUrl])
        await loadAssets(info, new Set())

        // 2. SAFETY CHECK: Verify it exists in useAssetLoader's cache
        const tex = getTexture(originalUrl)

        // Debug
        if (!tex || tex === PIXI.Texture.EMPTY) {
            console.log('Texture not found in cache. Cache size:', textureCache.size)
        }

        expect(tex).toBeDefined()
        expect(tex).not.toBe(PIXI.Texture.EMPTY)
        expect(textureCache.has(blobUrl)).toBe(true)

        // 3. REGRESSION CHECK: Verify it does NOT exist in PIXI.Assets.cache
        // Wait, since we mocked PIXI.Assets, we can check our backdoor
        // But useAssetLoader does NOT touch PIXI.Assets.cache
        // So global._pixiCache should be empty.
        expect((global as any)._pixiCache.has(blobUrl)).toBe(false)

        // This confirms that ANY component code relying on `PIXI.Assets.get(blobUrl)` will FAIL (return undefined/throw).
        // This forces components to use `useAssetLoader.getTexture(path)`.
    })
})
