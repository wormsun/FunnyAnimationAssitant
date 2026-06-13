import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}))

import { useSetupWorkspace } from '@/composables/useSetupWorkspace'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'

describe('useSetupWorkspace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('re-renders immediately after setup object updates', () => {
    const sceneObjectStore = useSceneObjectStore()

    sceneObjectStore.setupState.objects = [
      {
        id: 'composite-1',
        type: 'composite',
        name: 'Composite',
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
        childIds: ['child-a', 'child-b'],
        compositeMode: 'entity',
        renderChain: ['child-a', 'child-b'],
      },
    ] as any
    sceneObjectStore.selectObject('composite-1')

    const workspace = useSetupWorkspace({
      canvasContainer: ref(undefined),
      editorContainer: ref(undefined),
      onSave: vi.fn().mockResolvedValue(undefined),
      onExit: vi.fn(),
    })

    const renderObjects = vi.fn().mockResolvedValue(undefined)
    workspace.renderer.value = {
      renderObjects,
    } as any

    workspace.handleUpdateObject({
      renderChain: ['child-b', 'child-a'],
    } as any)

    expect(sceneObjectStore.getObject('composite-1')).toMatchObject({
      renderChain: ['child-b', 'child-a'],
    })
    expect(renderObjects).toHaveBeenCalledTimes(1)
  })
})
