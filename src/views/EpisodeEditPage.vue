<template>
  <div class="episode-edit-page">
    <!-- 场景编辑模式 -->
    <SceneEditMode 
      v-if="isReady"
      :key="`${sceneMode}-${sceneId}-${blockId}`"
      :episode="currentEpisode"
      :edit-line="sceneEditLine"
      :mode="sceneMode"
      :scene-id="sceneId"
      :block-id="blockId"
      @exit-scene-edit="handleExitSceneEdit"
      @save-setup="handleSaveSetup"
    />
    <div
      v-else
      class="loading-page"
    >
      <span>正在加载...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SceneEditMode from '@/components/SceneEditMode.vue'
import { useEpisodeStore } from '@/stores/episodeStore'
import type { SceneSetup } from '@/types/screenplay'

const route = useRoute()
const router = useRouter()
const episodeStore = useEpisodeStore()

const episodeId = route.params['id'] as string
const sceneEditLine = ref<number>(0)
const sceneMode = ref<'setup' | 'action'>('setup')
const sceneId = ref<string | null>(null)
const blockId = ref<string | null>(null)
const isReady = ref(false)

const currentEpisode = computed(() => episodeStore.getEpisode(episodeId))

// 从路由query参数更新场景编辑状态
function updateFromRoute() {
  const mode = route.query['mode'] as string
  const sceneIdParam = route.query['sceneId'] as string
  const blockIdParam = route.query['blockId'] as string
  
  if (mode === 'setup' && sceneIdParam) {
    sceneMode.value = 'setup'
    sceneId.value = sceneIdParam
    blockId.value = null
    isReady.value = true
  } else if (mode === 'action' && sceneIdParam && blockIdParam) {
    sceneMode.value = 'action'
    sceneId.value = sceneIdParam
    blockId.value = blockIdParam
    isReady.value = true
  }
}

onMounted(() => {
  if (!currentEpisode.value) {
    alert('动画不存在')
    void router.push('/project')
    return
  }
  
  updateFromRoute()
})

// 监听路由变化，动态更新场景编辑状态
watch(
  () => route.query,
  () => {
    updateFromRoute()
  },
  { deep: true }
)

function handleExitSceneEdit() {
  void router.push(`/screenplay/${episodeId}`)
}

function handleSaveSetup(_savedSceneId: string, _setup: SceneSetup) {
  // SceneEditMode已经调用了episodeStore.updateScene，这里只需要返回
  void router.push(`/screenplay/${episodeId}`)
}
</script>

<style scoped>
.episode-edit-page {
  /* 不需要额外的padding，SceneEditMode已经处理了布局 */
  height: 100%;
}

.loading-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  color: #888;
  font-size: 14px;
}
</style>
