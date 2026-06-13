<template>
  <div
    v-if="visible"
    class="modal-overlay"
    @click="handleOverlayClick"
  >
    <div
      class="modal-content"
      @click.stop
    >
      <!-- Header -->
      <div class="modal-header">
        <h3>{{ isNew ? '新建音效' : '编辑音效' }}</h3>
        <button
          class="close-btn"
          @click="close"
        >
          ×
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Left: Preview Area -->
        <div class="preview-column">
          <div class="preview-wrapper">
            <div class="icon-placeholder">
              <span class="icon">{{ localSound.type === 'bgm' ? '🎵' : '🔊' }}</span>
            </div>
            
            <div class="player-controls">
              <div class="time-info">
                {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
              </div>
              
              <div
                class="progress-bar"
                @click="seek"
              >
                <div
                  class="progress-fill"
                  :style="{ width: progressPercent + '%' }"
                />
              </div>
              
              <div class="control-btns">
                <button
                  class="btn-play"
                  :disabled="!hasAudio"
                  @click="togglePlay"
                >
                  {{ isPlaying ? '⏸️' : '▶️' }}
                </button>
              </div>
            </div>
            
            <div
              v-if="!hasAudio"
              class="empty-hint"
            >
              暂无音频文件
            </div>
          </div>
          
          <div class="upload-btn-container">
            <button
              class="btn-upload"
              @click="triggerUpload"
            >
              📂 选择音频文件...
            </button>
          </div>

          <div
            v-if="displayAssetPath"
            class="asset-path-hint"
            :title="displayAssetPath"
          >
            📂 {{ displayAssetPath }}
          </div>
        </div>

        <!-- Right: Config Area -->
        <div class="config-column">
          <div class="form-section">
            <div class="form-group">
              <label>名称 <span class="required">*</span></label>
              <input 
                v-model="localSound.name" 
                type="text" 
                class="input-field" 
                placeholder="请输入名称"
              >
            </div>

            <div class="form-group">
              <label>类型</label>
              <div class="radio-group">
                <label class="radio-label">
                  <input
                    v-model="importType"
                    type="radio"
                    value="auto"
                    @change="handleTypeChange"
                  >
                  智能区分
                </label>
                <label class="radio-label">
                  <input
                    v-model="importType"
                    type="radio"
                    value="bgm"
                    @change="handleTypeChange"
                  >
                  背景音乐 (BGM)
                </label>
                <label class="radio-label">
                  <input
                    v-model="importType"
                    type="radio"
                    value="sfx"
                    @change="handleTypeChange"
                  >
                  音效 (SFX)
                </label>
              </div>
              <div
                v-if="importType === 'auto'"
                class="type-hint"
              >
                根据音频长度自动区分：>20秒为背景音乐，否则为音效
              </div>
            </div>

            <!-- Tag Management -->
            <div class="form-group">
              <label>标签</label>
              <div class="tags-input-container">
                <div class="tags-list">
                  <span
                    v-for="tag in localSound.tags"
                    :key="tag"
                    class="tag-badge"
                  >
                    {{ tag }}
                    <button
                      class="tag-remove"
                      @click="removeTag(tag)"
                    >×</button>
                  </span>
                </div>
                <input 
                  v-model="tagInput"
                  type="text"
                  class="tag-input"
                  placeholder="输入标签按回车添加..."
                  @keydown.enter.prevent="addTag"
                >
              </div>
              <!-- Recommended Tags -->
              <div
                v-if="recommendedTags.length > 0"
                class="recommended-tags"
              >
                <span 
                  v-for="tag in recommendedTags" 
                  :key="tag" 
                  class="recommend-tag"
                  @click="addTagDirectly(tag)"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <div class="divider" />

          <!-- Default Properties -->
          <div class="form-section">
            <div class="section-title">
              默认属性
            </div>
            
            <div class="form-group">
              <label>默认音量: {{ Math.round((localSound.volume || 1) * 100) }}%</label>
              <input 
                v-model.number="localSound.volume" 
                type="range" 
                min="0"
                max="1"
                step="0.1"
                class="slider"
              >
            </div>
            
            <div class="form-group">
              <label class="checkbox-label">
                <input
                  v-model="localSound.loop"
                  type="checkbox"
                > 默认循环播放
              </label>
            </div>
            
            <div class="form-row">
              <div class="form-group half">
                <label>淡入时长 (秒)</label>
                <input
                  v-model.number="localSound.fadeIn"
                  type="number"
                  min="0"
                  step="0.1"
                  class="input-field"
                >
              </div>
              <div class="form-group half">
                <label>淡出时长 (秒)</label>
                <input
                  v-model.number="localSound.fadeOut"
                  type="number"
                  min="0"
                  step="0.1"
                  class="input-field"
                >
              </div>
            </div>
          </div>
        </div>
      </div>


      <!-- Footer -->
      <div class="modal-footer">
        <button
          class="btn-cancel"
          @click="close"
        >
          取消
        </button>
        <button 
          class="btn-save" 
          :disabled="!isValid"
          @click="save"
        >
          确定
        </button>
      </div>
    </div>

    <!-- Hidden File Inputs -->
    <input
      ref="fileInput"
      type="file"
      accept=".mp3,.wav,.ogg,.aac,.m4a"
      class="hidden"
      @change="handleFileUpload"
    >
    
    <FileBrowserDialog
      v-if="showFileBrowser"
      :title="fileBrowserTitle"
      :multiple="fileBrowserMultiple"
      :file-filter="audioFileFilter"
      @select="handleFileSelect"
      @close="showFileBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage' // Reuse for resolving URL
import { useProjectStore } from '@/stores/projectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { SelectedFile } from '@/types/fileBrowser'
import type { SoundAsset } from '@/types/project'

import FileBrowserDialog from './FileBrowserDialog.vue'

const props = defineProps<{
  visible: boolean
  soundId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
}>()

const soundStore = useSoundStore()
const projectStore = useProjectStore()
const { getImageUrl } = useAssetImage()

// Refs
const fileInput = ref<HTMLInputElement | null>(null)
const showFileBrowser = ref(false)

// State
const importType = ref<'auto' | 'bgm' | 'sfx'>('auto')
const localSound = ref<Partial<SoundAsset>>({
  name: '',
  type: 'sfx',
  tags: [],
  volume: 1.0,
  loop: false,
  fadeIn: 0,
  fadeOut: 0
})

const tagInput = ref('')

// Audio Player State
const audioElement = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)

// Computed
const isNew = computed(() => !props.soundId)
const isValid = computed(() => !!localSound.value.name)
const hasAudio = computed(() => !!localSound.value._runtimeUrl || !!localSound.value.url)

const displayAssetPath = computed(() => {
  const url = localSound.value.url
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return ''
  return url
})

const recommendedTags = computed(() => {
  const all = soundStore.allTags
  return all.filter(t => !localSound.value.tags?.includes(t))
})

const fileBrowserTitle = computed(() => '选择音频文件')

const fileBrowserMultiple = computed(() => false)

const progressPercent = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

// Lifecycle
watch(() => props.visible, (val) => {
  if (val) {
    if (props.soundId) {
      const sound = soundStore.getSound(props.soundId)
      if (sound) {
        localSound.value = JSON.parse(JSON.stringify(sound)) as SoundAsset
        // Restore runtime URL
        if (sound._runtimeUrl) localSound.value._runtimeUrl = sound._runtimeUrl
        // Edit mode: importType follows the existing type
        importType.value = sound.type
        initAudio(sound._runtimeUrl || getImageUrl(sound.url))
      }
    } else {
      reset()
    }
  } else {
    stopAudio()
  }
}, { immediate: true })

function reset() {
  localSound.value = {
    name: '',
    type: 'sfx',
    tags: [],
    volume: 1.0,
    loop: false,
    fadeIn: 0,
    fadeOut: 0
  }
  importType.value = 'auto'
  tagInput.value = ''
  stopAudio()
}

function close() {
  stopAudio()
  emit('close')
}

// Tag Logic
function addTag() {
  const val = tagInput.value.trim()
  if (val && !localSound.value.tags?.includes(val)) {
    if (!localSound.value.tags) localSound.value.tags = []
    localSound.value.tags.push(val)
  }
  tagInput.value = ''
}

function addTagDirectly(tag: string) {
  if (!localSound.value.tags?.includes(tag)) {
    if (!localSound.value.tags) localSound.value.tags = []
    localSound.value.tags.push(tag)
  }
}

function removeTag(tag: string) {
  if (localSound.value.tags) {
    localSound.value.tags = localSound.value.tags.filter(t => t !== tag)
  }
}

function handleTypeChange() {
  if (importType.value !== 'auto') {
    localSound.value.type = importType.value
  } else if (localSound.value.duration) {
    localSound.value.type = localSound.value.duration > 20 ? 'bgm' : 'sfx'
  }
}

// Audio Logic
function initAudio(url: string | undefined) {
  if (!url) return
  
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value = null
  }
  
  const audio = new Audio(url)
  audio.addEventListener('loadedmetadata', () => {
    duration.value = audio.duration
    // Auto set duration to localSound if not set
    if (!localSound.value.duration) {
      localSound.value.duration = audio.duration
    }
    
    // Auto detect type
    if (importType.value === 'auto') {
      localSound.value.type = audio.duration > 20 ? 'bgm' : 'sfx'
      // Auto set loop for BGM
      if (localSound.value.type === 'bgm') localSound.value.loop = true
    }
  })
  audio.addEventListener('timeupdate', () => {
    currentTime.value = audio.currentTime
  })
  audio.addEventListener('ended', () => {
    isPlaying.value = false
    currentTime.value = 0
  })
  
  audioElement.value = audio
  currentTime.value = 0
  isPlaying.value = false
}

function togglePlay() {
  if (!audioElement.value) return
  
  if (isPlaying.value) {
    audioElement.value.pause()
    isPlaying.value = false
  } else {
    audioElement.value.play().catch(e => console.error(e))
    isPlaying.value = true
  }
}

function stopAudio() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value = null
  }
  isPlaying.value = false
  currentTime.value = 0
}

function seek(e: MouseEvent) {
  if (!audioElement.value || duration.value === 0) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = Math.max(0, Math.min(1, x / rect.width))
  const time = percent * duration.value
  
  audioElement.value.currentTime = time
  currentTime.value = time
}

// File Selection
function triggerUpload() {
  if (projectStore.isProjectOpen) {
    showFileBrowser.value = true
  } else {
    fileInput.value?.click()
  }
}



async function handleFileSelect(files: SelectedFile[]) {
  if (files.length === 0) return
  
  const selectedFile = files[0]
  if (!selectedFile) return
  localSound.value.url = selectedFile.path
  const blob = await selectedFile.handle.getFile()
  localSound.value._runtimeUrl = URL.createObjectURL(blob)
  
  // 自动设置名称：单个文件使用文件名
  if (isNew.value && !localSound.value.name) {
    const fileName = selectedFile.handle.name.replace(/\.[^/.]+$/, "")
    localSound.value.name = generateUniqueSoundName(fileName)
  }
  
  initAudio(localSound.value._runtimeUrl)
}

function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    localSound.value._runtimeUrl = URL.createObjectURL(file)
    localSound.value.url = `blob:${file.name}`
    localSound.value.name = file.name.replace(/\.[^/.]+$/, "")
    initAudio(localSound.value._runtimeUrl)
  }
}



function audioFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  return /\.(mp3|wav|ogg|aac|m4a)$/.test(name)
}



/**
 * 生成唯一的声音名称，如果已存在则添加数字后缀
 */
function generateUniqueSoundName(baseName: string): string {
  const existingNames = new Set(
    soundStore.sounds.map((s: SoundAsset) => s.name)
  )
  
  if (!existingNames.has(baseName)) {
    return baseName
  }
  
  let counter = 2
  while (existingNames.has(`${baseName} (${counter})`)) {
    counter++
  }
  return `${baseName} (${counter})`
}

// Save
function save() {
  if (!isValid.value) return
  
  if (isNew.value) {
    // Create new sound
    const newSound = soundStore.createSound(localSound.value.name!, localSound.value.type)
    
    // Copy properties
    Object.assign(newSound, {
      tags: localSound.value.tags,
      volume: localSound.value.volume,
      loop: localSound.value.loop,
      fadeIn: localSound.value.fadeIn,
      fadeOut: localSound.value.fadeOut,
      duration: localSound.value.duration,
      url: localSound.value.url || '',
      _runtimeUrl: localSound.value._runtimeUrl
    })
    
    soundStore.updateSound(newSound.id, newSound)
    
  } else {
    if (props.soundId) {
      soundStore.updateSound(props.soundId, localSound.value)
    }
  }
  
  emit('save')
  close()
}

// Utils
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function handleOverlayClick() {
  // Optional: close on overlay click
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  width: 900px;
  height: 700px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-tabs {
  display: flex;
  gap: 12px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 16px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.close-btn {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #999;
}

.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.preview-column {
  width: 40%;
  background: #f3f4f6;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e5e7eb;
}

.preview-wrapper {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.icon-placeholder {
  width: 80px;
  height: 80px;
  background: #eff6ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-placeholder .icon {
  font-size: 40px;
}

.player-controls {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.time-info {
  font-family: monospace;
  color: #6b7280;
  font-size: 14px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  width: 0%;
}

.control-btns .btn-play {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #3b82f6;
  color: white;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btns .btn-play:hover {
  background: #2563eb;
  transform: scale(1.05);
}

.control-btns .btn-play:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.upload-btn-container {
  margin-top: 32px;
}

.btn-upload {
  padding: 10px 20px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  color: #374151;
  transition: all 0.2s;
}

.btn-upload:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.config-column {
  width: 60%;
  padding: 24px;
  overflow-y: auto;
}

/* Form Styles - similar to BackgroundEditor */
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-weight: 500; font-size: 14px; }
.input-field { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; }
.required { color: red; }

.radio-group { display: flex; gap: 16px; }
.radio-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; }

.tags-input-container {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-badge {
  background: #eff6ff;
  color: #3b82f6;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.tag-remove { border: none; background: none; color: #3b82f6; cursor: pointer; }
.tag-input { border: none; outline: none; flex: 1; min-width: 100px; font-size: 14px; }

.recommended-tags { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.recommend-tag { background: #f3f4f6; padding: 2px 8px; border-radius: 12px; cursor: pointer; }

.divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
.section-title { font-weight: 600; margin-bottom: 16px; }

.slider { width: 100%; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; }

.form-row { display: flex; gap: 16px; }
.form-group.half { width: 50%; }

/* Batch Styles */
.batch-body { flex-direction: column; padding: 24px; background: #f9fafb; }
.batch-toolbar { display: flex; gap: 24px; margin-bottom: 24px; }
.batch-upload-btn {
  width: 240px; height: 120px;
  border: 2px dashed #d1d5db;
  background: white;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  gap: 12px;
}
.batch-upload-btn:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }

.batch-setting-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: white;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.batch-setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-setting-item label {
  font-weight: 500;
  font-size: 14px;
  color: #374151;
}

.radio-group-batch {
  display: flex;
  gap: 16px;
}

.tag-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-tags-list { display: flex; gap: 8px; flex-wrap: wrap; }

.batch-list-container { flex: 1; background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.batch-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #9ca3af; }

.batch-list { flex: 1; overflow-y: auto; }
.batch-list-header {
  display: flex; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 13px; color: #6b7280;
}
.batch-list-item {
  display: flex; padding: 10px 16px; border-bottom: 1px solid #f3f4f6; align-items: center;
}
.col-name { flex: 1; }
.col-size { width: 100px; color: #6b7280; font-size: 13px; }
.col-duration { width: 100px; color: #6b7280; font-size: 13px; }
.col-action { width: 60px; text-align: right; }

.batch-name-input { width: 100%; border: 1px solid transparent; background: transparent; }
.batch-name-input:hover { border-color: #e5e7eb; }
.batch-name-input:focus { border-color: #3b82f6; background: white; }

.btn-remove-batch { border: none; background: none; color: #ef4444; cursor: pointer; font-size: 18px; }

.modal-footer { padding: 16px 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px; }
.btn-cancel { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; }
.btn-save { padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
.btn-save:disabled { background: #9ca3af; cursor: not-allowed; }
.hidden { display: none; }

.type-hint {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.asset-path-hint {
  margin-top: 12px;
  padding: 6px 10px;
  font-size: 11px;
  color: #9ca3af;
  background: #f9fafb;
  border-radius: 4px;
  word-break: break-all;
  line-height: 1.4;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
