/**
 * screenEffectRenderer.ts
 * 共享的画面特效 PIXI.Graphics 渲染逻辑
 * 用于 useSceneGraph / ScenePlayer / ActionPreviewDialog / FrameCapture
 *
 * v2.0: 支持羽化 (feather) 效果
 *   当 feather > 0 时，使用 Canvas2D blur + PIXI.BLEND_MODES.ERASE 实现柔边孔洞
 *   当 feather === 0 时，使用传统 beginHole/endHole 实现硬边孔洞
 */

import * as PIXI from 'pixi.js'

import type { ScreenEffectParams } from '@/types/sceneObject'

const FEATHER_SPRITE_NAME = '_feather_hole'
const LIGHT_SPRITE_NAME = '_light_sprite'
const PIXI_TREE_DEBUG_FLAG = '__AITALK_PIXI_TREE_DEBUG__'

function isPixiTreeDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false
    const globalEnabled = (window as unknown as Record<string, unknown>)[PIXI_TREE_DEBUG_FLAG] === true
    const localEnabled = window.localStorage?.getItem('aitalk:pixi-tree-debug') === '1'
    return globalEnabled || localEnabled
}

function logPixiTree(event: string, payload: Record<string, unknown>): void {
    if (!isPixiTreeDebugEnabled()) return
    console.warn(`[PixiTreeDebug][ScreenEffect] ${event}`, payload)
}

/**
 * 绘制画面特效图形（以容器原点为中心）
 * 支持全屏覆盖 + 孔洞挖切（椭圆/圆/矩形）+ 羽化
 * @param graphics PIXI.Graphics 实例
 * @param params 特效参数
 * @param width 特效宽度（像素）
 * @param height 特效高度（像素）
 * @param container 父容器（可选，传入后启用羽化渲染）
 */
export function drawScreenEffectGraphics(
    graphics: PIXI.Graphics,
    params: ScreenEffectParams,
    width: number,
    height: number,
    container?: PIXI.Container
): void {
    graphics.clear()

    // ── 光照模式：不绘制覆盖层，改为添加发光 sprite ──
    if (params.lightMode && container) {
        drawLightEffect(graphics, params, width, height, container)
        return
    }

    const color = params.baseColor ?? '#000000'
    const opacity = 1.0 // 覆盖不透明度统一由容器 alpha 控制
    const colorNum = parseInt(color.replace('#', ''), 16)
    const feather = params.feather ?? 0

    // 以容器原点为中心绘制覆盖矩形
    const halfW = width / 2
    const halfH = height / 2

    // 清理已有的羽化 Sprite
    if (container) {
        const existing = container.getChildByName(FEATHER_SPRITE_NAME)
        if (existing) {
            logPixiTree('remove_feather_sprite', {
                containerName: container.name,
                existingParent: existing.parent?.name ?? null,
                existingDestroyed: existing.destroyed,
                childrenCount: container.children.length,
            })
            container.removeChild(existing)
            existing.destroy({ children: true, texture: true, baseTexture: true })
        }
    }

    graphics.beginFill(colorNum, opacity)
    graphics.drawRect(-halfW, -halfH, width, height)

    // 如果有孔洞参数，挖洞（坐标相对于特效中心，0,0 = 特效正中）
    if (params.holeShape && params.openRatio !== undefined && params.openRatio > 0) {
        const cx = params.holeCenterX ?? 0
        const cy = params.holeCenterY ?? 0
        const baseW = (params.holeWidth ?? 400) / 2
        const baseH = (params.holeHeight ?? 300) / 2
        // openRatio 按形状方向缩放：
        // horizontal_ellipse (眼睛): 仅缩放高度 → 模拟眨眼（宽度不变）
        // vertical_ellipse (聚光灯): 仅缩放宽度 → 模拟聚光灯收窄（高度不变）
        // circle / rectangle: 两轴均匀缩放
        let hw: number
        let hh: number
        switch (params.holeShape) {
            case 'horizontal_ellipse':
                hw = baseW
                hh = baseH * params.openRatio
                break
            case 'vertical_ellipse':
                hw = baseW * params.openRatio
                hh = baseH
                break
            default:
                hw = baseW * params.openRatio
                hh = baseH * params.openRatio
                break
        }

        if (hw > 0 && hh > 0) {
            if (feather > 0 && container) {
                // ── 羽化孔洞：Canvas2D blur 生成柔边纹理 + ERASE 混合模式 ──
                graphics.endFill()

                const featherCanvas = generateFeatherCanvas(params.holeShape, hw, hh, feather)
                const texture = PIXI.Texture.from(featherCanvas)
                const sprite = new PIXI.Sprite(texture)
                sprite.name = FEATHER_SPRITE_NAME
                sprite.anchor.set(0.5)
                sprite.position.set(cx, cy)
                sprite.blendMode = PIXI.BLEND_MODES.ERASE
                container.addChild(sprite)
                logPixiTree('add_feather_sprite', {
                    containerName: container.name,
                    spriteParent: sprite.parent?.name ?? null,
                    childrenCount: container.children.length,
                    holeShape: params.holeShape,
                    feather,
                })

                // ERASE 混合模式要求容器渲染到缓冲区（通过 filter 触发）
                ensureContainerBuffered(container)
                // 固定 hitArea 为覆盖矩形，防止羽化 Sprite 影响容器 bounds
                container.hitArea = new PIXI.Rectangle(-halfW, -halfH, width, height)
                return
            } else {
                // ── 硬边孔洞：传统 beginHole/endHole ──
                graphics.beginHole()
                switch (params.holeShape) {
                    case 'circle':
                        graphics.drawCircle(cx, cy, Math.min(hw, hh))
                        break
                    case 'horizontal_ellipse':
                    case 'vertical_ellipse':
                        graphics.drawEllipse(cx, cy, hw, hh)
                        break
                    case 'rectangle':
                        graphics.drawRect(cx - hw, cy - hh, hw * 2, hh * 2)
                        break
                }
                graphics.endHole()
            }
        }
    }

    graphics.endFill()

    // 无羽化时移除缓冲 filter
    if (container) {
        removeContainerBuffer(container)
        // 固定 hitArea 为覆盖矩形，防止羽化 Sprite 影响容器 bounds（选择框大小跳变）
        container.hitArea = new PIXI.Rectangle(-halfW, -halfH, width, height)
    }
}


// ==================== 光照效果 ====================

/**
 * 光照模式：在容器上添加发光 sprite（不绘制黑色覆盖）
 * 使用 Canvas2D 径向渐变生成光斑纹理，通过 ADD/SCREEN 混合模式叠加到场景上
 */
function drawLightEffect(
    _graphics: PIXI.Graphics,
    params: ScreenEffectParams,
    width: number,
    height: number,
    container: PIXI.Container
): void {
    // 清理已有的光照 sprite
    const existing = container.getChildByName(LIGHT_SPRITE_NAME)
    if (existing) {
        logPixiTree('remove_light_sprite', {
            containerName: container.name,
            existingParent: existing.parent?.name ?? null,
            existingDestroyed: existing.destroyed,
            childrenCount: container.children.length,
        })
        container.removeChild(existing)
        existing.destroy({ children: true, texture: true, baseTexture: true })
    }

    if (!params.holeShape || !params.openRatio || params.openRatio <= 0) {
        removeContainerBuffer(container)
        return
    }

    const cx = params.holeCenterX ?? 0
    const cy = params.holeCenterY ?? 0
    const baseW = (params.holeWidth ?? 400) / 2
    const baseH = (params.holeHeight ?? 300) / 2

    // 按形状方向缩放（与遮罩模式一致）
    let hw: number
    let hh: number
    switch (params.holeShape) {
        case 'horizontal_ellipse':
            hw = baseW
            hh = baseH * params.openRatio
            break
        case 'vertical_ellipse':
            hw = baseW * params.openRatio
            hh = baseH
            break
        default:
            hw = baseW * params.openRatio
            hh = baseH * params.openRatio
            break
    }

    if (hw <= 0 || hh <= 0) {
        removeContainerBuffer(container)
        return
    }

    const feather = params.feather ?? 50
    const lightColor = params.lightColor ?? '#ffffff'
    const falloff = params.lightFalloff ?? 'smooth'

    // 生成径向渐变光斑纹理
    const lightCanvas = generateLightCanvas(params.holeShape, hw, hh, feather, lightColor, falloff)
    const texture = PIXI.Texture.from(lightCanvas)
    const sprite = new PIXI.Sprite(texture)
    sprite.name = LIGHT_SPRITE_NAME
    sprite.anchor.set(0.5)
    sprite.position.set(cx, cy)
    sprite.blendMode = params.lightMode === 'additive'
        ? PIXI.BLEND_MODES.ADD
        : PIXI.BLEND_MODES.SCREEN

    container.addChild(sprite)
    logPixiTree('add_light_sprite', {
        containerName: container.name,
        spriteParent: sprite.parent?.name ?? null,
        childrenCount: container.children.length,
        holeShape: params.holeShape,
        lightMode: params.lightMode ?? 'screen',
    })

    // ADD/SCREEN 混合模式也需要容器渲染到缓冲区
    ensureContainerBuffered(container)

    // 固定 hitArea（与遮罩模式一致）
    const halfW = width / 2
    const halfH = height / 2
    container.hitArea = new PIXI.Rectangle(-halfW, -halfH, width, height)
}

/**
 * 使用 Canvas2D 径向渐变生成光斑纹理
 * 中心为 lightColor，边缘渐变为透明
 */
function generateLightCanvas(
    _shape: string,
    halfWidth: number,
    halfHeight: number,
    feather: number,
    lightColor: string,
    falloff: string
): HTMLCanvasElement {
    const margin = Math.ceil(feather * 2)
    const totalW = halfWidth + margin
    const totalH = halfHeight + margin
    const canvasW = Math.max(4, Math.ceil(totalW * 2))
    const canvasH = Math.max(4, Math.ceil(totalH * 2))
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!

    const cx = canvasW / 2
    const cy = canvasH / 2

    // 对于非圆形：用 scale 变换将椭圆渐变转换为圆形渐变后再绘制
    const maxR = Math.max(totalW, totalH)
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)

    // 内径比例（光斑核心区域，无衰减）
    const coreRatio = Math.max(0, Math.min(0.95,
        Math.min(halfWidth, halfHeight) / maxR * 0.5
    ))

    // 根据衰减曲线设置渐变色标
    switch (falloff) {
        case 'linear':
            gradient.addColorStop(0, lightColor)
            gradient.addColorStop(coreRatio, lightColor)
            gradient.addColorStop(1, 'rgba(0,0,0,0)')
            break
        case 'quadratic':
            gradient.addColorStop(0, lightColor)
            gradient.addColorStop(coreRatio, lightColor)
            gradient.addColorStop(coreRatio + (1 - coreRatio) * 0.3, lightColor + 'aa')
            gradient.addColorStop(coreRatio + (1 - coreRatio) * 0.6, lightColor + '44')
            gradient.addColorStop(1, 'rgba(0,0,0,0)')
            break
        case 'smooth':
        default:
            gradient.addColorStop(0, lightColor)
            gradient.addColorStop(coreRatio, lightColor + 'cc')
            gradient.addColorStop(coreRatio + (1 - coreRatio) * 0.4, lightColor + '66')
            gradient.addColorStop(coreRatio + (1 - coreRatio) * 0.7, lightColor + '22')
            gradient.addColorStop(1, 'rgba(0,0,0,0)')
            break
    }

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvasW, canvasH)

    return canvas
}


// ==================== 内部辅助函数 ====================

/**
 * 使用 Canvas2D 的 filter: blur() 生成羽化孔洞纹理
 * 原理：在 Canvas 上绘制硬边形状，通过 CSS blur filter 实现柔边
 * 生成的纹理作为 ERASE sprite 使用，白色区域 = 被擦除（透明孔洞）
 */
function generateFeatherCanvas(
    shape: string,
    halfWidth: number,
    halfHeight: number,
    feather: number
): HTMLCanvasElement {
    // blur 会向外扩展约 3 倍，留足余量
    const margin = Math.ceil(feather * 3)
    const canvasW = Math.max(4, Math.ceil((halfWidth + margin) * 2))
    const canvasH = Math.max(4, Math.ceil((halfHeight + margin) * 2))
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!

    const cx = canvasW / 2
    const cy = canvasH / 2

    // CSS blur filter 自动为绘制的形状添加柔边，适用于所有形状
    ctx.filter = `blur(${feather}px)`
    ctx.fillStyle = 'white'

    switch (shape) {
        case 'circle': {
            const r = Math.min(halfWidth, halfHeight)
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fill()
            break
        }
        case 'horizontal_ellipse':
        case 'vertical_ellipse': {
            ctx.beginPath()
            ctx.ellipse(cx, cy, halfWidth, halfHeight, 0, 0, Math.PI * 2)
            ctx.fill()
            break
        }
        case 'rectangle': {
            ctx.fillRect(cx - halfWidth, cy - halfHeight, halfWidth * 2, halfHeight * 2)
            break
        }
        default: {
            // 默认回退到椭圆
            ctx.beginPath()
            ctx.ellipse(cx, cy, halfWidth, halfHeight, 0, 0, Math.PI * 2)
            ctx.fill()
            break
        }
    }

    return canvas
}

/**
 * 确保容器有 AlphaFilter，使 ERASE 混合模式生效
 * PIXI 的 ERASE 需要容器渲染到独立缓冲区（filter 会触发此行为）
 */
function ensureContainerBuffered(container: PIXI.Container): void {
    // 检查是否已有我们添加的 AlphaFilter
    if (container.filters?.length) return
    container.filters = [new PIXI.AlphaFilter(1)]
}

/**
 * 移除仅为 ERASE 添加的 AlphaFilter（当不再需要羽化时）
 */
function removeContainerBuffer(container: PIXI.Container): void {
    if (
        container.filters?.length === 1 &&
        container.filters[0] instanceof PIXI.AlphaFilter
    ) {
        container.filters = null
    }
}
