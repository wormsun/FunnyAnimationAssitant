/**
 * 场景模板引擎
 * v17: 多根平坦列表 — 快照（画布 → 模板）与实例化（模板 → 画布）
 */

import type { CompositeObject, MaskObject, SceneObject, ScreenEffectObject } from '@/types/sceneObject'
import type { SceneTemplate } from '@/types/sceneTemplate'

/**
 * 生成唯一 ID（与 Store 中的 ID 生成规则一致）
 */
function generateObjectId(): string {
    return `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 深克隆场景对象，移除运行时字段和架构内部状态
 *
 * 清除规则：
 * - `_` 前缀字段：PIXI 运行时状态（如 _runtimeUrl）
 * - `spawned`：双层架构内部标记（Setup/Action 生命周期状态），
 *   模板是自包含的可复用对象集合，所有对象天然"存活"，
 *   此字段不应泄漏到模板数据中。
 */
function cloneObjectClean(obj: SceneObject): SceneObject {
    // 使用 JSON 序列化实现深克隆（自动跳过 undefined 值，兼容 exactOptionalPropertyTypes）
    const raw = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
    // 移除运行时字段
    for (const key of Object.keys(raw)) {
        if (key.startsWith('_')) {
            delete raw[key]
        }
    }
    // 移除架构内部状态
    delete raw['spawned']

    // v19 修复：强制规范组合对象的锁定状态
    // 若入库或反序列化时携带了未被剔除的 compositeLocked: false，会污染再次引入的实例化状态
    if (raw['type'] === 'composite') {
        raw['compositeLocked'] = true
    }

    return raw as unknown as SceneObject
}

/**
 * 递归收集组合对象的所有子对象（含嵌套组合）
 *
 * @param rootId 根组合对象 ID
 * @param allObjects 当前场景的所有对象
 * @returns 按拓扑顺序排列的子对象数组（父对象在前）
 */
function collectChildObjects(rootId: string, allObjects: SceneObject[]): SceneObject[] {
    const result: SceneObject[] = []
    const visited = new Set<string>()

    function collect(parentId: string): void {
        const composite = allObjects.find(o => o.id === parentId)
        if (composite?.type !== 'composite') return

        const comp = composite as CompositeObject
        for (const childId of comp.childIds) {
            if (visited.has(childId)) continue
            visited.add(childId)

            const child = allObjects.find(o => o.id === childId)
            if (!child) continue

            result.push(child)
            // 递归嵌套组合
            if (child.type === 'composite') {
                collect(child.id)
            }
        }
    }

    collect(rootId)
    return result
}

/**
 * v17: 重映射对象上动画定义中的 objectId 引用
 * - track 类型：各轨道的 targetObjectId
 * '_self' 保持不变，具体 UUID 通过 idMap 重映射
 */
function remapAnimationObjectIds(obj: SceneObject, idMap: Map<string, string>): void {
    const animations = obj.animations
    if (!animations) return
    for (const anim of Object.values(animations)) {
        if (anim.type === 'track') {
            // v19 Fix: track 动画中的 targetObjectId 也需要重映射
            for (const track of anim.tracks) {
                if (track.targetObjectId && track.targetObjectId !== '_self' && idMap.has(track.targetObjectId)) {
                    (track as { targetObjectId: string }).targetObjectId = idMap.get(track.targetObjectId)!
                }
            }
        }
    }
}

function remapSceneObjectInternalRefs(obj: SceneObject, idMap: Map<string, string>): void {
    if (obj.type === 'mask') {
        const mask = obj as MaskObject
        mask.targetIds = (mask.targetIds ?? []).map(id => idMap.get(id) ?? id)
    }

    if (obj.type === 'screen_effect') {
        const effect = obj as ScreenEffectObject
        if (effect.params?.targetId && idMap.has(effect.params.targetId)) {
            effect.params = {
                ...effect.params,
                targetId: idMap.get(effect.params.targetId)!,
            }
        }
    }

    if (obj.type === 'composite') {
        const comp = obj as CompositeObject
        if (comp.instanceRootCompositeId && idMap.has(comp.instanceRootCompositeId)) {
            comp.instanceRootCompositeId = idMap.get(comp.instanceRootCompositeId)!
        }
    }
}

/**
 * 计算对象集合的几何包围盒中心
 */
function computeBoundingBoxCenter(objects: SceneObject[]): { cx: number; cy: number } {
    if (objects.length === 0) return { cx: 0, cy: 0 }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const obj of objects) {
        // 使用视觉边界：中心点 ± 半宽/半高（考虑缩放）
        const halfW = (obj.width * Math.abs(obj.scaleX ?? 1)) / 2
        const halfH = (obj.height * Math.abs(obj.scaleY ?? 1)) / 2
        const left = obj.x - halfW
        const right = obj.x + halfW
        const top = obj.y - halfH
        const bottom = obj.y + halfH
        if (left < minX) minX = left
        if (top < minY) minY = top
        if (right > maxX) maxX = right
        if (bottom > maxY) maxY = bottom
    }

    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

// ===== 快照（保存为模板）=====

/**
 * 从场景中的选中对象创建场景模板快照
 *
 * v17: 支持多根 — 接收多个顶层对象，递归收集子对象，去重合并为平坦列表。
 * 坐标以包围盒中心归零。
 *
 * @param selectedObjects 选中的顶层对象列表
 * @param allSceneObjects 当前场景的所有对象（用于递归收集 composite 子对象）
 * @param name 模板名称
 * @param tags 标签列表
 * @returns 场景模板
 */
export function snapshotToTemplate(
    selectedObjects: SceneObject[],
    allSceneObjects: SceneObject[],
    name: string,
    tags?: string[],
    renderChain?: string[],
): SceneTemplate {
    // 1. 收集所有需要包含的对象（选中对象 + 递归子对象），去重
    const collectedIds = new Set<string>()
    const allCollected: SceneObject[] = []

    for (const obj of selectedObjects) {
        if (collectedIds.has(obj.id)) continue
        collectedIds.add(obj.id)
        allCollected.push(obj)

        // 递归收集 composite/symbol 子对象
        if (obj.type === 'composite') {
            const children = collectChildObjects(obj.id, allSceneObjects)
            for (const child of children) {
                if (!collectedIds.has(child.id)) {
                    collectedIds.add(child.id)
                    allCollected.push(child)
                }
            }
        }
    }

    // 2. 深克隆所有对象
    const clonedObjects = allCollected.map(obj => cloneObjectClean(obj))

    // 3. 坐标标准化：以**顶层对象**的包围盒中心归零
    // 关键：composite 子对象使用局部坐标（相对于父对象），不参与包围盒计算，也不做偏移
    const selectedIds = new Set(selectedObjects.map(o => o.id))
    const topLevelCloned = clonedObjects.filter(o => selectedIds.has(o.id))
    const { cx, cy } = computeBoundingBoxCenter(topLevelCloned)
    for (const obj of topLevelCloned) {
        obj.x -= cx
        obj.y -= cy
    }

    // 4. 清除顶层对象的 parentId（模板是独立的可复用单元）
    for (const obj of clonedObjects) {
        if (selectedIds.has(obj.id)) {
            // 如果被保存的对象是某个 composite 的子对象，其 parentId 不应泄漏到模板中
            delete (obj as unknown as Record<string, unknown>)['parentId']
        }
    }

    // 5. 生成模板 ID
    const templateId = `stpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const result: SceneTemplate = {
        id: templateId,
        name,
        createdAt: Date.now(),
        objects: clonedObjects,
        editorAnchor: { x: cx, y: cy },
    }

    // v19: 保存场景级渲染链（从调用方传入）
    if (renderChain && renderChain.length > 0) {
        const templateObjIds = new Set(clonedObjects.map(o => o.id))
        const filteredChain = renderChain.filter(id => templateObjIds.has(id))
        if (filteredChain.length > 0) {
            result.renderChain = filteredChain
        }
    }

    if (tags && tags.length > 0) {
        result.tags = tags
    }
    return result
}

/**
 * 从画布对象集合构建模板（整体快照）
 *
 * v17: 无需自动包装 composite，直接将所有顶层对象保存为模板。
 *
 * @param objects 画布上的对象（已排除 camera）
 * @param allObjects 所有场景对象（包括 camera，用于 composite 子对象递归）
 * @param name 模板名称
 * @param tags 标签列表
 * @returns 场景模板
 */
export function buildTemplateFromObjects(
    objects: SceneObject[],
    allObjects: SceneObject[],
    name: string,
    tags?: string[],
    renderChain?: string[],
): SceneTemplate {
    // 空模板
    if (objects.length === 0) {
        const templateId = `stpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const result: SceneTemplate = {
            id: templateId,
            name,
            createdAt: Date.now(),
            objects: [],
        }
        if (tags && tags.length > 0) {
            result.tags = tags
        }
        return result
    }

    // 找出顶层对象（没有 parentId 或 parentId 指向的对象不在列表中）
    const objectIds = new Set(objects.map(o => o.id))
    const topLevelObjects = objects.filter(o => !o.parentId || !objectIds.has(o.parentId))

    // 直接使用 snapshotToTemplate —— 不再自动包装 composite
    return snapshotToTemplate(topLevelObjects, allObjects, name, tags, renderChain)
}

// ===== 实例化（从模板创建对象）=====

/** 实例化结果 */
export interface InstantiateResult {
    /** 按拓扑顺序排列的对象数组（先根后子） */
    objects: SceneObject[]
    /** 缺失的资源 refId 列表（依赖校验未通过） */
    missingRefs: string[]
    /** v19: 重映射后的场景级渲染链（仅当不装 wrapper 时有效） */
    renderChain?: string[]
    /** 模板对象 ID → 场景实例对象 ID 的映射表 */
    idMap: Map<string, string>
}

/**
 * 检查 refId 引用的资源是否存在
 *
 * @param refId 资源引用 ID
 * @param type 对象类型
 * @param resourceChecker 资源存在性检查函数
 * @returns 资源是否存在
 */
type ResourceChecker = (type: string, refId: string) => boolean

/**
 * 从场景模板实例化场景对象
 *
 * v17: 遍历 template.objects 平坦列表，为每个对象生成新 ID 并重映射引用。
 * 当 autoWrapComposite 为 true 且顶层对象 > 1 时，自动创建 union composite 包装。
 *
 * @param template 场景模板
 * @param dropX 放置目标 X 坐标
 * @param dropY 放置目标 Y 坐标
 * @param options 实例化选项
 * @returns 实例化结果
 */
export function instantiateTemplate(
    template: SceneTemplate,
    dropX: number,
    dropY: number,
    options?: {
        /** 资源存在性检查函数（不提供则跳过校验） */
        resourceChecker?: ResourceChecker
        /** 多根模板是否自动包装 union composite（默认 true） */
        autoWrapComposite?: boolean
        /** 外围包装组合对象的模式（默认 'union'） */
        wrapperCompositeMode?: 'union' | 'entity'
    },
): InstantiateResult {
    const resourceChecker = options?.resourceChecker
    const autoWrapComposite = options?.autoWrapComposite ?? true

    // 空模板
    if (template.objects.length === 0) {
        return { objects: [], missingRefs: [], idMap: new Map() }
    }

    // 1. ID 重映射表：旧 ID → 新 ID
    const idMap = new Map<string, string>()
    for (const obj of template.objects) {
        idMap.set(obj.id, generateObjectId())
    }

    // 2. 深克隆并重映射
    const objects: SceneObject[] = []
    const missingRefs: string[] = []

    for (const obj of template.objects) {
        const cloned = cloneObjectClean(obj)
        const newId = idMap.get(obj.id)
        if (!newId) {
            throw new Error(`[sceneTemplateEngine] 内部错误：对象 ${obj.id} 未在 ID 映射表中`)
        }
        cloned.id = newId

        // 坐标还原：只对顶层对象（无 parentId）应用放置点偏移
        // composite 子对象使用局部坐标，不应叠加 dropX/dropY
        if (!cloned.parentId) {
            cloned.x += dropX
            cloned.y += dropY
        }

        // 重映射 parentId
        if (cloned.parentId) {
            cloned.parentId = idMap.get(cloned.parentId) ?? cloned.parentId
        }

        // 重映射 childIds 和 renderChain（如果是 Composite）
        if (cloned.type === 'composite') {
            const comp = cloned as CompositeObject
            comp.childIds = comp.childIds.map(oldId => idMap.get(oldId) ?? oldId)
            // v19: entity 的 renderChain 也需要重映射
            if (comp.renderChain) {
                comp.renderChain = comp.renderChain.map(oldId => idMap.get(oldId) ?? oldId)
            }
        }

        // v17: 重映射动画定义中的 objectId
        remapAnimationObjectIds(cloned, idMap)

        // v26: 重映射对象字段中指向模板内部对象的引用
        remapSceneObjectInternalRefs(cloned, idMap)

        // 依赖校验
        if (resourceChecker && cloned.refId) {
            if (!resourceChecker(cloned.type, cloned.refId)) {
                missingRefs.push(cloned.refId)
            }
        }

        objects.push(cloned)
    }

    // v19: 重映射模板的场景级 renderChain
    let remappedRenderChain: string[] | undefined
    if (template.renderChain && template.renderChain.length > 0) {
        remappedRenderChain = template.renderChain
            .map(oldId => idMap.get(oldId))
            .filter((id): id is string => id !== undefined)
    }

    // 3. 自动包装：顶层对象 > 1 时 或 单根为 union composite 时 创建 entity composite 包装
    if (autoWrapComposite) {
        const topLevelObjects = objects.filter(o => !o.parentId)
        const singleUnionRoot = topLevelObjects.length === 1
            && topLevelObjects[0]!.type === 'composite'
            && (topLevelObjects[0] as CompositeObject).compositeMode === 'union'
        if (topLevelObjects.length > 1 || singleUnionRoot) {
            const wrapperComposite: CompositeObject = {
                id: generateObjectId(),
                type: 'composite',
                name: template.name,
                alias: template.name,
                refId: '',
                x: dropX,
                y: dropY,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                alpha: 1,
                flipX: false,
                visible: true,
                zIndex: 0,
                childIds: topLevelObjects.map(o => o.id),
                compositeLocked: true,
                // 包裹层固定为 entity 模式（确保生命周期级联）
                compositeMode: 'entity',
            }

            // v19: entity wrapper 设置 renderChain（从模板的场景级 renderChain 转换而来）
            if (remappedRenderChain && remappedRenderChain.length > 0) {
                wrapperComposite.renderChain = remappedRenderChain
            }

            // 设置所有顶层对象的 parentId，并转换为局部坐标
            // composite 的 scale=1, rotation=0，简化为减去 composite 位置
            for (const obj of topLevelObjects) {
                obj.parentId = wrapperComposite.id
                obj.x -= wrapperComposite.x
                obj.y -= wrapperComposite.y
            }

            // 将 wrapper 插到首位（先根后子的拓扑顺序）
            objects.unshift(wrapperComposite)
        }
    }

    const result: InstantiateResult = { objects, missingRefs, idMap }
    if (remappedRenderChain) {
        result.renderChain = remappedRenderChain
    }
    return result
}

/**
 * 生成别名（避免重名）
 *
 * @param baseName 基础名称
 * @param existingAliases 已有的别名列表
 * @returns 唯一的别名
 */
export function generateUniqueAlias(baseName: string, existingAliases: string[]): string {
    if (!existingAliases.includes(baseName)) return baseName

    for (let i = 1; i <= 999; i++) {
        const candidate = `${baseName}${i}`
        if (!existingAliases.includes(candidate)) return candidate
    }

    return `${baseName}_${Date.now()}`
}

// ===== 缩略图生成 =====

/**
 * v16: 从 PIXI 渲染器生成模板缩略图
 *
 * @param pixiApp PIXI.Application 实例
 * @param maxSize 缩略图最大尺寸（默认 256px）
 * @returns base64 data URL（image/png）
 */
export function generateTemplateThumbnail(
    pixiApp: { renderer: { extract: { canvas: (target: unknown) => HTMLCanvasElement } }; stage: unknown },
    maxSize = 256,
): string {
    // 从 PIXI stage 截取画面
    const canvas = pixiApp.renderer.extract.canvas(pixiApp.stage)

    // 缩放到指定最大尺寸
    const thumbCanvas = document.createElement('canvas')
    const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1)
    thumbCanvas.width = Math.round(canvas.width * scale)
    thumbCanvas.height = Math.round(canvas.height * scale)

    const ctx = thumbCanvas.getContext('2d')
    if (!ctx) {
        throw new Error('[sceneTemplateEngine] 无法创建 2D Canvas Context')
    }
    ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)

    return thumbCanvas.toDataURL('image/png')
}
