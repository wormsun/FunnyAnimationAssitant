/**
 * RibbonEffect.ts (v12.0)
 * 
 * 飘带特效，基于 WaveEffect 改进
 * 头部固定，尾部大幅飘动，呈现非线性衰减效果
 */

import * as PIXI from 'pixi.js'

/**
 * 飘带特效参数
 */
export interface RibbonEffectParams {
    type: 'ribbon'
    speed?: number            // 速度倍率 (默认 0.5)
    amplitude?: number        // 最大振幅 (默认 30)
    frequency?: number        // 频率 (默认 0.5)
    direction?: 'horizontal' | 'vertical' | 'both'  // 方向 (默认 horizontal)
    segments?: number         // 网格分段数 (默认 10)
    damping?: number          // 衰减指数 (默认 2，越大头部越静止)
    phaseScale?: number       // 相位累积比例 (默认 0.2，控制波浪传播形态)
}

/**
 * 飘带特效实例状态
 */
interface RibbonInstance {
    originalSprite: PIXI.Sprite | PIXI.AnimatedSprite
    simplePlane: PIXI.SimplePlane
    originalVertices: Float32Array
    params: Required<Omit<RibbonEffectParams, 'type'>>
    startTime: number
    originalAnchor?: { x: number; y: number }
}

/**
 * RibbonEffect
 * 管理飘带特效的创建、更新和销毁
 */
export class RibbonEffect {
    private instances = new Map<string, RibbonInstance>()
    private currentTime = 0

    /**
     * 更新时间
     * @param deltaTime 时间增量（毫秒）
     */
    update(deltaTime: number): void {
        this.currentTime += deltaTime
    }

    /**
     * 为 Sprite 应用飘带特效
     * @param partId 部位 ID
     * @param sprite 原始 Sprite
     * @param container 父容器
     * @param params 特效参数
     * @returns 创建的 SimplePlane
     */
    applyEffect(
        partId: string,
        sprite: PIXI.Sprite | PIXI.AnimatedSprite,
        container: PIXI.Container,
        params: Omit<RibbonEffectParams, 'type'> = {}
    ): PIXI.SimplePlane | null {
        // 如果已经有实例，只更新参数
        const existing = this.instances.get(partId)
        if (existing) {
            existing.params = this.normalizeParams(params)
            return existing.simplePlane
        }

        // 获取纹理
        const texture = sprite.texture
        if (!texture || texture === PIXI.Texture.EMPTY) {
            console.warn('[RibbonEffect] Cannot apply effect: sprite has no texture')
            return null
        }

        // 标准化参数
        const normalizedParams = this.normalizeParams(params)
        const segments = normalizedParams.segments

        // 创建 SimplePlane
        const simplePlane = new PIXI.SimplePlane(texture, segments + 1, segments + 1)

        // 复制原 Sprite 的变换属性
        simplePlane.position.copyFrom(sprite.position)
        simplePlane.scale.copyFrom(sprite.scale)
        simplePlane.rotation = sprite.rotation
        simplePlane.alpha = sprite.alpha
        simplePlane.visible = sprite.visible
        simplePlane.zIndex = sprite.zIndex
        simplePlane.name = sprite.name ? `${sprite.name}_ribbon` : null

        let originalAnchor: { x: number; y: number } | undefined
        if ('anchor' in sprite) {
            const anchor = sprite.anchor
            const anchorX = anchor.x
            const anchorY = anchor.y
            simplePlane.pivot.set(
                texture.width * anchorX,
                texture.height * anchorY
            )
            originalAnchor = { x: anchorX, y: anchorY }
        }

        // 保存原始顶点位置
        const positionBuffer = simplePlane.geometry.getBuffer('aVertexPosition')
        const originalVertices = new Float32Array(positionBuffer.data.length)
        originalVertices.set(positionBuffer.data)

        // 从容器中移除原 Sprite，添加 SimplePlane
        const index = container.getChildIndex(sprite)
        sprite.visible = false
        sprite.renderable = false
        container.addChildAt(simplePlane, index)

        const instance: RibbonInstance = {
            originalSprite: sprite,
            simplePlane,
            originalVertices,
            params: normalizedParams,
            startTime: this.currentTime
        }
        if (originalAnchor) instance.originalAnchor = originalAnchor
        this.instances.set(partId, instance)

        return simplePlane
    }

    /**
     * 更新所有飘带特效的顶点
     */
    updateAllEffects(): void {
        for (const [partId, instance] of this.instances) {
            if (!this.updateVertices(partId, instance)) {
                // 原始 Sprite 已被销毁，清理该实例
                instance.simplePlane.destroy()
                this.instances.delete(partId)
            }
        }
    }

    /**
     * 更新单个特效的顶点
     * @returns false 如果原始 Sprite 已被销毁，需要清理
     */
    private updateVertices(_partId: string, instance: RibbonInstance): boolean {
        const { simplePlane, originalSprite, originalVertices, params, startTime } = instance

        // 安全检查：原始 Sprite 可能已被销毁（部件重建、场景对象删除等）
        if (originalSprite.destroyed || !originalSprite.transform) {
            return false
        }

        const elapsed = (this.currentTime - startTime) / 1000 // 转换为秒

        // 同步原 Sprite 的变换到 SimplePlane
        simplePlane.position.copyFrom(originalSprite.position)
        simplePlane.scale.copyFrom(originalSprite.scale)
        simplePlane.rotation = originalSprite.rotation
        simplePlane.alpha = originalSprite.alpha

        const currentTexture = instance.originalSprite.texture
        if (currentTexture && currentTexture !== PIXI.Texture.EMPTY && simplePlane.texture !== currentTexture) {
            simplePlane.texture = currentTexture
            const anchor = instance.originalAnchor
            if (anchor) {
                simplePlane.pivot.set(
                    currentTexture.width * anchor.x,
                    currentTexture.height * anchor.y
                )
            }
        }

        const positionBuffer = simplePlane.geometry.getBuffer('aVertexPosition')
        const vertices = new Float32Array(positionBuffer.data as ArrayLike<number>)

        const { speed, amplitude, frequency, direction, segments, damping, phaseScale } = params
        const vertexPerRow = segments + 1

        for (let i = 0; i < vertices.length / 2; i++) {
            const col = i % vertexPerRow
            const row = Math.floor(i / vertexPerRow)

            // 原始位置
            const originalX = originalVertices[i * 2]
            const originalY = originalVertices[i * 2 + 1]

            if (originalX === undefined || originalY === undefined) continue

            // 计算波浪偏移

            let offsetX = 0
            let offsetY = 0

            // 水平波浪 (X轴位移，基于 Y/Row)
            if (direction === 'horizontal' || direction === 'both') {
                const linearFactor = row / segments
                // 非线性衰减：Math.pow(linearFactor, damping)
                // damping > 1 时，靠近头部 (0) 的部分衰减更厉害，靠近尾部 (1) 的部分动静大
                const factor = Math.pow(linearFactor, damping)

                // 相位传播：phaseScale 控制波浪在飘带上的传播密度
                const phase = elapsed * speed * frequency * Math.PI * 2 + row * phaseScale

                offsetX = Math.sin(phase) * amplitude * factor
            }

            // 垂直波浪 (Y轴位移，基于 X/Col)
            if (direction === 'vertical' || direction === 'both') {
                const linearFactor = col / segments
                const factor = Math.pow(linearFactor, damping)

                const phase = elapsed * speed * frequency * Math.PI * 2 + col * phaseScale

                offsetY = Math.sin(phase) * amplitude * factor
            }

            // 应用两方向的叠加
            vertices[i * 2] = originalX + offsetX
            vertices[i * 2 + 1] = originalY + offsetY
        }

        // 更新位置缓冲区
        const bufferData = positionBuffer.data as unknown as Float32Array
        bufferData.set(vertices)
        positionBuffer.update()

        return true
    }

    /**
     * 移除飘带特效，恢复原始 Sprite
     * @param partId 部位 ID
     * @param container 父容器
     */
    removeEffect(partId: string, container: PIXI.Container): PIXI.Sprite | PIXI.AnimatedSprite | null {
        const instance = this.instances.get(partId)
        if (!instance) return null

        const { originalSprite, simplePlane } = instance

        // v12.1: 如果 Sprite 或 SimplePlane 已被销毁（transform 为 null），跳过位置同步
        const spriteDestroyed = (originalSprite as unknown as { destroyed?: boolean }).destroyed === true || !(originalSprite as unknown as { transform?: unknown }).transform
        const planeDestroyed = (simplePlane as unknown as { destroyed?: boolean }).destroyed === true || !(simplePlane as unknown as { transform?: unknown }).transform

        if (!spriteDestroyed && !planeDestroyed) {
            // 恢复原 Sprite 的可见性
            originalSprite.visible = true
            originalSprite.renderable = true

            // 同步位置
            originalSprite.position.copyFrom(simplePlane.position)
            originalSprite.scale.copyFrom(simplePlane.scale)
            originalSprite.rotation = simplePlane.rotation
            originalSprite.alpha = simplePlane.alpha
        }

        // 从容器移除 SimplePlane（安全检查）
        if (!planeDestroyed) {
            container.removeChild(simplePlane)
            simplePlane.destroy()
        }

        // 删除实例
        this.instances.delete(partId)

        return spriteDestroyed ? null : originalSprite
    }

    /**
     * 检查部位是否正在应用飘带特效
     */
    hasEffect(partId: string): boolean {
        return this.instances.has(partId)
    }

    /**
     * 获取飘带特效的 SimplePlane（如果存在）
     */
    getSimplePlane(partId: string): PIXI.SimplePlane | undefined {
        return this.instances.get(partId)?.simplePlane
    }

    /**
     * 清除所有特效
     */
    clear(container: PIXI.Container): void {
        for (const partId of this.instances.keys()) {
            this.removeEffect(partId, container)
        }
    }

    /**
     * 标准化参数
     */
    private normalizeParams(params: Omit<RibbonEffectParams, 'type'>): Required<Omit<RibbonEffectParams, 'type'>> {
        return {
            speed: params.speed ?? 0.5,
            amplitude: params.amplitude ?? 10,
            frequency: params.frequency ?? 0.5,
            direction: params.direction ?? 'horizontal',
            segments: params.segments ?? 10,
            damping: params.damping ?? 2,
            phaseScale: params.phaseScale ?? 0.2
        }
    }

    /**
     * 获取活动特效数量
     */
    get activeCount(): number {
        return this.instances.size
    }
}

/**
 * 创建 RibbonEffect 实例
 */
export function createRibbonEffect(): RibbonEffect {
    return new RibbonEffect()
}
