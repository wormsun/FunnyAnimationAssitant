/**
 * 可插拔 TTS Provider 客户端。
 *
 * 开源版默认不连接任何私有云端服务。需要语音合成时，可通过
 * registerTTSProvider / configureLocalHttpTTSProvider 显式接入本地模型、
 * 自托管服务或第三方适配器。
 */

import type { TTSEngine } from '@/constants/voiceOptions'
import { getVoiceOptions } from '@/constants/voiceOptions'

export interface TTSRequest {
  text: string
  engine?: TTSEngine
  voiceType?: number
  volume?: number
  speed?: number
  codec?: 'mp3' | 'wav' | 'pcm'
  sampleRate?: 16000 | 8000
}

export interface TTSResponse {
  audio: string
  audioBase64?: string
  duration?: number
  cached?: boolean
  providerId?: string
}

export interface VoiceInfo {
  id: number
  name: string
  gender: 'male' | 'female'
  language: string
  description: string
  providerId?: string
}

export interface TTSProvider {
  id: string
  label: string
  description?: string
  synthesize(request: TTSRequest): Promise<TTSResponse>
  preview?(request: TTSRequest): Promise<TTSResponse>
  estimateDuration?(text: string, speed?: number): Promise<number>
  getVoices?(): Promise<VoiceInfo[]>
  clearCache?(): void
  getCacheSize?(): number
}

export interface LocalHttpTTSProviderConfig {
  baseUrl: string
  synthesizeEndpoint?: string
  previewEndpoint?: string
  voicesEndpoint?: string
  headers?: Record<string, string>
}

interface LocalHttpTTSPayload {
  audio?: string
  audioUrl?: string
  audioBase64?: string
  duration?: number
  cached?: boolean
}

const DEFAULT_PROVIDER_ID = 'manual'
const LOCAL_HTTP_PROVIDER_ID = 'local-http'
export const LOCAL_HTTP_TTS_CONFIG_STORAGE_KEY = 'funny-animation-assistant.tts.local-http'

export class TTSProviderNotConfiguredError extends Error {
  readonly errorCode = 'TTS_PROVIDER_NOT_CONFIGURED'

  constructor() {
    super('本地 TTS Provider 尚未配置。请先为台词导入本地音频，或在 Phase 2 TTS Provider 中接入本地语音服务。')
    this.name = 'TTSProviderNotConfiguredError'
  }
}

export class TTSProviderNotFoundError extends Error {
  readonly errorCode = 'TTS_PROVIDER_NOT_FOUND'

  constructor(providerId: string) {
    super(`未找到 TTS Provider: ${providerId}`)
    this.name = 'TTSProviderNotFoundError'
  }
}

export class TTSProviderRegistry {
  private readonly providers = new Map<string, TTSProvider>()

  register(provider: TTSProvider): void {
    if (!provider.id.trim()) {
      throw new Error('TTS Provider id 不能为空')
    }
    this.providers.set(provider.id, provider)
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId)
  }

  get(providerId: string): TTSProvider | undefined {
    return this.providers.get(providerId)
  }

  list(): TTSProvider[] {
    return [...this.providers.values()]
  }

  clear(): void {
    this.providers.clear()
  }
}

export class TTSClient {
  private activeProviderId = DEFAULT_PROVIDER_ID

  constructor(private readonly registry: TTSProviderRegistry) {}

  setActiveProvider(providerId: string): void {
    if (!this.registry.get(providerId)) {
      throw new TTSProviderNotFoundError(providerId)
    }
    this.activeProviderId = providerId
  }

  getActiveProviderId(): string {
    return this.activeProviderId
  }

  getActiveProvider(): TTSProvider {
    const provider = this.registry.get(this.activeProviderId)
    if (!provider) {
      throw new TTSProviderNotFoundError(this.activeProviderId)
    }
    return provider
  }

  listProviders(): TTSProvider[] {
    return this.registry.list()
  }

  registerProvider(provider: TTSProvider, options: { activate?: boolean } = {}): void {
    this.registry.register(provider)
    if (options.activate) {
      this.activeProviderId = provider.id
    }
  }

  synthesize(request: TTSRequest): Promise<TTSResponse> {
    return this.withProviderId(this.getActiveProvider().synthesize(request))
  }

  preview(request: TTSRequest): Promise<TTSResponse> {
    const provider = this.getActiveProvider()
    if (provider.preview) {
      return this.withProviderId(provider.preview(request))
    }
    return this.withProviderId(provider.synthesize(request))
  }

  async batchSynthesize(requests: TTSRequest[]): Promise<TTSResponse[]> {
    return Promise.all(requests.map(request => this.synthesize(request)))
  }

  async estimateDuration(text: string, speed = 0): Promise<number> {
    const provider = this.getActiveProvider()
    if (provider.estimateDuration) {
      return provider.estimateDuration(text, speed)
    }
    return estimateDurationLocally(text, speed)
  }

  getVoices(): Promise<VoiceInfo[]> {
    const provider = this.getActiveProvider()
    return provider.getVoices ? provider.getVoices() : Promise.resolve([])
  }

  clearCache(): void {
    this.getActiveProvider().clearCache?.()
  }

  getCacheSize(): number {
    return this.getActiveProvider().getCacheSize?.() ?? 0
  }

  private async withProviderId(responsePromise: Promise<TTSResponse>): Promise<TTSResponse> {
    const response = await responsePromise
    if (response.providerId) return response
    return {
      ...response,
      providerId: this.activeProviderId,
    }
  }
}

export function estimateDurationLocally(text: string, speed = 0): number {
  const cleanedText = text.replace(/#/g, '').trim()
  if (!cleanedText) return 0

  const charsPerSecond = Math.max(2.5, 4 + speed)
  return Math.ceil((cleanedText.length / charsPerSecond) * 1000)
}

export function createManualTTSProvider(): TTSProvider {
  return {
    id: DEFAULT_PROVIDER_ID,
    label: '手动导入音频',
    description: '默认 Provider，不自动合成语音；请为台词导入本地音频。',
    synthesize: () => Promise.reject(new TTSProviderNotConfiguredError()),
    preview: () => Promise.reject(new TTSProviderNotConfiguredError()),
    estimateDuration: (text, speed) => Promise.resolve(estimateDurationLocally(text, speed)),
    getVoices: () => Promise.resolve(toVoiceInfos(DEFAULT_PROVIDER_ID)),
    getCacheSize: () => 0,
  }
}

export function createLocalHttpTTSProvider(config: LocalHttpTTSProviderConfig): TTSProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const synthesizeEndpoint = config.synthesizeEndpoint ?? '/synthesize'
  const previewEndpoint = config.previewEndpoint ?? synthesizeEndpoint
  const voicesEndpoint = config.voicesEndpoint ?? '/voices'

  async function post(endpoint: string, request: TTSRequest): Promise<TTSResponse> {
    const res = await fetch(`${baseUrl}${normalizeEndpoint(endpoint)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      throw new Error(`本地 TTS Provider 请求失败: HTTP ${res.status}`)
    }

    const payload = await res.json() as LocalHttpTTSPayload
    return normalizeLocalHttpResponse(payload)
  }

  return {
    id: LOCAL_HTTP_PROVIDER_ID,
    label: '本地 HTTP TTS',
    description: '通过本机或自托管 HTTP 服务合成语音。',
    synthesize: request => post(synthesizeEndpoint, request),
    preview: request => post(previewEndpoint, request),
    estimateDuration: (text, speed) => Promise.resolve(estimateDurationLocally(text, speed)),
    getVoices: async () => {
      const init: RequestInit = { method: 'GET' }
      if (config.headers) {
        init.headers = config.headers
      }

      const res = await fetch(`${baseUrl}${normalizeEndpoint(voicesEndpoint)}`, init)
      if (!res.ok) return toVoiceInfos(LOCAL_HTTP_PROVIDER_ID)
      return await res.json() as VoiceInfo[]
    },
  }
}

export function registerTTSProvider(provider: TTSProvider, options?: { activate?: boolean }): void {
  ttsClient.registerProvider(provider, options)
}

export function configureLocalHttpTTSProvider(
  config: LocalHttpTTSProviderConfig,
  options: { activate?: boolean; persist?: boolean } = {}
): void {
  const provider = createLocalHttpTTSProvider(config)
  ttsClient.registerProvider(provider, { activate: options.activate ?? true })

  if (options.persist) {
    saveLocalHttpProviderConfig(config)
  }
}

function createDefaultRegistry(): TTSProviderRegistry {
  const registry = new TTSProviderRegistry()
  registry.register(createManualTTSProvider())
  return registry
}

function bootstrapConfiguredProvider(client: TTSClient): void {
  const envBaseUrl = import.meta.env.VITE_TTS_PROVIDER_URL
  if (envBaseUrl) {
    const config: LocalHttpTTSProviderConfig = { baseUrl: envBaseUrl }
    if (import.meta.env.VITE_TTS_SYNTHESIZE_ENDPOINT) {
      config.synthesizeEndpoint = import.meta.env.VITE_TTS_SYNTHESIZE_ENDPOINT
    }
    if (import.meta.env.VITE_TTS_PREVIEW_ENDPOINT) {
      config.previewEndpoint = import.meta.env.VITE_TTS_PREVIEW_ENDPOINT
    }
    if (import.meta.env.VITE_TTS_VOICES_ENDPOINT) {
      config.voicesEndpoint = import.meta.env.VITE_TTS_VOICES_ENDPOINT
    }

    client.registerProvider(
      createLocalHttpTTSProvider(config),
      { activate: true }
    )
    return
  }

  const savedConfig = loadLocalHttpProviderConfig()
  if (savedConfig) {
    client.registerProvider(createLocalHttpTTSProvider(savedConfig), { activate: true })
  }
}

function normalizeLocalHttpResponse(payload: LocalHttpTTSPayload): TTSResponse {
  const audio = payload.audio ?? payload.audioUrl
  const audioBase64 = payload.audioBase64 ?? (audio ? extractBase64FromDataUrl(audio) : undefined)
  const audioUrl = audio ?? (audioBase64 ? toAudioDataUrl(audioBase64) : '')

  if (!audioUrl) {
    throw new Error('本地 TTS Provider 响应缺少 audio 或 audioBase64')
  }

  const response: TTSResponse = { audio: audioUrl }
  if (audioBase64) response.audioBase64 = audioBase64
  if (payload.duration !== undefined) response.duration = payload.duration
  if (payload.cached !== undefined) response.cached = payload.cached
  return response
}

function toAudioDataUrl(audioBase64: string, mimeType = 'audio/mpeg'): string {
  return `data:${mimeType};base64,${audioBase64}`
}

function extractBase64FromDataUrl(audio: string): string | undefined {
  const match = /^data:[^;]+;base64,(.+)$/u.exec(audio)
  return match?.[1]
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, '')
  if (!trimmed) {
    throw new Error('本地 TTS Provider baseUrl 不能为空')
  }
  return trimmed
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`
}

function toVoiceInfos(providerId: string): VoiceInfo[] {
  return getVoiceOptions().map(voice => ({
    id: voice.id,
    name: voice.name,
    gender: voice.gender,
    language: 'zh-CN',
    description: voice.description,
    providerId,
  }))
}

function loadLocalHttpProviderConfig(): LocalHttpTTSProviderConfig | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LOCAL_HTTP_TTS_CONFIG_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as LocalHttpTTSProviderConfig
    if (!parsed.baseUrl) return null
    return parsed
  } catch {
    return null
  }
}

function saveLocalHttpProviderConfig(config: LocalHttpTTSProviderConfig): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_HTTP_TTS_CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export const ttsProviderRegistry = createDefaultRegistry()
export const ttsClient = new TTSClient(ttsProviderRegistry)

bootstrapConfiguredProvider(ttsClient)
