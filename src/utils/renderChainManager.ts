/**
 * RenderChain Manager — 统一管理场景渲染链和 entity 渲染链
 *
 * v19 重构：将散布在 addObject / removeObject / dissolveComposite 中的
 * renderChain 逻辑收敛到此模块，遵循 OOP 封装原则。
 *
 * 三种所有者的 renderChain 需求：
 * - Scene (sceneRenderChain): 根级对象 ID 列表，union 展开、entity 作为单节点
 * - Entity composite (renderChain): entity 下所有可渲染对象 ID（union 展开平铺）
 * - Union composite: 无自有 renderChain — 子对象透传到上级 entity 或 sceneRenderChain
 */

import type { CompositeObject, SceneObject } from '@/types/sceneObject'
import { findInsertPosition, removeFromRenderChain } from '@/utils/renderChainUtils'

function participatesInRenderChain(object: SceneObject): boolean {
  return object.type !== 'camera' && object.type !== 'audio' && object.type !== 'light'
}

// ==================== 类型定义 ====================

/**
 * RenderChainManager 所需的最小 Store 依赖
 * 通过接口注入避免循环引用
 */
export interface RenderChainStoreAccessor {
  getObject(id: string): SceneObject | undefined
  getSceneRenderChain(): string[]
}

// ==================== 核心操作 ====================

/**
 * 对象被添加后，自动维护所属 renderChain。
 *
 * 规则：
 * 1. Entity composite → 初始化空 renderChain（构造保证）
 * 2. Union composite → 不加入任何 renderChain
 * 3. 子对象 → 沿 parentId 链穿透 union，追加到最近 entity 的 renderChain
 * 4. 根级对象（无 parentId）→ 追加到 sceneRenderChain（按 zIndex 插入）
 */
export function onObjectAdded(
    object: SceneObject,
    store: RenderChainStoreAccessor,
): void {
  // 规则 1: Entity composite 构造保证 — 初始化空 renderChain
  if (object.type === 'composite' && (object as CompositeObject).compositeMode === 'entity') {
    if (!(object as CompositeObject).renderChain) {
      (object as CompositeObject).renderChain = []
    }
  }

  // 规则 2: Union composite 不加入任何 renderChain（透传容器）
  const isUnion = object.type === 'composite' && (object as CompositeObject).compositeMode === 'union'

  // 规则 3: 子对象追加到所属 entity 的 renderChain（穿透 union 链）
  if (object.parentId && !isUnion && participatesInRenderChain(object)) {
    let currentParentId: string | undefined = object.parentId
    while (currentParentId) {
      const parent = store.getObject(currentParentId)
      if (parent?.type !== 'composite') break
      const parentComp = parent as CompositeObject
      if (parentComp.compositeMode === 'entity') {
        if (parentComp.renderChain && !parentComp.renderChain.includes(object.id)) {
          parentComp.renderChain.push(object.id)
        }
        break
      }
      // union → 继续沿链向上
      currentParentId = parentComp.parentId
    }
  }

  // 规则 4: 根级对象追加到 sceneRenderChain
  if (!object.parentId && !isUnion) {
    if (participatesInRenderChain(object)) {
      const chain = store.getSceneRenderChain()
      const pos = findInsertPosition(chain, object.zIndex, store.getObject.bind(store))
      chain.splice(pos, 0, object.id)
    }
  }
}

/**
 * 对象被移除后，自动从所属 renderChain 中清除。
 *
 * 同时处理：
 * - 从父 entity 的 renderChain 中移除
 * - 从 sceneRenderChain 中移除
 */
export function onObjectRemoved(
    objectId: string,
    object: SceneObject,
    store: RenderChainStoreAccessor,
): void {
  // 从父 entity 的 renderChain 中移除
  if (object.parentId) {
    const parent = store.getObject(object.parentId)
    if (parent?.type === 'composite') {
      const compositeParent = parent as CompositeObject
      if (compositeParent.compositeMode === 'entity' && compositeParent.renderChain) {
        removeFromRenderChain(compositeParent.renderChain, objectId)
      }
    }
  }

  // 从 sceneRenderChain 中移除
  removeFromRenderChain(store.getSceneRenderChain(), objectId)
}

/**
 * Composite 解散时，将其渲染顺序转移到目标 renderChain。
 *
 * 效果：entity 在目标链中的位置被其子对象的有序展开"原地替换"。
 * （entity 自身 ID 在后续 removeObject 中被移除）
 *
 * @param compositeId 被解散的 composite ID
 * @param preservedRenderOrder 保存的渲染顺序（展开 union 后的有序 ID 列表）
 * @param bubbleTargetId 子对象冒泡到的目标：undefined = 根级，string = 上级 composite ID
 */
export function onCompositeDissolve(
    compositeId: string,
    preservedRenderOrder: string[],
    bubbleTargetId: string | undefined,
    store: RenderChainStoreAccessor,
): void {
  if (preservedRenderOrder.length === 0) return

  if (!bubbleTargetId) {
    // 冒泡到根级 → 插入 sceneRenderChain
    const chain = store.getSceneRenderChain()
    const entityPos = chain.indexOf(compositeId)
    if (entityPos !== -1) {
      chain.splice(entityPos + 1, 0, ...preservedRenderOrder)
    } else {
      chain.push(...preservedRenderOrder)
    }
  } else {
    // 冒泡到上级 entity → 插入上级 entity 的 renderChain
    const parentObj = store.getObject(bubbleTargetId)
    if (parentObj?.type === 'composite') {
      const parentComp = parentObj as CompositeObject
      if (parentComp.compositeMode === 'entity' && parentComp.renderChain) {
        const entityPos = parentComp.renderChain.indexOf(compositeId)
        if (entityPos !== -1) {
          parentComp.renderChain.splice(entityPos + 1, 0, ...preservedRenderOrder)
        } else {
          parentComp.renderChain.push(...preservedRenderOrder)
        }
      }
    }
  }
}

/**
 * 递归展开 childIds 中的 union 子对象（构建渲染顺序 fallback）
 * union 不出现在结果中，其子对象展开平铺
 */
export function expandChildIdsForRenderOrder(
    childIds: readonly string[],
    store: RenderChainStoreAccessor,
): string[] {
  const result: string[] = []
  for (const id of childIds) {
    const child = store.getObject(id)
    if (!child) continue
    if (child.type === 'composite' && (child as CompositeObject).compositeMode === 'union') {
      result.push(...expandChildIdsForRenderOrder((child as CompositeObject).childIds, store))
    } else {
      result.push(id)
    }
  }
  return result
}
