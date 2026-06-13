/**
 * OnionSkinOverlay — 洋葱皮（鬼影帧）可视化
 * 
 * 在 onionSkinLayer 上渲染前后关键帧的半透明克隆
 * - 蓝色 (#2196F3) 半透明：前帧（past frames）
 * - 绿色 (#4CAF50) 半透明：后帧（future frames）
 * - 可配置：开关、帧数 (0-3)、透明度
 */

import * as PIXI from 'pixi.js'

import type { TransformTrackOutput } from '@/types/animation'

const PAST_TINT = 0x2196F3
const FUTURE_TINT = 0x4CAF50
const DEFAULT_ALPHA = 0.25
const MAX_FRAMES = 3

export interface OnionSkinConfig {
    enabled: boolean
    pastFrames: number    // 0-3
    futureFrames: number  // 0-3
    pastAlpha: number     // 0-1
    futureAlpha: number   // 0-1
}

export const DEFAULT_ONION_CONFIG: OnionSkinConfig = {
    enabled: true,
    pastFrames: 1,
    futureFrames: 1,
    pastAlpha: DEFAULT_ALPHA,
    futureAlpha: DEFAULT_ALPHA,
}

export class OnionSkinOverlay extends PIXI.Container {
    private ghosts: PIXI.Container[] = []
    private config: OnionSkinConfig = { ...DEFAULT_ONION_CONFIG }

    /** Base transform of the target object (rest state) */
    private baseX = 0
    private baseY = 0
    private baseScaleX = 1
    private baseScaleY = 1
    private baseRotation = 0

    constructor() {
        super()
        this.name = 'onionSkinOverlay'
    }

    setConfig(config: Partial<OnionSkinConfig>) {
        Object.assign(this.config, config)
    }

    getConfig(): OnionSkinConfig {
        return { ...this.config }
    }

    setBaseTransform(x: number, y: number, scaleX: number, scaleY: number, rotation: number) {
        this.baseX = x
        this.baseY = y
        this.baseScaleX = scaleX
        this.baseScaleY = scaleY
        this.baseRotation = rotation
    }

    /**
     * Update onion skin ghosts
     * 
     * @param sourceContainer The original rendered object container to clone
     * @param keyframeTimes Sorted array of keyframe times (0-1)
     * @param currentTime Current playhead time (0-1)
     * @param evaluator Function that evaluates transform output at a given time
     */
    update(
        sourceContainer: PIXI.Container,
        keyframeTimes: number[],
        currentTime: number,
        evaluator: (time: number) => TransformTrackOutput | null
    ) {
        this.clearGhosts()

        if (!this.config.enabled || keyframeTimes.length < 2) return

        // Find current position in keyframe list
        const currentIdx = this.findNearestKeyframeIndex(keyframeTimes, currentTime)

        // Past ghosts (blue)
        for (let i = 1; i <= Math.min(this.config.pastFrames, MAX_FRAMES); i++) {
            const idx = currentIdx - i
            if (idx < 0) break
            const time = keyframeTimes[idx]!
            const output = evaluator(time)
            if (output) {
                // Fade further ghosts more
                const alphaScale = 1 - (i - 1) / (this.config.pastFrames + 1)
                this.createGhost(
                    sourceContainer,
                    output,
                    PAST_TINT,
                    this.config.pastAlpha * alphaScale
                )
            }
        }

        // Future ghosts (green)
        for (let i = 1; i <= Math.min(this.config.futureFrames, MAX_FRAMES); i++) {
            const idx = currentIdx + i
            if (idx >= keyframeTimes.length) break
            const time = keyframeTimes[idx]!
            const output = evaluator(time)
            if (output) {
                const alphaScale = 1 - (i - 1) / (this.config.futureFrames + 1)
                this.createGhost(
                    sourceContainer,
                    output,
                    FUTURE_TINT,
                    this.config.futureAlpha * alphaScale
                )
            }
        }
    }

    private createGhost(
        source: PIXI.Container,
        output: TransformTrackOutput,
        tint: number,
        alpha: number
    ) {
        // Create a lightweight clone using RenderTexture snapshot
        const app = this.getApp()
        if (!app) return

        const bounds = source.getLocalBounds()
        if (bounds.width <= 0 || bounds.height <= 0) return

        // Render source to texture
        const renderTexture = PIXI.RenderTexture.create({
            width: Math.ceil(bounds.width),
            height: Math.ceil(bounds.height),
        })

        // Temporarily move source to origin for rendering
        const origX = source.position.x
        const origY = source.position.y
        const origScaleX = source.scale.x
        const origScaleY = source.scale.y
        const origRotation = source.rotation
        const origAlpha = source.alpha

        source.position.set(-bounds.x, -bounds.y)
        source.scale.set(
            Math.abs(this.baseScaleX),  // Use unsigned for texture capture
            Math.abs(this.baseScaleY)
        )
        source.rotation = 0
        source.alpha = 1

        app.renderer.render(source, { renderTexture })

        // Restore source transform
        source.position.set(origX, origY)
        source.scale.set(origScaleX, origScaleY)
        source.rotation = origRotation
        source.alpha = origAlpha

        // Create ghost sprite
        const ghost = new PIXI.Sprite(renderTexture)
        ghost.anchor.set(
            -bounds.x / bounds.width,
            -bounds.y / bounds.height
        )

        // Apply the evaluated transform
        ghost.position.set(
            this.baseX + (output.x ?? 0),
            this.baseY + (output.y ?? 0),
        )
        ghost.scale.set(
            this.baseScaleX * (output.scaleX ?? 1) * (output.flipX ? -1 : 1),
            this.baseScaleY * (output.scaleY ?? 1),
        )
        ghost.rotation = this.baseRotation + (output.rotation ?? 0)
        ghost.alpha = alpha
        ghost.tint = tint

        this.addChild(ghost)
        this.ghosts.push(ghost)
    }

    private findNearestKeyframeIndex(times: number[], target: number): number {
        let closest = 0
        let minDist = Math.abs(times[0]! - target)
        for (let i = 1; i < times.length; i++) {
            const dist = Math.abs(times[i]! - target)
            if (dist < minDist) {
                minDist = dist
                closest = i
            }
        }
        return closest
    }

    private getApp(): PIXI.Application | null {
        // Walk up to find the application via the stage
        let p: PIXI.Container | null = this.parent
        while (p?.parent) p = p.parent
        // PIXI v8: stage doesn't directly have .app reference; 
        // we pass app reference in via the update method or store it
        return (this as unknown as { _app?: PIXI.Application })._app ?? null
    }

    /** Must be called after adding to stage */
    setApp(app: PIXI.Application) {
        (this as unknown as { _app?: PIXI.Application })._app = app
    }

    private clearGhosts() {
        for (const ghost of this.ghosts) {
            // Destroy render textures
            if (ghost instanceof PIXI.Sprite && ghost.texture instanceof PIXI.RenderTexture) {
                ghost.texture.destroy(true)
            }
            ghost.destroy()
        }
        this.ghosts = []
    }

    dispose() {
        this.clearGhosts()
    }
}
