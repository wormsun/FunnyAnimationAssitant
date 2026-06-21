// P1: 触发所有序列化器注册
import '@/core/sceneObjectProviders/serialization/registerAll'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { CAMERA_BASE_HEIGHT, CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import { Z_INDEX_BACKGROUND, Z_INDEX_CAMERA, Z_INDEX_DEFAULT, Z_INDEX_LIGHT, Z_INDEX_SCREEN_EFFECT, Z_INDEX_TEXT } from '@/constants/zIndex'
import { getLifecycleHooks } from '@/core/sceneObjectProviders/index'
import type { DeserializeContext } from '@/core/sceneObjectProviders/serialization/index'
import { getTypeSerializer } from '@/core/sceneObjectProviders/serialization/index'
import { useAnimationStore } from '@/stores/animationStore'
// 场景对象类型
import type {
  AudioObject,
  BackgroundObject,
  CameraObject,
  CompositeObject,
  ExpressionObject,
  LightObject,
  PropObject,
  SceneObject,
  SceneObjectBase,
  SceneObjectType,
  SceneObjectUpdateFor,
  ScreenEffectObject,
  ScreenEffectParams,
  SymbolObject,
  TextObject
} from '@/types/sceneObject'
import type { RuntimeSceneSnapshot,SceneSetup } from '@/types/screenplay'
import { createRuntimeSnapshot } from '@/types/screenplay'
import { globalToLocal, localToGlobal } from '@/utils/compositeTransform'
import { debugLog, isDebugEnabled } from '@/utils/debugLogger'
import type { RenderChainStoreAccessor } from '@/utils/renderChainManager'
import { expandChildIdsForRenderOrder as rcExpandChildIds,onCompositeDissolve as rcOnCompositeDissolve, onObjectAdded as rcOnObjectAdded, onObjectRemoved as rcOnObjectRemoved } from '@/utils/renderChainManager'
import { buildRenderChain, findInsertPosition, reconcileRenderChain, removeMultipleFromRenderChain, sortRenderChainByZIndex } from '@/utils/renderChainUtils'
import { generateId } from '@/utils/uuid'



export type {
  AudioObject,
  BackgroundObject,
  CameraObject,
  CompositeObject,
  ExpressionObject,
  PropObject,
  SceneObject,
  SceneObjectBase,
  SceneObjectType,
  ScreenEffectObject,
  ScreenEffectParams,
  SymbolObject,
  TextObject
}


export const useSceneObjectStore = defineStore('sceneObject', () => {
  // ==================== 聚合数据架构 ====================
  // setupState: 持久层 — SceneSetup 的响应式包装
  //   - Setup Mode: 用户编辑直接修改
  //   - Action Mode: 仅通过 addSetupObject/removeSetupObject/updateSetupObject 修改
  //   - 序列化: toSetupObject 始终从此处读取
  const setupState = ref<SceneSetup>({
    camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
    objects: [],
    renderChain: [],
  })

  // runtimeState: 运行时层 — Action Mode 下的 RuntimeSceneSnapshot
  //   - Setup Mode: null（不使用）
  //   - Action Mode: 进入时由 createRuntimeSnapshot 创建，由 applySlotState 覆写
  //   - 退出时丢弃
  const runtimeState = ref<RuntimeSceneSnapshot | null>(null)

  // v16: 延迟获取 animationStore
  function getAnimationStore() {
    return useAnimationStore()
  }

  /**
   * 当前活跃层的场景对象数组（只读代理）
   * ⚠️ Setup Mode → setupState.objects | Action Mode → runtimeState.objects
   */
  const objects = computed(() => isActionMode.value ? runtimeState.value!.objects : setupState.value.objects)

  /**
   * 当前活跃层的场景渲染链（只读代理）
   */
  const sceneRenderChain = computed(() => isActionMode.value ? runtimeState.value!.renderChain : setupState.value.renderChain)

  const selectedObjectId = ref<string | null>(null)

  // 模式标记
  const isActionMode = ref(false)

  // ==================== v17: 命名空间别名管理 ====================

  /**
   * 查找对象所在的命名空间根 ID
   * - 向上遍历 parentId 链，遇到 compositeMode === 'entity' 的祖先 → 返回该 entity ID
   * - 到达根（无 parent 或仅穿过 union）→ 返回 null（场景命名空间）
   */
  function resolveNamespaceRoot(objectId: string): string | null {
    let currentId: string | undefined = objects.value.find(o => o.id === objectId)?.parentId
    while (currentId) {
      const parent = objects.value.find(o => o.id === currentId)
      if (!parent) break
      if (parent.type === 'composite') {
        const comp = parent as CompositeObject
        if (comp.compositeMode === 'entity') {
          return comp.id
        }
      }
      currentId = parent.parentId
    }
    return null
  }

  /**
   * 收集指定命名空间内所有对象的 alias
   * - namespaceRootId === null → 场景命名空间（根对象 + union 穿透）
   * - namespaceRootId === entityId → 该 entity 的子对象 + union 穿透
   * - union composite 是透明的，其子对象 alias 归入上层命名空间
   * - entity composite 自身的 alias 归入上层命名空间，其内部子对象不归入
   */
  function getNamespaceAliases(namespaceRootId: string | null, excludeObjectId?: string): string[] {
    const aliases: string[] = []

    // 确定种子对象列表
    let seedObjects: SceneObject[]
    if (namespaceRootId === null) {
      // 场景命名空间：所有根对象
      seedObjects = objects.value.filter(o => !o.parentId)
    } else {
      // entity 命名空间：该 entity 的直接子对象
      const entity = objects.value.find(o => o.id === namespaceRootId) as CompositeObject | undefined
      if (!entity) return aliases
      seedObjects = entity.childIds
        .map(id => objects.value.find(o => o.id === id))
        .filter((o): o is SceneObject => o !== undefined)
    }

    // 递归收集：union 穿透，entity 停止
    function collectAliases(objs: SceneObject[]) {
      for (const obj of objs) {
        if (obj.type === 'camera') continue
        if (obj.id === excludeObjectId) continue
        if (obj.alias) aliases.push(obj.alias)

        // union composite：穿透，递归收集子对象
        if (obj.type === 'composite') {
          const comp = obj as CompositeObject
          if (comp.compositeMode === 'union') {
            const children = comp.childIds
              .map(id => objects.value.find(o => o.id === id))
              .filter((o): o is SceneObject => o !== undefined)
            collectAliases(children)
          }
          // entity composite：自身 alias 已收集，内部子对象不收集（隔离边界）
        }
      }
    }

    collectAliases(seedObjects)
    return aliases
  }

  /**
   * 获取指定命名空间中所有对象的别名列表（排除相机）
   * @param namespaceRootId 命名空间根 ID，null = 场景命名空间（默认）
   */
  function getExistingAliases(namespaceRootId?: string | null): string[] {
    return getNamespaceAliases(namespaceRootId ?? null)
  }

  /**
   * 检查别名在指定命名空间内是否已存在
   */
  function isAliasExists(alias: string, excludeObjectId?: string, namespaceRootId?: string | null): boolean {
    const aliases = getNamespaceAliases(namespaceRootId ?? null, excludeObjectId)
    return aliases.includes(alias)
  }

  /**
   * 在指定命名空间内生成唯一别名
   * 规则：第一个没有编号，第二个是 "xxx1"，第三个是 "xxx2"...
   * @param namespaceRootId 命名空间根 ID，null = 场景命名空间（默认）
   */
  function generateUniqueAlias(baseName: string, namespaceRootId?: string | null, excludeObjectId?: string): string {
    const existingAliases = getNamespaceAliases(namespaceRootId ?? null, excludeObjectId)

    if (!existingAliases.includes(baseName)) {
      return baseName
    }

    let counter = 1
    while (existingAliases.includes(`${baseName}${counter}`)) {
      counter++
    }
    return `${baseName}${counter}`
  }

  function addObject(object: SceneObject) {
    // Setup Mode: 写持久层；Action Mode: 写显示层
    if (isActionMode.value) {
      runtimeState.value!.objects.push(object)
    } else {
      setupState.value.objects.push(object)
    }

    // v19 重构: 统一 renderChain 管理（Setup 和 Action 共享同一路径）
    rcOnObjectAdded(object, rcStoreAccessor)
  }

  // 获取默认层级
  function getDefaultZIndex(): number {
    return Z_INDEX_DEFAULT
  }

  /**
   * v21: 自动将 origin='auto' 的帧动画加入 initialAnimations
   *
   * 仅在对象创建时调用，确保帧动画默认播放。
   * 对已有 initialAnimations 的对象不做修改（尊重用户设置）。
   */
  function autoPopulateInitialAnimations(obj: SceneObject): void {
    // 仅处理 prop 和 background
    if (obj.type !== 'prop' && obj.type !== 'background') return
    // 如果已有 initialAnimations，不覆盖
    if (obj.initialAnimations && obj.initialAnimations.length > 0) return

    const animations = obj.animations
    if (!animations) return

    const autoFrameAnims = Object.values(animations).filter(
      a => a.origin === 'auto' && a.type === 'track' && a.tracks.some(t => t.trackType === 'frame_sequence')
    )

    if (autoFrameAnims.length > 0) {
      obj.initialAnimations = autoFrameAnims.map(a => ({
        name: a.name,
        loop: a.loop ?? true,
      }))
      // v24: 通过 updateSetupObject 写回，确保同步到 episode（ScenePlayer 预览从 episode 读取）
      const storeObj = getObject(obj.id)
      if (storeObj) {
        updateSetupObject(obj.id, { initialAnimations: [...obj.initialAnimations] } as Partial<SceneObject>)
      }
    }
  }

  // createCharacterObject 已移除

  // 创建背景对象
  // v7.1: 添加 alias 和 customId 参数
  function createBackgroundObject(
    backgroundId: string,
    name: string,
    customId?: string,
    customAlias?: string
  ): BackgroundObject {
    // 背景默认居中显示，实际坐标会在渲染时根据图片尺寸更新
    const defaultWidth = 0
    const defaultHeight = 0

    // v7.1: 生成唯一别名
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: BackgroundObject = {
      id: customId ?? generateId('sceneobject'), // v7.36: 统一使用 sceneobject 前缀
      type: 'background',
      name,
      alias,  // v7.1: 添加别名
      // PT Phase 6: backgroundId 已删除，统一使用 refId
      refId: backgroundId,
      x: CANVAS_CENTER_X,  // v2.0.0: 统一中心坐标（渲染时会根据纹理尺寸更新）
      y: CANVAS_CENTER_Y,
      width: defaultWidth,  // 默认宽度，会在渲染时根据实际图片更新
      height: defaultHeight, // 默认高度，会在渲染时根据实际图片更新
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: Z_INDEX_BACKGROUND,
      visible: true
    }
    addObject(obj)
    // v16: 对象创建时自动生成帧动画 Animation
    getAnimationStore().hydrateObjectAnimations(obj)
    return obj
  }

  // 创建音频对象
  function createAudioObject(
    soundId: string,
    name: string,
    options: {
      volume?: number,
      loop?: boolean,
      fadeIn?: number,
      fadeOut?: number,
      playbackState?: 'play' | 'stop'
    } = {},
    customId?: string,
    customAlias?: string
  ): AudioObject {
    // 生成唯一别名
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: AudioObject = {
      id: customId ?? generateId('sceneobject'), // v7.36: 统一使用 sceneobject 前缀
      type: 'audio',
      name,
      alias,
      refId: soundId,
      volume: options.volume ?? 1.0,
      loop: options.loop ?? false,
      fadeIn: options.fadeIn ?? 0,
      fadeOut: options.fadeOut ?? 0,
      playbackState: options.playbackState ?? 'stop', // 默认为停止，需手动开启
      x: 0,   // 音频对象不显示在画布上
      y: 0,
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: 0,
      visible: true,
      spawned: true
    }
    addObject(obj)
    return obj
  }

  // 创建道具对象
  // v7.1: 添加 alias 和 customId 参数
  // v7.1.1: Fix HMR issue
  function createPropObject(
    propId: string,
    name: string,
    customId?: string,
    customAlias?: string
  ): PropObject {
    const width = 200 // 默认尺寸，渲染时会更新
    const height = 200

    // 默认在画布中心
    const centerX = CANVAS_CENTER_X
    const centerY = CANVAS_CENTER_Y

    // v7.1: 生成唯一别名
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: PropObject = {
      id: customId ?? generateId('sceneobject'), // v7.36: 统一使用 sceneobject 前缀
      type: 'prop',
      name,
      alias,
      // PT Phase 6: propId 已删除，统一使用 refId
      refId: propId,
      x: centerX,  // v2.0.0: 统一中心坐标
      y: centerY,
      width,
      height,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: getDefaultZIndex(),
      visible: true
    }
    addObject(obj)
    // v16: 对象创建时自动生成帧动画 Animation
    getAnimationStore().hydrateObjectAnimations(obj)
    // 将 hydrate 结果通过 Store API 写回，确保 Vue 响应式追踪
    if (obj.animations && Object.keys(obj.animations).length > 0) {
      updateObject(obj.id, { animations: { ...obj.animations } })
    }
    return getObject(obj.id) as PropObject
  }

  // v7.3: createEffectObject 已移除，特效已合并到道具
  // 如需添加特效，请使用 createPropObject 函数

  // Phase 1: 创建画面特效对象
  function createScreenEffectObject(
    effectClass: string,
    name: string,
    params: ScreenEffectParams = {},
    customId?: string,
    customAlias?: string
  ): ScreenEffectObject {
    const alias = customAlias ?? generateUniqueAlias(name)

    // 默认大小为相机视口的 110%，确保覆盖默认视口并有余量
    const defaultWidth = Math.round(CAMERA_BASE_WIDTH * 1.1)
    const defaultHeight = Math.round(CAMERA_BASE_HEIGHT * 1.1)

    const obj: ScreenEffectObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'screen_effect',
      name,
      refId: effectClass,
      alias,
      effectClass,
      params: {
        baseColor: params.baseColor ?? '#000000',
        // coverOpacity 已删除，覆盖不透明度由 alpha 控制
        openRatio: params.openRatio ?? 1.0,
        feather: params.feather ?? 0,
        ...params
      },
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: defaultWidth,
      height: defaultHeight,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: Z_INDEX_SCREEN_EFFECT,
      visible: true
    }
    addObject(obj)
    return obj
  }

  // v16: 创建元件对象
  function createSymbolObject(
    name: string,
    customId?: string,
    customAlias?: string
  ): SymbolObject {
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: SymbolObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'symbol',
      name,
      alias,
      refId: '',
      materials: [],
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: 200,
      height: 200,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: getDefaultZIndex(),
      visible: true
    }
    addObject(obj)
    // v16: 对象创建时自动生成帧动画 Animation
    getAnimationStore().hydrateObjectAnimations(obj)
    // 将 hydrate 结果通过 Store API 写回，确保 Vue 响应式追踪
    if (obj.animations && Object.keys(obj.animations).length > 0) {
      updateObject(obj.id, { animations: { ...obj.animations } })
    }
    return getObject(obj.id) as SymbolObject
  }

  // v18: 创建独立表情对象
  function createExpressionObject(
    expressionId: string,
    name: string,
    customId?: string,
    customAlias?: string
  ): ExpressionObject {
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: ExpressionObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'expression',
      name,
      alias,
      refId: expressionId,
      defaultRefId: expressionId,
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: 200,
      height: 200,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: getDefaultZIndex(),
      visible: true
    }
    addObject(obj)
    // 对象创建时自动生成帧动画 Animation
    getAnimationStore().hydrateObjectAnimations(obj)
    if (obj.animations && Object.keys(obj.animations).length > 0) {
      updateObject(obj.id, { animations: { ...obj.animations } })
    }
    return getObject(obj.id) as ExpressionObject
  }

  // Clip-Mask Phase 1：创建蒙版对象。
  // 详见 docs/features/clip-mask.md（v2.1）。
  // targetIds 故意不暴露在 options 中：UI 路径默认空数组，反序列化路径由 maskSerializer 通过 finalize 步骤回填，
  // 避免在创建时绕过独占校验。
  function createMaskObject(
    name: string,
    shape: import('@/types/sceneObject').MaskShape,
    options?: {
      width?: number
      height?: number
      mode?: import('@/types/sceneObject').MaskMode
    },
    customId?: string,
    customAlias?: string,
  ): import('@/types/sceneObject').MaskObject {
    const alias = customAlias ?? generateUniqueAlias(name)
    const obj: import('@/types/sceneObject').MaskObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'mask',
      name,
      alias,
      refId: '',
      shape,
      mode: options?.mode ?? 'inside_visible',
      targetIds: [],
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: options?.width ?? 200,
      height: options?.height ?? 200,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: getDefaultZIndex(),
      visible: true,
    }
    addObject(obj)
    return getObject(obj.id) as import('@/types/sceneObject').MaskObject
  }

  // Clip-Mask Phase 1：反序列化阶段暂存的 targetIds（key = mask id）。
  // maskSerializer.deserialize 写入；finalizeMaskTargets() 在所有对象就绪后回填并裁决独占冲突，随后清空。
  const _pendingMaskTargets = new Map<string, string[]>()

  /**
   * Clip-Mask Phase 1：反序列化结束后回填 mask.targetIds 并清理脏数据。
   *
   * 调用时机：sceneLoader.ts 在 `for (objData) fromSetupObject(...)` 循环结束后、
   * `rebuildEntityRenderChains()` 之前调用一次。
   *
   * 清理规则（按 mask 在 setupState.objects 中的稳定升序顺序处理，使索引较小者优先获得 target）：
   * - 死引用：targetIds 中的 id 在场景里不存在 → 静默剔除
   * - 非法目标类型：!isAllowedMaskTargetType(target.type) → 静默剔除
   * - 嵌套：target 自身是 'mask' → 静默剔除
   * - 同 target 多 mask 冲突：先到先得（按对象数组索引升序），后来者剔除 + 1 条聚合 warn
   * - mode !== 'inside_visible'：保持读到的对象字段不动（已由 createMaskObject 默认 inside_visible，
   *   旧脏数据通过 maskSerializer 在 deserialize 阶段降级为 inside_visible 并 warn）
   */
  function finalizeMaskTargets(): void {
    if (_pendingMaskTargets.size === 0) return

    const claimedTargets = new Set<string>() // 已被占用的 target id
    let droppedCount = 0
    const droppedReasons: string[] = []

    // 按 setupState.objects 中的索引升序处理 mask，保证“起始索引较小者胜”
    const masksInOrder = setupState.value.objects
      .map((o, idx) => ({ obj: o, idx }))
      .filter(({ obj }) => obj.type === 'mask' && _pendingMaskTargets.has(obj.id))
      .sort((a, b) => a.idx - b.idx)

    for (const { obj } of masksInOrder) {
      const mask = obj as import('@/types/sceneObject').MaskObject
      const raw = _pendingMaskTargets.get(mask.id) ?? []
      const accepted: string[] = []
      for (const id of raw) {
        const tgt = setupState.value.objects.find(o => o.id === id)
        if (!tgt) {
          droppedCount++
          droppedReasons.push(`${mask.id}→${id}: dead reference`)
          continue
        }
        if (tgt.type === 'mask') {
          droppedCount++
          droppedReasons.push(`${mask.id}→${id}: mask→mask nesting (Phase 1.5)`)
          continue
        }
        // 这里直接用模块导入更安全；为避免循环依赖，inline 判断常见类型
        const allowed = tgt.type === 'prop' || tgt.type === 'text' || tgt.type === 'symbol'
          || tgt.type === 'expression' || tgt.type === 'composite' || tgt.type === 'background'
        if (!allowed) {
          droppedCount++
          droppedReasons.push(`${mask.id}→${id}: disallowed target type '${tgt.type}'`)
          continue
        }
        if (claimedTargets.has(id)) {
          droppedCount++
          droppedReasons.push(`${mask.id}→${id}: already claimed by earlier mask`)
          continue
        }
        accepted.push(id)
        claimedTargets.add(id)
      }
      mask.targetIds = accepted
    }

    _pendingMaskTargets.clear()

    if (droppedCount > 0) {
      console.warn(`[mask] cleaned ${droppedCount} stale targetIds reference(s) during deserialize`, droppedReasons)
    }
  }

  // 创建相机对象
  function createCameraObject(name: string, canvasCenter?: { x: number, y: number }, zoom?: number, customId?: string): CameraObject {
    const width = CAMERA_BASE_WIDTH
    const height = CAMERA_BASE_HEIGHT

    // 相机使用中心坐标
    const centerX = canvasCenter?.x ?? CANVAS_CENTER_X
    const centerY = canvasCenter?.y ?? CANVAS_CENTER_Y

    const obj: CameraObject = {
      id: customId ?? generateId('sceneobject'), // v7.36: 统一使用 sceneobject 前缀
      type: 'camera',
      name,
      refId: '',
      x: centerX,  // 相机存储中心坐标
      y: centerY,  // 相机存储中心坐标
      width,   // PRD文档规定：默认相机宽度
      height,   // PRD文档规定：默认相机高度
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: Z_INDEX_CAMERA,
      visible: true,
      zoom: zoom ?? 1.0  // 默认 zoom = 1.0
    }
    addObject(obj)
    return obj
  }

  // 创建光源对象（ambient 或 point）
  function createLightObject(
    lightType: 'ambient' | 'point' | 'spot',
    name: string,
    options?: {
      lightColor?: string
      lightIntensity?: number
      lightRadius?: number
      flicker?: number
      flickerSpeed?: number
      directionMode?: 'omni' | 'cone'
      directionAngle?: number
      coneAngle?: number
      x?: number
      y?: number
    },
    customId?: string,
    customAlias?: string
  ): LightObject {
    const alias = customAlias ?? generateUniqueAlias(name)

    const obj: LightObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'light',
      name,
      alias,
      refId: '',
      lightType,
      lightColor: options?.lightColor ?? '#ffffff',
      lightIntensity: options?.lightIntensity ?? 1.0,
      lightRadius: options?.lightRadius ?? 500,
      flicker: options?.flicker ?? 0,
      flickerSpeed: options?.flickerSpeed ?? 0.35,
      directionMode: options?.directionMode ?? (lightType === 'spot' ? 'cone' : 'omni'),
      directionAngle: options?.directionAngle ?? 0,
      coneAngle: options?.coneAngle ?? 100,
      x: options?.x ?? CANVAS_CENTER_X,
      y: options?.y ?? CANVAS_CENTER_Y,
      width: 96,
      height: 96,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: Z_INDEX_LIGHT,
      visible: true,
    }
    addObject(obj)
    return obj
  }

  // 创建文本对象
  // v7.1: 添加 alias 和 customId 参数
  function createTextObject(
    content: string,
    canvasCenter?: { x: number, y: number },
    customId?: string,
    customAlias?: string
  ): TextObject {
    const width = 400
    const height = 100

    // v2.0.0: 统一使用中心坐标
    const centerX = canvasCenter?.x ?? CANVAS_CENTER_X
    const centerY = canvasCenter?.y ?? CANVAS_CENTER_Y

    // v7.1: 生成唯一别名
    const alias = customAlias ?? generateUniqueAlias('文本')

    const obj: TextObject = {
      id: customId ?? generateId('sceneobject'), // v7.36: 统一使用 sceneobject 前缀
      type: 'text',
      name: '文本',
      refId: '',
      alias,  // v7.1: 添加别名
      content,
      fontSize: 72,
      fontFamily: 'Noto Sans SC',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#ffffff',
      align: 'center',
      wordWrap: false,
      wordWrapWidth: 400,
      textBoxMode: 'auto-size',
      revealInitialState: 'complete',
      x: centerX,  // v2.0.0: 统一中心坐标
      y: centerY,
      width,   // 默认宽度
      height,  // 默认高度
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: Z_INDEX_TEXT,
      visible: true
    }
    addObject(obj)
    return obj
  }

  // P2: 创建组合对象
  function createCompositeObject(
    name: string,
    childIds: string[] = [],
    customId?: string,
    customAlias?: string,
    compositeMode: 'entity' | 'union' = 'union',
    namespaceRootId?: string | null
  ): CompositeObject {
    const alias = customAlias ?? generateUniqueAlias(name, namespaceRootId)

    const obj: CompositeObject = {
      id: customId ?? generateId('sceneobject'),
      type: 'composite',
      name,
      alias,
      refId: '',
      childIds: [...childIds],
      compositeLocked: true,
      compositeMode,
      x: CANVAS_CENTER_X,
      y: CANVAS_CENTER_Y,
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      flipX: false,
      zIndex: getDefaultZIndex(),
      visible: true
    }

    addObject(obj)

    // 设置子对象的 parentId
    for (const childId of childIds) {
      updateObject(childId, { parentId: obj.id })
    }

    // addObject 后 Vue 会将 obj 包装为 reactive proxy，返回 getObject 获取数组中的实际引用
    return getObject(obj.id) as CompositeObject
  }

  /**
   * 从当前活跃层获取对象
   * ⚠️ Setup Mode → 读 setupObjects | Action Mode → 读 runtimeObjects
   */
  function getObject(id: string): SceneObject | undefined {
    return objects.value.find(obj => obj.id === id)
  }

  /**
   * 更新当前活跃层的对象属性
   * ⚠️ Setup Mode → 写 setupObjects（持久层） | Action Mode → 写 runtimeObjects（显示层，不影响持久层）
   *
   * updates 中值为 undefined 的属性将被从对象中删除（语义：清除可选属性）
   */
  function updateObject<T extends SceneObject = SceneObject>(id: string, updates: SceneObjectUpdateFor<T>) {
    const targetArray = isActionMode.value ? runtimeState.value!.objects : setupState.value.objects
    // Mask geometry diagnostics are opt-in via localStorage.
    const updatesRec = updates as Record<string, unknown>
    const obj = targetArray.find(o => o.id === id)
    const touchesMaskField = 'targetIds' in updatesRec || 'shape' in updatesRec
    if (isDebugEnabled('mask') && (obj?.type === 'mask' || touchesMaskField)) {
      debugLog('mask', '[MASK-DEBUG] sceneObjectStore.updateObject\n' + JSON.stringify({
        id,
        targetType: obj?.type,
        mode: isActionMode.value ? 'action' : 'setup',
        updates: JSON.parse(JSON.stringify(updates)) as unknown,
        before: obj?.type === 'mask' ? {
          targetIds: (obj as unknown as { targetIds?: unknown }).targetIds,
          shape: (obj as unknown as { shape?: unknown }).shape,
          width: obj.width,
          height: obj.height,
          x: obj.x,
          y: obj.y,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          rotation: obj.rotation,
          transformOriginX: obj.transformOriginX,
          transformOriginY: obj.transformOriginY,
        } : null,
      }, null, 2))
    }
    applyUpdatesToArray(targetArray, id, updates)
  }

  /** 内部辅助：将 updates 应用到目标数组中指定 id 的对象 */
  function applyUpdatesToArray<T extends SceneObject = SceneObject>(
    arr: SceneObject[], id: string, updates: SceneObjectUpdateFor<T>
  ) {
    const index = arr.findIndex(obj => obj.id === id)
    if (index !== -1) {
      const merged = { ...arr[index], ...updates }
      const updatesRecord = updates as Record<string, unknown>
      for (const key of Object.keys(updates)) {
        if (updatesRecord[key] === undefined) {
          delete (merged as Record<string, unknown>)[key]
        }
      }

      arr[index] = merged as SceneObject
    }
  }

  /** 将子对象从 composite 中脱离：局部→全局（保持视觉不变） */
  function resolveWorldTransform(obj: SceneObject): {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    flipX?: boolean
  } {
    if (!obj.parentId) {
      return {
        x: obj.x,
        y: obj.y,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        rotation: obj.rotation,
        flipX: obj.flipX,
      }
    }

    const parent = getObject(obj.parentId)
    if (!parent) {
      return {
        x: obj.x,
        y: obj.y,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        rotation: obj.rotation,
        flipX: obj.flipX,
      }
    }

    const parentWorld = resolveWorldTransform(parent)
    return localToGlobal(obj, parentWorld)
  }

  function detachChild(childId: string, comp: CompositeObject): void {
    const child = getObject(childId)
    if (!child) return

    // v2.0.0 方案 A: 完整变换补偿（position + scale + rotation）
    // v19.2: localToGlobal 返回 flipX，用于恢复全局翻转状态
    const compWorld = resolveWorldTransform(comp)
    const global = localToGlobal(child, compWorld)
    const newParentId = comp.parentId ?? undefined
    const nextTransform = newParentId
      ? (() => {
          const newParent = getObject(newParentId)
          if (!newParent) return global
          return globalToLocal(global, resolveWorldTransform(newParent))
        })()
      : global

    updateObject(childId, {
      x: nextTransform.x,
      y: nextTransform.y,
      scaleX: nextTransform.scaleX,
      scaleY: nextTransform.scaleY,
      rotation: nextTransform.rotation,
      flipX: nextTransform.flipX ?? child.flipX,
      parentId: newParentId,  // 冒泡到上级，无上级 = 独立
    })
  }

  /** 将子对象附加到 composite：全局→局部（保持视觉不变） */
  function attachChild(childId: string, comp: CompositeObject): void {
    const child = getObject(childId)
    if (!child) return

    // v2.0.0 方案 A: 完整变换补偿（position + scale + rotation）
    // v19.2: globalToLocal 返回 flipX，当 parent.flipX=true 时子对象需翻转以抵消
    const childWorld = resolveWorldTransform(child)
    const compWorld = resolveWorldTransform(comp)
    const local = globalToLocal(childWorld, compWorld)
    updateObject(childId, {
      parentId: comp.id,
      x: local.x,
      y: local.y,
      scaleX: local.scaleX,
      scaleY: local.scaleY,
      rotation: local.rotation,
      flipX: local.flipX ?? child.flipX,
    })
  }

  // 生命周期钩子的 Store 操作适配器
  const storeAccessor: import('@/core/sceneObjectProviders/index').LifecycleStoreAccessor = {
    getObject,
    removeObject: (id: string) => removeObject(id),
    updateObject,
    duplicateObject: (id: string) => duplicateObject(id),
  }

  // Action Mode 下专用于持久层（setupState）的 lifecycle accessor。
  // 避免 removeSetupObject 调用 onBeforeDelete 时错误地把父子关系清理到 runtimeState。
  const setupStoreAccessor: import('@/core/sceneObjectProviders/index').LifecycleStoreAccessor = {
    getObject: (id: string) => setupState.value.objects.find(o => o.id === id),
    removeObject: (id: string) => {
      const setupObj = setupState.value.objects.find(o => o.id === id)
      if (!setupObj) return

      const hooks = getLifecycleHooks(setupObj.type)
      hooks?.onBeforeDelete?.(setupObj, setupStoreAccessor)

      if (setupObj.parentId) {
        const parent = setupState.value.objects.find(o => o.id === setupObj.parentId)
        if (parent?.type === 'composite') {
          const compositeParent = parent as CompositeObject
          const idx = compositeParent.childIds.indexOf(id)
          if (idx !== -1) compositeParent.childIds.splice(idx, 1)
        }
      }

      rcOnObjectRemoved(id, setupObj, rcSetupAccessor)

      const index = setupState.value.objects.findIndex(o => o.id === id)
      if (index !== -1) {
        setupState.value.objects.splice(index, 1)
      }
    },
    updateObject: <T extends SceneObject = SceneObject>(id: string, updates: SceneObjectUpdateFor<T>) => {
      applyUpdatesToArray(setupState.value.objects, id, updates)
    },
    duplicateObject: () => {
      throw new Error('[sceneObjectStore] setupStoreAccessor.duplicateObject is not supported')
    },
  }

  // v19: RenderChainManager 的 Store 适配器
  const rcStoreAccessor: RenderChainStoreAccessor = {
    getObject,
    getSceneRenderChain: () => sceneRenderChain.value,
  }

  // v19: 专用于 Action Mode 下直接操作持久层 (setupState) 的 RenderChain 适配器
  // 绕过 sceneRenderChain computed（在 isActionMode 下指向 runtimeState），
  // 确保 addSetupObject / removeSetupObject 能正确写入 setupState.renderChain
  const rcSetupAccessor: RenderChainStoreAccessor = {
    getObject: (id) => setupState.value.objects.find(o => o.id === id),
    getSceneRenderChain: () => setupState.value.renderChain,
  }

  // 删除对象（通过生命周期钩子实现类型特有行为）
  // Setup Mode: 从 setupObjects 删除
  // Action Mode: 从 runtimeObjects 删除（持久层需通过 removeSetupObject 单独处理）
  function removeObject(id: string) {
    const obj = getObject(id)
    if (!obj) return

    // 生命周期钩子：类型特有的删除前处理（如 composite 级联删除子对象）
    const hooks = getLifecycleHooks(obj.type)
    hooks?.onBeforeDelete?.(obj, storeAccessor)

    // 从父对象的 childIds 中移除自己
    if (obj.parentId) {
      const parent = getObject(obj.parentId)
      if (parent?.type === 'composite') {
        const compositeParent = parent as CompositeObject
        const idx = compositeParent.childIds.indexOf(id)
        if (idx !== -1) compositeParent.childIds.splice(idx, 1)
      }
    }

    // Clip-Mask Phase 1：从所有 mask 对象的 targetIds 中清除 id 引用
    // - 删除的若是 target：所有引用它的 mask.targetIds 必须剔除该 id
    // - 删除的若是 mask 自身：不影响其它 mask（无需操作）
    if (obj.type !== 'mask') {
      const targetArrayForCleanup = isActionMode.value ? runtimeState.value!.objects : setupState.value.objects
      for (const o of targetArrayForCleanup) {
        if (o.type !== 'mask') continue
        const mask = o as import('@/types/sceneObject').MaskObject
        const idx = mask.targetIds.indexOf(id)
        if (idx !== -1) mask.targetIds.splice(idx, 1)
      }
    }

    // v19 重构: 统一 renderChain 管理
    rcOnObjectRemoved(id, obj, rcStoreAccessor)

    const targetArray = isActionMode.value ? runtimeState.value!.objects : setupState.value.objects
    const index = targetArray.findIndex(o => o.id === id)
    if (index !== -1) {
      targetArray.splice(index, 1)
      if (selectedObjectId.value === id) {
        selectedObjectId.value = null
      }
    }
  }

  /** 递归收集 composite 对象的所有后代 ID（深度优先） */
  function collectAllDescendantIds(compositeId: string): string[] {
    const result: string[] = []
    const obj = getObject(compositeId)
    if (obj?.type !== 'composite') return result
    const comp = obj as CompositeObject
    for (const childId of comp.childIds) {
      result.push(childId)
      result.push(...collectAllDescendantIds(childId))
    }
    return result
  }

  /** 检查 objectId 是否是 ancestorId 的后代（通过 parentId 链向上查找） */
  function isDescendantOf(objectId: string, ancestorId: string): boolean {
    let current = getObject(objectId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true
      current = getObject(current.parentId)
    }
    return false
  }

  /** 强制级联删除 composite 及其所有后代（不论 compositeMode） */
  function removeObjectWithDescendants(id: string): void {
    const obj = getObject(id)
    if (!obj) return

    if (obj.type === 'composite') {
      const comp = obj as CompositeObject
      const allDescendantIds = collectAllDescendantIds(id)
      // 清空所有 composite 的 childIds，防止 onBeforeDelete 触发冒泡
      comp.childIds = []
      for (const descId of allDescendantIds) {
        const descObj = getObject(descId)
        if (descObj?.type === 'composite') {
          (descObj as CompositeObject).childIds = []
        }
      }
      // 逐个删除后代（childIds 已清空，不会触发级联或冒泡）
      for (const descId of allDescendantIds) {
        removeObject(descId)
      }
    }
    // 最后删除自身
    removeObject(id)
  }

  /**
   * 解散 composite：子对象冒泡到上级，坐标补偿，清空 childIds。
   * 不删除 composite 本身（调用方需后续调 removeObject）。
   * 用于"仅删除组合"三选项删除 — entity 和 union 共用。
   */
  function dissolveComposite(compositeId: string): void {
    const obj = getObject(compositeId)
    if (obj?.type !== 'composite') return
    const comp = obj as CompositeObject
    const childIds = [...comp.childIds]
    const bubbleTargetId = comp.parentId

    // v19: 解散前，保存 entity 的渲染顺序（展开 union 子对象后的有序 ID 列表）
    // 这个顺序将在稍后转移到目标 renderChain，替换 entity 在链中的位置
    let preservedRenderOrder: string[] = []
    if (comp.compositeMode === 'entity') {
      if (comp.renderChain && comp.renderChain.length > 0) {
        preservedRenderOrder = [...comp.renderChain]
      } else {
        // fallback: 从 childIds 展开 union 子对象（通过 Manager）
        preservedRenderOrder = rcExpandChildIds(comp.childIds, rcStoreAccessor)
      }
    }

    for (const childId of childIds) {
      const child = getObject(childId)
      if (!child) continue
      // 坐标补偿：局部坐标 → 全局坐标
      // v19.2: localToGlobal 返回 flipX，解散时恢复全局翻转状态
      const global = localToGlobal(child, comp)
      updateObject(childId, {
        x: global.x,
        y: global.y,
        scaleX: global.scaleX,
        scaleY: global.scaleY,
        rotation: global.rotation,
        flipX: global.flipX ?? child.flipX,
        parentId: bubbleTargetId ?? undefined,
      })
      // 加入上级 composite 的 childIds
      if (bubbleTargetId) {
        const parent = getObject(bubbleTargetId)
        if (parent?.type === 'composite') {
          const parentComp = parent as CompositeObject
          if (!parentComp.childIds.includes(childId)) {
            parentComp.childIds.push(childId)
          }
        }
      }
    }

    // v19 重构: 通过 Manager 转移渲染顺序
    if (preservedRenderOrder.length > 0) {
      rcOnCompositeDissolve(compositeId, preservedRenderOrder, bubbleTargetId, rcStoreAccessor)
    }

    // 清空 childIds — 后续 removeObject 的 onBeforeDelete 不再处理子对象
    comp.childIds = []
  }

  // 选中对象
  function selectObject(id: string | null) {
    // Auto-relock: 选中非后代对象时，恢复所有已解锁 composite 的锁定状态
    for (const obj of objects.value) {
      if (obj.type !== 'composite') continue
      const comp = obj as CompositeObject
      if (comp.compositeLocked) continue // 已锁定
      // 新选中对象是 composite 自身或其后代 → 保持解锁
      if (id === comp.id) continue
      if (id && isDescendantOf(id, comp.id)) continue
      // 恢复锁定
      if (isActionMode.value) {
        updateSetupObject(comp.id, { compositeLocked: true } as Partial<SceneObject>)
      } else {
        updateObject(comp.id, { compositeLocked: true } as Partial<SceneObject>)
      }
    }
    selectedObjectId.value = id
  }

  // 获取选中对象
  function getSelectedObject(): SceneObject | undefined {
    return selectedObjectId.value ? getObject(selectedObjectId.value) : undefined
  }

  /**
   * 复制 composite 后修复渲染链引用：
   * - 复制过程会先将子对象 addObject 到根级，再回填 parentId，可能导致根级链残留子对象 ID
   * - entity composite 的 renderChain 需按 oldId → newId 映射到新子树，保留自定义顺序
   * - union 不拥有自有 renderChain，依赖所属 entity 或场景根链的协调结果
   */
  function reconcileRenderChainsAfterCompositeDuplicate(originalRoot: SceneObject, rootDuplicate: SceneObject): void {
    const visited = new Set<string>()
    const oldToNewId = new Map<string, string>()
    const duplicatedEntityPairs: { originalId: string; duplicateId: string }[] = []

    const canDuplicate = (obj: SceneObject | undefined): obj is SceneObject => {
      if (!obj) return false
      if (obj.type === 'camera') return false
      if (obj.type === 'light' && (obj as LightObject).lightType === 'ambient') return false
      return true
    }

    const mapDuplicateTree = (originalObj: SceneObject | undefined, duplicateObj: SceneObject | undefined): void => {
      if (!canDuplicate(originalObj) || !duplicateObj) return
      if (visited.has(originalObj.id)) return
      visited.add(originalObj.id)
      oldToNewId.set(originalObj.id, duplicateObj.id)

      if (originalObj.type !== 'composite' || duplicateObj.type !== 'composite') return

      const originalComp = originalObj as CompositeObject
      const duplicateComp = duplicateObj as CompositeObject
      if (originalComp.compositeMode === 'entity' && duplicateComp.compositeMode === 'entity') {
        duplicatedEntityPairs.push({ originalId: originalObj.id, duplicateId: duplicateObj.id })
      }

      let duplicateChildIndex = 0
      for (const originalChildId of originalComp.childIds ?? []) {
        const originalChild = getObject(originalChildId)
        if (!canDuplicate(originalChild)) continue

        const duplicateChildId = duplicateComp.childIds?.[duplicateChildIndex]
        duplicateChildIndex++
        if (!duplicateChildId) continue

        mapDuplicateTree(originalChild, getObject(duplicateChildId))
      }
    }

    mapDuplicateTree(originalRoot, rootDuplicate)

    // 先映射新复制子树中的 entity 内部 renderChain，保留用户自定义顺序。
    for (const pair of duplicatedEntityPairs) {
      const originalObj = getObject(pair.originalId)
      const duplicateObj = getObject(pair.duplicateId)
      if (originalObj?.type !== 'composite' || duplicateObj?.type !== 'composite') continue

      const originalComp = originalObj as CompositeObject
      const duplicateComp = duplicateObj as CompositeObject
      const mappedChain = (originalComp.renderChain ?? [])
        .map(id => oldToNewId.get(id))
        .filter((id): id is string => Boolean(id))

      duplicateComp.renderChain = mappedChain.length > 0
        ? reconcileRenderChain(mappedChain, objects.value, duplicateComp.id)
        : buildRenderChain(objects.value, duplicateComp.id)
    }

    // 再协调当前层级根链，清理被挂回 parent 后残留的根级 child ID
    const reconciled = reconcileRenderChain(sceneRenderChain.value ?? [], objects.value)
    if (isActionMode.value) {
      runtimeState.value!.renderChain = reconciled
    } else {
      setupState.value.renderChain = reconciled
    }
  }

  // 复制对象
  // v7.1: 复制时生成新别名（原别名 + 编号）
  function duplicateObject(id: string): SceneObject | undefined {
    const original = getObject(id)
    if (!original) return undefined

    // 相机和 ambient 光源不可复制
    if (original.type === 'camera') {
      return undefined
    }
    if (original.type === 'light' && (original as LightObject).lightType === 'ambient') {
      return undefined
    }

    // v7.1: 生成新的别名（原别名 + 编号）
    const originalAlias = original.alias ?? original.name
    const newAlias = generateUniqueAlias(originalAlias)

    // 复制品默认为顶层对象 — 移除 parentId
    const { parentId: _parentId, ...rest } = original
    const duplicate: SceneObject = {
      ...rest,
      id: generateId('sceneobject'),
      name: `${original.name} 副本`,
      alias: newAlias,
      x: original.x + 50,
      y: original.y + 50,
    }

    addObject(duplicate)

    // 生命周期钩子：类型特有的复制后处理（如 composite 递归复制子对象）
    const hooks = getLifecycleHooks(original.type)
    hooks?.onAfterDuplicate?.(original, duplicate, storeAccessor)

    if (duplicate.type === 'composite') {
      reconcileRenderChainsAfterCompositeDuplicate(original, duplicate)
    }

    return duplicate
  }

  // v19: 按渲染链顺序排序的对象列表（根级）
  function getSortedObjects(): SceneObject[] {
    // v19: 如果有渲染链，按渲染链顺序排列根级对象
    // 注意：必须返回所有对象（包括子对象），渲染循环需要遍历它们
    if (sceneRenderChain.value.length > 0) {
      const chainIds = sceneRenderChain.value
      const inChain = new Set(chainIds)
      const result: SceneObject[] = []
      // 先按 renderChain 顺序排列链上对象
      for (const id of chainIds) {
        const obj = objects.value.find(o => o.id === id)
        if (obj) result.push(obj)
      }
      // 追加不在链上的对象（子对象、camera、text 等）
      for (const obj of objects.value) {
        if (!inChain.has(obj.id)) {
          result.push(obj)
        }
      }
      return result
    }
    // fallback: 按 zIndex 排序
    return [...objects.value].sort((a, b) => a.zIndex - b.zIndex)
  }

  // P2: 查询组合对象的子对象
  // v19: entity 按 renderChain 顺序返回（如果有），否则 fallback 到 childIds
  function getChildObjects(compositeId: string): SceneObject[] {
    const composite = getObject(compositeId)
    if (composite?.type !== 'composite') return []
    const comp = composite as CompositeObject
    // entity 模式且有 renderChain：按 renderChain 顺序
    if (comp.compositeMode === 'entity' && comp.renderChain && comp.renderChain.length > 0) {
      return comp.renderChain
        .map(id => objects.value.find(o => o.id === id))
        .filter((o): o is SceneObject => o !== undefined)
    }
    // fallback: childIds 顺序
    return comp.childIds
      .map(id => objects.value.find(o => o.id === id))
      .filter((o): o is SceneObject => o !== undefined)
  }

  // P2: 调整渲染链中子对象的顺序（仅同 zIndex 内允许）
  // v19: 操作 entity 的 renderChain 或场景的 sceneRenderChain
  function reorderChild(compositeId: string, fromIndex: number, toIndex: number): void {
    const composite = getObject(compositeId)
    if (composite?.type !== 'composite') return
    const comp = composite as CompositeObject
    // v19: 操作 renderChain
    const chain = comp.compositeMode === 'entity' ? comp.renderChain : undefined
    if (!chain) return
    if (fromIndex < 0 || fromIndex >= chain.length) return
    if (toIndex < 0 || toIndex >= chain.length) return
    if (fromIndex === toIndex) return
    // zIndex 校验：禁止跨 zIndex 拖拽
    const fromObj = getObject(chain[fromIndex]!)
    const toObj = getObject(chain[toIndex]!)
    if (fromObj && toObj && fromObj.zIndex !== toObj.zIndex) return
    const [moved] = chain.splice(fromIndex, 1)
    if (moved !== undefined) chain.splice(toIndex, 0, moved)
  }

  // v19: 调整场景根级渲染链的顺序
  function reorderSceneRenderChain(fromIndex: number, toIndex: number): void {
    const chain = sceneRenderChain.value
    if (fromIndex < 0 || fromIndex >= chain.length) return
    if (toIndex < 0 || toIndex >= chain.length) return
    if (fromIndex === toIndex) return
    // zIndex 校验
    const fromObj = getObject(chain[fromIndex]!)
    const toObj = getObject(chain[toIndex]!)
    if (fromObj && toObj && fromObj.zIndex !== toObj.zIndex) return
    const [moved] = chain.splice(fromIndex, 1)
    if (moved !== undefined) chain.splice(toIndex, 0, moved)
  }

  /**
   * v19: 收集一组对象 ID 中的可渲染 ID（递归展开 union 子对象）
   * 用于 groupObjects 时确定需要从上级渲染链移除哪些 ID
   */
  function collectRenderableChildIds(objectIds: string[]): string[] {
    const result: string[] = []
    for (const id of objectIds) {
      const obj = getObject(id)
      if (!obj) continue
      if (obj.type === 'composite' && (obj as CompositeObject).compositeMode === 'union') {
        // union：不出现在渲染链，递归展开子对象
        result.push(...collectRenderableChildIds((obj as CompositeObject).childIds))
      } else if (obj.type !== 'camera' && obj.type !== 'audio' && obj.type !== 'light') {
        result.push(id)
      }
    }
    return result
  }

  // P2: 查询顶层对象（过滤掉有 parentId 的子对象）
  function getRootObjects(): SceneObject[] {
    return objects.value.filter(obj => !obj.parentId)
  }

  // P2: 将多个对象成组为一个 composite
  // 支持同级兄弟成组：所有对象必须共享同一个 parentId（含 undefined 即根级）
  function groupObjects(
    objectIds: string[],
    mode: 'entity' | 'union' = 'union'
  ): CompositeObject {
    // 计算所有待成组对象的包围盒中心作为 composite 位置
    const targetObjs = objectIds
      .map(id => getObject(id))
      .filter((o): o is SceneObject => o !== undefined)

    if (targetObjs.length === 0) {
      throw new Error('[groupObjects] 未找到任何待成组对象')
    }

    // 校验所有对象共享同一个 parentId
    const sharedParentId = targetObjs[0]!.parentId
    for (const obj of targetObjs) {
      if (obj.parentId !== sharedParentId) {
        throw new Error('[groupObjects] 所有待成组对象必须共享同一个 parentId（同级兄弟）')
      }
    }

    let sumX = 0, sumY = 0
    for (const obj of targetObjs) {
      sumX += obj.x
      sumY += obj.y
    }
    const centerX = sumX / targetObjs.length
    const centerY = sumY / targetObjs.length

    // 同级兄弟成组：先从旧 parent 的 childIds 中移除这些子对象
    if (sharedParentId) {
      const oldParent = getObject(sharedParentId)
      if (oldParent?.type === 'composite') {
        const oldComp = oldParent as CompositeObject
        for (const objId of objectIds) {
          const idx = oldComp.childIds.indexOf(objId)
          if (idx !== -1) oldComp.childIds.splice(idx, 1)
        }
      }
    }

    // 解析命名空间：确保 alias 在正确的 entity 命名空间内唯一
    const namespaceRoot = resolveNamespaceRoot(objectIds[0]!)
    // 创建 composite（不传 childIds，稍后手动设置以便坐标补偿）
    const composite = createCompositeObject('组合', [], undefined, undefined, mode, namespaceRoot)

    // 设置 composite 位置为成员中心
    updateObject(composite.id, {
      x: centerX,
      y: centerY,
    } as Partial<SceneObject>)

    // 同级兄弟成组：新 composite 继承共同 parentId
    if (sharedParentId) {
      updateObject(composite.id, { parentId: sharedParentId } as Partial<SceneObject>)
      // 将新 composite 加入旧 parent 的 childIds
      const oldParent = getObject(sharedParentId)
      if (oldParent?.type === 'composite') {
        (oldParent as CompositeObject).childIds.push(composite.id)
      }
    }

    // 注意：updateObject 使用 spread 创建新对象，composite 变成 stale reference。
    // 先 re-fetch 设置 childIds，再 attachChild（需要 comp 坐标）。
    const updatedComposite = getObject(composite.id) as CompositeObject
    updatedComposite.childIds = objectIds.slice()

    // 将对象加入 composite：坐标转为局部 + 设置 parentId
    for (const obj of targetObjs) {
      attachChild(obj.id, updatedComposite)
    }

    // v19: 渲染链同步
    if (!isActionMode.value) {
      if (mode === 'union') {
        // union：渲染链完全不变（子对象保持原位）
        // union composite 自身不应在渲染链中（addObject 已排除）
        // entity 的 renderChain 已在 addObject 时初始化，此处无需额外操作
      } else {
        // entity：
        // 1. 收集子对象在当前渲染链中的可渲染 ID（展开嵌套 union）
        const childRenderableIds = collectRenderableChildIds(objectIds)
        // 2. 找到最后一个子对象在渲染链中的位置
        const targetChain = sharedParentId
          ? (getObject(sharedParentId) as CompositeObject | undefined)?.renderChain
          : sceneRenderChain.value
        if (targetChain) {
          let lastPos = -1
          for (const cid of childRenderableIds) {
            const pos = targetChain.indexOf(cid)
            if (pos > lastPos) lastPos = pos
          }
          // 3. 从上级渲染链移除子对象
          removeMultipleFromRenderChain(targetChain, childRenderableIds)
          // Fix: 新 entity composite 在创建时（无 parentId），rcOnObjectAdded Rule 4 已将其
          // 追加到 sceneRenderChain 末尾。此处必须先从 sceneRenderChain 中移除，再插入正确位置，
          // 否则会出现双条目：
          //   - 嵌套场景（sharedParentId 非空）：composite 同时存在于 sceneRenderChain 和
          //     父 entity renderChain，contentRoot 在渲染完整个人物后还会把 container 单独
          //     渲染一遍，永远覆盖在最上层。
          //   - 根级分组（sharedParentId 为空）：targetChain === sceneRenderChain.value，
          //     下方 splice 会插入第二条，导致 container 同一帧被渲染两次。
          removeMultipleFromRenderChain(sceneRenderChain.value, [composite.id])
          // 4. entity 节点插入到最后一个子对象的原始位置
          const insertPos = lastPos !== -1 ? Math.min(lastPos, targetChain.length) : targetChain.length
          targetChain.splice(insertPos, 0, composite.id)
        }
        // 5. entity zIndex 取子对象最大值
        const maxZ = targetObjs.reduce((max, o) => Math.max(max, o.zIndex), targetObjs[0]!.zIndex)
        updateObject(composite.id, { zIndex: maxZ } as Partial<SceneObject>)
        // 6. 初始化 entity 的内部 renderChain
        const entityComp = getObject(composite.id) as CompositeObject
        entityComp.renderChain = buildRenderChain(objects.value, composite.id)
      }
    }

    return updatedComposite
  }

  // P2: 拆分 composite 的所有子对象
  function ungroupAll(compositeId: string): void {
    const composite = getObject(compositeId)
    if (composite?.type !== 'composite') {
      throw new Error(`[ungroupAll] 对象 ${compositeId} 不是 composite`)
    }

    const comp = composite as CompositeObject
    const isEntity = comp.compositeMode === 'entity'

    // v19: entity 拆组前保存 renderChain，用于原地展开
    const entityRenderChain = isEntity ? [...(comp.renderChain ?? comp.childIds)] : undefined

    const childIdsCopy = [...comp.childIds]

    for (const childId of childIdsCopy) {
      detachChild(childId, comp)
    }

    // v19: 渲染链同步（entity 拆组时展开）
    if (!isActionMode.value && isEntity && entityRenderChain) {
      // 穿透 union 祖先，找到实际持有渲染链的 entity 或场景根级
      const targetChain = findOwningRenderChain(comp)
      const entityPos = targetChain.indexOf(compositeId)
      if (entityPos !== -1) {
        // 用 entity 的 renderChain 内容替换 entity 节点（原地展开）
        targetChain.splice(entityPos, 1, ...entityRenderChain)
      }
    }
    // union 拆组：渲染链不变

    // 清空 childIds 后删除空 composite
    comp.childIds = []
    comp.renderChain = []
    removeObject(compositeId)
  }

  /** 检测是否存在循环引用：childId 是否是 compositeId 的祖先 */
  function wouldCreateCycle(compositeId: string, childId: string): boolean {
    let current: string | undefined = compositeId
    while (current) {
      if (current === childId) return true
      const obj = getObject(current)
      current = obj?.parentId
    }
    return false
  }

  // P2: 添加对象到已有 composite
  function addToComposite(compositeId: string, objectIds: string[]): void {
    const composite = getObject(compositeId)
    if (composite?.type !== 'composite') {
      throw new Error(`[addToComposite] 对象 ${compositeId} 不是 composite`)
    }

    const comp = composite as CompositeObject

    // === Phase 1: 记录原状态（attachChild 前） ===
    interface PendingEntry {
      objectId: string
      renderableIds: string[]
      originalParentId: string | undefined
    }
    const pending: PendingEntry[] = []

    for (const objectId of objectIds) {
      if (wouldCreateCycle(compositeId, objectId)) {
        throw new Error(`[addToComposite] 循环引用：${objectId} 是 ${compositeId} 的祖先`)
      }
      const obj = getObject(objectId)
      pending.push({
        objectId,
        renderableIds: collectRenderableChildIds([objectId]),
        originalParentId: obj?.parentId,
      })
    }

    // === Phase 2: attachChild + childIds（会修改 parentId） ===
    for (const { objectId, originalParentId } of pending) {
      // 从旧 parent 的 childIds 中移除
      if (originalParentId) {
        const oldParent = getObject(originalParentId)
        if (oldParent?.type === 'composite') {
          const oldComp = oldParent as CompositeObject
          const idx = oldComp.childIds.indexOf(objectId)
          if (idx !== -1) oldComp.childIds.splice(idx, 1)
        }
      }
      attachChild(objectId, comp)
      if (!comp.childIds.includes(objectId)) {
        comp.childIds.push(objectId)
      }
    }

    // === Phase 3: renderChain 更新（Setup Mode only） ===
    if (!isActionMode.value) {
      for (const { renderableIds, originalParentId } of pending) {
        const sourceChain = resolveRenderChainByParentId(originalParentId)

        // 确定目标 renderChain
        let targetChain: string[]
        if (comp.compositeMode === 'entity') {
          comp.renderChain ??= []
          targetChain = comp.renderChain
        } else {
          // union → 穿透到最近 entity 祖先
          targetChain = findOwningRenderChain(comp)
        }

        // 同链迁移检测：对象在同一 entity 的展开范围内移动，renderChain 不变
        if (sourceChain && sourceChain === targetChain) continue

        // 不同链：从原链移除 → 插入目标链
        if (sourceChain) {
          removeMultipleFromRenderChain(sourceChain, renderableIds)
        }
        for (const rid of renderableIds) {
          const obj = getObject(rid)
          if (obj) {
            const pos = findInsertPosition(targetChain, obj.zIndex, getObject)
            targetChain.splice(pos, 0, rid)
          }
        }
      }
    }
  }

  function removeFromComposite(childIds: string[]): void {
    for (const childId of childIds) {
      const child = getObject(childId)
      if (!child?.parentId) continue

      const composite = getObject(child.parentId)
      if (composite?.type !== 'composite') continue

      const comp = composite as CompositeObject
      const wasEntity = comp.compositeMode === 'entity'

      detachChild(childId, comp)

      // 从当前 parent 的 childIds 中移除
      const childIdx = comp.childIds.indexOf(childId)
      if (childIdx !== -1) comp.childIds.splice(childIdx, 1)

      // detachChild 会冒泡 parentId 到上级，需同步上级的 childIds
      const updatedChild = getObject(childId)
      const bubbleTargetId = updatedChild?.parentId
      if (bubbleTargetId) {
        const bubbleTarget = getObject(bubbleTargetId)
        if (bubbleTarget?.type === 'composite') {
          const bubbleComp = bubbleTarget as CompositeObject
          if (!bubbleComp.childIds.includes(childId)) {
            bubbleComp.childIds.push(childId)
          }
        }
      }

      // === renderChain 级联更新（Setup Mode only） ===
      // Action Mode 下由 sceneStateCalculator 的 buildRenderChain 全量重建
      // union 拆分：union 本身在渲染链中是展开的，子对象冒泡后仍在同级，无需变更
      // entity 拆分：子对象从被 entity 封装 → 变为直接可见，需更新渲染链
      if (!isActionMode.value && wasEntity) {
        const targetChain = findOwningRenderChain(comp)

        // 同链迁移检测：拆出后仍落在同一 entity 的展开范围，renderChain 不变
        if (comp.renderChain && comp.renderChain !== targetChain) {
          // 1. 从源 entity 的 renderChain 移除（union 需展开后批量移除）
          const removableIds = collectRenderableChildIds([childId])
          removeMultipleFromRenderChain(comp.renderChain, removableIds)

          // 2. 将可渲染 ID 插入目标 renderChain（按 zIndex 有序位置）
          const insertableIds = collectRenderableChildIds([childId])
          for (const insertId of insertableIds) {
            const obj = getObject(insertId)
            if (obj) {
              const pos = findInsertPosition(targetChain, obj.zIndex, getObject)
              targetChain.splice(pos, 0, insertId)
            }
          }
        }
      }
    }
  }

  /**
   * 从指定 composite 向上查找其所属的 renderChain。
   * 穿透所有 union 祖先，找到最近的 entity 祖先的 renderChain；
   * 若无 entity 祖先，返回场景根级 sceneRenderChain。
   */
  function findOwningRenderChain(comp: CompositeObject): string[] {
    let currentParentId = comp.parentId
    while (currentParentId) {
      const ancestor = getObject(currentParentId)
      if (ancestor?.type !== 'composite') break

      const ancestorComp = ancestor as CompositeObject
      if (ancestorComp.compositeMode === 'entity') {
        // 找到 entity 祖先
        ancestorComp.renderChain ??= []
        return ancestorComp.renderChain
      }
      // union：透明容器，继续向上
      currentParentId = ancestorComp.parentId
    }
    // 无 entity 祖先 → 场景根级
    return sceneRenderChain.value
  }

  /**
   * 根据对象的 parentId 定位其所属的 renderChain。
   * - 无 parent → sceneRenderChain
   * - parent 是 entity → entity.renderChain
   * - parent 是 union → 穿透到最近 entity 祖先
   */
  function resolveRenderChainByParentId(parentId: string | undefined): string[] | null {
    if (!parentId) return sceneRenderChain.value
    const parent = getObject(parentId)
    if (parent?.type !== 'composite') return null
    const parentComp = parent as CompositeObject
    if (parentComp.compositeMode === 'entity') {
      return parentComp.renderChain ?? null
    }
    return findOwningRenderChain(parentComp)
  }

  function clearObjects() {
    setupState.value = {
      camera: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y, width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT, zoom: 1 },
      objects: [],
      renderChain: [],
    }
    runtimeState.value = null
    selectedObjectId.value = null
  }

  // ==================== Action Mode API ====================

  /** 从 Setup 数据初始化持久层（加载场景时） */
  function initFromSetup(sourceObjects: SceneObject[]): void {

    setupState.value.objects = JSON.parse(JSON.stringify(sourceObjects)) as SceneObject[]
  }

  /** 设置 Action Mode 标记 */
  function setActionMode(enabled: boolean): void {

    isActionMode.value = enabled
    if (enabled) {
      // 进入 Action Mode：从 setupState 创建 RuntimeSceneSnapshot
      runtimeState.value = createRuntimeSnapshot(setupState.value)
    } else {
      // 退出 Action Mode：丢弃 runtimeState，objects computed 自动切回 setupState
      runtimeState.value = null
    }
  }

  /** 获取当前是否 Action Mode */
  function getIsActionMode(): boolean {
    return isActionMode.value
  }

  // ==================== v24: Episode 自动同步 ====================
  let _episodeSetupRef: SceneSetup | null = null

  /** 注册 Action Mode 下的 episode 同步目标。传 null 解注册。 */
  function registerEpisodeSync(setup: SceneSetup | null): void {
    _episodeSetupRef = setup
  }

  /** v24: 同步持久层 renderChain 到已注册的 episode 数据 */
  function syncRegisteredEpisodeRenderChain(): void {
    if (!_episodeSetupRef) return
    _episodeSetupRef.renderChain = reconcileRenderChain(
      setupState.value.renderChain ?? [],
      _episodeSetupRef.objects,
    )
    for (const obj of _episodeSetupRef.objects) {
      if (obj.type !== 'composite') continue
      const composite = obj as CompositeObject
      if (composite.compositeMode !== 'entity') continue
      // v24.1: 从 setupState（Store 权威源）读取 entity 的 renderChain 基线，
      // 而非 episode 副本。episode 副本可能因深拷贝时序而持有旧的 renderChain。
      const storeComposite = setupState.value.objects.find(o => o.id === composite.id) as CompositeObject | undefined
      composite.renderChain = reconcileRenderChain(
        storeComposite?.renderChain ?? [],
        _episodeSetupRef.objects,
        composite.id,
      )
    }
  }

  // ==================== Action Mode 持久操作 API ====================
  // 以下 API 用于 Action Mode 下对持久层的合法修改（动态对象管理 + UI-only 属性）

  /** Action Mode 下向持久层添加动态对象（同步写入 setupState + runtimeState + episode） */
  function addSetupObject(obj: SceneObject): void {
    setupState.value.objects.push(obj)
    
    // 1. 同步持久层 (Setup) 的 renderChain（使用 rcSetupAccessor 绕过 isActionMode 劫持）
    rcOnObjectAdded(obj, rcSetupAccessor)

    // 2. 同步写入 runtimeState 以便 Action Mode 渲染立即可见
    if (runtimeState.value) {
      const runtimeObj = JSON.parse(JSON.stringify(obj)) as SceneObject
      runtimeState.value.objects.push(runtimeObj)
      rcOnObjectAdded(runtimeObj, rcStoreAccessor)
    }

    // 3. v24: 自动同步到 episode 持久数据（深拷贝确保独立性）
    if (_episodeSetupRef) {
      _episodeSetupRef.objects.push(JSON.parse(JSON.stringify(obj)) as SceneObject)
      syncRegisteredEpisodeRenderChain()
    }
  }
  /**
   * Action Mode 下从持久层删除动态对象（同步从 setupState + runtimeState 移除）
   */
  function removeSetupObject(id: string): void {
    const setupIdx = setupState.value.objects.findIndex(o => o.id === id)
    if (setupIdx !== -1) {
      const obj = setupState.value.objects[setupIdx]!
      // 触发删除钩子，并确保父子关系的清理作用在 setupState 持久层
      const hooks = getLifecycleHooks(obj.type)
      hooks?.onBeforeDelete?.(obj, setupStoreAccessor)

      setupState.value.objects.splice(setupIdx, 1)

      // 同步清理持久层 (Setup) 的 renderChain（使用 rcSetupAccessor 绕过 isActionMode 劫持）
      rcOnObjectRemoved(id, obj, rcSetupAccessor)
    }

    if (runtimeState.value) {
      const runtimeIdx = runtimeState.value.objects.findIndex(o => o.id === id)
      if (runtimeIdx !== -1) {
        const runtimeObj = runtimeState.value.objects[runtimeIdx]!
        runtimeState.value.objects.splice(runtimeIdx, 1)

        // 同步清理 runtimeState 的 renderChain
        rcOnObjectRemoved(id, runtimeObj, rcStoreAccessor)
      }
    }

    // v24: 整体覆盖到 episode（onBeforeDelete 可能级联修改了多个对象的 parentId/childIds）
    if (_episodeSetupRef) {
      _episodeSetupRef.objects = JSON.parse(JSON.stringify(setupState.value.objects)) as SceneObject[]
      syncRegisteredEpisodeRenderChain()
    }
  }

  /** Action Mode 下修改持久层属性（alias、compositeLocked 等 UI-only 持久属性） */
  function updateSetupObject<T extends SceneObject = SceneObject>(id: string, updates: SceneObjectUpdateFor<T>): void {
    // 同时写入持久层和显示层
    applyUpdatesToArray(setupState.value.objects, id, updates)
    if (runtimeState.value) {
      applyUpdatesToArray(runtimeState.value.objects, id, updates)
    }
    // v24: 自动同步到 episode 持久数据（按 ID 精确同步）
    if (_episodeSetupRef) {
      applyUpdatesToArray(_episodeSetupRef.objects, id, updates)
    }
  }

  /** 从持久层获取对象（用于 Action Mode 下需要读取 Setup 原始值的场景） */
  function getSetupObject(id: string): SceneObject | undefined {
    return setupState.value.objects.find(obj => obj.id === id)
  }

  /**
   * 应用 Slot 计算结果到运行时层
   *
   * 以 calculateSlotStates 的 realState 为唯一真相源，逐属性同步到 runtimeObjects。
   * Dirty-check 确保值相同时不触发 Vue setter，避免 watcher 无限触发。
   *
   * @param excludeIds 需要跳过的对象 ID 集合（用于排除正在交互中的对象，
   *        防止 applySlotState 覆盖 handleDragMove/handleResizeMove 写入的中间值）
   */
  function applySlotState(
    slotStates: import('@/utils/sceneStateCalculator').SlotStatesResult,
    excludeIds?: Set<string>
  ): void {

    if (!runtimeState.value) return
    // 只写入显示层（runtimeState），永不触碰持久层（setupState）
    // v17: animations / initialAnimations 由 Store 管理（updateSetupObject），
    // 不受 scene.setup → calculateSlotStates → applySlotState 链路覆盖
    // v19: compositeLocked 是 UI-only 属性（不序列化），必须保留以免被 slot 状态覆盖
    // v23: alias / name 是元数据字段，通过 updateSetupObject 修改，不受任何 Action 影响。
    //      sceneGraph 缓存的 slotStates 可能包含旧值，若不保护会导致修改名称后被覆盖回旧值。
    const preserveKeys = new Set(['animations', 'initialAnimations', 'compositeLocked', 'alias', 'name'])
    const nearlyEqual = (a: number | undefined, b: number | undefined, epsilon = 0.0001): boolean => {
      if (a === b) return true
      if (a === undefined || b === undefined) return false
      return Math.abs(a - b) <= epsilon
    }

    for (const runtimeObj of runtimeState.value.objects) {
      // Camera is synchronized from slotStates.camera.real below.
      // Do not also flow it through the generic objects map, otherwise camera
      // fields such as zoom/width/height can be written twice by two sources.
      if (runtimeObj.type === 'camera') continue
      // v21: 跳过正在交互的对象，防止覆盖拖拽/缩放/旋转期间直接写入的中间值
      if (excludeIds?.has(runtimeObj.id)) continue
      const stateResult = slotStates.objects.get(runtimeObj.id)
      if (!stateResult) continue

      const target = stateResult.real as unknown as Record<string, unknown>
      const runtimeRec = runtimeObj as unknown as Record<string, unknown>
      // 同步：以 target (realState) 为唯一真相源
      // v17: 跳过 preserveKeys — 这些字段由 Store 直接管理，不应被 scene.setup 快照覆盖
      for (const [key, newValue] of Object.entries(target)) {
        if (preserveKeys.has(key)) continue
        const oldValue = runtimeRec[key]
        if (oldValue !== newValue) {
          if (typeof oldValue === 'object' && typeof newValue === 'object'
            && oldValue !== null && newValue !== null
            && JSON.stringify(oldValue) === JSON.stringify(newValue)) {
            continue
          }

          runtimeRec[key] = newValue
        }
      }

      // 删除 runtimeObj 上 target 中不存在的多余属性
      // v16: 保留 preserveKeys 中的字段
      for (const key of Object.keys(runtimeRec)) {
        if (!(key in target) && !preserveKeys.has(key)) {
          delete runtimeRec[key]
        }
      }

    }


    // 同步 runtime 渲染链
    if (slotStates.renderChain.length > 0) {
      runtimeState.value.renderChain = slotStates.renderChain
    }

    // 同步相机状态到 store 的相机对象
    // applySlotState 之前只同步 objects map，不同步 camera，
    // 导致删除 camera action 后 store 相机残留旧值（x/y/zoom），
    // 后续交互（syncContainerFromStore → applyCameraState）会从 store 读到幽灵数据
    // Camera uses zoom as its primary scale state, while width/height are
    // derived values. Keep camera sync isolated here so there is a single
    // authoritative write path for runtime camera state.
    const cameraObj = runtimeState.value.objects.find(o => o.type === 'camera')
    // v21: 相机被交互锁定时跳过同步，防止覆盖拖拽/缩放期间的中间值
    if (cameraObj && !excludeIds?.has(cameraObj.id)) {
      const camReal = slotStates.camera.real
      if (!nearlyEqual(cameraObj.x, camReal.x)) cameraObj.x = camReal.x
      if (!nearlyEqual(cameraObj.y, camReal.y)) cameraObj.y = camReal.y
      const cameraTyped = cameraObj as CameraObject
      if (!nearlyEqual(cameraTyped.zoom, camReal.zoom)) {
        cameraTyped.zoom = camReal.zoom
        cameraObj.width = CAMERA_BASE_WIDTH / camReal.zoom
        cameraObj.height = CAMERA_BASE_HEIGHT / camReal.zoom
      } else {
        const expectedWidth = CAMERA_BASE_WIDTH / camReal.zoom
        const expectedHeight = CAMERA_BASE_HEIGHT / camReal.zoom
        if (!nearlyEqual(cameraObj.width, expectedWidth)) cameraObj.width = expectedWidth
        if (!nearlyEqual(cameraObj.height, expectedHeight)) cameraObj.height = expectedHeight
      }
    }
  }

  // ==================== PT Phase 8.2: 持久化序列化 ====================

  /**
   * 将 SceneObject 转换为持久化 DTO
   * 谁创建数据，谁负责序列化 —— Store 最清楚每种类型的字段
   * P1: 特化字段由 TypeSerializer registry 分发，无需 switch
   *
   * 双层架构：始终从 setupObjects（持久层）读取，确保 Action Mode 运行时状态不会被序列化
   */
  function toSetupObject(obj: SceneObject): SceneObject {
    // 双层架构：如果在 Action Mode 下，从 setupObjects 中查找原始数据
    // 这样即使 obj 来自 runtimeObjects（被 applySlotState 覆写），序列化出的数据也是 Setup 原始值
    const sourceObj = isActionMode.value
      ? (setupState.value.objects.find(s => s.id === obj.id) ?? obj)
      : obj

    // 公共几何属性（所有类型共享）
    const base: Partial<SceneObject> & Record<string, unknown> = {
      id: sourceObj.id,
      refId: sourceObj.refId,
      type: sourceObj.type,
      name: sourceObj.name,
      x: sourceObj.x,
      y: sourceObj.y,
      width: sourceObj.width,
      height: sourceObj.height,
      scaleX: sourceObj.scaleX,
      scaleY: sourceObj.scaleY,
      rotation: sourceObj.rotation,
      zIndex: sourceObj.zIndex,
      flipX: sourceObj.flipX,
      visible: sourceObj.visible,
      alpha: sourceObj.alpha,
      ...(sourceObj.receiveLighting === false
        ? { receiveLighting: false }
        : {}),
      ...(sourceObj.castShadow === true
        ? { castShadow: true }
        : {}),
      spawned: (sourceObj as unknown as { spawned?: boolean }).spawned ?? true,
      ...(sourceObj.parentId ? { parentId: sourceObj.parentId } : {}),
      // 变换原点（可选，默认 0 不序列化）
      ...(sourceObj.transformOriginX !== undefined && sourceObj.transformOriginX !== 0
        ? { transformOriginX: sourceObj.transformOriginX } : {}),
      ...(sourceObj.transformOriginY !== undefined && sourceObj.transformOriginY !== 0
        ? { transformOriginY: sourceObj.transformOriginY } : {}),
      // v16: 统一序列化动画数据
      ...(sourceObj.animations && Object.keys(sourceObj.animations).length > 0
        ? { animations: sourceObj.animations } : {}),
      ...(sourceObj.initialAnimations !== undefined
        ? { initialAnimations: sourceObj.initialAnimations } : {}),
    }

    // 所有非相机对象保存 alias
    if (sourceObj.alias) base.alias = sourceObj.alias

    // v20: 序列化 extraInfo（来源身份标识）
    if (sourceObj.extraInfo) base.extraInfo = sourceObj.extraInfo

    // P1: 按 type 填充特化字段 — 委托给 TypeSerializer
    const serializer = getTypeSerializer(sourceObj.type)
    if (serializer) {
      serializer.serializeFields(sourceObj, base)
    }
    // text/camera 无 serializer 注册，公共字段已足够

    return base as SceneObject
  }

  /**
   * Phase 2: 从 SceneObject 反序列化为运行时 SceneObject
   * 角色名称解析通过回调注入，避免 Store 耦合 projectStore/actorUtils
   * P1: 各类型反序列化逻辑委托给 TypeSerializer registry
   */
  function fromSetupObject(
    objData: SceneObject,
    resolveActorName: (refId: string, actorId?: string) => { displayName: string; resolvedActorId: string } | null
  ): void {
    const serializer = getTypeSerializer(objData.type)
    if (!serializer) {
      // camera/text 不由 setup.objects 加载，无需 serializer
      return
    }

    // 构建反序列化上下文，将 Store 内部函数注入给 serializer
    const ctx: DeserializeContext = {
      createBackgroundObject,
      createAudioObject,
      createPropObject,
      createScreenEffectObject,
      createSymbolObject,
      createExpressionObject,
      createCompositeObject,
      createTextObject,
      createLightObject,
      createMaskObject,
      pendingMaskTargets: _pendingMaskTargets,
      updateObject,
      resolveActorName,
    }

    serializer.deserialize(objData, ctx)

    // v16: 统一恢复动画数据（所有类型共用）
    const createdObj = setupState.value.objects.find(o => o.id === objData.id)
    if (createdObj) {
      if (objData.receiveLighting !== undefined) {
        createdObj.receiveLighting = objData.receiveLighting
      }
      if (objData.castShadow !== undefined) {
        createdObj.castShadow = objData.castShadow
      }
      // v20: 恢复 extraInfo（来源身份标识）
      if (objData.extraInfo) {
        createdObj.extraInfo = objData.extraInfo
      }
      if (objData.animations && Object.keys(objData.animations).length > 0) {
        // 新文件：从持久化数据恢复
        createdObj.animations = objData.animations
      }
      // 迁移：旧文件没有 animations，通过 hydrate 补充
      if (!createdObj.animations || Object.keys(createdObj.animations).length === 0) {
        getAnimationStore().hydrateObjectAnimations(createdObj)
      }
      if (objData.initialAnimations !== undefined) {
        createdObj.initialAnimations = objData.initialAnimations
      }
      // v21: 旧文件迁移 — 仅当文件中完全没有 initialAnimations 字段时才补默认播放
      if (objData.initialAnimations === undefined) {
        autoPopulateInitialAnimations(createdObj)
      }
    }
  }

  // v19: 渲染链管理 API
  function getSceneRenderChain(): string[] {
    return sceneRenderChain.value
  }

  function setSceneRenderChain(chain: string[]): void {
    setupState.value.renderChain = chain
  }

  /** 从当前 objects 自动构建场景渲染链（初始化/迁移用） */
  function rebuildSceneRenderChain(): void {
    setupState.value.renderChain = buildRenderChain(objects.value)
  }

  /** 为所有 entity composite 协调 renderChain（反序列化/迁移后调用） */
  function rebuildEntityRenderChains(): void {
    for (const obj of setupState.value.objects) {
      if (obj.type !== 'composite') continue
      const comp = obj as CompositeObject
      if (comp.compositeMode !== 'entity') continue
      // 旧数据缺失时重建；已有持久化数据则增量协调，保留用户顺序并补齐新入链类型。
      if (!comp.renderChain || comp.renderChain.length === 0) {
        comp.renderChain = buildRenderChain(setupState.value.objects, comp.id)
      } else {
        comp.renderChain = reconcileRenderChain(comp.renderChain, setupState.value.objects, comp.id)
      }
    }
  }

  /**
   * v19: 对指定对象所属的 renderChain 做稳定排序（Setup Mode only）。
   * 用于 zIndex 变更后维护 zIndex 有序不变量。
   *
   * 稳定排序 vs 全量重建：
   * - 稳定排序：仅按 zIndex 重新分组，同 zIndex 内保留用户自定义的相对顺序
   * - 全量重建 (buildRenderChain)：会丢失用户自定义顺序，退化为 objects 数组位置排序
   *
   * 定位逻辑：
   * - 对象在 entity 内 → 排序该 entity 的 renderChain
   * - 对象在 union 内 → 穿透到最近 entity 祖先排序
   * - 根级对象 → 排序 sceneRenderChain
   */
  function sortOwningRenderChain(objectId: string): void {
    if (isActionMode.value) return // Action Mode 由 sceneStateCalculator 处理
    const obj = getObject(objectId)
    if (!obj) return

    const zIndexGetter = (id: string): number => getObject(id)?.zIndex ?? 0

    // 沿 parentId 链向上查找最近的 entity 祖先
    let currentParentId = obj.parentId
    while (currentParentId) {
      const parent = getObject(currentParentId)
      if (parent?.type === 'composite') {
        const parentComp = parent as CompositeObject
        if (parentComp.compositeMode === 'entity') {
          if (parentComp.renderChain) {
            parentComp.renderChain = sortRenderChainByZIndex(parentComp.renderChain, zIndexGetter)
          }
          return
        }
        // union：继续向上
        currentParentId = parentComp.parentId
      } else {
        break
      }
    }
    // 根级对象：稳定排序 sceneRenderChain
    setupState.value.renderChain = sortRenderChainByZIndex(sceneRenderChain.value, zIndexGetter)
  }

  return {
    objects,             // computed 代理：Setup Mode → setupState.objects, Action Mode → runtimeState.objects
    setupState,          // 持久层 SceneSetup（供序列化、迁移用）
    runtimeState,        // Runtime 层 RuntimeSceneSnapshot | null
    selectedObjectId,
    // v17: 命名空间别名管理
    resolveNamespaceRoot,
    getNamespaceAliases,
    getExistingAliases,
    isAliasExists,
    generateUniqueAlias,
    // 对象操作函数
    addObject,
    createBackgroundObject,
    createAudioObject,
    createPropObject,
    autoPopulateInitialAnimations,  // v21: 仅供 UI 创建路径调用
    createScreenEffectObject,
     createSymbolObject,        // v16
    createExpressionObject,    // v18
    createCompositeObject,   // P2
    createMaskObject,         // Clip-Mask Phase 1
    finalizeMaskTargets,      // Clip-Mask Phase 1：反序列化后回填 + 独占校验
    createCameraObject,
    createLightObject,
    createTextObject,
    getObject,
    updateObject,
    removeObject,
    selectObject,
    getSelectedObject,
    duplicateObject,
    getSortedObjects,
    getChildObjects,         // P2
    getRootObjects,          // P2
    groupObjects,            // P2: 多选成组
    ungroupAll,              // P2: 拆分组合
    addToComposite,          // P2: 追加成员
    removeFromComposite,     // P2: 移出成员
    reorderChild,            // P2: 调整子对象渲染顺序
    reorderSceneRenderChain, // v19: 场景根级渲染链排序
    collectAllDescendantIds, // P2: 递归收集后代 ID
    removeObjectWithDescendants, // P2: 强制级联删除
    dissolveComposite,           // P2: 解散组合（子对象冒泡）
    clearObjects,
    toSetupObject,
    fromSetupObject,
    // v19: 渲染链管理
    getSceneRenderChain,
    setSceneRenderChain,
    rebuildSceneRenderChain,
    rebuildEntityRenderChains,
    sortOwningRenderChain,
    // Action Mode API
    initFromSetup,
    applySlotState,
    setActionMode,
    getIsActionMode,
    // Action Mode 持久操作 API
    addSetupObject,
    removeSetupObject,
    updateSetupObject,
    getSetupObject,
    registerEpisodeSync,
  }
})
