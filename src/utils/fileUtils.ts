/**
 * 文件工具函数
 */

/**
 * 将 File 对象转换为 Blob URL
 */
export function fileToBlob(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * 从 Blob URL 加载图片
 */
export async function loadImageFromBlob(blobUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = blobUrl
  })
}
