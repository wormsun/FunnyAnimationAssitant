import { createHmac, createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const providerDir = path.dirname(fileURLToPath(import.meta.url))
loadEnvFile(path.join(providerDir, '.env'))

const PORT = readIntEnv('PORT', 7860)
const TTS_VENDOR = (process.env.TTS_VENDOR || 'auto').trim().toLowerCase()

const TENCENT_ENDPOINT = process.env.TENCENT_ENDPOINT || 'https://tts.tencentcloudapi.com'
const TENCENT_TTS_VERSION = process.env.TENCENT_TTS_VERSION || '2019-08-23'
const TENCENT_REGION = process.env.TENCENT_REGION || 'ap-guangzhou'

const BAIDU_TOKEN_ENDPOINT = process.env.BAIDU_TOKEN_ENDPOINT || 'https://aip.baidubce.com/oauth/2.0/token'
const BAIDU_TTS_ENDPOINT = process.env.BAIDU_TTS_ENDPOINT || 'https://tsn.baidu.com/text2audio'
const BAIDU_CUID = process.env.BAIDU_CUID || 'funny-animation-assistant-local'

let baiduTokenCache = null

const server = createServer(async (req, res) => {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, vendor: TTS_VENDOR })
      return
    }

    if (req.method === 'GET' && url.pathname === '/voices') {
      sendJson(res, 501, {
        error: 'VOICES_NOT_IMPLEMENTED',
        message: 'Provider 未实现 /voices，主应用会使用内置音色元数据。',
      })
      return
    }

    if (req.method === 'POST' && (url.pathname === '/synthesize' || url.pathname === '/preview')) {
      const request = await readJson(req)
      const response = await synthesize(request)
      sendJson(res, 200, response)
      return
    }

    sendJson(res, 404, { error: 'NOT_FOUND', message: `Unknown route: ${req.method} ${url.pathname}` })
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500
    sendJson(res, status, {
      error: error.code || 'TTS_PROVIDER_ERROR',
      message: error.message || 'TTS Provider request failed',
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[tts-provider] listening on http://127.0.0.1:${PORT}`)
  console.log(`[tts-provider] vendor=${TTS_VENDOR}`)
})

async function synthesize(request) {
  const text = String(request.text || '').trim()
  if (!text) {
    throw httpError(400, 'EMPTY_TEXT', 'text 不能为空')
  }

  const vendor = resolveVendor(request)
  if (vendor === 'tencent') {
    return synthesizeTencent({ ...request, text })
  }
  if (vendor === 'baidu') {
    return synthesizeBaidu({ ...request, text })
  }

  throw httpError(400, 'UNSUPPORTED_VENDOR', `不支持的 TTS_VENDOR: ${vendor}`)
}

function resolveVendor(request) {
  if (TTS_VENDOR === 'tencent' || TTS_VENDOR === 'baidu') return TTS_VENDOR
  const engine = String(request.engine || '').trim().toLowerCase()
  if (engine === 'tencent' || engine === 'baidu') return engine
  return 'tencent'
}

async function synthesizeTencent(request) {
  const secretId = requireEnv('TENCENT_SECRET_ID')
  const secretKey = requireEnv('TENCENT_SECRET_KEY')
  const endpoint = new URL(TENCENT_ENDPOINT)
  const codec = normalizeCodec(request.codec)
  const payload = {
    Text: request.text,
    SessionId: randomUUID(),
    VoiceType: readNumber(request.voiceType, 101026),
    Volume: clamp(readNumber(request.volume, 0), -10, 10),
    Speed: clamp(readNumber(request.speed, 0), -2, 6),
    ProjectId: 0,
    ModelType: 1,
    PrimaryLanguage: 1,
    SampleRate: readNumber(request.sampleRate, 16000),
    Codec: codec,
    EnableSubtitle: false,
  }

  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const authorization = createTencentAuthorization({
    secretId,
    secretKey,
    host: endpoint.host,
    action: 'TextToVoice',
    timestamp,
    payload: body,
  })

  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: endpoint.host,
    'X-TC-Action': 'TextToVoice',
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': TENCENT_TTS_VERSION,
  }
  if (TENCENT_REGION) headers['X-TC-Region'] = TENCENT_REGION

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  })

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw httpError(res.status, 'TENCENT_HTTP_ERROR', `腾讯云 TTS 请求失败: HTTP ${res.status}`)
  }

  const response = json?.Response
  if (response?.Error) {
    throw httpError(502, response.Error.Code || 'TENCENT_API_ERROR', response.Error.Message || '腾讯云 TTS 返回错误')
  }

  const audioBase64 = response?.Audio
  if (!audioBase64) {
    throw httpError(502, 'TENCENT_EMPTY_AUDIO', '腾讯云 TTS 响应缺少 Audio')
  }

  return {
    audioBase64,
    audio: toAudioDataUrl(audioBase64, codec),
    duration: estimateDurationLocally(request.text, payload.Speed),
    providerId: 'local-http-tencent',
    requestId: response?.RequestId,
  }
}

function createTencentAuthorization({ secretId, secretKey, host, action, timestamp, payload }) {
  const service = 'tts'
  const algorithm = 'TC3-HMAC-SHA256'
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = hmacSha256Hex(secretSigning, stringToSign)

  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

async function synthesizeBaidu(request) {
  const token = await getBaiduAccessToken()
  const codec = normalizeCodec(request.codec)
  const params = new URLSearchParams({
    tex: request.text,
    tok: token,
    cuid: BAIDU_CUID,
    ctp: '1',
    lan: 'zh',
    spd: String(mapSpeedToBaidu(request.speed)),
    pit: '5',
    vol: String(mapVolumeToBaidu(request.volume)),
    per: String(readNumber(request.voiceType, 0)),
    aue: String(mapCodecToBaiduAue(codec, request.sampleRate)),
  })

  const res = await fetch(BAIDU_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'audio/*, application/json',
    },
    body: params.toString(),
  })

  const contentType = res.headers.get('content-type') || ''
  const body = Buffer.from(await res.arrayBuffer())

  if (contentType.includes('application/json') || looksLikeJson(body)) {
    const json = JSON.parse(body.toString('utf8'))
    throw httpError(502, json.err_no ? `BAIDU_${json.err_no}` : 'BAIDU_API_ERROR', json.err_msg || '百度 TTS 返回错误')
  }

  if (!res.ok) {
    throw httpError(res.status, 'BAIDU_HTTP_ERROR', `百度 TTS 请求失败: HTTP ${res.status}`)
  }

  const audioBase64 = body.toString('base64')
  return {
    audioBase64,
    audio: toAudioDataUrl(audioBase64, codec),
    duration: estimateDurationLocally(request.text, readNumber(request.speed, 0)),
    providerId: 'local-http-baidu',
  }
}

async function getBaiduAccessToken() {
  if (process.env.BAIDU_ACCESS_TOKEN) return process.env.BAIDU_ACCESS_TOKEN

  const now = Date.now()
  if (baiduTokenCache && baiduTokenCache.expiresAt > now) {
    return baiduTokenCache.token
  }

  const apiKey = requireEnv('BAIDU_API_KEY')
  const secretKey = requireEnv('BAIDU_SECRET_KEY')
  const url = new URL(BAIDU_TOKEN_ENDPOINT)
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', apiKey)
  url.searchParams.set('client_secret', secretKey)

  const res = await fetch(url)
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.access_token) {
    throw httpError(res.status || 502, 'BAIDU_TOKEN_ERROR', json?.error_description || json?.error || '获取百度 access_token 失败')
  }

  const expiresInMs = Math.max(60, Number(json.expires_in || 2592000) - 60) * 1000
  baiduTokenCache = {
    token: json.access_token,
    expiresAt: now + expiresInMs,
  }
  return baiduTokenCache.token
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) {
      throw httpError(413, 'REQUEST_TOO_LARGE', '请求体过大')
    }
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}

  try {
    return JSON.parse(raw)
  } catch {
    throw httpError(400, 'INVALID_JSON', '请求体不是有效 JSON')
  }
}

function loadEnvFile(file) {
  if (!existsSync(file)) return
  const content = readFileSync(file, 'utf8')
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index <= 0) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw httpError(500, 'MISSING_ENV', `缺少环境变量 ${name}，请检查 examples/tts-provider/.env`)
  }
  return value
}

function readIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) ? value : fallback
}

function readNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeCodec(codec) {
  const normalized = String(codec || 'mp3').toLowerCase()
  if (normalized === 'wav' || normalized === 'pcm') return normalized
  return 'mp3'
}

function toAudioDataUrl(audioBase64, codec) {
  const mimeType = codec === 'wav' ? 'audio/wav' : codec === 'pcm' ? 'audio/pcm' : 'audio/mpeg'
  return `data:${mimeType};base64,${audioBase64}`
}

function mapSpeedToBaidu(speed) {
  return clamp(Math.round(readNumber(speed, 0) + 5), 0, 15)
}

function mapVolumeToBaidu(volume) {
  return clamp(Math.round(((readNumber(volume, 0) + 10) / 20) * 15), 0, 15)
}

function mapCodecToBaiduAue(codec, sampleRate) {
  if (codec === 'wav') return 6
  if (codec === 'pcm') return readNumber(sampleRate, 16000) === 8000 ? 5 : 4
  return 3
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function estimateDurationLocally(text, speed = 0) {
  const cleanedText = String(text || '').replace(/#/g, '').trim()
  if (!cleanedText) return 0

  const charsPerSecond = Math.max(2.5, 4 + readNumber(speed, 0))
  return Math.ceil((cleanedText.length / charsPerSecond) * 1000)
}

function looksLikeJson(buffer) {
  const first = buffer.toString('utf8', 0, Math.min(buffer.length, 32)).trimStart()[0]
  return first === '{' || first === '['
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function hmacSha256(key, text) {
  return createHmac('sha256', key).update(text, 'utf8').digest()
}

function hmacSha256Hex(key, text) {
  return createHmac('sha256', key).update(text, 'utf8').digest('hex')
}

function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}
