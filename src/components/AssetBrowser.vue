<template>
  <div
    class="picker-overlay"
    @click.self="$emit('close')"
  >
    <div class="picker-dialog">
      <div class="dialog-header">
        <h2>{{ title }}</h2>
        <button
          class="close-btn"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>
      
      <div class="dialog-content">
        <!-- 左侧筛选栏 -->
        <div class="filter-sidebar">
          <div class="filter-group">
            <h3>标签</h3>
            <div class="tag-list">
              <button 
                class="tag-btn" 
                :class="{ active: currentTag === 'all' }"
                @click="currentTag = 'all'"
              >
                全部
              </button>
              <button 
                v-for="tag in allTags" 
                :key="tag"
                class="tag-btn"
                :class="{ active: currentTag === tag }"
                @click="currentTag = tag"
              >
                {{ tag }}
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="main-content">
          <!-- 顶部工具栏 -->
          <div class="content-toolbar">
            <div
              v-if="typeFilterOptions.length > 0"
              class="type-filters"
            >
              <button 
                v-for="option in typeFilterOptions"
                :key="option.value"
                class="filter-tab"
                :class="{ active: currentType === option.value }"
                @click="currentType = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            
            <div class="sort-box">
              <select
                v-model="sortOrder"
                class="sort-select"
              >
                <option value="newest">
                  📅 最新
                </option>
                <option value="oldest">
                  📅 最早
                </option>
                <template v-if="showDurationSort">
                  <option value="shortest">
                    ⏱️ 时长(短→长)
                  </option>
                  <option value="longest">
                    ⏱️ 时长(长→短)
                  </option>
                </template>
              </select>
            </div>

            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="搜索素材..."
                class="search-input"
              >
            </div>
          </div>

          <!-- 素材网格 (Virtual Scroll) -->
          <div
            ref="containerRef"
            class="asset-grid-container"
          >
            <div
              v-if="filteredAssets.length === 0"
              class="empty-state"
            >
              <p>{{ emptyText }}</p>
            </div>
            
            <RecycleScroller
              v-else
              v-slot="{ item: row }: { item: { id: number, items: Asset[] } }"
              class="scroller"
              :items="virtualRows"
              :item-size="rowHeight"
              key-field="id"
            >
              <div
                class="asset-row"
                :style="{ gap: `${GAP}px` }"
              >
                <AssetCard 
                  v-for="asset in row.items" 
                  :key="asset.id"
                  :asset="asset"
                  :is-selected="selectedAsset?.id === asset.id"
                  :is-playing="playingId === asset.id"
                  :show-play-button="!!showPlayButton"
                  v-bind="{
                    ...(loadImage ? { 'load-image': loadImage } : {}),
                    ...(loadAllFrames ? { 'load-all-frames': loadAllFrames } : {})
                  }"
                  :style="{ width: `${itemWidth}px` }"
                  @select="handleSelect"
                  @confirm="handleConfirm"
                  @toggle-play="togglePlay"
                />
                <!-- 占位元素，确保最后一行左对齐 -->
                <div 
                  v-for="n in (columnCount - row.items.length)" 
                  :key="`placeholder-${n}`"
                  :style="{ width: `${itemWidth}px` }"
                />
              </div>
            </RecycleScroller>
          </div>

          <!-- 底部工具栏 -->
          <div class="footer-toolbar">
            <div class="selection-info">
              <span v-if="selectedAsset">已选: <strong>{{ selectedAsset.name }}</strong></span>
            </div>
            <div class="footer-actions">
              <button
                class="btn-cancel"
                @click="$emit('close')"
              >
                取消
              </button>
              <button 
                class="btn-confirm" 
                :disabled="!selectedAsset"
                @click="selectedAsset && handleConfirm(selectedAsset)"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { chunk } from 'lodash-es'
import { computed, onMounted, onUnmounted,ref } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'

import { useAssetImage } from '@/composables/useAssetImage'
import { useToast } from '@/composables/useToast'

import AssetCard from './AssetCard.vue'

interface Asset {
  id: string
  name?: string
  type: string
  tags?: string[]
  url?: string
  duration?: number
  createdAt?: number
  _runtimeUrl?: string
  [key: string]: unknown
}

interface FilterOption {
  label: string
  value: string
}

const props = defineProps<{
  title: string
  assets: Asset[]
  allTags: string[]
  typeFilterOptions: FilterOption[]
  emptyText: string
  showPlayButton?: boolean
  showDurationSort?: boolean
  loadImage?: (id: string) => Promise<string>
  loadAllFrames?: (id: string) => Promise<string[]>
}>()

const emit = defineEmits<{
  select: [asset: Asset]
  close: []
}>()

const currentTag = ref('all')
const currentType = ref(props.typeFilterOptions[0]?.value ?? 'all')
const sortOrder = ref<'newest' | 'oldest' | 'shortest' | 'longest'>('newest')
const searchQuery = ref('')
const playingId = ref<string | null>(null)
const audioPlayer = ref<HTMLAudioElement | null>(null)
const selectedAsset = ref<Asset | null>(null)
const { getImageUrl, loadImageUrl } = useAssetImage()
const toast = useToast()

// Virtual Scroll Logic
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const MIN_ITEM_WIDTH = 160
const GAP = 20

// 计算列数
const columnCount = computed(() => {
  if (containerWidth.value <= 0) return 1
  // width + gap >= col * (minWidth + gap)
  // width + gap >= col * 180
  const count = Math.floor((containerWidth.value + GAP) / (MIN_ITEM_WIDTH + GAP))
  return Math.max(1, count)
})

// 计算实际 Item 宽度
const itemWidth = computed(() => {
  if (columnCount.value <= 1) return containerWidth.value
  // width = col * w + (col - 1) * gap
  // width = col * w + col * gap - gap
  // width + gap = col * (w + gap)
  // w + gap = (width + gap) / col
  // w = (width + gap) / col - gap
  return (containerWidth.value + GAP) / columnCount.value - GAP
})

// 计算行高 (保持宽高比 1:1 + 底部文字高度)
const rowHeight = computed(() => {
  return itemWidth.value + 45 // 45px reserved for text and margins
})

// 过滤后的素材列表
const filteredAssets = computed(() => {
  const result = props.assets.filter(asset => {
    if (currentTag.value !== 'all' && !asset.tags?.includes(currentTag.value)) return false
    if (currentType.value !== 'all' && asset.type !== currentType.value) return false
    if (searchQuery.value && !(asset.name ?? '').toLowerCase().includes(searchQuery.value.toLowerCase())) return false
    return true
  })

  return result.sort((a, b) => {
    if (sortOrder.value === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    if (sortOrder.value === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0)
    if (sortOrder.value === 'shortest') return (a.duration ?? 0) - (b.duration ?? 0)
    if (sortOrder.value === 'longest') return (b.duration ?? 0) - (a.duration ?? 0)
    return 0
  })
})

// 虚拟行数据
const virtualRows = computed(() => {
  const rows = chunk(filteredAssets.value, columnCount.value)
  return rows.map((items: Asset[], index: number) => ({
    id: index,
    items
  }))
})

// ResizeObserver
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value = null
  }
})

function handleSelect(asset: Asset) {
  selectedAsset.value = asset
  if (props.showPlayButton) {
    togglePlay(asset).catch((err: unknown) => {
      console.error('Failed to toggle play:', err)
    })
  }
}

function handleConfirm(asset: Asset) {
  emit('select', asset)
  emit('close')
}

// 音频播放控制
async function togglePlay(asset: Asset) {
  if (playingId.value === asset.id) {
    audioPlayer.value?.pause()
    playingId.value = null
  } else {
    if (audioPlayer.value) {
      audioPlayer.value.pause()
    }

    // 优先使用 _runtimeUrl
    let playUrl = asset._runtimeUrl || ''

    // 如果没有 _runtimeUrl，通过 loadImageUrl 异步加载磁盘文件
    if (!playUrl && asset.url && !asset.url.startsWith('blob:') && !asset.url.startsWith('data:')) {
      try {
        await loadImageUrl(asset.url)
        playUrl = getImageUrl(asset.url) || ''
        // 过滤掉占位符
        if (playUrl.startsWith('data:')) playUrl = ''
      } catch (e) {
        console.error('Failed to load audio from disk:', e)
      }
    } else if (!playUrl && asset.url?.startsWith('blob:')) {
      playUrl = asset.url
    }

    if (playUrl) {
      try {
        audioPlayer.value = new Audio(playUrl)
        audioPlayer.value.play().catch(e => {
            console.error('Playback failed:', e)
            toast.error('播放失败: ' + (e as Error).message)
        })
        playingId.value = asset.id
        audioPlayer.value.onended = () => {
            playingId.value = null
        }
      } catch (e) {
         console.error('Audio creation failed:', e)
      }
    } else {
        console.error('No valid playback URL found for asset:', asset.name)
        toast.warning('无法播放：未找到有效的音频资源')
    }
  }
}
</script>

<style scoped>
/* ... existing styles ... */
.picker-overlay {
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

.picker-dialog {
  width: 90%;
  max-width: 1000px;
  height: 80vh;
  background: white;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.dialog-header h2 {
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
  overflow: hidden;
}

.filter-sidebar {
  width: 200px;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  padding: 16px;
  overflow-y: auto;
  flex-shrink: 0;
}

.filter-group h3 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-btn {
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-btn:hover {
  background: #e5e7eb;
}

.tag-btn.active {
  background: #e0e7ff;
  color: #4f46e5;
  font-weight: 500;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-toolbar {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
}

.type-filters {
  display: flex;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}

.filter-tab {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.filter-tab.active {
  background: white;
  color: #1f2937;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.sort-box {
  margin-left: auto;
  margin-right: 12px;
}

.sort-select {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.search-box {
  position: relative;
  width: 240px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  font-size: 14px;
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.asset-grid-container {
  flex: 1;
  overflow: hidden; /* Changed from overflow-y: auto to hidden for Virtual Scroller */
  padding: 24px;
  background: #fff;
}

.scroller {
  height: 100%;
}

.asset-row {
  display: flex;
  margin-bottom: 20px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}

.footer-toolbar {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
}

.selection-info {
  font-size: 14px;
  color: #374151;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f3f4f6;
}

.btn-confirm {
  padding: 8px 16px;
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
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
