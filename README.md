# 沙雕动画小助手 Community Edition

沙雕动画小助手 Community Edition 是一个本地优先的 Web 动画创作器，面向短视频动画、AI 漫剧、分镜演示和轻量剧情内容创作。它保留主创作器能力，不包含线上账号、VIP、充值、云端项目同步或私有运营后台。

当前开源版的目标很朴素：让你在本地打开浏览器，就能配置 TTS、生成对白和旁白音频，并用音频时长驱动剧本、动作、字幕、场景预览和视频导出。

![项目主页截图](public/screenshots/project-home.png)

## 技术交流

技术讨论QQ群809574217

## 快速了解

典型创作流程：

1. 新建或打开本地项目文件夹。
2. 配置本地 TTS Provider，用于生成对白和旁白音频。
3. 导入或创建人物、表情、背景、道具、音效等素材。
4. 在剧本编辑器中编写对白、旁白和场景结构，并生成语音。
5. 进入场景编辑器，基于语音 Slot 安排对象、镜头、灯光、特效、遮罩和动作。
6. 预览音频驱动的动画效果，确认后导出视频。

## 功能范围

- 本地项目创建、打开和保存，项目文件使用 `.anime` JSON 格式。
- 人物、表情、背景、道具、音效和场景模板管理。
- 剧本编辑，支持对白、旁白、场景组织和动作编排。
- TTS 音频生成和时长记录，用于驱动字幕、Slot、动作编排、场景预览和视频导出。
- 场景编辑、镜头、灯光、屏幕特效、遮罩、层级和预设动画。
- 本地预览和视频导出。
- 可插拔 TTS Provider：推荐使用本地 HTTP TTS Provider 接入腾讯云、百度云、本地模型或自托管服务。

## 不包含什么

Community Edition 不是线上平台的完整复刻。首发开源版本不包含：

- 登录、账号、云端项目同步。
- VIP、创作点、充值码或支付流程。
- 私有后端、管理后台和运营配置。
- 默认绑定腾讯云、百度云或其他云厂商 TTS。
- 商业素材库和多人协作。

## 文档导航

- [文档总览](docs/README.md)
- [剧本编辑器说明](docs/product/screenplay-editor.md)
- [场景编辑器说明](docs/product/scene-editor.md)
- [动画系统设计](docs/animation/animation-system.md)
- [视频导出说明](docs/export/video-export.md)
- [TTS Provider 示例](examples/tts-provider/README.md)
- [常见问题](FAQ.md)

## 环境要求

- Node.js 18 或更新版本。
- npm 9 或更新版本。
- Chrome 或 Edge 浏览器。

项目依赖 File System Access API 来打开和保存本地项目文件夹。Firefox 和 Safari 对该 API 的支持不完整，部分本地文件能力可能不可用。

## 快速启动

如果你要完整体验“剧本 → TTS → 动作编排 → 预览/导出”的主流程，建议直接配置并启动本地 TTS Provider。TTS 音频是本项目的核心时间轴：对白和旁白的音频时长会参与 Slot 拆分、字幕同步、动作定位、场景总时长计算和视频导出。

```bash
npm install
npm run dev:with-tts
```

`dev:with-tts` 会同时启动本地 TTS Provider 和 Vite 主应用。首次使用前请先按 [TTS 配置](#tts-配置) 填写 Provider 配置。

如果只是查看界面、整理素材或阅读示例项目，也可以只启动主应用：

```bash
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

TTS 生成是本项目的核心能力。对白和旁白音频不仅用于播放声音，还会提供动画系统需要的时间信息：场景预览会先检查并生成 TTS，视频导出会先预加载 TTS，Slot 动作锚点和字幕同步也依赖 `ttsConfig.duration`。

开源版不会默认连接任何私有 TTS 后端，也不会把云厂商密钥写入前端构建产物。你需要显式配置本地 HTTP TTS Provider，或把本地模型、自托管服务、第三方 TTS 服务适配成统一 Provider。

如果没有配置 TTS Provider，仍然可以创建项目、管理素材、编写剧本和查看部分界面；但完整的音频驱动预览、Slot 时间轴和视频导出会受到限制。手动导入音频可作为兼容兜底方式，不建议作为主流程。

内置音色 ID 用于本地项目兼容和第三方 Provider 适配，不代表开源版默认连接腾讯云、百度云或其他云服务。

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
更完整的 Provider 配置说明见 [examples/tts-provider/README.md](examples/tts-provider/README.md)。

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
├── docs/                # 公开产品、架构、功能和排障文档
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

公开设计文档位于 [docs/](docs/)，包括产品说明、架构设计、功能设计、导出方案和排障指南。内部未公开资料仍位于 `doc/`，该目录已被 `.gitignore` 排除。

发布公开版本前，建议运行 `npm run release:audit` 检查内部目录、私有部署痕迹、本地绝对路径和常见密钥格式是否误入公开候选文件。

## 常见问题

浏览器兼容、项目文件、TTS、视频导出等问题可以先查看 [FAQ.md](FAQ.md)。

## 资源版权

代码使用 Apache-2.0 许可证。字体、图标、示例素材和用户导入素材可能适用不同许可证，详见 [NOTICE](NOTICE)。

用户自行导入的图片、字体、音频和视频素材不因使用本工具而获得额外授权。发布作品前请确认素材具备对应使用权。

## 参与贡献

欢迎提交 bug、文档改进、TTS Provider、导出稳定性修复和示例项目。开始前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
