/**
 * DynamicEffectManager.ts (v11.0)
 * 
 * 动态特效管理器，实现 5 种实时视觉特效：
 * - wave: 波浪摆动
 * - breathe: 呼吸脉冲（缩放）
 * - float: 上下浮动
 * - glow: 发光效果（需要滤镜支持）
 * - motion_blur: 运动模糊（需要滤镜支持）
 * 
 * 特效通过数学函数实时计算，无需关键帧
 */

import type { EffectParams } from '@/types/animation'

/**
 * 特效输出结果
 */
export interface EffectOutput {
    // 变换增量（叠加到基础变换上）
    deltaX?: number
    deltaY?: number
    deltaScaleX?: number
    deltaScaleY?: number
    deltaRotation?: number  // 弧度
    deltaAlpha?: number

    // 滤镜参数（需要渲染器支持）
    glowColor?: string
    glowIntensity?: number
    glowSize?: number

    // 运动模糊参数（需要渲染器支持）
    motionBlurVelocity?: [number, number]  // [velocityX, velocityY]
    motionBlurKernelSize?: number

    // 石化特效参数
    petrifyProgress?: number     // 石化进度 0-1
    petrifyGrayScale?: boolean   // 是否去色

    // 碎裂特效参数
    shatterProgress?: number     // 碎裂进度 0-1
    shatterAlpha?: number        // 消散透明度
}

/**
 * 特效实例状态
 */
interface EffectInstance {
    params: EffectParams
    startTime: number
    isActive: boolean
    wasActive: boolean  // 用于检测从非活动变为活动的过渡
}

/**
 * DynamicEffectManager
 * 管理和计算动态特效
 */
export class DynamicEffectManager {
    private effects = new Map<string, EffectInstance>()
    private currentTime = 0

    /**
     * 添加或更新特效
     * @param effectId 特效唯一标识
     * @param params 特效参数
     */
    addEffect(effectId: string, params: EffectParams): void {
        const existing = this.effects.get(effectId)
        if (existing) {
            // 特效已存在
            // 如果类型变化了，或者 jelly 类型从非活动变为活动，重置 startTime
            const reactivateJelly = params.type === 'jelly' && !existing.wasActive

            if (existing.params.type !== params.type || reactivateJelly) {
                existing.startTime = this.currentTime
            }
            existing.params = params
            existing.wasActive = existing.isActive
            existing.isActive = true
        } else {
            // 新特效，设置 startTime
            this.effects.set(effectId, {
                params,
                startTime: this.currentTime,
                isActive: true,
                wasActive: false
            })
        }
    }

    /**
     * 移除特效
     * @param effectId 特效唯一标识
     */
    removeEffect(effectId: string): void {
        this.effects.delete(effectId)
    }

    /**
     * 暂停特效
     */
    pauseEffect(effectId: string): void {
        const effect = this.effects.get(effectId)
        if (effect) {
            effect.wasActive = effect.isActive
            effect.isActive = false
        }
    }

    /**
     * 恢复特效
     */
    resumeEffect(effectId: string): void {
        const effect = this.effects.get(effectId)
        if (effect) {
            effect.isActive = true
        }
    }

    /**
     * 更新时间
     * @param deltaTime 时间增量（毫秒）
     */
    update(deltaTime: number): void {
        this.currentTime += deltaTime
    }

    /**
     * 计算特效输出
     * @param effectId 特效唯一标识
     * @returns 特效输出结果
     */
    evaluate(effectId: string): EffectOutput | null {
        const effect = this.effects.get(effectId)
        if (!effect?.isActive) return null

        const elapsed = this.currentTime - effect.startTime
        return this.calculateEffect(effect.params, elapsed)
    }

    /**
     * 计算所有活动特效并合并输出
     * @returns 合并后的特效输出
     */
    evaluateAll(): EffectOutput {
        const combined: EffectOutput = {
            deltaX: 0,
            deltaY: 0,
            deltaScaleX: 0,
            deltaScaleY: 0,
            deltaRotation: 0,
            deltaAlpha: 0
        }

        for (const [, effect] of this.effects) {
            if (!effect.isActive) continue

            const elapsed = this.currentTime - effect.startTime
            const output = this.calculateEffect(effect.params, elapsed)

            // 合并变换增量
            combined.deltaX = (combined.deltaX ?? 0) + (output.deltaX ?? 0)
            combined.deltaY = (combined.deltaY ?? 0) + (output.deltaY ?? 0)
            combined.deltaScaleX = (combined.deltaScaleX ?? 0) + (output.deltaScaleX ?? 0)
            combined.deltaScaleY = (combined.deltaScaleY ?? 0) + (output.deltaScaleY ?? 0)
            combined.deltaRotation = (combined.deltaRotation ?? 0) + (output.deltaRotation ?? 0)
            combined.deltaAlpha = (combined.deltaAlpha ?? 0) + (output.deltaAlpha ?? 0)

            // 滤镜参数使用最后一个
            if (output.glowColor) combined.glowColor = output.glowColor
            if (output.glowIntensity) combined.glowIntensity = output.glowIntensity
            if (output.glowSize) combined.glowSize = output.glowSize
            if (output.motionBlurVelocity) combined.motionBlurVelocity = output.motionBlurVelocity
            if (output.motionBlurKernelSize) combined.motionBlurKernelSize = output.motionBlurKernelSize
        }

        return combined
    }

    /**
     * 根据特效类型计算输出
     */
    private calculateEffect(params: EffectParams, elapsedMs: number): EffectOutput {
        const t = elapsedMs / 1000 // 转换为秒

        switch (params.type) {
            case 'wave':
                return this.calculateWave(params, t)
            case 'breathe':
                return this.calculateBreathe(params, t)
            case 'float':
                return this.calculateFloat(params, t)
            case 'glow':
                return this.calculateGlow(params, t)
            case 'motion_blur':
                return this.calculateMotionBlur(params, t)
            case 'jelly':
                return this.calculateJelly(params, t)
            case 'squash':
                return this.calculateSquash(params, t)
            case 'shake':
                return this.calculateShake(params, t)
            case 'petrify':
                return this.calculatePetrify(params, t)
            case 'shatter':
                return this.calculateShatter(params, t)
            default:
                return {}
        }
    }

    /**
     * 波浪摆动效果
     * 使物体像旗帜或水草一样左右/上下摆动
     */
    private calculateWave(
        params: { type: 'wave'; speed?: number; amplitude?: number; frequency?: number; direction?: 'horizontal' | 'vertical' | 'both' },
        t: number
    ): EffectOutput {
        const speed = params.speed ?? 1
        const amplitude = params.amplitude ?? 5  // 像素
        const frequency = params.frequency ?? 2  // Hz
        const direction = params.direction ?? 'horizontal'

        // 正弦波计算位移
        const phase = t * speed * frequency * Math.PI * 2
        const displacement = Math.sin(phase) * amplitude

        // 添加少量旋转增强摆动感
        const rotationAmplitude = amplitude * 0.01  // 弧度
        const rotation = Math.sin(phase) * rotationAmplitude

        if (direction === 'horizontal') {
            return {
                deltaX: displacement,
                deltaRotation: rotation
            }
        } else if (direction === 'vertical') {
            return {
                deltaY: displacement,
                deltaRotation: rotation * 0.5
            }
        } else {
            // both
            return {
                deltaX: displacement,
                deltaY: displacement,
                deltaRotation: rotation * 0.75
            }
        }
    }

    /**
     * 呼吸脉冲效果
     * 使物体周期性缩放，模拟呼吸或心跳
     */
    private calculateBreathe(
        params: { type: 'breathe'; intensity?: number; speed?: number },
        t: number
    ): EffectOutput {
        const intensity = params.intensity ?? 0.05  // 缩放幅度 (5%)
        const speed = params.speed ?? 1

        // 使用平滑的正弦波
        const phase = t * speed * Math.PI * 2
        // (1 - cos) / 2 产生 0-1 的平滑波形
        const scale = (1 - Math.cos(phase)) / 2 * intensity

        return {
            deltaScaleX: scale,
            deltaScaleY: scale
        }
    }

    /**
     * 上下浮动效果
     * 使物体像漂浮在水面上一样上下移动
     */
    private calculateFloat(
        params: { type: 'float'; amplitude?: number; speed?: number },
        t: number
    ): EffectOutput {
        const amplitude = params.amplitude ?? 10  // 像素
        const speed = params.speed ?? 1

        // 使用正弦波计算 Y 位移
        const phase = t * speed * Math.PI * 2 * 0.5  // 较慢的频率更自然
        const deltaY = Math.sin(phase) * amplitude

        // 添加微小的水平摆动
        const deltaX = Math.cos(phase * 0.7) * amplitude * 0.2

        return {
            deltaX,
            deltaY
        }
    }

    /**
     * 发光效果
     * 使物体产生脉动的发光轮廓（需要渲染器滤镜支持）
     */
    private calculateGlow(
        params: { type: 'glow'; color?: string; intensity?: number; size?: number },
        t: number
    ): EffectOutput {
        const color = params.color ?? '#ffffff'
        const baseIntensity = params.intensity ?? 2.0
        const baseSize = params.size ?? 15

        // 发光强度脉动
        const phase = t * Math.PI * 2
        const pulse = (Math.sin(phase) + 1) / 2  // 0-1

        return {
            glowColor: color,
            glowIntensity: baseIntensity * (0.7 + pulse * 0.3),  // 70%-100%
            glowSize: baseSize * (0.8 + pulse * 0.2)  // 80%-100%
        }
    }

    /**
     * 运动模糊效果
     * 根据方向和速度计算模糊参数
     */
    private calculateMotionBlur(
        params: { type: 'motion_blur'; velocity?: number; angle?: number; kernelSize?: number },
        t: number
    ): EffectOutput {
        const velocity = params.velocity ?? 20
        const angle = params.angle ?? 0  // 度数
        const kernelSize = params.kernelSize ?? 5

        // 根据角度计算速度分量
        const radians = angle * Math.PI / 180
        // 添加轻微脉动效果
        const pulse = 0.8 + Math.sin(t * Math.PI * 2) * 0.2
        const velocityX = Math.cos(radians) * velocity * pulse
        const velocityY = Math.sin(radians) * velocity * pulse

        return {
            motionBlurVelocity: [velocityX, velocityY],
            motionBlurKernelSize: kernelSize
        }
    }

    /**
     * 果冻抖动效果
     * 使用阻尼弹簧模型模拟弹性振动
     */
    private calculateJelly(
        params: { type: 'jelly'; stiffness?: number; damping?: number; intensity?: number },
        t: number
    ): EffectOutput {
        const stiffness = params.stiffness ?? 8
        const damping = params.damping ?? 0.3
        const intensity = params.intensity ?? 0.3

        // 阻尼振动公式: A * e^(-damping*t) * cos(stiffness*t)
        const decay = Math.exp(-damping * t * stiffness)
        const oscillation = Math.cos(stiffness * t * Math.PI * 2)
        const scaleOffset = decay * oscillation * intensity

        // X/Y 方向相位差产生果冻感
        return {
            deltaScaleX: scaleOffset,
            deltaScaleY: scaleOffset * Math.cos(t * stiffness * 0.7)
        }
    }

    /**
     * 挤压拉伸效果
     * X/Y 方向互补缩放，模拟体积守恒
     */
    private calculateSquash(
        params: { type: 'squash'; intensity?: number; speed?: number },
        t: number
    ): EffectOutput {
        const intensity = params.intensity ?? 0.2
        const speed = params.speed ?? 2

        // 使用绝对值正弦波产生周期性挤压
        const phase = t * speed * Math.PI * 2
        const squashFactor = Math.abs(Math.sin(phase)) * intensity

        // X 拉伸，Y 压缩（体积守恒）
        return {
            deltaScaleX: squashFactor,
            deltaScaleY: -squashFactor
        }
    }

    /**
     * 震动/点头效果
     * 周期性的旋转或位移
     */
    private calculateShake(
        params: { type: 'shake'; speed?: number; range?: number; axis?: 'x' | 'y' | 'rotation' },
        t: number
    ): EffectOutput {
        const speed = params.speed ?? 5
        const range = params.range ?? 10
        const axis = params.axis ?? 'rotation'

        const phase = t * speed * Math.PI * 2
        const offset = Math.sin(phase) * range

        if (axis === 'rotation') {
            // 旋转震动（度转弧度）
            return {
                deltaRotation: offset * (Math.PI / 180)
            }
        } else if (axis === 'x') {
            return {
                deltaX: offset
            }
        } else {
            return {
                deltaY: offset
            }
        }
    }

    /**
     * 石化特效
     * 随时间推进逐渐石化，返回 progress 供渲染器应用 ColorMatrixFilter
     */
    private calculatePetrify(
        params: { type: 'petrify'; duration?: number; intensity?: number; grayScale?: boolean },
        t: number
    ): EffectOutput {
        const duration = params.duration ?? 1.0
        const intensity = params.intensity ?? 1.0
        const grayScale = params.grayScale ?? true

        // 计算进度 (0-1)，并应用 intensity 缩放
        const rawProgress = Math.min(t / duration, 1.0)
        const progress = rawProgress * intensity

        return {
            petrifyProgress: progress,
            petrifyGrayScale: grayScale
        }
    }

    /**
     * 碎裂特效
     * 随时间推进物体逐渐消散，返回 progress 和 alpha 供渲染器应用
     */
    private calculateShatter(
        params: { type: 'shatter'; pieceCount?: number; explodeForce?: number; duration?: number },
        t: number
    ): EffectOutput {
        const duration = params.duration ?? 1.5
        // pieceCount 和 explodeForce 在当前简化实现中仅影响渲染器行为，这里只计算进度

        // 计算进度 (0-1)
        const progress = Math.min(t / duration, 1.0)

        // Alpha 从 1 渐变到 0，使用 easeOutQuad 让消失更自然
        // easeOutQuad: 1 - (1-t)^2
        const easeOutQuad = 1 - (1 - progress) * (1 - progress)
        const alpha = 1.0 - easeOutQuad

        return {
            shatterProgress: progress,
            shatterAlpha: alpha
        }
    }

    // ========== v11.70: 进度驱动模式 ==========

    /**
     * v11.70: 进度驱动模式 - 根据动画进度计算特效输出
     * 纯函数，不依赖 Manager 的内部状态（currentTime/startTime）
     * 
     * @param params 特效参数
     * @param progress 动画进度 (0-1)
     * @param duration 动画时长 (ms)
     * @returns 特效输出结果
     */
    static calculateWithProgress(params: EffectParams, progress: number, duration: number): EffectOutput {
        const t = (progress * duration) / 1000 // 转换为秒
        return DynamicEffectManager.calculateEffectStatic(params, t)
    }

    /**
     * v11.70: 静态特效计算
     * 将原有的 calculateEffect 逻辑抽取为静态方法
     */
    private static calculateEffectStatic(params: EffectParams, t: number): EffectOutput {
        switch (params.type) {
            case 'wave':
                return DynamicEffectManager.calculateWaveStatic(params, t)
            case 'breathe':
                return DynamicEffectManager.calculateBreatheStatic(params, t)
            case 'float':
                return DynamicEffectManager.calculateFloatStatic(params, t)
            case 'glow':
                return DynamicEffectManager.calculateGlowStatic(params, t)
            case 'motion_blur':
                return DynamicEffectManager.calculateMotionBlurStatic(params, t)
            case 'jelly':
                return DynamicEffectManager.calculateJellyStatic(params, t)
            case 'squash':
                return DynamicEffectManager.calculateSquashStatic(params, t)
            case 'shake':
                return DynamicEffectManager.calculateShakeStatic(params, t)
            case 'petrify':
                return DynamicEffectManager.calculatePetrifyStatic(params, t)
            case 'shatter':
                return DynamicEffectManager.calculateShatterStatic(params, t)
            default:
                return {}
        }
    }

    // ========== v11.70: 静态版本的特效计算方法 ==========

    private static calculateWaveStatic(
        params: { type: 'wave'; speed?: number; amplitude?: number; frequency?: number; direction?: 'horizontal' | 'vertical' | 'both' },
        t: number
    ): EffectOutput {
        const speed = params.speed ?? 1
        const amplitude = params.amplitude ?? 5
        const frequency = params.frequency ?? 2
        const direction = params.direction ?? 'horizontal'

        const phase = t * speed * frequency * Math.PI * 2
        const displacement = Math.sin(phase) * amplitude
        const rotationAmplitude = amplitude * 0.01
        const rotation = Math.sin(phase) * rotationAmplitude

        if (direction === 'horizontal') {
            return { deltaX: displacement, deltaRotation: rotation }
        } else if (direction === 'vertical') {
            return { deltaY: displacement, deltaRotation: rotation * 0.5 }
        } else {
            return { deltaX: displacement, deltaY: displacement, deltaRotation: rotation * 0.75 }
        }
    }

    private static calculateBreatheStatic(
        params: { type: 'breathe'; intensity?: number; speed?: number },
        t: number
    ): EffectOutput {
        const intensity = params.intensity ?? 0.05
        const speed = params.speed ?? 1
        const phase = t * speed * Math.PI * 2
        const scale = (1 - Math.cos(phase)) / 2 * intensity
        return { deltaScaleX: scale, deltaScaleY: scale }
    }

    private static calculateFloatStatic(
        params: { type: 'float'; amplitude?: number; speed?: number },
        t: number
    ): EffectOutput {
        const amplitude = params.amplitude ?? 10
        const speed = params.speed ?? 1
        const phase = t * speed * Math.PI * 2 * 0.5
        const deltaY = Math.sin(phase) * amplitude
        const deltaX = Math.cos(phase * 0.7) * amplitude * 0.2
        return { deltaX, deltaY }
    }

    private static calculateGlowStatic(
        params: { type: 'glow'; color?: string; intensity?: number; size?: number },
        t: number
    ): EffectOutput {
        const color = params.color ?? '#ffffff'
        const baseIntensity = params.intensity ?? 2.0
        const baseSize = params.size ?? 15
        const phase = t * Math.PI * 2
        const pulse = (Math.sin(phase) + 1) / 2
        return {
            glowColor: color,
            glowIntensity: baseIntensity * (0.7 + pulse * 0.3),
            glowSize: baseSize * (0.8 + pulse * 0.2)
        }
    }

    private static calculateMotionBlurStatic(
        params: { type: 'motion_blur'; velocity?: number; angle?: number; kernelSize?: number },
        t: number
    ): EffectOutput {
        const velocity = params.velocity ?? 20
        const angle = params.angle ?? 0
        const kernelSize = params.kernelSize ?? 5
        const radians = angle * Math.PI / 180
        const pulse = 0.8 + Math.sin(t * Math.PI * 2) * 0.2
        const velocityX = Math.cos(radians) * velocity * pulse
        const velocityY = Math.sin(radians) * velocity * pulse
        return { motionBlurVelocity: [velocityX, velocityY], motionBlurKernelSize: kernelSize }
    }

    private static calculateJellyStatic(
        params: { type: 'jelly'; stiffness?: number; damping?: number; intensity?: number },
        t: number
    ): EffectOutput {
        const stiffness = params.stiffness ?? 8
        const damping = params.damping ?? 0.3
        const intensity = params.intensity ?? 0.3
        const decay = Math.exp(-damping * t * stiffness)
        const oscillation = Math.cos(stiffness * t * Math.PI * 2)
        const scaleOffset = decay * oscillation * intensity
        return {
            deltaScaleX: scaleOffset,
            deltaScaleY: scaleOffset * Math.cos(t * stiffness * 0.7)
        }
    }

    private static calculateSquashStatic(
        params: { type: 'squash'; intensity?: number; speed?: number },
        t: number
    ): EffectOutput {
        const intensity = params.intensity ?? 0.2
        const speed = params.speed ?? 2
        const phase = t * speed * Math.PI * 2
        const squashFactor = Math.abs(Math.sin(phase)) * intensity
        return { deltaScaleX: squashFactor, deltaScaleY: -squashFactor }
    }

    private static calculateShakeStatic(
        params: { type: 'shake'; speed?: number; range?: number; axis?: 'x' | 'y' | 'rotation' },
        t: number
    ): EffectOutput {
        const speed = params.speed ?? 5
        const range = params.range ?? 10
        const axis = params.axis ?? 'rotation'
        const phase = t * speed * Math.PI * 2
        const offset = Math.sin(phase) * range

        if (axis === 'rotation') {
            return { deltaRotation: offset * (Math.PI / 180) }
        } else if (axis === 'x') {
            return { deltaX: offset }
        } else {
            return { deltaY: offset }
        }
    }

    private static calculatePetrifyStatic(
        params: { type: 'petrify'; duration?: number; intensity?: number; grayScale?: boolean },
        t: number
    ): EffectOutput {
        const duration = params.duration ?? 1.0
        const intensity = params.intensity ?? 1.0
        const grayScale = params.grayScale ?? true
        const rawProgress = Math.min(t / duration, 1.0)
        const progress = rawProgress * intensity
        return { petrifyProgress: progress, petrifyGrayScale: grayScale }
    }

    private static calculateShatterStatic(
        params: { type: 'shatter'; pieceCount?: number; explodeForce?: number; duration?: number },
        t: number
    ): EffectOutput {
        const duration = params.duration ?? 1.5
        const progress = Math.min(t / duration, 1.0)
        const easeOutQuad = 1 - (1 - progress) * (1 - progress)
        const alpha = 1.0 - easeOutQuad
        return { shatterProgress: progress, shatterAlpha: alpha }
    }

    /**
     * 清除所有特效
     */
    clear(): void {
        this.effects.clear()
        this.currentTime = 0
    }

    /**
     * 获取活动特效数量
     */
    get activeCount(): number {
        let count = 0
        for (const [, effect] of this.effects) {
            if (effect.isActive) count++
        }
        return count
    }
}

// 导出单例工厂函数
let _instance: DynamicEffectManager | null = null

export function getDynamicEffectManager(): DynamicEffectManager {
    _instance ??= new DynamicEffectManager()
    return _instance
}

export function createDynamicEffectManager(): DynamicEffectManager {
    return new DynamicEffectManager()
}
