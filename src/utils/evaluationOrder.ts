/**
 * 对象评估顺序工具
 * v17: 按 parentId 拓扑排序，确保 parent 先于 child 被评估
 *
 * 当 child 的坐标转换依赖 parent 的当前帧状态时，
 * 必须保证 parent 已经完成评估，context.getObjectState(parentId) 才能返回最新值。
 */

/**
 * 按 parentId 拓扑排序对象列表
 *
 * 排序规则：
 * - 无 parentId 的对象排在最前
 * - 有 parentId 的对象排在其 parent 之后
 * - 多层嵌套时递归处理深度
 *
 * @param objects 对象列表（需包含 id 和 parentId 属性）
 * @returns 拓扑排序后的新数组（不修改原数组）
 */
export function topologicalSortByParent<T extends { id: string; parentId?: string | null | undefined }>(
    objects: readonly T[]
): T[] {
    // 构建 id → depth 映射
    const idMap = new Map<string, T>()
    for (const obj of objects) {
        idMap.set(obj.id, obj)
    }

    const depthCache = new Map<string, number>()

    function getDepth(obj: T, visiting?: Set<string>): number {
        const cached = depthCache.get(obj.id)
        if (cached !== undefined) return cached

        if (!obj.parentId) {
            depthCache.set(obj.id, 0)
            return 0
        }

        const parent = idMap.get(obj.parentId)
        if (!parent) {
            depthCache.set(obj.id, 0)
            return 0
        }

        // Fail-Fast: 检测循环 parentId 链
        const chain = visiting ?? new Set<string>()
        if (chain.has(obj.id)) {
            throw new Error(`[topologicalSortByParent] 检测到循环的父子对象关系: ${[...chain, obj.id].join(' → ')}`)
        }
        chain.add(obj.id)

        const depth = getDepth(parent, chain) + 1
        depthCache.set(obj.id, depth)
        return depth
    }

    // 计算所有深度
    for (const obj of objects) {
        getDepth(obj)
    }

    // 稳定排序：按深度升序，深度相同保持原序
    return [...objects].sort((a, b) => {
        const da = depthCache.get(a.id) ?? 0
        const db = depthCache.get(b.id) ?? 0
        return da - db
    })
}
