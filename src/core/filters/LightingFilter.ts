/**
 * LightingFilter — GPU 全局光照滤镜
 *
 * 基于 PIXI.Filter 的自定义 fragment shader，对场景整体施加环境光 + 点光源效果。
 * 支持最多 MAX_LIGHTS 个点光源，每个光源有独立的位置、颜色、强度和半径。
 *
 * v25.6: UV 空间坐标系（修复嵌套 filter 偏移问题）
 * - CPU 侧将光源坐标归一化到当前输出帧的局部 UV 空间 (0..1)
 * - Shader 侧通过 outputFrame/inputSize 还原出真实输入纹理中的 UV 采样范围
 * - 距离计算仍用 vInputSize 还原到像素尺度，保证衰减/半径正确
 * - 完全绕过 PIXI v7 FilterSystem 在处理嵌套 filter（GlowFilter）时
 *   内部修改 outputFrame.xy 导致 filterArea.zw 帧间漂移的问题
 *
 * 核心公式（恢复 + 加法光晕混合模型）：
 *   ① ambientBase = 原始颜色 × 环境光（暗场压暗）
 *   ② recovered  = mix(ambientBase, 原始颜色, recover)（纹理感知恢复）
 *   ③ glow       = Σ(光源颜色 × 几何衰减) × glowStrength（纹理无关加法光晕）
 *   ④ 最终颜色    = recovered + glow
 *
 * 光晕项确保光池形状由纯几何衰减决定，不被底层纹理颜色/亮度牵引。
 */
import * as PIXI from 'pixi.js'

const MAX_LIGHTS = 8

export interface LightSourceData {
  x: number       // 输出帧局部 UV 空间 (0..1)
  y: number       // 输出帧局部 UV 空间 (0..1)
  radius: number  // 输出帧局部 UV 空间（相对 outputFrame.height 归一化）
  color: [number, number, number]  // RGB 0~1
  intensity: number
  // Phase 3: 方向性
  directionMode: number       // 0=omni, 1=cone
  directionAngle: number      // 朝向角（弧度）
  coneHalfCos: number         // cos(coneAngle/2 * π/180)，CPU 预计算
  softness: number            // 边缘柔化带宽度（固定 0.35）
}

export interface AmbientLightData {
  color: [number, number, number]  // RGB 0~1
  intensity: number
}

const LIGHTING_FRAGMENT_SHADER = `
  precision mediump float;
  
  varying vec2 vTextureCoord;
  varying vec2 vInputSize;
  varying vec2 vTextureCoordScale;
  varying vec2 vOutputFrameSize;
  uniform sampler2D uSampler;
  uniform vec4 filterArea;
  
  #define MAX_LIGHTS 8
  uniform float uLightPosX[MAX_LIGHTS];
  uniform float uLightPosY[MAX_LIGHTS];
  uniform float uLightColorR[MAX_LIGHTS];
  uniform float uLightColorG[MAX_LIGHTS];
  uniform float uLightColorB[MAX_LIGHTS];
  uniform float uLightRadius[MAX_LIGHTS];
  uniform float uLightIntensity[MAX_LIGHTS];
  uniform int uLightCount;
  // Phase 3: 方向性 uniform
  uniform int uLightDirMode[MAX_LIGHTS];
  uniform float uLightDirAngle[MAX_LIGHTS];
  uniform float uLightConeHalfCos[MAX_LIGHTS];
  uniform float uLightSoftness[MAX_LIGHTS];
  
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform float uLightRecoverStrength;
  uniform float uLightTintStrength;
  uniform float uLightGlowStrength;
  uniform float uLightInnerRatio;
  uniform float uLightTintLumaInfluence;
  uniform float uLightCoreBias;
  uniform sampler2D uExemptMask;
  uniform int uHasExemptMask;
  
  void main(void) {
    vec4 color = texture2D(uSampler, vTextureCoord);
    if (color.a < 0.01) {
      gl_FragColor = color;
      return;
    }

    float exemptAlpha = 0.0;
    if (uHasExemptMask == 1) {
      // exempt mask 是按 filterArea / outputFrame 的完整局部区域渲染出来的，
      // 不能直接用输入纹理 UV(vTextureCoord) 采样。
      // 在 ScenePlayer 中 vTextureCoordScale 往往接近 1，所以问题不明显；
      // 但 FrameCapture 的离屏链路里 vTextureCoordScale 可能明显小于 1，
      // 直接采样会把 mask 取到错误区域，表现为 receiveLighting=false 对象的遮罩整体偏移。
      vec2 exemptUv = vec2(
        vTextureCoordScale.x > 0.0 ? vTextureCoord.x / vTextureCoordScale.x : 0.0,
        vTextureCoordScale.y > 0.0 ? vTextureCoord.y / vTextureCoordScale.y : 0.0
      );
      exemptAlpha = texture2D(uExemptMask, exemptUv).a;
    }

    // 环境暗场：先用环境光压暗场景，再由点光局部恢复原图亮度。
    // 这样亮区视觉中心更多由光场本身决定，而不是被底图纹理牵着走。
    vec3 ambientBase = color.rgb * uAmbientColor * uAmbientIntensity;
    float totalRecoverLight = 0.0;
    vec3 totalGlowTint = vec3(0.0);
    vec3 totalSurfaceTint = vec3(0.0);
    
    // v25.6: UV 空间距离计算（绕过 PIXI filterArea.zw 偏移漂移）
    // CPU 侧传入的是“输出帧局部 UV”(0..1)。
    // Shader 再乘以 vTextureCoordScale，把它投到当前输入纹理的真实 UV 空间，
    // 这样无论输入纹理是 720P / 1080P / 2K / 4K，都与 vTextureCoord 使用同一基准。
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      
      vec2 uvPos = vTextureCoord;
      vec2 uvLight = vec2(uLightPosX[i], uLightPosY[i]) * vTextureCoordScale;
      vec3 lightColor = vec3(uLightColorR[i], uLightColorG[i], uLightColorB[i]);
      
      // UV 空间差值，乘以 vInputSize 还原到像素距离
      vec2 delta = (uvPos - uvLight) * vInputSize;
      float dist = length(delta);
      // 半径由输出帧局部 UV 还原到输出帧像素，再与 delta 处于同一像素尺度
      float radius = uLightRadius[i] * vOutputFrameSize.y;
      
      // 柔光衰减
      float innerRadius = radius * uLightInnerRatio;
      float attenuation = 1.0 - smoothstep(innerRadius, radius, dist);

      // Phase 3: 方向性衰减（仅 cone 模式）
      if (uLightDirMode[i] == 1 && dist > 0.001) {
        vec2 dir = normalize(delta);
        vec2 forward = vec2(cos(uLightDirAngle[i]), sin(uLightDirAngle[i]));
        float angleCos = dot(dir, forward);
        float coneCos = uLightConeHalfCos[i];
        float softBand = uLightSoftness[i] * (1.0 - coneCos);
        float angularMask = smoothstep(coneCos - softBand, coneCos, angleCos);
        attenuation *= angularMask;
      }

      float contribution = uLightIntensity[i] * attenuation;
      totalRecoverLight += contribution;
      totalGlowTint += lightColor * contribution;
      totalSurfaceTint += lightColor * contribution;
    }

    float recover = clamp(totalRecoverLight * uLightRecoverStrength, 0.0, 1.0);
    float coreRecover = pow(recover, 0.75);
    recover = mix(recover, coreRecover, uLightCoreBias);
    vec3 recovered = mix(ambientBase, color.rgb, recover);

    vec3 glow = totalGlowTint * uLightGlowStrength;

    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float tintMask = mix(1.0, 1.0 - luminance, uLightTintLumaInfluence);
    vec3 tint = totalSurfaceTint * uLightTintStrength * tintMask;

    vec3 litResult = clamp(recovered + glow + tint, 0.0, 1.5);
    vec3 result = mix(litResult, color.rgb, clamp(exemptAlpha, 0.0, 1.0));

    gl_FragColor = vec4(result, color.a);
  }
`

const LIGHTING_VERTEX_SHADER = `
  attribute vec2 aVertexPosition;

  uniform mat3 projectionMatrix;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;

  varying vec2 vTextureCoord;
  varying vec2 vInputSize;
  varying vec2 vTextureCoordScale;
  varying vec2 vOutputFrameSize;

  vec4 filterVertexPosition(void)
  {
    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
  }

  vec2 filterTextureCoord(void)
  {
    return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }

  void main(void)
  {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vInputSize = inputSize.xy;
    vTextureCoordScale = outputFrame.zw * inputSize.zw;
    vOutputFrameSize = outputFrame.zw;
  }
`

export class LightingFilter extends PIXI.Filter {
  // 预分配 TypedArray 实例成员，避免每帧 GC
  private readonly _posX = new Float32Array(MAX_LIGHTS)
  private readonly _posY = new Float32Array(MAX_LIGHTS)
  private readonly _colorR = new Float32Array(MAX_LIGHTS)
  private readonly _colorG = new Float32Array(MAX_LIGHTS)
  private readonly _colorB = new Float32Array(MAX_LIGHTS)
  private readonly _radius = new Float32Array(MAX_LIGHTS)
  private readonly _intensity = new Float32Array(MAX_LIGHTS)
  private readonly _dirMode = new Int32Array(MAX_LIGHTS)
  private readonly _dirAngle = new Float32Array(MAX_LIGHTS)
  private readonly _coneHalfCos = new Float32Array(MAX_LIGHTS)
  private readonly _softness = new Float32Array(MAX_LIGHTS)
  constructor() {
    super(LIGHTING_VERTEX_SHADER, LIGHTING_FRAGMENT_SHADER, {
      uLightPosX: new Float32Array(MAX_LIGHTS),
      uLightPosY: new Float32Array(MAX_LIGHTS),
      uLightColorR: new Float32Array(MAX_LIGHTS),
      uLightColorG: new Float32Array(MAX_LIGHTS),
      uLightColorB: new Float32Array(MAX_LIGHTS),
      uLightRadius: new Float32Array(MAX_LIGHTS),
      uLightIntensity: new Float32Array(MAX_LIGHTS),
      uLightCount: 0,
      // Phase 3: 方向性 uniform 初始化
      uLightDirMode: new Int32Array(MAX_LIGHTS),
      uLightDirAngle: new Float32Array(MAX_LIGHTS),
      uLightConeHalfCos: new Float32Array(MAX_LIGHTS),
      uLightSoftness: new Float32Array(MAX_LIGHTS),
      uAmbientColor: [1.0, 1.0, 1.0],
      uAmbientIntensity: 1.0,  // 默认全亮 = 无光照效果
      uLightRecoverStrength: 1.0,
      uLightTintStrength: 0.08,
      uLightGlowStrength: 0.18,
      uLightInnerRatio: 0.45,
      uLightTintLumaInfluence: 0.2,
      uLightCoreBias: 0.35,
      uExemptMask: PIXI.Texture.EMPTY,
      uHasExemptMask: 0,
    })
    ;(this as PIXI.Filter & { legacy?: boolean }).legacy = true
    // v25.5: 必须 autoFit=false + padding=0。
    // 当 autoFit=true 时，PIXI v7 的 FilterSystem 会根据容器层级的 worldTransform
    // 和嵌套 filter（如子对象上的 GlowFilter）的 bounds 内部微调 outputFrame 偏移，
    // 导致 shader 中 filterArea.zw（outputFrame.xy）帧间漂移，
    // 使光源的 screenPos 计算偏移 → 光圈视觉上跟随浮动动画对象晃动。
    // filterArea 已由调用方显式设置（精确覆盖画布/视口区域），无需 PIXI 再调整。
    this.autoFit = false
    this.padding = 0
  }

  /**
   * 从聚合后的光源数据更新 shader uniforms
   */
  updateFromSceneObjects(
    lights: LightSourceData[],
    ambient: AmbientLightData,
  ): void {
    // 环境光
    this.uniforms['uAmbientColor'] = ambient.color
    this.uniforms['uAmbientIntensity'] = ambient.intensity

    // 点光源 — 使用 filter/screen 像素空间
    const count = Math.min(lights.length, MAX_LIGHTS)
    // 复用预分配的 TypedArray（避免每帧 GC）
    const posX = this._posX; posX.fill(0)
    const posY = this._posY; posY.fill(0)
    const colorR = this._colorR; colorR.fill(0)
    const colorG = this._colorG; colorG.fill(0)
    const colorB = this._colorB; colorB.fill(0)
    const radius = this._radius; radius.fill(0)
    const intensity = this._intensity; intensity.fill(0)
    const dirMode = this._dirMode; dirMode.fill(0)
    const dirAngle = this._dirAngle; dirAngle.fill(0)
    const coneHalfCos = this._coneHalfCos; coneHalfCos.fill(0)
    const softness = this._softness; softness.fill(0)

    for (let i = 0; i < count; i++) {
      const l = lights[i]!
      posX[i] = l.x
      posY[i] = l.y
      colorR[i] = l.color[0]
      colorG[i] = l.color[1]
      colorB[i] = l.color[2]
      radius[i] = l.radius
      intensity[i] = l.intensity
      // Phase 3: 方向性
      dirMode[i] = l.directionMode
      dirAngle[i] = l.directionAngle
      coneHalfCos[i] = l.coneHalfCos
      softness[i] = l.softness
    }
    this.uniforms['uLightPosX'] = posX
    this.uniforms['uLightPosY'] = posY
    this.uniforms['uLightColorR'] = colorR
    this.uniforms['uLightColorG'] = colorG
    this.uniforms['uLightColorB'] = colorB
    this.uniforms['uLightRadius'] = radius
    this.uniforms['uLightIntensity'] = intensity
    this.uniforms['uLightCount'] = count
    // Phase 3: 方向性 uniform
    this.uniforms['uLightDirMode'] = dirMode
    this.uniforms['uLightDirAngle'] = dirAngle
    this.uniforms['uLightConeHalfCos'] = coneHalfCos
    this.uniforms['uLightSoftness'] = softness
  }

  setExemptMask(mask: PIXI.RenderTexture | null): void {
    this.uniforms['uExemptMask'] = mask ?? PIXI.Texture.EMPTY
    this.uniforms['uHasExemptMask'] = mask ? 1 : 0
  }

  /** 检查是否为默认状态（全亮白色、无点光源）— 此时无需挂载 filter */
  isNoop(): boolean {
    const ambientColor = this.uniforms['uAmbientColor'] as number[] | undefined
    const isWhiteAmbient = ambientColor
      ? (ambientColor[0]! >= 0.99 && ambientColor[1]! >= 0.99 && ambientColor[2]! >= 0.99)
      : true
    return isWhiteAmbient
      && (this.uniforms['uAmbientIntensity'] as number) >= 1.0
      && (this.uniforms['uLightCount'] as number) === 0
  }
}

/**
 * 将 hex 颜色字符串转换为 RGB 0~1 数组
 * @param hex '#rrggbb' 格式
 * @returns [r, g, b] 每个分量 0~1
 */
export function hexToRgbArray(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  return [r, g, b]
}
