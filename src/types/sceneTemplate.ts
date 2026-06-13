/**
 * 场景模板类型定义
 * v17: 多根平坦列表结构，与 SceneSetup.objects 对齐
 */

import type { SceneObject } from './sceneObject'

/**
 * 场景模板 — 一级素材资源，与角色/道具/背景平级
 *
 * 模板内部直接使用现有的 SceneObject 类型。
 * 所有对象存放在平坦的 objects 列表中（含 composite 的子对象），
 * 通过 parentId / childIds 维护层级关系。
 */
export interface SceneTemplate {
    id: string
    name: string
    tags?: string[]
    createdAt: number
    updatedAt?: number

    /** 缩略图文件相对路径 */
    thumbnailPath?: string
    /** 运行时 Blob URL（不持久化） */
    _runtimeThumbnailUrl?: string

    /** 模板包含的所有场景对象（平坦列表，与 SceneSetup.objects 对齐） */
    objects: SceneObject[]

    /** v19: 场景级渲染链（有序 ID 列表，决定根级对象的渲染顺序） */
    renderChain?: string[]

    /** 模板编辑器画布锚点（归零前包围盒中心），用于编辑器加载时还原位置 */
    editorAnchor?: { x: number; y: number }

    /** 导入源 config.json 所在目录的相对路径 */
    importSourcePath?: string
}
