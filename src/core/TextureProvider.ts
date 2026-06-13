/**
 * 纹理提供者接口
 * 抽象不同引擎（编辑器/预览/导出）的纹理获取方式差异
 */

import type * as PIXI from 'pixi.js'

/**
 * 统一纹理获取策略
 *
 * 各引擎实现差异：
 * - ScenePlayer: getImageUrl → PIXI.Texture.from
 * - ActionPreview: useAssetLoader().getTexture（严格模式，缺失则 throw）
 * - FrameCapture: getImageUrl → PIXI.Texture.from（严格模式，缺失则 throw）
 * - useSceneGraph: getImageUrl → PIXI.Texture.from
 */
export interface TextureProvider {
    /**
     * 获取纹理对象
     * 如实现为严格模式，缺失时应 throw Error
     */
    getTexture(url: string): PIXI.Texture

    /**
     * 将资源路径转换为可加载的 URL（通常是 blob URL）
     */
    getImageUrl(url: string): string
}
