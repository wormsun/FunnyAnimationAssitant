import { saveAs } from 'file-saver'

/**
 * 日志服务
 * 用于收集运行时日志并支持导出到文件
 */
class LogService {
  private static instance: LogService
  private logs: string[] = []
  private isCollecting = false

  private constructor() {
    // Singleton
  }

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService()
    }
    return LogService.instance
  }

  /**
   * 开始收集日志
   */
  startCollection() {
    this.logs = []
    this.isCollecting = true
    this.addLog('========== 日志收集开始 ==========')
    this.addLog(`时间: ${new Date().toLocaleString()}`)
  }

  /**
   * 停止收集
   */
  stopCollection() {
    this.isCollecting = false
    this.addLog('========== 日志收集结束 ==========')
  }

  /**
   * 添加日志
   */
  addLog(message: string) {
    if (!this.isCollecting) return
    this.logs.push(message)
  }

  /**
   * 导出日志到文件
   */
  exportLogs(filename = 'scene_preview_log.md') {
    if (this.logs.length === 0) return

    const content = this.logs.join('\n')
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    saveAs(blob, filename)
  }

  /**
   * 获取当前日志内容
   */
  getLogs(): string {
    return this.logs.join('\n')
  }
}

export const logService = LogService.getInstance()
