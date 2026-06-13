/**
 * WorkbenchBaseTransformSnapshot.spec.ts
 *
 * 覆盖：
 * - capture 返回的快照是独立副本（后续对容器的改动不会污染快照）
 * - apply 能把容器 position/scale/rotation/alpha/pivot 完整还原
 * - Phase 0 smoke：模拟"加载 A 动画 → 用户改动 pivot → 切 B（空）动画"路径后，
 *   容器应回到 mount 快照（特别是 pivot 必须被还原，否则会残留上一条轨道的 track.pivot）
 */

import * as PIXI from 'pixi.js'
import { describe, expect, it } from 'vitest'

import {
    applyContainerBaseTransform,
    captureContainerBaseState,
} from '../WorkbenchBaseTransformSnapshot'

function makeContainer(opts: {
    position?: [number, number]
    scale?: [number, number]
    pivot?: [number, number]
    rotation?: number
    alpha?: number
}): PIXI.Container {
    const c = new PIXI.Container()
    if (opts.position) c.position.set(opts.position[0], opts.position[1])
    if (opts.scale) c.scale.set(opts.scale[0], opts.scale[1])
    if (opts.pivot) c.pivot.set(opts.pivot[0], opts.pivot[1])
    if (opts.rotation !== undefined) c.rotation = opts.rotation
    if (opts.alpha !== undefined) c.alpha = opts.alpha
    return c
}

describe('WorkbenchBaseTransformSnapshot — captureContainerBaseState', () => {
    it('完整读取当前容器的几何量', () => {
        const c = makeContainer({
            position: [10, 20],
            scale: [1.5, 2],
            pivot: [5, 6],
            rotation: 0.3,
            alpha: 0.8,
        })

        const state = captureContainerBaseState(c, 'obj-A')

        expect(state.objectId).toBe('obj-A')
        expect(state.position).toEqual({ x: 10, y: 20 })
        expect(state.scale).toEqual({ x: 1.5, y: 2 })
        expect(state.pivot).toEqual({ x: 5, y: 6 })
        expect(state.rotation).toBe(0.3)
        expect(state.alpha).toBe(0.8)
    })

    it('返回的快照是独立副本——后续改容器不会影响快照', () => {
        const c = makeContainer({ position: [1, 2], pivot: [3, 4] })
        const state = captureContainerBaseState(c, null)

        c.position.set(999, 999)
        c.pivot.set(999, 999)

        expect(state.position).toEqual({ x: 1, y: 2 })
        expect(state.pivot).toEqual({ x: 3, y: 4 })
    })

    it('objectId = null 时也能正常捕获', () => {
        const c = new PIXI.Container()
        const state = captureContainerBaseState(c, null)
        expect(state.objectId).toBeNull()
    })
})

describe('WorkbenchBaseTransformSnapshot — applyContainerBaseTransform', () => {
    it('把全部 5 个量完整写回容器', () => {
        const snapshot = captureContainerBaseState(
            makeContainer({
                position: [100, 200],
                scale: [0.5, 0.5],
                pivot: [10, 20],
                rotation: 0.7,
                alpha: 0.6,
            }),
            'obj-X',
        )

        const target = new PIXI.Container()
        applyContainerBaseTransform(target, snapshot)

        expect(target.position.x).toBe(100)
        expect(target.position.y).toBe(200)
        expect(target.scale.x).toBe(0.5)
        expect(target.scale.y).toBe(0.5)
        expect(target.pivot.x).toBe(10)
        expect(target.pivot.y).toBe(20)
        expect(target.rotation).toBe(0.7)
        expect(target.alpha).toBe(0.6)
    })

    it('不触碰 filters 和子节点——只还原几何量', () => {
        const target = new PIXI.Container()
        const child = new PIXI.Container()
        target.addChild(child)
        const dummyFilter = { padding: 0 } as unknown as PIXI.Filter
        target.filters = [dummyFilter]

        const snapshot = captureContainerBaseState(new PIXI.Container(), null)
        applyContainerBaseTransform(target, snapshot)

        expect(target.children).toContain(child)
        expect(target.filters).toEqual([dummyFilter])
    })
})

describe('WorkbenchBaseTransformSnapshot — Phase 0 smoke：切换动画后容器状态回归', () => {
    it('加载 A → 用户改动 pivot → 切 B（空）：恢复到 mount 时刻快照', () => {
        // 1) mount 时刻（加载 A 前）——业务路径在 onContainerReady 捕获基准快照
        const container = makeContainer({
            position: [50, 60],
            scale: [1, 1],
            pivot: [8, 9],
            rotation: 0,
            alpha: 1,
        })
        const mountSnapshot = captureContainerBaseState(container, 'root')

        // 2) 加载 A 动画 → 中间路径会改 container.pivot / position / rotation / scale
        //    用户又在 PivotEditorPanel 里把 pivot 拖到新位置
        container.position.set(120, 140)
        container.scale.set(1.4, 1.4)
        container.pivot.set(35, 40)
        container.rotation = 0.9
        container.alpha = 0.5

        // 3) 切到 B（空动画）—— AnimationWorkbench.resetContainerToBaseStateWithKey 路径
        //    会调用 applyContainerBaseTransform(container, mountSnapshot)
        applyContainerBaseTransform(container, mountSnapshot)

        // 4) 断言：(position, scale, rotation, pivot, alpha) 全部回到 mount 快照
        expect(container.position.x).toBe(50)
        expect(container.position.y).toBe(60)
        expect(container.scale.x).toBe(1)
        expect(container.scale.y).toBe(1)
        expect(container.pivot.x).toBe(8)
        expect(container.pivot.y).toBe(9)
        expect(container.rotation).toBe(0)
        expect(container.alpha).toBe(1)
    })

    it('连续多次 apply 保持幂等', () => {
        const container = makeContainer({ position: [1, 2], pivot: [3, 4] })
        const snapshot = captureContainerBaseState(container, null)

        container.position.set(77, 88)
        applyContainerBaseTransform(container, snapshot)
        applyContainerBaseTransform(container, snapshot)
        applyContainerBaseTransform(container, snapshot)

        expect(container.position.x).toBe(1)
        expect(container.position.y).toBe(2)
        expect(container.pivot.x).toBe(3)
        expect(container.pivot.y).toBe(4)
    })
})
