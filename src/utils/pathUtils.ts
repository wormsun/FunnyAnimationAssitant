/**
 * 路径计算工具函数
 * 用于从 File System Access API 的文件句柄计算相对路径
 */

/**
 * 通过遍历目录句柄计算文件的相对路径
 * @param projectHandle 项目根目录句柄
 * @param fileHandle 目标文件句柄
 * @returns 相对于项目根目录的路径（使用 / 作为分隔符）
 */
export async function getRelativePath(
  projectHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle
): Promise<string> {
  // 使用深度优先搜索，从项目根目录开始向下查找文件
  async function findFile(
    dirHandle: FileSystemDirectoryHandle,
    targetName: string,
    targetKind: FileSystemHandleKind,
    currentPath: string[]
  ): Promise<boolean> {
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.name === targetName && entry.kind === targetKind) {
          // 检查是否是同一个文件/目录
          if (entry.kind === 'file') {
            const file1 = await (entry).getFile()
            const file2 = await (fileHandle.getFile())
            // 通过比较名称和大小来确认是否是同一个文件
            if (file1.name === file2.name && file1.size === file2.size) {
              return true
            }
          } else {
            // 对于目录，只比较名称
            return true
          }
        }
        
        if (entry.kind === 'directory') {
          currentPath.push(entry.name)
          const found = await findFile(
            entry,
            targetName,
            targetKind,
            currentPath
          )
          if (found) {
            return true
          }
          currentPath.pop()
        }
      }
    } catch (error) {
      console.error('[PathUtils] Error traversing directory:', error)
    }
    return false
  }
  
  // 从项目根目录开始查找
  const searchPath: string[] = []
  const found = await findFile(
    projectHandle,
    fileHandle.name,
    'file',
    searchPath
  )
  
  if (found && searchPath.length > 0) {
    return searchPath.join('/') + '/' + fileHandle.name
  } else if (found) {
    return fileHandle.name
  }
  
  // 如果找不到，尝试另一种方法：通过比较文件句柄
  // 这种方法更可靠，但需要遍历整个目录树
  return await getRelativePathByComparison(projectHandle, fileHandle)
}

/**
 * 通过比较文件句柄来获取相对路径（备用方法）
 * 这个方法会遍历整个目录树，但更可靠
 */
async function getRelativePathByComparison(
  projectHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle
): Promise<string> {
  // const path: string[] = [] // Unused
  
  async function searchDirectory(
    dirHandle: FileSystemDirectoryHandle,
    currentPath: string[]
  ): Promise<string | null> {
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const fileEntry = entry
          // 尝试比较文件句柄
          try {
            // 如果名称相同，尝试读取文件来确认
            if (fileEntry.name === fileHandle.name) {
              const file1 = await fileEntry.getFile()
              const file2 = await fileHandle.getFile()
              if (file1.size === file2.size && file1.name === file2.name) {
                // 可能是同一个文件，构建路径
                if (currentPath.length > 0) {
                  return currentPath.join('/') + '/' + fileHandle.name
                }
                return fileHandle.name
              }
            }
          } catch (error) {
            // 忽略错误，继续搜索
          }
        } else if (entry.kind === 'directory') {
          const newPath = [...currentPath, entry.name]
          const result = await searchDirectory(
            entry,
            newPath
          )
          if (result) {
            return result
          }
        }
      }
    } catch (error) {
      console.error('[PathUtils] Error searching directory:', error)
    }
    return null
  }
  
  const result = await searchDirectory(projectHandle, [])
  if (result) {
    return result
  }
  
  // 如果还是找不到，返回文件名（至少可以工作）
  console.warn('[PathUtils] Could not find file in project directory, returning filename only')
  return fileHandle.name
}

/**
 * 规范化路径（统一使用 / 作为分隔符）
 * @param path 路径字符串
 * @returns 规范化后的路径
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * 连接路径片段
 * @param parts 路径片段数组
 * @returns 连接后的路径
 */
export function joinPath(...parts: string[]): string {
  return parts
    .filter(p => p.length > 0)
    .map(p => normalizePath(p))
    .join('/')
    .replace(/\/+/g, '/') // 移除重复的斜杠
}

