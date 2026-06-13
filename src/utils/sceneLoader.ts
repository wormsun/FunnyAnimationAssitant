import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { SceneObject } from '@/types/sceneObject'
import type { SceneSetup } from '@/types/screenplay'
import { getActorByCharacterId } from '@/utils/actorUtils'
import { reconcileSetupHierarchy, warnHierarchyIssues } from '@/utils/hierarchyUtils'
import { reconcileRenderChain } from '@/utils/renderChainUtils'

/**
 * 从 SceneSetup 加载对象到 sceneObjectStore
 *
 * Phase 2: 对象加载委托 sceneObjectStore.fromSetupObject()，
 * 本函数仅负责相机加载和角色名称解析回调注入。
 *
 * v19: 加载完成后初始化 renderChain（优先使用持久化数据，否则自动构建）
 *
 * @param options.skipCamera 跳过相机创建（人物/模板编辑器自行管理相机）
 * @param options.skipAmbientLight 跳过环境光创建（人物/模板编辑器不需要光照）
 */
export function loadSetupToSceneObjects(
    setup: SceneSetup,
    options?: { skipCamera?: boolean; skipAmbientLight?: boolean },
) {
    const sceneObjectStore = useSceneObjectStore()
    const projectStore = useProjectStore()
    const hierarchyResult = reconcileSetupHierarchy(setup)
    warnHierarchyIssues('loadSetupToSceneObjects', hierarchyResult.warnings)

    // 双层架构：loadSetupToSceneObjects 应将数据加载到 setupObjects（持久层）。
    // 由于 addObject/fromSetupObject 在 Action Mode 下会写入 runtimeObjects，
    // 需要临时切换为 Setup Mode 加载，完成后再恢复 Action Mode 并重建 runtimeObjects。
    const wasActionMode = sceneObjectStore.getIsActionMode()
    if (wasActionMode) {
        // 临时退出 Action Mode（isActionMode=false, runtimeObjects 清空）
        sceneObjectStore.setActionMode(false)
    }

    sceneObjectStore.clearObjects()

    // v6.9: 加载相机 - 只使用中心点和 zoom，尺寸固定为 1456 x 819
    if (!options?.skipCamera) {
        const camera = setup.camera
        if (camera) {
            sceneObjectStore.createCameraObject('相机', {
                x: camera.x,
                y: camera.y
            }, camera.zoom ?? 1.0)
            const cameraObj = sceneObjectStore.objects.find(obj => obj.type === 'camera')
            if (cameraObj) {
                const zoom = camera.zoom ?? 1.0
                sceneObjectStore.updateObject(cameraObj.id, {
                    width: CAMERA_BASE_WIDTH / zoom,
                    height: CAMERA_BASE_HEIGHT / zoom
                })
            }
        }
    }

    // v25: 自动创建环境光（如不存在）— 与相机相同的单例模式
    // v25.6: 人物/模板编辑器不需要光照，通过 skipAmbientLight 跳过
    if (!options?.skipAmbientLight) {
        const hasAmbientLight = setup.objects.some(
            (o: SceneObject) => o.type === 'light' && (o as import('@/types/sceneObject').LightObject).lightType === 'ambient'
        )
        if (!hasAmbientLight) {
            sceneObjectStore.createLightObject('ambient', '环境光', {
                lightColor: '#ffffff',
                lightIntensity: 1.0,
            })
        }
    }

    // Phase 2: 委托 Store 反序列化，消除散弹式 type switch
    // 角色名称解析通过回调注入，避免 Store 耦合 projectStore/actorUtils
    const resolveActorName = (refId: string, actorId?: string) => {
        const actor = actorId ? projectStore.getActor(actorId) : getActorByCharacterId(refId)
        if (!actor && !actorId) return null
        return {
            displayName: actor?.name ?? '未知角色',
            resolvedActorId: actorId ?? (actor?.id ?? '')
        }
    }

    for (const objData of setup.objects) {
        sceneObjectStore.fromSetupObject(objData, resolveActorName)
    }

    // Clip-Mask Phase 1：所有对象创建完毕后回填 mask.targetIds 并执行独占校验/脏数据清理。
    sceneObjectStore.finalizeMaskTargets()

    // v19: 初始化场景渲染链
    if (setup.renderChain && setup.renderChain.length > 0) {
        // 从持久化数据恢复，并增量补齐新规则下应入链的对象（如文本）。
        sceneObjectStore.setSceneRenderChain(
            reconcileRenderChain(setup.renderChain, sceneObjectStore.setupState.objects)
        )
    } else {
        // 旧项目迁移：自动构建渲染链
        sceneObjectStore.rebuildSceneRenderChain()
    }

    // v19: 为缺失 renderChain 的 entity composite 补建（旧数据迁移 + 首次加载）
    sceneObjectStore.rebuildEntityRenderChains()

    // v16: animations 已持久化到项目文件，加载时由 fromSetupObject 统一恢复
    // 不再需要运行时 hydrate

    // 双层架构：恢复 Action Mode，重建 runtimeObjects
    if (wasActionMode) {
        sceneObjectStore.setActionMode(true) // 深拷贝 setupObjects → runtimeObjects
    }
}

/**
 * 从 sceneObjectStore 收集 Setup 数据
 *
 * 双层架构：始终从 setupObjects（持久层）序列化，确保 Action Mode 运行时状态不会泄漏
 *
 * v19: 包含 renderChain
 */
export function collectSetupFromSceneObjects(): SceneSetup {
    const sceneObjectStore = useSceneObjectStore()

    // 双层架构：从持久层读取，而非 objects computed 代理
    const setupObjs = sceneObjectStore.setupState.objects as SceneObject[]
    const camera = setupObjs.find(obj => obj.type === 'camera')

    // PT Phase 8.2: 委托 Store 序列化，消除散弹式 type switch
    const objects: SceneObject[] = setupObjs
        .filter(obj => {
            if (obj.type === 'camera') return false
            // v25.1: 环境光和点光源都持久化到 setup.objects
            // 环境光不再排除 — 用户修改的颜色/强度需要保存给 ScenePlayer 使用
            return true
        })
        .map(obj => sceneObjectStore.toSetupObject(obj))

    return {
        camera: camera ? {
            x: camera.x,  // 直接使用中心坐标
            y: camera.y,
            width: camera.width,
            height: camera.height,
            zoom: (camera as unknown as { zoom?: number }).zoom ?? 1.0  // 从相机对象读取 zoom
        } : {
            x: CANVAS_CENTER_X,
            y: CANVAS_CENTER_Y,
            width: CAMERA_BASE_WIDTH,
            height: CAMERA_BASE_HEIGHT,
            zoom: 1.0
        },
        objects,
        renderChain: sceneObjectStore.getSceneRenderChain(),
    }
}
