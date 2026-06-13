<template>
  <div class="asset-manager-page">
    <!-- 根据类型显示不同的管理器 -->
    <ExpressionManager v-if="assetType === 'expressions'" />
    <BackgroundManager v-else-if="assetType === 'backgrounds'" />
    <PropManager v-else-if="assetType === 'props'" />
    <div
      v-else
      class="coming-soon"
    >
      <p>{{ assetType }} 管理功能开发中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import BackgroundManager from '@/components/BackgroundManager.vue'
import ExpressionManager from '@/components/ExpressionManager.vue'
import PropManager from '@/components/PropManager.vue'
// v7.3: EffectManager 已移除

const route = useRoute()
const assetType = computed(() => route.params['type'] as string)
</script>

<style scoped>
.asset-manager-page {
  height: 100%;
  overflow: hidden;
}

.coming-soon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  font-size: 16px;
}
</style>
