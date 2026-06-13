/**
 * 灯光预设数据模块
 * 
 * 统一定义所有灯型（环境光 / 点光 / 聚光）的预设参数。
 * 供 LightPickerDialog（创建时选择）和 ObjectPropertiesPanel（面板内一键应用）共用。
 */

/** 点光/聚光预设应用的参数集 */
export interface LightPresetParams {
  lightColor: string
  lightIntensity: number
  lightRadius: number
  flicker: number
  flickerSpeed: number
  directionAngle?: number
  coneAngle?: number
}

/** 预设条目 */
export interface LightPresetEntry {
  /** 唯一标识，用于匹配和持久化 */
  id: string
  /** UI 显示名称 */
  label: string
  /** 描述文案 */
  description: string
  /** 预设参数 */
  params: LightPresetParams
}

// ─── 环境光预设 ──────────────────────────────────────────
export const AMBIENT_PRESETS: LightPresetEntry[] = [
  {
    id: 'daylight',
    label: '白天',
    description: '明亮自然日光',
    params: { lightColor: '#ffffff', lightIntensity: 1.0, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
  {
    id: 'overcast',
    label: '阴天',
    description: '灰蓝柔光',
    params: { lightColor: '#c8d0db', lightIntensity: 0.75, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
  {
    id: 'twilight',
    label: '黄昏',
    description: '暖橙夕照',
    params: { lightColor: '#e8a050', lightIntensity: 0.65, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
  {
    id: 'night',
    label: '夜晚',
    description: '深蓝夜幕',
    params: { lightColor: '#2a3a6a', lightIntensity: 0.30, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
  {
    id: 'candlelit',
    label: '烛光',
    description: '暖黄烛台',
    params: { lightColor: '#d4956a', lightIntensity: 0.45, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
  {
    id: 'moonlight',
    label: '月光',
    description: '冷蓝月夜',
    params: { lightColor: '#8090c0', lightIntensity: 0.40, lightRadius: 500, flicker: 0, flickerSpeed: 0.35 },
  },
]

// ─── 点光预设 (§10.2) ────────────────────────────────────
export const POINT_LIGHT_PRESETS: LightPresetEntry[] = [
  {
    id: 'bulb',
    label: '电灯',
    description: '稳定暖白灯泡',
    params: {
      lightColor: '#fff5e0',
      lightIntensity: 1.0,
      lightRadius: 350,
      flicker: 0,
      flickerSpeed: 0.35,
    },
  },
  {
    id: 'candle',
    label: '蜡烛',
    description: '暖黄微闪烛火',
    params: {
      lightColor: '#ff9940',
      lightIntensity: 0.75,
      lightRadius: 200,
      flicker: 0.35,
      flickerSpeed: 0.25,
    },
  },
  {
    id: 'torch',
    label: '火把',
    description: '暖橙强闪火焰',
    params: {
      lightColor: '#ff6a20',
      lightIntensity: 1.1,
      lightRadius: 400,
      flicker: 0.55,
      flickerSpeed: 0.40,
    },
  },
  {
    id: 'glitch',
    label: '故障灯',
    description: '快速不规则闪烁',
    params: {
      lightColor: '#e0f0ff',
      lightIntensity: 0.9,
      lightRadius: 280,
      flicker: 0.70,
      flickerSpeed: 0.85,
    },
  },
  {
    id: 'magic',
    label: '魔法光',
    description: '冷蓝柔闪魔力',
    params: {
      lightColor: '#80c0ff',
      lightIntensity: 0.85,
      lightRadius: 320,
      flicker: 0.25,
      flickerSpeed: 0.18,
    },
  },
]

// ─── 聚光预设 (§10.3) ────────────────────────────────────
export const SPOT_LIGHT_PRESETS: LightPresetEntry[] = [
  {
    id: 'flashlight',
    label: '手电',
    description: '窄束白色聚光',
    params: {
      lightColor: '#ffffff',
      lightIntensity: 1.1,
      lightRadius: 500,
      flicker: 0,
      flickerSpeed: 0.35,
      directionAngle: 0,
      coneAngle: 45,
    },
  },
  {
    id: 'spotlight',
    label: '舞台追光',
    description: '高亮暖白追光',
    params: {
      lightColor: '#fffbe6',
      lightIntensity: 1.4,
      lightRadius: 600,
      flicker: 0,
      flickerSpeed: 0.35,
      directionAngle: 0,
      coneAngle: 60,
    },
  },
  {
    id: 'wallsconce',
    label: '壁灯',
    description: '半圆暖色壁灯',
    params: {
      lightColor: '#ffe0b0',
      lightIntensity: 0.80,
      lightRadius: 280,
      flicker: 0.08,
      flickerSpeed: 0.15,
      directionAngle: 0,
      coneAngle: 160,
    },
  },
  {
    id: 'streetlamp',
    label: '路灯',
    description: '向下均匀路灯',
    params: {
      lightColor: '#fff0d0',
      lightIntensity: 0.95,
      lightRadius: 450,
      flicker: 0,
      flickerSpeed: 0.35,
      directionAngle: Math.PI / 2,   // 向下
      coneAngle: 110,
    },
  },
]

/** 按灯型获取对应预设列表 */
export function getPresetsForLightType(lightType: 'ambient' | 'point' | 'spot'): LightPresetEntry[] {
  switch (lightType) {
    case 'ambient': return AMBIENT_PRESETS
    case 'point':   return POINT_LIGHT_PRESETS
    case 'spot':    return SPOT_LIGHT_PRESETS
  }
}
