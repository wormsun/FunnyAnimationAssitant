/**
 * configImporter 单元测试
 *
 * 测试 config.json 解析、路径收集、坐标转换、层级处理
 *
 * 注意：convertConfigToSceneObjects 会为根节点创建一个 CompositeObject，
 * 所以输出中总有一个根 composite。
 */
import { describe, expect, it } from 'vitest'

import { CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import type { ConfigRoot, ConfigSymbolNode, ConfigCompositeNode } from '@/types/configImportTypes'
import type { CompositeObject, SymbolObject } from '@/types/sceneObject'
import {
  collectAllFramePaths,
  convertConfigToSceneObjects,
  isVersionSatisfied,
  parseConfigJson,
} from '@/utils/configImporter'

// ===== Helpers =====

function makeSymbolNode(overrides: Partial<ConfigSymbolNode> = {}): ConfigSymbolNode {
  return {
    name: 'TestSymbol',
    type: 'symbol',
    elementType: 'symbol',
    frameCount: 1,
    frames: [{
      frame: 0,
      keyframe: 0,
      label: null,
      path: 'file:///D:/exports/test.png',
      type: 'single',
    }],
    instanceTransform: {
      width: 100,
      height: 80,
      registrationPoint: { parentX: 200, parentY: 300, localX: 50, localY: 40 },
      scaleX: 1, scaleY: 1, rotation: 0,
    },
    scaleFactor: 1,
    ...overrides,
  }
}

function makeConfigRoot(children: (ConfigSymbolNode | ConfigCompositeNode)[]): ConfigRoot {
  return {
    name: 'Root',
    type: 'composite',
    elementType: 'group',
    version: 'ver2.0.0',
    children,
  }
}

// ===== Tests =====

describe('parseConfigJson', () => {
  it('应正确解析合法的 config.json', () => {
    const config = makeConfigRoot([makeSymbolNode()])
    const result = parseConfigJson(JSON.stringify(config))
    expect(result.type).toBe('composite')
    expect(result.children.length).toBe(1)
  })

  it('应在根节点不是 composite 时抛出错误', () => {
    const badJson = JSON.stringify({ type: 'symbol', name: 'Bad' })
    expect(() => parseConfigJson(badJson)).toThrow('根节点必须为 composite 类型')
  })

  it('应在缺少 children 时抛出错误', () => {
    const badJson = JSON.stringify({ type: 'composite', name: 'NoChildren', version: 'ver2.0.0' })
    expect(() => parseConfigJson(badJson)).toThrow('根节点缺少 children 数组')
  })

  it('应在缺少 version 字段时抛出错误', () => {
    const noVersion = JSON.stringify({ type: 'composite', name: 'Root', children: [] })
    expect(() => parseConfigJson(noVersion)).toThrow('缺少 version 字段')
  })

  it('应在 version 为空字符串时抛出错误', () => {
    const emptyVersion = JSON.stringify({ type: 'composite', name: 'Root', version: '', children: [] })
    expect(() => parseConfigJson(emptyVersion)).toThrow('缺少 version 字段')
  })

  it('应在版本号低于 ver2.0.0 时抛出错误', () => {
    const oldVersion = JSON.stringify({ type: 'composite', name: 'Root', version: 'ver1.0.0', children: [] })
    expect(() => parseConfigJson(oldVersion)).toThrow('版本过低')
  })

  it('应在版本号格式不合法时抛出错误', () => {
    const badVersion = JSON.stringify({ type: 'composite', name: 'Root', version: '1.0', children: [] })
    expect(() => parseConfigJson(badVersion)).toThrow('版本过低')
  })

  it('应接受 ver2.0.0 及更高版本', () => {
    const v200 = JSON.stringify({ type: 'composite', name: 'Root', version: 'ver2.0.0', children: [] })
    expect(() => parseConfigJson(v200)).not.toThrow()

    const v210 = JSON.stringify({ type: 'composite', name: 'Root', version: 'ver2.1.0', children: [] })
    expect(() => parseConfigJson(v210)).not.toThrow()

    const v300 = JSON.stringify({ type: 'composite', name: 'Root', version: 'ver3.0.0', children: [] })
    expect(() => parseConfigJson(v300)).not.toThrow()
  })
})

describe('isVersionSatisfied', () => {
  it('应正确比较版本号', () => {
    expect(isVersionSatisfied('ver2.0.0', '2.0.0')).toBe(true)
    expect(isVersionSatisfied('ver2.1.0', '2.0.0')).toBe(true)
    expect(isVersionSatisfied('ver3.0.0', '2.0.0')).toBe(true)
    expect(isVersionSatisfied('ver1.9.9', '2.0.0')).toBe(false)
    expect(isVersionSatisfied('ver2.0.0', '2.0.1')).toBe(false)
    expect(isVersionSatisfied('ver1.0.0', '2.0.0')).toBe(false)
  })

  it('应在格式不合法时返回 false', () => {
    expect(isVersionSatisfied('1.0', '2.0.0')).toBe(false)
    expect(isVersionSatisfied('', '2.0.0')).toBe(false)
    expect(isVersionSatisfied('ver', '2.0.0')).toBe(false)
  })
})

describe('collectAllFramePaths', () => {
  it('应收集所有 symbol 节点的帧路径', () => {
    const config = makeConfigRoot([
      makeSymbolNode({ name: 'A', frames: [{ frame: 0, keyframe: 0, label: null, path: 'file:///a.png', type: 'single' }] }),
      makeSymbolNode({ name: 'B', frames: [
        { frame: 0, keyframe: 0, label: null, path: 'file:///b1.png', type: 'single' },
        { frame: 1, keyframe: 1, label: null, path: 'file:///b2.png', type: 'single' },
      ] }),
    ])

    const paths = collectAllFramePaths(config)
    expect(paths.size).toBe(3)
    expect(paths.has('file:///a.png')).toBe(true)
    expect(paths.has('file:///b1.png')).toBe(true)
    expect(paths.has('file:///b2.png')).toBe(true)
  })

  it('应递归遍历嵌套 composite 中的 symbol', () => {
    const config = makeConfigRoot([
      {
        name: 'Group1',
        type: 'composite' as const,
        elementType: 'group',
        children: [
          makeSymbolNode({ name: 'Nested', frames: [{ frame: 0, keyframe: 0, label: null, path: 'file:///nested.png', type: 'single' }] }),
        ],
      },
    ])

    const paths = collectAllFramePaths(config)
    expect(paths.has('file:///nested.png')).toBe(true)
  })
})

describe('convertConfigToSceneObjects - 根节点处理', () => {
  it('应为根 composite 创建 CompositeObject', async () => {
    const config = makeConfigRoot([makeSymbolNode()])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    // 根 composite + 1 个 symbol = 2 个对象
    expect(objects.length).toBe(2)

    const rootComposite = objects[0]! as CompositeObject
    expect(rootComposite.type).toBe('composite')
    expect(rootComposite.name).toBe('Root')
    expect(rootComposite.childIds.length).toBe(1)

    const symbol = objects[1]!
    expect(symbol.type).toBe('symbol')
    expect(symbol.parentId).toBe(rootComposite.id)
  })

  it('根 composite 应居中到画布中心', async () => {
    const config = makeConfigRoot([makeSymbolNode()])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    // 根 composite 是唯一顶层对象，应居中
    const root = objects[0]!
    expect(root.parentId).toBeUndefined()
    expect(root.x).toBe(CANVAS_CENTER_X)
    expect(root.y).toBe(CANVAS_CENTER_Y)
  })
})

describe('convertConfigToSceneObjects - 坐标转换', () => {
  it('应正确使用 registrationPoint 计算中心坐标', async () => {
    // registrationPoint: parentX=200, parentY=300, localX=50, localY=40
    // centerX = 200 + (100/2 - 50) = 200
    // centerY = 300 + (80/2 - 40) = 300
    // 根 composite 中心 = 子对象均值 = (200, 300)
    // 子局部坐标 = (200-200, 300-300) = (0, 0)
    const config = makeConfigRoot([makeSymbolNode()])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    const symbol = objects.find(o => o.type === 'symbol')!
    // 单个子对象，局部坐标为 (0, 0)
    expect(symbol.x).toBe(0)
    expect(symbol.y).toBe(0)
  })

  it('应使用非对称 registrationPoint 正确计算偏移', async () => {
    // registrationPoint: parentX=0, parentY=0, localX=0, localY=0
    // width=200, height=100
    // centerX = 0 + (200/2 - 0) = 100
    // centerY = 0 + (100/2 - 0) = 50
    const node = makeSymbolNode({
      instanceTransform: {
        width: 200, height: 100,
        registrationPoint: { parentX: 0, parentY: 0, localX: 0, localY: 0 },
        scaleX: 1, scaleY: 1, rotation: 0,
      },
    })
    const config = makeConfigRoot([node])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    // 根 composite 居中到画布
    const root = objects[0]!
    expect(root.x).toBe(CANVAS_CENTER_X)
    expect(root.y).toBe(CANVAS_CENTER_Y)

    // 子对象局部坐标 = (0, 0)
    const symbol = objects.find(o => o.type === 'symbol')!
    expect(symbol.x).toBe(0)
    expect(symbol.y).toBe(0)
  })
})

describe('convertConfigToSceneObjects - 层级处理', () => {
  it('应为嵌套 composite 创建完整层级', async () => {
    const config = makeConfigRoot([
      {
        name: 'MyGroup',
        type: 'composite' as const,
        elementType: 'group',
        children: [
          makeSymbolNode({ name: 'Child1' }),
          makeSymbolNode({ name: 'Child2' }),
        ],
      },
    ])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    // 根 composite + 嵌套 composite + 2 个 symbol = 4 个对象
    expect(objects.length).toBe(4)

    const composites = objects.filter(o => o.type === 'composite') as CompositeObject[]
    expect(composites.length).toBe(2)

    const rootComposite = composites.find(c => c.name === 'Root')!
    const nestedComposite = composites.find(c => c.name === 'MyGroup')!
    const symbols = objects.filter(o => o.type === 'symbol')

    // 嵌套 composite 是根的子对象
    expect(nestedComposite.parentId).toBe(rootComposite.id)
    expect(rootComposite.childIds).toContain(nestedComposite.id)

    // symbol 是嵌套 composite 的子对象
    expect(nestedComposite.childIds.length).toBe(2)
    for (const sym of symbols) {
      expect(sym.parentId).toBe(nestedComposite.id)
      expect(nestedComposite.childIds).toContain(sym.id)
    }
  })

  it('子对象坐标应为相对于 composite 的局部坐标', async () => {
    // 两个子 symbol 位置相同: centerX=200, centerY=300
    // 嵌套 composite 中心 = (200, 300)
    // 子局部坐标 = (0, 0)
    const config = makeConfigRoot([
      {
        name: 'Group',
        type: 'composite' as const,
        elementType: 'group',
        children: [
          makeSymbolNode({ name: 'A' }),
          makeSymbolNode({ name: 'B' }),
        ],
      },
    ])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    const symbols = objects.filter(o => o.type === 'symbol')
    for (const sym of symbols) {
      expect(sym.x).toBe(0)
      expect(sym.y).toBe(0)
    }
  })
})

describe('convertConfigToSceneObjects - 整体居中', () => {
  it('多个子对象的根 composite 应居中到画布中心', async () => {
    const sym1 = makeSymbolNode({
      name: 'Left',
      instanceTransform: {
        width: 100, height: 80,
        registrationPoint: { parentX: 0, parentY: 0, localX: 50, localY: 40 },
        scaleX: 1, scaleY: 1, rotation: 0,
      },
    })
    const sym2 = makeSymbolNode({
      name: 'Right',
      instanceTransform: {
        width: 100, height: 80,
        registrationPoint: { parentX: 400, parentY: 0, localX: 50, localY: 40 },
        scaleX: 1, scaleY: 1, rotation: 0,
      },
    })
    const config = makeConfigRoot([sym1, sym2])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    // 根 composite 居中到画布中心
    const root = objects[0]!
    expect(root.type).toBe('composite')
    expect(root.x).toBe(CANVAS_CENTER_X)
    expect(root.y).toBe(CANVAS_CENTER_Y)

    // sym1 原始 centerX = 0; sym2 原始 centerX = 400
    // composite 中心 = (0+400)/2 = 200
    // sym1 局部 = 0 - 200 = -200; sym2 局部 = 400 - 200 = 200
    const symbols = objects.filter(o => o.type === 'symbol')
    const left = symbols.find(s => s.name === 'Left')!
    const right = symbols.find(s => s.name === 'Right')!
    expect(left.x).toBe(-200)
    expect(right.x).toBe(200)
  })

  it('可选 fitTo 应等比缩放根 composite 到目标视口内', async () => {
    const large = makeSymbolNode({
      name: 'LargeScene',
      instanceTransform: {
        width: 4000, height: 2000,
        registrationPoint: { parentX: 0, parentY: 0, localX: 0, localY: 0 },
        scaleX: 1, scaleY: 1, rotation: 0,
      },
    })
    const config = makeConfigRoot([large])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), '',
      'entity',
      { width: 1000, height: 500 }
    )

    const root = objects[0]!
    expect(root.x).toBe(CANVAS_CENTER_X)
    expect(root.y).toBe(CANVAS_CENTER_Y)
    expect(root.width).toBe(4000)
    expect(root.height).toBe(2000)
    expect(root.scaleX).toBe(0.25)
    expect(root.scaleY).toBe(0.25)
  })
})

describe('convertConfigToSceneObjects - symbol 属性', () => {
  it('应创建 SymbolObject 并保留 scaleX/scaleY/rotation/alpha', async () => {
    const node = makeSymbolNode({
      alpha: 0.65,
      instanceTransform: {
        width: 200, height: 150,
        registrationPoint: { parentX: 0, parentY: 0, localX: 0, localY: 0 },
        scaleX: 0.5, scaleY: 0.8, rotation: 45,
      },
    })
    const config = makeConfigRoot([node])

    const objects = await convertConfigToSceneObjects(
      config, CANVAS_CENTER_X, CANVAS_CENTER_Y,
      new Map(), new Map(), ''
    )

    const sym = objects.find(o => o.type === 'symbol')! as SymbolObject
    expect(sym.type).toBe('symbol')
    expect(sym.width).toBe(200)
    expect(sym.height).toBe(150)
    expect(sym.scaleX).toBe(0.5)
    expect(sym.scaleY).toBe(0.8)
    expect(sym.rotation).toBe(45 * Math.PI / 180)
    expect(sym.alpha).toBe(0.65)
    expect(sym.materials.length).toBe(1)
    expect(sym.materials[0]!.type).toBe('static')
    expect(sym.materials[0]!.url).toBe('')
  })
})
