<template>
  <div
    class="modal-overlay"
    @click.self="$emit('close')"
  >
    <div class="modal-dialog">
      <div class="dialog-header">
        <h3>{{ isEditing ? '编辑表情' : '新建表情' }}: {{ formData.name || '未命名' }}</h3>
        <button
          class="btn-close"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <!-- 左侧：可视化校准区 (45%) -->
        <div class="left-panel">
          <div class="canvas-wrapper">
            <ExpressionPreview
              :image-url="currentPreviewImage"
              :anchor="formData.anchor"
              :flip-horizontal="formData.flipHorizontal"
              :blend-mode="formData.blendMode"
              @update:anchor="handleAnchorUpdate"
            />
          </div>

          <div class="preview-controls">
            <button
              class="btn-push-to-talk"
              @mousedown="handlePushToTalkStart"
              @mouseup="handlePushToTalkEnd"
              @mouseleave="handlePushToTalkEnd"
            >
              🎤 按住说话测试
            </button>
          </div>

          <div class="preview-status">
            <div>当前状态: {{ isSpeaking ? '说话' : '静止' }}</div>
            <div v-if="isSpeaking && formData.speakingFrames.length > 0">
              当前帧: {{ currentSpeakingFrame + 1 }} / {{ formData.speakingFrames.length }}
            </div>
          </div>

          <div
            v-if="displayAssetPath"
            class="asset-path-hint"
            :title="displayAssetPath"
          >
            📂 {{ displayAssetPath }}
          </div>
        </div>

        <!-- 右侧：配置区 (55%) -->
        <div class="right-panel">
          <div class="config-section">
            <!-- 1. 基础信息 -->
            <div class="form-group">
              <label>表情名称 *</label>
              <input
                v-model="formData.name"
                type="text"
                placeholder="选择图片后自动使用文件夹名称"
                class="form-input"
              >
            </div>

            <!-- 1.5. 性别 & 标签 -->
            <div class="form-group">
              <label>性别 *</label>
              <div class="gender-selector">
                <label class="radio-label">
                  <input
                    v-model="formData.gender"
                    type="radio"
                    value="male"
                  > 男
                </label>
                <label class="radio-label">
                  <input
                    v-model="formData.gender"
                    type="radio"
                    value="female"
                  > 女
                </label>
                <label class="radio-label">
                  <input
                    v-model="formData.gender"
                    type="radio"
                    value="other"
                  > 其他
                </label>
              </div>
            </div>

            <!-- 1.6 标签 -->
            <div class="form-group">
              <label>标签 (Tags)</label>
              <div class="tags-input-container">
                <div class="tags-list">
                  <span
                    v-for="tag in formData.tags"
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
                  v-model="newTagInput"
                  type="text"
                  placeholder="按回车添加..."
                  class="tag-input"
                  @keydown.enter.prevent="addTag"
                  @blur="addTag"
                >
              </div>
              <!-- 快速选择已有标签 -->
              <div
                v-if="quickPickTags.length > 0"
                class="quick-tags"
              >
                <span
                  v-for="tag in quickPickTags"
                  :key="tag"
                  class="quick-tag"
                  @click="addTagDirectly(tag)"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- 2. 锚点设置 -->
            <div class="form-group">
              <label>锚点设置 (Anchor)</label>
              <div class="anchor-inputs">
                <div class="input-group">
                  <label>X:</label>
                  <input
                    v-model.number="formData.anchor.x"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    class="form-input-small"
                    @input="handleAnchorInputChange"
                  >
                </div>
                <div class="input-group">
                  <label>Y:</label>
                  <input
                    v-model.number="formData.anchor.y"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    class="form-input-small"
                    @input="handleAnchorInputChange"
                  >
                </div>
                <button
                  class="btn-reset"
                  @click="resetAnchor"
                >
                  ↺ 重置居中
                </button>
              </div>
            </div>

            <!-- 2.5. 水平翻转 -->
            <div class="form-group">
              <label>
                <input
                  v-model="formData.flipHorizontal"
                  type="checkbox"
                >
                水平翻转
              </label>
            </div>

            <!-- 2.55. 混合模式 -->
            <div class="form-group">
              <label>混合模式</label>
              <select
                v-model="formData.blendMode"
                class="form-input"
              >
                <option value="normal">正常 (Normal)</option>
                <option value="multiply">正片叠底 (Multiply) - 适合白背景</option>
              </select>
              <p class="form-hint">
                💡 如果表情图片有白色背景，选择"正片叠底"可使白色透明化
              </p>
            </div>

            <!-- 2.6. 尺寸设置 -->
            <div class="form-group">
              <label>缩放设置</label>
              <div class="size-settings">
                <div class="setting-item">
                  <label>缩放比例:</label>
                  <div class="scale-slider-group">
                    <input
                      :value="Math.round(formData.defaultScale * 100)"
                      type="range"
                      min="10"
                      max="300"
                      step="10"
                      class="scale-slider"
                      @input="handleScaleSliderChange"
                    >
                    <input
                      :value="Math.round(formData.defaultScale * 100)"
                      type="number"
                      min="10"
                      max="500"
                      step="10"
                      class="form-input-small"
                      @change="handleScaleInputChange"
                    >
                    <span class="scale-unit">%</span>
                  </div>
                </div>
                
                <div class="setting-item">
                  <label>宽高设置:</label>
                  <div class="size-inputs">
                    <div class="input-group">
                      <label>宽:</label>
                      <input
                        v-model.number="displaySizeInput.width"
                        type="number"
                        min="1"
                        step="1"
                        class="form-input-small"
                        @change="handleDisplayWidthChange"
                      >
                    </div>
                    <div class="input-group">
                      <label>高:</label>
                      <input
                        v-model.number="displaySizeInput.height"
                        type="number"
                        min="1"
                        step="1"
                        class="form-input-small"
                        @change="handleDisplayHeightChange"
                      >
                    </div>
                  </div>
                  <p class="form-hint">
                    图片原始尺寸: {{ originalImageSize.width }} × {{ originalImageSize.height }} px
                    <button
                      class="btn-reset-size"
                      @click="resetToOriginalSize"
                    >
                      重置
                    </button>
                  </p>
                </div>
              </div>
            </div>

            <!-- 3. 图片资源 -->
            <div class="form-group">
              <label>图片资源 *</label>
              <div class="speaking-frames">
                <div
                  v-if="formData.speakingFrames.length > 0"
                  class="frames-grid"
                >
                  <div
                    v-for="(frame, index) in formData.speakingFrames"
                    :key="frame.id"
                    class="frame-item"
                    :class="{ 'is-default': formData.defaultFrame.id === frame.id }"
                    @click="setAsDefaultFrame(frame)"
                  >
                    <img 
                      :src="getImageUrl(frame.url)" 
                      :alt="`帧 ${index + 1}`"
                      :style="{ transform: formData.flipHorizontal ? 'scaleX(-1)' : 'none' }"
                    >
                    <div class="frame-index">{{ index + 1 }}</div>
                    <div v-if="formData.defaultFrame.id === frame.id" class="default-badge">默认</div>
                    <button class="btn-remove-frame" @click.stop="removeSpeakingFrame(index)">×</button>
                  </div>
                </div>
                <div class="frame-actions">
                  <button class="btn-add-frames" @click="addSpeakingFrames">📁 上传动画序列</button>
                </div>
                <input
                  ref="speakingFramesInput"
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  style="display: none"
                  @change="handleSpeakingFramesUpload"
                >
              </div>

              <!-- 默认状态（静止图） -->
              <div class="default-frame-section">
                <label class="sub-label">默认静止图 *</label>
                <div v-if="formData.speakingFrames.length > 0" class="still-frame-source-selector">
                  <label class="radio-label">
                    <input v-model="stillFrameSource" type="radio" value="frame"> 使用序列帧
                  </label>
                  <label class="radio-label">
                    <input v-model="stillFrameSource" type="radio" value="custom"> 自定义上传
                  </label>
                </div>
                
                <div class="frame-upload-area">
                  <div v-if="formData.defaultFrame.url" class="frame-preview">
                    <img :src="getImageUrl(formData.defaultFrame.url)" :style="{ transform: formData.flipHorizontal ? 'scaleX(-1)' : 'none' }">
                    <div v-if="stillFrameSource === 'custom'" class="preview-actions">
                      <button class="btn-replace" @click="uploadDefaultFrame">替换</button>
                    </div>
                  </div>
                  <div v-else class="upload-placeholder" @click="uploadDefaultFrame"><span>📁 点击上传默认图</span></div>
                  <input ref="defaultFrameInput" type="file" accept="image/png,image/jpeg" style="display: none" @change="handleDefaultFrameUpload">
                </div>
              </div>

              <div v-if="formData.speakingFrames.length > 0" class="animation-settings">
                <div class="setting-row">
                  <label>FPS:</label>
                  <input v-model.number="formData.speakingFps" type="number" min="1" max="60" class="form-input-small">
                </div>
                <div class="setting-row">
                  <label><input v-model="formData.speakingLoop" type="checkbox"> 循环播放</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <div class="footer-actions">
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button :disabled="!canSave || isSaving" class="btn-save" @click="handleSave">
            <span v-if="isSaving">保存中... ({{ saveProgress.current }}/{{ saveProgress.total }})</span>
            <span v-else>✓ 确定</span>
          </button>
        </div>
      </div>
    </div>
    
    <FileBrowserDialog
      v-if="showFileBrowser"
      :title="fileBrowserMode === 'default' ? '选择默认帧图片' : '选择说话帧图片'"
      :file-filter="imageFileFilter"
      :multiple="fileBrowserMode === 'speaking'"
      @select="handleFileBrowserSelect"
      @close="showFileBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted,ref, watch } from 'vue'

import { useAssetImage } from '@/composables/useAssetImage'
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import type { SelectedFile } from '@/types/fileBrowser'
import type { AnchorPoint,Expression, ExpressionFrame } from '@/types/project'
import { fileToBlob } from '@/utils/fileUtils'

import ExpressionPreview from './ExpressionPreview.vue'
import FileBrowserDialog from './FileBrowserDialog.vue'

const props = defineProps<{
  visible: boolean
  expression?: Expression | null
}>()

const emit = defineEmits<{
  close: []
  saved: [expressionId: string]
  deleted: [expressionId: string]
}>()

const expressionStore = useExpressionStore()
const { getImageUrl, loadImageUrl } = useAssetImage()

const isEditing = computed(() => !!props.expression)
const newTagInput = ref('')
const fileBrowserPaths = ref<{ defaultFrame?: string; speakingFrames: string[] }>({ speakingFrames: [] })

const formData = ref({
  name: '',
  gender: 'female' as 'male' | 'female' | 'other',
  tags: [] as string[],
  anchor: { x: 0.5, y: 0.5 } as AnchorPoint,
  defaultFrame: { id: '', url: '' } as ExpressionFrame,
  speakingFrames: [] as ExpressionFrame[],
  speakingFps: 12,
  speakingLoop: true,
  flipHorizontal: false,
  blendMode: 'normal' as 'normal' | 'multiply',
  lockEdit: false,
  defaultScale: 1.0
})

const originalImageSize = ref({ width: 100, height: 100 })
const displaySizeInput = ref({ width: 100, height: 100 })
let imageSizeLoadToken = 0

const defaultFrameInput = ref<HTMLInputElement | null>(null)
const speakingFramesInput = ref<HTMLInputElement | null>(null)
const showFileBrowser = ref<boolean>(false)
const fileBrowserMode = ref<'default' | 'speaking'>('default')

const currentPreviewImage = computed(() => {
  const frames = formData.value.speakingFrames
  const index = currentSpeakingFrame.value
  const frame = isSpeaking.value && frames.length > index ? frames[index] : null
  return frame ? frame.url : formData.value.defaultFrame.url
})

const isSpeaking = ref(false)
const currentSpeakingFrame = ref(0)
let speakingAnimationTimer: ReturnType<typeof setTimeout> | null = null

const stillFrameSource = ref<'frame' | 'custom'>('frame')
const stillFrameIndex = ref(0)
const isSaving = ref(false)
const saveProgress = ref({ current: 0, total: 0 })

const canSave = computed(() => formData.value.name.trim() !== '' && formData.value.defaultFrame.url !== '' && !isSaving.value)

const displayAssetPath = computed(() => {
  // Check fileBrowserPaths first (for new uploads via file browser)
  const browserPaths = fileBrowserPaths.value
  if (browserPaths.speakingFrames.length > 0) {
    const firstPath = browserPaths.speakingFrames[0]
    if (firstPath) {
      return `${firstPath} (共${browserPaths.speakingFrames.length}帧)`
    }
  }
  if (browserPaths.defaultFrame) {
    return browserPaths.defaultFrame
  }
  // Fall back to formData URLs (for editing existing expressions)
  if (formData.value.speakingFrames.length > 0) {
    const firstUrl = formData.value.speakingFrames[0]?.url
    if (firstUrl && !firstUrl.startsWith('blob:') && !firstUrl.startsWith('data:')) {
      return `${firstUrl} (共${formData.value.speakingFrames.length}帧)`
    }
  }
  const defaultUrl = formData.value.defaultFrame.url
  if (defaultUrl && !defaultUrl.startsWith('blob:') && !defaultUrl.startsWith('data:')) {
    return defaultUrl
  }
  return ''
})

watch(() => props.expression, async (expr) => {
  if (expr) {
    formData.value = {
      name: expr.name,
      gender: expr.gender ?? 'male',
      tags: expr.tags.filter(t => !['male', 'female', 'other', '男', '女', '其他'].includes(t)),
      anchor: { ...expr.anchor },
      defaultFrame: { ...expr.defaultFrame },
      speakingFrames: expr.speakingFrames.map(f => ({ ...f })),
      speakingFps: expr.speakingFps,
      speakingLoop: expr.speakingLoop,
      flipHorizontal: expr.flipHorizontal ?? false,
      blendMode: expr.blendMode ?? 'normal',
      lockEdit: expr.lockEdit ?? false,
      defaultScale: expr.defaultScale ?? 1.0
    }
    
    if (expr.stillFrameSource === 'custom') {
      stillFrameSource.value = 'custom'
      stillFrameIndex.value = 0
    } else {
      stillFrameSource.value = 'frame'
      const frameIdx = expr.speakingFrames.findIndex(f => f.id === expr.defaultFrame.id)
      stillFrameIndex.value = frameIdx >= 0 ? frameIdx : (expr.stillFrameIndex ?? 0)
    }
    
    const browserPaths: { defaultFrame?: string; speakingFrames: string[] } = {
      speakingFrames: []
    }
    const defaultUrl = formData.value.defaultFrame.url
    if (defaultUrl && !defaultUrl.startsWith('blob:') && !defaultUrl.startsWith('data:')) {
      browserPaths.defaultFrame = defaultUrl
    }
    fileBrowserPaths.value = browserPaths
    
    await loadImageSize(formData.value.defaultFrame.url)
  } else {
    resetForm()
  }
}, { immediate: true })

watch(() => formData.value.defaultFrame.url, (url) => {
  void loadImageSize(url)
})

function resetForm() {
  formData.value = {
    name: '', gender: 'female', tags: [], anchor: { x: 0.5, y: 0.5 },
    defaultFrame: { id: '', url: '' }, speakingFrames: [], speakingFps: 12,
    speakingLoop: true, flipHorizontal: false, blendMode: 'normal' as const, lockEdit: false,
    defaultScale: 1.0
  }
  originalImageSize.value = { width: 100, height: 100 }
  displaySizeInput.value = { width: 100, height: 100 }
  fileBrowserPaths.value = { speakingFrames: [] }
  stillFrameSource.value = 'frame'
  stillFrameIndex.value = 0
}

function addTag() {
  const tag = newTagInput.value.trim()
  if (tag && !formData.value.tags.includes(tag)) formData.value.tags.push(tag)
  newTagInput.value = ''
}

function removeTag(tag: string) { formData.value.tags = formData.value.tags.filter(t => t !== tag) }


// 获取所有表情的标签（去重）
const allExpressionTags = computed(() => {
  const tags = new Set<string>()
  Object.values(expressionStore.expressions).forEach((expr: Expression) => {
    expr.tags?.forEach((t: string) => {
      // 排除性别标签
      if (!['male', 'female', 'other', '男', '女', '其他'].includes(t)) {
        tags.add(t)
      }
    })
  })
  return Array.from(tags).sort()
})

// 快速选择标签（显示所有可用标签，排除当前已有的）
const quickPickTags = computed(() => {
  return allExpressionTags.value
    .filter(t => !formData.value.tags.includes(t))
})

// 直接添加标签（点击快速选择时）
function addTagDirectly(tag: string) {
  if (!formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag)
  }
}
function handleAnchorUpdate(anchor: AnchorPoint) { formData.value.anchor = anchor }
function handleAnchorInputChange() {
  // Handle anchor input change
}
function resetAnchor() { formData.value.anchor = { x: 0.5, y: 0.5 } }

function syncDisplaySizeFromScale() {
  displaySizeInput.value = {
    width: Math.round(originalImageSize.value.width * formData.value.defaultScale),
    height: Math.round(originalImageSize.value.height * formData.value.defaultScale)
  }
}

async function loadImageSize(imageUrl: string) {
  const token = ++imageSizeLoadToken
  if (!imageUrl) {
    originalImageSize.value = { width: 100, height: 100 }
    syncDisplaySizeFromScale()
    return
  }
  try {
    if (!imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
      await loadImageUrl(imageUrl)
    }
    const url = getImageUrl(imageUrl)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    if (token !== imageSizeLoadToken) return
    originalImageSize.value = { width: img.naturalWidth, height: img.naturalHeight }
    syncDisplaySizeFromScale()
  } catch (error) { console.warn('[ExpressionEditorModal] 加载图片尺寸失败:', error) }
}

function handleScaleSliderChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value)
  if (!isNaN(percent)) {
    formData.value.defaultScale = percent / 100
    syncDisplaySizeFromScale()
  }
}

function handleScaleInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value)
  if (!isNaN(percent) && percent >= 10) {
    formData.value.defaultScale = percent / 100
    syncDisplaySizeFromScale()
  }
}

function handleDisplayWidthChange() {
  if (originalImageSize.value.width > 0) {
    formData.value.defaultScale = Number((displaySizeInput.value.width / originalImageSize.value.width).toFixed(2))
    displaySizeInput.value.height = Math.round(originalImageSize.value.height * formData.value.defaultScale)
  }
}

function handleDisplayHeightChange() {
  if (originalImageSize.value.height > 0) {
    formData.value.defaultScale = Number((displaySizeInput.value.height / originalImageSize.value.height).toFixed(2))
    displaySizeInput.value.width = Math.round(originalImageSize.value.width * formData.value.defaultScale)
  }
}

function resetToOriginalSize() {
  formData.value.defaultScale = 1.0
  displaySizeInput.value = { ...originalImageSize.value }
}

function uploadDefaultFrame() {
  const projectStore = useProjectStore()
  if (projectStore.isProjectOpen) {
    fileBrowserMode.value = 'default'
    showFileBrowser.value = true
  } else {
    defaultFrameInput.value?.click()
  }
}

function handleDefaultFrameUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const url = fileToBlob(file)
    formData.value.defaultFrame = { id: `frame_${Date.now()}`, url, file }
    stillFrameSource.value = 'custom'
    input.value = ''
  } catch (error) { alert('图片上传失败') }
}

function addSpeakingFrames() {
  const projectStore = useProjectStore()
  if (projectStore.isProjectOpen) {
    fileBrowserMode.value = 'speaking'
    showFileBrowser.value = true
  } else {
    speakingFramesInput.value?.click()
  }
}

function handleSpeakingFramesUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  try {
    const newFrames: ExpressionFrame[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file) continue
      const url = fileToBlob(file)
      newFrames.push({ id: `frame_${Date.now()}_${i}`, url, file })
    }
    const sortedFrames = sortFramesByName(newFrames)
    formData.value.speakingFrames.push(...sortedFrames)
    if (!formData.value.defaultFrame.url && sortedFrames.length > 0) {
      const first = sortedFrames[0]
      if (first) formData.value.defaultFrame = { ...first }
    }
    input.value = ''
  } catch (error) { alert('图片上传失败') }
}

function setAsDefaultFrame(frame: ExpressionFrame) {
  formData.value.defaultFrame = { ...frame }
  const frameIndex = formData.value.speakingFrames.findIndex(f => f.id === frame.id)
  if (frameIndex >= 0) {
    stillFrameSource.value = 'frame'
    stillFrameIndex.value = frameIndex
    if (fileBrowserPaths.value.speakingFrames.length > frameIndex) {
      const path = fileBrowserPaths.value.speakingFrames[frameIndex]
      if (path) fileBrowserPaths.value.defaultFrame = path
    } else if (frame.url && !frame.url.startsWith('blob:') && !frame.url.startsWith('data:')) {
      fileBrowserPaths.value.defaultFrame = frame.url
    }
  }
}

function sortFramesByName(frames: ExpressionFrame[]): ExpressionFrame[] {
  return [...frames].sort((a, b) => {
    const nameA = a.file?.name ?? ''
    const nameB = b.file?.name ?? ''
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function removeSpeakingFrame(index: number) {
  const frame = formData.value.speakingFrames[index]
  if (!frame) return
  const isDefaultFrame = formData.value.defaultFrame.id === frame.id
  if (frame.url.startsWith('blob:')) URL.revokeObjectURL(frame.url)
  formData.value.speakingFrames.splice(index, 1)
  if (isDefaultFrame || !formData.value.defaultFrame.url) {
    if (formData.value.speakingFrames.length > 0) {
      const first = formData.value.speakingFrames[0]
      if (first) {
        formData.value.defaultFrame = { ...first }
        if (fileBrowserPaths.value.speakingFrames.length > 0) {
          const path = fileBrowserPaths.value.speakingFrames[0]
          if (path) fileBrowserPaths.value.defaultFrame = path
        }
      }
    } else {
      formData.value.defaultFrame = { id: '', url: '' }
      delete fileBrowserPaths.value.defaultFrame
    }
  }
}

function handlePushToTalkStart() {
  if (formData.value.speakingFrames.length === 0) return
  isSpeaking.value = true
  currentSpeakingFrame.value = 0
  const frameDuration = 1000 / formData.value.speakingFps
  speakingAnimationTimer = setInterval(() => {
    if (formData.value.speakingFrames.length > 0) {
      if (formData.value.speakingLoop) {
        currentSpeakingFrame.value = (currentSpeakingFrame.value + 1) % formData.value.speakingFrames.length
      } else if (currentSpeakingFrame.value < formData.value.speakingFrames.length - 1) {
        currentSpeakingFrame.value++
      }
    }
  }, frameDuration)
}

function handlePushToTalkEnd() {
  isSpeaking.value = false
  currentSpeakingFrame.value = 0
  if (speakingAnimationTimer) {
    clearInterval(speakingAnimationTimer)
    speakingAnimationTimer = null
  }
}

function handleSave() {
  if (!canSave.value || isSaving.value) return
  const projectStore = useProjectStore()
  let expressionId: string

  const commonData: Partial<Expression> = {
    name: formData.value.name,
    gender: formData.value.gender,
    tags: formData.value.tags,
    anchor: formData.value.anchor,
    speakingFrames: formData.value.speakingFrames,
    speakingFps: formData.value.speakingFps,
    speakingLoop: formData.value.speakingLoop,
    flipHorizontal: formData.value.flipHorizontal,
    blendMode: formData.value.blendMode,
    lockEdit: formData.value.lockEdit,
    defaultScale: formData.value.defaultScale,
    ...(formData.value.speakingFrames.length > 0 ? { stillFrameSource: stillFrameSource.value } : {}),
    ...((formData.value.speakingFrames.length > 0 && stillFrameSource.value === 'frame') ? { stillFrameIndex: stillFrameIndex.value } : {})
  }

  if (isEditing.value && props.expression) {
    expressionId = props.expression.id
    expressionStore.updateExpression(expressionId, {
      ...commonData,
      defaultFrame: formData.value.defaultFrame
    })
  } else {
    expressionId = expressionStore.createExpression(formData.value.name, formData.value.defaultFrame, commonData)
  }

  if (projectStore.isProjectOpen) {
    isSaving.value = true
    try {
      if (fileBrowserPaths.value.defaultFrame) {
        expressionStore.updateDefaultFrameFromPath(expressionId, fileBrowserPaths.value.defaultFrame)
        formData.value.defaultFrame.url = fileBrowserPaths.value.defaultFrame
      }
      if (fileBrowserPaths.value.speakingFrames.length > 0) {
        const startIndex = formData.value.speakingFrames.length - fileBrowserPaths.value.speakingFrames.length
        for (let i = 0; i < fileBrowserPaths.value.speakingFrames.length; i++) {
          const path = fileBrowserPaths.value.speakingFrames[i]
          const frameIndex = startIndex + i
          if (path && frameIndex < formData.value.speakingFrames.length) {
            const f = formData.value.speakingFrames[frameIndex]
            if (f) f.url = path
          }
        }
      }
      if (isEditing.value) {
        expressionStore.updateExpression(expressionId, {
          defaultFrame: formData.value.defaultFrame,
          speakingFrames: formData.value.speakingFrames
        })
      }
    } catch (error) { alert('保存文件失败') }
    finally { isSaving.value = false }
  }
  emit('saved', expressionId)
  emit('close')
}

async function handleFileBrowserSelect(selectedFiles: SelectedFile[]) {
  if (selectedFiles.length === 0) return
  try {
    if (fileBrowserMode.value === 'default') {
      const selectedFile = selectedFiles[0]
      if (!selectedFile) return
      const file = await selectedFile.handle.getFile()
      const url = URL.createObjectURL(file)
      const frame: ExpressionFrame = { id: `frame_${Date.now()}`, url }
      formData.value.defaultFrame = frame
      fileBrowserPaths.value.defaultFrame = selectedFile.path
      stillFrameSource.value = 'custom'
    } else {
      if (isEditing.value) {
        formData.value.speakingFrames = []
        fileBrowserPaths.value.speakingFrames = []
      }
      for (const selectedFile of selectedFiles) {
        if (!selectedFile || fileBrowserPaths.value.speakingFrames.includes(selectedFile.path)) continue
        const file = await selectedFile.handle.getFile()
        const url = URL.createObjectURL(file)
        const frame: ExpressionFrame = { id: `frame_${Date.now()}_${Math.random()}`, url }
        formData.value.speakingFrames.push(frame)
        fileBrowserPaths.value.speakingFrames.push(selectedFile.path)
      }
      if (formData.value.defaultFrame.url === '' && formData.value.speakingFrames.length > 0) {
        const first = formData.value.speakingFrames[0]
        if (first) {
          formData.value.defaultFrame = { id: first.id, url: first.url }
          if (fileBrowserPaths.value.speakingFrames.length > 0) {
            const path = fileBrowserPaths.value.speakingFrames[0]
            if (path) fileBrowserPaths.value.defaultFrame = path
          }
          stillFrameSource.value = 'frame'
          stillFrameIndex.value = 0
        }
      }
      // 自动设置表情名称：仅当新建表情且名称为空时
      if (!isEditing.value && !formData.value.name && selectedFiles.length > 0) {
        const firstFile = selectedFiles[0]
        if (firstFile) {
          const folderName = extractFolderName(firstFile.path)
          if (folderName) {
            formData.value.name = generateUniqueName(folderName)
          }
        }
      }
    }
  } catch (error) { alert('加载图片失败') }
}

/**
 * 从文件路径提取父文件夹名称
 * 例如: 'expressions/男-开心/frame_001.png' → '男-开心'
 */
function extractFolderName(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length >= 2) {
    return parts[parts.length - 2] || ''
  }
  return ''
}

/**
 * 生成唯一的表情名称，如果已存在则添加数字后缀
 * 例如: '开心' → '开心', 如果已存在则 '开心 (2)', '开心 (3)' ...
 */
function generateUniqueName(baseName: string): string {
  const existingNames = new Set(
    Object.values(expressionStore.expressions).map((expr: Expression) => expr.name)
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

function imageFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].some(ext => name.endsWith(ext))
}

onUnmounted(() => {
  handlePushToTalkEnd()
  isSaving.value = false
})
</script>

<style scoped>
.modal-overlay {
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

.modal-dialog {
  width: 90vw;
  max-width: 1200px;
  height: 90vh;
  max-height: 800px;
  background: white;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}

.dialog-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.btn-close {
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 20px;
  background: none;
  border: none;
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
  display: flex;
  overflow: hidden;
}

.left-panel {
  width: 45%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-right: 1px solid #e5e7eb;
  gap: 16px;
}

.canvas-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e; /* 深色背景，与道具对话框一致 */
  border-radius: 8px;
  /* 棋盘格图案 */
  background-image: 
    linear-gradient(45deg, #2a2a3e 25%, transparent 25%), 
    linear-gradient(-45deg, #2a2a3e 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #2a2a3e 75%), 
    linear-gradient(-45deg, transparent 75%, #2a2a3e 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.preview-controls {
  display: flex;
  justify-content: center;
}

.btn-push-to-talk {
  padding: 12px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-push-to-talk:hover {
  background: #2563eb;
}

.btn-push-to-talk:active {
  background: #1d4ed8;
}

.preview-status {
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

.right-panel {
  width: 55%;
  overflow-y: auto;
  padding: 20px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.tags-input-container {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  background: white;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-badge {
  background: #eff6ff;
  color: #3b82f6;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-remove {
  border: none;
  background: none;
  color: #3b82f6;
  cursor: pointer;
  padding: 0;
  font-weight: bold;
}

.tag-input {
  border: none;
  outline: none;
  padding: 4px;
  flex: 1;
  min-width: 100px;
  background: transparent;
}

/* Quick Tags */
.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.quick-tag {
  padding: 2px 8px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}
.quick-tag:hover {
  background: #e0f2fe;
  border-color: #3b82f6;
  color: #3b82f6;
}
.quick-tag.more {
  background: #f9fafb;
  color: #9ca3af;
}

.gender-selector {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  cursor: pointer;
}

.anchor-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-input-small {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.btn-reset, .btn-reset-size {
  font-size: 12px;
  color: #3b82f6;
  background: none;
  border: none;
  cursor: pointer;
}

.size-settings {
  margin-top: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scale-slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scale-slider {
  flex: 1;
}

.scale-unit {
  font-size: 13px;
  color: #6b7280;
  min-width: 16px;
}

.size-inputs {
  display: flex;
  gap: 16px;
}

.form-hint {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}

.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.frame-item {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #f3f4f6;
}

.frame-item.is-default {
  border-color: #3b82f6;
}

.frame-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.frame-index {
  position: absolute;
  top: 2px;
  left: 2px;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
}

.default-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: #3b82f6;
  color: white;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
}

.btn-remove-frame {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(239, 68, 68, 0.8);
  color: white;
  border: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.btn-add-frames {
  width: 100%;
  padding: 8px;
  background: white;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}

.default-frame-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.sub-label {
  font-weight: 600;
  font-size: 14px;
}

.still-frame-source-selector {
  display: flex;
  gap: 16px;
  margin: 8px 0;
}

.frame-upload-area {
  margin-top: 8px;
}

.frame-preview {
  width: 120px;
  height: 120px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  position: relative;
}

.frame-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-actions {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.frame-preview:hover .preview-actions {
  opacity: 1;
}

.btn-replace {
  padding: 4px 12px;
  background: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.upload-placeholder {
  width: 120px;
  height: 120px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 12px;
}

.upload-placeholder:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.animation-settings {
  margin-top: 16px;
  display: flex;
  gap: 20px;
  align-items: center;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 16px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.btn-save {
  padding: 8px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-save:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.asset-path-hint {
  margin-top: 8px;
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
