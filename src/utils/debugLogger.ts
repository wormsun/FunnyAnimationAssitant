const DEBUG_STORAGE_PREFIX = 'funny-animation-assistant.debug.'

export function isDebugEnabled(scope: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(`${DEBUG_STORAGE_PREFIX}${scope}`) === '1'
      || window.localStorage.getItem(`${DEBUG_STORAGE_PREFIX}all`) === '1'
  } catch {
    return false
  }
}

export function debugLog(scope: string, ...args: unknown[]): void {
  if (isDebugEnabled(scope)) {
    console.log(...args)
  }
}

export function debugWarn(scope: string, ...args: unknown[]): void {
  if (isDebugEnabled(scope)) {
    console.warn(...args)
  }
}
