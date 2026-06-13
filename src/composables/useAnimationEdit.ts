/**
 * useAnimationEdit - Animation WYSIWYG 编辑器核心 composable
 * 
 * 职责：
 * - 深拷贝 AnimationDefinition 作为本地编辑状态
 * - 关键帧 CRUD（始终保持按 time 排序）
 * - 播放头管理 + evaluateAtTime
 * - Auto-Key 逻辑
 * - 播放控制（内部使用 AnimationPlayer）
 * - 脏数据追踪
 * 
 * 数据隔离：不读写 sceneObjectStore，编辑期间所有变换仅写入本地 keyframe 数据
 */

import { computed, reactive, ref } from 'vue'

import { AnimationTrackEvaluator } from '@/core/AnimationTrackEvaluator'
import type {
    AnimationDefinition,
    AnimationTimingMode,
    AnimationTrack,
    EasingType,
    EffectParams,
    FrameSequenceTrack,
    TransformKeyframe,
    TransformTrackOutput,
    VisibilityKeyframe,
    VisibilityTrackOutput,
} from '@/types/animation'

/** 关键帧时间匹配容差 */
const TIME_TOLERANCE = 0.005

export interface UseAnimationEditOptions {
    /** 原始动画定义（传入后深拷贝） */
    animation: AnimationDefinition
    /** 初始编辑的 transform track 索引 */
    initialTrackIndex?: number
}

export function useAnimationEdit(options: UseAnimationEditOptions) {
    // ===== 核心编辑状态 =====

    /** 本地深拷贝的动画定义（reactive） */
    const animationDef = reactive<AnimationDefinition>(
        JSON.parse(JSON.stringify(options.animation)) as AnimationDefinition
    )

    /** 初始快照，用于脏数据比较（切换动画时需要同步更新） */
    let initialSnapshot = JSON.stringify(options.animation)

    /** 当前编辑的 track 索引 */
    const currentTrackIndex = ref(options.initialTrackIndex ?? findFirstTransformTrackIndex())

    /** 当前选中的关键帧索引（-1 = 无选中） */
    const selectedKeyframeIndex = ref(0)

    /** 播放头位置（归一化 0-1） */
    const playheadPosition = ref(0)

    /** Auto-Key 永远开启（拖拽即写入关键帧） */
    const autoKeyEnabled = ref(true)

    /** 播放状态 */
    const isPlaying = ref(false)

    /** 循环播放 */
    const loopPlayback = ref(false)

    /** 内部播放器（预留，暂由 rAF loop 替代） */
    // const player = shallowRef(new AnimationPlayer())

    // ===== 计算属性 =====

    /** 所有轨道（全类型） */
    const allTracks = computed(() =>
        animationDef.tracks
            .map((t, i) => ({ track: t, index: i }))
    )

    /** 可用的 transform track 列表 */
    const transformTracks = computed(() =>
        animationDef.tracks
            .map((t, i) => ({ track: t, index: i }))
            .filter(({ track }) => track.trackType === 'transform')
    )

    /** 当前编辑的 track（任意类型） */
    const currentTrackAny = computed((): AnimationTrack | null => {
        if (currentTrackIndex.value < 0) return null
        return animationDef.tracks[currentTrackIndex.value] ?? null
    })

    /** 当前编辑的 transform track（仅当类型匹配时返回） */
    const currentTrack = computed(() => {
        const track = currentTrackAny.value
        if (track?.trackType === 'transform') return track
        return null
    })

    /** 当前编辑的 visibility track（仅当类型匹配时返回） */
    const currentVisibilityTrack = computed(() => {
        const track = currentTrackAny.value
        if (track?.trackType === 'visibility') return track
        return null
    })

    /** 当前编辑的 effect track（仅当类型匹配时返回） */
    const currentEffectTrack = computed(() => {
        const track = currentTrackAny.value
        if (track?.trackType === 'effect') return track
        return null
    })

    /** 当前编辑的 frame_sequence track（仅当类型匹配时返回） */
    const currentFrameSequenceTrack = computed(() => {
        const track = currentTrackAny.value
        if (track?.trackType === 'frame_sequence') return track
        return null
    })

    /** 三态选中模型 */
    type SelectionMode = 'none' | 'track' | 'keyframe'
    const selectionMode = computed((): SelectionMode => {
        if (currentTrackIndex.value < 0) return 'none'
        if (selectedKeyframeIndex.value < 0) return 'track'
        return 'keyframe'
    })

    /** 当前轨道是否支持关键帧编辑 */
    const isKeyframable = computed(() => {
        const t = currentTrackAny.value
        return t?.trackType === 'transform' || t?.trackType === 'visibility'
    })

    /** 当前 track 的关键帧列表（transform-only，保留以向后兼容） */
    const keyframes = computed(() => currentTrack.value?.keyframes ?? [])

    /** 当前选中的关键帧（transform-only） */
    const selectedKeyframe = computed(() => {
        if (selectedKeyframeIndex.value < 0) return null
        return keyframes.value[selectedKeyframeIndex.value] ?? null
    })

    /**
     * 当前活动轨道的关键帧列表（transform 或 visibility）。
     * seekPrev/Next 和 findKeyframeAtTime 应使用此集合而非 keyframes。
     */
    const activeKeyframes = computed((): { time: number }[] => {
        const t = currentTrackAny.value
        if (t?.trackType === 'transform') return currentTrack.value?.keyframes ?? []
        if (t?.trackType === 'visibility') return currentVisibilityTrack.value?.keyframes ?? []
        return []
    })

    /** 运行时动态轨道时长覆写（如 frame_sequence 根据总帧数/fps 计算） */
    const trackDurationOverrideMs = ref<number | null>(null)

    /** 当前 track 时长 (ms)（支持 transform / visibility / 运行时覆写） */
    const trackDuration = computed(() => {
        if (trackDurationOverrideMs.value !== null) return trackDurationOverrideMs.value
        const track = currentTrack.value ?? currentVisibilityTrack.value
        if (!track) return 1000
        const d = track.duration
        if (d === 'auto' || d === undefined) return 1000
        return d
    })

    /** 是否有未保存的修改 */
    const hasUnsavedChanges = computed(() =>
        JSON.stringify(animationDef) !== initialSnapshot
    )

    /** 当前时间点的评估输出 */
    const currentOutput = computed(() => evaluateAtTime(playheadPosition.value))

    // ===== 帮助函数 =====

    function findFirstTransformTrackIndex(): number {
        const idx = options.animation.tracks.findIndex(t => t.trackType === 'transform')
        return idx >= 0 ? idx : 0
    }

    // ===== 关键帧操作 =====

    /**
     * 对当前 track 的关键帧数组重排（按 time 升序）
     * Hard constraint: AnimationTrackEvaluator.findKeyframes 假设已排序
     */
    function sortKeyframes() {
        const track = currentTrack.value
        if (!track) return
        track.keyframes.sort((a, b) => a.time - b.time)
    }

    /**
     * 更新指定关键帧的属性
     */
    function updateKeyframe(index: number, values: Partial<TransformKeyframe>) {
        const track = currentTrack.value
        if (!track || index < 0 || index >= track.keyframes.length) return

        const kf = track.keyframes[index]
        if (!kf) return

        Object.assign(kf, values)

        // 如果修改了 time，需要重排
        if ('time' in values) {
            sortKeyframes()
            // 重排后找到这个帧的新索引
            const newIdx = track.keyframes.findIndex(k => k === kf)
            if (newIdx >= 0) selectedKeyframeIndex.value = newIdx
        }
    }

    /**
     * 在播放头位置添加关键帧（基于当前插值状态）
     */
    function addKeyframeAtPlayhead(): number {
        const track = currentTrack.value
        if (!track) return -1

        const time = playheadPosition.value

        // 检查该时间点是否已有关键帧
        const existing = findKeyframeAtTime(time)
        if (existing >= 0) {
            selectedKeyframeIndex.value = existing
            return existing
        }

        // 基于插值状态创建新帧
        const interpolated = AnimationTrackEvaluator.evaluateTransform(track, time)
        const newKf: TransformKeyframe = {
            time,
            x: interpolated.x,
            y: interpolated.y,
            scaleX: interpolated.scaleX,
            scaleY: interpolated.scaleY,
            rotation: interpolated.rotation,
            ...(interpolated.flipX !== undefined ? { flipX: interpolated.flipX } : {}),
        }

        return insertKeyframeSorted(newKf)
    }

    /**
     * 插入关键帧并保持排序
     * @returns 插入后的索引
     */
    function insertKeyframeSorted(kf: TransformKeyframe): number {
        const track = currentTrack.value
        if (!track) return -1

        // 找到正确的插入位置
        let insertIdx = track.keyframes.findIndex(k => k.time > kf.time)
        if (insertIdx === -1) insertIdx = track.keyframes.length

        track.keyframes.splice(insertIdx, 0, kf)
        selectedKeyframeIndex.value = insertIdx
        return insertIdx
    }

    /**
     * 删除指定关键帧（保留最少 2 帧约束）
     */
    function removeKeyframe(index: number) {
        // 支持 transform 和 visibility 轨道
        const trackType = currentTrackAny.value?.trackType
        const kfs = activeKeyframes.value
        if (kfs.length <= 2) return
        if (index < 0 || index >= kfs.length) return

        if (trackType === 'transform') {
            currentTrack.value!.keyframes.splice(index, 1)
        } else if (trackType === 'visibility') {
            currentVisibilityTrack.value!.keyframes.splice(index, 1)
        } else {
            return
        }

        // 调整选中索引
        if (selectedKeyframeIndex.value >= kfs.length - 1) {
            selectedKeyframeIndex.value = kfs.length - 2
        }
    }

    /**
     * v13 (Scheme B)：将关键帧拆分为 valueIn / valueOut
     * 初始 out 等于当前 valueIn 的同字段值，语义不变；用户随后可独立编辑。
     */
    function splitKeyframeAt(index: number): boolean {
        const trackType = currentTrackAny.value?.trackType
        if (trackType === 'transform') {
            const kf = currentTrack.value?.keyframes[index]
            if (!kf || kf.out) return false
            const out: NonNullable<TransformKeyframe['out']> = {}
            if (kf.x !== undefined) out.x = kf.x
            if (kf.y !== undefined) out.y = kf.y
            if (kf.scaleX !== undefined) out.scaleX = kf.scaleX
            if (kf.scaleY !== undefined) out.scaleY = kf.scaleY
            if (kf.rotation !== undefined) out.rotation = kf.rotation
            if (kf.flipX !== undefined) out.flipX = kf.flipX
            kf.out = out
            return true
        }
        if (trackType === 'visibility') {
            const kf = currentVisibilityTrack.value?.keyframes[index]
            if (!kf || kf.out) return false
            const out: NonNullable<VisibilityKeyframe['out']> = {}
            if (kf.alpha !== undefined) out.alpha = kf.alpha
            kf.out = out
            return true
        }
        return false
    }

    /**
     * v13 (Scheme B)：合并关键帧的 valueIn / valueOut（丢弃 out，保留 valueIn）
     */
    function mergeKeyframeAt(index: number): boolean {
        const trackType = currentTrackAny.value?.trackType
        if (trackType === 'transform') {
            const kf = currentTrack.value?.keyframes[index]
            if (!kf?.out) return false
            delete kf.out
            return true
        }
        if (trackType === 'visibility') {
            const kf = currentVisibilityTrack.value?.keyframes[index]
            if (!kf?.out) return false
            delete kf.out
            return true
        }
        return false
    }

    /**
     * v13 (Scheme B)：判定关键帧是否处于“拆分”状态（存在至少一个 out 字段）
     */
    function isKeyframeStructurallySplit(
        kf: TransformKeyframe | VisibilityKeyframe | undefined | null,
    ): boolean {
        if (!kf?.out) return false
        return Object.keys(kf.out).length > 0
    }

    /**
     * 更新关键帧的 valueOut 字段（自动确保 out 对象存在）
     * value 为 undefined 表示回退到顶层 valueIn（即删除该 out 字段）
     */
    function updateKeyframeOut(
        index: number,
        field: keyof NonNullable<TransformKeyframe['out']>,
        value: number | boolean | undefined,
    ): void {
        const trackType = currentTrackAny.value?.trackType
        if (trackType === 'transform') {
            const kf = currentTrack.value?.keyframes[index]
            if (!kf) return
            kf.out ??= {}
            if (value === undefined) {
                delete (kf.out as Record<string, unknown>)[field]
                if (Object.keys(kf.out).length === 0) delete kf.out
            } else {
                (kf.out as Record<string, unknown>)[field] = value
            }
        }
    }

    function updateVisibilityKeyframeOut(
        index: number,
        value: number | undefined,
    ): void {
        const kf = currentVisibilityTrack.value?.keyframes[index]
        if (!kf) return
        kf.out ??= {}
        if (value === undefined) {
            delete kf.out.alpha
            if (Object.keys(kf.out).length === 0) delete kf.out
        } else {
            kf.out.alpha = value
        }
    }

    /**
     * 复制选中的关键帧到播放头位置
     */
    function duplicateKeyframeToPlayhead(): number {
        const track = currentTrackAny.value
        if (!track || selectedKeyframeIndex.value < 0) return -1

        if (track.trackType === 'transform') {
            const kf = currentTrack.value?.keyframes[selectedKeyframeIndex.value]
            if (!kf) return -1

            const newKf: TransformKeyframe = {
                ...(JSON.parse(JSON.stringify(kf)) as TransformKeyframe),
                time: playheadPosition.value,
            }
            return insertKeyframeSorted(newKf)
        }

        if (track.trackType === 'visibility') {
            const kf = currentVisibilityTrack.value?.keyframes[selectedKeyframeIndex.value]
            if (!kf) return -1

            const newKf: VisibilityKeyframe = {
                ...(JSON.parse(JSON.stringify(kf)) as VisibilityKeyframe),
                time: playheadPosition.value,
            }
            const visibilityTrack = currentVisibilityTrack.value
            if (!visibilityTrack) return -1
            let insertIdx = visibilityTrack.keyframes.findIndex(item => item.time > newKf.time)
            if (insertIdx === -1) insertIdx = visibilityTrack.keyframes.length
            visibilityTrack.keyframes.splice(insertIdx, 0, newKf)
            selectedKeyframeIndex.value = insertIdx
            return insertIdx
        }

        return -1
    }

    /**
     * 重置选中的关键帧为默认值
     */
    function resetKeyframe(index: number) {
        const kf = currentTrack.value?.keyframes[index]
        if (!kf) return
        updateKeyframe(index, {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
        })
        // Clear flipX separately since undefined is not assignable with exactOptionalPropertyTypes
        if (kf.flipX !== undefined) delete kf.flipX
    }

    // ===== 复制 / 粘贴 =====

    /** 关键帧剪贴板 */
    let keyframeClipboard:
        | { trackType: 'transform'; keyframe: TransformKeyframe }
        | { trackType: 'visibility'; keyframe: VisibilityKeyframe }
        | null = null

    /** 剪贴板是否有内容（响应式，供 UI 禁用/启用「粘贴」按钮） */
    const hasKeyframeClipboard = ref(false)

    /** 剪贴板中的关键帧类型（供 UI 判断当前轨道是否允许粘贴） */
    const keyframeClipboardType = ref<'transform' | 'visibility' | null>(null)

    function canPasteKeyframeToCurrentTrack(): boolean {
        const trackType = currentTrackAny.value?.trackType
        if (!keyframeClipboard || !trackType) return false
        return keyframeClipboard.trackType === trackType
    }

    /**
     * 复制选中的关键帧到剪贴板
     */
    function copyKeyframe() {
        const track = currentTrackAny.value
        if (track?.trackType === 'transform') {
            const kf = currentTrack.value?.keyframes[selectedKeyframeIndex.value]
            if (!kf) return
            keyframeClipboard = {
                trackType: 'transform',
                keyframe: JSON.parse(JSON.stringify(kf)) as TransformKeyframe,
            }
            hasKeyframeClipboard.value = true
            keyframeClipboardType.value = 'transform'
        } else if (track?.trackType === 'visibility') {
            const kf = currentVisibilityTrack.value?.keyframes[selectedKeyframeIndex.value]
            if (!kf) return
            keyframeClipboard = {
                trackType: 'visibility',
                keyframe: JSON.parse(JSON.stringify(kf)) as VisibilityKeyframe,
            }
            hasKeyframeClipboard.value = true
            keyframeClipboardType.value = 'visibility'
        }
    }

    /**
     * 将剪贴板中的关键帧粘贴到播放头位置
     * @returns 插入后的索引，无剪贴板内容返回 -1
     */
    function pasteKeyframe(): number {
        const clipboard = keyframeClipboard
        if (!clipboard || !canPasteKeyframeToCurrentTrack()) return -1
        if (clipboard.trackType === 'transform') {
            const newKf: TransformKeyframe = {
                ...(JSON.parse(JSON.stringify(clipboard.keyframe)) as TransformKeyframe),
                time: playheadPosition.value,
            }
            return insertKeyframeSorted(newKf)
        }

        const track = currentVisibilityTrack.value
        if (!track) return -1
        const newKf: VisibilityKeyframe = {
            ...(JSON.parse(JSON.stringify(clipboard.keyframe)) as VisibilityKeyframe),
            time: playheadPosition.value,
        }
        let insertIdx = track.keyframes.findIndex(k => k.time > newKf.time)
        if (insertIdx === -1) insertIdx = track.keyframes.length
        track.keyframes.splice(insertIdx, 0, newKf)
        selectedKeyframeIndex.value = insertIdx
        return insertIdx
    }

    function canDuplicateKeyframeToPlayhead(): boolean {
        const track = currentTrackAny.value
        if (!track || selectedKeyframeIndex.value < 0) return false
        return track.trackType === 'transform' || track.trackType === 'visibility'
    }

    /**
     * 查找指定时间点的关键帧索引（支持 transform 和 visibility 轨道）
     */
    function findKeyframeAtTime(time: number): number {
        const kfs = activeKeyframes.value
        for (let i = 0; i < kfs.length; i++) {
            if (Math.abs((kfs[i]?.time ?? -1) - time) < TIME_TOLERANCE) return i
        }
        return -1
    }

    // ===== 评估 =====

    /**
     * 评估指定时间点的变换输出
     */
    function evaluateAtTime(time: number): TransformTrackOutput | null {
        const track = currentTrack.value
        if (!track) return null
        return AnimationTrackEvaluator.evaluateTransform(track, time)
    }

    // ===== 画布交互 → 关键帧写入 =====

    /** `commitTransformAtPlayhead` 的返回状态 */
    type CommitTransformResult =
        /** 已更新播放头位置上已存在的关键帧 */
        | { status: 'updated'; index: number }
        /** 空轨道 — 自动创建了第一个关键帧 */
        | { status: 'created'; index: number }
        /** 轨道不存在或类型不匹配（未写入） */
        | { status: 'no-track' }
        /** 轨道已有关键帧，但播放头不在任何关键帧上 — 不创建新帧，由调用方还原画布 */
        | { status: 'skipped-no-keyframe-at-playhead' }

    /**
     * 画布拖拽/缩放/旋转结束后，将变换差值写入当前播放头位置的关键帧。
     *
     * 行为（v22 起）：
     * - 若当前时间点已存在关键帧：更新该帧。
     * - 若轨道尚无任何关键帧：创建第一个关键帧（建立初始姿态）。
     * - 若轨道已有关键帧但播放头不在任何关键帧上：**不会自动创建新帧**。
     *   调用方应将画布还原到插值姿态，并提示用户先显式添加关键帧。
     *
     * @param values 关键帧空间的差值（相对于基准姿态）
     * @returns 本次提交的结果，调用方可据此决定是否需要还原画布 / 提示用户
     */
    function commitTransformAtPlayhead(values: Partial<TransformKeyframe>): CommitTransformResult {
        return commitAutoKey(values)
    }

    function commitAutoKey(finalValues: Partial<TransformKeyframe>): CommitTransformResult {
        const track = currentTrack.value
        if (!track) return { status: 'no-track' }

        const time = playheadPosition.value
        const existingIdx = findKeyframeAtTime(time)

        if (existingIdx >= 0) {
            // 更新已有关键帧
            Object.assign(track.keyframes[existingIdx]!, finalValues)
            return { status: 'updated', index: existingIdx }
        }

        if (track.keyframes.length === 0) {
            // 空轨道：创建第一帧（建立初始姿态）
            const interpolated = AnimationTrackEvaluator.evaluateTransform(track, time)
            const newKf: TransformKeyframe = {
                time,
                x: interpolated.x,
                y: interpolated.y,
                scaleX: interpolated.scaleX,
                scaleY: interpolated.scaleY,
                rotation: interpolated.rotation,
                ...(interpolated.flipX !== undefined ? { flipX: interpolated.flipX } : {}),
                ...finalValues,
            }
            const idx = insertKeyframeSorted(newKf)
            return { status: 'created', index: idx }
        }

        // 轨道已有关键帧但播放头不在任何帧上：不静默创建，交由调用方还原画布并提示
        return { status: 'skipped-no-keyframe-at-playhead' }
    }

    // ===== 播放控制 =====

    let animationFrameId: number | null = null
    let lastTimestamp: number | null = null

    function play() {
        if (isPlaying.value) return
        isPlaying.value = true
        lastTimestamp = null
        animationFrameId = requestAnimationFrame(playbackTick)
    }

    function pause() {
        isPlaying.value = false
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }
    }

    function togglePlay() {
        if (isPlaying.value) pause()
        else play()
    }

    function playbackTick(timestamp: number) {
        if (!isPlaying.value) return

        if (lastTimestamp !== null) {
            const deltaMs = timestamp - lastTimestamp
            const duration = trackDuration.value
            if (duration > 0) {
                const progressDelta = deltaMs / duration
                let newProgress = playheadPosition.value + progressDelta

                if (newProgress >= 1) {
                    if (loopPlayback.value) {
                        newProgress = newProgress % 1
                    } else {
                        newProgress = 1
                        pause()
                    }
                }

                playheadPosition.value = newProgress
            }
        }

        lastTimestamp = timestamp
        if (isPlaying.value) {
            animationFrameId = requestAnimationFrame(playbackTick)
        }
    }

    /**
     * 跳转到指定时间
     */
    function seekTo(time: number) {
        playheadPosition.value = Math.max(0, Math.min(1, time))

        // 如果恰好在关键帧上，选中它
        const idx = findKeyframeAtTime(playheadPosition.value)
        if (idx >= 0) {
            selectedKeyframeIndex.value = idx
        }
    }

    /**
     * 跳到上一个关键帧（支持 transform 和 visibility 轨道）
     */
    function seekPrevKeyframe() {
        const kfs = activeKeyframes.value
        for (let i = kfs.length - 1; i >= 0; i--) {
            const kf = kfs[i]
            if (kf && kf.time < playheadPosition.value - TIME_TOLERANCE) {
                seekTo(kf.time)
                selectedKeyframeIndex.value = i
                return
            }
        }
        // 已在最前，跳到 0
        seekTo(0)
    }

    /**
     * 跳到下一个关键帧（支持 transform 和 visibility 轨道）
     */
    function seekNextKeyframe() {
        const kfs = activeKeyframes.value
        for (let i = 0; i < kfs.length; i++) {
            const kf = kfs[i]
            if (kf && kf.time > playheadPosition.value + TIME_TOLERANCE) {
                seekTo(kf.time)
                selectedKeyframeIndex.value = i
                return
            }
        }
        // 已在最后，跳到 1
        seekTo(1)
    }

    // ===== Track 设置操作 =====

    /** 切换当前编辑的 track（支持任意轨道类型） */
    function selectTrack(index: number) {
        if (index < 0 || index >= animationDef.tracks.length) return
        currentTrackIndex.value = index
        selectedKeyframeIndex.value = 0
        playheadPosition.value = 0
    }

    /** 取消所有选中（返回动画级） */
    function deselectAll() {
        currentTrackIndex.value = -1
        selectedKeyframeIndex.value = -1
    }

    /** 仅选中轨道（不选中关键帧） */
    function selectTrackOnly(index: number) {
        if (index < 0 || index >= animationDef.tracks.length) return
        currentTrackIndex.value = index
        selectedKeyframeIndex.value = -1
    }

    /** 更新轨道 pivot */
    function updatePivot(pivot: { x: number; y: number }) {
        const track = currentTrack.value
        if (!track) return
        track.pivot = { ...pivot }
    }

    /** 清除轨道自定义 pivot，回退到对象默认变换点 */
    function clearPivot() {
        const track = currentTrack.value
        if (!track) return
        delete track.pivot
    }

    /** 更新轨道 easing（支持 transform 和 visibility 轨道） */
    function updateEasing(easing: string) {
        const track = currentTrack.value ?? currentVisibilityTrack.value
        if (!track) return
        if (easing) {
            track.easing = easing as EasingType
        } else {
            delete track.easing
        }
    }

    /** 更新动画循环设置 */
    function updateLoop(loop: boolean) {
        animationDef.loop = loop
    }

    /** 更新动画填充模式 */
    function updateFillMode(fillMode: 'none' | 'forwards') {
        animationDef.fillMode = fillMode
    }

    /** 更新动画默认播放方式 */
    function updateTimingMode(timingMode: AnimationTimingMode) {
        animationDef.timingMode = timingMode
    }

    /** 更新轨道时长（支持 transform 和 visibility 轨道） */
    function updateDuration(duration: number | 'auto') {
        const track = currentTrack.value ?? currentVisibilityTrack.value
        if (!track) return
        track.duration = duration
    }

    // ===== 轨道 CRUD =====

    /** 添加轨道 */
    function addTrack(track: AnimationTrack): number {
        animationDef.tracks.push(track)
        const idx = animationDef.tracks.length - 1
        currentTrackIndex.value = idx
        selectedKeyframeIndex.value = 0
        return idx
    }

    /** 删除轨道 */
    function removeTrack(index: number) {
        if (index < 0 || index >= animationDef.tracks.length) return
        animationDef.tracks.splice(index, 1)
        // 调整选中索引
        if (currentTrackIndex.value >= animationDef.tracks.length) {
            currentTrackIndex.value = animationDef.tracks.length - 1
        }
        if (animationDef.tracks.length === 0) {
            currentTrackIndex.value = -1
            selectedKeyframeIndex.value = -1
        }
    }

    // ===== Visibility 操作 =====

    /** 评估指定时间点的可见性输出 */
    function evaluateVisibilityAtTime(time: number): VisibilityTrackOutput | null {
        const track = currentVisibilityTrack.value
        if (!track) return null
        return AnimationTrackEvaluator.evaluateVisibility(track, time)
    }

    /** 在播放头位置添加可见性关键帧 */
    function addVisibilityKeyframeAtPlayhead(): number {
        const track = currentVisibilityTrack.value
        if (!track) return -1

        const time = playheadPosition.value
        // 检查该时间点是否已有关键帧
        const existing = track.keyframes.findIndex(k => Math.abs(k.time - time) < TIME_TOLERANCE)
        if (existing >= 0) {
            selectedKeyframeIndex.value = existing
            return existing
        }

        const interpolated = AnimationTrackEvaluator.evaluateVisibility(track, time)
        const newKf: VisibilityKeyframe = {
            time,
            alpha: interpolated.alpha,
        }

        let insertIdx = track.keyframes.findIndex(k => k.time > newKf.time)
        if (insertIdx === -1) insertIdx = track.keyframes.length
        track.keyframes.splice(insertIdx, 0, newKf)
        selectedKeyframeIndex.value = insertIdx
        return insertIdx
    }

    /** 更新可见性关键帧 */
    function updateVisibilityKeyframe(index: number, values: Partial<VisibilityKeyframe>) {
        const track = currentVisibilityTrack.value
        if (!track || index < 0 || index >= track.keyframes.length) return
        const kf = track.keyframes[index]
        if (!kf) return
        Object.assign(kf, values)
        if ('time' in values) {
            track.keyframes.sort((a, b) => a.time - b.time)
            const newIdx = track.keyframes.findIndex(k => k === kf)
            if (newIdx >= 0) selectedKeyframeIndex.value = newIdx
        }
    }

    // ===== Effect 操作 =====

    /** 更新 Effect 轨道的特效参数 */
    function updateEffectParams(params: EffectParams) {
        const track = currentEffectTrack.value
        if (!track) return
        track.effectParams = params
    }

    // ===== FrameSequence 操作 =====

    /** 更新 FrameSequence 轨道参数 */
    function updateFrameSequenceTrack(values: Partial<Pick<FrameSequenceTrack, 'fps' | 'loop' | 'assetId'>>) {
        const track = currentFrameSequenceTrack.value
        if (!track) return
        if (values.fps !== undefined) track.fps = values.fps
        if (values.loop !== undefined) track.loop = values.loop
        if (values.assetId !== undefined) track.assetId = values.assetId
    }

    /** 设置/清除运行时动态轨道时长覆写 */
    function setTrackDurationOverride(durationMs: number | null) {
        trackDurationOverrideMs.value = durationMs
    }

    // ===== 重置（切换动画） =====

    function resetAnimation(newAnim: AnimationDefinition) {
        pause()
        const fresh = JSON.parse(JSON.stringify(newAnim)) as AnimationDefinition
        // 原地替换 reactive 对象的所有字段
        for (const key of Object.keys(animationDef) as (keyof AnimationDefinition)[]) {
            if (!(key in fresh)) delete (animationDef as Record<string, unknown>)[key]
        }
        Object.assign(animationDef, fresh)
        // 重置脏状态基线为新动画的快照，防止误报"已修改"
        initialSnapshot = JSON.stringify(fresh)
        trackDurationOverrideMs.value = null
        // 重置播放头和选中状态
        playheadPosition.value = 0
        if (newAnim.tracks.length === 0) {
            // 空动画：不选中任何轨道/关键帧
            currentTrackIndex.value = -1
            selectedKeyframeIndex.value = -1
        } else {
            const firstTransformIdx = newAnim.tracks.findIndex(t => t.trackType === 'transform')
            currentTrackIndex.value = firstTransformIdx >= 0 ? firstTransformIdx : 0
            selectedKeyframeIndex.value = 0
        }
    }

    function markSaved() {
        initialSnapshot = JSON.stringify(animationDef)
    }

    // ===== 清理 =====

    function dispose() {
        pause()
    }

    // ===== 导出 =====

    return {
        // 数据
        animationDef,
        currentTrackIndex,
        currentTrack,
        currentTrackAny,
        currentVisibilityTrack,
        allTracks,
        transformTracks,
        keyframes,
        activeKeyframes,
        selectedKeyframeIndex,
        selectedKeyframe,
        playheadPosition,
        autoKeyEnabled,
        isPlaying,
        loopPlayback,
        trackDuration,
        hasUnsavedChanges,
        currentOutput,
        selectionMode,
        isKeyframable,

        // 关键帧操作
        updateKeyframe,
        addKeyframeAtPlayhead,
        removeKeyframe,
        splitKeyframeAt,
        mergeKeyframeAt,
        isKeyframeStructurallySplit,
        updateKeyframeOut,
        updateVisibilityKeyframeOut,
        duplicateKeyframeToPlayhead,
        canDuplicateKeyframeToPlayhead,
        resetKeyframe,
        copyKeyframe,
        pasteKeyframe,
        hasKeyframeClipboard,
        keyframeClipboardType,
        canPasteKeyframeToCurrentTrack,
        sortKeyframes,
        findKeyframeAtTime,

        // 评估
        evaluateAtTime,

        // 画布交互
        commitTransformAtPlayhead,

        // 播放控制
        play,
        pause,
        togglePlay,
        seekTo,
        seekPrevKeyframe,
        seekNextKeyframe,

        // Track 设置
        selectTrack,
        selectTrackOnly,
        deselectAll,
        updatePivot,
        clearPivot,
        updateEasing,
        updateDuration,
        updateLoop,
        updateFillMode,
        updateTimingMode,

        // 轨道 CRUD
        addTrack,
        removeTrack,

        // Visibility 操作
        evaluateVisibilityAtTime,
        addVisibilityKeyframeAtPlayhead,
        updateVisibilityKeyframe,

        // Effect 操作
        currentEffectTrack,
        updateEffectParams,

        // FrameSequence 操作
        currentFrameSequenceTrack,
        updateFrameSequenceTrack,
        setTrackDurationOverride,

        // 切换动画
        resetAnimation,
        markSaved,

        // 清理
        dispose,
    }
}

export type AnimationEditContext = ReturnType<typeof useAnimationEdit>
