<template>
  <div class="cast-crew-bar">
    <!-- 旁白设置 -->
    <div class="crew-section">
      <button
        class="narrator-btn"
        title="旁白设置"
        @click="handleEditNarrator"
      >
        <span class="narrator-icon">👤</span>
        <span class="narrator-label">旁白设置</span>
      </button>
    </div>

    <div class="divider" />

    <!-- 演员列表 -->
    <div class="actors-section">
      <div class="actors-list">
        <button
          v-for="actor in actors"
          :key="actor.id"
          class="actor-btn"
          :title="`${actor.name} (${actor.alias})`"
          @click="handleEditActor(actor.alias || '')"
        >
          <span class="actor-avatar">👦</span>
          <span class="actor-name">{{ actor.name }}</span>
        </button>
      </div>

      <!-- 添加演员按钮 -->
      <button
        class="btn-add-actor"
        title="添加演员"
        @click="$emit('addActor')"
      >
        ➕ 添加演员
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useProjectStore } from '@/stores/projectStore'

const emit = defineEmits<{
  editNarrator: []
  editActor: [alias: string]
  addActor: []
}>()

const projectStore = useProjectStore()

const actors = computed(() => projectStore.actors)

function handleEditNarrator() {
  emit('editNarrator')
}

function handleEditActor(alias: string) {
  emit('editActor', alias)
}
</script>

<style scoped>
.cast-crew-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.crew-section {
  display: flex;
  align-items: center;
}

.narrator-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #fef3c7;
  border: 1px solid #fde047;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.narrator-btn:hover {
  background: #fde68a;
}

.narrator-icon {
  font-size: 18px;
}

.narrator-label {
  font-size: 14px;
  font-weight: 500;
  color: #713f12;
}

.divider {
  width: 1px;
  height: 32px;
  background: #e5e7eb;
}

.actors-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow-x: auto;
}

.actors-list {
  display: flex;
  gap: 8px;
}

.actor-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.actor-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.actor-avatar {
  font-size: 18px;
}

.actor-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e40af;
}

.btn-add-actor {
  padding: 8px 16px;
  background: white;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-add-actor:hover {
  background: #f9fafb;
  border-color: #9ca3af;
  color: #374151;
}

/* 横向滚动条样式 */
.actors-section::-webkit-scrollbar {
  height: 6px;
}

.actors-section::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.actors-section::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
</style>
