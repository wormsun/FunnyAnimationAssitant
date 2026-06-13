/**
 * LRU (Least Recently Used) 缓存
 * 用于控制显存中纹理的数量
 */

export interface CacheNode<K, V> {
  key: K
  value: V
  prev: CacheNode<K, V> | null
  next: CacheNode<K, V> | null
}

export class LRUCache<K, V> {
  private capacity: number
  private cache: Map<K, CacheNode<K, V>>
  private head: CacheNode<K, V> | null = null
  private tail: CacheNode<K, V> | null = null
  private currentSize = 0
  private onEvict: ((key: K, value: V) => void) | undefined

  constructor(capacity: number, onEvict?: (key: K, value: V) => void) {
    this.capacity = capacity
    this.cache = new Map()
    this.onEvict = onEvict
  }

  /**
   * 获取缓存值，并将该节点移到最前面（最近使用）
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key)
    if (!node) return undefined

    // 将节点移到头部
    this.moveToHead(node)
    return node.value
  }

  /**
   * 设置缓存值
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key)

    if (existingNode) {
      // 更新已存在的节点
      existingNode.value = value
      this.moveToHead(existingNode)
    } else {
      // 创建新节点
      const newNode: CacheNode<K, V> = {
        key,
        value,
        prev: null,
        next: null
      }

      this.cache.set(key, newNode)
      this.addToHead(newNode)
      this.currentSize++

      // 超出容量，删除最久未使用的节点
      if (this.currentSize > this.capacity) {
        const removed = this.removeTail()
        if (removed) {
          this.cache.delete(removed.key)
          this.currentSize--
          
          // 触发驱逐回调
          if (this.onEvict) {
            this.onEvict(removed.key, removed.value)
          }
        }
      }
    }
  }

  /**
   * 删除指定键
   */
  delete(key: K): boolean {
    const node = this.cache.get(key)
    if (!node) return false

    this.removeNode(node)
    this.cache.delete(key)
    this.currentSize--

    // 触发驱逐回调
    if (this.onEvict) {
      this.onEvict(node.key, node.value)
    }

    return true
  }

  /**
   * 检查键是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    // 触发所有节点的驱逐回调
    if (this.onEvict) {
      this.cache.forEach((node) => {
        this.onEvict!(node.key, node.value)
      })
    }

    this.cache.clear()
    this.head = null
    this.tail = null
    this.currentSize = 0
  }

  /**
   * 获取当前缓存大小
   */
  get size(): number {
    return this.currentSize
  }

  /**
   * 获取所有键
   */
  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  /**
   * 将节点添加到头部
   */
  private addToHead(node: CacheNode<K, V>): void {
    node.prev = null
    node.next = this.head

    if (this.head) {
      this.head.prev = node
    }

    this.head = node

    this.tail ??= node
  }

  /**
   * 移除指定节点
   */
  private removeNode(node: CacheNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next
    } else {
      this.head = node.next
    }

    if (node.next) {
      node.next.prev = node.prev
    } else {
      this.tail = node.prev
    }
  }

  /**
   * 将节点移到头部
   */
  private moveToHead(node: CacheNode<K, V>): void {
    this.removeNode(node)
    this.addToHead(node)
  }

  /**
   * 移除尾部节点
   */
  private removeTail(): CacheNode<K, V> | null {
    if (!this.tail) return null

    const node = this.tail
    this.removeNode(node)
    return node
  }
}
