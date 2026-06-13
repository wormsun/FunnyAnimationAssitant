<template>
  <div
    class="narrator-config-overlay"
    @click.self="$emit('close')"
  >
    <div class="narrator-config-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          旁白配置
        </h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 语速设置 -->
        <div class="form-group compact-form-group">
          <label class="form-label">语速</label>
          <div class="speed-selector">
            <select v-model.number="formData.speed" class="form-select">
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
          <label class="form-label">播放音量 {{ formData.volume }}</label>
          <div class="volume-control">
            <input
              v-model.number="formData.volume"
              class="volume-range"
              type="range"
              min="-10"
              max="10"
              step="1"
            >
            <input
              v-model.number="formData.volume"
              class="volume-number"
              type="number"
              min="-10"
              max="10"
              step="1"
              @blur="normalizeVolume"
              @change="normalizeVolume"
            >
          </div>
        </div>

        <!-- 配音音色 -->
        <div class="form-group">
          <label class="form-label">配音音色</label>
          <VoiceSelectorPanel
            v-model="formData.voiceId"
            :initial-voice-id="initialVoiceId"
            :is-playing="isPlayingVoice"
            :playing-voice-id="playingVoiceId"
            @preview="playVoicePreview"
          />
        </div>
      </div>

      <div class="dialog-footer">
        <button
          class="btn-cancel"
          @click="$emit('close')"
        >
          取消
        </button>
        <button
          class="btn-save"
          @click="handleSave"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { DEFAULT_SPEED, DEFAULT_VOICE_ID, DEFAULT_VOLUME, getPlaybackVolumeGain, getSpeedOptions, getValidSpeedValue, getValidVolumeValue, getVoiceEngine } from '@/constants/voiceOptions'
import type { NarratorConfig } from '@/types/screenplay'
import { ttsClient } from '@/utils/ttsClient'
import { type AudioInstance, audioKit } from '@/utils/WebAudioKit'

import VoiceSelectorPanel from './VoiceSelectorPanel.vue'

const speedOptions = getSpeedOptions()

const props = defineProps<{
  narrator?: NarratorConfig
}>()

const emit = defineEmits<{
  close: []
  save: [narrator: NarratorConfig]
}>()

const formData = ref<{ voiceId: number; speed: number; volume: number }>({
  voiceId: DEFAULT_VOICE_ID.female,
  speed: DEFAULT_SPEED,
  volume: DEFAULT_VOLUME
})

const isPlayingVoice = ref(false)
const playingVoiceId = ref<number | undefined>(undefined)
const initialVoiceId = ref<number>(DEFAULT_VOICE_ID.female)
let currentAudio: AudioInstance | null = null
let currentPreviewTimer: number | null = null

onMounted(() => {
  if (props.narrator?.voice) {
    const voiceId = props.narrator.voice.voiceId ? parseInt(String(props.narrator.voice.voiceId)) : DEFAULT_VOICE_ID.female
    formData.value.voiceId = voiceId
    initialVoiceId.value = voiceId
    // 智能处理旧版语速格式
    formData.value.speed = getValidSpeedValue(props.narrator.voice.speed)
    formData.value.volume = getValidVolumeValue(props.narrator.voice.volume)
  }
})

async function playVoicePreview(voiceId?: number) {
  if (isPlayingVoice.value) return
  
  const targetVoiceId = voiceId ?? formData.value.voiceId
  
  try {
    isPlayingVoice.value = true
    playingVoiceId.value = targetVoiceId
    
    // 停止之前的音频
    if (currentAudio) {
      currentAudio.stop()
      currentAudio = null
    }
    if (currentPreviewTimer !== null) {
      window.clearTimeout(currentPreviewTimer)
      currentPreviewTimer = null
    }
    
    // 调用 TTS API 生成默认音量语音，本地播放时再应用增益
    const result = await ttsClient.preview({
      text: '你好,很高兴认识你。',
      engine: getVoiceEngine(targetVoiceId),
      voiceType: targetVoiceId,
      volume: DEFAULT_VOLUME,
      speed: formData.value.speed
    })
    
    await audioKit.init()
    await audioKit.load(result.audio)
    currentAudio = await audioKit.play(result.audio, {
      volume: getPlaybackVolumeGain(formData.value.volume),
      loop: false
    })

    const previewDuration = result.duration ?? 2500
    currentPreviewTimer = window.setTimeout(() => {
      isPlayingVoice.value = false
      playingVoiceId.value = undefined
      currentAudio = null
      currentPreviewTimer = null
    }, previewDuration + 150)
    
  } catch (error) {
    console.error('[NarratorConfigDialog] 配音试听失败:', error)
    isPlayingVoice.value = false
    playingVoiceId.value = undefined
    if (currentPreviewTimer !== null) {
      window.clearTimeout(currentPreviewTimer)
      currentPreviewTimer = null
    }
    alert(`配音试听失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

function normalizeVolume() {
  formData.value.volume = getValidVolumeValue(formData.value.volume)
}

function handleSave() {
  const narrator: NarratorConfig = {
    voice: {
      voiceId: String(formData.value.voiceId),
      speed: formData.value.speed,
      volume: getValidVolumeValue(formData.value.volume)
    }
  }
  
  emit('save', narrator)
}
</script>

<style scoped>
.narrator-config-overlay {
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

.narrator-config-dialog {
  width: 90%;
  max-width: 720px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: #f3f4f6;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e5e7eb;
  color: #1f2937;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.form-group {
  margin-bottom: 24px;
}

.compact-form-group .speed-selector,
.compact-form-group .form-select {
  width: 100%;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
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
  padding: 10px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
}

.volume-number:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.voice-selector {
  display: flex;
  gap: 12px;
}

.form-select {
  flex: 1;
  padding: 10px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
  transition: all 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-select option {
  background: white;
  color: #1f2937;
}

.btn-preview-voice {
  padding: 10px 16px;
  background: #3b82f6;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-preview-voice:hover:not(:disabled) {
  background: #2563eb;
}

.btn-preview-voice:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.range-slider {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-label {
  font-size: 12px;
  color: #6b7280;
  min-width: 35px;
  text-align: center;
}

.form-range {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.form-range::-webkit-slider-thumb:hover {
  background: #2563eb;
  transform: scale(1.1);
}

.form-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.form-range::-moz-range-thumb:hover {
  background: #2563eb;
  transform: scale(1.1);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e5e7eb;
}

.btn-cancel,
.btn-save {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: white;
  color: #6b7280;
  border: 1px solid #d1d5db;
}

.btn-cancel:hover {
  background: #f9fafb;
}

.btn-save {
  background: #3b82f6;
  color: white;
  border: 1px solid #3b82f6;
}

.btn-save:hover {
  background: #2563eb;
}
</style>
