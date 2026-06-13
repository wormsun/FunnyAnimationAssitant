<template>
  <div class="global-toolbar">
    <!-- 左侧:标题 + 添加按钮 -->
    <div class="toolbar-left">
      <h2 class="page-title">
        剧本编辑
      </h2>
      
      <div class="toolbar-divider" />
      
      <button
        class="toolbar-btn"
        title="添加场景"
        @click="$emit('addScene')"
      >
        ➕ 场景
      </button>
      <button
        class="toolbar-btn"
        title="添加对话"
        @click="$emit('addDialogue')"
      >
        ➕ 对话
      </button>
      <button
        class="toolbar-btn"
        title="添加旁白"
        @click="$emit('addNarration')"
      >
        ➕ 旁白
      </button>
      
      <div class="toolbar-divider" />
      
      <button
        class="toolbar-btn"
        title="旁白设置"
        @click="$emit('editNarrator')"
      >
        👤 旁白设置
      </button>
      <button
        class="toolbar-btn"
        title="演员设置"
        @click="$emit('manageActors')"
      >
        👥 演员设置
      </button>
      
      <div class="toolbar-divider" />
      
      <!-- 动画名称编辑 -->
      <div class="episode-name-editor">
        <label class="name-label">动画名称:</label>
        <input 
          type="text" 
          :value="episodeName" 
          class="name-input"
          placeholder="请输入动画名称"
          @input="$emit('update:episodeName', ($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <!-- 右侧:操作按钮 -->
    <div class="toolbar-right">
      <button
        class="toolbar-btn"
        title="保存 (Ctrl+S)"
        @click="$emit('save')"
      >
        💾 保存
      </button>
      <button
        class="toolbar-btn"
        title="预览"
        @click="$emit('preview')"
      >
        🎬 预览
      </button>
      <button
        class="toolbar-btn btn-primary"
        title="导出"
        @click="$emit('export')"
      >
        📤 导出
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  episodeName?: string
}>()

defineEmits<{
  addScene: []
  addDialogue: []
  addNarration: []
  editNarrator: []
  manageActors: []
  'update:episodeName': [value: string]
  save: []
  preview: []
  export: []
}>()
</script>

<style scoped>
.global-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: white;
  border-bottom: 2px solid #e5e7eb;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #d1d5db;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.toolbar-right {
  display: flex;
  gap: 12px;
}

.toolbar-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.toolbar-btn.btn-primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.toolbar-btn.btn-primary:hover {
  background: #2563eb;
  border-color: #2563eb;
}

.episode-name-editor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-label {
  font-size: 14px;
  color: #6b7280;
  white-space: nowrap;
}

.name-input {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
  width: 200px;
  transition: all 0.2s;
}

.name-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.name-input::placeholder {
  color: #9ca3af;
}
</style>
