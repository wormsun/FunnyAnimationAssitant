import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const loadAssetsMock = vi.fn().mockResolvedValue(undefined)

vi.mock('pixi.js', () => ({
  Container: class {},
  Filter: class {},
  Graphics: class {},
  Rectangle: class {},
  Texture: { EMPTY: {} },
}))

vi.mock('@/composables/useAssetImage', () => ({
  useAssetImage: () => ({
    imageCache: new Map(),
    getImageUrl: (url: string) => url,
  }),
}))

vi.mock('@/composables/useAssetLoader', () => ({
  useAssetLoader: () => ({
    loadAssets: loadAssetsMock,
    getTexture: vi.fn(),
  }),
}))

vi.mock('@/composables/usePixiApp', () => ({
  usePixiApp: () => ({
    getContext: () => null,
    transformParams: ref({}),
    centerCanvasInViewport: vi.fn(),
    updateTransformParams: vi.fn(),
    resetView: vi.fn(),
    fitAll: vi.fn(),
    fitContent: vi.fn(),
    zoomTo100: vi.fn(),
    setZoomLevel: vi.fn(),
    setPanOffset: vi.fn(),
    onViewportTransformChanged: vi.fn(),
    userZoom: 1,
    panOffset: { x: 0, y: 0 },
    mousePosition: { x: 0, y: 0 },
    canvasSize: { width: 0, height: 0 },
  }),
}))

vi.mock('@/composables/useSceneGraph', () => ({
  useSceneGraph: () => ({
    getIsRendering: () => false,
    setPendingRender: vi.fn(),
    setIsRendering: vi.fn(),
    getGhostStates: () => null,
    getCurrentSlotIndex: () => -1,
    getContainer: () => null,
    clearGhostContainers: vi.fn(),
    clearAll: vi.fn(),
    setSlots: vi.fn(),
    updateSlotIndex: vi.fn(),
    setActionTime: vi.fn(),
    setActionDuration: vi.fn(),
    setActions: vi.fn(),
    setActionContext: vi.fn(),
    isPassThrough: () => false,
  }),
}))

vi.mock('@/composables/useInteraction', () => ({
  useInteraction: () => ({
    getActiveInteractionObjectId: () => null,
  }),
}))

vi.mock('@/core/RenderChainStage', () => ({
  installRenderChainRenderer: vi.fn(),
  installRootRenderChainRenderer: vi.fn(),
}))

vi.mock('@/core/SceneObjectRenderer', () => ({
  SceneObjectRenderer: class {
    applyObjectState = vi.fn()
  },
}))

import { useSceneRenderer } from '@/composables/useSceneRenderer'
import { useExpressionStore } from '@/stores/expressionStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'

const canvasContainerStub = {} as HTMLElement

describe('useSceneRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadAssetsMock.mockResolvedValue(undefined)
    setActivePinia(createPinia())
  })

  it('preloads speaking frames for visible expression objects when playback starts', async () => {
    const sceneObjectStore = useSceneObjectStore()
    const expressionStore = useExpressionStore()

    sceneObjectStore.setupState.objects = [
      {
        id: 'expr-visible-a',
        type: 'expression',
        name: 'Visible A',
        refId: 'expr_a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 1,
        visible: true,
        spawned: true,
      },
      {
        id: 'expr-hidden',
        type: 'expression',
        name: 'Hidden',
        refId: 'expr_hidden',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 2,
        visible: true,
        spawned: false,
      },
      {
        id: 'expr-visible-b',
        type: 'expression',
        name: 'Visible B',
        refId: 'expr_b',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 3,
        visible: true,
        spawned: true,
      },
      {
        id: 'bg-1',
        type: 'background',
        name: 'BG',
        refId: 'bg_a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        flipX: false,
        zIndex: 0,
        visible: true,
      },
    ] as any
    sceneObjectStore.setActionMode(true)

    expressionStore.expressions = {
      expr_a: {
        id: 'expr_a',
        name: 'Expr A',
        defaultFrame: { id: 'frame_a_default', url: 'default-a.png' },
        speakingFrames: [
          { id: 'frame_a_1', url: 'speak-a-1.png' },
          { id: 'frame_a_2', url: 'shared.png' },
        ],
        anchor: { x: 0.5, y: 0.5 },
        speakingFps: 12,
        speakingLoop: true,
        flipHorizontal: false,
        lockEdit: false,
        createdAt: Date.now(),
        tags: [],
      },
      expr_hidden: {
        id: 'expr_hidden',
        name: 'Hidden Expr',
        defaultFrame: { id: 'frame_hidden_default', url: 'default-hidden.png' },
        speakingFrames: [
          { id: 'frame_hidden_1', url: 'hidden.png' },
        ],
        anchor: { x: 0.5, y: 0.5 },
        speakingFps: 12,
        speakingLoop: true,
        flipHorizontal: false,
        lockEdit: false,
        createdAt: Date.now(),
        tags: [],
      },
      expr_b: {
        id: 'expr_b',
        name: 'Expr B',
        defaultFrame: { id: 'frame_b_default', url: 'default-b.png' },
        speakingFrames: [
          { id: 'frame_b_1', url: 'shared.png' },
          { id: 'frame_b_2', url: 'speak-b-2.png' },
        ],
        anchor: { x: 0.5, y: 0.5 },
        speakingFps: 12,
        speakingLoop: true,
        flipHorizontal: false,
        lockEdit: false,
        createdAt: Date.now(),
        tags: [],
      },
    } as any

    const renderer = useSceneRenderer({
      canvasContainer: canvasContainerStub,
      mode: 'action',
    })

    renderer.setIsPlaying(true)

    await vi.waitFor(() => {
      expect(loadAssetsMock).toHaveBeenCalledTimes(1)
    })

    const [imageUrls, audioUrls, traceLabel] = loadAssetsMock.mock.calls[0]!
    expect(Array.from(imageUrls)).toEqual([
      'speak-a-1.png',
      'shared.png',
      'speak-b-2.png',
    ])
    expect(Array.from(audioUrls)).toEqual([])
    expect(traceLabel).toBe('SceneRenderer.expression.speakingWarmup')
  })

  it('does not preload speaking frames when playback stops', async () => {
    const renderer = useSceneRenderer({
      canvasContainer: canvasContainerStub,
      mode: 'action',
    })

    renderer.setIsPlaying(false)
    await Promise.resolve()

    expect(loadAssetsMock).not.toHaveBeenCalled()
  })
})
