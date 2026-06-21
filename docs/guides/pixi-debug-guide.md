# PixiJS 调试信息使用指南

## 概述

为了方便开发调试，我们为所有 PixiJS 对象添加了调试信息。你可以在浏览器控制台中查看任何 PixiJS 对象的详细信息。

## 调试信息结构

每个 PixiJS 显示对象都包含以下调试信息：

```typescript
displayObject.debugInfo = {
  // 基础信息
  id: string,              // 场景对象 ID
  type: string,            // 对象类型 (background/character/camera/text/prop)
  name: string,            // 对象名称
  
  // 位置和尺寸
  position: { x, y },      // 画布坐标
  size: { width, height }, // 对象尺寸
  
  // 变换信息
  transform: {
    scaleX: number,        // X 轴缩放
    scaleY: number,        // Y 轴缩放
    rotation: number,      // 旋转角度
    alpha: number          // 透明度
  },
  
  // 层级和状态
  zIndex: number,          // 渲染层级
  visible: boolean,        // 是否可见
  locked: boolean,         // 是否锁定
  
  // 时间戳
  createdTime: number,     // 创建时间戳
  lastUpdated: number,     // 最后更新时间（如果有更新）
  
  // 类型特定的额外信息
  ...extraInfo
}
```

## 使用方法

### 1. 在浏览器控制台中查看

```javascript
// 获取 PixiJS 应用
const app = window.__PIXI_APP__

// 查看所有子对象
console.log(app.stage.children)

// 查看特定对象的调试信息
const character = app.stage.children.find(c => c.name.includes('Character'))
console.log(character.debugInfo)

// 输出示例：
// {
//   id: "char_1234567890_abc123",
//   type: "character",
//   name: "角色A",
//   characterId: "char_001",
//   characterName: "主角",
//   expression: "smile",
//   flip: false,
//   partsCount: 5,
//   loadedPartsCount: 5,
//   position: { x: 960, y: 540 },
//   size: { width: 200, height: 400 },
//   transform: { scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 },
//   zIndex: 10,
//   visible: true,
//   locked: false,
//   createdTime: 1701234567890
// }
```

### 2. 在代码中使用调试工具

```typescript
import { logPixiDebugInfo, updatePixiDebugInfo } from '@/utils/pixiDebug'

// 打印调试信息
logPixiDebugInfo(displayObject)

// 更新调试信息
updatePixiDebugInfo(displayObject, {
  customField: 'customValue',
  debugNotes: '这是一个测试对象'
})
```

### 3. 在事件处理中查看

```typescript
displayObject.on('pointerdown', (event) => {
  const target = event.target
  console.log('[点击对象]', target.name, target.debugInfo)
})
```

## 不同类型对象的额外调试信息

### 背景对象 (Background)
```javascript
{
  type: 'background',
  stageId: 'stage_001',
  stageName: '城市街道',
  imageSize: { width: 1920, height: 1080 }
}
```

### 人物对象 (Character)
```javascript
{
  type: 'character',
  characterId: 'char_001',
  characterName: '主角',
  expression: 'smile',
  flip: false,
  partsCount: 5,
  loadedPartsCount: 5
}
```

### 相机对象 (Camera)
```javascript
{
  type: 'camera',
  cameraType: 'viewport',
  borderColor: '0x00ff00',
  borderWidth: 20
}
```

### 文本对象 (Text)
```javascript
{
  type: 'text',
  content: '这是一段文本',
  fontSize: 24,
  color: '#ffffff',
  align: 'center',
  fontFamily: 'Arial'
}
```

## 调试技巧

### 1. 查找特定类型的对象

```javascript
// 查找所有人物对象
const characters = app.stage.children.filter(c => 
  c.debugInfo && c.debugInfo.type === 'character'
)
console.log('人物对象:', characters)

// 查找特定名称的对象
const camera = app.stage.children.find(c => 
  c.name && c.name.includes('camera')
)
console.log('相机对象:', camera.debugInfo)
```

### 2. 监控对象变化

```javascript
// 打印所有对象的位置
app.stage.children.forEach(child => {
  if (child.debugInfo) {
    console.log(`${child.name}: (${child.x}, ${child.y})`)
  }
})
```

### 3. 调试拖拽行为

```javascript
displayObject.on('pointermove', (event) => {
  if (dragData) {
    const target = event.target
    console.log('[拖拽中]', target.name, {
      x: target.x,
      y: target.y,
      debugInfo: target.debugInfo
    })
  }
})
```

## 注意事项

1. **性能影响**：调试信息不会影响渲染性能，但请在生产环境中移除 console.log 调用
2. **时间戳**：`createdTime` 使用 `Date.now()` 返回的毫秒时间戳
3. **自定义字段**：可以通过 `updatePixiDebugInfo` 添加自定义调试字段

## 示例场景

### 场景1：调试人物渲染问题

```javascript
// 检查人物是否正确加载
const character = app.stage.children.find(c => c.name.includes('Character_主角'))
console.log('人物调试信息:', character.debugInfo)
console.log('部件数量:', character.debugInfo.partsCount)
console.log('已加载部件:', character.debugInfo.loadedPartsCount)
```

### 场景2：调试相机位置

```javascript
const camera = app.stage.children.find(c => c.debugInfo?.type === 'camera')
console.log('相机位置:', camera.debugInfo.position)
console.log('相机尺寸:', camera.debugInfo.size)
console.log('相机实际渲染位置:', camera.x, camera.y)
```

### 场景3：调试层级问题

```javascript
// 按 zIndex 排序显示所有对象
const sorted = app.stage.children
  .filter(c => c.debugInfo)
  .sort((a, b) => a.debugInfo.zIndex - b.debugInfo.zIndex)

sorted.forEach(obj => {
  console.log(`zIndex ${obj.debugInfo.zIndex}: ${obj.name}`)
})
```
