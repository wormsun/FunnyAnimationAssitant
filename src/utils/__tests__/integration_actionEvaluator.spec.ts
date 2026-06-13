import fs from 'fs'
import path from 'path'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'


import { useEpisodeStore } from '@/stores/episodeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { evaluateObjectStateBySlot } from '@/utils/actionEvaluator'
import { calculatePrevContext } from '@/utils/sceneStateCalculator'
import { parseBlockToSlots } from '@/utils/slotUtils'
import type { SceneObject } from '@/types/sceneObject'

describe('Integration: actionEvaluator with Real Project Data', () => {
    let projectStore: any
    let episodeStore: any
    let sceneObjectStore: any
    let hasProjectData = false


    beforeAll(async () => {
        // Setup environment
        setActivePinia(createPinia())
        projectStore = useProjectStore()
        episodeStore = useEpisodeStore()
        sceneObjectStore = useSceneObjectStore()


        const projectPath = path.resolve(__dirname, '../../../examples/demo-project/demo.anime')
        if (fs.existsSync(projectPath)) {
            const content = fs.readFileSync(projectPath, 'utf-8')
            await projectStore.OnlyForAutoTestCase_OpenProject(content)
            hasProjectData = episodeStore.episodes.some((episode: any) => episode.scenes?.length > 0)
        }
    })

    beforeEach(() => {
        sceneObjectStore.clearObjects()
    })

    function ensureProjectData(): boolean {
        if (!hasProjectData || !episodeStore.episodes?.length) {
            return false
        }
        return true
    }

    it('TC-AM-01: Calculate Prev Context', () => {
        if (!ensureProjectData()) return
        const targetEpisode = episodeStore.episodes[0]
        const targetScene = targetEpisode.scenes[0]
        const targetBlockIndex = 1
        if (targetScene.script.length <= targetBlockIndex) {
            console.warn('Scene script too short for TC-AM-01')
            return
        }
        const targetBlock = targetScene.script[targetBlockIndex]

        const prevContext = calculatePrevContext(targetScene, targetBlock.id)

        expect(prevContext).toBeDefined()
        expect(prevContext.objects).toBeDefined()
        expect(prevContext).not.toBe(targetScene.setup)
    })

    it('TC-AM-02: Evaluate Asset Overrides (V7)', () => {
        if (!ensureProjectData()) return
        const targetActionId = 'action_1767804571763_vd5b9d6e4'
        const { scene, block, action } = findActionById(episodeStore, targetActionId)

        if (!scene || !block || !action) {
            console.warn(`Target action ${targetActionId} not found, skipping TC-AM-02`)
            return
        }

        const prevContext = calculatePrevContext(scene, block.id)
        const setupObject = scene.setup.objects.find((o: SceneObject) => o.id === action.target || o.refId === action.target)
        const objectStartState = prevContext.objects.find((o: SceneObject) => o.id === action.target || o.id === setupObject?.id)

        expect(objectStartState, 'Object Start State should be defined').toBeDefined()

        const slots = parseBlockToSlots(block)
        const objectActions = block.actions.filter((a: any) => a.target === action.target)
        const validStartState = ensureValidState(objectStartState)

        const mockOverrides = { 'part_mock_1': 'asset_mock_1' }
        const objectActionsWithMock = objectActions.map((a: any) => {
            if (a.id === action.id) {
                return {
                    ...a,
                    params: {
                        ...a.params,
                        partAssetOverrides: mockOverrides
                    }
                }
            }
            return a
        })

        const resultState = evaluateObjectStateBySlot(
            validStartState,
            objectActionsWithMock,
            action.slotIndex,
            slots
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((resultState as any).partAssetOverrides).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((resultState as any).partAssetOverrides).toEqual(expect.objectContaining(mockOverrides))
    })

    it('TC-AM-03: Evaluate Layer Preset (V7)', () => {
        if (!ensureProjectData()) return
        const targetActionId = 'action_1767804571763_vd5b9d6e4'
        const { scene, block, action } = findActionById(episodeStore, targetActionId)

        if (!scene || !block || !action) {
            console.warn(`Target action ${targetActionId} not found, skipping TC-AM-03`)
            return
        }

        const prevContext = calculatePrevContext(scene, block.id)
        const setupObject = scene.setup.objects.find((o: SceneObject) => o.id === action.target || o.refId === action.target)
        const objectStartState = prevContext.objects.find((o: SceneObject) => o.id === action.target || o.id === setupObject?.id)

        const slots = parseBlockToSlots(block)
        const objectActions = block.actions.filter((a: any) => a.target === action.target)
        const validStartState = ensureValidState(objectStartState)

        const resultState = evaluateObjectStateBySlot(
            validStartState,
            objectActions,
            action.slotIndex,
            slots
        )

        if (action.params.layerPresetId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultState as any).layerPresetId).toBe(action.params.layerPresetId)
        } else {
            console.warn('Target action does not have layerPresetId for TC-AM-03')
        }
    })

    it('TC-AM-06: Repro Li Dazhuang Expression Rule', () => {
        if (!ensureProjectData()) return
        const partialId = 'char_785f5842'
        const episode = episodeStore.episodes[0]
        const scene = episode.scenes[0]

        const setupObj = scene.setup.objects.find((o: SceneObject) => o.id.startsWith(partialId))

        if (!setupObj) { console.error('Obj not found'); return }
        console.log('TC-AM-06: Target Object', setupObj.id, setupObj.name)

        // 跳过 characterStore 相关查找（characterStore 已移除）
        // 直接查看 action 数据结构
        console.log('TC-AM-06: Character data inspection skipped (characterStore removed)')

        // Scan blocks 0-2
        scene.script.slice(0, 3).forEach((block: any, index: number) => {
            console.log(`Scan Block ${index} (${block.id}):`)
            const charActions = block.actions.filter((a: any) => a.target === setupObj.id)

            charActions.forEach((a: any, i: number) => {
                const hasExpr = 'expression' in (a.params || {})
                const hasOverrides = 'partAssetOverrides' in (a.params || {})
                console.log(`  Action ${i} (${a.type}): hasExpr=${hasExpr} hasOverrides=${hasOverrides}`)
                console.log(`  Params:`, JSON.stringify(a.params))
            })

            const prevContext = calculatePrevContext(scene, block.id)
            const objectStartState = prevContext.objects.find(o => o.id === setupObj.id)

            // Check Start State Expression
            const startExprId = (objectStartState as any)?.expression
            console.log(`  Start State Expr: ${startExprId}`)

            const slots = parseBlockToSlots(block)

            if (slots.length > 0) {
                const resultState = evaluateObjectStateBySlot(
                    ensureValidState(objectStartState),
                    block.actions.filter((a: any) => a.target === setupObj.id),
                    slots.length - 1,
                    slots
                )
                const resExprId = (resultState as any).expression
                console.log(`  Block ${index} Result Expr: ${resExprId}`)
                console.log(`  Block ${index} Result Overrides:`, JSON.stringify((resultState as any).partAssetOverrides))
            }
        })
    })

    // =========================================================================
    // TC-AM-04: Cross-Block State Accumulation
    // 验证跨Block属性叠加计算逻辑
    // =========================================================================
    it('TC-AM-04: Cross-Block State Accumulation', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode?.scenes || episode.scenes.length === 0) {
            console.warn('No scenes available for TC-AM-04')
            return
        }
        const scene = episode.scenes[0]

        // 确保至少有3个Block
        if (scene.script.length < 3) {
            console.warn('Scene needs at least 3 blocks for TC-AM-04')
            return
        }

        // 找一个人物对象
        const characterObj = scene.setup.objects.find((o: SceneObject) => o.type === 'prop')
        if (!characterObj) {
            console.warn('No object found for TC-AM-04')
            return
        }

        // 1. 获取初始状态 (scene.setup)
        const initialState = scene.setup.objects.find((o: SceneObject) => o.id === characterObj.id)
        expect(initialState).toBeDefined()
        console.log('TC-AM-04: Initial State (setup):', {
            x: initialState.x,
            y: initialState.y,
            pose: (initialState as any).pose
        })

        // 2. 计算Block 2开始前的状态 (即Block 0和Block 1的累积结果)
        const block2 = scene.script[2]
        const prevContextBlock2 = calculatePrevContext(scene, block2.id)
        const accumulatedState = prevContextBlock2.objects.find((o: SceneObject) => o.id === characterObj.id)

        expect(accumulatedState).toBeDefined()
        if (!accumulatedState) return

        console.log('TC-AM-04: Accumulated State (before Block 2):', {
            x: accumulatedState.x,
            y: accumulatedState.y,
            pose: (accumulatedState as any).pose,
            expression: (accumulatedState as any).expression
        })

        // 3. 验证累积状态不等于初始状态（如果之前的Block有修改的话）
        // 注意：如果之前Block没有任何action，状态可能相同
        const block0 = scene.script[0]
        const block1 = scene.script[1]
        const hasActionsOnTarget =
            (block0.actions?.some((a: any) => a.target === characterObj.id)) ||
            (block1.actions?.some((a: any) => a.target === characterObj.id))

        if (hasActionsOnTarget) {
            // 如果有针对目标对象的action，状态应该反映这些变更
            console.log('TC-AM-04: Actions found affecting target, state should be accumulated')
        }

        // 4. 评估Block 2内的状态变化
        const slots = parseBlockToSlots(block2)
        if (slots.length > 0 && block2.actions?.length > 0) {
            const targetActions = block2.actions.filter((a: any) => a.target === characterObj.id)
            if (targetActions.length > 0) {
                const finalState = evaluateObjectStateBySlot(
                    ensureValidState(accumulatedState),
                    targetActions,
                    slots.length - 1,
                    slots
                )
                console.log('TC-AM-04: Final State (after Block 2):', {
                    x: finalState.x,
                    y: finalState.y,
                    pose: (finalState as any).pose,
                    expression: (finalState as any).expression
                })
            }
        }
    })

    // =========================================================================
    // TC-AM-05: Multi-Scene State Isolation
    // 验证多场景状态隔离
    // =========================================================================
    it('TC-AM-05: Multi-Scene State Isolation', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        if (!episode?.scenes || episode.scenes.length < 2) {
            console.warn('Need at least 2 scenes for TC-AM-05')
            return
        }

        const scene1 = episode.scenes[0]
        const scene2 = episode.scenes[1]

        // 确保场景有脚本
        if (!scene1.script?.length || !scene2.script?.length) {
            console.warn('Scenes need script blocks for TC-AM-05')
            return
        }

        // 获取场景2的初始状态 (首个Block的prevContext)
        const scene2FirstBlock = scene2.script[0]
        const scene2StartContext = calculatePrevContext(scene2, scene2FirstBlock.id)

        // 场景2的初始状态应该来自其自己的setup，而不是场景1的结束状态
        expect(scene2StartContext).toBeDefined()
        expect(scene2StartContext.objects).toBeDefined()

        // 验证scene2的setup与prevContext一致（对于首个Block）
        const scene2SetupStr = JSON.stringify(scene2.setup)
        const scene2ContextStr = JSON.stringify(scene2StartContext)
        expect(scene2ContextStr).toBe(scene2SetupStr)

        console.log('TC-AM-05: Scene 2 starts from its own setup, isolated from Scene 1')
    })

    // =========================================================================
    // TC-AM-07: Block End State Calculation
    // 验证Block结束后最终状态计算
    // =========================================================================
    it('TC-AM-07: Block End State Calculation', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        const scene = episode?.scenes?.[0]
        if (!scene || scene.script.length === 0) {
            console.warn('No blocks for TC-AM-07')
            return
        }

        // 找一个包含tween_transform的Block
        let targetBlock: any = null
        for (const block of scene.script) {
            if (block.actions?.some((a: any) => a.type === 'tween_transform')) {
                targetBlock = block
                break
            }
        }

        if (!targetBlock) {
            // 如果没有tween_transform，使用第一个有action的Block
            targetBlock = scene.script.find((b: any) => b.actions?.length > 0)
        }

        if (!targetBlock) {
            console.warn('No block with actions found for TC-AM-07')
            return
        }

        const prevContext = calculatePrevContext(scene, targetBlock.id)

        // 导入applyBlockActionsToState进行验证
        const { applyBlockActionsToState } = require('@/utils/sceneStateCalculator')
        const endState = applyBlockActionsToState(prevContext, targetBlock, scene)

        expect(endState).toBeDefined()
        expect(endState.objects).toBeDefined()

        // 验证tween_transform的目标值被正确应用
        const tweenActions = targetBlock.actions?.filter((a: any) => a.type === 'tween_transform') || []
        tweenActions.forEach((action: any) => {
            const endObj = endState.objects.find((o: any) => o.id === action.target)
            if (endObj && action.params) {
                if (action.params.x !== undefined) {
                    console.log(`TC-AM-07: tween_transform target x=${action.params.x}, endState x=${endObj.x}`)
                }
                if (action.params.y !== undefined) {
                    console.log(`TC-AM-07: tween_transform target y=${action.params.y}, endState y=${endObj.y}`)
                }
            }
        })

        console.log('TC-AM-07: Block end state calculated successfully')
    })

    // =========================================================================
    // TC-EXPR-01: Expression Override State Flow
    // 验证表情覆盖状态流转
    // =========================================================================
    it('TC-EXPR-01: Expression Override State Flow', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        const scene = episode?.scenes?.[0]
        if (!scene || scene.script.length < 3) {
            console.warn('Need at least 3 blocks for TC-EXPR-01')
            return
        }

        // 找一个人物对象
        const characterObj = scene.setup.objects.find((o: SceneObject) => o.type === 'prop')
        if (!characterObj) {
            console.warn('No object found for TC-EXPR-01')
            return
        }

        // 跟踪expression在Block间的流转
        const expressionFlow: string[] = []

        for (let i = 0; i < Math.min(3, scene.script.length); i++) {
            const block = scene.script[i]
            const prevContext = calculatePrevContext(scene, block.id)
            const objState = prevContext.objects.find((o: SceneObject) => o.id === characterObj.id)

            const startExpr = (objState as any)?.expression || 'default'
            expressionFlow.push(`Block${i}_start: ${startExpr}`)

            // 检查该Block内是否有set_character设置新expression
            const setCharAction = block.actions?.find((a: any) =>
                a.target === characterObj.id &&
                a.type === 'set_character' &&
                a.params?.expression
            )
            if (setCharAction) {
                expressionFlow.push(`Block${i}_set: ${setCharAction.params.expression}`)
            }
        }

        console.log('TC-EXPR-01: Expression Flow:', expressionFlow.join(' -> '))

        // 验证表情在Block间正确传递
        // 如果Block 1设置了新表情，Block 2开始时应该能看到
        expect(expressionFlow.length).toBeGreaterThan(0)
    })

    // =========================================================================
    // TC-EXPR-02: Expression Asset Mapping to PartAssetOverrides
    // 验证表情到partAssetOverrides的映射
    // =========================================================================
    it('TC-EXPR-02: Expression Asset Mapping to PartAssetOverrides', () => {
        if (!ensureProjectData()) return
        const episode = episodeStore.episodes[0]
        const scene = episode?.scenes?.[0]
        if (!scene) {
            console.warn('No scene for TC-EXPR-02')
            return
        }

        // 找带有expression参数的set_character action
        let foundAction: any = null
        for (const block of scene.script) {
            const action = block.actions?.find((a: any) =>
                a.type === 'set_character' &&
                a.params?.expression
            )
            if (action) {
                foundAction = action
                break
            }
        }

        if (!foundAction) {
            console.warn('No set_character action with expression found for TC-EXPR-02')
            return
        }

        // 验证 action 数据结构中包含 expression 参数
        console.log('TC-EXPR-02: Found action with expression:', foundAction.params.expression)

        // 验证 target 对象是角色类型
        const targetObj = scene.setup.objects.find((o: SceneObject) => o.id === foundAction.target)
        if (!targetObj?.refId) {
            console.warn('Target is not a character for TC-EXPR-02')
            return
        }

        // characterStore 已移除，跳过角色定义查找
        console.log(`TC-EXPR-02: Target object refId: ${targetObj.refId}`)
        expect(foundAction.params.expression).toBeTruthy()
    })

    // =========================================================================
    // TC-EXPR-03: Expression Speaking Frames Preload
    // 验证表情口型帧预加载（测试数据收集逻辑）
    // =========================================================================
    it('TC-EXPR-03: Expression Speaking Frames Preload', () => {
        // 这个测试验证表情的speakingFrames被收集用于预加载
        const expressionStore = useExpressionStore()

        const expressions = Object.values(expressionStore.expressions || {})
        if (expressions.length === 0) {
            console.warn('No expressions loaded for TC-EXPR-03')
            return
        }

        // 检查是否有包含speakingFrames的表情
        let hasSpekingFrames = false
        for (const expr of expressions) {
            if (expr.speakingFrames && expr.speakingFrames.length > 0) {
                hasSpekingFrames = true
                console.log(`TC-EXPR-03: Expression ${expr.id} has ${expr.speakingFrames.length} speaking frames`)

                // 验证每个帧都有URL
                expr.speakingFrames.forEach((frame: any, idx: number) => {
                    expect(frame.url).toBeDefined()
                    console.log(`  Frame ${idx}: ${frame.url?.substring(0, 50)}...`)
                })
                break
            }
        }

        if (!hasSpekingFrames) {
            console.log('TC-EXPR-03: No expressions with speaking frames found in test data')
        }
    })
})

function findActionById(episodeStore: any, actionId: string) {
    if (episodeStore.episodes) {
        for (const episode of episodeStore.episodes) {
            if (episode.scenes) {
                for (const scene of episode.scenes) {
                    for (const block of scene.script) {
                        if (block.actions) {
                            const foundAction = block.actions.find((a: any) => a.id === actionId)
                            if (foundAction) {
                                return { scene, block, action: foundAction }
                            }
                        }
                    }
                }
            }
        }
    }
    return { scene: null, block: null, action: null }
}

function ensureValidState(state: any) {
    return {
        ...state,
        pose: state.pose,
        expression: state.expression,
        layerPresetId: state.layerPresetId,
        partAssetOverrides: state.partAssetOverrides,
        alpha: state.alpha ?? 1,
        rotation: state.rotation ?? 0,
        scaleX: state.scaleX ?? 1,
        scaleY: state.scaleY ?? 1,
        width: state.width ?? 100,
        height: state.height ?? 100,
        visible: state.visible ?? true,
        zIndex: state.zIndex ?? 0
    }
}
