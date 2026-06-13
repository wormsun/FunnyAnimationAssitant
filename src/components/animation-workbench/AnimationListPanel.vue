<!--
  AnimationListPanel.vue - Workbench 左侧面板
  
  功能：动画列表 + 动作库 Tab + 新建/删除/保存模板
  从 AnimationManager.vue 提取而来，适配 Workbench 窄面板布局
-->
<template>
  <div class="animation-list-panel">
    <!-- Tab 头部（composite 模式才显示动作库 Tab） -->
    <div class="panel-tab-header">
      <button
        class="panel-tab-btn"
        :class="{ active: activeTab === 'track' }"
        @click="activeTab = 'track'"
      >
        📐 动画列表
        <span v-if="trackAnimations.length > 0" class="tab-count">{{ trackAnimations.length }}</span>
      </button>
      <button
        v-if="isCompositeMode"
        class="panel-tab-btn"
        :class="{ active: activeTab === 'preset' }"
        @click="activeTab = 'preset'"
      >
        🎬 动作库
      </button>
    </div>

    <!-- ═══ 我的动画 Tab ═══ -->
    <div v-show="activeTab === 'track'" class="tab-content">
      <!-- 操作栏 -->
      <div class="action-bar">
        <button class="btn-action" @click="createAnimationInline">+ 新建</button>
        <button v-if="!isObjectMode" class="btn-action" :disabled="trackAnimations.length === 0" @click="emit('copy-from-self')">📋 复制</button>
        <button
          v-if="isCompositeMode"
          class="btn-action btn-action-primary"
          :disabled="!currentAnimationId"
          title="把当前选中的动画保存到动作库，之后可复用到同类人物"
          @click="emit('save-as-preset')"
        >
          存为预定义
        </button>
      </div>

      <!-- 动画列表 -->
      <div class="anim-list">
        <div v-if="trackAnimations.length === 0" class="empty-hint">
          暂无动画，点击 + 新建 开始创建
        </div>

        <div
          v-for="anim in trackAnimations"
          :key="anim.id"
          class="anim-item"
          :class="{ selected: currentAnimationId === anim.id }"
          @click="emit('select', anim.id)"
        >
          <div class="anim-item-top">
            <span class="anim-icon">{{ getAnimationIcon(anim) }}</span>
            <input
              v-if="editingAnimationId === anim.id"
              :ref="(el) => setNameInputRef(anim.id, el)"
              v-model="draftNames[anim.id]"
              class="anim-item-name-input"
              maxlength="50"
              @click.stop
              @keydown.enter.stop="commitNameEdit(anim.id)"
              @keydown.esc.stop="cancelNameEdit(anim.id)"
              @blur="commitNameEdit(anim.id)"
            >
            <span
              v-else
              class="anim-item-name"
              @dblclick.stop="startEditName(anim.id)"
            >{{ anim.name }}</span>
          </div>
          <div class="anim-item-meta">
            <label class="anim-loop-toggle" @click.stop>
              <input
                type="checkbox"
                :checked="anim.loop"
                @change="onAnimationLoopChange(anim.id, $event)"
              >
              <span class="badge" :class="anim.loop ? 'loop' : 'once'">循环</span>
            </label>
            <label class="anim-fill-toggle" @click.stop>
              <input
                type="checkbox"
                :checked="(anim.fillMode ?? 'none') === 'forwards'"
                @change="onAnimationFillModeChange(anim.id, $event)"
              >
              <span class="badge" :class="(anim.fillMode ?? 'none') === 'forwards' ? 'fill-on' : 'fill-off'">定格末帧</span>
            </label>
            <span class="meta-tracks">{{ anim.tracks.length }}条轨道</span>
            <span v-if="anim.origin === 'auto'" class="badge auto">自动</span>
          </div>
          <div v-if="anim.origin !== 'auto'" class="anim-item-actions">
            <button class="btn-icon danger" title="删除" @click.stop="emit('delete', anim.id)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 动作库 Tab ═══ -->
    <div v-if="isCompositeMode && activeTab === 'preset'" class="tab-content">
      <div v-if="!rootCompositeId" class="preset-hint">
        💡 未识别到角色根复合对象，无法应用预定义动作。
      </div>

      <!-- 过滤器 -->
      <div class="preset-filters">
        <button
          v-for="src in presetSourceFilters"
          :key="src.value"
          class="filter-chip"
          :class="{ active: presetSourceFilter === src.value }"
          @click="presetSourceFilter = src.value"
        >{{ src.label }}</button>
      </div>

      <!-- 模板列表 -->
      <div class="preset-list">
        <div
          v-for="item in filteredPresets"
          :key="item.template.id"
          class="preset-card"
          :class="{ unavailable: !item.applicable }"
        >
          <div class="preset-card-top">
            <span class="preset-name">{{ item.template.name }}</span>
            <div class="preset-badges">
              <span v-if="item.template.origin === 'user'" class="preset-origin">自定</span>
              <span class="preset-kind">{{ item.template.expectedTargets.length }}部位</span>
            </div>
          </div>
          <div v-if="item.template.description" class="preset-desc">{{ item.template.description }}</div>
          <div v-if="item.blockingMissing.length > 0" class="preset-missing">
            缺少: {{ item.blockingMissing.map(m => m.recommendedName).join(', ') }}
          </div>
          <div v-if="item.diagnostics.ambiguous.length > 0" class="preset-missing">
            歧义: {{ item.diagnostics.ambiguous.map(a => a.recommendedName).join(', ') }}
          </div>
          <div class="preset-card-actions">
            <button class="btn-preset-apply" @click="handlePresetApply(item.template)">
              {{ item.applicable ? '使用' : '使用（需指定）' }}
            </button>
            <button v-if="item.template.origin === 'user'" class="btn-icon danger" title="删除" @click="handleDeleteCustomPreset(item.template.id)">🗑️</button>
          </div>
        </div>

        <div v-if="filteredPresets.length === 0" class="empty-hint">
          没有符合筛选条件的动作模板。
        </div>
      </div>
    </div>

    <!-- ═══ 预制动画确认弹窗 ═══ -->
    <div v-if="showPresetConfirm" class="create-overlay" @click.self="showPresetConfirm = false">
      <div class="create-dialog preset-confirm-dialog">
        <h4>确认使用动作模板</h4>

        <!-- 自动匹配部位 -->
        <div v-if="applyTargetPreview.length > 0" class="preset-section">
          <div class="preset-section-title">自动匹配 ({{ applyTargetPreview.length }})</div>
          <div class="rig-preview">
            <div v-for="item in applyTargetPreview" :key="item.targetKey" class="rig-preview-row">
              <span class="rig-name">{{ item.recommendedName }}</span>
              <span class="rig-arrow">→</span>
              <span class="rig-obj">{{ item.objectName }}</span>
            </div>
          </div>
        </div>

        <!-- 歧义部位：必须从候选中选 -->
        <div v-if="pendingAmbiguousTargets.length > 0" class="preset-section">
          <div class="preset-section-title warn">存在歧义 ({{ pendingAmbiguousTargets.length }})，请选择</div>
          <div class="override-list">
            <div v-for="amb in pendingAmbiguousTargets" :key="amb.targetKey" class="override-row">
              <span class="rig-name">{{ amb.recommendedName }}</span>
              <span class="rig-arrow">→</span>
              <select
                class="override-select"
                :value="pendingOverrides[amb.targetKey] ?? ''"
                @change="pendingOverrides = { ...pendingOverrides, [amb.targetKey]: ($event.target as HTMLSelectElement).value }"
              >
                <option value="" disabled>-- 选择候选对象 --</option>
                <option v-for="cid in amb.candidates" :key="cid" :value="cid">
                  {{ objectDisplayLabel(cid) }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 缺失部位：从整个子树选一个 -->
        <div v-if="pendingMissingTargets.length > 0" class="preset-section">
          <div class="preset-section-title warn">缺失部位 ({{ pendingMissingTargets.length }})，请手动指定</div>
          <div class="override-list">
            <div v-for="miss in pendingMissingTargets" :key="miss.targetKey" class="override-row">
              <span class="rig-name">{{ miss.recommendedName }}</span>
              <span class="rig-arrow">→</span>
              <select
                class="override-select"
                :value="pendingOverrides[miss.targetKey] ?? ''"
                @change="pendingOverrides = { ...pendingOverrides, [miss.targetKey]: ($event.target as HTMLSelectElement).value }"
              >
                <option value="" disabled>-- 选择场景对象 --</option>
                <option v-for="opt in subtreeObjectOptions" :key="opt.id" :value="opt.id">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div class="preset-warn">⚠️ 同名动画如已存在将被覆盖。</div>
        <div class="create-actions">
          <button class="btn-cancel" @click="showPresetConfirm = false">取消</button>
          <button class="btn-confirm" :disabled="!canConfirmApply" @click="confirmPresetApply">确认使用</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { PRESET_ANIMATIONS } from '@/presetAnimationCatalog'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { AnimationDefinition } from '@/types/animation'
import type { PresetAnimationTemplate } from '@/types/presetAnimation'
import type { SceneObject } from '@/types/sceneObject'
import {
  canApplyPreset,
  collectSubtreeIds,
  instantiatePresetAnimation,
  type InstantiationDiagnostics,
} from '@/utils/presetAnimationMapper'

// ===== Props & Emits =====

const props = defineProps<{
  animations: AnimationDefinition[]
  currentAnimationId: string | null
  isObjectMode: boolean
  isCompositeMode: boolean
  sceneObject?: SceneObject
  rootCompositeId?: string
}>()

const emit = defineEmits<{
  select: [animationId: string]
  edit: [animationId: string]
  delete: [animationId: string]
  create: [animation: AnimationDefinition]
  'copy-from-self': []
  'save-as-preset': []
  'preset-applied': [animation: AnimationDefinition]
  'update:animations': [animations: Record<string, AnimationDefinition>]
}>()

const projectStore = useProjectStore()
const sceneObjectStore = useSceneObjectStore()

// ===== 动画列表 =====

const trackAnimations = computed((): AnimationDefinition[] =>
  props.animations.filter(a => a.type === 'track')
)

function getAnimationIcon(animation: AnimationDefinition): string {
  if (animation.tracks.some(t => t.trackType === 'effect')) return '✨'
  if (animation.tracks.some(t => t.trackType === 'transform')) return '📐'
  if (animation.tracks.some(t => t.trackType === 'frame_sequence')) return '🎞️'
  if (animation.tracks.some(t => t.trackType === 'visibility')) return '👁️'
  return '🔄'
}

// ===== Tab 状态 =====

const activeTab = ref<'track' | 'preset'>('track')

// ===== 新建 / 重命名 =====

const editingAnimationId = ref<string | null>(null)
const draftNames = ref<Record<string, string>>({})
const nameInputRefs = new Map<string, HTMLInputElement>()

watch(
  () => props.animations,
  (animations) => {
    const nextDrafts: Record<string, string> = {}
    for (const anim of animations) nextDrafts[anim.id] = draftNames.value[anim.id] ?? anim.name
    draftNames.value = nextDrafts
  },
  { immediate: true, deep: true }
)

function setNameInputRef(animationId: string, el: Element | { $el?: Element } | null) {
  const element = el instanceof Element ? el : el?.$el
  if (element instanceof HTMLInputElement) nameInputRefs.set(animationId, element)
  else nameInputRefs.delete(animationId)
}

function focusNameInput(animationId: string) {
  void nextTick(() => {
    const input = nameInputRefs.get(animationId)
    input?.focus()
    input?.select()
  })
}

function buildNextAnimationName(): string {
  const existingNames = new Set(props.animations.map(a => a.name))
  let index = 1
  while (true) {
    const candidate = index === 1 ? '新动画' : `新动画 ${index}`
    if (!existingNames.has(candidate)) return candidate
    index += 1
  }
}

function createAnimationInline() {
  const name = buildNextAnimationName()

  const id = `animation_${crypto.randomUUID()}`
  const now = Date.now()

  const animation: AnimationDefinition = {
    type: 'track',
    id,
    name,
    loop: false,
    tracks: [],
    createdAt: now,
    updatedAt: now,
  }

  emit('create', animation)
  draftNames.value = { ...draftNames.value, [id]: name }
  editingAnimationId.value = id
  focusNameInput(id)
}

function startEditName(animationId: string) {
  const anim = props.animations.find(item => item.id === animationId)
  if (!anim || anim.origin === 'auto') return
  draftNames.value = { ...draftNames.value, [animationId]: anim.name }
  editingAnimationId.value = animationId
  focusNameInput(animationId)
}

function cancelNameEdit(animationId: string) {
  const anim = props.animations.find(item => item.id === animationId)
  if (anim) draftNames.value = { ...draftNames.value, [animationId]: anim.name }
  editingAnimationId.value = null
}

function commitNameEdit(animationId: string) {
  if (editingAnimationId.value !== animationId) return
  const anim = props.animations.find(item => item.id === animationId)
  if (!anim) {
    editingAnimationId.value = null
    return
  }

  const trimmed = (draftNames.value[animationId] ?? '').trim()
  const nextName = trimmed || anim.name
  const duplicated = props.animations.some(item => item.id !== animationId && item.name === nextName)
  if (duplicated) {
    draftNames.value = { ...draftNames.value, [animationId]: anim.name }
    editingAnimationId.value = null
    alert(`动画名称 "${nextName}" 已存在，请使用其他名称`)
    return
  }

  if (nextName !== anim.name) {
    const updatedAnimations = Object.fromEntries(
      props.animations.map(item => [item.id, item.id === animationId ? { ...item, name: nextName, updatedAt: Date.now() } : item])
    ) as Record<string, AnimationDefinition>
    emit('update:animations', updatedAnimations)
  }

  draftNames.value = { ...draftNames.value, [animationId]: nextName }
  editingAnimationId.value = null
}

function onAnimationLoopChange(animationId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const updatedAnimations = Object.fromEntries(
    props.animations.map(item => [
      item.id,
      item.id === animationId ? { ...item, loop: checked, updatedAt: Date.now() } : item,
    ])
  ) as Record<string, AnimationDefinition>
  emit('update:animations', updatedAnimations)
}

function onAnimationFillModeChange(animationId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const fillMode: 'none' | 'forwards' = checked ? 'forwards' : 'none'
  const updatedAnimations = Object.fromEntries(
    props.animations.map(item => [
      item.id,
      item.id === animationId ? { ...item, fillMode, updatedAt: Date.now() } : item,
    ])
  ) as Record<string, AnimationDefinition>
  emit('update:animations', updatedAnimations)
}

// ===== 动作库 =====

const presetSourceFilter = ref<string>('all')

const presetSourceFilters = [
  { value: 'all', label: '全部' },
  { value: 'system', label: '系统' },
  { value: 'user', label: '自定义' },
]

interface PresetItem {
  template: PresetAnimationTemplate
  diagnostics: InstantiationDiagnostics
  blockingMissing: InstantiationDiagnostics['missing']
  applicable: boolean
}

const allPresetTemplates = computed((): PresetAnimationTemplate[] => [
  ...PRESET_ANIMATIONS,
  ...projectStore.customPresetAnimations,
])

function buildSceneObjectsMap(): Map<string, SceneObject> {
  const map = new Map<string, SceneObject>()
  for (const obj of sceneObjectStore.objects) map.set(obj.id, obj)
  return map
}

const filteredPresets = computed((): PresetItem[] => {
  let templates = allPresetTemplates.value
  if (presetSourceFilter.value !== 'all') {
    templates = templates.filter(t => t.origin === presetSourceFilter.value)
  }
  const rootId = props.rootCompositeId ?? props.sceneObject?.id
  if (!rootId) {
    return templates.map(template => ({
      template,
      diagnostics: { unique: [], missing: [], ambiguous: [] },
      blockingMissing: [],
      applicable: false,
    }))
  }
  const objMap = buildSceneObjectsMap()
  return templates.map(template => {
    const diagnostics = canApplyPreset(template, rootId, objMap)
    const blockingMissing = diagnostics.missing.filter(m => !m.optional)
    const applicable = blockingMissing.length === 0 && diagnostics.ambiguous.length === 0
    return { template, diagnostics, blockingMissing, applicable }
  })
})

// ===== 预制动画应用 =====

const showPresetConfirm = ref(false)
const pendingPreset = ref<PresetAnimationTemplate | null>(null)
/** targetKey → objectId 手动覆盖，用于解决 missing / ambiguous */
const pendingOverrides = ref<Record<string, string>>({})

/** 根据当前 overrides 实时重算诊断 */
const pendingDiagnostics = computed((): InstantiationDiagnostics | null => {
  const template = pendingPreset.value
  const rootId = props.rootCompositeId ?? props.sceneObject?.id
  if (!template || !rootId) return null
  return canApplyPreset(template, rootId, buildSceneObjectsMap(), pendingOverrides.value)
})

/** 可供 override 选择的子树对象（展平） */
const subtreeObjectOptions = computed((): { id: string; label: string }[] => {
  const rootId = props.rootCompositeId ?? props.sceneObject?.id
  if (!rootId) return []
  const objMap = buildSceneObjectsMap()
  const ids = collectSubtreeIds(rootId, objMap)
  const out: { id: string; label: string }[] = []
  for (const id of ids) {
    const obj = objMap.get(id)
    if (!obj) continue
    const alias = obj.alias?.trim()
    const label = alias ? `${alias} (${obj.name})` : obj.name
    out.push({ id, label })
  }
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
})

/** 自动唯一命中 */
const applyTargetPreview = computed((): { targetKey: string; recommendedName: string; objectName: string }[] => {
  const diagnostics = pendingDiagnostics.value
  if (!diagnostics) return []
  return diagnostics.unique.map(entry => {
    const obj = sceneObjectStore.getObject(entry.objectId)
    return {
      targetKey: entry.targetKey,
      recommendedName: entry.recommendedName,
      objectName: obj?.alias ?? obj?.name ?? entry.objectId,
    }
  })
})

/** 需要用户手动指定的缺失项（非 optional） */
const pendingMissingTargets = computed(() => {
  const diagnostics = pendingDiagnostics.value
  if (!diagnostics) return []
  return diagnostics.missing.filter(m => !m.optional)
})

/** 歧义项 */
const pendingAmbiguousTargets = computed(() => {
  const diagnostics = pendingDiagnostics.value
  if (!diagnostics) return []
  return diagnostics.ambiguous
})

/** 确认按钮是否可用：无 blocking missing 且无 ambiguous */
const canConfirmApply = computed((): boolean => {
  return pendingMissingTargets.value.length === 0 && pendingAmbiguousTargets.value.length === 0
})

function objectDisplayLabel(objectId: string): string {
  const obj = sceneObjectStore.getObject(objectId)
  if (!obj) return objectId.slice(0, 8)
  return obj.alias ?? obj.name ?? objectId.slice(0, 8)
}

function handlePresetApply(template: PresetAnimationTemplate): void {
  pendingPreset.value = template
  pendingOverrides.value = {}
  showPresetConfirm.value = true
}

function confirmPresetApply(): void {
  const template = pendingPreset.value
  const rootId = props.rootCompositeId ?? props.sceneObject?.id
  if (!template || !rootId || !props.sceneObject) {
    showPresetConfirm.value = false
    return
  }
  if (!canConfirmApply.value) return

  try {
    const sceneObjects = buildSceneObjectsMap()
    const result = instantiatePresetAnimation(template, rootId, sceneObjects, pendingOverrides.value)

    const rootObj = sceneObjectStore.getObject(rootId)
    if (rootObj) {
      const anims = { ...(rootObj.animations ?? {}) }
      for (const [existingId, existingAnim] of Object.entries(anims)) {
        if (existingAnim.name === result.animation.name) {
          delete anims[existingId]
        }
      }
      anims[result.animation.id] = result.animation
      emit('update:animations', anims)
    }
    activeTab.value = 'track'
    emit('preset-applied', JSON.parse(JSON.stringify(result.animation)) as AnimationDefinition)
  } catch (error) {
    console.error('[AnimationListPanel] 应用预制动画失败:', error)
  }

  showPresetConfirm.value = false
  pendingPreset.value = null
  pendingOverrides.value = {}
}

function handleDeleteCustomPreset(templateId: string): void {
  if (confirm('确定要删除这个自定义动作模板吗？')) {
    projectStore.deleteCustomPreset(templateId)
  }
}
</script>

<style scoped>
.animation-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
  overflow: hidden;
  position: relative;
}

/* Tab Header */
.panel-tab-header {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e0e3e8;
  flex-shrink: 0;
}

.panel-tab-btn {
  flex: 1;
  padding: 6px 4px;
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.panel-tab-btn:hover { color: #555; }
.panel-tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }

.tab-count {
  font-size: 10px;
  background: #e5e7eb;
  border-radius: 8px;
  padding: 1px 5px;
  color: #555;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Action Bar */
.action-bar {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid #f0f1f3;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f9fafb;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.btn-action {
  font-size: 11px;
  padding: 3px 8px;
  background: #fff;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  cursor: pointer;
  color: #555;
}

.btn-action:hover { background: #f0f4ff; border-color: #93b4f6; color: #3b82f6; }
.btn-action:disabled { opacity: 0.4; cursor: default; }

.btn-action-primary {
  margin-left: auto;
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
  font-weight: 600;
}

/* Animation List */
.anim-list {
  padding: 4px;
}

.anim-item {
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  background: #fff;
  transition: all 0.15s;
}

.anim-item:hover { border-color: #d0d3d9; }
.anim-item.selected { border-color: #3b82f6; background: #eff6ff; }

.anim-item-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.anim-icon { font-size: 13px; }
.anim-item-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}

.anim-item-name-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: #fff;
  padding: 2px 6px;
  outline: none;
}

.anim-item-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.anim-loop-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.anim-loop-toggle input {
  margin: 0;
}

.anim-fill-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.anim-fill-toggle input {
  margin: 0;
}

.badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
}

.badge.loop { background: #dbeafe; color: #2563eb; }
.badge.once { background: #f3f4f6; color: #6b7280; }
.badge.auto { background: #fef3c7; color: #92400e; }
.badge.fill-on { background: #dcfce7; color: #16a34a; }
.badge.fill-off { background: #f3f4f6; color: #9ca3af; }

.meta-tracks { font-size: 10px; color: #999; }

.anim-item-actions {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  justify-content: flex-end;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0.7;
}

.btn-icon:hover { opacity: 1; background: #f0f1f3; }
.btn-icon.danger:hover { background: #fef2f2; }

/* Empty hint */
.empty-hint {
  text-align: center;
  color: #999;
  font-size: 11px;
  padding: 20px 12px;
}

/* Preset filters */
.preset-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 6px 8px;
  border-bottom: 1px solid #f0f1f3;
}

.filter-chip {
  font-size: 10px;
  padding: 2px 6px;
  background: #f3f4f6;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  color: #666;
}

.filter-chip.active { background: #dbeafe; color: #2563eb; border-color: #93c5fd; }
.filter-sep { color: #ddd; font-size: 10px; line-height: 20px; }

.preset-hint {
  text-align: center;
  color: #999;
  font-size: 11px;
  padding: 12px 8px;
}

/* Preset cards */
.preset-list { padding: 4px; }

.preset-card {
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 4px;
}

.preset-card.unavailable { opacity: 0.5; }

.preset-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preset-name { font-size: 12px; font-weight: 500; color: #333; }

.preset-badges {
  display: flex;
  gap: 4px;
}

.preset-origin { font-size: 9px; background: #fef3c7; color: #92400e; padding: 1px 4px; border-radius: 3px; }
.preset-kind { font-size: 9px; color: #999; }

.preset-desc { font-size: 10px; color: #888; margin-top: 2px; }
.preset-missing { font-size: 10px; color: #ef4444; margin-top: 2px; }

.preset-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}

.btn-preset-apply {
  font-size: 10px;
  padding: 2px 10px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.btn-preset-apply:hover { background: #2563eb; }
.btn-preset-apply:disabled { opacity: 0.4; cursor: default; }

/* Dialog overlays */
.create-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.create-dialog {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  width: calc(100% - 24px);
  max-width: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.create-dialog.preset-confirm-dialog {
  max-width: 380px;
  max-height: 80vh;
  overflow-y: auto;
}

.preset-section { margin-bottom: 10px; }
.preset-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 4px;
}
.preset-section-title.warn { color: #92400e; }

.override-list { display: flex; flex-direction: column; gap: 4px; }
.override-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.override-select {
  flex: 1;
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
}
.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.create-dialog h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #333;
}

.create-field {
  margin-bottom: 10px;
}

.create-field label {
  display: block;
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
}

.create-field input[type="text"],
.create-field select {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
}

.create-field input:focus,
.create-field select:focus {
  border-color: #3b82f6;
  outline: none;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #555;
}

.create-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.btn-cancel {
  padding: 5px 12px;
  font-size: 12px;
  background: #f3f4f6;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  cursor: pointer;
  color: #555;
}

.btn-confirm {
  padding: 5px 12px;
  font-size: 12px;
  background: #3b82f6;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}

.btn-confirm:hover { background: #2563eb; }
.btn-confirm:disabled { opacity: 0.4; cursor: default; }

/* Rig preview */
.rig-preview { margin: 8px 0; }
.rig-preview-row { display: flex; gap: 4px; font-size: 12px; color: #555; padding: 2px 0; }
.rig-name { font-weight: 500; }
.rig-arrow { color: #999; }
.rig-obj { color: #3b82f6; }
.preset-warn { font-size: 11px; color: #f59e0b; margin: 8px 0; }
</style>
