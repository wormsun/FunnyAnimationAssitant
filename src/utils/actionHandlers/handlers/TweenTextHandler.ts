/**
 * TweenText Action Handler (Text PRD Phase 1)
 * 处理文本属性的持续渐变：颜色/字号/字距/描边粗细
 * 遵循 TweenScreenEffectHandler 模式
 */

import type { TweenTextAction } from '@/types/screenplay'

import type { ActionHandler, ActionHandlerContext, WriteableState } from '../types'

/**
 * 线性插值
 */
function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

/**
 * 颜色 hex 插值
 * @param startHex 起始颜色 (如 '#ff0000')
 * @param endHex 目标颜色
 * @param t 进度 0~1
 */
function lerpColor(startHex: string, endHex: string, t: number): string {
    const parseHex = (hex: string) => {
        const h = hex.replace('#', '')
        return {
            r: parseInt(h.substring(0, 2), 16),
            g: parseInt(h.substring(2, 4), 16),
            b: parseInt(h.substring(4, 6), 16),
        }
    }
    const s = parseHex(startHex)
    const e = parseHex(endHex)
    const r = Math.round(lerp(s.r, e.r, t))
    const g = Math.round(lerp(s.g, e.g, t))
    const b = Math.round(lerp(s.b, e.b, t))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export const TweenTextHandler: ActionHandler<TweenTextAction> = {
    type: 'tween_text',
    isPointAction: false,
    isDurationAction: true,
    affectsObjectState: true,

    applyToState(state: WriteableState, action: TweenTextAction, _context?: ActionHandlerContext): void {
        // 瞬时应用：直接设置为目标值
        const { params } = action
        if (params.color !== undefined) state.color = params.color
        if (params.fontSize !== undefined) state.fontSize = params.fontSize
        if (params.letterSpacing !== undefined) state.letterSpacing = params.letterSpacing
        if (params.strokeThickness !== undefined) state.strokeThickness = params.strokeThickness
    },

    interpolate(
        state: WriteableState,
        action: TweenTextAction,
        progress: number,
        startState: WriteableState,
    ): void {
        const { params } = action

        // 数值型属性做线性插值
        if (params.fontSize !== undefined && startState.fontSize !== undefined) {
            state.fontSize = lerp(startState.fontSize, params.fontSize, progress)
        }
        if (params.letterSpacing !== undefined && startState.letterSpacing !== undefined) {
            state.letterSpacing = lerp(startState.letterSpacing, params.letterSpacing, progress)
        }
        if (params.strokeThickness !== undefined && startState.strokeThickness !== undefined) {
            state.strokeThickness = lerp(startState.strokeThickness, params.strokeThickness, progress)
        }

        // 颜色做 hex 插值
        if (params.color !== undefined && startState.color !== undefined) {
            state.color = lerpColor(startState.color, params.color, progress)
        }
    },

    getTargetState(state: WriteableState, action: TweenTextAction): void {
        // 与 applyToState 相同
        this.applyToState(state, action)
    },
}
