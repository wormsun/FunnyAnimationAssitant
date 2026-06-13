/**
 * characterSyncUtils 单元测试
 * 验证「拍扁→重组」人物间结构/动画同步复制逻辑
 */

import { describe, expect, it } from 'vitest'

import type { AnimationDefinition, TrackAnimationDefinition } from '@/types/animation'
import type { CompositeObject, SceneObject } from '@/types/sceneObject'

import {
    buildNameMatch,
    collectLeafNodes,
    remapAnimationDefinitions,
    syncCharacterStructure,
} from '../characterSyncUtils'

// ===== 辅助工厂函数 =====

function makeLeaf(
    id: string,
    alias: string,
    overrides?: Partial<SceneObject>,
): SceneObject {
    return {
        id,
        type: 'symbol',
        name: alias,
        alias,
        refId: '',
        x: 0, y: 0,
        width: 100, height: 100,
        scaleX: 1, scaleY: 1,
        rotation: 0, alpha: 1,
        flipX: false, zIndex: 10,
        visible: true,
        ...overrides,
    } as SceneObject
}

function makeComposite(
    id: string,
    childIds: string[],
    overrides?: Partial<CompositeObject>,
): CompositeObject {
    return {
        id,
        type: 'composite',
        name: overrides?.name ?? `comp_${id}`,
        alias: overrides?.alias ?? `comp_${id}`,
        refId: '',
        childIds,
        compositeLocked: true,
        compositeMode: 'entity',
        x: 0, y: 0,
        width: 0, height: 0,
        scaleX: 1, scaleY: 1,
        rotation: 0, alpha: 1,
        flipX: false, zIndex: 10,
        visible: true,
        ...overrides,
    } as CompositeObject
}

function makeTrackAnimation(
    id: string,
    name: string,
    tracks: { targetObjectId?: string; trackType?: string; pivot?: { x: number; y: number } }[],
): TrackAnimationDefinition {
    return {
        type: 'track',
        id,
        name,
        loop: true,
        createdAt: 1000,
        updatedAt: 1000,
        tracks: tracks.map(t => ({
            trackType: t.trackType ?? 'transform',
            targetObjectId: t.targetObjectId,
            duration: 300,
            easing: 'linear' as const,
            keyframes: [{ time: 0 }, { time: 1 }],
            ...(t.pivot ? { pivot: t.pivot } : {}),
        })),
    } as TrackAnimationDefinition
}


// ===== collectLeafNodes =====

describe('collectLeafNodes', () => {
    it('正确提取叶节点，跳过 composite', () => {
        const leaf1 = makeLeaf('l1', '头部')
        const leaf2 = makeLeaf('l2', '身子')
        const comp = makeComposite('c1', ['l1', 'l2'])

        const result = collectLeafNodes([comp, leaf1, leaf2])

        expect(result.size).toBe(2)
        expect(result.has('头部')).toBe(true)
        expect(result.has('身子')).toBe(true)
        // composite 不在结果中
        expect(result.has('comp_c1')).toBe(false)
    })

    it('重复 alias 仅保留第一个', () => {
        const leaf1 = makeLeaf('l1', '头部')
        const leaf2 = makeLeaf('l2', '头部')

        const result = collectLeafNodes([leaf1, leaf2])

        expect(result.size).toBe(1)
        expect(result.get('头部')?.id).toBe('l1')
    })

    it('空列表返回空 Map', () => {
        expect(collectLeafNodes([]).size).toBe(0)
    })

    it('优先使用 alias，回退到 name', () => {
        const leaf = makeLeaf('l1', '', { name: 'fallback_name', alias: '' })

        const result = collectLeafNodes([leaf])

        expect(result.has('fallback_name')).toBe(true)
    })
})

// ===== buildNameMatch =====

describe('buildNameMatch', () => {
    it('正确匹配同名叶节点', () => {
        const sourceObjects: SceneObject[] = [
            makeComposite('sc', ['sl1', 'sl2']),
            makeLeaf('sl1', '头部', { parentId: 'sc' }),
            makeLeaf('sl2', '身子', { parentId: 'sc' }),
        ]
        const targetObjects: SceneObject[] = [
            makeComposite('tc', ['tl1', 'tl2']),
            makeLeaf('tl1', '头部', { parentId: 'tc' }),
            makeLeaf('tl2', '身子', { parentId: 'tc' }),
        ]

        const result = buildNameMatch(sourceObjects, targetObjects)

        expect(result.matched).toEqual(expect.arrayContaining(['头部', '身子']))
        expect(result.sourceOnly).toHaveLength(0)
        expect(result.targetOnly).toHaveLength(0)
        expect(result.leafIdMap.get('sl1')).toBe('tl1')
        expect(result.leafIdMap.get('sl2')).toBe('tl2')
    })

    it('识别 sourceOnly 和 targetOnly', () => {
        const sourceObjects: SceneObject[] = [
            makeLeaf('sl1', '头部'),
            makeLeaf('sl2', '后裙'),
        ]
        const targetObjects: SceneObject[] = [
            makeLeaf('tl1', '头部'),
            makeLeaf('tl2', '帽子'),
        ]

        const result = buildNameMatch(sourceObjects, targetObjects)

        expect(result.matched).toEqual(['头部'])
        expect(result.sourceOnly).toEqual(['后裙'])
        expect(result.targetOnly).toEqual(['帽子'])
    })

    it('跨层级匹配：源有嵌套 union，目标为平坦结构', () => {
        // 源：root → union → 头部
        const sourceObjects: SceneObject[] = [
            makeComposite('root', ['union1', 'sl2'], { compositeMode: 'entity' }),
            makeComposite('union1', ['sl1'], { parentId: 'root', compositeMode: 'union' }),
            makeLeaf('sl1', '头部', { parentId: 'union1' }),
            makeLeaf('sl2', '身子', { parentId: 'root' }),
        ]
        // 目标：root → 头部（平坦）
        const targetObjects: SceneObject[] = [
            makeComposite('troot', ['tl1', 'tl2']),
            makeLeaf('tl1', '头部', { parentId: 'troot' }),
            makeLeaf('tl2', '身子', { parentId: 'troot' }),
        ]

        const result = buildNameMatch(sourceObjects, targetObjects)

        expect(result.matched).toEqual(expect.arrayContaining(['头部', '身子']))
        expect(result.leafIdMap.get('sl1')).toBe('tl1')
        expect(result.leafIdMap.get('sl2')).toBe('tl2')
        // 源有 2 个 composite → compositeIdMap 应有 2 项
        expect(result.compositeIdMap.size).toBe(2)
    })

    it('为源的 composite 生成新 ID', () => {
        const sourceObjects: SceneObject[] = [
            makeComposite('root', ['l1']),
            makeLeaf('l1', '头部', { parentId: 'root' }),
        ]
        const targetObjects: SceneObject[] = [
            makeLeaf('tl1', '头部'),
        ]

        const result = buildNameMatch(sourceObjects, targetObjects)

        expect(result.compositeIdMap.size).toBe(1)
        const newId = result.compositeIdMap.get('root')
        expect(newId).toBeDefined()
        expect(newId).not.toBe('root')
        expect(newId).toMatch(/^sceneobject_/)
    })
})

// ===== remapAnimationDefinitions =====

describe('remapAnimationDefinitions', () => {
    it('_self 保持不变', () => {
        const anims: Record<string, AnimationDefinition> = {
            a1: makeTrackAnimation('a1', '帧动画', [{ targetObjectId: '_self' }]),
        }
        const idMap = new Map<string, string>()

        const { remapped, skipped } = remapAnimationDefinitions(anims, idMap)

        expect(skipped).toHaveLength(0)
        const entries = Object.values(remapped)
        expect(entries).toHaveLength(1)
        const trackAnim = entries[0] as TrackAnimationDefinition
        expect(trackAnim.tracks[0]?.targetObjectId).toBe('_self')
    })

    it('已映射 ID 正确替换', () => {
        const anims: Record<string, AnimationDefinition> = {
            a1: makeTrackAnimation('a1', '点头', [{ targetObjectId: 'src_obj' }]),
        }
        const idMap = new Map([['src_obj', 'target_obj']])

        const { remapped } = remapAnimationDefinitions(anims, idMap)

        const entries = Object.values(remapped)
        expect(entries).toHaveLength(1)
        const trackAnim = entries[0] as TrackAnimationDefinition
        expect(trackAnim.tracks[0]?.targetObjectId).toBe('target_obj')
    })

    it('未映射 ID 的轨道被移除', () => {
        const anims: Record<string, AnimationDefinition> = {
            a1: makeTrackAnimation('a1', '混合', [
                { targetObjectId: 'mapped_obj' },
                { targetObjectId: 'unmapped_obj' },
            ]),
        }
        const idMap = new Map([['mapped_obj', 'target_mapped']])

        const { remapped, trimmed } = remapAnimationDefinitions(anims, idMap)

        const entries = Object.values(remapped)
        expect(entries).toHaveLength(1)
        const trackAnim = entries[0] as TrackAnimationDefinition
        expect(trackAnim.tracks).toHaveLength(1)
        expect(trackAnim.tracks[0]?.targetObjectId).toBe('target_mapped')
        expect(trimmed).toContain('混合')
    })

    it('所有轨道都不可映射 → 整个动画被跳过', () => {
        const anims: Record<string, AnimationDefinition> = {
            a1: makeTrackAnimation('a1', '孤立动画', [{ targetObjectId: 'nonexistent' }]),
        }
        const idMap = new Map<string, string>()

        const { remapped, skipped } = remapAnimationDefinitions(anims, idMap)

        expect(Object.keys(remapped)).toHaveLength(0)
        expect(skipped).toContain('孤立动画')
    })


    it('生成新的动画 ID', () => {
        const anims: Record<string, AnimationDefinition> = {
            old_id: makeTrackAnimation('old_id', '测试', [{ targetObjectId: '_self' }]),
        }

        const { remapped } = remapAnimationDefinitions(anims, new Map())

        const newIds = Object.keys(remapped)
        expect(newIds).toHaveLength(1)
        expect(newIds[0]).not.toBe('old_id')
        expect(newIds[0]).toMatch(/^animation_/)
    })

    it('跨人物导入时清除 transform track 的自定义 pivot', () => {
        const anims: Record<string, AnimationDefinition> = {
            a1: makeTrackAnimation('a1', '摆手', [
                { targetObjectId: 'src_hand', pivot: { x: 42, y: 88 } },
            ]),
        }
        const idMap = new Map([['src_hand', 'target_hand']])

        const { remapped } = remapAnimationDefinitions(anims, idMap)

        const trackAnim = Object.values(remapped)[0] as TrackAnimationDefinition
        const track = trackAnim.tracks[0]
        expect(track?.targetObjectId).toBe('target_hand')
        expect(track && 'pivot' in track).toBe(false)
    })
})

// ===== syncCharacterStructure =====

describe('syncCharacterStructure', () => {
    it('完整流程：嵌套源 + 平坦目标', () => {
        // 模拟男1结构：root(entity) → [身子, 组合(union)] → 组合 → [头部, 表情]
        const sourceRoot = makeComposite('s_root', ['s_body', 's_union'], {
            compositeMode: 'entity',
            renderChain: ['s_body', 's_head', 's_expr'],
            animations: {
                a1: makeTrackAnimation('a1', '点头', [{ targetObjectId: 's_union' }]),
                a2: makeTrackAnimation('a2', '走路', [{ targetObjectId: 's_body' }]),
            },
        })
        const sourceUnion = makeComposite('s_union', ['s_head', 's_expr'], {
            parentId: 's_root',
            compositeMode: 'union',
            name: '组合',
            alias: '组合',
        })
        const sourceBody = makeLeaf('s_body', '身子', { parentId: 's_root' })
        const sourceHead = makeLeaf('s_head', '头部', { parentId: 's_union' })
        const sourceExpr = makeLeaf('s_expr', '表情', {
            parentId: 's_union',
            type: 'expression',
        })
        const sourceObjects: SceneObject[] = [sourceRoot, sourceUnion, sourceBody, sourceHead, sourceExpr]

        // 目标：平坦结构 root → [身子, 头部, 表情]
        const targetRoot = makeComposite('t_root', ['t_body', 't_head', 't_expr'])
        const targetBody = makeLeaf('t_body', '身子', { parentId: 't_root' })
        const targetHead = makeLeaf('t_head', '头部', { parentId: 't_root' })
        const targetExpr = makeLeaf('t_expr', '表情', {
            parentId: 't_root',
            type: 'expression',
        })
        const targetObjects: SceneObject[] = [targetRoot, targetBody, targetHead, targetExpr]

        const result = syncCharacterStructure(sourceObjects, targetObjects)

        // 匹配结果
        expect(result.matchResult.matched).toEqual(expect.arrayContaining(['身子', '头部', '表情']))
        expect(result.matchResult.sourceOnly).toHaveLength(0)
        expect(result.matchResult.targetOnly).toHaveLength(0)

        // 对象数量：2 composites + 3 leaves = 5
        expect(result.objects).toHaveLength(5)

        // 验证 composite 结构被复制
        const composites = result.objects.filter(o => o.type === 'composite') as CompositeObject[]
        expect(composites).toHaveLength(2)

        // 找到新的 root（无 parentId）
        const newRoot = composites.find(c => !c.parentId)
        expect(newRoot).toBeDefined()
        expect(newRoot!.compositeMode).toBe('entity')
        expect(newRoot!.childIds).toHaveLength(2) // 身子 + union

        // 找到新的 union
        const newUnion = composites.find(c => c.parentId === newRoot!.id)
        expect(newUnion).toBeDefined()
        expect(newUnion!.compositeMode).toBe('union')
        expect(newUnion!.childIds).toHaveLength(2) // 头部 + 表情

        // 验证叶节点的 parentId 正确
        const leaves = result.objects.filter(o => o.type !== 'composite')
        const bodyLeaf = leaves.find(l => getAlias(l) === '身子')
        expect(bodyLeaf?.parentId).toBe(newRoot!.id)

        const headLeaf = leaves.find(l => getAlias(l) === '头部')
        expect(headLeaf?.parentId).toBe(newUnion!.id)

        // 验证叶节点保留了目标的原始 ID
        expect(bodyLeaf?.id).toBe('t_body')
        expect(headLeaf?.id).toBe('t_head')

        // 验证动画被复制
        expect(newRoot!.animations).toBeDefined()
        const animValues = Object.values(newRoot!.animations!)
        expect(animValues).toHaveLength(2)

        // 验证动画中的 targetObjectId 已重映射
        const walkAnim = animValues.find(a => a.name === '走路') as TrackAnimationDefinition
        expect(walkAnim).toBeDefined()
        expect(walkAnim.tracks[0]?.targetObjectId).toBe('t_body')

        // 点头动画目标应该是新 union 的 ID
        const nodAnim = animValues.find(a => a.name === '点头') as TrackAnimationDefinition
        expect(nodAnim).toBeDefined()
        expect(nodAnim.tracks[0]?.targetObjectId).toBe(newUnion!.id)

        // renderChain 已翻译
        expect(newRoot!.renderChain).toBeDefined()
        expect(newRoot!.renderChain).toHaveLength(3)
    })

    it('仅目标有的叶节点追加到 root composite 内', () => {
        const sourceObjects: SceneObject[] = [
            makeComposite('s_root', ['s_body'], { compositeMode: 'entity' }),
            makeLeaf('s_body', '身子', { parentId: 's_root' }),
        ]
        const targetObjects: SceneObject[] = [
            makeComposite('t_root', ['t_body', 't_hat'], { compositeMode: 'entity' }),
            makeLeaf('t_body', '身子', { parentId: 't_root' }),
            makeLeaf('t_hat', '帽子', { parentId: 't_root' }),
        ]

        const result = syncCharacterStructure(sourceObjects, targetObjects)

        // 1 composite + 2 leaves = 3
        expect(result.objects).toHaveLength(3)

        const newRoot = result.objects.find(o => o.type === 'composite') as CompositeObject
        expect(newRoot.childIds).toHaveLength(2)

        // 帽子应该在 root composite 内
        const hatLeaf = result.objects.find(o => getAlias(o) === '帽子')
        expect(hatLeaf).toBeDefined()
        expect(hatLeaf!.parentId).toBe(newRoot.id)
    })

    it('仅源有的叶节点引用的动画轨道被移除', () => {
        const sourceObjects: SceneObject[] = [
            makeComposite('s_root', ['s_body', 's_skirt'], {
                compositeMode: 'entity',
                animations: {
                    a1: makeTrackAnimation('a1', '走路', [
                        { targetObjectId: 's_body' },
                        { targetObjectId: 's_skirt' }, // 后裙无匹配
                    ]),
                },
            }),
            makeLeaf('s_body', '身子', { parentId: 's_root' }),
            makeLeaf('s_skirt', '后裙', { parentId: 's_root' }),
        ]
        const targetObjects: SceneObject[] = [
            makeComposite('t_root', ['t_body']),
            makeLeaf('t_body', '身子', { parentId: 't_root' }),
        ]

        const result = syncCharacterStructure(sourceObjects, targetObjects)

        expect(result.matchResult.sourceOnly).toEqual(['后裙'])
        expect(result.trimmedAnimations).toContain('走路')

        // 动画仍然存在（有 1 个有效轨道）
        const newRoot = result.objects.find(o => o.type === 'composite') as CompositeObject
        const anims = Object.values(newRoot.animations!)
        expect(anims).toHaveLength(1)
        const walkAnim = anims[0] as TrackAnimationDefinition
        expect(walkAnim.tracks).toHaveLength(1)
    })

    it('空动画的 composite', () => {
        const sourceObjects: SceneObject[] = [
            makeComposite('s_root', ['s_body'], { compositeMode: 'entity' }),
            makeLeaf('s_body', '身子', { parentId: 's_root' }),
        ]
        const targetObjects: SceneObject[] = [
            makeComposite('t_root', ['t_body']),
            makeLeaf('t_body', '身子', { parentId: 't_root' }),
        ]

        const result = syncCharacterStructure(sourceObjects, targetObjects)

        expect(result.objects).toHaveLength(2)
        expect(result.skippedAnimations).toHaveLength(0)
    })
})

// ===== 辅助 =====

function getAlias(obj: SceneObject): string {
    return obj.alias?.trim() || obj.name
}
