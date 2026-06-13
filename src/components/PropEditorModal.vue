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
        <h3>{{ isNew ? '新建道具' : '编辑道具' }}</h3>
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
          <div class="canvas-wrapper">
            <div
              class="preview-container"
              :class="{ 'checkerboard': true }"
            >
              <!-- Static Preview -->
              <img 
                v-if="localProp.type === 'static' && displayUrl" 
                :src="displayUrl" 
                class="preview-image"
              >
              
              <!-- Animation Preview -->
              <div
                v-else-if="localProp.type === 'animation'"
                class="animation-preview"
              >
                <img 
                  v-if="currentFrameUrl"
                  :src="currentFrameUrl"
                  class="preview-image"
                >
                <div
                  v-else
                  class="empty-preview"
                >
                  无帧数据
                </div>
                 
                <!-- Animation Controls -->
                <div
                  v-if="hasFrames"
                  class="anim-controls"
                >
                  <button
                    @mousedown="startPlaying"
                    @mouseup="stopPlaying"
                    @mouseleave="stopPlaying"
                  >
                    ▶ 按住播放
                  </button>
                  <span class="frame-info">帧: {{ currentFrameIndex + 1 }} / {{ totalFrames }}</span>
                </div>
              </div>

              <div
                v-else
                class="empty-preview"
              >
                <span>暂无图片</span>
              </div>
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

        <!-- Right: Config Area -->
        <div class="config-column">
          <!-- Basic Info -->
          <div class="form-section">
            <div class="form-group">
              <label>道具名称 <span class="required">*</span></label>
              <input 
                v-model="localProp.name" 
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
                    v-model="localProp.type"
                    type="radio"
                    value="static"
                  >
                  静态图片
                </label>
                <label class="radio-label">
                  <input
                    v-model="localProp.type"
                    type="radio"
                    value="animation"
                  >
                  序列帧动画
                </label>
              </div>
            </div>

            <!-- Tag Management -->
            <div class="form-group">
              <label>标签</label>
              <div class="tags-input-container">
                <div class="tags-list">
                  <span
                    v-for="tag in localProp.tags"
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

          <!-- Resource Upload -->
          <div class="form-section resource-section">
            <div class="section-title">
              资源配置
            </div>

            <!-- Static Mode -->
            <div
              v-if="localProp.type === 'static'"
              class="static-uploader"
            >
              <div
                class="upload-box"
                @click="triggerUpload('static')"
              >
                <div
                  v-if="displayUrl"
                  class="upload-preview"
                >
                  <img :src="displayUrl">
                  <div class="upload-overlay">
                    点击替换
                  </div>
                </div>
                <div
                  v-else
                  class="upload-placeholder"
                >
                  <span class="icon">☁️</span>
                  <span>点击上传图片</span>
                </div>
              </div>
            </div>

            <!-- Animation Mode -->
            <div
              v-else
              class="animation-config"
            >
              <!-- Frames List -->
              <div class="frames-list">
                <div 
                  v-for="(frame, index) in localProp.frames" 
                  :key="index"
                  class="frame-item"
                  :class="{ active: currentFrameIndex === index }"
                  @click="currentFrameIndex = index"
                >
                  <img :src="getFrameRuntimeUrl(frame, index)">
                  <button
                    class="btn-delete-frame"
                    @click.stop="removeFrame(index)"
                  >
                    ×
                  </button>
                  <div class="frame-idx">
                    {{ index + 1 }}
                  </div>
                  <div
                    v-if="localProp.stillFrameSource === 'frame' && localProp.stillFrameIndex === index"
                    class="badge-default"
                  >
                    默认
                  </div>
                </div>
                
                <div
                  class="frame-add-btn"
                  @click="triggerUpload('frames')"
                >
                  <span>+</span>
                  <span class="text">添加帧</span>
                </div>
              </div>

              <!-- Animation Settings -->
              <div class="anim-settings">
                <div class="setting-row">
                  <label>FPS</label>
                  <input
                    v-model="localProp.fps"
                    type="number"
                    min="1"
                    max="60"
                    class="input-small"
                  >
                  
                  <label class="checkbox-label">
                    <input
                      v-model="localProp.loop"
                      type="checkbox"
                    > 循环播放
                  </label>
                </div>

                <div class="setting-row">
                  <label>默认静止图</label>
                  <select
                    v-model="localProp.stillFrameSource"
                    class="select-field"
                  >
                    <option value="frame">
                      使用序列帧
                    </option>
                    <option value="custom">
                      自定义上传
                    </option>
                  </select>
                </div>

                <div
                  v-if="localProp.stillFrameSource === 'frame'"
                  class="setting-row"
                >
                  <span class="hint-text">在上方帧列表中点击帧设为默认</span>
                  <button
                    class="btn-set-current"
                    @click="setStillFrameToCurrent"
                  >
                    设当前帧为默认
                  </button>
                </div>

                <div
                  v-if="localProp.stillFrameSource === 'custom'"
                  class="custom-still-uploader"
                >
                  <div
                    class="mini-upload"
                    @click="triggerUpload('still')"
                  >
                    <img
                      v-if="customStillUrl"
                      :src="customStillUrl"
                    >
                    <span v-else>点击上传静止帧</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 动画管理入口（仅编辑已有道具时显示） -->
          <div
            v-if="!isNew"
            class="form-section"
          >
            <div class="divider" />
            <button
              class="btn-anim-manager"
              @click="showAnimManager = true"
            >
              🎬 动画管理
            </button>
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
      ref="staticInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleStaticUpload"
    >
    <input
      ref="framesInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleFramesUpload"
    >
    <input
      ref="stillInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleStillUpload"
    >
    
    <FileBrowserDialog
      v-if="showFileBrowser"
      :title="fileBrowserTitle"
      :multiple="fileBrowserMultiple"
      :file-filter="imageFileFilter"
      @select="handleFileSelect"
      @close="showFileBrowser = false"
    />

    <!-- v20: 动画工作台（资源级，替代旧 AnimationManager） -->
    <AnimationWorkbench
      v-if="showAnimManager && propId && propWorkbenchInitialAnim"
      :visible="showAnimManager"
      :animation="propWorkbenchInitialAnim"
      :resource-type="propWorkbenchResourceType"
      :resource-id="propId"
      :animations="propWorkbenchAnimList"
      :existing-names="propWorkbenchAnimList.map(a => a.name)"
      :original-name="propWorkbenchInitialAnim.name"
      @save="handlePropWorkbenchSave"
      @close="showAnimManager = false"
      @animation-created="handlePropWorkbenchSave"
      @animation-deleted="handlePropWorkbenchDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AnimationWorkbench from '@/components/animation-workbench/AnimationWorkbench.vue'
import FileBrowserDialog from '@/components/FileBrowserDialog.vue'
import { useAssetImage } from '@/composables/useAssetImage'
import { useAnimationStore } from '@/stores/animationStore'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePropStore } from '@/stores/propStore'
import type { SelectedFile } from '@/types/fileBrowser'
import type { PropAsset } from '@/types/project'

const props = defineProps<{
  visible: boolean
  propId?: string
  resourceType?: 'prop' | 'background'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
}>()

const propStore = usePropStore()
const backgroundStore = useBackgroundStore()
const projectStore = useProjectStore()
const { getImageUrl } = useAssetImage()

// Refs
const staticInput = ref<HTMLInputElement | null>(null)
const framesInput = ref<HTMLInputElement | null>(null)
const stillInput = ref<HTMLInputElement | null>(null)
const showFileBrowser = ref(false)
const fileBrowserTarget = ref<'static' | 'frames' | 'still'>('static')
const showAnimManager = ref(false)

// v20: Workbench 资源级动画
const animationStore = useAnimationStore()

const propWorkbenchResourceType = computed((): 'prop' | 'background' | 'symbol' | 'composite' =>
  props.resourceType === 'background' ? 'background' : 'prop'
)

const propWorkbenchAnimList = computed((): import('@/types/animation').AnimationDefinition[] => {
  if (!props.propId) return []
  return animationStore.getAnimations(props.resourceType ?? 'prop', props.propId)
})

const propWorkbenchInitialAnim = computed((): import('@/types/animation').AnimationDefinition | undefined => {
  const list = propWorkbenchAnimList.value
  if (list.length > 0) return list[0]
  const now = Date.now()
  return {
    type: 'track' as const,
    id: `animation_${crypto.randomUUID()}`,
    name: '新动画',
    loop: false,
    tracks: [{
      trackType: 'transform' as const,
      duration: 1000,
      easing: 'linear' as const,
      keyframes: [
        { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        { time: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      ],
    }],
    createdAt: now,
    updatedAt: now,
  }
})

function handlePropWorkbenchSave(animation: import('@/types/animation').AnimationDefinition) {
  if (!props.propId) return
  const resType = props.resourceType ?? 'prop'
  const existing = animationStore.getAnimation(resType, props.propId, animation.id)
  if (existing) {
    animationStore.updateAnimation(resType, props.propId, animation.id, animation)
  } else {
    animationStore.addAnimation(resType, props.propId, animation)
  }
}

function handlePropWorkbenchDelete(animationId: string) {
  if (!props.propId) return
  animationStore.deleteAnimation(props.resourceType ?? 'prop', props.propId, animationId)
}

// State
const localProp = ref<Partial<PropAsset>>({
  name: '',
  type: 'static',
  tags: [],
  fps: 25,
  loop: true,
  frames: [],
  stillFrameSource: 'frame',
  stillFrameIndex: 0
})

const tagInput = ref('')
const currentFrameIndex = ref(0)
const isPlaying = ref(false)
const playTimer = ref<number | null>(null)

// Computed
const isNew = computed(() => !props.propId)
const isValid = computed(() => !!localProp.value.name)

const displayUrl = computed(() => {
  if (localProp.value.type === 'static') {
    return localProp.value._runtimeUrl ?? getImageUrl(localProp.value.url)
  }
  return ''
})

const customStillUrl = computed(() => {
  return localProp.value._runtimeStillUrl ?? getImageUrl(localProp.value.stillFrameCustomUrl)
})

const totalFrames = computed(() => localProp.value.frames?.length ?? 0)
const hasFrames = computed(() => totalFrames.value > 0)

const displayAssetPath = computed(() => {
  if (localProp.value.type === 'static') {
    const url = localProp.value.url
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return ''
    return url
  } else if (localProp.value.type === 'animation') {
    const frames = localProp.value.frames
    if (!frames || frames.length === 0) return ''
    const firstUrl = frames[0]?.url
    if (!firstUrl || firstUrl.startsWith('blob:') || firstUrl.startsWith('data:')) return ''
    return `${firstUrl} (共${frames.length}帧)`
  }
  return ''
})

const currentFrameUrl = computed(() => {
  if (!localProp.value.frames || localProp.value.frames.length === 0) return ''
  const frame = (localProp.value.frames as NonNullable<PropAsset['frames']>)[currentFrameIndex.value]
  if (!frame) return ''
  const runtimeUrl = frame['_runtimeUrl'] as string | undefined
  return runtimeUrl ?? getImageUrl(frame.url)
})

// helper for template: get frame runtime URL
function getFrameRuntimeUrl(frame: NonNullable<PropAsset['frames']>[number], _index: number): string {
  const runtimeUrl = frame['_runtimeUrl'] as string | undefined
  return runtimeUrl ?? getImageUrl(frame.url) ?? ''
}

const recommendedTags = computed(() => {
  const all = propStore.allTags
  // Filter out already added tags
  return all.filter(t => !localProp.value.tags?.includes(t))
})

const fileBrowserTitle = computed(() => {
  if (fileBrowserTarget.value === 'static') return '选择静态图片'
  if (fileBrowserTarget.value === 'frames') return '选择序列帧图片'
  return '选择静止帧图片'
})

const fileBrowserMultiple = computed(() => fileBrowserTarget.value === 'frames')

// Lifecycle
watch(() => props.visible, (val) => {
  if (val) {
    if (props.propId) {
      const p = props.resourceType === 'background'
        ? backgroundStore.getBackground(props.propId)
        : propStore.getProp(props.propId)
      if (p) {
        localProp.value = JSON.parse(JSON.stringify(p)) as Partial<PropAsset>
        // Restore runtime URLs if needed (store handles this usually, but deep clone loses blobs if not careful)
        // Actually store keeps runtimeUrl in the object, but JSON.parse kills functions/undefined.
        // We need to re-attach runtime URLs from the store instance if they exist
        if (p._runtimeUrl) localProp.value._runtimeUrl = p._runtimeUrl
        if (p._runtimeStillUrl) localProp.value._runtimeStillUrl = p._runtimeStillUrl
        if (p.frames && localProp.value.frames) {
          p.frames.forEach((f, i) => {
             const frameRuntimeUrl = f['_runtimeUrl'] as string | undefined
             const targetFrame = localProp.value.frames?.[i]
             if (targetFrame && frameRuntimeUrl) {
               (targetFrame as { _runtimeUrl?: string })._runtimeUrl = frameRuntimeUrl
             }
          })
        }
      }
    } else {
      reset()
    }
  } else {
    stopPlaying()
  }
}, { immediate: true })

function reset() {
  localProp.value = {
    name: '',
    type: 'static',
    tags: [],
    fps: 25,
    loop: true,
    frames: [],
    stillFrameSource: 'frame',
    stillFrameIndex: 0
  }
  tagInput.value = ''
  currentFrameIndex.value = 0
}

function close() {
  stopPlaying()
  emit('close')
}

// Tag Logic
function addTag() {
  const val = tagInput.value.trim()
  if (val && !localProp.value.tags?.includes(val)) {
    localProp.value.tags ??= []
    localProp.value.tags.push(val)
  }
  tagInput.value = ''
}

function addTagDirectly(tag: string) {
  if (!localProp.value.tags?.includes(tag)) {
    localProp.value.tags ??= []
    localProp.value.tags.push(tag)
  }
}

function removeTag(tag: string) {
  if (localProp.value.tags) {
    localProp.value.tags = localProp.value.tags.filter((t: string) => t !== tag)
  }
}

// Upload Logic
function triggerUpload(target: 'static' | 'frames' | 'still') {
  if (projectStore.isProjectOpen) {
    fileBrowserTarget.value = target
    showFileBrowser.value = true
  } else {
    // Fallback
    if (target === 'static') staticInput.value?.click()
    else if (target === 'frames') framesInput.value?.click()
    else if (target === 'still') stillInput.value?.click()
  }
}

// File Browser Handler
async function handleFileSelect(files: SelectedFile[]) {
  if (files.length === 0) return
  
  const target = fileBrowserTarget.value
  
  if (target === 'static') {
    const file = files[0]
    if (file) {
      localProp.value.url = file.path
      // Load blob for preview
      const blob = await file.handle.getFile()
      localProp.value._runtimeUrl = URL.createObjectURL(blob)
      
      // 自动设置名称：单个文件使用文件名
      if (isNew.value && !localProp.value.name) {
        const fileName = file.name.replace(/\.[^/.]+$/, '')
        localProp.value.name = generateUniquePropName(fileName)
      }
    }
  } 
  else if (target === 'still') {
    const file = files[0]
    if (file) {
      localProp.value.stillFrameCustomUrl = file.path
      const blob = await file.handle.getFile()
      localProp.value._runtimeStillUrl = URL.createObjectURL(blob)
    }
  }
  else if (target === 'frames') {
    // Append frames
    for (const f of files) {
      const blob = await f.handle.getFile()
      const blobUrl = URL.createObjectURL(blob)
      localProp.value.frames ??= []
      localProp.value.frames.push({
        id: `frame_${Date.now()}_${Math.random()}`,
        url: f.path,
        _runtimeUrl: blobUrl
      })
    }
    // 自动设置名称：多个文件使用文件夹名，单个文件使用文件名
    if (isNew.value && !localProp.value.name && files.length > 0) {
      const firstFile = files[0]
      if (firstFile) {
        let baseName: string
        if (files.length > 1) {
          // 多个文件：使用文件夹名
          baseName = extractFolderName(firstFile.path) || firstFile.name.replace(/\.[^/.]+$/, '')
        } else {
          // 单个文件：使用文件名
          baseName = firstFile.name.replace(/\.[^/.]+$/, '')
        }
        localProp.value.name = generateUniquePropName(baseName)
      }
    }
  }
}

/**
 * 从文件路径提取父文件夹名称
 * 例如: 'props/道具文件夹/image.png' → '道具文件夹'
 */
function extractFolderName(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length >= 2) {
    return parts[parts.length - 2] || ''
  }
  return ''
}

/**
 * 生成唯一的道具名称，如果已存在则添加数字后缀
 */
function generateUniquePropName(baseName: string): string {
  const existingNames = new Set(
    propStore.props.map((p: PropAsset) => p.name)
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

// Fallback Handlers
function handleStaticUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    localProp.value._runtimeUrl = URL.createObjectURL(file)
    localProp.value.url = `blob:${file.name}` // Placeholder
  }
}

function handleStillUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    localProp.value._runtimeStillUrl = URL.createObjectURL(file)
    localProp.value.stillFrameCustomUrl = `blob:${file.name}`
  }
}

function handleFramesUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files) {
    localProp.value.frames ??= []
    Array.from(files).forEach(f => {
      localProp.value.frames!.push({
        id: `frame_${Date.now()}_${Math.random()}`,
        url: `blob:${f.name}`,
        _runtimeUrl: URL.createObjectURL(f)
      })
    })
  }
}

// Animation Logic
function removeFrame(index: number) {
  localProp.value.frames?.splice(index, 1)
  if (currentFrameIndex.value >= (localProp.value.frames?.length ?? 0)) {
    currentFrameIndex.value = Math.max(0, (localProp.value.frames?.length ?? 0) - 1)
  }
}

function setStillFrameToCurrent() {
  localProp.value.stillFrameIndex = currentFrameIndex.value
}

function startPlaying() {
  if (isPlaying.value || !hasFrames.value) return
  isPlaying.value = true
  
  const interval = 1000 / (localProp.value.fps ?? 25)
  playTimer.value = window.setInterval(() => {
    if (!localProp.value.frames) return
    let next = currentFrameIndex.value + 1
    if (next >= localProp.value.frames.length) {
      if (localProp.value.loop) next = 0
      else {
        stopPlaying()
        return
      }
    }
    currentFrameIndex.value = next
  }, interval)
}

function stopPlaying() {
  isPlaying.value = false
  if (playTimer.value) {
    clearInterval(playTimer.value)
    playTimer.value = null
  }
}

// Save
function save() {
  if (!isValid.value) return
  
  if (isNew.value) {
    if (props.resourceType === 'background') {
      const newBg = backgroundStore.createBackground(localProp.value.name!, localProp.value.type)
      backgroundStore.updateBackground(newBg.id, localProp.value)
    } else {
      const newProp = propStore.createProp(localProp.value.name!, localProp.value.type)
      propStore.updateProp(newProp.id, localProp.value)
    }
  } else {
    if (props.propId) {
      if (props.resourceType === 'background') {
        backgroundStore.updateBackground(props.propId, localProp.value)
      } else {
        propStore.updateProp(props.propId, localProp.value)
      }
    }
  }
  
  emit('save')
  close()
}

function handleOverlayClick() {
  // close()
}

function imageFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  return /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)
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

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.close-btn {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #999;
}

.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.batch-body {
  flex-direction: column;
  padding: 24px;
  background: #f9fafb;
}

.batch-toolbar {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  align-items: flex-start;
}

.batch-upload-btn {
  width: 200px;
  height: 100px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
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

.batch-upload-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.batch-setting {
  flex: 1;
}

.batch-setting label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
}

.batch-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.batch-list-container {
  flex: 1;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
}

.batch-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.batch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.batch-item {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  position: relative;
  background: white;
}

.batch-preview {
  height: 100px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.batch-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.batch-name-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px;
  font-size: 12px;
}

.btn-remove-batch {
  position: absolute;
  top: -8px; right: -8px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.preview-column {
  width: 45%;
  background: #f3f4f6;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.canvas-wrapper {
  width: 100%;
  height: 100%;
  background: #1a1a2e; /* Dark background for assets */
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkerboard {
  background-image: 
    linear-gradient(45deg, #2a2a3e 25%, transparent 25%), 
    linear-gradient(-45deg, #2a2a3e 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #2a2a3e 75%), 
    linear-gradient(-45deg, transparent 75%, #2a2a3e 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.empty-preview {
  color: #6b7280;
  font-size: 14px;
}

.config-column {
  width: 55%;
  padding: 24px;
  overflow-y: auto;
  background: white;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #374151;
}

.required { color: red; }

.input-field {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

/* Tags */
.tags-input-container {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
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

.tag-remove {
  background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 14px; padding: 0;
}

.tag-input {
  border: none;
  outline: none;
  flex: 1;
  min-width: 120px;
  font-size: 14px;
}

.recommended-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.recommend-label { color: #6b7280; }

.recommend-tag {
  color: #4b5563;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.recommend-tag:hover {
  background: #e5e7eb;
}

/* Resource Section */
.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 24px 0;
}

.section-title {
  font-weight: 600;
  margin-bottom: 16px;
  color: #111827;
}

.upload-box {
  width: 100%;
  height: 200px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

.upload-box:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #9ca3af;
}

.upload-preview {
  width: 100%;
  height: 100%;
}

.upload-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.upload-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.upload-preview:hover .upload-overlay {
  opacity: 1;
}

/* Animation Config */
.frames-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.frame-item {
  width: 80px;
  height: 80px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.frame-item.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.frame-item img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.btn-delete-frame {
  position: absolute;
  top: 2px; right: 2px;
  background: rgba(0,0,0,0.5);
  color: white;
  border: none;
  border-radius: 50%;
  width: 16px; height: 16px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: none;
}

.frame-item:hover .btn-delete-frame {
  display: block;
}

.frame-idx {
  position: absolute;
  bottom: 2px; left: 2px;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
}

.badge-default {
  position: absolute;
  top: 2px; left: 2px;
  background: #10b981;
  color: white;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
}

.frame-add-btn {
  width: 80px; height: 80px;
  border: 2px dashed #d1d5db;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  cursor: pointer;
}

.frame-add-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.anim-settings {
  background: #f9fafb;
  padding: 16px;
  border-radius: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.input-small {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.select-field {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.hint-text {
  font-size: 12px;
  color: #6b7280;
}

.btn-set-current {
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.custom-still-uploader {
  margin-top: 8px;
}

.mini-upload {
  width: 100px;
  height: 100px;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: white;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  overflow: hidden;
}

.mini-upload img {
  width: 100%; height: 100%; object-fit: contain;
}

.anim-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
}

.anim-controls button {
  background: white;
  color: #1a1a2e;
  border: none;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
}

.hidden { display: none; }

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

.btn-save {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-save:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-anim-manager {
  width: 100%;
  padding: 10px 16px;
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-anim-manager:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.anim-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.anim-manager-dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.anim-manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.anim-manager-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.anim-manager-body {
  flex: 1;
  overflow-y: auto;
  min-height: 300px;
}
</style>
