import * as PIXI from 'pixi.js'
import { markRaw, onBeforeUnmount, onMounted, type Ref,ref, shallowRef } from 'vue'

export interface PixiCanvasOptions {
  width?: number
  height?: number
  backgroundColor?: number
}

export function usePixiCanvas(
  container: Ref<HTMLDivElement | undefined>,
  options: PixiCanvasOptions = {}
) {
  const app = shallowRef<PIXI.Application | null>(null)
  const stage = shallowRef<PIXI.Container | null>(null)
  const isReady = ref(false)

  const {
    width = 1920,
    height = 1080,
    backgroundColor = 0x1f2937
  } = options

  // 初始化 Pixi 应用
  async function initPixiApp() {
    if (!container.value || app.value) return

    await Promise.resolve() // Ensure async behavior

    try {

      // 创建 Pixi 应用
      const pixiApp = new PIXI.Application({
        width,
        height,
        backgroundColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      })
      // 开发环境下暴露给 Devtools
      if (import.meta.env.DEV) {
        (globalThis as unknown as Record<string, unknown>)['__PIXI_APP__'] = pixiApp;
      }
      // 将 canvas 添加到容器
      container.value.appendChild(pixiApp.view as HTMLCanvasElement)

      // 使用 markRaw 标记 Pixi 实例，防止 Vue 深度代理
      app.value = markRaw(pixiApp)
      stage.value = markRaw(pixiApp.stage)
      isReady.value = true

    } catch (error) {
      console.error('[PixiCanvas] 初始化失败:', error)
    }
  }

  // 销毁 Pixi 应用
  function destroyPixiApp() {
    if (app.value) {
      app.value.destroy(true, { children: true, texture: true })
      app.value = null
      stage.value = null
      isReady.value = false
    }
  }

  // 添加对象到舞台
  function addToStage(displayObject: PIXI.Container) {
    if (stage.value) {
      stage.value.addChild(displayObject)
    }
  }

  // 从舞台移除对象
  function removeFromStage(displayObject: PIXI.Container) {
    if (stage.value) {
      stage.value.removeChild(displayObject)
    }
  }

  // 清空舞台
  function clearStage() {
    if (stage.value) {
      stage.value.removeChildren()
    }
  }

  // 调整画布大小
  function resize(newWidth: number, newHeight: number) {
    if (app.value) {
      app.value.renderer.resize(newWidth, newHeight)
    }
  }

  onMounted(() => {
    void initPixiApp()
  })

  onBeforeUnmount(() => {
    destroyPixiApp()
  })

  return {
    app,
    stage,
    isReady,
    addToStage,
    removeFromStage,
    clearStage,
    resize
  }
}
