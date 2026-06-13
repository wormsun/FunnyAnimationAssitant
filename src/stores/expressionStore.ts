import { defineStore } from 'pinia'

import type { AnchorPoint, Expression, ExpressionDisplayTransform, ExpressionFrame } from '@/types/project'
import { deleteAssetFromDisk } from '@/utils/fileSystem'

import { useProjectStore } from './projectStore'

interface ExpressionState {
  expressions: Record<string, Expression>
}

function stripLegacyPixelSize(expression: Expression): Expression {
  const { pixelSize: _legacyPixelSize, ...cleanExpression } = expression as Expression & {
    pixelSize?: { width: number; height: number }
  }
  return cleanExpression
}

function stripLegacyPixelSizes(expressions: Record<string, Expression>): Record<string, Expression> {
  return Object.fromEntries(
    Object.entries(expressions).map(([id, expression]) => [id, stripLegacyPixelSize(expression)])
  )
}

/**
 * 表情管理 Store
 * 管理所有表情资源，支持多图表情动画系统
 */
export const useExpressionStore = defineStore('expression', {
  state: (): ExpressionState => ({
    expressions: {}
  }),

  getters: {
    /**
     * 获取所有表情列表（按创建时间倒序排列）
     */
    expressionList(): Expression[] {
      return Object.values(this.expressions).sort((a, b) => {
        const timeA = a.createdAt || 0
        const timeB = b.createdAt || 0
        return timeB - timeA // 降序排列
      })
    },

    /**
     * 获取单个表情
     */
    getExpression: (state) => (id: string): Expression | undefined => {
      return state.expressions[id]
    },

    /**
     * 根据标签筛选表情
     */
    getExpressionsByTag: (state) => (tag: string): Expression[] => {
      if (!tag || tag === '全部') {
        return Object.values(state.expressions).sort((a, b) => {
          const timeA = a.createdAt ?? 0
          const timeB = b.createdAt ?? 0
          return timeB - timeA
        })
      }
      return Object.values(state.expressions)
        .filter(expr => expr.tags?.includes(tag))
        .sort((a, b) => {
          const timeA = a.createdAt ?? 0
          const timeB = b.createdAt ?? 0
          return timeB - timeA
        })
    },

    /**
     * 根据名称搜索表情
     */
    searchExpressions: (state) => (keyword: string): Expression[] => {
      if (!keyword) {
        return Object.values(state.expressions).sort((a, b) => {
          const timeA = a.createdAt ?? 0
          const timeB = b.createdAt ?? 0
          return timeB - timeA
        })
      }
      const lowerKeyword = keyword.toLowerCase()
      return Object.values(state.expressions)
        .filter(expr => expr.name.toLowerCase().includes(lowerKeyword))
        .sort((a, b) => {
          const timeA = a.createdAt ?? 0
          const timeB = b.createdAt ?? 0
          return timeB - timeA
        })
    }
  },

  actions: {
    /**
     * 生成UUID
     */
    generateId(): string {
      return `expr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },

    /**
     * 创建表情
     */
    createExpression(
      name: string,
      defaultFrame: ExpressionFrame,
      options?: {
        speakingFrames?: ExpressionFrame[]
        tags?: string[]
        anchor?: AnchorPoint
        speakingFps?: number
        speakingLoop?: boolean
        flipHorizontal?: boolean
        lockEdit?: boolean
        defaultScale?: number
        // v6.5: 静止帧来源标识
        stillFrameSource?: 'frame' | 'custom'
        stillFrameIndex?: number
        gender?: 'male' | 'female' | 'other'
        blendMode?: 'normal' | 'multiply'
      }
    ): string {
      const id = this.generateId()

      // 确保 defaultFrame 有 id
      if (!defaultFrame.id) {
        defaultFrame.id = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }

      // 确保 speakingFrames 中的每一帧都有 id
      const speakingFrames = (options?.speakingFrames ?? []).map(frame => {
        if (!frame.id) {
          frame.id = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
        return frame
      })

      const expression: Expression = {
        id,
        name,
        tags: options?.tags ?? [],
        defaultFrame,
        speakingFrames,
        anchor: options?.anchor ?? { x: 0.5, y: 0.5 },
        speakingFps: options?.speakingFps ?? 12,
        speakingLoop: options?.speakingLoop ?? true,
        flipHorizontal: options?.flipHorizontal ?? false,
        lockEdit: options?.lockEdit ?? false,
        createdAt: Date.now()
      }

      if (options?.gender) expression.gender = options.gender
      if (options?.defaultScale !== undefined) expression.defaultScale = options.defaultScale
      if (options?.stillFrameSource) expression.stillFrameSource = options.stillFrameSource
      if (options?.stillFrameIndex !== undefined) expression.stillFrameIndex = options.stillFrameIndex
      if (options?.blendMode) expression.blendMode = options.blendMode

      this.expressions[id] = expression

      // 标记项目有未保存的更改
      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()

      return id
    },

    /**
     * 更新表情
     */
    updateExpression(id: string, updates: Partial<Expression>): boolean {
      if (this.expressions[id]) {
        this.expressions[id] = stripLegacyPixelSize({
          ...this.expressions[id],
          ...updates
        })

        // 标记项目有未保存的更改
        const projectStore = useProjectStore()
        projectStore.markAsUnsaved()

        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 更新默认帧（从路径）
     */
    updateDefaultFrameFromPath(id: string, relativePath: string): boolean {
      if (!this.expressions[id]) {
        console.warn(`[ExpressionStore] Expression not found: ${id}`)
        return false
      }

      // 更新帧（存储路径）
      this.expressions[id].defaultFrame = {
        id: this.expressions[id].defaultFrame.id || this.generateId(),
        url: relativePath
      }

      // 标记项目有未保存的更改
      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()

      return true
    },

    /**
     * 更新默认帧
     */
    updateDefaultFrame(id: string, frame: ExpressionFrame): boolean {
      if (this.expressions[id]) {
        // 释放旧的 Blob URL
        const oldFrame = this.expressions[id].defaultFrame
        if (oldFrame.url.startsWith('blob:')) {
          URL.revokeObjectURL(oldFrame.url)
        }

        if (!frame.id) {
          frame.id = this.generateId()
        }
        this.expressions[id].defaultFrame = frame

        // 标记项目有未保存的更改
        const projectStore = useProjectStore()
        projectStore.markAsUnsaved()

        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 添加说话帧（从路径）
     */
    addSpeakingFrameFromPath(id: string, relativePath: string, index?: number): boolean {
      if (!this.expressions[id]) {
        console.warn(`[ExpressionStore] Expression not found: ${id}`)
        return false
      }

      // 添加帧（存储路径）
      const frame: ExpressionFrame = {
        id: this.generateId(),
        url: relativePath
      }
      if (index !== undefined && index >= 0 && index <= this.expressions[id].speakingFrames.length) {
        this.expressions[id].speakingFrames.splice(index, 0, frame)
      } else {
        this.expressions[id].speakingFrames.push(frame)
      }

      // 标记项目有未保存的更改
      const projectStore = useProjectStore()
      projectStore.markAsUnsaved()

      return true
    },

    /**
     * 添加说话帧
     */
    addSpeakingFrame(id: string, frame: ExpressionFrame, index?: number): boolean {
      if (this.expressions[id]) {
        if (!frame.id) {
          frame.id = this.generateId()
        }

        if (index !== undefined && index >= 0 && index <= this.expressions[id].speakingFrames.length) {
          this.expressions[id].speakingFrames.splice(index, 0, frame)
        } else {
          this.expressions[id].speakingFrames.push(frame)
        }

        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 删除说话帧
     */
    removeSpeakingFrame(id: string, frameIndex: number): boolean {
      if (this.expressions[id]) {
        if (frameIndex >= 0 && frameIndex < this.expressions[id].speakingFrames.length) {
          const frame = this.expressions[id].speakingFrames[frameIndex]
          if (frame) {
            // 释放 Blob URL
            if (frame.url.startsWith('blob:')) {
              URL.revokeObjectURL(frame.url)
            }
          }

          this.expressions[id].speakingFrames.splice(frameIndex, 1)

          // 标记项目有未保存的更改
          const projectStore = useProjectStore()
          projectStore.markAsUnsaved()

          return true
        }
      }
      console.warn(`[ExpressionStore] Expression or frame not found: ${id}`)
      return false
    },

    /**
     * 更新说话帧
     */
    updateSpeakingFrame(id: string, frameIndex: number, frame: Partial<ExpressionFrame>): boolean {
      if (this.expressions[id] && frameIndex >= 0 && frameIndex < this.expressions[id].speakingFrames.length) {
        const oldFrame = this.expressions[id].speakingFrames[frameIndex]
        if (!oldFrame) return false

        // 如果更新了 URL，释放旧的 Blob URL
        if (frame.url && frame.url !== oldFrame.url && oldFrame.url.startsWith('blob:')) {
          URL.revokeObjectURL(oldFrame.url)
        }

        this.expressions[id].speakingFrames[frameIndex] = {
          ...oldFrame,
          ...frame
        } as ExpressionFrame

        return true
      }
      console.warn(`[ExpressionStore] Expression or frame not found: ${id}`)
      return false
    },

    /**
     * 调整说话帧顺序
     */
    reorderSpeakingFrames(id: string, fromIndex: number, toIndex: number): boolean {
      if (this.expressions[id]) {
        const frames = this.expressions[id].speakingFrames
        if (fromIndex >= 0 && fromIndex < frames.length &&
          toIndex >= 0 && toIndex < frames.length) {
          const [movedFrame] = frames.splice(fromIndex, 1)
          if (movedFrame) {
            frames.splice(toIndex, 0, movedFrame)
          }

          return true
        }
      }
      console.warn(`[ExpressionStore] Expression not found or invalid indices: ${id}`)
      return false
    },

    /**
     * 更新锚点
     */
    updateAnchor(id: string, anchor: AnchorPoint): boolean {
      if (this.expressions[id]) {
        this.expressions[id].anchor = anchor
        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 更新标签
     */
    updateTags(id: string, tags: string[]): boolean {
      if (this.expressions[id]) {
        this.expressions[id].tags = tags
        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 删除表情
     */
    async deleteExpression(id: string): Promise<boolean> {
      if (this.expressions[id]) {
        const expr = this.expressions[id]

        // 如果项目已打开，删除磁盘文件
        const projectStore = useProjectStore()
        if (projectStore.assetsHandle) {
          try {
            // 删除默认帧
            if (!expr.defaultFrame.url.startsWith('blob:') && !expr.defaultFrame.url.startsWith('data:')) {
              await deleteAssetFromDisk(projectStore.assetsHandle, expr.defaultFrame.url)
            }

            // 删除所有说话帧
            for (const frame of expr.speakingFrames) {
              if (!frame.url.startsWith('blob:') && !frame.url.startsWith('data:')) {
                await deleteAssetFromDisk(projectStore.assetsHandle, frame.url)
              }
            }
          } catch (error) {
            console.warn('[ExpressionStore] 删除表情文件失败:', error)
          }
        }

        // 释放默认帧的 Blob URL
        if (expr.defaultFrame.url.startsWith('blob:')) {
          URL.revokeObjectURL(expr.defaultFrame.url)
        }

        // 释放所有说话帧的 Blob URLs
        expr.speakingFrames.forEach(frame => {
          if (frame.url.startsWith('blob:')) {
            URL.revokeObjectURL(frame.url)
          }
        })

        delete this.expressions[id]
        return true
      }
      console.warn(`[ExpressionStore] Expression not found: ${id}`)
      return false
    },

    /**
     * 批量删除表情
     */
    async deleteExpressions(ids: string[]): Promise<number> {
      let count = 0
      for (const id of ids) {
        if (await this.deleteExpression(id)) {
          count++
        }
      }
      return count
    },

    /**
     * 清空所有表情
     */
    clearAll() {
      // 释放所有 Blob URLs
      Object.values(this.expressions).forEach(expr => {
        if (expr.defaultFrame.url.startsWith('blob:')) {
          URL.revokeObjectURL(expr.defaultFrame.url)
        }
        expr.speakingFrames.forEach(frame => {
          if (frame.url.startsWith('blob:')) {
            URL.revokeObjectURL(frame.url)
          }
        })
      })

      this.expressions = {}
    },

    /**
     * 设置所有表情（用于加载项目数据）
     * @param expressionsData 表情数据对象
     */
    setExpressions(expressionsData: Record<string, Expression>): void {
      this.expressions = stripLegacyPixelSizes(expressionsData)
    },

    /**
     * 导出表情配置为 JSON
     */
    exportToJSON(): string {
      const data = {
        version: '2.4',
        exportTime: new Date().toISOString(),
        expressions: this.expressions
      }
      return JSON.stringify(data, null, 2)
    },

    /**
     * 从 JSON 导入表情配置
     */
    importFromJSON(jsonString: string): boolean {
      try {
        const data = JSON.parse(jsonString) as { expressions?: Record<string, Expression> }
        if (data.expressions) {
          this.expressions = stripLegacyPixelSizes(data.expressions)
          return true
        }
        return false
      } catch (error) {
        console.error('[ExpressionStore] Failed to import JSON:', error)
        return false
      }
    },

    // ==========================================
    // 显示变换封装 (Display Transform Encapsulation)
    // ==========================================

    /**
     * 获取表情的有效缩放比例
     * 始终返回 defaultScale（默认为 1）
     * @param expressionId 表情ID
     */
    getEffectiveScale(expressionId: string): number {
      const expr = this.expressions[expressionId]
      if (!expr) return 1
      return expr.defaultScale ?? 1
    },

    /**
     * 获取表情的显示变换参数（统一封装）
     * 外部只需调用此方法，无需了解内部属性细节
     * @param expressionId 表情ID
     * @param externalFlipX 外部翻转需求（如部位实例的 flipX），与表情翻转进行 XOR 运算
     * @returns { scale: number, flipX: boolean }
     */
    getDisplayTransform(expressionId: string, externalFlipX = false): ExpressionDisplayTransform {
      const expr = this.expressions[expressionId]
      if (!expr) {
        return { scale: 1, flipX: externalFlipX }
      }

      const effectiveScale = this.getEffectiveScale(expressionId)
      const exprFlipX = expr.flipHorizontal ?? false

      // XOR: 两个翻转状态不同时才需要翻转
      const shouldFlipX = externalFlipX !== exprFlipX

      return {
        scale: effectiveScale,
        flipX: shouldFlipX
      }
    },

    /**
     * 获取表情的 CSS Transform 样式（用于普通 HTML 控件）
     * 封装了 flipHorizontal 和 defaultScale 的处理细节
     * @param expressionId 表情ID
     * @param externalFlipX 外部翻转需求（可选）
     * @returns CSS transform 字符串
     */
    getCssDisplayStyle(expressionId: string, externalFlipX = false): { transform: string } {
      const { scale, flipX } = this.getDisplayTransform(expressionId, externalFlipX)

      const transforms: string[] = []

      // 翻转处理
      if (flipX) {
        transforms.push('scaleX(-1)')
      }

      // 缩放处理（当 scale !== 1 时才添加）
      if (scale !== 1) {
        transforms.push(`scale(${scale})`)
      }

      return {
        transform: transforms.length > 0 ? transforms.join(' ') : 'none'
      }
    },

    /**
     * 获取表情锚点的显示坐标（考虑翻转）
     * 用于在普通控件（如 ExpressionPreview）中正确显示锚点位置
     * @param expressionId 表情ID
     * @param externalFlipX 外部翻转
     * @returns 显示用的锚点坐标（已处理镜像）
     */
    getDisplayAnchor(expressionId: string, externalFlipX = false): AnchorPoint {
      const expr = this.expressions[expressionId]
      if (!expr) {
        return { x: 0.5, y: 0.5 }
      }

      const anchor = expr.anchor
      const { flipX } = this.getDisplayTransform(expressionId, externalFlipX)

      // 如果需要翻转，X 坐标镜像
      return {
        x: flipX ? (1 - anchor.x) : anchor.x,
        y: anchor.y
      }
    },

    /**
     * 计算应用到 PixiJS Sprite 的缩放值
     * 封装了 flipHorizontal 和 defaultScale 的处理细节
     * @param expressionId 表情ID
     * @param baseScale 外部传入的基础缩放（如部位实例的 scale）
     * @param externalFlipX 外部翻转（如部位实例的 flipX），与表情翻转进行 XOR 运算
     * @returns 最终的 scale { x, y }
     */
    calculatePixiScale(
      expressionId: string,
      baseScale: { x: number; y: number } = { x: 1, y: 1 },
      externalFlipX = false
    ): { x: number; y: number } {
      const { scale: effectiveScale, flipX } = this.getDisplayTransform(expressionId, externalFlipX)

      // 计算最终缩放
      const finalScaleX = Math.abs(baseScale.x) * effectiveScale * (flipX ? -1 : 1)
      const finalScaleY = Math.abs(baseScale.y) * effectiveScale

      return { x: finalScaleX, y: finalScaleY }
    },

  }
})
