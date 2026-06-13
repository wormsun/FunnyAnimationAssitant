/**
 * 字体加载服务 (Text PRD Phase 0)
 *
 * 管理预置字体的按需加载，确保字体在渲染前可用。
 *
 * 集成点：
 * - useSceneGraph.createTextContainer/updateObjectContainer: 创建/重建文本纹理前阻塞等待
 * - ObjectPropertiesPanel: 用户切换字体后调用 ensureFontLoaded()
 * - ScenePlayer.loadScene(): await preloadSceneFonts(objects)
 * - FrameCapture.loadScene(): await preloadSceneFonts(objects)，阻塞导出
 * - applyObjectState text 分支: 检测到 fontFamily 变化时 fire-and-forget
 */

import type { SceneObject, TextObject } from '@/types/sceneObject'
import type { ScriptBlock } from '@/types/screenplay'
import { sortActionsForEvaluation } from '@/utils/actionOrder'
import { normalizeTextContent } from '@/utils/textUtils'

// === 预置字体目录映射 ===
const PRESET_FONTS: Record<string, string> = {
    'Noto Sans SC': '/fonts/noto-sans-sc/result.css',
    'Noto Serif SC': '/fonts/noto-serif-sc/result.css',
    'LXGW WenKai': '/fonts/lxgw-wenkai/result.css',
    'ZCOOL QingKe HuangYou': '/fonts/zcool-qingke-huangyou/result.css',
    'Ma Shan Zheng': '/fonts/ma-shan-zheng/result.css',
}

// 已加载 CSS 的缓存（避免重复插入 <link>）
const loadedCssUrls = new Set<string>()

// 正在加载中的 Promise 缓存（避免重复并发请求）
const loadingPromises = new Map<string, Promise<boolean>>()

/**
 * 判断字体是否为预置字体
 */
export function isPresetFont(fontFamily: string): boolean {
    return fontFamily in PRESET_FONTS
}

/**
 * 获取预置字体列表（供 UI 组件使用）
 */
export function getPresetFontList(): { name: string; cssUrl: string }[] {
    return Object.entries(PRESET_FONTS).map(([name, cssUrl]) => ({ name, cssUrl }))
}

/**
 * 收集播放/导出过程中可能出现的文本字体状态。
 *
 * Scene setup 只保存初始字体；Action Mode 修改字体会落到 set_text 动作里。
 * 如果只预加载 setup 字体，Pixi.Text 在动作触发后会先用浏览器 fallback 字体生成纹理。
 */
export function collectSceneFontPreloadObjects(
    objects: readonly SceneObject[],
    blocks: readonly ScriptBlock[] = [],
): SceneObject[] {
    const preloadObjects: SceneObject[] = [...objects]
    if (blocks.length === 0) return preloadObjects

    const textStates = new Map<string, TextObject>()
    for (const obj of objects) {
        if (obj.type !== 'text') continue
        textStates.set(obj.id, { ...(obj as TextObject) })
    }

    for (const block of blocks) {
        const actions = block.actions ?? []
        if (actions.length === 0) continue

        const objectIndexMap = new Map<string, number>()
        const orderedTextStates = [...textStates.values()]
        orderedTextStates.forEach((obj, idx) => {
            objectIndexMap.set(obj.id, idx)
        })

        for (const action of sortActionsForEvaluation(actions, objectIndexMap)) {
            if (action.type !== 'set_text') continue

            const target = resolveTextPreloadTarget(action.target, textStates)
            if (!target) continue

            const params = action.params
            const next: TextObject = { ...target }
            if (params.content !== undefined) next.content = params.content
            if (params.fontFamily !== undefined) next.fontFamily = params.fontFamily

            textStates.set(next.id, next)
            preloadObjects.push(next)
        }
    }

    return preloadObjects
}

function resolveTextPreloadTarget(
    target: string,
    textStates: Map<string, TextObject>,
): TextObject | null {
    const byId = textStates.get(target)
    if (byId) return byId

    for (const textState of textStates.values()) {
        if (textState.alias === target || textState.name === target) return textState
    }

    return null
}

/**
 * 确保指定字体的 CSS 已加载到 DOM，并等待字体可用。
 *
 * - 预置字体：动态插入 <link> 标签加载 result.css（cn-font-split 生成的按需分片）
 * - 非预置字体：依赖本地已安装，仅尝试 document.fonts.load()
 *
 * @returns true 如果字体已确认可用，false 如果不可用（非预置且本地未安装）
 */
export async function ensureFontLoaded(fontFamily: string, sampleText?: string): Promise<boolean> {
    // 检查是否已有正在进行的加载
    const loadingKey = `${fontFamily}::${normalizeTextContent(sampleText) || '__default__'}`
    const existing = loadingPromises.get(loadingKey)
    if (existing) return existing

    const promise = _doEnsureFontLoaded(fontFamily, sampleText)
    loadingPromises.set(loadingKey, promise)

    try {
        return await promise
    } finally {
        loadingPromises.delete(loadingKey)
    }
}

async function _doEnsureFontLoaded(fontFamily: string, sampleText?: string): Promise<boolean> {
    const cssUrl = PRESET_FONTS[fontFamily]
    const normalizedSample = normalizeTextContent(sampleText).trim()
    const probeText = normalizedSample || '测试文本天地人你好世界ABC123'

    if (cssUrl) {
        // 预置字体：插入 CSS <link>
        if (!loadedCssUrls.has(cssUrl)) {
            await loadFontCss(cssUrl)
            loadedCssUrls.add(cssUrl)
        }
    }

    // 等待字体可用（预置和自定义都尝试）
    try {
        // 传入实际文本内容，确保 unicode-range 分片字体会把当前字形预热到位。
        await document.fonts.load(`16px "${fontFamily}"`, probeText)
        await document.fonts.ready
        return true
    } catch (e) {
        console.warn(`[fontLoader] 字体加载失败: ${fontFamily}`, e)
        return false
    }
}

/**
 * 动态插入 <link> 标签加载字体 CSS
 */
function loadFontCss(url: string): Promise<void> {
    return new Promise((resolve) => {
        // 检查是否已存在该 link
        const existing = document.querySelector(`link[href="${url}"]`)
        if (existing) {
            resolve()
            return
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.onload = () => resolve()
        link.onerror = () => {
            console.error(`[fontLoader] CSS 加载失败: ${url}`)
            // 不 reject，允许降级到系统字体
            resolve()
        }
        document.head.appendChild(link)
    })
}

/**
 * 预加载场景中所有文本对象使用的字体。
 *
 * 1. 遍历 objects 收集所有 TextObject 的 fontFamily（去重）
 * 2. 对每个 fontFamily 调用 ensureFontLoaded()
 * 3. 最终 await document.fonts.ready
 *
 * 调用时机：
 * - ScenePlayer.loadScene() 时
 * - FrameCapture.loadScene() 时（导出前阻塞）
 * - set_text 切换 fontFamily 时
 */
export async function preloadSceneFonts(objects: SceneObject[]): Promise<void> {
    // 收集场景中所有文本对象使用的字体
    const fontSamples = new Map<string, string>()
    for (const obj of objects) {
        if (obj.type === 'text') {
            const textObj = obj as TextObject
            const fontFamily = textObj.fontFamily
            const sample = normalizeTextContent(textObj.content).slice(0, 200)
            const prev = fontSamples.get(fontFamily) ?? ''
            const merged = `${prev}${prev && sample ? '\n' : ''}${sample}`.slice(0, 500)
            fontSamples.set(fontFamily, merged)
        }
    }

    if (fontSamples.size === 0) return

    // 并行加载所有字体
    const loadPromises = [...fontSamples.entries()].map(([font, sample]) => ensureFontLoaded(font, sample))
    await Promise.all(loadPromises)

    // 最终确认
    await document.fonts.ready
}
