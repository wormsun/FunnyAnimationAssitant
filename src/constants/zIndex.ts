/**
 * Scene Object Z-Index Constants
 * 定义场景对象的默认层级常量
 * 
 * 层级顺序 (从底到顶):
 * -10: 背景
 *  -5: 相机边框
 *   0: Ghost 对象
 *  10: 普通对象 (角色、道具)
 * 100: 文本
 */

// 背景层级 - 最底层
export const Z_INDEX_BACKGROUND = -10

// 相机层级 - 略高于背景，低于普通对象
export const Z_INDEX_CAMERA = -5

// Ghost 层级 - 在背景和相机之上，但在普通对象之下
export const Z_INDEX_GHOST = 0

// 普通对象层级 (角色、道具)
export const Z_INDEX_DEFAULT = 10

// 文本层级 - 较高
export const Z_INDEX_TEXT = 100

// 画面特效层级 - 在所有普通场景对象之上 (Phase 1)
export const Z_INDEX_SCREEN_EFFECT = 1000

// 相机置顶层级 - Setup 编辑器中「显示相机」模式使用
export const Z_INDEX_CAMERA_OVERLAY = 10000

// 光源指示器层级 - 与画面特效同级
export const Z_INDEX_LIGHT = 1000
export const Z_INDEX_LIGHT_OVERLAY = 10001
