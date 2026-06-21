# 全局 Toast 使用指南

## 概述

项目中已经实现了全局 Toast 消息提示系统，可以在任何组件中使用。

## 文件位置

- **Composable**: `src/composables/useToast.ts`
- **组件**: `src/components/GlobalToast.vue`
- **注册位置**: `src/App.vue`

## 使用方法

### 1. 在组件中导入

```vue
<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { success, error, warning, info } = useToast()
</script>
```

### 2. 调用 Toast 方法

#### 成功消息
```typescript
success('操作成功！')
success('保存成功！', 2000) // 自定义显示时长（毫秒）
```

#### 错误消息
```typescript
error('操作失败！')
error('保存失败，请重试', 3000)
```

#### 警告消息
```typescript
warning('请先完成必填项')
warning('文件大小超过限制', 4000)
```

#### 信息消息
```typescript
info('正在处理中...')
info('数据已更新', 2000)
```

### 3. 高级用法

#### 自定义 Toast
```typescript
const { showToast } = useToast()

// 完全自定义
showToast('自定义消息', 'success', 5000)
```

#### 手动关闭 Toast
```typescript
const { showToast, removeToast } = useToast()

// 显示不自动关闭的 toast（duration = 0）
const toastId = showToast('请等待...', 'info', 0)

// 稍后手动关闭
setTimeout(() => {
  removeToast(toastId)
}, 5000)
```

#### 清除所有 Toast
```typescript
const { clearAllToasts } = useToast()

clearAllToasts()
```

## Toast 类型

| 类型 | 颜色 | 图标 | 默认时长 |
|------|------|------|----------|
| `success` | 绿色 | ✓ | 2000ms |
| `error` | 红色 | ✗ | 3000ms |
| `warning` | 橙色 | ⚠ | 3000ms |
| `info` | 蓝色 | ℹ | 3000ms |

## 特性

- ✅ **全局单例**: 所有组件共享同一个 toast 状态
- ✅ **多 Toast 支持**: 可以同时显示多个 toast
- ✅ **自动关闭**: 默认自动关闭，可自定义时长
- ✅ **手动关闭**: 点击 toast 或关闭按钮可手动关闭
- ✅ **优雅动画**: 淡入淡出动画效果
- ✅ **响应式**: 自动适应不同屏幕尺寸

## 实际应用示例

### 替换 alert

**之前:**
```typescript
alert('请先创建人物姿态')
```

**现在:**
```typescript
warning('请先创建人物姿态', 3000)
```

### 表单验证

```typescript
function handleSubmit() {
  if (!formData.name) {
    warning('请输入名称')
    return
  }
  
  try {
    await saveData(formData)
    success('保存成功！')
  } catch (err) {
    error('保存失败：' + err.message)
  }
}
```

### 异步操作提示

```typescript
async function loadData() {
  const loadingId = info('正在加载...', 0) // 不自动关闭
  
  try {
    await fetchData()
    removeToast(loadingId)
    success('加载完成！')
  } catch (err) {
    removeToast(loadingId)
    error('加载失败')
  }
}
```

## 注意事项

1. **不要过度使用**: 仅在需要用户关注的重要操作时使用
2. **消息简洁**: 保持消息简短明了
3. **合理时长**: 根据消息重要性设置合适的显示时长
4. **避免堆积**: 避免短时间内显示过多 toast

## 已迁移的组件

以下组件已经使用全局 Toast 系统：

- ✅ `InspectorPanel.vue` - 人物管理面板
- 🔄 其他组件可以逐步迁移...

