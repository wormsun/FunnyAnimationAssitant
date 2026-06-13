import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { SceneSetup } from '@/types/screenplay'
import { loadSetupToSceneObjects, collectSetupFromSceneObjects } from '../sceneLoader'
import { CANVAS_CENTER_X, CANVAS_CENTER_Y, CAMERA_BASE_WIDTH, CAMERA_BASE_HEIGHT } from '@/constants/canvas'

describe('sceneLoader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('collectSetupFromSceneObjects 应该保存 background 的 width/height', () => {
    const sceneObjectStore = useSceneObjectStore()
    const bg = sceneObjectStore.createBackgroundObject('bg_test', '背景')
    sceneObjectStore.updateObject(bg.id, {
      x: 123,
      y: 456,
      width: 1111,
      height: 2222,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      zIndex: -10
    })

    const setup = collectSetupFromSceneObjects()
    const savedBg = setup.objects.find(o => o.id === bg.id)

    expect(savedBg).toBeDefined()
    expect(savedBg?.type).toBe('background')
    expect(savedBg?.x).toBe(123)
    expect(savedBg?.y).toBe(456)
    expect(savedBg?.width).toBe(1111)
    expect(savedBg?.height).toBe(2222)
  })

  it('loadSetupToSceneObjects 应该加载 background 的 width/height（如果存在）', () => {
    const setup: SceneSetup = {
      camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
      objects: [
        {
          id: 'sceneobject_bg_1',
          type: 'background',
          refId: 'bg_test',
          name: 'bg_test',
          x: 10,
          y: 20,
          width: 1000,
          height: 1400,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: -10,
          alpha: 1,
          flipX: false,
          visible: true
        }
      ],
      renderChain: ['sceneobject_bg_1'],
    }

    loadSetupToSceneObjects(setup)

    const sceneObjectStore = useSceneObjectStore()
    const bg = sceneObjectStore.getObject('sceneobject_bg_1') as any

    expect(bg).toBeDefined()
    expect(bg.type).toBe('background')
    expect(bg.x).toBe(10)
    expect(bg.y).toBe(20)
    expect(bg.width).toBe(1000)
    expect(bg.height).toBe(1400)
  })

  it('loadSetupToSceneObjects 应该加载 prop 的 width/height（如果存在）', () => {
    const setup: SceneSetup = {
      camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
      objects: [
        {
          id: 'sceneobject_prop_1',
          type: 'prop',
          refId: 'prop_test',
          name: 'prop_test',
          x: 10,
          y: 20,
          width: 333,
          height: 444,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 0,
          alpha: 1,
          flipX: false,
          visible: true
        }
      ],
      renderChain: ['sceneobject_prop_1'],
    }

    loadSetupToSceneObjects(setup)

    const sceneObjectStore = useSceneObjectStore()
    const prop = sceneObjectStore.getObject('sceneobject_prop_1') as any

    expect(prop).toBeDefined()
    expect(prop.type).toBe('prop')
    expect(prop.width).toBe(333)
    expect(prop.height).toBe(444)
  })

  it('loadSetupToSceneObjects 应该为旧 renderChain 补齐文本对象', () => {
    const setup: SceneSetup = {
      camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
      objects: [
        {
          id: 'sceneobject_text_1',
          type: 'text',
          refId: '',
          name: '文本',
          alias: '文本',
          content: '测试文本',
          fontSize: 72,
          fontFamily: 'Noto Sans SC',
          fontWeight: 'normal',
          fontStyle: 'normal',
          color: '#ffffff',
          align: 'center',
          wordWrap: false,
          wordWrapWidth: 400,
          x: 0,
          y: 0,
          width: 400,
          height: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 100,
          alpha: 1,
          flipX: false,
          visible: true,
        } as SceneSetup['objects'][number],
        {
          id: 'sceneobject_effect_1',
          type: 'screen_effect',
          refId: 'fullscreen_cover',
          effectClass: 'fullscreen_cover',
          name: '黑幕',
          alias: '黑幕',
          params: { baseColor: '#000000', openRatio: 1 },
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 1000,
          alpha: 1,
          flipX: false,
          visible: true,
        } as SceneSetup['objects'][number],
      ],
      // 旧数据里文本曾不入链；加载时应自动补齐并按 zIndex 排序。
      renderChain: ['sceneobject_effect_1'],
    }

    loadSetupToSceneObjects(setup)

    const sceneObjectStore = useSceneObjectStore()
    expect(sceneObjectStore.getSceneRenderChain()).toEqual(['sceneobject_text_1', 'sceneobject_effect_1'])
  })

  it('collectSetupFromSceneObjects 应该保留所有对象类型的 refId', () => {
    const sceneObjectStore = useSceneObjectStore()

    // 背景
    const bg = sceneObjectStore.createBackgroundObject('bg_ref_123', '测试背景')
    // 道具
    const prop = sceneObjectStore.createPropObject('prop_ref_456', '测试道具')

    const setup = collectSetupFromSceneObjects()

    const savedBg = setup.objects.find(o => o.id === bg.id)
    expect(savedBg?.refId).toBe('bg_ref_123')

    const savedProp = setup.objects.find(o => o.id === prop.id)
    expect(savedProp?.refId).toBe('prop_ref_456')
  })

  it('loadSetupToSceneObjects 应该在 composite 排在子对象之前时正确恢复 parentId', () => {
    // 回归测试：场景模板添加时 composite 排在子对象之前，
    // 保存后重新加载时子对象的 parentId 必须被正确恢复
    const setup: SceneSetup = {
      camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
      objects: [
        // composite 排在子对象之前（场景模板添加的固定顺序）
        {
          id: 'composite_1',
          type: 'composite',
          refId: '',
          name: '组合',
          alias: '组合',
          childIds: ['prop_child', 'bg_child'],
          compositeMode: 'entity',
          x: 3360, y: 700,
          width: 0, height: 0,
          scaleX: 1, scaleY: 1, rotation: 0,
          alpha: 1, flipX: false, zIndex: 10,
          visible: true, spawned: true,
        } as SceneSetup['objects'][number],
        {
          id: 'prop_child',
          type: 'prop',
          refId: 'prop_test',
          name: '道具',
          alias: '道具',
          parentId: 'composite_1',
          x: 10, y: 20,
          width: 100, height: 100,
          scaleX: 1, scaleY: 1, rotation: 0,
          alpha: 1, flipX: false, zIndex: 10,
          visible: true, spawned: true,
        },
        {
          id: 'bg_child',
          type: 'background',
          refId: 'bg_test',
          name: '背景',
          alias: '背景',
          parentId: 'composite_1',
          x: 0, y: 0,
          width: 500, height: 300,
          scaleX: 1, scaleY: 1, rotation: 0,
          alpha: 1, flipX: false, zIndex: -10,
          visible: true, spawned: true,
        },
      ],
      renderChain: ['composite_1'],
    }

    loadSetupToSceneObjects(setup)

    const sceneObjectStore = useSceneObjectStore()

    // 验证 composite 被正确加载
    const composite = sceneObjectStore.getObject('composite_1')
    expect(composite).toBeDefined()
    expect(composite?.type).toBe('composite')

    // 关键断言：子对象的 parentId 必须指向 composite
    const prop = sceneObjectStore.getObject('prop_child')
    expect(prop).toBeDefined()
    expect(prop?.parentId).toBe('composite_1')

    const bg = sceneObjectStore.getObject('bg_child')
    expect(bg).toBeDefined()
    expect(bg?.parentId).toBe('composite_1')
  })

  it('collectSetupFromSceneObjects → loadSetupToSceneObjects 往返应保留 parentId', () => {
    const sceneObjectStore = useSceneObjectStore()

    // 创建组合对象及子对象
    const prop = sceneObjectStore.createPropObject('prop_ref', '道具')
    const bg = sceneObjectStore.createBackgroundObject('bg_ref', '背景')
    const composite = sceneObjectStore.createCompositeObject('组合', [prop.id, bg.id])

    // 确认创建时 parentId 正确
    expect(sceneObjectStore.getObject(prop.id)?.parentId).toBe(composite.id)
    expect(sceneObjectStore.getObject(bg.id)?.parentId).toBe(composite.id)

    // 保存
    const setup = collectSetupFromSceneObjects()

    // 清空并重新加载
    sceneObjectStore.clearObjects()
    loadSetupToSceneObjects(setup)

    // 关键断言：往返后 parentId 必须保留
    const reloadedProp = sceneObjectStore.getObject(prop.id)
    expect(reloadedProp).toBeDefined()
    expect(reloadedProp?.parentId).toBe(composite.id)

    const reloadedBg = sceneObjectStore.getObject(bg.id)
    expect(reloadedBg).toBeDefined()
    expect(reloadedBg?.parentId).toBe(composite.id)
  })

  it('collectSetupFromSceneObjects → loadSetupToSceneObjects 往返应保留 receiveLighting 和 castShadow', () => {
    const sceneObjectStore = useSceneObjectStore()

    const prop = sceneObjectStore.createPropObject('prop_ref_light', '测试道具')
    sceneObjectStore.updateObject(prop.id, {
      receiveLighting: false,
      castShadow: true,
    })

    const setup = collectSetupFromSceneObjects()
    const savedProp = setup.objects.find(o => o.id === prop.id)

    expect(savedProp).toBeDefined()
    expect(savedProp?.receiveLighting).toBe(false)
    expect(savedProp?.castShadow).toBe(true)

    sceneObjectStore.clearObjects()
    loadSetupToSceneObjects(setup)

    const reloadedProp = sceneObjectStore.getObject(prop.id)
    expect(reloadedProp).toBeDefined()
    expect(reloadedProp?.receiveLighting).toBe(false)
    expect(reloadedProp?.castShadow).toBe(true)
  })

  it('collectSetupFromSceneObjects → loadSetupToSceneObjects 往返应保留 light 的 spawned=false', () => {
    const sceneObjectStore = useSceneObjectStore()

    const light = sceneObjectStore.createLightObject('point', '测试点光源', {
      x: 320,
      y: 480,
      lightRadius: 280,
      lightIntensity: 0.9,
    })
    sceneObjectStore.updateObject(light.id, {
      spawned: false,
    })

    const setup = collectSetupFromSceneObjects()
    const savedLight = setup.objects.find(o => o.id === light.id)

    expect(savedLight).toBeDefined()
    expect(savedLight?.type).toBe('light')
    expect(savedLight?.spawned).toBe(false)

    sceneObjectStore.clearObjects()
    loadSetupToSceneObjects(setup)

    const reloadedLight = sceneObjectStore.getObject(light.id)
    expect(reloadedLight).toBeDefined()
    expect(reloadedLight?.type).toBe('light')
    expect(reloadedLight?.spawned).toBe(false)
  })
})
