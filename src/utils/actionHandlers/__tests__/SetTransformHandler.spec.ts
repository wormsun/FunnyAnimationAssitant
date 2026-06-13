/**
 * SetTransformHandler 单元测试
 * v9.3 更新：仅测试几何属性 (x, y, scaleX, scaleY, rotation) 和透明度 (alpha)
 * 
 * 注意：visible/flipX/zIndex 已移至 SetVisualHandler
 *       spawned 已移至 SetLifecycleHandler
 */

import { describe, expect, it } from 'vitest'

import type { SetTransformAction } from '@/types/screenplay'

import { localToGlobal } from '../matrixUtils'
import { SetTransformHandler } from '../handlers/SetTransformHandler'
import type { ActionHandlerContext, WriteableState } from '../types'

describe('SetTransformHandler', () => {
    // 创建初始状态
    function createInitialState(): WriteableState {
        return {
            x: 100,
            y: 100,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            alpha: 1,
            visible: true,
            flipX: false,
            zIndex: 10
        }
    }

    describe('透明度属性', () => {
        it('应用 alpha 属性', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { alpha: 0.5 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.alpha).toBe(0.5)
            // 其他属性不变
            expect(state.x).toBe(100)
            expect(state.y).toBe(100)
        })
    })

    describe('几何属性', () => {
        it('应用 x, y 位置变换', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { x: 500, y: 300 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(500)
            expect(state.y).toBe(300)
            // 其他属性不变
            expect(state.scaleX).toBe(1)
            expect(state.scaleY).toBe(1)
        })

        it('应用 scaleX, scaleY 缩放变换', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { scaleX: 2.0, scaleY: 1.5 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.scaleX).toBe(2.0)
            expect(state.scaleY).toBe(1.5)
        })

        it('应用 rotation 旋转变换', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { rotation: 45 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.rotation).toBe(45)
        })

        it('有 parent 时 rotation 仍按局部值应用', () => {
            const state: WriteableState = {
                ...createInitialState(),
                id: 'child',
                parentId: 'parent',
                rotation: 0,
            }
            const ctx: ActionHandlerContext = {
                getObjectState: (id) => id === 'parent'
                    ? {
                        id: 'parent',
                        x: 0,
                        y: 0,
                        rotation: Math.PI / 3,
                        scaleX: 1,
                        scaleY: 1,
                    }
                    : undefined
            }
            const action: SetTransformAction = {
                id: 'action_parent_local_rotation',
                type: 'set_transform',
                category: 'point',
                target: 'child',
                slotIndex: 0,
                params: { rotation: Math.PI / 2 }
            }

            SetTransformHandler.applyToState(state, action, ctx)

            expect(state.rotation).toBe(Math.PI / 2)
        })

        it('同时应用多个几何属性', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    x: 200,
                    y: 150,
                    scaleX: 0.8,
                    scaleY: 0.8,
                    rotation: 90
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(200)
            expect(state.y).toBe(150)
            expect(state.scaleX).toBe(0.8)
            expect(state.scaleY).toBe(0.8)
            expect(state.rotation).toBe(90)
        })

        it('混合应用几何和透明度属性', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    x: 300,
                    y: 200,
                    alpha: 0.7
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(300)
            expect(state.y).toBe(200)
            expect(state.alpha).toBe(0.7)
        })
    })

    describe('边界情况', () => {
        it('空 params 不修改状态', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {}
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(100)
            expect(state.y).toBe(100)
            expect(state.alpha).toBe(1)
        })

        it('只设置 x 不影响 y', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { x: 999 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(999)
            expect(state.y).toBe(100) // 原值不变
        })

        it('处理负值坐标', () => {
            const state = createInitialState()
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { x: -100, y: -50 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(-100)
            expect(state.y).toBe(-50)
        })

        it('处理 0 值旋转', () => {
            const state = createInitialState()
            state.rotation = 45 // 先设置非 0 值
            const action: SetTransformAction = {
                id: 'action_1',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: { rotation: 0 }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.rotation).toBe(0)
        })

        it('仅修改变换点时执行运行时位置补偿，而不要求 action 显式提供 x/y', () => {
            const state = createInitialState()
            state.rotation = Math.PI / 4

            const action: SetTransformAction = {
                id: 'action_origin_only',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    transformOriginX: 10,
                    transformOriginY: 0
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.transformOriginX).toBe(10)
            expect(state.transformOriginY).toBe(0)
            expect(state.x).toBeCloseTo(97.0710678, 5)
            expect(state.y).toBeCloseTo(107.0710678, 5)
        })

        it('显式提供 x/y 时不重复执行变换点补偿', () => {
            const state = createInitialState()
            state.rotation = Math.PI / 4

            const action: SetTransformAction = {
                id: 'action_origin_with_position',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    x: 320,
                    y: 240,
                    transformOriginX: 10,
                    transformOriginY: 0
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(320)
            expect(state.y).toBe(240)
            expect(state.transformOriginX).toBe(10)
            expect(state.transformOriginY).toBe(0)
        })

        it('同时修改变换点和 rotation 时不执行位置补偿', () => {
            const state = createInitialState()
            state.rotation = Math.PI / 4

            const action: SetTransformAction = {
                id: 'action_origin_with_rotation',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    rotation: Math.PI / 2,
                    transformOriginX: 10,
                    transformOriginY: 0
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(100)
            expect(state.y).toBe(100)
            expect(state.rotation).toBe(Math.PI / 2)
            expect(state.transformOriginX).toBe(10)
            expect(state.transformOriginY).toBe(0)
        })

        it('同时修改变换点和 scale 时不执行位置补偿', () => {
            const state = createInitialState()
            state.rotation = Math.PI / 4

            const action: SetTransformAction = {
                id: 'action_origin_with_scale',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    scaleX: 2,
                    scaleY: 1.5,
                    transformOriginX: 10,
                    transformOriginY: 0
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(100)
            expect(state.y).toBe(100)
            expect(state.scaleX).toBe(2)
            expect(state.scaleY).toBe(1.5)
            expect(state.transformOriginX).toBe(10)
            expect(state.transformOriginY).toBe(0)
        })

        it('同时设置 x/y、rotation、scale 和变换点时，所有字段都应生效', () => {
            const state = createInitialState()

            const action: SetTransformAction = {
                id: 'action_full_transform_with_origin',
                type: 'set_transform',
                category: 'point',
                target: 'obj_1',
                slotIndex: 0,
                params: {
                    x: 320,
                    y: 240,
                    rotation: Math.PI / 2,
                    scaleX: 2,
                    scaleY: 1.5,
                    transformOriginX: 10,
                    transformOriginY: -5
                }
            }

            SetTransformHandler.applyToState(state, action)

            expect(state.x).toBe(320)
            expect(state.y).toBe(240)
            expect(state.rotation).toBe(Math.PI / 2)
            expect(state.scaleX).toBe(2)
            expect(state.scaleY).toBe(1.5)
            expect(state.transformOriginX).toBe(10)
            expect(state.transformOriginY).toBe(-5)
        })

        it('同一 action 同时设置全局 x/y 和 rotation 时，位置按新的局部旋转求值', () => {
            const parent: WriteableState = {
                id: 'parent',
                type: 'composite',
                x: 2985.398782411442,
                y: 1485.7918595697022,
                scaleX: 1.5,
                scaleY: 1.5,
                rotation: 0,
                flipX: false,
            }
            const state: WriteableState = {
                id: 'child',
                type: 'symbol',
                parentId: 'parent',
                x: 72.50790723415938,
                y: -4.19332253894693,
                scaleX: 1,
                scaleY: 1,
                rotation: 1.5500334092032622,
                flipX: false,
                transformOriginX: -17.5,
                transformOriginY: -63.333335876464844,
            }
            const ctx: ActionHandlerContext = {
                getObjectState: (id) => id === 'parent' ? parent : undefined
            }
            const targetGlobal = {
                x: 3291.5453209074863,
                y: 1516.1281780045538,
            }
            const action: SetTransformAction = {
                id: 'action_position_and_rotation',
                type: 'set_transform',
                category: 'point',
                target: 'child',
                slotIndex: 0,
                params: {
                    ...targetGlobal,
                    rotation: 0,
                }
            }

            SetTransformHandler.applyToState(state, action, ctx)

            expect(state.rotation).toBe(0)
            const resolvedGlobal = localToGlobal(state, ctx.getObjectState)
            expect(resolvedGlobal.x).toBeCloseTo(targetGlobal.x, 5)
            expect(resolvedGlobal.y).toBeCloseTo(targetGlobal.y, 5)
        })
    })

    describe('Handler 元数据', () => {
        it('类型为 set_transform', () => {
            expect(SetTransformHandler.type).toBe('set_transform')
        })

        it('是 Point Action', () => {
            expect(SetTransformHandler.isPointAction).toBe(true)
        })

        it('不是 Duration Action', () => {
            expect(SetTransformHandler.isDurationAction).toBe(false)
        })
    })
})
