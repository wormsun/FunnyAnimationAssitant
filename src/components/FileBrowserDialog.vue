<template>
  <div
    class="file-browser-overlay"
    @click.self="$emit('close')"
  >
    <div class="file-browser-dialog">
      <div class="dialog-header">
        <h2>{{ title || '选择文件' }}</h2>
        <button
          class="close-btn"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>
      
      <!-- 路径导航栏 -->
      <div class="path-bar">
        <button 
          v-for="(part, index) in pathParts" 
          :key="index"
          class="path-part"
          :class="{ 'is-current': index === pathParts.length - 1 }"
          @click="navigateToPath(index)"
        >
          {{ part }}
        </button>
        <span
          v-if="pathParts.length === 0"
          class="path-part is-current"
        >项目根目录</span>
      </div>
      
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="search-bar">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件..."
            class="search-input"
          >
        </div>
        <div class="view-mode-toggle">
          <button
            :class="['view-btn', { active: viewMode === 'thumbnail' }]"
            title="缩略图"
            @click="viewMode = 'thumbnail'"
          >
            🖼️
          </button>
          <button
            :class="['view-btn', { active: viewMode === 'list' }]"
            title="列表"
            @click="viewMode = 'list'"
          >
            📋
          </button>
        </div>
      </div>
      
      <!-- 文件列表 -->
      <div
        class="file-list-container"
        :class="`view-${viewMode}`"
      >
        <div
          v-show="isLoading"
          class="loading-state"
        >
          <div class="spinner" />
          <p>加载中...</p>
        </div>
        
        <div
          v-show="!isLoading"
          ref="containerRef"
          class="file-list"
          @scroll="onScroll"
        >
          <div
            class="virtual-spacer"
            :style="{ height: totalHeight + 'px', position: 'relative' }"
          >
            <div 
              class="virtual-content" 
              :style="{ 
                transform: `translateY(${offsetY}px)`,
                display: viewMode === 'thumbnail' ? 'grid' : 'flex',
                gridTemplateColumns: viewMode === 'thumbnail' ? `repeat(${itemsPerRow}, 1fr)` : 'none',
                flexDirection: viewMode === 'list' ? 'column' : 'row'
              }"
            >
              <template
                v-for="item in visibleItems"
                :key="item.path"
              >
                <!-- 缩略图模式 Item -->
                <div
                  v-if="viewMode === 'thumbnail'"
                  class="file-item-thumbnail"
                  :class="{
                    'directory-item': item.kind === 'directory',
                    'file-item-selectable': item.kind === 'file',
                    'is-selected': isSelected(item.path)
                  }"
                  :title="item.name"
                  @click="handleItemClick(item, $event)"
                  @dblclick="handleItemDoubleClick(item)"
                >
                  <div class="thumbnail-preview">
                    <template v-if="item.isParentDir">
                      <div class="thumbnail-icon">⬆️</div>
                    </template>
                    <template v-else>
                      <FileThumbnail
                        v-if="item.kind === 'file' && isImageFile(item.name)"
                        :item="item"
                        class="thumbnail-image"
                      />
                      <div
                        v-else
                        class="thumbnail-icon"
                      >
                        <span v-if="item.kind === 'directory'">📁</span>
                        <span v-else>{{ getFileIcon(item.name) }}</span>
                      </div>
                      <div
                        v-if="item.kind === 'file' && isSelected(item.path)"
                        class="thumbnail-check"
                      >✓</div>
                    </template>
                  </div>
                  <div class="thumbnail-name">
                    {{ item.isParentDir ? '返回上级' : truncateMiddle(item.name, 20, 8, 8) }}
                  </div>
                </div>

                <!-- 列表模式 Item -->
                <div
                  v-else
                  class="file-item"
                  :class="{
                    'directory-item': item.kind === 'directory',
                    'file-item-selectable': item.kind === 'file',
                    'is-selected': isSelected(item.path)
                  }"
                  :title="item.name"
                  @click="handleItemClick(item, $event)"
                  @dblclick="handleItemDoubleClick(item)"
                >
                  <span class="file-icon">
                    <template v-if="item.isParentDir">⬆️</template>
                    <template v-else>
                      <span v-if="item.kind === 'directory'">📁</span>
                      <span v-else>{{ getFileIcon(item.name) }}</span>
                    </template>
                  </span>
                  <span class="file-name">{{ item.isParentDir ? '..' : item.name }}</span>
                  <span
                    v-if="item.kind === 'file'"
                    class="file-size"
                  >{{ formatFileSize(item.size) }}</span>
                  <span
                    v-if="item.kind === 'directory'"
                    class="file-type"
                  >{{ item.isParentDir ? '返回上级' : '文件夹' }}</span>
                  <span
                    v-if="item.kind === 'file' && isSelected(item.path)"
                    class="check-mark"
                  >✓</span>
                </div>
              </template>
            </div>
          </div>
          <div
            v-if="filteredItemsWithParent.length === 0"
            class="empty-state"
          >
            {{ searchQuery ? '未找到匹配的文件' : '此目录为空' }}
          </div>
        </div>
      </div>
      
      <!-- 底部操作栏 -->
      <div class="dialog-footer">
        <div class="selected-count-info">
          <template v-if="selectMode === 'directory'">
            <span v-if="selectedDirectory">已选择文件夹: {{ selectedDirectory.name }}</span>
            <span v-else>请选择一个文件夹</span>
          </template>
          <template v-else>
            <span v-if="selectedFiles.length > 0">已选择 {{ selectedFiles.length }} 个文件</span>
            <span v-else>未选择文件</span>
          </template>
        </div>
        <div class="actions">
          <button
            class="btn btn-cancel"
            @click="$emit('close')"
          >取消</button>
          <button
            v-if="selectMode === 'directory'"
            :disabled="!selectedDirectory"
            class="btn btn-confirm"
            @click="handleConfirm"
          >选择此文件夹</button>
          <button
            v-else
            :disabled="selectedFiles.length === 0"
            class="btn btn-confirm"
            @click="handleConfirm"
          >确定 ({{ selectedFiles.length }})</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted,ref } from 'vue'

import { useProjectStore } from '@/stores/projectStore'
import type { FileNode, SelectedDirectory, SelectedFile } from '@/types/fileBrowser'
import { getDirectoryHandleSafe } from '@/utils/fileSystem'
import { normalizePath } from '@/utils/pathUtils'
import { truncateMiddle } from '@/utils/textUtils'
import { thumbnailManager } from '@/utils/ThumbnailManager'

import FileThumbnail from './FileThumbnail.vue'

const props = withDefaults(defineProps<{
  title?: string
  fileFilter?: (file: FileSystemFileHandle) => boolean
  multiple?: boolean
  selectMode?: 'file' | 'directory'
}>(), {
  title: '选择文件',
  fileFilter: () => true,
  multiple: true,
  selectMode: 'file'
})

const emit = defineEmits<{
  select: [files: SelectedFile[]]
  selectDirectory: [directory: SelectedDirectory]
  close: []
}>()

const projectStore = useProjectStore()
const isLoading = ref(false)
const searchQuery = ref('')
const currentPath = ref<string[]>([])
const LAST_PATH_KEY = 'fileBrowser_lastPath'
const currentItems = ref<FileNode[]>([])
const selectedFiles = ref<SelectedFile[]>([])
const selectedDirectory = ref<SelectedDirectory | null>(null)
const selectedItemPath = ref<string | null>(null)
const lastSelectedIndex = ref<number>(-1)
const viewMode = ref<'thumbnail' | 'list'>('thumbnail')

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerWidth = ref(800)
const containerHeight = ref(400)
let resizeObserver: ResizeObserver | null = null

const THUMBNAIL_WIDTH = 120
const THUMBNAIL_GAP = 12
const THUMBNAIL_HEIGHT = 144
const LIST_HEIGHT = 44
const ROW_GAP = 12 // 与 CSS .virtual-content { gap: 12px } 保持一致

const pathParts = computed(() => ['项目根目录', ...currentPath.value])

const filteredItemsWithParent = computed(() => {
  const items = [...currentItems.value]
  let filtered = items
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = items.filter(item => item.name.toLowerCase().includes(query))
  }
  if (currentPath.value.length > 0 && !searchQuery.value) {
    return [{
      name: '..',
      path: '..',
      kind: 'directory' as const,
      handle: {} as unknown as FileSystemDirectoryHandle,
      isParentDir: true
    }, ...filtered]
  }
  return filtered
})

const itemsPerRow = computed(() => {
  if (viewMode.value === 'list') return 1
  const itemFullWidth = THUMBNAIL_WIDTH + THUMBNAIL_GAP
  return Math.max(1, Math.floor(containerWidth.value / itemFullWidth))
})

const itemHeight = computed(() => viewMode.value === 'list' ? LIST_HEIGHT + ROW_GAP : THUMBNAIL_HEIGHT + ROW_GAP)
const totalRows = computed(() => Math.ceil(filteredItemsWithParent.value.length / itemsPerRow.value))
const totalHeight = computed(() => totalRows.value > 0 ? totalRows.value * itemHeight.value - ROW_GAP : 0)

const visibleRange = computed(() => {
  const startRow = Math.floor(scrollTop.value / itemHeight.value)
  const visibleRows = Math.ceil(containerHeight.value / itemHeight.value)
  const buffer = 2
  const start = Math.max(0, (startRow - buffer) * itemsPerRow.value)
  const end = Math.min(filteredItemsWithParent.value.length, (startRow + visibleRows + buffer) * itemsPerRow.value)
  return { start, end }
})

const visibleItems = computed(() => filteredItemsWithParent.value.slice(visibleRange.value.start, visibleRange.value.end))
const offsetY = computed(() => Math.floor(visibleRange.value.start / itemsPerRow.value) * itemHeight.value)

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
        containerHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(containerRef.value)
  }
  restoreLastPath()
  void loadCurrentDirectory()
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  thumbnailManager.cleanup()
})

async function loadCurrentDirectory() {
  if (!projectStore.projectHandle) return
  isLoading.value = true
  // 重置滚动位置（响应式变量和 DOM 都要重置）
  scrollTop.value = 0
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
  }
  try {
    let dirHandle = projectStore.projectHandle
    for (const part of currentPath.value) {
      try { dirHandle = await getDirectoryHandleSafe(dirHandle, part) }
      catch (error) { currentPath.value = []; dirHandle = projectStore.projectHandle; break }
    }
    const items: FileNode[] = []
    for await (const entry of dirHandle.values()) {
      if (entry.name === 'project.anime') continue
      const fullPath = currentPath.value.length > 0 ? [...currentPath.value, entry.name].join('/') : entry.name
      if (entry.kind === 'directory') {
        items.push({ name: entry.name, path: fullPath, kind: 'directory', handle: entry })
      } else {
        const fileEntry = entry
        if (props.fileFilter(fileEntry)) {
          try {
            const file = await fileEntry.getFile()
            items.push({ name: entry.name, path: fullPath, kind: 'file', handle: entry, size: file.size })
          } catch (e) { /* ignore */ }
        }
      }
    }
    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    currentItems.value = items
  } catch (error) {
    console.error('Failed to load directory', error)
    currentItems.value = []
  } finally { isLoading.value = false }
}

async function navigateToPath(index: number) {
  // 记住要返回的子目录名称
  const childDirName = currentPath.value[index] || null
  if (index === 0) currentPath.value = []
  else currentPath.value = currentPath.value.slice(0, index)
  selectedItemPath.value = null
  lastSelectedIndex.value = -1
  await loadCurrentDirectory()
  saveLastPath()
  // 滚动到子目录位置
  if (childDirName) {
    await nextTick()
    scrollToItem(childDirName)
  }
}

async function navigateUp() {
  if (currentPath.value.length > 0) {
    // 记住当前子目录名称
    const childDirName = currentPath.value[currentPath.value.length - 1]
    currentPath.value.pop()
    selectedItemPath.value = null
    lastSelectedIndex.value = -1
    await loadCurrentDirectory()
    saveLastPath()
    // 滚动到子目录位置
    if (childDirName) {
      await nextTick()
      scrollToItem(childDirName)
    }
  }
}

function scrollToItem(itemName: string) {
  const index = filteredItemsWithParent.value.findIndex(item => item.name === itemName)
  if (index <= 0) return // 没找到或是第一项，不需要滚动

  // 使用 setTimeout 确保容器已完全渲染
  setTimeout(() => {
    if (!containerRef.value) return
    
    // 实时获取容器宽度来计算每行项目数
    const actualWidth = containerRef.value.clientWidth
    const actualItemsPerRow = viewMode.value === 'list' 
      ? 1 
      : Math.max(1, Math.floor((actualWidth - 24) / (THUMBNAIL_WIDTH + THUMBNAIL_GAP)))
    
    const currentItemHeight = viewMode.value === 'list' ? LIST_HEIGHT + ROW_GAP : THUMBNAIL_HEIGHT + ROW_GAP
    
    // 计算目标滚动位置
    const rowIndex = Math.floor(index / actualItemsPerRow)
    const targetScrollTop = rowIndex * currentItemHeight
    
    containerRef.value.scrollTop = targetScrollTop
    scrollTop.value = targetScrollTop
  }, 100)
}

async function handleItemClick(item: FileNode, event: MouseEvent) {
  if (item.isParentDir) { await navigateUp(); return }
  const itemIndex = filteredItemsWithParent.value.findIndex(i => i.path === item.path)
  
  // 目录选择模式：单击选中目录
  if (props.selectMode === 'directory') {
    if (item.kind === 'directory') {
      const normalizedPath = normalizePath(item.path)
      selectedDirectory.value = {
        handle: item.handle as FileSystemDirectoryHandle,
        path: normalizedPath,
        name: item.name
      }
      selectedItemPath.value = item.path
    }
    return
  }
  
  // 文件选择模式（原有逻辑）
  if (event.shiftKey && props.multiple && lastSelectedIndex.value >= 0 && item.kind === 'file') {
    selectRange(lastSelectedIndex.value, itemIndex)
    return
  }
  if ((event.ctrlKey || event.metaKey) && props.multiple && item.kind === 'file') {
    const normalizedPath = normalizePath(item.path)
    const existsIndex = selectedFiles.value.findIndex(f => f.path === normalizedPath)
    if (existsIndex >= 0) {
      selectedFiles.value.splice(existsIndex, 1)
      const lastSelected = selectedFiles.value[selectedFiles.value.length - 1]
      selectedItemPath.value = lastSelected ? lastSelected.path : null
    } else {
      selectFile(item, false)
      selectedItemPath.value = item.path
    }
    lastSelectedIndex.value = itemIndex
    return
  }
  selectedItemPath.value = item.path
  if (item.kind === 'directory') {
    lastSelectedIndex.value = -1
    selectedFiles.value = []
  } else {
    selectedFiles.value = []
    selectFile(item, true)
    lastSelectedIndex.value = itemIndex
  }
}

async function handleItemDoubleClick(item: FileNode) {
  if (item.isParentDir) { await navigateUp(); return }
  if (item.kind === 'directory') {
    selectedItemPath.value = null
    lastSelectedIndex.value = -1
    currentPath.value.push(item.name)
    await loadCurrentDirectory()
    saveLastPath()
  } else {
    selectedFiles.value = []
    selectFile(item)
    handleConfirm()
  }
}

function selectRange(startIndex: number, endIndex: number) {
  const start = Math.min(startIndex, endIndex)
  const end = Math.max(startIndex, endIndex)
  const filesInRange = filteredItemsWithParent.value.slice(start, end + 1).filter(item => item.kind === 'file' && !item.isParentDir)
  selectedFiles.value = []
  for (const item of filesInRange) { selectFile(item, false) }
  if (filesInRange.length > 0) {
    const lastItem = filesInRange[filesInRange.length - 1]
    if (lastItem) {
      lastSelectedIndex.value = filteredItemsWithParent.value.findIndex(i => i.path === lastItem.path)
      selectedItemPath.value = lastItem.path
    }
  }
}

function selectFile(item: FileNode, replace = true) {
  if (item.kind !== 'file' || item.isParentDir) return
  const fileHandle = item.handle as FileSystemFileHandle
  if (!projectStore.projectHandle) return
  const normalizedPath = normalizePath(item.path)
  const selectedFile: SelectedFile = { handle: fileHandle, path: normalizedPath, name: fileHandle.name }
  if (replace) { selectedFiles.value = [selectedFile] }
  else { if (!selectedFiles.value.some(f => f.path === normalizedPath)) selectedFiles.value.push(selectedFile) }
}

function isSelected(path: string): boolean {
  if (selectedItemPath.value === path) return true
  if (props.selectMode === 'directory' && selectedDirectory.value?.path === path) return true
  return selectedFiles.value.some(f => f.path === path)
}

function handleConfirm() {
  if (props.selectMode === 'directory') {
    if (selectedDirectory.value) {
      emit('selectDirectory', selectedDirectory.value)
      emit('close')
    }
  } else {
    if (selectedFiles.value.length > 0) {
      emit('select', selectedFiles.value)
      emit('close')
    }
  }
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const iconMap: Record<string, string> = { 'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️', 'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'm4a': '🎵', 'aac': '🎵', 'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'webm': '🎬', 'json': '📄', 'txt': '📄', 'md': '📄' }
  return iconMap[ext] ?? '📄'
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageFile(filename: string): boolean { return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(filename.split('.').pop()?.toLowerCase() ?? '') }

function saveLastPath() { try { localStorage.setItem(LAST_PATH_KEY, JSON.stringify(currentPath.value)) } catch (e) { void e } }
function restoreLastPath() { try { const savedPath = localStorage.getItem(LAST_PATH_KEY); if (savedPath) { const parsedPath = JSON.parse(savedPath) as string[]; if (Array.isArray(parsedPath)) currentPath.value = parsedPath } } catch (e) { currentPath.value = [] } }
</script>

<style scoped>
.file-browser-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; }
.file-browser-dialog { width: 800px; height: 80vh; background: white; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); }
.dialog-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.dialog-header h2 { margin: 0; font-size: 20px; font-weight: 600; color: #1f2937; }
.close-btn { width: 32px; height: 32px; padding: 0; font-size: 20px; background: none; color: #6b7280; border: none; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.close-btn:hover { background: #f3f4f6; color: #1f2937; }
.path-bar { display: flex; align-items: center; padding: 12px 24px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
.path-part { padding: 4px 8px; background: white; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; cursor: pointer; transition: all 0.2s; color: #6b7280; }
.path-part:hover { background: #f3f4f6; border-color: #9ca3af; }
.path-part.is-current { background: #3b82f6; color: white; border-color: #3b82f6; cursor: default; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid #e5e7eb; gap: 12px; flex-shrink: 0; }
.search-bar { flex: 1; }
.search-input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
.search-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.file-list-container { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
.file-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0 12px; }
.virtual-content { width: 100%; box-sizing: border-box; gap: 12px; padding-bottom: 12px; }
.file-item-thumbnail { display: flex; flex-direction: column; align-items: center; padding: 8px; border-radius: 8px; cursor: pointer; transition: all 0.15s; user-select: none; border: 2px solid transparent; height: 144px; box-sizing: border-box; min-width: 0; overflow: hidden; }
.file-item-thumbnail:hover { background-color: #f3f4f6; }
.file-item-thumbnail.is-selected { background-color: #dbeafe; border-color: #3b82f6; }
.thumbnail-preview { position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; background: #f9fafb; border-radius: 6px; margin-bottom: 8px; overflow: hidden; flex-shrink: 0; }
.thumbnail-image { width: 100%; height: 100%; object-fit: cover; }
.thumbnail-icon { font-size: 48px; }
.thumbnail-check { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; }
.thumbnail-name { font-size: 12px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; color: #374151; }
.view-mode-toggle { display: flex; gap: 4px; border: 1px solid #d1d5db; border-radius: 6px; padding: 2px; background: white; }
.view-btn { padding: 6px 10px; border: none; background: transparent; cursor: pointer; border-radius: 4px; font-size: 16px; transition: all 0.2s; }
.view-btn:hover { background: #f3f4f6; }
.view-btn.active { background: #3b82f6; color: white; }
.file-item { display: flex; align-items: center; padding: 0 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s; user-select: none; height: 44px; box-sizing: border-box; }
.file-item:hover { background-color: #f3f4f6; }
.file-item.is-selected { background-color: #dbeafe; color: #1e40af; }
.file-icon { width: 24px; margin-right: 12px; font-size: 18px; text-align: center; flex-shrink: 0; }
.file-name { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { font-size: 12px; color: #6b7280; margin-left: 12px; flex-shrink: 0; }
.file-type { font-size: 12px; color: #6b7280; margin-left: 12px; flex-shrink: 0; }
.check-mark { margin-left: 12px; color: #3b82f6; font-weight: bold; font-size: 16px; flex-shrink: 0; }
.loading-state { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.8); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #6b7280; }
.spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { padding: 60px 20px; text-align: center; color: #9ca3af; font-size: 14px; }
.dialog-footer { display: flex; flex-direction: column; gap: 12px; padding: 16px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb; flex-shrink: 0; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn { padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; border: none; }
.btn-cancel { background: #f3f4f6; color: #374151; }
.btn-cancel:hover { background: #e5e7eb; }
.btn-confirm { background: #3b82f6; color: white; }
.btn-confirm:hover:not(:disabled) { background: #2563eb; }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
