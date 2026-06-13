<template>
  <div class="voice-selector-panel">
    <!-- 当前音色摘要 -->
    <div class="current-voice-bar">
      <div class="current-voice-info">
        <span class="current-label">当前音色</span>
        <span class="current-voice-name">
          {{ currentVoiceInfo?.gender === 'female' ? '♀' : '♂' }}
          {{ currentVoiceInfo?.name ?? '未设置' }}
        </span>
        <span
          v-if="currentVoiceInfo"
          class="current-voice-desc"
        >{{ currentVoiceInfo.description }}</span>
      </div>
      <div
        v-if="hasChanged"
        class="change-indicator"
      >
        <span class="change-arrow">→</span>
        <span class="new-voice-name">
          {{ selectedVoiceInfo?.gender === 'female' ? '♀' : '♂' }}
          {{ selectedVoiceInfo?.name ?? '未知' }}
        </span>
        <span class="change-hint">保存后生效</span>
      </div>
      <button
        class="btn-current-preview"
        :class="{ 'is-playing': isPlaying && modelValue === playingVoiceId }"
        :disabled="isPlaying"
        :title="isPlaying && modelValue === playingVoiceId ? '播放中...' : '试听当前选中音色'"
        @click="$emit('preview', modelValue)"
      >
        <span class="preview-icon">{{ isPlaying && modelValue === playingVoiceId ? '▶️' : '🔊' }}</span>
        <span class="preview-label">{{ isPlaying && modelValue === playingVoiceId ? '播放中' : '试听' }}</span>
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input
        v-model="searchKeyword"
        type="text"
        class="search-input"
        placeholder="搜索音色名称或描述..."
      >
    </div>

    <!-- 性别 Tab -->
    <div class="gender-tabs">
      <button
        v-for="tab in genderTabs"
        :key="tab.value"
        class="gender-tab"
        :class="{ active: currentGender === tab.value }"
        @click="currentGender = tab.value"
      >
        {{ tab.label }}
        <span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- 卡片网格 -->
    <div
      class="voice-grid-container"
    >
      <div
        v-if="filteredVoices.length === 0"
        class="empty-state"
      >
        <p>未找到匹配的音色</p>
      </div>
      <div
        v-else
        class="voice-grid"
      >
        <div
          v-for="voice in filteredVoices"
          :key="`${voice.engine}_${voice.id}`"
          class="voice-card"
          :class="{
            selected: voice.id === modelValue && voice.engine === selectedEngine,
            playing: voice.id === playingVoiceId,
          }"
          :data-voice-id="voice.id"
          @click="selectVoice(voice)"
        >
          <!-- 选中角标 -->
          <div
            v-if="voice.id === modelValue && voice.engine === selectedEngine"
            class="selected-badge"
          >
            ✓
          </div>

          <!-- 性别图标 + 名称 -->
          <div class="voice-header">
            <span class="gender-icon">{{ voice.gender === 'female' ? '♀' : '♂' }}</span>
            <span class="voice-name">{{ voice.name }}</span>
          </div>

          <!-- 描述与成本档位 -->
          <div class="voice-meta">
            <span class="voice-desc">{{ voice.description }}</span>
            <span
              class="voice-price"
              title="可选 TTS Provider 的成本提示，不代表开源版内置计费或默认云服务"
            >
              {{ getVoiceCostTierLabel(voice) }}
            </span>
          </div>

          <!-- 试听按钮 -->
          <button
            class="btn-preview"
            :class="{ 'is-playing': isPlaying && voice.id === playingVoiceId }"
            :disabled="isPlaying && voice.id === playingVoiceId"
            :title="isPlaying && voice.id === playingVoiceId ? '播放中...' : '试听'"
            @click.stop="$emit('preview', voice.id)"
          >
            {{ isPlaying && voice.id === playingVoiceId ? '▶️' : '🔊' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { getVoiceCostTierLabel, getVoiceEngine, getVoiceOptions,type VoiceOption } from '@/constants/voiceOptions'

const props = defineProps<{
  /** 当前选中的音色 ID（实时跟踪用户选择） */
  modelValue: number
  /** 初始保存的音色 ID（打开对话框时的值） */
  initialVoiceId?: number | undefined
  /** 是否正在试听 */
  isPlaying?: boolean
  /** 正在试听的音色 ID */
  playingVoiceId?: number | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [id: number]
  'preview': [voiceId: number]
}>()

// ===== 状态 =====
const searchKeyword = ref('')
const currentGender = ref<'all' | 'female' | 'male'>('all')


// ===== 计算当前选中音色的引擎 =====
const selectedEngine = computed(() => getVoiceEngine(props.modelValue))

// ===== 所有音色 =====
const allVoices = getVoiceOptions()

// ===== 当前保存的音色信息 =====
const savedVoiceId = computed(() => props.initialVoiceId ?? props.modelValue)

const currentVoiceInfo = computed(() =>
  allVoices.find(v => v.id === savedVoiceId.value)
)

// ===== 用户新选的音色信息 =====
const selectedVoiceInfo = computed(() =>
  allVoices.find(v => v.id === props.modelValue)
)

// ===== 是否有变更 =====
const hasChanged = computed(() =>
  props.initialVoiceId !== undefined && props.modelValue !== props.initialVoiceId
)

// ===== 筛选 =====
const filteredVoices = computed(() => {
  let list: VoiceOption[] = allVoices

  // 性别筛选
  if (currentGender.value !== 'all') {
    list = list.filter(v => v.gender === currentGender.value)
  }

  // 关键词搜索
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(v =>
      v.name.toLowerCase().includes(kw) ||
      v.description.toLowerCase().includes(kw)
    )
  }

  return list
})

// ===== 性别 Tab 计数 =====
const genderTabs = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const baseList = kw
    ? allVoices.filter(v => v.name.toLowerCase().includes(kw) || v.description.toLowerCase().includes(kw))
    : allVoices

  return [
    { label: '全部', value: 'all' as const, count: baseList.length },
    { label: '♀ 女声', value: 'female' as const, count: baseList.filter(v => v.gender === 'female').length },
    { label: '♂ 男声', value: 'male' as const, count: baseList.filter(v => v.gender === 'male').length },
  ]
})

// ===== 选中音色 =====
function selectVoice(voice: VoiceOption): void {
  emit('update:modelValue', voice.id)
}
</script>

<style scoped>
/* ===== 当前音色摘要栏 ===== */
.current-voice-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #f0f4ff, #e8ecf8);
  border: 1px solid #c7d2fe;
  border-radius: 10px;
}

.current-voice-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.current-label {
  font-size: 11px;
  color: #6366f1;
  font-weight: 600;
  white-space: nowrap;
  padding: 2px 6px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 4px;
}

.current-voice-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e1b4b;
  white-space: nowrap;
}

.current-voice-desc {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.change-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  animation: fadeIn 0.3s;
}

.btn-current-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 72px;
  padding: 6px 10px;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  background: white;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.btn-current-preview:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #60a5fa;
}

.btn-current-preview.is-playing {
  color: #92400e;
  border-color: #f59e0b;
  background: #fffbeb;
}

.btn-current-preview:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.preview-icon,
.preview-label {
  line-height: 1;
}

.change-arrow {
  color: #f59e0b;
  font-weight: 700;
  font-size: 14px;
}

.new-voice-name {
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  white-space: nowrap;
}

.change-hint {
  font-size: 10px;
  color: #d97706;
  white-space: nowrap;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

.voice-selector-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 搜索框 ===== */
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: border-color 0.2s;
}

.search-bar:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.search-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #1f2937;
  outline: none;
}

.search-input::placeholder {
  color: #9ca3af;
}

/* ===== 性别 Tab ===== */
.gender-tabs {
  display: flex;
  gap: 4px;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 3px;
}

.gender-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.gender-tab:hover {
  color: #374151;
  background: rgba(255, 255, 255, 0.5);
}

.gender-tab.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-count {
  font-size: 11px;
  color: #9ca3af;
}

.gender-tab.active .tab-count {
  color: #93c5fd;
}

/* ===== 卡片网格容器 ===== */
.voice-grid-container {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  position: relative;
}

.voice-grid-container::-webkit-scrollbar {
  width: 6px;
}

.voice-grid-container::-webkit-scrollbar-track {
  background: transparent;
}

.voice-grid-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.voice-grid-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

.voice-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

/* ===== 音色卡片 ===== */
.voice-card {
  position: relative;
  padding: 10px;
  background: #fafbfc;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.voice-card:hover {
  background: #f0f4ff;
  border-color: #c7d2fe;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
}

.voice-card.selected {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

.voice-card.playing {
  border-color: #f59e0b;
  background: #fffbeb;
}

/* 选中角标 */
.selected-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(59, 130, 246, 0.4);
}

/* 性别图标 + 名称 */
.voice-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.gender-icon {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

.voice-card .gender-icon {
  color: #6b7280;
}

.voice-card:hover .gender-icon,
.voice-card.selected .gender-icon {
  color: #3b82f6;
}

.voice-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 描述与成本档位 */
.voice-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.voice-desc {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.voice-price {
  flex-shrink: 0;
  padding: 2px 5px;
  border-radius: 999px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #c2410c;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

/* 试听按钮 */
.btn-preview {
  align-self: flex-start;
  padding: 2px 6px;
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  opacity: 0;
}

.voice-card:hover .btn-preview {
  opacity: 1;
}

.btn-preview:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
}

.btn-preview.is-playing {
  opacity: 1;
  animation: pulse 1.5s infinite;
}

.btn-preview:disabled {
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== 空状态 ===== */
.empty-state {
  text-align: center;
  padding: 30px 20px;
  color: #9ca3af;
  font-size: 13px;
}
</style>
