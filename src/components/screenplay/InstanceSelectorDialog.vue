<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click.self="$emit('close')"
    >
      <div class="picker-dialog">
        <div class="dialog-header">
          <h3>选择演员实例</h3>
          <button
            class="close-btn"
            @click="$emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="dialog-content">
          <div class="dialog-body">
            <div
              v-if="actorInstances.length === 0"
              class="empty-state"
            >
              <p>📭 当前场景中暂无存活的演员实例</p>
              <p class="hint">
                请先在场景 Setup 或 Action 模式中添加演员
              </p>
            </div>

            <div
              v-else
              class="actor-grid"
            >
              <div
                v-for="instance in actorInstances"
                :key="instance.id"
                class="actor-card"
                :class="{ selected: selectedInstanceId === instance.id }"
                @click="selectedInstanceId = instance.id"
                @dblclick="handleConfirm"
              >
                <div class="card-preview">
                  <img
                    v-if="instance.thumbnail"
                    :src="instance.thumbnail"
                    :alt="instance.alias"
                    @error="handleImageError"
                  >
                  <div
                    v-else
                    class="no-preview"
                  >
                    🎭
                  </div>
                </div>
                <div class="card-info">
                  <div
                    class="card-name"
                    :title="instance.alias"
                  >
                    {{ instance.alias }}
                  </div>
                  <div class="card-meta">
                    <span
                      v-if="instance.actorName"
                      class="meta-actor"
                    >
                      🎭 {{ instance.actorName }}
                    </span>
                    <span
                      v-if="instance.voiceLabel"
                      class="meta-voice"
                    >
                      🎤 {{ instance.voiceLabel }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="dialog-footer">
            <button
              class="btn-cancel"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="btn-confirm"
              :disabled="!selectedInstanceId"
              @click="handleConfirm"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { getVoiceName } from '@/constants/voiceOptions'
import { useCompositeCharacterStore } from '@/stores/compositeCharacterStore'
import { useProjectStore } from '@/stores/projectStore'
import type { SceneObject } from '@/types/screenplay'

interface ActorInstanceItem {
  id: string          // SceneObject.id
  alias: string       // 实例别名
  actorName: string   // 演员名称
  voiceLabel: string  // 配音标签
  thumbnail: string | undefined  // 人物缩略图
}

const props = defineProps<{
  sceneObjects: SceneObject[]  // runtime objects（含 spawned 状态）
  currentInstanceId?: string   // 当前选中的实例ID
}>()

const emit = defineEmits<{
  select: [instanceId: string]
  close: []
}>()

const projectStore = useProjectStore()
const characterStore = useCompositeCharacterStore()

const selectedInstanceId = ref(props.currentInstanceId || '')

// 构建演员实例列表（仅显示 spawned 的演员实例）
const actorInstances = computed<ActorInstanceItem[]>(() => {
  return props.sceneObjects
    .filter(obj => obj.extraInfo?.kind === 'actor' && obj.spawned !== false)
    .map(obj => {
      const info = obj.extraInfo as { kind: 'actor'; actorId: string }
      const actor = projectStore.getActor(info.actorId)
      const character = actor?.characterId
        ? characterStore.getCharacter(actor.characterId)
        : null

      return {
        id: obj.id,
        alias: obj.alias || '未命名',
        actorName: actor?.name || '',
        voiceLabel: getVoiceName(actor?.voice?.voiceId) ?? '',
        thumbnail: character?._runtimeThumbnailUrl,
      }
    })
})

function handleImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none'
}

function handleConfirm() {
  if (selectedInstanceId.value) {
    emit('select', selectedInstanceId.value)
    emit('close')
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.picker-dialog {
  background: white;
  width: 750px;
  max-width: 90vw;
  height: 70vh;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 20px;
  background: none;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.dialog-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
}

.hint {
  font-size: 13px;
  margin-top: 4px;
}

.actor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.actor-card {
  background: #f9fafb;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}

.actor-card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.actor-card.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.card-preview {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  padding: 10px;
  position: relative;
}

.card-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.no-preview {
  font-size: 40px;
  opacity: 0.3;
}

.card-info {
  padding: 8px 10px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.meta-actor {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-voice {
  font-size: 11px;
  color: #9ca3af;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f3f4f6;
}

.btn-confirm {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  background: #2563eb;
}

.btn-confirm:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
