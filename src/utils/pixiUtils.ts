import * as PIXI from 'pixi.js'

/**
 * 将资源从 Legacy Cache (TextureCache/BaseTextureCache) 同步到 Modern Cache (Assets)
 * @param id - 资源的 URL 或 ID (例如 blob:...)
 */
export function syncLegacyToAssets(id: string): void {
    // 1. 如果 Assets 里已经有了，直接返回，不做多余操作
    if (PIXI.Assets.cache.has(id)) {
        return
    }

    let texture: PIXI.Texture | null = null

    // 2. 优先检查 TextureCache (最常用的情况)
    if (PIXI.utils.TextureCache[id]) {
        texture = PIXI.utils.TextureCache[id]
    }
    // 3. 如果 TextureCache 没有，检查 BaseTextureCache
    else if (PIXI.utils.BaseTextureCache[id]) {
        const baseTexture = PIXI.utils.BaseTextureCache[id]

        // 【关键步骤】
        // Assets 系统和 Sprite 需要的是 Texture，不是 BaseTexture。
        // 所以我们需要基于这个 BaseTexture 创建一个新的 Texture。
        texture = new PIXI.Texture(baseTexture)

        // 为了保持一致性，顺便把它也补回到 TextureCache 中（可选，但推荐）
        PIXI.utils.TextureCache[id] = texture
    }

    // 4. 如果找到了纹理，将其注入到 Assets 缓存系统
    if (texture) {
        PIXI.Assets.cache.set(id, texture)
    }
}
