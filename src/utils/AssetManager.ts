/**
 * 资源加载器
 * 管理图片、音频等资源的加载和缓存
 */

import * as PIXI from 'pixi.js'

import type { Assets } from '@/types/project'

import { LRUCache } from './LRUCache'

export interface LoadProgress {
  loaded: number
  total: number
  currentUrl: string
}

export interface AssetManagerConfig {
  maxTextureCache?: number // 最大纹理缓存数量
  maxMemoryMB?: number // 最大内存限制（MB）
}

export class AssetManager {
  private textureCache: LRUCache<string, PIXI.Texture>
  private imageCache = new Map<string, HTMLImageElement>()
  private audioCache = new Map<string, AudioBuffer>()
  private loadingPromises = new Map<string, Promise<unknown>>()
  private audioContext: AudioContext
  private maxMemoryBytes: number
  private currentMemoryBytes = 0

  constructor(config: AssetManagerConfig = {}) {
    // 不再使用 maxTextureCache，完全由内存限制控制
    const maxMemoryMB = config.maxMemoryMB ?? 200

    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024

    // 创建 LRU 纹理缓存，驱逐时销毁纹理
    this.textureCache = new LRUCache<string, PIXI.Texture>(
      10000, // 设置极大值，实际由内存限制控制驱逐
      (url, texture) => {
        texture.destroy(true)

        // 更新内存统计
        const img = this.imageCache.get(url)
        if (img) {
          const size = this.estimateImageSize(img)
          this.currentMemoryBytes -= size
          this.imageCache.delete(url)
        }
      }
    )

    // 延迟初始化 AudioContext，避免在用户未交互时创建导致 suspended 状态
    // 在实际需要时再创建（在 loadAudio 中）
    this.audioContext = null as unknown as AudioContext
  }

  /**
   * 获取或创建 AudioContext（延迟初始化）
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      // 如果处于 suspended 状态，尝试恢复
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(err => {
          console.warn('[AssetManager] Failed to resume AudioContext:', err)
        })
      }
    }
    return this.audioContext
  }

  /**
   * 从项目资源列表加载所有资源
   */
  async loadProjectAssets(
    assets: Assets,
    onProgress?: (progress: LoadProgress) => void
  ): Promise<void> {
    const urls: string[] = []

    // 收集背景图片 URL
    assets.backgrounds.forEach(bg => {
        if (bg.url) urls.push(bg.url)
    })

    // 收集音乐 URL
    assets.musics.forEach(music => urls.push(music.url))
    let loaded = 0
    const total = urls.length

    for (const url of urls) {
      if (onProgress) {
        onProgress({ loaded, total, currentUrl: url })
      }

      try {
        if (this.isAudioUrl(url)) {
          await this.loadAudio(url)
        } else {
          await this.loadImage(url)
        }
        loaded++
      } catch (error) {
        // Ignore error
      }
    }

    if (onProgress) {
      onProgress({ loaded: total, total, currentUrl: '' })
    }
  }

  /**
   * 加载图片并创建纹�?
   */
  async loadImage(url: string): Promise<PIXI.Texture> {
    // 检查纹理缓�?
    const cached = this.textureCache.get(url)
    if (cached) {
      return cached
    }

    // 检查是否正在加?
    const loading = this.loadingPromises.get(url)
    if (loading) {
      return loading as Promise<PIXI.Texture>
    }

    // 开始加�?
    const promise = this._loadImageInternal(url)
    this.loadingPromises.set(url, promise)

    try {
      const texture = await promise
      return texture
    } finally {
      this.loadingPromises.delete(url)
    }
  }

  private async _loadImageInternal(url: string): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        try {
          // 估算图片大小
          const size = this.estimateImageSize(img)

          // 检查内存限�?
          if (this.currentMemoryBytes + size > this.maxMemoryBytes) {
            this.evictOldTextures(size)
          }

          // 创建 Pixi 纹理
          const baseTexture = PIXI.BaseTexture.from(img, {
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            resolution: 1
          })
          const texture = new PIXI.Texture(baseTexture)

          // 缓存图片和纹�?
          this.imageCache.set(url, img)
          this.textureCache.set(url, texture)
          this.currentMemoryBytes += size

          resolve(texture)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }

      img.onerror = () => {
        reject(new Error(`加载图片失败: ${url}`))
      }

      img.src = url
    })
  }

  /**
   * 加载音频
   */
  async loadAudio(url: string): Promise<AudioBuffer> {
    // 检查缓�?
    const cached = this.audioCache.get(url)
    if (cached) {
      return cached
    }

    // 检查是否正在加?
    const loading = this.loadingPromises.get(url)
    if (loading) {
      return loading as Promise<AudioBuffer>
    }

    // 开始加�?
    const promise = this._loadAudioInternal(url)
    this.loadingPromises.set(url, promise)

    try {
      const buffer = await promise
      return buffer
    } finally {
      this.loadingPromises.delete(url)
    }
  }

  private async _loadAudioInternal(url: string): Promise<AudioBuffer> {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioContext = this.getAudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      this.audioCache.set(url, audioBuffer)
      return audioBuffer
    } catch (error) {
      throw new Error(`加载音频失败: ${url} - ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取纹理
   */
  getTexture(url: string): PIXI.Texture | undefined {
    return this.textureCache.get(url)
  }

  /**
   * 获取音频缓冲
   */
  getAudio(url: string): AudioBuffer | undefined {
    return this.audioCache.get(url)
  }

  /**
   * 预加载多个资�?
   */
  async preload(urls: string[]): Promise<void> {
    const promises = urls.map(url => {
      if (this.isAudioUrl(url)) {
        return this.loadAudio(url)
      } else {
        return this.loadImage(url)
      }
    })

    await Promise.all(promises)
  }

  /**
   * 清理缓存
   */
  clear(): void {
    this.textureCache.clear()
    this.imageCache.clear()
    this.audioCache.clear()
    this.loadingPromises.clear()
    this.currentMemoryBytes = 0
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      textures: this.textureCache.size,
      images: this.imageCache.size,
      audios: this.audioCache.size,
      memoryMB: (this.currentMemoryBytes / 1024 / 1024).toFixed(2),
      maxMemoryMB: (this.maxMemoryBytes / 1024 / 1024).toFixed(2)
    }
  }

  /**
   * 估算图片占用内存大小（字节）
   */
  private estimateImageSize(img: HTMLImageElement): number {
    // 估算：width * height * 4 (RGBA)
    // 考虑 Mipmap 和 GPU 内存对齐，使用 1.5 倍安全系数
    return Math.ceil(img.width * img.height * 4 * 1.5)
  }

  /**
   * 驱逐旧纹理以释放内�?
   */
  private evictOldTextures(neededBytes: number): void {
    const keys = this.textureCache.keys()
    let freedBytes = 0

    for (const url of keys) {
      if (freedBytes >= neededBytes) break

      const img = this.imageCache.get(url)
      if (img) {
        const size = this.estimateImageSize(img)
        this.textureCache.delete(url)
        freedBytes += size
      }
    }

  }

  /**
   * 判断是否为音�?URL
   */
  private isAudioUrl(url: string): boolean {
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a', '.aac']
    const lowerUrl = url.toLowerCase()
    return audioExts.some(ext => lowerUrl.endsWith(ext))
  }

  /**
   * 销毁资源管理器
   */
  destroy(): void {
    this.clear()
    if (this.audioContext) {
      void this.audioContext.close()
    }
  }
}
