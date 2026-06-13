/**
 * 跨引擎共享渲染管线
 *
 * 统一了 ScenePlayer 和 FrameCapture 中完全相同的对象渲染逻辑。
 * 每种对象类型的渲染步骤（容器创建 → AnimationPlayer → 注册）
 * 封装在单一的 renderObject() 入口中。
 *
 * 两引擎通过实现 RenderHost 接口将各自的注册表和 renderer 注入给共享函数。
 */

import * as PIXI from 'pixi.js'

import { CompositeRenderTarget } from '@/core/CompositeRenderTarget'
import type { AmbientLightData, LightSourceData } from '@/core/filters/LightingFilter'
import { hexToRgbArray,LightingFilter } from '@/core/filters/LightingFilter'
import { createGenericAnimationPlayer, type GenericAnimationPlayer } from '@/core/GenericAnimationPlayer'
import { installRenderChainRenderer, updateRenderChainRenderer } from '@/core/RenderChainStage'
import { SceneObjectRenderer } from '@/core/SceneObjectRenderer'
import type { CompositeObject, LightObject, ScreenEffectObject, ScreenEffectParams } from '@/types/sceneObject'
import type { SceneObject } from '@/types/screenplay'
import { evaluateLight, isPointLikeLight } from '@/utils/lightRuntime'
import { sortRenderChainByZIndex } from '@/utils/renderChainUtils'

function computeCanvasWorldFilterArea(target: PIXI.Container, width: number, height: number): PIXI.Rectangle {
    const p0 = target.toGlobal(new PIXI.Point(0, 0))
    const p1 = target.toGlobal(new PIXI.Point(width, 0))
    const p2 = target.toGlobal(new PIXI.Point(width, height))
    const p3 = target.toGlobal(new PIXI.Point(0, height))

    const minX = Math.min(p0.x, p1.x, p2.x, p3.x)
    const minY = Math.min(p0.y, p1.y, p2.y, p3.y)
    const maxX = Math.max(p0.x, p1.x, p2.x, p3.x)
    const maxY = Math.max(p0.y, p1.y, p2.y, p3.y)

    return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY)
}

export interface LightingFilterCache {
    instance?: LightingFilter
    maskRT?: PIXI.RenderTexture
}

function supportsReceiveLightingControl(obj: SceneObject): boolean {
    if (obj.type === 'prop' || obj.type === 'symbol' || obj.type === 'expression' || obj.type === 'text') {
        return true
    }
    if (obj.type === 'composite') {
        return (obj as CompositeObject).compositeMode === 'entity'
    }
    return false
}

function copySharedDisplayProps(source: PIXI.DisplayObject, target: PIXI.DisplayObject): void {
    target.alpha = source.alpha
    target.visible = source.visible
    target.renderable = source.renderable
}

function copyLocalTransform(source: PIXI.DisplayObject, target: PIXI.DisplayObject): void {
    copySharedDisplayProps(source, target)
    target.position.copyFrom(source.position)
    target.scale.copyFrom(source.scale)
    target.skew.copyFrom(source.skew)
    target.pivot.copyFrom(source.pivot)
    target.rotation = source.rotation
}

function copyWorldTransform(source: PIXI.DisplayObject, target: PIXI.DisplayObject): void {
    copySharedDisplayProps(source, target)
    const transform = new PIXI.Transform()
    transform.setFromMatrix(source.worldTransform)
    target.position.copyFrom(transform.position)
    target.scale.copyFrom(transform.scale)
    target.skew.copyFrom(transform.skew)
    target.pivot.set(0, 0)
    target.rotation = transform.rotation
}

function createMaskMirror(source: PIXI.DisplayObject, useWorldTransform = false): PIXI.DisplayObject | null {
    let mirrored: PIXI.DisplayObject | null = null

    if (source instanceof PIXI.Text) {
        const sprite = new PIXI.Sprite(source.texture)
        sprite.anchor.copyFrom(source.anchor)
        sprite.tint = 0xFFFFFF
        mirrored = sprite
    } else if (source instanceof PIXI.AnimatedSprite) {
        const sprite = new PIXI.Sprite(source.texture)
        sprite.anchor.copyFrom(source.anchor)
        sprite.tint = 0xFFFFFF
        mirrored = sprite
    } else if (source instanceof PIXI.Sprite) {
        const sprite = new PIXI.Sprite(source.texture)
        sprite.anchor.copyFrom(source.anchor)
        sprite.tint = 0xFFFFFF
        mirrored = sprite
    } else if (source instanceof PIXI.Graphics) {
        const graphics = source.clone()
        graphics.tint = 0xFFFFFF
        mirrored = graphics
    } else if (source instanceof PIXI.Container) {
        const container = new PIXI.Container()
        for (const child of source.children as PIXI.DisplayObject[]) {
            const mirroredChild = createMaskMirror(child)
            if (mirroredChild) {
                container.addChild(mirroredChild)
            }
        }
        mirrored = container
    }

    if (!mirrored) return null

    if (useWorldTransform) {
        copyWorldTransform(source, mirrored)
    } else {
        copyLocalTransform(source, mirrored)
    }

    return mirrored
}

function syncExemptMask(
    sceneObjects: readonly SceneObject[],
    filterArea: PIXI.Rectangle,
    renderer: PIXI.Renderer | undefined,
    filterCache: LightingFilterCache | undefined,
    containerResolver: ((id: string) => PIXI.Container | undefined) | undefined,
): PIXI.RenderTexture | null {
    if (!renderer || !filterCache || !containerResolver) return null

    const exemptObjects = sceneObjects.filter(o =>
        supportsReceiveLightingControl(o)
        && o.receiveLighting === false
        && (o.spawned ?? true)
        && o.visible !== false
    )

    if (exemptObjects.length === 0) {
        return null
    }

    const width = Math.max(1, Math.ceil(filterArea.width))
    const height = Math.max(1, Math.ceil(filterArea.height))
    let maskRT = filterCache.maskRT
    if (!maskRT) {
        maskRT = PIXI.RenderTexture.create({
            width,
            height,
            resolution: renderer.resolution,
        })
        filterCache.maskRT = maskRT
    } else if (maskRT.width !== width || maskRT.height !== height) {
        maskRT.resize(width, height, true)
    }

    const maskStage = new PIXI.Container()
    for (const obj of exemptObjects) {
        const container = containerResolver(obj.id)
        if (!container?.worldVisible) continue
        const mirrored = createMaskMirror(container, true)
        if (mirrored) {
            maskStage.addChild(mirrored)
        }
    }

    if (maskStage.children.length === 0) {
        maskStage.destroy({ children: true })
        return null
    }

    renderer.render(maskStage, {
        renderTexture: maskRT,
        clear: true,
        transform: new PIXI.Matrix(1, 0, 0, 1, -filterArea.x, -filterArea.y),
    })
    maskStage.destroy({ children: true })

    return maskRT
}

// ============================================================================
// Types
// ============================================================================

/**
 * 渲染宿主接口 — 引擎需实现的最小依赖注入
 *
 * ScenePlayer 和 FrameCapture 各自构造一个 RenderHost 实例，
 * 桥接到各自的本地 Map 和 renderer 实例。
 */
export interface RenderHost {
    /** 统一渲染器（容器创建） */
    sceneObjectRenderer: SceneObjectRenderer
    /** 对象容器注册表 */
    objectContainers: Map<string, PIXI.Container>
    /** 动画播放器注册表 */
    objectAnimationPlayers: Map<string, GenericAnimationPlayer>
    /** Composite entity 模式离屏渲染目标 */
    compositeRenderTargets: Map<string, CompositeRenderTarget>
    /** 获取引擎的 PIXI Renderer（用于 compositeMode + CRT） */
    getRenderer(): PIXI.Renderer | undefined
    /** 获取场景所有对象（composite 渲染子对象时需要查找 childObj） */
    getSceneObjects(): SceneObject[]
}

// ============================================================================
// renderObject — 统一对象渲染入口
// ============================================================================

/**
 * 统一对象渲染入口（跨引擎共享）
 *
 * 每个对象类型在此函数中完成完整的渲染环境创建：
 * 1. 容器创建（委托给 SceneObjectRenderer）
 * 2. GenericAnimationPlayer 创建 + 注册（需要动画驱动的类型）
 * 3. 注册到 host 的 objectContainers / objectAnimationPlayers
 * 5. addChild 到 parentContainer
 *
 * composite 对子对象递归调用此入口，确保子对象走完全一致的渲染路径。
 */
export async function renderObject(
    obj: SceneObject,
    parentContainer: PIXI.Container,
    host: RenderHost,
): Promise<void> {
    switch (obj.type) {
        case 'prop': {
            const container = host.sceneObjectRenderer.createPropContainer(obj)
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)

            const player = createGenericAnimationPlayer({
                target: container,
                ownerObjectId: obj.id,
                objectType: 'prop',
                objectId: obj.refId,
            })
            player.cacheBaseTransform()
            host.objectAnimationPlayers.set(obj.id, player)
            break
        }

        case 'background': {
            const container = host.sceneObjectRenderer.createBackgroundContainer(obj)
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)

            const player = createGenericAnimationPlayer({
                target: container,
                ownerObjectId: obj.id,
                objectType: 'background',
                objectId: obj.refId,
            })
            player.cacheBaseTransform()
            host.objectAnimationPlayers.set(obj.id, player)
            break
        }



        case 'audio': {
            const container = new PIXI.Container()
            container.name = obj.id
            container.visible = false
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)
            break
        }

        case 'symbol': {
            const container = host.sceneObjectRenderer.createSymbolContainer(obj)
            SceneObjectRenderer.applyBasicTransform(container, obj)
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)

            // v16: 元件也需要 AnimationPlayer 以支持 initialAnimations / set_anim 帧动画播放
            const symPlayer = createGenericAnimationPlayer({
                target: container,
                ownerObjectId: obj.id,
            })
            symPlayer.cacheBaseTransform()
            host.objectAnimationPlayers.set(obj.id, symPlayer)
            break
        }

        case 'text': {
            const container = host.sceneObjectRenderer.createTextContainer(obj)
            SceneObjectRenderer.applyBasicTransform(container, obj)
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)

            const textPlayer = createGenericAnimationPlayer({
                target: container,
                ownerObjectId: obj.id,
            })
            textPlayer.cacheBaseTransform()
            host.objectAnimationPlayers.set(obj.id, textPlayer)
            break
        }

        case 'screen_effect': {
            const effectObj = obj as ScreenEffectObject
            const effectParams: ScreenEffectParams = effectObj.params ?? {}
            const effectWidth = obj.width ?? Math.round(1456 * 1.1)
            const effectHeight = obj.height ?? Math.round(819 * 1.1)
            const { container } = host.sceneObjectRenderer.createScreenEffectContainer(
                obj.id, effectParams, effectWidth, effectHeight, obj.zIndex ?? 1000,
            )
            container.visible = obj.visible ?? true
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)
            break
        }

        case 'composite': {
            const composite = obj as CompositeObject
            const container = new PIXI.Container()
            container.name = `composite_${obj.id}`

            // v20: union 容器无需设置 renderable=false。
            // 旧架构中子对象平铺到上级容器，union 本身不渲染所以设 renderable=false。
            // 新架构中子对象 addChild 到 union 容器内，renderable=false 会阻止整个子树渲染。
            // union 容器本身无可视内容（仅 Container），不会产生多余绘制。

            // spawned=false 的 composite 不渲染子对象：
            // - 子对象如果存活，会由上层 syncResources 作为顶层对象独立渲染
            // - 避免子对象被同时渲染在 composite 容器内和顶层容器上导致重复
            if (obj.spawned !== false) {
                // v20: entity/union 统一按 renderChain 或 childIds 遍历子对象
                const allObjects = host.getSceneObjects()
                const childOrder = (composite.renderChain && composite.renderChain.length > 0)
                    ? composite.renderChain
                    : (composite.childIds ?? [])
                for (const childId of childOrder) {
                    const childObj = allObjects.find(o => o.id === childId)
                    if (!childObj) continue
                    // 防御性跳过 — 如果子对象已被 syncResources 先行渲染，
                    // 不再重复创建容器（避免 stage 上产生孤儿容器）
                    if (host.objectContainers.has(childId)) continue
                    // v20: union/entity 统一 addChild 到自身容器
                    await renderObject(childObj, container, host)
                }

                // v20: entity 内嵌套 union 时，union 容器作为 entity 的 child 已被遍历，
                // 但 union 容器自身不在 renderChain 中。
                // 需要确保 union 容器被注册到 objectContainers 以阻止 syncResources 重复创建。
                // （这在上面的 renderObject 递归调用中已自动处理）
            }

            // v21: 为 entity/union 安装 override render，按 renderChain 逐个调度叶子容器
            if (composite.renderChain && composite.renderChain.length > 0) {
                installRenderChainRenderer(container, composite.renderChain, host.objectContainers)
            }
            SceneObjectRenderer.applyBasicTransform(container, obj)

            // entity 模式：启用离屏渲染
            if (composite.compositeMode === 'entity') {
                parentContainer.addChild(container) // enable() 需要 source.parent
                const renderer = host.getRenderer()
                if (renderer) {
                    const crt = new CompositeRenderTarget({ source: container, renderer })
                    crt.enable()
                    host.compositeRenderTargets.set(obj.id, crt)
                    host.objectContainers.set(obj.id, crt.getOutputContainer())
                } else {
                    host.objectContainers.set(obj.id, container)
                }
            } else {
                parentContainer.addChild(container)
                host.objectContainers.set(obj.id, container)
            }

            // v20: composite 对象创建 AnimationPlayer（委托模式）
            // union 子对象在容器内后，getLocalBounds() 自然生效，不再需要自定义 boundsProvider
            const compositeContainer = host.objectContainers.get(obj.id)
            if (compositeContainer) {
                const compositePlayer = createGenericAnimationPlayer({
                    target: compositeContainer,
                    ownerObjectId: obj.id,
                    playerResolver: (targetId: string) => {
                        return host.objectAnimationPlayers.get(targetId) ?? null
                    },
                })
                compositePlayer.cacheBaseTransform()
                host.objectAnimationPlayers.set(obj.id, compositePlayer)
            }
            break
        }

        // v18: 独立表情对象
        case 'expression': {
            const container = host.sceneObjectRenderer.createExpressionContainer(obj)
            SceneObjectRenderer.applyBasicTransform(container, obj)
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)

            const exprPlayer = createGenericAnimationPlayer({
                target: container,
                ownerObjectId: obj.id,
            })
            exprPlayer.cacheBaseTransform()
            host.objectAnimationPlayers.set(obj.id, exprPlayer)
            break
        }

        // v25: 光源对象 — 注册容器以便 applyObjectState 更新位置
        // 包含可视指示器（小圆点），编辑器中帮助定位/拖拽
        // ScenePlayer/FrameCapture 会强制设 container.visible = false 来隐藏
        case 'light': {
            const container = new PIXI.Container()
            container.name = `light_${obj.id}`

            // 可视指示器：白色圆点 + 深色描边
            const dot = new PIXI.Graphics()
            dot.beginFill(0xFFFFFF, 0.85)
            dot.drawCircle(0, 0, 6)
            dot.endFill()
            dot.lineStyle(1.5, 0x333333, 0.7)
            dot.drawCircle(0, 0, 6)
            container.addChild(dot)

            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)
            break
        }

        // Clip-Mask Phase 1：mask 容器仅作为 worldTransform 锚点，无可视内容。
        // 真正的裁切几何（PIXI.Graphics）由 maskRenderer 每帧按 (mask.id, target.id) 创建到 target 容器之下。
        case 'mask': {
            const container = new PIXI.Container()
            container.name = `mask_${obj.id}`
            container.renderable = false
            container.visible = false
            parentContainer.addChild(container)
            host.objectContainers.set(obj.id, container)
            break
        }
    }
}



// ============================================================================
// Composite 辅助函数
// ============================================================================

/**
 * 按拓扑顺序（从内到外）更新所有 composite entity 模式的离屏渲染纹理
 *
 * 深度越大的 composite 先更新，确保嵌套 composite 的 RenderTexture
 * 在父级渲染前已就绪。
 */
export function updateCompositeRenderTargetsInOrder(
    targets: Map<string, CompositeRenderTarget>,
    sceneObjects: readonly SceneObject[],
): void {
    if (targets.size === 0) return
    const sorted = getCompositeUpdateOrder(targets, sceneObjects)
    for (const id of sorted) {
        targets.get(id)?.updateRenderTexture()
    }
}

/**
 * 获取 composite 离屏渲染更新顺序（叶节点优先）
 * 通过 parentId 链计算深度，按深度降序排列
 */
function getCompositeUpdateOrder(
    targets: Map<string, CompositeRenderTarget>,
    sceneObjects: readonly SceneObject[],
): string[] {
    const depthMap = new Map<string, number>()

    function getDepth(id: string): number {
        const cached = depthMap.get(id)
        if (cached !== undefined) return cached
        const obj = sceneObjects.find(o => o.id === id)
        if (!obj?.parentId) {
            depthMap.set(id, 0)
            return 0
        }
        const depth = getDepth(obj.parentId) + 1
        depthMap.set(id, depth)
        return depth
    }

    const ids = Array.from(targets.keys())
    for (const id of ids) {
        getDepth(id)
    }
    // 深度降序：叶节点先更新
    return ids.sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0))
}

// ============================================================================
// 通用辅助函数
// ============================================================================

/**
 * 将 objectDimensions 同步到所有 GenericAnimationPlayer
 * 用于 pivot 位置补偿计算
 */
export function syncObjectBoundsToPlayers(
    dimensions: Map<string, { width: number; height: number; boundsX?: number; boundsY?: number }>,
    players: Map<string, GenericAnimationPlayer>,
): void {
    for (const [objId, dims] of dimensions) {
        const player = players.get(objId)
        if (!player) continue
        player.setObjectBounds(dims.width, dims.height, dims.boundsX, dims.boundsY)
    }
}

/**
 * 手动排序 entity composite 容器的子对象（renderChain 驱动）
 *
 * 根级 union 的渲染顺序由 stage 的 installRootRenderChainRenderer 统一处理，
 * 无需在此函数中通过 setChildIndex 控制。
 *
 * entity: 按 renderChain + 运行时 zIndex 更新 override render（含 union 展开子对象）
 * union (entity 内): 由父 entity 的 renderByRenderChain 跨容器调度，跳过
 * union (根级): 由 stage 的 renderByRenderChain 统一调度，跳过
 *
 * v19 Fix: entity CRT 模式下排序 source container（实际子对象所在），而非 output。
 */
export function sortCompositeContainers(
    sceneObjects: readonly SceneObject[],
    objectContainers: Map<string, PIXI.Container>,
    compositeRenderTargets?: Map<string, CompositeRenderTarget>,
    getZIndex?: (id: string) => number,
): void {
    for (const objSetup of sceneObjects) {
        if (objSetup.type !== 'composite') continue
        const comp = objSetup as CompositeObject

        const compositeMode = comp.compositeMode ?? 'entity'

        if (compositeMode === 'entity') {
            // v20: entity CRT 排序 source container（实际子对象所在）而非 output
            const crt = compositeRenderTargets?.get(objSetup.id)
            const compositeContainer = crt
                ? crt.getSourceContainer()
                : objectContainers.get(objSetup.id)
            if (!compositeContainer) continue

            if (comp.renderChain && comp.renderChain.length > 0) {
                // v22: 消费时按运行时 zIndex 排序，更新 entity 的 override render
                const chain = getZIndex
                    ? sortRenderChainByZIndex(comp.renderChain, getZIndex)
                    : comp.renderChain
                updateRenderChainRenderer(compositeContainer, chain, objectContainers)
            }
        }
        // union composite（根级或 entity 内）：
        // 渲染顺序由父级容器（stage 或 entity）的 renderByRenderChain 统一调度，无需单独处理
    }
}
// v20: propagateUnionAnimations 已删除
// union 子对象在容器内（真实 PIXI 父子关系），动画变换自动传播，无需手动同步

// ============================================================================
// v25: 光照滤镜应用
// ============================================================================

/**
 * v25.7: CRT 内光源坐标投影辅助
 *
 * Entity Composite 的 CRT 会将 source 容器脱离 Stage 树并重置其 transform。
 * 当光源是 entity 的子对象时，light container 的 toGlobal() 无法得到正确的屏幕坐标。
 *
 * 此函数沿 parentId 链查找最近的 CRT entity 祖先，
 * 计算光源在 entity source 容器内的本地坐标，并返回 entity 的 outputContainer
 * （仍在 Stage 树中），供调用者通过 outputContainer.toGlobal(localPoint) 得到正确屏幕坐标。
 */
function resolveCRTProjection(
    lightObj: LightObject,
    sceneObjects: readonly SceneObject[],
    compositeRenderTargets: Map<string, CompositeRenderTarget>,
): { outputContainer: PIXI.Container; localX: number; localY: number } | null {
    // 沿 parentId 链查找最近的 CRT entity 祖先
    let currentId: string | undefined = lightObj.parentId
    while (currentId) {
        const crt = compositeRenderTargets.get(currentId)
        if (crt) {
            // 找到 CRT entity 祖先
            // 计算光源在 entity source 容器内的本地坐标
            // applyLightState 设置 container.position = (state.x, state.y)
            // 对于 entity 子对象，这是相对于 entity 的局部坐标
            // CRT source 容器的 transform 已被重置为 identity，
            // 所以光源的 source-local 坐标就是 container.position
            const outputContainer = crt.getOutputContainer()

            // 获取 compositeSprite 用于坐标映射
            // CRT.updateRenderTexture 设置:
            //   renderRoot.position = (-bounds.x + padding, -bounds.y + padding)
            //   compositeSprite.position = (bounds.x - padding, bounds.y - padding)
            // 光源在 source 容器中的坐标 = (lightObj.x, lightObj.y)
            // compositeSprite 把整个 renderTexture 映射回 entity 的局部空间
            // 所以直接使用光源的数据模型坐标即可：compositeSprite 已对齐 source bounds
            const localX = lightObj.x ?? 0
            const localY = lightObj.y ?? 0

            return { outputContainer, localX, localY }
        }
        // 继续向上搜索
        const parentObj = sceneObjects.find(o => o.id === currentId)
        currentId = parentObj?.parentId
    }
    // 不在任何 CRT entity 内，但可能在 containerResolver 不工作的根级 union 中
    // 检查 container 的 parent 链是否到达了 stage（简单启发式）
    // 无 CRT 祖先 → 返回 null，使用默认 toGlobal 路径
    return null
}


/**
 * 聚合场景中的光源对象，创建/更新 LightingFilter 并挂载到目标容器
 *
 * 供 ScenePlayer 和 FrameCapture 在 syncResources / updateFrame 时调用
 */
export function applyLightingFilter(
    sceneObjects: readonly SceneObject[],
    targetContainer: PIXI.Container,
    canvasWidth: number,
    canvasHeight: number,
    filterCache?: LightingFilterCache,
    filterAreaOverride?: PIXI.Rectangle,
    containerResolver?: (id: string) => PIXI.Container | undefined,
    timeMs?: number,
    renderer?: PIXI.Renderer,
    compositeRenderTargets?: Map<string, CompositeRenderTarget>,
): void {
    const lightObjects = sceneObjects.filter(
        o => o.type === 'light' && (o as SceneObject & { spawned?: boolean }).spawned !== false
    ) as LightObject[]
    const ambientObj = lightObjects.find(l => l.lightType === 'ambient')
    const ambient: AmbientLightData = {
        color: hexToRgbArray(ambientObj?.lightColor ?? '#ffffff'),
        intensity: ambientObj?.lightIntensity ?? 1.0,
    }
    const filterArea = filterAreaOverride ?? computeCanvasWorldFilterArea(targetContainer, canvasWidth, canvasHeight)
    const now = timeMs ?? Date.now()
    const evaluatedLights = lightObjects
        .filter(l => isPointLikeLight(l) && l.visible !== false)
        .map(light => ({ light, ev: evaluateLight(light, now) }))
        .sort((a, b) => b.ev.intensity - a.ev.intensity)
        .slice(0, 8)

    // v25.6: 光源坐标投影 → 输出帧局部 UV 空间 (0..1)
    // 先通过 toGlobal 或线性映射获取屏幕坐标，再归一化到当前输出帧区域。
    // Shader 侧会把这组 0..1 的局部 UV 再映射到真实输入纹理的 UV 空间，
    // 从而保证 ScenePlayer / FrameCapture / 多分辨率导出使用同一套基准。
    let points: LightSourceData[]
    if (containerResolver) {
        points = evaluatedLights.map(({ light: l, ev }) => {
            const coneHalfCos = Math.cos((ev.coneAngle / 2) * Math.PI / 180)
            const container = containerResolver(l.id)
            if (container) {
                // v25.7: Entity Composite CRT 修正
                // 当光源是 entity composite 的子对象时，CRT.enable() 会将 source 容器
                // 从 Stage 树脱离到独立的 renderRoot 中。此时 container.toGlobal()
                // 返回的是离屏渲染纹理的局部坐标，而非正确的屏幕坐标。
                // 修复：查找最近的 CRT entity 祖先，通过 outputContainer（仍在 Stage 树中）
                // 投影光源的本地坐标到屏幕空间。
                const crtProjection = compositeRenderTargets
                    ? resolveCRTProjection(l, sceneObjects, compositeRenderTargets)
                    : null

                let p0: PIXI.Point
                let p1: PIXI.Point
                if (crtProjection) {
                    p0 = crtProjection.outputContainer.toGlobal(new PIXI.Point(crtProjection.localX, crtProjection.localY))
                    p1 = crtProjection.outputContainer.toGlobal(new PIXI.Point(crtProjection.localX, crtProjection.localY + ev.radius))
                } else {
                    p0 = container.toGlobal(new PIXI.Point(0, 0))
                    p1 = container.toGlobal(new PIXI.Point(0, ev.radius))
                }
                const screenRadius = Math.hypot(p1.x - p0.x, p1.y - p0.y)
                return {
                    // 屏幕坐标 → 输出帧局部 UV 空间
                    x: (p0.x - filterArea.x) / filterArea.width,
                    y: (p0.y - filterArea.y) / filterArea.height,
                    radius: screenRadius / filterArea.height,
                    color: hexToRgbArray(ev.color),
                    intensity: ev.intensity,
                    directionMode: ev.directionMode === 'cone' ? 1 : 0,
                    directionAngle: ev.directionAngle,
                    coneHalfCos,
                    softness: ev.softness,
                } as LightSourceData
            }
            // fallback: 世界坐标 → 输出帧局部 UV 空间
            return {
                x: ev.x / canvasWidth,
                y: ev.y / canvasHeight,
                radius: ev.radius / canvasHeight,
                color: hexToRgbArray(ev.color),
                intensity: ev.intensity,
                directionMode: ev.directionMode === 'cone' ? 1 : 0,
                directionAngle: ev.directionAngle,
                coneHalfCos,
                softness: ev.softness,
            }
        })
    } else {
        // 无 containerResolver 时：世界坐标 → 输出帧局部 UV 空间
        points = evaluatedLights.map(({ ev }) => {
            const coneHalfCos = Math.cos((ev.coneAngle / 2) * Math.PI / 180)
            return {
                x: ev.x / canvasWidth,
                y: ev.y / canvasHeight,
                radius: ev.radius / canvasHeight,
                color: hexToRgbArray(ev.color),
                intensity: ev.intensity,
                directionMode: ev.directionMode === 'cone' ? 1 : 0,
                directionAngle: ev.directionAngle,
                coneHalfCos,
                softness: ev.softness,
            }
        })
    }

    // 复用或创建 filter 实例
    let filter = filterCache?.instance
    if (!filter) {
        filter = new LightingFilter()
        if (filterCache) filterCache.instance = filter
    }

    filter.updateFromSceneObjects(points, ambient)
    filter.setExemptMask(syncExemptMask(sceneObjects, filterArea, renderer, filterCache, containerResolver))

    if (!filter.isNoop()) {
        targetContainer.filterArea = filterArea
        const existing = (targetContainer.filters ?? [])
        const withoutLighting = existing.filter(f => !(f instanceof LightingFilter))
        targetContainer.filters = [...withoutLighting, filter]
    } else {
        delete (targetContainer as Partial<PIXI.Container>).filterArea
        const existing = (targetContainer.filters ?? [])
        const withoutLighting = existing.filter(f => !(f instanceof LightingFilter))
        targetContainer.filters = withoutLighting.length > 0 ? withoutLighting : null
    }
}
