<template>
  <div class="zoom-controls">
    <button
      class="zoom-btn"
      title="缩小 (Ctrl+-)"
      @click="zoomOut"
    >
      −
    </button>
    <button
      class="zoom-percentage"
      :title="`当前缩放: ${displayPercent}%\n点击选择预设`"
      @click="togglePresets"
    >
      {{ displayPercent }}%
    </button>
    <button
      class="zoom-btn"
      title="放大 (Ctrl+=)"
      @click="zoomIn"
    >
      +
    </button>
    <button
      class="zoom-btn fit-btn"
      title="适配视口 (Ctrl+0)"
      @click="$emit('fit')"
    >
      ⊡
    </button>

    <!-- 预设下拉 -->
    <div v-if="showPresets" class="presets-dropdown">
      <button
        v-for="preset in presets"
        :key="preset"
        class="preset-item"
        :class="{ active: Math.abs(currentZoom * 100 - preset) < 1 }"
        @click="selectPreset(preset)"
      >
        {{ preset }}%
      </button>
      <div class="preset-divider" />
      <button class="preset-item" @click="$emit('fit'); showPresets = false">
        适配高度
      </button>
      <button class="preset-item" @click="$emit('fit-all'); showPresets = false">
        全部可见
      </button>
      <button class="preset-item" @click="$emit('zoom-100'); showPresets = false">
        实际像素
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  currentZoom: number   // userZoom 值
}>()

const emit = defineEmits<{
  'zoom-change': [zoom: number]
  'fit': []
  'fit-all': []
  'zoom-100': []
}>()

const showPresets = ref(false)

const ZOOM_STEP = 1.2
const presets = [25, 50, 75, 100, 150, 200, 400]

const displayPercent = computed(() => Math.round(props.currentZoom * 100))

function zoomIn() {
  emit('zoom-change', props.currentZoom * ZOOM_STEP)
}

function zoomOut() {
  emit('zoom-change', props.currentZoom / ZOOM_STEP)
}

function togglePresets() {
  showPresets.value = !showPresets.value
}

function selectPreset(percent: number) {
  emit('zoom-change', percent / 100)
  showPresets.value = false
}
</script>

<style scoped>
.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 3px 4px;
  z-index: 100;
  user-select: none;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #d1d5db;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 5px;
  transition: background 0.15s, color 0.15s;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.zoom-btn:active {
  background: rgba(255, 255, 255, 0.18);
}

.zoom-btn.fit-btn {
  font-size: 14px;
  margin-left: 2px;
}

.zoom-percentage {
  min-width: 48px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #e5e7eb;
  font-size: 12px;
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  cursor: pointer;
  border-radius: 5px;
  padding: 0 6px;
  transition: background 0.15s;
}

.zoom-percentage:hover {
  background: rgba(255, 255, 255, 0.1);
}

.presets-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 4px;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.preset-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #d1d5db;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}

.preset-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.preset-item.active {
  color: #8b5cf6;
  font-weight: 600;
}

.preset-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 8px;
}
</style>
