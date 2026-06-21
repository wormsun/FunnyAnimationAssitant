/**
 * Clip-Mask Phase 1 渲染管线
 *
 * 详见 docs/features/clip-mask.md（v2.1）。
 *
 * 实现备注（与 PRD §11.3 的差异）：
 * PRD 原方案在 target 之上插入 wrapper 容器，将 mask Graphics 与 target 一起置于 wrapper 下。
 * 实际落地采用 wrapper 方案：
 *   - 在 target 原父级中原位插入一个 identity wrapper，将 target 移入 wrapper。
 *   - mask Graphics 作为 wrapper 的兄弟节点挂在 wrapper.parent 下，配合 `wrapper.mask = MaskData(graphics)` 完成裁切。
 *   - 数学等价：`graphics.localTransform = inv(wrapper.parent.worldTransform) × maskContainer.worldTransform`，
 *     使 `graphics.worldTransform === maskContainer.worldTransform`，与 PRD 同语义。
 *   - target 自己已有的 `container.mask`（如 fixed text 的 `text_box_mask`）不再被覆盖，
 *     wrapper clip-mask 与 target 内置 mask 自然形成嵌套裁切。
 *   - ⚠️ 关键约束：mask Graphics 必须是普通 visible 容器的后代，且不能是被 mask 的 wrapper 的后代。
 *     不能挂在 maskContainer 之下：renderPipeline 把 mask 容器设为 `visible=false / renderable=false`
 *     （因为 mask 自身不参与画布渲染），其后代会被 PIXI StencilMaskPipe.execute 中的可见性检查
 *     提前剔除，导致 stencil buffer 不被写入 ⇒ 裁切失效。
 *   - ⚠️ 强制 STENCIL 模式：scene root（active_layer）挂有 LightingFilter；PIXI 默认对轴对齐矩形
 *     mask 自动降级到 SCISSOR；但 SCISSOR 使用屏幕坐标，而 filter 内部 framebuffer 坐标系不一致，
 *     scissor 矩形会错误映射，泄漏到兄弟节点（如 background）。改用 STENCIL 在 framebuffer 内
 *     正确生效。通过 `MaskData` + `autoDetect=false` 实现。
 *
 * 与既有 `container.mask` 的共存（fixed text 等）：
 *   - clip-mask 作用在 wrapper.mask 上，不覆盖 target.mask。
 *   - target 自己已有的 `text_box_mask` / screen-effect mask 仍保留在 target 层，
 *     与外层 wrapper clip-mask 自然取交集。
 *
 * 调用契约：
 *   1. 各引擎为 `type: 'mask'` 的 SceneObject 创建一个普通 `PIXI.Container`（无可视内容，
 *      `renderable=false`），并经过 `applyObjectState` 的 simple-transform 路径写入 x/y/scale/rotation/...
 *   2. 在 `pixiApp.renderer.render(stage)` 之前调用 `pixiApp.stage.updateTransform()`（或
 *      引擎内既有的等效更新），保证所有对象的 worldTransform 已就绪。
 *   3. 调用 `applyAllMasks(objects, getContainer, resources)`。
 *   4. 引擎卸载时调用 `disposeMaskRendererResources(resources)` 清理 Graphics。
 *   5. 删除任意对象时（不论是 mask 还是 target），调用 `unwrapTarget(id, resources)` 释放对应资源。
 */

import * as PIXI from 'pixi.js'

import type { MaskObject, MaskShape, SceneObject } from '@/types/sceneObject'
import { debugLog, debugWarn, isDebugEnabled } from '@/utils/debugLogger'

// ============================================================================
// Types
// ============================================================================

/**
 * mask 渲染器的私有资源包。
 * 各引擎独立持有，避免跨引擎共享导致的 PIXI 资源冲突。
 */
export interface MaskRendererResources {
    /** key = `${maskId}::${targetId}` → Graphics（wrapper 的兄弟节点，挂在 wrapper.parent 下） */
    graphics: Map<string, PIXI.Graphics>
    /** key = `${maskId}::${targetId}` → SpriteMaskFilter 用的白色 Sprite（wrapper 的兄弟节点） */
    spriteMasks: Map<string, PIXI.Sprite>
    /** key = `${maskId}::${targetId}` → SpriteMaskFilter 使用的 shape-aware Texture */
    spriteMaskTextures: Map<string, PIXI.Texture>
    /** key = `${maskId}::${targetId}` → 当前 texture 对应的 shape/size 签名 */
    spriteMaskTextureKeys: Map<string, string>
    /** key = `${maskId}::${targetId}` → 稳定复用的 SpriteMaskFilter，绕开 stencil/scissor framebuffer 问题 */
    spriteFilters: Map<string, PIXI.SpriteMaskFilter>
    /** key = `${maskId}::${targetId}` → 稳定复用的 MaskData，避免每帧替换 wrapper.mask 引发引用计数抖动 */
    maskData: Map<string, PIXI.MaskData>
    /** targetId → 临时 wrapper（原位包裹 target，用于承载 clip mask） */
    wrappers: Map<string, PIXI.Container>
    /** targetId → 当前生效的 maskId（Phase 1 单蒙版独占） */
    claims: Map<string, string>
    /** targetId → clip-mask 接管前 target.filterArea 的旧值，用于 stale 释放时恢复 */
    priorFilterAreas: Map<string, PIXI.Rectangle | undefined>
    /**
     * targetId → 在分配 clip-mask claim 之前 target.mask 的旧值（若有）。
     * 用于 stale 释放时还原 fixed-text `text_box_mask` 等内置遮罩，
     * 而不是直接 `target.mask = null` 把它一并清掉。
     * 仅记录非 clip-mask 的旧值（即不是本资源池里管理的 Graphics）。
     */
    priorMasks: Map<string, PIXI.Container | PIXI.MaskData>
}

export function createMaskRendererResources(): MaskRendererResources {
    return {
        graphics: new Map(),
        spriteMasks: new Map(),
        spriteMaskTextures: new Map(),
        spriteMaskTextureKeys: new Map(),
        spriteFilters: new Map(),
        maskData: new Map(),
        wrappers: new Map(),
        claims: new Map(),
        priorFilterAreas: new Map(),
        priorMasks: new Map(),
    }
}

function safeDestroyTexture(texture: PIXI.Texture | undefined): void {
    if (!texture || texture === PIXI.Texture.WHITE || texture === PIXI.Texture.EMPTY) return
    try {
        texture.destroy(true)
    } catch { /* texture may already be disposed by PIXI; ignore */ }
}

// ============================================================================
// Internals
// ============================================================================

const MASK_GRAPHICS_NAME_PREFIX = '__clip_mask__'
const MASK_WRAPPER_NAME_PREFIX = '__clip_mask_wrapper__'
const DEFAULT_MASK_SIZE = 200

export function isClipMaskWrapper(container: PIXI.DisplayObject | null | undefined): container is PIXI.Container {
    const name = (container as PIXI.Container | null | undefined)?.name
    return typeof name === 'string' && name.startsWith(MASK_WRAPPER_NAME_PREFIX)
}

function makeKey(maskId: string, targetId: string): string {
    return `${maskId}::${targetId}`
}

function isOwnedClipMaskValue(value: PIXI.Container | PIXI.MaskData | null | undefined): boolean {
    if (!value) return false
    const maskObject = (value as PIXI.MaskData).isMaskData
        ? (value as PIXI.MaskData).maskObject
        : value
    const name = (maskObject as PIXI.Container | null)?.name
    return typeof name === 'string' && name.startsWith(MASK_GRAPHICS_NAME_PREFIX)
}

function makeWrapperName(targetId: string): string {
    return `${MASK_WRAPPER_NAME_PREFIX}${targetId}`
}

function resetIdentityTransform(container: PIXI.Container): void {
    container.position.set(0, 0)
    container.scale.set(1, 1)
    container.rotation = 0
    container.skew.set(0, 0)
    container.pivot.set(0, 0)
}

function resolvePositiveFiniteSize(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback
}

function resolveMaskDimensions(mask: MaskObject): { width: number; height: number; rawWidth: number; rawHeight: number } {
    return {
        width: resolvePositiveFiniteSize(mask.width, DEFAULT_MASK_SIZE),
        height: resolvePositiveFiniteSize(mask.height, DEFAULT_MASK_SIZE),
        rawWidth: mask.width,
        rawHeight: mask.height,
    }
}

function matrixToJson(matrix: PIXI.Matrix): Record<'a' | 'b' | 'c' | 'd' | 'tx' | 'ty', number> {
    return {
        a: matrix.a,
        b: matrix.b,
        c: matrix.c,
        d: matrix.d,
        tx: matrix.tx,
        ty: matrix.ty,
    }
}

function rectToJson(rect: PIXI.Rectangle): Record<'x' | 'y' | 'width' | 'height', number> {
    return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }
}

function parentChain(node: PIXI.Container | null): string[] {
    const chain: string[] = []
    let current = node
    while (current) {
        chain.push(current.name ?? current.constructor.name)
        current = current.parent
    }
    return chain
}

function describePossibleCompositeOutput(container: PIXI.Container): Record<string, unknown> {
    const firstChild = container.children[0] as (PIXI.Sprite & { texture?: PIXI.Texture }) | undefined
    const baseTexture = firstChild?.texture?.baseTexture as ({ valid?: boolean; width?: number; height?: number } | undefined)
    return {
        name: container.name,
        childCount: container.children.length,
        firstChildName: firstChild?.name,
        firstChildType: firstChild?.constructor?.name,
        firstChildTextureValid: firstChild?.texture?.valid,
        firstChildBaseTextureValid: baseTexture?.valid,
        firstChildBaseTextureWidth: baseTexture?.width,
        firstChildBaseTextureHeight: baseTexture?.height,
    }
}

function removeOwnedSpriteMaskFilters(
    filters: PIXI.Filter[] | null | undefined,
    resources: MaskRendererResources,
): PIXI.Filter[] {
    if (!filters?.length) return []
    const owned = new Set<PIXI.SpriteMaskFilter>(resources.spriteFilters.values())
    return filters.filter(filter => !owned.has(filter as PIXI.SpriteMaskFilter))
}

function ensureWrapper(resources: MaskRendererResources, targetId: string, target: PIXI.Container): PIXI.Container | null {
    let wrapper = resources.wrappers.get(targetId)
    if (wrapper && target.parent === wrapper) {
        wrapper.zIndex = target.zIndex
        resetIdentityTransform(wrapper)
        wrapper.updateTransform()
        return wrapper
    }

    const parent = target.parent
    if (!parent) return null

    if (!wrapper || (wrapper as unknown as { destroyed?: boolean }).destroyed) {
        wrapper = new PIXI.Container()
        wrapper.name = makeWrapperName(targetId)
        wrapper.sortableChildren = true
        resources.wrappers.set(targetId, wrapper)
    } else if (wrapper.parent && wrapper.parent !== parent) {
        wrapper.parent.removeChild(wrapper)
    }

    wrapper.mask = null
    wrapper.zIndex = target.zIndex
    wrapper.visible = true
    wrapper.renderable = true
    wrapper.alpha = 1
    resetIdentityTransform(wrapper)

    const insertAt = parent.getChildIndex(target)
    parent.removeChild(target)
    parent.addChildAt(wrapper, insertAt)
    wrapper.addChild(target)

    wrapper.updateTransform()
    target.updateTransform()
    return wrapper
}

function unwrapClaimWrapper(resources: MaskRendererResources, targetId: string, target?: PIXI.Container | null): void {
    const wrapper = resources.wrappers.get(targetId)
    if (!wrapper) return

    wrapper.mask = null
    wrapper.filters = null
    delete (wrapper as Partial<PIXI.Container>).filterArea
    if (target?.parent === wrapper) {
        const parent = wrapper.parent
        if (parent) {
            const insertAt = parent.getChildIndex(wrapper)
            wrapper.removeChild(target)
            parent.addChildAt(target, insertAt)
            target.updateTransform()
        }
    }
    try {
        wrapper.parent?.removeChild(wrapper)
    } catch { /* wrapper 已断链；忽略 */ }
    try {
        wrapper.destroy({ children: false })
    } catch { /* wrapper 已被父级级联销毁；忽略 */ }
    resources.wrappers.delete(targetId)
}

/**
 * 在 Graphics 上重绘蒙版形状。
 *
 * 形状居中绘制于 Graphics 自身原点（mask container 的位置代表蒙版中心，参见 applySimpleTransform）。
 * 矩形 / 椭圆各自的 width/height 来自 MaskObject。
 *
 * 通过 `mask.worldTransform` 的 scale 已经体现 scaleX/scaleY，因此 Graphics 上的几何只画原始 width × height。
 */
function drawMaskShape(g: PIXI.Graphics, mask: MaskObject): void {
    const { width, height } = resolveMaskDimensions(mask)
    g.clear()
    // mask 的填充颜色任意（仅作为遮罩 alpha），但必须非透明
    g.beginFill(0xFFFFFF, 1)
    const halfW = width / 2
    const halfH = height / 2
    const shape: MaskShape = mask.shape
    if (shape === 'ellipse') {
        g.drawEllipse(0, 0, halfW, halfH)
    } else {
        // 默认 / rectangle
        g.drawRect(-halfW, -halfH, width, height)
    }
    g.endFill()
}

function ensureSpriteMaskTexture(
    resources: MaskRendererResources,
    key: string,
    mask: MaskObject,
    dimensions: { width: number; height: number },
): PIXI.Texture {
    const width = Math.max(1, Math.ceil(dimensions.width))
    const height = Math.max(1, Math.ceil(dimensions.height))
    const textureKey = `${mask.shape}:${width}:${height}`
    const existingKey = resources.spriteMaskTextureKeys.get(key)
    const existingTexture = resources.spriteMaskTextures.get(key)
    if (existingKey === textureKey && existingTexture) return existingTexture

    safeDestroyTexture(existingTexture)

    let texture: PIXI.Texture = PIXI.Texture.WHITE
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    const ctx = canvas?.getContext?.('2d')
    if (canvas && ctx) {
        canvas.width = width
        canvas.height = height
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = '#ffffff'
        if (mask.shape === 'ellipse') {
            ctx.beginPath()
            ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
            ctx.fill()
        } else {
            ctx.fillRect(0, 0, width, height)
        }
        texture = PIXI.Texture.from(canvas)
    }

    resources.spriteMaskTextures.set(key, texture)
    resources.spriteMaskTextureKeys.set(key, textureKey)
    return texture
}

/**
 * 从对象数组中按稳定索引顺序提取所有 mask SceneObject。
 * 索引升序保证 \"先到先得\" 独占语义，与反序列化 / SetMaskHandler / evaluator 同槽归并的潜规则一致。
 */
function getOrderedMasks(objects: SceneObject[]): { mask: MaskObject; index: number }[] {
    const result: { mask: MaskObject; index: number }[] = []
    for (let i = 0; i < objects.length; i++) {
        const o = objects[i]!
        if (o.type === 'mask') {
            result.push({ mask: o as MaskObject, index: i })
        }
    }
    return result
}

/**
 * 当前帧 mask 是否处于 \"激活\" 状态（参与裁切）。
 * Phase 1 规则：mode 必须为 inside_visible（其他值由 serializer 已降级），visible=true 且 spawned !== false。
 */
function isMaskActive(mask: MaskObject): boolean {
    if (mask.mode !== 'inside_visible') return false
    if (mask.visible === false) return false
    if ((mask as SceneObject).spawned === false) return false
    return true
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 应用所有蒙版到当前帧。
 *
 * 调用时机：每帧渲染前的最后一步（在 applyObjectState / parent-migration / camera transform 之后，
 * 在 `renderer.render(stage)` 之前），确保 mask container 与 target container 的 worldTransform 已更新。
 *
 * 算法：
 * 1) 收集本帧 \"激活\" claims：对每个 mask（按 objects 数组索引升序）的 targetIds 中每个 id，
 *    若该 id 尚未被同帧任何 mask 占用 → 记入 active(targetId → maskId)；否则 warn 并跳过（先到先得）。
 * 2) 拆除失效 claims：resources.claims 中存在、但 active 中不存在或 maskId 不一致的项，拆 wrapper 并移除其 Graphics。
 * 3) 建立 / 更新激活 claims：原位创建 wrapper 包裹 target，缺失的 Graphics 创建并 addChild 到 wrapper 容器；
 *    每帧重绘形状（cheap、幂等），并将 Graphics 的 localTransform 设为 `inv(wrapper.worldTransform) * mask.worldTransform`。
 *
 * 数学：local = inverse(wrapperWorld) × maskWorld，与 PRD §11.3 同语义。
 */
export function applyAllMasks(
    objects: SceneObject[],
    getContainer: (id: string) => PIXI.Container | undefined | null,
    resources: MaskRendererResources,
): void {
    // 诊断日志默认静默。排查时可在浏览器控制台打开：
    // localStorage.setItem('funny-animation-assistant.debug.mask', '1')
    const maskDebugEnabled = isDebugEnabled('mask')
    const w = maskDebugEnabled && typeof window !== 'undefined'
        ? window as unknown as { __MASK_LAST__?: string }
        : {} as { __MASK_LAST__?: string }
    const masksInObjects = objects.filter(o => o.type === 'mask') as MaskObject[]
    const sig = JSON.stringify(masksInObjects.map(m => ({
        id: m.id,
        t: m.targetIds,
        s: m.shape,
        w: m.width,
        h: m.height,
        x: m.x,
        y: m.y,
        sx: m.scaleX,
        sy: m.scaleY,
        r: m.rotation,
        ox: m.transformOriginX,
        oy: m.transformOriginY,
        v: m.visible,
        sp: (m as SceneObject).spawned,
    })))
    const sigChanged = maskDebugEnabled && sig !== w.__MASK_LAST__ && masksInObjects.length > 0
    if (sigChanged) {
        w.__MASK_LAST__ = sig
        const masksDump = masksInObjects.map(m => ({
            id: m.id,
            alias: m.alias,
            targetIds: [...(m.targetIds ?? [])],
            shape: m.shape,
            width: m.width,
            height: m.height,
            x: m.x,
            y: m.y,
            scaleX: m.scaleX,
            scaleY: m.scaleY,
            rotation: m.rotation,
            transformOriginX: m.transformOriginX,
            transformOriginY: m.transformOriginY,
            visible: m.visible,
            spawned: m.spawned,
        }))
        debugLog('mask', '[MASK-CHANGE] mask 状态变化\n' + JSON.stringify(masksDump, null, 2))
        const topLevel = objects.filter(o => !o.parentId).map(o => ({
            id: o.id,
            type: o.type,
            alias: (o as unknown as { alias?: string }).alias,
            parentId: o.parentId,
            childCount: ((o as unknown as { childIds?: string[] }).childIds ?? []).length,
        }))
        debugLog('mask', '[MASK-CHANGE] 场景顶层对象列表（被裁的应只是 targetIds 中的对象及其子对象）\n' + JSON.stringify(topLevel, null, 2))
    }
    // Step 1: build active claims from current frame
    const active = new Map<string, string>() // targetId → winning maskId
    const orderedMasks = getOrderedMasks(objects)
    if (sigChanged) debugLog('mask', '[mask-dbg] orderedMasks\n' + JSON.stringify(orderedMasks.map(m => ({ id: m.mask.id, targets: m.mask.targetIds, active: isMaskActive(m.mask) })), null, 2))
    for (const { mask } of orderedMasks) {
        if (!isMaskActive(mask)) continue
        const targetIds = Array.isArray(mask.targetIds) ? mask.targetIds : []
        for (const tid of targetIds) {
            if (active.has(tid)) {
                console.warn(`[mask] target ${tid} contested; granted to ${active.get(tid)} (mask ${mask.id} skipped)`)
                continue
            }
            // 校验 target 存在
            const tgtContainer = getContainer(tid)
            if (!tgtContainer) {
                debugWarn('mask', '[mask-dbg] target container missing\n' + JSON.stringify({ targetId: tid }, null, 2))
                continue
            }
            active.set(tid, mask.id)
        }
    }
    if (sigChanged && active.size > 0) debugLog('mask', '[mask-dbg] active claims\n' + JSON.stringify(Array.from(active.entries()), null, 2))

    // Step 2: tear down stale claims
    const stale: string[] = []
    for (const [targetId, currentMaskId] of resources.claims) {
        if (active.get(targetId) !== currentMaskId) {
            stale.push(targetId)
        }
    }
    for (const targetId of stale) {
        const currentMaskId = resources.claims.get(targetId)
        if (!currentMaskId) continue
        const target = getContainer(targetId)
        unwrapClaimWrapper(resources, targetId, target)
        if (target && isOwnedClipMaskValue(target.mask)) target.mask = resources.priorMasks.get(targetId) ?? null
        if (target) {
            const restoredFilters = removeOwnedSpriteMaskFilters(target.filters, resources)
            target.filters = restoredFilters.length > 0 ? restoredFilters : null
            if (resources.priorFilterAreas.has(targetId)) {
                const priorFilterArea = resources.priorFilterAreas.get(targetId)
                if (priorFilterArea) target.filterArea = priorFilterArea
                else delete (target as Partial<PIXI.Container>).filterArea
            }
        }
        resources.priorFilterAreas.delete(targetId)
        resources.priorMasks.delete(targetId)
        const key = makeKey(currentMaskId, targetId)
        const g = resources.graphics.get(key)
        if (g) {
            safeDestroyGraphics(g)
            resources.graphics.delete(key)
        }
        const spriteMask = resources.spriteMasks.get(key)
        if (spriteMask) {
            safeDestroySprite(spriteMask)
            resources.spriteMasks.delete(key)
        }
        const spriteFilter = resources.spriteFilters.get(key)
        if (spriteFilter) {
            spriteFilter.destroy()
            resources.spriteFilters.delete(key)
        }
        resources.maskData.delete(key)
        resources.claims.delete(targetId)
    }

    // Step 3: create / update active claims
    for (const [targetId, maskId] of active) {
        const target = getContainer(targetId)
        const maskContainer = getContainer(maskId)
        const maskObj = objects.find(o => o.id === maskId) as MaskObject | undefined
        if (!target || !maskContainer || !maskObj) {
            debugWarn('mask', '[mask-dbg] step3 missing\n' + JSON.stringify({ targetId, maskId, hasTarget: !!target, hasMaskContainer: !!maskContainer, hasObj: !!maskObj }, null, 2))
            continue
        }

        const wrapper = ensureWrapper(resources, targetId, target)
        if (!wrapper) {
            debugWarn('mask', '[mask-dbg] step3 missing target parent\n' + JSON.stringify({ targetId, maskId }, null, 2))
            continue
        }
        // 兼容上一版临时方案：如果 target 上还残留本资源池的 SpriteMaskFilter，先移除并恢复 filterArea。
        restoreTargetFilterState(resources, targetId, target)
        const maskGraphicsHost = wrapper.parent
        if (!maskGraphicsHost) {
            debugWarn('mask', '[mask-dbg] step3 missing wrapper parent\n' + JSON.stringify({ targetId, maskId }, null, 2))
            continue
        }

        const key = makeKey(maskId, targetId)
        let g = resources.graphics.get(key)
        if (!g) {
            g = new PIXI.Graphics()
            g.name = `${MASK_GRAPHICS_NAME_PREFIX}${key}`
            g.renderable = false
            // 缓存 target 上既有的 mask（典型为 fixed text 的 `text_box_mask`），
            // 在 stale 释放时还原；只缓存"非本资源池所拥有"的 mask。
            if (target.mask && !resources.priorMasks.has(targetId)) {
                if (!isOwnedClipMaskValue(target.mask)) {
                    resources.priorMasks.set(targetId, target.mask)
                }
            }
            // mask Graphics 必须挂在 visible 父容器下，且不能成为被 mask 的 wrapper 的后代。
            // 这里挂在 wrapper.parent（通常是 content_layer）下，作为 wrapper 的兄弟节点。
            maskGraphicsHost.addChild(g)
            resources.graphics.set(key, g)
            if (maskDebugEnabled) {
                const ancestors: string[] = []
                let cur: PIXI.Container | null = target
                while (cur) {
                    ancestors.push(cur.name ?? cur.constructor.name)
                    cur = cur.parent
                }
                const targetObj = objects.find(o => o.id === targetId)
                const mountInfo = {
                    targetId,
                    targetType: targetObj?.type,
                    targetAlias: (targetObj as unknown as { alias?: string })?.alias,
                    targetContainerName: target.name,
                    targetChildCount: target.children.length,
                    wrapperName: wrapper.name,
                    wrapperChildCount: wrapper.children.length,
                    ancestorChain: ancestors,
                    graphicsKey: key,
                    graphicsParent: maskGraphicsHost.name,
                }
                debugLog('mask', '[MASK-DEBUG] mask 已挂载（graphics parent = wrapper.parent）\n' + JSON.stringify(mountInfo, null, 2))
                try {
                    const dumpTree = (n: PIXI.DisplayObject, depth: number): string => {
                        const pad = '  '.repeat(depth)
                        const c = n as PIXI.Container
                        const tag = `${pad}${c.name ?? c.constructor.name}${c === target ? '  <<<TARGET>>>' : ''}${c.mask ? '  [HAS_MASK]' : ''}${(c as unknown as { isMask?: boolean }).isMask ? '  [IS_MASK]' : ''}`
                        const children = c.children.slice(0, 30)
                        return [tag, ...children.map(ch => dumpTree(ch, depth + 1))].join('\n')
                    }
                    let root: PIXI.Container = target
                    while (root.parent) root = root.parent
                    debugLog('mask', '[MASK-DEBUG] PIXI 容器树:\n' + dumpTree(root, 0))
                } catch (e) {
                    debugWarn('mask', '[MASK-DEBUG] dumpTree failed', e)
                }
            }
        } else if (g.parent !== maskGraphicsHost) {
            // wrapper / target 容器被销毁重建：重新挂载
            g.parent?.removeChild(g)
            maskGraphicsHost.addChild(g)
        }

        let spriteMask = resources.spriteMasks.get(key)
        if (!spriteMask) {
            spriteMask = new PIXI.Sprite(PIXI.Texture.WHITE)
            spriteMask.name = `${MASK_GRAPHICS_NAME_PREFIX}sprite__${key}`
            spriteMask.anchor.set(0.5)
            spriteMask.visible = true
            spriteMask.alpha = 1
            maskGraphicsHost.addChild(spriteMask)
            resources.spriteMasks.set(key, spriteMask)
        } else if (spriteMask.parent !== maskGraphicsHost) {
            spriteMask.parent?.removeChild(spriteMask)
            maskGraphicsHost.addChild(spriteMask)
        }

        // 重绘形状（cheap、幂等；shape/width/height 任一变化都会被覆盖）
        g.visible = true
        g.alpha = 1
        drawMaskShape(g, maskObj)

        // local := inverse(maskGraphicsHost.worldTransform) × maskContainer.worldTransform
        // ⇒ g.worldTransform === maskGraphicsHost.worldTransform · local === maskContainer.worldTransform
        // 与 PRD §11.3 中"graphics.worldTransform 等于 mask container worldTransform"同语义。
        // PIXI Matrix.append(other) 在 v7+ 语义为 this = this × other。
        if (maskGraphicsHost.parent) maskGraphicsHost.updateTransform()
        const hostWorldInv = maskGraphicsHost.worldTransform.clone().invert()
        const local = hostWorldInv.append(maskContainer.worldTransform)
        g.transform.setFromMatrix(local)
        // 强制立即更新 worldTransform（PIXI MaskSystem 在 push 时会读取 g.worldTransform，
        // 必须先于本帧 render 生效）
        g.updateTransform()

        const dimensions = resolveMaskDimensions(maskObj)
        const spriteMaskTexture = ensureSpriteMaskTexture(resources, key, maskObj, dimensions)
        if (spriteMask.texture !== spriteMaskTexture) {
            spriteMask.texture = spriteMaskTexture
        }
        const textureWidth = spriteMask.texture.orig.width || 1
        const textureHeight = spriteMask.texture.orig.height || 1
        const spriteLocal = local.clone().append(new PIXI.Matrix(
            dimensions.width / textureWidth,
            0,
            0,
            dimensions.height / textureHeight,
            0,
            0,
        ))
        spriteMask.transform.setFromMatrix(spriteLocal)
        spriteMask.updateTransform()

        // ⚠️ 关键：不要再走 DisplayObject.mask 的 STENCIL/SCISSOR 管线。
        //
        // active_layer 上有 LightingFilter，前几版已经验证：
        //   - SCISSOR 会因 screen-space / framebuffer 坐标不一致泄漏到背景。
        //   - 强制 STENCIL 后，Pixi 绑定、几何、bounds 均正确，但浏览器实测 wrapper 仍不裁切，
        //     说明当前 filtered framebuffer 路径下 stencil 写入/测试没有按预期作用于 wrapper 子树。
        //
        // 因此改用 SpriteMaskFilter，并挂到 clip wrapper 上：RenderChainStage 现在会在发现 target
        // 被 clip wrapper 包裹时渲染 wrapper，而不是直接渲染 target。这样 filter 只裁 wrapper 子树，
        // 不再泄漏到 background；同时不依赖 stencil/scissor。
        let spriteFilter = resources.spriteFilters.get(key)
        if (!spriteFilter) {
            spriteFilter = new PIXI.SpriteMaskFilter(spriteMask)
            resources.spriteFilters.set(key, spriteFilter)
        }
        spriteFilter.maskSprite = spriteMask
        wrapper.mask = null
        wrapper.filters = [spriteFilter]
        wrapper.filterArea = wrapper.getBounds(true)
        const maskDebugKey = `__MASK_POST_ASSIGN__${key}`
        if (maskDebugEnabled && (sigChanged || (w as unknown as Record<string, unknown>)[maskDebugKey] !== sig)) {
            ;(w as unknown as Record<string, unknown>)[maskDebugKey] = sig
            const wrapperMask = wrapper.mask as PIXI.MaskData | PIXI.Container | null
            const wrapperInternalMask = (wrapper as unknown as { _mask?: PIXI.MaskData | PIXI.Container | null })._mask
            const graphicsInternals = g as unknown as { _maskRefCount?: number; _geometry?: { graphicsData?: unknown[] } }
            const wrapperFilters = (wrapper as unknown as { filters?: PIXI.Filter[] | null }).filters
            const targetFilters = (target as unknown as { filters?: PIXI.Filter[] | null }).filters
            const diagnostic = {
                targetId,
                maskId,
                key,
                maskObject: {
                    shape: maskObj.shape,
                    rawWidth: dimensions.rawWidth,
                    rawHeight: dimensions.rawHeight,
                    drawWidth: dimensions.width,
                    drawHeight: dimensions.height,
                    x: maskObj.x,
                    y: maskObj.y,
                    scaleX: maskObj.scaleX,
                    scaleY: maskObj.scaleY,
                    rotation: maskObj.rotation,
                    transformOriginX: maskObj.transformOriginX,
                    transformOriginY: maskObj.transformOriginY,
                    visible: maskObj.visible,
                    spawned: maskObj.spawned,
                    aspectRatio: dimensions.height !== 0 ? dimensions.width / dimensions.height : null,
                },
                targetObject: objects.find(o => o.id === targetId) ? {
                    type: objects.find(o => o.id === targetId)?.type,
                    alias: (objects.find(o => o.id === targetId) as unknown as { alias?: string })?.alias,
                    compositeMode: (objects.find(o => o.id === targetId) as unknown as { compositeMode?: string })?.compositeMode,
                    width: (objects.find(o => o.id === targetId) as unknown as { width?: number })?.width,
                    height: (objects.find(o => o.id === targetId) as unknown as { height?: number })?.height,
                    x: objects.find(o => o.id === targetId)?.x,
                    y: objects.find(o => o.id === targetId)?.y,
                    scaleX: objects.find(o => o.id === targetId)?.scaleX,
                    scaleY: objects.find(o => o.id === targetId)?.scaleY,
                } : null,
                possibleCompositeOutput: describePossibleCompositeOutput(target),
                pixiMaskBinding: {
                    wrapperMaskIsMaskData: (wrapperMask as PIXI.MaskData | null)?.isMaskData === true,
                    wrapperMaskIsNull: wrapperMask === null,
                    wrapperInternalMaskIsNull: wrapperInternalMask === null,
                    wrapperFilterCount: wrapperFilters?.length ?? 0,
                    wrapperFilterIsSpriteMask: wrapperFilters?.[0] === spriteFilter,
                    targetFilterCount: targetFilters?.length ?? 0,
                    targetFilterIncludesSpriteMask: targetFilters?.includes(spriteFilter) === true,
                    spriteFilterMaskSpriteEqualsSprite: spriteFilter.maskSprite === spriteMask,
                    graphicsIsMask: g.isMask,
                    graphicsMaskRefCount: graphicsInternals._maskRefCount,
                    graphicsRenderable: g.renderable,
                    graphicsVisible: g.visible,
                    graphicsAlpha: g.alpha,
                    graphicsDataCount: graphicsInternals._geometry?.graphicsData?.length,
                    spriteRenderable: spriteMask.renderable,
                    spriteVisible: spriteMask.visible,
                    spriteAlpha: spriteMask.alpha,
                    spriteTextureValid: spriteMask.texture.valid,
                },
                parents: {
                    wrapper: parentChain(wrapper),
                    target: parentChain(target),
                    graphics: parentChain(g),
                    maskContainer: parentChain(maskContainer),
                },
                transforms: {
                    wrapperWorld: matrixToJson(wrapper.worldTransform),
                    targetWorld: matrixToJson(target.worldTransform),
                    maskContainerWorld: matrixToJson(maskContainer.worldTransform),
                    graphicsWorld: matrixToJson(g.worldTransform),
                    graphicsLocal: matrixToJson(g.localTransform),
                    spriteWorld: matrixToJson(spriteMask.worldTransform),
                    spriteLocal: matrixToJson(spriteMask.localTransform),
                    hostWorld: matrixToJson(maskGraphicsHost.worldTransform),
                },
                bounds: {
                    wrapper: rectToJson(wrapper.getBounds(true)),
                    target: rectToJson(target.getBounds(true)),
                    maskContainer: rectToJson(maskContainer.getBounds(true)),
                    graphics: rectToJson(g.getBounds(true)),
                    sprite: rectToJson(spriteMask.getBounds(true)),
                    host: rectToJson(maskGraphicsHost.getBounds(true)),
                    wrapperFilterArea: wrapper.filterArea ? rectToJson(wrapper.filterArea) : null,
                    targetFilterArea: target.filterArea ? rectToJson(target.filterArea) : null,
                },
            }
            debugLog('mask', '[MASK-DEBUG] mask 绑定后诊断\n' + JSON.stringify(diagnostic, null, 2))
        }
        if (sigChanged) debugLog('mask', '[mask-dbg] applied\n' + JSON.stringify({
            key,
            filter: 'spriteMask',
            wrapperWorld: { tx: wrapper.worldTransform.tx, ty: wrapper.worldTransform.ty },
            targetWorld: { tx: target.worldTransform.tx, ty: target.worldTransform.ty },
            maskWorld: { tx: maskContainer.worldTransform.tx, ty: maskContainer.worldTransform.ty },
            hostWorld: { tx: maskGraphicsHost.worldTransform.tx, ty: maskGraphicsHost.worldTransform.ty },
            spriteWorld: { tx: spriteMask.worldTransform.tx, ty: spriteMask.worldTransform.ty },
            shape: maskObj.shape,
            width: maskObj.width,
            height: maskObj.height,
        }, null, 2))
        resources.claims.set(targetId, maskId)
    }
}

/**
 * 删除单个对象的 mask 关联。
 * 用法：
 *   - 删除 target 时：拆 wrapper + 从 resources 中清理引用。
 *   - 删除 mask 时：遍历 claims，移除所有以该 mask 为 owner 的 graphics。
 */
export function unwrapTarget(
    objectId: string,
    resources: MaskRendererResources,
    getContainer?: (id: string) => PIXI.Container | undefined | null,
): void {
    // 情况 A：作为 target 被删除
    const claimingMask = resources.claims.get(objectId)
    if (claimingMask) {
        const key = makeKey(claimingMask, objectId)
        const target = getContainer?.(objectId)
        unwrapClaimWrapper(resources, objectId, target)
        if (target) restoreTargetFilterState(resources, objectId, target)
        const g = resources.graphics.get(key)
        if (g) {
            safeDestroyGraphics(g)
            resources.graphics.delete(key)
        }
        const spriteMask = resources.spriteMasks.get(key)
        if (spriteMask) {
            safeDestroySprite(spriteMask)
            resources.spriteMasks.delete(key)
        }
        safeDestroyTexture(resources.spriteMaskTextures.get(key))
        resources.spriteMaskTextures.delete(key)
        resources.spriteMaskTextureKeys.delete(key)
        const spriteFilter = resources.spriteFilters.get(key)
        if (spriteFilter) {
            spriteFilter.destroy()
            resources.spriteFilters.delete(key)
        }
        resources.maskData.delete(key)
        if (target && isOwnedClipMaskValue(target.mask)) target.mask = resources.priorMasks.get(objectId) ?? null
        resources.priorMasks.delete(objectId)
        resources.priorFilterAreas.delete(objectId)
        resources.claims.delete(objectId)
    }
    // 情况 B：作为 mask 被删除（id 是 mask）
    const tids: string[] = []
    for (const [tid, mid] of resources.claims) {
        if (mid === objectId) tids.push(tid)
    }
    for (const tid of tids) {
        const key = makeKey(objectId, tid)
        const target = getContainer?.(tid)
        unwrapClaimWrapper(resources, tid, target)
        if (target) restoreTargetFilterState(resources, tid, target)
        const g = resources.graphics.get(key)
        if (g) {
            safeDestroyGraphics(g)
            resources.graphics.delete(key)
        }
        const spriteMask = resources.spriteMasks.get(key)
        if (spriteMask) {
            safeDestroySprite(spriteMask)
            resources.spriteMasks.delete(key)
        }
        safeDestroyTexture(resources.spriteMaskTextures.get(key))
        resources.spriteMaskTextures.delete(key)
        resources.spriteMaskTextureKeys.delete(key)
        const spriteFilter = resources.spriteFilters.get(key)
        if (spriteFilter) {
            spriteFilter.destroy()
            resources.spriteFilters.delete(key)
        }
        resources.maskData.delete(key)
        if (target && isOwnedClipMaskValue(target.mask)) target.mask = resources.priorMasks.get(tid) ?? null
        resources.priorMasks.delete(tid)
        resources.priorFilterAreas.delete(tid)
        resources.claims.delete(tid)
    }
}

/**
 * 卸载 / 重置渲染器：销毁所有 Graphics、清空索引。
 *
 * 容错：在 Vue beforeUnmount → cleanup 链路中，PIXI stage 通常已先一步级联销毁
 * 子节点（含本资源池里的 Graphics）。再次 `g.destroy()` 会触发
 * `Cannot read properties of null (reading 'refCount')`。
 * 因此用 try/catch 兜底；同时尽量先检查 destroyed 标记。
 */
export function disposeMaskRendererResources(resources: MaskRendererResources): void {
    for (const targetId of resources.wrappers.keys()) {
        unwrapClaimWrapper(resources, targetId)
    }
    for (const g of resources.graphics.values()) {
        safeDestroyGraphics(g)
    }
    for (const spriteMask of resources.spriteMasks.values()) {
        safeDestroySprite(spriteMask)
    }
    for (const texture of resources.spriteMaskTextures.values()) {
        safeDestroyTexture(texture)
    }
    for (const spriteFilter of resources.spriteFilters.values()) {
        spriteFilter.destroy()
    }
    resources.graphics.clear()
    resources.spriteMasks.clear()
    resources.spriteMaskTextures.clear()
    resources.spriteMaskTextureKeys.clear()
    resources.spriteFilters.clear()
    resources.maskData.clear()
    resources.wrappers.clear()
    resources.claims.clear()
    resources.priorFilterAreas.clear()
    resources.priorMasks.clear()
}

function restoreTargetFilterState(resources: MaskRendererResources, targetId: string, target: PIXI.Container): void {
    const restoredFilters = removeOwnedSpriteMaskFilters(target.filters, resources)
    target.filters = restoredFilters.length > 0 ? restoredFilters : null
    if (resources.priorFilterAreas.has(targetId)) {
        const priorFilterArea = resources.priorFilterAreas.get(targetId)
        if (priorFilterArea) target.filterArea = priorFilterArea
        else delete (target as Partial<PIXI.Container>).filterArea
    }
}

function safeDestroyGraphics(g: PIXI.Graphics): void {
    const destroyed = (g as unknown as { destroyed?: boolean }).destroyed
    if (destroyed) return
    try {
        g.parent?.removeChild(g)
    } catch { /* PIXI 内部已断链；忽略 */ }
    try {
        g.destroy()
    } catch { /* 资源已被父级级联销毁；忽略 */ }
}

function safeDestroySprite(sprite: PIXI.Sprite): void {
    const destroyed = (sprite as unknown as { destroyed?: boolean }).destroyed
    if (destroyed) return
    try {
        sprite.parent?.removeChild(sprite)
    } catch { /* PIXI 内部已断链；忽略 */ }
    try {
        sprite.destroy({ texture: false, baseTexture: false })
    } catch { /* 资源已被父级级联销毁；忽略 */ }
}
