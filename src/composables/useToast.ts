import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
    id: string
    message: string
    type: ToastType
    duration: number
}

// 全局 toast 状态
const toasts = ref<ToastMessage[]>([])
let toastIdCounter = 0

export function useToast() {
    /**
     * 显示 toast 消息
     * @param message 消息内容
     * @param type 消息类型
     * @param duration 显示时长（毫秒），0 表示不自动关闭
     */
    function showToast(
        message: string,
        type: ToastType = 'info',
        duration = 3000
    ) {
        const id = `toast-${++toastIdCounter}`
        const toast: ToastMessage = {
            id,
            message,
            type,
            duration
        }

        toasts.value.push(toast)

        // 自动移除
        if (duration > 0) {
            setTimeout(() => {
                removeToast(id)
            }, duration)
        }

        return id
    }

    /**
     * 移除指定的 toast
     */
    function removeToast(id: string) {
        const index = toasts.value.findIndex(t => t.id === id)
        if (index !== -1) {
            toasts.value.splice(index, 1)
        }
    }

    /**
     * 清除所有 toast
     */
    function clearAllToasts() {
        toasts.value = []
    }

    // 便捷方法
    function success(message: string, duration = 2000) {
        return showToast(message, 'success', duration)
    }

    function error(message: string, duration = 3000) {
        return showToast(message, 'error', duration)
    }

    function warning(message: string, duration = 3000) {
        return showToast(message, 'warning', duration)
    }

    function info(message: string, duration = 3000) {
        return showToast(message, 'info', duration)
    }

    return {
        toasts,
        showToast,
        removeToast,
        clearAllToasts,
        success,
        error,
        warning,
        info
    }
}
