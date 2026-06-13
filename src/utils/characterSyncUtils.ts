/**
 * 人物间结构/动画同步复制工具
 *
 * 「拍扁→重组」策略：
 * 1. 将目标人物拍扁为叶节点
 * 2. 按名称（alias）与源人物的叶节点匹配
 * 3. 复制源人物的 composite 骨架结构
 * 4. 将匹配的叶节点填入骨架
 * 5. 复制动画定义，重映射所有 ID 引用
 */

import type { AnimationDefinition, AnimationTrack, TrackAnimationDefinition } from '@/types/animation'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import { generateId } from '@/utils/uuid'

// ===== 公共类型 =====

/** 名称匹配结果 */
export interface NameMatchResult {
    /** 源叶节点 ID → 目标叶节点 ID */
    leafIdMap: Map<string, string>
    /** 源 composite ID → 新生成的 composite ID */
    compositeIdMap: Map<string, string>
    /** 综合映射：源任意对象 ID → 目标对象 ID（leafIdMap + compositeIdMap 的并集） */
    fullIdMap: Map<string, string>
    /** 仅源有的叶节点别名列表 */
    sourceOnly: string[]
    /** 仅目标有的叶节点别名列表 */
    targetOnly: string[]
    /** 匹配成功的别名列表 */
    matched: string[]
}

/** 同步结果 */
export interface CharacterSyncResult {
    /** 重组后的完整对象列表（直接替换 CompositeCharacter.objects） */
    objects: SceneObject[]
    /** 匹配信息（用于 UI 预览） */
    matchResult: NameMatchResult
    /** 被跳过的动画名（因所有轨道目标都不可映射） */
    skippedAnimations: string[]
    /** 被部分裁剪的动画名（部分轨道目标不可映射，已移除无效轨道） */
    trimmedAnimations: string[]
}

// ===== 辅助工具 =====

/** 判断是否为 composite 对象 */
function isComposite(obj: SceneObject): obj is CompositeObject {
    return obj.type === 'composite'
}

/** 获取对象的匹配用名称（优先 alias，回退 name） */
function getMatchName(obj: SceneObject): string {
    const trimmed = obj.alias?.trim()
    return (trimmed && trimmed.length > 0) ? trimmed : obj.name
}

/** 生成新的 SceneObject ID */
function newObjectId(): string {
    return generateId('sceneobject')
}

/** 生成新的 Animation ID */
function newAnimationId(): string {
    return generateId('animation')
}

// ===== 核心函数 =====

/**
 * 收集所有叶节点（非 composite 的 SceneObject）
 *
 * @param objects 平坦的 SceneObject 列表
 * @returns alias → SceneObject 映射（重复 alias 仅保留第一个）
 */
export function collectLeafNodes(objects: readonly SceneObject[]): Map<string, SceneObject> {
    const result = new Map<string, SceneObject>()
    for (const obj of objects) {
        if (isComposite(obj)) continue
        const name = getMatchName(obj)
        if (!result.has(name)) {
            result.set(name, obj)
        }
    }
    return result
}

/**
 * 收集所有 composite 节点
 */
function collectCompositeNodes(objects: readonly SceneObject[]): CompositeObject[] {
    return objects.filter(isComposite)
}

/**
 * 建立名称匹配
 *
 * @param sourceObjects 源人物的 objects 列表
 * @param targetObjects 目标人物的 objects 列表
 * @returns 匹配结果
 */
export function buildNameMatch(
    sourceObjects: readonly SceneObject[],
    targetObjects: readonly SceneObject[],
): NameMatchResult {
    const sourceLeaves = collectLeafNodes(sourceObjects)
    const targetLeaves = collectLeafNodes(targetObjects)
    const sourceComposites = collectCompositeNodes(sourceObjects)

    const leafIdMap = new Map<string, string>()
    const matched: string[] = []
    const sourceOnly: string[] = []
    const targetOnly: string[] = []

    // 1. 按别名匹配叶节点
    for (const [alias, sourceObj] of sourceLeaves) {
        const targetObj = targetLeaves.get(alias)
        if (targetObj) {
            leafIdMap.set(sourceObj.id, targetObj.id)
            matched.push(alias)
        } else {
            sourceOnly.push(alias)
        }
    }

    // 2. 找出仅目标有的叶节点
    for (const alias of targetLeaves.keys()) {
        if (!sourceLeaves.has(alias)) {
            targetOnly.push(alias)
        }
    }

    // 3. 为源的每个 composite 生成新 ID
    const compositeIdMap = new Map<string, string>()
    for (const comp of sourceComposites) {
        compositeIdMap.set(comp.id, newObjectId())
    }

    // 4. 合并映射
    const fullIdMap = new Map<string, string>([
        ...leafIdMap.entries(),
        ...compositeIdMap.entries(),
    ])

    return {
        leafIdMap,
        compositeIdMap,
        fullIdMap,
        sourceOnly,
        targetOnly,
        matched,
    }
}

/**
 * 重映射动画定义中的所有 ID 引用
 *
 * @param animations 源动画记录
 * @param idMap 综合 ID 映射表
 * @returns 重映射后的动画记录和被跳过/裁剪的动画名
 */
export function remapAnimationDefinitions(
    animations: Record<string, AnimationDefinition>,
    idMap: Map<string, string>,
): { remapped: Record<string, AnimationDefinition>; skipped: string[]; trimmed: string[] } {
    const remapped: Record<string, AnimationDefinition> = {}
    const skipped: string[] = []
    const trimmed: string[] = []

    for (const [_oldId, anim] of Object.entries(animations)) {
        const newAnimId = newAnimationId()
        const now = Date.now()

        if (anim.type === 'track') {
            const result = remapTrackAnimation(anim, newAnimId, now, idMap)
            if (result === null) {
                skipped.push(anim.name)
            } else {
                if (result.trimmed) {
                    trimmed.push(anim.name)
                }
                remapped[newAnimId] = result.animation
            }
        }
    }

    return { remapped, skipped, trimmed }
}

/** 重映射轨道动画 */
function remapTrackAnimation(
    anim: TrackAnimationDefinition,
    newId: string,
    now: number,
    idMap: Map<string, string>,
): { animation: TrackAnimationDefinition; trimmed: boolean } | null {
    const newTracks: AnimationTrack[] = []
    let trimmedCount = 0

    for (const track of anim.tracks) {
        const targetId = track.targetObjectId
        if (targetId === undefined || targetId === '_self') {
            // 无目标或自身引用 → 直接复制
            newTracks.push(deepCopyTrack(track))
        } else {
            const mappedId = idMap.get(targetId)
            if (mappedId !== undefined) {
                const newTrack = deepCopyTrack(track)
                newTrack.targetObjectId = mappedId
                newTracks.push(newTrack)
            } else {
                // 目标不可映射 → 移除此轨道
                trimmedCount++
            }
        }
    }

    if (newTracks.length === 0) {
        return null // 所有轨道都不可映射 → 跳过整个动画
    }

    return {
        animation: {
            ...JSON.parse(JSON.stringify(anim)) as TrackAnimationDefinition,
            id: newId,
            tracks: newTracks,
            createdAt: now,
            updatedAt: now,
        },
        trimmed: trimmedCount > 0,
    }
}



/** 深拷贝单个轨道 */
function deepCopyTrack(track: AnimationTrack): AnimationTrack {
    const copied = JSON.parse(JSON.stringify(track)) as AnimationTrack
    // 跨人物导入时，transform track 的 pivot 是源对象本地像素坐标。
    // 新人物的部件尺寸/局部坐标往往不同，保留会导致旋转/缩放轴心错误；
    // 清除后运行时回退到目标对象自己的默认变换点。
    if (copied.trackType === 'transform') {
        delete copied.pivot
    }
    return copied
}

/**
 * 执行人物间结构/动画同步复制（主流程）
 *
 * 坐标处理策略（保持目标人物各部位画布位置不变）：
 * 1. 拍扁阶段：将目标叶节点的局部坐标转为全局坐标
 * 2. 骨架复制：复制源的 composite 层级结构（不复制坐标）
 * 3. 重建阶段：自底向上计算 composite 质心位置，将子对象全局坐标转为局部坐标
 *
 * @param sourceObjects 源人物的 objects 列表
 * @param targetObjects 目标人物的 objects 列表
 * @returns 同步结果（包含重组后的对象列表）
 */
export function syncCharacterStructure(
    sourceObjects: readonly SceneObject[],
    targetObjects: readonly SceneObject[],
): CharacterSyncResult {
    // Step 1: 名称匹配
    const matchResult = buildNameMatch(sourceObjects, targetObjects)

    // Step 2: 拍扁目标 → 叶节点池（按 alias 索引），坐标转为全局
    const targetLeafPool = collectLeafNodes(targetObjects)
    const targetObjMap = new Map<string, SceneObject>()
    for (const obj of targetObjects) {
        targetObjMap.set(obj.id, obj)
    }

    // 将所有叶节点坐标转为全局坐标
    const worldCoords = new Map<string, { x: number; y: number; scaleX: number; scaleY: number; rotation: number }>()
    for (const [alias, leaf] of targetLeafPool) {
        const world = computeWorldTransform(leaf, targetObjMap)
        worldCoords.set(alias, world)
    }

    // Step 3: 复制源的 composite 骨架（不复制坐标，坐标后面自底向上计算）
    const sourceComposites = collectCompositeNodes(sourceObjects)
    const newComposites: CompositeObject[] = []

    for (const sourceComp of sourceComposites) {
        const newId = matchResult.compositeIdMap.get(sourceComp.id)
        if (newId === undefined) {
            throw new Error(`[characterSyncUtils] composite ID ${sourceComp.id} 未在映射中找到`)
        }

        // 深拷贝 composite，替换 ID
        const newComp = JSON.parse(JSON.stringify(sourceComp)) as CompositeObject

        newComp.id = newId

        // 坐标先清零（后面自底向上重算）
        newComp.x = 0
        newComp.y = 0
        newComp.scaleX = 1
        newComp.scaleY = 1
        newComp.rotation = 0

        // 替换 parentId
        if (newComp.parentId) {
            const mappedParent = matchResult.fullIdMap.get(newComp.parentId)
            if (mappedParent !== undefined) {
                newComp.parentId = mappedParent
            } else {
                // 父级不可映射 → 清除 parentId（变成顶层）
                delete newComp.parentId
            }
        }

        // 替换 childIds — 只保留可映射的
        newComp.childIds = sourceComp.childIds
            .map(childId => matchResult.fullIdMap.get(childId))
            .filter((id): id is string => id !== undefined)

        // 替换 renderChain
        if (sourceComp.renderChain) {
            newComp.renderChain = sourceComp.renderChain
                .map(id => matchResult.fullIdMap.get(id))
                .filter((id): id is string => id !== undefined)
        }

        // 清除源 composite 上的动画（后面统一复制重映射后的）
        delete newComp.animations

        newComposites.push(newComp)
    }

    // Step 4: 将匹配成功的叶节点填入新骨架（使用全局坐标）
    const sourceLeaves = collectLeafNodes(sourceObjects)
    const placedLeaves: SceneObject[] = []
    const placedLeafAliases = new Set<string>()

    for (const [alias, sourceLeaf] of sourceLeaves) {
        const targetLeaf = targetLeafPool.get(alias)
        if (!targetLeaf) continue // sourceOnly → 跳过

        // 深拷贝目标叶节点（保留素材等数据）
        const newLeaf = JSON.parse(JSON.stringify(targetLeaf)) as SceneObject

        // 先写入全局坐标（后面自底向上时再转局部）
        const world = worldCoords.get(alias)
        if (world) {
            newLeaf.x = world.x
            newLeaf.y = world.y
            newLeaf.scaleX = world.scaleX
            newLeaf.scaleY = world.scaleY
            newLeaf.rotation = world.rotation
        }

        // 更新 parentId 为重组后的父级
        if (sourceLeaf.parentId) {
            const mappedParent = matchResult.fullIdMap.get(sourceLeaf.parentId)
            if (mappedParent !== undefined) {
                newLeaf.parentId = mappedParent
            } else {
                delete newLeaf.parentId
            }
        } else {
            delete newLeaf.parentId
        }

        placedLeaves.push(newLeaf)
        placedLeafAliases.add(alias)
    }

    // Step 5: 复制源 composite 节点上的动画（带 ID 重映射）
    const allSkipped: string[] = []
    const allTrimmed: string[] = []

    for (const sourceComp of sourceComposites) {
        if (!sourceComp.animations || Object.keys(sourceComp.animations).length === 0) continue

        const newCompId = matchResult.compositeIdMap.get(sourceComp.id)
        if (newCompId === undefined) continue

        const targetComp = newComposites.find(c => c.id === newCompId)
        if (!targetComp) continue

        const { remapped, skipped, trimmed } = remapAnimationDefinitions(
            sourceComp.animations,
            matchResult.fullIdMap,
        )

        targetComp.animations = remapped
        allSkipped.push(...skipped)
        allTrimmed.push(...trimmed)
    }

    // Step 6: 处理仅目标有的叶节点 → 追加到 root composite
    const targetOnlyLeaves: SceneObject[] = []
    for (const alias of matchResult.targetOnly) {
        const leaf = targetLeafPool.get(alias)
        if (!leaf) continue

        const newLeaf = JSON.parse(JSON.stringify(leaf)) as SceneObject

        // 写入全局坐标
        const world = worldCoords.get(alias)
        if (world) {
            newLeaf.x = world.x
            newLeaf.y = world.y
            newLeaf.scaleX = world.scaleX
            newLeaf.scaleY = world.scaleY
            newLeaf.rotation = world.rotation
        }

        targetOnlyLeaves.push(newLeaf)
    }

    // 找到 root composite（无 parentId 的 composite）
    const rootComposite = newComposites.find(c => !c.parentId)
    if (rootComposite && targetOnlyLeaves.length > 0) {
        // 追加到 root composite 的 childIds 和 renderChain 末尾（保持单根）
        for (const leaf of targetOnlyLeaves) {
            leaf.parentId = rootComposite.id
            rootComposite.childIds.push(leaf.id)
            if (rootComposite.renderChain) {
                rootComposite.renderChain.push(leaf.id)
            }
        }
    } else if (targetOnlyLeaves.length > 0) {
        // 源本身是多根 → targetOnly 叶节点也作为顶层
        for (const leaf of targetOnlyLeaves) {
            delete leaf.parentId
        }
    }

    // Step 7: 自底向上坐标转换 —— 计算 composite 质心位置，子对象全局→局部
    // 构建 id→object 索引
    const allObjects = [...newComposites, ...placedLeaves, ...targetOnlyLeaves]
    const objIndex = new Map<string, SceneObject>()
    for (const obj of allObjects) {
        objIndex.set(obj.id, obj)
    }

    // 拓扑排序（自底向上）：叶节点和无子 composite 先处理
    const sortedComposites = topologicalSortBottomUp(newComposites)

    for (const comp of sortedComposites) {
        // 收集直接子对象（此时子对象坐标已经是全局坐标）
        const children: SceneObject[] = []
        for (const childId of comp.childIds) {
            const child = objIndex.get(childId)
            if (child) children.push(child)
        }

        if (children.length === 0) continue

        // 计算 composite 位置 = 子对象全局坐标的质心
        let sumX = 0
        let sumY = 0
        for (const child of children) {
            sumX += child.x
            sumY += child.y
        }
        comp.x = sumX / children.length
        comp.y = sumY / children.length
        // composite 自身 scale/rotation 保持 1/0（纯结构容器）

        // 将子对象的全局坐标转为相对于 composite 的局部坐标
        for (const child of children) {
            child.x -= comp.x
            child.y -= comp.y
            // scale/rotation 不变（composite 是 scale=1, rotation=0 的纯容器）
        }
    }

    // Step 8: 组装最终对象列表
    // 顺序：composites 在前，叶节点在后（与人物数据存储惯例一致）
    const finalObjects: SceneObject[] = [
        ...newComposites,
        ...placedLeaves,
        ...targetOnlyLeaves,
    ]

    return {
        objects: finalObjects,
        matchResult,
        skippedAnimations: allSkipped,
        trimmedAnimations: allTrimmed,
    }
}

/**
 * 计算对象的全局变换（沿 parentId 链向上累积）
 */
function computeWorldTransform(
    obj: SceneObject,
    objMap: Map<string, SceneObject>,
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number } {
    // 收集从子到根的父级链
    const chain: SceneObject[] = []
    let current: SceneObject | undefined = obj
    while (current) {
        chain.push(current)
        current = current.parentId ? objMap.get(current.parentId) : undefined
    }

    // 从根到子累积变换
    // chain[chain.length-1] 是根（无 parent），chain[0] 是目标对象
    let worldX = 0
    let worldY = 0
    let worldScaleX = 1
    let worldScaleY = 1
    let worldRotation = 0

    // 从根到叶遍历
    for (let i = chain.length - 1; i >= 0; i--) {
        const node = chain[i]!
        // localToGlobal: globalPos = parentPos + rotate(parentRot, scale(parentScale, localPos))
        const sx = node.x * worldScaleX
        const sy = node.y * worldScaleY

        const cosR = Math.cos(worldRotation)
        const sinR = Math.sin(worldRotation)

        worldX += sx * cosR - sy * sinR
        worldY += sx * sinR + sy * cosR

        worldScaleX *= node.scaleX
        worldScaleY *= node.scaleY
        worldRotation += node.rotation
    }

    return { x: worldX, y: worldY, scaleX: worldScaleX, scaleY: worldScaleY, rotation: worldRotation }
}

/**
 * 将 composite 列表按拓扑排序（自底向上）
 * 叶级 composite（无子 composite）排在前面，根级排在后面
 */
function topologicalSortBottomUp(composites: CompositeObject[]): CompositeObject[] {
    const idSet = new Set(composites.map(c => c.id))
    const childCompositeCount = new Map<string, number>()

    // 统计每个 composite 有多少个子 composite（排除叶节点）
    for (const comp of composites) {
        let count = 0
        for (const childId of comp.childIds) {
            if (idSet.has(childId)) count++
        }
        childCompositeCount.set(comp.id, count)
    }

    const result: CompositeObject[] = []
    const processed = new Set<string>()

    // BFS：从叶级开始
    const queue = composites.filter(c => childCompositeCount.get(c.id) === 0)

    while (queue.length > 0) {
        const comp = queue.shift()!
        if (processed.has(comp.id)) continue
        processed.add(comp.id)
        result.push(comp)

        // 更新父级的计数
        if (comp.parentId && idSet.has(comp.parentId)) {
            const parentCount = (childCompositeCount.get(comp.parentId) ?? 1) - 1
            childCompositeCount.set(comp.parentId, parentCount)
            if (parentCount === 0) {
                const parent = composites.find(c => c.id === comp.parentId)
                if (parent) queue.push(parent)
            }
        }
    }

    return result
}
