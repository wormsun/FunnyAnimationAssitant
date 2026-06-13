/**
 * Animation Player (v11.0)
 * Animation 播放器，负责解析 AnimationDefinition 并驱动播放
 */

import type {
    AnimationDefinition,
    AnimationOutput,
    AnimationPlayParams,
    AnimationPlayState,
} from '@/types/animation'

import { AnimationTrackEvaluator, AUTO_DURATION_MARKER, mergeTrackOutputs } from './AnimationTrackEvaluator'

/**
 * Animation 播放器实例
 */
export class AnimationPlayer {
    /** 当前播放的 Animation 定义 */
    private definition: AnimationDefinition | null = null

    /** 播放状态 */
    private _state: AnimationPlayState = 'stopped'

    /** 归一化进度 (0-1) */
    private _progress = 0

    /** 播放速度 */
    private _speed = 1.0

    /** 是否循环 */
    private _loop = false

    /** Animation 总时长 (ms) */
    private _duration = 0

    /** v12.x: Auto Duration 运行时注入的时长 (ms) */
    private _runtimeDuration: number | undefined = undefined

    /** 更新回调 */
    private onUpdateCallback: ((output: AnimationOutput) => void) | null = null

    /** v11.2: 停止回调（用于恢复静止帧等操作） */
    private onStopCallback: ((definition: AnimationDefinition) => void) | null = null

    /** v11.5: 循环回调 */
    private onLoopCallback: ((definition: AnimationDefinition) => void) | null = null



    /**
     * 构造函数
     * @param onUpdate 可选的更新回调
     */
    constructor(onUpdate?: (output: AnimationOutput) => void) {
        if (onUpdate) {
            this.onUpdateCallback = onUpdate
        }
    }

    // ===== 公共访问器 =====

    get state(): AnimationPlayState {
        return this._state
    }

    get progress(): number {
        return this._progress
    }

    get speed(): number {
        return this._speed
    }

    get loop(): boolean {
        return this._loop
    }

    get duration(): number {
        return this._duration
    }

    get isPlaying(): boolean {
        return this._state === 'playing'
    }

    get isPaused(): boolean {
        return this._state === 'paused'
    }

    get isFilled(): boolean {
        return this._state === 'filled'
    }

    get isStopped(): boolean {
        return this._state === 'stopped'
    }

    get currentAnimation(): AnimationDefinition | null {
        return this.definition
    }

    // ===== 控制方法 =====

    /**
     * 播放 Animation
     * @param definition Animation 定义
     * @param params 可选的播放参数
     */
    play(
        definition: AnimationDefinition,
        params?: AnimationPlayParams,
    ): void {
        this.definition = definition

        // v12.x: 存储 runtimeDuration 用于 Auto Duration 解析
        this._runtimeDuration = params?.runtimeDuration
        this._duration = this.calculateDuration(definition)

        // 应用播放参数
        this._speed = params?.speed ?? 1.0
        this._loop = params?.loop ?? definition.loop

        // 是否从头开始
        if (params?.reset !== false) {
            this._progress = 0
        }

        this._state = 'playing'
    }

    /**
     * 停止播放
     * v11.2: 停止时触发 onStop 回调
     */
    stop(): void {
        if (this.onStopCallback && this.definition && this._state !== 'filled') {
            this.onStopCallback(this.definition)
        }

        this._state = 'stopped'
        this._progress = 0
    }

    /**
     * 暂停播放
     */
    pause(): void {
        if (this._state === 'playing') {
            this._state = 'paused'
        }
    }

    /**
     * 恢复播放
     */
    resume(): void {
        if (this._state === 'paused') {
            this._state = 'playing'
        }
    }

    /**
     * 设置更新回调
     */
    setOnUpdate(callback: (output: AnimationOutput) => void): void {
        this.onUpdateCallback = callback
    }

    /**
     * v11.2: 设置停止回调
     * 回调在动画停止时触发，可用于恢复静止帧等操作
     */
    setOnStop(callback: (definition: AnimationDefinition) => void): void {
        this.onStopCallback = callback
    }

    /**
     * v11.5: 设置循环回调
     */
    setOnLoop(callback: (definition: AnimationDefinition) => void): void {
        this.onLoopCallback = callback
    }

    /**
     * 跳转到指定进度
     * @param progress 归一化进度 (0-1)
     */
    seek(progress: number): void {
        this._progress = Math.max(0, Math.min(1, progress))
    }

    /**
     * 设置播放速度
     */
    setSpeed(speed: number): void {
        this._speed = Math.max(0.1, Math.min(10, speed))
    }

    /**
     * 设置是否循环
     */
    setLoop(loop: boolean): void {
        this._loop = loop
    }

    // ===== 更新方法 =====

    /**
     * 每帧更新
     * 由渲染循环调用
     * @param deltaTime 距上一帧的时间 (ms)
     * @returns 当前帧的输出状态
     */
    update(deltaTime: number): AnimationOutput | null {
        if (!this.definition) {
            return null
        }

        if (this._state === 'filled') {
            const output = this.evaluate(1)
            if (this.onUpdateCallback) {
                this.onUpdateCallback(output)
            }
            return output
        }

        if (this._state !== 'playing') {
            return null
        }

        // 更新进度
        if (this._duration > 0) {
            const progressDelta = (deltaTime * this._speed) / this._duration
            this._progress += progressDelta

            // 处理播放完成
            if (this._progress >= 1) {
                if (this._loop) {
                    this._progress = this._progress % 1

                    // v11.5: 触发循环回调
                    if (this.onLoopCallback && this.definition) {
                        this.onLoopCallback(this.definition)
                    }
                } else {
                    this._progress = 1
                    const fillMode = this.definition.type === 'track'
                        ? this.definition.fillMode ?? 'none'
                        : 'none'
                    this._state = fillMode === 'forwards' ? 'filled' : 'stopped'
                    if (this.onStopCallback && this.definition) {
                        this.onStopCallback(this.definition)
                    }
                }
            }
        }

        // 计算输出
        const output = this.evaluate(this._progress)

        // 触发回调
        if (this.onUpdateCallback) {
            this.onUpdateCallback(output)
        }

        return output
    }

    /**
     * 获取当前帧的输出（不更新进度）
     */
    getCurrentOutput(): AnimationOutput | null {
        if (!this.definition) {
            return null
        }
        return this.evaluate(this._progress)
    }

    // ===== 私有方法 =====

    /**
     * 计算 Animation 总时长
     */
    private calculateDuration(definition: AnimationDefinition): number {
        if (definition.type !== 'track') return 1000
        let maxDuration = 0

        // 计算轨道时长
        for (const track of definition.tracks) {
            const trackDuration = AnimationTrackEvaluator.getTrackDuration(track)
            // v12.x: AUTO_DURATION_MARKER 使用 runtimeDuration 替代
            const resolvedDuration = trackDuration === AUTO_DURATION_MARKER
                ? (this._runtimeDuration ?? 1000)
                : trackDuration
            if (resolvedDuration !== Infinity && resolvedDuration > maxDuration) {
                maxDuration = resolvedDuration
            }
        }

        return maxDuration || 1000
    }

    /**
     * 求值当前进度的所有轨道
     * v11.2: 每个轨道使用独立的进度（基于轨道自身的 duration）
     */
    private evaluate(progress: number): AnimationOutput {
        if (!this.definition) {
            return {
                transforms: [],
                visibilities: [],
                effects: [],
            }
        }

        // v11.2: 当前已播放时间 (ms)
        const elapsedTime = progress * this._duration

        // 计算主轨道输出
        // v11.2: 每个轨道使用独立的进度
        // v11.52: 过滤掉 frame_sequence 轨道，帧动画直接使用 AnimatedSprite.play()
        if (this.definition.type !== 'track') {
            return { transforms: [], visibilities: [], effects: [] }
        }
        const evaluableTracks = this.definition.tracks.filter(
            track => track.trackType !== 'frame_sequence'
        )
        const trackOutputs = evaluableTracks.map(track => {
            const rawTrackDuration = AnimationTrackEvaluator.getTrackDuration(track)
            // v12.x: AUTO_DURATION_MARKER 使用 runtimeDuration 替代
            const trackDuration = rawTrackDuration === AUTO_DURATION_MARKER
                ? (this._runtimeDuration ?? 1000)
                : rawTrackDuration

            // 计算轨道独立进度
            let trackProgress: number
            if (trackDuration === Infinity || trackDuration <= 0) {
                // 无限时长或无效时长，使用全局进度
                trackProgress = progress
            } else if (trackDuration >= this._duration) {
                // 轨道时长 >= 总时长，使用全局进度
                trackProgress = progress
            } else {
                // v11.2: 轨道时长 < 总时长
                if (this._loop) {
                    // Animation 循环时，轨道也循环播放
                    trackProgress = (elapsedTime % trackDuration) / trackDuration
                } else {
                    // Animation 非循环时，轨道播完后停留在最终状态
                    trackProgress = Math.min(1, elapsedTime / trackDuration)
                }
            }

            // v11.70: 传递 trackDuration 用于进度驱动的特效计算
            const effectiveDuration = trackDuration === Infinity ? this._duration : trackDuration
            return AnimationTrackEvaluator.evaluate(track, trackProgress, effectiveDuration)
        })

        return mergeTrackOutputs(trackOutputs)
    }


}

/**
 * Animation Player 管理器
 * 用于管理多个播放器实例
 */
export class AnimationPlayerManager {
    private players = new Map<string, AnimationPlayer>()

    /**
     * 获取或创建播放器
     */
    getOrCreate(id: string): AnimationPlayer {
        let player = this.players.get(id)
        if (!player) {
            player = new AnimationPlayer()
            this.players.set(id, player)
        }
        return player
    }

    /**
     * 获取播放器
     */
    get(id: string): AnimationPlayer | undefined {
        return this.players.get(id)
    }

    /**
     * 移除播放器
     */
    remove(id: string): boolean {
        const player = this.players.get(id)
        if (player) {
            player.stop()
            this.players.delete(id)
            return true
        }
        return false
    }

    /**
     * 更新所有播放器
     */
    updateAll(deltaTime: number): Map<string, AnimationOutput | null> {
        const outputs = new Map<string, AnimationOutput | null>()
        for (const [id, player] of this.players) {
            outputs.set(id, player.update(deltaTime))
        }
        return outputs
    }

    /**
     * 停止所有播放器
     */
    stopAll(): void {
        for (const player of this.players.values()) {
            player.stop()
        }
    }

    /**
     * 清空所有播放器
     */
    clear(): void {
        this.stopAll()
        this.players.clear()
    }

    /**
     * 获取所有播放器 ID
     */
    getAllIds(): string[] {
        return Array.from(this.players.keys())
    }

    /**
     * 获取播放中的播放器数量
     */
    getPlayingCount(): number {
        let count = 0
        for (const player of this.players.values()) {
            if (player.isPlaying) {
                count++
            }
        }
        return count
    }
}

/**
 * 创建 Animation 播放器
 */
export function createAnimationPlayer(onUpdate?: (output: AnimationOutput) => void): AnimationPlayer {
    return new AnimationPlayer(onUpdate)
}

/**
 * 创建 Animation 播放器管理器
 */
export function createAnimationPlayerManager(): AnimationPlayerManager {
    return new AnimationPlayerManager()
}
