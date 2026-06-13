// @vitest-environment happy-dom
/**
 * ScriptPreviewDialog V7 自动化测试
 * 
 * 覆盖全剧预览的核心功能：
 * 1. 资源预加载 (V7 State-Centric / useAssetLoader)
 * 2. 全局时间线构建
 * 3. 全局 BGM 调度
 * 4. 场景切换逻辑
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as PIXI from 'pixi.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAssetLoader } from '@/composables/useAssetLoader'
import type { Episode } from '@/stores/episodeStore'
import { useSoundStore } from '@/stores/soundStore'
import type { SoundAsset } from '@/types/project'
import type { BGMTrack } from '@/types/screenplay'
import { audioKit } from '@/utils/WebAudioKit'

import ScriptPreviewDialog from '../ScriptPreviewDialog.vue'

// =========================================================================
// Types Helper
// =========================================================================

interface ScriptPreviewVM {
    isLoadingResources: boolean
    totalDuration: number
    sceneDurations: number[]
    sceneStartTimes: number[]
    bgmTimelines: { startTime: number; endTime: number; track: BGMTrack }[]
    currentSceneIndex: number
    autoPlayNext: boolean
    isPlaybackFinished: boolean
    pendingLayerId: 'a' | 'b' | null
    loadedTextureUrls: Set<string>
    handleProgress: (time: number) => void
    handleSceneFinished: () => void
    handlePlayerReady: (layerId: 'a' | 'b') => void
    handleClose: () => void
}

// =========================================================================
// Mocks
// =========================================================================

// Mock components
vi.mock('../ScenePlayer.vue', () => ({
    default: {
        template: '<div class="mock-scene-player"></div>',
        props: ['sceneId', 'autoPlay'],
        methods: {
            play: vi.fn(),
            pause: vi.fn(),
            reset: vi.fn(),
            seek: vi.fn()
        }
    }
}))

// Mock composables
vi.mock('@/composables/useAssetLoader', () => ({
    useAssetLoader: vi.fn(() => ({
        collectAssets: vi.fn(() => ({ imageUrls: new Set(), audioUrls: new Set() })), // Default mock
        collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set(), audioUrls: new Set() })),
        loadAssets: vi.fn().mockResolvedValue(undefined)
    }))
}))

vi.mock('@/composables/useAssetImage', () => ({
    useAssetImage: () => ({
        getImageUrl: (url: string) => `blob:${url}`,
        loadImageUrl: vi.fn().mockResolvedValue(undefined)
    })
}))

vi.mock('@/composables/useAssetAudio', () => ({
    useAssetAudio: () => ({
        getAudioUrl: (url: string) => `blob:${url}`,
        loadAudioUrl: vi.fn().mockResolvedValue(undefined)
    })
}))

// Mock Utils
vi.mock('@/utils/WebAudioKit', () => ({
    audioKit: {
        init: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(undefined),
        unload: vi.fn(),
        play: vi.fn().mockResolvedValue({
            stop: vi.fn(),
            setVolume: vi.fn(),
            resume: vi.fn(),
            hasEnded: false,
            isPlaying: true
        }),
        stopAll: vi.fn()
    }
}))

vi.mock('@/utils/ttsClient', () => ({
    ttsClient: {
        synthesize: vi.fn().mockResolvedValue({ audioBase64: 'mock', duration: 1000 }),
        estimateDuration: vi.fn().mockResolvedValue(1000)
    }
}))

vi.mock('@/utils/ttsUtils', () => ({
    ensureSceneTTS: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({
        push: vi.fn()
    })
}))

// Mock PIXI
vi.mock('pixi.js', () => ({
    Assets: {
        cache: { has: vi.fn(() => false) },
        load: vi.fn().mockResolvedValue({}),
        unload: vi.fn()
    }
}))

// =========================================================================
// Test Data
// =========================================================================

const mockScene1 = {
    id: 'scene_1',
    name: 'Scene 1',
    setup: { objects: [] },
    script: [
        { id: 'block_1_1', type: 'dialogue', duration: 2000, actions: [] },
        { id: 'block_1_2', type: 'dialogue', duration: 3000, actions: [] }
    ] // Total: 5000ms
}

const mockScene2 = {
    id: 'scene_2',
    name: 'Scene 2',
    setup: { objects: [] },
    script: [
        { id: 'block_2_1', type: 'dialogue', duration: 4000, actions: [] },
        // Dynamic set_character action here
        {
            id: 'block_2_2',
            type: 'action',
            duration: 1000,
            actions: [
                { type: 'set_character', target: 'char_1', params: { pose: 'happy' } }
            ]
        }
    ] // Total: 5000ms
}

const mockEpisode = {
    id: 'ep_1',
    title: 'Test Episode',
    scenes: [mockScene1, mockScene2],
    bgmTracks: []
}

// =========================================================================
// Tests
// =========================================================================

describe('ScriptPreviewDialog.vue', () => {
    let pinia: ReturnType<typeof createPinia>

    beforeEach(() => {
        pinia = createPinia()
        setActivePinia(pinia)
        vi.clearAllMocks()
    })

    function createWrapper(props = {}) {
        return mount(ScriptPreviewDialog, {
            props: {
                visible: true,
                episodeId: 'ep_1',
                episode: mockEpisode as unknown as Episode,
                ...props
            },
            global: {
                plugins: [pinia],
                stubs: { Teleport: true }
            }
        })
    }

    // Helper to get typed VM
    function getVM(wrapper: VueWrapper): ScriptPreviewVM {
        return wrapper.vm as unknown as ScriptPreviewVM
    }

    // 1. 资源预加载测试 (TC-SCPD-PRELOAD)
    describe('Resource Preloading', () => {
        it('TC-SCPD-PRELOAD-01: All scenes should be scanned via useAssetLoader', async () => {
            const collectAssetsMock = vi.fn().mockReturnValue({ imageUrls: new Set<string>(['img1']), audioUrls: new Set<string>() })
            vi.mocked(useAssetLoader).mockReturnValue({
                collectAssets: collectAssetsMock,
                collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })),
                loadAssets: vi.fn().mockResolvedValue(undefined),
                getTexture: vi.fn(),
                textureCache: new Map()
            })

            createWrapper()
            await flushPromises() // Wait for mounted and preload

            // Verify collectAssets was called for mockScene1 (Setup + 2 Blocks) and mockScene2 (Setup + 2 Blocks)
            // Setup calls: 2 (one per scene)
            // Block calls: 4 (total blocks)
            expect(collectAssetsMock).toHaveBeenCalledTimes(2 + 4)

            // Check Setup Calls
            expect(collectAssetsMock).toHaveBeenCalledWith(mockScene1.setup, null)
            expect(collectAssetsMock).toHaveBeenCalledWith(mockScene2.setup, null)

            // Check Block Calls (ensure Blocks are scanned)
            expect(collectAssetsMock).toHaveBeenCalledWith(mockScene1.setup, mockScene1.script[0])
            expect(collectAssetsMock).toHaveBeenCalledWith(mockScene2.setup, mockScene2.script[1])
        })

        it('TC-SCPD-PRELOAD-05: Image URLs should be loaded', async () => {
            const loadAssetsMock = vi.fn().mockResolvedValue(undefined)
            // Mock collectAssets to return 'test.png'
            const collectAssetsMock = vi.fn().mockReturnValue({ imageUrls: new Set<string>(['test.png']), audioUrls: new Set<string>() })

            vi.mocked(useAssetLoader).mockReturnValue({
                collectAssets: collectAssetsMock,
                collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })),
                loadAssets: loadAssetsMock,
                getTexture: vi.fn(),
                textureCache: new Map()
            })

            createWrapper()
            await flushPromises()

            // Verify loadAssets was called
            expect(loadAssetsMock).toHaveBeenCalled()

            // Verify that 'test.png' was passed in one of the calls
            let found = false
            for (const call of loadAssetsMock.mock.calls) {
                const urls = call[0] as Set<string>
                if (urls.has('test.png')) {
                    found = true
                    break
                }
            }
            expect(found).toBe(true)
        })
    })

    // 2. 全局时间线测试 (TC-SCPD-TIMELINE)
    describe('Global Timeline', () => {
        it('TC-SCPD-TIMELINE-03: Total duration should be sum of all scene durations', async () => {
            vi.mocked(useAssetLoader).mockReturnValue({ collectAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), loadAssets: vi.fn(), getTexture: vi.fn(), textureCache: new Map() })

            const wrapper = createWrapper()
            const vm = getVM(wrapper)
            await flushPromises()
            await new Promise(r => setTimeout(r, 1500)) // Wait for UI delay

            // Total = Scene1 (5000) + Scene2 (5000) = 10000
            expect(vm.totalDuration).toBe(10000)
            expect(vm.sceneDurations).toEqual([5000, 5000])
            expect(vm.sceneStartTimes).toEqual([0, 5000])
        })
    })

    // 3. 全局 BGM 测试 (TC-SCPD-BGM)
    describe('Global BGM', () => {
        const bgmTrack = {
            id: 'track_1',
            assetId: 'bgm_asset_1',
            volume: 0.5,
            loop: true,
            start: { sceneId: 'scene_1', blockId: 'block_1_2' }, // Start at 2000ms (after block_1_1)
            end: { sceneId: 'scene_2', blockId: 'block_2_1' }    // End at 5000 + 0 = 5000ms (Start of Block 2.1)
        }

        const episodeWithBGM = { ...mockEpisode, bgmTracks: [bgmTrack] } as unknown as Episode

        beforeEach(() => {
            const soundStore = useSoundStore()
            vi.spyOn(soundStore, 'getSound').mockReturnValue({ id: 'bgm_asset_1', url: 'bgm.mp3' } as unknown as SoundAsset)
            vi.mocked(useAssetLoader).mockReturnValue({ collectAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), loadAssets: vi.fn(), getTexture: vi.fn(), textureCache: new Map() })
        })

        it('TC-SCPD-BGM-01: BGM timeline should be calculated correctly', async () => {
            const wrapper = createWrapper({ episode: episodeWithBGM })
            const vm = getVM(wrapper)
            await flushPromises()
            await new Promise(r => setTimeout(r, 1500))

            const timelines = vm.bgmTimelines
            expect(timelines.length).toBe(1)
            expect(timelines[0]?.startTime).toBe(2000)
            expect(timelines[0]?.endTime).toBe(5000)
        })

        it('TC-SCPD-BGM-02: BGM should play when time reaches startTime', async () => {
            const wrapper = createWrapper({ episode: episodeWithBGM })
            const vm = getVM(wrapper)
            await flushPromises()
            await new Promise(r => setTimeout(r, 1500))

            // Start playing
            await wrapper.find('.play-btn').trigger('click')

            // Simulate progress update to 2500ms (Within BGM range 2000-5000)
            vm.handleProgress(2500)

             
            expect(audioKit.play).toHaveBeenCalledWith(
                expect.stringContaining('blob:bgm.mp3'),
                expect.objectContaining({
                    startOffset: expect.any(Number)
                })
            )
        })
    })

    // 4. 场景切换测试 (TC-SCPD-TRANS)
    describe('Scene Transitions', () => {
        vi.mocked(useAssetLoader).mockReturnValue({ collectAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), loadAssets: vi.fn(), getTexture: vi.fn(), textureCache: new Map() })

        it('TC-SCPD-TRANS-01: Auto-play next scene after current scene finishes', async () => {
            const wrapper = createWrapper()
            const vm = getVM(wrapper)
            await flushPromises()
            await new Promise(r => setTimeout(r, 1500))

            // Force current scene to 0
            expect(vm.currentSceneIndex).toBe(0)

                // Trigger finish
                ; vm.handleSceneFinished()

            await nextTick()
            expect(vm.currentSceneIndex).toBe(0)
            expect(vm.pendingLayerId).not.toBeNull()
            expect(vm.autoPlayNext).toBe(false)

            vm.handlePlayerReady(vm.pendingLayerId!)
            await nextTick()
            expect(vm.currentSceneIndex).toBe(1)
            expect(vm.pendingLayerId).toBeNull()
        })

        it('TC-SCPD-TRANS-03: Playback finished at end of last scene', async () => {
            const wrapper = createWrapper()
            const vm = getVM(wrapper)
            await flushPromises()
            await new Promise(r => setTimeout(r, 1500))

                // Force to last scene
                ; vm.currentSceneIndex = 1

                // Trigger finish
                ; vm.handleSceneFinished()

            expect(vm.isPlaybackFinished).toBe(true)
        })
    })

    // 5. 资源清理测试 (TC-SCPD-CLEANUP)
    describe('Cleanup', () => {
        vi.mocked(useAssetLoader).mockReturnValue({ collectAssets: vi.fn(() => ({ imageUrls: new Set<string>(['img1']), audioUrls: new Set<string>() })), collectEditorFirstPaintAssets: vi.fn(() => ({ imageUrls: new Set<string>(), audioUrls: new Set<string>() })), loadAssets: vi.fn(), getTexture: vi.fn(), textureCache: new Map() })

        it('TC-SCPD-CLEANUP-01: Resources should be unloaded on close', async () => {
            const wrapper = createWrapper()
            const vm = getVM(wrapper)
            // Mock cache.has to return true so unload is triggered
            PIXI.Assets.cache.has = vi.fn(() => true)

            await flushPromises()
            // Manually force loading state to false to avoid timing issues with preload
            vm.isLoadingResources = false
            await nextTick()

                // Simulate loaded resources
                ; vm.loadedTextureUrls.add('blob:img1.png')

            // Close by calling method directly
            vm.handleClose()

             
            expect(PIXI.Assets.unload).toHaveBeenCalledWith('blob:img1.png')
             
            expect(audioKit.stopAll).toHaveBeenCalled()
        })
    })
})
