/**
 * 文件系统工具
 */

/**
 * 递归遍历目录建立文件映射
 */
export async function buildFileMap(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  fileMap: Map<string, FileSystemFileHandle>
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.kind === 'file') {
      fileMap.set(entryPath, entry)
    } else if (entry.kind === 'directory') {
      await buildFileMap(entry, entryPath, fileMap)
    }
  }
}
