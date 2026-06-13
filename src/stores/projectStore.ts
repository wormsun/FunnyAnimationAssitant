/**
 * 项目 Store
 * 管理项目的生命周期：新建、打开、保存、关闭
 * 使用 File System Access API 管理文件夹结构
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { type PresetAnimationTemplate,validatePresetTemplate } from '@/types/presetAnimation'
import type { Background, Expression, ExpressionFrame, ProjectData, ProjectMeta, PropAsset, SoundAsset } from '@/types/project'
import type { SceneTemplate } from '@/types/sceneTemplate'
import type { ActorConfig, NarratorConfig, SceneContainer } from '@/types/screenplay'
import {
  fileExists,
  loadAssetFromDisk,
  saveFileToDisk,
  writeFileAsText
} from '@/utils/fileSystem'
import { reconcileSetupHierarchy, warnHierarchyIssues } from '@/utils/hierarchyUtils'
import type { TTSTimingFile } from '@/utils/ttsTiming'
import { ensureTTSTimingFile, getTTSTimingPath, loadTTSTimingFile, saveTTSTimingFile } from '@/utils/ttsTiming'

import { useAnimationStore } from './animationStore'
import { useBackgroundStore } from './backgroundStore'
import { useCompositeCharacterStore } from './compositeCharacterStore'
import type { Episode } from './episodeStore'
import { useEpisodeStore } from './episodeStore'
import { useExpressionStore } from './expressionStore'
import { usePropStore } from './propStore'
import { useSceneStore } from './sceneStore'
import { useSceneTemplateStore } from './sceneTemplateStore'
import { useSoundStore } from './soundStore'
// v7.3: useEffectStore 已移除，特效已合并到道具

interface WindowWithFSA extends Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
}

// Helper to convert Base64 to File
function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',')
  const mimeMatch = arr[0]?.match(/:(.*?);/)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const base64Data = arr[1] ?? ''
  const bstr = atob(base64Data)
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

function reconcileEpisodesHierarchy(episodes: Episode[], scope: string, warn = true): boolean {
  const warnings: string[] = []
  let changed = false
  for (const episode of episodes) {
    for (const scene of episode.scenes ?? []) {
      const result = reconcileSetupHierarchy(scene.setup)
      changed ||= result.changed
      warnings.push(...result.warnings.map(w => `${episode.id}/${scene.id}: ${w}`))
    }
  }
  if (warn) {
    warnHierarchyIssues(scope, warnings)
  }
  return changed
}

/**
 * 递归移除对象中以 _ 开头的运行时属性
 * 同时过滤掉 blob: URL
 * @param obj 待清理的对象
 * @returns 清理后的新对象（不修改原对象）
 */
function stripRuntimeProps<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }

  // 处理数组
  if (Array.isArray(obj)) {
    const array = obj as unknown[]
    const mapped = array.map(item => stripRuntimeProps(item))
    return mapped as unknown as T
  }

  // 处理普通对象
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      // 跳过以 _ 开头的运行时属性
      if (key.startsWith('_')) {
        continue
      }
      const value = (obj as Record<string, unknown>)[key]
      // 如果是 url 字段且以 blob: 开头，置空
      if (key === 'url' && typeof value === 'string' && value.startsWith('blob:')) {
        result[key] = ''
        continue
      }
      // 递归处理嵌套对象/数组
      result[key] = stripRuntimeProps(value)
    }
    return result as T
  }

  // 基本类型直接返回
  return obj
}





export const useProjectStore = defineStore('project', () => {
  const projectHandle = ref<FileSystemDirectoryHandle | null>(null)
  const assetsHandle = ref<FileSystemDirectoryHandle | null>(null)
  const projectName = ref<string>('未命名项目')
  const projectMeta = ref<ProjectMeta>({
    name: '未命名项目',
    resolution: { w: 1920, h: 1080 },
    fps: 25,
    version: '2.0.0'
  })
  const isProjectOpen = ref<boolean>(false)
  const autoSaveEnabled = ref<boolean>(true)
  const hasUnsavedChanges = ref<boolean>(false)
  const currentProjectFileName = ref<string>('project.anime') // 当前项目文件名

  const actors = ref<ActorConfig[]>([])
  const narrator = ref<NarratorConfig>({ voice: {} })

  // v20: 用户自定义预制动作模板（项目级）
  const customPresetAnimations = ref<PresetAnimationTemplate[]>([])

  const expressionStore = useExpressionStore()
  const backgroundStore = useBackgroundStore()
  // const propStore = usePropStore() // 移除顶层调用，避免循环依赖
  const episodeStore = useEpisodeStore()
  const sceneStore = useSceneStore()

  /**
   * 标记项目有未保存的更改
   */
  function markAsUnsaved(): void {
    if (isProjectOpen.value) {
      hasUnsavedChanges.value = true
    }
  }

  /**
   * 选择项目目录（必须在用户手势中调用）
   * @returns 目录句柄
   */
  async function selectProjectDirectory(): Promise<FileSystemDirectoryHandle> {
    // 检查 File System Access API 支持
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API 不支持，请使用 Chrome 或 Edge 浏览器')
    }

    // 让用户选择项目目录（必须在用户手势中直接调用）
    const handle = await (window as unknown as WindowWithFSA).showDirectoryPicker({
      mode: 'readwrite'
    })

    return handle
  }

  /**
   * 检查是否有未保存的更改，如果有则提示用户保存
   * @returns true 如果用户选择继续（已保存或放弃），false 如果用户取消
   */
  async function checkUnsavedChanges(): Promise<boolean> {
    if (!hasUnsavedChanges.value || !isProjectOpen.value) {
      return true // 没有未保存更改，可以继续
    }

    // 使用 confirm 实现三选项对话框
    // 第一步: 询问是否保存
    const wantToSave = confirm(
      '当前项目有未保存的修改。\n\n' +
      '点击"确定"保存项目并继续\n' +
      '点击"取消"放弃修改并继续'
    )

    if (wantToSave) {
      // 用户选择保存
      try {
        await saveProject()
        return true
      } catch (error) {
        console.error('[ProjectStore] 保存失败:', error)
        // 保存失败时询问是否继续
        const continueAnyway = confirm('保存失败！\n\n点击"确定"放弃修改并继续\n点击"取消"返回编辑')
        return continueAnyway
      }
    } else {
      // 用户选择不保存,直接继续
      return true
    }
  }

  /**
   * 扫描目录下所有 .anime 项目文件
   * @param handle 目录句柄
   * @returns 文件信息列表
   */
  async function scanAnimeFiles(handle: FileSystemDirectoryHandle): Promise<{ name: string; lastModified: Date }[]> {
    const files: { name: string; lastModified: Date }[] = []

    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.anime')) {
          const fileHandle = await handle.getFileHandle(entry.name)
          const file = await fileHandle.getFile()
          files.push({
            name: entry.name,
            lastModified: new Date(file.lastModified)
          })
        }
      }
    } catch (error) {
      console.error('[scanAnimeFiles] 扫描失败:', error)
    }

    // 按修改时间降序排序（最新的在前）
    files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())

    return files
  }

  /**
   * 生成唯一的项目文件名
   * @param existingFiles 已存在的文件名列表（包含 .anime 扩展名）
   * @returns 不重名的文件名（不含扩展名）
   */
  function generateUniqueFileName(existingFiles: string[]): string {
    // 提取文件名（去除 .anime 扩展名）并转换为小写用于比较
    const existingNamesLower = existingFiles.map(f => f.replace(/\.anime$/, '').toLowerCase())

    // 如果 "Untitled" 不存在，直接返回
    if (!existingNamesLower.includes('untitled')) {
      return 'Untitled'
    }

    // 否则尝试 Untitled01, Untitled02, ...
    for (let i = 1; i <= 999; i++) {
      const name = `Untitled${i.toString().padStart(2, '0')}`
      if (!existingNamesLower.includes(name.toLowerCase())) {
        return name
      }
    }

    // 极端情况：生成随机名称
    return `Untitled_${Date.now()}`
  }

  /**
   * 创建新项目
   * @param name 项目名称
   * @param fileName 项目文件名（不含 .anime 扩展名）
   * @param handle 项目目录句柄（可选，如果不提供则会在方法内选择）
   */
  async function newProject(name: string, fileName = 'project', handle?: FileSystemDirectoryHandle): Promise<void> {
    // 检查是否有未保存的更改
    if (!await checkUnsavedChanges()) {
      throw new Error('用户取消操作')
    }

    try {
      let directoryHandle = handle

      // 如果没有提供句柄，则选择目录（注意：这必须在用户手势中调用）
      directoryHandle ??= await selectProjectDirectory()

      const fullFileName = `${fileName}.anime`

      // 检查目录下是否已有同名文件
      try {
        await directoryHandle.getFileHandle(fullFileName)
        // 如果文件存在，抛出错误
        throw new Error(`所选目录已包含项目文件（${fullFileName}），无法创建同名项目。请使用其他文件名。`)
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string }
        // 如果错误是 NotFoundError，说明文件不存在，可以继续
        if (err.name === 'NotFoundError') {
          // 文件不存在，可以继续创建项目
        } else if (err.message?.includes('已包含项目文件')) {
          // 这是我们抛出的错误，直接抛出
          throw error
        } else {
          // 其他错误，也抛出
          throw error
        }
      }

      // 设置项目句柄
      projectHandle.value = directoryHandle
      // 不再创建任何目录，让用户自由组织文件夹结构
      assetsHandle.value = null

      // 初始化项目元数据
      projectName.value = name
      projectMeta.value = {
        name,
        resolution: { w: 1920, h: 1080 },
        fps: 25,
        version: '2.0.0'
      }

      // 清空所有 Store
      const propStore = usePropStore()
      // v7.3: effectStore 已移除，特效已合并到道具
      const soundStore = useSoundStore()
      expressionStore.clearAll()
      backgroundStore.clearAll()
      propStore.clearAll()
      // v7.3: effectStore.clearAll() 已移除
      soundStore.clearAll()
      episodeStore.clearAll()
      sceneStore.clearScene()
      useSceneTemplateStore().clearAll()
      useCompositeCharacterStore().clearAll()

      // 创建初始项目文件（使用自定义文件名）
      currentProjectFileName.value = fullFileName // 设置当前项目文件名
      await saveProject(fullFileName)

      isProjectOpen.value = true
      hasUnsavedChanges.value = false // 新创建的项目已保存，没有未保存更改

    } catch (error: unknown) {
      const err = error as { name?: string }
      if (err.name === 'AbortError') {
        return
      }
      console.error('[ProjectStore] 创建项目失败:', error)
      throw error
    }
  }

  /**
   * 打开项目
   * 采用"打开项目文件夹"的方式,类似 VS Code 或 Unity
   * 用户选择项目文件夹,系统检查文件夹中的 .anime 文件
   * @param selectedFileName 指定要打开的文件名(包含 .anime 扩展名),如果不提供则需要UI选择
   * @param directoryHandle 可选的目录句柄
   * @returns 如果有多个文件且未指定文件名,返回文件列表和目录句柄供UI选择;否则返回 undefined
   */
  async function openProject(selectedFileName?: string, directoryHandle?: FileSystemDirectoryHandle): Promise<{ files: { name: string; lastModified: Date }[]; handle: FileSystemDirectoryHandle } | undefined> {

    // 只有在首次调用(没有directoryHandle)时才检查未保存的更改
    // 如果已提供directoryHandle,说明是从文件选择对话框选择后的调用,不需要再检查
    if (!directoryHandle) {
      if (!await checkUnsavedChanges()) {
        throw new Error('用户取消操作')
      }
    }

    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('File System Access API 不支持,请使用 Chrome 或 Edge 浏览器')
      }

      // 让用户选择项目文件夹(必须在用户手势中直接调用)
      let handle: FileSystemDirectoryHandle
      if (directoryHandle) {
        handle = directoryHandle
      } else {
        try {
          handle = await (window as unknown as WindowWithFSA).showDirectoryPicker({
            mode: 'readwrite'
          })
        } catch (error: unknown) {
          const err = error as { name?: string }
          if (err.name === 'AbortError') {
            // 用户取消选择,不抛出错误,直接返回
            return undefined
          }
          throw error
        }
      }

      // 扫描所有 .anime 文件
      const animeFiles = await scanAnimeFiles(handle)

      if (animeFiles.length === 0) {
        throw new Error('所选文件夹不是有效的项目(未找到 .anime 文件)\n\n请选择包含 .anime 文件的项目文件夹')
      }

      // 如果有多个文件且未指定文件名,返回文件列表和目录句柄供UI选择
      if (animeFiles.length > 1 && !selectedFileName) {
        return { files: animeFiles, handle }
      }

      // 确定要打开的文件名
      const firstAnimeFile = animeFiles[0]
      if (!firstAnimeFile) {
        throw new Error('未找到有效的 .anime 文件')
      }
      const fileNameToOpen = selectedFileName ?? firstAnimeFile.name

      // 检查文件是否存在
      let projectFileHandle: FileSystemFileHandle
      try {
        projectFileHandle = await handle.getFileHandle(fileNameToOpen)
      } catch {
        throw new Error(`项目文件 ${fileNameToOpen} 不存在`)
      }

      // 读取 project.anime 文件内容
      const projectFile = await projectFileHandle.getFile()
      const projectDataJson = await projectFile.text()

      // 设置当前项目文件名
      currentProjectFileName.value = fileNameToOpen

      // 设置项目句柄（现在有了整个文件夹的访问权限）
      projectHandle.value = handle
      // 不再检查或创建任何目录，直接使用用户现有的文件夹结构
      assetsHandle.value = null

      // 解析项目数据
      const projectData = JSON.parse(projectDataJson) as ProjectData

      // ===== .anime 格式版本校验 (v1.0.0 标准) =====
      const CURRENT_FORMAT_VERSION = '2.0.0'
      const fileVersion = projectData.meta?.version ?? '0.0.0'

      // 版本兼容性检查
      const fileMajorParsed = fileVersion.split('.').map(Number)[0]
      const currentMajorParsed = CURRENT_FORMAT_VERSION.split('.').map(Number)[0]
      const fileMajor = fileMajorParsed ?? 0
      const currentMajor = currentMajorParsed ?? 1

      if (fileMajor > currentMajor) {
        // 文件版本高于当前支持版本，拒绝打开
        throw new Error(
          `项目文件格式版本 (${fileVersion}) 高于当前支持版本 (${CURRENT_FORMAT_VERSION})。\n` +
          `请更新 沙雕动画小助手 编辑器后重试。`
        )
      }

      if (fileMajor < currentMajor) {
        // 文件版本低于当前支持版本，拒绝打开
        throw new Error(
          `项目文件格式版本 (${fileVersion}) 低于当前支持版本 (${CURRENT_FORMAT_VERSION})。\n` +
          `当前版本的 沙雕动画小助手 无法打开该项目文件。`
        )
      }



      // 更新项目元数据
      projectName.value = projectData.meta.name
      projectMeta.value = projectData.meta

      // 清空所有 Store
      const propStore = usePropStore()
      expressionStore.clearAll()
      backgroundStore.clearAll()
      propStore.clearAll()
      episodeStore.clearAll()
      sceneStore.clearScene()
      const sceneTemplateStore = useSceneTemplateStore()
      sceneTemplateStore.clearAll()
      const compositeCharacterStore = useCompositeCharacterStore()
      compositeCharacterStore.clearAll()

      // 加载背景数据到 Store
      // 优先从 assets.backgrounds 加载完整数据
      // 兼容逻辑：如果 assets.backgrounds 仅包含简略信息（旧版），则尝试从根级 backgrounds 加载
      let backgroundsLoaded = false
      if (projectData.assets?.backgrounds && projectData.assets.backgrounds.length > 0) {
        const firstBg = projectData.assets.backgrounds[0]
        // 检查是否有完整字段（如 type）
        if (firstBg?.type) {
          backgroundStore.setBackgrounds(projectData.assets.backgrounds)
          backgroundsLoaded = true
        }
      }

      if (!backgroundsLoaded && projectData.backgrounds) {
        const backgroundsList = Object.values(projectData.backgrounds)
        backgroundStore.setBackgrounds(backgroundsList as Background[])
      }

      // 加载表情数据到 Store
      if (projectData.expressions) {
        expressionStore.setExpressions(projectData.expressions)
      }

      // 加载道具数据到 Store
      if (projectData.assets?.props) {
        propStore.setProps(projectData.assets.props)
      }

      // v7.3: 特效已合并到道具，不再单独加载

      // 加载音效数据到 Store
      const soundStore = useSoundStore()
      if (projectData.assets?.sounds) {
        soundStore.setSounds(projectData.assets.sounds)
      }

      // v6.0: 加载剧集列表数据到 Store（已合并 Screenplay）
      if (projectData.episodes && Array.isArray(projectData.episodes) && projectData.episodes.length > 0) {
        episodeStore.episodes = projectData.episodes.map((val) => {
          const ep = val as Episode
          const newEp: Episode = {
            id: ep.id,
            episodeNumber: ep.episodeNumber,
            name: ep.name,
            scenes: ep.scenes ?? [],
            bgmTracks: ep.bgmTracks ?? [],
            duration: ep.duration ?? 0,
            createdAt: ep.createdAt,
            modifiedAt: ep.modifiedAt,
            version: ep.version ?? '6.0'
          }
          if (ep.thumbnail) newEp.thumbnail = ep.thumbnail
          return newEp
        })
      }

      // v6.0: 加载项目级演员和旁白配置
      if (projectData.actors && Array.isArray(projectData.actors)) {
        actors.value = projectData.actors
      }
      if (projectData.narrator) {
        narrator.value = projectData.narrator
      }

      // 兼容旧版本：如果有 screenplays 字段，进行数据迁移
      const anyProjectData = projectData as unknown as { screenplays?: Record<string, { scenes: SceneContainer[] }> }
      if (anyProjectData.screenplays && Object.keys(anyProjectData.screenplays).length > 0) {
        Object.entries(anyProjectData.screenplays).forEach(([episodeId, screenplay]) => {
          const episode = episodeStore.episodes.find(ep => ep.id === episodeId)
          if (episode && screenplay.scenes) {
            episode.scenes = screenplay.scenes
          }
        })
      }
      const hierarchyChanged = reconcileEpisodesHierarchy(episodeStore.episodes, 'openProject')

      // v16: 加载场景模板
      const sceneTemplatesData = (projectData as Record<string, unknown>)['sceneTemplates']
      if (Array.isArray(sceneTemplatesData) && sceneTemplatesData.length > 0) {
        sceneTemplateStore.setTemplates(sceneTemplatesData as SceneTemplate[])
      }

      // v16: 场景模板缩略图水合（thumbnailPath → BlobURL）
      for (const tpl of sceneTemplateStore.templates) {
        if (tpl.thumbnailPath && !tpl.thumbnailPath.startsWith('blob:') && !tpl.thumbnailPath.startsWith('data:')) {
          try {
            tpl._runtimeThumbnailUrl = await loadAssetFromDisk(handle, tpl.thumbnailPath)
          } catch {
            console.warn(`[ProjectStore] 场景模板缩略图加载失败: ${tpl.thumbnailPath}`)
          }
        }
      }

      // v18: 加载组合式人物
      const compositeCharsData = (projectData as Record<string, unknown>)['compositeCharacters']
      if (Array.isArray(compositeCharsData) && compositeCharsData.length > 0) {
        compositeCharacterStore.setCharacters(compositeCharsData as import('@/types/compositeCharacter').CompositeCharacter[])
      }

      // v18: 组合式人物缩略图水合（thumbnailPath → BlobURL）
      for (const char of compositeCharacterStore.characters) {
        if (char.thumbnailPath && !char.thumbnailPath.startsWith('blob:') && !char.thumbnailPath.startsWith('data:')) {
          try {
            char._runtimeThumbnailUrl = await loadAssetFromDisk(handle, char.thumbnailPath)
          } catch {
            console.warn(`[ProjectStore] 组合式人物缩略图加载失败: ${char.thumbnailPath}`)
          }
        }
      }

      // v20: 加载自定义预制动作模板
      const customPresetsData = (projectData as Record<string, unknown>)['customPresetAnimations']
      if (Array.isArray(customPresetsData) && customPresetsData.length > 0) {
        const validated: PresetAnimationTemplate[] = []
        for (const tpl of customPresetsData as PresetAnimationTemplate[]) {
          const errors = validatePresetTemplate(tpl)
          if (errors.length > 0) {
            console.warn(`[ProjectStore] 加载自定义模板 "${tpl.id ?? 'unknown'}" 校验失败: ${errors.join('; ')}`)
          }
          validated.push(tpl)
        }
        customPresetAnimations.value = validated
      } else {
        customPresetAnimations.value = []
      }

      // 加载资产（从路径创建 Blob URLs）
      hydrateAssets(projectData)


      // v16: 将资源级动画填充到 SceneObject.animations（向后兼容迁移）
      populateObjectAnimationsOnLoad()

      isProjectOpen.value = true
      hasUnsavedChanges.value = hierarchyChanged
      return undefined
    } catch (error: unknown) {
      const err = error as { name?: string }
      if (err.name === 'AbortError') {
        return undefined
      }
      console.error('[ProjectStore] 打开项目失败:', error)
      throw error
    }
  }

  /**
   * 从磁盘加载资产并创建 Blob URLs
   * v12.8: 重构为懒加载模式 - 仅将数据分发到 Store，不预加载任何二进制资源
   * 资源将在 UI 组件需要时通过 useAssetImage/useAssetAudio 按需加载
   * @param projectData 项目数据
   */
  function hydrateAssets(_projectData: ProjectData): void {
    if (!projectHandle.value) {
      throw new Error('项目未打开')
    }

    // Character 数据加载已移除

    // 2-5: 表情、背景、道具、音效数据已在 openProject 中分发到各 Store
    // 不再预加载任何二进制资源，由各组件按需加载
  }




  /**
   * v16: 将资源级动画填充到 SceneObject.animations
   * 项目加载时执行，遍历所有场景的所有对象，
   * 将资源级 store 中的动画复制到对象的 animations 字段。
   * 已有 animations 的对象不会被覆盖。
   */
  function populateObjectAnimationsOnLoad(): void {
    const animationStore = useAnimationStore()

    for (const episode of episodeStore.episodes) {
      for (const scene of episode.scenes ?? []) {
        for (const obj of scene.setup?.objects ?? []) {
          if (obj.animations && Object.keys(obj.animations).length > 0) {
            continue // 已有对象级动画，跳过
          }
          populateObjectAnimationsForObject(obj, animationStore)
        }
      }
    }
  }

  /**
   * v16: 将资源级动画填充到单个 SceneObject.animations
   * 可用于项目加载时的批量迁移，也可用于新对象放置时的单次填充。
   */
  function populateObjectAnimationsForObject(
    obj: { type: string; refId: string; animations?: Record<string, unknown> },
    animationStore: ReturnType<typeof useAnimationStore>,
  ): void {
    if (obj.type === 'character' || obj.type === 'prop' || obj.type === 'background') {
      const resourceType = obj.type
      const resourceAnims = animationStore.getAnimations(resourceType, obj.refId)
      if (resourceAnims.length > 0) {
        const record: Record<string, unknown> = {}
        for (const anim of resourceAnims) {
          record[anim.id] = anim
        }
        obj.animations = record
      }
    }
  }

  // 防止并发保存标志
  const isSaving = ref(false)

  /**
   * 保存项目
   * @param fileName 项目文件名（包含 .anime 扩展名），默认为 'project.anime'
   */
  async function saveProject(fileName?: string): Promise<void> {
    // 如果正在保存中，则跳过（避免并发写入导致 InvalidStateError）
    if (isSaving.value) {

      return
    }

    // 使用传入的文件名,或者使用当前项目文件名
    const targetFileName = fileName ?? currentProjectFileName.value
    if (!projectHandle.value) {
      throw new Error('项目未打开')
    }

    isSaving.value = true

    try {
      const propStore = usePropStore()
      // v7.3: effectStore 已移除，特效已合并到道具
      const soundStore = useSoundStore()
      // 收集所有 Store 的数据
      const projectData: ProjectData = {
        meta: projectMeta.value,
        assets: {
          // 使用 stripRuntimeProps 递归清理运行时属性
          backgrounds: backgroundStore.backgrounds.map((bg: Background) => stripRuntimeProps(bg)),
          props: propStore.props.map(prop => stripRuntimeProps(prop)),
          sounds: soundStore.sounds.map(sound => stripRuntimeProps(sound)),
          musics: [], // Deprecated: kept for backwards compatibility
        },
        expressions: {}, // 保存完整的表情数据
      }

      // 处理缩略图缓存文件夹
      const cacheDirName = currentProjectFileName.value.replace(/\.anime$/, '') + '_cache'


      // 保存完整的背景数据 (已合并到 assets.backgrounds，此处移除冗余写入)
      // backgroundStore.backgrounds.forEach(bg => { ... })

      // 保存完整的表情数据（确保 URL 是路径而不是 Blob URL）
      const expressionStore = useExpressionStore()
      if (expressionStore.expressions) {
        Object.values(expressionStore.expressions).forEach(expr => {
          const exprCopy: Record<string, unknown> = {}

          // 复制所有非 _ 开头的字段
          Object.keys(expr).forEach(key => {
            if (!key.startsWith('_')) {
              if (key === 'defaultFrame') {
                // 处理 defaultFrame
                const frameCopy: Record<string, unknown> = {}
                Object.keys(expr.defaultFrame).forEach(frameKey => {
                  if (!frameKey.startsWith('_')) {
                    frameCopy[frameKey] = (expr.defaultFrame as unknown as Record<string, unknown>)[frameKey]
                  }
                })
                exprCopy['defaultFrame'] = frameCopy
              } else if (key === 'speakingFrames') {
                // 处理 speakingFrames
                exprCopy['speakingFrames'] = expr.speakingFrames.map(frame => {
                  const frameCopy: Record<string, unknown> = {}
                  Object.keys(frame).forEach(frameKey => {
                    if (!frameKey.startsWith('_')) {
                      frameCopy[frameKey] = (frame as unknown as Record<string, unknown>)[frameKey]
                    }
                  })
                  return frameCopy
                })
              } else {
                exprCopy[key] = (expr as unknown as Record<string, unknown>)[key]
              }
            }
          })

          // 确保 URL 是路径
          if ((exprCopy['defaultFrame'] as ExpressionFrame)?.url?.startsWith('blob:')) {
            console.warn(`[ProjectStore] 表情 ${expr.id} 的 defaultFrame URL 是 Blob URL，清空`)
              ; (exprCopy['defaultFrame'] as ExpressionFrame).url = ''
          }

          (exprCopy['speakingFrames'] as ExpressionFrame[])?.forEach((frame, index: number) => {
            if (frame.url?.startsWith('blob:')) {
              console.warn(`[ProjectStore] 表情 ${expr.id} 的 speakingFrame[${index}] URL 是 Blob URL，清空`)
              frame.url = ''
            }
          })

          projectData.expressions![expr.id] = exprCopy as unknown as Expression
        })
      }

      reconcileEpisodesHierarchy(episodeStore.episodes, 'saveProject', false)

      // v6.0: 保存剧集列表数据（已合并 Screenplay，直接包含 scenes）
      // v12.8: TTS 音频使用 audioPath 外置存储，不再需要 blob URL 转换
      const processedEpisodes = episodeStore.episodes.map(ep => {
        const epCopy = { ...ep }

        if (epCopy.scenes) {
          epCopy.scenes = epCopy.scenes.map(scene => {
            const sceneCopy = { ...scene }

            // 防止 setup.objects 中的运行时属性泄漏到项目文件
            // （如 SymbolMaterial 的历史遗留 _runtimeUrl 等以 _ 开头的字段）
            if (sceneCopy.setup?.objects) {
              sceneCopy.setup = {
                ...sceneCopy.setup,
                objects: sceneCopy.setup.objects.map(obj => stripRuntimeProps(obj)),
              }
            }

            if (sceneCopy.script) {
              sceneCopy.script = sceneCopy.script.map(block => {
                const blockCopy = { ...block }

                // v12.8: audioPath 已经是相对路径，直接保存
                // 移除旧的 blob URL 转 Base64 逻辑
                return blockCopy
              })
            }
            return sceneCopy
          })
        }

        return {
          id: epCopy.id,
          episodeNumber: epCopy.episodeNumber,
          name: epCopy.name,
          scenes: epCopy.scenes ?? [],
          bgmTracks: epCopy.bgmTracks ?? [], // 保存 BGM 轨道 (v7.5)
          duration: epCopy.duration,
          thumbnail: epCopy.thumbnail,
          createdAt: epCopy.createdAt,
          modifiedAt: epCopy.modifiedAt,
          version: epCopy.version ?? '6.0'
        }
      })

      projectData.episodes = processedEpisodes

      // v6.0: 保存项目级演员和旁白配置
      projectData.actors = actors.value
      projectData.narrator = narrator.value

      // v16: 保存场景模板（含缩略图持久化）
      const sceneTemplateStore = useSceneTemplateStore()
      if (sceneTemplateStore.templates.length > 0) {
        const processedTemplates: SceneTemplate[] = []
        for (const tpl of sceneTemplateStore.templates) {
          const tplCopy = stripRuntimeProps(tpl) as SceneTemplate

          // 缩略图持久化：DataURL → cache 文件
          if (tpl._runtimeThumbnailUrl?.startsWith('data:image')) {
            const extMatch = /data:image\/(.*?);/.exec(tpl._runtimeThumbnailUrl)
            const ext = extMatch?.[1] ?? 'jpg'
            const thumbFileName = `stpl_${tpl.id}.${ext === 'jpeg' ? 'jpg' : ext}`
            const relativePath = `${cacheDirName}/${thumbFileName}`
            const file = dataURLtoFile(tpl._runtimeThumbnailUrl, thumbFileName)
            await saveFileToDisk(projectHandle.value, relativePath, file)

            // 更新 store 中的引用
            tpl.thumbnailPath = relativePath
            tpl._runtimeThumbnailUrl = URL.createObjectURL(file)
            tplCopy.thumbnailPath = relativePath
          } else if (tpl.thumbnailPath) {
            tplCopy.thumbnailPath = tpl.thumbnailPath
          }

          processedTemplates.push(tplCopy)
        }
        projectData.sceneTemplates = processedTemplates
      }

      // v18: 保存组合式人物（含缩略图持久化）
      const compositeCharacterStore = useCompositeCharacterStore()
      if (compositeCharacterStore.characters.length > 0) {
        const processedChars: import('@/types/compositeCharacter').CompositeCharacter[] = []
        for (const char of compositeCharacterStore.characters) {
          const charCopy = stripRuntimeProps(char) as import('@/types/compositeCharacter').CompositeCharacter

          // 缩略图持久化：DataURL → cache 文件
          if (char._runtimeThumbnailUrl?.startsWith('data:image')) {
            const extMatch = /data:image\/(.*?);/.exec(char._runtimeThumbnailUrl)
            const ext = extMatch?.[1] ?? 'jpg'
            const thumbFileName = `cchar_${char.id}.${ext === 'jpeg' ? 'jpg' : ext}`
            const relativePath = `${cacheDirName}/${thumbFileName}`
            const file = dataURLtoFile(char._runtimeThumbnailUrl, thumbFileName)
            await saveFileToDisk(projectHandle.value, relativePath, file)

            // 更新 store 中的引用
            char.thumbnailPath = relativePath
            char._runtimeThumbnailUrl = URL.createObjectURL(file)
            charCopy.thumbnailPath = relativePath
          } else if (char.thumbnailPath) {
            charCopy.thumbnailPath = char.thumbnailPath
          }

          processedChars.push(charCopy)
        }
        projectData.compositeCharacters = processedChars
      }

      // v20: 保存自定义预制动作模板
      if (customPresetAnimations.value.length > 0) {
        projectData.customPresetAnimations = customPresetAnimations.value
      }

      // 将 Blob URLs 替换为相对路径
      // TODO: 实现路径转换逻辑
      // 需要遍历所有资产，将 Blob URL 替换为相对路径
      // 写入项目文件
      const jsonString = JSON.stringify(projectData, null, 2)
      await writeFileAsText(projectHandle.value, targetFileName, jsonString)

      hasUnsavedChanges.value = false
    } catch (error) {
      console.error('[ProjectStore] 保存项目失败:', error)
      throw error
    } finally {
      isSaving.value = false
    }
  }

  /**
   * 关闭项目
   * @param skipCheck 是否跳过未保存更改检查（内部使用）
   */
  async function closeProject(skipCheck = false): Promise<void> {
    // 检查是否有未保存的更改
    if (!skipCheck && !await checkUnsavedChanges()) {
      throw new Error('用户取消操作')
    }
    // 清理所有 Blob URLs
    // TODO: 遍历所有 Store，释放 Blob URLs

    projectHandle.value = null
    assetsHandle.value = null
    projectName.value = '未命名项目'
    currentProjectFileName.value = 'project.anime' // 重置为默认值
    projectMeta.value = {
      name: '未命名项目',
      resolution: { w: 1920, h: 1080 },
      fps: 25,
      version: '2.0.0'
    }
    isProjectOpen.value = false
    hasUnsavedChanges.value = false

    const propStore = usePropStore()
    expressionStore.clearAll()
    backgroundStore.clearAll()
    propStore.clearAll()
    episodeStore.clearAll()
    sceneStore.clearScene()
    useSceneTemplateStore().clearAll()
  }

  /**
   * v12.8: 保存 TTS 音频到项目缓存目录
   * @param base64Audio Base64 编码的音频数据
   * @param cacheKey 缓存键 (用于生成文件名哈希)
   * @returns 相对路径，如 "{project}_cache/tts/{hash}.mp3"
   */
  async function saveTTSAudio(base64Audio: string, cacheKey: string): Promise<string> {
    if (!projectHandle.value) {
      throw new Error('项目未打开')
    }

    // 生成文件名哈希
    const hash = await generateHash(cacheKey)
    const cacheDirName = currentProjectFileName.value.replace(/\.anime$/, '') + '_cache'
    const relativePath = `${cacheDirName}/tts/${hash}.mp3`

    // Base64 转 File
    const byteCharacters = atob(base64Audio)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'audio/mp3' })
    const file = new File([blob], `${hash}.mp3`, { type: 'audio/mp3' })

    // 保存到磁盘
    await saveFileToDisk(projectHandle.value, relativePath, file)

    return relativePath
  }

  /**
   * 生成字符串哈希 (用于 TTS 缓存文件名)
   */
  async function generateHash(str: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 检测 TTS 音频文件是否存在
   * @param audioPath 音频文件相对路径
   * @returns 文件是否存在
   */
  async function checkTTSAudioExists(audioPath: string): Promise<boolean> {
    if (!projectHandle.value) {
      return false
    }
    // 跳过 blob: 和 data: URL（这些不是有效的文件路径）
    if (audioPath.startsWith('blob:') || audioPath.startsWith('data:')) {
      return false
    }
    try {
      return await fileExists(projectHandle.value, audioPath)
    } catch {
      return false
    }
  }

  /**
   * v21: 保存 TTS 音频的 pause/speech sidecar timing 文件
   * @returns 相对路径，如 "{project}_cache/tts/{hash}.timing.json"
   */
  async function saveTTSTiming(audioPath: string, timing: TTSTimingFile): Promise<string> {
    if (!projectHandle.value) {
      throw new Error('项目未打开')
    }

    return saveTTSTimingFile(projectHandle.value, audioPath, timing)
  }

  /**
   * v21: 加载 TTS timing sidecar 文件
   */
  async function loadTTSTiming(audioPath: string): Promise<TTSTimingFile | null> {
    if (!projectHandle.value) {
      return null
    }

    return loadTTSTimingFile(projectHandle.value, audioPath)
  }

  /**
   * v21: 检测 TTS timing sidecar 文件是否存在
   */
  async function checkTTSTimingExists(audioPath: string): Promise<boolean> {
    if (!projectHandle.value) {
      return false
    }

    try {
      return await fileExists(projectHandle.value, getTTSTimingPath(audioPath))
    } catch {
      return false
    }
  }

  /**
   * v21: 确保 TTS timing sidecar 已生成。已有且参数匹配时复用，否则重新分析并写入。
   */
  async function ensureTTSTiming(audioPath: string, audioBuffer: AudioBuffer): Promise<string> {
    if (!projectHandle.value) {
      throw new Error('项目未打开')
    }

    return ensureTTSTimingFile(projectHandle.value, audioPath, audioBuffer)
  }

  /**
   * 自动保存（保存到文件系统和 localStorage）
   */
  async function autoSave(): Promise<void> {
    // 如果项目已打开，则保存到文件系统
    if (isProjectOpen.value && projectHandle.value) {
      try {
        await saveProject()
      } catch (error) {
        console.error('[ProjectStore] 文件系统保存失败:', error)
        // 如果文件系统保存失败，则保存到 localStorage
        saveToLocalStorage()
      }
    } else {
      // 否则保存到 localStorage，以便下次恢复
      saveToLocalStorage()
    }
  }

  /**
   * 保存到 localStorage（降级方案）
   */
  function saveToLocalStorage(): void {
    const propStore = usePropStore()
    // v7.3: effectStore 已移除，特效已合并到道具
    const soundStore = useSoundStore()
    const projectData: ProjectData = {
      meta: projectMeta.value,
      assets: {
        backgrounds: backgroundStore.backgrounds.map((bg: Background) => {
          // 创建背景副本，跳过以 _ 开头的运行时字段
          const bgCopy: Record<string, unknown> = {}
          Object.keys(bg).forEach(key => {
            if (!key.startsWith('_')) {
              if (key === 'frames') {
                bgCopy['frames'] = bg.frames?.map(frame => {
                  const frameCopy: Record<string, unknown> = {}
                  Object.keys(frame).forEach(frameKey => {
                    if (!frameKey.startsWith('_')) {
                      frameCopy[frameKey] = frame[frameKey]
                    }
                  })
                  // 2.2 Fix url check
                  if ((frameCopy['url'] as string)?.startsWith('blob:')) frameCopy['url'] = ''
                  return frameCopy
                })
              } else {
                bgCopy[key] = (bg as Record<string, unknown>)[key]
              }
            }
          })

          // 2.3 Cast properties for checking
          if ((bgCopy['url'] as string)?.startsWith('blob:')) {
            console.warn(`[ProjectStore] (AutoSave) 背景 ${bg.id} 的 URL 仍为 Blob URL: ${bgCopy['url'] as string}`)
          }
          if ((bgCopy['stillFrameCustomUrl'] as string)?.startsWith('blob:')) bgCopy['stillFrameCustomUrl'] = ''
          // 兼容处理
          if ((bgCopy['backgroundImage'] as string)?.startsWith('blob:')) bgCopy['backgroundImage'] = undefined

          return bgCopy as Background
        }),
        props: propStore.props.map(prop => {
          // 深拷贝并移除运行时字段
          const propCopy: Record<string, unknown> = {}
          Object.keys(prop).forEach(key => {
            if (!key.startsWith('_')) {
              if (key === 'frames') {
                propCopy['frames'] = prop.frames?.map(frame => {
                  const frameCopy: Record<string, unknown> = {}
                  Object.keys(frame).forEach(frameKey => {
                    if (!frameKey.startsWith('_')) {
                      frameCopy[frameKey] = frame[frameKey]
                    }
                  })
                  // 确保 URL 是相对路径
                  if ((frameCopy['url'] as string)?.startsWith('blob:')) frameCopy['url'] = ''
                  return frameCopy
                })
              } else {
                propCopy[key] = (prop as Record<string, unknown>)[key]
              }
            }
          })
          // 确保 URL 是相对路径
          if ((propCopy['url'] as string)?.startsWith('blob:')) {
            console.warn(`[ProjectStore] (AutoSave) 道具 ${prop.id} 的 URL 仍为 Blob URL: ${propCopy['url'] as string}`)
          }
          if ((propCopy['stillFrameCustomUrl'] as string)?.startsWith('blob:')) propCopy['stillFrameCustomUrl'] = ''

          return propCopy as PropAsset
        }),
        // v7.3: 特效已合并到道具，不再单独保存
        sounds: soundStore.sounds.map(sound => {
          const soundCopy: Record<string, unknown> = {}
          Object.keys(sound).forEach(key => {
            if (!key.startsWith('_')) {
              soundCopy[key] = (sound as Record<string, unknown>)[key]
            }
          })
          if ((soundCopy['url'] as string)?.startsWith('blob:')) {
            console.warn(`[ProjectStore] (AutoSave) 音效 ${sound.id} 的 URL 仍为 Blob URL: ${soundCopy['url'] as string}`)
          }
          return soundCopy as SoundAsset
        }),
        musics: [], // Deprecated: kept for backwards compatibility
      },
      expressions: {},
    }

    // 保存完整的背景数据 (已合并到 assets.backgrounds，此处移除冗余写入)
    // backgroundStore.backgrounds.forEach(bg => { ... })

    // 保存完整的道具数据
    // if (propStore.props) {
    //   propStore.props.forEach(prop => {
    //     if (!projectData.props) projectData.props = {}
    //     projectData.props[prop.id] = prop
    //   })
    // }

    // 保存完整的表情数据
    const expressionStore = useExpressionStore()
    if (expressionStore.expressions) {
      Object.values(expressionStore.expressions).forEach(expr => {
        projectData.expressions![expr.id] = expr
      })
    }

    // Character 数据保存已移除


    // 保存剧集列表数据到 localStorage
    projectData.episodes = episodeStore.episodes.map(ep => ({ ...ep }))

    localStorage.setItem('animeStudio_autosave', JSON.stringify(projectData))
    localStorage.setItem('animeStudio_autosave_time', Date.now().toString())
  }

  /**
   * 检查是否有自动保存数据
   */
  function hasAutoSave(): boolean {
    return localStorage.getItem('animeStudio_autosave') !== null
  }

  /**
   * 获取自动保存的时间
   */
  function getAutoSaveTime(): Date | null {
    const timeStr = localStorage.getItem('animeStudio_autosave_time')
    if (timeStr) {
      return new Date(parseInt(timeStr))
    }
    return null
  }

  /**
   * 恢复自动保存的数据
   */
  function restoreFromAutoSave(): boolean {
    try {
      const dataStr = localStorage.getItem('animeStudio_autosave')
      if (!dataStr) return false

      const projectData = JSON.parse(dataStr) as ProjectData
      projectName.value = projectData.meta.name
      projectMeta.value = projectData.meta

      // TODO: 恢复所有 Store 的数据
      // 需要将 Base64 转换为 Blob URLs

      isProjectOpen.value = true
      return true
    } catch (error) {
      console.error('[ProjectStore] 恢复自动保存失败:', error)
      return false
    }
  }

  /**
   * 导出到目录（已废弃，现在直接保存）
   */
  async function exportToDirectory(): Promise<void> {
    // 这个方法现在等同于 saveProject
    await saveProject()
  }

  /**
   * 保存到文件（降级方案，用于不支持 File System API 的情况）
   */
  function saveToFile(): void {
    // 收集所有数据
    const projectData: ProjectData = {
      meta: projectMeta.value,
      assets: {
        backgrounds: backgroundStore.backgrounds.map((bg: Background) => {
          // 创建背景副本，跳过以 _ 开头的运行时字段
          const bgCopy: Record<string, unknown> = {}
          Object.keys(bg).forEach(key => {
            if (!key.startsWith('_')) {
              if (key === 'frames') {
                bgCopy['frames'] = bg.frames?.map(frame => {
                  const frameCopy: Record<string, unknown> = {}
                  Object.keys(frame).forEach(frameKey => {
                    if (!frameKey.startsWith('_')) {
                      frameCopy[frameKey] = frame[frameKey]
                    }
                  })
                  if ((frameCopy['url'] as string)?.startsWith('blob:')) frameCopy['url'] = ''
                  return frameCopy
                })
              } else {
                bgCopy[key] = (bg as Record<string, unknown>)[key]
              }
            }
          })

          if ((bgCopy['url'] as string)?.startsWith('blob:')) bgCopy['url'] = ''
          if ((bgCopy['stillFrameCustomUrl'] as string)?.startsWith('blob:')) bgCopy['stillFrameCustomUrl'] = ''
          // 兼容处理
          if ((bgCopy['backgroundImage'] as string)?.startsWith('blob:')) bgCopy['backgroundImage'] = undefined

          return bgCopy as Background
        }),
        props: [],
        // v7.3: effects 字段已移除
        sounds: [],
        musics: []
      },
    }

    // TODO: 将 Blob URLs 转换为 Base64（用于文件下载）

    // 创建下载链接
    const jsonString = JSON.stringify(projectData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.value ?? 'project'}.anime`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 从文件加载（降级方案）
   */
  async function loadFromFile(file: File): Promise<boolean> {
    try {
      const text = await file.text()
      const projectData = JSON.parse(text) as ProjectData

      // ===== .anime 格式版本校验 =====
      const CURRENT_FORMAT_VERSION = '2.0.0'
      const fileVersion = projectData.meta?.version ?? '0.0.0'
      const fileMajorParsed = fileVersion.split('.').map(Number)[0]
      const currentMajorParsed = CURRENT_FORMAT_VERSION.split('.').map(Number)[0]
      const fileMajor = fileMajorParsed ?? 0
      const currentMajor = currentMajorParsed ?? 2

      if (fileMajor > currentMajor) {
        throw new Error(
          `项目文件格式版本 (${fileVersion}) 高于当前支持版本 (${CURRENT_FORMAT_VERSION})。\n` +
          `请更新 沙雕动画小助手 编辑器后重试。`
        )
      }

      if (fileMajor < currentMajor) {
        throw new Error(
          `项目文件格式版本 (${fileVersion}) 低于当前支持版本 (${CURRENT_FORMAT_VERSION})。\n` +
          `当前版本的 沙雕动画小助手 不兼容旧版工程文件，请使用旧版编辑器打开。`
        )
      }

      projectName.value = projectData.meta.name
      projectMeta.value = projectData.meta

      // TODO: 加载所有数据到 Store
      // 需要将 Base64 转换为 Blob URLs

      isProjectOpen.value = true
      return true
    } catch (error) {
      console.error('[ProjectStore] 从文件加载失败:', error)
      return false
    }
  }

  /**
   * 生成项目名称（新建项目1、新建项目2 等）
   */
  function generateProjectName(): string {
    // 从 localStorage 获取已使用的项目名称计数
    const key = 'animeStudio_projectNameCounter'
    let counter = parseInt(localStorage.getItem(key) ?? '0', 10)
    counter++
    localStorage.setItem(key, counter.toString())
    return `新建项目${counter}`
  }

  // ==================== 演员/旁白管理 ====================

  /**
   * 添加演员
   * v7.0: 演员使用 id 作为标识符
   */
  function addActor(actor: ActorConfig): void {
    actors.value.push(actor)
    markAsUnsaved()
  }

  /**
   * 更新演员
   * v7.0: 使用 id 查找演员
   */
  function updateActor(actorId: string, updates: Partial<Omit<ActorConfig, 'id'>>): void {
    const index = actors.value.findIndex(a => a.id === actorId)
    if (index !== -1) {
      actors.value[index] = { ...actors.value[index], ...updates } as ActorConfig
      markAsUnsaved()
    }
  }

  /**
   * 删除演员
   * v7.0: 使用 id 查找演员
   */
  function deleteActor(actorId: string): void {
    const index = actors.value.findIndex(a => a.id === actorId)
    if (index !== -1) {
      actors.value.splice(index, 1)
      markAsUnsaved()
    }
  }

  /**
   * 更新旁白配置
   */
  function updateNarrator(config: NarratorConfig): void {
    narrator.value = config
    markAsUnsaved()
  }

  /**
   * 通过ID获取演员
   * v7.0: 使用 id 查找演员
   */
  function getActor(actorId: string): ActorConfig | undefined {
    return actors.value.find(a => a.id === actorId)
  }

  /**
   * 通过 characterId 获取演员
   * v7.0: 新增
   */
  function getActorByCharacterId(characterId: string): ActorConfig | undefined {
    return actors.value.find(a => a.characterId === characterId)
  }

  /**
   * 仅供自动化测试使用：直接从 JSON 字符串加载项目数据
   * 绕过 File System Access API
   * 不需要 FileSystemHandle，只解析 JSON 并填充 Store
   */
  async function OnlyForAutoTestCase_OpenProject(jsonContent: string): Promise<void> {
    await Promise.resolve()
    try {
      const projectData = JSON.parse(jsonContent) as ProjectData

      // 更新项目元数据
      projectName.value = projectData.meta.name
      projectMeta.value = projectData.meta

      // 清空所有 Store
      const propStore = usePropStore()
      expressionStore.clearAll()
      backgroundStore.clearAll()
      propStore.clearAll()
      episodeStore.clearAll()
      sceneStore.clearScene()

      // 加载背景数据
      let backgroundsLoaded = false
      if (projectData.assets?.backgrounds && projectData.assets.backgrounds.length > 0) {
        const firstBg = projectData.assets.backgrounds[0]
        if (firstBg?.type) {
          backgroundStore.setBackgrounds(projectData.assets.backgrounds)
          backgroundsLoaded = true
        }
      }
      if (!backgroundsLoaded && projectData.backgrounds) {
        const backgroundsList = Object.values(projectData.backgrounds)
        backgroundStore.setBackgrounds(backgroundsList as Background[])
      }

      // 加载表情数据
      if (projectData.expressions) {
        expressionStore.setExpressions(projectData.expressions)
      }

      // 加载道具数据
      if (projectData.assets?.props) {
        propStore.setProps(projectData.assets.props)
      }

      // 加载音效数据
      const soundStore = useSoundStore()
      if (projectData.assets?.sounds) {
        soundStore.setSounds(projectData.assets.sounds)
      }

      // 加载剧集列表
      if (projectData.episodes && Array.isArray(projectData.episodes) && projectData.episodes.length > 0) {
        episodeStore.episodes = projectData.episodes.map((val) => {
          const ep = val as Episode
          const newEp: Episode = {
            id: ep.id,
            episodeNumber: ep.episodeNumber,
            name: ep.name,
            scenes: ep.scenes ?? [],
            bgmTracks: ep.bgmTracks ?? [],
            duration: ep.duration ?? 0,
            createdAt: ep.createdAt,
            modifiedAt: ep.modifiedAt,
            version: ep.version ?? '6.0'
          }
          if (ep.thumbnail) newEp.thumbnail = ep.thumbnail
          return newEp
        })
      }

      // 加载演员和旁白
      if (projectData.actors && Array.isArray(projectData.actors)) {
        actors.value = projectData.actors
      }
      if (projectData.narrator) {
        narrator.value = projectData.narrator
      }

      // 迁移 Screenplay 数据 (兼容旧逻辑)
      const anyProjectData = projectData as unknown as { screenplays?: Record<string, { scenes: unknown[] }> }
      if (anyProjectData.screenplays && Object.keys(anyProjectData.screenplays).length > 0) {
        Object.entries(anyProjectData.screenplays).forEach(([episodeId, screenplay]) => {
          const episode = episodeStore.episodes.find(ep => ep.id === episodeId)
          if (episode && screenplay.scenes) {
            episode.scenes = screenplay.scenes as unknown as SceneContainer[]
          }
        })
      }
      const hierarchyChanged = reconcileEpisodesHierarchy(episodeStore.episodes, 'loadProjectFromJson')

      // Character 数据加载已移除


      // 设置状态
      isProjectOpen.value = true
      hasUnsavedChanges.value = hierarchyChanged

    } catch (error) {
      console.error('[OnlyForAutoTestCase] Failed to load project:', error)
      throw error
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // v20: 自定义预制动作模板 CRUD
  // ═══════════════════════════════════════════════════════════════════

  function addCustomPreset(template: PresetAnimationTemplate): void {
    const errors = validatePresetTemplate(template)
    if (errors.length > 0) {
      console.warn(`[ProjectStore] 自定义模板校验失败: ${errors.join('; ')}`)
    }
    customPresetAnimations.value = [...customPresetAnimations.value, template]
    markAsUnsaved()
  }

  function deleteCustomPreset(templateId: string): void {
    customPresetAnimations.value = customPresetAnimations.value.filter(t => t.id !== templateId)
    markAsUnsaved()
  }

  function updateCustomPreset(templateId: string, updates: Partial<PresetAnimationTemplate>): void {
    customPresetAnimations.value = customPresetAnimations.value.map(t =>
      t.id === templateId ? { ...t, ...updates } as PresetAnimationTemplate : t
    )
    markAsUnsaved()
  }

  return {
    // 状态
    projectHandle,
    assetsHandle,
    projectName,
    projectMeta,
    isProjectOpen,
    autoSaveEnabled,
    hasUnsavedChanges,

    // v6.0: 项目级演员和旁白配置
    actors,
    narrator,

    // 方法
    selectProjectDirectory,
    scanAnimeFiles,
    generateUniqueFileName,
    newProject,
    openProject,
    saveProject,
    closeProject,
    markAsUnsaved,
    checkUnsavedChanges,
    autoSave,
    hasAutoSave,
    getAutoSaveTime,
    restoreFromAutoSave,
    exportToDirectory,
    saveToFile,
    loadFromFile,
    generateProjectName,

    // v6.0: 演员/旁白管理
    addActor,
    updateActor,
    deleteActor,
    updateNarrator,
    getActor,
    getActorByCharacterId,

    // v12.8: TTS 缓存
    saveTTSAudio,
    checkTTSAudioExists,
    saveTTSTiming,
    loadTTSTiming,
    checkTTSTimingExists,
    ensureTTSTiming,

    // v20: 自定义预制动作模板
    customPresetAnimations,
    addCustomPreset,
    deleteCustomPreset,
    updateCustomPreset,

    // Test Helpers
    OnlyForAutoTestCase_OpenProject
  }
})
