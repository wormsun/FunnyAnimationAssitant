/**
 * 渲染链工具函数
 *
 * 将物理存储（objects/childIds）与渲染顺序（renderChain）解耦。
 * renderChain 是一个有序 ID 列表，决定 PIXI 的绘制先后。
 *
 * 核心规则：
 * - union composite 不出现在 renderChain 中，其子对象展开平铺
 * - entity composite 出现在 renderChain 中，拥有自己的 renderChain
 * - zIndex 有序不变量：renderChain 中 ∀ i<j: zIndex[chain[i]] ≤ zIndex[chain[j]]
 */

import type { CompositeObject, SceneObject } from '@/types/sceneObject'

function participatesInRenderChain(obj: SceneObject): boolean {
    return obj.type !== 'camera' && obj.type !== 'audio' && obj.type !== 'light'
}

// ==================== 构建渲染链 ====================

/**
 * 从物理存储自动构建渲染链（初始化/迁移用）
 *
 * 场景根级：收集所有无 parentId 的对象 + union 子对象展开
 * Entity 内部：收集 entity 的子对象 + union 子对象展开
 *
 * 排序规则：按 (zIndex, 原数组位置) 排序
 *
 * @param objects 所有场景对象（平铺）
 * @param parentId 层级限定：undefined=根级，entityId=entity 内部
 */
export function buildRenderChain(
    objects: readonly SceneObject[],
    parentId?: string,
): string[] {
    const objectMap = new Map<string, SceneObject>()
    for (const obj of objects) {
        objectMap.set(obj.id, obj)
    }

    const result: { id: string; zIndex: number; originalIndex: number }[] = []

    // 收集该层级的可渲染对象（展开 union）
    collectRenderableIds(objects, objectMap, parentId, result)

    // 按 (zIndex, originalIndex) 排序
    result.sort((a, b) => {
        if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex
        return a.originalIndex - b.originalIndex
    })

    return result.map(r => r.id)
}

/**
 * 递归收集可渲染 ID（展开 union，遇到 entity 停止递归）
 */
function collectRenderableIds(
    allObjects: readonly SceneObject[],
    objectMap: Map<string, SceneObject>,
    parentId: string | undefined,
    result: { id: string; zIndex: number; originalIndex: number }[],
): void {
    for (let i = 0; i < allObjects.length; i++) {
        const obj = allObjects[i]!
        // 筛选该层级的直接对象
        const objParent = obj.parentId
        if (parentId === undefined) {
            // 根级：无 parentId 的对象，或 parentId 指向 union（递归展开后处理）
            if (objParent !== undefined) continue
        } else {
            // entity 内部：parentId 等于指定 entityId
            if (objParent !== parentId) continue
        }

        // 跳过非画面内容/编辑辅助对象；文本是正常画面对象，必须参与排序。
        if (!participatesInRenderChain(obj)) continue

        if (obj.type === 'composite') {
            const comp = obj as CompositeObject
            if (comp.compositeMode === 'union') {
                // union：不出现在渲染链，递归展开子对象
                expandUnionChildren(comp, objectMap, result)
                continue
            }
            // entity：本身出现在渲染链（作为 CRT 节点）
        }

        result.push({ id: obj.id, zIndex: obj.zIndex, originalIndex: i })
    }
}

/**
 * 递归展开 union 的子对象到渲染链
 */
function expandUnionChildren(
    union: CompositeObject,
    objectMap: Map<string, SceneObject>,
    result: { id: string; zIndex: number; originalIndex: number }[],
): void {
    for (const childId of union.childIds) {
        const child = objectMap.get(childId)
        if (!child) continue

        if (child.type === 'composite' && (child as CompositeObject).compositeMode === 'union') {
            // 嵌套 union：继续递归展开
            expandUnionChildren(child as CompositeObject, objectMap, result)
        } else if (participatesInRenderChain(child)) {
            // 普通对象或 entity：添加到结果
            result.push({ id: child.id, zIndex: child.zIndex, originalIndex: result.length })
        }
    }
}

// ==================== 渲染链插入位置 ====================

/**
 * 计算对象在 renderChain 中的正确插入位置（维护 zIndex 有序不变量）
 *
 * 在同 zIndex 段的末尾插入。
 */
export function findInsertPosition(
    renderChain: readonly string[],
    zIndex: number,
    getObject: (id: string) => SceneObject | undefined,
): number {
    // 找到最后一个 zIndex <= 给定值的位置
    let insertPos = renderChain.length
    for (let i = renderChain.length - 1; i >= 0; i--) {
        const obj = getObject(renderChain[i]!)
        if (obj && obj.zIndex <= zIndex) {
            insertPos = i + 1
            break
        }
        // 如果所有对象的 zIndex 都大于给定值，插入到最前面
        if (i === 0) {
            const firstObj = getObject(renderChain[0]!)
            if (firstObj && firstObj.zIndex > zIndex) {
                insertPos = 0
            }
        }
    }
    return insertPos
}

/**
 * 从 renderChain 中移除指定 ID
 */
export function removeFromRenderChain(
    renderChain: string[],
    objectId: string,
): void {
    const idx = renderChain.indexOf(objectId)
    if (idx !== -1) {
        renderChain.splice(idx, 1)
    }
}

/**
 * 从 renderChain 中批量移除指定 ID
 */
export function removeMultipleFromRenderChain(
    renderChain: string[],
    objectIds: string[],
): void {
    const toRemove = new Set(objectIds)
    for (let i = renderChain.length - 1; i >= 0; i--) {
        if (toRemove.has(renderChain[i]!)) {
            renderChain.splice(i, 1)
        }
    }
}

// ==================== 增量协调 ====================

/**
 * 增量协调渲染链（Setup 复制 + 增量维护）
 *
 * 保留 existingChain 中仍有效的 ID 及其相对顺序，
 * 移除不再属于当前层级的 ID，新增的 ID 按 zIndex 插入。
 *
 * 用于 applyBlockActionsToState / calculateSlotStates：
 * set_scene_structure / set_lifecycle / auto-despawn 改变成员后，
 * 不全量重建（丢失用户自定义顺序），而是增量协调。
 *
 * @param existingChain 当前持有的渲染链（继承自 setup 或上一次计算）
 * @param objects 所有场景对象（平铺）
 * @param parentId 层级限定：undefined=根级，entityId=entity 内部
 */
export function reconcileRenderChain(
    existingChain: readonly string[],
    objects: readonly SceneObject[],
    parentId?: string,
): string[] {
    // 计算当前应包含的 ID 集合（同 buildRenderChain 规则）
    const expectedIds = buildRenderChain(objects, parentId)
    const expectedSet = new Set(expectedIds)

    // 保留已有链中仍有效的 ID（顺序不变）
    const retained = existingChain.filter(id => expectedSet.has(id))
    const retainedSet = new Set(retained)

    // 新增 ID = expected 中不在 retained 中的
    const result = [...retained]
    const objectMap = new Map(objects.map(o => [o.id, o]))
    for (const id of expectedIds) {
        if (!retainedSet.has(id)) {
            const obj = objectMap.get(id)
            const pos = findInsertPosition(result, obj?.zIndex ?? 0, rid => objectMap.get(rid))
            result.splice(pos, 0, id)
        }
    }

    return result
}

// ==================== 运行时 zIndex 排序 ====================

/**
 * 按运行时 zIndex 对 renderChain 进行稳定排序
 *
 * 设计原因：renderChain 在场景初始化时按 setup zIndex 排序，
 * 但 set_visual action 可在运行时改变 zIndex。
 * 如果直接用初始 renderChain 覆盖 sortChildren 的结果，
 * 运行时 zIndex 变更不会被反映到实际渲染顺序中。
 *
 * 此函数返回一个新数组（不修改原 renderChain），
 * 相同 zIndex 的对象保持原有 renderChain 中的相对顺序（稳定排序）。
 *
 * @param renderChain 原始渲染链
 * @param getZIndex 运行时 zIndex 查询回调
 */
export function sortRenderChainByZIndex(
    renderChain: readonly string[],
    getZIndex: (id: string) => number,
): string[] {
    // 保留原始索引以实现稳定排序
    const indexed = renderChain.map((id, i) => ({ id, zIndex: getZIndex(id), originalIndex: i }))
    indexed.sort((a, b) => {
        if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex
        return a.originalIndex - b.originalIndex
    })
    return indexed.map(item => item.id)
}
