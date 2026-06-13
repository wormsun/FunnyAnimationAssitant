import { describe, expect, it } from 'vitest'

import type { SceneSetup, SceneObject } from '@/types/screenplay'


import { compareObjectState, getStartStateFromSetup, isStateDiffEmpty } from '../stateUtils'

describe('stateUtils', () => {

    // --- compareObjectState ---
    describe('compareObjectState', () => {
        const base = {
            id: 'test', type: 'prop', name: 'test', refId: 'ref',
            x: 0, y: 0, width: 0, height: 0,
            scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, visible: true, zIndex: 0,
            flipX: false
        } as SceneObject

        it('should detect transform changes', () => {
            const current = { ...base, x: 100, alpha: 0.5 }
            const diff = compareObjectState(base, current)

            expect(diff.transform).toBeDefined()
            expect(diff.transform?.x).toBe(100)
            expect(diff.transform?.alpha).toBe(0.5)
            // Unchanged props should not be in diff
            expect(diff.transform?.y).toBeUndefined()
        })

        it('should detect character pose/expression changes', () => {
            const baseChar = { ...base, pose: 'normal', expression: 'idle' }
            const currentChar = { ...baseChar, pose: 'attack', expression: 'angry' }

            const diff = compareObjectState(baseChar, currentChar)

            // character 类型已移除，这些字段不再触发 diff
            expect(diff.transform).toBeUndefined()
        })

        it('should detect V7 layerPresetId changes', () => {
            const baseChar = { ...base, layerPresetId: 'preset1' }
            const currentChar = { ...baseChar, layerPresetId: 'preset2' }

            const diff = compareObjectState(baseChar, currentChar)

            // character 类型已移除，layerPresetId 不再产生 diff
            expect(diff.transform).toBeUndefined()
        })

        it('should detect deep partAssetOverrides changes', () => {
            const baseChar = {
                ...base,
                type: 'prop',
                partAssetOverrides: { head: 'a1' }
            } as SceneObject
            // Case 1: Value change
            const diff1 = compareObjectState(baseChar, { ...baseChar, partAssetOverrides: { head: 'a2' } } as SceneObject)
            // character 类型已移除，partAssetOverrides 变更不产生 diff
            expect(diff1.transform).toBeUndefined()

            // Case 2: Key addition
            const diff2 = compareObjectState(baseChar, { ...baseChar, partAssetOverrides: { head: 'a1', body: 'b1' } } as SceneObject)
            expect(diff2.transform).toBeUndefined()

            // Case 3: Identity check (same content, different object ref) -> Should NOT diff if simplified JSON logic holds
            // The implementation uses JSON.stringify for comparison
            const sameContent = { ...baseChar, partAssetOverrides: { head: 'a1' } } as SceneObject
            const diff3 = compareObjectState(baseChar, sameContent)
            expect(diff3.transform).toBeUndefined()
        })
    })

    // --- isStateDiffEmpty ---
    describe('isStateDiffEmpty', () => {
        it('should return true for empty diff', () => {
            expect(isStateDiffEmpty({})).toBe(true)
        })

        it('should return false if any prop present', () => {
            expect(isStateDiffEmpty({ transform: { x: 1 } })).toBe(false)
            expect(isStateDiffEmpty({ active: { visible: false } })).toBe(false)
        })
    })

    // --- getStartStateFromSetup ---
    describe('getStartStateFromSetup', () => {
        const mockSetupObj = {
            id: 'instance_1',
            type: 'prop',
            refId: 'char_1',
            name: 'Hero',
            actorId: 'actor_1',
            alias: 'Hero',
            x: 10, y: 20,
            width: 0, height: 0,
            scaleX: 1, scaleY: 1,
            rotation: 0,
            zIndex: 5,
            alpha: 1,
            flipX: false,
            visible: true,
            // V7 fields
            layerPresetId: 'preset_setup',
            pose: 'pose_setup',
            expression: 'expr_setup',
            partAssetOverrides: { head: 'h_setup' }
        } as SceneObject & Record<string, unknown>

        const mockSetup: SceneSetup = {
            camera: { x: 0, y: 0, zoom: 1, width: 1920, height: 1080 },
            objects: [mockSetupObj],
            renderChain: ['instance_1'],
        }

        it('should extract state fields correctly', () => {
            const startState = getStartStateFromSetup(mockSetup, {} as any, 'instance_1')

            expect(startState).not.toBeNull()
            expect(startState?.x).toBe(10)
        })

        it('should handle state extraction gracefully', () => {
            const simpleObj = { ...mockSetupObj }

            const simpleSetup = { ...mockSetup, objects: [simpleObj] }

            const startState = getStartStateFromSetup(simpleSetup, {} as SceneObject, 'instance_1')
            expect(startState).toBeDefined()
        })

        it('should handle camera target', () => {
            const startState = getStartStateFromSetup(mockSetup, {} as SceneObject, 'camera')
            // camera 伪 SceneObject 不再包含 zoom 字段（Phase 4e）
            expect(startState?.x).toBe(0)
        })
    })

})
