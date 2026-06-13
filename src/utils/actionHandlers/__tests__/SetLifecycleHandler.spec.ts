/**
 * SetLifecycleHandler unit tests.
 *
 * Runtime hierarchy changes are scene-level set_scene_structure actions. Lifecycle
 * actions only control spawned state and entity composite spawned cascades.
 */

import { describe, expect, it } from 'vitest'

import type { SetLifecycleAction } from '@/types/screenplay'
import type { ActionHandlerContext, WriteableState } from '@/utils/actionHandlers/types'

import { SetLifecycleHandler } from '../handlers/SetLifecycleHandler'

function makeAction(target: string, spawned: boolean): SetLifecycleAction {
    return {
        id: 'test-action',
        target,
        type: 'set_lifecycle',
        category: 'point',
        slotIndex: 0,
        params: { spawned },
    }
}

function makeContext(states: Map<string, WriteableState>): ActionHandlerContext {
    return {
        getObjectState: (id: string) => states.get(id),
        objects: [...states.values()],
    }
}

describe('SetLifecycleHandler', () => {
    it('should have correct metadata', () => {
        expect(SetLifecycleHandler.type).toBe('set_lifecycle')
        expect(SetLifecycleHandler.isPointAction).toBe(true)
        expect(SetLifecycleHandler.isDurationAction).toBe(false)
        expect(SetLifecycleHandler.affectsObjectState).toBe(true)
    })

    describe('plain object lifecycle', () => {
        it('should update spawned state', () => {
            const obj: WriteableState = { id: 'obj1', spawned: false }
            const states = new Map<string, WriteableState>([['obj1', obj]])

            SetLifecycleHandler.applyToState(obj, makeAction('obj1', true), makeContext(states))

            expect(obj.spawned).toBe(true)
        })
    })

    describe('entity cascade spawn - single level', () => {
        it('should set spawned=true on all children', () => {
            const compositeState: WriteableState = {
                id: 'comp1',
                type: 'composite',
                compositeMode: 'entity',
                childIds: ['child1', 'child2'],
                spawned: false,
            }
            const child1: WriteableState = { id: 'child1', spawned: false }
            const child2: WriteableState = { id: 'child2', spawned: false }

            const states = new Map<string, WriteableState>([
                ['comp1', compositeState],
                ['child1', child1],
                ['child2', child2],
            ])

            SetLifecycleHandler.applyToState(
                compositeState,
                makeAction('comp1', true),
                makeContext(states),
            )

            expect(compositeState.spawned).toBe(true)
            expect(child1.spawned).toBe(true)
            expect(child2.spawned).toBe(true)
        })
    })

    describe('entity cascade spawn - nested', () => {
        it('should recursively set spawned=true on all descendants', () => {
            const root: WriteableState = {
                id: 'root',
                type: 'composite',
                compositeMode: 'entity',
                childIds: ['mid'],
                spawned: false,
            }
            const mid: WriteableState = {
                id: 'mid',
                type: 'composite',
                compositeMode: 'union',
                childIds: ['leaf'],
                spawned: false,
            }
            const leaf: WriteableState = { id: 'leaf', spawned: false }

            const states = new Map<string, WriteableState>([
                ['root', root],
                ['mid', mid],
                ['leaf', leaf],
            ])

            SetLifecycleHandler.applyToState(root, makeAction('root', true), makeContext(states))

            expect(root.spawned).toBe(true)
            expect(mid.spawned).toBe(true)
            expect(leaf.spawned).toBe(true)
        })
    })

    describe('entity cascade despawn - nested', () => {
        it('should recursively set spawned=false on all descendants', () => {
            const root: WriteableState = {
                id: 'root',
                type: 'composite',
                compositeMode: 'entity',
                childIds: ['mid'],
                spawned: true,
            }
            const mid: WriteableState = {
                id: 'mid',
                type: 'composite',
                compositeMode: 'entity',
                childIds: ['leaf'],
                spawned: true,
            }
            const leaf: WriteableState = { id: 'leaf', spawned: true }

            const states = new Map<string, WriteableState>([
                ['root', root],
                ['mid', mid],
                ['leaf', leaf],
            ])

            SetLifecycleHandler.applyToState(root, makeAction('root', false), makeContext(states))

            expect(root.spawned).toBe(false)
            expect(mid.spawned).toBe(false)
            expect(leaf.spawned).toBe(false)
        })
    })

    describe('union composite lifecycle', () => {
        it('should not mutate hierarchy when spawned changes', () => {
            const compositeState: WriteableState = {
                id: 'comp1',
                type: 'composite',
                compositeMode: 'union',
                childIds: ['child1'],
                spawned: true,
            }
            const child1: WriteableState = {
                id: 'child1',
                parentId: 'comp1',
                spawned: true,
                x: 10,
                y: 20,
            }
            const states = new Map<string, WriteableState>([
                ['comp1', compositeState],
                ['child1', child1],
            ])

            SetLifecycleHandler.applyToState(
                compositeState,
                makeAction('comp1', false),
                makeContext(states),
            )

            expect(compositeState.spawned).toBe(false)
            expect(child1.spawned).toBe(true)
            expect(child1.parentId).toBe('comp1')
            expect(child1.x).toBe(10)
            expect(child1.y).toBe(20)
            expect(compositeState.childIds).toEqual(['child1'])
        })
    })
})
