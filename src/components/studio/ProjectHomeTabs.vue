<template>
  <div class="project-home-tabs">
    <div 
      v-for="tab in tabs" 
      :key="tab.value"
      :class="['tab-item', { active: modelValue === tab.value }]"
      @click="handleTabClick(tab)"
    >
      <span class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

interface Tab {
  label: string
  value: string
  icon: string
  link?: string
}

defineProps<{
  modelValue: string
  tabs: Tab[]
}>()

const emit = defineEmits<(e: 'update:modelValue', value: string) => void>()

const router = useRouter()

function handleTabClick(tab: Tab) {
  if (tab.link) {
    void router.push(tab.link)
  } else {
    emit('update:modelValue', tab.value)
  }
}
</script>

<style scoped>
.project-home-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 24px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  color: #6b7280;
  font-weight: 500;
}

.tab-item:hover {
  color: #374151;
  background: #f9fafb;
}

.tab-item.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: #eff6ff;
}

.tab-icon {
  font-size: 18px;
}

.tab-label {
  font-size: 16px;
}
</style>
