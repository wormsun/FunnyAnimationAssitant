<template>
  <select class="easing-select" :value="props.modelValue" @change="onChange">
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// 动画工作台仅开放最稳定的两种缓动；底层 EasingType 仍保留旧数据兼容。
const options = [
  { value: 'linear', label: '线性' },
  { value: 'step', label: '阶跃' },
]

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.easing-select {
  width: 100%;
  min-width: 120px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #d0d3d9;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
}
</style>
