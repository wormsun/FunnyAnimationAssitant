<template>
  <div class="top-menu-bar">
    <div
      class="logo"
      title="返回项目主页"
      @click="router.push('/project')"
    >
      <svg
        class="logo-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 128 128"
      >
        <defs>
          <linearGradient
            id="iconGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              style="stop-color:#2563EB;stop-opacity:1"
            />
            <stop
              offset="50%"
              style="stop-color:#3B82F6;stop-opacity:1"
            />
            <stop
              offset="100%"
              style="stop-color:#06B6D4;stop-opacity:1"
            />
          </linearGradient>
          <filter id="iconGlow">
            <feGaussianBlur
              stdDeviation="3"
              result="coloredBlur"
            />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="64"
          cy="64"
          r="58"
          fill="url(#iconGradient)"
          filter="url(#iconGlow)"
        />
        <g transform="translate(64, 64)">
          <rect
            x="-24"
            y="-16"
            width="36"
            height="26"
            rx="3"
            fill="white"
            opacity="0.9"
          />
          <circle
            cx="-6"
            cy="-3"
            r="9"
            fill="white"
            opacity="0.95"
          />
          <circle
            cx="-6"
            cy="-3"
            r="5"
            fill="url(#iconGradient)"
          />
          <circle
            cx="8"
            cy="-11"
            r="3.5"
            fill="#ff4444"
          />
          <polygon
            points="18,-10 18,6 32,-2"
            fill="white"
            opacity="0.9"
          />
        </g>
      </svg>
      <h1 class="logo-text">
        沙雕动画小助手
      </h1>
    </div>
    
    <!-- 项目菜单 -->
    <div v-if="shouldShowProjectElements" class="menu-group">
      <div class="dropdown">
        <button
          class="menu-btn"
          @click="toggleProjectMenu"
        >
          📁 项目 ▼
        </button>
        <div
          v-if="showProjectMenu"
          class="dropdown-menu"
        >
          <button
            class="menu-item"
            @click="handleNewProject"
          >
            📄 新建项目
          </button>
          <button
            class="menu-item"
            @click="handleOpenProject"
          >
            📂 打开项目文件夹
          </button>
          <button
            class="menu-item"
            @click="handleSaveProject"
          >
            💾 保存项目
          </button>
          <button
            class="menu-item"
            @click="handleCloseProject"
          >
            ❌ 关闭项目
          </button>
        </div>
      </div>
    </div>
    
    <!-- 项目名称 - 面包屑样式 -->
    <div v-if="shouldShowProjectElements" class="project-info">
      <span class="divider">/</span>
      <span
        class="project-name"
        :title="projectStore.projectName"
      >
        {{ projectStore.projectName }}
      </span>
    </div>

    <!-- 隐藏的文件输入（降级方案，用于不支持 File System API 的情况） -->
    <input 
      ref="fileInput" 
      type="file" 
      accept=".anime" 
      style="display: none" 
      @change="handleFileSelect"
    >
    
    
    <!-- 新建项目对话框 -->
    <NewProjectDialog
      v-if="showNewProjectDialog"
      :directory-handle="selectedDirectory!"
      :existing-files="existingAnimeFiles"
      @confirm="handleConfirmNewProject"
      @cancel="showNewProjectDialog = false"
    />
    
    <!-- 确认关闭项目对话框(新建项目) -->
    <ConfirmDialog
      v-if="showCloseConfirmDialog"
      title="创建新项目"
      :message="`将保存并关闭「${projectStore.projectName}」项目，然后创建新项目。`"
      confirm-text="继续"
      cancel-text="取消"
      @confirm="handleConfirmClose"
      @cancel="showCloseConfirmDialog = false"
    />
    
    <!-- 确认关闭项目对话框(打开项目) -->
    <ConfirmDialog
      v-if="showOpenConfirmDialog"
      title="打开项目"
      :message="`将保存并关闭「${projectStore.projectName}」项目，然后打开新项目。`"
      confirm-text="继续"
      cancel-text="取消"
      @confirm="handleConfirmOpenProject"
      @cancel="showOpenConfirmDialog = false"
    />
    
    <!-- 文件选择对话框 -->
    <ProjectFileSelectorDialog
      v-if="showFileSelectorDialog"
      :files="availableFiles"
      @select="handleSelectFile"
      @cancel="showFileSelectorDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NewProjectDialog from '@/components/NewProjectDialog.vue'
import ProjectFileSelectorDialog from '@/components/ProjectFileSelectorDialog.vue'
import { useToast } from '@/composables/useToast'
import { useProjectStore } from '@/stores/projectStore'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const fileInput = ref<HTMLInputElement>()
const { success, error } = useToast()

const shouldShowProjectElements = computed(() => {
  return route.name !== undefined
})

const showProjectMenu = ref(false)

// 新建项目对话框状态
const showNewProjectDialog = ref(false)
const selectedDirectory = ref<FileSystemDirectoryHandle | null>(null)
const existingAnimeFiles = ref<string[]>([])

// 确认关闭项目对话框状态
const showCloseConfirmDialog = ref(false)
const showOpenConfirmDialog = ref(false)

// 打开项目对话框状态
const showFileSelectorDialog = ref(false)
const availableFiles = ref<{ name: string; lastModified: Date }[]>([])
const openProjectDirectory = ref<FileSystemDirectoryHandle | null>(null)


function toggleProjectMenu() {
  showProjectMenu.value = !showProjectMenu.value
}

// 关闭所有菜单
function closeMenus() {
  showProjectMenu.value = false
}

// 项目菜单操作
async function handleNewProject() {
  closeMenus()
  
  // 如果有项目打开,先显示确认对话框
  if (projectStore.isProjectOpen) {
    showCloseConfirmDialog.value = true
    return
  }
  
  // 没有项目打开,直接选择目录
  await proceedWithNewProject()
}

// 用户确认关闭当前项目后的处理
async function handleConfirmClose() {
  showCloseConfirmDialog.value = false
  
  try {
    // 保存当前项目
    const currentProjectName = projectStore.projectName || '当前项目'
    try {
      await projectStore.saveProject()
      success(`「${currentProjectName}」已保存`)
    } catch (saveError) {
      console.warn('保存当前项目失败:', saveError)
      error('保存失败')
    }
    
    // 关闭当前项目
    await projectStore.closeProject(true) // skipCheck = true
    
    // 继续新建项目流程
    await proceedWithNewProject()
  } catch (error: unknown) {
    console.error(error)
    alert('操作失败：' + ((error as Error).message || '未知错误'))
  }
}

// 选择目录并继续新建项目流程
async function proceedWithNewProject() {
  try {
    // 选择目录 (在用户手势中调用)
    const handle = await projectStore.selectProjectDirectory()
    
    // 扫描现有文件
    const files = await projectStore.scanAnimeFiles(handle)
    existingAnimeFiles.value = files.map(f => f.name)
    
    // 保存目录句柄并显示对话框
    selectedDirectory.value = handle
    showNewProjectDialog.value = true
  } catch (error: unknown) {
    const err = error as Error
    if (err.name !== 'AbortError') {
      console.error(error)
      alert('选择目录失败：' + (err.message || '未知错误'))
    }
  }
}

// 确认新建项目
async function handleConfirmNewProject(data: { fileName: string; projectName: string }) {
  try {
    showNewProjectDialog.value = false
    
    if (!selectedDirectory.value) {
      throw new Error('未选择目录')
    }
    
    // 使用选择的目录句柄创建项目
    await projectStore.newProject(data.projectName, data.fileName, selectedDirectory.value)
    void router.push('/project')
  } catch (error: unknown) {
    console.error(error)
    alert('创建项目失败：' + ((error as Error).message || '未知错误'))
  }
}

async function handleSaveProject() {
  closeMenus()
  try {
    // 保存到文件系统（project.anime 文件）
    await projectStore.saveProject()
    success('项目已保存！')
  } catch (err: unknown) {
    console.error(err)
    error('项目保存失败：' + ((err as Error).message || '未知错误'))
  }
}

async function handleOpenProject() {
  closeMenus()
  
  // 如果有项目打开,先显示确认对话框
  if (projectStore.isProjectOpen) {
    showOpenConfirmDialog.value = true
    return
  }
  
  // 没有项目打开,直接打开
  await proceedWithOpenProject()
}

// 用户确认关闭当前项目后的处理(打开新项目)
async function handleConfirmOpenProject() {
  showOpenConfirmDialog.value = false
  
  try {
    // 保存当前项目
    const currentProjectName = projectStore.projectName || '当前项目'
    try {
      await projectStore.saveProject()
      success(`「${currentProjectName}」已保存`)
    } catch (saveError) {
      console.warn('保存当前项目失败:', saveError)
      error('保存失败')
    }
    
    // 关闭当前项目
    await projectStore.closeProject(true) // skipCheck = true
    
    // 继续打开项目流程 (用户确认是新的用户手势)
    await proceedWithOpenProject()
  } catch (error: unknown) {
    console.error(error)
    alert('操作失败：' + ((error as Error).message || '未知错误'))
  }
}

// 选择并打开项目
async function proceedWithOpenProject() {
  try {
    // 选择目录 (在用户手势中调用)
    const handle = await projectStore.selectProjectDirectory()
    
    // 扫描现有文件
    const files = await projectStore.scanAnimeFiles(handle)
    
    // 如果有多个文件,显示选择对话框
    if (files.length > 1) {
      availableFiles.value = files
      openProjectDirectory.value = handle
      showFileSelectorDialog.value = true
    } else if (files.length === 1 && files[0]) {
      // 单个文件,直接打开
      await projectStore.openProject(files[0].name, handle)
      void router.push('/project')
    } else {
      throw new Error('未找到 .anime 文件')
    }
  } catch (error: unknown) {
    const err = error as Error
    if (err.name === 'AbortError' || err.message === '用户取消操作') {
      return
    }
    console.error(error)
    alert('打开项目失败：' + (err.message || '未知错误'))
  }
}

// 用户选择文件后的处理
async function handleSelectFile(fileName: string) {
  try {
    showFileSelectorDialog.value = false
    
    if (!openProjectDirectory.value) {
      throw new Error('未找到目录句柄')
    }
    
    await projectStore.openProject(fileName, openProjectDirectory.value)
    void router.push('/project')
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || (err as Error).message === '用户取消操作') {
      return
    }
    console.error(err)
    alert('打开项目失败：' + ((err as Error).message || '未知错误'))
  }
}

async function handleCloseProject() {
  closeMenus()
  
  try {
    // closeProject 内部会检查未保存更改
    await projectStore.closeProject()
    void router.push('/project')
  } catch (error: unknown) {
    if ((error as Error).message !== '用户取消操作') {
      console.error(error)
      alert('关闭项目失败：' + ((error as Error).message || '未知错误'))
    }
  }
}

// 文件选择处理（降级方案）
async function handleFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    if (!file.name.endsWith('.anime')) {
      alert('请选择 .anime 格式的项目文件')
      return
    }
    
    try {
      const success = await projectStore.loadFromFile(file)
      if (success) {
        projectStore.isProjectOpen = true
        void router.push('/project')
        alert(`项目「${projectStore.projectName}」加载成功！`)
      } else {
        alert('项目加载失败，请检查文件格式')
      }
    } catch (error) {
      console.error(error)
      alert('项目加载失败，请查看控制台')
    }
    
    // 清空 input
    if (e.target) {
      (e.target as HTMLInputElement).value = ''
    }
  }
}

// 点击外部关闭菜单
if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.dropdown')) {
      closeMenus()
    }
  })
}

</script>

<style scoped>
.top-menu-bar {
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 60px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
  position: relative;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
}

.logo:hover {
  opacity: 0.8;
}

.logo-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.logo-text {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  background: linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #06B6D4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.menu-group {
  margin-left: 24px;
}

.dropdown {
  position: relative;
}

.menu-btn {
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  color: #4b5563;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  min-width: 180px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  z-index: 1000;
  overflow: hidden;
  padding: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  text-align: left;
  background: white;
  color: #374151;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.menu-item:hover {
  background: #eff6ff;
  color: #2563eb;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 12px;
}

.divider {
  color: #9ca3af;
  font-size: 18px;
  font-weight: 300;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.right-actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}

</style>
