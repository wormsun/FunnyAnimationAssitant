/**
 * 场景模板 Store
 * v16: 管理场景模板的 CRUD 和搜索
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { SceneTemplate } from '@/types/sceneTemplate'

import { useProjectStore } from './projectStore'

export const useSceneTemplateStore = defineStore('sceneTemplate', () => {
    const templates = ref<SceneTemplate[]>([])

    /**
     * 生成唯一 ID
     */
    function generateId(): string {
        return `stpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * 获取所有已使用的标签
     */
    const allTags = computed(() => {
        const tags = new Set<string>()
        templates.value.forEach(t => t.tags?.forEach(tag => tags.add(tag)))
        return Array.from(tags).sort()
    })

    /**
     * 添加模板
     */
    function addTemplate(template: SceneTemplate): void {
        templates.value.push(template)
        const projectStore = useProjectStore()
        projectStore.markAsUnsaved()
    }

    /**
     * 获取模板
     */
    function getTemplate(id: string): SceneTemplate | undefined {
        return templates.value.find(t => t.id === id)
    }

    /**
     * 更新模板
     */
    function updateTemplate(id: string, updates: Partial<SceneTemplate>): boolean {
        const template = getTemplate(id)
        if (template) {
            Object.assign(template, updates, { updatedAt: Date.now() })
            const projectStore = useProjectStore()
            projectStore.markAsUnsaved()
            return true
        }
        return false
    }

    /**
     * 删除模板
     */
    function deleteTemplate(id: string): boolean {
        const index = templates.value.findIndex(t => t.id === id)
        if (index !== -1) {
            const template = templates.value[index]
            // 释放运行时缩略图 Blob URL
            if (template?._runtimeThumbnailUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(template._runtimeThumbnailUrl)
            }
            templates.value.splice(index, 1)
            const projectStore = useProjectStore()
            projectStore.markAsUnsaved()
            return true
        }
        return false
    }

    /**
     * 按标签筛选
     */
    function getTemplatesByTag(tag: string): SceneTemplate[] {
        return templates.value.filter(t => t.tags?.includes(tag))
    }

    /**
     * 搜索模板（按名称模糊匹配）
     */
    function searchTemplates(query: string): SceneTemplate[] {
        const q = query.toLowerCase()
        return templates.value.filter(t => t.name.toLowerCase().includes(q))
    }

    /**
     * 设置模板列表（用于加载项目）
     */
    function setTemplates(list: SceneTemplate[]): void {
        templates.value = list
    }

    /**
     * 清空所有模板
     */
    function clearAll(): void {
        templates.value.forEach(t => {
            if (t._runtimeThumbnailUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(t._runtimeThumbnailUrl)
            }
        })
        templates.value = []
    }

    return {
        templates,
        allTags,
        generateId,
        addTemplate,
        getTemplate,
        updateTemplate,
        deleteTemplate,
        getTemplatesByTag,
        searchTemplates,
        setTemplates,
        clearAll,
    }
})
