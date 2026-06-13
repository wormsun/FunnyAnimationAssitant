/**
 * Composite Object Container Factory & Lifecycle Hooks
 *
 * P2: 组合对象的 PIXI 容器创建 + 生命周期钩子。
 *
 * 容器工厂：创建一个父 PIXI.Container（sortableChildren = true），
 * 递归查找 childIds 对应的子对象，为每个子对象创建子容器并嵌套。
 *
 * 生命周期钩子：
 * - onBeforeDelete: 级联删除子对象
 * - onAfterDuplicate: 递归复制子对象，更新 childIds/parentId
 */

import * as PIXI from 'pixi.js'

import { registerContainerFactory, registerLifecycleHooks } from '@/core/sceneObjectProviders/index'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import {
    decomposeMatrixForState, invertMatrix, multiplyMatrix, resolveWorldMatrix,
} from '@/utils/actionHandlers/handlers/SetParentHandler'
import type { WriteableState } from '@/utils/actionHandlers/types'

/**
 * 注册 composite 类型的容器工厂 + 生命周期钩子
 *
 * @param getObjects 获取所有场景对象的回调（注入依赖，避免循环引用 Store）
 */
export function registerCompositeContainerFactory(
    _getObjects: () => SceneObject[],
): void {
    // v2.0.0: 容器工厂 — composite 只创建一个空的变换容器
    // 子对象的容器由 renderObjects 统一创建并挂载到此容器
    // sortableChildren = false: 渲染顺序由调用方手动控制（按 childIds 排列 + 显式排序）
    registerContainerFactory('composite', (_obj: SceneObject): Promise<PIXI.Container | null> => {
        const container = new PIXI.Container()
        container.name = `composite_${_obj.id}`
        container.sortableChildren = false

        // v20: union 容器不再设置 renderable=false。
        // 旧架构中子对象平铺到上级容器，union 本身不渲染所以设 renderable=false。
        // 新架构中子对象 addChild 到 union 容器内，renderable=false 会阻止整个子树渲染。
        // union 容器本身无可视内容（仅 Container），不会产生多余绘制。
        return Promise.resolve(container)
    })

    // 生命周期钩子（独立注册以便测试和 Store 调用）
    registerCompositeLifecycleHooks()
}

/**
 * 单独注册 composite 的生命周期钩子（无 PIXI 依赖）
 *
 * 可在 registerAll.ts 中直接调用，确保 Store 的 removeObject/duplicateObject
 * 在测试环境中也能正确分发到 composite 钩子。
 */
export function registerCompositeLifecycleHooks(): void {
    registerLifecycleHooks('composite', {
        /**
         * 删除前处理：根据 compositeMode 决定子对象命运
         * - entity: 级联删除所有子对象
         * - union: 子对象冒泡（清除 parentId，从 childIds 移除）
         */
        onBeforeDelete(obj, store) {
            const composite = obj as CompositeObject
            const childIds = [...(composite.childIds ?? [])]

            if (composite.compositeMode === 'union') {
                // union 模式：子对象冒泡，恢复为独立对象
                // 使用 resolveWorldMatrix 递归计算完整的坐标变换链（与 SetParentHandler 一致）
                const bubbleTargetId = composite.parentId
                const getObjectState = (id: string): WriteableState | undefined => {
                    const o = store.getObject(id)
                    return o ? ({ ...o } as WriteableState) : undefined
                }

                for (const childId of childIds) {
                    const child = store.getObject(childId)
                    if (child) {
                        const childState = { ...child } as WriteableState
                        // 递归计算子对象的世界坐标矩阵
                        const worldMatrix = resolveWorldMatrix(
                            childState, getObjectState
                        )

                        if (bubbleTargetId) {
                            // 有上级 parent → 转换到上级的本地坐标系
                            const parentState = getObjectState(bubbleTargetId)
                            if (parentState) {
                                const parentWorld = resolveWorldMatrix(parentState, getObjectState)
                                const localMatrix = multiplyMatrix(invertMatrix(parentWorld), worldMatrix)
                                const d = decomposeMatrixForState(localMatrix, childState)
                                store.updateObject(childId, {
                                    x: d.x, y: d.y,
                                    scaleX: Math.abs(d.scaleX), scaleY: d.scaleY,
                                    rotation: d.rotation, flipX: d.scaleX < 0,
                                    parentId: bubbleTargetId,
                                })
                            } else {
                                // 上级不存在，fallback 到世界坐标
                                const d = decomposeMatrixForState(worldMatrix, childState)
                                store.updateObject(childId, {
                                    x: d.x, y: d.y,
                                    scaleX: Math.abs(d.scaleX), scaleY: d.scaleY,
                                    rotation: d.rotation, flipX: d.scaleX < 0,
                                    parentId: bubbleTargetId ?? undefined,
                                })
                            }
                        } else {
                            // 无上级 parent → 使用世界坐标
                            const d = decomposeMatrixForState(worldMatrix, childState)
                            store.updateObject(childId, {
                                x: d.x, y: d.y,
                                scaleX: Math.abs(d.scaleX), scaleY: d.scaleY,
                                rotation: d.rotation, flipX: d.scaleX < 0,
                                parentId: undefined,
                            })
                        }
                    }
                    // 将冒泡子对象加入上级的 childIds
                    if (bubbleTargetId) {
                        const bubbleTarget = store.getObject(bubbleTargetId)
                        if (bubbleTarget?.type === 'composite') {
                            const targetChildIds = (bubbleTarget as CompositeObject).childIds
                            if (!targetChildIds.includes(childId)) {
                                targetChildIds.push(childId)
                            }
                        }
                    }
                }
                // 清空 childIds（避免 removeObject 再次处理）
                composite.childIds = []
            } else {
                // entity 模式：级联删除所有后代（深度优先）
                // 先递归收集所有后代 ID 并清空每个 composite 的 childIds，
                // 防止嵌套 union composite 的冒泡行为导致孤儿对象
                const allDescendantIds: string[] = []
                function collectDescendants(comp: CompositeObject) {
                    for (const cid of [...(comp.childIds ?? [])]) {
                        allDescendantIds.push(cid)
                        const child = store.getObject(cid)
                        if (child?.type === 'composite') {
                            collectDescendants(child as CompositeObject)
                            ;(child as CompositeObject).childIds = []
                        }
                    }
                    comp.childIds = []
                }
                collectDescendants(composite)

                for (const descId of allDescendantIds) {
                    store.removeObject(descId)
                }
            }
        },

        /**
         * 递归复制：为每个子对象创建副本，更新 childIds 和 parentId
         */
        onAfterDuplicate(original, duplicate, store) {
            const compositeOriginal = original as CompositeObject
            const newChildIds: string[] = []

            for (const childId of compositeOriginal.childIds ?? []) {
                const childDup = store.duplicateObject(childId)
                if (childDup) {
                    // 恢复位置（duplicateObject 默认 +50 偏移，子对象不应偏移）
                    const originalChild = store.getObject(childId)
                    if (originalChild) {
                        store.updateObject(childDup.id, {
                            x: originalChild.x,
                            y: originalChild.y,
                            parentId: duplicate.id,
                        })
                    }
                    newChildIds.push(childDup.id)
                }
            }

            // 直接修改 duplicate 的 childIds
            ; (duplicate as CompositeObject).childIds = newChildIds
        },
    })
}
