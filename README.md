# 沙雕动画小助手 Community Edition

沙雕动画小助手 Community Edition 是一个本地优先的 Web 动画创作器，面向短视频动画、AI 漫剧、分镜演示和轻量剧情内容创作。它保留主创作器能力，不包含线上账号、VIP、充值、云端项目同步或私有运营后台。

当前开源版的目标很朴素：让你在本地打开浏览器，就能创建项目、管理素材、编辑剧本、制作场景、预览并导出基础视频。

![项目主页截图](public/screenshots/project-home.png)

## 技术交流

技术讨论QQ群809574217

## 功能范围

- 本地项目创建、打开和保存，项目文件使用 `.anime` JSON 格式。
- 人物、表情、背景、道具、音效和场景模板管理。
- 剧本编辑，支持对白、旁白、场景组织和动作编排。
- 场景编辑、镜头、灯光、屏幕特效、遮罩、层级和预设动画。
- 本地预览和视频导出。
- 可插拔 TTS Provider：默认手动导入音频，可选连接本地 HTTP TTS 服务。

## 不包含什么

Community Edition 不是线上平台的完整复刻。首发开源版本不包含：

- 登录、账号、云端项目同步。
- VIP、创作点、充值码或支付流程。
- 私有后端、管理后台和运营配置。
- 默认绑定腾讯云、百度云或其他云厂商 TTS。
- 商业素材库和多人协作。

## 环境要求

- Node.js 18 或更新版本。
- npm 9 或更新版本。
- Chrome 或 Edge 浏览器。

项目依赖 File System Access API 来打开和保存本地项目文件夹。Firefox 和 Safari 对该 API 的支持不完整，部分本地文件能力可能不可用。

## 快速启动

```bash
npm install
npm run dev
```

启动后打开 Vite 输出的本地地址，默认会进入项目主页。首次使用可以点击“新建项目”，选择一个本地文件夹，然后创建 `.anime` 项目文件。

常用开发命令：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run release:audit
```

## TTS 配置

开源版默认不连接任何私有 TTS 后端，也不会因为未配置 TTS 阻塞编辑流程。你可以先手动导入音频，或把本地、自托管、第三方 TTS 服务适配成统一 Provider。
内置音色 ID 仅用于本地项目兼容和第三方 Provider 适配，不代表开源版默认连接腾讯云、百度云或其他云服务。

### 使用内置 local-http Provider 示例

如果你有腾讯云或百度云 TTS API Key，推荐使用仓库内置的本地 HTTP Provider 示例。Key 保存在本机 `examples/tts-provider/.env` 中，主应用只连接 `http://127.0.0.1:7860`，可以避开浏览器直连云厂商接口时常见的 CORS 问题。

复制 Provider 配置：

```bash
copy examples\tts-provider\.env.example examples\tts-provider\.env
```

编辑 `examples/tts-provider/.env`，填入腾讯云或百度云配置。然后在根目录启动：

```bash
npm run dev:with-tts
```

也可以拆成两个终端：

```bash
npm run tts:provider
npm run dev
```

复制环境变量示例：

```bash
cp .env.example .env
```

主应用 `.env.local` 或 `.env` 中配置：

```env
VITE_TTS_PROVIDER_URL=http://127.0.0.1:7860
VITE_TTS_SYNTHESIZE_ENDPOINT=/synthesize
VITE_TTS_PREVIEW_ENDPOINT=/preview
VITE_TTS_VOICES_ENDPOINT=/voices
```

本地 HTTP Provider 可返回以下任一种响应：

```json
{ "audioBase64": "...", "duration": 1200 }
```

或：

```json
{ "audio": "data:audio/mpeg;base64,...", "duration": 1200 }
```

可配置项见 [.env.example](.env.example)。Provider 入口实现位于 [src/utils/ttsClient.ts](src/utils/ttsClient.ts)。

## 示例项目

仓库提供了一个最小示例项目：

```text
examples/demo-project/demo.anime
```

使用方式：

1. 运行 `npm run dev`。
2. 在项目主页点击“打开项目文件夹”。
3. 选择 `examples/demo-project` 文件夹。
4. 打开 `demo.anime`。

这个示例不包含外部素材，适合作为验证项目文件格式和本地打开流程的起点。

## 项目结构

```text
.
├── src/                 # Vue 应用源码
├── public/              # 图标、字体和运行时静态资源
├── fonts-source/        # 可重新构建的字体源文件
├── scripts/             # 构建脚本
├── tools/               # 工程辅助工具
├── examples/            # 可公开示例项目
├── README.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── SECURITY.md
├── NOTICE
└── LICENSE
```

内部规划位于 `doc/`、`doc-prd/` 目录，首发开源版本暂不包含；这些目录已被 `.gitignore` 排除，后续完成脱敏和内容整理后再分批公开。

发布公开版本前，建议运行 `npm run release:audit` 检查内部目录、私有部署痕迹、本地绝对路径和常见密钥格式是否误入公开候选文件。

## 资源版权

代码使用 Apache-2.0 许可证。字体、图标、示例素材和用户导入素材可能适用不同许可证，详见 [NOTICE](NOTICE)。

用户自行导入的图片、字体、音频和视频素材不因使用本工具而获得额外授权。发布作品前请确认素材具备对应使用权。

## 参与贡献

欢迎提交 bug、文档改进、TTS Provider、导出稳定性修复和示例项目。开始前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
