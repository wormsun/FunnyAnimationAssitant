/**
 * WaveEffect.ts (v11.5)
 * 
 * 波浪飘动特效，使用 PIXI.SimplePlane 实现顶点变形
 * 让素材像旗帜/披风一样在风中飘动
 */

import * as PIXI from 'pixi.js'

/**
 * 波浪特效参数
 */
export interface WaveEffectParams {
    speed?: number        // 速度倍率 (默认 1.0)
    amplitude?: number    // 幅度像素 (默认 10)
    frequency?: number    // 频率 (默认 2)
    // 1. Update Interface at top of file (around line 17)
    direction?: 'horizontal' | 'vertical' | 'both'  // 方向 (默认 horizontal)
    segments?: number     // 网格分段数 (默认 10)
}

/**
 * 波浪特效实例状态
 */
interface WaveInstance {
    originalSprite: PIXI.Sprite | PIXI.AnimatedSprite
    simplePlane: PIXI.SimplePlane
    originalVertices: Float32Array
    params: Required<WaveEffectParams>
    startTime: number
    originalAnchor?: { x: number; y: number }
}

/**
 * WaveEffect
 * 管理波浪特效的创建、更新和销毁
 */
export class WaveEffect {
    private instances = new Map<string, WaveInstance>()
    private currentTime = 0

    /**
     * 更新时间
     * @param deltaTime 时间增量（毫秒）
     */
    update(deltaTime: number): void {
        this.currentTime += deltaTime
    }

    /**
     * 为 Sprite 应用波浪特效
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
        params: WaveEffectParams = {}
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
            console.warn('[WaveEffect] Cannot apply effect: sprite has no texture')
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
        simplePlane.name = sprite.name ? `${sprite.name}_wave` : null

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

        const instance: WaveInstance = {
            originalSprite: sprite,
            simplePlane,
            originalVertices,
            params: normalizedParams,
            startTime: this.currentTime
        }
        if (originalAnchor) instance.originalAnchor = originalAnchor
        this.instances.set(partId, instance)

        // console.log('[WaveEffect] Applied wave effect to part:', partId)
        return simplePlane
    }

    /**
     * 更新所有波浪特效的顶点
     */
    updateAllEffects(): void {
        for (const [partId, instance] of this.instances) {
            this.updateVertices(partId, instance)
        }
    }

    /**
     * 更新单个特效的顶点
     */
    private updateVertices(_partId: string, instance: WaveInstance): void {
        const { simplePlane, originalSprite, originalVertices, params, startTime } = instance
        const elapsed = (this.currentTime - startTime) / 1000 // 转换为秒

        // v11.95: 同步原 Sprite 的变换到 SimplePlane
        // 修复波浪特效期间部位不跟随虚拟组/部位变换动画的问题
        simplePlane.position.copyFrom(originalSprite.position)
        simplePlane.scale.copyFrom(originalSprite.scale)
        simplePlane.rotation = originalSprite.rotation
        simplePlane.alpha = originalSprite.alpha
        // visible 不同步，因为原 sprite 始终是 false

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

        const { speed, amplitude, frequency, direction, segments } = params
        const vertexPerRow = segments + 1

        for (let i = 0; i < vertices.length / 2; i++) {
            const col = i % vertexPerRow
            const row = Math.floor(i / vertexPerRow)

            // 原始位置
            const originalX = originalVertices[i * 2]
            const originalY = originalVertices[i * 2 + 1]

            if (originalX === undefined || originalY === undefined) continue

            // 计算波浪偏移
            // 偏移量随着行/列增加而增大（模拟旗帜固定一端的效果）
            const phase = elapsed * speed * frequency * Math.PI * 2

            let offsetX = 0
            let offsetY = 0

            // 水平波浪 (X轴位移，基于 Y/Row)
            if (direction === 'horizontal' || direction === 'both') {
                const factor = row / segments
                // sin(phase + row) 产生波动
                offsetX = Math.sin(phase + row * 0.5) * amplitude * factor
            }

            // 垂直波浪 (Y轴位移，基于 X/Col)
            if (direction === 'vertical' || direction === 'both') {
                const factor = col / segments
                // sin(phase + col) 产生波动
                offsetY = Math.sin(phase + col * 0.5) * amplitude * factor
            }

            // 应用两方向的叠加
            vertices[i * 2] = originalX + offsetX
            vertices[i * 2 + 1] = originalY + offsetY
        }

        // 更新位置缓冲区
        const bufferData = positionBuffer.data as unknown as Float32Array
        bufferData.set(vertices)
        positionBuffer.update()
    }

    /**
     * 移除波浪特效，恢复原始 Sprite
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

            // 同步位置（以防 SimplePlane 被移动过）
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

        // console.log('[WaveEffect] Removed wave effect from part:', partId)
        return spriteDestroyed ? null : originalSprite
    }

    /**
     * 检查部位是否正在应用波浪特效
     */
    hasEffect(partId: string): boolean {
        return this.instances.has(partId)
    }

    /**
     * 获取波浪特效的 SimplePlane（如果存在）
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
    private normalizeParams(params: WaveEffectParams): Required<WaveEffectParams> {
        return {
            speed: params.speed ?? 1.0,
            amplitude: params.amplitude ?? 10,
            frequency: params.frequency ?? 2,
            direction: params.direction ?? 'horizontal',
            segments: params.segments ?? 10
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
 * 创建 WaveEffect 实例
 */
export function createWaveEffect(): WaveEffect {
    return new WaveEffect()
}
