/**
 * Undo/Redo 系统
 * 使用命令模式实现撤销/重做功能
 */

import { computed,ref } from 'vue'

export interface Command {
  execute(): void
  undo(): void
  description?: string
}

export function useUndoRedo(maxHistorySize = 50) {
  const undoStack = ref<Command[]>([])
  const redoStack = ref<Command[]>([])

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  /**
   * 执行命令
   */
  function executeCommand(command: Command) {
    command.execute()
    undoStack.value.push(command)
    
    // 限制历史记录数量
    if (undoStack.value.length > maxHistorySize) {
      undoStack.value.shift()
    }
    
    // 执行新命令时清空 redo 栈
    redoStack.value = []
  }

  /**
   * 撤销
   */
  function undo() {
    if (!canUndo.value) return
    
    const command = undoStack.value.pop()!
    command.undo()
    redoStack.value.push(command)
  }

  /**
   * 重做
   */
  function redo() {
    if (!canRedo.value) return
    
    const command = redoStack.value.pop()!
    command.execute()
    undoStack.value.push(command)
  }

  /**
   * 清空历史记录
   */
  function clear() {
    undoStack.value = []
    redoStack.value = []
  }

  return {
    canUndo,
    canRedo,
    executeCommand,
    undo,
    redo,
    clear
  }
}

