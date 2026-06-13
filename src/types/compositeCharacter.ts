/**
 * 组合式人物类型定义
 * 结构参照 SceneTemplate，新增 gender 字段
 */

import type { Gender } from './project'
import type { SceneObject } from './sceneObject'

/**
 * 组合式人物 — 基于 CompositeObject + ExpressionObject 的角色模板资源
 *
 * 与 SceneTemplate 结构对齐：使用平坦 SceneObject[] 列表，
 * 通过 parentId / childIds 维护层级关系。
 * 与 SceneTemplate 的关键差异：必须包含 ExpressionObject，且具有性别属性。
 */
export interface CompositeCharacter {
    id: string
    name: string
    gender: Gender              // 'male' | 'female' | 'other'
    tags?: string[]
    createdAt: number
    updatedAt?: number

    /** 缩略图文件相对路径 */
    thumbnailPath?: string
    /** 运行时 Blob URL（不持久化） */
    _runtimeThumbnailUrl?: string

    /** 人物包含的所有场景对象（平坦列表，含 CompositeObject + ExpressionObject 等） */
    objects: SceneObject[]

    /** 场景级渲染链（有序 ID 列表，决定根级对象的渲染顺序） */
    renderChain?: string[]

    /** 编辑器画布锚点（归零前包围盒中心），用于编辑器加载时还原位置 */
    editorAnchor?: { x: number; y: number }

    /** 导入 config.json 时的源目录（相对于项目根） */
    importSourcePath?: string

    /** 角色根组合对象 ID（预制编排动画宿主） */
    rootCompositeId?: string
}
