/**
 * Mask 序列化器（Clip-Mask Phase 1）
 *
 * 详见 doc-prd/clip-mask-design.md（v2.1）。
 *
 * 特化字段：
 * - shape: 'rectangle' | 'ellipse'
 * - mode:  'inside_visible'（Phase 1 仅一种值；脏数据降级 + warn）
 * - targetIds: string[]（被裁切目标 id 列表）
 *
 * 反序列化两阶段：
 * 1) 当前 deserialize：用空 targetIds 创建对象，把读到的 targetIds 暂存到 ctx.pendingMaskTargets。
 * 2) 由 sceneObjectStore.finalizeMaskTargets() 在所有对象就绪后回填，并清理：
 *    死引用 / 非法类型 / mask→mask 嵌套 / 同 target 多 mask 冲突。
 */

import type { MaskMode, MaskObject, MaskShape, SceneObject } from '@/types/sceneObject'

import type { DeserializeContext, TypeSerializer } from './index'
import { registerTypeSerializer } from './index'

const ALLOWED_SHAPES: ReadonlySet<MaskShape> = new Set<MaskShape>(['rectangle', 'ellipse'])
const ALLOWED_MODES: ReadonlySet<MaskMode> = new Set<MaskMode>(['inside_visible'])

const maskSerializer: TypeSerializer = {
    serializeFields(obj: SceneObject, base: Record<string, unknown>): void {
        const mask = obj as MaskObject
        base['shape'] = mask.shape
        base['mode'] = mask.mode
        base['targetIds'] = Array.isArray(mask.targetIds) ? [...mask.targetIds] : []
    },

    deserialize(objData: SceneObject, ctx: DeserializeContext): void {
        const raw = objData as MaskObject

        // 形状：未知值降级为 rectangle + warn
        let shape: MaskShape = 'rectangle'
        if (raw.shape && ALLOWED_SHAPES.has(raw.shape)) {
            shape = raw.shape
        } else if (raw.shape) {
            console.warn(`[mask] unknown shape '${raw.shape}' for mask ${raw.id}; fallback to 'rectangle'`)
        }

        // 模式：Phase 1 仅 inside_visible，脏数据降级 + warn
        let mode: MaskMode = 'inside_visible'
        if (raw.mode && ALLOWED_MODES.has(raw.mode)) {
            mode = raw.mode
        } else if (raw.mode) {
            console.warn(`[mask] unsupported mode '${raw.mode}' for mask ${raw.id}; downgraded to 'inside_visible' (Phase 1)`)
        }

        const created = ctx.createMaskObject(
            objData.name ?? '蒙版',
            shape,
            { mode },
            objData.id,
            objData.alias ?? '',
        )

        ctx.updateObject<MaskObject>(created.id, {
            x: objData.x,
            y: objData.y,
            width: objData.width ?? 200,
            height: objData.height ?? 200,
            scaleX: objData.scaleX ?? 1,
            scaleY: objData.scaleY ?? 1,
            rotation: objData.rotation ?? 0,
            zIndex: objData.zIndex,
            flipX: objData.flipX ?? false,
            visible: objData.visible ?? true,
            alpha: objData.alpha ?? 1,
            spawned: objData.spawned ?? true,
            transformOriginX: objData.transformOriginX,
            transformOriginY: objData.transformOriginY,
            parentId: objData.parentId,
        })

        // 缓存 targetIds，等所有对象就绪后由 finalizeMaskTargets 回填
        const targets = Array.isArray(raw.targetIds)
            ? raw.targetIds.filter((t): t is string => typeof t === 'string' && t.length > 0)
            : []
        ctx.pendingMaskTargets.set(created.id, targets)
    },
}

registerTypeSerializer('mask', maskSerializer)
