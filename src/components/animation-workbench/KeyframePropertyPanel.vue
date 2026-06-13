<!--
  KeyframePropertyPanel.vue — 右侧属性编辑面板（三态切换）
  
  v5.0: 三态面板
  - 状态 A (none): 无选中 → 动画级属性（循环、填充模式、轨道列表）
  - 状态 B (track): 选中轨道 → 轨道级属性（按 trackType 分类）
  - 状态 C (keyframe): 选中关键帧 → 帧级属性（按 keyframe 类型分类）
-->
<template>
  <div class="keyframe-property-panel">
    <!-- ===== 状态 A: 无选中 → 引导提示 ===== -->
    <template v-if="selectionMode === 'none'">
      <div class="animation-overview">
        <div class="section-header">动画属性</div>
        <div class="overview-row">
          <span class="overview-label">名称</span>
          <span class="overview-value">{{ ctx.animationDef.name }}</span>
        </div>
        <div class="overview-row">
          <span class="overview-label">轨道</span>
          <span class="overview-value">{{ ctx.allTracks.value.length }}</span>
        </div>
        <div class="section-divider" />
        <div class="section-header">默认播放方式</div>
        <div class="timing-mode-options">
          <label
            class="timing-mode-option"
            :class="{ active: currentTimingMode === 'continuous' }"
          >
            <input
              type="radio"
              name="animation-timing-mode"
              value="continuous"
              :checked="currentTimingMode === 'continuous'"
              @change="onTimingModeChange('continuous')"
            >
            <span>连续播放</span>
          </label>
          <label
            class="timing-mode-option"
            :class="{ active: currentTimingMode === 'tts_speech' }"
          >
            <input
              type="radio"
              name="animation-timing-mode"
              value="tts_speech"
              :checked="currentTimingMode === 'tts_speech'"
              @change="onTimingModeChange('tts_speech')"
            >
            <span>跟随 TTS 有声片段</span>
          </label>
        </div>
        <div class="panel-empty-hint compact">
          <div class="hint-text">在下方时间轴中点击轨道或关键帧即可编辑细节</div>
        </div>
      </div>
    </template>

    <!-- ===== 状态 B: 轨道级属性 ===== -->
    <template v-else-if="selectionMode === 'track'">
      <div class="section-header">轨道: {{ trackTypeLabel(currentTrackAny!) }}</div>
      <div class="field-row">
        <label>显示名</label>
        <input
          type="text"
          class="text-input"
          :value="currentTrackAny?.displayName ?? ''"
          placeholder="可选"
          maxlength="40"
          @change="onDisplayNameInput"
        />
      </div>
      <div class="field-row">
        <label>目标</label>
        <div class="target-picker" @pointerdown.stop>
          <button
            class="target-picker-trigger"
            :class="{ active: showTargetPicker }"
            title="选择目标对象"
            @click="toggleTargetPicker"
          >
            <span class="target-picker-label">{{ currentTargetLabel }}</span>
            <span class="target-picker-arrow">{{ showTargetPicker ? '▲' : '▼' }}</span>
          </button>
          <div v-if="showTargetPicker" class="target-picker-popover">
            <button
              class="target-tree-row"
              :class="{ selected: currentTargetValue === TARGET_SELF }"
              @click="selectTarget(TARGET_SELF)"
            >
              <span class="tree-spacer" />
              <span class="target-icon">🎯</span>
              <span class="target-name">自身</span>
            </button>
            <button
              v-for="node in flatTargetNodes"
              :key="node.id"
              class="target-tree-row"
              :class="{ selected: node.id === currentTargetValue }"
              :style="node.depth > 0 ? { paddingLeft: (8 + node.depth * 18) + 'px' } : {}"
              @click="selectTarget(node.id)"
            >
              <span
                v-if="node.hasChildren"
                class="tree-toggle"
                @click.stop="toggleTargetExpanded(node.id)"
              >
                {{ expandedTargetIds.has(node.id) ? '▼' : '▶' }}
              </span>
              <span v-else class="tree-spacer" />
              <span class="target-icon">{{ node.icon }}</span>
              <span class="target-name">{{ node.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TransformTrack 设置 -->
      <template v-if="currentTrackAny?.trackType === 'transform'">
        <div class="section-divider" />
        <div class="section-header">时间</div>
        <div class="field-row">
          <label>时长</label>
          <div class="duration-mode">
            <label><input type="radio" :checked="durationMode === 'fixed'" @change="setDurationMode('fixed')" /> 固定</label>
            <input v-if="durationMode === 'fixed'" type="number" :value="currentTrackDurationValue" min="10" step="10" class="duration-input" @change="onDurationInput" />
            <span v-if="durationMode === 'fixed'" class="unit">ms</span>
            <label><input type="radio" :checked="durationMode === 'auto'" @change="setDurationMode('auto')" /> 自动</label>
          </div>
        </div>
        <div class="easing-section">
          <label class="easing-label">缓动</label>
          <EasingPicker :model-value="currentEasing" @update:model-value="onEasingChange" />
        </div>
        <div class="section-divider" />
        <div class="section-header">基础</div>
        <div class="field-row">
          <label>变换点</label>
          <div class="field-pair">
            <span class="field-label">X</span>
            <input type="number" :value="pivotDisplayPx.x" step="1" @change="e => onPivotInput('x', e)" />
          </div>
          <div class="field-pair">
            <span class="field-label">Y</span>
            <input type="number" :value="pivotDisplayPx.y" step="1" @change="e => onPivotInput('y', e)" />
          </div>
          <span class="unit">px</span>
          <span v-if="!hasPivotSet" class="default-hint">
            ({{ pivotDefaultIsApproximate ? '默认 ≈' : '默认' }})
          </span>
        </div>
        <PivotEditorPanel
          v-if="pivotPanelResourceInfo"
          :key="pivotPanelKey"
          :resource-type="pivotPanelResourceInfo.resourceType"
          :resource-id="pivotPanelResourceInfo.resourceId"
          :scene-object-id="pivotPanelResourceInfo.sceneObjectId"
          :target-object-id="pivotPanelResourceInfo.targetObjectId"
          :has-pivot-set="hasPivotSet"
          :effective-pivot="resolvedPivot"
          @pivot-change="onPivotVisualChange"
          @pivot-reset="onPivotReset"
        />
      </template>

      <!-- VisibilityTrack 设置 -->
      <template v-else-if="currentTrackAny?.trackType === 'visibility'">
        <div class="section-divider" />
        <div class="section-header">时间</div>
        <div class="field-row">
          <label>时长</label>
          <div class="duration-mode">
            <label><input type="radio" :checked="durationMode === 'fixed'" @change="setDurationMode('fixed')" /> 固定</label>
            <input v-if="durationMode === 'fixed'" type="number" :value="currentTrackDurationValue" min="10" step="10" class="duration-input" @change="onDurationInput" />
            <span v-if="durationMode === 'fixed'" class="unit">ms</span>
            <label><input type="radio" :checked="durationMode === 'auto'" @change="setDurationMode('auto')" /> 自动</label>
          </div>
        </div>
        <div class="easing-section">
          <label class="easing-label">缓动</label>
          <EasingPicker :model-value="currentEasing" @update:model-value="onEasingChange" />
        </div>
      </template>

      <!-- FrameSequenceTrack 设置 -->
      <template v-else-if="currentTrackAny?.trackType === 'frame_sequence'">
        <div class="section-divider" />
        <div class="field-row">
          <label>帧率</label>
          <div class="duration-mode">
            <label><input type="radio" :checked="!hasCustomFps" @change="setFpsMode('source')" /> 跟随素材</label>
            <label><input type="radio" :checked="hasCustomFps" @change="setFpsMode('custom')" /> 自定义</label>
            <input v-if="hasCustomFps" type="number" :value="(currentTrackAny as FrameSequenceTrack).fps ?? sourceFps" min="1" max="60" step="1" class="duration-input" @change="onFpsInput" />
            <span v-if="hasCustomFps" class="unit">fps</span>
          </div>
          <span v-if="!hasCustomFps" class="default-hint">(素材: {{ sourceFps }} fps)</span>
        </div>
        <div class="field-row">
          <label>循环</label>
          <input type="checkbox" :checked="(currentTrackAny as FrameSequenceTrack).loop ?? true" @change="onFrameSeqLoopChange" />
        </div>
      </template>

      <!-- EffectTrack 设置 -->
      <template v-else-if="currentTrackAny?.trackType === 'effect'">
        <EffectParamsEditor
          :track="currentTrackAny as EffectTrack"
          :unsupported-effect-types="effectUnsupportedTypes"
          @update="onEffectUpdate"
        />
      </template>

      <div class="section-divider" />
      <div class="quick-actions">
        <button class="btn-sm btn-danger" @click="onDeleteTrack">删除轨道</button>
      </div>
    </template>

    <!-- ===== 状态 C: 关键帧属性 ===== -->
    <template v-else>
      <!-- TransformKeyframe -->
      <template v-if="currentTrackAny?.trackType === 'transform'">
        <div class="frame-bar">
          <select class="frame-select" :value="selectedIndex" @change="onFrameSelect">
            <option
              v-for="(frame, index) in ctx.keyframes.value"
              :key="index"
              :value="index"
            >
              帧 {{ index + 1 }} / {{ ctx.keyframes.value.length }} · {{ Math.round(frame.time * 100) }}%
            </option>
          </select>
          <span class="frame-bar-hint" title="在时间轴工具栏中添加/复制/粘贴/删除关键帧">⓵ 使用时间轴工具栏操作帧</span>
        </div>

        <div class="field-row">
          <label>时间</label>
          <input type="number" :value="timePercent" min="0" max="100" step="1" :disabled="isInterpolated" @change="onTimeInput" />
          <span class="unit">%</span>
        </div>

        <div class="section-divider" />
        <div class="section-header">
          变换
          <span v-if="isKeyframeSplit" class="mode-badge" title="此帧为瞬变帧：动画到达该帧的数值与离开该帧的数值不同，将在时间轴上瞬间跳变">瞬变帧</span>
        </div>

        <!-- === 平滑态：单列编辑（默认） === -->
        <div v-if="!isKeyframeSplit" :class="['field-group', { 'interpolated': isInterpolated }]">
          <div class="field-row">
            <label>位移</label>
            <div class="field-pair">
              <span class="field-label">X</span>
              <input type="number" :value="Math.round(displayValues.x)" step="1" :disabled="isInterpolated" @change="e => onValueInput('x', e)" />
            </div>
            <div class="field-pair">
              <span class="field-label">Y</span>
              <input type="number" :value="Math.round(displayValues.y)" step="1" :disabled="isInterpolated" @change="e => onValueInput('y', e)" />
            </div>
          </div>

          <div class="field-row">
            <label>缩放</label>
            <div class="field-pair">
              <span class="field-label">X</span>
              <input type="number" :value="Math.round(displayValues.scaleX * 100)" step="1" :disabled="isInterpolated" @change="e => onScaleInput('scaleX', e)" />
            </div>
            <div class="field-pair">
              <span class="field-label">Y</span>
              <input type="number" :value="Math.round(displayValues.scaleY * 100)" step="1" :disabled="isInterpolated" @change="e => onScaleInput('scaleY', e)" />
            </div>
            <button class="btn-link" :class="{ active: scaleLocked }" title="等比锁定" @click="scaleLocked = !scaleLocked">🔗</button>
          </div>

          <div class="field-row">
            <label>旋转</label>
            <input type="number" :value="displayRotationDeg" step="1" :disabled="isInterpolated" @change="onRotationInput" />
            <span class="unit">°</span>
            <label class="checkbox-inline">
              <input type="checkbox" :checked="displayValues.flipX" :disabled="isInterpolated" @change="onFlipXChange" />
              翻转
            </label>
          </div>
        </div>

        <!-- === 瞬变态：双列对比编辑 === -->
        <div v-else :class="['field-group', 'split-group', { 'interpolated': isInterpolated }]">
          <div class="split-hint">此帧为瞬变帧：动画在该时刻从「帧前值」瞬间跳变到「帧后值」。</div>
          <div class="split-col-header-row">
            <span class="split-label-spacer"></span>
            <span class="split-col-header">帧前值</span>
            <span class="split-col-arrow-spacer"></span>
            <span class="split-col-header">帧后值</span>
            <span class="split-sync-spacer"></span>
          </div>

          <div class="split-row" :class="{ 'has-diff': Math.round(displayValues.x) !== Math.round(valueOutDisplay.x) }">
            <label class="split-label">位移 X</label>
            <input class="split-input" type="number" :value="Math.round(displayValues.x)" step="1" :disabled="isInterpolated" @change="e => onValueInput('x', e)" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="Math.round(valueOutDisplay.x)" step="1" :disabled="isInterpolated" @change="e => onOutValueInput('x', e)" />
            <button class="btn-sync" :disabled="isInterpolated || Math.round(displayValues.x) === Math.round(valueOutDisplay.x)" title="将帧后值同步为帧前值" @click="syncSplitField('x')">⇆</button>
          </div>

          <div class="split-row" :class="{ 'has-diff': Math.round(displayValues.y) !== Math.round(valueOutDisplay.y) }">
            <label class="split-label">位移 Y</label>
            <input class="split-input" type="number" :value="Math.round(displayValues.y)" step="1" :disabled="isInterpolated" @change="e => onValueInput('y', e)" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="Math.round(valueOutDisplay.y)" step="1" :disabled="isInterpolated" @change="e => onOutValueInput('y', e)" />
            <button class="btn-sync" :disabled="isInterpolated || Math.round(displayValues.y) === Math.round(valueOutDisplay.y)" title="将帧后值同步为帧前值" @click="syncSplitField('y')">⇆</button>
          </div>

          <div class="split-row" :class="{ 'has-diff': Math.round(displayValues.scaleX * 100) !== Math.round(valueOutDisplay.scaleX * 100) }">
            <label class="split-label">缩放 X<span class="unit">%</span></label>
            <input class="split-input" type="number" :value="Math.round(displayValues.scaleX * 100)" step="1" :disabled="isInterpolated" @change="e => onScaleInput('scaleX', e)" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="Math.round(valueOutDisplay.scaleX * 100)" step="1" :disabled="isInterpolated" @change="e => onOutScaleInput('scaleX', e)" />
            <button class="btn-sync" :disabled="isInterpolated || Math.round(displayValues.scaleX * 100) === Math.round(valueOutDisplay.scaleX * 100)" title="将帧后值同步为帧前值" @click="syncSplitField('scaleX')">⇆</button>
          </div>

          <div class="split-row" :class="{ 'has-diff': Math.round(displayValues.scaleY * 100) !== Math.round(valueOutDisplay.scaleY * 100) }">
            <label class="split-label">缩放 Y<span class="unit">%</span></label>
            <input class="split-input" type="number" :value="Math.round(displayValues.scaleY * 100)" step="1" :disabled="isInterpolated" @change="e => onScaleInput('scaleY', e)" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="Math.round(valueOutDisplay.scaleY * 100)" step="1" :disabled="isInterpolated" @change="e => onOutScaleInput('scaleY', e)" />
            <button class="btn-sync" :disabled="isInterpolated || Math.round(displayValues.scaleY * 100) === Math.round(valueOutDisplay.scaleY * 100)" title="将帧后值同步为帧前值" @click="syncSplitField('scaleY')">⇆</button>
          </div>

          <div class="split-row" :class="{ 'has-diff': displayRotationDeg !== valueOutRotationDeg }">
            <label class="split-label">旋转<span class="unit">°</span></label>
            <input class="split-input" type="number" :value="displayRotationDeg" step="1" :disabled="isInterpolated" @change="onRotationInput" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="valueOutRotationDeg" step="1" :disabled="isInterpolated" @change="onOutRotationInput" />
            <button class="btn-sync" :disabled="isInterpolated || displayRotationDeg === valueOutRotationDeg" title="将帧后值同步为帧前值" @click="syncSplitField('rotation')">⇆</button>
          </div>

          <div class="split-row" :class="{ 'has-diff': displayValues.flipX !== valueOutDisplay.flipX }">
            <label class="split-label">翻转</label>
            <span class="split-input split-checkbox-cell">
              <input type="checkbox" :checked="displayValues.flipX" :disabled="isInterpolated" @change="onFlipXChange" />
            </span>
            <span class="split-arrow">→</span>
            <span class="split-input split-checkbox-cell">
              <input type="checkbox" :checked="valueOutDisplay.flipX" :disabled="isInterpolated" @change="onOutFlipXChange" />
            </span>
            <button class="btn-sync" :disabled="isInterpolated || displayValues.flipX === valueOutDisplay.flipX" title="将帧后值同步为帧前值" @click="syncSplitField('flipX')">⇆</button>
          </div>
        </div>

        <div class="section-divider" />
        <div class="quick-actions">
          <button class="btn-sm" title="重置帧为默认值" :disabled="isInterpolated" @click="ctx.resetKeyframe(selectedIndex)">重置帧</button>
          <button
            v-if="!isKeyframeSplit"
            class="btn-sm"
            title="切换为瞬变帧：允许设置该帧的「帧前值」与「帧后值」不同，在时间轴上瞬间跳变"
            :disabled="isInterpolated"
            @click="onSplitKeyframe"
          >改为瞬变帧</button>
          <button
            v-else
            class="btn-sm"
            title="切换为平滑帧：合并帧前/帧后为单一数值"
            @click="onMergeKeyframe"
          >改为平滑帧</button>
        </div>
      </template>

      <!-- VisibilityKeyframe -->
      <template v-else-if="currentTrackAny?.trackType === 'visibility'">
        <div class="frame-bar">
          <select class="frame-select" :value="selectedIndex" @change="onFrameSelect">
            <option
              v-for="(frame, index) in visibilityKeyframes"
              :key="index"
              :value="index"
            >
              帧 {{ index + 1 }} / {{ visibilityKeyframes.length }} · {{ Math.round((frame.time ?? 0) * 100) }}%
            </option>
          </select>
          <span class="frame-bar-hint" title="在时间轴工具栏中添加/复制/粘贴/删除关键帧">⓵ 使用时间轴工具栏操作帧</span>
        </div>

        <div class="field-row">
          <label>时间</label>
          <input type="number" :value="visibilityTimePercent" min="0" max="100" step="1" @change="onVisibilityTimeInput" />
          <span class="unit">%</span>
        </div>

        <div class="section-divider" />
        <div class="section-header">
          透明度
          <span v-if="isVisibilityKeyframeSplit" class="mode-badge" title="此帧为瞬变帧：帧前后 Alpha 不同，将在时间轴上瞬间跳变">瞬变帧</span>
        </div>
        <div v-if="!isVisibilityKeyframeSplit" class="field-row">
          <label>Alpha</label>
          <input type="number" :value="visibilityAlpha" min="0" max="1" step="0.1" @change="onVisibilityAlphaInput" />
        </div>
        <div v-else class="field-group split-group">
          <div class="split-hint">此帧为瞬变帧：Alpha 在该时刻从「帧前值」瞬间跳变到「帧后值」。</div>
          <div class="split-col-header-row">
            <span class="split-label-spacer"></span>
            <span class="split-col-header">帧前值</span>
            <span class="split-col-arrow-spacer"></span>
            <span class="split-col-header">帧后值</span>
            <span class="split-sync-spacer"></span>
          </div>
          <div class="split-row" :class="{ 'has-diff': visibilityAlpha !== visibilityAlphaOut }">
            <label class="split-label">Alpha</label>
            <input class="split-input" type="number" :value="visibilityAlpha" min="0" max="1" step="0.1" @change="onVisibilityAlphaInput" />
            <span class="split-arrow">→</span>
            <input class="split-input" type="number" :value="visibilityAlphaOut" min="0" max="1" step="0.1" @change="onVisibilityAlphaOutInput" />
            <button class="btn-sync" :disabled="visibilityAlpha === visibilityAlphaOut" title="将帧后值同步为帧前值" @click="syncVisibilityAlpha">⇆</button>
          </div>
        </div>

        <div class="section-divider" />
        <div class="quick-actions">
          <button
            v-if="!isVisibilityKeyframeSplit"
            class="btn-sm"
            title="切换为瞬变帧：允许设置该帧的「帧前 Alpha」与「帧后 Alpha」不同"
            @click="onSplitVisibilityKeyframe"
          >改为瞬变帧</button>
          <button
            v-else
            class="btn-sm"
            title="切换为平滑帧：合并帧前/帧后为单一数值"
            @click="onMergeVisibilityKeyframe"
          >改为平滑帧</button>
        </div>
      </template>
    </template>

    <div v-if="deleteTrackDialog" class="panel-dialog-overlay" @click.self="cancelDeleteTrack">
      <div class="panel-dialog">
        <p class="panel-dialog-title">{{ deleteTrackDialog.title }}</p>
        <p class="panel-dialog-message">{{ deleteTrackDialog.message }}</p>
        <div class="panel-dialog-actions">
          <button class="btn-sm" @click="cancelDeleteTrack">取消</button>
          <button class="btn-danger" @click="confirmDeleteTrack">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AnimationEditContext } from '@/composables/useAnimationEdit'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { usePropStore } from '@/stores/propStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type {
  AnimationTimingMode,
  AnimationTrack,
  DynamicEffectType,
  EffectTrack,
  FrameSequenceTrack,
} from '@/types/animation'
import { TARGET_SELF } from '@/types/animation'
import type { CompositeObject, SceneObject, SymbolObject } from '@/types/sceneObject'

import EasingPicker from './EasingPicker.vue'
import EffectParamsEditor from './EffectParamsEditor.vue'
import PivotEditorPanel from './PivotEditorPanel.vue'
import { resolveTrackTargetDisplay } from './trackDisplay'

interface TargetTreeNode {
  id: string
  name: string
  icon: string
  depth: number
  children: TargetTreeNode[]
}

interface FlatTargetTreeNode {
  id: string
  name: string
  icon: string
  depth: number
  hasChildren: boolean
}

interface DeleteTrackDialogState {
  trackIndex: number
  title: string
  message: string
}

type EffectUnsupportedMap = Partial<Record<DynamicEffectType, string>>

const props = defineProps<{
  ctx: AnimationEditContext
  sceneObject?: SceneObject | undefined
  sceneObjects?: SceneObject[] | undefined
  targetOptions: { id: string; label: string }[]
  targetTreeNodes: TargetTreeNode[]
  getDefaultPivot?: (objectId: string | null) => { x: number; y: number } | null
}>()

const emit = defineEmits<{
  /**
   * 用户在面板内（数字输入或 PivotEditorPanel 拖拽）提交新的变换点。
   * 父组件需做逐关键帧 (R·S − f·I)·ΔOrigin 补偿后再写入 track.pivot。
   */
  'pivot-change': [pivot: { x: number; y: number }]
  /** 清除 track.pivot，回退到对象默认变换点。 */
  'pivot-reset': []
}>()

const scaleLocked = ref(true)
const sceneObjectStore = useSceneObjectStore()
const expressionStore = useExpressionStore()
const propStore = usePropStore()
const backgroundStore = useBackgroundStore()
const showTargetPicker = ref(false)
const expandedTargetIds = ref(new Set<string>())

const currentTimingMode = computed(() => props.ctx.animationDef.timingMode ?? 'continuous')

function onTimingModeChange(timingMode: AnimationTimingMode) {
  props.ctx.updateTimingMode(timingMode)
}

// ===== FrameSequenceTrack 素材源 FPS/Loop =====

/** 素材源的 FPS（当 track.fps 未定义时使用） */
const sourceFps = computed(() => {
  const obj = props.sceneObject
  if (!obj) return 25

  if (obj.type === 'expression') {
    const expr = expressionStore.getExpression(obj.refId)
    return expr?.speakingFps ?? 12
  }
  if (obj.type === 'prop') {
    const prop = propStore.getProp(obj.refId)
    return prop?.fps ?? 25
  }
  if (obj.type === 'symbol') {
    const symbolObj = obj as SymbolObject
    const materialId = symbolObj.currentMaterialId
    const material = materialId
      ? symbolObj.materials?.find(m => m.id === materialId)
      : symbolObj.materials?.[0]
    if (material?.type === 'animation') {
      return material.fps ?? 12
    }
    return 12
  }
  if (obj.type === 'background') {
    const bg = backgroundStore.backgrounds.find(b => b.id === obj.refId)
    return (bg as { fps?: number } | undefined)?.fps ?? 25
  }
  return 25
})

/** 用户是否自定义了 FPS */
const hasCustomFps = computed(() => {
  const track = currentTrackAny.value as FrameSequenceTrack | undefined
  return track?.trackType === 'frame_sequence' && track.fps !== undefined
})

const deleteTrackDialog = ref<DeleteTrackDialogState | null>(null)

// ===== Selection Mode =====

const selectionMode = computed(() => props.ctx.selectionMode.value)
const currentTrackAny = computed(() => props.ctx.currentTrackAny.value)
const selectedKeyframeIndexRef = props.ctx.selectedKeyframeIndex

// ===== Track display helpers =====

function trackTypeLabel(track: AnimationTrack): string {
  if (track.trackType === 'effect') return `特效:${(track).effectParams.type}`
  const labels: Record<string, string> = { transform: '变换', visibility: '透明度', frame_sequence: '帧序列', effect: '特效' }
  return labels[track.trackType] ?? track.trackType
}

function targetLabel(track: AnimationTrack): string {
  if (track.displayName?.trim()) return track.displayName.trim()
  const display = resolveTrackTargetDisplay({
    track,
    sceneObject: props.sceneObject,
    getObjectName,
  })
  return display.secondary ? `${display.primary} · ${display.secondary}` : display.primary
}

function getObjectName(objectId: string): string | undefined {
  const object = getSceneObjectById(objectId)
  return object?.alias?.trim() || object?.name?.trim() || undefined
}

function getSceneObjectById(objectId: string | null | undefined): SceneObject | null {
  if (!objectId) return null
  const local = props.sceneObjects?.find(obj => obj.id === objectId)
  if (local) return local
  return sceneObjectStore.getObject(objectId) ?? null
}

function getCompositeContentBounds(object: SceneObject): { x: number; y: number; width: number; height: number } {
  if (object.type !== 'composite') {
    return {
      x: 0,
      y: 0,
      width: object.width,
      height: object.height,
    }
  }

  const composite = object as CompositeObject
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const childId of composite.childIds ?? []) {
    const child = getSceneObjectById(childId)
    if (!child) continue

    const childBounds = getCompositeContentBounds(child)
    minX = Math.min(minX, child.x + childBounds.x)
    minY = Math.min(minY, child.y + childBounds.y)
    maxX = Math.max(maxX, child.x + childBounds.x + childBounds.width)
    maxY = Math.max(maxY, child.y + childBounds.y + childBounds.height)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return {
      x: 0,
      y: 0,
      width: object.width,
      height: object.height,
    }
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

function getPivotDisplayRect(object: SceneObject | null): { x: number; y: number; width: number; height: number } | null {
  if (!object) return null

  if (object.type === 'composite') {
    const bounds = getCompositeContentBounds(object)
    if (bounds.width > 0 && bounds.height > 0) return bounds
  }

  if (object.width <= 0 || object.height <= 0) return null
  return {
    x: 0,
    y: 0,
    width: object.width,
    height: object.height,
  }
}


// ===== State B: Track-level shared =====

const currentEasing = computed(() =>
  props.ctx.currentTrack.value?.easing ?? props.ctx.currentVisibilityTrack.value?.easing ?? 'linear'
)

const currentTargetValue = computed(() => currentTrackAny.value?.targetObjectId ?? TARGET_SELF)

const flatTargetNodes = computed<FlatTargetTreeNode[]>(() => {
  const result: FlatTargetTreeNode[] = []

  function walk(nodes: TargetTreeNode[]): void {
    for (const node of nodes) {
      result.push({
        id: node.id,
        name: node.name,
        icon: node.icon,
        depth: node.depth,
        hasChildren: node.children.length > 0,
      })
      if (node.children.length > 0 && expandedTargetIds.value.has(node.id)) {
        walk(node.children)
      }
    }
  }

  walk(props.targetTreeNodes)
  return result
})

const currentTargetLabel = computed(() => {
  const current = currentTargetValue.value
  if (current === TARGET_SELF) return '自身'
  const node = findTargetNode(current, props.targetTreeNodes)
  if (node) return `${node.icon} ${node.name}`
  return props.targetOptions.find(option => option.id === current)?.label ?? current
})

watch(
  () => props.targetTreeNodes,
  () => {
    if (expandedTargetIds.value.size > 0) return
    const rootIds = props.targetTreeNodes
      .filter(node => node.children.length > 0)
      .map(node => node.id)
    if (rootIds.length > 0) {
      expandedTargetIds.value = new Set(rootIds)
    }
  },
  { immediate: true },
)

function findTargetNode(id: string, nodes: TargetTreeNode[]): TargetTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findTargetNode(id, node.children)
    if (child) return child
  }
  return null
}

function toggleTargetPicker(): void {
  showTargetPicker.value = !showTargetPicker.value
}

function toggleTargetExpanded(id: string): void {
  const next = new Set(expandedTargetIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedTargetIds.value = next
}

function selectTarget(value: string): void {
  const track = currentTrackAny.value
  if (!track) return
  track.targetObjectId = value || TARGET_SELF
  showTargetPicker.value = false
}

function closeTargetPicker(): void {
  showTargetPicker.value = false
}

const durationMode = computed(() => {
  const track = currentTrackAny.value
  if (!track) return 'fixed'
  if ('duration' in track) {
    return (track as { duration?: number | 'auto' }).duration === 'auto' ? 'auto' : 'fixed'
  }
  return 'fixed'
})

const currentTrackDurationValue = computed(() => {
  const track = currentTrackAny.value
  if (!track || !('duration' in track)) return props.ctx.trackDuration.value
  const duration = (track as { duration?: number | 'auto' }).duration
  return typeof duration === 'number' && Number.isFinite(duration) ? duration : 1000
})

function onEasingChange(value: string) {
  props.ctx.updateEasing(value)
}

function onDurationInput(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  if (isNaN(val) || val < 10) return
  props.ctx.updateDuration(val)
}

function setDurationMode(mode: 'fixed' | 'auto') {
  if (mode === 'auto') props.ctx.updateDuration('auto')
  else props.ctx.updateDuration(1000)
}

// Pivot (transform track only)
const currentTargetSceneObject = computed(() => {
  const targetId = currentTargetValue.value
  if (targetId === TARGET_SELF) {
    const rootId = props.sceneObject?.id
    if (rootId) {
      const rootObject = getSceneObjectById(rootId)
      if (rootObject) return rootObject
    }
    return props.sceneObject ?? null
  }
  return getSceneObjectById(targetId)
})

const currentTargetObjectId = computed(() => {
  const targetId = currentTargetValue.value
  if (targetId === TARGET_SELF) return props.sceneObject?.id ?? TARGET_SELF
  return targetId
})

const effectUnsupportedTypes = computed<EffectUnsupportedMap>(() => {
  const target = currentTargetSceneObject.value
  if (!isUnionCompositeObject(target)) return {}

  const reason = '联合组合不支持该特效'
  return {
    wave: reason,
    ribbon: reason,
    glow: reason,
    motion_blur: reason,
  }
})

function isUnionCompositeObject(object: SceneObject | null): boolean {
  return object?.type === 'composite'
    && ((object as CompositeObject).compositeMode ?? 'entity') === 'union'
}

const pivotDisplayRect = computed(() => getPivotDisplayRect(currentTargetSceneObject.value))

/**
 * PivotEditorPanel 的资源信息：优先使用当前 active track 的 targetObjectId 对应的场景对象，
 * 否则回退到根 sceneObject。
 */
const pivotPanelResourceInfo = computed<{
  resourceType: 'prop' | 'background' | 'symbol' | 'composite' | 'expression'
  resourceId: string
  sceneObjectId: string | undefined
  targetObjectId: string | undefined
} | null>(() => {
  const target = currentTargetSceneObject.value
  if (!target) return null
  const supportedTypes = ['prop', 'background', 'symbol', 'composite', 'expression'] as const
  type SupportedType = typeof supportedTypes[number]
  if (!supportedTypes.includes(target.type as SupportedType)) return null
  return {
    resourceType: target.type as SupportedType,
    resourceId: target.refId ?? target.id,
    sceneObjectId: target.id,
    targetObjectId: currentTargetValue.value !== TARGET_SELF ? currentTargetValue.value : undefined,
  }
})

// 默认像素 pivot = 对象当前 container.pivot 等价值（与 useSceneGraph 中 pivotBase + originX/Y 对齐）
// - composite / expression: PivotBase = (0,0) → pivot = (originX, originY)，准确
// - 其它类型：PivotBase ≈ bounds 中心，离线无法读取 localBounds.x/y：
//     • 有 width/height 时：退化为 (width/2 + originX, height/2 + originY)——绝大多数 PIXI
//       sprite/text/graphics 的 localBounds 以 (0,0) 为起点，该值与 runtime 一致；但对于
//       localBounds 不以 (0,0) 为起点的对象（如带裁剪的合成 sprite）值是近似的、
//       与 runtime 有 boundsX/Y 偏移，界面会通过“≈”标记提示用户；
//     • 无 width/height 时：回退到 (originX, originY)。
// 用户输入的值始终被当作真实像素坐标直接写入轨道。
const defaultPixelPivot = computed(() => {
  const target = currentTargetSceneObject.value
  const runtimeDefault = props.getDefaultPivot?.(currentTargetObjectId.value)
  if (runtimeDefault) return runtimeDefault

  if (!target) return { x: 0, y: 0 }
  const originX = target.transformOriginX ?? 0
  const originY = target.transformOriginY ?? 0
  if (target.type === 'composite' || target.type === 'expression') {
    return { x: originX, y: originY }
  }
  const rect = pivotDisplayRect.value
  if (!rect) return { x: originX, y: originY }
  return {
    x: rect.x + rect.width / 2 + originX,
    y: rect.y + rect.height / 2 + originY,
  }
})

// composite / expression 的默认值可精确推导；其它类型因缺少 localBounds.x/y 只能近似。
const pivotDefaultIsApproximate = computed(() => {
  if (props.getDefaultPivot?.(currentTargetObjectId.value)) return false
  const target = currentTargetSceneObject.value
  if (!target) return false
  return target.type !== 'composite' && target.type !== 'expression'
})

const resolvedPivot = computed(() => props.ctx.currentTrack.value?.pivot ?? defaultPixelPivot.value)

const hasPivotSet = computed(() => props.ctx.currentTrack.value?.pivot !== undefined)

// pivot 已是像素本地坐标，直接展示即可
const pivotDisplayPx = computed(() => ({
  x: Math.round(resolvedPivot.value.x),
  y: Math.round(resolvedPivot.value.y),
}))

const pivotPanelKey = computed(() => {
  const info = pivotPanelResourceInfo.value
  if (!info) return 'pivot-panel:none'
  return [
    info.resourceType,
    info.resourceId,
    info.sceneObjectId ?? '',
    info.targetObjectId ?? '',
  ].join(':')
})

function onPivotInput(axis: 'x' | 'y', e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const current = resolvedPivot.value
  // v26: 不再直接 ctx.updatePivot——交由父组件执行逐关键帧 x/y 补偿
  emit('pivot-change', { ...current, [axis]: val })
}

function onPivotVisualChange(pivot: { x: number; y: number }) {
  emit('pivot-change', pivot)
}

function onPivotReset() {
  emit('pivot-reset')
}

// FrameSequenceTrack
function onFpsInput(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  if (isNaN(val) || val < 1) return
  props.ctx.updateFrameSequenceTrack({ fps: val })
}

function onFrameSeqLoopChange(e: Event) {
  props.ctx.updateFrameSequenceTrack({ loop: (e.target as HTMLInputElement).checked })
}

function setFpsMode(mode: 'source' | 'custom') {
  const track = props.ctx.currentFrameSequenceTrack.value
  if (!track) return
  if (mode === 'source') {
    delete (track as { fps?: number }).fps
  } else {
    track.fps = sourceFps.value
  }
}


// EffectTrack
function onEffectUpdate(updatedTrack: EffectTrack) {
  props.ctx.updateEffectParams(updatedTrack.effectParams)
}

function onDisplayNameInput(e: Event) {
  const track = currentTrackAny.value
  if (!track) return
  const value = (e.target as HTMLInputElement).value.trim()
  if (value) track.displayName = value
  else delete track.displayName
}

function onDeleteTrack() {
  const idx = props.ctx.currentTrackIndex.value
  if (idx < 0) return
  const track = currentTrackAny.value
  const keyframeCount = track && (track.trackType === 'transform' || track.trackType === 'visibility') ? track.keyframes.length : 0
  const label = track ? targetLabel(track) : '当前轨道'
  deleteTrackDialog.value = {
    trackIndex: idx,
    title: `删除轨道「${label}」`,
    message: keyframeCount > 0
      ? `该轨道包含 ${keyframeCount} 个关键帧，删除后不可恢复。`
      : '该轨道删除后不可恢复。',
  }
}

function cancelDeleteTrack(): void {
  deleteTrackDialog.value = null
}

function confirmDeleteTrack(): void {
  const target = deleteTrackDialog.value
  deleteTrackDialog.value = null
  if (!target) return
  props.ctx.removeTrack(target.trackIndex)
}

// ===== State C: Keyframe-level =====

const selectedIndex = computed(() => props.ctx.selectedKeyframeIndex.value)

const isInterpolated = computed(() => {
  const idx = props.ctx.findKeyframeAtTime(props.ctx.playheadPosition.value)
  return idx < 0
})

// TransformKeyframe display
const displayValues = computed(() => {
  const kf = props.ctx.selectedKeyframe.value
  if (kf && !isInterpolated.value) {
    return {
      x: kf.x ?? 0,
      y: kf.y ?? 0,
      scaleX: kf.scaleX ?? 1,
      scaleY: kf.scaleY ?? 1,
      rotation: kf.rotation ?? 0,
      flipX: kf.flipX ?? false,
    }
  }
  const output = props.ctx.currentOutput.value
  if (output) {
    return {
      x: output.x, y: output.y,
      scaleX: output.scaleX, scaleY: output.scaleY,
      rotation: output.rotation, flipX: output.flipX ?? false,
    }
  }
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false }
})

const timePercent = computed(() => {
  const kf = props.ctx.selectedKeyframe.value
  if (kf) return Math.round(kf.time * 100)
  return Math.round(props.ctx.playheadPosition.value * 100)
})

const displayRotationDeg = computed(() =>
  Math.round((displayValues.value.rotation * 180) / Math.PI)
)

function onTimeInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateKeyframe(selectedIndex.value, { time: Math.max(0, Math.min(100, val)) / 100 })
}

function onFrameSelect(e: Event) {
  const index = parseInt((e.target as HTMLSelectElement).value, 10)
  if (isNaN(index) || index < 0) return
  const frame = props.ctx.activeKeyframes.value[index]
  if (!frame) return
  selectedKeyframeIndexRef.value = index
  props.ctx.seekTo(frame.time)
}

function onValueInput(field: 'x' | 'y', e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateKeyframe(selectedIndex.value, { [field]: val })
}

function onScaleInput(field: 'scaleX' | 'scaleY', e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const scaleVal = val / 100
  if (scaleLocked.value) {
    props.ctx.updateKeyframe(selectedIndex.value, { scaleX: scaleVal, scaleY: scaleVal })
  } else {
    props.ctx.updateKeyframe(selectedIndex.value, { [field]: scaleVal })
  }
}

function onRotationInput(e: Event) {
  const deg = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(deg)) return
  props.ctx.updateKeyframe(selectedIndex.value, { rotation: (deg * Math.PI) / 180 })
}

function onFlipXChange(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    props.ctx.updateKeyframe(selectedIndex.value, { flipX: true })
  } else {
    const kf = props.ctx.selectedKeyframe.value
    if (kf && 'flipX' in kf) delete kf.flipX
  }
}

// VisibilityKeyframe display
const visibilityKeyframes = computed(() => {
  const track = props.ctx.currentVisibilityTrack.value
  return track?.keyframes ?? []
})

const visibilityTimePercent = computed(() => {
  const kfs = visibilityKeyframes.value
  const idx = selectedIndex.value
  if (idx >= 0 && idx < kfs.length) {
    return Math.round((kfs[idx]?.time ?? 0) * 100)
  }
  return Math.round(props.ctx.playheadPosition.value * 100)
})

const visibilityAlpha = computed(() => {
  const kfs = visibilityKeyframes.value
  const idx = selectedIndex.value
  if (idx >= 0 && idx < kfs.length) {
    return kfs[idx]?.alpha ?? 1
  }
  return 1
})

function onVisibilityTimeInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateVisibilityKeyframe(selectedIndex.value, { time: Math.max(0, Math.min(100, val)) / 100 })
}

function onVisibilityAlphaInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateVisibilityKeyframe(selectedIndex.value, { alpha: Math.max(0, Math.min(1, val)) })
}

// ===== v13 (Scheme B): valueOut 拆分编辑 =====

/** 当前选中关键帧是否处于"拆分"态（存在至少一个 out 字段） */
const isKeyframeSplit = computed(() => {
  const kf = props.ctx.selectedKeyframe.value
  return props.ctx.isKeyframeStructurallySplit(kf)
})

const isVisibilityKeyframeSplit = computed(() => {
  const kfs = visibilityKeyframes.value
  const idx = selectedIndex.value
  if (idx < 0 || idx >= kfs.length) return false
  return props.ctx.isKeyframeStructurallySplit(kfs[idx])
})

/** valueOut 展示：若 out 字段缺失则回退到 valueIn 字段（fall-through 语义） */
const valueOutDisplay = computed(() => {
  const kf = props.ctx.selectedKeyframe.value
  if (!kf) return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false }
  const out = kf.out ?? {}
  return {
    x: out.x ?? kf.x ?? 0,
    y: out.y ?? kf.y ?? 0,
    scaleX: out.scaleX ?? kf.scaleX ?? 1,
    scaleY: out.scaleY ?? kf.scaleY ?? 1,
    rotation: out.rotation ?? kf.rotation ?? 0,
    flipX: out.flipX ?? kf.flipX ?? false,
  }
})

const valueOutRotationDeg = computed(() =>
  Math.round((valueOutDisplay.value.rotation * 180) / Math.PI),
)

function onSplitKeyframe() {
  props.ctx.splitKeyframeAt(selectedIndex.value)
}

function onMergeKeyframe() {
  props.ctx.mergeKeyframeAt(selectedIndex.value)
}

function onOutValueInput(field: 'x' | 'y', e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateKeyframeOut(selectedIndex.value, field, val)
}

function onOutScaleInput(field: 'scaleX' | 'scaleY', e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const scaleVal = val / 100
  if (scaleLocked.value) {
    props.ctx.updateKeyframeOut(selectedIndex.value, 'scaleX', scaleVal)
    props.ctx.updateKeyframeOut(selectedIndex.value, 'scaleY', scaleVal)
  } else {
    props.ctx.updateKeyframeOut(selectedIndex.value, field, scaleVal)
  }
}

function onOutRotationInput(e: Event) {
  const deg = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(deg)) return
  props.ctx.updateKeyframeOut(selectedIndex.value, 'rotation', (deg * Math.PI) / 180)
}

function onOutFlipXChange(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  props.ctx.updateKeyframeOut(selectedIndex.value, 'flipX', checked ? true : undefined)
}

/**
 * 将「帧后值」同步为「帧前值」：在 Scheme B fall-through 语义下，
 * 清除 out[field] 即等价于让帧后回退到帧前。
 */
function syncSplitField(field: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'flipX') {
  props.ctx.updateKeyframeOut(selectedIndex.value, field, undefined)
}

// visibility valueOut
const visibilityAlphaOut = computed(() => {
  const kfs = visibilityKeyframes.value
  const idx = selectedIndex.value
  if (idx < 0 || idx >= kfs.length) return 1
  const kf = kfs[idx]
  return kf?.out?.alpha ?? kf?.alpha ?? 1
})

function onSplitVisibilityKeyframe() {
  props.ctx.splitKeyframeAt(selectedIndex.value)
}

function onMergeVisibilityKeyframe() {
  props.ctx.mergeKeyframeAt(selectedIndex.value)
}

function onVisibilityAlphaOutInput(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  props.ctx.updateVisibilityKeyframeOut(selectedIndex.value, Math.max(0, Math.min(1, val)))
}

/**
 * 将「帧后 Alpha」同步为「帧前 Alpha」：传 undefined 清除 out.alpha，
 * 使帧后回退到帧前的 alpha 值。
 */
function syncVisibilityAlpha() {
  props.ctx.updateVisibilityKeyframeOut(selectedIndex.value, undefined)
}

onMounted(() => {
  document.addEventListener('pointerdown', closeTargetPicker)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeTargetPicker)
})
</script>

<style scoped>
.keyframe-property-panel {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  font-size: 12px;
  color: #333;
}

.panel-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.42);
}

.panel-dialog {
  width: 300px;
  padding: 18px 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.24);
}

.panel-dialog-title {
  margin: 0 0 8px;
  color: #111827;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.panel-dialog-message {
  margin: 0;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.panel-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* Frame bar (merged frame selector + actions) */
.frame-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e3e8;
  flex-wrap: nowrap;
}

.frame-select {
  flex: 1;
  min-width: 112px;
}

.frame-bar .btn-sm {
  flex-shrink: 0;
}

.frame-bar-hint {
  font-size: 10px;
  color: #a0a4ad;
  white-space: nowrap;
  flex-shrink: 0;
}

.section-divider {
  height: 1px;
  background: #e0e3e8;
  margin: 10px 0;
}

.section-header {
  font-weight: 600;
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.split-hint {
  color: #888;
  font-size: 11px;
  margin-bottom: 6px;
  line-height: 1.4;
}

/* === 瞬变帧双列对比布局 === */
.mode-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  background: #fff3e0;
  color: #c77700;
  border: 1px solid #f0c887;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  vertical-align: middle;
}

.split-group {
  background: #fafbfc;
  border: 1px solid #e6e9ef;
  border-radius: 4px;
  padding: 8px 8px 4px;
}

.split-col-header-row {
  display: grid;
  grid-template-columns: 46px 1fr 14px 1fr 20px;
  gap: 4px;
  align-items: center;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px dashed #e0e3e8;
}

.split-col-header {
  font-size: 10px;
  color: #888;
  text-align: center;
  letter-spacing: 0.3px;
}

.split-label-spacer,
.split-col-arrow-spacer,
.split-sync-spacer {
  /* placeholders to align with .split-row grid */
}

.split-row {
  display: grid;
  grid-template-columns: 46px 1fr 14px 1fr 20px;
  gap: 4px;
  align-items: center;
  margin-bottom: 5px;
  padding: 2px 0;
  border-radius: 3px;
  transition: background 0.15s;
}

.split-row.has-diff {
  background: #fff7e6;
}

.split-label {
  font-size: 11px;
  color: #666;
  text-align: right;
  padding-right: 2px;
  white-space: nowrap;
}

.split-label .unit {
  margin-left: 2px;
  color: #aaa;
}

.split-input {
  width: 100%;
  min-width: 0;
  text-align: right;
}

.split-checkbox-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.split-arrow {
  font-size: 12px;
  color: #aaa;
  text-align: center;
  user-select: none;
}

.split-row.has-diff .split-arrow {
  color: #f59f00;
  font-weight: 700;
}

.btn-sync {
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 11px;
  line-height: 1;
  border: 1px solid #d0d3d9;
  background: #fff;
  color: #666;
  border-radius: 3px;
  cursor: pointer;
}

.btn-sync:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.btn-sync:disabled {
  opacity: 0.3;
  cursor: default;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.field-row > label {
  width: 40px;
  text-align: right;
  font-size: 11px;
  color: #888;
  flex-shrink: 0;
}

.animation-overview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.overview-label {
  width: 42px;
  color: #888;
  text-align: right;
  flex-shrink: 0;
}

.overview-value {
  min-width: 0;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timing-mode-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timing-mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid #d9dee8;
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
  cursor: pointer;
}

.timing-mode-option.active {
  border-color: #4f7fcf;
  background: #eef5ff;
  color: #244f91;
}

.timing-mode-option input {
  margin: 0;
}

.field-pair {
  display: flex;
  align-items: center;
  gap: 2px;
}

.field-label {
  font-size: 10px;
  color: #aaa;
  width: 12px;
}

.unit {
  font-size: 10px;
  color: #aaa;
}

.default-hint {
  font-size: 10px;
  color: #bbb;
  font-style: italic;
}

input[type="number"] {
  width: 52px;
  background: #fff;
  border: 1px solid #d0d3d9;
  color: #333;
  border-radius: 3px;
  padding: 3px 5px;
  font-size: 12px;
  text-align: right;
}

input[type="number"]:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

input[type="number"]:disabled {
  opacity: 0.5;
  color: #999;
  background: #f8f8fa;
}

/* Text input */
.text-input {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #d0d3d9;
  color: #333;
  border-radius: 3px;
  padding: 3px 6px;
  font-size: 12px;
}

.text-input:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.target-picker {
  position: relative;
  flex: 1;
  min-width: 0;
}

.target-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  padding: 4px 7px;
  color: #333;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.target-picker-trigger.active,
.target-picker-trigger:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.target-picker-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-picker-arrow {
  flex-shrink: 0;
  color: #6b7280;
  font-size: 10px;
}

.target-picker-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
}

.target-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 4px 7px;
  color: #374151;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.target-tree-row:hover {
  background: #f3f4f6;
}

.target-tree-row.selected {
  color: #1d4ed8;
  font-weight: 600;
  background: #eff6ff;
}

.tree-toggle,
.tree-spacer {
  width: 16px;
  flex-shrink: 0;
  color: #6b7280;
  font-size: 10px;
  text-align: center;
}

.tree-toggle:hover {
  color: #2563eb;
}

.target-icon {
  width: 18px;
  flex-shrink: 0;
  font-size: 14px;
  text-align: center;
}

.target-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  width: auto !important;
  font-size: 11px;
  color: #666;
  cursor: pointer;
  margin-left: 4px;
}

.duration-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.duration-mode label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  width: auto;
}

input.duration-input {
  width: 80px;
}

.easing-section {
  margin-bottom: 6px;
}

.easing-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
  display: block;
}

.btn-icon {
  background: none;
  border: 1px solid #d0d3d9;
  color: #555;
  border-radius: 3px;
  padding: 1px 5px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.btn-icon:hover:not(:disabled) {
  background: #e4e6ea;
}

.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  opacity: 0.4;
}

.btn-link.active {
  opacity: 1;
}

.btn-sm {
  background: #f0f1f3;
  border: 1px solid #d0d3d9;
  color: #555;
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1.4;
}

.btn-sm:hover:not(:disabled) {
  background: #e4e6ea;
}

.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.interpolated input[type="number"] {
  color: #bbb;
  font-style: italic;
}

.quick-actions {
  display: flex;
  gap: 4px;
  padding-top: 4px;
}

/* Track list (State A) */
.track-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.track-list-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 3px;
  cursor: pointer;
}

.track-list-item:hover {
  background: #e4e6ea;
}

.track-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.track-list-label {
  font-size: 11px;
  color: #555;
}

/* Value display text (State B) */
.value-text {
  font-size: 12px;
  color: #333;
}

/* Danger button (delete track) */
.btn-danger {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  border-radius: 3px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 11px;
}

.btn-danger:hover {
  background: #fecaca;
}

/* Select */
select {
  background: #fff;
  border: 1px solid #d0d3d9;
  color: #333;
  border-radius: 3px;
  padding: 3px 5px;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

select:focus {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

/* Empty hint (State A) */
.panel-empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  color: #999;
}

.panel-empty-hint.compact {
  padding: 8px 6px 0;
}

.hint-icon {
  font-size: 28px;
  margin-bottom: 8px;
  opacity: 0.6;
}

.hint-text {
  font-size: 12px;
  line-height: 1.5;
  color: #888;
}

.hint-meta {
  margin-top: 12px;
  font-size: 11px;
  color: #bbb;
}
</style>
