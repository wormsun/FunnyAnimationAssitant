import * as PIXI from 'pixi.js'

/**
 * 生成缩略图工具
 */

const THUMBNAIL_SIZE = 512
const THUMBNAIL_QUALITY = 0.8

// 内存中的缩略图缓存 (Map<sourceUrl, thumbnailUrl>)
// 使用 WeakMap 防止内存泄漏？不，我们需要持久化缓存直到组件销毁
// 但为了跨组件复用，可以用全局 Map，这里先用简单的
const thumbnailCache = new Map<string, string>()

/**
 * 从图片 URL 生成缩略图 Blob URL
 * @param sourceUrl 原始图片 URL (Blob URL 或 http URL)
 * @returns 缩略图 Blob URL
 */
export async function generateThumbnail(sourceUrl: string): Promise<string> {
  if (!sourceUrl) return ''

  // 1. 检查缓存
  if (thumbnailCache.has(sourceUrl)) {
    return thumbnailCache.get(sourceUrl)!
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'

    img.onload = () => {
      try {
        // 计算缩放比例
        let width = img.width
        let height = img.height

        // 如果图片本身很小，直接返回原图
        if (width <= THUMBNAIL_SIZE && height <= THUMBNAIL_SIZE) {
          thumbnailCache.set(sourceUrl, sourceUrl)
          resolve(sourceUrl)
          return
        }

        // 保持纵横比缩放
        if (width > height) {
          if (width > THUMBNAIL_SIZE) {
            height = Math.round(height * (THUMBNAIL_SIZE / width))
            width = THUMBNAIL_SIZE
          }
        } else {
          if (height > THUMBNAIL_SIZE) {
            width = Math.round(width * (THUMBNAIL_SIZE / height))
            height = THUMBNAIL_SIZE
          }
        }

        // 创建 Canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height)

        // 导出为 Blob
        canvas.toBlob((blob) => {
          if (blob) {
            const thumbUrl = URL.createObjectURL(blob)
            thumbnailCache.set(sourceUrl, thumbUrl)
            resolve(thumbUrl)
          } else {
            reject(new Error('Failed to create blob'))
          }
        }, 'image/jpeg', THUMBNAIL_QUALITY)

      } catch (err) {
        let msg = 'Unknown error';
        if (err instanceof Error) msg = err.message;
        else if (typeof err === 'string') msg = err;
        reject(new Error(msg))
      }
    }

    img.onerror = (err) => {
      let msg = 'Unknown error';
      if (err instanceof Error) msg = err.message;
      else if (typeof err === 'string') msg = err;
      reject(new Error(msg))
    }

    img.src = sourceUrl
  })
}

/**
 * 从 PIXI Application 生成缩略图
 * @param app PIXI Application 实例
 * @returns 缩略图 Blob URL
 */
export async function generateThumbnailFromCanvas(app: PIXI.Application): Promise<string> {
  // 1. 提取 Canvas
  // 注意：Extract 操作比较昂贵，可能会导致一瞬间的卡顿
  const sourceCanvas = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement

  return new Promise((resolve, reject) => {
    try {
      // 计算缩放比例
      let width = sourceCanvas.width
      let height = sourceCanvas.height

      // 保持纵横比缩放
      if (width > height) {
        if (width > THUMBNAIL_SIZE) {
          height = Math.round(height * (THUMBNAIL_SIZE / width))
          width = THUMBNAIL_SIZE
        }
      } else {
        if (height > THUMBNAIL_SIZE) {
          width = Math.round(width * (THUMBNAIL_SIZE / height))
          height = THUMBNAIL_SIZE
        }
      }

      // 创建目标 Canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // ★★★ 关键修复：先填充白色背景，避免透明区域在 JPEG 转换时变成黑色 ★★★
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)

      // 绘制图片
      ctx.drawImage(sourceCanvas, 0, 0, width, height)

      // ★★★ 修改：导出为 Base64 Data URL，而不是 Blob URL ★★★
      // 这样可以直接存储到 .anime 文件中，避免 Blob URL 失效
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY)
        resolve(dataUrl)
      } catch (err) {
        reject(new Error('Failed to convert canvas to data URL: ' + (err instanceof Error ? err.message : String(err))))
      }

    } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
}

/**
 * 清理缩略图缓存
 */
export function clearThumbnailCache() {
  thumbnailCache.forEach(url => {
    // 只有当我们创建的 Blob URL 才需要释放
    // 注意：如果是原图 URL (sourceUrl) 被存入缓存，不要释放它！
    if (url.startsWith('blob:') && url !== thumbnailCache.keys().next().value) {
      // 这里很难判断哪个是生成的，哪个是原图。
      // 改进策略：cache 存储 { url: string, isGenerated: boolean }
    }
  })
  // 简单起见，这里暂不自动清理，依赖浏览器页面刷新或组件销毁
  // 实际项目中应该有更严谨的生命周期管理
}
