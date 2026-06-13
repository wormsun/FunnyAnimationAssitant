/**
 * useSetupWorkspace.ts
 *
 * 提取自 SetupEditor.vue 的通用画布工作区逻辑。
 * 供 SetupEditor（场景编辑 Setup 模式）和 SceneTemplateEditor（模板编辑器）共享。
 *
 * 职责：
 * - 画布渲染管理 (useSceneRenderer)
 * - 对象操作 (选择/更新/删除/复制/Z轴)
 * - 右面板控制 (折叠/宽度拖拽/Tab切换)
 * - 素材 Picker 管理 (7 种素材添加)
 * - 成组模式 (create/addTo)
 * - 别名管理 (InstanceAliasDialog)
 * - 动画触发
 * - 全屏切换
 * - 确认对话框 / 保存确认对话框
 * - 修改状态追踪
 */

import { computed, type Ref, ref, watch } from 'vue'

import { useSceneRenderer } from '@/composables/useSceneRenderer'
import { useToast } from '@/composables/useToast'
import { CANVAS_CENTER_X, CANVAS_CENTER_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '@/constants/canvas'
import { getAnimationResourceType, getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useAnimationStore } from '@/stores/animationStore'
import { useBackgroundStore } from '@/stores/backgroundStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { AnimationTimingMode } from '@/types/animation'
import type { CompositeCharacter } from '@/types/compositeCharacter'
import type { Background, PropAsset, SoundAsset } from '@/types/project'
import type { CompositeExtraInfo, CompositeObject, SceneObject, ScreenEffectPreset } from '@/types/sceneObject'
import type { SceneTemplate } from '@/types/sceneTemplate'
import { debugLog } from '@/utils/debugLogger'
import { applyMeasuredDefaultSize } from '@/utils/sceneObjectDefaultSize'
import { instantiateTemplate } from '@/utils/sceneTemplateEngine'

// ===== 类型定义 =====

/** 成组模式状态 */
type GroupingState =
  | { mode: 'create'; pendingIds: string[] }
  | { mode: 'addTo'; compositeId: string; pendingIds: string[] }
  | null

/** 成组模式对象树节点 */
export interface GroupingTreeNode {
  id: string
  name: string
  type: string
  icon: string
  depth: number
  parentId: string | undefined
  children: GroupingTreeNode[]
}

/** useSceneRenderer 额外参数（场景编辑器需要，模板编辑器不需要） */
export interface RendererExtras {
  episodeId?: string
  sceneId?: string
  blockId?: string | null
}

/** composable 配置 */
export interface SetupWorkspaceOptions {
  /** 画布容器 DOM ref */
  canvasContainer: Ref<HTMLElement | undefined>
  /** 编辑器根容器 DOM ref（用于全屏） */
  editorContainer: Ref<HTMLElement | undefined>
  /** useSceneRenderer 额外选项 */
  rendererExtras?: RendererExtras
  /** 数据修改时额外回调（如 projectStore.markAsUnsaved） */
  onDataChange?: () => void
  /** 保存数据（由消费者实现） */
  onSave: () => Promise<void>
  /** 退出编辑器（由消费者实现） */
  onExit: () => void
}

// ===== Composable 实现 =====

export function useSetupWorkspace(options: SetupWorkspaceOptions) {
  // ----- Stores -----
  const sceneObjectStore = useSceneObjectStore()
  const backgroundStore = useBackgroundStore()
  const soundStore = useSoundStore()
  const toast = useToast()

  // ===== 1. 修改状态追踪 =====
  const hasLocalChanges = ref(false)

  function markLocalChange() {
    hasLocalChanges.value = true
    options.onDataChange?.()
  }

  function resetLocalChanges() {
    hasLocalChanges.value = false
  }

  // ===== 2. 画布渲染管理 =====
  const renderer = ref<ReturnType<typeof useSceneRenderer> | null>(null)

  async function initCanvas(): Promise<void> {
    const container = options.canvasContainer.value
    if (!container) {
      console.error('[useSetupWorkspace] 画布容器未找到')
      return
    }

    const rendererInstance = useSceneRenderer({
      canvasContainer: container,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      mode: 'setup',
      episodeId: options.rendererExtras?.episodeId ?? '',
      sceneId: options.rendererExtras?.sceneId ?? '',
      blockId: options.rendererExtras?.blockId ?? null,
      onSetupChange: () => markLocalChange(),
    })

    renderer.value = rendererInstance
    await rendererInstance.initRenderer()
    
    // 初始化穿透列表默认值（相机自动加入）
    rendererInstance.getSceneGraph().initPassThroughDefaults()

    setTimeout(() => {
      rendererInstance.scrollToCanvasCenter()
    }, 100)
  }

  function destroyCanvas(): void {
    if (renderer.value) {
      renderer.value.destroyRenderer()
      renderer.value = null
    }
  }

  // ===== 3. 右面板控制 =====
  const rightPanelCollapsed = ref(false)
  const rightPanelWidth = ref(320)


  let isResizingRightPanel = false

  function startResizeRightPanel(event: MouseEvent): void {
    isResizingRightPanel = true
    event.preventDefault()

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRightPanel) {
        const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
        rightPanelWidth.value = newWidth
      }
    }

    const handleMouseUp = () => {
      isResizingRightPanel = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      if (renderer.value) {
        renderer.value.updateTransformParams()
        void renderer.value.renderObjects()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // ===== 4. 对象操作 =====

  function handleSelectObject(objectId: string | null): void {
    sceneObjectStore.selectObject(objectId)
  }

  function handleUpdateObject(updates: Partial<SceneObject>): void {
    const selected = sceneObjectStore.getSelectedObject()
    if (!selected) return
    if (selected.type === 'mask' || (updates as Partial<{ type: string }>).type === 'mask') {
      debugLog('mask', '[MASK-DEBUG] useSetupWorkspace.handleUpdateObject\n' + JSON.stringify({ selectedId: selected.id, updates }, null, 2))
    }
    sceneObjectStore.updateObject(selected.id, updates)
    markLocalChange()
    if (renderer.value) {
      void renderer.value.renderObjects()
    }
  }

  function handleDeleteObject(objectId?: string): void {
    const idToDelete = objectId ?? sceneObjectStore.selectedObjectId
    if (!idToDelete) return

    const obj = sceneObjectStore.getObject(idToDelete)
    if (!obj) return

    // v25: 环境光不可删除
    if (obj.type === 'light' && (obj as import('@/types/sceneObject').LightObject).lightType === 'ambient') return

    const alias = (obj as unknown as { alias?: string }).alias ?? obj.name ?? '该对象'

    // 检测是否为 composite 且有子对象 → 三选项对话框（entity/union 统一）
    const isCompositeWithChildren = obj.type === 'composite'
      && (obj as unknown as { childIds?: string[] }).childIds?.length

    if (isCompositeWithChildren) {
      const childCount = (obj as unknown as { childIds: string[] }).childIds.length
      confirmDialogConfig.value = {
        title: '删除组合对象',
        message: `确定要删除 "${alias}" 吗？该组合包含 ${childCount} 个子对象。\n\n仅删除组合：子对象冒泡到上一级\n删除组合及后代：全部删除`,
        confirmText: '仅删除组合',
        cancelText: '取消',
        isDanger: false,
        showSecondaryConfirm: true,
        secondaryConfirmText: '删除组合及其后代',
        onConfirm: () => {
          sceneObjectStore.dissolveComposite(idToDelete)
          sceneObjectStore.removeObject(idToDelete)
          showConfirmDialog.value = false
          markLocalChange()
        },
        onSecondaryConfirm: () => {
          sceneObjectStore.removeObjectWithDescendants(idToDelete)
          showConfirmDialog.value = false
          markLocalChange()
        },
      }
    } else {
      confirmDialogConfig.value = {
        title: '删除对象',
        message: `确定要删除 "${alias}" 吗？此操作无法撤销。`,
        confirmText: '删除',
        cancelText: '取消',
        isDanger: true,
        showSecondaryConfirm: false,
        secondaryConfirmText: '',
        onConfirm: () => {
          sceneObjectStore.removeObject(idToDelete)
          showConfirmDialog.value = false
          markLocalChange()
        },
        onSecondaryConfirm: () => undefined as void,
      }
    }
    showConfirmDialog.value = true
  }

  function handleCopyObject(): void {
    const selected = sceneObjectStore.getSelectedObject()
    if (!selected) return

    const duplicate = sceneObjectStore.duplicateObject(selected.id)
    if (!duplicate) return

    sceneObjectStore.selectObject(duplicate.id)
    markLocalChange()
  }

  function handleMoveUp(): void {
    const selected = sceneObjectStore.getSelectedObject()
    if (!selected) return
    sceneObjectStore.updateObject(selected.id, { zIndex: selected.zIndex + 1 })
    markLocalChange()
    if (renderer.value) {
      void renderer.value.renderObjects()
    }
  }

  function handleMoveDown(): void {
    const selected = sceneObjectStore.getSelectedObject()
    if (!selected) return
    const newZIndex = Math.max(-10, selected.zIndex - 1)
    sceneObjectStore.updateObject(selected.id, { zIndex: newZIndex })
    markLocalChange()
    if (renderer.value) {
      void renderer.value.renderObjects()
    }
  }

  function handleInitialStateUpdate(_pose?: string, _expression?: string): void {
    // character 类型已移除，此函数不再执行任何操作
    return
  }

  // ===== 5. 素材 Picker 管理 =====
  const showCharacterPicker = ref(false)
  const showBackgroundPicker = ref(false)
  const showPropPicker = ref(false)
  const showSoundPicker = ref(false)
  const showScreenEffectPicker = ref(false)
  const showTemplatePicker = ref(false)
  const showExpressionPicker = ref(false)
  const showActorPicker = ref(false)
  const showLightPicker = ref(false)
  const showAddMenu = ref(false)

  function toggleAddMenu(): void {
    showAddMenu.value = !showAddMenu.value
  }

  function handleMenuItemClick(type: string): void {
    showAddMenu.value = false

    switch (type) {
      case 'characters':
        showCharacterPicker.value = true
        break
      case 'backgrounds':
        showBackgroundPicker.value = true
        break
      case 'props':
        showPropPicker.value = true
        break
      case 'sounds':
        showSoundPicker.value = true
        break
      case 'screen_effects':
        showScreenEffectPicker.value = true
        break
      case 'scene_templates':
        showTemplatePicker.value = true
        break
      case 'symbol': {
        const symbolName = sceneObjectStore.generateUniqueAlias('元件')
        const symbolObj = sceneObjectStore.createSymbolObject(symbolName)
        sceneObjectStore.selectObject(symbolObj.id)
        markLocalChange()
        break
      }
      case 'expression':
        showExpressionPicker.value = true
        break
      case 'actors':
        showActorPicker.value = true
        break
      case 'light':
        showLightPicker.value = true
        break
      case 'text': {
        const textObj = sceneObjectStore.createTextObject('文本')
        sceneObjectStore.selectObject(textObj.id)
        markLocalChange()
        break
      }
      case 'mask_rectangle':
      case 'mask_ellipse': {
        const shape = type === 'mask_ellipse' ? 'ellipse' : 'rectangle'
        const maskName = sceneObjectStore.generateUniqueAlias(shape === 'ellipse' ? '椭圆蒙版' : '矩形蒙版')
        const maskObj = sceneObjectStore.createMaskObject(maskName, shape)
        sceneObjectStore.selectObject(maskObj.id)
        markLocalChange()
        break
      }
    }
  }

  function handleLightSelect(result: { lightType: 'point' | 'spot'; params?: { lightColor?: string; lightIntensity?: number; lightRadius?: number; flicker?: number; flickerSpeed?: number; directionAngle?: number; coneAngle?: number } }): void {
    const isSpot = result.lightType === 'spot'
    const p = result.params
    const lightObj = sceneObjectStore.createLightObject(isSpot ? 'spot' : 'point', isSpot ? '聚光灯' : '点光源', {
      lightColor: p?.lightColor ?? '#ffffff',
      lightIntensity: p?.lightIntensity ?? 1.0,
      lightRadius: p?.lightRadius ?? (isSpot ? 420 : 300),
      flicker: p?.flicker ?? 0,
      flickerSpeed: p?.flickerSpeed ?? 0.35,
      directionMode: isSpot ? 'cone' : 'omni',
      directionAngle: p?.directionAngle ?? 0,
      coneAngle: p?.coneAngle ?? (isSpot ? 70 : 100),
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
    })
    sceneObjectStore.selectObject(lightObj.id)
    showLightPicker.value = false
    markLocalChange()
  }


  function handleCharacterSelect(actorData: { actorId: string; name: string; characterId: string }): void {
    pendingActorData.value = actorData
    pendingCanvasCenter.value = { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y }
    showCharacterPicker.value = false
    showAliasDialog.value = true
  }

  async function handleBackgroundSelect(background: Background): Promise<void> {
    const newObject = sceneObjectStore.createBackgroundObject(background.id, background.name)
    await applyMeasuredDefaultSize(newObject, sceneObjectStore.updateObject)
    useAnimationStore().hydrateObjectAnimations(newObject)
    // v21: 仅 UI 创建路径自动播放帧动画（反序列化路径不触发）
    sceneObjectStore.autoPopulateInitialAnimations(newObject)
    sceneObjectStore.selectObject(newObject.id)
    showBackgroundPicker.value = false
    markLocalChange()
  }

  async function handlePropSelect(prop: PropAsset): Promise<void> {
    if (typeof sceneObjectStore.createPropObject !== 'function') {
      console.error('[useSetupWorkspace] sceneObjectStore.createPropObject is not a function.')
      return
    }
    const newObject = sceneObjectStore.createPropObject(prop.id, prop.name ?? '未命名道具')
    await applyMeasuredDefaultSize(newObject, sceneObjectStore.updateObject)
    // v21: 仅 UI 创建路径自动播放帧动画（反序列化路径不触发）
    sceneObjectStore.autoPopulateInitialAnimations(newObject)
    sceneObjectStore.selectObject(newObject.id)
    showPropPicker.value = false
    markLocalChange()
  }

  function handleSoundSelect(sound: SoundAsset): void {
    if (typeof sceneObjectStore.createAudioObject !== 'function') {
      console.error('[useSetupWorkspace] sceneObjectStore.createAudioObject is not a function.')
      return
    }

    const isBgm = sound.type === 'bgm'
    const initialProps = {
      volume: 1.0,
      loop: isBgm,
      autoPlay: isBgm,
      fadeIn: 0,
      fadeOut: 0,
    }

    const newObject = sceneObjectStore.createAudioObject(
      sound.id,
      sound.name,
      initialProps,
    )

    sceneObjectStore.selectObject(newObject.id)
    showSoundPicker.value = false
    markLocalChange()
  }

  function handleScreenEffectSelect(preset: ScreenEffectPreset): void {
    showScreenEffectPicker.value = false
    const effectObj = sceneObjectStore.createScreenEffectObject(
      preset.effectClass,
      preset.name,
      preset.params,
    )
    if (preset.defaultAlpha !== undefined) {
      sceneObjectStore.updateObject(effectObj.id, { alpha: preset.defaultAlpha })
    }
    sceneObjectStore.selectObject(effectObj.id)
    markLocalChange()
  }

  /**
   * 设置实例化结果中顶层根对象的 alias 和 extraInfo。
   * 无论单根还是多根（wrapper），统一找到第一个无 parentId 的对象并更新。
   */
  function setRootIdentity(objects: SceneObject[], targetName: string, extraInfo: CompositeExtraInfo): void {
    const root = objects.find(o => !o.parentId)
    if (!root) return
    const nsRoot = sceneObjectStore.resolveNamespaceRoot(root.id)
    const uniqueAlias = sceneObjectStore.generateUniqueAlias(targetName, nsRoot, root.id)
    sceneObjectStore.updateObject(root.id, { alias: uniqueAlias, extraInfo })
  }

  function handleTemplateSelect(template: SceneTemplate): void {
    showTemplatePicker.value = false

    const result = instantiateTemplate(template, CANVAS_CENTER_X, CANVAS_CENTER_Y, {
      wrapperCompositeMode: 'entity',
    })

    // v17: 逐个添加对象并重新生成唯一 alias（命名空间感知）
    for (const obj of result.objects) {
      sceneObjectStore.addObject(obj)
      // 添加后基于当前命名空间重新生成唯一 alias
      const nsRoot = sceneObjectStore.resolveNamespaceRoot(obj.id)
      const uniqueAlias = sceneObjectStore.generateUniqueAlias(obj.alias ?? obj.name, nsRoot, obj.id)
      if (uniqueAlias !== obj.alias) {
        sceneObjectStore.updateObject(obj.id, { alias: uniqueAlias })
      }
    }

    // 设置顶层根对象的 alias 和 extraInfo
    setRootIdentity(result.objects, template.name, { kind: 'template', templateId: template.id })

    if (result.objects.length > 0 && result.objects[0]) {
      sceneObjectStore.selectObject(result.objects[0].id)
    }

    markLocalChange()

    if (renderer.value) {
      void renderer.value.renderObjects()
    }
  }

  // v18: 表情选择
  async function handleExpressionSelect(expressionId: string): Promise<void> {
    showExpressionPicker.value = false
    const expressionStore = useExpressionStore()
    const expr = expressionStore.getExpression(expressionId)
    const name = expr?.name ?? '表情'
    const exprObj = sceneObjectStore.createExpressionObject(expressionId, name)
    await applyMeasuredDefaultSize(exprObj, sceneObjectStore.updateObject)
    sceneObjectStore.selectObject(exprObj.id)
    markLocalChange()
  }

  // v18: 组合式人物选择 — 实例化为 entity 模式的组合对象
  function handleCompositeCharacterSelect(character: CompositeCharacter, displayName?: string, extraInfo?: CompositeExtraInfo): void {
    showCharacterPicker.value = false

    // CompositeCharacter 和 SceneTemplate 共享 objects 结构
    const pseudoTemplate: SceneTemplate = {
      id: character.id,
      name: character.name,
      objects: character.objects,
      createdAt: character.createdAt,
      ...(character.tags ? { tags: character.tags } : {}),
      ...(character.editorAnchor ? { editorAnchor: character.editorAnchor } : {}),
      ...(character.renderChain ? { renderChain: character.renderChain } : {}),
    }

    const result = instantiateTemplate(pseudoTemplate, CANVAS_CENTER_X, CANVAS_CENTER_Y, {
      wrapperCompositeMode: 'entity',
    })

    for (const obj of result.objects) {
      sceneObjectStore.addObject(obj)
      const nsRoot = sceneObjectStore.resolveNamespaceRoot(obj.id)
      const uniqueAlias = sceneObjectStore.generateUniqueAlias(obj.alias ?? obj.name, nsRoot, obj.id)
      if (uniqueAlias !== obj.alias) {
        sceneObjectStore.updateObject(obj.id, { alias: uniqueAlias })
      }
    }

    // 设置顶层根对象的 alias 和 extraInfo
    const resolvedExtraInfo = extraInfo ?? { kind: 'character' as const, characterId: character.id }
    setRootIdentity(result.objects, displayName ?? character.name, resolvedExtraInfo)

    // 重映射 rootCompositeId（使用 idMap 将模板对象 ID 转为场景实例 ID）
    if (character.rootCompositeId) {
      const remappedRoot = result.idMap.get(character.rootCompositeId)
      const rootObj = result.objects.find(o => !o.parentId)
      if (remappedRoot && rootObj?.type === 'composite') {
        sceneObjectStore.updateObject(rootObj.id, {
          instanceRootCompositeId: remappedRoot,
        } as Partial<SceneObject>)
      }
    }

    if (result.objects.length > 0 && result.objects[0]) {
      sceneObjectStore.selectObject(result.objects[0].id)
    }

    markLocalChange()

    if (renderer.value) {
      void renderer.value.renderObjects()
    }
  }

  // 演员选择
  function handleActorSelect(character: CompositeCharacter, actorName: string, actorId: string): void {
    showActorPicker.value = false
    handleCompositeCharacterSelect(character, actorName, { kind: 'actor', actorId })
  }

  // ===== 6. 成组模式 =====
  const groupingState = ref<GroupingState>(null)

  function getObjectDisplayName(objectId: string): string {
    const obj = sceneObjectStore.getObject(objectId)
    if (!obj) return objectId
    return (obj as unknown as { alias?: string }).alias ?? obj.name ?? '未命名'
  }

  function getCompositeDisplayName(compositeId: string | undefined): string {
    if (!compositeId) return '未知'
    return getObjectDisplayName(compositeId)
  }

  function handleStartGrouping(): void {
    groupingState.value = { mode: 'create', pendingIds: [] }
  }

  function handleCompositeAction(payload: { action: string; compositeId?: string; childId?: string }): void {
    if (payload.action === 'addMember' && payload.compositeId) {
      groupingState.value = { mode: 'addTo', compositeId: payload.compositeId, pendingIds: [] }
    }
  }

  function handleCanvasClickForGrouping(): void {
    if (!groupingState.value) return

    const selectedObj = sceneObjectStore.getSelectedObject()
    if (!selectedObj || selectedObj.type === 'camera') return

    const objectId = selectedObj.id
    const pendingIds = groupingState.value.pendingIds

    if (groupingState.value.mode === 'addTo') {
      const compositeId = groupingState.value.compositeId
      if (objectId === compositeId) {
        toast.warning('不能将组合对象自身添加为其成员')
        return
      }
      let current = selectedObj
      while (current.parentId) {
        if (current.parentId === compositeId) {
          toast.warning('该对象已是此组合对象的后代，不可重复添加')
          return
        }
        const parent = sceneObjectStore.getObject(current.parentId)
        if (!parent) break
        current = parent
      }
    }

    const idx = pendingIds.indexOf(objectId)
    if (idx !== -1) {
      pendingIds.splice(idx, 1)
    } else {
      if (pendingIds.length > 0) {
        const firstObj = sceneObjectStore.getObject(pendingIds[0]!)
        const requiredParentId = firstObj?.parentId
        if (selectedObj.parentId !== requiredParentId) {
          toast.warning('仅支持选择同级对象进行成组')
          return
        }
      }
      pendingIds.push(objectId)
    }
  }

  function handleGroupingConfirm(compositeMode: 'entity' | 'union' = 'union'): void {
    if (!groupingState.value) return

    if (groupingState.value.mode === 'create') {
      if (groupingState.value.pendingIds.length < 2) return
      const composite = sceneObjectStore.groupObjects(groupingState.value.pendingIds, compositeMode)
      sceneObjectStore.selectObject(composite.id)
      markLocalChange()
    } else if (groupingState.value.mode === 'addTo') {
      if (groupingState.value.pendingIds.length === 0) return
      sceneObjectStore.addToComposite(groupingState.value.compositeId, groupingState.value.pendingIds)
      markLocalChange()
    }

    groupingState.value = null
    groupingBarOffset.value = { x: 0, y: 0 }
  }

  /**
   * 按 ID 切换对象在成组待选列表中的勾选状态（供 checkbox 列表调用）。
   * 复用 handleCanvasClickForGrouping 的校验逻辑但不依赖画布选中状态。
   */
  function handleGroupingToggleById(objectId: string): void {
    if (!groupingState.value) return

    const obj = sceneObjectStore.getObject(objectId)
    if (!obj || obj.type === 'camera') return

    const pendingIds = groupingState.value.pendingIds

    // addTo 模式校验
    if (groupingState.value.mode === 'addTo') {
      const compositeId = groupingState.value.compositeId
      if (objectId === compositeId) {
        toast.warning('不能将组合对象自身添加为其成员')
        return
      }
      let current = obj
      while (current.parentId) {
        if (current.parentId === compositeId) {
          toast.warning('该对象已是此组合对象的后代，不可重复添加')
          return
        }
        const parent = sceneObjectStore.getObject(current.parentId)
        if (!parent) break
        current = parent
      }
    }

    // 切换逻辑
    const idx = pendingIds.indexOf(objectId)
    if (idx !== -1) {
      pendingIds.splice(idx, 1)
    } else {
      // 同级检查
      if (pendingIds.length > 0) {
        const firstObj = sceneObjectStore.getObject(pendingIds[0]!)
        const requiredParentId = firstObj?.parentId
        if (obj.parentId !== requiredParentId) {
          toast.warning('仅支持选择同级对象进行成组')
          return
        }
      }
      pendingIds.push(objectId)
    }
  }

  /** 当前层级锁定的 parentId（由第一个 pending 对象决定） */
  const lockedParentId = computed<string | undefined | null>(() => {
    if (!groupingState.value) return null
    const ids = groupingState.value.pendingIds
    if (ids.length === 0) return null // null = 未锁定
    const firstObj = sceneObjectStore.getObject(ids[0]!)
    return firstObj?.parentId // undefined = 根级
  })

  /**
   * 构建成组模式下的对象树（仅非 camera 对象）。
   * Composite 节点包含子节点列表，扁平对象为叶节点。
   */
  const groupingEligibleObjects = computed<GroupingTreeNode[]>(() => {
    const objects = sceneObjectStore.objects

    function buildNode(obj: SceneObject, depth: number): GroupingTreeNode {
      const displayName = (obj as unknown as { alias?: string }).alias ?? obj.name ?? '未命名'
      const children: GroupingTreeNode[] = []

      if (obj.type === 'composite') {
        const comp = obj as unknown as CompositeObject
        for (const childId of comp.childIds) {
          const child = sceneObjectStore.getObject(childId)
          if (child && child.type !== 'camera') {
            children.push(buildNode(child, depth + 1))
          }
        }
      }

      return {
        id: obj.id,
        name: displayName,
        type: obj.type,
        icon: getTypeIcon(obj.type),
        depth,
        parentId: obj.parentId,
        children,
      }
    }

    // 只取根级对象（无 parentId）
    return objects
      .filter(o => o.type !== 'camera' && !o.parentId)
      .sort((a, b) => b.zIndex - a.zIndex)
      .map(o => buildNode(o, 0))
  })

  // ===== 6b. 成组浮动栏拖动 =====
  const groupingBarOffset = ref({ x: 0, y: 0 })

  function startDragGroupingBar(e: MouseEvent): void {
    // 忽略按钮/checkbox 上的 mousedown
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return

    e.preventDefault()
    const startX = e.clientX - groupingBarOffset.value.x
    const startY = e.clientY - groupingBarOffset.value.y

    function onMove(ev: MouseEvent) {
      groupingBarOffset.value = {
        x: ev.clientX - startX,
        y: ev.clientY - startY,
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 成组状态重置时回归默认位置
  function handleGroupingCancel(): void {
    groupingState.value = null
    groupingBarOffset.value = { x: 0, y: 0 }
  }

  // ===== 7. 别名管理 =====
  const showAliasDialog = ref(false)
  const pendingActorData = ref<{ actorId: string; name: string; characterId: string } | null>(null)
  const pendingCanvasCenter = ref<{ x: number; y: number } | null>(null)
  const editingAliasObjectId = ref<string | null>(null)

  const aliasDialogActorName = computed(() => {
    if (editingAliasObjectId.value) {
      const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
      if (!obj) return ''

      if (obj.type === 'background') {
        const bgObj = obj as unknown as { refId: string }
        const bg = backgroundStore.getBackground(bgObj.refId)
        return bg?.name ?? obj.name ?? '背景'
      } else if (obj.type === 'audio') {
        const audioObj = obj as unknown as { refId: string }
        const sound = soundStore.getSound(audioObj.refId)
        return sound?.name ?? obj.name ?? '音效'
      }
      return obj.name ?? '未命名'
    }
    return pendingActorData.value?.name ?? ''
  })

  const aliasDialogSuggestedAlias = computed(() => {
    if (editingAliasObjectId.value) {
      const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
      if (obj) {
        return obj.alias ?? obj.name ?? ''
      }
    }
    return suggestedAlias.value
  })

  const aliasDialogCurrentAlias = computed(() => {
    if (editingAliasObjectId.value) {
      const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
      if (obj) {
        return obj.alias ?? ''
      }
    }
    return undefined
  })

  const aliasDialogObjectType = computed(() => {
    if (editingAliasObjectId.value) {
      const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
      if (obj) {
        return obj.type as 'background' | 'bgm' | 'prop' | 'text'
      }
    }
    return 'prop'
  })

  const suggestedAlias = computed(() => {
    if (!pendingActorData.value) return ''
    const baseName = pendingActorData.value.name
    const existing = existingAliases.value

    if (!existing.includes(baseName)) {
      return baseName
    }

    let counter = 2
    while (existing.includes(`${baseName}${counter}`)) {
      counter++
    }
    return `${baseName}${counter}`
  })

  const existingAliases = computed(() => {
    // v17: 命名空间感知 — 基于正在编辑的对象所在的命名空间收集 alias
    const nsRoot = editingAliasObjectId.value
      ? sceneObjectStore.resolveNamespaceRoot(editingAliasObjectId.value)
      : null
    return sceneObjectStore.getExistingAliases(nsRoot)
  })

  function handleAliasConfirm(alias: string): void {
    // 编辑模式：更新现有对象的别名
    if (editingAliasObjectId.value) {
      const obj = sceneObjectStore.getObject(editingAliasObjectId.value)
      if (obj && obj.type !== 'camera') {
        sceneObjectStore.updateObject(obj.id, {
          alias: alias,
        } as unknown as Partial<SceneObject>)
        markLocalChange()
      }
      editingAliasObjectId.value = null
      showAliasDialog.value = false
      return
    }

    // Character 创建已移除 — 此分支不再使用
    showAliasDialog.value = false
  }

  function handleAliasCancel(): void {
    pendingActorData.value = null
    pendingCanvasCenter.value = null
    editingAliasObjectId.value = null
    showAliasDialog.value = false
  }

  function handleEditAlias(objectId: string): void {
    const obj = sceneObjectStore.getObject(objectId)
    if (!obj || obj.type === 'camera') return

    editingAliasObjectId.value = objectId
    pendingActorData.value = null
    pendingCanvasCenter.value = null
    showAliasDialog.value = true
  }

  // ===== 8. 动画触发 =====

  function handleTriggerAnim(payload: { action: 'play' | 'stop'; animName: string; loop?: boolean; speed?: number; timingMode?: AnimationTimingMode }): void {
    const selected = sceneObjectStore.getSelectedObject()

    if (!selected || !renderer.value) return
    if (!payload.animName) return

    const sceneGraph = renderer.value.getSceneGraph()

    interface IAnimationPlayer {
      playAnimation(animName: string, definition: unknown, params?: { loop?: boolean; speed?: number; reset?: boolean }): void
      stopAnimation(animName: string): void
    }

    // v18: 所有拥有 GenericAnimationPlayer 的对象类型都可播放动画
    const player: IAnimationPlayer | undefined = sceneGraph.getGenericAnimationPlayer(selected.id)

    if (!player) return

    const animationStore = useAnimationStore()
    const resourceType = getAnimationResourceType(selected.type)
    if (!resourceType) return

    // v18: composite 使用自身 id 作为 resourceId（没有 refId）
    const resourceId = selected.type === 'composite' ? selected.id : selected.refId
    if (!resourceId) return

    const animation = animationStore.getAnimation(resourceType, resourceId, payload.animName)
    if (!animation) return

    if (payload.action === 'play') {
      player.playAnimation(payload.animName, animation, {
        loop: payload.loop ?? true,
        speed: payload.speed ?? 1,
      })
    } else {
      player.stopAnimation(payload.animName)
    }
  }

  // ===== 9. 事件穿透列表管理 =====
  const showPassThroughTip = ref(true)

  function addToPassThrough(objectId: string): void {
    if (renderer.value) {
      const sceneGraph = renderer.value.getSceneGraph()
      sceneGraph.addPassThrough(objectId)
      void renderer.value.renderObjects()
    }
  }

  function removeFromPassThrough(objectId: string): void {
    if (renderer.value) {
      const sceneGraph = renderer.value.getSceneGraph()
      sceneGraph.removePassThrough(objectId)
      void renderer.value.renderObjects()
    }
  }

  function togglePassThroughVisible(objectId: string): void {
    if (renderer.value) {
      const sceneGraph = renderer.value.getSceneGraph()
      const entry = sceneGraph.getPassThroughEntry(objectId)
      if (entry) {
        sceneGraph.setPassThroughVisible(objectId, !entry.visible)
        void renderer.value.renderObjects()
      }
    }
  }

  function getPassThroughEntries(): ReadonlyMap<string, { visible: boolean }> {
    if (renderer.value) {
      return renderer.value.getSceneGraph().getPassThroughEntries()
    }
    return new Map()
  }

  function isObjectPassThrough(objectId: string): boolean {
    if (renderer.value) {
      return renderer.value.getSceneGraph().isPassThrough(objectId)
    }
    return false
  }

  // ===== 10. 全屏切换 =====
  const isFullscreen = ref(false)

  function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      const container = options.editorContainer.value
      if (container) {
        container.requestFullscreen().then(() => {
          isFullscreen.value = true
        }).catch((err) => {
          console.error('[useSetupWorkspace] 进入全屏失败:', err)
        })
      }
    } else {
      document.exitFullscreen().then(() => {
        isFullscreen.value = false
      }).catch((err) => {
        console.error('[useSetupWorkspace] 退出全屏失败:', err)
      })
    }
  }

  function handleFullscreenChange(): void {
    isFullscreen.value = !!document.fullscreenElement
    setTimeout(() => {
      if (renderer.value) {
        renderer.value.updateTransformParams()
        void renderer.value.renderObjects()
      }
    }, 100)
  }

  // ===== 10. 确认对话框 / 保存确认 =====
  const showConfirmDialog = ref(false)
  const confirmDialogConfig = ref({
    title: '确认',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    isDanger: false,
    showSecondaryConfirm: false,
    secondaryConfirmText: '',
    onConfirm: () => undefined as void,
    onSecondaryConfirm: () => undefined as void,
  })

  const showSaveConfirmDialog = ref(false)

  /** 工具栏返回按钮：有未保存修改时弹出 SaveConfirmDialog */
  function handleReturn(): void {
    if (hasLocalChanges.value) {
      showSaveConfirmDialog.value = true
    } else {
      options.onExit()
    }
  }

  /** SaveConfirmDialog: 保存并关闭 */
  async function handleSaveAndExit(): Promise<void> {
    showSaveConfirmDialog.value = false
    await options.onSave()
    hasLocalChanges.value = false
    options.onExit()
  }

  /** SaveConfirmDialog: 放弃修改 */
  function handleDiscardAndExit(): void {
    showSaveConfirmDialog.value = false
    options.onExit()
  }

  // ===== 11. 事件监听 =====

  function handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (!target.closest('.add-menu-container')) {
      showAddMenu.value = false
    }
  }

  function setupEventListeners(): void {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
  }

  function cleanupEventListeners(): void {
    document.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }

  // ===== 12. Watchers =====

  /** 设置所有通用 Watcher。消费者在 onMounted 中数据加载完成后调用。 */
  function setupWatchers(): void {
    // 对象数量变化 → 重渲染
    watch(
      () => sceneObjectStore.objects.length,
      () => {
        if (renderer.value) {
          void renderer.value.renderObjects()
        }
      },
    )

    // 对象属性变化 (expression, pose, visible, symbol material) → 重渲染
    watch(
      () => sceneObjectStore.objects.map(o => ({
        id: o.id,
        expression: undefined,
        pose: undefined,
        visible: o.visible,
        currentMaterialId: o.type === 'symbol' ? (o as unknown as { currentMaterialId?: string }).currentMaterialId : undefined,
        materialsLen: o.type === 'symbol' ? (o as unknown as { materials?: unknown[] }).materials?.length : undefined,
        exprRefId: o.type === 'expression' ? o.refId : undefined,
      })),
      () => {
        if (renderer.value) {
          void renderer.value.renderObjects()
        }
      },
      { deep: true },
    )

    // 右面板折叠 → 更新布局
    watch([rightPanelCollapsed], () => {
      setTimeout(() => {
        if (renderer.value) {
          renderer.value.updateTransformParams()
          void renderer.value.renderObjects()
        }
      }, 300)
    })

    // 右面板宽度 → 更新布局
    watch([rightPanelWidth], () => {
      requestAnimationFrame(() => {
        if (renderer.value) {
          renderer.value.updateTransformParams()
          void renderer.value.renderObjects()
        }
      })
    })

    // 成组高亮同步
    watch(
      () => groupingState.value?.pendingIds.slice() ?? [],
      (ids) => {
        if (renderer.value) {
          renderer.value.setGroupingPendingIds(ids)
        }
      },
      { deep: true },
    )
  }

  // ===== Return =====

  return {
    // Stores (供模板直接使用)
    sceneObjectStore,

    // 画布
    renderer,
    initCanvas,
    destroyCanvas,

    // 修改状态
    hasLocalChanges,
    markLocalChange,
    resetLocalChanges,

    // 右面板
    rightPanelCollapsed,
    rightPanelWidth,

    startResizeRightPanel,

    // 对象操作
    handleSelectObject,
    handleUpdateObject,
    handleDeleteObject,
    handleCopyObject,
    handleMoveUp,
    handleMoveDown,
    handleInitialStateUpdate,

    // 素材 Picker
    showCharacterPicker,
    showBackgroundPicker,
    showPropPicker,
    showSoundPicker,
    showScreenEffectPicker,
    showTemplatePicker,
    showExpressionPicker,
    showActorPicker,
    showLightPicker,
    showAddMenu,
    toggleAddMenu,
    handleMenuItemClick,
    handleLightSelect,
    handleCharacterSelect,
    handleBackgroundSelect,
    handlePropSelect,
    handleSoundSelect,
    handleScreenEffectSelect,
    handleTemplateSelect,
    handleExpressionSelect,
    handleCompositeCharacterSelect,
    handleActorSelect,

    // 成组
    groupingState,
    getObjectDisplayName,
    getCompositeDisplayName,
    handleStartGrouping,
    handleCompositeAction,
    handleCanvasClickForGrouping,
    handleGroupingConfirm,
    handleGroupingCancel,
    handleGroupingToggleById,
    groupingEligibleObjects,
    lockedParentId,
    groupingBarOffset,
    startDragGroupingBar,

    // 别名
    showAliasDialog,
    aliasDialogActorName,
    aliasDialogSuggestedAlias,
    aliasDialogCurrentAlias,
    aliasDialogObjectType,
    existingAliases,
    handleAliasConfirm,
    handleAliasCancel,
    handleEditAlias,

    // 动画触发
    handleTriggerAnim,

    // 穿透列表管理
    showPassThroughTip,
    addToPassThrough,
    removeFromPassThrough,
    togglePassThroughVisible,
    getPassThroughEntries,
    isObjectPassThrough,

    // 全屏
    isFullscreen,
    toggleFullscreen,

    // 确认对话框
    showConfirmDialog,
    confirmDialogConfig,

    // 保存确认
    showSaveConfirmDialog,
    handleReturn,
    handleSaveAndExit,
    handleDiscardAndExit,

    // Watchers & 事件
    setupWatchers,
    setupEventListeners,
    cleanupEventListeners,
  }
}
