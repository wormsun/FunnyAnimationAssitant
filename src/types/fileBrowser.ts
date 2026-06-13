export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  handle: FileSystemHandle
  size?: number
  isParentDir?: boolean
  children?: FileNode[]
}

export interface SelectedFile {
  handle: FileSystemFileHandle
  path: string
  name: string
}

/**
 * 目录选择结果（用于 FileBrowserDialog 的目录选择模式）
 */
export interface SelectedDirectory {
  handle: FileSystemDirectoryHandle
  path: string
  name: string
}
