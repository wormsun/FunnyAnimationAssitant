<template>
  <div class="file-tree-node">
    <div
      class="node-item"
      :class="{ 
        'is-directory': node.kind === 'directory',
        'is-file': node.kind === 'file',
        'is-selected': selectedPath === node.path,
        'is-expanded': node.kind === 'directory' && expandedPaths.has(node.path)
      }"
      @click="handleClick"
    >
      <span class="node-icon">
        <span v-if="node.kind === 'directory'">
          {{ expandedPaths.has(node.path) ? '📂' : '📁' }}
        </span>
        <span
          v-else
          class="file-icon"
        >
          {{ getFileIcon(node.name) }}
        </span>
      </span>
      <span class="node-name">{{ node.name }}</span>
    </div>
    
    <!-- 子节点 -->
    <div
      v-if="node.kind === 'directory' && expandedPaths.has(node.path) && node.children"
      class="node-children"
    >
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :expanded-paths="expandedPaths"
        :selected-path="selectedPath"
        v-bind="fileFilter ? { 'file-filter': fileFilter } : {}"
        @toggle-expand="(path) => $emit('toggle-expand', path)"
        @select-file="(fileHandle, path) => $emit('select-file', fileHandle, path)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileNode } from '@/types/fileBrowser'

const props = defineProps<{
  node: FileNode
  expandedPaths: Set<string>
  selectedPath: string | null
  fileFilter?: (file: FileSystemFileHandle) => boolean
}>()

const emit = defineEmits<{
  'toggle-expand': [path: string]
  'select-file': [fileHandle: FileSystemFileHandle, path: string]
}>()

function handleClick() {
  if (props.node.kind === 'directory') {
    emit('toggle-expand', props.node.path)
  } else {
    if (props.fileFilter && !props.fileFilter(props.node.handle as FileSystemFileHandle)) {
      return
    }
    emit('select-file', props.node.handle as FileSystemFileHandle, props.node.path)
  }
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  
  const iconMap: Record<string, string> = {
    // 图片
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'webp': '🖼️',
    'svg': '🖼️',
    'bmp': '🖼️',
    // 音频
    'mp3': '🎵',
    'wav': '🎵',
    'ogg': '🎵',
    'm4a': '🎵',
    'aac': '🎵',
    // 视频
    'mp4': '🎬',
    'avi': '🎬',
    'mov': '🎬',
    'webm': '🎬',
    // 其他
    'json': '📄',
    'txt': '📄',
    'md': '📄',
  }
  
  return iconMap[ext] ?? '📄'
}
</script>

<style scoped>
.file-tree-node {
  user-select: none;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.node-item:hover {
  background-color: #f3f4f6;
}

.node-item.is-selected {
  background-color: #dbeafe;
  color: #1e40af;
}

.node-item.is-directory {
  font-weight: 500;
}

.node-icon {
  margin-right: 6px;
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.file-icon {
  font-size: 14px;
}

.node-name {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-children {
  margin-left: 20px;
  border-left: 1px solid #e5e7eb;
  padding-left: 8px;
}
</style>

