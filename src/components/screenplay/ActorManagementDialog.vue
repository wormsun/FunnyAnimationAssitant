<template>
  <div
    class="actor-management-overlay"
    @click.self="$emit('close')"
  >
    <div class="actor-management-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          演员管理
        </h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Tab 切换栏 -->
      <div class="tab-bar">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'actors' }"
          @click="activeTab = 'actors'"
        >
          📋 已选演员
          <span
            v-if="actors.length > 0"
            class="tab-badge"
          >{{ actors.length }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'library' }"
          @click="activeTab = 'library'"
        >
          👥 人物库
          <span
            v-if="characterStore.characters.length > 0"
            class="tab-badge"
          >{{ characterStore.characters.length }}</span>
        </button>
      </div>

      <!-- Tab 内容区 -->
      <div class="dialog-body">
        <!-- ===== 已选演员 Tab ===== -->
        <template v-if="activeTab === 'actors'">
          <div
            v-if="actors.length === 0"
            class="empty-state"
          >
            <p>📭 暂无演员</p>
            <p class="hint">
              切换到「人物库」标签页，从人物库中添加演员
            </p>
          </div>

          <div
            v-else
            class="card-grid"
          >
            <div
              v-for="actor in actors"
              :key="actor.id"
              class="actor-card"
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
                  👤
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
                  <span class="meta-voice">🎤 {{ getVoiceName(actor.voice?.voiceId) }}</span>
                </div>
              </div>
              <!-- Hover 操作 -->
              <div class="card-actions">
                <button
                  class="btn-card-action preview"
                  :disabled="isPlayingVoice"
                  :title="isPlayingVoice && playingVoiceId === getActorVoiceId(actor) ? '播放中...' : '试听配音'"
                  @click.stop="playActorVoicePreview(actor)"
                >
                  {{ isPlayingVoice && playingVoiceId === getActorVoiceId(actor) ? '▶️' : '🔊' }}
                </button>
                <button
                  class="btn-card-action edit"
                  title="编辑"
                  @click.stop="handleEditActor(actor)"
                >
                  ✏️
                </button>
                <button
                  class="btn-card-action delete"
                  title="删除"
                  @click.stop="handleDeleteActor(actor.id)"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- ===== 人物库 Tab（侧边栏 + 内容区） ===== -->
        <template v-if="activeTab === 'library'">
          <div class="library-layout">
            <!-- 左侧筛选栏：仅标签 -->
            <div class="filter-sidebar">
              <div class="filter-group">
                <h4>标签</h4>
                <div class="filter-list">
                  <button
                    class="filter-btn"
                    :class="{ active: selectedTags.size === 0 }"
                    @click="selectedTags = new Set()"
                  >
                    全部
                  </button>
                  <button
                    v-for="tag in allTags"
                    :key="tag"
                    class="filter-btn"
                    :class="{ active: selectedTags.has(tag) }"
                    @click="toggleTag(tag)"
                  >
                    {{ tag }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 右侧内容区 -->
            <div class="library-main">
              <!-- 工具栏：性别 tabs + 搜索框 -->
              <div class="library-toolbar">
                <div class="gender-tabs">
                  <button
                    v-for="opt in genderOptions"
                    :key="opt.value"
                    class="gender-tab"
                    :class="{ active: currentGender === opt.value }"
                    @click="currentGender = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
                <input
                  v-model="searchKeyword"
                  type="text"
                  class="search-input"
                  placeholder="搜索人物..."
                >
              </div>

              <!-- 卡片网格 -->
              <div class="library-body">
                <div
                  v-if="filteredCharacters.length === 0"
                  class="empty-state"
                >
                  <p>📭 暂无可用人物</p>
                  <p class="hint">
                    请先在「人物管理」中创建人物
                  </p>
                </div>

                <div
                  v-else
                  class="card-grid"
                >
                  <div
                    v-for="char in filteredCharacters"
                    :key="char.id"
                    class="character-card"
                    :class="{
                      added: addedCharacterIds.has(char.id),
                      clickable: !addedCharacterIds.has(char.id),
                    }"
                    @click="!addedCharacterIds.has(char.id) && handleAddFromLibrary(char.id)"
                  >
                    <div class="card-preview">
                      <img
                        v-if="char._runtimeThumbnailUrl"
                        :src="char._runtimeThumbnailUrl"
                        :alt="char.name"
                        @error="handleImageError"
                      >
                      <div
                        v-else
                        class="no-preview"
                      >
                        👤
                      </div>
                      <!-- 性别角标 -->
                      <div class="gender-badge">
                        {{ getGenderIcon(char.gender) }}
                      </div>
                    </div>
                    <div class="card-info">
                      <div
                        class="card-name"
                        :title="char.name"
                      >
                        {{ char.name }}
                      </div>
                      <div class="card-status">
                        <span
                          v-if="addedCharacterIds.has(char.id)"
                          class="status-added"
                        >✅ 已添加</span>
                        <span
                          v-else
                          class="status-add"
                        >➕ 添加为演员</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="dialog-footer">
        <div class="footer-right">
          <button
            class="btn-confirm"
            @click="handleConfirm"
          >
            确定
          </button>
        </div>
      </div>

      <!-- 编辑演员面板 (overlay) -->
      <div
        v-if="editingActor"
        class="edit-actor-overlay"
        @click.self="editingActor = null"
      >
        <div class="edit-actor-panel">
          <div class="edit-panel-header">
            <h4>{{ isNewActor ? '添加演员' : '编辑演员' }}</h4>
          </div>

          <div class="edit-panel-body">
            <!-- 关联人物信息（只读） -->
            <div
              v-if="editingCharacterInfo"
              class="form-group readonly-info"
            >
              <div class="linked-character">
                <img
                  v-if="editingCharacterInfo.thumbnail"
                  :src="editingCharacterInfo.thumbnail"
                  class="linked-thumb"
                  @error="handleImageError"
                >
                <div
                  v-else
                  class="linked-thumb-fallback"
                >
                  👤
                </div>
                <div class="linked-details">
                  <span class="linked-label">关联人物</span>
                  <span class="linked-name">{{ editingCharacterInfo.name }}</span>
                </div>
              </div>
            </div>

            <!-- 演员名称 -->
            <div class="form-group">
              <label>演员名称</label>
              <input
                v-model="editForm.name"
                type="text"
                placeholder="输入演员名称"
              >
            </div>

            <!-- 语速 -->
            <div class="form-group compact-form-group">
              <label>语速</label>
              <div class="speed-selector">
                <select v-model.number="editForm.speed">
                  <option
                    v-for="opt in speedOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }} ({{ opt.description }})
                  </option>
                </select>
              </div>
            </div>

            <!-- 音量 -->
            <div class="form-group compact-form-group">
              <label>播放音量 {{ editForm.volume }}</label>
              <div class="volume-control">
                <input
                  v-model.number="editForm.volume"
                  class="volume-range"
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                >
                <input
                  v-model.number="editForm.volume"
                  class="volume-number"
                  type="number"
                  min="-10"
                  max="10"
                  step="1"
                  @blur="normalizeEditVolume"
                  @change="normalizeEditVolume"
                >
              </div>
            </div>

            <!-- 配音音色 -->
            <div class="form-group">
              <label>配音音色</label>
              <VoiceSelectorPanel
                v-model="editForm.voiceId"
                :initial-voice-id="initialVoiceId"
                :is-playing="isPlayingVoice"
                :playing-voice-id="playingVoiceId"
                @preview="playVoicePreview"
              />
            </div>
          </div>

          <div class="edit-panel-footer">
            <button
              class="btn-cancel"
              @click="editingActor = null"
            >
              取消
            </button>
            <button
              class="btn-confirm"
              @click="handleSaveActor"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      <!-- 删除确认对话框 -->
      <ConfirmDialog
        v-if="showDeleteConfirm"
        title="删除演员"
        message="确定要删除该演员吗？"
        :is-danger="true"
        @confirm="confirmDeleteActor"
        @cancel="showDeleteConfirm = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { DEFAULT_SPEED, DEFAULT_VOICE_ID, DEFAULT_VOLUME, getPlaybackVolumeGain, getSpeedOptions, getValidSpeedValue, getValidVolumeValue, getVoiceEngine, getVoiceName as getVoiceNameFromLib } from '@/constants/voiceOptions'
import { useCompositeCharacterStore } from '@/stores/compositeCharacterStore'
import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { Gender } from '@/types/project'
import type { ActorConfig } from '@/types/screenplay'
import { ttsClient } from '@/utils/ttsClient'
import { type AudioInstance, audioKit } from '@/utils/WebAudioKit'

import VoiceSelectorPanel from './VoiceSelectorPanel.vue'

const props = defineProps<{
  actors: ActorConfig[]
}>()

const emit = defineEmits<{
  close: []
  addActor: [actor: ActorConfig]
  updateActor: [id: string, actor: ActorConfig]
  deleteActor: [id: string]
}>()

const characterStore = useCompositeCharacterStore()

// ===== Tab 状态 =====
const activeTab = ref<'actors' | 'library'>('actors')

// ===== 人物库筛选状态 =====
const currentGender = ref<Gender | 'all'>('all')
const searchKeyword = ref('')
const selectedTags = ref<Set<string>>(new Set())

/** 从所有人物中动态收集去重的标签列表 */
const allTags = computed(() => {
  const tagSet = new Set<string>()
  for (const c of characterStore.characters) {
    if (c.tags) {
      for (const tag of c.tags) tagSet.add(tag)
    }
  }
  return [...tagSet].sort()
})

function toggleTag(tag: string): void {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) {
    next.delete(tag)
  } else {
    next.add(tag)
  }
  selectedTags.value = next
}

const genderOptions: { label: string; value: Gender | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '♂ 男', value: 'male' },
  { label: '♀ 女', value: 'female' },
  { label: '⚧ 其他', value: 'other' },
]

const filteredCharacters = computed(() => {
  let list: CompositeCharacter[] = characterStore.characters

  // 1. 标签筛选
  if (selectedTags.value.size > 0) {
    list = list.filter(c =>
      c.tags && [...selectedTags.value].every(tag => c.tags?.includes(tag))
    )
  }

  // 2. 性别筛选
  if (currentGender.value !== 'all') {
    list = list.filter(c => c.gender === currentGender.value)
  }

  // 3. 关键词搜索
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(kw))
  }

  // 4. 按创建时间倒序
  return [...list].sort((a, b) => b.createdAt - a.createdAt)
})

// ===== 已添加的人物ID集合（用于去重） =====
const addedCharacterIds = computed(() => {
  const ids = new Set<string>()
  for (const actor of props.actors) {
    if (actor.characterId) {
      ids.add(actor.characterId)
    }
  }
  return ids
})

// ===== 编辑状态 =====
const editingActor = ref<boolean | null>(false)
const isNewActor = ref<boolean>(false)
const isPlayingVoice = ref(false)
let currentAudio: AudioInstance | null = null
let currentPreviewTimer: number | null = null
const originalId = ref<string>('')
const editingCharacterId = ref<string>('')

const editForm = ref<{ name: string; voiceId: number; speed: number; volume: number }>({
  name: '',
  voiceId: DEFAULT_VOICE_ID.female,
  speed: DEFAULT_SPEED,
  volume: DEFAULT_VOLUME,
})
const initialVoiceId = ref<number>(DEFAULT_VOICE_ID.female)

const speedOptions = getSpeedOptions()

// ===== 关联人物信息（编辑面板显示） =====
const editingCharacterInfo = computed(() => {
  if (!editingCharacterId.value) return null
  const char = characterStore.getCharacter(editingCharacterId.value)
  if (!char) return null
  return {
    name: char.name,
    thumbnail: char._runtimeThumbnailUrl,
  }
})

// ===== 工具函数 =====
function getVoiceName(voiceId: string | number | undefined): string {
  return getVoiceNameFromLib(voiceId)
}

function getGenderIcon(gender: Gender): string {
  switch (gender) {
    case 'male': return '♂'
    case 'female': return '♀'
    case 'other': return '⚧'
  }
}

function getCharacterThumbnail(characterId: string): string | undefined {
  if (!characterId) return undefined
  const char = characterStore.getCharacter(characterId)
  return char?._runtimeThumbnailUrl
}

function getActorVoiceId(actor: ActorConfig): number {
  const voiceId = actor.voice?.voiceId ? parseInt(String(actor.voice.voiceId), 10) : NaN
  return Number.isFinite(voiceId) ? voiceId : DEFAULT_VOICE_ID.female
}

function getActorSpeed(actor: ActorConfig): number {
  return getValidSpeedValue(actor.voice?.speed)
}

function getActorVolume(actor: ActorConfig): number {
  return getValidVolumeValue(actor.voice?.volume)
}

function handleImageError(e: Event): void {
  (e.target as HTMLImageElement).style.display = 'none'
}

// ===== 从人物库添加演员 =====
function handleAddFromLibrary(characterId: string): void {
  const char = characterStore.getCharacter(characterId)
  if (!char) return

  editingCharacterId.value = characterId
  const voiceId = char.gender === 'male' ? DEFAULT_VOICE_ID.male : DEFAULT_VOICE_ID.female
  editForm.value = {
    name: char.name,
    voiceId,
    speed: DEFAULT_SPEED,
    volume: DEFAULT_VOLUME,
  }
  initialVoiceId.value = voiceId

  isNewActor.value = true
  editingActor.value = true
}

// ===== 编辑已有演员 =====
function handleEditActor(actor: ActorConfig): void {
  originalId.value = actor.id
  editingCharacterId.value = actor.characterId

  editForm.value = {
    name: actor.name,
    voiceId: actor.voice?.voiceId ? parseInt(String(actor.voice.voiceId)) : DEFAULT_VOICE_ID.female,
    speed: getValidSpeedValue(actor.voice?.speed),
    volume: getValidVolumeValue(actor.voice?.volume),
  }
  initialVoiceId.value = editForm.value.voiceId

  isNewActor.value = false
  editingActor.value = true
}

// ===== 保存演员 =====
function normalizeEditVolume(): void {
  editForm.value.volume = getValidVolumeValue(editForm.value.volume)
}

function handleSaveActor(): void {
  if (!editForm.value.name.trim()) {
    alert('请输入演员名称')
    return
  }

  const actorId = isNewActor.value
    ? `actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    : originalId.value

  const actor: ActorConfig = {
    id: actorId,
    characterId: editingCharacterId.value,
    name: editForm.value.name,
    voice: {
      voiceId: String(editForm.value.voiceId),
      speed: editForm.value.speed,
      volume: getValidVolumeValue(editForm.value.volume),
    },
  }

  if (isNewActor.value) {
    emit('addActor', actor)
  } else {
    emit('updateActor', originalId.value, actor)
  }

  editingActor.value = false
}

// ===== 删除演员 =====
const showDeleteConfirm = ref(false)
const pendingDeleteId = ref('')

function handleDeleteActor(id: string): void {
  pendingDeleteId.value = id
  showDeleteConfirm.value = true
}

function confirmDeleteActor(): void {
  emit('deleteActor', pendingDeleteId.value)
  showDeleteConfirm.value = false
  pendingDeleteId.value = ''
}

// ===== 试听 =====
const playingVoiceId = ref<number | undefined>(undefined)

function playActorVoicePreview(actor: ActorConfig): void {
  void playVoicePreview(getActorVoiceId(actor), getActorSpeed(actor), getActorVolume(actor))
}

async function playVoicePreview(voiceId?: number, speed?: number, volume?: number): Promise<void> {
  if (isPlayingVoice.value) return

  const targetVoiceId = voiceId ?? editForm.value.voiceId
  const targetSpeed = speed ?? editForm.value.speed
  const targetVolume = volume ?? editForm.value.volume

  try {
    isPlayingVoice.value = true
    playingVoiceId.value = targetVoiceId

    if (currentAudio) {
      currentAudio.stop()
      currentAudio = null
    }
    if (currentPreviewTimer !== null) {
      window.clearTimeout(currentPreviewTimer)
      currentPreviewTimer = null
    }

    const result = await ttsClient.preview({
      text: '你好,很高兴认识你。',
      engine: getVoiceEngine(targetVoiceId),
      voiceType: targetVoiceId,
      volume: DEFAULT_VOLUME,
      speed: targetSpeed,
    })

    await audioKit.init()
    await audioKit.load(result.audio)
    currentAudio = await audioKit.play(result.audio, {
      volume: getPlaybackVolumeGain(targetVolume),
      loop: false,
    })

    const previewDuration = result.duration ?? 2500
    currentPreviewTimer = window.setTimeout(() => {
      isPlayingVoice.value = false
      playingVoiceId.value = undefined
      currentAudio = null
      currentPreviewTimer = null
    }, previewDuration + 150)
  } catch (error) {
    console.error('[ActorManagementDialogV2] 配音试听失败:', error)
    isPlayingVoice.value = false
    playingVoiceId.value = undefined
    if (currentPreviewTimer !== null) {
      window.clearTimeout(currentPreviewTimer)
      currentPreviewTimer = null
    }
    alert(`配音试听失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

function handleConfirm(): void {
  emit('close')
}
</script>

<style scoped>
.actor-management-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.actor-management-dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 1060px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
}

/* ===== Header ===== */
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  cursor: pointer;
  font-size: 18px;
  color: #6b7280;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e5e7eb;
  color: #1f2937;
}

/* ===== Tab Bar ===== */
.tab-bar {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid #e5e7eb;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn:hover {
  color: #374151;
}

.tab-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.tab-badge {
  background: #e5e7eb;
  color: #6b7280;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.tab-btn.active .tab-badge {
  background: #dbeafe;
  color: #3b82f6;
}

/* ===== 人物库 Tab 双栏布局 ===== */
.library-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.filter-sidebar {
  width: 160px;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  padding: 14px;
  overflow-y: auto;
  flex-shrink: 0;
}

.filter-group h4 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-btn {
  text-align: left;
  padding: 7px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-btn:hover {
  background: #e5e7eb;
}

.filter-btn.active {
  background: #e0e7ff;
  color: #4f46e5;
  font-weight: 500;
}

.library-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.library-toolbar {
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.gender-tabs {
  display: flex;
  background: #f3f4f6;
  padding: 3px;
  border-radius: 8px;
  flex-shrink: 0;
}

.gender-tab {
  padding: 5px 14px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.gender-tab:hover {
  color: #374151;
}

.gender-tab.active {
  background: white;
  color: #1f2937;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.search-input {
  width: 200px;
  padding: 7px 12px;
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

.library-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* ===== Body ===== */
.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
}

.empty-state p {
  margin: 4px 0;
}

.hint {
  font-size: 13px;
  color: #9ca3af;
}

/* ===== Card Grid ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

/* ===== 已选演员卡片 ===== */
.actor-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  transition: all 0.2s;
}

.actor-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.actor-card:hover .card-actions {
  opacity: 1;
}

/* ===== 人物库卡片 ===== */
.character-card {
  background: #f9fafb;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.character-card.clickable {
  cursor: pointer;
}

.character-card.clickable:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.character-card.added {
  opacity: 0.6;
  cursor: default;
}

/* ===== Card Preview ===== */
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

.gender-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* ===== Card Info ===== */
.card-info {
  padding: 10px;
}

.card-name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.card-meta {
  font-size: 11px;
  color: #6b7280;
}

.meta-voice {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.card-status {
  margin-top: 2px;
}

.status-added {
  font-size: 12px;
  color: #059669;
  font-weight: 500;
}

.status-add {
  font-size: 12px;
  color: #3b82f6;
  font-weight: 500;
}

/* ===== Card Actions (Hover) ===== */
.card-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.btn-card-action {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: background 0.2s;
}

.btn-card-action:hover {
  background: white;
}

.btn-card-action.preview:hover:not(:disabled) {
  background: #dbeafe;
}

.btn-card-action.delete:hover {
  background: #fee2e2;
}

.btn-card-action:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

/* ===== Footer ===== */
.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.footer-right {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 20px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f9fafb;
}

.btn-confirm {
  padding: 10px 20px;
  background: #3b82f6;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-confirm:hover {
  background: #2563eb;
}

/* ===== Edit Actor Panel (Overlay) ===== */
.edit-actor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.edit-actor-panel {
  background: white;
  border-radius: 12px;
  width: 720px;
  max-width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-panel-header {
  padding: 20px 24px 12px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.edit-panel-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.edit-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.edit-panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 20px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.form-group {
  margin-bottom: 16px;
}

.compact-form-group {
  margin-bottom: 12px;
}

.form-group.readonly-info {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.linked-character {
  display: flex;
  align-items: center;
  gap: 12px;
}

.linked-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: contain;
  background: #f3f4f6;
}

.linked-thumb-fallback {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0.4;
}

.linked-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.linked-label {
  font-size: 11px;
  color: #9ca3af;
}

.linked-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select {
  width: 100%;
  padding: 8px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus,
.form-group select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.volume-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px;
  align-items: center;
  gap: 10px;
}

.volume-range {
  width: 100%;
}

.volume-number {
  text-align: center;
}

.voice-selector,
.speed-selector {
  display: flex;
  gap: 8px;
}

.voice-selector select,
.speed-selector select {
  flex: 1;
}

.btn-preview-voice {
  padding: 8px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.btn-preview-voice:hover:not(:disabled) {
  background: #f9fafb;
}

.btn-preview-voice:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}


</style>
