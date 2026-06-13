/**
 * 坐标转换工具 (v4.3)
 * 
 * 系统采用双坐标体系设计，分离数据存储与视觉渲染：
 * 
 * 1️⃣ 画布坐标系 (Canvas Coordinates) - 数据层：
 *    - 定义：场景对象的存储坐标系统，固定不变
 *    - 原点：画布左上角为 (0, 0)
 *    - 用途：场景对象的 x, y, width, height 属性；数据持久化；脚本执行中的位置计算
 *    - 特性：与视口大小、缩放比例、居中偏移无关，保证数据的稳定性和可移植性
 * 
 * 2️⃣ 视口坐标系 (Viewport Coordinates) - 渲染层：
 *    - 定义：用户可见的渲染坐标系统，动态变化
 *    - 原点：视口容器（canvas-wrapper）的左上角为 (0, 0)
 *    - 用途：PixiJS 渲染对象的屏幕位置；鼠标事件的坐标捕获；视觉居中和缩放适配
 *    - 特性：随视口大小、缩放比例、居中偏移而变化，保证视觉效果的自适应性
 * 
 * 坐标转换公式：
 *   画布 → 视口：viewportX = canvasX * scale + offsetX
 *   视口 → 画布：canvasX = (viewportX - offsetX) / scale
 */

export interface CoordinateTransformParams {
  scale: number    // 视口缩放比例（画布在视口中的显示比例）
  offsetX: number  // 画布在视口中的水平居中偏移量（像素）
  offsetY: number  // 画布在视口中的垂直居中偏移量（像素）
}

/**
 * 视口坐标 → 画布坐标（处理鼠标事件）
 */
export function viewportToCanvas(
  viewportX: number,
  viewportY: number,
  params: CoordinateTransformParams
): { x: number; y: number } {
  return {
    x: (viewportX - params.offsetX) / params.scale,
    y: (viewportY - params.offsetY) / params.scale
  }
}

/**
 * 画布坐标 → 视口坐标（渲染对象）
 */
export function canvasToViewport(
  canvasX: number,
  canvasY: number,
  params: CoordinateTransformParams
): { x: number; y: number } {
  return {
    x: canvasX * params.scale + params.offsetX,
    y: canvasY * params.scale + params.offsetY
  }
}

/**
 * 计算转换参数
 * 
 * 根据PRD文档规范：
 * 1. 高度缩放：画布高度缩放到与视口高度相同
 * 2. 宽度缩放：在保持画布尺寸比例的情况下，宽度同比例缩放
 * 3. 居中对齐：画布中心与视口中心对齐
 * 
 * @param canvasWidth 画布宽度（像素）
 * @param canvasHeight 画布高度（像素）
 * @param viewportWidth 视口宽度（像素）
 * @param viewportHeight 视口高度（像素）
 * @returns 坐标转换参数
 */
export function calculateTransformParams(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number
): CoordinateTransformParams {
  // 1. 以高度为基准计算缩放比例
  const scale = viewportHeight / canvasHeight
  
  // 2. 计算缩放后的画布尺寸
  const scaledCanvasWidth = canvasWidth * scale
  // const scaledCanvasHeight = viewportHeight  // 等于视口高度 (未使用)
  
  // 3. 计算水平居中偏移
  const offsetX = (viewportWidth - scaledCanvasWidth) / 2
  const offsetY = 0  // 高度已填满，无需偏移
  
  return { scale, offsetX, offsetY }
}
