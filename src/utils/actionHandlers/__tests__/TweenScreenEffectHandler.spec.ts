/**
 * TweenScreenEffectHandler 单元测试 (Phase 1)
 * 注意: Handler 直接操作 state.params（消除 flat state 中间层）
 * coverOpacity 已删除，覆盖不透明度统一由 SceneObject.alpha 控制
 */

import { describe, expect, it } from 'vitest'

import type { ScreenEffectParams } from '@/types/sceneObject'
import type { TweenScreenEffectAction } from '@/types/screenplay'

import { TweenScreenEffectHandler } from '../handlers/TweenScreenEffectHandler'
import type { WriteableState } from '../types'

describe('TweenScreenEffectHandler', () => {
    function createInitialState(): WriteableState {
        return {
            params: {
                baseColor: '#000000',
                openRatio: 1.0,
                feather: 0,
                holeCenterX: 960,
                holeCenterY: 540,
                holeWidth: 400,
                holeHeight: 300,
                offsetX: 0,
                offsetY: 0
            } as ScreenEffectParams
        }
    }

    function createAction(params: TweenScreenEffectAction['params']): TweenScreenEffectAction {
        return {
            id: 'action_1',
            type: 'tween_screen_effect',
            category: 'duration',
            target: 'obj_1',
            slotIndex: 0,
            slotSpan: 2,
            params
        }
    }

    describe('applyToState (瞬时应用目标值)', () => {
        it('设置 openRatio 目标值', () => {
            const state = createInitialState()
            TweenScreenEffectHandler.applyToState(state, createAction({ openRatio: 0.2 }))
            expect(state.params!.openRatio).toBe(0.2)
        })

        it('设置多个目标值', () => {
            const state = createInitialState()
            TweenScreenEffectHandler.applyToState(state, createAction({
                openRatio: 0.5,
                feather: 60
            }))
            expect(state.params!.openRatio).toBe(0.5)
            expect(state.params!.feather).toBe(60)
        })
    })

    describe('interpolate (线性插值)', () => {
        it('progress=0 返回起始状态', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ openRatio: 0 })

            TweenScreenEffectHandler.interpolate!(state, action, 0, startState)
            expect(state.params!.openRatio).toBe(1.0) // 起始值
        })

        it('progress=1 返回目标状态', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ openRatio: 0 })

            TweenScreenEffectHandler.interpolate!(state, action, 1, startState)
            expect(state.params!.openRatio).toBe(0) // 目标值
        })

        it('progress=0.5 返回中间值', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ openRatio: 0 })

            TweenScreenEffectHandler.interpolate!(state, action, 0.5, startState)
            expect(state.params!.openRatio).toBeCloseTo(0.5) // (1.0 + 0) / 2
        })

        it('feather 插值', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ feather: 100 })

            TweenScreenEffectHandler.interpolate!(state, action, 0.5, startState)
            expect(state.params!.feather).toBeCloseTo(50) // (0 + 100) / 2
        })

        it('多参数同时插值', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({
                openRatio: 0,
                feather: 100
            })

            TweenScreenEffectHandler.interpolate!(state, action, 0.5, startState)
            expect(state.params!.openRatio).toBeCloseTo(0.5)
            expect(state.params!.feather).toBeCloseTo(50)
        })

        it('部分参数只插值指定字段', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ openRatio: 0 })

            TweenScreenEffectHandler.interpolate!(state, action, 0.5, startState)
            expect(state.params!.openRatio).toBeCloseTo(0.5)
            // 未指定的字段不变
            expect(state.params!.feather).toBe(0)
        })

        it('非数值型参数在 progress < 1 时不切换', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ baseColor: '#ff0000' })

            TweenScreenEffectHandler.interpolate!(state, action, 0.5, startState)
            expect(state.params!.baseColor).toBe('#000000') // 未切换
        })

        it('非数值型参数在 progress >= 1 时切换', () => {
            const state = createInitialState()
            const startState = createInitialState()
            const action = createAction({ baseColor: '#ff0000' })

            TweenScreenEffectHandler.interpolate!(state, action, 1, startState)
            expect(state.params!.baseColor).toBe('#ff0000') // 已切换
        })
    })

    describe('getTargetState', () => {
        it('与 applyToState 行为一致', () => {
            const state = createInitialState()
            TweenScreenEffectHandler.getTargetState!(state, createAction({ openRatio: 0.3 }))
            expect(state.params!.openRatio).toBe(0.3)
        })
    })

    describe('Handler 元数据', () => {
        it('类型为 tween_screen_effect', () => {
            expect(TweenScreenEffectHandler.type).toBe('tween_screen_effect')
        })

        it('不是 Point Action', () => {
            expect(TweenScreenEffectHandler.isPointAction).toBe(false)
        })

        it('是 Duration Action', () => {
            expect(TweenScreenEffectHandler.isDurationAction).toBe(true)
        })
    })
})
