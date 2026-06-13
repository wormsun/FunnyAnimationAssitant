/**
 * File System Access API 工具函数
 * 用于管理项目文件夹结构中的资产文件
 */

/**
 * 确保目录存在，如果不存在则创建
 * @param parentHandle 父目录句柄
 * @param path 相对路径（如 "assets/characters"）
 * @returns 目录句柄
 */
export async function ensureDirectory(
  parentHandle: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(p => p.length > 0)
  let currentHandle = parentHandle

  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
  }

  return currentHandle
}

/**
 * 安全获取子目录句柄
 * Chrome 的 File System Access API 会拒绝某些目录名（如以 .swf/.ini 等扩展名结尾的名称）。
 * 此函数先尝试 getDirectoryHandle，失败后回退到遍历父目录的 entries() 来查找匹配的目录。
 */
export async function getDirectoryHandleSafe(
  parentHandle: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  try {
    return await parentHandle.getDirectoryHandle(name)
  } catch (error) {
    // TypeError = "Name is not allowed" (浏览器安全限制)
    if (error instanceof TypeError) {
      // 回退：遍历父目录的条目来查找匹配的子目录
      for await (const [entryName, handle] of parentHandle.entries()) {
        if (handle.kind === 'directory' && entryName === name) {
          return handle
        }
      }
      throw new Error(`目录不存在（名称被浏览器限制）: ${name}`)
    }
    throw error
  }
}

/**
 * 保存资产文件到磁盘（完整版本）
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径（如 "assets/backgrounds/bg_123.png"）
 * @param file 要保存的文件对象
 * @returns 相对路径
 */
export async function saveFileToDisk(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string,
  file: File
): Promise<string> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  const dirPath = parts.join('/')

  // 确保目录存在
  const dirHandle = dirPath
    ? await ensureDirectory(parentHandle, dirPath)
    : parentHandle

  // 检查文件是否已存在，如果存在则删除
  try {
    await dirHandle.removeEntry(fileName, { recursive: false })
  } catch {
    // 文件不存在，忽略错误
  }

  // 创建文件并写入（使用 keepExistingData: false 确保原子写入）
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable({ keepExistingData: false })
  await writable.write(file)
  await writable.close()


  return relativePath
}

/**
 * 从磁盘加载资产文件
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径（如 "assets/backgrounds/bg_123.png"）
 * @returns Blob URL（用于在浏览器中显示）
 */
export async function loadAssetFromDisk(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string> {
  try {
    const parts = relativePath.split('/')
    const fileName = parts.pop()!
    const dirPath = parts.join('/')

    // 获取目录句柄（添加超时保护）
    let dirHandle = parentHandle
    if (dirPath) {
      const dirParts = dirPath.split('/').filter(p => p.length > 0)

      for (const part of dirParts) {
        try {
          // 为每个 getDirectoryHandle 添加 5 秒超时
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`访问目录超时: ${part}`)), 5000)
          })

          dirHandle = await Promise.race([
            getDirectoryHandleSafe(dirHandle, part),
            timeoutPromise
          ])
        } catch (error: unknown) {
          const dirError = error as Error & { name?: string; message?: string }
          if (dirError.name === 'NotFoundError') {
            throw new Error(`目录不存在: ${part}`)
          } else if (dirError.name === 'SecurityError') {
            throw new Error(`没有权限访问目录: ${part}`)
          } else if (dirError.message?.includes('超时')) {
            throw new Error(`访问目录超时: ${part}，请检查文件系统权限`)
          } else {
            throw new Error(`无法访问目录: ${part} - ${dirError.message}`)
          }
        }
      }
    }

    // 读取文件（添加超时保护）
    const fileTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`读取文件超时: ${fileName}`)), 5000)
    })

    const fileHandle = await Promise.race([
      dirHandle.getFileHandle(fileName),
      fileTimeoutPromise
    ])

    const file = await fileHandle.getFile()

    // v12.8 Fix: 使用 arrayBuffer 读取内容创建独立的 Blob
    // 之前直接使用 File 对象 (URL.createObjectURL(file)) 会保持与磁盘文件的引用
    // 如果磁盘文件被修改（例如自动保存或其他进程写入），该 Blob URL 会立即失效导致 ERR_UPLOAD_FILE_CHANGED
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: file.type })
    const blobUrl = URL.createObjectURL(blob)
    return blobUrl
  } catch (error) {
    console.error('[loadAssetFromDisk] 加载失败:', relativePath, error)
    throw error
  }
}

/**
 * 检测文件是否存在
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径
 * @returns 文件是否存在
 */
export async function fileExists(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<boolean> {
  try {
    const parts = relativePath.split('/')
    const fileName = parts.pop()!
    const dirPath = parts.join('/')

    // 获取目录句柄
    let dirHandle = parentHandle
    if (dirPath) {
      const dirParts = dirPath.split('/').filter(p => p.length > 0)
      for (const part of dirParts) {
        try {
          dirHandle = await getDirectoryHandleSafe(dirHandle, part)
        } catch {
          return false // 目录不存在
        }
      }
    }

    // 检测文件是否存在
    try {
      await dirHandle.getFileHandle(fileName)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

/**
 * 从磁盘删除资产文件
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径
 */
export async function deleteAssetFromDisk(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<void> {
  try {
    const parts = relativePath.split('/')
    const fileName = parts.pop()!
    const dirPath = parts.join('/')

    // 获取目录句柄
    let dirHandle = parentHandle
    if (dirPath) {
      for (const part of dirPath.split('/').filter(p => p.length > 0)) {
        dirHandle = await getDirectoryHandleSafe(dirHandle, part)
      }
    }

    // 删除文件
    await dirHandle.removeEntry(fileName, { recursive: false })

  } catch (error) {
    // 文件可能不存在，忽略错误

  }
}

/**
 * 读取文件内容为文本
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径
 * @returns 文件内容（文本）
 */
export async function readFileAsText(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  const dirPath = parts.join('/')

  let dirHandle = parentHandle
  if (dirPath) {
    for (const part of dirPath.split('/').filter(p => p.length > 0)) {
      dirHandle = await getDirectoryHandleSafe(dirHandle, part)
    }
  }

  const fileHandle = await dirHandle.getFileHandle(fileName)
  const file = await fileHandle.getFile()
  return await file.text()
}

/**
 * 写入文本到文件
 * @param parentHandle 父目录句柄
 * @param relativePath 相对路径
 * @param content 文件内容（文本）
 */
export async function writeFileAsText(
  parentHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string
): Promise<void> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  const dirPath = parts.join('/')

  // 确保目录存在
  const dirHandle = dirPath
    ? await ensureDirectory(parentHandle, dirPath)
    : parentHandle

  // 创建或获取文件句柄
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

