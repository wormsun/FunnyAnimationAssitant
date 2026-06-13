/**
 * UUID 工具函数
 * 提供统一的 ID 生成策略
 */

/**
 * 生成唯一 ID
 * 优先使用 crypto.randomUUID()（如果可用），否则使用时间戳 + 随机数
 * 
 * @param prefix 可选的前缀（用于标识 ID 类型）
 * @returns 唯一 ID 字符串
 */
export function generateId(prefix?: string): string {
  // 优先使用浏览器原生 UUID API（如果可用）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const uuid = crypto.randomUUID()
    return prefix ? `${prefix}_${uuid}` : uuid
  }

  // 降级方案：时间戳 + 随机数
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 11)
  const id = `${timestamp}_${random}`
  return prefix ? `${prefix}_${id}` : id
}

/**
 * 生成简短 ID（用于显示）
 * 格式：prefix_随机字符串（8位）
 */
export function generateShortId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10)
  return `${prefix}_${random}`
}

