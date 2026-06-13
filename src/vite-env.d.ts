/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
  readonly SSR: boolean
  readonly VITE_TTS_PROVIDER_URL?: string
  readonly VITE_TTS_SYNTHESIZE_ENDPOINT?: string
  readonly VITE_TTS_PREVIEW_ENDPOINT?: string
  readonly VITE_TTS_VOICES_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, unknown>
  export default component
}
