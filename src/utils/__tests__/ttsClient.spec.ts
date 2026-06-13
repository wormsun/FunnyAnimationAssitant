import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createLocalHttpTTSProvider,
  createManualTTSProvider,
  estimateDurationLocally,
  TTSClient,
  TTSProviderNotConfiguredError,
  TTSProviderRegistry,
  type TTSProvider,
} from '@/utils/ttsClient'

function createClientWithManualProvider(): TTSClient {
  const registry = new TTSProviderRegistry()
  registry.register(createManualTTSProvider())
  return new TTSClient(registry)
}

describe('ttsClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps manual provider as the default non-network behavior', async () => {
    const client = createClientWithManualProvider()

    expect(client.getActiveProviderId()).toBe('manual')
    await expect(client.synthesize({ text: '你好' })).rejects.toBeInstanceOf(TTSProviderNotConfiguredError)
    await expect(client.estimateDuration('你好')).resolves.toBe(500)
  })

  it('can register and activate a custom provider', async () => {
    const client = createClientWithManualProvider()
    const provider: TTSProvider = {
      id: 'mock-provider',
      label: 'Mock Provider',
      synthesize: vi.fn().mockResolvedValue({
        audio: 'data:audio/mpeg;base64,bW9jaw==',
        audioBase64: 'bW9jaw==',
        duration: 1200,
      }),
      getCacheSize: () => 2,
    }

    client.registerProvider(provider, { activate: true })

    const result = await client.synthesize({ text: '测试', voiceType: 101026 })
    expect(result).toEqual({
      audio: 'data:audio/mpeg;base64,bW9jaw==',
      audioBase64: 'bW9jaw==',
      duration: 1200,
      providerId: 'mock-provider',
    })
    expect(client.getCacheSize()).toBe(2)
  })

  it('posts local HTTP synthesize requests and normalizes data-url audio', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        audio: 'data:audio/mpeg;base64,YXVkaW8=',
        duration: 1800,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = createLocalHttpTTSProvider({
      baseUrl: 'http://127.0.0.1:7860/',
      synthesizeEndpoint: 'api/tts',
    })

    const result = await provider.synthesize({
      text: '本地合成',
      voiceType: 101026,
      speed: 0,
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:7860/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '本地合成',
        voiceType: 101026,
        speed: 0,
      }),
    })
    expect(result).toEqual({
      audio: 'data:audio/mpeg;base64,YXVkaW8=',
      audioBase64: 'YXVkaW8=',
      duration: 1800,
    })
  })

  it('estimates duration locally with a lower speech-rate bound', () => {
    expect(estimateDurationLocally('')).toBe(0)
    expect(estimateDurationLocally('####')).toBe(0)
    expect(estimateDurationLocally('一二三四', -10)).toBe(1600)
  })
})
