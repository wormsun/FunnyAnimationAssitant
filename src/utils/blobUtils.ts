/**
 * Blob URL 与 Base64 互转工具函数
 * 用于项目文件的序列化和反序列化
 */

/**
 * 将 Blob URL 转换为 Base64 Data URL
 * @param blobUrl Blob URL (blob:http://...)
 * @returns Base64 Data URL (data:image/png;base64,...)
 */
export async function blobUrlToBase64(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl)
    const blob = await response.blob()
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Failed to convert blob to base64'))
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('[BlobUtils] Failed to convert blob URL to base64:', blobUrl, error)
    throw error
  }
}

/**
 * 将 Base64 Data URL 转换为 Blob URL
 * @param base64 Base64 Data URL
 * @returns Blob URL
 */
export function base64ToBlobUrl(base64: string): string {
  try {
    // 解析 base64 字符串
    const parts = base64.split(',')
    if (parts.length !== 2) {
      throw new Error('Invalid base64 format')
    }

    const header = parts[0]
    const data = parts[1]
    
    if (!header || !data) {
       throw new Error('Invalid base64 data')
    }
    
    const mimeMatch = /:(.*?);/.exec(header)
    if (!mimeMatch) {
      throw new Error('Invalid MIME type')
    }
    
    const mimeString = mimeMatch[1] ?? ''
    const byteString = atob(data)
    
    // 转换为 ArrayBuffer
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i)
    }
    
    // 创建 Blob 并生成 URL
    const blob = new Blob([ab], { type: mimeString })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('[BlobUtils] Failed to convert base64 to blob URL:', error)
    throw error
  }
}

/**
 * 批量转换 Blob URLs 为 Base64
 * @param urls Blob URL 集合
 * @returns Map<原始URL, Base64>
 */
export async function batchBlobUrlsToBase64(urls: Set<string>): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const promises: Promise<void>[] = []
  
  for (const url of urls) {
    if (url.startsWith('blob:')) {
      promises.push(
        blobUrlToBase64(url).then(base64 => {
          result.set(url, base64)
        }).catch(error => {
          console.warn(`[BlobUtils] Failed to convert ${url}:`, error)
        })
      )
    } else {
      // 非 Blob URL 直接保留
      result.set(url, url)
    }
  }
  
  await Promise.all(promises)
  return result
}

/**
 * 批量转换 Base64 为 Blob URLs
 * @param base64Map Map<Base64, any>
 * @returns Map<Base64, BlobURL>
 */
export function batchBase64ToBlobUrls(base64Strings: Set<string>): Map<string, string> {
  const result = new Map<string, string>()
  
  for (const str of base64Strings) {
    if (str.startsWith('data:')) {
      try {
        const blobUrl = base64ToBlobUrl(str)
        result.set(str, blobUrl)
      } catch (error) {
        console.warn(`[BlobUtils] Failed to convert base64:`, error)
        result.set(str, str) // 保留原值
      }
    } else {
      result.set(str, str) // 非 Base64 直接保留
    }
  }
  
  return result
}

/**
 * 递归替换对象中的所有 URL
 * @param data 数据对象
 * @param urlMap URL 映射表 Map<原始URL, 新URL>
 * @returns 替换后的数据
 */
export function replaceUrlsInData(data: unknown, urlMap: Map<string, string>): unknown {
  if (typeof data === 'string') {
    return urlMap.get(data) ?? data
  }
  
  if (Array.isArray(data)) {
    return data.map(item => replaceUrlsInData(item, urlMap))
  }
  
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    const obj = data as Record<string, unknown>
    for (const key in obj) {
      result[key] = replaceUrlsInData(obj[key], urlMap)
    }
    return result
  }
  
  return data
}

/**
 * 递归收集对象中的所有 URL
 * @param data 数据对象
 * @param urlSet URL 集合（会被修改）
 * @param urlType 'blob' | 'base64' | 'all'
 */
export function collectUrlsFromData(data: unknown, urlSet: Set<string>, urlType: 'blob' | 'base64' | 'all' = 'all'): void {
  if (typeof data === 'string') {
    if (urlType === 'all') {
      if (data.startsWith('blob:') || data.startsWith('data:')) {
        urlSet.add(data)
      }
    } else if (urlType === 'blob' && data.startsWith('blob:')) {
      urlSet.add(data)
    } else if (urlType === 'base64' && data.startsWith('data:')) {
      urlSet.add(data)
    }
    return
  }
  
  if (Array.isArray(data)) {
    data.forEach(item => collectUrlsFromData(item, urlSet, urlType))
    return
  }
  
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key in obj) {
      collectUrlsFromData(obj[key], urlSet, urlType)
    }
  }
}
