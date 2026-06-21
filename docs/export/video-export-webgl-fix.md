# WebGL 上下文丢失问题修复

## 问题描述

**错误**：`WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost`

**现象**：
- 导出进度到达约50%时卡住
- 控制台显示 WebGL 上下文连续丢失
- 剧本时长：119.75秒（约2分钟）
- 总帧数：2994帧

## 根本原因

连续渲染近3000帧导致浏览器 WebGL 资源耗尽：
- 每帧创建一个 VideoFrame
- `preserveDrawingBuffer: true` 占用大量显存
- 没有给浏览器回收资源的机会

## 解决方案

### 1. 添加批处理机制 (`VideoExporter.ts`)

```typescript
// 批处理参数
const BATCH_SIZE = 100  // 每批处理100帧
let processedFrames = 0

for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    // ... 编码逻辑 ...
    
    processedFrames++
    
    // 每处理100帧后暂停10ms，让浏览器回收资源
    if (processedFrames >= BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 10))
        processedFrames = 0
    }
}
```

**效果**：
- 每100帧暂停10ms
- 给浏览器和WebGL回收资源的机会
- 避免上下文丢失

### 2. 优化 PIXI 配置 (`FrameCapture.ts`)

**之前**：
```typescript
new PIXI.Application({
    antialias: true,
    preserveDrawingBuffer: true,
})
```

**之后**：
```typescript
new PIXI.Application({
    antialias: false,              // 禁用抗锯齿，提高性能
    preserveDrawingBuffer: false,  // 禁用，减少显存占用
    powerPreference: 'high-performance',  // 高性能模式
})
```

**效果**：
- 减少显存占用
- 提高渲染性能
- 每帧手动 render 后立即捕获

### 3. 改进帧捕获逻辑

确保在 `preserveDrawingBuffer=false` 时也能正常工作：

```typescript
captureFrame(time: number): VideoFrame {
    // 渲染当前帧
    this.pixiApp.render()
    
    // 立即创建 VideoFrame（必须在 render 后立即执行）
    const videoFrame = new VideoFrame(this.canvas, {
        timestamp: timestamp,
        duration: frameDuration,
    })
    
    return videoFrame
}
```

### 4. 添加进度日志

每500帧打印一次进度：
```typescript
if ((frameIndex + 1) % 500 === 0) {
    console.log(`[VideoExporter] 已编码 ${frameIndex + 1}/${totalFrames} 帧`)
}
```

## 测试验证

### 预期日志

```
[VideoExporter] 总时长: 119750ms, 总帧数: 2994
[VideoExporter] 已编码 500/2994 帧
[VideoExporter] 已编码 1000/2994 帧
[VideoExporter] 已编码 1500/2994 帧
[VideoExporter] 已编码 2000/2994 帧
[VideoExporter] 已编码 2500/2994 帧
[VideoExporter] 视频编码完成
```

### 性能影响

- **暂停时间**：10ms × 30批次 = 300ms（对于3000帧）
- **总影响**：< 1%
- **好处**：避免上下文丢失，保证稳定性

## 适用场景

此修复适用于：
- ✅ 长视频（> 1分钟）
- ✅ 高帧数（> 1000帧）
- ✅ 高分辨率（1920×1080及以上）
- ✅ 低端设备或集成显卡

## 后续优化建议

如果仍然遇到问题，可以：
1. **减小批大小**：从100改为50
2. **增加暂停时间**：从10ms改为20ms
3. **使用 Worker**：将编码移到 Worker 线程
4. **降低分辨率**：临时使用1x而非1.5x或2x

## 代码变更

| 文件               | 修改内容                  |
| ------------------ | ------------------------- |
| `VideoExporter.ts` | 添加批处理循环（+16行）   |
| `FrameCapture.ts`  | 优化 PIXI 配置（修改4行） |
| `FrameCapture.ts`  | 改进错误处理（+4行）      |

---

**修复日期**：2025-12-26  
**测试状态**：当前修复已纳入视频导出实现
