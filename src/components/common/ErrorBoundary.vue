<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

import { useToast } from '@/composables/useToast'

const toast = useToast()
const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((err) => {
  hasError.value = true
  errorMessage.value = err.message
  toast.error(`发生错误: ${err.message}`)
  console.error('[ErrorBoundary]', err)
  return false  // 阻止错误继续传播
})

function retry() {
  hasError.value = false
  errorMessage.value = ''
}
</script>

<template>
  <slot v-if="!hasError" />
  <div
    v-else
    class="error-fallback"
  >
    <div class="error-icon">
      ⚠️
    </div>
    <h3>组件加载失败</h3>
    <p class="error-message">
      {{ errorMessage }}
    </p>
    <button
      class="btn-retry"
      @click="retry"
    >
      重试
    </button>
  </div>
</template>

<style scoped>
.error-fallback {
  padding: 40px;
  text-align: center;
  background: #fef2f2;
  border: 2px solid #fecaca;
  border-radius: 12px;
  margin: 20px;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
  line-height: 1;
}

.error-fallback h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #991b1b;
}

.error-message {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: #7f1d1d;
  font-family: monospace;
  background: #fee2e2;
  padding: 8px 12px;
  border-radius: 4px;
  display: inline-block;
}

.btn-retry {
  padding: 10px 20px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-retry:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
}
</style>
