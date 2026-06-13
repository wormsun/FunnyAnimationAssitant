
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach,describe, expect, it, vi } from 'vitest'

import type { Episode } from '@/stores/episodeStore'

import { ResourcePreloader } from '../ResourcePreloader'

// Mock Stores
const mockCharacterStore = {
    getCharacter: vi.fn(),
    characters: []
}

const mockExpressionStore = {
    getExpression: vi.fn()
}

const mockUseAssetLoader = {
    collectAssets: vi.fn(),
    loadAssets: vi.fn().mockResolvedValue(undefined),
    getImageUrl: vi.fn((url) => `blob:${url}`),
    getTexture: vi.fn()
}

// Mock modules
vi.mock('@/stores/characterStore', () => ({
    useCharacterStore: () => mockCharacterStore
}))

vi.mock('@/stores/expressionStore', () => ({
    useExpressionStore: () => mockExpressionStore
}))

// Important: Mock useAssetLoader
vi.mock('@/composables/useAssetLoader', () => ({
    useAssetLoader: () => mockUseAssetLoader
}))

// Mock other dependencies to avoid errors
vi.mock('@/utils/WebAudioKit', () => ({
    audioKit: {
        init: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue({ duration: 1 }),
        unload: vi.fn()
    }
}))

vi.mock('@/utils/ttsClient', () => ({
    ttsClient: {
        synthesize: vi.fn(),
        estimateDuration: vi.fn()
    }
}))

vi.mock('pixi.js', () => ({
    Assets: {
        load: vi.fn().mockResolvedValue({}),
        unload: vi.fn(),
        cache: { has: vi.fn().mockReturnValue(false) }
    },
    utils: {
        EventEmitter: class { }
    }
}))

// Mock composables used in ResourcePreloader constructor/methods
vi.mock('@/composables/useAssetImage', () => ({
    useAssetImage: () => ({
        loadImageUrl: vi.fn().mockResolvedValue(undefined),
        getImageUrl: vi.fn((url) => `blob:${url}`)
    })
}))

vi.mock('@/composables/useAssetAudio', () => ({
    useAssetAudio: () => ({
        loadAudioUrl: vi.fn().mockResolvedValue(undefined),
        getAudioUrl: vi.fn((url) => `blob:${url}`)
    })
}))

describe('ResourcePreloader', () => {
    let preloader: ResourcePreloader
    let mockEpisode: Episode

    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()

        mockEpisode = {
            id: 'ep1',
            title: 'Test Episode',
            scenes: [
                {
                    id: 'scene1',
                    title: 'Scene 1',
                    setup: {
                        objects: [
                            {
                                id: 'char1',
                                type: 'character',
                                refId: 'c1',
                                x: 0, y: 0, scaleX: 1, scaleY: 1,
                                initialState: {
                                    pose: 'standing',
                                    partAssetOverrides: { 'clothes': 'c2' }
                                }
                            }
                        ],
                        camera: { x: 0, y: 0, zoom: 1 }
                    },
                    script: [
                        {
                            id: 'block1',
                            type: 'action', // or 'dialogue'
                            actions: [
                                {
                                    type: 'set_character',
                                    target: 'char1',
                                    params: { pose: 'sitting' },
                                    slotIndex: 0
                                }
                            ]
                        }
                    ]
                }
            ]
        } as any

        preloader = new ResourcePreloader(mockEpisode)
        // Spy on internal methods if needed, or check mock calls
    })

    it('TB-EXPORT-PRELOAD-01: Should collect assets using useAssetLoader', async () => {
        // Setup mock return for collectAssets
        mockUseAssetLoader.collectAssets.mockReturnValue({
            imageUrls: new Set(['img1.png']),
            audioUrls: new Set(['sfx1.mp3'])
        })

        await preloader.preloadAll()

        // Verify collectAssets was called for Setup
        expect(mockUseAssetLoader.collectAssets).toHaveBeenCalledWith(
            mockEpisode.scenes[0]!.setup!,
            null
        )

        // Verify collectAssets was called for Block
        expect(mockUseAssetLoader.collectAssets).toHaveBeenCalledWith(
            mockEpisode.scenes[0]!.setup!,
            mockEpisode.scenes[0]!.script![0]
        )

        // Verify loadAssets was called
        expect(mockUseAssetLoader.loadAssets).toHaveBeenCalled()
    })

    it('TB-EXPORT-PRELOAD-02: Should aggregate resources from multiple blocks', async () => {
        mockUseAssetLoader.collectAssets
            .mockReturnValueOnce({ imageUrls: new Set(['setup.png']), audioUrls: new Set() }) // Setup call
            .mockReturnValueOnce({ imageUrls: new Set(['block.png']), audioUrls: new Set() }) // Block call 

        await preloader.preloadAll()

        const verifyCall = mockUseAssetLoader.loadAssets.mock.calls[0]
        const imagesSet = verifyCall![0] as Set<string>

        expect(imagesSet.has('setup.png')).toBe(true)
        expect(imagesSet.has('block.png')).toBe(true)
    })
})
