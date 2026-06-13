/**
 * Animation 工具函数
 * v11.2: 提供通用的帧序列动画工具，避免代码重复
 */

import * as PIXI from 'pixi.js'

/**
 * 静止帧配置接口
 * 适用于旧资源、PropAsset、BackgroundAsset 等
 */
export interface StillFrameConfig {
    /** 静止帧来源：'frame' 使用序列帧，'custom' 使用自定义纹理 */
    stillFrameSource?: 'frame' | 'custom' | undefined
    /** 静止帧索引（当 stillFrameSource='frame' 时使用） */
    stillFrameIndex?: number | undefined
    /** 自定义静止帧 URL（当 stillFrameSource='custom' 时使用） */
    url?: string | undefined
}

/**
 * 纹理获取器类型
 */
export type TextureGetter = (url: string) => PIXI.Texture | undefined

/**
 * 恢复 AnimatedSprite 的静止帧
 * @param sprite 目标 AnimatedSprite
 * @param config 静止帧配置
 * @param textureGetter 纹理获取器
 */
export function restoreAnimatedSpriteStillFrame(
    sprite: PIXI.AnimatedSprite,
    config: StillFrameConfig,
    textureGetter: TextureGetter
): void {
    if (sprite.textures.length === 0) {
        return
    }

    // 自定义静止帧模式
    if (config.stillFrameSource === 'custom' && config.url) {
        const stillTexture = textureGetter(config.url)
        if (stillTexture && stillTexture !== PIXI.Texture.EMPTY) {
            sprite.texture = stillTexture
            return
        }
    }

    // 序列帧模式：使用指定的静止帧索引
    let stillIdx = 0

    if (typeof config.stillFrameIndex === 'number' &&
        config.stillFrameIndex >= 0 &&
        config.stillFrameIndex < sprite.textures.length) {
        stillIdx = config.stillFrameIndex
    }

    sprite.gotoAndStop(stillIdx)
}

/**
 * 恢复 AnimatedSprite 到第一帧
 * 简化版本，直接跳转到第 0 帧
 */
export function restoreAnimatedSpriteFirstFrame(sprite: PIXI.AnimatedSprite): void {
    if (sprite.textures.length > 0) {
        sprite.gotoAndStop(0)
    }
}
