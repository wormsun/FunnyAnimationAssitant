/** 
  * WebAudioKit - 一个现代化的 Web Audio API 封装库 
  *  
  * 特性： 
  * - 自动处理 AudioContext 状态 (Suspend/Resume) 
  * - 资源预加载与缓存 
  * - 完美的淡入淡出算法 (Fade In: Exponential, Fade Out: Linear) 
  * - 支持暂停/恢复 (自动记录 Offset) 
  */ 
  
 export interface PlayOptions { 
   volume?: number;      // 0.0 ~ 1.0 (默认 1.0) 
   loop?: boolean;       // 是否循环 (默认 false) 
   fadeIn?: number;      // 淡入时长 (秒) 
   startOffset?: number; // 起始偏移 (秒) 
 } 
  
 export interface AudioInstance { 
   id: string; 
   stop: (fadeOutDuration?: number) => void; 
   pause: () => void; 
   resume: () => void; 
   setVolume: (val: number, rampTime?: number) => void; 
   seek: (time: number) => void; 
  isPlaying: boolean; 
  hasEnded: boolean;
  duration: number; // 音频总时长 
} 

class WebAudioKit { 
   private ctx: AudioContext | null = null; 
   private bufferCache = new Map<string, AudioBuffer>(); 
   // 存储活跃的播放实例，用于全剧控制 
   private activeInstances = new Map<string, InternalSoundInstance>(); 
  
   constructor() { 
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; 
    if (AudioContextClass) { 
      this.ctx = new AudioContext(); 
    } else { 
      console.warn('WebAudioKit: 当前浏览器不支持 Web Audio API'); 
    } 
  } 
  
   /** 
    * 初始化/恢复上下文 
    * 必须在用户点击事件中调用，以解锁浏览器的自动播放策略 
    */ 
   public async init(): Promise<void> { 
     if (!this.ctx) return; 
     if (this.ctx.state === 'suspended') { 
       await this.ctx.resume(); 
     } 
   } 
  
   /** 
    * 获取原生 Context (如果需要进行高级操作) 
    */ 
   public getContext(): AudioContext | null { 
     return this.ctx; 
   } 
  
   /** 
    * 加载音频资源 
    * @param url 音频地址 
    */ 
   public async load(url: string): Promise<AudioBuffer | null> { 
     if (!this.ctx) return null; 
      
     // 1. 检查缓存 
     if (this.bufferCache.has(url)) { 
       return this.bufferCache.get(url)!; 
     } 
  
     try { 
       // 2. Fetch 
       const response = await fetch(url); 
       const arrayBuffer = await response.arrayBuffer(); 
        
       // 3. Decode 
       const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer); 
       this.bufferCache.set(url, audioBuffer); 
       return audioBuffer; 
     } catch (err) { 
       console.error(`[WebAudioKit] 加载失败: ${url}`, err); 
       return null; 
     } 
   } 
  
   /** 
    * 播放音频 
    * @param url 音频地址 (必须先 load 或在此处自动 load) 
    * @param options 播放选项 
    * @returns AudioInstance 控制句柄 
    */ 
   public async play(url: string, options: PlayOptions = {}): Promise<AudioInstance | null> { 
     if (!this.ctx) return null; 
  
     // 确保资源已加载 
    let buffer = this.bufferCache.get(url); 
    buffer ??= (await this.load(url)) ?? undefined;
    if (!buffer) return null; 
  
     const id = Math.random().toString(36).substr(2, 9); 
     const instance = new InternalSoundInstance(this.ctx, buffer, options); 
      
     // 绑定清理事件 
     instance.onEnded = () => { 
       this.activeInstances.delete(id); 
     }; 
  
     this.activeInstances.set(id, instance); 
     instance.start(); 
  
     // 返回对外暴露的 API 
     return { 
       id, 
      duration: buffer.duration, 
      get isPlaying() { return instance.isPlaying; }, 
      get hasEnded() { return instance.hasEnded; },
      stop: (d) => instance.stop(d), 
      pause: () => instance.pause(), 
       resume: () => instance.resume(), 
       setVolume: (v, t) => instance.setVolume(v, t), 
       seek: (t) => instance.seek(t) 
     }; 
   } 
  
   /** 
   * 停止所有正在播放的声音 
   */ 
  public stopAll(fadeOutDuration = 0) { 
    this.activeInstances.forEach(inst => inst.stop(fadeOutDuration)); 
    this.activeInstances.clear(); 
  }

  /**
   * 卸载音频资源缓存
   */
  public unload(url: string) {
    if (this.bufferCache.has(url)) {
      this.bufferCache.delete(url);
    }
  }
} 
  
 /** 
  * 内部使用的声音实例类 
  * 封装了 SourceNode 和 GainNode 的生命周期 
  */ 
 class InternalSoundInstance { 
   private ctx: AudioContext; 
   private buffer: AudioBuffer; 
    
   private source: AudioBufferSourceNode | null = null; 
   private gain: GainNode | null = null; 
    
   // 状态追踪 
  private _isPlaying = false; 
  private _hasEnded = false;
  private _startTime = 0; // Context time when started 
  private _startOffset = 0; // Buffer offset 
   private _options: PlayOptions; 
    
   // 外部回调 
   public onEnded: (() => void) | null = null; 
  
   constructor(ctx: AudioContext, buffer: AudioBuffer, options: PlayOptions) { 
     this.ctx = ctx; 
     this.buffer = buffer; 
     this._options = { 
       volume: 1.0, 
       loop: false, 
       fadeIn: 0, 
       startOffset: 0, 
       ...options 
     }; 
     this._startOffset = this._options.startOffset ?? 0; 
   } 
  
   get isPlaying() { return this._isPlaying; } 
  get hasEnded() { return this._hasEnded; }

  /** 
   * 开始播放 (或重新创建节点播放) 
   */ 
   public start() { 
    if (this._isPlaying) return; 

    this._hasEnded = false;

    // 1. 创建节点 
    this.source = this.ctx.createBufferSource(); 
     this.source.buffer = this.buffer; 
     this.source.loop = !!this._options.loop; 
  
     this.gain = this.ctx.createGain(); 
      
     // 2. 连接图: Source -> Gain -> Destination 
     this.source.connect(this.gain); 
     this.gain.connect(this.ctx.destination); 
  
     // 3. 处理初始音量 / 淡入 
     const now = this.ctx.currentTime; 
     const targetVol = this._options.volume ?? 1.0; 
     const fadeIn = this._options.fadeIn ?? 0; 
  
     // 重置所有计划 
     this.gain.gain.cancelScheduledValues(now); 
  
     if (fadeIn > 0) { 
       // 指数淡入 (更自然) 
       this.gain.gain.setValueAtTime(0.001, now); 
       this.gain.gain.exponentialRampToValueAtTime(targetVol, now + fadeIn); 
     } else { 
       this.gain.gain.setValueAtTime(targetVol, now); 
     } 
  
     // 4. 开始播放 
     // 处理 Offset 循环的情况 
     let playOffset = this._startOffset; 
     if (this._options.loop) { 
         playOffset = playOffset % this.buffer.duration; 
     } 

     // 4.5 自动淡出 (仅针对非循环播放，防止结束时的爆音)
     if (!this._options.loop) {
        const bufferDuration = this.buffer.duration;
        const remainingDuration = bufferDuration - playOffset;
        const AUTO_FADE_OUT = 0.1; // 0.1s 淡出

        // 只有剩余时间足够才添加淡出 (且不与淡入冲突)
        if (remainingDuration > AUTO_FADE_OUT && remainingDuration > (fadeIn || 0) + AUTO_FADE_OUT) {
            const fadeOutStartTime = now + remainingDuration - AUTO_FADE_OUT;
            const endTime = now + remainingDuration;
            
            // 锁定当前音量值，准备淡出
            this.gain.gain.setValueAtTime(targetVol, fadeOutStartTime);
            // 线性淡出至微小值 (0.0001 避免完全为0可能带来的边缘问题)
            this.gain.gain.linearRampToValueAtTime(0.0001, endTime);
        }
     }
  
     this.source.start(now, playOffset); 
      
     // 5. 更新状态 
     this._startTime = now; 
     this._isPlaying = true; 
  
     // 6. 绑定原生结束事件 
     this.source.onended = () => { 
      // 只有非手动停止引发的 ended 才触发回调（比如自然播放结束） 
      // 手动 stop() 时我们会清理 source，onended 不再处理逻辑 
      if (this._isPlaying) { 
        this._isPlaying = false; 
        this._hasEnded = true;
        if (this.onEnded) this.onEnded(); 
      } 
    }; 
   } 
  
   /** 
    * 暂停 (本质是记录进度并停止) 
    */ 
   public pause() { 
     if (!this._isPlaying) return; 
      
     // 计算暂停时的进度 
     const elapsed = this.ctx.currentTime - this._startTime; 
     this._startOffset = (this._startOffset + elapsed) % this.buffer.duration; 
      
     this.stopNode(); // 仅停止节点，不触发 onEnded 清理 
     this._isPlaying = false; 
   } 
  
   /** 
    * 恢复 
    */ 
   public resume() { 
     if (this._isPlaying) return; 
     // 重新带入 options (不含 fade，通常 resume 不需要 fade 或需要很短的 fade) 
     // 这里简单处理，resume 默认无 fade in，防止断断续续 
     const resumeOpts = { ...this._options, fadeIn: 0.1 }; // 给一点微小的淡入防止爆音 
     this._options = resumeOpts; 
     this.start(); 
   } 
  
   /** 
    * 停止播放 
    * @param fadeOutDuration 淡出时长 (秒) 
    */ 
   public stop(fadeOutDuration = 0) { 
     if (!this._isPlaying || !this.gain || !this.source) return; 

     // 如果是循环播放且有淡出，我们需要特别处理
     // 因为循环播放的 source 节点不会自然结束，必须显式 stop
     if (this._options.loop && fadeOutDuration > 0) {
         // 取消循环，让其在淡出后停止
         this.source.loop = false;
     }

     if (fadeOutDuration > 0) { 
       // === 核心：最佳实践的淡出逻辑 === 
       const now = this.ctx.currentTime; 
        
       // 1. 取消未来的音量变化 
       this.gain.gain.cancelScheduledValues(now); 
        
       // 2. 锚定当前音量 (防止跳变) 
       this.gain.gain.setValueAtTime(this.gain.gain.value, now); 
        
       // 3. 【关键】使用线性渐变到 0 (Linear Ramp to 0) 
       // 指数渐变不能到 0，且在低音量处下降太快，线性渐变到 0 听感最干净 
       this.gain.gain.linearRampToValueAtTime(0, now + fadeOutDuration); 

       // 4. 在淡出结束后停止 Source 
       // 注意：这里不能使用 setTimeout，因为它不精确且不随 AudioContext 时间走 
       // 我们使用 source.stop(time) 的计划停止功能 
       try {
           this.source.stop(now + fadeOutDuration); 
       } catch(e) {
           void e;
       }
        
       // 稍微延迟一点清理，确保声音完全停止 
       // 增加延迟时间，确保 audio context 已经执行完 stop
       setTimeout(() => { 
         this.cleanup(); 
       }, (fadeOutDuration * 1000) + 200); 

     } else { 
       // 立即停止 
       // 如果已经在 fadeOut 过程中（即 scheduled stop），再次调用 stop 会抛错
       // 所以这里直接 stopNode，忽略错误，然后 disconnect
       this.stopNode(); 
       this.cleanup(); 
     } 
   } 
  
   /** 
    * 设置音量 
    */ 
   public setVolume(value: number, rampTime = 0.1) { 
     if (!this.gain) { 
         this._options.volume = value; // 如果未播放，更新配置 
         return; 
     } 
     const now = this.ctx.currentTime; 
     this.gain.gain.cancelScheduledValues(now); 
     this.gain.gain.setTargetAtTime(value, now, rampTime); 
     this._options.volume = value; 
   } 
  
   /** 
    * 跳转进度 
    */ 
   public seek(time: number) { 
     const wasPlaying = this._isPlaying; 
     if (wasPlaying) { 
       this.stopNode(); 
     } 
     this._startOffset = time; 
     if (wasPlaying) { 
       this.start(); 
     } 
   } 
  
   // --- 内部辅助 --- 
  
   private stopNode() { 
     if (this.source) { 
       try { 
         this.source.stop(); 
       } catch (e) { 
         // 忽略已停止的错误 
       } 
     } 
   } 
  
   private cleanup() { 
     this._isPlaying = false; 
     if (this.source) { 
         this.source.disconnect(); 
         this.source = null; 
     } 
     if (this.gain) { 
         this.gain.disconnect(); 
         this.gain = null; 
     } 
     if (this.onEnded) this.onEnded(); 
   } 
 } 
  
 // 导出单例 
 export const audioKit = new WebAudioKit(); 
