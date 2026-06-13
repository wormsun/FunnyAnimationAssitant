/**
 * RenderChainStage — renderChain 驱动的自定义渲染容器
 *
 * 核心功能：
 * override render() 方法，按 renderChain 顺序逐个调用叶子容器的 render(renderer)，
 * 实现 union 子对象与同级对象的交叉渲染。
 *
 * 原理：
 * PIXI 的标准渲染流程（递归遍历 children）无法跨越 union 容器边界交叉排序。
 * 通过 override render()，我们绕过默认的 children 遍历，
 * 按 renderChain 展开顺序直接调用每个叶子容器的 render(renderer)。
 *
 * 关键保证：
 * - container.render(renderer) 使用已计算好的 worldTransform（由 updateTransform() 递归完成）
 * - 因此即使对象在 union 容器内，被 entity 级 render() 调用时变换仍然正确
 * - union 容器保留在 entity.children 中以参与 updateTransform()，但不被直接 render
 *
 * renderChain 规则：
 * - union composite 不出现在 renderChain 中，其子对象被展开平铺
 * - entity composite 出现在 renderChain 中，拥有自己的 renderChain
 * - renderChain 是渲染顺序的唯一权威来源
 *
 * Resolver 模式（根级 stage 专用）：
 * - 传入 chainResolver/containerResolver 回调，每次 render 时动态获取最新数据
 * - 避免根级 stage 因对象增删/zIndex 变化导致 renderChain 过期
 */
import * as PIXI from 'pixi.js'

import { isClipMaskWrapper } from './maskRenderer'

type RootRenderChainOverrideContainer = PIXI.Container & {
    _hasRootRenderChainOverride?: boolean
    _originalRootRender?: PIXI.Container['render']
}

/**
 * 按 renderChain 顺序渲染容器内的对象
 *
 * 替代 PIXI 默认的 children 递归渲染。
 * 遍历 renderChain 中的每个 ID，从 containerMap 查找对应的 PIXI 容器，
 * 直接调用其 render(renderer)。
 *
 * union 子对象虽然在 union 容器内（获得自动变换传播），
 * 但被本函数独立调度渲染，实现与其他子对象的交叉排序。
 *
 * 不在 renderChain 中的 children（如 overlay、selection box）在最后渲染。
 *
 * @param entityContainer entity composite 的 PIXI 容器
 * @param renderChain 有序 ID 列表（union 已展开）
 * @param containerMap objectId → PIXI.Container 的映射
 * @param renderer PIXI.Renderer 实例
 */
export function renderByRenderChain(
    entityContainer: PIXI.Container,
    renderChain: readonly string[],
    containerMap: ReadonlyMap<string, PIXI.Container>,
    renderer: PIXI.Renderer,
): void {
    // 两类集合严格区分：
    // directlyRendered: 叶子容器 — 已通过 container.render(renderer) 完整渲染（含其内部 PIXI 子节点）
    //                   兜底阶段必须完全跳过，不可递归进入其内部（否则精灵会被按 PIXI children 顺序重绘，破坏 renderChain 排序）
    // handledAncestors: union 容器壳 — 仅作为祖先被标记，自身无可视内容
    //                   兜底阶段必须递归探查，寻找不在 renderChain 中的动态 spawn 子对象
    const directlyRendered = new Set<PIXI.Container>()
    const handledAncestors = new Set<PIXI.Container>()
    const renderedClipWrappers = new Set<PIXI.Container>()

    // 祖先可见性检查：从 container 向上回溯到 entityContainer（不含），
    // 若任一祖先 visible=false 或 renderable=false 则视为不可见。
    // 与 PIXI 默认 worldVisible 语义对齐，弥补 renderChain 渲染绕过祖先 render() 的差异。
    // 修复：union composite 设为 visible=false（含「穿透+隐藏」）时，子对象仍被显示的问题。
    const isAncestorChainVisible = (container: PIXI.Container): boolean => {
        let parent = container.parent
        while (parent && parent !== entityContainer) {
            if (!parent.visible || !parent.renderable) return false
            parent = parent.parent
        }
        return true
    }

    // 按 renderChain 顺序逐个渲染叶子容器
    for (const objectId of renderChain) {
        const container = containerMap.get(objectId)
        if (!container || container.destroyed || !container.visible) continue
        // 祖先链可见性检查（union/entity 等中间容器）
        if (!isAncestorChainVisible(container)) continue

        // Clip-Mask Phase 1：maskRenderer 会把 target 原位包进一个临时 wrapper。
        // renderChain 为了交叉排序会直接调 target.render(renderer)，这会绕过 parent wrapper，
        // 导致挂在 wrapper 上的 mask/filter 完全不生效。这里检测到 clip wrapper 时，改为渲染
        // wrapper；同一 wrapper 只渲染一次，避免同一个被裁 target 重复绘制。
        const renderContainer = isClipMaskWrapper(container.parent) ? container.parent : container
        if (isClipMaskWrapper(renderContainer)) {
            if (renderedClipWrappers.has(renderContainer)) continue
            renderedClipWrappers.add(renderContainer)
        }

        renderContainer.render(renderer)
        directlyRendered.add(renderContainer)
        if (renderContainer !== container) directlyRendered.add(container)

        // 标记其所有祖先 union 容器（直到 entityContainer）
        // 这些容器自身不应被整体 render，但需要在兜底阶段递归探查
        let parent = renderContainer.parent
        while (parent && parent !== entityContainer) {
            handledAncestors.add(parent)
            parent = parent.parent
        }
    }

    // 渲染不在 renderChain 中的 children（overlay、selection box、动态加入 union 但未在 renderChain 中的对象等）
    const renderRemainingChildren = (parent: PIXI.Container): void => {
        for (const child of parent.children) {
            if (directlyRendered.has(child as PIXI.Container)) {
                // 叶子容器 — 已在主循环中完整渲染（含内部所有 PIXI 子节点），完全跳过
            } else if (handledAncestors.has(child as PIXI.Container)) {
                // union 容器壳 — 自身无可视内容，递归探查其子对象中是否有未被覆盖的动态 spawn 对象
                // 但若该 union 自身 visible=false / renderable=false，则其整个子树不应渲染
                if (!child.visible || !(child as PIXI.Container).renderable) continue
                if ((child as PIXI.Container).children?.length > 0) {
                    renderRemainingChildren(child as PIXI.Container)
                }
            } else if (child.visible) {
                child.render(renderer)
            }
        }
    }
    renderRemainingChildren(entityContainer)
}

/**
 * 为 entity composite 安装自定义渲染逻辑（静态 Map 模式）
 *
 * 在 entity 容器上 override render() 方法，
 * 使其按 renderChain 顺序渲染而非默认的 children 遍历。
 *
 * @param entityContainer entity composite 的 PIXI 容器
 * @param renderChain 有序 ID 列表
 * @param containerMap objectId → PIXI.Container 的映射（静态快照）
 */
export function installRenderChainRenderer(
    entityContainer: PIXI.Container,
    renderChain: readonly string[],
    containerMap: ReadonlyMap<string, PIXI.Container>,
): void {
    if (renderChain.length === 0) return

    // Override render 方法
    entityContainer.render = function customRender(renderer: PIXI.Renderer): void {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable) return

        // 确保 worldTransform 已更新
        // PIXI 标准流程：renderer.render(stage) → stage.updateTransform() → 递归更新所有 children
        // 此时所有 children（包括 union 内的子对象）的 worldTransform 已就绪

        // 手动管理 filter/mask 管线，同时保持 renderChain 渲染顺序
        // 参照 PIXI Container.renderAdvanced() 的完整流程：
        //   1. 过滤 disabled filters → push enabled 到 FilterSystem
        //   2. push mask
        //   3. 渲染内容
        //   4. batch.flush() — 关键！将待处理的绘制调用提交到当前 render target
        //   5. pop mask → pop filter
        // 缺少 batch.flush() 会导致 GL_INVALID_OPERATION: Insufficient buffer size
        const filters = this.filters
        const mask = this._mask
        const needsAdvanced = (filters && filters.length > 0) ?? !!mask

        // 收集启用的 filter（PIXI 内部用 _enabledFilters，我们用局部变量避免污染）
        let enabledFilters: PIXI.Filter[] | null = null
        if (filters && filters.length > 0) {
            enabledFilters = filters.filter(f => f.enabled)
            if (enabledFilters.length > 0) {
                renderer.filter.push(this, enabledFilters)
            } else {
                enabledFilters = null
            }
        }
        if (mask) {
            renderer.mask.push(this, mask)
        }

        // 按 renderChain 顺序渲染子对象（无论是否有 filter/mask）
        renderByRenderChain(this, renderChain, containerMap, renderer)

        // 关键：在 pop 之前刷新批次，确保所有绘制调用已提交到当前 render target
        if (needsAdvanced) {
            renderer.batch.flush()
        }
        if (mask) {
            renderer.mask.pop(this)
        }
        if (enabledFilters) {
            renderer.filter.pop()
        }
    }

    // 标记已安装自定义渲染（用于调试和测试）
    ;(entityContainer as PIXI.Container & { _hasRenderChainOverride?: boolean })._hasRenderChainOverride = true
}

/**
 * 为根级容器（stage/contentViewport）安装 renderChain 驱动的渲染逻辑（Resolver 模式）
 *
 * 与 installRenderChainRenderer 不同，此模式使用回调函数动态获取 renderChain 和容器映射，
 * 确保每次 render 时使用最新数据（根级 stage 的对象列表和 zIndex 是动态变化的）。
 *
 * 适用场景：编辑器 targetLayer/activeLayer、ScenePlayer stage、FrameCapture contentViewport
 *
 * @param stageContainer 根级 PIXI 容器
 * @param chainResolver 每次 render 时调用，返回当前的有序 renderChain ID 列表
 * @param containerResolver 每次 render 时调用，根据 objectId 返回对应的 PIXI 容器
 */
export function installRootRenderChainRenderer(
    stageContainer: PIXI.Container,
    chainResolver: () => readonly string[],
    containerResolver: (id: string) => PIXI.Container | undefined,
): void {
    const rootContainer = stageContainer as RootRenderChainOverrideContainer
    rootContainer._originalRootRender ??= stageContainer.render.bind(stageContainer)
    const originalRender = rootContainer._originalRootRender

    stageContainer.render = function rootCustomRender(renderer: PIXI.Renderer): void {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable) return

        // 每次 render 时动态获取最新 renderChain 和容器映射
        const renderChain = chainResolver()
        if (renderChain.length === 0) {
            // renderChain 为空时回退到标准渲染
            originalRender(renderer)
            return
        }

        // 手动管理 filter/mask 管线（与 entity 级一致的 renderAdvanced 模式）
        const filters = this.filters
        const mask = this._mask
        const needsAdvanced = (filters && filters.length > 0) ?? !!mask

        let enabledFilters: PIXI.Filter[] | null = null
        if (filters && filters.length > 0) {
            enabledFilters = filters.filter(f => f.enabled)
            if (enabledFilters.length > 0) {
                renderer.filter.push(this, enabledFilters)
            } else {
                enabledFilters = null
            }
        }
        if (mask) {
            renderer.mask.push(this, mask)
        }

        // 构建临时 Map（仅包含本次 renderChain 需要的容器）
        const containerMap = new Map<string, PIXI.Container>()
        for (const id of renderChain) {
            const c = containerResolver(id)
            if (c) containerMap.set(id, c)
        }

        renderByRenderChain(this, renderChain, containerMap, renderer)

        if (needsAdvanced) {
            renderer.batch.flush()
        }
        if (mask) {
            renderer.mask.pop(this)
        }
        if (enabledFilters) {
            renderer.filter.pop()
        }
    }

    rootContainer._hasRootRenderChainOverride = true
}

export function uninstallRootRenderChainRenderer(stageContainer: PIXI.Container): void {
    const rootContainer = stageContainer as RootRenderChainOverrideContainer
    if (!rootContainer._originalRootRender) return

    stageContainer.render = rootContainer._originalRootRender
    delete rootContainer._hasRootRenderChainOverride
}

/**
 * 更新已安装的自定义渲染逻辑的 renderChain 和 containerMap
 *
 * 当 renderChain 或 containerMap 变化时（如对象添加/删除/重排），
 * 需要重新安装渲染逻辑。
 *
 * @param entityContainer entity composite 的 PIXI 容器
 * @param renderChain 新的有序 ID 列表
 * @param containerMap 新的 objectId → PIXI.Container 映射
 */
export function updateRenderChainRenderer(
    entityContainer: PIXI.Container,
    renderChain: readonly string[],
    containerMap: ReadonlyMap<string, PIXI.Container>,
): void {
    // 直接重新安装（覆盖上一次的 override）
    installRenderChainRenderer(entityContainer, renderChain, containerMap)
}
