# fonts-source

本目录存放字体构建的源文件。请按以下结构放置:

```
fonts-source/
  noto-sans-sc/
    NotoSansSC-Regular.ttf
    OFL.txt
  noto-serif-sc/
    NotoSerifSC-Regular.ttf
    OFL.txt
  lxgw-wenkai/
    LXGWWenKai-Regular.ttf
    OFL.txt
  zcool-qingke-huangyou/
    ZCOOLQingKeHuangYou-Regular.ttf
    OFL.txt
  ma-shan-zheng/
    MaShanZheng-Regular.ttf
    OFL.txt
```

## 下载链接

1. **Noto Sans SC**: https://fonts.google.com/noto/specimen/Noto+Sans+SC
2. **Noto Serif SC**: https://fonts.google.com/noto/specimen/Noto+Serif+SC
3. **LXGW WenKai**: https://github.com/lxgw/LxgwWenKai/releases
4. **ZCOOL QingKe HuangYou**: https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou
5. **Ma Shan Zheng**: https://fonts.google.com/specimen/Ma+Shan+Zheng

## 构建命令

```bash
npm run fonts:build
```

输出到 `public/fonts/` 目录，产物纳入 Git 仓库。
