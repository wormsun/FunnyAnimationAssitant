/**
 * TC-SPD-RESOURCE-AUDIT: 场景资源使用与预加载完整性审计
 * 
 * 验证层级:
 * 1. Setup 静态资源 - 角色初始状态、道具、背景
 * 2. Block 动态资源 - set_character/set_expression 动态切换
 * 3. 预加载验证 - 所有使用的资源是否都被收集
 * 
 * 该测试套件设计用于验证 ScenePreviewDialog 资源预加载的完整性
 */

import nodeFs from 'fs'
import nodePath from 'path'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, describe, expect, it } from 'vitest'

import { useAssetLoader } from '@/composables/useAssetLoader'
import { useBackgroundStore } from '@/stores/backgroundStore'

import { useEpisodeStore } from '@/stores/episodeStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePropStore } from '@/stores/propStore'
import type { ScriptBlock } from '@/types/screenplay'

describe('TC-SPD-RESOURCE-AUDIT: Resource Usage and Preload Verification', () => {
    let projectStore: ReturnType<typeof useProjectStore>
    let hasProjectData = false

    let episodeStore: ReturnType<typeof useEpisodeStore>
    let expressionStore: ReturnType<typeof useExpressionStore>
    let backgroundStore: ReturnType<typeof useBackgroundStore>
    let propStore: ReturnType<typeof usePropStore>

    beforeAll(async () => {
        setActivePinia(createPinia())
        projectStore = useProjectStore()

        episodeStore = useEpisodeStore()
        expressionStore = useExpressionStore()
        backgroundStore = useBackgroundStore()
        propStore = usePropStore()

        const projectPath = nodePath.resolve(__dirname, '../../../examples/demo-project/demo.anime')
        if (nodeFs.existsSync(projectPath)) {
            const content = nodeFs.readFileSync(projectPath, 'utf-8')
            await projectStore.OnlyForAutoTestCase_OpenProject(content)
            hasProjectData = episodeStore.episodes.some(episode => episode.scenes?.length > 0)
        }
    })

    function ensureProjectData() {
        if (!hasProjectData) return false
        return true
    }

    /**
     * AUDIT-01: Setup 静态资源清单
     * 列出 Setup 中每个对象使用的资源
     */
    it('AUDIT-01: Catalog all resources used in Scene Setup', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode) throw new Error('Episode not found')
        expect(episode).toBeDefined()

        const scene = episode.scenes[0]
        if (!scene) throw new Error('Scene not found')
        expect(scene).toBeDefined()

        console.log('\n========== SETUP RESOURCE AUDIT ==========')

        const setupResources = {
            characters: [] as { id: string, name: string, pose: string, expression: string, imageCount: number }[],
            props: [] as { id: string, name: string, imageCount: number }[],
            backgrounds: [] as { id: string, name: string, hasImage: boolean }[],
            audio: [] as { id: string, refId: string }[]
        }

        for (const obj of scene.setup.objects) {
            if (obj.type === 'prop') {
                const propId = (obj as any).refId
                const prop = propStore.getProp(propId)
                if (!prop) continue

                let imageCount = 0
                if (prop.url) imageCount++
                imageCount += prop.frames?.length || 0

                setupResources.props.push({
                    id: obj.id,
                    name: prop.name || propId,
                    imageCount
                })
            } else if (obj.type === 'background') {
                const bg = backgroundStore.getBackground(obj.refId)
                if (!bg) continue

                setupResources.backgrounds.push({
                    id: obj.id,
                    name: bg.name || obj.refId,
                    hasImage: !!((bg as any).url || (bg as any).backgroundImage)
                })
            } else if (obj.type === 'audio') {
                setupResources.audio.push({
                    id: obj.id,
                    refId: obj.refId
                })
            }
        }

        // 输出报告
        console.log('\n--- Characters ---')
        setupResources.characters.forEach(c => {
            console.log(`  [${c.id.substring(0, 20)}...] ${c.name}: Pose=${c.pose}, Expr=${c.expression || 'none'}, Images=${c.imageCount}`)
        })

        console.log('\n--- Props ---')
        setupResources.props.forEach(p => {
            console.log(`  [${p.id.substring(0, 20)}...] ${p.name}: ${p.imageCount} images`)
        })

        console.log('\n--- Backgrounds ---')
        setupResources.backgrounds.forEach(b => {
            console.log(`  [${b.id.substring(0, 20)}...] ${b.name}: ${b.hasImage ? '✓' : '✗'} image`)
        })

        console.log('\n--- Audio ---')
        setupResources.audio.forEach(a => {
            console.log(`  [${a.id.substring(0, 20)}...] refId=${a.refId}`)
        })

        // 验证
        const totalObjects = setupResources.characters.length +
            setupResources.props.length +
            setupResources.backgrounds.length +
            setupResources.audio.length
        console.log(`\nTotal Setup Objects: ${totalObjects}`)
        expect(totalObjects).toBeGreaterThan(0)
    })

    /**
     * AUDIT-02: Block 动态资源清单
     * 分析每个 Block 中 Actions 引用的额外资源
     */
    it('AUDIT-02: Catalog all resources used in Block Actions', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode) throw new Error('Episode not found')
        const scene = episode.scenes[0]
        if (!scene) throw new Error('Scene not found')

        console.log('\n========== BLOCK ACTION RESOURCE AUDIT ==========')

        interface DynamicResource {
            actionType: string
            target: string
            pose?: string
            expression?: string
            additionalImages: number
        }

        interface BlockResource {
            blockId: string
            blockIndex: number
            blockType: string
            dynamicResources: DynamicResource[]
        }

        const blockResources: BlockResource[] = []

        scene.script.forEach((block: any, index: number) => {
            const dynamicResources: DynamicResource[] = []

            if (block.actions) {
                for (const action of block.actions) {
                    if (action.type === 'set_transform') {
                        let additionalImages = 0
                        const params = action.params || {}

                        // Expression 切换
                        if (params.expression) {
                            const expr = expressionStore.getExpression(params.expression)
                            if (expr?.defaultFrame?.url) additionalImages++
                            additionalImages += expr?.speakingFrames?.length || 0
                        }

                        dynamicResources.push({
                            actionType: action.type,
                            target: action.target,
                            pose: params.pose,
                            expression: params.expression,
                            additionalImages
                        })
                    }
                }
            }

            blockResources.push({
                blockId: block.id,
                blockIndex: index,
                blockType: block.type,
                dynamicResources
            })
        })

        // 输出报告
        let totalDynamicActions = 0
        let totalAdditionalImages = 0

        blockResources.forEach(br => {
            if (br.dynamicResources.length > 0) {
                console.log(`\nBlock ${br.blockIndex} [${br.blockType}] (${br.blockId.substring(0, 20)}...):`)
                br.dynamicResources.forEach(dr => {
                    console.log(`  [${dr.actionType}] target=${dr.target.substring(0, 15)}...`)
                    if (dr.pose) console.log(`    → pose: ${dr.pose}`)
                    if (dr.expression) console.log(`    → expression: ${dr.expression}`)
                    console.log(`    → additional images: ${dr.additionalImages}`)
                    totalAdditionalImages += dr.additionalImages
                })
                totalDynamicActions += br.dynamicResources.length
            }
        })

        console.log(`\n========================================`)
        console.log(`Total Blocks: ${blockResources.length}`)
        console.log(`Total Dynamic Actions (set_character): ${totalDynamicActions}`)
        console.log(`Total Additional Images from Actions: ${totalAdditionalImages}`)

        // 这个测试主要是信息收集，只验证基本结构
        expect(blockResources.length).toBe(scene.script.length)
    })

    /**
     * AUDIT-03: 预加载完整性验证
     * 比较 collectAssets 收集的资源与实际使用的资源
     * 
     * 这个测试验证了当前 ScenePreviewDialog 的预加载策略是否完整
     */
    it('AUDIT-03: Verify preload completeness (setup-only vs full scan)', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode) throw new Error('Episode not found')
        const scene = episode.scenes[0]
        if (!scene) throw new Error('Scene not found')

        console.log('\n========== PRELOAD COMPLETENESS VERIFICATION ==========')

        const { collectAssets } = useAssetLoader()

        // 1. 只传 setup (当前 ScenePreviewDialog 的做法)
        const { imageUrls: setupOnlyUrls } = collectAssets(scene.setup, null)
        console.log(`\n[Strategy 1] Setup only: ${setupOnlyUrls.size} images collected`)

        // 2. 传 setup + 每个 block (完整扫描)
        const allBlockUrls = new Set<string>()
        scene.script.forEach((block: ScriptBlock) => {
            const { imageUrls } = collectAssets(scene.setup, block)
            imageUrls.forEach(url => allBlockUrls.add(url))
        })
        console.log(`[Strategy 2] Setup + all blocks: ${allBlockUrls.size} images collected`)

        // 3. 比较差异
        const missingInSetupOnly = new Set<string>()
        allBlockUrls.forEach(url => {
            if (!setupOnlyUrls.has(url)) {
                missingInSetupOnly.add(url)
            }
        })

        if (missingInSetupOnly.size > 0) {
            console.log(`\n⚠️  MISSING ${missingInSetupOnly.size} images when only scanning setup:`)
            let count = 0
            missingInSetupOnly.forEach(url => {
                if (count < 5) { // 只显示前5个
                    console.log(`  - ${url.substring(0, 60)}...`)
                }
                count++
            })
            if (count > 5) {
                console.log(`  ... and ${count - 5} more`)
            }

            // 如果有缺失，这是一个需要关注的问题
            console.log(`\n💡 RECOMMENDATION: ScenePreviewDialog should scan all blocks for complete preloading`)
        } else {
            console.log(`\n✅ All resources covered by setup-only scan`)
            console.log(`   (This means all dynamic resources are already covered by character state traversal)`)
        }

        // 验证基本功能正常
        expect(setupOnlyUrls.size).toBeGreaterThan(0)

        // 记录覆盖率
        const coverageRate = allBlockUrls.size > 0
            ? ((allBlockUrls.size - missingInSetupOnly.size) / allBlockUrls.size * 100).toFixed(1)
            : '100'
        console.log(`\nPreload Coverage Rate: ${coverageRate}%`)
    })

    /**
     * AUDIT-04: 完整预加载场景资源收集
     * 演示推荐的完整资源收集方法
     */
    it('AUDIT-04: Full scene resource collection (recommended approach)', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode) throw new Error('Episode not found')
        const scene = episode.scenes[0]
        if (!scene) throw new Error('Scene not found')

        const { collectAssets } = useAssetLoader()

        // 推荐做法：遍历所有 Blocks 收集资源
        const fullImageUrls = new Set<string>()
        const fullAudioUrls = new Set<string>()

        // Step 1: Setup
        const { imageUrls: setupImages, audioUrls: setupAudio } = collectAssets(scene.setup, null)
        setupImages.forEach(url => fullImageUrls.add(url))
        setupAudio.forEach(url => fullAudioUrls.add(url))

        // Step 2: All Blocks
        scene.script.forEach((block: ScriptBlock) => {
            const { imageUrls, audioUrls } = collectAssets(scene.setup, block)
            imageUrls.forEach(url => fullImageUrls.add(url))
            audioUrls.forEach(url => fullAudioUrls.add(url))
        })

        console.log('\n========== RECOMMENDED PRELOAD STRATEGY ==========')
        console.log(`Total unique images: ${fullImageUrls.size}`)
        console.log(`Total unique audio: ${fullAudioUrls.size}`)
        console.log(`Total blocks scanned: ${scene.script.length}`)

        // 验证完整收集结果
        expect(fullImageUrls.size).toBeGreaterThanOrEqual(setupImages.size)
    })

    /**
     * AUDIT-05: 表情资源覆盖验证
     * 专门验证表情资源是否被正确收集 (针对 V7 数据结构)
     */
    it('AUDIT-05: Expression resource coverage verification', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode) throw new Error('Episode not found')
        const scene = episode.scenes[0]
        if (!scene) throw new Error('Scene not found')

        console.log('\n========== EXPRESSION RESOURCE AUDIT ==========')

        // 收集所有可能用到的表情ID
        const usedExpressionIds = new Set<string>()

        // 1. Setup 中的表情
        // character type 已移除，Setup 中不再收集对象的表情

        // 2. Block Actions 中的表情
        for (const block of scene.script) {
            if ((block as any).actions) {
                for (const action of (block as any).actions) {
                    if (action.type === 'set_transform' && action.params?.expression) {
                        usedExpressionIds.add(action.params.expression)
                    }
                }
            }
        }

        console.log(`\nTotal expressions referenced: ${usedExpressionIds.size}`)

        // 验证每个表情是否可解析
        let resolvableCount = 0
        let unresolvableCount = 0

        usedExpressionIds.forEach(exprId => {
            const expr = expressionStore.getExpression(exprId)
            if (expr?.defaultFrame?.url) {
                resolvableCount++
                console.log(`  ✓ ${exprId}: ${expr.name || 'unnamed'}`)
            } else {
                unresolvableCount++
                console.log(`  ✗ ${exprId}: NOT FOUND in expressionStore`)
            }
        })

        console.log(`\nResolvable: ${resolvableCount}, Unresolvable: ${unresolvableCount}`)

        // 验证：所有引用的表情都应该可解析
        if (usedExpressionIds.size > 0) {
            expect(unresolvableCount).toBe(0)
        }
    })
})
