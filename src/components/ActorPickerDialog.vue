<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="picker-dialog">
        <div class="dialog-header">
          <h3>选择演员</h3>
          <button
            class="close-btn"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="dialog-content">
          <!-- 顶部工具栏：搜索框 -->
          <div class="content-toolbar">
            <input
              v-model="searchKeyword"
              type="text"
              class="search-input"
              placeholder="搜索演员..."
            >
          </div>

          <!-- 卡片网格 -->
          <div class="dialog-body">
            <div
              v-if="filteredActors.length === 0"
              class="empty-state"
            >
              <p>📭 暂无可用演员</p>
              <p class="hint">
                请先在「演员管理」中添加演员
              </p>
            </div>

            <div
              v-else
              class="actor-grid"
            >
              <div
                v-for="actor in filteredActors"
                :key="actor.id"
                class="actor-card"
                :class="{ selected: selectedActorId === actor.id }"
                @click="selectedActorId = actor.id"
                @dblclick="handleConfirm"
              >
                <div class="card-preview">
                  <img
                    v-if="getCharacterThumbnail(actor.characterId)"
                    :src="getCharacterThumbnail(actor.characterId)"
                    :alt="actor.name"
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
                    :title="actor.name"
                  >
                    {{ actor.name }}
                  </div>
                  <div class="card-meta">
                    <span
                      v-if="getCharacterName(actor.characterId)"
                      class="meta-character"
                    >
                      👤 {{ getCharacterName(actor.characterId) }}
                    </span>
                    <span class="meta-voice">
                      🎤 {{ getVoiceLabel(actor.voice?.voiceId) }}
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
              @click="emit('close')"
            >
              取消
            </button>
            <button
              class="btn-confirm"
              :disabled="!selectedActorId"
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
import type { CompositeCharacter } from '@/types/compositeCharacter'

const emit = defineEmits<{
  select: [character: CompositeCharacter, actorName: string, actorId: string]
  close: []
}>()

const projectStore = useProjectStore()
const characterStore = useCompositeCharacterStore()

const selectedActorId = ref<string | null>(null)
const searchKeyword = ref('')

/** 按搜索关键词过滤演员列表 */
const filteredActors = computed(() => {
  const actors = projectStore.actors
  if (!searchKeyword.value.trim()) return actors

  const kw = searchKeyword.value.toLowerCase()
  return actors.filter(a => a.name.toLowerCase().includes(kw))
})

/** 获取关联人物的缩略图 */
function getCharacterThumbnail(characterId: string): string | undefined {
  if (!characterId) return undefined
  const char = characterStore.getCharacter(characterId)
  return char?._runtimeThumbnailUrl
}

/** 获取关联人物的名称 */
function getCharacterName(characterId: string): string | undefined {
  if (!characterId) return undefined
  const char = characterStore.getCharacter(characterId)
  return char?.name
}

/** 获取音色名称 */
function getVoiceLabel(voiceId: string | number | undefined): string {
  return getVoiceName(voiceId)
}

function handleImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none'
}

/** 确认选择：反查 CompositeCharacter 并 emit */
function handleConfirm(): void {
  if (!selectedActorId.value) return
  const actor = projectStore.actors.find(a => a.id === selectedActorId.value)
  if (!actor) return
  const char = characterStore.getCharacter(actor.characterId)
  if (!char) return
  emit('select', char, actor.name, actor.id)
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

.content-toolbar {
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  max-width: 320px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
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

.meta-character {
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
