<template>
  <div class="action-inspector">
    <div
      v-if="!action"
      class="empty-hint"
    >
      请选择一个动作以编辑属性
    </div>
    
    <div
      v-else
      class="inspector-form"
    >
      <!-- 通用头部 -->
      <div class="inspector-header">
        <div class="target-object">
          <span class="target-icon">{{ getActionHeaderIcon(action!) }}</span>
          <span class="target-name">{{ getActionHeaderTitle(action!) }}</span>
        </div>
        <span
          class="action-type-badge"
          :class="action!['category']"
        >
          {{ action!['category'] === 'point' ? '◆ 瞬时' : '═ 持续' }}
        </span>
      </div>

      <!-- 时间设置 (v6.2) -->
      <div class="property-section">
        <h4>时间设置</h4>
        <div class="property-field">
          <label>序号:</label>
          <select
            :value="action!['slotIndex']"
            @change="handleSlotIndexChange"
          >
            <option 
              v-for="slot in slots" 
              :key="slot.index" 
              :value="slot.index"
            >
              #{{ slot.index + 1 }} {{ getSlotLabel(slot) }}
            </option>
          </select>
        </div>
        <div
          v-if="action!['category'] === 'duration'"
          class="property-field"
        >
          <label>跨度:</label>
          <input
            :value="(action as BaseDurationAction)['slotSpan'] ?? 1"
            type="number"
            min="1"
            step="1"
            @change="handleSlotSpanChange"
          >
        </div>
      </div>

      <!-- 参数配置 (v6.3 Delta 模式) -->
      <div class="property-section">
        <h4>已变更属性</h4>
        
        <!-- set_character 已移除 -->

        <!-- set_transform: 视觉属性 + 几何属性 (v9.2) -->
        <template v-if="action!['type'] === 'set_transform'">
          <!-- v9.2: Death Action 简化面板 -->
          <template v-if="isCurrentDeathAction">
            <div class="death-action-panel">
              <div class="death-icon">🍂</div>
              <div class="death-label">对象已消亡</div>
              <div class="death-hint">消亡后对象不再渲染，无法编辑属性</div>
            </div>
          </template>
          <!-- 正常属性编辑器 -->
          <template v-else>
            <!-- 几何属性 (v9.2 新增) -->
            <template
              v-for="prop in activeGeometryProps"
              :key="prop.key"
            >
              <div class="delta-property-item">
                <div class="delta-property-header">
                  <span class="delta-property-label">{{ prop.label }}</span>
                  <button
                    class="delta-remove-btn"
                    title="移除"
                    @click="removeGeometryProp(prop.key)"
                  >
                    ×
                  </button>
                </div>
                <!-- 百分比类型 -->
                <template v-if="prop.type === 'percent'">
                  <div class="percent-input-row" style="display: flex; align-items: center;">
                    <input
                      v-model.number="geometryParams[prop.key]"
                      type="number"
                      step="1"
                      @change="(prop.key === 'scaleX' || prop.key === 'scaleY') ? handleScaleChange(prop.key) : handleSetTransformGeometryChange()"
                    >
                    <span class="percent-label">%</span>
                    <button 
                      v-if="prop.key === 'scaleX'"
                      class="lock-btn" 
                      style="background: none; border: none; cursor: pointer; padding: 0 4px; font-size: 14px; margin-left: 6px; opacity: 0.8;"
                      :title="scaleLocked ? '解锁比例' : '锁定比例'"
                      @click="toggleScaleLock"
                    >
                      {{ scaleLocked ? '🔗' : '🔓' }}
                    </button>
                  </div>
                </template>
                <!-- 角度类型 -->
                <template v-else-if="prop.type === 'degree'">
                  <div class="degree-input-row">
                    <input
                      v-model.number="geometryParams[prop.key]"
                      type="number"
                      step="1"
                      @change="handleSetTransformGeometryChange"
                    >
                    <span class="degree-label">°</span>
                  </div>
                </template>
                <!-- 普通数字类型 -->
                <template v-else>
                  <input
                    v-model.number="geometryParams[prop.key]"
                    type="number"
                    :step="prop.step ?? 1"
                    @change="handleSetTransformGeometryChange"
                  >
                </template>
              </div>
            </template>
            
            <!-- 视觉属性 -->
            <template
              v-for="prop in activeVisualProps"
              :key="prop.key"
            >
              <div class="delta-property-item">
                <div class="delta-property-header">
                  <span class="delta-property-label">{{ prop.label }}</span>
                  <button
                    class="delta-remove-btn"
                    title="移除"
                    @click="removeVisualProp(prop.key)"
                  >
                    ×
                  </button>
                </div>
                <template v-if="prop.type === 'number'">
                  <input
                    v-model.number="visualParams[prop.key]"
                    type="number"
                    :step="prop.step ?? 1"
                    @change="handleVisualParamsChange"
                  >
                </template>
                <template v-else-if="prop.type === 'range'">
                  <div class="range-row">
                    <input
                      v-model.number="visualParams[prop.key]"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      @input="handleVisualParamsChange"
                    >
                    <span class="value-label">{{ ((visualParams[prop.key] as number) ?? 1).toFixed(1) }}</span>
                  </div>
                </template>
                <template v-else-if="prop.type === 'checkbox'">
                  <label class="checkbox-label">
                    <input
                      v-model="visualParams[prop.key]"
                      type="checkbox"
                      @change="handleVisualParamsChange"
                    >
                    <span>{{ prop.checkLabel }}</span>
                  </label>
                </template>
              </div>
            </template>
            <div
              v-if="activeVisualProps.length === 0 && activeGeometryProps.length === 0"
              class="empty-props-hint"
            >
              暂无变更属性，点击下方添加
            </div>
          </template>
        </template>

        <!-- v9.3: set_visual: 视觉属性 (visible/flipX/zIndex) -->
        <template v-else-if="action!['type'] === 'set_visual'">
          <!-- visible 可见性 -->
          <div
            v-if="setVisualParams['visible'] !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">👁️ 可见性</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeSetVisualProp('visible')"
              >
                ×
              </button>
            </div>
            <label class="checkbox-label">
              <input
                v-model="setVisualParams['visible']"
                type="checkbox"
                @change="handleSetVisualParamsChange"
              >
              <span>显示</span>
            </label>
          </div>
          
          <!-- flipX 水平翻转 -->
          <div
            v-if="setVisualParams['flipX'] !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">🔄 翻转</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeSetVisualProp('flipX')"
              >
                ×
              </button>
            </div>
            <label class="checkbox-label">
              <input
                v-model="setVisualParams['flipX']"
                type="checkbox"
                @change="handleSetVisualParamsChange"
              >
              <span>水平翻转</span>
            </label>
          </div>
          
          <!-- zIndex 层级 -->
          <div
            v-if="setVisualParams['zIndex'] !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">📑 层级</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeSetVisualProp('zIndex')"
              >
                ×
              </button>
            </div>
            <input
              v-model.number="setVisualParams['zIndex']"
              type="number"
              step="1"
              @change="handleSetVisualParamsChange"
            >
          </div>

          <div
            v-if="setVisualParams['receiveLighting'] !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">💡 场景光照</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeSetVisualProp('receiveLighting')"
              >
                ×
              </button>
            </div>
            <label class="checkbox-label">
              <input
                v-model="setVisualParams['receiveLighting']"
                type="checkbox"
                @change="handleSetVisualParamsChange"
              >
              <span>参与场景光照</span>
            </label>
          </div>

          <div
            v-if="setVisualParams['castShadow'] !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">🌑 脚底投影</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeSetVisualProp('castShadow')"
              >
                ×
              </button>
            </div>
            <label class="checkbox-label">
              <input
                v-model="setVisualParams['castShadow']"
                type="checkbox"
                @change="handleSetVisualParamsChange"
              >
              <span>投射阴影</span>
            </label>
          </div>
          
          <!-- 空状态提示 -->
          <div
            v-if="setVisualParams['visible'] === undefined && setVisualParams['flipX'] === undefined && setVisualParams['zIndex'] === undefined && setVisualParams['receiveLighting'] === undefined && setVisualParams['castShadow'] === undefined"
            class="empty-props-hint"
          >
            暂无变更属性
          </div>
        </template>

        <!-- set_lifecycle: 生命周期控制 -->
        <template v-else-if="action!['type'] === 'set_lifecycle'">
          <!-- 消亡 Action 简化面板 -->
          <template v-if="isCurrentDeathAction">
            <div class="death-action-panel">
              <div class="death-icon">🍂</div>
              <div class="death-label">对象已消亡</div>
              <div class="death-hint">消亡后对象不再渲染，无法编辑属性</div>
            </div>
          </template>
          <!-- 出生 Action -->
          <template v-else-if="isCurrentBirthAction">
            <div class="birth-action-panel">
              <div class="birth-icon">🌱</div>
              <div class="birth-label">对象出生</div>
              <label class="anim-option-checkbox">
                <input
                  type="checkbox"
                  :checked="(action as SetLifecycleAction).params.autoDespawnOnBlockEnd ?? true"
                  @change="handleAutoDespawnChange(($event.target as HTMLInputElement).checked)"
                >
                <span>本段结束后自动消亡</span>
              </label>
            </div>
          </template>
        </template>

        <template v-else-if="action!['type'] === 'set_scene_structure'">
          <div class="scene-structure-panel">
            <div class="scene-structure-summary">
              <div class="scene-structure-icon">🧭</div>
              <div>
                <div class="scene-structure-title">结构变更</div>
                <div class="scene-structure-hint">当前槽位的父子结构最终状态</div>
              </div>
            </div>

            <div class="scene-structure-counts">
              <span>结构操作 {{ sceneStructureOperationGroups.length }}</span>
              <span>变更项 {{ sceneStructureChangeCount }}</span>
            </div>

            <div
              v-for="group in sceneStructureOperationGroups"
              :key="group.id"
              class="scene-structure-section"
            >
              <div class="scene-structure-operation-header">
                <div>
                  <div class="scene-structure-section-title">{{ group.title }}</div>
                  <div class="scene-structure-operation-hint">{{ group.hint }}</div>
                </div>
                <button
                  class="delta-remove-btn"
                  title="删除此结构操作"
                  @click="removeSceneStructureOperation(group)"
                >
                  ×
                </button>
              </div>

              <div
                v-if="group.parentEntries.length > 0"
                class="scene-structure-subsection"
              >
                <div class="scene-structure-subtitle">父级关系</div>
                <div
                  v-for="entry in group.parentEntries"
                  :key="`parent-${entry.objectId}`"
                  class="scene-structure-row"
                >
                  <div class="scene-structure-object">
                    <span class="scene-structure-name">{{ getObjectDisplayName(entry.objectId) }}</span>
                    <span
                      v-if="!getSceneObject(entry.objectId)"
                      class="scene-structure-missing"
                    >对象已不存在</span>
                  </div>
                  <div class="scene-structure-value">
                    {{ getObjectDisplayName(entry.parentId) }}
                  </div>
                </div>
              </div>

              <div
                v-if="group.spawnedEntries.length > 0"
                class="scene-structure-subsection"
              >
                <div class="scene-structure-subtitle">成组状态</div>
                <div
                  v-for="entry in group.spawnedEntries"
                  :key="`spawned-${entry.objectId}`"
                  class="scene-structure-object-entry"
                >
                  <div class="scene-structure-row">
                    <div class="scene-structure-object">
                      <span class="scene-structure-name">{{ getObjectDisplayName(entry.objectId) }}</span>
                      <span
                        v-if="!getSceneObject(entry.objectId)"
                        class="scene-structure-missing"
                      >对象已不存在</span>
                    </div>
                    <div class="scene-structure-value">
                      {{ entry.spawned ? '启用' : '停用' }}
                    </div>
                  </div>
                  <label
                    v-if="entry.spawned"
                    class="scene-structure-auto-restore-row"
                    title="本段结束后自动停用该结构对象，并还原挂入它的成员关系"
                  >
                    <input
                      type="checkbox"
                      :checked="isSceneStructureAutoRestoreEnabled(group.operation)"
                      @change="handleSceneStructureAutoRestoreChange(group.id, ($event.target as HTMLInputElement).checked)"
                    >
                    <span>本段结束后自动停用</span>
                  </label>
                </div>
              </div>
            </div>

            <div
              v-if="sceneStructureChangeCount === 0"
              class="empty-props-hint"
            >
              这条结构变更没有任何变更项
            </div>
          </div>
        </template>

        <!-- P2: set_composite: 修改组合对象属性（可编辑面板） -->
        <template v-else-if="action!['type'] === 'set_composite'">

          <!-- renderChain 排序编辑器 -->
          <div
            v-if="compositeParams.renderChain !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">📋 渲染链排序</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeCompositeProp('renderChain')"
              >
                ×
              </button>
            </div>
            <div class="sc-rc-list">
              <div class="sc-rc-header">
                <span>渲染顺序 ({{ compositeParams.renderChain?.length ?? 0 }})</span>
                <div class="sc-rc-controls">
                  <button
                    class="sc-rc-move-btn"
                    title="上移（底层方向）"
                    :disabled="!scRcCanMoveUp"
                    @click="handleCompositeChildMove(scRcSelectedIndex, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="sc-rc-move-btn"
                    title="下移（顶层方向）"
                    :disabled="!scRcCanMoveDown"
                    @click="handleCompositeChildMove(scRcSelectedIndex, 1)"
                  >
                    ↓
                  </button>
                </div>
              </div>
              <div class="sc-rc-order-hint">
                ↑ 底层  ·  ↓ 顶层
              </div>
              <template v-for="(entry, displayIdx) in scRcDisplay" :key="'scrc-' + displayIdx">
                <!-- zIndex 分组分割线 -->
                <div v-if="entry.type === 'divider'" class="sc-rc-zindex-divider">
                  <span class="sc-rc-zindex-label">zIndex {{ entry.zIndex }}</span>
                </div>
                <!-- 渲染链项 -->
                <div
                  v-else
                  class="sc-rc-item"
                  :class="{
                    'sc-rc-selected': entry.childId === scRcSelectedId,
                    'sc-rc-drag-over': scRcDragOverIndex === entry.flatIndex,
                  }"
                  draggable="true"
                  @click="scRcSelectedId = entry.childId"
                  @dragstart="onScRcDragStart(entry.flatIndex, $event)"
                  @dragover.prevent="onScRcDragOver(entry.flatIndex)"
                  @dragleave="onScRcDragLeave"
                  @drop.prevent="onScRcDrop(entry.flatIndex)"
                  @dragend="onScRcDragEnd"
                >
                  <span class="sc-rc-drag-handle" title="拖拽排序">⠿</span>
                  <span class="sc-rc-icon">{{ getCompositeChildIcon(entry.childId) }}</span>
                  <span class="sc-rc-name">{{ getCompositeChildName(entry.childId) }}</span>
                </div>
              </template>
              <div v-if="!compositeParams.renderChain?.length" class="sc-rc-empty">
                暂无子对象
              </div>
            </div>
          </div>

          <!-- 空状态提示 -->
          <div
            v-if="compositeParams.renderChain === undefined"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- Clip-Mask Phase 1 D3: set_mask（修改蒙版裁切目标 / 形状） -->
        <template v-else-if="action!['type'] === 'set_mask'">
          <!-- 形状（shape） -->
          <div
            v-if="maskParams.shape !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">形状</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeMaskProp('shape')"
              >
                ×
              </button>
            </div>
            <select
              v-model="maskParams.shape"
              class="prop-select"
              @change="handleMaskParamsChange"
            >
              <option value="rectangle">▭ 矩形</option>
              <option value="ellipse">⬭ 椭圆</option>
            </select>
          </div>

          <!-- 宽度（width） -->
          <div
            v-if="maskParams.width !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">宽度</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeMaskProp('width')"
              >
                ×
              </button>
            </div>
            <input
              v-model.number="maskParams.width"
              type="number"
              min="1"
              step="1"
              class="prop-input"
              @change="handleMaskParamsChange"
            >
          </div>

          <!-- 高度（height） -->
          <div
            v-if="maskParams.height !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">高度</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeMaskProp('height')"
              >
                ×
              </button>
            </div>
            <input
              v-model.number="maskParams.height"
              type="number"
              min="1"
              step="1"
              class="prop-input"
              @change="handleMaskParamsChange"
            >
          </div>

          <!-- 裁切目标（targetIds） -->
          <div
            v-if="maskParams.targetIds !== undefined"
            class="delta-property-item"
          >
            <div class="delta-property-header">
              <span class="delta-property-label">✂ 裁切目标 ({{ maskParams.targetIds.length }})</span>
              <button
                class="delta-remove-btn"
                title="移除"
                @click="removeMaskProp('targetIds')"
              >
                ×
              </button>
            </div>
            <ul v-if="maskParams.targetIds.length > 0" class="mask-target-list">
              <li
                v-for="tid in maskParams.targetIds"
                :key="tid"
                class="mask-target-row"
              >
                <span class="mask-target-icon">{{ getMaskTargetIcon(tid) }}</span>
                <span class="mask-target-name" :title="getMaskTargetName(tid)">
                  {{ getMaskTargetName(tid) }}
                </span>
                <button
                  class="mask-target-remove-btn"
                  title="移除目标"
                  @click="removeMaskTarget(tid)"
                >
                  ❌
                </button>
              </li>
            </ul>
            <div v-else class="mask-target-empty">无目标（全部释放）</div>
            <div class="mask-target-add-row">
              <select v-model="maskTargetAddSelection" class="mask-target-add-select">
                <option value="">+ 添加目标...</option>
                <option
                  v-for="obj in maskCandidateTargets"
                  :key="obj.id"
                  :value="obj.id"
                >
                  {{ obj.alias || obj.name || obj.id }}
                </option>
              </select>
              <button
                class="mask-target-add-btn"
                :disabled="!maskTargetAddSelection"
                @click="addMaskTarget"
              >
                添加
              </button>
            </div>
          </div>

          <!-- 空状态提示 -->
          <div
            v-if="maskParams.shape === undefined && maskParams.targetIds === undefined && maskParams.width === undefined && maskParams.height === undefined"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- tween_transform: 几何属性 + 透明度 -->
        <template v-else-if="action!['type'] === 'tween_transform'">
          <template
            v-for="prop in activeTweenProps"
            :key="prop.key"
          >
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">{{ prop.label }}</span>
                <button
                  class="delta-remove-btn"
                  title="移除"
                  @click="removeGeometryProp(prop.key)"
                >
                  ×
                </button>
              </div>
              <!-- 百分比类型 -->
              <template v-if="prop.type === 'percent'">
                <div class="percent-input-row" style="display: flex; align-items: center;">
                  <input
                    v-model.number="geometryParams[prop.key]"
                    type="number"
                    step="1"
                    @change="(prop.key === 'scaleX' || prop.key === 'scaleY') ? handleScaleChange(prop.key) : handleGeometryParamsChange()"
                  >
                  <span class="percent-label">%</span>
                  <button 
                    v-if="prop.key === 'scaleX'"
                    class="lock-btn" 
                    style="background: none; border: none; cursor: pointer; padding: 0 4px; font-size: 14px; margin-left: 6px; opacity: 0.8;"
                    :title="scaleLocked ? '解锁比例' : '锁定比例'"
                    @click="toggleScaleLock"
                  >
                    {{ scaleLocked ? '🔗' : '🔓' }}
                  </button>
                </div>
              </template>
              <!-- 角度类型 -->
              <template v-else-if="prop.type === 'degree'">
                <div class="degree-input-row">
                  <input
                    v-model.number="geometryParams[prop.key]"
                    type="number"
                    step="1"
                    @change="handleGeometryParamsChange"
                  >
                  <span class="degree-label">°</span>
                </div>
              </template>
              <!-- 范围滑块类型 (alpha) -->
              <template v-else-if="prop.type === 'range'">
                <div class="range-row">
                  <input
                    v-model.number="geometryParams[prop.key]"
                    type="range"
                    min="0"
                    max="1"
                    :step="prop.step ?? 0.1"
                    @input="handleGeometryParamsChange"
                  >
                  <span class="value-label">{{ ((geometryParams[prop.key] as number) ?? 1).toFixed(1) }}</span>
                </div>
              </template>
              <template v-else-if="prop.type === 'select'">
                <select
                  v-model="lightParams[prop.key]"
                  @change="handleLightParamsChange"
                >
                  <option
                    v-for="option in prop.options ?? []"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </template>
              <!-- 普通数字类型 -->
              <template v-else>
                <input
                  v-model.number="geometryParams[prop.key]"
                  type="number"
                  :step="prop.step ?? 1"
                  @change="handleGeometryParamsChange"
                >
              </template>
            </div>
          </template>
          <div
            v-if="activeTweenProps.length === 0"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- 相机动作类型 (camera_cut / camera_move / camera_follow / camera_shake) -->
        <template v-else-if="isCameraAction">
          <!-- 动作类型标签 -->
          <div class="camera-action-type-label">
            <span class="type-icon">{{ getCameraActionIcon(action!['type']) }}</span>
            <span class="type-name">{{ getCameraActionTypeName(action!['type']) }}</span>
          </div>

          <!-- 镜头切 / 运镜 参数 -->
          <template v-if="action!['type'] === 'camera_cut' || action!['type'] === 'camera_move'">
            <div class="camera-mode-hint">
              {{ action!['type'] === 'camera_cut' ? '提示: 拖拽画面框以设定瞬间机位' : '提示: 拖拽画面框以设定【终点】位置' }}
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">目标中心 X</span>
              </div>
              <input
                :value="Math.round(cameraParams.x)"
                type="number"
                step="1"
                @change="handleCameraXChange"
              >
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">目标中心 Y</span>
              </div>
              <input
                :value="Math.round(cameraParams.y)"
                type="number"
                step="1"
                @change="handleCameraYChange"
              >
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">目标 Zoom</span>
              </div>
              <div class="zoom-input-row">
                <input
                  :value="cameraZoomPercent"
                  type="number"
                  step="10"
                  min="10"
                  max="1000"
                  @change="handleCameraZoomChange"
                >
                <span class="percent-label">%</span>
              </div>
            </div>
          </template>

          <!-- 跟随参数 -->
          <template v-else-if="action!['type'] === 'camera_follow'">
            <div class="camera-mode-hint">
              提示: 相机将跟随选定目标移动
            </div>
            <div class="follow-panel">
              <div class="follow-card">
                <div class="follow-card-header">
                  <span class="delta-property-label">跟随目标</span>
                  <span class="follow-card-caption">选择一个对象作为镜头跟随主体</span>
                </div>
                <div
                  class="follow-target-dropdown"
                  tabindex="-1"
                  @focusout="onFollowDropdownFocusOut"
                >
                  <button
                    class="follow-target-trigger"
                    type="button"
                    @click="showFollowDropdown = !showFollowDropdown"
                  >
                    <span v-if="selectedFollowTargetLabel">
                      {{ selectedFollowTargetLabel }}
                    </span>
                    <span v-else class="follow-target-placeholder">请选择目标...</span>
                    <span class="follow-target-arrow">{{ showFollowDropdown ? '▲' : '▼' }}</span>
                  </button>
                  <div v-if="showFollowDropdown" class="follow-target-list">
                    <div
                      class="follow-target-item"
                      :class="{ selected: !followParams.followTarget }"
                      @click="selectFollowTarget('')"
                    >
                      <span class="follow-target-item-label">无</span>
                    </div>
                    <div
                      v-for="item in flatFollowTargetList"
                      :key="item.id"
                      class="follow-target-item"
                      :class="{
                        selected: followParams.followTarget === item.id,
                        'child-item': item.depth > 0
                      }"
                      :style="item.depth > 0 ? { paddingLeft: `${8 + item.depth * 20}px` } : undefined"
                      @click="selectFollowTarget(item.id)"
                    >
                      <span v-if="item.depth > 0" class="follow-target-child-prefix">└</span>
                      <span class="follow-target-item-label">{{ item.icon }} {{ item.alias }}</span>
                      <span
                        v-if="item.hasChildren"
                        class="follow-target-toggle"
                        @click.stop="toggleCompositeExpand(item.id)"
                      >
                        {{ expandedComposites.has(item.id) ? '▲' : '▼' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="follow-card">
                <div class="follow-card-header">
                  <span class="delta-property-label">基础参数</span>
                  <span class="follow-card-caption">设置构图偏移和镜头缩放</span>
                </div>
                <div class="follow-inline-stack">
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">Zoom</span>
                    <div class="zoom-input-row">
                      <input
                        :value="followZoomPercent"
                        type="number"
                        step="10"
                        min="10"
                        max="1000"
                        @change="handleFollowZoomChange"
                      >
                      <span class="value-label">%</span>
                    </div>
                  </label>
                </div>
                <div class="follow-inline-grid">
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">偏移 X</span>
                    <input
                      v-model.number="followParams.offsetX"
                      type="number"
                      step="10"
                      @change="handleFollowParamsChange"
                    >
                  </label>
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">偏移 Y</span>
                    <input
                      v-model.number="followParams.offsetY"
                      type="number"
                      step="10"
                      @change="handleFollowParamsChange"
                    >
                  </label>
                </div>
              </div>

              <div class="follow-card">
                <label class="follow-toggle-card">
                  <span class="follow-toggle-main">
                    <input
                      v-model="followParams.smoothEntry"
                      type="checkbox"
                      @change="handleFollowParamsChange"
                    >
                    <span>平滑入场</span>
                  </span>
                  <span class="follow-toggle-desc">开始跟随时，从当前机位平滑滑动到目标位置</span>
                </label>
                <div v-if="followParams.smoothEntry" class="follow-inline-grid follow-sub-grid">
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">过渡时长</span>
                    <div class="zoom-input-row">
                      <input
                        v-model.number="followParams.smoothEntryDuration"
                        type="number"
                        :min="100"
                        :max="2000"
                        :step="50"
                        class="number-input"
                        @change="handleFollowParamsChange"
                      >
                      <span class="value-label">ms</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="follow-card">
                <label class="follow-toggle-card">
                  <span class="follow-toggle-main">
                    <input
                      v-model="followParams.autoZoom"
                      type="checkbox"
                      @change="handleFollowParamsChange"
                    >
                    <span>自动推拉</span>
                  </span>
                  <span class="follow-toggle-desc">在跟随过程中叠加轻微的周期缩放，增加镜头呼吸感</span>
                </label>
                <div v-if="followParams.autoZoom" class="follow-inline-grid follow-sub-grid">
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">推拉幅度</span>
                    <div class="zoom-input-row">
                      <input
                        v-model.number="followParams.autoZoomRange"
                        type="number"
                        step="1"
                        min="5"
                        max="50"
                        @change="handleFollowParamsChange"
                      >
                      <span class="value-label">%</span>
                    </div>
                  </label>
                  <label class="follow-inline-field">
                    <span class="follow-inline-label">推拉次数</span>
                    <input
                      v-model.number="followParams.autoZoomCycles"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="10"
                      @change="handleFollowParamsChange"
                    >
                  </label>
                </div>
              </div>

              <div class="follow-card">
                <label class="follow-toggle-card follow-toggle-card-compact">
                  <span class="follow-toggle-main">
                    <input
                      v-model="followParams.constrainBounds"
                      type="checkbox"
                      @change="handleFollowParamsChange"
                    >
                    <span>边界约束</span>
                  </span>
                  <span class="follow-toggle-desc">限制相机在画布范围内，避免镜头越界</span>
                </label>
              </div>
            </div>
          </template>

          <template v-else-if="action!['type'] === 'camera_shake'">
            <div class="camera-mode-hint">
              提示: 镜头将产生随机抖动效果
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">强度 (px)</span>
              </div>
              <input
                v-model.number="shakeParams.intensity"
                type="number"
                min="0"
                step="1"
                @change="handleShakeChange"
              >
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">频率 (Hz)</span>
              </div>
              <input
                v-model.number="shakeParams.frequency"
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                @change="handleShakeChange"
              >
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">衰减</span>
              </div>
              <label class="checkbox-label">
                <input
                  v-model="shakeParams.decay"
                  type="checkbox"
                  @change="handleShakeChange"
                >
                <span>随时间衰减</span>
              </label>
            </div>
          </template>
        </template>

        <!-- set_audio: 音频动作 -->
        <template v-else-if="action!['type'] === 'set_audio'">
          <!-- 必需属性: Action -->
          <div class="delta-property-item">
            <div class="delta-property-header">
              <span class="delta-property-label">动作</span>
            </div>
            <div class="anim-action-row">
              <label
                class="anim-action-option"
                :class="{ active: audioParams['action'] === 'play' }"
              >
                <input
                  type="radio"
                  name="audio-action"
                  value="play" 
                  :checked="audioParams['action'] === 'play'"
                  @change="handleAudioParamsChange('action', 'play')"
                >
                <span>▶ 播放</span>
              </label>
              <label
                class="anim-action-option"
                :class="{ active: audioParams['action'] === 'stop' }"
              >
                <input
                  type="radio"
                  name="audio-action"
                  value="stop" 
                  :checked="audioParams['action'] === 'stop'"
                  @change="handleAudioParamsChange('action', 'stop')"
                >
                <span>⏹ 停止</span>
              </label>
            </div>
          </div>

          <!-- 可选属性 -->
          <template
            v-for="prop in activeAudioProps"
            :key="prop.key"
          >
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">{{ prop.label }}</span>
                <button
                  class="delta-remove-btn"
                  title="移除"
                  @click="removeAudioProp(prop.key)"
                >
                  ×
                </button>
              </div>
              <template v-if="prop.type === 'number'">
                <input
                  :value="audioParams[prop.key]"
                  type="number"
                  :step="prop.step ?? 1"
                  :min="prop.min"
                  @change="handleAudioParamsChange(prop.key, parseFloat(($event.target as HTMLInputElement).value))"
                >
              </template>
              <template v-else-if="prop.type === 'range'">
                <div class="range-row">
                  <input
                    :value="audioParams[prop.key]"
                    type="range"
                    :min="prop.min"
                    :max="prop.max"
                    :step="prop.step"
                    @input="handleAudioParamsChange(prop.key, parseFloat(($event.target as HTMLInputElement).value))"
                  >
                  <span
                    v-if="prop.key === 'volume'"
                    class="value-label"
                  >{{ Math.round(((audioParams[prop.key] as number) ?? 1) * 100) }}%</span>
                  <span
                    v-else
                    class="value-label"
                  >{{ ((audioParams[prop.key] as number) ?? 1).toFixed(2) }}</span>
                </div>
              </template>
              <template v-else-if="prop.type === 'checkbox'">
                <label class="checkbox-label">
                  <input
                    :checked="(audioParams[prop.key] as boolean)"
                    type="checkbox"
                    @change="handleAudioParamsChange(prop.key, ($event.target as HTMLInputElement).checked)"
                  >
                  <span>{{ prop.checkLabel }}</span>
                </label>
              </template>
            </div>
          </template>
        </template>

        <!-- set_text_reveal: 文本显现动作 -->
        <template v-else-if="action!['type'] === 'set_text_reveal'">
          <div class="delta-property-item">
            <div class="delta-property-header">
              <span class="delta-property-label">动作</span>
            </div>
            <div class="anim-action-row">
              <label
                class="anim-action-option text-reveal-start-option"
                :class="{ active: textRevealParams['action'] === 'play' }"
              >
                <input
                  type="radio"
                  name="text-reveal-action"
                  value="play"
                  :checked="textRevealParams['action'] === 'play'"
                  @change="handleTextRevealParamsChange('action', 'play')"
                >
                <span>⌨ 开始打字</span>
              </label>
              <label
                class="anim-action-option text-reveal-complete-option"
                :class="{ active: textRevealParams['action'] === 'stop' }"
              >
                <input
                  type="radio"
                  name="text-reveal-action"
                  value="stop"
                  :checked="textRevealParams['action'] === 'stop'"
                  @change="handleTextRevealParamsChange('action', 'stop')"
                >
                <span>▣ 显示完整文本</span>
              </label>
            </div>
          </div>
          <div class="delta-property-item">
            <div class="delta-property-header">
              <span class="delta-property-label">效果</span>
            </div>
            <select
              :value="textRevealParams['mode'] ?? 'typewriter'"
              @change="handleTextRevealParamsChange('mode', ($event.target as HTMLSelectElement).value)"
            >
              <option value="typewriter">打字机</option>
            </select>
          </div>
        </template>

        <!-- set_screen_effect / tween_screen_effect: 画面特效参数 -->
        <template v-else-if="action!['type'] === 'set_screen_effect' || action!['type'] === 'tween_screen_effect'">
          <template
            v-for="prop in activeScreenEffectProps"
            :key="prop.key"
          >
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">{{ prop.label }}</span>
                <button
                  class="delta-remove-btn"
                  title="移除"
                  @click="removeScreenEffectProp(prop.key)"
                >
                  ×
                </button>
              </div>
              <!-- 颜色类型 -->
              <template v-if="prop.type === 'color'">
                <div class="color-input-row">
                  <input
                    :value="screenEffectParams[prop.key]"
                    type="color"
                    @input="handleScreenEffectColorChange(prop.key, ($event.target as HTMLInputElement).value)"
                  >
                  <span class="color-hex-label">{{ screenEffectParams[prop.key] ?? '#000000' }}</span>
                </div>
              </template>
              <!-- 范围滑块类型 -->
              <template v-else-if="prop.type === 'range'">
                <div class="range-row">
                  <input
                    v-model.number="screenEffectParams[prop.key]"
                    type="range"
                    :min="prop.min ?? 0"
                    :max="prop.max ?? 1"
                    :step="prop.step ?? 0.1"
                    @input="handleScreenEffectParamsChange"
                  >
                  <span class="value-label">{{ ((screenEffectParams[prop.key] as number) ?? 0).toFixed(2) }}</span>
                </div>
              </template>
              <!-- 选择类型 (holeShape) -->
              <template v-else-if="prop.type === 'select'">
                <select
                  :value="screenEffectParams[prop.key]"
                  @change="handleScreenEffectSelectChange(prop.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="opt in prop.options"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </template>
              <!-- 普通数字类型 -->
              <template v-else>
                <input
                  v-model.number="screenEffectParams[prop.key]"
                  type="number"
                  :step="prop.step ?? 1"
                  @change="handleScreenEffectParamsChange"
                >
              </template>
            </div>
          </template>
          <div
            v-if="activeScreenEffectProps.length === 0"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- set_light / tween_light: 光源参数 (点光源 PRD Phase 0.5) -->
        <template v-else-if="action!['type'] === 'set_light' || action!['type'] === 'tween_light'">
          <template
            v-for="prop in activeLightProps"
            :key="prop.key"
          >
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">{{ prop.label }}</span>
                <button
                  class="delta-remove-btn"
                  title="移除"
                  @click="removeLightProp(prop.key)"
                >
                  ×
                </button>
              </div>
              <!-- 颜色类型 -->
              <template v-if="prop.type === 'color'">
                <div class="color-input-row">
                  <input
                    :value="lightParams[prop.key]"
                    type="color"
                    @input="handleLightColorChange(prop.key, ($event.target as HTMLInputElement).value)"
                  >
                  <span class="color-hex-label">{{ lightParams[prop.key] ?? '#ffffff' }}</span>
                </div>
              </template>
              <!-- 范围滑块类型 -->
              <template v-else-if="prop.type === 'range'">
                <div class="range-row">
                  <input
                    v-model.number="lightParams[prop.key]"
                    type="range"
                    :min="prop.min ?? 0"
                    :max="prop.max ?? 1"
                    :step="prop.step ?? 0.01"
                    @input="handleLightParamsChange"
                  >
                  <span class="value-label">{{ ((lightParams[prop.key] as number) ?? 0).toFixed(2) }}</span>
                </div>
              </template>
              <template v-else-if="prop.type === 'select'">
                <select
                  v-model="lightParams[prop.key]"
                  @change="handleLightParamsChange"
                >
                  <option
                    v-for="option in prop.options ?? []"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </template>
              <!-- 普通数字类型 -->
              <template v-else>
                <input
                  v-model.number="lightParams[prop.key]"
                  type="number"
                  :step="prop.step ?? 1"
                  :min="prop.min"
                  :max="prop.max"
                  @change="handleLightParamsChange"
                >
              </template>
            </div>
          </template>
          <div
            v-if="activeLightProps.length === 0"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- set_text / tween_text: 文本属性 (Text PRD) -->
        <template v-else-if="action!['type'] === 'set_text' || action!['type'] === 'tween_text'">
          <template
            v-for="prop in activeTextProps"
            :key="prop.key"
          >
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">{{ prop.label }}</span>
                <button
                  class="delta-remove-btn"
                  title="移除"
                  @click="removeTextProp(prop.key)"
                >
                  ×
                </button>
              </div>
              <!-- 颜色类型 -->
              <template v-if="prop.type === 'color'">
                <div class="color-input-row">
                  <input
                    :value="textParams[prop.key]"
                    type="color"
                    @input="handleTextColorChange(prop.key, ($event.target as HTMLInputElement).value)"
                  >
                  <span class="color-hex-label">{{ textParams[prop.key] ?? '#ffffff' }}</span>
                </div>
              </template>
              <!-- 选择类型 -->
              <template v-else-if="prop.type === 'select'">
                <select
                  :value="textParams[prop.key]"
                  @change="handleTextSelectChange(prop.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="opt in prop.options"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </template>
              <!-- 文本内容（textarea） -->
              <template v-else-if="prop.type === 'textarea'">
                <textarea
                  :value="(textParams[prop.key] as string) ?? ''"
                  rows="2"
                  class="text-content-input"
                  @input="handleTextContentChange(($event.target as HTMLTextAreaElement).value)"
                />
              </template>
              <!-- 复选框类型 -->
              <template v-else-if="prop.type === 'checkbox'">
                <label class="checkbox-label">
                  <input
                    :checked="(textParams[prop.key] as boolean) ?? false"
                    type="checkbox"
                    @change="textParams[prop.key] = ($event.target as HTMLInputElement).checked; handleTextParamsChange()"
                  >
                  <span>{{ prop.checkLabel }}</span>
                </label>
              </template>
              <!-- 范围滑块类型 -->
              <template v-else-if="prop.type === 'range'">
                <div class="range-row">
                  <input
                    v-model.number="textParams[prop.key]"
                    type="range"
                    :min="prop.min ?? 0"
                    :max="prop.max ?? 100"
                    :step="prop.step ?? 1"
                    @input="handleTextParamsChange"
                  >
                  <span class="value-label">{{ ((textParams[prop.key] as number) ?? 0) }}</span>
                </div>
              </template>
              <!-- 普通数字类型 -->
              <template v-else>
                <input
                  v-model.number="textParams[prop.key]"
                  type="number"
                  :step="prop.step ?? 1"
                  :min="prop.min"
                  :max="prop.max"
                  @change="handleTextParamsChange"
                >
              </template>
            </div>
          </template>
          <!-- gradientStops: 渐变色标（fillType 为 linear_gradient 时显示） -->
          <template v-if="textParams['fillType'] === 'linear_gradient'">
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">起始色</span>
              </div>
              <div class="color-input-row">
                <input
                  :value="textGradientStartColor"
                  type="color"
                  @input="handleTextGradientStopChange(0, ($event.target as HTMLInputElement).value)"
                >
                <span class="color-hex-label">{{ textGradientStartColor }}</span>
              </div>
            </div>
            <div class="delta-property-item">
              <div class="delta-property-header">
                <span class="delta-property-label">结束色</span>
              </div>
              <div class="color-input-row">
                <input
                  :value="textGradientEndColor"
                  type="color"
                  @input="handleTextGradientStopChange(1, ($event.target as HTMLInputElement).value)"
                >
                <span class="color-hex-label">{{ textGradientEndColor }}</span>
              </div>
            </div>
          </template>
          <div
            v-if="activeTextProps.length === 0"
            class="empty-props-hint"
          >
            暂无变更属性，点击下方添加
          </div>
        </template>

        <!-- v11.0: set_anim - Animation 控制 -->
        <!-- v11.52: 改为按需添加模式，用户只添加需要控制的动画 -->
        <template v-else-if="action!['type'] === 'set_anim'">
          <div class="v11-anim-editor">
            <!-- 已添加的动画控制列表 -->
            <div v-if="currentAnimations.length > 0" class="anim-list">
              <div 
                v-for="(animItem, index) in currentAnimations" 
                :key="animItem.animName" 
                class="anim-list-item"
              >
                <div class="anim-header">
                  <span class="anim-name">🎬 {{ animItem.animName }}</span>
                  <label v-if="animItem.action !== 'stop'" class="anim-option-checkbox">
                    <input
                      type="checkbox"
                      :checked="animItem.autoStopOnBlockEnd ?? true"
                      @change="handleAnimAutoStopChange(index, ($event.target as HTMLInputElement).checked)"
                    >
                    <span>本段结束后自动停止</span>
                  </label>
                </div>
                <!-- v12.x: 控制行（按钮 + 循环选项） -->
                <div class="anim-controls-row">
                  <div class="anim-controls">
                    <button
                      class="anim-action-btn"
                      :class="{ active: animItem.action === 'play' }"
                      title="播放"
                      @click="handleSetAnimAction(animItem.animName, 'play')"
                    >▶</button>
                    <button
                      class="anim-action-btn"
                      :class="{ active: animItem.action === 'stop' }"
                      title="停止"
                      @click="handleSetAnimAction(animItem.animName, 'stop')"
                    >⏹</button>
                    <button
                      class="anim-remove-btn"
                      title="移除"
                      @click="removeAnimFromAction(index)"
                    >🗑️</button>
                  </div>
                  <select
                    v-if="animItem.action !== 'stop'"
                    :value="animItem.loop === undefined ? '' : String(animItem.loop)"
                    class="anim-loop-select"
                    @change="handleAnimLoopOverrideChange(index, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">跟随动画定义</option>
                    <option value="true">循环</option>
                    <option value="false">不循环</option>
                  </select>
                </div>
                <div
                  v-if="animItem.action !== 'stop'"
                  class="anim-timing-row"
                >
                  <span class="anim-timing-label">播放方式</span>
                  <select
                    :value="animItem.timingMode ?? ''"
                    class="anim-timing-select"
                    @change="handleAnimTimingModeChange(index, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">跟随动画定义</option>
                    <option value="continuous">连续播放</option>
                    <option value="tts_speech">跟随 TTS 有声片段</option>
                  </select>
                </div>
              </div>
            </div>
            
            <!-- 空状态提示 -->
            <div v-else class="empty-props-hint">
              💡 点击下方按钮添加要控制的动画
            </div>
            
            <!-- 添加动画控制按钮 -->
            <div v-if="availableAnimationsToAdd.length > 0" class="add-anim-section">
              <button
                class="add-anim-btn"
                @click="showAddAnimMenu = !showAddAnimMenu"
              >
                + 添加动画控制
              </button>
              <div v-if="showAddAnimMenu" class="add-anim-menu">
                <button 
                  v-for="anim in availableAnimationsToAdd" 
                  :key="anim.id" 
                  class="add-anim-option"
                  @click="addAnimToAction(anim.name)"
                >
                  🎬 {{ anim.name }}
                </button>
              </div>
            </div>
            
            <!-- 无可用动画 -->
            <div v-else-if="availableAnimations.length === 0" class="empty-props-hint">
              ⚠️ 该对象暂无可用的 Animation
            </div>
          </div>
        </template>

        <!-- v16: set_material - 元件素材切换 / v18: 表情引用切换 -->
        <template v-else-if="action!['type'] === 'set_material'">
          <div class="delta-property-item">
            <div class="delta-property-header">
              <span class="delta-property-label">{{ targetIsExpression ? '目标表情' : '目标素材' }}</span>
            </div>
            <!-- Symbol: 素材下拉列表 -->
            <template v-if="!targetIsExpression">
              <select
                :value="(action as SetMaterialAction).params.materialId"
                class="inspector-select"
                @change="handleMaterialIdChange(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="mat in targetSymbolMaterials"
                  :key="mat.id"
                  :value="mat.id"
                >
                  {{ mat.name }} ({{ mat.type === 'static' ? '静态' : '动画' }})
                </option>
                <option v-if="targetSymbolMaterials.length === 0" disabled value="">
                  暂无素材
                </option>
              </select>
            </template>
            <!-- Expression: 表情下拉列表 -->
            <template v-else>
              <select
                :value="(action as SetMaterialAction).params.materialId"
                class="inspector-select"
                @change="handleMaterialIdChange(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="expr in targetExpressionList"
                  :key="expr.id"
                  :value="expr.id"
                >
                  {{ expr.name }}
                </option>
                <option v-if="targetExpressionList.length === 0" disabled value="">
                  暂无表情
                </option>
              </select>
            </template>
          </div>
        </template>
      </div>

      <!-- 添加属性按钮 (v6.3) - v9.2: Death Action 不显示 -->
      <div v-if="!isCurrentDeathAction" class="add-property-section">
        <template v-if="availablePropsToAdd.length > 0">
          <button
            class="add-property-btn"
            @click="showAddPropertyMenu = !showAddPropertyMenu"
          >
            + 编辑属性
          </button>
          <div
            v-if="showAddPropertyMenu"
            class="add-property-menu"
          >
            <button 
              v-for="prop in availablePropsToAdd" 
              :key="prop.key" 
              class="add-property-option"
              @click="addProperty(prop.key)"
            >
              {{ prop.label }}
            </button>
          </div>
        </template>
        <!-- v11.0: set_anim 不再需要“添加属性”功能，Animation 在人物编辑器中管理 -->
      </div>
      
      <!-- 删除动作按钮 -->
      <div class="delete-action-section">
        <button
          class="delete-action-btn"
          @click="handleDeleteAction"
        >
          🗑️ 删除此动作
        </button>
      </div>
    </div>

    <!-- 表情选择对话框 -->
    <ExpressionSelectorDialog
      v-if="showExpressionDialog"
      @select="handleExpressionSelect"
      @close="showExpressionDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useAnimationStore } from '@/stores/animationStore'
import { useExpressionStore } from '@/stores/expressionStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import type { AnimationTimingMode } from '@/types/animation'
import type { CameraObject, CompositeObject, LightObject, MaskObject, SceneObject, ScreenEffectObject, SymbolObject } from '@/types/sceneObject'
import type { Action, ActionType, BaseDurationAction, RuntimeSlot, SceneStructureOperation, SetAnimAction, SetMaterialAction, SetSceneStructureParams } from '@/types/screenplay'
import type { SetLifecycleAction } from '@/types/screenplay'
import { SCENE_ACTION_TARGET } from '@/types/screenplay'
import { isBirthAction, isDeathAction } from '@/utils/actionHelpers'
import { isAllowedMaskTargetType } from '@/utils/maskUtils'

import ExpressionSelectorDialog from './screenplay/ExpressionSelectorDialog.vue'

interface InspectorPropDef {
  key: string
  label: string
  type: string
  step?: number
  min?: number
  max?: number
  checkLabel?: string
  options?: { value: string; label: string }[]
}

const props = defineProps<{
  action: Action | null
  blockDuration: number // Block总时长（毫秒）
  slots: RuntimeSlot[] // 槽位列表
  // v7.55: 从 ObjectPropertiesPanel 进入时要自动聚焦的字段
  focusField?: 'pose' | 'layerPreset' | 'expression' | 'partAsset' | null
  // v9.3: 当前 slot 下有生命的对象 ID 列表（用于过滤 camera_follow 跟随目标）
  aliveObjectIds?: string[]
  // v11.1: 场景上下文，用于获取场景级动画
  episodeId?: string | undefined
  sceneId?: string | undefined
}>()

const emit = defineEmits<{
  update: [updates: Partial<Action>]
  delete: []
}>()

const expressionStore = useExpressionStore()
const sceneObjectStore = useSceneObjectStore()
const animationStore = useAnimationStore()

const showExpressionDialog = ref(false)
const showAddPropertyMenu = ref(false)

interface SceneStructureParentEntry {
  objectId: string
  parentId: string | null
}

interface SceneStructureSpawnedEntry {
  objectId: string
  spawned: boolean
}

interface SceneStructureOperationGroup {
  id: string
  operation: SceneStructureOperation
  title: string
  hint: string
  parentEntries: SceneStructureParentEntry[]
  spawnedEntries: SceneStructureSpawnedEntry[]
}

function getSceneObject(id: string): SceneObject | undefined {
  return sceneObjectStore.getObject(id)
}

function getObjectDisplayName(id: string | null): string {
  if (!id) return '无父级'
  if (id === SCENE_ACTION_TARGET) return '当前场景'
  const obj = getSceneObject(id)
  if (!obj) return id
  return obj.alias?.trim() || obj.name?.trim() || id
}

const sceneStructureParams = computed<SetSceneStructureParams>(() => {
  if (props.action?.type !== 'set_scene_structure') {
    return { operations: [] }
  }
  return props.action.params
})

function sortSceneStructureParentEntries(entries: SceneStructureParentEntry[]): SceneStructureParentEntry[] {
  return [...entries].sort((a, b) => {
    const aObj = getSceneObject(a.objectId)
    const bObj = getSceneObject(b.objectId)
    const aRank = aObj?.type === 'composite' ? 0 : 1
    const bRank = bObj?.type === 'composite' ? 0 : 1
    return aRank - bRank || getObjectDisplayName(a.objectId).localeCompare(getObjectDisplayName(b.objectId), 'zh-Hans-CN')
  })
}

function getSceneStructureOperationTitle(operation: SceneStructureOperation): string {
  if (operation.kind === 'group') return '成组操作'
  if (operation.kind === 'ungroup') return '拆分组合'
  return '父级调整'
}

function getSceneStructureOperationHint(operation: SceneStructureOperation): string {
  if (operation.kind === 'group') return '启用组合并挂入成员，作为一次整体操作执行'
  if (operation.kind === 'ungroup') return '停用组合并恢复成员父级关系，作为一次整体操作执行'
  return '调整对象归属关系，作为一次整体操作执行'
}

const sceneStructureOperationGroups = computed<SceneStructureOperationGroup[]>(() => {
  return sceneStructureParams.value.operations.map((operation) => {
    const parentEntries: SceneStructureParentEntry[] = []
    const spawnedEntries: SceneStructureSpawnedEntry[] = []

    if (operation.kind === 'group') {
      parentEntries.push({ objectId: operation.groupId, parentId: operation.parentId })
      for (const memberId of operation.memberIds) {
        parentEntries.push({ objectId: memberId, parentId: operation.groupId })
      }
      spawnedEntries.push({ objectId: operation.groupId, spawned: true })
    } else if (operation.kind === 'ungroup') {
      parentEntries.push({ objectId: operation.groupId, parentId: operation.groupParentId })
      for (const memberId of operation.memberIds) {
        parentEntries.push({ objectId: memberId, parentId: operation.restoreParentId })
      }
      spawnedEntries.push({ objectId: operation.groupId, spawned: false })
    } else {
      for (const objectId of operation.objectIds) {
        parentEntries.push({ objectId, parentId: operation.parentId })
      }
    }

    return {
      id: operation.id,
      operation,
      title: getSceneStructureOperationTitle(operation),
      hint: getSceneStructureOperationHint(operation),
      parentEntries: sortSceneStructureParentEntries(parentEntries),
      spawnedEntries,
    }
  })
})

const sceneStructureChangeCount = computed(() =>
  sceneStructureOperationGroups.value.reduce(
    (count, group) => count + group.parentEntries.length + group.spawnedEntries.length,
    0,
  )
)

function commitSceneStructureOperations(operations: SceneStructureOperation[]): void {
  if (operations.length === 0) {
    emit('delete')
    return
  }

  emit('update', { params: { operations } })
}

function isSceneStructureAutoRestoreEnabled(operation: SceneStructureOperation): boolean {
  return operation.kind !== 'group' || operation.autoRestoreOnBlockEnd !== false
}

function handleSceneStructureAutoRestoreChange(operationId: string, autoRestoreOnBlockEnd: boolean): void {
  const operations = sceneStructureParams.value.operations.map((operation) => {
    if (operation.id !== operationId || operation.kind !== 'group') return operation
    const nextOperation = { ...operation }
    if (autoRestoreOnBlockEnd) {
      delete nextOperation.autoRestoreOnBlockEnd
    } else {
      nextOperation.autoRestoreOnBlockEnd = false
    }
    return nextOperation
  })
  commitSceneStructureOperations(operations)
}

function removeSceneStructureOperation(group: SceneStructureOperationGroup): void {
  commitSceneStructureOperations(sceneStructureParams.value.operations.filter(operation => operation.id !== group.id))
}

// 删除动作
function handleDeleteAction() {
  if (props.action) {
    emit('delete')
  }
}

// ==================== 属性定义 (v6.3) ====================

// 视觉属性定义 (set_character 使用，包含 alpha 和 visible/flipX/zIndex)
const VISUAL_PROPS: InspectorPropDef[] = [
  { key: 'alpha', label: '透明度', type: 'range', step: 0.1 },
  { key: 'visible', label: '可见性', type: 'checkbox', checkLabel: '显示' },
  { key: 'flipX', label: '翻转', type: 'checkbox', checkLabel: '水平翻转' },
  { key: 'zIndex', label: '层级', type: 'number', step: 1 },
]

// v9.3: set_transform 仅支持透明度属性（其余视觉属性由 set_visual 处理）
const TRANSFORM_VISUAL_PROPS: InspectorPropDef[] = [
  { key: 'alpha', label: '透明度', type: 'range', step: 0.1 },
]

// 几何属性定义 (tween_transform)
const GEOMETRY_PROPS: InspectorPropDef[] = [
  { key: 'x', label: '目标 X', type: 'number', step: 1 },
  { key: 'y', label: '目标 Y', type: 'number', step: 1 },
  { key: 'scaleX', label: '目标缩放X', type: 'percent', step: 1 },
  { key: 'scaleY', label: '目标缩放Y', type: 'percent', step: 1 },
  { key: 'rotation', label: '旋转 (度)', type: 'degree', step: 1 },
]

// 变换原点属性（仅 set_transform 使用，tween_transform 不支持）
const TRANSFORM_ORIGIN_PROPS: InspectorPropDef[] = [
  { key: 'transformOriginX', label: '变换点 X', type: 'number', step: 1 },
  { key: 'transformOriginY', label: '变换点 Y', type: 'number', step: 1 },
]

// 音频属性定义
const AUDIO_PROPS: InspectorPropDef[] = [
  { key: 'volume', label: '音量', type: 'range', step: 0.05, min: 0, max: 1 },
  { key: 'loop', label: '循环', type: 'checkbox', checkLabel: '循环播放' },
  { key: 'fadeIn', label: '淡入 (秒)', type: 'number', step: 0.1, min: 0 },
  { key: 'fadeOut', label: '淡出 (秒)', type: 'number', step: 0.1, min: 0 }
]

// 画面特效属性定义
const SCREEN_EFFECT_PROPS: InspectorPropDef[] = [
  { key: 'baseColor', label: '🎨 遮罩颜色', type: 'color' },
  { key: 'holeShape', label: '🔲 挖孔形状', type: 'select', options: [
    { value: 'circle', label: '圆形' },
    { value: 'horizontal_ellipse', label: '水平椭圆' },
    { value: 'vertical_ellipse', label: '垂直椭圆' },
    { value: 'rectangle', label: '矩形' },
  ] },
  { key: 'openRatio', label: '开孔比例', type: 'range', step: 0.01, min: 0, max: 1 },
  { key: 'holeWidth', label: '孔洞宽度', type: 'number', step: 10, min: 0 },
  { key: 'holeHeight', label: '孔洞高度', type: 'number', step: 10, min: 0 },
]

// 光源属性定义 (点光源 PRD Phase 0.5)
const LIGHT_PROPS: InspectorPropDef[] = [
  { key: 'lightColor', label: '💡 光照颜色', type: 'color' },
  { key: 'lightIntensity', label: '强度', type: 'range', step: 0.01, min: 0, max: 2 },
  { key: 'lightRadius', label: '半径 (px)', type: 'range', step: 10, min: 50, max: 3000 },
  { key: 'flicker', label: '闪烁强度', type: 'range', step: 0.05, min: 0, max: 1 },
  { key: 'flickerSpeed', label: '闪烁速度', type: 'range', step: 0.05, min: 0, max: 1 },
  { key: 'directionAngle', label: '方向角 (rad)', type: 'range', step: 0.01, min: -3.14, max: 3.14 },
  { key: 'coneAngle', label: '开角 (°)', type: 'range', step: 5, min: 10, max: 360 },
]

// 文本属性定义 (Text PRD: set_text / tween_text)
const TEXT_PROPS: InspectorPropDef[] = [
  { key: 'content', label: '📝 内容', type: 'textarea' },
  { key: 'fontFamily', label: '🔤 字体', type: 'select', options: [
    { value: 'Noto Sans SC', label: '思源黑体' },
    { value: 'Noto Serif SC', label: '思源宋体' },
    { value: 'LXGW WenKai', label: '霞鹜文楷' },
    { value: 'ZCOOL QingKe HuangYou', label: '站酷庆科黄油体' },
    { value: 'Ma Shan Zheng', label: '马善政楷书' },
  ] },
  { key: 'fontSize', label: '🔢 字号', type: 'number', step: 1, min: 8 },
  { key: 'color', label: '🎨 颜色', type: 'color' },
  { key: 'align', label: '↔ 对齐', type: 'select', options: [
    { value: 'left', label: '左对齐' },
    { value: 'center', label: '居中' },
    { value: 'right', label: '右对齐' },
  ] },
  { key: 'fontWeight', label: '𝐁 粗细', type: 'select', options: [
    { value: 'normal', label: '正常' },
    { value: 'bold', label: '加粗' },
  ] },
  { key: 'fontStyle', label: '𝐼 样式', type: 'select', options: [
    { value: 'normal', label: '正常' },
    { value: 'italic', label: '斜体' },
  ] },
  { key: 'stroke', label: '描边颜色', type: 'color' },
  { key: 'strokeThickness', label: '描边粗细', type: 'number', step: 1, min: 0 },
  { key: 'letterSpacing', label: '字距', type: 'number', step: 1 },
  { key: 'lineHeight', label: '行高', type: 'number', step: 1, min: 0 },
  { key: 'wordWrap', label: '自动换行', type: 'checkbox', checkLabel: '启用' },
  { key: 'wordWrapWidth', label: '换行宽度', type: 'number', step: 10, min: 50 },
  { key: 'textBoxMode', label: '文本框模式', type: 'select', options: [
    { value: 'auto-size', label: '自动尺寸' },
    { value: 'auto-width', label: '自动宽度' },
    { value: 'auto-height', label: '自动高度' },
    { value: 'fixed', label: '固定尺寸' },
  ] },
  { key: 'writingMode', label: '书写方向', type: 'select', options: [
    { value: 'horizontal', label: '横排' },
    { value: 'vertical', label: '竖排' },
  ] },
  // 投影
  { key: 'dropShadow', label: '文字投影', type: 'checkbox', checkLabel: '启用' },
  { key: 'dropShadowColor', label: '投影颜色', type: 'color' },
  { key: 'dropShadowBlur', label: '投影模糊', type: 'number', step: 1, min: 0 },
  { key: 'dropShadowAngle', label: '投影角度', type: 'number', step: 0.1 },
  { key: 'dropShadowDistance', label: '投影距离', type: 'number', step: 1, min: 0 },
  // 渐变
  { key: 'fillType', label: '渐变填充', type: 'select', options: [
    { value: '', label: '关闭' },
    { value: 'linear_gradient', label: '线性渐变' },
  ] },
  { key: 'gradientAngle', label: '渐变角度 (°)', type: 'number', step: 1 },
  { key: 'revealSpeed', label: '⌨ 速度 (字/秒)', type: 'number', step: 0.5, min: 0.5 },
  // 背景填充
  { key: 'textBackgroundEnabled', label: '背景填充', type: 'checkbox', checkLabel: '启用' },
  { key: 'textBackgroundColor', label: '背景颜色', type: 'color' },
  { key: 'textBackgroundAlpha', label: '背景透明度', type: 'range', step: 0.05, min: 0, max: 1 },
  { key: 'textBackgroundPaddingX', label: '背景水平内边距', type: 'number', step: 1, min: 0 },
  { key: 'textBackgroundPaddingY', label: '背景垂直内边距', type: 'number', step: 1, min: 0 },
  { key: 'textBackgroundRadius', label: '背景圆角', type: 'number', step: 1, min: 0 },
]

// tween_text 不可插值的属性（仅 set_text 使用）
const TEXT_NON_INTERPOLATABLE_KEYS = [
  'content', 'fontFamily', 'align', 'fontWeight', 'fontStyle', 'stroke',
  'wordWrap', 'textBoxMode', 'writingMode', 'dropShadow',
  'fillType', 'textBackgroundEnabled', 'textBackgroundColor',
  'dropShadowColor',
]

// 不可插值的属性 key（tween_screen_effect 不应出现这些属性）
const NON_INTERPOLATABLE_KEYS = ['baseColor', 'holeShape']

// effectClass → 可编辑属性 key 映射
const EFFECT_CLASS_ALLOWED_KEYS: Record<string, string[]> = {
  fullscreen_cover: ['baseColor'],
  iris_mask: ['baseColor', 'holeShape', 'openRatio', 'holeWidth', 'holeHeight'],
  spotlight: ['baseColor', 'holeShape', 'openRatio', 'holeWidth', 'holeHeight'],
}

// 获取当前 action 目标对象的 effectClass
const targetEffectClass = computed(() => {
  const action = props.action
  if (!action) return undefined
  if (action.type !== 'set_screen_effect' && action.type !== 'tween_screen_effect') return undefined
  const obj = sceneObjectStore.getObject(action.target)
  if (obj?.type === 'screen_effect') {
    return (obj as ScreenEffectObject).effectClass
  }
  return undefined
})

// 根据 effectClass 过滤后的属性定义
const filteredScreenEffectProps = computed(() => {
  const ec = targetEffectClass.value
  let base = SCREEN_EFFECT_PROPS
  if (ec) {
    const allowedKeys = EFFECT_CLASS_ALLOWED_KEYS[ec]
    if (allowedKeys) {
      base = SCREEN_EFFECT_PROPS.filter(prop => allowedKeys.includes(prop.key))
    }
  }
  // tween_screen_effect: 排除不可插值的属性（baseColor, holeShape）
  if (props.action?.type === 'tween_screen_effect') {
    return base.filter(prop => !NON_INTERPOLATABLE_KEYS.includes(prop.key))
  }
  return base
})


interface LooseObject {
  [key: string]: unknown
  alpha?: number
  visible?: boolean
  flipX?: boolean
  zIndex?: number
  x?: number
  y?: number
  scale?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  zoom?: number
  action?: string
  volume?: number
  loop?: boolean
  fadeIn?: number
  fadeOut?: number
}

// 视觉参数
const visualParams = ref<LooseObject>({})

// 几何参数
const geometryParams = ref<LooseObject>({})

// 音频参数
const audioParams = ref<LooseObject>({})
const textRevealParams = ref<{ action: 'play' | 'stop'; mode: 'typewriter' }>({
  action: 'play',
  mode: 'typewriter',
})

// 画面特效参数
const screenEffectParams = ref<LooseObject>({})

// 光源参数 (点光源 PRD Phase 0.5)
const lightParams = ref<LooseObject>({})

// 文本属性参数 (Text PRD)
const textParams = ref<LooseObject>({})

// v9.3: set_visual 专用属性定义（不含 alpha，alpha 由 set_transform 处理）
const SET_VISUAL_PROPS: InspectorPropDef[] = [
  { key: 'visible', label: '可见性', type: 'checkbox', checkLabel: '显示' },
  { key: 'flipX', label: '翻转', type: 'checkbox', checkLabel: '水平翻转' },
  { key: 'zIndex', label: '层级', type: 'number', step: 1 },
  { key: 'receiveLighting', label: '场景光照', type: 'checkbox', checkLabel: '参与场景光照' },
  { key: 'castShadow', label: '脚底投影', type: 'checkbox', checkLabel: '投射阴影' },
]

// v9.3: set_visual 参数
const setVisualParams = ref<LooseObject>({})

// P2: set_composite 参数
const compositeParams = ref<{ renderChain?: string[] | undefined }>({})

// Clip-Mask Phase 1 D3: set_mask 参数
const maskParams = ref<{ targetIds?: string[]; shape?: 'rectangle' | 'ellipse'; width?: number; height?: number }>({})
const maskTargetAddSelection = ref<string>('')

// 相机参数
const cameraParams = ref({ x: 0, y: 0, zoom: 1 })

// 相机 zoom 百分数显示（zoom * 100）
const cameraZoomPercent = computed(() => {
  return Math.round(cameraParams.value.zoom * 100)
})

// 监听 action 变化，更新参数
// v6.6: 添加 deep: true 以监听 action['params'] 的变化（用于拖动相机框时实时更新）
watch(() => props.action, (newAction) => {
  if (!newAction) {
    visualParams.value = {}
    geometryParams.value = {}
    return
  }
  
  const params = ('params' in newAction ? newAction.params : {}) as unknown as LooseObject
  
  if (newAction.type === 'set_transform') {
      visualParams.value = {
        alpha: params.alpha,
        visible: params.visible,
        flipX: params.flipX,
        zIndex: params.zIndex,
      } as LooseObject
    
    // v9.2: set_transform 也支持几何属性
    if (newAction.type === 'set_transform') {
      let currentScaleX: number | undefined = undefined
      let currentScaleY: number | undefined = undefined
      
      // 兼容历史遗留的单轴 scale 参数
      if (params.scale !== undefined) {
         currentScaleX = currentScaleY = Math.round((params.scale) * 100)
      } else {
         if (params.scaleX !== undefined) currentScaleX = Math.round((params.scaleX) * 100)
         if (params.scaleY !== undefined) currentScaleY = Math.round((params.scaleY) * 100)
         // 如果旧数据里只有 scaleX 没有 scaleY，则让他们默认相等
         if (currentScaleX !== undefined && currentScaleY === undefined) currentScaleY = currentScaleX
      }

      geometryParams.value = {
        x: params.x !== undefined ? Math.round(params.x) : undefined,
        y: params.y !== undefined ? Math.round(params.y) : undefined,
        scaleX: currentScaleX,
        scaleY: currentScaleY,
        rotation: params.rotation !== undefined ? Math.round((params.rotation) * 180 / Math.PI) : undefined,
        transformOriginX: params['transformOriginX'],
        transformOriginY: params['transformOriginY'],
      } as LooseObject
    }
  }
  
  if (newAction.type === 'tween_transform') {
    let currentScaleX: number | undefined = undefined
    let currentScaleY: number | undefined = undefined
    
    // 兼容历史遗留的单轴 scale 参数
    if (params.scale !== undefined) {
        currentScaleX = currentScaleY = Math.round((params.scale) * 100)
    } else {
        if (params.scaleX !== undefined) currentScaleX = Math.round((params.scaleX) * 100)
        if (params.scaleY !== undefined) currentScaleY = Math.round((params.scaleY) * 100)
        if (currentScaleX !== undefined && currentScaleY === undefined) currentScaleY = currentScaleX
    }

    geometryParams.value = {
      x: params.x !== undefined ? Math.round(params.x) : undefined,
      y: params.y !== undefined ? Math.round(params.y) : undefined,
      scaleX: currentScaleX,
      scaleY: currentScaleY,
      rotation: params.rotation !== undefined ? Math.round((params.rotation) * 180 / Math.PI) : undefined,
      alpha: params.alpha,
    } as LooseObject
  }
  
  if (newAction.type === 'camera_cut' || newAction.type === 'camera_move') {
    cameraParams.value = {
      x: Math.round(params.x ?? 0),
      y: Math.round(params.y ?? 0),
      zoom: Math.round((params.zoom ?? 1) * 10) / 10,
    }
  }

  if (newAction.type === 'set_audio') {
    audioParams.value = {
      action: params.action ?? 'play',
      volume: params.volume,
      loop: params.loop,
      fadeIn: params.fadeIn,
      fadeOut: params.fadeOut
    } as LooseObject
  }

  if (newAction.type === 'set_text_reveal') {
    const action = params.action === 'stop' ? 'stop' : 'play'
    textRevealParams.value = {
      action,
      mode: 'typewriter',
    }
  }
  
  // v9.3: set_visual 初始化
  if (newAction.type === 'set_visual') {
    setVisualParams.value = {
      visible: params.visible,
      flipX: params.flipX,
      zIndex: params.zIndex,
      receiveLighting: params['receiveLighting'],
      castShadow: params['castShadow'],
    } as LooseObject
  }

  // P2: set_composite 初始化
  if (newAction.type === 'set_composite') {
    const compositeAction = newAction
    compositeParams.value = {
      renderChain: compositeAction.params.renderChain ?? undefined,
    }
  }

  // Clip-Mask Phase 1 D3: set_mask 初始化
  if (newAction.type === 'set_mask') {
    const maskAction = newAction
    maskParams.value = {
      ...(maskAction.params.targetIds !== undefined ? { targetIds: [...maskAction.params.targetIds] } : {}),
      ...(maskAction.params.shape !== undefined ? { shape: maskAction.params.shape } : {}),
      ...(maskAction.params.width !== undefined ? { width: maskAction.params.width } : {}),
      ...(maskAction.params.height !== undefined ? { height: maskAction.params.height } : {}),
    }
    maskTargetAddSelection.value = ''
  }

  // 画面特效参数初始化
  if (newAction.type === 'set_screen_effect' || newAction.type === 'tween_screen_effect') {
    screenEffectParams.value = { ...params } as LooseObject
  }

  // 光源参数初始化 (点光源 PRD Phase 0.5)
  if (newAction.type === 'set_light' || newAction.type === 'tween_light') {
    lightParams.value = { ...params } as LooseObject
  }

  // 文本参数初始化 (Text PRD)
  if (newAction.type === 'set_text' || newAction.type === 'tween_text') {
    textParams.value = { ...params } as LooseObject
  }
}, { immediate: true, deep: true })

// 当前已激活的视觉属性 (只有值不为 undefined 的)
const activeVisualProps = computed(() => {
  return VISUAL_PROPS.filter(prop => visualParams.value[prop.key] !== undefined)
})

// 当前已激活的几何属性
const activeGeometryProps = computed(() => {
  const base = GEOMETRY_PROPS.filter(prop => geometryParams.value[prop.key] !== undefined)
  // 变换原点仅 set_transform 显示
  if (props.action?.type === 'set_transform') {
    const originProps = TRANSFORM_ORIGIN_PROPS.filter(prop => geometryParams.value[prop.key] !== undefined)
    return [...base, ...originProps]
  }
  return base
})

// tween_transform 的所有已激活属性（几何 + 透明度）
const activeTweenProps = computed(() => {
  const allProps = [...GEOMETRY_PROPS, ...TRANSFORM_VISUAL_PROPS]
  return allProps.filter(prop => geometryParams.value[prop.key] !== undefined)
})

// 当前已激活的音频属性
const activeAudioProps = computed(() => {
  return AUDIO_PROPS.filter(prop => audioParams.value[prop.key] !== undefined)
})

// 当前已激活的画面特效属性
const activeScreenEffectProps = computed(() => {
  return filteredScreenEffectProps.value.filter(prop => screenEffectParams.value[prop.key] !== undefined)
})

// v9.3: activeVisualPropsForSetVisual 已移除，改用模板硬编码方式显示 set_visual 属性

// 可添加的属性列表
const availablePropsToAdd = computed(() => {
  if (!props.action) return []
  
  // set_character 已移除
  
  // v9.3: set_transform 仅支持透明度 + 几何属性（其余视觉属性由 set_visual 处理）
  if (props.action.type === 'set_transform') {
    const availableVisual = TRANSFORM_VISUAL_PROPS.filter(prop => visualParams.value[prop.key] === undefined)
    const availableGeometry = GEOMETRY_PROPS.filter(prop => geometryParams.value[prop.key] === undefined)
    const availableOrigin = TRANSFORM_ORIGIN_PROPS.filter(prop => geometryParams.value[prop.key] === undefined)
    return [...availableGeometry, ...availableOrigin, ...availableVisual]
  }
  
  if (props.action.type === 'tween_transform') {
    const availableGeometry = GEOMETRY_PROPS.filter(prop => geometryParams.value[prop.key] === undefined)
    const availableAlpha = TRANSFORM_VISUAL_PROPS.filter(prop => geometryParams.value[prop.key] === undefined)
    return [...availableGeometry, ...availableAlpha]
  }

  if (props.action.type === 'set_audio') {
    return AUDIO_PROPS.filter(prop => audioParams.value[prop.key] === undefined)
  }

  // v9.3: set_visual 可添加视觉属性
  if (props.action.type === 'set_visual') {
    return SET_VISUAL_PROPS.filter(prop =>
      setVisualParams.value[prop.key] === undefined && canAddSetVisualProp(prop.key)
    )
  }
  
  // v11.0: set_anim 不再通过添加属性方式管理，返回空列表
  if (props.action.type === 'set_anim') {
    return []
  }

  // P2: set_composite 可添加组合属性
  if (props.action.type === 'set_composite') {
    return SET_COMPOSITE_PROPS.filter(prop => {
      const key = prop.key as keyof typeof compositeParams.value
      return compositeParams.value[key] === undefined
    })
  }

  // Clip-Mask Phase 1 D3: set_mask 可添加属性
  if (props.action.type === 'set_mask') {
    return SET_MASK_PROPS.filter(prop => {
      const key = prop.key as keyof typeof maskParams.value
      return maskParams.value[key] === undefined
    })
  }

  // 画面特效参数
  if (props.action.type === 'set_screen_effect' || props.action.type === 'tween_screen_effect') {
    return filteredScreenEffectProps.value.filter(prop => screenEffectParams.value[prop.key] === undefined)
  }

  // 文本属性 (Text PRD)
  if (props.action.type === 'set_text' || props.action.type === 'tween_text') {
    return filteredTextProps.value.filter(prop => textParams.value[prop.key] === undefined)
  }

  // 光源参数 (点光源 PRD Phase 0.5)
  if (props.action.type === 'set_light' || props.action.type === 'tween_light') {
    return filteredLightProps.value.filter(prop => lightParams.value[prop.key] === undefined)
  }
  
  return []
})

// 添加属性
function addProperty(key: string) {
  if (!props.action) return
  
  if (props.action.type === 'set_transform') {
    // v9.3: set_transform 仅支持透明度 + 几何属性
    const visualProp = TRANSFORM_VISUAL_PROPS.find(p => p.key === key)
    if (visualProp) {
      // TRANSFORM_VISUAL_PROPS 目前只有 alpha (range 类型)，默认值为 1
      visualParams.value[key] = 1
      handleVisualParamsChange()
    } else {
      // 几何属性
      // 几何属性
      if (key === 'scaleX' || key === 'scaleY') {
        geometryParams.value[key] = 100
      } else {
        geometryParams.value[key] = 0
      }
      handleSetTransformGeometryChange()
    }
  } else if (props.action.type === 'tween_transform') {
    // scale 默认值为 100%，rotation 默认值为 0 度，alpha 默认值为 1
    if (key === 'scaleX' || key === 'scaleY') {
      geometryParams.value[key] = 100
    } else if (key === 'alpha') {
      geometryParams.value[key] = 1
    } else {
      geometryParams.value[key] = 0
    }
    handleGeometryParamsChange()
  } else if (props.action.type === 'set_audio') {
    const prop = AUDIO_PROPS.find(p => p.key === key)
    if (prop) {
       const defaultValue = prop.type === 'checkbox' ? false : (prop.key === 'volume' ? 1.0 : 0)
       handleAudioParamsChange(key, defaultValue)
    }
  } else if (props.action.type === 'set_anim') {
    // v11.0: set_anim 不再通过此方式添加属性
  } else if (props.action.type === 'set_visual') {
    // v9.3: 添加 set_visual 属性
    const prop = SET_VISUAL_PROPS.find(p => p.key === key)
    if (prop && canAddSetVisualProp(key)) {
      setVisualParams.value[key] = prop.type === 'checkbox' ? false : 0
      handleSetVisualParamsChange()
    }
  } else if (props.action.type === 'set_composite') {
    // P2: 添加 set_composite 属性
    if (key === 'renderChain') {
      // 从目标 composite 对象的运行时 renderChain 读取默认值
      const targetObj = sceneObjectStore.getObject(props.action.target)
      const currentRenderChain = targetObj?.type === 'composite'
        ? [...((targetObj as CompositeObject).renderChain ?? [])]
        : []
      compositeParams.value.renderChain = currentRenderChain
      handleCompositeParamsChange()
    }
  } else if (props.action.type === 'set_mask') {
    // Clip-Mask Phase 1 D3: 添加 set_mask 属性
    if (key === 'targetIds') {
      // 从目标 mask 当前 targetIds 读取默认值
      const targetObj = sceneObjectStore.getObject(props.action.target)
      const currentTargets = targetObj?.type === 'mask'
        ? [...((targetObj as MaskObject).targetIds ?? [])]
        : []
      maskParams.value.targetIds = currentTargets
      handleMaskParamsChange()
    } else if (key === 'shape') {
      // 从目标 mask 当前 shape 读取默认值
      const targetObj = sceneObjectStore.getObject(props.action.target)
      const currentShape: 'rectangle' | 'ellipse' = targetObj?.type === 'mask'
        ? ((targetObj as MaskObject).shape ?? 'rectangle')
        : 'rectangle'
      maskParams.value.shape = currentShape
      handleMaskParamsChange()
    } else if (key === 'width') {
      const targetObj = sceneObjectStore.getObject(props.action.target)
      maskParams.value.width = targetObj?.type === 'mask'
        ? Math.max(1, Number((targetObj as MaskObject).width) || 200)
        : 200
      handleMaskParamsChange()
    } else if (key === 'height') {
      const targetObj = sceneObjectStore.getObject(props.action.target)
      maskParams.value.height = targetObj?.type === 'mask'
        ? Math.max(1, Number((targetObj as MaskObject).height) || 200)
        : 200
      handleMaskParamsChange()
    }
  } else if (props.action.type === 'set_screen_effect' || props.action.type === 'tween_screen_effect') {
    const prop = SCREEN_EFFECT_PROPS.find(p => p.key === key)
    if (prop) {
      let defaultValue: string | number
      if (prop.type === 'color') defaultValue = '#000000'
      else if (prop.type === 'select') defaultValue = prop.options?.[0]?.value ?? 'circle'
      else if (prop.type === 'range') defaultValue = 0
      else defaultValue = 0
      screenEffectParams.value[key] = defaultValue
      handleScreenEffectParamsChange()
    }
  } else if (props.action.type === 'set_text' || props.action.type === 'tween_text') {
    // 文本属性添加 (Text PRD)
    const prop = TEXT_PROPS.find(p => p.key === key)
    if (prop) {
      let defaultValue: string | number
      if (prop.type === 'color') defaultValue = '#ffffff'
      else if (prop.type === 'textarea') defaultValue = ''
      else if (key === 'fontSize') defaultValue = 72
      else if (key === 'fontFamily') defaultValue = 'Noto Sans SC'
      else if (key === 'align') defaultValue = 'center'
      else if (key === 'fontWeight') defaultValue = 'normal'
      else if (key === 'fontStyle') defaultValue = 'normal'
      else if (key === 'strokeThickness') defaultValue = 0
      else if (key === 'revealSpeed') defaultValue = 8
      else if (key === 'textBoxMode') defaultValue = 'auto-size'
      else if (key === 'writingMode') defaultValue = 'horizontal'
      else if (key === 'fillType') defaultValue = ''
      else if (key === 'gradientAngle') defaultValue = 0
      else if (key === 'wordWrapWidth') defaultValue = 500
      else if (key === 'dropShadowAngle') defaultValue = 0.785
      else if (key === 'dropShadowDistance') defaultValue = 4
      else if (key === 'dropShadowBlur') defaultValue = 4
      else if (key === 'textBackgroundAlpha') defaultValue = 0.8
      else if (prop.type === 'checkbox') { textParams.value[key] = false; handleTextParamsChange(); showAddPropertyMenu.value = false; return }
      else defaultValue = 0
      textParams.value[key] = defaultValue
      handleTextParamsChange()
    }
  } else if (props.action.type === 'set_light' || props.action.type === 'tween_light') {
    // 光源参数添加 (点光源 PRD Phase 0.5)
    const prop = LIGHT_PROPS.find(p => p.key === key)
    if (prop) {
      let defaultValue: string | number
      if (prop.type === 'color') defaultValue = '#ffffff'
      else if (key === 'lightIntensity') defaultValue = 1.0
      else if (key === 'lightRadius') defaultValue = 500
      else if (key === 'flicker') defaultValue = 0
      else if (key === 'flickerSpeed') defaultValue = 0.35
      else if (key === 'directionAngle') defaultValue = 0
      else if (key === 'coneAngle') defaultValue = 100
      else defaultValue = 0
      lightParams.value[key] = defaultValue
      handleLightParamsChange()
    }
  }
  
  showAddPropertyMenu.value = false
}

// 移除视觉属性
function removeVisualProp(key: string) {
  visualParams.value[key] = undefined
  handleVisualParamsChange()
}

// 移除几何属性
function removeGeometryProp(key: string) {
  geometryParams.value[key] = undefined
  // v17: 按 action type 分发到正确的处理函数
  if (props.action?.type === 'set_transform') {
    handleSetTransformGeometryChange()
  } else {
    handleGeometryParamsChange()
  }
}

// 移除音频属性
function removeAudioProp(key: string) {
  handleAudioParamsChange(key, undefined)
}

// v9.3: 移除 set_visual 属性
function removeSetVisualProp(key: string) {
  setVisualParams.value[key] = undefined
  handleSetVisualParamsChange()
}

function canAddSetVisualProp(key: string): boolean {
  if (props.action?.type !== 'set_visual') return false

  const targetObj = sceneObjectStore.getObject(props.action.target)
  if (!targetObj) return true

  if (key === 'castShadow') {
    if (targetObj.type === 'prop' || targetObj.type === 'symbol' || targetObj.type === 'expression') return true
    if (targetObj.type === 'composite') {
      return (targetObj as CompositeObject).compositeMode === 'entity'
    }
    return false
  }

  if (key === 'receiveLighting') {
    if (targetObj.type === 'composite') {
      return (targetObj as CompositeObject).compositeMode === 'entity'
    }
    return targetObj.type !== 'background'
      && targetObj.type !== 'camera'
      && targetObj.type !== 'audio'
      && targetObj.type !== 'light'
      && targetObj.type !== 'screen_effect'
  }

  return true
}

// 移除画面特效属性
function removeScreenEffectProp(key: string) {
  delete screenEffectParams.value[key]
  handleScreenEffectParamsChange()
}

// 移除光源属性 (点光源 PRD Phase 0.5)
function removeLightProp(key: string) {
  delete lightParams.value[key]
  handleLightParamsChange()
}

// 移除文本属性 (Text PRD)
function removeTextProp(key: string) {
  delete textParams.value[key]
  handleTextParamsChange()
}

// P2: set_composite 属性定义
const SET_COMPOSITE_PROPS: InspectorPropDef[] = [
  { key: 'renderChain', label: '📋 渲染链排序', type: 'childList' },
]

// P2: 移除 set_composite 属性
function removeCompositeProp(key: 'renderChain') {
  const updated = { ...compositeParams.value }
  delete updated[key]
  compositeParams.value = updated
  handleCompositeParamsChange()
}

// Clip-Mask Phase 1 D3: set_mask 属性定义
const SET_MASK_PROPS: InspectorPropDef[] = [
  { key: 'targetIds', label: '✂ 裁切目标', type: 'maskTargetList' },
  { key: 'shape', label: '形状', type: 'select', options: [
    { value: 'rectangle', label: '矩形' },
    { value: 'ellipse', label: '椭圆' },
  ] },
  { key: 'width', label: '宽度', type: 'number' },
  { key: 'height', label: '高度', type: 'number' },
]

// 移除 set_mask 属性
function removeMaskProp(key: 'targetIds' | 'shape' | 'width' | 'height') {
  const updated = { ...maskParams.value }
  delete updated[key]
  maskParams.value = updated
  handleMaskParamsChange()
}

// 处理 set_mask 参数变更（emit 给父组件）
function handleMaskParamsChange() {
  const action = props.action
  if (action?.type !== 'set_mask') return
  const params: Record<string, unknown> = {}
  const mp = maskParams.value
  if (mp.targetIds !== undefined) params['targetIds'] = [...mp.targetIds]
  if (mp.shape !== undefined) params['shape'] = mp.shape
  if (mp.width !== undefined && Number.isFinite(mp.width) && mp.width > 0) params['width'] = mp.width
  if (mp.height !== undefined && Number.isFinite(mp.height) && mp.height > 0) params['height'] = mp.height
  emit('update', { params })
}

// 添加 mask 裁切目标
function addMaskTarget() {
  if (!maskTargetAddSelection.value) return
  const cur = maskParams.value.targetIds ?? []
  if (cur.includes(maskTargetAddSelection.value)) {
    maskTargetAddSelection.value = ''
    return
  }
  maskParams.value.targetIds = [...cur, maskTargetAddSelection.value]
  maskTargetAddSelection.value = ''
  handleMaskParamsChange()
}

// 移除 mask 裁切目标
function removeMaskTarget(id: string) {
  const cur = maskParams.value.targetIds ?? []
  maskParams.value.targetIds = cur.filter(t => t !== id)
  handleMaskParamsChange()
}

// 当前 mask（即 set_mask.target 指向的 mask 对象，用于排除自身）
const maskCurrentMask = computed<MaskObject | null>(() => {
  const action = props.action
  if (action?.type !== 'set_mask') return null
  const obj = sceneObjectStore.getObject(action.target)
  return obj?.type === 'mask' ? (obj as unknown as MaskObject) : null
})

// 已被其它 mask 占用的目标 id 集合（非本 mask）
const maskClaimedByOthers = computed<Set<string>>(() => {
  const set = new Set<string>()
  const selfId = maskCurrentMask.value?.id ?? null
  for (const o of sceneObjectStore.objects) {
    if (o.type !== 'mask') continue
    if (o.id === selfId) continue
    for (const tid of (o as unknown as MaskObject).targetIds ?? []) set.add(tid)
  }
  return set
})

// 候选目标：类型允许 + 不在当前 targetIds + 不在其它 mask 占用 + 不是本 mask 自身
const maskCandidateTargets = computed<SceneObject[]>(() => {
  const own = new Set(maskParams.value.targetIds ?? [])
  const selfId = maskCurrentMask.value?.id ?? null
  return sceneObjectStore.objects.filter(obj => {
    if (obj.id === selfId) return false
    if (!isAllowedMaskTargetType(obj.type)) return false
    if (own.has(obj.id)) return false
    if (maskClaimedByOthers.value.has(obj.id)) return false
    return true
  })
})

// 获取 mask target 显示名
function getMaskTargetName(id: string): string {
  const o = sceneObjectStore.getObject(id)
  return o?.alias || o?.name || id
}

// 获取 mask target 图标
function getMaskTargetIcon(id: string): string {
  const o = sceneObjectStore.getObject(id)
  if (!o) return '❓'
  return getTypeIcon(o.type)
}
const scRcSelectedId = ref<string | null>(null)
const scRcDragOverIndex = ref(-1)
let scRcDragStartIndex = -1

const scRcSelectedIndex = computed(() => {
  if (!scRcSelectedId.value) return -1
  return compositeParams.value.renderChain?.indexOf(scRcSelectedId.value) ?? -1
})

// zIndex 分组显示数据
interface ScRcItemEntry {
  type: 'item'
  childId: string
  flatIndex: number
  zIndex: number
}

interface ScRcDividerEntry {
  type: 'divider'
  zIndex: number
}

type ScRcDisplayEntry = ScRcItemEntry | ScRcDividerEntry

/** 解析 renderChain 为带 zIndex 分组分割线的显示列表 */
const scRcDisplay = computed((): ScRcDisplayEntry[] => {
  const chain = compositeParams.value.renderChain
  if (!chain || chain.length === 0) return []

  const entries: ScRcDisplayEntry[] = []
  let prevZIndex: number | null = null

  for (let i = 0; i < chain.length; i++) {
    const childId = chain[i]!
    const obj = sceneObjectStore.getObject(childId)
    const z = obj?.zIndex ?? 0

    // 组切换时插入分割线
    if (prevZIndex !== null && z !== prevZIndex) {
      entries.push({ type: 'divider', zIndex: z })
    }

    entries.push({ type: 'item', childId, flatIndex: i, zIndex: z })
    prevZIndex = z
  }

  return entries
})

/** 获取指定 flatIndex 所在 zIndex 分组的边界 [groupStart, groupEnd]（闭区间） */
function getScRcZIndexGroupBounds(flatIdx: number): [number, number] {
  const chain = compositeParams.value.renderChain
  if (!chain || flatIdx < 0 || flatIdx >= chain.length) return [-1, -1]
  const obj = sceneObjectStore.getObject(chain[flatIdx]!)
  const z = obj?.zIndex ?? 0
  let start = flatIdx
  let end = flatIdx
  while (start > 0) {
    const prevObj = sceneObjectStore.getObject(chain[start - 1]!)
    if ((prevObj?.zIndex ?? 0) !== z) break
    start--
  }
  while (end < chain.length - 1) {
    const nextObj = sceneObjectStore.getObject(chain[end + 1]!)
    if ((nextObj?.zIndex ?? 0) !== z) break
    end++
  }
  return [start, end]
}

const scRcCanMoveUp = computed(() => {
  const idx = scRcSelectedIndex.value
  if (idx <= 0) return false
  const [groupStart] = getScRcZIndexGroupBounds(idx)
  return idx > groupStart
})

const scRcCanMoveDown = computed(() => {
  const idx = scRcSelectedIndex.value
  const len = compositeParams.value.renderChain?.length ?? 0
  if (idx < 0 || idx >= len - 1) return false
  const [, groupEnd] = getScRcZIndexGroupBounds(idx)
  return idx < groupEnd
})

// P2: 处理子对象排序移动（受 zIndex 分组约束）
function handleCompositeChildMove(index: number, direction: -1 | 1) {
  const renderChain = compositeParams.value.renderChain
  if (!renderChain) return
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= renderChain.length) return
  // zIndex 边界检查
  const [groupStart, groupEnd] = getScRcZIndexGroupBounds(index)
  if (targetIndex < groupStart || targetIndex > groupEnd) return
  // swap
  const newRenderChain = [...renderChain]
  const temp = newRenderChain[index]!
  newRenderChain[index] = newRenderChain[targetIndex]!
  newRenderChain[targetIndex] = temp
  compositeParams.value.renderChain = newRenderChain
  // 跟随选中项
  scRcSelectedId.value = newRenderChain[targetIndex] ?? null
  handleCompositeParamsChange()
}

// 拖拽排序（受 zIndex 分组约束）
function onScRcDragStart(idx: number, e: DragEvent) {
  scRcDragStartIndex = idx
  const chain = compositeParams.value.renderChain
  scRcSelectedId.value = chain?.[idx] ?? null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onScRcDragOver(idx: number) {
  // 仅允许拖到同 zIndex 组内
  if (scRcDragStartIndex >= 0) {
    const chain = compositeParams.value.renderChain
    if (chain) {
      const srcObj = sceneObjectStore.getObject(chain[scRcDragStartIndex]!)
      const tgtObj = sceneObjectStore.getObject(chain[idx]!)
      const srcZ = srcObj?.zIndex ?? 0
      const tgtZ = tgtObj?.zIndex ?? 0
      if (srcZ !== tgtZ) {
        scRcDragOverIndex.value = -1
        return
      }
    }
  }
  scRcDragOverIndex.value = idx
}

function onScRcDragLeave() {
  scRcDragOverIndex.value = -1
}

function onScRcDrop(dropIdx: number) {
  scRcDragOverIndex.value = -1
  if (scRcDragStartIndex < 0 || scRcDragStartIndex === dropIdx) return
  const renderChain = compositeParams.value.renderChain
  if (!renderChain) return
  // zIndex 跨组校验
  const srcObj = sceneObjectStore.getObject(renderChain[scRcDragStartIndex]!)
  const tgtObj = sceneObjectStore.getObject(renderChain[dropIdx]!)
  const srcZ = srcObj?.zIndex ?? 0
  const tgtZ = tgtObj?.zIndex ?? 0
  if (srcZ !== tgtZ) return
  const newChain = [...renderChain]
  const [moved] = newChain.splice(scRcDragStartIndex, 1)
  if (!moved) return
  newChain.splice(dropIdx, 0, moved)
  compositeParams.value.renderChain = newChain
  scRcSelectedId.value = moved
  handleCompositeParamsChange()
}

function onScRcDragEnd() {
  scRcDragOverIndex.value = -1
  scRcDragStartIndex = -1
}

// P2: 处理 set_composite 参数变更
function handleCompositeParamsChange() {
  const action = props.action
  if (action?.type !== 'set_composite') return

  const params: Record<string, unknown> = {}
  const cv = compositeParams.value
  if (cv.renderChain !== undefined) {
    params['renderChain'] = [...cv.renderChain]
  }
  emit('update', { params })
}

// P2: 获取子对象显示名
function getCompositeChildName(childId: string): string {
  const obj = sceneObjectStore.getObject(childId)
  if (!obj) return childId
  const alias = obj.alias
  if (alias?.trim()) return alias
  if (obj.name?.trim()) return obj.name
  return childId
}

// P2: 获取子对象图标（委托统一 metadata 注册表）
function getCompositeChildIcon(childId: string): string {
  const obj = sceneObjectStore.getObject(childId)
  if (!obj) return '❓'
  return getTypeIcon(obj.type)
}

// 画面特效颜色变更
function handleScreenEffectColorChange(key: string, value: string) {
  screenEffectParams.value[key] = value
  handleScreenEffectParamsChange()
}

// 画面特效选择变更（如 holeShape）
function handleScreenEffectSelectChange(key: string, value: string) {
  screenEffectParams.value[key] = value
  handleScreenEffectParamsChange()
}

// 画面特效参数变更
function handleScreenEffectParamsChange() {
  const action = props.action
  if (!action) return
  if (action.type !== 'set_screen_effect' && action.type !== 'tween_screen_effect') return

  // 收集所有非 undefined 的参数
  const updatedParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(screenEffectParams.value)) {
    if (value !== undefined) {
      updatedParams[key] = value
    }
  }

  emit('update', { params: updatedParams })
}

// 光源参数变更 (点光源 PRD Phase 0.5)
function handleLightParamsChange() {
  const action = props.action
  if (!action) return
  if (action.type !== 'set_light' && action.type !== 'tween_light') return

  const updatedParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(lightParams.value)) {
    if (value !== undefined) {
      updatedParams[key] = value
    }
  }

  emit('update', { params: updatedParams })
}

// 光源颜色变更 (点光源 PRD Phase 0.5)
function handleLightColorChange(key: string, value: string) {
  lightParams.value[key] = value
  handleLightParamsChange()
}

// 根据 lightType 过滤后的光源属性定义
const filteredLightProps = computed(() => {
  const action = props.action
  if (!action) return LIGHT_PROPS
  if (action.type !== 'set_light' && action.type !== 'tween_light') return LIGHT_PROPS
  const obj = sceneObjectStore.getObject(action.target)
  if (obj?.type === 'light' && (obj as LightObject).lightType === 'ambient') {
    return LIGHT_PROPS.filter(p => p.key === 'lightColor' || p.key === 'lightIntensity')
  }
  if (obj?.type === 'light' && (obj as LightObject).lightType === 'spot') {
    return LIGHT_PROPS
  }
  return LIGHT_PROPS.filter(p => p.key !== 'directionAngle' && p.key !== 'coneAngle')
})

// 当前已激活的光源属性
const activeLightProps = computed(() => {
  return filteredLightProps.value.filter(prop => lightParams.value[prop.key] !== undefined)
})

// 文本属性过滤（tween_text 排除不可插值属性）
const filteredTextProps = computed(() => {
  if (props.action?.type === 'tween_text') {
    return TEXT_PROPS.filter(prop => !TEXT_NON_INTERPOLATABLE_KEYS.includes(prop.key))
  }
  return TEXT_PROPS
})

// 当前已激活的文本属性
const activeTextProps = computed(() => {
  return filteredTextProps.value.filter(prop => textParams.value[prop.key] !== undefined)
})

// 文本参数变更 (Text PRD)
function handleTextParamsChange() {
  const action = props.action
  if (!action) return
  if (action.type !== 'set_text' && action.type !== 'tween_text') return

  const updatedParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(textParams.value)) {
    if (value !== undefined) {
      updatedParams[key] = value
    }
  }

  emit('update', { params: updatedParams })
}

// 文本颜色变更
function handleTextColorChange(key: string, value: string) {
  textParams.value[key] = value
  handleTextParamsChange()
}

// 文本选择变更
function handleTextSelectChange(key: string, value: string) {
  textParams.value[key] = value
  // fillType 切换为 linear_gradient 时自动初始化 gradientStops
  if (key === 'fillType' && value === 'linear_gradient') {
    const existing = textParams.value['gradientStops'] as { offset: number; color: string }[] | undefined
    if (!existing || existing.length < 2) {
      textParams.value['gradientStops'] = [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#000000' },
      ]
    }
    if (textParams.value['gradientAngle'] === undefined) {
      textParams.value['gradientAngle'] = 90
    }
  }
  handleTextParamsChange()
}

// 文本内容变更
function handleTextContentChange(value: string) {
  textParams.value['content'] = value
  handleTextParamsChange()
}

// 渐变色标变更（双色模式）
function handleTextGradientStopChange(index: number, color: string) {
  const stops = (textParams.value['gradientStops'] as { offset: number; color: string }[] | undefined) ?? [
    { offset: 0, color: '#ffffff' },
    { offset: 1, color: '#000000' },
  ]
  while (stops.length < 2) {
    stops.push({ offset: stops.length === 0 ? 0 : 1, color: '#000000' })
  }
  stops[index]!.color = color
  textParams.value['gradientStops'] = [...stops]
  handleTextParamsChange()
}

// 渐变色标计算属性
const textGradientStartColor = computed(() => {
  const stops = textParams.value['gradientStops'] as { offset: number; color: string }[] | undefined
  return stops?.[0]?.color ?? '#ffffff'
})

const textGradientEndColor = computed(() => {
  const stops = textParams.value['gradientStops'] as { offset: number; color: string }[] | undefined
  return stops?.[1]?.color ?? '#000000'
})

// v16: set_material — 获取目标元件对象的素材列表
const targetSymbolMaterials = computed(() => {
  const action = props.action
  if (action?.type !== 'set_material') return []
  const targetObj = sceneObjectStore.getObject(action.target)
  if (targetObj?.type !== 'symbol') return []
  return (targetObj as SymbolObject).materials
})

// v18: set_material — 判断目标是否为表情对象
const targetIsExpression = computed(() => {
  const action = props.action
  if (action?.type !== 'set_material') return false
  const targetObj = sceneObjectStore.getObject(action.target)
  return targetObj?.type === 'expression'
})

// v18: set_material — 获取表情列表
const targetExpressionList = computed(() => {
  if (!targetIsExpression.value) return []
  return expressionStore.expressionList
})

// v16: set_material — 处理素材选择变更
function handleMaterialIdChange(materialId: string) {
  emit('update', { params: { materialId } })
}

// v9.3: 处理 set_visual 参数变化
function handleSetVisualParamsChange() {
  const action = props.action
  if (action?.type !== 'set_visual') return
  
  const params: LooseObject = { ...(action.params ?? {}) }
  
  // 只保留有值的属性
  for (const prop of SET_VISUAL_PROPS) {
    if (setVisualParams.value[prop.key] !== undefined) {
      params[prop.key] = setVisualParams.value[prop.key]
    } else {
      delete params[prop.key]
    }
  }
  
  emit('update', { params })
}

// 处理视觉参数变化
function handleVisualParamsChange() {
  if (!props.action) return
  
  const action = props.action as unknown as { params?: Record<string, unknown> }
  const params: LooseObject = { ...(action.params ?? {}) }

  // 只保留有值的属性
  for (const prop of VISUAL_PROPS) {
    if (visualParams.value[prop.key] !== undefined) {
      params[prop.key] = visualParams.value[prop.key]
    } else {
      delete params[prop.key]
    }
  }
  
  emit('update', { params })
}

// 处理几何参数变化
function handleGeometryParamsChange() {
  if (props.action?.type !== 'tween_transform') return
  
  const action = props.action as unknown as { params?: Record<string, unknown> }
  const params: LooseObject = { ...(action.params ?? {}) }
  
  // x, y 直接保存为整数
  if (geometryParams.value.x !== undefined) {
    params.x = Math.round(geometryParams.value.x)
  } else {
    delete params.x
  }
  
  if (geometryParams.value.y !== undefined) {
    params.y = Math.round(geometryParams.value.y)
  } else {
    delete params.y
  }
  
  // scaleX/scaleY 从百分比转换回比例
  if (geometryParams.value.scaleX !== undefined) {
    params.scaleX = geometryParams.value.scaleX / 100
  } else {
    delete params.scaleX
  }

  if (geometryParams.value.scaleY !== undefined) {
    params.scaleY = geometryParams.value.scaleY / 100
  } else {
    delete params.scaleY
  }
  
  // rotation 从角度转换回弧度
  if (geometryParams.value.rotation !== undefined) {
    params.rotation = (geometryParams.value.rotation) * Math.PI / 180
  } else {
    delete params.rotation
  }
  
  // alpha 直接保存（0-1 范围）
  if (geometryParams.value.alpha !== undefined) {
    params.alpha = geometryParams.value.alpha
  } else {
    delete params.alpha
  }
  
  emit('update', { params })
}

// v9.2: 处理 set_transform 几何参数变化
function handleSetTransformGeometryChange() {
  if (props.action?.type !== 'set_transform') return
  
  const action = props.action as unknown as { params?: Record<string, unknown> }
  const params: LooseObject = { ...(action.params ?? {}) }
  
  // x, y 直接保存为整数
  if (geometryParams.value.x !== undefined) {
    params.x = Math.round(geometryParams.value.x)
  } else {
    delete params.x
  }
  
  if (geometryParams.value.y !== undefined) {
    params.y = Math.round(geometryParams.value.y)
  } else {
    delete params.y
  }
  
  // scaleX/scaleY 从百分比转换回比例
  if (geometryParams.value.scaleX !== undefined) {
    params.scaleX = geometryParams.value.scaleX / 100
  } else {
    delete params.scaleX
  }

  if (geometryParams.value.scaleY !== undefined) {
    params.scaleY = geometryParams.value.scaleY / 100
  } else {
    delete params.scaleY
  }
  
  // rotation 从角度转换回弧度
  if (geometryParams.value.rotation !== undefined) {
    params.rotation = geometryParams.value.rotation * Math.PI / 180
  } else {
    delete params.rotation
  }

  // 变换原点：0~1 归一化值，直接存储
  if (geometryParams.value['transformOriginX'] !== undefined) {
    params['transformOriginX'] = geometryParams.value['transformOriginX']
  } else {
    delete params['transformOriginX']
  }
  if (geometryParams.value['transformOriginY'] !== undefined) {
    params['transformOriginY'] = geometryParams.value['transformOriginY']
  } else {
    delete params['transformOriginY']
  }
  
  emit('update', { params })
}

// 处理音频参数变化
function handleAudioParamsChange(key: string, value: string | number | boolean | undefined) {
  if (props.action?.type !== 'set_audio') return
  
   
  const params: LooseObject = { ...audioParams.value, [key]: value }
  audioParams.value = params // 更新本地状态
  
  // 清理 undefined
  const finalParams: LooseObject = {}
  if (params.action) finalParams.action = params.action
  for (const prop of AUDIO_PROPS) {
    if (params[prop.key] !== undefined) {
      finalParams[prop.key] = params[prop.key]
    }
  }
  
  emit('update', { params: finalParams })
}

function handleTextRevealParamsChange(key: 'action' | 'mode', value: string) {
  if (props.action?.type !== 'set_text_reveal') return

  const action = key === 'action'
    ? (value === 'stop' ? 'stop' : 'play')
    : textRevealParams.value.action
  textRevealParams.value = { action, mode: 'typewriter' }

  emit('update', {
    params: {
      action,
      mode: 'typewriter',
    }
  })
}

// 处理相机参数变化
function handleCameraParamsChange() {
  if (!props.action) return
  emit('update', { params: { ...cameraParams.value } })
}

// 处理相机 X 变化（保持整数）
function handleCameraXChange(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Math.round(parseFloat(target.value) || 0)
  cameraParams.value.x = value
  handleCameraParamsChange()
}

// 处理相机 Y 变化（保持整数）
function handleCameraYChange(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Math.round(parseFloat(target.value) || 0)
  cameraParams.value.y = value
  handleCameraParamsChange()
}

// 处理相机 Zoom 变化（输入百分数，转换为 zoom 值）
function handleCameraZoomChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value) || 100
  const zoom = Math.max(0.1, percent / 100)  // 百分数转换为 zoom 值
  cameraParams.value.zoom = Math.round(zoom * 100) / 100  // 保留两位小数
  handleCameraParamsChange()
}

// 处理缩放联动的事件
const scaleLocked = ref(true)

function toggleScaleLock() {
  scaleLocked.value = !scaleLocked.value
  if (scaleLocked.value) {
    if (geometryParams.value.scaleX !== undefined) {
      geometryParams.value.scaleY = geometryParams.value.scaleX
    } else if (geometryParams.value.scaleY !== undefined) {
      geometryParams.value.scaleX = geometryParams.value.scaleY
    }
    if (props.action?.type === 'set_transform') handleSetTransformGeometryChange()
    if (props.action?.type === 'tween_transform') handleGeometryParamsChange()
  }
}

function handleScaleChange(changedKey: string) {
  if (scaleLocked.value) {
    if (changedKey === 'scaleX' && geometryParams.value.scaleX !== undefined) {
      geometryParams.value.scaleY = geometryParams.value.scaleX
    } else if (changedKey === 'scaleY' && geometryParams.value.scaleY !== undefined) {
      geometryParams.value.scaleX = geometryParams.value.scaleY
    }
  }
  if (props.action?.type === 'set_transform') handleSetTransformGeometryChange()
  if (props.action?.type === 'tween_transform') handleGeometryParamsChange()
}

// 截断槽位文本
function truncateSlotText(text: string, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// 获取槽位标签（支持 preroll/subtitle/postroll）
function getSlotLabel(slot: RuntimeSlot): string {
  if (slot.type === 'preroll') return '前置'
  if (slot.type === 'postroll') return '后置'
  return truncateSlotText(slot.text ?? '', 15)
}

// 当前选中的槽位
// const currentSlot... (removed)

// 当前槽位文本
// const currentSlotText... (removed)
// function formatSlotDuration... (removed)

// 判断是否为持续动作 (v6.3)
function isDurationAction(action: Action): boolean {
  const durationActions: ActionType[] = [
    'tween_transform',
    'camera_move',
    'camera_follow', // v7.x: 添加 camera_follow
    'camera_shake'
  ]
  return durationActions.includes(action.type)
}

// 获取目标对象图标
function getTargetIcon(target: string): string {
  if (target === 'camera') return '📷'
  if (target === SCENE_ACTION_TARGET) return '🎬'
  return '👤'
}

function getActionHeaderIcon(action: Action): string {
  if (action.type === 'set_text_reveal') return '⌨'
  return getTargetIcon(action.target)
}

function getActionHeaderTitle(action: Action): string {
  if (action.type === 'set_text_reveal') return '打字机'
  return getTargetName(action.target)
}

// v7.0: 获取目标对象名称
function getTargetName(target: string): string {
  if (target === 'camera') return '相机'
  if (target === SCENE_ACTION_TARGET) return '当前场景'
  
  // v7.0: 通过实例ID查找场景对象
  const obj = sceneObjectStore.getObject(target)
  if (obj) {
    // v7.1: 优先使用别名（确保非空字符串）
    const alias = obj.alias
    if (alias?.trim()) {
      return alias
    }
    if (obj.name?.trim()) {
      return obj.name
    }
  }
  
  // v7.1: 如果找不到对象，提供更友好的显示
  if (target.startsWith('char_')) {
    return '角色 ' + target.substring(5, 13) + '...'
  }
  if (target.startsWith('bg_')) {
    return '背景 ' + target.substring(3, 11) + '...'
  }
  
  return target
}

// 震动参数 - 使用 ref
const shakeParams = ref({
  intensity: 0,
  decay: false,
  frequency: 10
})

// 相机跟随参数
const followParams = ref({
  followTarget: '',

  damping: 0,
  offsetX: 0,
  offsetY: -50,  // 默认 -50，让人物稍微偏下
  zoom: undefined as number | undefined,  // 可选的 zoom 参数
  smoothEntry: false,  // v15: 平滑入场
  smoothEntryDuration: 300,  // v15: 平滑入场时长 (ms)
  autoZoom: false,  // v15: 自动推拉
  autoZoomRange: 5,  // v15: 推拉幅度 %
  autoZoomCycles: 0.5,  // v15: 推拉次数
  constrainBounds: false  // v6.9: 边界约束选项
})

// P2: 自定义树形下拉组件状态
const showFollowDropdown = ref(false)

// P2: 记录展开的 composite ID 集合（默认全部折叠）
const expandedComposites = ref(new Set<string>())



function toggleCompositeExpand(compositeId: string) {
  const next = new Set(expandedComposites.value)
  if (next.has(compositeId)) {
    next.delete(compositeId)
  } else {
    next.add(compositeId)
  }
  expandedComposites.value = next
}

// P2: 获取当前选中目标的显示标签（递归查找）
const selectedFollowTargetLabel = computed(() => {
  const targetId = followParams.value.followTarget
  if (!targetId) return ''
  function findInTree(items: FollowTargetTreeItem[]): string | undefined {
    for (const item of items) {
      if (item.id === targetId) return `${item.icon} ${item.alias}`
      if (item.children) {
        const found = findInTree(item.children)
        if (found) return found
      }
    }
    return undefined
  }
  return findInTree(followTargetTree.value) ?? targetId
})

// P2: 处理下拉失焦（延迟关闭，避免点击子元素时闪烁）
function onFollowDropdownFocusOut(event: FocusEvent) {
  const dropdown = (event.currentTarget as HTMLElement)
  const relatedTarget = event.relatedTarget as HTMLElement | null
  // 如果焦点仍在下拉容器内，不关闭
  if (relatedTarget && dropdown.contains(relatedTarget)) return
  // 延迟关闭，允许 click 事件先触发
  setTimeout(() => { showFollowDropdown.value = false }, 150)
}
// v6.9: 获取当前相机的真实 zoom 值
const currentCameraZoom = computed(() => {
  const cameraObj = sceneObjectStore.objects.find(obj => obj.type === 'camera')
  return (cameraObj as CameraObject).zoom ?? 1
})

// 跟随 zoom 百分数显示（zoom * 100，始终显示当前值）
const followZoomPercent = computed(() => {
  // v6.9: 如果 zoom 未定义，使用当前相机的真实 zoom
  const zoom = followParams.value.zoom ?? currentCameraZoom.value
  return Math.round(zoom * 100)
})

// v9.2: 判断是否为 Death Action (消亡动作)
const isCurrentDeathAction = computed(() => {
  if (!props.action) return false
  return isDeathAction(props.action)
})

// v9.5: 判断是否为 Birth Action (出生动作) - 用于显示 autoDespawnOnBlockEnd 控制
const isCurrentBirthAction = computed(() => {
  if (!props.action) return false
  return isBirthAction(props.action)
})

// v9.5: 处理“本段结束后自动消亡”复选框变化
function handleAutoDespawnChange(checked: boolean) {
  if (!props.action) return
  const currentParams = (props.action as SetLifecycleAction).params
  emit('update', {
    params: { ...currentParams, autoDespawnOnBlockEnd: checked }
  } as Partial<Action>)
}

// 判断是否为相机动作
const isCameraAction = computed(() => {
  if (!props.action) return false
  const cameraActionTypes = ['camera_cut', 'camera_move', 'camera_follow', 'camera_shake']
  return cameraActionTypes.includes(props.action.type)
})

// v7.0: 可用的实例列表（用于跟随目标选择，支持角色、道具、组合对象、背景）
// v9.3: 根据 aliveObjectIds 过滤掉已消亡的对象
const FOLLOW_TARGET_ICONS: Record<string, string> = {
  character: '👤',
  prop: '📦',
  composite: '🧩',
  background: '🖼️',
  expression: '😀',
}

interface FollowTargetTreeItem {
  id: string
  alias: string
  type: string
  icon: string
  children?: FollowTargetTreeItem[]  // composite 类型有子对象（entity/union 均支持）
}

/** 扁平化后的可见列表项，用于模板 v-for 渲染 */
interface FollowTargetFlatItem {
  id: string
  alias: string
  type: string
  icon: string
  depth: number
  hasChildren: boolean
}

/** 检查对象是否在存活列表中 */
function isAlive(objId: string): boolean {
  if (!props.aliveObjectIds || props.aliveObjectIds.length === 0) return true
  return props.aliveObjectIds.includes(objId)
}

/**
 * 树形跟随目标列表（递归构建）：
 * - entity / union 组合对象均构建 children，支持折叠展开
 * - 非 composite 子对象不重复出现在顶层
 */
const followTargetTree = computed<FollowTargetTreeItem[]>(() => {
  const supportedTypes = ['character', 'prop', 'composite', 'background', 'expression']
  // 收集所有 composite 的 childIds 集合
  const allChildIds = new Set<string>()
  for (const obj of sceneObjectStore.objects) {
    if (obj.type === 'composite') {
      for (const cid of ((obj as CompositeObject).childIds ?? [])) {
        allChildIds.add(cid)
      }
    }
  }

  /** 递归构建单个对象节点 */
  function buildItem(obj: SceneObject): FollowTargetTreeItem {
    const item: FollowTargetTreeItem = {
      id: obj.id,
      alias: obj.alias ?? obj.name ?? obj.id,
      type: obj.type,
      icon: FOLLOW_TARGET_ICONS[obj.type] ?? '?',
    }
    if (obj.type === 'composite') {
      const composite = obj as CompositeObject
      // entity / union 均构建 children
      const children = (composite.childIds ?? [])
        .map(cid => sceneObjectStore.objects.find(o => o.id === cid))
        .filter((child): child is SceneObject => !!child && isAlive(child.id))
        .map(child => buildItem(child))  // 递归构建
      if (children.length > 0) {
        item.children = children
      }
    }
    return item
  }

  const result: FollowTargetTreeItem[] = []
  for (const obj of sceneObjectStore.objects) {
    if (!supportedTypes.includes(obj.type)) continue
    if (!isAlive(obj.id)) continue
    // 跳过已被 composite 收纳的子对象（它们会在 composite 下展示）
    if (allChildIds.has(obj.id)) continue
    result.push(buildItem(obj))
  }
  return result
})

/**
 * 扁平化可见列表（根据展开状态递归拍平）：
 * 模板直接 v-for 此列表，通过 depth 控制缩进层级
 */
const flatFollowTargetList = computed<FollowTargetFlatItem[]>(() => {
  const result: FollowTargetFlatItem[] = []
  function flatten(items: FollowTargetTreeItem[], depth: number) {
    for (const item of items) {
      const hasChildren = !!(item.children && item.children.length > 0)
      result.push({
        id: item.id,
        alias: item.alias,
        type: item.type,
        icon: item.icon,
        depth,
        hasChildren,
      })
      if (hasChildren && expandedComposites.value.has(item.id)) {
        flatten(item.children!, depth + 1)
      }
    }
  }
  flatten(followTargetTree.value, 0)
  return result
})

// P2: 清理已不存在的 composite ID（递归收集有效 ID）
watch(() => followTargetTree.value, (tree) => {
  function collectIds(items: FollowTargetTreeItem[], ids: Set<string>) {
    for (const item of items) {
      ids.add(item.id)
      if (item.children) collectIds(item.children, ids)
    }
  }
  const validIds = new Set<string>()
  collectIds(tree, validIds)
  const cleaned = new Set<string>()
  for (const id of expandedComposites.value) {
    if (validIds.has(id)) cleaned.add(id)
  }
  expandedComposites.value = cleaned
})

// 监听 action 变化，更新 shakeParams
watch(() => props.action, (newAction) => {
  if (newAction?.type !== 'camera_shake') {
    shakeParams.value = { intensity: 0, decay: false, frequency: 10 }
    return
  }
  
  const action = newAction
  shakeParams.value = {
    intensity: action.params?.intensity ?? 0,
    decay: action.params?.decay ?? false,
    frequency: action.params?.frequency ?? 10
  }
}, { immediate: true })

// focusField watch 中的 set_character 逻辑已移除

// 处理槽位序号变化（下拉列表选择，直接使用 0-based index）
function handleSlotIndexChange(event: Event) {
  if (!props.action) return
  const target = event.target as HTMLSelectElement
  const slotIndex = parseInt(target.value, 10)
  if (!isNaN(slotIndex) && slotIndex >= 0) {
    emit('update', { slotIndex })
  }
}

// 处理槽位跨度变化
function handleSlotSpanChange(event: Event) {
  if (!props.action || !isDurationAction(props.action)) return
  const target = event.target as HTMLInputElement
  const slotSpan = parseInt(target.value, 10)
  if (!isNaN(slotSpan) && slotSpan >= 1) {
    emit('update', { slotSpan, easing: 'linear' })
  }
}

// 处理震动参数变化
function handleShakeChange() {
  if (props.action?.type !== 'camera_shake') return
  
  const params = {
    intensity: shakeParams.value.intensity,
    decay: shakeParams.value.decay,
    frequency: shakeParams.value.frequency
  }
  
  emit('update', { params })
}

// ==================== 相机控制台相关函数 ====================

// switchCameraActionType removed


// 处理缓动函数变化
// function handleEasingChange... (removed)

// 处理跟随目标变化
function selectFollowTarget(targetId: string) {
  if (!props.action) return
  followParams.value.followTarget = targetId
  showFollowDropdown.value = false
  handleFollowParamsChange()
}

// 处理跟随参数变化
function handleFollowParamsChange() {
  if (!props.action) return

  const params: Record<string, string | number | boolean | undefined> = {
    followTarget: followParams.value.followTarget,

    damping: followParams.value.damping,
    offsetX: followParams.value.offsetX,
    offsetY: followParams.value.offsetY,
    smoothEntry: followParams.value.smoothEntry,
    smoothEntryDuration: followParams.value.smoothEntryDuration,
    autoZoom: followParams.value.autoZoom,
    autoZoomRange: followParams.value.autoZoomRange,
    autoZoomCycles: followParams.value.autoZoomCycles,
    constrainBounds: followParams.value.constrainBounds
  }

  if (followParams.value.zoom !== undefined) {
    params['zoom'] = followParams.value.zoom
  }

  emit('update', { params })
}

// 处理跟随 zoom 变化（输入百分数，转换为 zoom 值）
function handleFollowZoomChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value)
  if (!isNaN(percent) && percent > 0) {
    followParams.value.zoom = Math.round(percent) / 100  // 百分数转换为 zoom 值
  } else {
    followParams.value.zoom = undefined
  }
  handleFollowParamsChange()
}

// function clearFollowZoom... (removed)
// function useCurrentZoom... (removed)

// 监听 action 变化，更新 followParams
watch(() => props.action, (newAction) => {
  if (newAction?.type !== 'camera_follow') {
    followParams.value = { followTarget: '', damping: 0, offsetX: 0, offsetY: -50, zoom: undefined, smoothEntry: false, smoothEntryDuration: 300, autoZoom: false, autoZoomRange: 5, autoZoomCycles: 0.5, constrainBounds: false }
    return
  }
  
  const action = newAction
  followParams.value = {
    followTarget: action.params?.followTarget ?? '',

    damping: action.params?.damping ?? 0,
    offsetX: action.params?.offsetX ?? 0,
    offsetY: action.params?.offsetY ?? -50,
    zoom: action.params?.zoom,  // 可能是 undefined
    smoothEntry: action.params?.smoothEntry ?? false,  // v15: 平滑入场
    smoothEntryDuration: action.params?.smoothEntryDuration ?? 300,  // v15: 平滑入场时长
    autoZoom: action.params?.autoZoom ?? false,  // v15: 自动推拉
    autoZoomRange: action.params?.autoZoomRange ?? 5,  // v15: 推拉幅度
    autoZoomCycles: action.params?.autoZoomCycles ?? 0.5,  // v15: 推拉次数
    constrainBounds: action.params?.constrainBounds ?? false  // v6.9: 边界约束
  }
}, { immediate: true })

// 处理表情选择
function handleExpressionSelect(_expressionId: string) {
  // set_character 已移除，此函数不再执行任何操作
  showExpressionDialog.value = false
}



// 处理通用更新
// function handleUpdate... (removed)

// ==================== v11.0: set_anim 支持 ====================

// 获取 set_anim 目标资源类型和 ID
function getSetAnimTargetResource(): { type: 'prop' | 'background'; id: string } | null {
  if (props.action?.type !== 'set_anim') return null
  const target = props.action.target
  const obj = sceneObjectStore.getObject(target)
  if (!obj) return null
  
  if (obj.type === 'prop') {
    return { type: 'prop', id: obj.refId }
  } else if (obj.type === 'background') {
    return { type: 'background', id: obj.refId }
  }
  return null
}

// v11.1: 获取目标资源可用的 Animation 列表
const availableAnimations = computed(() => {
  const result: {
    id: string
    name: string
    source: 'resource' | 'scene'
    timingMode: AnimationTimingMode
  }[] = []
  
  const target = props.action?.target
  
  // v16: 场景对象：优先从 SceneObject.animations 读取
  const targetObj = target ? sceneObjectStore.getObject(target) : null
  if (targetObj) {
    // 优先对象级动画
    const objectAnims = animationStore.getObjectAnimations(targetObj)
    if (objectAnims.length > 0) {
      for (const anim of objectAnims) {
        result.push({ id: anim.id, name: anim.name, source: 'resource', timingMode: anim.timingMode ?? 'continuous' })
      }
      return result
    }
  }

  // 回退：资源级查找（兼容未迁移的对象）
  const resource = getSetAnimTargetResource()
  if (resource) {
    const resourceAnims = animationStore.getAnimations(resource.type, resource.id)
    for (const anim of resourceAnims) {
      result.push({ id: anim.id, name: anim.name, source: 'resource', timingMode: anim.timingMode ?? 'continuous' })
    }
  }
  
  return result
})

// v11.3: 动画状态管理（支持多动画）
// 数据结构: params.animations = [{ animName, action, loop }, ...]
// v11.52: 按需添加模式后，getAnimActionState 和 getAnimLoopState 不再需要

// 处理动画播放/停止变更
function handleSetAnimAction(animName: string, action: 'play' | 'stop') {
  updateAnimationsParams(animName, { action })
}

// v11.88: handleSetAnimLoop 已移除，loop 设置统一由 Animation 资源定义控制

// 更新 animations 数组参数
// v11.88: 移除 loop 属性，循环设置统一由 Animation 资源定义控制
function updateAnimationsParams(animName: string, updates: { action?: 'play' | 'stop' }) {
  if (props.action?.type !== 'set_anim') return
  
  // v11.88: animations 是必需的唯一格式
  type AnimItem = SetAnimAction['params']['animations'][number]
  const animations: AnimItem[] = [...(props.action.params.animations || [])]
  // 查找或创建动画项
  const existingIndex = animations.findIndex(a => a.animName === animName)
  if (existingIndex >= 0) {
    const existing = animations[existingIndex]
    if (existing) {
      // v11.88: 使用条件属性设置避免 exactOptionalPropertyTypes 错误
      const updatedItem: AnimItem = {
        animName: existing.animName
      }
      // 仅在有值时设置可选属性
      const newAction = updates.action !== undefined ? updates.action : existing.action
      if (newAction !== undefined) {
        updatedItem.action = newAction
      }
      if (existing.autoStopOnBlockEnd !== undefined) {
        updatedItem.autoStopOnBlockEnd = existing.autoStopOnBlockEnd
      }
      // v12.x: preserve loop override
      if (existing.loop !== undefined) {
        updatedItem.loop = existing.loop
      }
      if (newAction !== 'stop' && existing.timingMode !== undefined) {
        updatedItem.timingMode = existing.timingMode
      }
      animations[existingIndex] = updatedItem
    }
  } else {
    const newItem: AnimItem = { animName }
    if (updates.action !== undefined) newItem.action = updates.action
    else newItem.action = 'stop'
    animations.push(newItem)
  }
  
  // v11.52: 按需添加模式 - 不再自动过滤 stop 状态的动画
  // 用户明确添加的动画都应保留，无论其状态
  
  emit('update', {
    params: {
      animations
    }
  })
}

// v11.52: 按需添加模式 - 菜单显示状态
const showAddAnimMenu = ref(false)

// v11.52: 当前已添加的动画列表（从 action.params.animations 读取）
// v11.88: animations 是必需的唯一格式，包含 autoStopOnBlockEnd 属性
const currentAnimations = computed(() => {
  if (props.action?.type !== 'set_anim') return []
  return props.action.params.animations || []
})

// v11.52: 可添加的动画列表（排除已添加的）
const availableAnimationsToAdd = computed(() => {
  const addedNames = new Set(currentAnimations.value.map(a => a.animName))
  return availableAnimations.value.filter(anim => !addedNames.has(anim.name))
})

// v11.52: 添加动画到 action
// v11.88: 包含 autoStopOnBlockEnd 属性（默认 true）
function addAnimToAction(animName: string) {
  if (props.action?.type !== 'set_anim') return
  
  type AnimItem = SetAnimAction['params']['animations'][number]
  const animations: AnimItem[] = [...currentAnimations.value]
  
  // 添加新动画，默认播放，默认本段结束后停止
  animations.push({
    animName,
    action: 'play',
    autoStopOnBlockEnd: true
  })
  
  emit('update', {
    params: {
      animations
    }
  })
  
  showAddAnimMenu.value = false
}

// v11.52: 从 action 移除动画
// v11.88: 移除 loop 属性
function removeAnimFromAction(index: number) {
  if (props.action?.type !== 'set_anim') return
  
  interface AnimItem { animName: string; action?: 'play' | 'stop' }
  const animations: AnimItem[] = [...currentAnimations.value]
  
  animations.splice(index, 1)
  
  emit('update', {
    params: {
      animations
    }
  })
}

// v11.88: 处理每个动画项的"本段结束后停止"变更
function handleAnimAutoStopChange(index: number, checked: boolean) {
  if (props.action?.type !== 'set_anim') return
  
  type AnimItem = SetAnimAction['params']['animations'][number]
  const animations: AnimItem[] = [...(props.action.params.animations || [])]
  
  if (animations[index]) {
    animations[index] = {
      ...animations[index],
      autoStopOnBlockEnd: checked
    }
  }
  
  emit('update', {
    params: {
      animations
    }
  })
}

// v12.x: handle loop override change
function handleAnimLoopOverrideChange(index: number, value: string) {
  if (props.action?.type !== 'set_anim') return
  
  type AnimItem = SetAnimAction['params']['animations'][number]
  const animations: AnimItem[] = [...(props.action.params.animations || [])]
  
  if (animations[index]) {
    const item = { ...animations[index] }
    if (value === '') {
      // Default: remove loop property
      delete (item as Record<string, unknown>)['loop']
    } else {
      item.loop = value === 'true'
    }
    animations[index] = item
  }
  
  emit('update', {
    params: {
      animations
    }
  })
}

function handleAnimTimingModeChange(index: number, value: string) {
  if (props.action?.type !== 'set_anim') return

  type AnimItem = SetAnimAction['params']['animations'][number]
  const animations: AnimItem[] = [...(props.action.params.animations || [])]

  if (animations[index]) {
    const item = { ...animations[index] }
    if (value === '') {
      delete (item as Record<string, unknown>)['timingMode']
    } else {
      item.timingMode = value as AnimationTimingMode
    }
    animations[index] = item
  }

  emit('update', {
    params: {
      animations
    }
  })
}


// 获取相机动作图标
function getCameraActionIcon(type: string): string {
  switch (type) {
    case 'camera_cut':
      return '✂️'
    case 'camera_move':
      return '🎞️'
    case 'camera_follow':
      return '🎯'
    case 'camera_shake':
      return '💥'
    default:
      return ''
  }
}

// 获取相机动作类型名称
function getCameraActionTypeName(type: string): string {
  switch (type) {
    case 'camera_cut':
      return '镜头切'
    case 'camera_move':
      return '运镜'
    case 'camera_follow':
      return '跟随'
    case 'camera_shake':
      return '震动'
    default:
      return ''
  }
}

</script>

<style scoped>
.action-inspector {
  height: 100%;
  overflow-y: auto;
}

.empty-hint {
  padding: 20px;
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
}

.inspector-form {
  padding: 16px;
}

.inspector-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.target-object {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-icon {
  font-size: 20px;
}

.target-name {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.property-section {
  margin-bottom: 24px;
}

.property-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.property-field {
  margin-bottom: 12px;
}

.property-field label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.property-field input[type="number"],
.property-field input[type="text"],
.property-field select {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  color: #374151;
  border: 1px solid #cfd8e3;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.property-field input[type="number"]:focus,
.property-field input[type="text"]:focus,
.property-field select:focus {
  outline: none;
  border-color: #9fb7d9;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.property-field input[type="range"] {
  width: 100%;
  margin-top: 8px;
}

.property-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
}

.radio-label input[type="radio"] {
  width: auto;
  cursor: pointer;
  margin: 0;
}

.radio-text {
  user-select: none;
}

.input-with-value {
  width: 100%;
}

.input-with-value input {
  width: 100%;
}

.unit {
  font-size: 12px;
  color: #9ca3af;
  margin-left: 4px;
}

.value-label {
  font-size: 12px;
  color: #6b7280;
  margin-left: 8px;
}

.segmented-control {
  display: flex;
  gap: 4px;
  background: #f3f4f6;
  padding: 2px;
  border-radius: 4px;
}

.segmented-btn {
  flex: 1;
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.segmented-btn:hover {
  background: rgba(255, 255, 255, 0.5);
}

.segmented-btn.active {
  background: white;
  color: #3b82f6;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.expression-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expression-name {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expression-select-btn {
  padding: 6px 12px;
  font-size: 13px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.expression-select-btn:hover {
  background: #2563eb;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.checkbox-row {
  margin-top: 8px;
}

/* v6.2 样式 */
.type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-badge.point {
  background: rgba(251, 191, 36, 0.2);
  color: #f59e0b;
}

.type-badge.duration {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.type-explanation {
  margin-top: 8px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 4px;
  border-left: 3px solid #d1d5db;
}

.hint {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 8px;
}

/* 槽位文本显示样式 */
.slot-text-display {
  margin-top: 12px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  overflow: hidden;
}

.slot-text-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #e0f2fe;
  border-bottom: 1px solid #bfdbfe;
}

.slot-badge {
  font-size: 12px;
  font-weight: 600;
  color: #0369a1;
  background: white;
  padding: 2px 8px;
  border-radius: 4px;
}

.slot-duration {
  font-size: 11px;
  color: #0891b2;
  font-family: 'Courier New', monospace;
}

.slot-text-content {
  padding: 10px 12px;
  font-size: 13px;
  color: #1e40af;
  line-height: 1.5;
  background: white;
}

/* v6.3 Delta 模式样式 */
.action-type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.action-type-badge.point {
  background: rgba(251, 191, 36, 0.2);
  color: #f59e0b;
}

.action-type-badge.duration {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.delta-property-item {
  margin-bottom: 12px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.delta-property-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.delta-property-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.delta-remove-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.delta-remove-btn:hover {
  background: #fecaca;
}

.empty-props-hint {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px dashed #d1d5db;
}

.scene-structure-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scene-structure-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.scene-structure-icon {
  font-size: 24px;
  line-height: 1;
}

.scene-structure-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.scene-structure-hint {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
}

.scene-structure-counts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.scene-structure-counts span {
  padding: 3px 8px;
  font-size: 12px;
  color: #374151;
  background: #f3f4f6;
  border-radius: 4px;
}

.scene-structure-object-entry {
  margin-bottom: 10px;
}

.scene-structure-object-entry:last-child {
  margin-bottom: 0;
}

.scene-structure-auto-restore-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  padding-left: 2px;
  color: #4b5563;
  font-size: 12px;
  cursor: pointer;
}

.scene-structure-auto-restore-row input {
  margin: 0;
}

.scene-structure-section {
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.scene-structure-operation-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.scene-structure-operation-hint {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
}

.scene-structure-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.scene-structure-subsection {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid #e5e7eb;
}

.scene-structure-subtitle {
  margin-bottom: 8px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
}

.scene-structure-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(100px, 140px);
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.scene-structure-row:last-child {
  margin-bottom: 0;
}

.scene-structure-object {
  min-width: 0;
}

.scene-structure-name {
  display: block;
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-structure-missing {
  display: block;
  margin-top: 2px;
  color: #dc2626;
  font-size: 11px;
}

.scene-structure-value {
  min-width: 0;
  padding: 5px 8px;
  overflow: hidden;
  color: #374151;
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* v9.2: Death Action 简化面板样式 */
.death-action-panel {
  text-align: center;
  padding: 24px 16px;
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.1), rgba(220, 38, 38, 0.1));
  border-radius: 8px;
  border: 1px dashed rgba(234, 88, 12, 0.3);
}
.death-action-panel .death-icon {
  font-size: 48px;
  margin-bottom: 8px;
}
.death-action-panel .death-label {
  font-size: 16px;
  font-weight: 600;
  color: #ea580c;
}
.death-action-panel .death-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 8px;
}

.add-property-section {
  position: relative;
  margin-top: 8px;
}

.add-property-btn {
  width: 100%;
  padding: 8px 16px;
  border: 1px dashed #3b82f6;
  background: rgba(59, 130, 246, 0.05);
  color: #3b82f6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.add-property-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

.add-property-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  overflow: hidden;
}

.add-property-option {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
}

.add-property-option:hover {
  background: #f3f4f6;
}

/* 部位素材编辑区域 */
.part-assets-edit-section {
  margin-top: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.part-assets-edit-section .section-header {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.part-assets-edit-section .section-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.part-asset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.part-asset-row:last-child {
  border-bottom: none;
}

.part-asset-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 80px;
}

.part-asset-icon {
  font-size: 14px;
}

.part-asset-name {
  font-size: 12px;
  color: #6b7280;
}

.part-asset-value {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.part-asset-thumbnail {
  width: 24px;
  height: 24px;
  object-fit: contain;
  border-radius: 4px;
  background: #fff;
  border: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.part-asset-asset-name {
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.part-asset-placeholder {
  font-size: 12px;
  color: #9ca3af;
  font-style: italic;
}

.part-asset-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.part-asset-edit-btn {
  padding: 4px 8px;
  font-size: 11px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.part-asset-edit-btn:hover {
  background: #2563eb;
}

.part-asset-remove-btn {
  width: 20px;
  height: 20px;
  font-size: 12px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.part-asset-remove-btn:hover {
  background: #fecaca;
}

/* 姿态切换确认对话框 */
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-dialog {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.confirm-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 16px;
}

.confirm-dialog-content {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 20px;
}

.invalid-parts-list {
  margin-top: 12px;
  padding-left: 20px;
  color: #dc2626;
}

.invalid-parts-list li {
  margin: 4px 0;
}

.confirm-dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-btn-cancel {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.confirm-btn-cancel:hover {
  background: #f3f4f6;
}

.confirm-btn-confirm {
  padding: 8px 16px;
  border: none;
  background: #3b82f6;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.confirm-btn-confirm:hover {
  background: #2563eb;
}

.color-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input-row input[type="color"] {
  width: 40px;
  height: 30px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
}

.color-hex-label {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

.range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-row input[type="range"] {
  flex: 1;
}

.percent-input-row,
.degree-input-row,
.zoom-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.percent-input-row input,
.degree-input-row input,
.zoom-input-row input {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  color: #374151;
  border: 1px solid #cfd8e3;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.percent-input-row input:focus,
.degree-input-row input:focus,
.zoom-input-row input:focus {
  outline: none;
  border-color: #9fb7d9;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.percent-label,
.degree-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  min-width: 16px;
}

.add-character-props {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.add-prop-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px dashed #3b82f6;
  background: rgba(59, 130, 246, 0.05);
  color: #3b82f6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-prop-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

/* 删除动作按钮 */
.delete-action-section {
  padding: 16px 16px 8px;
  border-top: 1px solid #e5e7eb;
  margin-top: 8px;
}

.delete-action-btn {
  width: 100%;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-action-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}

/* v6.4: set_anim 动画控制样式 */
.anim-state-item {
  margin-bottom: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.anim-state-controls {
  margin-top: 8px;
}

/* v11.3: 动画列表样式 */
.anim-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.anim-list-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.anim-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.anim-name {
  font-size: 12px;
  color: #374151;
  flex-shrink: 0;
}

.anim-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.anim-action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.anim-action-btn:hover {
  border-color: #9ca3af;
  background: #f3f4f6;
}

.anim-action-btn.active {
  background: #3b82f6;
  border-color: #2563eb;
  color: white;
}

.anim-loop-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
}

.anim-loop-check input {
  margin: 0;
  cursor: pointer;
}

/* v11.52: 移除动画按钮 */
.anim-remove-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #fecaca;
  border-radius: 4px;
  background: #fef2f2;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.anim-remove-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}

/* v11.52: 添加动画控制区域 */
.add-anim-section {
  margin-top: 12px;
  position: relative;
}

.add-anim-btn {
  width: 100%;
  padding: 8px 16px;
  font-size: 13px;
  color: #3b82f6;
  background: white;
  border: 1px dashed #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-anim-btn:hover {
  background: #eff6ff;
  border-color: #3b82f6;
}

.add-anim-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}

.add-anim-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: #374151;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.add-anim-option:hover {
  background: #f3f4f6;
}

.add-anim-option:first-child {
  border-radius: 6px 6px 0 0;
}

.add-anim-option:last-child {
  border-radius: 0 0 6px 6px;
}

.anim-action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.anim-action-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  transition: all 0.2s;
}

.anim-action-option:hover {
  border-color: #9ca3af;
}

.anim-action-option.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.anim-action-option.text-reveal-start-option.active {
  background: #ecfdf5;
  border-color: #10b981;
  color: #047857;
}

.anim-action-option.text-reveal-complete-option.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
}

.anim-action-option input[type="radio"] {
  display: none;
}

.anim-extra-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.anim-loop-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.anim-loop-checkbox input[type="checkbox"] {
  width: auto;
}

.anim-speed-input {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

.anim-speed-input input {
  width: 60px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

/* v12.x: controls row (buttons + loop select) */
.anim-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #e5e7eb;
}

.anim-option-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
}

.anim-option-checkbox input[type="checkbox"] {
  margin: 0;
  width: auto;
}

.anim-loop-select {
  padding: 8px 10px;
  font-size: 12px;
  border: 1px solid #cfd8e3;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  color: #374151;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04);
}

.anim-loop-select:focus {
  outline: none;
  border-color: #9fb7d9;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.anim-timing-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.anim-timing-label {
  color: #6b7280;
  font-size: 12px;
}

.anim-timing-select {
  min-width: 0;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  color: #4b5563;
  font-size: 12px;
  cursor: pointer;
}

.anim-timing-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10);
}

/* 相机控制台样式 */
.camera-console {
  margin-bottom: 16px;
}

.camera-mode-tabs {
  display: flex;
  gap: 4px;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}

.camera-mode-btn {
  flex: 1;
  padding: 8px 4px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.camera-mode-btn:hover {
  background: rgba(255, 255, 255, 0.7);
  color: #374151;
}

.camera-mode-btn.active {
  background: white;
  color: #059669;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.camera-mode-hint {
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #6b7280;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  border-left: 3px solid #22c55e;
}

.camera-action-type-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.type-icon {
  font-size: 20px;
}

.type-name {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.follow-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.follow-card {
  padding: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.follow-card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.follow-card-caption {
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.follow-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.follow-inline-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.follow-inline-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.follow-inline-label {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}

.follow-inline-field input[type="number"],
.follow-inline-field select,
.follow-sub-grid input[type="number"],
.follow-sub-grid select {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  color: #374151;
  border: 1px solid #cfd8e3;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.follow-inline-field input[type="number"]:focus,
.follow-inline-field select:focus,
.follow-sub-grid input[type="number"]:focus,
.follow-sub-grid select:focus {
  outline: none;
  border-color: #9fb7d9;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.follow-toggle-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.follow-toggle-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.follow-toggle-main input[type="checkbox"] {
  margin: 0;
}

.follow-toggle-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.follow-sub-grid {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #dbe3ee;
}

.follow-toggle-card-compact {
  gap: 6px;
}

/* camera_follow zoom 输入框 */
.zoom-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-input-row input {
  flex: 1;
  min-width: 0;
}

.zoom-input-row .value-label {
  font-size: 12px;
  color: #6b7280;
  min-width: 30px;
}

@media (max-width: 640px) {
  .follow-inline-grid {
    grid-template-columns: 1fr;
  }
}

.clear-zoom-btn {
  padding: 4px 8px;
  font-size: 14px;
  font-weight: bold;
  color: #9ca3af;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-zoom-btn:hover {
  color: #ef4444;
  background: #fef2f2;
  border-color: #fecaca;
}

/* v6.9: 使用当前值按钮 */
.use-current-btn {
  padding: 4px 8px;
  font-size: 12px;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.use-current-btn:hover {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #93c5fd;
}
.add-anim-section {
  margin-top: 12px;
}

.all-props-added-hint {
  padding: 12px;
  text-align: center;
  color: #10b981;
  font-size: 13px;
  background: #f0fdf4;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
  margin-top: 8px;
}

/* v11.88: 本段结束后停止 checkbox */
.auto-stop-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e5e7eb;
}

.auto-stop-section .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.auto-stop-section .checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
}

.auto-stop-section .checkbox-label span {
  user-select: none;
}

.auto-stop-section .checkbox-label:hover {
  color: #1f2937;
}

/* v11.88: 每个动画项的"本段结束后停止" checkbox */
.anim-auto-stop-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  margin-top: 6px;
  user-select: none;
}

.anim-auto-stop-label input[type="checkbox"] {
  width: 12px;
  height: 12px;
}

.anim-auto-stop-label span {
  white-space: nowrap;
}

.anim-auto-stop-label:hover {
  color: #374151;
}

/* P2: 自定义树形下拉组件 */
.follow-target-dropdown {
  position: relative;
  outline: none;
}

.follow-target-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cfd8e3;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  text-align: left;
  min-height: 42px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.follow-target-trigger:hover {
  border-color: #b7c6d9;
}

.follow-target-trigger:focus {
  outline: none;
  border-color: #9fb7d9;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.follow-target-placeholder {
  color: #9ca3af;
}

.follow-target-arrow {
  font-size: 8px;
  color: #6b7280;
  margin-left: 4px;
  flex-shrink: 0;
}

.follow-target-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-top: 2px;
}

.follow-target-item {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
  transition: background-color 0.1s;
}

.follow-target-item:hover {
  background: #f3f4f6;
}

.follow-target-item.selected {
  background: #eff6ff;
  color: #2563eb;
}

/* 子项目：缩进量由 inline style paddingLeft 控制 */
.follow-target-item.child-item {
  font-size: 11px;
  color: #6b7280;
}

.follow-target-item.child-item:hover {
  color: #374151;
}

.follow-target-item.child-item.selected {
  color: #2563eb;
}

/* 子项目前缀符号 └ */
.follow-target-child-prefix {
  color: #9ca3af;
  margin-right: 2px;
  font-size: 10px;
  flex-shrink: 0;
}

/* 折叠/展开按钮 — 放在行尾，不影响一级对象对齐 */
.follow-target-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 8px;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 2px;
  margin-left: auto;
}

.follow-target-toggle:hover {
  background: #e5e7eb;
  color: #374151;
}

.follow-target-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* P2: set_composite 可编辑面板 */
.composite-mode-tabs {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.composite-mode-btn {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s;
}

.composite-mode-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.composite-mode-btn.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 500;
}

/* === set_composite 渲染链排序 UI（对齐 entity composite 属性面板） === */
.sc-rc-list {
  margin-top: 6px;
}

.sc-rc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
  padding: 4px 0;
  border-bottom: 1px solid #e5e7eb;
}

.sc-rc-controls {
  display: flex;
  gap: 4px;
}

.sc-rc-move-btn {
  padding: 2px 8px;
  font-size: 13px;
  line-height: 1;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}

.sc-rc-move-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.sc-rc-move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.sc-rc-order-hint {
  text-align: center;
  font-size: 10px;
  color: #9ca3af;
  padding: 2px 0;
  letter-spacing: 1px;
}

.sc-rc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
  border: 1px solid transparent;
}

.sc-rc-item:hover {
  background: #f3f4f6;
}

.sc-rc-item[draggable="true"] {
  cursor: grab;
}

.sc-rc-item[draggable="true"]:active {
  cursor: grabbing;
}

.sc-rc-selected {
  background: #eff6ff !important;
  border-color: #93c5fd;
}

.sc-rc-drag-over {
  border-color: #3b82f6;
  background: #dbeafe !important;
}

.sc-rc-drag-handle {
  font-size: 14px;
  color: #c4c9d0;
  cursor: grab;
  flex-shrink: 0;
  letter-spacing: -2px;
  user-select: none;
  transition: color 0.15s;
}

.sc-rc-item:hover .sc-rc-drag-handle {
  color: #9ca3af;
}

.sc-rc-drag-handle:active {
  cursor: grabbing;
}

.sc-rc-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.sc-rc-name {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-rc-empty {
  padding: 8px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  font-style: italic;
}

.sc-rc-zindex-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin: 4px 0 2px;
}

.sc-rc-zindex-divider::before,
.sc-rc-zindex-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.sc-rc-zindex-label {
  font-size: 10px;
  color: #9ca3af;
  white-space: nowrap;
  font-family: monospace;
}

/* === Clip-Mask Phase 1 D3: set_mask UI === */
.mask-target-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mask-target-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.mask-target-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.mask-target-name {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mask-target-remove-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 3px;
}

.mask-target-remove-btn:hover {
  background: #fee2e2;
}

.mask-target-empty {
  padding: 6px 8px;
  font-size: 12px;
  color: #9ca3af;
  font-style: italic;
}

.mask-target-add-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.mask-target-add-select {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
}

.mask-target-add-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.mask-target-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mask-target-add-btn:not(:disabled):hover {
  background: #f3f4f6;
}
</style>
