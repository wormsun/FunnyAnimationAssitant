<template>
  <div
    class="render-chain-overlay"
    @click.self="emit('close')"
  >
    <div class="render-chain-dialog">
      <div class="dialog-header">
        <div class="header-titles">
          <h3>场景 Render Chain</h3>
          <p class="dialog-subtitle">当前模式: <span class="highlight">{{ modeDescription }}</span></p>
        </div>
        <button
          class="close-btn"
          title="关闭"
          @click="emit('close')"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="dialog-hint">
        <span class="hint-icon">💡</span> 按 zIndex 分组，组内按 render chain 的真实渲染顺序显示。
      </div>

      <div
        v-if="displayEntries.length > 0"
        class="dialog-body"
      >
        <template
          v-for="(entry, index) in displayEntries"
          :key="`${entry.type}-${index}`"
        >
          <div
            v-if="entry.type === 'divider'"
            class="zindex-divider"
          >
            <div class="divider-line"></div>
            <span class="divider-text">层级 {{ entry.zIndex }}</span>
            <div class="divider-line"></div>
          </div>

          <button
            v-else
            class="chain-item"
            :class="{ selected: entry.obj.id === selectedObjectId }"
            @click="handleSelect(entry.obj.id)"
          >
            <div class="chain-order-badge">
              <span class="chain-order-number">{{ entry.order }}</span>
            </div>
            
            <div class="chain-info">
              <span class="chain-icon">{{ getTypeIcon(entry.obj.type) }}</span>
              <span class="chain-name">{{ getDisplayName(entry.obj) }}</span>
            </div>
            
            <div class="chain-meta">
              <span class="chain-type-pill">{{ entry.obj.type }}</span>
            </div>
          </button>
        </template>
      </div>

      <div
        v-else
        class="empty-state"
      >
        <div class="empty-icon-wrapper">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </div>
        <p>暂无场景渲染对象</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { SceneObject } from '@/types/sceneObject'
import { sortRenderChainByZIndex } from '@/utils/renderChainUtils'

type DisplayEntry =
  | { type: 'divider'; zIndex: number }
  | { type: 'item'; obj: SceneObject; order: number }

defineProps<{
  modeDescription: string
}>()

const emit = defineEmits<{
  close: []
}>()

const sceneObjectStore = useSceneObjectStore()

const selectedObjectId = computed(() => sceneObjectStore.selectedObjectId)

const displayEntries = computed((): DisplayEntry[] => {
  const sortedChain = sortRenderChainByZIndex(
    sceneObjectStore.getSceneRenderChain(),
    id => sceneObjectStore.getObject(id)?.zIndex ?? Number.MAX_SAFE_INTEGER,
  )

  const entries: DisplayEntry[] = []
  let previousZIndex: number | null = null
  let order = 0

  for (const id of sortedChain) {
    const obj = sceneObjectStore.getObject(id)
    if (!obj) continue

    if (previousZIndex !== obj.zIndex) {
      entries.push({ type: 'divider', zIndex: obj.zIndex })
      previousZIndex = obj.zIndex
    }

    order += 1
    entries.push({
      type: 'item',
      obj,
      order,
    })
  }

  return entries
})

function getDisplayName(obj: SceneObject): string {
  if ('alias' in obj && obj.alias) return obj.alias
  return obj.name || '未命名'
}

function handleSelect(objectId: string) {
  sceneObjectStore.selectObject(objectId)
}
</script>

<style scoped>
.render-chain-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
}

.render-chain-dialog {
  width: min(680px, calc(100vw - 32px));
  max-height: min(85vh, 800px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  z-index: 20;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.dialog-subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dialog-subtitle .highlight {
  color: #0f172a;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #475569;
}

.dialog-hint {
  padding: 10px 24px;
  font-size: 13px;
  color: #475569;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-hint .hint-icon {
  font-size: 14px;
}

.dialog-body {
  padding: 16px 24px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dialog-body::-webkit-scrollbar {
  width: 6px;
}
.dialog-body::-webkit-scrollbar-track {
  background: transparent;
}
.dialog-body::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}

.zindex-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 16px 0 8px;
  position: sticky;
  top: -8px;
  z-index: 10;
  padding: 8px 0;
  background: rgba(255, 255, 255, 0.95);
}

.divider-line {
  flex: 1;
  height: 1px;
  background: #f1f5f9;
}

.divider-text {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  padding: 0 12px;
}

.chain-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chain-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.chain-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6 inset;
}

.chain-order-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #f1f5f9;
  border-radius: 6px;
  flex-shrink: 0;
}

.chain-order-number {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.chain-item:hover .chain-order-badge {
  background: #e2e8f0;
}

.chain-item.selected .chain-order-badge {
  background: #3b82f6;
}

.chain-item.selected .chain-order-number {
  color: #ffffff;
}

.chain-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chain-icon {
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chain-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chain-meta {
  display: flex;
  align-items: center;
}

.chain-type-pill {
  padding: 4px 10px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 12px;
  color: #64748b;
}

.chain-item.selected .chain-type-pill {
  background: #dbeafe;
  color: #1d4ed8;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: #94a3b8;
}

.empty-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #f1f5f9;
  margin-bottom: 16px;
  color: #cbd5e1;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: #64748b;
}
</style>
