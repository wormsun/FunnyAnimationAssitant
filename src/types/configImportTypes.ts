/**
 * config.json 导入类型定义
 * 场景模板导入使用的树形结构节点类型
 */

/** config.json 中的帧信息 */
export interface ExportFrame {
  frame: number
  keyframe: number
  label: string | null
  path: string
  type: 'single' | 'keyframe' | 'tween'
  subIndex?: number
}

/** config.json 中的注册点信息 */
export interface ExportRegistrationPoint {
  parentX: number
  parentY: number
  localX: number
  localY: number
}

/** config.json 中的变换信息 */
export interface ExportInstanceTransform {
  width: number
  height: number
  registrationPoint: ExportRegistrationPoint
  scaleX: number
  scaleY: number
  rotation: number
}

/** config.json 中的部件信息 */
export interface ExportPart {
  partName: string
  instanceName?: string
  elementType?: 'symbol' | 'group' | 'bitmap' | 'text' | 'shape'
  parentPart?: string
  rootPart?: string
  folderName: string
  frameCount: number
  instanceTransform: ExportInstanceTransform
  frames: ExportFrame[]
  scaleFactor?: number
  alpha?: number
}

/** config.json 根结构 */
export interface ExportConfig {
  character: string
  exportLevel: number
  parts: ExportPart[]
}

/** config.json 叶节点（symbol） */
export interface ConfigSymbolNode {
  name: string
  type: 'symbol'
  elementType: string
  frameCount: number
  frames: ExportFrame[]
  instanceTransform: ExportInstanceTransform
  scaleFactor: number
  alpha?: number
}

/** config.json 容器节点（composite） */
export interface ConfigCompositeNode {
  name: string
  type: 'composite'
  elementType: string
  instanceTransform?: ExportInstanceTransform
  children: ConfigNode[]
  alpha?: number
}

/** config.json 根节点（带 version） */
export interface ConfigRoot extends ConfigCompositeNode {
  version: string
}

/** config.json 树节点（联合类型） */
export type ConfigNode = ConfigSymbolNode | ConfigCompositeNode
