/**
 * SetScreenEffectHandler 单元测试 (Phase 1)
 * 注意: Handler 直接操作 state.params（消除 flat state 中间层）
 * coverOpacity 已删除，覆盖不透明度统一由 SceneObject.alpha 控制
 */

import { describe, expect, it } from 'vitest'

import type { ScreenEffectParams } from '@/types/sceneObject'
import type { SetScreenEffectAction } from '@/types/screenplay'

import { SetScreenEffectHandler } from '../handlers/SetScreenEffectHandler'
import type { WriteableState } from '../types'

describe('SetScreenEffectHandler', () => {
    function createInitialState(): WriteableState {
        return {
            params: {
                baseColor: '#000000',
                openRatio: 1.0,
                feather: 0,
                holeCenterX: 960,
                holeCenterY: 540,
                holeWidth: 400,
                holeHeight: 300
            } as ScreenEffectParams
        }
    }

    function createAction(params: SetScreenEffectAction['params']): SetScreenEffectAction {
        return {
            id: 'action_1',
            type: 'set_screen_effect',
            category: 'point',
            target: 'obj_1',
            slotIndex: 0,
            params
        }
    }

    describe('覆盖型参数', () => {
        it('应用 baseColor', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({ baseColor: '#ff0000' }))
            expect(state.params!.baseColor).toBe('#ff0000')
        })
    })

    describe('孔洞参数', () => {
        it('应用 openRatio', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({ openRatio: 0.3 }))
            expect(state.params!.openRatio).toBe(0.3)
        })

        it('应用 holeShape', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({ holeShape: 'vertical_ellipse' }))
            expect(state.params!.holeShape).toBe('vertical_ellipse')
        })

        it('应用 feather', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({ feather: 80 }))
            expect(state.params!.feather).toBe(80)
        })
    })

    describe('跟随参数', () => {
        it('应用 targetId 和 offset', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({
                targetId: 'char_1',
                offsetX: 50,
                offsetY: -100
            }))
            expect(state.params!.targetId).toBe('char_1')
            expect(state.params!.offsetX).toBe(50)
            expect(state.params!.offsetY).toBe(-100)
        })
    })

    describe('同时应用多个参数', () => {
        it('混合应用覆盖和孔洞参数', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({
                baseColor: '#ff0000',
                holeShape: 'horizontal_ellipse',
                openRatio: 0.5,
                feather: 40
            }))
            expect(state.params!.baseColor).toBe('#ff0000')
            expect(state.params!.holeShape).toBe('horizontal_ellipse')
            expect(state.params!.openRatio).toBe(0.5)
            expect(state.params!.feather).toBe(40)
        })
    })

    describe('边界情况', () => {
        it('空 params 不修改状态', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({}))
            expect(state.params!.baseColor).toBe('#000000')
            expect(state.params!.openRatio).toBe(1.0)
        })

        it('处理 0 值 openRatio', () => {
            const state = createInitialState()
            SetScreenEffectHandler.applyToState(state, createAction({ openRatio: 0 }))
            expect(state.params!.openRatio).toBe(0)
        })

        it('state 无 params 时自动初始化', () => {
            const state: WriteableState = {}
            SetScreenEffectHandler.applyToState(state, createAction({ openRatio: 0.5 }))
            expect(state.params!.openRatio).toBe(0.5)
        })
    })

    describe('Handler 元数据', () => {
        it('类型为 set_screen_effect', () => {
            expect(SetScreenEffectHandler.type).toBe('set_screen_effect')
        })

        it('是 Point Action', () => {
            expect(SetScreenEffectHandler.isPointAction).toBe(true)
        })

        it('不是 Duration Action', () => {
            expect(SetScreenEffectHandler.isDurationAction).toBe(false)
        })
    })
})
