/**
 * Animation Store (v11.0)
 * Animation 管理 Store，提供资源级 Animation 的 CRUD 操作
 */

import { defineStore } from 'pinia'

import type {
    AnimationDefinition,
    AnimationDefinitionInput,
    AnimationListItem,
    AnimationResourceType,
    AnimationTrack,
    TrackAnimationDefinition,
} from '@/types/animation'
import type { SceneObject, SymbolObject } from '@/types/sceneObject'

import { useBackgroundStore } from './backgroundStore'
import { usePropStore } from './propStore'

/**
 * 估算 Animation 时长
 * 基于各轨道的 duration 取最大值
 */
function estimateAnimationDuration(tracks: AnimationTrack[]): number {
    let maxDuration = 0
    for (const track of tracks) {
        if (track.trackType === 'transform' || track.trackType === 'visibility') {
            const duration = track.duration ?? 1000
            if (typeof duration === 'number' && duration > maxDuration) {
                maxDuration = duration
            }
        } else if (track.trackType === 'frame_sequence') {
            // 帧序列轨道无固定时长，使用默认值
            maxDuration = Math.max(maxDuration, 1000)
        } else if (track.trackType === 'effect') {
            // 特效轨道通常是持续性的，使用默认值
            maxDuration = Math.max(maxDuration, 1000)
        }
    }
    return maxDuration || 1000
}

/**
 * 将 AnimationDefinition 转换为列表项
 */
function toListItem(anim: AnimationDefinition): AnimationListItem {
    const tracks = anim.type === 'track' ? anim.tracks : []
    return {
        id: anim.id,
        name: anim.name,
        loop: anim.loop,
        trackCount: tracks.length,
        estimatedDuration: estimateAnimationDuration(tracks),
    }
}

export const useAnimationStore = defineStore('animation', () => {
    // ===== 读取操作 =====

    // ─── v16: 对象级动画读取 API ───

    /**
     * 从 SceneObject.animations 获取动画列表
     */
    function getObjectAnimations(object: SceneObject): AnimationDefinition[] {
        return Object.values(object.animations ?? {})
    }

    /**
     * 根据名称从 SceneObject.animations 获取动画
     */
    function getObjectAnimationByName(
        object: SceneObject,
        animName: string,
    ): AnimationDefinition | undefined {
        return Object.values(object.animations ?? {})
            .find(a => a.name === animName)
    }

    // ─── 资源级动画读取 API ───

    /**
     * 获取资源的 Animation 列表
     */
    function getAnimations(
        resourceType: AnimationResourceType,
        resourceId: string
    ): AnimationDefinition[] {
        const animations = getAnimationsRecord(resourceType, resourceId)
        return Object.values(animations)
    }

    /**
     * 获取资源的 Animation 列表项（用于 UI 显示）
     */
    function getAnimationListItems(
        resourceType: AnimationResourceType,
        resourceId: string
    ): AnimationListItem[] {
        const animations = getAnimations(resourceType, resourceId)
        return animations.map(toListItem)
    }

    /**
     * 获取单个 Animation
     */
    function getAnimation(
        resourceType: AnimationResourceType,
        resourceId: string,
        animationId: string
    ): AnimationDefinition | undefined {
        const animations = getAnimationsRecord(resourceType, resourceId)
        return animations[animationId]
    }

    /**
     * 根据名称获取 Animation
     */
    function getAnimationByName(
        resourceType: AnimationResourceType,
        resourceId: string,
        animationName: string
    ): AnimationDefinition | undefined {
        const animations = getAnimations(resourceType, resourceId)
        return animations.find(a => a.name === animationName)
    }


    // ===== 写入操作 =====

    /**
     * 添加 Animation
     */
    function addAnimation(
        resourceType: AnimationResourceType,
        resourceId: string,
        animation: AnimationDefinitionInput
    ): AnimationDefinition {
        const now = Date.now()
        // type discriminant is preserved through spread; TS can't narrow unions
        // through spread so we assert — the input's `type` field guarantees correctness
        const newAnimation = {
            ...animation,
            id: `animation_${crypto.randomUUID()}`,
            createdAt: now,
            updatedAt: now,
        } as AnimationDefinition

        const animations = getAnimationsRecord(resourceType, resourceId)
        animations[newAnimation.id] = newAnimation
        setAnimationsRecord(resourceType, resourceId, animations)

        return newAnimation
    }

    /**
     * 更新 Animation
     */
    function updateAnimation(
        resourceType: AnimationResourceType,
        resourceId: string,
        animationId: string,
        updates: Partial<Omit<AnimationDefinition, 'id' | 'createdAt'>>
    ): AnimationDefinition | undefined {
        const animations = getAnimationsRecord(resourceType, resourceId)
        const existing = animations[animationId]
        if (!existing) {
            return undefined
        }

        // type discriminant is preserved through spread; TS can't narrow unions
        // through spread so we assert — the existing record's `type` guarantees correctness
        const updated = {
            ...existing,
            ...updates,
            id: animationId, // 确保 ID 不被覆盖
            createdAt: existing.createdAt, // 确保 createdAt 不被覆盖
            updatedAt: Date.now(),
        } as AnimationDefinition

        animations[animationId] = updated
        setAnimationsRecord(resourceType, resourceId, animations)

        return updated
    }

    /**
     * 删除 Animation
     */
    function deleteAnimation(
        resourceType: AnimationResourceType,
        resourceId: string,
        animationId: string
    ): boolean {
        const animations = getAnimationsRecord(resourceType, resourceId)
        if (!(animationId in animations)) {
            return false
        }

        delete animations[animationId]
        setAnimationsRecord(resourceType, resourceId, animations)

        return true
    }

    /**
     * 从其他资源导入 Animation（复制 + 来源追踪）
     */
    function importAnimation(
        targetResourceType: AnimationResourceType,
        targetResourceId: string,
        sourceResourceType: AnimationResourceType,
        sourceResourceId: string,
        sourceAnimationId: string
    ): AnimationDefinition | undefined {
        // 获取源 Animation
        const sourceAnimation = getAnimation(
            sourceResourceType,
            sourceResourceId,
            sourceAnimationId
        )
        if (!sourceAnimation) {
            return undefined
        }

        // 复制 Animation（深拷贝轨道等数据）
        // v11.52: 移除 sourceRef
        const copiedAnimation: Omit<TrackAnimationDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
            type: 'track',
            name: sourceAnimation.name,
            loop: sourceAnimation.loop,
            tracks: sourceAnimation.type === 'track'
                ? JSON.parse(JSON.stringify(sourceAnimation.tracks)) as AnimationTrack[]
                : [],
            ...(sourceAnimation.description !== undefined && { description: sourceAnimation.description }),
            ...(sourceAnimation.tags !== undefined && { tags: [...sourceAnimation.tags] }),
        }

        return addAnimation(targetResourceType, targetResourceId, copiedAnimation)
    }

    // ===== 工具方法 =====

    /**
     * 获取所有包含 Animation 的资源（用于导入选择器）
     */
    function getAllResourcesWithAnimations(): {
        resourceType: AnimationResourceType
        resourceId: string
        resourceName: string
        animations: AnimationListItem[]
    }[] {
        const result: {
            resourceType: AnimationResourceType
            resourceId: string
            resourceName: string
            animations: AnimationListItem[]
        }[] = []

        const propStore = usePropStore()
        const backgroundStore = useBackgroundStore()

        // 遍历道具
        const props = propStore.props
        for (const prop of props) {
            const animationsRecord = (prop as unknown as { animations?: Record<string, AnimationDefinition> }).animations
            if (animationsRecord && Object.keys(animationsRecord).length > 0) {
                result.push({
                    resourceType: 'prop',
                    resourceId: prop.id,
                    resourceName: prop.name ?? prop.id,
                    animations: Object.values(animationsRecord).map(toListItem),
                })
            }
        }

        // 遍历背景
        const backgrounds = backgroundStore.backgrounds
        for (const bg of backgrounds) {
            const animationsRecord = (bg as unknown as { animations?: Record<string, AnimationDefinition> }).animations
            if (animationsRecord && Object.keys(animationsRecord).length > 0) {
                result.push({
                    resourceType: 'background',
                    resourceId: bg.id,
                    resourceName: bg.name,
                    animations: Object.values(animationsRecord).map(toListItem),
                })
            }
        }

        return result
    }

    // ===== 私有辅助函数 =====

    /**
     * @deprecated v16: 资源级 switch 分发将被对象级 SceneObject.animations 替代
     */
    function getAnimationsRecord(
        resourceType: AnimationResourceType,
        resourceId: string
    ): Record<string, AnimationDefinition> {
        const propStore = usePropStore()
        const backgroundStore = useBackgroundStore()

        switch (resourceType) {
            case 'prop': {
                const prop = propStore.props.find((p) => p.id === resourceId)
                const propData = prop as {
                    animations?: Record<string, AnimationDefinition>
                } | undefined
                return propData?.animations ?? {}
            }
            case 'background': {
                const bg = backgroundStore.backgrounds.find((b) => b.id === resourceId)
                const bgData = bg as {
                    animations?: Record<string, AnimationDefinition>
                } | undefined
                return bgData?.animations ?? {}
            }
            default:
                throw new Error(`Unknown resource type: ${resourceType as string}`)
        }
    }

    /**
     * @deprecated v16: 资源级 switch 分发将被对象级 SceneObject.animations 替代
     */
    function setAnimationsRecord(
        resourceType: AnimationResourceType,
        resourceId: string,
        animations: Record<string, AnimationDefinition>
    ): void {
        const propStore = usePropStore()
        const backgroundStore = useBackgroundStore()

        switch (resourceType) {
            case 'prop': {
                const prop = propStore.props.find((p) => p.id === resourceId)
                if (prop) {
                    (prop as { animations?: Record<string, AnimationDefinition> }).animations = animations
                }
                break
            }
            case 'background': {
                const bg = backgroundStore.backgrounds.find((b) => b.id === resourceId)
                if (bg) {
                    (bg as { animations?: Record<string, AnimationDefinition> }).animations = animations
                }
                break
            }
            default:
                throw new Error(`Unknown resource type: ${resourceType as string}`)
        }
    }

    // v11.52: 移除了 getResourceName 函数（不再使用）





    /**
 * v16: 将资源级动画定义注入到 SceneObject.animations
 *
 * 在对象创建时调用，确保每个对象的 animations 字段已填充：
 * - character → 资源级 character.animations
 * - prop → 资源级 prop.animations + 内联帧动画发现
 * - background → 资源级 bg.animations + 内联帧动画发现
 *
 * v16 G4: 帧动画自动发现结果直接写入对象级 animations，
 * 不再依赖资源级 _runtimeAnimations 中间层。
 */
    function hydrateObjectAnimations(obj: SceneObject): void {
        if (obj.type !== 'prop' && obj.type !== 'background' && obj.type !== 'symbol' && obj.type !== 'expression') return

        // symbol 没有外部资源级动画（素材自包含），跳过资源合并，直接走帧动画发现
        if (obj.type === 'symbol') {
            const existingAnims = obj.animations ?? {}
            // 检查是否已有 origin='auto' 的帧序列动画
            const hasAutoFrameAnim = Object.values(existingAnims).some(
                a => a.origin === 'auto' && a.type === 'track' && (a).tracks.some(t => t.trackType === 'frame_sequence')
            )
            if (!hasAutoFrameAnim) {
                // 始终创建默认帧动画（即使当前无帧动画素材），当用户添加帧动画素材后自动可用
                const symbolObj = obj as SymbolObject
                const firstAnimMat = symbolObj.materials.find(
                    m => m.type === 'animation' && m.frames && m.frames.length > 0
                )
                const now = Date.now()
                const frameAnim: TrackAnimationDefinition = {
                    type: 'track',
                    id: `animation_${crypto.randomUUID()}`,
                    name: `${symbolObj.alias ?? symbolObj.name ?? '元件'}_帧动画`,
                    origin: 'auto',
                    loop: firstAnimMat?.loop ?? true,
                    tracks: [{
                        trackType: 'frame_sequence' as const,
                        assetId: '_self',
                    }],
                    createdAt: now,
                    updatedAt: now,
                }
                existingAnims[frameAnim.id] = frameAnim
            }
            obj.animations = existingAnims
            return
        }

        // v18: expression 对象 — 从 expressionStore 查询 speakingFrames 创建帧动画
        if (obj.type === 'expression') {
            const existingAnims = obj.animations ?? {}
            const hasAutoFrameAnim = Object.values(existingAnims).some(
                a => a.origin === 'auto' && a.type === 'track' && (a).tracks.some(t => t.trackType === 'frame_sequence')
            )
            if (!hasAutoFrameAnim) {
                const now = Date.now()
                const frameAnim: TrackAnimationDefinition = {
                    type: 'track',
                    id: `animation_${crypto.randomUUID()}`,
                    name: `${obj.alias ?? obj.name ?? '表情'}_说话动画`,
                    origin: 'auto',
                    loop: true,
                    tracks: [{
                        trackType: 'frame_sequence' as const,
                        assetId: '_self',
                    }],
                    createdAt: now,
                    updatedAt: now,
                }
                existingAnims[frameAnim.id] = frameAnim
            }
            obj.animations = existingAnims
            return
        }

        if (!obj.refId) return

        // 1. 读取资源级用户创建的动画（持久化的 .animations）
        const resourceAnims = getAnimationsRecord(obj.type, obj.refId)

        // 2. 合并资源级动画到对象（保留已有的对象级定义，资源级作为补充）
        const existingAnims = obj.animations ?? {}
        const mergedAnims: Record<string, AnimationDefinition> = { ...existingAnims }
        for (const [id, def] of Object.entries(resourceAnims)) {
            if (!(id in mergedAnims)) {
                mergedAnims[id] = def
            }
        }

        // 3. v16 G4: 内联帧动画自动发现 — 直接写入对象级
        if (obj.type === 'prop' || obj.type === 'background') {
            // 检查是否已有 origin='auto' 的帧序列动画
            const hasAutoFrameAnim = Object.values(mergedAnims).some(
                a => a.origin === 'auto' && a.type === 'track' && (a).tracks.some(
                    t => t.trackType === 'frame_sequence'
                )
            )
            if (!hasAutoFrameAnim) {
                // 始终创建默认帧动画（无论素材是否为帧动画类型）
                const propStore = usePropStore()
                const backgroundStore = useBackgroundStore()
                const resource = obj.type === 'prop'
                    ? propStore.props.find(p => p.id === obj.refId)
                    : backgroundStore.backgrounds.find(b => b.id === obj.refId)
                const resData = resource as { type?: string; frames?: { url: string }[]; name?: string; fps?: number; loop?: boolean } | undefined
                const now = Date.now()
                const frameAnim: TrackAnimationDefinition = {
                    type: 'track',
                    id: `animation_${crypto.randomUUID()}`,
                    name: `${resData?.name ?? obj.name ?? obj.refId}_帧动画`,
                    origin: 'auto',
                    loop: resData?.loop ?? true,
                    tracks: [{
                        trackType: 'frame_sequence' as const,
                        assetId: '_self',
                    }],
                    createdAt: now,
                    updatedAt: now,
                }
                mergedAnims[frameAnim.id] = frameAnim
            }
        }

        obj.animations = mergedAnims
    }

    return {
        // v16: 对象级读取 API
        getObjectAnimations,
        getObjectAnimationByName,
        // 资源级读取操作
        getAnimations,
        getAnimationListItems,
        getAnimation,
        getAnimationByName,

        // 写入操作
        addAnimation,
        updateAnimation,
        deleteAnimation,
        importAnimation,
        // 工具方法
        getAllResourcesWithAnimations,
        hydrateObjectAnimations,
    }
})
