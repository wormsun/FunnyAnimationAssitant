/**
 * AnimationSceneObjectStore — 动画编辑专用隔离 store
 *
 * 实现 SceneObjectProvider 接口，从全局 sceneObjectStore 深拷贝目标对象及其子对象，
 * 提供完全独立的数据层。动画编辑期间的所有变换写入此 store，不影响全局状态。
 *
 * 用法:
 *   const animStore = createAnimationSceneObjectStore(objectIds, globalStore)
 *   const renderer = useSceneRenderer({ canvasContainer, storeOverride: animStore })
 */

import { computed, reactive, ref } from 'vue'

import type { CompositeObject, SceneObject, SceneObjectUpdateFor } from '@/types/sceneObject'
import type { SceneObjectProvider } from '@/types/SceneObjectProvider'
import { buildRenderChain } from '@/utils/renderChainUtils'

export interface AnimationSceneObjectStoreOptions {
  /** 需要包含的根对象 ID（composite 会自动收集所有后代） */
  rootObjectId: string
  /** 全局 store 引用（只读取一次进行深拷贝） */
  globalStore: {
    objects: SceneObject[]
    getObject(id: string): SceneObject | undefined
    getSceneRenderChain(): string[]
  }
  /** 预构建的对象列表（资源级预览，绕过从 globalStore 的拷贝） */
  prebuiltObjects?: SceneObject[]
  /** 与 prebuiltObjects 对应的场景级 renderChain；不传时退化为对象列表顺序 */
  prebuiltRenderChain?: string[]
}

export interface AnimationSceneObjectRuntimeStore extends SceneObjectProvider {
  replaceObjects(objects: SceneObject[], renderChain?: string[]): void
  cloneObjects(): SceneObject[]
}

/**
 * 创建一个隔离的动画编辑 store 实例。
 * 返回的对象是 reactive 的，可直接作为 SceneObjectProvider 传入 useSceneRenderer。
 */
export function createAnimationSceneObjectStore(
  options: AnimationSceneObjectStoreOptions
): AnimationSceneObjectRuntimeStore {
  const { rootObjectId, globalStore } = options

  let clonedObjects: SceneObject[]
  let clonedRenderChain: string[]

  if (options.prebuiltObjects) {
    // 资源级预览：直接使用预构建的对象
    clonedObjects = options.prebuiltObjects
    clonedRenderChain = options.prebuiltRenderChain
      ? [...options.prebuiltRenderChain]
      : options.prebuiltObjects.map(o => o.id)
  } else {
    // 场景级入口：从全局 store 深拷贝
    const idsToClone = new Set<string>()
    collectObjectAndDescendants(rootObjectId, globalStore, idsToClone)

    clonedObjects = []
    for (const id of idsToClone) {
      const obj = globalStore.getObject(id)
      if (obj) {
        clonedObjects.push(JSON.parse(JSON.stringify(obj)) as SceneObject)
      }
    }

    const globalRenderChain = globalStore.getSceneRenderChain()
    clonedRenderChain = globalRenderChain.filter(id => idsToClone.has(id))
    // 当 rootObjectId 是 composite 子对象（不在场景级 renderChain 中）时，
    // 上面的 filter 会过滤掉整个子树导致空渲染链、画面空白，需要兜底。
    if (clonedRenderChain.length === 0) {
      // 关键：让 rootObjectId 走"主画布工作路径" —— sortCompositeContainers
      // 只会对 compositeMode === 'entity' 的 composite 安装 installRenderChainRenderer，
      // 只有被安装的 composite 才会由 renderByRenderChain 显式调度其叶子。
      // 若 root 是 union，union 本身既不进场景链也不会安装自定义 render，
      // 依赖 PIXI 默认 Container.render 递归——目前这条路径会漏掉表情对象的渲染。
      //
      // 解决：将 root union 在隔离 store 中"虚拟提升"为 entity，
      // 并为它构造一个 renderChain。
      //
      // 关键：renderChain 的顺序必须与主画布一致！
      // 主画布中 head union 的 3 个子对象（expression + symB + symC）出现在
      // 根 entity 的 14-leaf renderChain 中的某个连续片段内，顺序已按 Z 关系正确排列。
      // 若直接用 buildRenderChain(clonedObjects, rootObjectId) 会按 zIndex 重新排序，
      // 可能导致 expression 被不透明的 symbol（face/hair）覆盖而不可见。
      // 正确做法是从全局链中**切片保留原顺序**。
      const rootObj = clonedObjects.find(o => o.id === rootObjectId)
      if (rootObj?.type === 'composite'
        && (rootObj as CompositeObject).compositeMode === 'union') {
        const rootComp = rootObj as CompositeObject
        const preservedChain = sliceGlobalRenderChainForSubtree(
          rootObjectId,
          idsToClone,
          globalStore,
        )
        rootComp.compositeMode = 'entity'
        rootComp.renderChain = preservedChain.length > 0
          ? preservedChain
          : buildRenderChain(clonedObjects, rootObjectId)
      }
      clonedRenderChain = [rootObjectId]
    }
  }

  // ---- Reactive state ----
  const objectsRef = ref<SceneObject[]>(clonedObjects)
  const selectedObjectId = ref<string | null>(null)

  const objects = computed(() => objectsRef.value)

  // ---- Methods ----

  function getObject(id: string): SceneObject | undefined {
    return objectsRef.value.find(o => o.id === id)
  }

  function isDescendantOf(objectId: string, ancestorId: string): boolean {
    let current = getObject(objectId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true
      current = getObject(current.parentId)
    }
    return false
  }

  function getSortedObjects(): SceneObject[] {
    // 按 renderChain 中出现的顺序排列
    const orderMap = new Map<string, number>()
    // 先处理场景级 renderChain
    clonedRenderChain.forEach((id, i) => orderMap.set(id, i))
    // 再处理 composite 内部的 renderChain
    for (const obj of objectsRef.value) {
      if (obj.type === 'composite') {
        const comp = obj as CompositeObject
        const chain = comp.renderChain ?? comp.childIds ?? []
        chain.forEach((id, i) => {
          if (!orderMap.has(id)) {
            orderMap.set(id, 1000 + i)
          }
        })
      }
    }

    return [...objectsRef.value].sort((a, b) => {
      const oa = orderMap.get(a.id) ?? 9999
      const ob = orderMap.get(b.id) ?? 9999
      return oa - ob
    })
  }

  function getSceneRenderChain(): string[] {
    return clonedRenderChain
  }

  function cloneObjects(): SceneObject[] {
    return JSON.parse(JSON.stringify(objectsRef.value)) as SceneObject[]
  }

  function replaceObjects(objects: SceneObject[], renderChain?: string[]): void {
    const selected = selectedObjectId.value
    objectsRef.value = JSON.parse(JSON.stringify(objects)) as SceneObject[]
    if (renderChain) {
      clonedRenderChain = [...renderChain]
    }
    if (selected && !objectsRef.value.some(obj => obj.id === selected)) {
      selectedObjectId.value = null
    } else if (selected) {
      selectObject(selected)
    }
  }

  function selectObject(id: string | null): void {
    for (const obj of objectsRef.value) {
      if (obj.type !== 'composite') continue
      const comp = obj as CompositeObject
      if (comp.compositeLocked) continue
      if (id === comp.id) continue
      if (id && isDescendantOf(id, comp.id)) continue
      updateObject(comp.id, { compositeLocked: true } as SceneObjectUpdateFor<CompositeObject>)
    }
    selectedObjectId.value = id
  }

  function updateObject<T extends SceneObject = SceneObject>(
    id: string,
    updates: SceneObjectUpdateFor<T>,
  ): void {
    const idx = objectsRef.value.findIndex(o => o.id === id)
    if (idx < 0) return

    const obj = objectsRef.value[idx]!
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        delete (obj as Record<string, unknown>)[key]
      } else {
        ;(obj as Record<string, unknown>)[key] = value
      }
    }
  }

  function updateSetupObject<T extends SceneObject = SceneObject>(
    id: string,
    updates: SceneObjectUpdateFor<T>,
  ): void {
    // 隔离 store 中 setupObject 和 object 等价
    updateObject(id, updates)
  }

  // ---- 构造 reactive 对象以确保 Vue watch 可追踪 ----
  const store: AnimationSceneObjectRuntimeStore = reactive({
    objects,
    selectedObjectId,
    getObject,
    getSortedObjects,
    getSceneRenderChain,
    replaceObjects,
    cloneObjects,
    selectObject,
    updateObject,
    updateSetupObject,
  }) as AnimationSceneObjectRuntimeStore

  return store
}

/**
 * 递归收集对象 ID 及其所有 composite 后代
 */
function collectObjectAndDescendants(
  objectId: string,
  globalStore: { getObject(id: string): SceneObject | undefined },
  collected: Set<string>,
): void {
  if (collected.has(objectId)) return
  collected.add(objectId)

  const obj = globalStore.getObject(objectId)
  if (!obj) return

  if (obj.type === 'composite') {
    const comp = obj as CompositeObject
    const childIds = comp.childIds ?? []
    for (const childId of childIds) {
      collectObjectAndDescendants(childId, globalStore, collected)
    }
  }
}

/**
 * 从全局 renderChain 中"切片"出 rootObjectId 子树下的叶子，保留原顺序。
 *
 * 动机：当 rootObjectId 是 union（不自带 renderChain）时，其可渲染后代的 Z 顺序
 * 记录在**最近一个祖先 entity** 的 renderChain 中（union 的叶子被展开进祖先链）。
 * 动画编辑面板要保持与主画布一致的覆盖关系，必须沿用这个顺序，而不是按 zIndex 重排。
 *
 * 查找策略：向上走到第一个携带非空 renderChain 的祖先 entity；若找不到，
 * 则回退到场景级 renderChain（某些顶层 entity 的情形）。
 *
 * @returns 属于 idsToClone 且在 rootObjectId 子树内的叶子 ID，保持原顺序。
 */
function sliceGlobalRenderChainForSubtree(
  rootObjectId: string,
  idsToClone: Set<string>,
  globalStore: {
    getObject(id: string): SceneObject | undefined
    getSceneRenderChain(): string[]
  },
): string[] {
  // 1. 向上找到第一个带非空 renderChain 的祖先 entity
  let chainSource: readonly string[] | null = null
  let cursor = globalStore.getObject(rootObjectId)?.parentId
  while (cursor) {
    const anc = globalStore.getObject(cursor)
    if (!anc) break
    if (anc.type === 'composite') {
      const ac = anc as CompositeObject
      if (ac.compositeMode === 'entity' && ac.renderChain && ac.renderChain.length > 0) {
        chainSource = ac.renderChain
        break
      }
    }
    cursor = anc.parentId
  }
  // 回退：场景级 renderChain
    chainSource ??= globalStore.getSceneRenderChain()

  // 2. 过滤保留：在 idsToClone 中、非 rootObjectId 本身、且确为子树成员的 ID
  return chainSource.filter(id =>
    idsToClone.has(id) && id !== rootObjectId,
  )
}
