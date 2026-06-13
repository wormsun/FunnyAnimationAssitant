/**
 * 组合式人物 Store
 * 参照 sceneTemplateStore 实现，额外支持性别筛选
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { Gender } from '@/types/project'

import { useProjectStore } from './projectStore'

export const useCompositeCharacterStore = defineStore('compositeCharacter', () => {
    const characters = ref<CompositeCharacter[]>([])

    /**
     * 生成唯一 ID
     */
    function generateId(): string {
        return `cchar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * 获取所有已使用的标签
     */
    const allTags = computed(() => {
        const tags = new Set<string>()
        characters.value.forEach(c => c.tags?.forEach(tag => tags.add(tag)))
        return Array.from(tags).sort()
    })

    /**
     * 添加人物
     */
    function addCharacter(character: CompositeCharacter): void {
        characters.value.push(character)
        const projectStore = useProjectStore()
        projectStore.markAsUnsaved()
    }

    /**
     * 获取单个人物
     */
    function getCharacter(id: string): CompositeCharacter | undefined {
        return characters.value.find(c => c.id === id)
    }

    /**
     * 更新人物
     */
    function updateCharacter(id: string, updates: Partial<CompositeCharacter>): boolean {
        const character = getCharacter(id)
        if (character) {
            Object.assign(character, updates, { updatedAt: Date.now() })
            const projectStore = useProjectStore()
            projectStore.markAsUnsaved()
            return true
        }
        return false
    }

    /**
     * 删除人物
     */
    function deleteCharacter(id: string): boolean {
        const index = characters.value.findIndex(c => c.id === id)
        if (index !== -1) {
            const character = characters.value[index]
            // 释放运行时缩略图 Blob URL
            if (character?._runtimeThumbnailUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(character._runtimeThumbnailUrl)
            }
            characters.value.splice(index, 1)
            const projectStore = useProjectStore()
            projectStore.markAsUnsaved()
            return true
        }
        return false
    }

    /**
     * 按性别筛选
     */
    function getCharactersByGender(gender: Gender | 'all'): CompositeCharacter[] {
        if (gender === 'all') return characters.value
        return characters.value.filter(c => c.gender === gender)
    }

    /**
     * 按标签筛选
     */
    function getCharactersByTag(tag: string): CompositeCharacter[] {
        return characters.value.filter(c => c.tags?.includes(tag))
    }

    /**
     * 搜索人物（按名称模糊匹配）
     */
    function searchCharacters(query: string): CompositeCharacter[] {
        const q = query.toLowerCase()
        return characters.value.filter(c => c.name.toLowerCase().includes(q))
    }

    /**
     * 设置人物列表（用于加载项目）
     */
    function setCharacters(list: CompositeCharacter[]): void {
        characters.value = list
    }

    /**
     * 清空所有人物
     */
    function clearAll(): void {
        characters.value.forEach(c => {
            if (c._runtimeThumbnailUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(c._runtimeThumbnailUrl)
            }
        })
        characters.value = []
    }

    return {
        characters,
        allTags,
        generateId,
        addCharacter,
        getCharacter,
        updateCharacter,
        deleteCharacter,
        getCharactersByGender,
        getCharactersByTag,
        searchCharacters,
        setCharacters,
        clearAll,
    }
})
