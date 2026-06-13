/**
 * spriteAnimationDriver.ts
 *
 * 统一的 AnimatedSprite 手动帧推进模块。
 *
 * ScenePlayer 和 FrameCapture 共享同一套逻辑：
 *  - 禁用 PIXI Ticker 自动更新（autoUpdate = false）
 *  - 由宿主每帧传入 deltaTime，手动计算帧索引并 gotoAndStop
 *
 * 这消除了 ScenePlayer 中"出生帧 + 播放帧"同帧时的 1 帧延迟问题——
 * 因为不再依赖 PIXI Ticker 异步推进 AnimatedSprite，
 * 而是在 updateFrame() 尾部同步推进到正确帧。
 */

import * as PIXI from 'pixi.js'

interface PlayableSprite extends PIXI.AnimatedSprite {
    _shouldPlay?: boolean
}

function isDisplayObjectContainer(
    child: PIXI.DisplayObject,
): child is PIXI.Container<PIXI.DisplayObject> {
    return child instanceof PIXI.Container
}

/**
 * 递归推进容器内所有 AnimatedSprite 的帧索引
 *
 * 播放判定逻辑：
 *  1. _shouldPlay = true  → 明确播放（initialAnimations / set_anim 触发）
 *  2. _shouldPlay = false → 明确停止
 *  3. _shouldPlay = undefined 且 playing = true → 由其他代码触发播放
 *
 * @param container     待遍历的 PIXI 容器
 * @param deltaTime     距上一帧的时间差 (ms)
 * @param accumulator   WeakMap\<AnimatedSprite, number\> 用于累积时间
 */
export function advanceAnimatedSprites(
    container: PIXI.Container<PIXI.DisplayObject>,
    deltaTime: number,
    accumulator: WeakMap<PIXI.AnimatedSprite, number>,
): void {
    for (const child of container.children) {
        if (child instanceof PIXI.AnimatedSprite) {
            const shouldPlayAttr = (child as PlayableSprite)._shouldPlay
            const shouldPlay = shouldPlayAttr === true ||
                (shouldPlayAttr !== false && child.playing)

            if (shouldPlay && child.textures.length > 0) {
                const framesPerSecond = child.animationSpeed * 60
                const totalFrames = child.textures.length
                const frameDuration = 1000 / framesPerSecond
                const totalAnimDuration = frameDuration * totalFrames

                let accumTime = accumulator.get(child) ?? 0
                accumTime += deltaTime

                let frameIndex: number
                if (child.loop) {
                    const animTime = accumTime % totalAnimDuration
                    frameIndex = Math.floor(animTime / frameDuration) % totalFrames
                } else {
                    const animTime = Math.min(accumTime, totalAnimDuration - frameDuration)
                    frameIndex = Math.floor(animTime / frameDuration)
                    frameIndex = Math.min(frameIndex, totalFrames - 1)
                }

                accumulator.set(child, accumTime)
                child.gotoAndStop(frameIndex)
            }
        } else if (isDisplayObjectContainer(child)) {
            advanceAnimatedSprites(child, deltaTime, accumulator)
        }
    }
}

/**
 * 遍历 objectContainers Map，手动推进所有 AnimatedSprite
 *
 * @param objectContainers  对象 ID → PIXI.Container 映射
 * @param deltaTime         距上一帧的时间差 (ms)
 * @param accumulator       WeakMap 用于累积时间
 */
export function advanceAllObjectAnimations(
    objectContainers: Map<string, PIXI.Container<PIXI.DisplayObject>>,
    deltaTime: number,
    accumulator: WeakMap<PIXI.AnimatedSprite, number>,
): void {
    objectContainers.forEach((container) => {
        // 跳过不可见的容器（spawned=false 的对象 container.visible=false）
        // 防止动画在对象出生前就后台累积帧索引，
        // 导致出生时动画已经播放到中间位置
        if (!container.visible) return
        advanceAnimatedSprites(container, deltaTime, accumulator)
    })
}
