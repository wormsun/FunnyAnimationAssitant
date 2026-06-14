# Local HTTP TTS Provider

这是沙雕动画小助手的本地 TTS 适配器示例。主应用只请求本机 HTTP 接口，腾讯云或百度云的 API Key 保存在本目录的 `.env` 中。

## 快速开始

在项目根目录执行：

```bash
copy examples\tts-provider\.env.example examples\tts-provider\.env
```

编辑 `examples/tts-provider/.env`，填入自己的腾讯云或百度云配置。

启动 Provider：

```bash
npm run tts:provider
```

另开一个终端启动主应用：

```bash
npm run dev
```

也可以一条命令同时启动 Provider 和主应用：

```bash
npm run dev:with-tts
```

## 主应用配置

根目录 `.env.local` 配置：

```env
VITE_TTS_PROVIDER_URL=http://127.0.0.1:7860
VITE_TTS_SYNTHESIZE_ENDPOINT=/synthesize
VITE_TTS_PREVIEW_ENDPOINT=/preview
VITE_TTS_VOICES_ENDPOINT=/voices
```

## Vendor 选择

默认：

```env
TTS_VENDOR=auto
```

`auto` 会根据主应用请求中的 `engine` 字段选择腾讯或百度。现有音色元数据已经标记了 `tencent` / `baidu`。

也可以强制指定：

```env
TTS_VENDOR=tencent
```

或：

```env
TTS_VENDOR=baidu
```

## 接口

### POST /synthesize

请求示例：

```json
{
  "text": "你好，欢迎使用沙雕动画小助手",
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

与 `/synthesize` 相同。

### GET /voices

当前返回 501，主应用会继续使用内置音色元数据。

## 注意事项

- `.env` 只放在本机，不要提交到 Git。
- 腾讯云基础合成单次文本长度有限制，长文本建议在剧本中拆成多个对白或旁白块。
- 如果云厂商返回计费、限流或鉴权错误，Provider 会把错误信息返回给主应用。
