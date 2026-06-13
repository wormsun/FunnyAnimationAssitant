/**
 * Config.json 场景模板导入引擎
 *
 * 将 Adobe Animate 导出插件生成的 config.json 树形结构
 * 转换为 FunnyAnimationAssistant 的 SceneObject 平坦列表。
 *
 * 坐标转换公式（沿用旧角色导入链路的兼容规则）：
 *   centerX = parentX + (width/2 - localX)
 *   centerY = parentY + (height/2 - localY)
 *
 * 导入整场景/大尺寸 composite 时，会在调用端传入目标视口，根 composite
 * 统一缩放到视口内，避免 4K Animate 舞台按原尺寸导入后只显示中间裁切。
 */

import { nanoid } from 'nanoid'

import type {
  ConfigCompositeNode,
  ConfigNode,
  ConfigRoot,
  ConfigSymbolNode,
  ExportFrame,
} from '@/types/configImportTypes'
import type { CompositeObject, SceneObject, SymbolMaterial, SymbolObject } from '@/types/sceneObject'
import { buildFileMap } from '@/utils/fileSystemUtils'
import { generateId } from '@/utils/uuid'

// ===== Types =====

/** 资源校验结果（与旧角色导入链路保持兼容） */
export interface ConfigResourceValidation {
  valid: boolean
  missingFiles: string[]
  foundFiles: Map<string, FileSystemFileHandle>
  resolvedRelativePaths: Map<string, string>
}

// ===== 版本号校验 =====

/** 最低要求的 config.json 版本 */
const MIN_CONFIG_VERSION = '2.0.0'

function normalizeAlpha(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

/**
 * 解析 "verX.Y.Z" 格式的版本字符串为数字数组
 * @returns [major, minor, patch] 或 null（格式不合法时）
 */
function parseVersionTuple(version: string): [number, number, number] | null {
  const match = /^ver(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * 判断版本号是否满足最低要求
 * @param version config.json 中的 version 字段值（如 "ver2.0.0"）
 * @param minVersion 最低版本号（不含 "ver" 前缀，如 "2.0.0"）
 */
export function isVersionSatisfied(version: string, minVersion: string): boolean {
  const current = parseVersionTuple(version)
  const required = parseVersionTuple(`ver${minVersion}`)
  if (!current || !required) return false

  for (let i = 0; i < 3; i++) {
    if (current[i]! > required[i]!) return true
    if (current[i]! < required[i]!) return false
  }
  return true // 完全相等
}

// ===== 解析 =====

/**
 * 解析并校验 config.json
 * @throws Error 格式不合法时或版本号不满足要求时
 */
export function parseConfigJson(jsonStr: string): ConfigRoot {
  const parsed = JSON.parse(jsonStr) as ConfigRoot

  if (parsed.type !== 'composite') {
    throw new Error('config.json 根节点必须为 composite 类型')
  }
  if (!Array.isArray(parsed.children)) {
    throw new Error('config.json 根节点缺少 children 数组')
  }

  // 版本号校验
  if (!parsed.version) {
    throw new Error('config.json 缺少 version 字段，请使用最新版本的插件重新导出')
  }
  if (!isVersionSatisfied(parsed.version, MIN_CONFIG_VERSION)) {
    throw new Error(
      `config.json 版本过低 (${parsed.version})，最低要求 ver${MIN_CONFIG_VERSION}。请使用最新版本的插件重新导出`
    )
  }

  return parsed
}

// ===== 路径收集 =====

/**
 * 递归收集树中所有 symbol 节点的帧路径
 */
export function collectAllFramePaths(config: ConfigRoot): Set<string> {
  const paths = new Set<string>()

  function walk(node: ConfigNode): void {
    if (node.type === 'symbol') {
      for (const frame of node.frames) {
        paths.add(frame.path)
      }
    } else {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  for (const child of config.children) {
    walk(child)
  }
  return paths
}

// ===== 资源校验 =====

/**
 * 校验 config.json 中引用的资源文件
 * 复用统一的目录扫描 + 后缀匹配策略
 */
export async function validateConfigResources(
  framePaths: Set<string>,
  directoryHandle: FileSystemDirectoryHandle
): Promise<ConfigResourceValidation> {
  const missingFiles: string[] = []
  const foundFiles = new Map<string, FileSystemFileHandle>()
  const resolvedRelativePaths = new Map<string, string>()

  // 递归扫描目录
  const fileMap = new Map<string, FileSystemFileHandle>()
  await buildFileMap(directoryHandle, '', fileMap)

  // 构建小写 → 原始路径的索引，用于相对路径直接匹配
  const lowerFileMap = new Map<string, { filePath: string; handle: FileSystemFileHandle }>()
  for (const [filePath, handle] of fileMap) {
    lowerFileMap.set(filePath.toLowerCase(), { filePath, handle })
  }

  for (const framePath of framePaths) {
    // 优先策略：相对路径直接匹配（ver2.0.0 格式）
    const normalizedRelative = framePath.replace(/\\/g, '/').toLowerCase()
    const directMatch = lowerFileMap.get(normalizedRelative)
    if (directMatch) {
      foundFiles.set(framePath, directMatch.handle)
      resolvedRelativePaths.set(framePath, directMatch.filePath)
      continue
    }

    // 回退策略：绝对路径后缀匹配（旧格式兼容）
    let normalized = framePath.replace(/^file:\/\/\//, '')
    try { normalized = decodeURIComponent(normalized) } catch { /* ignore */ }
    normalized = normalized.replace(/\\/g, '/').toLowerCase()

    let bestMatch: { filePath: string; handle: FileSystemFileHandle } | null = null
    for (const [filePath, handle] of fileMap) {
      const lowerFilePath = filePath.toLowerCase()
      if (
        normalized.endsWith(`/${lowerFilePath}`) ||
        normalized === lowerFilePath
      ) {
        if (!bestMatch || filePath.length > bestMatch.filePath.length) {
          bestMatch = { filePath, handle }
        }
      }
    }

    if (bestMatch) {
      foundFiles.set(framePath, bestMatch.handle)
      resolvedRelativePaths.set(framePath, bestMatch.filePath)
    } else {
      const displayPath = normalized.split('/').slice(-3).join('/')
      missingFiles.push(displayPath)
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
    foundFiles,
    resolvedRelativePaths,
  }
}

// ===== 帧 → 素材转换 =====

/**
 * 将 config.json 的 frames 转换为 SymbolMaterial[]
 * 按 keyframe 分组：单帧→static，多帧→animation
 */
async function convertFramesToMaterials(
  frames: ExportFrame[],
  name: string,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string
): Promise<SymbolMaterial[]> {
  const materials: SymbolMaterial[] = []

  // 按 keyframe 分组
  const keyframeGroups = new Map<number, ExportFrame[]>()
  for (const frame of frames) {
    const key = frame.keyframe
    if (!keyframeGroups.has(key)) {
      keyframeGroups.set(key, [])
    }
    keyframeGroups.get(key)!.push(frame)
  }

  // subIndex 排序
  for (const [, groupFrames] of keyframeGroups) {
    groupFrames.sort((a, b) => (a.subIndex ?? 0) - (b.subIndex ?? 0))
  }

  const sortedKeyframes = Array.from(keyframeGroups.keys()).sort((a, b) => a - b)

  for (const keyframe of sortedKeyframes) {
    const groupFrames = keyframeGroups.get(keyframe)!
    const materialId = nanoid()

    if (groupFrames.length === 1) {
      // 单帧 → static
      const frame = groupFrames[0]!
      const { url, runtimeUrl } = await resolveFrameUrl(frame.path, fileHandles, resolvedRelativePaths, importDirectoryPath)
      const assetName = frame.label ?? `${name} 帧${keyframe + 1}`

      const mat: SymbolMaterial & { _runtimeUrl?: string } = {
        id: materialId,
        name: assetName,
        type: 'static',
        url,
        ...(runtimeUrl ? { _runtimeUrl: runtimeUrl } : {}),
      }
      materials.push(mat)
    } else {
      // 多帧 → animation
      const animFrames: { url: string }[] = []
      let firstName = ''

      for (const frame of groupFrames) {
        const { url } = await resolveFrameUrl(frame.path, fileHandles, resolvedRelativePaths, importDirectoryPath)
        animFrames.push({ url })
        if (!firstName && frame.label) {
          firstName = frame.label
        }
      }

      const assetName = firstName || `${name} 动画${keyframe + 1}`
      materials.push({
        id: materialId,
        name: assetName,
        type: 'animation',
        frames: animFrames,
        fps: 24,
        loop: true,
      })
    }
  }

  return materials
}

/** 解析帧路径为 url（相对路径） + runtimeUrl（Blob URL） */
async function resolveFrameUrl(
  framePath: string,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string
): Promise<{ url: string; runtimeUrl: string }> {
  const fileHandle = fileHandles.get(framePath)
  let url = ''
  let runtimeUrl = ''

  if (fileHandle) {
    try {
      const file = await fileHandle.getFile()
      runtimeUrl = URL.createObjectURL(file)
      const relativePath = (resolvedRelativePaths.get(framePath) ?? '').replace(/\\/g, '/')
      url = importDirectoryPath
        ? `${importDirectoryPath}/${relativePath}`
        : relativePath
    } catch (e) {
      console.warn('[ConfigImporter] 读取文件失败:', framePath, e)
    }
  }

  return { url, runtimeUrl }
}

// ===== 主转换 =====

/** 内部节点转换的中间结果 */
interface ConvertedNode {
  /** 该节点（及其子节点）生成的所有 SceneObject（DFS 序） */
  objects: SceneObject[]
  /** 该节点自身的根对象（用于父级读取位置） */
  rootObject: SceneObject
}

interface ConvertFitOptions {
  width: number
  height: number
  padding?: number
}

/**
 * 将 config.json 树转换为 SceneObject 平坦列表
 *
 * @param config 解析后的 ConfigRoot
 * @param canvasCenterX 画布中心 X
 * @param canvasCenterY 画布中心 Y
 * @param fileHandles 文件句柄映射
 * @param resolvedRelativePaths 相对路径映射
 * @param importDirectoryPath 导入目录相对于项目根的路径
 */
export async function convertConfigToSceneObjects(
  config: ConfigRoot,
  canvasCenterX: number,
  canvasCenterY: number,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string,
  compositeMode: 'union' | 'entity' = 'union',
  fitTo?: ConvertFitOptions
): Promise<SceneObject[]> {
  if (config.children.length === 0) return []

  // 将根节点整体作为 composite 转换（而非跳过）
  const result = await convertCompositeNode(config, fileHandles, resolvedRelativePaths, importDirectoryPath, compositeMode)
  const allObjects = result.objects

  // 整体平移到画布中心
  // 只需偏移顶层对象（即根 composite），子对象使用局部坐标跟随移动
  const topLevelObjects = allObjects.filter(o => !o.parentId)
  if (topLevelObjects.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const obj of topLevelObjects) {
      // 使用视觉边界：中心点 ± 半宽/半高（考虑缩放）
      const halfW = (obj.width * Math.abs(obj.scaleX ?? 1)) / 2
      const halfH = (obj.height * Math.abs(obj.scaleY ?? 1)) / 2
      minX = Math.min(minX, obj.x - halfW)
      maxX = Math.max(maxX, obj.x + halfW)
      minY = Math.min(minY, obj.y - halfH)
      maxY = Math.max(maxY, obj.y + halfH)
    }
    const bboxCenterX = (minX + maxX) / 2
    const bboxCenterY = (minY + maxY) / 2
    const offsetX = canvasCenterX - bboxCenterX
    const offsetY = canvasCenterY - bboxCenterY

    for (const obj of topLevelObjects) {
      obj.x += offsetX
      obj.y += offsetY
    }

    if (fitTo && fitTo.width > 0 && fitTo.height > 0) {
      const padding = fitTo.padding ?? 0
      const targetWidth = Math.max(fitTo.width - padding * 2, 1)
      const targetHeight = Math.max(fitTo.height - padding * 2, 1)
      const bboxWidth = maxX - minX
      const bboxHeight = maxY - minY
      if (bboxWidth > targetWidth || bboxHeight > targetHeight) {
        const fitScale = Math.min(targetWidth / bboxWidth, targetHeight / bboxHeight)
        for (const obj of topLevelObjects) {
          obj.scaleX *= fitScale
          obj.scaleY *= fitScale
        }
      }
    }
  }

  return allObjects
}

/**
 * 递归转换单个节点
 */
async function convertNode(
  node: ConfigNode,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string,
  compositeMode: 'union' | 'entity'
): Promise<ConvertedNode> {
  if (node.type === 'symbol') {
    return convertSymbolNode(node, fileHandles, resolvedRelativePaths, importDirectoryPath)
  } else {
    return convertCompositeNode(node, fileHandles, resolvedRelativePaths, importDirectoryPath, compositeMode)
  }
}

/**
 * 转换 symbol 叶节点 → SymbolObject
 */
async function convertSymbolNode(
  node: ConfigSymbolNode,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string
): Promise<ConvertedNode> {
  const { width, height, registrationPoint, scaleX, scaleY, rotation } = node.instanceTransform
  const { parentX, parentY, localX, localY } = registrationPoint

  // 坐标转换：registrationPoint → 中心坐标（沿用旧导入兼容规则）
  const centerX = parentX + (width / 2 - localX)
  const centerY = parentY + (height / 2 - localY)

  // 帧 → 素材
  const materials = await convertFramesToMaterials(
    node.frames, node.name,
    fileHandles, resolvedRelativePaths, importDirectoryPath
  )

  const firstMaterialId = materials[0]?.id

  const obj: SymbolObject = {
    id: generateId('sceneobject'),
    type: 'symbol',
    name: node.name,
    alias: node.name,
    refId: '',
    materials,
    ...(firstMaterialId != null ? { currentMaterialId: firstMaterialId } : {}),
    x: centerX,
    y: centerY,
    width,
    height,
    scaleX,
    scaleY,
    rotation: rotation * Math.PI / 180, // 度 → 弧度
    alpha: normalizeAlpha(node.alpha),
    flipX: false,
    zIndex: 10,
    visible: true,
  }

  return { objects: [obj], rootObject: obj }
}

/**
 * 转换 composite 容器节点 → CompositeObject + 子对象
 */
async function convertCompositeNode(
  node: ConfigCompositeNode,
  fileHandles: Map<string, FileSystemFileHandle>,
  resolvedRelativePaths: Map<string, string>,
  importDirectoryPath: string,
  compositeMode: 'union' | 'entity'
): Promise<ConvertedNode> {
  // 1. 递归转换所有子节点
  const childResults: ConvertedNode[] = []
  for (const child of node.children) {
    const result = await convertNode(child, fileHandles, resolvedRelativePaths, importDirectoryPath, compositeMode)
    childResults.push(result)
  }

  // 如果只有一个子节点且无其他意义，仍然创建 composite 以保持层级关系

  // 2. 计算子对象视觉包围盒中心作为 composite 坐标
  const childRoots = childResults.map(r => r.rootObject)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const child of childRoots) {
    const halfW = (child.width * Math.abs(child.scaleX ?? 1)) / 2
    const halfH = (child.height * Math.abs(child.scaleY ?? 1)) / 2
    minX = Math.min(minX, child.x - halfW)
    maxX = Math.max(maxX, child.x + halfW)
    minY = Math.min(minY, child.y - halfH)
    maxY = Math.max(maxY, child.y + halfH)
  }
  const compositeX = childRoots.length > 0 ? (minX + maxX) / 2 : 0
  const compositeY = childRoots.length > 0 ? (minY + maxY) / 2 : 0

  // 3. 创建 CompositeObject
  const compositeId = generateId('sceneobject')
  const childIds = childRoots.map(c => c.id)

  const compositeObj: CompositeObject = {
    id: compositeId,
    type: 'composite',
    name: node.name,
    alias: node.name,
    refId: '',
    childIds,
    compositeLocked: true,
    compositeMode,
    x: compositeX,
    y: compositeY,
    width: childRoots.length > 0 ? maxX - minX : 0,
    height: childRoots.length > 0 ? maxY - minY : 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: normalizeAlpha(node.alpha),
    flipX: false,
    zIndex: 10,
    visible: true,
  }

  // 4. 子对象的坐标转为相对于 composite 中心的局部坐标 + 设置 parentId
  for (const child of childRoots) {
    child.x -= compositeX
    child.y -= compositeY
    child.parentId = compositeId
  }

  // 5. 组装平坦列表（composite 在前，子对象在后）
  const allObjects: SceneObject[] = [compositeObj]
  for (const result of childResults) {
    allObjects.push(...result.objects)
  }

  return { objects: allObjects, rootObject: compositeObj }
}
