/**
 * Union Composite 虚拟边界计算工具
 *
 * Union composite 的 PIXI Container 是空代理容器（renderable = false），
 * 子对象平铺到上级容器，`getLocalBounds()` 返回 0。
 * 此工具通过子容器角点坐标换算得到虚拟包围盒。
 */
import * as PIXI from 'pixi.js'

type ContainerResolver = (childId: string) => PIXI.Container | null | undefined

/**
 * 计算 union composite 的虚拟边界
 * 通过遍历子容器角点，坐标换算到 proxyContainer 的局部坐标系
 *
 * @param childIds - 子对象 ID 列表
 * @param containerResolver - 根据 ID 获取子容器的回调
 * @param proxyContainer - union 的代理容器（坐标换算的参考系）
 * @returns 虚拟包围盒 { x, y, width, height }
 */
export function computeUnionBounds(
    childIds: string[],
    containerResolver: ContainerResolver,
    proxyContainer: PIXI.Container
): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const childId of childIds) {
        const cc = containerResolver(childId)
        if (!cc || (cc as unknown as { destroyed?: boolean }).destroyed) continue
        const cl = cc.getLocalBounds()
        if (cl.width <= 0 || cl.height <= 0) continue

        const corners = [
            new PIXI.Point(cl.x, cl.y),
            new PIXI.Point(cl.x + cl.width, cl.y),
            new PIXI.Point(cl.x + cl.width, cl.y + cl.height),
            new PIXI.Point(cl.x, cl.y + cl.height),
        ]
        for (const corner of corners) {
            const g = cc.toGlobal(corner)
            const l = proxyContainer.toLocal(g)
            minX = Math.min(minX, l.x)
            minY = Math.min(minY, l.y)
            maxX = Math.max(maxX, l.x)
            maxY = Math.max(maxY, l.y)
        }
    }

    return isFinite(minX)
        ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        : { x: 0, y: 0, width: 0, height: 0 }
}
