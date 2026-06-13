/**
 * WorkbenchPreviewStore — 动画工作台预览 store 的窄接口
 *
 * 背景：
 *   LightweightCanvas 内部使用 createAnimationSceneObjectStore() 构造一份
 *   实现 SceneObjectProvider 完整接口的隔离 store，用于预览期间的对象读写，
 *   避免污染全局 sceneObjectStore。
 *
 * 为什么需要窄接口：
 *   AnimationWorkbench.vue 作为消费方只需要 5 种能力：读所有对象、读选中对象 ID、
 *   按 ID 取对象、写对象、设置选中。其它（getSortedObjects / getSceneRenderChain
 *   / updateSetupObject 等）完全不在工作台的职责范围内。把完整的 SceneObjectProvider
 *   暴露出去，会：
 *     1) 让未来的代码随手调用与工作台无关的方法，拉宽耦合；
 *     2) 让读者无法一眼看清"工作台到底依赖 store 的哪几项能力"。
 *
 *   本接口把预览 store 在"工作台视角"的最小可用面固化下来，既保留了必要的读写能力，
 *   又避免了公开不必要的实现细节。
 *
 * 不变性：
 *   接口的底层实例仍是同一份 AnimationSceneObjectStore 返回值（reactive 对象）。
 *   `objects` / `selectedObjectId` 继续是响应式引用，模板和 computed 里直接访问即可。
 *   本模块只做类型收窄，没有新增运行时包装。
 */

import type { SceneObject, SceneObjectUpdateFor } from '@/types/sceneObject'

export interface WorkbenchPreviewStore {
    /**
     * 当前隔离 store 中的全部对象（响应式数组）。
     * 注意：类型上保持可变，是为了兼容下游 KeyframePropertyPanel 等现有组件的 prop 签名；
     * 工作台自身不应直接 push/splice 这个数组——改写请走 updateObject / selectObject 等方法。
     */
    readonly objects: SceneObject[]
    /** 当前选中的对象 ID；未选中时为 null。响应式。 */
    readonly selectedObjectId: string | null
    /** 按 ID 查找对象；不存在时返回 undefined。 */
    getObject(id: string): SceneObject | undefined
    /** 向隔离 store 写入对象字段更新（仅影响预览，不触达全局 store）。 */
    updateObject<T extends SceneObject = SceneObject>(
        id: string,
        updates: SceneObjectUpdateFor<T>,
    ): void
    /** 设置当前选中对象；传 null 表示取消选中。 */
    selectObject(id: string | null): void
    /**
     * 返回当前场景对象的渲染链顺序（自底向上）。工作台用它来推导对象树的显示顺序，
     * 与底层 SceneObjectProvider 同名方法一致。
     */
    getSceneRenderChain(): string[]
}
