# FAQ

## 为什么打开后直接进入项目页？

Community Edition 是本地优先版本，不需要登录态。默认入口是 `/project`，你可以直接新建或打开本地项目。

## 推荐使用什么浏览器？

推荐 Chrome 或 Edge。项目使用 File System Access API 来读写本地项目文件夹，Firefox 和 Safari 目前支持不完整。

## 不配置 TTS 能用吗？

可以。默认 Provider 是“手动导入音频”，不会连接私有后端。没有 TTS 时仍然可以编辑剧本、制作场景和进行基础导出。

## 如何接入本地 TTS？

可以在 `.env` 中配置 `VITE_TTS_PROVIDER_URL`，让前端连接本地或自托管 HTTP 服务。服务响应需要包含 `audioBase64` 或 data URL 格式的 `audio` 字段。示例见 [.env.example](.env.example)。

## 为什么不内置腾讯云或百度云 TTS？

云厂商 TTS 通常需要密钥、计费和后端代理。开源版不应默认绑定某个私有后端，也不应把密钥放在前端。后续可以通过本地 Provider 或独立适配器接入。
当前代码中的音色 ID 只是兼容历史项目和第三方 Provider 映射的元数据，不会触发任何云端请求。

## `.anime` 文件是什么？

`.anime` 是项目 JSON 文件，保存项目元信息、素材引用、剧集、场景、剧本和动作数据。素材文件通常仍保存在项目文件夹中，`.anime` 里记录相对路径。

## 为什么首发不包含 `doc-prd`？

`doc/` 和 `doc-prd/` 是内部规划材料，首发开源版本暂不包含，已在 `.gitignore` 中排除。后续完成脱敏、路径清理和内容整理后，可以再分批公开。

## 构建失败怎么办？

先确认 Node.js 版本为 18 或更高，然后重新安装依赖：

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

如果仍然失败，请提交 issue，并附上系统、浏览器、Node.js 版本和完整错误信息。
