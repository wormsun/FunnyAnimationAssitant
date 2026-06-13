<template>
  <div class="app">
    <TopMenuBar />
    <main class="main">
      <router-view />
    </main>
    <GlobalToast />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount,onMounted } from 'vue'
import { useRoute,useRouter } from 'vue-router'

import GlobalToast from './components/GlobalToast.vue'
import TopMenuBar from './components/TopMenuBar.vue'
import { useAutoSave } from './composables/useAutoSave'
import { useProjectStore } from './stores/projectStore'

const projectStore = useProjectStore()
const router = useRouter()
const route = useRoute()

// 启用自动保存（30秒间隔）
useAutoSave(30000)

const autoSavePromptRoutes = new Set(['ProjectHome', 'EpisodeEdit', 'ScreenplayEditor'])

// 启动时检查自动保存
onMounted(async () => {
  await router.isReady()
  if (!autoSavePromptRoutes.has(String(route.name ?? ''))) return

  const hasAutoSaveData = projectStore.hasAutoSave()
  if (hasAutoSaveData) {
    const saveTime = projectStore.getAutoSaveTime()
    const timeStr = saveTime ? saveTime.toLocaleString() : '未知时间'
    
    if (confirm(`检测到自动保存的项目数据 (${timeStr})，是否恢复？`)) {
      const success = projectStore.restoreFromAutoSave()
      if (!success) {
        alert('恢复自动保存失败')
      }
    }
  }
})

// 页面刷新前提示保存
onMounted(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (projectStore.hasUnsavedChanges && projectStore.isProjectOpen) {
      // 标准方式：显示浏览器默认提示
      e.preventDefault()
      e.returnValue = '当前项目有未保存的修改，确定要离开吗？'
    }
  }

  window.addEventListener('beforeunload', handleBeforeUnload)

  // 清理函数
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
})

</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  background: #f9fafb;
  overflow: auto;
}
</style>
