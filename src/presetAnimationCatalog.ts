/**
 * 系统预制动画模板库 (v3 — 名称寻址版)
 *
 * 所有模板统一使用 PresetAnimationTemplate + TargetTrackGroup 结构。
 * 实例化时由 presetAnimationMapper 按 alias/name 解析为 UUID。
 */

import type { TransformTrack } from '@/types/animation'
import type { PresetAnimationTemplate } from '@/types/presetAnimation'
import { validatePresetTemplate } from '@/types/presetAnimation'

const deg = (value: number): number => (value * Math.PI) / 180

// ===== 辅助函数：返回裸 TransformTrack（不含外层动画壳） =====

function rotationTrack(
  frames: { time: number; rotation: number }[],
  duration = 1000,
  easing: TransformTrack['easing'] = 'linear',
): TransformTrack {
  return {
    trackType: 'transform',
    duration,
    easing,
    keyframes: frames.map(f => ({ time: f.time, rotation: f.rotation })),
  }
}

function yOffsetTrack(
  values: { time: number; y: number }[],
  duration = 1000,
  easing: TransformTrack['easing'] = 'linear',
): TransformTrack {
  return {
    trackType: 'transform',
    duration,
    easing,
    keyframes: values,
  }
}

// ===== 目标 key 常量（仅本文件内使用） =====

const K_BODY = 'body'
const K_LEFT_ARM = 'left_arm'
const K_LEFT_LOWER_ARM = 'left_lower_arm'
const K_RIGHT_ARM = 'right_arm'
const K_RIGHT_LOWER_ARM = 'right_lower_arm'
const K_LEFT_LEG = 'left_leg'
const K_LEFT_CALF = 'left_calf'
const K_RIGHT_LEG = 'right_leg'
const K_RIGHT_CALF = 'right_calf'

// ===== 系统预制动画模板 =====

export const PRESET_ANIMATIONS: PresetAnimationTemplate[] = [

  // ─── 移动类 ───────────────────────────────────────────

  {
    id: 'preset_walk_cycle',
    name: '走路',
    description: '标准走路循环，驱动四肢摆动与身体轻微起伏',
    category: 'locomotion',
    tags: ['walk', 'cycle'],
    origin: 'system',
    expectedTargets: [
      { key: K_BODY, recommendedName: '身体' },
      { key: K_LEFT_ARM, recommendedName: '左臂' },
      { key: K_RIGHT_ARM, recommendedName: '右臂' },
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 1000,
    targetTracks: [
      {
        targetKey: K_BODY,
        tracks: [yOffsetTrack([
          { time: 0, y: 0 },
          { time: 0.25, y: -2 },
          { time: 0.5, y: 0 },
          { time: 0.75, y: 2 },
          { time: 1, y: 0 },
        ])],
      },
      {
        targetKey: K_LEFT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-15) },
          { time: 0.5, rotation: deg(15) },
          { time: 1, rotation: deg(-15) },
        ])],
      },
      {
        targetKey: K_RIGHT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(15) },
          { time: 0.5, rotation: deg(-15) },
          { time: 1, rotation: deg(15) },
        ])],
      },
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(12) },
          { time: 0.5, rotation: deg(-12) },
          { time: 1, rotation: deg(12) },
        ])],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-12) },
          { time: 0.5, rotation: deg(12) },
          { time: 1, rotation: deg(-12) },
        ])],
      },
    ],
  },

  {
    id: 'preset_run_cycle',
    name: '跑步',
    description: '大幅度快节奏跑步循环，手臂大幅摆动、腿部高抬',
    category: 'locomotion',
    tags: ['run', 'cycle'],
    origin: 'system',
    expectedTargets: [
      { key: K_BODY, recommendedName: '身体' },
      { key: K_LEFT_ARM, recommendedName: '左臂' },
      { key: K_RIGHT_ARM, recommendedName: '右臂' },
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 600,
    targetTracks: [
      {
        targetKey: K_BODY,
        tracks: [yOffsetTrack([
          { time: 0, y: 0 },
          { time: 0.25, y: -8 },
          { time: 0.5, y: 0 },
          { time: 0.75, y: 6 },
          { time: 1, y: 0 },
        ], 600)],
      },
      {
        targetKey: K_LEFT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-40) },
          { time: 0.5, rotation: deg(40) },
          { time: 1, rotation: deg(-40) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(40) },
          { time: 0.5, rotation: deg(-40) },
          { time: 1, rotation: deg(40) },
        ], 600)],
      },
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(45) },
          { time: 0.5, rotation: deg(-45) },
          { time: 1, rotation: deg(45) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-45) },
          { time: 0.5, rotation: deg(45) },
          { time: 1, rotation: deg(-45) },
        ], 600)],
      },
    ],
  },

  {
    id: 'preset_walk_cycle_fine',
    name: '走路精细',
    description: '精细走路循环，整体四肢负责大摆动，下臂和小腿补充细节',
    category: 'locomotion',
    tags: ['walk', 'cycle', 'fine'],
    origin: 'system',
    expectedTargets: [
      { key: K_BODY, recommendedName: '身体' },
      { key: K_LEFT_ARM, recommendedName: '左臂' },
      { key: K_LEFT_LOWER_ARM, recommendedName: '左下臂' },
      { key: K_RIGHT_ARM, recommendedName: '右臂' },
      { key: K_RIGHT_LOWER_ARM, recommendedName: '右下臂' },
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_LEFT_CALF, recommendedName: '左小腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
      { key: K_RIGHT_CALF, recommendedName: '右小腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 1000,
    targetTracks: [
      {
        targetKey: K_BODY,
        tracks: [yOffsetTrack([
          { time: 0, y: 0 },
          { time: 0.25, y: -2 },
          { time: 0.5, y: 0 },
          { time: 0.75, y: 2 },
          { time: 1, y: 0 },
        ])],
      },
      {
        targetKey: K_LEFT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-15) },
          { time: 0.25, rotation: deg(-4) },
          { time: 0.5, rotation: deg(15) },
          { time: 0.75, rotation: deg(4) },
          { time: 1, rotation: deg(-15) },
        ])],
      },
      {
        // 左下臂：肘持续向内屈曲 10–30°；上臂后摆(t=0)时最弯（收回身侧），前摆(t=0.5)时最伸展
        targetKey: K_LEFT_LOWER_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(30) },
          { time: 0.25, rotation: deg(15) },
          { time: 0.5, rotation: deg(10) },
          { time: 0.75, rotation: deg(20) },
          { time: 1, rotation: deg(30) },
        ])],
      },
      {
        targetKey: K_RIGHT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(15) },
          { time: 0.25, rotation: deg(4) },
          { time: 0.5, rotation: deg(-15) },
          { time: 0.75, rotation: deg(-4) },
          { time: 1, rotation: deg(15) },
        ])],
      },
      {
        // 右下臂：与左下臂镜像 + 半周期错位；上臂前摆(t=0.5)时最弯到 -30°
        targetKey: K_RIGHT_LOWER_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-10) },
          { time: 0.25, rotation: deg(-20) },
          { time: 0.5, rotation: deg(-30) },
          { time: 0.75, rotation: deg(-15) },
          { time: 1, rotation: deg(-10) },
        ])],
      },
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(12) },
          { time: 0.25, rotation: deg(4) },
          { time: 0.5, rotation: deg(-12) },
          { time: 0.75, rotation: deg(-4) },
          { time: 1, rotation: deg(12) },
        ])],
      },
      {
        // 左小腿：支撑相(t=0~0.25)伸直 0°；摆动相弯膝，中段(t=0.75)最弯 -25°
        targetKey: K_LEFT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(0) },
          { time: 0.25, rotation: deg(0) },
          { time: 0.5, rotation: deg(-10) },
          { time: 0.75, rotation: deg(-25) },
          { time: 1, rotation: deg(0) },
        ])],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-12) },
          { time: 0.25, rotation: deg(-4) },
          { time: 0.5, rotation: deg(12) },
          { time: 0.75, rotation: deg(4) },
          { time: 1, rotation: deg(-12) },
        ])],
      },
      {
        // 右小腿：半周期错位 —— 摆动相中段(t=0.25)最弯 -25°，注意和左小腿同号
        targetKey: K_RIGHT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-10) },
          { time: 0.25, rotation: deg(-25) },
          { time: 0.5, rotation: deg(0) },
          { time: 0.75, rotation: deg(0) },
          { time: 1, rotation: deg(-10) },
        ])],
      },
    ],
  },

  {
    id: 'preset_run_cycle_fine',
    name: '跑步精细',
    description: '精细跑步循环，整体四肢负责大摆动，下臂和小腿补充速度感',
    category: 'locomotion',
    tags: ['run', 'cycle', 'fine'],
    origin: 'system',
    expectedTargets: [
      { key: K_BODY, recommendedName: '身体' },
      { key: K_LEFT_ARM, recommendedName: '左臂' },
      { key: K_LEFT_LOWER_ARM, recommendedName: '左下臂' },
      { key: K_RIGHT_ARM, recommendedName: '右臂' },
      { key: K_RIGHT_LOWER_ARM, recommendedName: '右下臂' },
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_LEFT_CALF, recommendedName: '左小腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
      { key: K_RIGHT_CALF, recommendedName: '右小腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 600,
    targetTracks: [
      {
        targetKey: K_BODY,
        tracks: [yOffsetTrack([
          { time: 0, y: 0 },
          { time: 0.25, y: -8 },
          { time: 0.5, y: 0 },
          { time: 0.75, y: 6 },
          { time: 1, y: 0 },
        ], 600)],
      },
      {
        targetKey: K_LEFT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-40) },
          { time: 0.25, rotation: deg(-12) },
          { time: 0.5, rotation: deg(40) },
          { time: 0.75, rotation: deg(12) },
          { time: 1, rotation: deg(-40) },
        ], 600)],
      },
      {
        // 左下臂：跑步时肘大幅向内屈曲 15–40°；上臂后摆(t=0)时最弯 +40°
        targetKey: K_LEFT_LOWER_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(40) },
          { time: 0.25, rotation: deg(22) },
          { time: 0.5, rotation: deg(15) },
          { time: 0.75, rotation: deg(28) },
          { time: 1, rotation: deg(40) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(40) },
          { time: 0.25, rotation: deg(12) },
          { time: 0.5, rotation: deg(-40) },
          { time: 0.75, rotation: deg(-12) },
          { time: 1, rotation: deg(40) },
        ], 600)],
      },
      {
        // 右下臂：镜像 + 半周期错位；上臂后摆(t=0.5)时最弯 -40°
        targetKey: K_RIGHT_LOWER_ARM,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-15) },
          { time: 0.25, rotation: deg(-28) },
          { time: 0.5, rotation: deg(-40) },
          { time: 0.75, rotation: deg(-22) },
          { time: 1, rotation: deg(-15) },
        ], 600)],
      },
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(45) },
          { time: 0.25, rotation: deg(16) },
          { time: 0.5, rotation: deg(-45) },
          { time: 0.75, rotation: deg(-16) },
          { time: 1, rotation: deg(45) },
        ], 600)],
      },
      {
        // 左小腿：跑步收腿幅度更大，摆动相中段(t=0.75)最弯 -40°
        targetKey: K_LEFT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(0) },
          { time: 0.2, rotation: deg(0) },
          { time: 0.5, rotation: deg(-20) },
          { time: 0.75, rotation: deg(-40) },
          { time: 1, rotation: deg(0) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-45) },
          { time: 0.25, rotation: deg(-16) },
          { time: 0.5, rotation: deg(45) },
          { time: 0.75, rotation: deg(16) },
          { time: 1, rotation: deg(-45) },
        ], 600)],
      },
      {
        // 右小腿：半周期错位 —— 中段(t=0.2)最弯 -40°，与左小腿同号
        targetKey: K_RIGHT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-20) },
          { time: 0.2, rotation: deg(-40) },
          { time: 0.5, rotation: deg(0) },
          { time: 0.7, rotation: deg(0) },
          { time: 1, rotation: deg(-20) },
        ], 600)],
      },
    ],
  },

  // ─── 腿部分离移动类 ─────────────────────────────────

  {
    id: 'preset_walk_legs_only',
    name: '腿部走路',
    description: '仅驱动双腿走路摆动，适合与手臂动作组合使用',
    category: 'locomotion',
    tags: ['walk', 'legs', 'cycle'],
    origin: 'system',
    expectedTargets: [
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 1000,
    targetTracks: [
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(12) },
          { time: 0.5, rotation: deg(-12) },
          { time: 1, rotation: deg(12) },
        ])],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-12) },
          { time: 0.5, rotation: deg(12) },
          { time: 1, rotation: deg(-12) },
        ])],
      },
    ],
  },

  {
    id: 'preset_run_legs_only',
    name: '腿部跑步',
    description: '仅驱动双腿跑步摆动，适合与手臂动作组合使用',
    category: 'locomotion',
    tags: ['run', 'legs', 'cycle'],
    origin: 'system',
    expectedTargets: [
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 600,
    targetTracks: [
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(45) },
          { time: 0.5, rotation: deg(-45) },
          { time: 1, rotation: deg(45) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-45) },
          { time: 0.5, rotation: deg(45) },
          { time: 1, rotation: deg(-45) },
        ], 600)],
      },
    ],
  },

  {
    id: 'preset_walk_legs_only_fine',
    name: '腿部走路精细',
    description: '腿部精细走路摆动，整体腿负责大摆动，小腿补充细节',
    category: 'locomotion',
    tags: ['walk', 'legs', 'cycle', 'fine'],
    origin: 'system',
    expectedTargets: [
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_LEFT_CALF, recommendedName: '左小腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
      { key: K_RIGHT_CALF, recommendedName: '右小腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 1000,
    targetTracks: [
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(12) },
          { time: 0.25, rotation: deg(4) },
          { time: 0.5, rotation: deg(-12) },
          { time: 0.75, rotation: deg(-4) },
          { time: 1, rotation: deg(12) },
        ])],
      },
      {
        // 左小腿：支撑相伸直，摆动相中段(t=0.75)最弯 -25°
        targetKey: K_LEFT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(0) },
          { time: 0.25, rotation: deg(0) },
          { time: 0.5, rotation: deg(-10) },
          { time: 0.75, rotation: deg(-25) },
          { time: 1, rotation: deg(0) },
        ])],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-12) },
          { time: 0.25, rotation: deg(-4) },
          { time: 0.5, rotation: deg(12) },
          { time: 0.75, rotation: deg(4) },
          { time: 1, rotation: deg(-12) },
        ])],
      },
      {
        // 右小腿：半周期错位，摆动相中段(t=0.25)最弯 -25°，同号
        targetKey: K_RIGHT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-10) },
          { time: 0.25, rotation: deg(-25) },
          { time: 0.5, rotation: deg(0) },
          { time: 0.75, rotation: deg(0) },
          { time: 1, rotation: deg(-10) },
        ])],
      },
    ],
  },

  {
    id: 'preset_run_legs_only_fine',
    name: '腿部跑步精细',
    description: '腿部精细跑步摆动，整体腿负责大摆动，小腿补充速度感',
    category: 'locomotion',
    tags: ['run', 'legs', 'cycle', 'fine'],
    origin: 'system',
    expectedTargets: [
      { key: K_LEFT_LEG, recommendedName: '左腿' },
      { key: K_LEFT_CALF, recommendedName: '左小腿' },
      { key: K_RIGHT_LEG, recommendedName: '右腿' },
      { key: K_RIGHT_CALF, recommendedName: '右小腿' },
    ],
    loop: true,
    fillMode: 'none',
    duration: 600,
    targetTracks: [
      {
        targetKey: K_LEFT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(45) },
          { time: 0.25, rotation: deg(16) },
          { time: 0.5, rotation: deg(-45) },
          { time: 0.75, rotation: deg(-16) },
          { time: 1, rotation: deg(45) },
        ], 600)],
      },
      {
        // 左小腿：跑步收腿，摆动相中段(t=0.75)最弯 -40°
        targetKey: K_LEFT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(0) },
          { time: 0.2, rotation: deg(0) },
          { time: 0.5, rotation: deg(-20) },
          { time: 0.75, rotation: deg(-40) },
          { time: 1, rotation: deg(0) },
        ], 600)],
      },
      {
        targetKey: K_RIGHT_LEG,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-45) },
          { time: 0.25, rotation: deg(-16) },
          { time: 0.5, rotation: deg(45) },
          { time: 0.75, rotation: deg(16) },
          { time: 1, rotation: deg(-45) },
        ], 600)],
      },
      {
        // 右小腿：半周期错位，中段(t=0.2)最弯 -40°，同号
        targetKey: K_RIGHT_CALF,
        tracks: [rotationTrack([
          { time: 0, rotation: deg(-20) },
          { time: 0.2, rotation: deg(-40) },
          { time: 0.5, rotation: deg(0) },
          { time: 0.7, rotation: deg(0) },
          { time: 1, rotation: deg(-20) },
        ], 600)],
      },
    ],
  },
]

// ===== 启动时校验 =====

for (const template of PRESET_ANIMATIONS) {
  const errors = validatePresetTemplate(template)
  if (errors.length > 0) {
    throw new Error(`预制动画模板无效: ${template.name}\n${errors.join('\n')}`)
  }
}
