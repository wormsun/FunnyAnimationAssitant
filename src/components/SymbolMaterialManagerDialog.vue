<template>
  <div
    class="modal-overlay"
    @click.self="emit('close')"
  >
    <div class="manager-dialog">
      <div class="dialog-header">
        <h3>{{ objectName }} — 素材管理</h3>
        <div class="header-actions">
          <button
            v-if="!batchMode"
            class="header-btn"
            title="批量管理"
            @click="batchMode = true"
          >
            📦 批量管理
          </button>
          <button
            v-else
            class="header-btn"
            @click="exitBatchMode"
          >
            ← 退出批量
          </button>
          <button
            class="close-btn"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>

      <div class="dialog-body">
        <!-- Material Grid -->
        <div class="material-grid">
          <div
            v-for="mat in localMaterials"
            :key="mat.id"
            class="material-card"
            :class="{
              active: !batchMode && mat.id === localCurrentId,
              selected: batchMode && selectedIds.has(mat.id)
            }"
            @click="handleCardClick(mat)"
            @dblclick.stop="!batchMode && handleEditMaterial(mat.id)"
          >
            <!-- Current badge -->
            <div
              v-if="!batchMode && mat.id === localCurrentId"
              class="current-badge"
            >
              ✓ 当前
            </div>
            <!-- Batch checkbox -->
            <div
              v-if="batchMode"
              class="batch-checkbox"
            >
              <input
                :checked="selectedIds.has(mat.id)"
                type="checkbox"
                @click.stop="toggleSelect(mat.id)"
              >
            </div>
            <div class="card-preview">
              <img
                v-if="mat.type === 'static' && resolveUrl(mat.url)"
                :src="resolveUrl(mat.url)"
                alt=""
                @error="handleImageError"
              >
              <img
                v-else-if="mat.type === 'animation' && mat.frames && mat.frames.length > 0 && resolveUrl(mat.frames[0]!.url)"
                :src="resolveUrl(mat.frames[0]!.url)"
                alt=""
                @error="handleImageError"
              >
              <div
                v-else-if="mat.type === 'animation'"
                class="placeholder-icon"
              >
                🎞️
              </div>
              <div
                v-else
                class="placeholder-icon"
              >
                📄
              </div>
            </div>
            <div class="card-info">
              <span class="card-name">{{ mat.name }}</span>
              <span class="card-type">{{ mat.type === 'static' ? '静态' : '动画' }}</span>
            </div>
            <!-- Card bottom actions -->
            <div
              v-if="!batchMode"
              class="card-bottom-actions"
            >
              <button
                class="btn-edit"
                @click.stop="handleEditMaterial(mat.id)"
              >
                ✏️ 编辑
              </button>
              <button
                class="btn-del"
                :disabled="materials.length <= 1"
                @click.stop="handleDeleteMaterial(mat.id)"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>

        <!-- Add Button -->
        <button
          class="add-material-btn"
          @click="handleAddMaterial"
        >
          ➕ 添加素材
        </button>

        <!-- Batch footer -->
        <div
          v-if="batchMode"
          class="batch-footer"
        >
          <label class="batch-select-all">
            <input
              :checked="selectedIds.size === localMaterials.length && localMaterials.length > 0"
              type="checkbox"
              @change="toggleSelectAll"
            >
            全选 ({{ selectedIds.size }}/{{ localMaterials.length }})
          </label>
          <button
            class="batch-delete-btn"
            :disabled="selectedIds.size === 0 || selectedIds.size === localMaterials.length"
            @click="handleBatchDelete"
          >
            🗑️ 批量删除 ({{ selectedIds.size }})
          </button>
        </div>
      </div>

      <!-- Footer: 确定 / 取消 -->
      <div class="dialog-footer">
        <div class="footer-info" />
        <div class="footer-actions">
          <button
            class="btn-cancel"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="btn-confirm"
            @click="handleConfirm"
          >
            ✓ 确定
          </button>
        </div>
      </div>

      <!-- Edit Modal -->
      <div
        v-if="editingMaterial"
        class="edit-overlay"
        @click.self="editingMaterial = null"
      >
        <div class="edit-modal">
          <div class="edit-header">
            <h4>{{ editingMaterial.isNew ? '添加素材' : '编辑素材' }}</h4>
            <button
              class="close-btn"
              @click="editingMaterial = null"
            >
              ×
            </button>
          </div>

          <div class="edit-body">
            <!-- Left: Preview -->
            <div class="edit-preview-panel">
              <div class="preview-frame">
                <img
                  v-if="currentPreviewImage"
                  :src="currentPreviewImage"
                  alt="预览"
                >
                <div
                  v-else
                  class="preview-placeholder"
                >
                  <span class="placeholder-icon-large">🖼️</span>
                  <span>暂无预览</span>
                </div>
              </div>
              <div class="preview-controls">
                <button
                  v-if="editingMaterial.type === 'animation' && editingMaterial.frames.length > 0"
                  class="btn-play-test"
                  @mousedown="handlePlayStart"
                  @mouseup="handlePlayEnd"
                  @mouseleave="handlePlayEnd"
                >
                  ▶ 按住播放测试
                </button>
              </div>
              <div class="preview-status">
                <span>类型: {{ editingMaterial.type === 'static' ? '静态图' : '序列帧动画' }}</span>
                <span v-if="editingMaterial.type === 'animation' && editingMaterial.frames.length > 0">
                  · {{ editingMaterial.frames.length }} 帧
                </span>
                <span v-if="isPlaying && editingMaterial.frames.length > 0">
                  · 当前帧: {{ currentFrameIndex + 1 }}
                </span>
              </div>
              <div
                v-if="displayAssetPath"
                class="asset-path-hint"
                :title="displayAssetPath"
              >
                📂 {{ displayAssetPath }}
              </div>
            </div>

            <!-- Right: Form -->
            <div class="edit-form-panel">
              <div class="form-group">
                <label>素材名称 *</label>
                <input
                  v-model="editingMaterial.name"
                  type="text"
                  class="form-input"
                  placeholder="输入素材名称"
                >
              </div>

              <div class="form-group">
                <label>类型</label>
                <div class="type-selector">
                  <label class="radio-label">
                    <input
                      v-model="editingMaterial.type"
                      type="radio"
                      value="static"
                    >
                    静态图片
                  </label>
                  <label class="radio-label">
                    <input
                      v-model="editingMaterial.type"
                      type="radio"
                      value="animation"
                    >
                    序列帧
                  </label>
                </div>
              </div>

              <!-- Static mode: single image -->
              <div
                v-if="editingMaterial.type === 'static'"
                class="form-group"
              >
                <label>图片资源 *</label>
                <div class="file-upload-area">
                  <div
                    v-if="editingMaterial.url || editingMaterial._runtimeUrl"
                    class="upload-preview"
                  >
                    <img
                      :src="editingMaterial._runtimeUrl || resolveUrl(editingMaterial.url)"
                      alt="已上传"
                      @error="handleImageError"
                    >
                    <button
                      class="btn-replace"
                      @click="uploadStaticImage"
                    >
                      替换
                    </button>
                  </div>
                  <div
                    v-else
                    class="upload-placeholder-btn"
                    @click="uploadStaticImage"
                  >
                    <span>📂 点击选择图片</span>
                  </div>
                  <input
                    ref="staticFileInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style="display: none"
                    @change="handleStaticFileSelect"
                  >
                </div>
              </div>

              <!-- Animation mode: frames -->
              <template v-if="editingMaterial.type === 'animation'">
                <div class="form-group">
                  <label>序列帧 *</label>
                  <p class="form-hint">点击帧可设置为默认静止图</p>
                  <div class="frames-grid">
                    <div
                      v-for="(frame, index) in editingMaterial.frames"
                      :key="index"
                      class="frame-item"
                      :class="{ 'is-default': !useCustomStillFrame && selectedStillFrameIndex === index }"
                      title="点击设为静止帧"
                      @click="selectAsStillFrame(index)"
                    >
                      <img
                        :src="frame._runtimeUrl || resolveUrl(frame.url)"
                        alt=""
                        @error="handleImageError"
                      >
                      <div class="frame-index">{{ index + 1 }}</div>
                      <div
                        v-if="!useCustomStillFrame && selectedStillFrameIndex === index"
                        class="default-badge"
                      >
                        默认
                      </div>
                      <button
                        class="frame-remove"
                        @click.stop="removeFrame(index)"
                      >
                        ×
                      </button>
                    </div>
                    <div
                      class="frame-add-btn"
                      @click="addFrames"
                    >
                      <span>+</span>
                    </div>
                  </div>
                  <input
                    ref="framesFileInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    style="display: none"
                    @change="handleFramesUpload"
                  >
                </div>

                <!-- 默认静止图 -->
                <div class="form-group">
                  <label>默认静止图 *</label>
                  <p class="form-hint">动画停止时显示的图片，可从序列帧中选择或单独上传</p>
                  <div class="still-frame-source-selector">
                    <label class="radio-label">
                      <input
                        v-model="useCustomStillFrame"
                        type="radio"
                        :value="false"
                        :disabled="editingMaterial.frames.length === 0"
                      >
                      使用序列帧
                      <span
                        v-if="!useCustomStillFrame && editingMaterial.frames.length > 0"
                        class="source-badge"
                      >第 {{ selectedStillFrameIndex + 1 }} 帧</span>
                    </label>
                    <label class="radio-label">
                      <input
                        v-model="useCustomStillFrame"
                        type="radio"
                        :value="true"
                      >
                      自定义上传
                      <span
                        v-if="useCustomStillFrame"
                        class="source-badge custom"
                      >独立图片</span>
                    </label>
                  </div>
                  <div class="still-frame-preview">
                    <div
                      v-if="stillFramePreviewSrc"
                      class="upload-preview still"
                    >
                      <img
                        :src="stillFramePreviewSrc"
                        alt="静止帧"
                      >
                      <button
                        v-if="useCustomStillFrame"
                        class="btn-replace"
                        @click="uploadCustomStillFrame"
                      >
                        替换
                      </button>
                    </div>
                    <div
                      v-else-if="useCustomStillFrame"
                      class="upload-placeholder-btn"
                      @click="uploadCustomStillFrame"
                    >
                      <span>📂 点击上传静止图</span>
                    </div>
                    <div
                      v-else
                      class="upload-placeholder-btn disabled"
                    >
                      <span>请先上传序列帧</span>
                    </div>
                    <input
                      ref="stillFrameInput"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style="display: none"
                      @change="handleStillFrameUpload"
                    >
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group half">
                    <label>FPS</label>
                    <input
                      v-model.number="editingMaterial.fps"
                      type="number"
                      class="form-input"
                      min="1"
                      max="60"
                    >
                  </div>
                  <div class="form-group half">
                    <label>循环</label>
                    <label class="checkbox-label">
                      <input
                        v-model="editingMaterial.loop"
                        type="checkbox"
                      >
                      循环播放
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <div class="edit-footer">
            <button
              class="btn-cancel"
              @click="editingMaterial = null"
            >
              取消
            </button>
            <button
              class="btn-save"
              :disabled="!canSave"
              @click="handleSaveMaterial"
            >
              ✓ 保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- FileBrowserDialog -->
    <FileBrowserDialog
      v-if="showFileBrowser"
      title="选择图片"
      :file-filter="imageFileFilter"
      :multiple="fileBrowserMultiple"
      @select="handleFileBrowserSelect"
      @close="showFileBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import FileBrowserDialog from '@/components/FileBrowserDialog.vue'
import { useAssetImage } from '@/composables/useAssetImage'
import { useProjectStore } from '@/stores/projectStore'
import type { SelectedFile } from '@/types/fileBrowser'
import type { SymbolMaterial } from '@/types/sceneObject'
import { fileToBlob } from '@/utils/fileUtils'

interface Props {
  objectName: string
  materials: SymbolMaterial[]
  currentMaterialId: string | undefined
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', materials: SymbolMaterial[], currentMaterialId: string | undefined): void
}>()

const projectStore = useProjectStore()
const { getImageUrl } = useAssetImage()

/** 解析 URL：通过 getImageUrl 解析项目路径 */
function resolveUrl(url: string | undefined): string {
  if (!url) return ''
  // blob:/data: URL 不透传（可能是来自持久化数据的陌生 blob URL，已失效）
  // 当前会话新创建的 blob URL 按 _runtimeUrl 优先级在调用方处理
  if (url.startsWith('blob:') || url.startsWith('data:')) return ''
  return getImageUrl(url) || ''
}

// ===== Local State (buffered copy) =====
const localMaterials = ref<SymbolMaterial[]>([])
const localCurrentId = ref<string | undefined>(undefined)

// Initialize local copies — 显式提取已知字段，避免运行时残留的 _runtimeUrl 等属性泄漏
localMaterials.value = props.materials.map(m => ({
  id: m.id,
  name: m.name,
  type: m.type,
  ...(m.url != null ? { url: m.url } : {}),
  ...(m.frames ? { frames: m.frames.map(f => ({ url: f.url })) } : {}),
  ...(m.fps != null ? { fps: m.fps } : {}),
  ...(m.loop != null ? { loop: m.loop } : {}),
  ...(m.stillFrameSource ? { stillFrameSource: m.stillFrameSource } : {}),
  ...(m.stillFrameIndex != null ? { stillFrameIndex: m.stillFrameIndex } : {}),
}))
localCurrentId.value = props.currentMaterialId



function handleConfirm() {
  emit('save', localMaterials.value, localCurrentId.value)
  emit('close')
}

// ===== File Browser =====
const showFileBrowser = ref(false)
const fileBrowserMode = ref<'static' | 'frames'>('static')
const fileBrowserMultiple = ref(false)

function imageFileFilter(file: FileSystemFileHandle): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
         name.endsWith('.gif') || name.endsWith('.webp')
}

async function handleFileBrowserSelect(files: SelectedFile[]) {
  if (!editingMaterial.value || files.length === 0) {
    showFileBrowser.value = false
    return
  }

  if (fileBrowserMode.value === 'static') {
    const f = files[0]!
    const blob = f.handle ? await f.handle.getFile() : null
    if (blob) {
      const blobUrl = URL.createObjectURL(blob)
      editingMaterial.value._runtimeUrl = blobUrl
      editingMaterial.value.url = f.path || f.name
      // 自动填充名称：使用文件名（去扩展名）
      if (!editingMaterial.value.name || editingMaterial.value.name.startsWith('素材')) {
        editingMaterial.value.name = f.name.replace(/\.[^/.]+$/, '')
      }
    }
  } else if (fileBrowserMode.value === 'frames') {
    for (const f of files) {
      const blob = f.handle ? await f.handle.getFile() : null
      if (blob) {
        const blobUrl = URL.createObjectURL(blob)
        editingMaterial.value.frames.push({
          url: f.path || f.name,
          _runtimeUrl: blobUrl,
        })
      }
    }
    // 自动填充名称：多帧动画使用文件夹名称
    if (files.length > 0 && (!editingMaterial.value.name || editingMaterial.value.name.startsWith('素材'))) {
      const folderName = extractFolderName(files[0]!.path || files[0]!.name)
      if (folderName) {
        editingMaterial.value.name = folderName
      }
    }
  }

  showFileBrowser.value = false
}

/**
 * 从文件路径提取父文件夹名称
 */
function extractFolderName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  if (parts.length >= 2) {
    return parts[parts.length - 2] || ''
  }
  return ''
}

// ===== Batch Mode =====

const batchMode = ref(false)
const selectedIds = ref(new Set<string>())

function exitBatchMode() {
  batchMode.value = false
  selectedIds.value.clear()
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

function toggleSelectAll() {
  if (selectedIds.value.size === localMaterials.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(localMaterials.value.map(m => m.id))
  }
}

function handleBatchDelete() {
  if (selectedIds.value.size === localMaterials.value.length) return
  localMaterials.value = localMaterials.value.filter(m => !selectedIds.value.has(m.id))
  // If current was deleted, switch to first
  if (localCurrentId.value && selectedIds.value.has(localCurrentId.value)) {
    localCurrentId.value = localMaterials.value[0]?.id
  }
  selectedIds.value.clear()
}

function handleCardClick(mat: SymbolMaterial) {
  if (batchMode.value) {
    toggleSelect(mat.id)
  } else {
    handleSelectMaterial(mat.id)
  }
}

// ===== Edit Modal =====

interface EditingMaterialForm {
  id: string
  isNew: boolean
  name: string
  type: 'static' | 'animation'
  url?: string
  /** 编辑期间的 blob URL（仅用于当前会话预览，不持久化） */
  _runtimeUrl?: string
  frames: { url: string; _runtimeUrl?: string }[]
  fps: number
  loop: boolean
}

const editingMaterial = ref<EditingMaterialForm | null>(null)

// ===== Still Frame (静止帧) =====
const useCustomStillFrame = ref(false)
const selectedStillFrameIndex = ref(0)
const customStillFrameUrl = ref('')
const stillFrameInput = ref<HTMLInputElement | null>(null)
const staticFileInput = ref<HTMLInputElement | null>(null)
const framesFileInput = ref<HTMLInputElement | null>(null)

// ===== Animation Preview =====
const isPlaying = ref(false)
const currentFrameIndex = ref(0)
let animationTimer: number | null = null

const currentPreviewImage = computed(() => {
  if (!editingMaterial.value) return ''
  if (editingMaterial.value.type === 'static') {
    return editingMaterial.value._runtimeUrl || resolveUrl(editingMaterial.value.url)
  }
  // Animation mode
  if (isPlaying.value && editingMaterial.value.frames.length > 0) {
    const f = editingMaterial.value.frames[currentFrameIndex.value]!
    return f._runtimeUrl || resolveUrl(f.url)
  }
  // Default: show still frame
  return stillFramePreviewSrc.value
})

// v16: 素材资源路径显示（参考 PropEditorModal.displayAssetPath）
const displayAssetPath = computed(() => {
  if (!editingMaterial.value) return ''
  if (editingMaterial.value.type === 'static') {
    const url = editingMaterial.value.url
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return ''
    return url
  } else if (editingMaterial.value.type === 'animation') {
    const frames = editingMaterial.value.frames
    if (!frames || frames.length === 0) return ''
    const firstUrl = frames[0]?.url
    if (!firstUrl || firstUrl.startsWith('blob:') || firstUrl.startsWith('data:')) return ''
    return `${firstUrl} (共${frames.length}帧)`
  }
  return ''
})


const stillFramePreviewSrc = computed(() => {
  if (!editingMaterial.value) return ''
  if (useCustomStillFrame.value && customStillFrameUrl.value) {
    return customStillFrameUrl.value
  }
  const frames = editingMaterial.value.frames
  if (frames.length > 0 && selectedStillFrameIndex.value < frames.length) {
    const f = frames[selectedStillFrameIndex.value]!
    return f._runtimeUrl || resolveUrl(f.url)
  }
  if (frames.length > 0) {
    return frames[0]!._runtimeUrl || resolveUrl(frames[0]!.url)
  }
  return ''
})

const canSave = computed(() => {
  if (!editingMaterial.value) return false
  if (!editingMaterial.value.name.trim()) return false
  if (editingMaterial.value.type === 'static' && !editingMaterial.value.url) return false
  if (editingMaterial.value.type === 'animation' && editingMaterial.value.frames.length === 0) return false
  return true
})

function handleSelectMaterial(materialId: string) {
  localCurrentId.value = materialId
}

function handleAddMaterial() {
  useCustomStillFrame.value = false
  selectedStillFrameIndex.value = 0
  customStillFrameUrl.value = ''
  editingMaterial.value = {
    id: '',
    isNew: true,
    name: `素材${localMaterials.value.length + 1}`,
    type: 'static',
    frames: [],
    fps: 25,
    loop: true,
  }
}

function handleEditMaterial(materialId: string) {
  const mat = localMaterials.value.find(m => m.id === materialId)
  if (!mat) return
  editingMaterial.value = {
    id: mat.id,
    isNew: false,
    name: mat.name,
    type: mat.type,
    fps: mat.fps ?? 25,
    loop: mat.loop ?? true,
    frames: mat.frames ? mat.frames.map(f => ({ url: f.url })) : [],
    ...(mat.url != null ? { url: mat.url } : {}),
  }
  // 初始化静止帧状态
  if (mat.type === 'animation') {
    if (mat.stillFrameSource === 'custom') {
      useCustomStillFrame.value = true
      customStillFrameUrl.value = mat.url || ''
      selectedStillFrameIndex.value = 0
    } else {
      useCustomStillFrame.value = false
      selectedStillFrameIndex.value = mat.stillFrameIndex ?? 0
      customStillFrameUrl.value = ''
    }
  } else {
    useCustomStillFrame.value = false
    selectedStillFrameIndex.value = 0
    customStillFrameUrl.value = ''
  }
}

function handleDeleteMaterial(materialId: string) {
  localMaterials.value = localMaterials.value.filter(m => m.id !== materialId)
  if (localCurrentId.value === materialId) {
    localCurrentId.value = localMaterials.value[0]?.id
  }
}

// File upload — with FileBrowserDialog support
function uploadStaticImage() {
  if (projectStore.isProjectOpen) {
    fileBrowserMode.value = 'static'
    fileBrowserMultiple.value = false
    showFileBrowser.value = true
  } else {
    staticFileInput.value?.click()
  }
}

function addFrames() {
  if (projectStore.isProjectOpen) {
    fileBrowserMode.value = 'frames'
    fileBrowserMultiple.value = true
    showFileBrowser.value = true
  } else {
    framesFileInput.value?.click()
  }
}

// Native file input fallbacks
function handleStaticFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !editingMaterial.value) return
  const blobUrl = fileToBlob(file)
  editingMaterial.value._runtimeUrl = blobUrl
  editingMaterial.value.url = file.name
  // 自动填充名称：使用文件名（去扩展名）
  if (!editingMaterial.value.name || editingMaterial.value.name.startsWith('素材')) {
    editingMaterial.value.name = file.name.replace(/\.[^/.]+$/, '')
  }
  target.value = ''
}

function handleFramesUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || !editingMaterial.value) return
  const sorted = Array.from(files).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )
  for (const file of sorted) {
    const blobUrl = fileToBlob(file)
    editingMaterial.value.frames.push({
      url: file.name,
      _runtimeUrl: blobUrl,
    })
  }
  // 自动填充名称：多帧动画使用首个文件名的前缀（去掉末尾数字和扩展名）
  if (sorted.length > 0 && (!editingMaterial.value.name || editingMaterial.value.name.startsWith('素材'))) {
    const firstName = sorted[0]!.name.replace(/\.[^/.]+$/, '')
    // 尝试去掉末尾数字序号，如 "walk_001" → "walk"
    const baseName = firstName.replace(/[_-]?\d+$/, '')
    editingMaterial.value.name = baseName || firstName
  }
  target.value = ''
}

function removeFrame(index: number) {
  editingMaterial.value?.frames.splice(index, 1)
  if (selectedStillFrameIndex.value >= (editingMaterial.value?.frames.length ?? 0)) {
    selectedStillFrameIndex.value = Math.max(0, (editingMaterial.value?.frames.length ?? 1) - 1)
  }
}

function selectAsStillFrame(index: number) {
  useCustomStillFrame.value = false
  selectedStillFrameIndex.value = index
}

function uploadCustomStillFrame() {
  if (projectStore.isProjectOpen) {
    fileBrowserMode.value = 'static'
    fileBrowserMultiple.value = false
    showFileBrowser.value = true
  } else {
    stillFrameInput.value?.click()
  }
}

function handleStillFrameUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  customStillFrameUrl.value = fileToBlob(file)
  useCustomStillFrame.value = true
  target.value = ''
}

function handlePlayStart() {
  if (!editingMaterial.value || editingMaterial.value.frames.length === 0) return
  isPlaying.value = true
  currentFrameIndex.value = 0
  const fps = editingMaterial.value.fps || 25
  animationTimer = window.setInterval(() => {
    if (!editingMaterial.value) { handlePlayEnd(); return }
    currentFrameIndex.value = (currentFrameIndex.value + 1) % editingMaterial.value.frames.length
  }, 1000 / fps)
}

function handlePlayEnd() {
  isPlaying.value = false
  if (animationTimer !== null) {
    clearInterval(animationTimer)
    animationTimer = null
  }
}

function handleImageError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none'
}

function handleSaveMaterial() {
  if (!editingMaterial.value) return

  if (!editingMaterial.value.isNew) {
    // Update existing
    const updates: Partial<SymbolMaterial> = {
      name: editingMaterial.value.name,
      type: editingMaterial.value.type,
    }
    if (editingMaterial.value.type === 'static') {
      if (editingMaterial.value.url != null) updates.url = editingMaterial.value.url
    } else {
      updates.frames = editingMaterial.value.frames
      updates.fps = editingMaterial.value.fps
      updates.loop = editingMaterial.value.loop
      // 静止帧信息
      if (useCustomStillFrame.value) {
        updates.stillFrameSource = 'custom'
        const customUrl = customStillFrameUrl.value
        if (customUrl) updates.url = customUrl
        delete updates.stillFrameIndex
      } else {
        updates.stillFrameSource = 'frame'
        updates.stillFrameIndex = selectedStillFrameIndex.value
        // url 指向选中的帧
        const frames = editingMaterial.value.frames
        if (frames.length > 0 && selectedStillFrameIndex.value < frames.length) {
          const sf = frames[selectedStillFrameIndex.value]!
          updates.url = sf.url
        }
      }
    }
    // Update in local list
    localMaterials.value = localMaterials.value.map(m =>
      m.id === editingMaterial.value!.id ? { ...m, ...updates } : m
    )
  } else {
    // Add new
    const newMat: SymbolMaterial = {
      id: `mat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: editingMaterial.value.name,
      type: editingMaterial.value.type,
    }
    if (editingMaterial.value.type === 'static') {
      if (editingMaterial.value.url != null) newMat.url = editingMaterial.value.url
    } else {
      newMat.frames = editingMaterial.value.frames
      newMat.fps = editingMaterial.value.fps
      newMat.loop = editingMaterial.value.loop
      if (useCustomStillFrame.value) {
        newMat.stillFrameSource = 'custom'
        const customUrl = customStillFrameUrl.value
        if (customUrl) newMat.url = customUrl
      } else {
        newMat.stillFrameSource = 'frame'
        newMat.stillFrameIndex = selectedStillFrameIndex.value
        const frames = editingMaterial.value.frames
        if (frames.length > 0 && selectedStillFrameIndex.value < frames.length) {
          const sf = frames[selectedStillFrameIndex.value]!
          newMat.url = sf.url
        }
      }
    }
    localMaterials.value.push(newMat)
    // Auto-select if first material
    if (localMaterials.value.length === 1) {
      localCurrentId.value = newMat.id
    }
  }

  editingMaterial.value = null
}
</script>

<style scoped>
/* ===== Overlay ===== */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* ===== Dialog ===== */
.manager-dialog {
  background: #ffffff;
  color: #333;
  width: 960px;
  max-width: 92vw;
  min-height: 600px;
  max-height: 88vh;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  position: relative;
}

/* ===== Header ===== */
.dialog-header {
  padding: 18px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #111827;
}

.header-actions { display: flex; gap: 10px; align-items: center; }

.header-btn {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #374151;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}
.header-btn:hover { border-color: #2563EB; color: #2563EB; background: #eff6ff; }

.close-btn {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #9ca3af;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.close-btn:hover { color: #111827; background: #f3f4f6; }

/* ===== Dialog Footer ===== */
.dialog-footer {
  padding: 14px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.footer-info {
  flex: 1;
}
.changes-hint {
  font-size: 12px;
  color: #d97706;
}
.footer-actions {
  display: flex;
  gap: 10px;
}
.btn-confirm {
  padding: 8px 24px;
  background: linear-gradient(135deg, #2563EB 0%, #3b82f6 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-confirm:hover { box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); transform: translateY(-1px); }

/* ===== Body ===== */
.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* ===== Material Grid ===== */
.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.material-card {
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
  position: relative;
  background: #fafafa;
}
.material-card:hover { border-color: #93c5fd; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1); }
.material-card.active { border-color: #2563EB; background: #eff6ff; }
.material-card.selected { border-color: #f59e0b; background: #fffbeb; }

.batch-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
}
.batch-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: #2563EB;
  cursor: pointer;
}

.card-preview {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}
.card-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.placeholder-icon { font-size: 32px; opacity: 0.35; }

.card-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #111827;
}
.card-type { font-size: 11px; color: #6b7280; }

/* Current badge */
.current-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  background: #2563EB;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  z-index: 2;
  letter-spacing: 0.5px;
}

/* Bottom action bar */
.card-bottom-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid #f3f4f6;
  justify-content: center;
}
.material-card:not(:hover) .card-bottom-actions {
  visibility: hidden;
}



.btn-edit, .btn-del {
  padding: 3px 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.btn-edit:hover { border-color: #93c5fd; background: #eff6ff; }
.btn-del:hover { border-color: #fca5a5; background: #fef2f2; }
.btn-del:disabled { opacity: 0.3; cursor: not-allowed; }

/* ===== Add Button ===== */
.add-material-btn {
  width: 100%;
  padding: 14px;
  border: 2px dashed #d1d5db;
  background: none;
  border-radius: 10px;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
}
.add-material-btn:hover { border-color: #2563EB; color: #2563EB; background: #eff6ff; }

/* ===== Batch Footer ===== */
.batch-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0 0;
  border-top: 1px solid #e5e7eb;
  margin-top: 16px;
}
.batch-select-all {
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.batch-select-all input { accent-color: #2563EB; }
.batch-delete-btn {
  padding: 8px 16px;
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}
.batch-delete-btn:hover { background: #fee2e2; }
.batch-delete-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ===== Edit Overlay ===== */
.edit-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  z-index: 10;
}

.edit-modal {
  background: #ffffff;
  border-radius: 12px;
  width: 900px;
  height: 700px;
  max-width: 95vw;
  max-height: 90vh;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.edit-header h4 { margin: 0; font-size: 16px; font-weight: 600; color: #111827; }

.edit-body {
  flex: 1;
  display: flex;
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
}

/* ===== Edit Preview Panel ===== */
.edit-preview-panel {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-frame {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }

.preview-controls {
  display: flex;
  justify-content: center;
}

.btn-play-test {
  padding: 6px 16px;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  color: #2563EB;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  user-select: none;
}
.btn-play-test:hover { background: #dbeafe; }
.btn-play-test:active { background: #bfdbfe; }

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #9ca3af;
  font-size: 13px;
}
.placeholder-icon-large { font-size: 40px; opacity: 0.5; }

.preview-status {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

/* ===== Edit Form Panel ===== */
.edit-form-panel {
  flex: 1;
  min-width: 0;
}

.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 6px;
  color: #374151;
  font-size: 13px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.form-input:focus { outline: none; border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }

.type-selector { display: flex; gap: 20px; }
.radio-label {
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.radio-label input { accent-color: #2563EB; }
.checkbox-label {
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.checkbox-label input { accent-color: #2563EB; }

/* ===== File Upload ===== */
.file-upload-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-preview {
  position: relative;
  width: 100%;
  height: 100px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.btn-replace {
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #d1d5db;
  color: #374151;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.btn-replace:hover { border-color: #2563EB; color: #2563EB; }

.upload-placeholder-btn {
  padding: 20px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 13px;
  transition: all 0.15s;
}
.upload-placeholder-btn:hover { border-color: #2563EB; color: #2563EB; background: #eff6ff; }

/* ===== Frames Grid ===== */
.frames-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.frame-item {
  width: 56px;
  height: 56px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  background: #f3f4f6;
}
.frame-item img { width: 100%; height: 100%; object-fit: cover; }
.frame-index {
  position: absolute;
  bottom: 2px;
  left: 2px;
  font-size: 9px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
}
.frame-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 18px;
  height: 18px;
  background: rgba(220, 38, 38, 0.85);
  color: white;
  border: none;
  font-size: 11px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border-radius: 0 6px 0 6px;
}
.frame-item:hover .frame-remove { display: flex; }
.frame-add-btn {
  width: 56px;
  height: 56px;
  border: 2px dashed #d1d5db;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #9ca3af;
  font-size: 22px;
  transition: all 0.15s;
}
.frame-add-btn:hover { border-color: #2563EB; color: #2563EB; background: #eff6ff; }

.form-row { display: flex; gap: 16px; }
.form-group.half { flex: 1; }

/* ===== Edit Footer ===== */
.edit-footer {
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  padding: 8px 20px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
}
.btn-cancel:hover { border-color: #9ca3af; }

.btn-save {
  padding: 8px 24px;
  background: linear-gradient(135deg, #2563EB 0%, #3b82f6 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-save:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); transform: translateY(-1px); }
.btn-save:disabled { opacity: 0.45; cursor: not-allowed; }

/* ===== Still Frame ===== */
.form-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #9ca3af;
}

.frame-item.is-default {
  border-color: #2563EB;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.default-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 8px;
  background: #2563EB;
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.still-frame-source-selector {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.source-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  font-size: 11px;
  background: #eff6ff;
  color: #2563EB;
  border-radius: 10px;
  font-weight: 500;
}
.source-badge.custom {
  background: #fef3c7;
  color: #b45309;
}

.still-frame-preview {
  margin-top: 6px;
}

.upload-preview.still {
  height: 80px;
}

.upload-placeholder-btn.disabled {
  cursor: default;
  opacity: 0.5;
}
.upload-placeholder-btn.disabled:hover {
  border-color: #d1d5db;
  color: #6b7280;
  background: none;
}
/* ===== Asset Path Hint ===== */
.asset-path-hint {
  margin-top: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: #9ca3af;
  background: #1e1e2e;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
