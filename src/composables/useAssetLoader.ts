
import * as PIXI from 'pixi.js'

import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import { useSoundStore } from '@/stores/soundStore'
import type { SymbolMaterial, SymbolObject } from '@/types/sceneObject'
import type { SceneSetup, ScriptBlock } from '@/types/screenplay'

// 全局纹理缓存 (模块级单例，此时共享于所有组件)
const textureCache = new Map<string, PIXI.Texture>()
const pendingAssetLoads = new Map<string, Promise<void>>()
// 全局音频缓存 (Set of Blob URLs)
// const audioCache = new Set<string>()


/** v16: 收集单个 SymbolMaterial 的所有持久化图片 URL */
function collectSymbolMaterialUrls(material: SymbolMaterial, addImg: (url?: string) => void) {
    if (material.type === 'static') {
        addImg(material.url)
    } else if (material.frames) {
        for (const frame of material.frames) {
            addImg(frame.url)
        }
        // 静止帧
        addImg(material.url)
    }
}

function collectSymbolMaterialFirstPaintUrls(material: SymbolMaterial, addImg: (url?: string) => void) {
    if (material.type === 'static') {
        addImg(material.url)
        return
    }

    addImg(material.url)
    addImg(material.frames?.[0]?.url)
}

export function useAssetLoader() {
    const backgroundStore = useBackgroundStore()
    const propStore = usePropStore()
    const expressionStore = useExpressionStore()
    const soundStore = useSoundStore()

    const { getImageUrl, loadImageUrl } = useAssetImage()
    const { loadAudioUrl } = useAssetAudio()

    function buildAssetLoadKey(imageUrls: Set<string>, audioUrls: Set<string>): string {
        const imageKey = Array.from(imageUrls).sort().join('|')
        const audioKey = Array.from(audioUrls).sort().join('|')
        return `img:${imageKey}::audio:${audioKey}`
    }

    function isTextureCached(url: string): boolean {
        if (!url) return true
        if (textureCache.has(url)) return true
        const blobUrl = getImageUrl(url)
        return !!blobUrl && textureCache.has(blobUrl)
    }

    function collectEditorFirstPaintAssets(sceneSetup: { objects: SceneSetup['objects'] } | null, currentBlock: ScriptBlock | null) {
        const imageUrls = new Set<string>()
        const audioUrls = new Set<string>()

        const addImg = (url?: string) => {
            if (url) imageUrls.add(url)
        }

        type SceneObjectLike = SceneSetup['objects'][number]

        const collectBackgroundFirstPaint = (obj: SceneObjectLike) => {
            const bg = backgroundStore.getBackground(obj.refId)
            if (!bg) return

            addImg(bg.stillFrameCustomUrl)
            addImg(bg.url ?? bg.backgroundImage)
            addImg(bg.frames?.[0]?.url)
        }

        const collectPropFirstPaint = (obj: SceneObjectLike) => {
            const prop = propStore.getProp(obj.refId)
            if (!prop) return

            addImg(prop.stillFrameCustomUrl)
            addImg(prop.url)
            addImg(prop.frames?.[0]?.url)
        }

        const collectSymbolFirstPaint = (obj: SceneObjectLike) => {
            const symbolObj = obj as unknown as SymbolObject
            if (!symbolObj.materials?.length) return

            const currentMaterial = symbolObj.currentMaterialId
                ? symbolObj.materials.find(m => m.id === symbolObj.currentMaterialId)
                : symbolObj.materials[0]
            if (!currentMaterial) return

            collectSymbolMaterialFirstPaintUrls(currentMaterial, addImg)
        }

        const collectExpressionFirstPaint = (expressionId?: string) => {
            if (!expressionId) return
            const expr = expressionStore.getExpression(expressionId)
            if (!expr) return

            addImg(expr.defaultFrame?.url)
        }

        if (sceneSetup) {
            for (const obj of sceneSetup.objects) {
                switch (obj.type) {
                    case 'background':
                        collectBackgroundFirstPaint(obj)
                        break
                    case 'prop':
                        collectPropFirstPaint(obj)
                        break
                    case 'symbol':
                        collectSymbolFirstPaint(obj)
                        break
                    case 'expression':
                        collectExpressionFirstPaint(obj.refId)
                        break
                    default:
                        break
                }
            }
        }

        if (currentBlock?.actions) {
            for (const action of currentBlock.actions) {
                if (action.type !== 'set_material') continue

                const materialAction = action
                const newMaterialId = materialAction.params?.materialId
                if (!newMaterialId) continue

                const targetObj = sceneSetup?.objects.find(o => o.id === materialAction.target)
                if (targetObj?.type === 'expression' || !targetObj) {
                    collectExpressionFirstPaint(newMaterialId)
                    continue
                }

                if (targetObj.type === 'symbol') {
                    const symbolObj = targetObj as unknown as SymbolObject
                    const targetMaterial = symbolObj.materials?.find(material => material.id === newMaterialId)
                    if (targetMaterial) {
                        collectSymbolMaterialFirstPaintUrls(targetMaterial, addImg)
                    }
                }
            }
        }

        return { imageUrls, audioUrls }
    }

    /**
     * 收集场景和Block中需要加载的所有资源URL
     * @param sceneSetup 计算好的场景上下文 (prevContext)
     * @param currentBlock 当前正在编辑/预览的 Block (可选，用于提取动态覆盖)
     */
    function collectAssets(sceneSetup: { objects: SceneSetup['objects'] } | null, currentBlock: ScriptBlock | null) {
        const imageUrls = new Set<string>()
        const audioUrls = new Set<string>()

        // 辅助: 添加图片URL
        const addImg = (url?: string) => {
            if (url) imageUrls.add(url)
        }

        interface CollectorContext {
            addImg: (url?: string) => void
            addAudio: (url: string) => void
        }

        type SceneObjectLike = SceneSetup['objects'][number]

        const assetCollectors: Record<string, (obj: SceneObjectLike, ctx: CollectorContext) => void> = {
            // character collector 已移除

            prop(obj, ctx) {
                // PT Phase 6: propId 已删除，统一使用 refId
                const propId = obj.refId
                const prop = propStore.getProp(propId)
                if (prop) {
                    ctx.addImg(prop.url)
                    // v11.52: 预加载自定义静止图片
                    ctx.addImg(prop.stillFrameCustomUrl)
                    prop.frames?.forEach((f) => ctx.addImg(f.url))
                }
            },

            background(obj, ctx) {
                const bg = backgroundStore.getBackground(obj.refId)
                if (bg) {
                    ctx.addImg(bg.url ?? bg.backgroundImage)
                    // v11.52: 预加载自定义静止图片
                    ctx.addImg(bg.stillFrameCustomUrl)
                    bg.frames?.forEach((f) => ctx.addImg(f.url))
                }
            },

            audio(obj, ctx) {
                const snd = soundStore.getSound(obj.refId)
                if (snd?.url) ctx.addAudio(snd.url)
            },

            // v16: 元件素材（自包含，不依赖外部 Store）
            symbol(obj, ctx) {
                const symbolObj = obj as unknown as SymbolObject
                if (!symbolObj.materials) return
                for (const material of symbolObj.materials) {
                    collectSymbolMaterialUrls(material, ctx.addImg)
                }
            },

            // v18: 独立表情对象（引用 expressionStore）
            expression(obj, ctx) {
                const expr = expressionStore.getExpression(obj.refId)
                if (!expr) return
                ctx.addImg(expr.defaultFrame?.url)
                expr.speakingFrames?.forEach(f => ctx.addImg(f?.url))
            },
        }

        // 1. 扫描 Scene Setup (静态状态 + 初始状态)
        if (sceneSetup) {
            const ctx: CollectorContext = {
                addImg,
                addAudio: (url: string) => audioUrls.add(url),
            }
            for (const obj of sceneSetup.objects) {
                const collector = assetCollectors[obj.type]
                if (collector) collector(obj, ctx)
            }
        }

        // 2. 扫描 Current Block Actions (动态覆盖)
        // 专门针对 set_material 等动态指令
        if (currentBlock?.actions) {

            for (const action of currentBlock.actions) {
                // v18 动态截获: 解析 set_material 中的 materialId (表情 refId)
                if (action.type === 'set_material') {
                    const materialAction = action
                    const newMaterialId = materialAction.params?.materialId
                    if (!newMaterialId) continue

                    // 判定目标对象是否为表情类型
                    // 优先从 sceneSetup.objects 查找；
                    // 如果目标对象是动态 spawn 的（不在 setup 中），则直接尝试 expressionStore 查询
                    const targetObj = sceneSetup?.objects.find(o => o.id === materialAction.target)
                    const isExpression = targetObj?.type === 'expression'

                    // 对于非 expression 类型的对象（如 symbol），setup 扫描已覆盖全部素材，无需额外处理
                    if (isExpression || !targetObj) {
                        const expr = expressionStore.getExpression(newMaterialId)
                        if (expr) {
                            addImg(expr.defaultFrame?.url)
                            expr.speakingFrames?.forEach(f => addImg(f?.url))
                        }
                    }
                }

                // set_character 处理已移除
                if (action.type === 'set_audio') {
                    // Trigger audio usually uses the Audio Object, which is already scanned in Step 1.
                    // Unless we allow dynamic URL injection (unlikely in current design).
                }
            }
        }

        return { imageUrls, audioUrls }
    }

    /**
     * 统一加载执行器
     * 使用 Image 对象加载图片以稳健支持 Blob URL，随后转换为 PIXI Texture
     */
    async function loadAssets(imageUrls: Set<string>, audioUrls: Set<string>, traceLabel = 'AssetLoader.loadAssets') {
        void traceLabel
        const uncachedImageUrls = new Set(
            Array.from(imageUrls).filter(url => !isTextureCached(url))
        )

        if (uncachedImageUrls.size === 0 && audioUrls.size === 0) {
            return
        }

        const requestKey = buildAssetLoadKey(uncachedImageUrls, audioUrls)
        const pendingLoad = pendingAssetLoads.get(requestKey)
        if (pendingLoad) {
            await pendingLoad
            return
        }

        const loadTask = (async () => {
        const imagesToLoad = Array.from(uncachedImageUrls)
        const audiosToLoad = Array.from(audioUrls)

        // 1. 并行加载所有 Blob 到本地存储 (IndexedDB/Cache) 并获取 Blob URL
        // 这一步确保 blob: 协议的 URL 是有效的
        const validImageUrls = new Map<string, string>() // Original -> BlobURL

        await Promise.all(imagesToLoad.map(async (url) => {
            try {
                await loadImageUrl(url)
                const blobUrl = getImageUrl(url)
                if (blobUrl) {
                    validImageUrls.set(url, blobUrl)
                }
            } catch (e) {
                console.warn('[AssetLoader] Image Fetch Failed:', url, e)
            }
        }))

        // 2. 并行创建 PIXI Textures
        // 使用 Image 标签方式，避开 PIXI loader 对 blob 的潜在解析问题
        const texturePromises = Array.from(validImageUrls.entries()).map(async ([originalUrl, blobUrl]) => {
            // Fast path: Check cache
            if (textureCache.has(blobUrl)) return
            if (textureCache.has(originalUrl)) return

            try {
                const img = new Image()
                img.crossOrigin = 'anonymous'

                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve()
                    img.onerror = () => reject(new Error('Image Element Error'))
                    img.src = blobUrl
                })

                const baseTexture = PIXI.BaseTexture.from(img)
                const texture = new PIXI.Texture(baseTexture)

                if (texture?.baseTexture.valid) {
                    textureCache.set(originalUrl, texture)
                    textureCache.set(blobUrl, texture)
                }
            } catch (e) {
                console.warn('[AssetLoader] Texture Create Failed:', originalUrl)
            }
        })

        // 3. 并行加载 Audio
        const audioPromises = audiosToLoad.map(async (url) => {
            try {
                await loadAudioUrl(url)
                // AudioKit 的 load 是 lazy 的吗？这里可能需要 explicit decode 如果是 WebAudio
                // ActionPreviewDialog 使用 audioKit.load(blobUrl). 
                // 这里我们只负责 ensure blob available.
            } catch (e) {
                console.warn('[AssetLoader] Audio Fetch Failed:', url)
            }
        })

        await Promise.all([...texturePromises, ...audioPromises])
        })()

        pendingAssetLoads.set(requestKey, loadTask)
        try {
            await loadTask
        } finally {
            if (pendingAssetLoads.get(requestKey) === loadTask) {
                pendingAssetLoads.delete(requestKey)
            }
        }
    }

    /**
     * 获取缓存的纹理
     * 在 CharacterSprite 或其他渲染组件中使用此方法获取同步纹理
     */
    function getTexture(url: string): PIXI.Texture {
        if (!url) return PIXI.Texture.EMPTY

        // 1. Try Cache with Original URL
        if (textureCache.has(url)) return textureCache.get(url)!

        // 2. Try Cache with Blob URL
        // (This requires calling getImageUrl which might be slow if reactive? No, it's usually fast)
        const blobUrl = getImageUrl(url)
        if (textureCache.has(blobUrl)) return textureCache.get(blobUrl)!

        return PIXI.Texture.EMPTY
    }

    return {
        collectAssets,
        collectEditorFirstPaintAssets,
        loadAssets,
        getTexture,
        textureCache // Expose for advanced usage
    }
}
