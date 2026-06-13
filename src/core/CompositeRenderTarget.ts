import * as PIXI from 'pixi.js'

export interface CompositeRenderTargetConfig {
    source: PIXI.Container
    renderer: PIXI.Renderer
}

export class CompositeRenderTarget {
    private source: PIXI.Container
    private renderer: PIXI.Renderer

    private outputContainer: PIXI.Container
    private compositeSprite: PIXI.Sprite
    private renderRoot: PIXI.Container

    private renderTexture: PIXI.RenderTexture | null = null
    private enabled = false
    private lastWidth = 0
    private lastHeight = 0
    private padding = 2

    constructor(config: CompositeRenderTargetConfig) {
        this.source = config.source
        this.renderer = config.renderer

        this.outputContainer = new PIXI.Container()
        this.outputContainer.sortableChildren = true

        this.compositeSprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
        this.outputContainer.addChild(this.compositeSprite)

        this.renderRoot = new PIXI.Container()
    }

    enable(): void {
        if (this.enabled) return
        this.enabled = true

        const parent = this.source.parent
        if (!parent) return
        if (parent === this.renderRoot) return

        const index = parent.getChildIndex(this.source)
        parent.removeChild(this.source)

        this.renderRoot.addChild(this.source)

        this.outputContainer.position.copyFrom(this.source.position)
        this.outputContainer.zIndex = this.source.zIndex
        this.outputContainer.visible = this.source.visible

        this.outputContainer.scale.set(1, 1)
        this.outputContainer.pivot.set(0, 0)
        this.outputContainer.rotation = 0
        this.outputContainer.alpha = 1

        this.source.position.set(0, 0)
        this.source.scale.set(1, 1)
        this.source.pivot.set(0, 0)
        this.source.rotation = 0
        this.source.alpha = 1
        this.source.visible = true

        this.outputContainer.name = this.source.name
        parent.addChildAt(this.outputContainer, index)

        if (!this.renderTexture) {
            this.renderTexture = PIXI.RenderTexture.create({
                width: 1,
                height: 1,
                resolution: this.renderer.resolution
            })
            this.compositeSprite.texture = this.renderTexture
            this.lastWidth = 1
            this.lastHeight = 1
        }

        this.updateRenderTexture()
    }

    getOutputContainer(): PIXI.Container {
        return this.outputContainer
    }

    /**
     * P2: 获取原始 source 容器（CRT 的渲染子树根）
     * 用于运行时层级迁移时，将子对象添加到 source 而非 outputContainer，
     * 确保子对象被包含在离屏渲染纹理中。
     */
    getSourceContainer(): PIXI.Container {
        return this.source
    }

    getCompositeSprite(): PIXI.Sprite {
        return this.compositeSprite
    }

    updateRenderTexture(): void {
        if (!this.enabled) return

        const bounds = this.source.getLocalBounds()
        const width = Math.max(1, Math.ceil(bounds.width + this.padding * 2))
        const height = Math.max(1, Math.ceil(bounds.height + this.padding * 2))

        if (!this.renderTexture) {
            this.renderTexture = PIXI.RenderTexture.create({
                width,
                height,
                resolution: this.renderer.resolution
            })
            this.compositeSprite.texture = this.renderTexture
            this.lastWidth = width
            this.lastHeight = height
        } else if (width !== this.lastWidth || height !== this.lastHeight) {
            this.renderTexture.resize(width, height, true)
            this.lastWidth = width
            this.lastHeight = height
        }

        this.renderRoot.position.set(-bounds.x + this.padding, -bounds.y + this.padding)
        this.compositeSprite.position.set(bounds.x - this.padding, bounds.y - this.padding)

        this.renderer.render(this.renderRoot, {
            renderTexture: this.renderTexture,
            clear: true
        })
    }

    destroy(): void {
        if (!this.enabled) {
            if (this.renderTexture) this.renderTexture.destroy(true)
            this.renderTexture = null
            return
        }

        const parent = this.outputContainer.parent
        if (parent) {
            const index = parent.getChildIndex(this.outputContainer)
            parent.removeChild(this.outputContainer)

            this.source.position.copyFrom(this.outputContainer.position)
            this.source.visible = this.outputContainer.visible
            this.source.zIndex = this.outputContainer.zIndex

            if (this.source.parent === this.renderRoot) {
                this.renderRoot.removeChild(this.source)
            }
            parent.addChildAt(this.source, index)
        }

        this.outputContainer.destroy({ children: true })
        if (this.renderTexture) this.renderTexture.destroy(true)
        this.renderTexture = null
        this.enabled = false
    }
}
