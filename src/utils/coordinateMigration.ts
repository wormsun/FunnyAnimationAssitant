/**
 * v1→v2 坐标迁移
 *
 * v1: prop/background 的 x/y 是左上角坐标
 * v2: 所有对象统一使用中心坐标
 *
 * 迁移公式（左上角 → 中心）：
 *   newX = oldX + (width * scaleX) / 2
 *   newY = oldY + (height * scaleY) / 2
 *
 * camera / screen_effect 已经是中心坐标，不需要迁移。
 */

import type { ProjectData } from '@/types/project'

/** 需要迁移坐标的对象类型（v1 存储左上角坐标的类型） */
const TYPES_NEEDING_MIGRATION: ReadonlySet<string> = new Set([
    'prop',
    'background',
])

interface MigratableObject {
    type: string
    x: number
    y: number
    width: number
    height: number
    scaleX: number
    scaleY: number
}

/**
 * 将单个对象的坐标从左上角转为中心
 */
function migrateObjectCoordinate(obj: MigratableObject): void {
    if (!TYPES_NEEDING_MIGRATION.has(obj.type)) return

    // 防御：width/height 为 0 时无法精确迁移（Background 首次创建未加载纹理）
    // 但已保存的项目中 width/height 通常不为 0（渲染时已同步更新到 store）
    const halfW = (obj.width * obj.scaleX) / 2
    const halfH = (obj.height * obj.scaleY) / 2

    obj.x = obj.x + halfW
    obj.y = obj.y + halfH
}

/**
 * 将 ProjectData 从 v1 格式迁移到 v2 格式
 * - 遍历所有 episode → scene → setup.objects，迁移坐标
 * - 更新 meta.version 为 '2.0.0'
 */
export function migrateV1ToV2(projectData: ProjectData): void {
    const episodes = projectData.episodes as {
        scenes?: {
            setup?: {
                objects?: MigratableObject[]
            }
            script?: {
                actions?: {
                    type: string
                    target: string
                    params?: Record<string, unknown>
                }[]
            }[]
        }[]
    }[] | undefined

    if (!episodes) return

    for (const episode of episodes) {
        if (!episode.scenes) continue

        for (const scene of episode.scenes) {
            // 迁移 setup.objects 中的坐标
            if (scene.setup?.objects) {
                for (const obj of scene.setup.objects) {
                    migrateObjectCoordinate(obj)
                }
            }

            // 注意：Action 中的 x/y 参数（如 set_transform, tween_transform）
            // 这些存储的是 action 目标坐标，也应当是中心坐标语义。
            // 但由于 Action 中的坐标来源于拖拽写回（getObjectPositionFromContainer），
            // 而 v1 的写回逻辑已经做了 offset 处理，Action 中存的值与 obj.x/y 语义一致（左上角）。
            // 因此 Action 中的坐标也需要迁移。
            if (scene.script) {
                for (const block of scene.script) {
                    if (!block.actions) continue
                    for (const action of block.actions) {
                        migrateActionCoordinate(action, scene.setup?.objects)
                    }
                }
            }
        }
    }

    // 更新版本号
    projectData.meta.version = '2.0.0'
}

/**
 * 迁移 Action 中的坐标参数
 *
 * 需要迁移的 Action 类型：
 * - set_transform: params.x/y（如果 target 是需要迁移的类型）
 * - tween_transform: params.x/y（同上）
 * - camera_cut / camera_move: target='camera'，已经是中心坐标，不迁移
 */
function migrateActionCoordinate(
    action: { type: string; target: string; params?: Record<string, unknown> },
    setupObjects?: MigratableObject[]
): void {
    if (!action.params) return

    // camera 动作不需要迁移
    if (action.target === 'camera') return

    // 只处理包含 x/y 的 action 类型
    const actionTypesWithCoords = ['set_transform', 'tween_transform']
    if (!actionTypesWithCoords.includes(action.type)) return

    // 如果 action 中没有 x 或 y 参数，跳过
    const hasX = action.params['x'] !== undefined
    const hasY = action.params['y'] !== undefined
    if (!hasX && !hasY) return

    // 查找 target 对象以获取 width/height
    // 注意：setupObjects 中的坐标此时已经被迁移了，但 width/height/scale 不变
    const targetObj = setupObjects?.find(
        (obj) => (obj as unknown as { id: string }).id === action.target
    ) as (MigratableObject & { id: string }) | undefined

    if (!targetObj) return
    if (!TYPES_NEEDING_MIGRATION.has(targetObj.type)) return

    const halfW = (targetObj.width * targetObj.scaleX) / 2
    const halfH = (targetObj.height * targetObj.scaleY) / 2

    if (hasX) {
        action.params['x'] = (action.params['x'] as number) + halfW
    }
    if (hasY) {
        action.params['y'] = (action.params['y'] as number) + halfH
    }
}
