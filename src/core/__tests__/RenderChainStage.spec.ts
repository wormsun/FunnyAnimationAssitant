/**
 * RenderChainStage 单元测试
 *
 * 验证 override render() 方案：
 * 1. 基础排序：renderByRenderChain 按 renderChain 顺序调度 render
 * 2. 跨 union 交叉：union 内子对象能与 entity 直接子对象交叉渲染
 * 3. 深层嵌套：entity → union → union → leaf
 * 4. installRenderChainRenderer 正确安装 override
 */

import * as PIXI from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'

import {
    installRenderChainRenderer,
    installRootRenderChainRenderer,
    renderByRenderChain,
} from '../RenderChainStage'

// ============================================================================
// Helpers
// ============================================================================

function makeContainer(name: string): PIXI.Container {
    const c = new PIXI.Container()
    c.name = name
    return c
}

// ============================================================================
// renderByRenderChain
// ============================================================================

describe('renderByRenderChain', () => {
    it('should call render on containers in renderChain order', () => {
        const entity = new PIXI.Container()
        const a = makeContainer('objA')
        const b = makeContainer('objB')
        const c = makeContainer('objC')
        entity.addChild(a, b, c)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        // Mock render 方法记录调用顺序
        a.render = vi.fn(() => { renderOrder.push('objA') })
        b.render = vi.fn(() => { renderOrder.push('objB') })
        c.render = vi.fn(() => { renderOrder.push('objC') })

        const containerMap = new Map<string, PIXI.Container>([
            ['objA', a], ['objB', b], ['objC', c],
        ])

        renderByRenderChain(entity, ['objC', 'objA', 'objB'], containerMap, mockRenderer)

        expect(renderOrder).toEqual(['objC', 'objA', 'objB'])
    })

    it('should interleave union children with direct children', () => {
        // entity 直接 children: propC, union(childA, childB)
        // renderChain: ['childA', 'propC', 'childB']
        // 期望渲染顺序: childA → propC → childB（交叉渲染）
        const entity = new PIXI.Container()
        const union = makeContainer('composite_union1')
        const childA = makeContainer('childA')
        const childB = makeContainer('childB')
        union.addChild(childA, childB)
        const propC = makeContainer('propC')
        entity.addChild(propC, union)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        childA.render = vi.fn(() => { renderOrder.push('childA') })
        childB.render = vi.fn(() => { renderOrder.push('childB') })
        propC.render = vi.fn(() => { renderOrder.push('propC') })
        union.render = vi.fn(() => { renderOrder.push('union') })

        const containerMap = new Map<string, PIXI.Container>([
            ['childA', childA], ['propC', propC], ['childB', childB],
        ])

        renderByRenderChain(entity, ['childA', 'propC', 'childB'], containerMap, mockRenderer)

        // union 容器不应被渲染（它不在 renderChain 中，且其子对象已被独立渲染）
        expect(renderOrder).toEqual(['childA', 'propC', 'childB'])
    })

    it('should handle deeply nested unions', () => {
        // entity → unionA → unionB → child1, entity → propD
        const entity = new PIXI.Container()
        const unionA = makeContainer('composite_unionA')
        const unionB = makeContainer('composite_unionB')
        const child1 = makeContainer('child1')
        const propD = makeContainer('propD')
        unionB.addChild(child1)
        unionA.addChild(unionB)
        entity.addChild(propD, unionA)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        child1.render = vi.fn(() => { renderOrder.push('child1') })
        propD.render = vi.fn(() => { renderOrder.push('propD') })
        unionA.render = vi.fn(() => { renderOrder.push('unionA') })
        unionB.render = vi.fn(() => { renderOrder.push('unionB') })

        const containerMap = new Map<string, PIXI.Container>([
            ['child1', child1], ['propD', propD],
        ])

        renderByRenderChain(entity, ['child1', 'propD'], containerMap, mockRenderer)

        // child1 先渲染，propD 后渲染。union 容器不应被渲染。
        expect(renderOrder).toEqual(['child1', 'propD'])
    })

    it('should render union children NOT in renderChain (dynamic spawn fallback)', () => {
        // 场景：PropNew 动态加入 union 但 renderChain 尚未协调
        // stage → propA, union(charA, propNew), propB
        // renderChain: [propA, charA, propB]（缺少 propNew）
        // 期望：propNew 仍然被渲染（通过递归 union 容器的兜底逻辑）
        const stage = new PIXI.Container()
        const propA = makeContainer('propA')
        const union = makeContainer('composite_union1')
        const charA = makeContainer('charA')
        const propNew = makeContainer('propNew')
        const propB = makeContainer('propB')

        union.addChild(charA, propNew)
        stage.addChild(propA, union, propB)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        propA.render = vi.fn(() => { renderOrder.push('propA') })
        charA.render = vi.fn(() => { renderOrder.push('charA') })
        propNew.render = vi.fn(() => { renderOrder.push('propNew') })
        propB.render = vi.fn(() => { renderOrder.push('propB') })
        union.render = vi.fn(() => { renderOrder.push('union') })

        const containerMap = new Map<string, PIXI.Container>([
            ['propA', propA], ['charA', charA], ['propB', propB],
            // 注意：propNew 不在 containerMap 中（模拟不在 renderChain 中）
        ])

        renderByRenderChain(stage, ['propA', 'charA', 'propB'], containerMap, mockRenderer)

        // propNew 不在 renderChain 中，但应通过递归 union 兜底被渲染
        expect(renderOrder).toContain('propNew')
        // union 容器自身不应被整体渲染
        expect(renderOrder).not.toContain('union')
        // renderChain 中的对象按顺序先渲染，propNew 在兜底阶段渲染
        const propNewIdx = renderOrder.indexOf('propNew')
        const propBIdx = renderOrder.indexOf('propB')
        expect(propNewIdx).toBeGreaterThan(propBIdx) // propNew 在 renderChain 对象之后
    })

    it('should NOT double-render leaf internals inside union (rendering order regression)', () => {
        // 回归测试：entity → union(头部[sprite头], 后发[sprite发]) 
        // renderChain: [后发, 头部]（后发先画，头部覆盖后发）
        // 如果兜底阶段递归进入叶子容器内部，sprite 会按 PIXI children 顺序被重绘，
        // 导致渲染顺序变为 头部→后发（后发错误地覆盖头部）
        const entity = new PIXI.Container()
        const union = makeContainer('composite_头部组')
        const 头部 = makeContainer('头部')
        const sprite头 = makeContainer('sprite_头')
        头部.addChild(sprite头)  // 头部内部有精灵图子节点
        const 后发 = makeContainer('后发')
        const sprite发 = makeContainer('sprite_发')
        后发.addChild(sprite发)  // 后发内部有精灵图子节点
        union.addChild(头部, 后发)
        entity.addChild(union)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        // Mock 所有容器的 render
        头部.render = vi.fn(() => { renderOrder.push('头部') })
        后发.render = vi.fn(() => { renderOrder.push('后发') })
        sprite头.render = vi.fn(() => { renderOrder.push('sprite_头') })
        sprite发.render = vi.fn(() => { renderOrder.push('sprite_发') })
        union.render = vi.fn(() => { renderOrder.push('union') })

        const containerMap = new Map<string, PIXI.Container>([
            ['后发', 后发], ['头部', 头部],
        ])

        // renderChain: 后发在前（先画），头部在后（覆盖后发）
        renderByRenderChain(entity, ['后发', '头部'], containerMap, mockRenderer)

        // 核心断言：每个叶子只被 render 一次（不被兜底阶段重复渲染）
        expect(后发.render).toHaveBeenCalledTimes(1)
        expect(头部.render).toHaveBeenCalledTimes(1)
        // 内部精灵图不应被单独渲染（由叶子容器的 render 递归处理）
        expect(sprite头.render).not.toHaveBeenCalled()
        expect(sprite发.render).not.toHaveBeenCalled()
        // 渲染顺序正确：后发先于头部
        expect(renderOrder).toEqual(['后发', '头部'])
        // union 容器不应被整体渲染
        expect(renderOrder).not.toContain('union')
    })

    it('should render non-renderChain children (overlays) at the end', () => {
        const entity = new PIXI.Container()
        const a = makeContainer('objA')
        const overlay = makeContainer('overlay_selection')
        entity.addChild(a, overlay)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        a.render = vi.fn(() => { renderOrder.push('objA') })
        overlay.render = vi.fn(() => { renderOrder.push('overlay') })

        const containerMap = new Map<string, PIXI.Container>([
            ['objA', a],
        ])

        renderByRenderChain(entity, ['objA'], containerMap, mockRenderer)

        // overlay 不在 renderChain 中 → 最后渲染
        expect(renderOrder).toEqual(['objA', 'overlay'])
    })

    it('should render clip wrapper instead of bypassing it for wrapped targets', () => {
        const entity = new PIXI.Container()
        const wrapper = makeContainer('__clip_mask_wrapper__targetA')
        const target = makeContainer('targetA')
        const sibling = makeContainer('siblingB')
        wrapper.addChild(target)
        entity.addChild(wrapper, sibling)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        wrapper.render = vi.fn(() => { renderOrder.push('wrapper') })
        target.render = vi.fn(() => { renderOrder.push('target') })
        sibling.render = vi.fn(() => { renderOrder.push('sibling') })

        const containerMap = new Map<string, PIXI.Container>([
            ['targetA', target], ['siblingB', sibling],
        ])

        renderByRenderChain(entity, ['targetA', 'siblingB'], containerMap, mockRenderer)

        expect(renderOrder).toEqual(['wrapper', 'sibling'])
        expect(wrapper.render).toHaveBeenCalledTimes(1)
        expect(target.render).not.toHaveBeenCalled()
    })

    it('should skip invisible containers', () => {
        const entity = new PIXI.Container()
        const a = makeContainer('objA')
        const b = makeContainer('objB')
        b.visible = false
        entity.addChild(a, b)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        a.render = vi.fn(() => { renderOrder.push('objA') })
        b.render = vi.fn(() => { renderOrder.push('objB') })

        const containerMap = new Map<string, PIXI.Container>([
            ['objA', a], ['objB', b],
        ])

        renderByRenderChain(entity, ['objA', 'objB'], containerMap, mockRenderer)

        expect(renderOrder).toEqual(['objA'])
    })

    it('should correctly interleave back-hair behind body (real-world)', () => {
        // 实际场景：entity → [后裙, 双腿, 身子, 背饰, union(头部+后发+表情), 左手, 右手]
        // renderChain: [背饰, 后裙, 后发, 双腿, 右手, 身子, 头部, 表情, 左手]
        const entity = new PIXI.Container()
        const 后裙 = makeContainer('后裙')
        const 双腿 = makeContainer('双腿')
        const 身子 = makeContainer('身子')
        const 背饰 = makeContainer('背饰')
        const union = makeContainer('composite_头部组')
        const 头部 = makeContainer('头部')
        const 后发 = makeContainer('后发')
        const 表情 = makeContainer('表情')
        union.addChild(头部, 后发, 表情)
        const 左手 = makeContainer('左手')
        const 右手 = makeContainer('右手')
        entity.addChild(后裙, 双腿, 身子, 背饰, union, 左手, 右手)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        for (const c of [后裙, 双腿, 身子, 背饰, 头部, 后发, 表情, 左手, 右手, union]) {
            const name = c.name!
            c.render = vi.fn(() => { renderOrder.push(name) })
        }

        const containerMap = new Map<string, PIXI.Container>([
            ['背饰', 背饰], ['后裙', 后裙], ['后发', 后发],
            ['双腿', 双腿], ['右手', 右手], ['身子', 身子],
            ['头部', 头部], ['表情', 表情], ['左手', 左手],
        ])

        renderByRenderChain(
            entity,
            ['背饰', '后裙', '后发', '双腿', '右手', '身子', '头部', '表情', '左手'],
            containerMap,
            mockRenderer,
        )

        // 核心验证：后发在身子之前渲染（身子覆盖后发 ✅）
        const 后发Idx = renderOrder.indexOf('后发')
        const 身子Idx = renderOrder.indexOf('身子')
        expect(后发Idx).toBeLessThan(身子Idx)

        // 头部和表情在身子之后渲染 ✅
        const 头部Idx = renderOrder.indexOf('头部')
        const 表情Idx = renderOrder.indexOf('表情')
        expect(头部Idx).toBeGreaterThan(身子Idx)
        expect(表情Idx).toBeGreaterThan(身子Idx)

        // union 容器不应被单独渲染
        expect(renderOrder).not.toContain('composite_头部组')

        // 完整顺序
        expect(renderOrder).toEqual([
            '背饰', '后裙', '后发', '双腿', '右手', '身子', '头部', '表情', '左手',
        ])
    })
})

// ============================================================================
// installRenderChainRenderer
// ============================================================================

describe('installRenderChainRenderer', () => {
    it('should mark container with _hasRenderChainOverride', () => {
        const entity = new PIXI.Container()
        installRenderChainRenderer(entity, ['a'], new Map())
        expect((entity as PIXI.Container & { _hasRenderChainOverride?: boolean })._hasRenderChainOverride).toBe(true)
    })

    it('should not install on empty renderChain', () => {
        const entity = new PIXI.Container()
        const originalRender = entity.render
        installRenderChainRenderer(entity, [], new Map())
        expect(entity.render).toBe(originalRender)
    })
})

// ============================================================================
// installRootRenderChainRenderer — 根级 stage 场景
// ============================================================================

describe('installRootRenderChainRenderer', () => {
    it('should mark container with _hasRootRenderChainOverride', () => {
        const stage = new PIXI.Container()
        installRootRenderChainRenderer(stage, () => [], () => undefined)
        expect((stage as PIXI.Container & { _hasRootRenderChainOverride?: boolean })._hasRootRenderChainOverride).toBe(true)
    })

    it('should cross-render root-level union children with direct stage children', () => {
        // 根级场景：stage 有 propA、unionContainer(charA, charB)、propB
        // sceneRenderChain: [propA, charA, propB, charB]
        // 期望渲染顺序: propA → charA → propB → charB（跨容器交叉）
        const stage = new PIXI.Container()
        const propA = makeContainer('propA')
        const unionContainer = makeContainer('composite_union1')
        const charA = makeContainer('charA')
        const charB = makeContainer('charB')
        const propB = makeContainer('propB')

        unionContainer.addChild(charA, charB)
        stage.addChild(propA, unionContainer, propB)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        propA.render = vi.fn(() => { renderOrder.push('propA') })
        propB.render = vi.fn(() => { renderOrder.push('propB') })
        charA.render = vi.fn(() => { renderOrder.push('charA') })
        charB.render = vi.fn(() => { renderOrder.push('charB') })
        unionContainer.render = vi.fn(() => { renderOrder.push('union') })

        const containerMap = new Map<string, PIXI.Container>([
            ['propA', propA], ['charA', charA], ['propB', propB], ['charB', charB],
        ])
        const renderChain = ['propA', 'charA', 'propB', 'charB']

        installRootRenderChainRenderer(
            stage,
            () => renderChain,
            (id: string) => containerMap.get(id),
        )

        stage.render(mockRenderer)

        // union 容器不应被单独渲染
        expect(renderOrder).not.toContain('union')
        // 按 renderChain 正确交叉渲染
        expect(renderOrder).toEqual(['propA', 'charA', 'propB', 'charB'])
    })

    it('should use latest chain from resolver on each render call', () => {
        // 模拟 zIndex 变化后 renderChain 重排序（resolver 动态模式）
        const stage = new PIXI.Container()
        const a = makeContainer('objA')
        const b = makeContainer('objB')
        stage.addChild(a, b)

        const renderOrder: string[] = []
        const mockRenderer = {} as PIXI.Renderer

        let currentChain = ['objA', 'objB']
        const containerMap = new Map<string, PIXI.Container>([['objA', a], ['objB', b]])

        a.render = vi.fn(() => { renderOrder.push('objA') })
        b.render = vi.fn(() => { renderOrder.push('objB') })

        installRootRenderChainRenderer(
            stage,
            () => currentChain,
            (id: string) => containerMap.get(id),
        )

        // 第一次 render：顺序 A → B
        stage.render(mockRenderer)
        expect(renderOrder).toEqual(['objA', 'objB'])

        // 模拟 zIndex 变化，renderChain 倒序
        renderOrder.length = 0
        currentChain = ['objB', 'objA']

        // 第二次 render：应使用新 chain，顺序 B → A
        stage.render(mockRenderer)
        expect(renderOrder).toEqual(['objB', 'objA'])
    })
})
