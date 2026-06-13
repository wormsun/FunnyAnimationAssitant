/**
 * 表情导入工具
 * 用于从文件夹批量扫描和导入表情资源
 */

import type { ExpressionFrame } from '@/types/project'

/**
 * 导入预览项
 */
export interface ImportPreviewItem {
    /** 表情类型：静态（单图）或动画（多图） */
    type: 'static' | 'animation'
    /** 表情名称（来自文件名或文件夹名） */
    name: string
    /** 图片数量 */
    imageCount: number
    /** 静态表情的文件 Handle */
    fileHandle?: FileSystemFileHandle
    /** 动画表情的目录 Handle */
    dirHandle?: FileSystemDirectoryHandle
    /** 文件相对路径（静态表情用） */
    filePath?: string
    /** 目录相对路径（动画表情用） */
    dirPath?: string
}

/**
 * 导入结果项
 */
export interface ImportResultItem {
    name: string
    defaultFrame: ExpressionFrame
    speakingFrames: ExpressionFrame[]
}

/**
 * 支持的图片扩展名
 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

/**
 * 判断是否为支持的图片文件
 */
export function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    return IMAGE_EXTENSIONS.includes(ext)
}

/**
 * 从文件名提取表情名称（去除扩展名）
 */
export function extractNameFromFile(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot > 0 ? filename.substring(0, lastDot) : filename
}

/**
 * 自然排序比较函数
 */
function naturalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * 扫描目录，生成导入预览列表
 * @param dirHandle 要扫描的目录 Handle
 * @param basePath 目录的相对路径前缀
 */
export async function scanDirectoryForExpressions(
    dirHandle: FileSystemDirectoryHandle,
    basePath: string
): Promise<ImportPreviewItem[]> {
    const items: ImportPreviewItem[] = []
    const fileEntries: { name: string; handle: FileSystemFileHandle }[] = []
    const dirEntries: { name: string; handle: FileSystemDirectoryHandle }[] = []

    // 收集所有条目，分开存储文件和目录
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            fileEntries.push({ name: entry.name, handle: entry })
        } else {
            dirEntries.push({ name: entry.name, handle: entry })
        }
    }

    // 按名称自然排序
    fileEntries.sort((a, b) => naturalCompare(a.name, b.name))
    dirEntries.sort((a, b) => naturalCompare(a.name, b.name))

    // 处理文件 → 静态表情
    for (const entry of fileEntries) {
        if (isImageFile(entry.name)) {
            const filePath = basePath ? `${basePath}/${entry.name}` : entry.name
            items.push({
                type: 'static',
                name: extractNameFromFile(entry.name),
                imageCount: 1,
                fileHandle: entry.handle,
                filePath
            })
        }
    }

    // 处理目录 → 动画表情
    for (const entry of dirEntries) {
        const imageCount = await countImagesInDirectory(entry.handle)
        if (imageCount > 0) {
            const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name
            items.push({
                type: 'animation',
                name: entry.name,
                imageCount,
                dirHandle: entry.handle,
                dirPath
            })
        }
    }

    return items
}

/**
 * 统计目录中的图片数量
 */
async function countImagesInDirectory(dirHandle: FileSystemDirectoryHandle): Promise<number> {
    let count = 0
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && isImageFile(entry.name)) {
            count++
        }
    }
    return count
}

/**
 * 处理单个导入项，生成 ExpressionFrame 数据
 * @param item 导入预览项
 */
export async function processImportItem(item: ImportPreviewItem): Promise<ImportResultItem> {
    if (item.type === 'static' && item.fileHandle && item.filePath) {
        // 静态表情：单张图片
        const frame: ExpressionFrame = {
            id: generateFrameId(),
            url: item.filePath
        }
        return {
            name: item.name,
            defaultFrame: frame,
            speakingFrames: []
        }
    } else if (item.type === 'animation' && item.dirHandle && item.dirPath) {
        // 动画表情：文件夹内所有图片
        const frames = await loadFramesFromDirectory(item.dirHandle, item.dirPath)
        if (frames.length === 0) {
            throw new Error(`文件夹 "${item.name}" 中没有有效的图片文件`)
        }
        // frames.length > 0 已确保，使用非空断言
        const firstFrame = frames[0]!
        return {
            name: item.name,
            defaultFrame: { id: firstFrame.id, url: firstFrame.url },
            speakingFrames: frames
        }
    } else {
        throw new Error(`无效的导入项: ${item.name}`)
    }
}

/**
 * 从目录加载所有图片帧
 */
async function loadFramesFromDirectory(
    dirHandle: FileSystemDirectoryHandle,
    dirPath: string
): Promise<ExpressionFrame[]> {
    const imageFiles: { name: string; handle: FileSystemFileHandle }[] = []

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && isImageFile(entry.name)) {
            imageFiles.push({ name: entry.name, handle: entry })
        }
    }

    // 按文件名自然排序
    imageFiles.sort((a, b) => naturalCompare(a.name, b.name))

    // 生成 ExpressionFrame 列表
    return imageFiles.map((file, index) => ({
        id: generateFrameId(index),
        url: `${dirPath}/${file.name}`
    }))
}

/**
 * 生成帧 ID
 */
function generateFrameId(index?: number): string {
    const base = `frame_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    return index !== undefined ? `${base}_${index}` : base
}
