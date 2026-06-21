# Local HTTP TTS Provider

这是 FunnyAnimationAssistant 的本地 TTS 适配器示例，用来在本机调用腾讯云或百度云 TTS。

主应用运行在浏览器里，浏览器不直接访问云厂商 API，也不保存云厂商密钥。密钥只写在本机的 `examples/tts-provider/.env` 中，由 Node.js Provider 负责签名、鉴权和转发。

## 工作链路

```text
FunnyAnimationAssistant 浏览器应用
  -> http://127.0.0.1:7860 本地 TTS Provider
  -> 腾讯云 TTS / 百度云 TTS
  -> 返回音频给主应用
```

这样做主要解决三个问题：

- 避免浏览器直连云厂商时遇到 CORS 限制。
- 避免把云厂商 API Key 暴露到前端代码里。
- 让主应用只依赖统一的本地 HTTP 接口，后续也方便替换成本地模型或其他服务。

## 一分钟启动

以下命令都在项目根目录执行。

### 1. 安装依赖

```bash
npm install
```

### 2. 复制 Provider 配置

Windows PowerShell：

```powershell
copy examples\tts-provider\.env.example examples\tts-provider\.env
```

macOS / Linux：

```bash
cp examples/tts-provider/.env.example examples/tts-provider/.env
```

### 3. 填写腾讯云或百度云配置

编辑 `examples/tts-provider/.env`。

只使用腾讯云时：

```env
TTS_VENDOR=tencent
TENCENT_SECRET_ID=你的腾讯云 SecretId
TENCENT_SECRET_KEY=你的腾讯云 SecretKey
TENCENT_REGION=ap-guangzhou
```

只使用百度云时：

```env
TTS_VENDOR=baidu
BAIDU_API_KEY=你的百度云 API Key
BAIDU_SECRET_KEY=你的百度云 Secret Key
BAIDU_CUID=funny-animation-assistant-local
```

如果希望根据音色自动选择腾讯云或百度云：

```env
TTS_VENDOR=auto
```

`auto` 会根据主应用请求中的 `engine` 字段选择厂商。项目内置音色元数据已经标记了 `tencent` / `baidu`；如果要同时使用两家的音色，请同时填写两家的 Key。

### 4. 配置主应用

复制或创建项目根目录的 `.env.local`，写入：

```env
VITE_TTS_PROVIDER_URL=http://127.0.0.1:7860
VITE_TTS_SYNTHESIZE_ENDPOINT=/synthesize
VITE_TTS_PREVIEW_ENDPOINT=/preview
VITE_TTS_VOICES_ENDPOINT=/voices
```

修改 `.env.local` 后需要重新启动 `npm run dev` 或 `npm run dev:with-tts`，Vite 才会读取新的配置。

### 5. 启动应用

推荐使用一条命令同时启动 Provider 和主应用：

```bash
npm run dev:with-tts
```

启动后通常会看到：

```text
[tts-provider] listening on http://127.0.0.1:7860
[tts-provider] vendor=...
```

也可以分两个终端启动：

终端 1：

```bash
npm run tts:provider
```

终端 2：

```bash
npm run dev
```

## 验证是否配置成功

### 检查 Provider 是否启动

浏览器打开：

```text
http://127.0.0.1:7860/health
```

正常会返回类似：

```json
{
  "ok": true,
  "vendor": "auto"
}
```

PowerShell 也可以执行：

```powershell
Invoke-RestMethod http://127.0.0.1:7860/health
```

### 测试一次语音合成

腾讯云示例：

```powershell
$body = @{
  text = "你好，欢迎使用 FunnyAnimationAssistant"
  engine = "tencent"
  voiceType = 101026
  speed = 0
  volume = 0
  codec = "mp3"
  sampleRate = 16000
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://127.0.0.1:7860/synthesize `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

百度云示例：

```powershell
$body = @{
  text = "你好，欢迎使用 FunnyAnimationAssistant"
  engine = "baidu"
  voiceType = 0
  speed = 0
  volume = 0
  codec = "mp3"
  sampleRate = 16000
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://127.0.0.1:7860/synthesize `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

正常响应中会包含 `audioBase64`、`audio` 和 `providerId`。如果这里能成功，主应用里的 TTS 通常也已经可用。

## 在主应用中如何使用

配置成功后，主应用会自动注册 `local-http` TTS Provider。

- 在角色音色、旁白或预览相关功能中，点击试听会请求 `/preview`。
- 需要生成台词或旁白音频时，主应用会请求 `/synthesize`。
- 导出视频前，如果发现缺少台词音频，资源预加载流程会尝试调用 TTS Provider 生成音频。
- 如果没有配置 Provider，主应用仍可进行项目、素材和剧本编辑；但完整预览、Slot 时间轴和视频导出需要可用的对白/旁白音频。手动导入音频可作为兼容兜底方式，推荐主流程仍是配置本地 TTS Provider。

当前 `/voices` 返回 501 是预期行为，主应用会继续使用内置音色元数据。

## 常见问题

### 提示 `TTS_PROVIDER_NOT_CONFIGURED`

说明主应用没有启用本地 HTTP Provider。请检查：

- 项目根目录是否存在 `.env.local`。
- `.env.local` 是否配置了 `VITE_TTS_PROVIDER_URL=http://127.0.0.1:7860`。
- 修改 `.env.local` 后是否重新启动了 Vite。

### 请求失败或 `ECONNREFUSED`

通常是 Provider 没有启动，或端口不一致。请先打开：

```text
http://127.0.0.1:7860/health
```

如果打不开，请运行：

```bash
npm run tts:provider
```

如果修改了 `examples/tts-provider/.env` 里的 `PORT`，也要同步修改根目录 `.env.local` 里的 `VITE_TTS_PROVIDER_URL`。

### 腾讯云鉴权失败

请检查：

- `TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY` 是否填写正确。
- `TENCENT_REGION` 是否可用，默认是 `ap-guangzhou`。
- 腾讯云账号是否已开通 TTS 服务，并且账号余额、权限、API 限流正常。

### 百度云获取 token 失败

请检查：

- `BAIDU_API_KEY` 和 `BAIDU_SECRET_KEY` 是否填写正确。
- 百度智能云应用是否已开通语音合成能力。
- 如果你已经有长期可用的 token，也可以在 `.env` 中配置 `BAIDU_ACCESS_TOKEN`。

### `/voices` 返回 501

这是正常的。当前示例 Provider 不维护远程音色列表，主应用会使用内置音色元数据。

### 文本太长

云厂商通常对单次合成文本长度有限制。建议在剧本中把长文本拆成多个对白或旁白块。

## Provider 配置项

`examples/tts-provider/.env` 支持：

```env
PORT=7860

TTS_VENDOR=auto

TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_REGION=ap-guangzhou
TENCENT_ENDPOINT=https://tts.tencentcloudapi.com
TENCENT_TTS_VERSION=2019-08-23

BAIDU_API_KEY=
BAIDU_SECRET_KEY=
BAIDU_CUID=funny-animation-assistant-local
BAIDU_TOKEN_ENDPOINT=https://aip.baidubce.com/oauth/2.0/token
BAIDU_TTS_ENDPOINT=https://tsn.baidu.com/text2audio
```

## HTTP 接口

### GET /health

返回 Provider 运行状态。

```json
{
  "ok": true,
  "vendor": "auto"
}
```

### POST /synthesize

请求示例：

```json
{
  "text": "你好，欢迎使用 FunnyAnimationAssistant",
  "engine": "tencent",
  "voiceType": 101026,
  "speed": 0,
  "volume": 0,
  "codec": "mp3",
  "sampleRate": 16000
}
```

响应示例：

```json
{
  "audioBase64": "...",
  "audio": "data:audio/mpeg;base64,...",
  "duration": 1200,
  "providerId": "local-http-tencent"
}
```

### POST /preview

与 `/synthesize` 请求和响应格式相同，用于试听。

### GET /voices

当前返回 501，主应用会继续使用内置音色元数据。

## 安全注意事项

- 不要提交 `examples/tts-provider/.env`。
- 不要提交根目录 `.env.local` 中的私有配置。
- 示例 Provider 默认只监听 `127.0.0.1`，仅供本机使用。
- 云厂商 API Key 只在本机 Node.js Provider 中使用，不会写入前端构建产物。
