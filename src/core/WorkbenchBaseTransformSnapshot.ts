/**
 * WorkbenchBaseTransformSnapshot
 *
 * 动画工作台预览路径所需的「容器基准姿态快照」工具函数。
 *
 * 职责：
 * - capture：读取 PIXI.Container 当前的 position / scale / rotation / alpha / pivot / localBounds，
 *   封装成可序列化的 ContainerBaseState。
 * - apply：把快照写回容器（只还原几何量，不触碰 filters / AnimatedSprite 帧）。
 *
 * 设计要点：
 * - 纯函数、无副作用（除了显式写入容器）、无外部状态依赖，便于单元测试。
 * - 快照中的 pivot 必须被还原——切换到空动画时，若不恢复 pivot，
 *   容器会残留上一条轨道的 track.pivot 值，导致对象整体偏移。
 * - filter 清理与 AnimatedSprite 还帧属于业务侧状态（per-key filter bundle、asset loader），
 *   由调用方在 capture/apply 前后自行处理，不在本模块责任范围内。
 */

import type * as PIXI from 'pixi.js'

export interface ContainerBaseState {
    /** 对象 ID（TARGET_SELF 时为 null） */
    objectId: string | null
    position: { x: number; y: number }
    scale: { x: number; y: number }
    pivot: { x: number; y: number }
    rotation: number
    alpha: number
    bounds: { width: number; height: number; x: number; y: number }
}

/**
 * 从容器当前状态读取并返回一份独立的基准快照。
 *
 * 返回对象的所有字段都是新的 plain object/number，后续对容器的改动不会影响快照。
 * localBounds 通过 `container.getLocalBounds()` 计算（PIXI 内部带缓存，多次调用代价低）。
 */
export function captureContainerBaseState(
    container: PIXI.Container,
    objectId: string | null,
): ContainerBaseState {
    const localBounds = container.getLocalBounds()
    return {
        objectId,
        position: { x: container.position.x, y: container.position.y },
        scale: { x: container.scale.x, y: container.scale.y },
        pivot: { x: container.pivot.x, y: container.pivot.y },
        rotation: container.rotation,
        alpha: container.alpha,
        bounds: {
            width: localBounds.width,
            height: localBounds.height,
            x: localBounds.x,
            y: localBounds.y,
        },
    }
}

/**
 * 把快照中的几何量写回容器。
 *
 * 只还原 position / scale / rotation / alpha / pivot。
 * 不处理 filters、不触碰 AnimatedSprite 当前帧——这两项是业务侧状态，
 * 调用方若需要恢复，请在调用本函数前/后自行处理。
 */
export function applyContainerBaseTransform(
    container: PIXI.Container,
    state: ContainerBaseState,
): void {
    container.position.set(state.position.x, state.position.y)
    container.scale.set(state.scale.x, state.scale.y)
    container.rotation = state.rotation
    container.alpha = state.alpha
    container.pivot.set(state.pivot.x, state.pivot.y)
}
