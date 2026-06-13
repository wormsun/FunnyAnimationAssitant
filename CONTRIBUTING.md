# Contributing

感谢你愿意参与沙雕动画小助手 Community Edition。这个项目目前处在开源早期，最需要的是让本地运行、项目保存、素材管理、TTS Provider 和视频导出变得更稳定。

## 开始之前

请先确认本地环境：

```bash
npm install
npm run dev
```

推荐使用 Chrome 或 Edge 进行功能验证，因为项目依赖 File System Access API。

提交代码前请运行：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run release:audit
```

如果某个命令因为环境限制无法运行，请在 PR 描述里说明。

## 适合优先贡献的方向

- 本地项目创建、打开、保存和恢复问题。
- 素材导入、素材路径、Blob URL 与磁盘文件同步问题。
- 视频导出稳定性、进度提示和失败原因说明。
- TTS Provider 适配，例如本地 HTTP、GPT-SoVITS、CosyVoice、Piper、Edge TTS proxy 等。
- README、FAQ、示例项目和新手文档。
- 可复现 bug 的最小测试用例。

## 不建议直接提交的内容

- 账号、充值、VIP、创作点、支付、管理后台等商业平台逻辑。
- 真实密钥、token、证书、服务器路径或私有部署配置。
- 版权不明确的图片、音乐、音效、字体、模板和大体积素材。
- 首发暂未公开的 `doc/`、`doc-prd/` 内部规划材料。

## 分支和提交

建议分支命名：

```text
fix/export-audio-sync
feat/local-http-tts-provider
docs/getting-started
```

提交信息尽量清楚描述用户可见结果，例如：

```text
fix: keep imported audio paths stable after project reload
docs: add local TTS provider setup guide
```

## PR 描述建议

请包含：

- 改了什么。
- 为什么需要这个改动。
- 如何验证。
- 是否影响项目文件格式、导出结果或素材路径。
- 是否引入新依赖。

## 测试建议

窄改动至少覆盖对应单元测试或手动验证步骤。影响以下区域时，建议扩大验证：

- 项目保存和加载。
- 剧本或场景数据结构。
- TTS 音频生成、缓存和导出。
- Pixi 渲染、动画播放或视频导出。

## 资源和许可证

新增字体、图片、音频、视频或示例素材时，必须确认它们允许再分发，并在 NOTICE 或对应 README 中说明来源和许可证。
