<template>
  <div class="properties-panel">
    <!-- P2: 对象选择器（可折叠树形下拉） -->
    <div class="object-selector-section">
      <div
        ref="treeDropdownRef"
        class="tree-dropdown"
      >
        <!-- 选中项显示 / 触发按钮 -->
        <button
          class="tree-dropdown-trigger"
          @click="treeDropdownOpen = !treeDropdownOpen"
        >
          <span v-if="localObject" class="trigger-content">
            <span class="trigger-icon">{{ getObjectIcon(localObject.type) }}</span>
            <span class="trigger-label">{{ getObjectDisplayName(localObject) }}</span>
          </span>
          <span v-else class="trigger-placeholder">请选择对象</span>
          <span class="trigger-arrow">{{ treeDropdownOpen ? '▲' : '▼' }}</span>
        </button>

        <!-- 下拉列表 -->
        <div
          v-show="treeDropdownOpen"
          class="tree-dropdown-list"
        >
          <template v-for="obj in filteredObjects" :key="obj.id">
            <!-- 跳过已折叠的子对象（需检查所有祖先是否展开） -->
            <div
              v-if="isTreeItemVisible(obj)"
              class="tree-item"
              :class="{
                selected: localObject?.id === obj.id,
                'child-item': !!getEffectiveParentId(obj),
                'nested-child-item': getTreeDepth(obj) > 1,
                inactive: isActionMode && !isObjectVisibleAtCurrentSlot(obj.id)
              }"
              @click="handleTreeItemSelect(obj.id)"
            >
              <button
                v-if="obj.type === 'composite' || hasRuntimeChildren(obj.id)"
                class="tree-toggle-btn"
                :style="getEffectiveParentId(obj) ? { marginLeft: (getTreeDepth(obj) - 1) * 16 + 'px' } : {}"
                @click.stop="toggleCompositeExpand(obj.id)"
              >
                {{ expandedComposites.has(obj.id) ? '▼' : '▶' }}
              </button>
              <span v-else-if="getEffectiveParentId(obj)" class="tree-indent" :style="{ paddingLeft: (getTreeDepth(obj) - 1) * 16 + 'px' }">└</span>
              <span v-else class="tree-indent-spacer" />

              <span class="tree-item-icon">{{ getObjectIcon(obj.type) }}</span>
              <span class="tree-item-label">{{ getObjectDisplayName(obj) }}{{ getObjectStatusSuffix(obj.id) }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <div
      v-if="!selectedObject || !localObject"
      class="empty-hint"
    >
      请选择场景对象以编辑属性
    </div>
    <div
      v-else
      class="properties-form"
    >
      <!-- Action Mode 槽位提示 -->
      <div
        v-if="isActionMode"
        class="action-mode-hint"
      >
        <div class="slot-indicator">
          <span class="slot-badge">#{{ (currentSlotIndex ?? 0) + 1 }}</span>
          <span class="slot-text">{{ currentSlotText ? truncateText(currentSlotText, 15) : '当前槽位' }}</span>
        </div>
        <div class="hint-text">
          💡 修改属性将根据动作模式自动录制
        </div>
        <!-- v9.1: 未出生对象警告 -->
        <div
          v-if="!isObjectBornAtCurrentSlot"
          class="unborn-warning"
        >
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">该对象尚未出生，当前属性为只读</span>
          <button
            v-if="objectBirthSlotIndex >= 0"
            class="jump-btn"
            title="跳转到对象出生的槽位"
            @click="jumpToBirthSlot"
          >
            跳转到出生点
          </button>
        </div>
      </div>

      <!-- v9.1: 录制模式切换 (动画/布局) - 仅在 Action Mode 下显示 -->
      <div
        v-if="isActionMode && !isCamera && localObject?.type !== 'audio'"
        class="record-mode-section"
      >
        <div class="record-mode-label">动作模式:</div>
        <div class="record-mode-tabs">
          <button
            class="record-mode-btn"
            :class="{ active: recordMode === 'animation' }"
            title="补间模式 - 拖拽产生平滑移动动画"
            @click="recordMode = 'animation'"
          >
            🎬 补间
          </button>
          <button
            class="record-mode-btn"
            :class="{ active: recordMode === 'layout' }"
            title="瞬时模式 - 拖拽产生瞬间位移"
            @click="recordMode = 'layout'"
          >
            📍 瞬时
          </button>
        </div>
      </div>

      <!-- ===== 快捷操作工具栏 ===== -->
      <div
        class="quick-toolbar"
        :class="{
          'with-record-mode': isActionMode && !isCamera && localObject?.type !== 'audio',
          'setup-toolbar': !isActionMode
        }"
      >
        <div class="quick-toolbar-header">
          <span class="quick-toolbar-title">快捷操作</span>
          <span class="quick-toolbar-subtitle">
            {{ isActionMode ? '当前对象的编辑辅助开关' : '当前对象的场景编辑辅助开关' }}
          </span>
        </div>
        <!-- compositeLocked 切换 (仅组合对象显示) -->
        <div
          v-if="localObject?.type === 'composite'"
          class="quick-toolbar-group quick-toolbar-group--compact"
        >
          <span class="quick-toolbar-group-label">锁定</span>
        <label v-if="localObject?.type === 'composite'" class="qt-toggle">
          <input
            :checked="(localObject as CompositeObject).compositeLocked"
            type="checkbox"
            @change="handleCompositeLockChange"
          >
          <span class="qt-toggle-label">🔒 锁定组合</span>
        </label>
        </div>

        <!-- 穿透控制 -->
        <div class="quick-toolbar-group quick-toolbar-group--fill">
          <span class="quick-toolbar-group-label">穿透</span>
        <div v-if="isPassThrough" class="pass-through-indicator">
          <div class="pt-status-line">
            <span class="pt-icon">👻</span>
            <span class="pt-text">此对象已设为穿透模式</span>
          </div>
          <div class="pt-actions">
            <button
              class="pt-btn"
              :class="{ active: passThroughVisible }"
              @click="emit('passThroughVisibleToggle', localObject!.id)"
            >
              {{ passThroughVisible ? '👁️ 显示' : '🚫 隐藏' }}
            </button>
            <button
              class="pt-btn remove"
              @click="emit('passThroughToggle', localObject!.id)"
            >
              ↩ 解除穿透
            </button>
          </div>
        </div>
        <button
          v-else
          class="qt-pt-btn"
          @click="emit('passThroughToggle', localObject!.id)"
        >
          👻 设为穿透
        </button>
        </div>
      </div>

      <!-- 基础属性 -->
      <div class="property-section">
        <h4>基础属性</h4>
        
        <!-- v9.3: 名称编辑（合并原名称和别名） -->
        <div
          v-if="!isCamera"
          class="property-field alias-field"
        >
          <label>名称:</label>
          <div class="alias-edit-stack">
            <div class="alias-edit-row">
              <span class="alias-value">{{ localObjectDisplayName }}</span>
              <button
                class="alias-edit-btn"
                title="编辑名称"
                @click="handleEditAliasClick"
              >
                编辑
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="showPresetNamePicker"
          class="property-field alias-field preset-name-field"
        >
          <label>预定义名称:</label>
          <div class="alias-edit-stack">
            <div
              class="preset-name-row"
            >
              <select
                class="preset-name-select"
                :value="selectedPresetNameValue"
                title="选择预定义动作使用的推荐名称"
                @change="handlePresetNameSelect(($event.target as HTMLSelectElement).value)"
              >
                <option value="">选择预定义名称...</option>
                <option
                  v-for="name in recommendedNameOptions"
                  :key="name"
                  :value="name"
                  :disabled="isPresetNameUsedByOtherObject(name)"
                >
                  {{ name }}{{ isPresetNameUsedByOtherObject(name) ? '（已使用）' : '' }}
                </option>
              </select>
            </div>
          </div>
        </div>
        
        <div
          v-if="localObject.type !== 'audio' && !isAmbientLight"
          class="property-row"
        >
          <div class="property-field">
            <label>{{ isCamera ? '中心X:' : 'X:' }}</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ Math.round(localObject.x) }}</span>
            </template>
            <template v-else>
              <input 
                :value="Math.round(localObject.x)" 
                type="number" 
                :min="0" 
                :max="props.canvasWidth || 3840" 
                @change="handleXChange" 
              >
            </template>
          </div>
          <div class="property-field">
            <label>{{ isCamera ? '中心Y:' : 'Y:' }}</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ Math.round(localObject.y) }}</span>
            </template>
            <template v-else>
              <input 
                :value="Math.round(localObject.y)" 
                type="number" 
                :min="0" 
                :max="props.canvasHeight ?? 2160" 
                @change="handleYChange" 
              >
            </template>
          </div>
        </div>
        
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'light'"
          class="property-row"
        >
          <div class="property-field">
            <label>宽度:</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ displayWidth }}</span>
            </template>
            <template v-else>
              <input 
                v-model.number="displayWidth" 
                type="number" 
                :min="1" 
                @change="handleSizeChange" 
              >
            </template>
          </div>
          <div class="property-field">
            <label>高度:</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ displayHeight }}</span>
            </template>
            <template v-else>
              <input 
                v-model.number="displayHeight" 
                type="number" 
                :min="1" 
                @change="handleSizeChange" 
              >
            </template>
          </div>
        </div>
        
        <!-- 相机 Zoom 属性 -->
        <div
          v-if="isCamera"
          class="property-field"
        >
          <label>Zoom:</label>
          <template v-if="isActionMode">
            <span class="readonly-value">{{ cameraZoomPercent }}%</span>
          </template>
          <template v-else>
            <div class="scale-control">
              <input 
                :value="cameraZoomPercent" 
                type="number" 
                min="10" 
                max="1000" 
                step="10"
                class="scale-input"
                @change="handleCameraZoomChange" 
              >
              <span class="percent-label">%</span>
            </div>
            <input 
              :value="cameraZoomPercent" 
              type="range" 
              min="10" 
              max="500" 
              step="10" 
              class="scale-slider"
              @input="handleCameraZoomSliderChange" 
            >
          </template>
        </div>
        
        <!-- 非相机对象的缩放比例 -->
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'light'"
          style="display: flex; flex-direction: column; gap: 8px;"
        >
          <div class="property-row">
            <div class="property-field" style="flex: 1">
              <label>缩放X:</label>
              <template v-if="isActionMode">
                <span class="readonly-value">{{ scalePercentX }}%</span>
              </template>
              <template v-else>
                <div class="scale-control">
                  <input 
                    v-model.number="scalePercentX" 
                    type="number" 
                    min="1" 
                    max="1000" 
                    step="1"
                    class="scale-input"
                    @change="handleScaleXInputChange" 
                  >
                  <span class="percent-label">%</span>
                </div>
              </template>
            </div>
            <button 
              v-if="!isActionMode"
              class="lock-btn" 
              style="background: none; border: none; cursor: pointer; padding: 0 4px; font-size: 14px; align-self: flex-end; margin-bottom: 6px; opacity: 0.8; height: 28px;"
              :title="scaleLocked ? '解锁比例' : '锁定比例'"
              @click="toggleScaleLock"
            >
              {{ scaleLocked ? '🔗' : '🔓' }}
            </button>
            <div class="property-field" style="flex: 1">
              <label>缩放Y:</label>
              <template v-if="isActionMode">
                <span class="readonly-value">{{ scalePercentY }}%</span>
              </template>
              <template v-else>
                <div class="scale-control">
                  <input 
                    v-model.number="scalePercentY" 
                    type="number" 
                    min="1" 
                    max="1000" 
                    step="1"
                    class="scale-input"
                    @change="handleScaleYInputChange" 
                  >
                  <span class="percent-label">%</span>
                </div>
              </template>
            </div>
          </div>
        </div>
        
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'light'"
          class="property-field"
        >
          <label>旋转（度）:</label>
          <template v-if="isActionMode">
            <span class="readonly-value">{{ rotationDegrees }}</span>
          </template>
          <template v-else>
            <input
              v-model.number="rotationDegrees"
              type="number"
              step="1"
              @change="handleRotationChange"
            >
          </template>
        </div>
        
        <!-- 变换原点（像素偏移） -->
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'light'"
          class="property-row"
        >
          <div class="property-field">
            <label>变换点X:</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ localObject.transformOriginX ?? 0 }}</span>
            </template>
            <template v-else>
              <input 
                :value="localObject.transformOriginX ?? 0" 
                type="number" 
                step="1"
                @change="handleTransformOriginXChange" 
              >
            </template>
          </div>
          <div class="property-field">
            <label>变换点Y:</label>
            <template v-if="isActionMode">
              <span class="readonly-value">{{ localObject.transformOriginY ?? 0 }}</span>
            </template>
            <template v-else>
              <input 
                :value="localObject.transformOriginY ?? 0" 
                type="number" 
                step="1"
                @change="handleTransformOriginYChange" 
              >
            </template>
          </div>
        </div>
        
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'light'"
          class="property-field"
        >
          <label>不透明度:</label>
          <input
            v-model.number="localObject.alpha"
            type="range"
            min="0"
            max="1"
            step="0.1"
            @change="handleUpdate"
          >
          <span class="value-label">{{ localObject.alpha.toFixed(1) }}</span>
        </div>
        
        <div
          v-if="!isCamera && localObject.type !== 'audio'"
          class="property-field"
        >
          <label>层级:</label>
          <input
            v-model.number="localObject.zIndex"
            type="number"
            @change="handleZIndexChange"
          >
        </div>
        
        <!-- v9.2: 恢复 visible 控件 (spawned 分离生命周期与可见性) -->
        <div
          v-if="!isCamera && localObject.type !== 'audio' && !isAmbientLight"
          class="property-field checkbox"
        >
          <label>
            <input
              :checked="localObject.visible"
              type="checkbox"
              @change="handleVisibleChange"
            >
            可见
          </label>
        </div>

        <!-- flipX 水平翻转（所有可视对象通用） -->
        <div
          v-if="!isCamera && localObject.type !== 'audio' && localObject.type !== 'screen_effect' && localObject.type !== 'light'"
          class="property-field checkbox"
        >
          <label>
            <input
              :checked="localObject.flipX"
              type="checkbox"
              @change="handleFlipXChange"
            >
            水平翻转
          </label>
        </div>

        <div
          v-if="showReceiveLighting"
          class="property-field checkbox"
        >
          <label>
            <input
              :checked="localObject.receiveLighting ?? true"
              type="checkbox"
              @change="handleReceiveLightingChange"
            >
            参与场景光照
          </label>
        </div>

        <div
          v-if="showCastShadow"
          class="property-field checkbox"
        >
          <label>
            <input
              :checked="localObject.castShadow ?? false"
              type="checkbox"
              @change="handleCastShadowChange"
            >
            脚底投影
          </label>
        </div>

        <!-- P2: 子对象归属提示（位于基础属性区段末尾） -->
        <div
          v-if="parentComposite"
          class="parent-composite-hint"
        >
          <span class="hint-label">📎 所属组合:</span>
          <button
            class="hint-name hint-name-clickable"
            title="点击选中父组合"
            @click="emit('selectObject', parentComposite!.id)"
          >
            📦 {{ parentComposite.alias ?? parentComposite.name ?? '组合' }}
          </button>
          <button
            class="remove-from-group-btn"
            :title="isActionMode ? '创建结构变更 Action' : '移出组合'"
            @click="handleRemoveFromComposite"
          >
            {{ isActionMode ? '🎬 移出' : '⤴ 移出' }}
          </button>
        </div>
      </div>
      

      <!-- 背景特有属性（flipX 已上提到基础属性区段） -->

      <!-- 道具特有属性（flipX 已上提到基础属性区段） -->

      <!-- P2: 组合对象特有属性 -->
      <div
        v-if="localObject.type === 'composite'"
        class="property-section"
      >
        <h4>📦 组合属性</h4>
        
        <!-- compositeMode 显示（始终只读） -->
        <div class="property-field">
          <label>组合模式:</label>
          <span class="composite-mode-readonly">
            {{ (localObject as CompositeObject).compositeMode === 'entity' ? '📦 实体' : '📎 联合' }}
          </span>
        </div>
        
        <!-- 子对象存储列表（管理增删） -->
        <div class="composite-children-list">
          <div class="children-header">
            <span>子对象 ({{ compositeChildObjects.length }})</span>
            <button
              class="add-child-btn"
              :title="isActionMode ? '创建结构变更 Action 添加成员' : '添加成员到组合'"
              @click="handleAddMemberToComposite"
            >
              ➕
            </button>
          </div>
          <div
            v-for="child in compositeChildObjects"
            :key="child.id"
            class="child-item child-item-clickable"
            title="点击选中此子对象"
            @click="emit('selectObject', child.id)"
          >
            <span class="child-icon">{{ getObjectIcon(child.type) }}</span>
            <span class="child-name">{{ child.alias ?? child.name ?? '未命名' }}</span>
            <button
              class="remove-child-btn"
              :title="isActionMode ? '创建结构变更 Action' : '移出组合'"
              @click="handleRemoveChildFromComposite(child.id)"
            >
              {{ '⤴' }}
            </button>
          </div>
          <div v-if="compositeChildObjects.length === 0" class="empty-children">
            暂无子对象
          </div>
        </div>

        <!-- 渲染顺序列表（仅 entity，控制渲染顺序） -->
        <div
          v-if="(localObject as CompositeObject).compositeMode === 'entity' && renderChainObjects.length > 0"
          class="composite-children-list render-chain-section"
          style="margin-top: 8px;"
        >
          <div class="children-header render-chain-header">
            <span>渲染顺序 ({{ renderChainObjects.length }})</span>
            <div class="render-chain-controls">
              <button
                class="rc-move-btn"
                title="上移（底层方向）"
                :disabled="!canMoveUp"
                @click="handleRenderChainMoveUp(selectedRenderChainIndex)"
              >
                ↑
              </button>
              <button
                class="rc-move-btn"
                title="下移（顶层方向）"
                :disabled="!canMoveDown"
                @click="handleRenderChainMoveDown(selectedRenderChainIndex)"
              >
                ↓
              </button>
            </div>
          </div>
          <div class="render-order-hint">
            ↑ 底层  ·  ↓ 顶层
          </div>
          <template v-for="(entry, displayIdx) in renderChainDisplay" :key="'rcd-' + displayIdx">
            <!-- zIndex 分组分割线 -->
            <div v-if="entry.type === 'divider'" class="zindex-divider">
              <span class="zindex-label">层级 {{ entry.zIndex }}</span>
            </div>
            <!-- 渲染链项 -->
            <div
              v-else
              class="child-item rc-item"
              :class="{
                'rc-selected': entry.obj.id === selectedRenderChainId,
                'rc-drag-over': rcDragOverIndex === entry.flatIndex,
              }"
              draggable="true"
              @click="selectedRenderChainId = entry.obj.id"
              @dragstart="onRcDragStart(entry.flatIndex, $event)"
              @dragover.prevent="onRcDragOver(entry.flatIndex)"
              @dragleave="onRcDragLeave"
              @drop.prevent="onRcDrop(entry.flatIndex)"
              @dragend="onRcDragEnd"
            >
              <span class="rc-drag-handle" title="拖拽排序">⠿</span>
              <span class="child-icon">{{ getObjectIcon(entry.obj.type) }}</span>
              <span class="child-name">{{ entry.obj.alias ?? entry.obj.name ?? '未命名' }}</span>
            </div>
          </template>
        </div>


        
        <!-- 拆分全部按钮 -->
        <div v-if="compositeChildObjects.length > 0" class="composite-actions">
          <button
            class="composite-action-btn danger"
            :title="isActionMode ? '创建结构变更 Action' : '解散组合，所有子对象变为独立对象'"
            @click="handleUngroupAll"
          >
            🔓 拆分全部
          </button>
        </div>
      </div>
      <!-- v16: 元件素材区段 -->
      <div
        v-if="localObject.type === 'symbol'"
        class="property-section"
      >
        <h4>🔧 元件素材</h4>

        <!-- 当前素材预览 -->
        <div class="symbol-preview-area">
          <div class="symbol-preview-frame">
            <img
              v-if="currentMaterialPreviewUrl"
              :src="currentMaterialPreviewUrl"
              alt="当前素材"
            >
            <div v-else class="symbol-preview-empty">
              <span>🖼️</span>
              <span>未选择素材</span>
            </div>
          </div>
          <div class="symbol-preview-info">
            <div class="symbol-current-name">
              {{ symbolCurrentMaterialName }}
            </div>
            <div class="symbol-material-count">
              共 {{ symbolMaterials.length }} 个素材
            </div>
            <div
              v-if="symbolCurrentMaterialPath"
              class="symbol-material-path"
              :title="symbolCurrentMaterialPath"
            >
              📂 {{ symbolCurrentMaterialPath }}
            </div>
          </div>
        </div>

        <!-- 快速切换网格 -->
        <div
          v-if="symbolMaterials.length > 1"
          class="symbol-switch-grid"
        >
          <div
            v-for="mat in symbolMaterials"
            :key="mat.id"
            class="symbol-switch-item"
            :class="{ active: mat.id === symbolCurrentMaterialId }"
            :title="mat.name"
            @click="handleSwitchMaterial(mat.id)"
          >
            <img
              v-if="getSymbolMaterialThumb(mat)"
              :src="getSymbolMaterialThumb(mat)!"
              alt=""
            >
            <span v-else class="switch-icon">🖼️</span>
            <span class="switch-name">{{ mat.name }}</span>
          </div>
        </div>
      </div>

      <!-- v18: 独立表情对象属性区段 -->
      <div
        v-if="localObject.type === 'expression'"
        class="property-section"
      >
        <h4>😀 表情引用</h4>

        <div
          class="expression-card"
          @click="showExpressionObjectDialog = true"
        >
          <div class="expression-card-thumb">
            <img
              v-if="expressionObjectInfo?.thumbnailUrl"
              :src="expressionObjectInfo.thumbnailUrl"
              alt="当前表情"
              :style="{ transform: expressionObjectInfo?.flipH ? 'scaleX(-1)' : 'none' }"
            >
            <div v-else class="symbol-preview-empty">
              <span>😶</span>
            </div>
          </div>
          <div class="expression-card-info">
            <div class="expression-card-name">
              {{ expressionObjectInfo?.name ?? '未知表情' }}
              <span
                v-if="!expressionIsModified"
                class="expression-default-badge"
                title="默认表情"
              >⭐</span>
            </div>
            <div class="expression-card-hint">点击切换</div>
          </div>
          <div class="expression-card-action">
            🔄
          </div>
        </div>
        <!-- 恢复默认 / 设为默认 操作链接 -->
        <div
          v-if="expressionIsModified"
          class="expression-default-actions"
        >
          <span
            class="expression-action-link restore"
            @click.stop="handleRestoreDefaultExpression"
          >↩️ 恢复默认</span>
          <span
            v-if="!isActionMode"
            class="expression-action-link set-default"
            @click.stop="handleSetDefaultExpression"
          >⭐ 设为默认</span>
        </div>

        <!-- 编辑表情资源 -->
        <button
          class="btn-add-playlist"
          style="margin-top: 8px"
          @click="openExpressionEditor"
        >
          ✏️ 编辑表情资源
        </button>
      </div>

      <!-- 特效特有属性 -->
      <div
        v-if="localObject.type === 'screen_effect'"
        class="property-section"
      >
        <h4>🌟 特效参数</h4>

        <!-- 基础覆盖 -->
        <div class="property-field">
          <label>遮罩颜色:</label>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input
              :value="(localObject as ScreenEffectObject).params.baseColor ?? '#000000'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleScreenEffectParamChange('baseColor', ($event.target as HTMLInputElement).value)"
            >
            <span class="value-label">{{ (localObject as ScreenEffectObject).params.baseColor ?? '#000000' }}</span>
          </div>
        </div>

        <!-- 覆盖不透明度已删除，统一由基础属性区的「不透明度」滑块 (alpha) 控制 -->

        <!-- 挖孔形状（如果有） -->
        <template v-if="(localObject as ScreenEffectObject).params.holeShape">
          <div class="property-field">
            <label>挖孔形状:</label>
            <select
              :value="(localObject as ScreenEffectObject).params.holeShape"
              @change="handleScreenEffectParamChange('holeShape', ($event.target as HTMLSelectElement).value)"
            >
              <option value="circle">圆形</option>
              <option value="horizontal_ellipse">水平椭圆</option>
              <option value="vertical_ellipse">垂直椭圆</option>
              <option value="rectangle">矩形</option>
            </select>
          </div>

          <div class="property-row">
            <div class="property-field">
              <label>孔宽:</label>
              <input
                :value="(localObject as ScreenEffectObject).params.holeWidth ?? 600"
                type="number"
                min="10"
                max="3840"
                step="10"
                @change="handleScreenEffectParamChange('holeWidth', parseFloat(($event.target as HTMLInputElement).value))"
              >
            </div>
            <div class="property-field">
              <label>孔高:</label>
              <input
                :value="(localObject as ScreenEffectObject).params.holeHeight ?? 600"
                type="number"
                min="10"
                max="2160"
                step="10"
                @change="handleScreenEffectParamChange('holeHeight', parseFloat(($event.target as HTMLInputElement).value))"
              >
            </div>
          </div>

          <div class="property-field">
            <label>开孔比例:</label>
            <input
              :value="(localObject as ScreenEffectObject).params.openRatio ?? 1.0"
              type="range"
              min="0"
              max="1"
              step="0.01"
              @input="handleScreenEffectParamChange('openRatio', parseFloat(($event.target as HTMLInputElement).value))"
            >
            <span class="value-label">{{ Math.round(((localObject as ScreenEffectObject).params.openRatio ?? 1) * 100) }}%</span>
          </div>


        </template>



      </div>

      <!-- 音频特有属性 -->
      <div
        v-if="localObject.type === 'audio'"
        class="property-section"
      >
        <h4>音频属性</h4>
        
        <!-- 试听按钮 -->
        <div class="property-field">
          <button 
            class="preview-audio-btn" 
            :class="{ playing: isAudioPreviewing }"
            @click="handleAudioPreview"
          >
            <span class="btn-icon">{{ isAudioPreviewing ? '⏸' : '▶' }}</span>
            <span class="btn-label">{{ isAudioPreviewing ? '停止试听' : '试听' }}</span>
          </button>
        </div>

        <!-- Setup 模式 -->
        <template v-if="!isActionMode">
          <div class="anim-default-item">
            <div class="anim-part-header">
              <span class="anim-part-name">默认行为</span>
            </div>
            
            <div class="anim-default-options">
              <label
                class="anim-option"
                :class="{ active: (localObject as AudioObject).playbackState === 'play' }"
              >
                <input 
                  type="radio" 
                  name="audio-default-state" 
                  value="play" 
                  :checked="(localObject as AudioObject).playbackState === 'play'"
                  @change="updateAudioPlaybackState('play')"
                >
                <span class="option-icon">▶</span>
                <span class="option-label">默认播放</span>
              </label>
              <label
                class="anim-option"
                :class="{ active: (localObject as AudioObject).playbackState === 'stop' }"
              >
                <input 
                  type="radio" 
                  name="audio-default-state" 
                  value="stop" 
                  :checked="(localObject as AudioObject).playbackState === 'stop'"
                  @change="updateAudioPlaybackState('stop')"
                >
                <span class="option-icon">⏹</span>
                <span class="option-label">默认停止</span>
              </label>
            </div>

            <div
              class="anim-action-extras-column"
              style="border-top: 1px dashed #e5e7eb; padding-top: 8px; margin-top: 8px;"
            >
              <div class="property-field checkbox">
                <label>
                  <input 
                    v-model="(localObject as AudioObject).loop" 
                    type="checkbox" 
                    @change="handleUpdate"
                  >
                  循环播放 (Loop)
                </label>
              </div>

              <div class="property-field">
                <label>音量: {{ Math.round(((localObject as AudioObject).volume ?? 1.0) * 100) }}%</label>
                <input 
                  v-model.number="(localObject as AudioObject).volume" 
                  type="range" 
                  min="0" 
                  :max="1" 
                  step="0.05" 
                  @change="handleUpdate" 
                >
              </div>

              <div class="property-row">
                <div class="property-field">
                  <label>淡入 (秒):</label>
                  <input 
                    v-model.number="(localObject as AudioObject).fadeIn" 
                    type="number" 
                    min="0" 
                    step="0.1" 
                    @change="handleUpdate" 
                  >
                </div>
                <div class="property-field">
                  <label>淡出 (秒):</label>
                  <input 
                    v-model.number="(localObject as AudioObject).fadeOut" 
                    type="number" 
                    min="0" 
                    step="0.1" 
                    @change="handleUpdate" 
                  >
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Action Mode: 播放控制与属性 -->
        <template v-else>
          <div class="anim-action-item">
            <div class="anim-action-header">
              <span class="anim-part-name">音频动作</span>
            </div>

            <div class="anim-action-options">
              <button 
                class="action-option-btn play"
                :class="{ selected: getAudioActionState() === 'play' }"
                title="创建播放动作"
                @click="handleAudioAction('play')"
              >
                <span class="btn-icon">▶</span>
                <span class="btn-label">播放</span>
              </button>
              <button 
                class="action-option-btn stop"
                :class="{ selected: getAudioActionState() === 'stop' }"
                title="创建停止动作"
                @click="handleAudioAction('stop')"
              >
                <span class="btn-icon">⏹</span>
                <span class="btn-label">停止</span>
              </button>
            </div>

            <div
              class="anim-action-extras-column"
              style="border-top: 1px dashed #e5e7eb; padding-top: 8px; margin-top: 8px;"
            >
              <div class="property-field checkbox">
                <label>
                  <input 
                    :checked="getAudioActionLoop()" 
                    type="checkbox" 
                    @change="updateAudioActionParam('loop', ($event.target as HTMLInputElement).checked)"
                  >
                  循环播放 (Loop)
                </label>
              </div>

              <div class="property-field">
                <label>音量: {{ Math.round(getAudioActionVolume() * 100) }}%</label>
                <input 
                  :value="getAudioActionVolume()"
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  @input="updateAudioActionParam('volume', parseFloat(($event.target as HTMLInputElement).value))" 
                >
              </div>

              <div class="property-row">
                <div class="property-field">
                  <label>淡入 (秒):</label>
                  <input 
                    :value="getAudioActionParam('fadeIn')"
                    type="number" 
                    min="0" 
                    step="0.1" 
                    @change="updateAudioActionParam('fadeIn', parseFloat(($event.target as HTMLInputElement).value))" 
                  >
                </div>
                <div class="property-field">
                  <label>淡出 (秒):</label>
                  <input 
                    :value="getAudioActionParam('fadeOut')"
                    type="number" 
                    min="0" 
                    step="0.1" 
                    @change="updateAudioActionParam('fadeOut', parseFloat(($event.target as HTMLInputElement).value))" 
                  >
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 💡 光源属性 -->
      <div
        v-if="localObject.type === 'light'"
        class="property-section"
      >
        <h4>💡 光源属性</h4>

        <!-- 光源类型（只读） -->
        <div class="property-field">
          <label>光源类型:</label>
          <span class="composite-mode-readonly">
            {{
              (localObject as LightObject).lightType === 'ambient'
                ? '🌍 环境光'
                : (localObject as LightObject).lightType === 'spot'
                  ? '🔦 聚光灯'
                  : '💡 点光源'
            }}
          </span>
        </div>

        <!-- 环境光预设 -->
        <div
          v-if="(localObject as LightObject).lightType === 'ambient'"
          class="property-field"
        >
          <label>预设:</label>
          <div class="ambient-preset-grid">
            <button
              v-for="preset in AMBIENT_LIGHT_PRESETS"
              :key="preset.id"
              class="ambient-preset-btn"
              :title="`${preset.label} (${preset.color}, ${Math.round(preset.intensity * 100)}%)`"
              @click="handleAmbientPreset(preset)"
            >
              <span
                class="preset-color-dot"
                :style="{ background: preset.color }"
              />
              <span class="preset-label">{{ preset.label }}</span>
            </button>
          </div>
        </div>

        <!-- 点光 / 聚光预设 -->
        <div
          v-if="(localObject as LightObject).lightType !== 'ambient'"
          class="property-field"
        >
          <label>预设:</label>
          <div class="ambient-preset-grid">
            <button
              v-for="preset in currentLightPresets"
              :key="preset.id"
              class="ambient-preset-btn"
              :title="`${preset.label} — ${preset.description}`"
              @click="handleLightPresetApply(preset)"
            >
              <span
                class="preset-color-dot"
                :style="{ background: preset.params.lightColor }"
              />
              <span class="preset-label">{{ preset.label }}</span>
            </button>
          </div>
        </div>

        <div class="property-field">
          <label>颜色:</label>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input
              :value="(localObject as LightObject).lightColor ?? '#ffffff'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleLightParamChange('lightColor', ($event.target as HTMLInputElement).value)"
            >
            <span class="value-label">{{ (localObject as LightObject).lightColor ?? '#ffffff' }}</span>
          </div>
        </div>

        <div class="property-field">
          <label>强度: {{ ((localObject as LightObject).lightIntensity ?? 1.0).toFixed(2) }}</label>
          <input
            :value="(localObject as LightObject).lightIntensity ?? 1.0"
            type="range"
            min="0"
            max="3"
            step="0.05"
            @input="handleLightParamChange('lightIntensity', parseFloat(($event.target as HTMLInputElement).value))"
          >
        </div>

        <div
          v-if="(localObject as LightObject).lightType !== 'ambient'"
          class="property-field"
        >
          <label>半径: {{ Math.round((localObject as LightObject).lightRadius ?? 500) }}</label>
          <input
            :value="(localObject as LightObject).lightRadius ?? 500"
            type="range"
            min="50"
            max="3000"
            step="10"
            @input="handleLightParamChange('lightRadius', parseFloat(($event.target as HTMLInputElement).value))"
          >
        </div>

        <!-- 闪烁参数（非环境光） -->
        <template v-if="(localObject as LightObject).lightType !== 'ambient'">
          <div class="property-field">
            <label>闪烁强度: {{ ((localObject as LightObject).flicker ?? 0).toFixed(2) }}</label>
            <input
              :value="(localObject as LightObject).flicker ?? 0"
              type="range"
              min="0"
              max="1"
              step="0.05"
              @input="handleLightParamChange('flicker', parseFloat(($event.target as HTMLInputElement).value))"
            >
          </div>
          <div class="property-field">
            <label>闪烁速度: {{ ((localObject as LightObject).flickerSpeed ?? 0.35).toFixed(2) }}</label>
            <input
              :value="(localObject as LightObject).flickerSpeed ?? 0.35"
              type="range"
              min="0"
              max="1"
              step="0.05"
              @input="handleLightParamChange('flickerSpeed', parseFloat(($event.target as HTMLInputElement).value))"
            >
          </div>
        </template>

        <!-- 聚光灯方向参数 -->
        <template v-if="(localObject as LightObject).lightType === 'spot'">
          <div class="property-field">
            <label>方向角: {{ Math.round(((localObject as LightObject).directionAngle ?? 0) * 180 / Math.PI) }}°</label>
            <input
              :value="(localObject as LightObject).directionAngle ?? 0"
              type="range"
              :min="-Math.PI"
              :max="Math.PI"
              step="0.01"
              @input="handleLightParamChange('directionAngle', parseFloat(($event.target as HTMLInputElement).value))"
            >
          </div>
          <div class="property-field">
            <label>开角: {{ Math.round((localObject as LightObject).coneAngle ?? 100) }}°</label>
            <input
              :value="(localObject as LightObject).coneAngle ?? 100"
              type="range"
              min="10"
              max="360"
              step="5"
              @input="handleLightParamChange('coneAngle', parseFloat(($event.target as HTMLInputElement).value))"
            >
          </div>
        </template>
      </div>

      <!-- 相机控制台（仅 Action Mode） -->
      <div
        v-if="isCamera && isActionMode"
        class="property-section"
      >
        <h4>🎥 相机控制台</h4>
        
        <!-- 槽位指示器 -->
        <div class="slot-indicator-row">
          <span class="slot-badge">#{{ (currentSlotIndex ?? 0) + 1 }}</span>
          <span class="slot-text">{{ currentSlotText ? truncateText(currentSlotText, 20) : '当前槽位' }}</span>
        </div>
        
        <!-- Segmented Control: 动作类型切换 -->
        <div class="camera-console">
          <div class="console-label">
            动作类型:
          </div>
          <div class="camera-mode-tabs">
            <button 
              class="camera-mode-btn" 
              :class="{ active: currentCameraActionType === 'camera_cut', disabled: isExclusiveButtonDisabled('camera_cut') }"
              :disabled="isExclusiveButtonDisabled('camera_cut')"
              :title="isExclusiveButtonDisabled('camera_cut') ? '当前槽位已有其他相机动作' : '镜头切 - 瞬间切换机位'"
              @click="handleCameraTypeSelect('camera_cut')"
            >
              ✂️ 镜头切
            </button>
            <button 
              class="camera-mode-btn" 
              :class="{ active: currentCameraActionType === 'camera_move', disabled: isExclusiveButtonDisabled('camera_move') }"
              :disabled="isExclusiveButtonDisabled('camera_move')"
              :title="isExclusiveButtonDisabled('camera_move') ? '当前槽位已有其他相机动作' : '运镜 - 平滑移动到目标位置'"
              @click="handleCameraTypeSelect('camera_move')"
            >
              🎬 运镜
            </button>
            <button 
              class="camera-mode-btn" 
              :class="{ active: currentCameraActionType === 'camera_follow', disabled: isExclusiveButtonDisabled('camera_follow') }"
              :disabled="isExclusiveButtonDisabled('camera_follow')"
              :title="isExclusiveButtonDisabled('camera_follow') ? '当前槽位已有其他相机动作' : '跟随 - 跟随目标对象'"
              @click="handleCameraTypeSelect('camera_follow')"
            >
              🎯 跟随
            </button>
            <button 
              class="camera-mode-btn" 
              :class="{ active: isShakeActive }"
              title="震动 - 镜头抖动效果（可与其他动作共存）"
              @click="handleCameraTypeSelect('camera_shake')"
            >
              💥 震动
            </button>
          </div>
        </div>

        <!-- 提示信息：点击动作类型按钮后在右侧显示动作属性 -->
        <div class="camera-mode-hint">
          <span class="hint-icon">💡</span>
          <span>点击动作类型按钮进入添加动作模式</span>
        </div>
      </div>


      <!-- v16 H1: 动画默认状态设置（分组显示） -->
      <div
        v-if="!isActionMode && resourceAnimations.length > 0"
        class="property-section"
      >
        <h4>动画默认状态</h4>

        <!-- 资源动画分组 -->
        <div v-if="resourceOriginAnimations.length > 0" class="anim-group">
          <div class="anim-group-header">
            <span class="anim-group-label">📦 资源动画</span>
            <button
              class="btn-reapply"
              title="从资源重新应用动画定义"
              @click="handleReapplyResourceAnimations"
            >
              🔄 重新应用
            </button>
          </div>
        </div>

        <!-- 实例动画分组标题 -->
        <div v-if="instanceAnimations.length > 0 && resourceOriginAnimations.length > 0" class="anim-group">
          <div class="anim-group-header">
            <span class="anim-group-label">✏️ 实例动画</span>
          </div>
        </div>

        <div class="anim-default-hint">
          <span class="hint-icon">ℹ️</span>
          <span class="hint-text">设置动画在场景开始时的默认状态，这些设置会保存到场景数据中</span>
        </div>
        <div
          v-for="anim in resourceAnimations"
          :key="anim.id"
          class="anim-default-item"
        >
          <div class="anim-part-header">
            <span class="anim-part-name">{{ anim.name }}</span>
          </div>
          <!-- 播放/停止状态 -->
          <div class="anim-default-options">
            <label
              class="anim-option"
              :class="{ active: getAnimDefaultState(anim.name) === 'play' }"
            >
              <input 
                type="radio" 
                :name="'anim-default-' + anim.id" 
                value="play" 
                :checked="getAnimDefaultState(anim.name) === 'play'"
                @change="setAnimDefaultState(anim.name, 'play')"
              >
              <span class="option-icon">▶</span>
              <span class="option-label">默认播放</span>
            </label>
            <label
              class="anim-option"
              :class="{ active: getAnimDefaultState(anim.name) === 'stop' }"
            >
              <input 
                type="radio" 
                :name="'anim-default-' + anim.id" 
                value="stop" 
                :checked="getAnimDefaultState(anim.name) === 'stop'"
                @change="setAnimDefaultState(anim.name, 'stop')"
              >
              <span class="option-icon">⏹</span>
              <span class="option-label">默认停止</span>
            </label>
          </div>
          <!-- 循环设置（v11.3: 移除 speed，只保留 loop） -->
          <div class="anim-extra-settings">
            <label class="anim-loop-option">
              <input 
                type="checkbox" 
                :checked="getAnimLoop(anim.name)"
                @change="setAnimLoop(anim.name, ($event.target as HTMLInputElement).checked)"
              >
              <span>循环播放</span>
            </label>
          </div>
        </div>
      </div>



      <!-- v11.2: 旧的道具动画控制区域已删除，统一使用 resourceAnimations -->

      <!-- 特效动画默认状态设置（仅Setup模式） -->

      <!-- Action Mode 下的动画动作录制 (v11.1: 使用资源级 Animation) -->
      <div
        v-if="isActionMode && resourceAnimations.length > 0"
        class="property-section"
      >
        <h4>🎬 动画动作</h4>
        <div class="action-record-hint">
          <span class="hint-icon">📢</span>
          <span class="hint-text">在当前槽位 <strong>#{{ (currentSlotIndex ?? 0) + 1 }}</strong> 创建动画动作</span>
        </div>
        <div
          v-for="anim in resourceAnimations"
          :key="anim.id"
          class="anim-action-item"
        >
          <div class="anim-action-header">
            <span class="anim-part-name">{{ anim.name }}</span>
          </div>
          <!-- 播放/停止动作 -->
          <div class="anim-action-options">
            <button 
              class="action-option-btn play"
              :class="{ selected: getResourceAnimState(anim.name) === 'play' }"
              title="创建播放动作"
              @click="handleResourceAnimAction(anim.name, 'play')"
            >
              <span class="btn-icon">▶</span>
              <span class="btn-label">播放</span>
            </button>
            <button 
              class="action-option-btn stop"
              :class="{ selected: getResourceAnimState(anim.name) === 'stop' }"
              title="创建停止动作"
              @click="handleResourceAnimAction(anim.name, 'stop')"
            >
              <span class="btn-icon">⏹</span>
              <span class="btn-label">停止</span>
            </button>
          </div>
          <!-- 循环设置 -->
          <div class="anim-action-extras">
            <label class="action-loop-option">
              <input 
                type="checkbox" 
                :checked="getResourceAnimLoop(anim.name)"
                @change="handleResourceAnimLoopChange(anim.name, ($event.target as HTMLInputElement).checked)"
              >
              <span>循环</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 📝 文本属性 -->
      <div
        v-if="localObject.type === 'text'"
        class="property-section"
      >
        <h4>📝 文本属性</h4>

        <!-- 文本内容 -->
        <div class="property-field">
          <label>内容:</label>
          <textarea
            :value="(localObject as any).content ?? ''"
            rows="3"
            class="text-content-input"
            @input="handleTextPropertyChange('content', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <!-- 字体选择（在线预设 + 系统字体枚举） -->
        <div class="property-field">
          <label>字体:</label>
          <select
            :value="(localObject as any).fontFamily ?? 'Noto Sans SC'"
            class="font-select"
            @change="handleTextPropertyChange('fontFamily', ($event.target as HTMLSelectElement).value)"
          >
            <optgroup label="☁️ 在线字体">
              <option value="Noto Sans SC">思源黑体</option>
              <option value="Noto Serif SC">思源宋体</option>
              <option value="LXGW WenKai">霞鹜文楷</option>
              <option value="ZCOOL QingKe HuangYou">站酷庆科黄油体</option>
              <option value="Ma Shan Zheng">马善政楷书</option>
            </optgroup>
            <optgroup v-if="localFonts.length > 0" label="💻 本地字体">
              <option v-for="font in localFonts" :key="font" :value="font">{{ font }}</option>
            </optgroup>
          </select>
          <button
            v-if="!localFontsLoaded"
            class="load-fonts-btn"
            title="加载本地字体列表（需浏览器授权）"
            @click="loadLocalFonts"
          >
            🔍 加载本地字体
          </button>
        </div>

        <!-- 字号 -->
        <div class="property-field">
          <label>字号:</label>
          <select
            :value="fontSizePresetMatch"
            @change="handleFontSizeSelectChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="size in FONT_SIZE_PRESETS" :key="size" :value="size">{{ size }}</option>
            <option
              v-if="!FONT_SIZE_PRESETS.includes(currentFontSize)"
              :value="currentFontSize"
            >
              {{ currentFontSize }} (自定义)
            </option>
          </select>
        </div>

        <!-- 颜色 -->
        <div class="property-field">
          <label>颜色:</label>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input
              :value="(localObject as any).color ?? '#ffffff'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleTextPropertyChange('color', ($event.target as HTMLInputElement).value)"
            >
            <span class="value-label">{{ (localObject as any).color ?? '#ffffff' }}</span>
          </div>
        </div>
        <div class="property-field">
          <label>渐变:</label>
          <select
            :value="(localObject as any).fillType ?? ''"
            class="font-select"
            @change="handleTextPropertyChange('fillType', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">关闭</option>
            <option value="linear_gradient">线性渐变</option>
          </select>
        </div>
        <template v-if="(localObject as any).fillType === 'linear_gradient'">
          <div class="property-field">
            <label>起始色:</label>
            <input
              :value="(localObject as any).gradientStops?.[0]?.color ?? '#ffffff'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleGradientStopChange(0, ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="property-field">
            <label>结束色:</label>
            <input
              :value="(localObject as any).gradientStops?.[1]?.color ?? '#000000'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleGradientStopChange(1, ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="property-field">
            <label>角度°:</label>
            <input
              :value="(localObject as any).gradientAngle ?? 0"
              type="number"
              min="0"
              max="360"
              step="15"
              @change="handleTextPropertyChange('gradientAngle', Number(($event.target as HTMLInputElement).value))"
            >
          </div>
        </template>

        <!-- 对齐 -->
        <div class="property-field">
          <label>对齐:</label>
          <div class="text-align-group">
            <button
              class="text-align-btn"
              :class="{ active: (localObject as any).align === 'left' }"
              title="左对齐"
              @click="handleTextPropertyChange('align', 'left')"
            >
              ◧
            </button>
            <button
              class="text-align-btn"
              :class="{ active: (localObject as any).align === 'center' || !(localObject as any).align }"
              title="居中"
              @click="handleTextPropertyChange('align', 'center')"
            >
              ☰
            </button>
            <button
              class="text-align-btn"
              :class="{ active: (localObject as any).align === 'right' }"
              title="右对齐"
              @click="handleTextPropertyChange('align', 'right')"
            >
              ◨
            </button>
          </div>
        </div>

        <!-- 字重和样式 -->
        <div class="property-row">
          <div class="property-field checkbox">
            <label>
              <input
                :checked="(localObject as any).fontWeight === 'bold'"
                type="checkbox"
                @change="handleTextPropertyChange('fontWeight', ($event.target as HTMLInputElement).checked ? 'bold' : 'normal')"
              >
              <b>粗体</b>
            </label>
          </div>
          <div class="property-field checkbox">
            <label>
              <input
                :checked="(localObject as any).fontStyle === 'italic'"
                type="checkbox"
                @change="handleTextPropertyChange('fontStyle', ($event.target as HTMLInputElement).checked ? 'italic' : 'normal')"
              >
              <i>斜体</i>
            </label>
          </div>
        </div>

        <!-- 自动换行开关 -->
        <div
          v-if="(localObject as any).textBoxMode !== 'auto-width' && (localObject as any).textBoxMode !== 'auto-size'"
          class="property-field checkbox"
        >
          <label>
            <input
              :checked="(localObject as any).wordWrap !== false"
              type="checkbox"
              @change="handleTextPropertyChange('wordWrap', ($event.target as HTMLInputElement).checked)"
            >
            自动换行
          </label>
        </div>

        <!-- 自动换行宽度 -->
        <div
          v-if="(localObject as any).textBoxMode !== 'auto-width' && (localObject as any).textBoxMode !== 'auto-size' && (localObject as any).wordWrap !== false"
          class="property-field"
        >
          <label>换行宽度:</label>
          <input
            :value="(localObject as any).wordWrapWidth ?? 400"
            type="number"
            min="50"
            max="3840"
            step="10"
            @change="handleTextPropertyChange('wordWrapWidth', Number(($event.target as HTMLInputElement).value))"
          >
        </div>

        <!-- ═══════ Phase 1: 描边 ═══════ -->
        <div class="sub-section-heading">字体边框</div>
        <div class="property-field">
          <label>颜色:</label>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input
              :value="(localObject as any).stroke ?? '#000000'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleTextPropertyChange('stroke', ($event.target as HTMLInputElement).value)"
            >
            <span class="value-label">{{ (localObject as any).stroke ?? '无' }}</span>
          </div>
        </div>
        <div class="property-field">
          <label>粗细:</label>
          <input
            :value="(localObject as any).strokeThickness ?? 0"
            type="range"
            min="0"
            max="20"
            step="1"
            style="flex: 1;"
            @input="handleTextPropertyChange('strokeThickness', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="value-label" style="min-width: 28px; text-align: right;">{{ (localObject as any).strokeThickness ?? 0 }}</span>
        </div>

        <!-- ═══════ Phase 1: 投影 ═══════ -->
        <div class="sub-section-heading">投影</div>
        <div class="property-field checkbox">
          <label>
            <input
              :checked="(localObject as any).dropShadow ?? false"
              type="checkbox"
              @change="handleTextPropertyChange('dropShadow', ($event.target as HTMLInputElement).checked ? true : false)"
            >
            启用投影
          </label>
        </div>
        <template v-if="(localObject as any).dropShadow">
          <div class="property-field">
            <label>颜色:</label>
            <input
              :value="(localObject as any).dropShadowColor ?? '#000000'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleTextPropertyChange('dropShadowColor', ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="property-field">
            <label>模糊:</label>
            <input
              :value="(localObject as any).dropShadowBlur ?? 4"
              type="range"
              min="0"
              max="20"
              step="1"
              style="flex: 1;"
              @input="handleTextPropertyChange('dropShadowBlur', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="value-label" style="min-width: 28px; text-align: right;">{{ (localObject as any).dropShadowBlur ?? 4 }}</span>
          </div>
          <div class="property-field">
            <label>距离:</label>
            <input
              :value="(localObject as any).dropShadowDistance ?? 4"
              type="range"
              min="0"
              max="20"
              step="1"
              style="flex: 1;"
              @input="handleTextPropertyChange('dropShadowDistance', Number(($event.target as HTMLInputElement).value))"
            >
            <span class="value-label" style="min-width: 28px; text-align: right;">{{ (localObject as any).dropShadowDistance ?? 4 }}</span>
          </div>
          <div class="property-field">
            <label>角度°:</label>
            <input
              :value="Math.round(((localObject as any).dropShadowAngle ?? 0.785) * 180 / Math.PI)"
              type="number"
              min="0"
              max="360"
              step="15"
              @change="handleTextPropertyChange('dropShadowAngle', Number(($event.target as HTMLInputElement).value) * Math.PI / 180)"
            >
          </div>
        </template>

        <!-- ═══════ Phase 1: 间距 ═══════ -->
        <div class="sub-section-heading">排版</div>
        <div class="property-field">
          <label>字距:</label>
          <select
            :value="letterSpacingPresetMatch"
            @change="handleLetterSpacingSelectChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="spacing in LETTER_SPACING_PRESETS" :key="spacing" :value="spacing">{{ spacing }}</option>
            <option
              v-if="!LETTER_SPACING_PRESETS.includes(currentLetterSpacing)"
              :value="currentLetterSpacing"
            >
              {{ currentLetterSpacing }} (自定义)
            </option>
          </select>
        </div>
        <div class="property-field">
          <label>行高:</label>
          <select
            :value="lineHeightPresetMatch"
            @change="handleLineHeightSelectChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">自动</option>
            <option v-for="lh in LINE_HEIGHT_PRESETS" :key="lh" :value="lh">{{ lh }}</option>
            <option
              v-if="currentLineHeight !== '' && !LINE_HEIGHT_PRESETS.includes(Number(currentLineHeight))"
              :value="currentLineHeight"
            >
              {{ currentLineHeight }} (自定义)
            </option>
          </select>
        </div>

        <!-- 文本框模式 -->
        <div class="property-field">
          <label>文本框:</label>
          <select
            :value="(localObject as any).textBoxMode ?? 'auto-size'"
            class="font-select"
            @change="handleTextPropertyChange('textBoxMode', ($event.target as HTMLSelectElement).value)"
          >
            <option value="auto-width">自动宽度</option>
            <option value="auto-height">自动高度</option>
            <option value="auto-size">自动尺寸</option>
            <option value="fixed">固定尺寸</option>
          </select>
        </div>

        <!-- 书写方向 -->
        <div class="property-field">
          <label>方向:</label>
          <div class="text-align-group">
            <button
              class="text-align-btn"
              :class="{ active: (localObject as any).writingMode !== 'vertical' }"
              title="横排"
              @click="handleTextPropertyChange('writingMode', 'horizontal')"
            >
              横
            </button>
            <button
              class="text-align-btn"
              :class="{ active: (localObject as any).writingMode === 'vertical' }"
              title="竖排"
              @click="handleTextPropertyChange('writingMode', 'vertical')"
            >
              竖
            </button>
          </div>
        </div>

        <div class="sub-section-heading">文本框背景</div>
        <div class="property-field checkbox">
          <label>
            <input
              :checked="(localObject as any).textBackgroundEnabled === true"
              type="checkbox"
              @change="handleTextPropertyChange('textBackgroundEnabled', ($event.target as HTMLInputElement).checked)"
            >
            启用背景填充
          </label>
        </div>
        <template v-if="(localObject as any).textBackgroundEnabled === true">
          <div class="property-field">
            <label>颜色:</label>
            <input
              :value="(localObject as any).textBackgroundColor ?? '#000000'"
              type="color"
              style="width: 28px; height: 28px; padding: 0; border: 1px solid #d1d5db; border-radius: 4px;"
              @input="handleTextPropertyChange('textBackgroundColor', ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="property-field">
            <label>透明度:</label>
            <input
              :value="Math.round((((localObject as any).textBackgroundAlpha ?? 0.35) * 100))"
              type="range"
              min="0"
              max="100"
              step="1"
              style="flex: 1;"
              @input="handleTextPropertyChange('textBackgroundAlpha', Number(($event.target as HTMLInputElement).value) / 100)"
            >
            <span class="value-label" style="min-width: 36px; text-align: right;">{{ Math.round((((localObject as any).textBackgroundAlpha ?? 0.35) * 100)) }}%</span>
          </div>
          <div class="property-field">
            <label>内边距X:</label>
            <input
              :value="(localObject as any).textBackgroundPaddingX ?? 16"
              type="number"
              min="0"
              max="200"
              step="1"
              @change="handleTextPropertyChange('textBackgroundPaddingX', Number(($event.target as HTMLInputElement).value))"
            >
          </div>
          <div class="property-field">
            <label>内边距Y:</label>
            <input
              :value="(localObject as any).textBackgroundPaddingY ?? 10"
              type="number"
              min="0"
              max="200"
              step="1"
              @change="handleTextPropertyChange('textBackgroundPaddingY', Number(($event.target as HTMLInputElement).value))"
            >
          </div>
          <div class="property-field">
            <label>圆角:</label>
            <input
              :value="(localObject as any).textBackgroundRadius ?? 8"
              type="number"
              min="0"
              max="200"
              step="1"
              @change="handleTextPropertyChange('textBackgroundRadius', Number(($event.target as HTMLInputElement).value))"
            >
          </div>
        </template>

        <!-- ═══════ 文本动画 ═══════ -->
        <div class="sub-section-heading">文本动画</div>
        <div class="property-field">
          <label>打字速度:</label>
          <input
            :value="(localObject as any).revealSpeed ?? 8"
            type="number"
            min="0.5"
            max="60"
            step="0.5"
            @change="handleTextPropertyChange('revealSpeed', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="value-label">字/秒</span>
        </div>
        <div
          v-if="!isActionMode"
          class="anim-default-item text-reveal-default-card"
        >
          <div class="anim-part-header">
            <span class="anim-part-name">默认显示方式</span>
          </div>
          <div class="anim-default-options">
            <label
              class="anim-option text-reveal-start-option"
              :class="{ active: (localObject as any).revealInitialState === 'typewriter' }"
            >
              <input
                type="radio"
                name="text-reveal-initial-state"
                value="typewriter"
                :checked="(localObject as any).revealInitialState === 'typewriter'"
                @change="updateTextRevealInitialState('typewriter')"
              >
              <span class="option-icon">⌨</span>
              <span class="option-label">开场打字</span>
            </label>
            <label
              class="anim-option text-reveal-complete-option"
              :class="{ active: ((localObject as any).revealInitialState ?? 'complete') === 'complete' }"
            >
              <input
                type="radio"
                name="text-reveal-initial-state"
                value="complete"
                :checked="((localObject as any).revealInitialState ?? 'complete') === 'complete'"
                @change="updateTextRevealInitialState('complete')"
              >
              <span class="option-icon">▣</span>
              <span class="option-label">完整文本</span>
            </label>
          </div>
        </div>
        <div
          v-if="isActionMode"
          class="anim-action-item text-reveal-action-card"
        >
          <div class="anim-action-header">
            <span class="anim-part-name">打字机动作</span>
          </div>
          <div class="anim-action-options">
            <button
              class="action-option-btn text-reveal-start"
              :class="{ selected: getTextRevealActionState() === 'play' }"
              title="在当前槽位创建开始打字动作"
              @click="handleTextRevealAction('play')"
            >
              <span class="btn-icon">⌨</span>
              <span class="btn-label">开始打字</span>
            </button>
            <button
              class="action-option-btn text-reveal-complete"
              :class="{ selected: getTextRevealActionState() === 'stop' }"
              title="在当前槽位创建显示完整文本动作"
              @click="handleTextRevealAction('stop')"
            >
              <span class="btn-icon">▣</span>
              <span class="btn-label">显示完整文本</span>
            </button>
          </div>
        </div>

      </div>

      <!-- ▭ 蒙版属性 -->
      <template v-if="localObject && localObject.type === 'mask'">
        <MaskShapeSection
          :mask="(localObject as MaskObject)"
          @change="handleMaskChange"
        />
        <MaskTargetsSection
          :mask="(localObject as MaskObject)"
          @change="handleMaskChange"
        />
      </template>

      <!-- 操作按钮区域（Setup + Action 通用） -->
      <div
        v-if="localObject && (localObject.type === 'prop' || localObject.type === 'background' || localObject.type === 'audio' || localObject.type === 'symbol' || localObject.type === 'composite' || localObject.type === 'expression')"
        class="property-section anim-actions-section"
      >
        <!-- 动画管理（prop/background/symbol/composite） -->
        <button
          v-if="localObject.type === 'prop' || localObject.type === 'background' || localObject.type === 'symbol' || localObject.type === 'composite'"
          class="btn-add-playlist"
          @click="showAnimationManager = true"
        >
          🎬 动画管理
        </button>

        <!-- 道具/背景：[编辑] -->
        <button
          v-if="localObject.type === 'prop' || localObject.type === 'background'"
          class="btn-add-playlist"
          @click="showPropEditor = true"
        >
          ✏️ 编辑
        </button>

        <!-- 音频：[编辑] -->
        <button
          v-if="localObject.type === 'audio'"
          class="btn-add-playlist"
          @click="showSoundEditor = true"
        >
          ✏️ 编辑
        </button>

        <!-- 元件：[编辑] -->
        <button
          v-if="localObject.type === 'symbol'"
          class="btn-add-playlist"
          @click="showSymbolMaterialManager = true"
        >
          ✏️ 编辑
        </button>

      </div>

      <!-- v11.1: 道具动画已迁移到 resourceAnimations 区域，此处旧代码已删除 -->
    </div>


    <ExpressionSelectorDialog
      v-if="showExpressionDialog"
      :current-expression="initialExpression"
      @select="handleExpressionSelect"
      @close="showExpressionDialog = false"
    />

    <!-- v18: 独立表情对象切换对话框 -->
    <ExpressionSelectorDialog
      v-if="showExpressionObjectDialog"
      :current-expression="localObject?.refId ?? ''"
      @select="handleExpressionObjectSwitch"
      @close="showExpressionObjectDialog = false"
    />






    <!-- v16: 元件素材管理对话框 -->
    <SymbolMaterialManagerDialog
      v-if="showSymbolMaterialManager && localObject?.type === 'symbol'"
      :object-name="localObject.alias ?? localObject.name ?? '元件'"
      :materials="(localObject as SymbolObject).materials ?? []"
      :current-material-id="(localObject as SymbolObject).currentMaterialId"
      @close="showSymbolMaterialManager = false"
      @save="handleSymbolMaterialSave"
    />

    <!-- v20: 动画工作台（列表模式，替代旧 AnimationManagerDialog） -->
    <AnimationWorkbench
      v-if="showAnimationManager && localObject"
      :visible="showAnimationManager"
      :animation="workbenchInitialAnimation"
      :resource-type="workbenchResourceType"
      :resource-id="localObject.refId ?? localObject.id"
      :scene-object-id="localObject.id"
      :animations="workbenchAnimationsList"
      :existing-names="workbenchAnimationsList.map(a => a.name)"
      :original-name="workbenchInitialAnimation?.name"
      :is-object-mode="true"
      :scene-object="localObject"
      :persist-changes="props.persistChanges"
      v-bind="workbenchOptionalProps"
      @save="handleWorkbenchAnimSave"
      @close="showAnimationManager = false"
      @animation-created="handleWorkbenchAnimCreate"
      @animation-deleted="handleWorkbenchAnimDelete"
      @preset-applied="handleWorkbenchPresetApplied"
      @update:animations="handleWorkbenchAnimationsUpdate"
    />

    <!-- v17: 道具/背景编辑对话框 -->
    <PropEditorModal
      v-if="showPropEditor && editPropId"
      :visible="showPropEditor"
      :prop-id="editPropId"
      :resource-type="localObject?.type === 'background' ? 'background' : 'prop'"
      @close="showPropEditor = false"
      @save="showPropEditor = false"
    />

    <SoundEditorModal
      v-if="showSoundEditor && editSoundId"
      :visible="showSoundEditor"
      :sound-id="editSoundId"
      @close="showSoundEditor = false"
      @save="showSoundEditor = false"
    />

    <!-- v18: 表情资源编辑对话框 -->
    <ExpressionEditorModal
      v-if="showExpressionEditor"
      :visible="showExpressionEditor"
      :expression="editExpression"
      @close="showExpressionEditor = false"
      @saved="handleExpressionResourceSaved"
      @deleted="showExpressionEditor = false"
    />

  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, type Ref, ref, watch } from 'vue'

import ExpressionSelectorDialog from '@/components/screenplay/ExpressionSelectorDialog.vue'
import { useAssetAudio } from '@/composables/useAssetAudio'
import { useAssetImage } from '@/composables/useAssetImage'
import { CAMERA_BASE_HEIGHT,CAMERA_BASE_WIDTH, CANVAS_CENTER_X, CANVAS_CENTER_Y } from '@/constants/canvas'
import { RECOMMENDED_NAMES, RECOMMENDED_NAMES_SET } from '@/constants/recommendedNames'
import { getTypeIcon } from '@/core/sceneObjectProviders/metadata'
import { useAnimationStore } from '@/stores/animationStore' // v11.1: 资源级动画
import { useExpressionStore } from '@/stores/expressionStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneObjectStore } from '@/stores/sceneObjectStore'
import { useSoundStore } from '@/stores/soundStore'
import type { AnimationDefinition, AnimationTimingMode } from '@/types/animation'
import { type AudioObject, type CompositeObject, type ExpressionObject, type LightObject, type MaskObject, type SceneObject, type ScreenEffectObject, type SymbolMaterial, type SymbolObject, type TextObject } from '@/types/sceneObject'
import type { Action } from '@/types/screenplay'
import { debugLog } from '@/utils/debugLogger'
import { ensureFontLoaded } from '@/utils/fontLoader'
import { AMBIENT_PRESETS, getPresetsForLightType, type LightPresetEntry } from '@/utils/lightPresets'
import { applyMeasuredDefaultSize, syncExpressionInstanceDefaultSizes } from '@/utils/sceneObjectDefaultSize'
import { FONT_SIZE_PRESETS } from '@/utils/textStylePresets'
import { getAutoTextLineHeight, normalizeTextContent, resolveTextLineHeight } from '@/utils/textUtils'

import AnimationWorkbench from './animation-workbench/AnimationWorkbench.vue'
import MaskShapeSection from './animation-workbench/MaskShapeSection.vue'
import MaskTargetsSection from './animation-workbench/MaskTargetsSection.vue'
import ExpressionEditorModal from './ExpressionEditorModal.vue'
import PropEditorModal from './PropEditorModal.vue'
import SoundEditorModal from './SoundEditorModal.vue'
import SymbolMaterialManagerDialog from './SymbolMaterialManagerDialog.vue'

// 相机动作类型
type CameraActionType = 'camera_cut' | 'camera_move' | 'camera_follow' | 'camera_shake'

const props = defineProps<{
  selectedObject: SceneObject | undefined
  canvasWidth?: number
  canvasHeight?: number
  isActionMode?: boolean      // 是否处于 Action Mode
  currentSlotIndex?: number   // 当前槽位索引
  currentSlotText?: string    // 当前槽位文本
  runtimeState?: SceneObject | null  // Action Mode 下当前 slot 的运行时状态
  cameraRecordMode?: 'camera_cut' | 'camera_move'  // v6.5: 相机录制模式
  // v6.5: 相机控制台扩展 props
  currentCameraAction?: Action | null  // 当前槽位的相机动作（优先返回互斥类）
  currentSlotHasShake?: boolean  // v6.7: 当前槽位是否有震动动作
  // v9.3: 当前 slot 有生命的对象 ID 列表（用于 Action Mode 过滤）
  aliveObjectIds?: string[]
  // v14.1: 父组件的对象录制模式（从 ActionEditor 传入，解决 v-else 重建后状态丢失）
  objectRecordMode?: 'animation' | 'layout'
  // 穿透列表状态
  isPassThrough?: boolean
  passThroughVisible?: boolean
  // v20: 动作库透传
  rootCompositeId?: string
  /** 上层编辑器的持久化流程 */
  persistChanges?: (() => Promise<void>) | undefined
}>()

const emit = defineEmits<{
  update: [object: SceneObject]
  moveUp: []
  moveDown: []
  initialStateUpdate: [pose?: string, expression?: string]
  // v11.1: 动画触发动作（使用资源级 Animation）
  triggerAnim: [payload: { animName: string, action: 'play'|'stop', loop?: boolean, speed?: number, timingMode?: AnimationTimingMode }]
  // v6.5: 相机录制模式切换
  cameraRecordModeChange: [mode: 'camera_cut' | 'camera_move']
  // v6.5: 相机动作创建/更新
  cameraActionUpdate: [actionType: CameraActionType, params: Record<string, unknown>]
  // v7.5: 音频触发动作
  triggerAudio: [payload: { action: 'play'|'stop', volume?: number, loop?: boolean, fadeIn?: number, fadeOut?: number }]
  // TextObject: 文本显现/打字机触发动作
  triggerTextReveal: [payload: { action: 'play'|'stop', mode?: 'typewriter' }]
  // v8.6: 对象选择和别名编辑
  selectObject: [objectId: string]
  editAlias: [objectId: string]
  // v9.1: 录制模式切换 (动画/布局)
  recordModeChange: [mode: 'animation' | 'layout']
  // v9.1: 跳转到指定槽位
  selectSlot: [slotIndex: number]
  // v9.3: 视觉属性更新（flipX/visible/zIndex/receiveLighting/castShadow）
  visualActionUpdate: [params: { flipX?: boolean, visible?: boolean, zIndex?: number, receiveLighting?: boolean, castShadow?: boolean }]
  // v16: 元件素材切换（Action Mode 下创建 set_material Action）
  materialActionUpdate: [materialId: string]
  // v16: 元件素材列表保存（Action Mode 下同步到 Setup 持久层）
  materialSave: [materials: SymbolMaterial[], currentMaterialId: string | undefined]
  // P2: composite 操作（Action Mode 下创建 Action 而非直接修改 Store）
  compositeAction: [payload: { action: 'removeChild'; childId: string } | { action: 'ungroupAll'; compositeId: string } | { action: 'addMember'; compositeId: string } | { action: 'setCompositeLocked'; compositeId: string; locked: boolean } | { action: 'reorderRenderChain'; compositeId: string; renderChain: string[] }]
  // v16: 编辑资源（打开道具/背景资源编辑对话框）
  editResource: [objectId: string]
  // v17: 动画更新同步到 scene.setup.objects
  animationsUpdated: [objectId: string, animations: Record<string, import('@/types/animation').AnimationDefinition>]
  // 穿透列表操作
  passThroughToggle: [objectId: string]
  passThroughVisibleToggle: [objectId: string]
}>()

const localObject = ref<SceneObject | null>(null) as Ref<SceneObject | null>
const textFontLoadRequestId = ref(0)
const expressionStore = useExpressionStore()
const sceneObjectStore = useSceneObjectStore()
// v11.2: propStore 已不再使用（旧道具动画控制逻辑已删除）
const animationStore = useAnimationStore() // v11.1: 资源级动画
const soundStore = useSoundStore()
const projectStore = useProjectStore()
const { getAudioUrl } = useAssetAudio()
const { getImageUrl } = useAssetImage()

// v8.6: 获取所有场景对象（按 zIndex 排序）
const sortedAllObjects = computed(() => {
  return [...sceneObjectStore.objects].sort((a, b) => b.zIndex - a.zIndex)
})




// v16: 元件素材
const showSymbolMaterialManager = ref(false)

// v17: 动画管理 → v20: 直接打开 AnimationWorkbench
const showAnimationManager = ref(false)

// v20: Workbench 列表模式所需的计算属性
const workbenchAnimationsList = computed((): AnimationDefinition[] => {
  if (!localObject.value?.animations) return []
  return Object.values(localObject.value.animations)
})

const workbenchInitialAnimation = computed((): AnimationDefinition | undefined => {
  const list = workbenchAnimationsList.value
  if (list.length > 0) return list[0]
  return undefined
})

const workbenchResourceType = computed((): 'prop' | 'background' | 'symbol' | 'composite' => {
  const t = localObject.value?.type
  if (t === 'prop' || t === 'background' || t === 'symbol' || t === 'composite') return t
  return 'prop' // fallback
})

const workbenchOptionalProps = computed(() => {
  const p: Record<string, unknown> = {}
  if (effectiveRootCompositeId.value) p['rootCompositeId'] = effectiveRootCompositeId.value
  return p
})

function _writeAnimationsToStore(animations: Record<string, AnimationDefinition>) {
  if (!localObject.value) return
  const objId = localObject.value.id
  const normalizedAnimations = normalizeAnimationsMap(animations)
  if (sceneObjectStore.getIsActionMode()) {
    sceneObjectStore.updateSetupObject(objId, { animations: normalizedAnimations })
  } else {
    sceneObjectStore.updateObject(objId, { animations: normalizedAnimations })
  }
  emit('animationsUpdated', objId, normalizedAnimations)
  projectStore.markAsUnsaved()
}

function normalizeAnimationsMap(animations: Record<string, AnimationDefinition>): Record<string, AnimationDefinition> {
  const normalized: Record<string, AnimationDefinition> = {}
  for (const animation of Object.values(animations)) {
    const cloned = JSON.parse(JSON.stringify(animation)) as AnimationDefinition
    normalized[cloned.id] = cloned
  }
  return normalized
}

function handleWorkbenchAnimSave(animation: AnimationDefinition) {
  if (!localObject.value) return
  const anims = { ...(localObject.value.animations ?? {}) }
  anims[animation.id] = animation
  _writeAnimationsToStore(anims)
}

function handleWorkbenchAnimCreate(animation: AnimationDefinition) {
  handleWorkbenchAnimSave(animation)
}

function handleWorkbenchAnimDelete(animationId: string) {
  if (!localObject.value) return
  const anims = { ...(localObject.value.animations ?? {}) }
  delete anims[animationId]
  _writeAnimationsToStore(anims)
}

function handleWorkbenchPresetApplied() {
  projectStore.markAsUnsaved()
}

function handleWorkbenchAnimationsUpdate(animations: Record<string, AnimationDefinition>) {
  _writeAnimationsToStore(animations)
}

// Phase 2b: 场景编辑器中从对象实例读取根 composite。
// （动作名称解析仅需根 composite id 作用域）
const effectiveRootCompositeId = computed(() => {
  if (props.rootCompositeId) return props.rootCompositeId
  if (localObject.value?.type === 'composite') {
    return (localObject.value as CompositeObject).instanceRootCompositeId
  }
  return undefined
})

// v17: 道具/背景编辑对话框
const showPropEditor = ref(false)
const editPropId = computed(() => {
  if (!localObject.value) return undefined
  if (localObject.value.type === 'prop' || localObject.value.type === 'background') {
    return localObject.value.refId || undefined
  }
  return undefined
})

const showSoundEditor = ref(false)
const editSoundId = computed(() => {
  if (!localObject.value) return undefined
  if (localObject.value.type === 'audio') {
    return localObject.value.refId || undefined
  }
  return undefined
})

// v18: 表情资源编辑对话框
const showExpressionEditor = ref(false)
const editExpression = computed(() => {
  if (localObject.value?.type !== 'expression') return null
  return expressionStore.getExpression(localObject.value.refId) ?? null
})

function openExpressionEditor() {
  showExpressionEditor.value = true
}

async function handleExpressionResourceSaved(expressionId: string) {
  showExpressionEditor.value = false
  await syncExpressionInstanceDefaultSizes(
    expressionId,
    sceneObjectStore.setupState.objects,
    (id, updates) => sceneObjectStore.updateSetupObject(id, updates as Partial<SceneObject>),
  )

  if (localObject.value) {
    const latest = sceneObjectStore.getObject(localObject.value.id)
    if (latest) {
      localObject.value = { ...latest } as SceneObject
      emit('update', localObject.value)
    }
  }
  useProjectStore().markAsUnsaved()
}

const symbolMaterials = computed(() => {
  if (localObject.value?.type !== 'symbol') return []
  return (localObject.value as unknown as { materials: { id: string; name: string }[] }).materials ?? []
})

const symbolCurrentMaterialId = computed(() => {
  if (localObject.value?.type !== 'symbol') return undefined
  return (localObject.value as unknown as { currentMaterialId?: string }).currentMaterialId
})

const symbolCurrentMaterialName = computed(() => {
  const id = symbolCurrentMaterialId.value
  if (!id) return '未选择'
  const mat = symbolMaterials.value.find(m => m.id === id)
  return mat?.name ?? '未知'
})

/** 当前素材的相对路径（从 SymbolMaterial.url 获取） */
const symbolCurrentMaterialPath = computed((): string => {
  const id = symbolCurrentMaterialId.value
  if (!id) return ''
  const symbolObj = localObject.value as unknown as SymbolObject | null
  const mat = symbolObj?.materials?.find(m => m.id === id)
  if (!mat) return ''
  // 静态素材取 url，动画素材取第一帧 url
  if (mat.type === 'static' && mat.url) return mat.url
  if (mat.frames && mat.frames.length > 0 && mat.frames[0]!.url) return mat.frames[0]!.url
  return mat.url ?? ''
})

const { getImageUrl: resolveProjectUrl } = useAssetImage()

/**
 * 解析 symbol 素材 URL：通过 getImageUrl 解析项目路径
 */
function resolveSymbolUrl(url: string | undefined): string {
  if (!url) return ''
  return resolveProjectUrl(url) || ''
}

const currentMaterialPreviewUrl = computed(() => {
  const id = symbolCurrentMaterialId.value
  if (!id) return ''
  const mat = (localObject.value as unknown as SymbolObject | null)?.materials?.find(m => m.id === id)
  if (!mat) return ''
  if (mat.type === 'static') {
    return resolveSymbolUrl(mat.url)
  }
  // Animation: show first frame or still frame
  if (mat.stillFrameSource === 'frame' && mat.frames && mat.stillFrameIndex !== undefined && mat.frames[mat.stillFrameIndex]) {
    const f = mat.frames[mat.stillFrameIndex]!
    return resolveSymbolUrl(f.url)
  }
  if (mat.frames && mat.frames.length > 0) {
    return resolveSymbolUrl(mat.frames[0]!.url)
  }
  return resolveSymbolUrl(mat.url)
})

function getSymbolMaterialThumb(mat: { id: string; name: string }): string | null {
  const symbolObj = localObject.value as unknown as SymbolObject | null
  if (!symbolObj) return null
  const fullMat = symbolObj.materials?.find(m => m.id === mat.id)
  if (!fullMat) return null
  if (fullMat.type === 'static') return resolveSymbolUrl(fullMat.url) || null
  if (fullMat.frames && fullMat.frames.length > 0) return resolveSymbolUrl(fullMat.frames[0]!.url) || null
  return null
}

async function syncSelectedObjectMeasuredSize(options?: { persistSetup?: boolean }): Promise<void> {
  if (!localObject.value) return
  const target = sceneObjectStore.getObject(localObject.value.id) ?? localObject.value
  await applyMeasuredDefaultSize(target, (id, updates) => {
    if (options?.persistSetup) {
      sceneObjectStore.updateSetupObject(id, updates as Partial<SceneObject>)
    } else {
      sceneObjectStore.updateObject(id, updates as Partial<SceneObject>)
    }
    if (localObject.value?.id === id) {
      Object.assign(localObject.value, updates)
    }
  })
}

async function handleSwitchMaterial(materialId: string) {
  if (!localObject.value) return
  if (props.isActionMode) {
    // Action Mode: emit 事件由 ActionEditor 创建/更新 set_material Action
    emit('materialActionUpdate', materialId)
    return
  }
  // Setup Mode: 直接通过 Store 更新并标记未保存
  if (!localObject.value) return
  // 先同步 localObject，避免 emit 时旧值覆盖 Store
  ;(localObject.value as unknown as { currentMaterialId: string }).currentMaterialId = materialId
  sceneObjectStore.updateObject(localObject.value.id, { currentMaterialId: materialId } as Partial<SceneObject>)
  await syncSelectedObjectMeasuredSize()
  // 通知父组件（人物编辑器等）标记未保存状态
  emit('update', localObject.value)
  useProjectStore().markAsUnsaved()
}

async function handleSymbolMaterialSave(materials: SymbolMaterial[], currentMaterialId: string | undefined) {
  if (localObject.value?.type !== 'symbol') return
  
  if (props.isActionMode) {
    // Action Mode: 素材列表变更通过 emit 同步到 Setup 持久层
    emit('materialSave', materials, currentMaterialId)
    // 同时更新运行时 store 以立即反映 UI
    sceneObjectStore.updateObject(localObject.value.id, {
      materials,
    } as Partial<SceneObject>)
    await syncSelectedObjectMeasuredSize({ persistSetup: true })
    // currentMaterialId 变更通过 set_material Action
    const currentObj = localObject.value as unknown as { currentMaterialId?: string }
    if (currentMaterialId !== undefined && currentMaterialId !== currentObj.currentMaterialId) {
      emit('materialActionUpdate', currentMaterialId)
    }
  } else {
    // Setup Mode: 直接修改 Store
    sceneObjectStore.updateObject(localObject.value.id, {
      materials,
      currentMaterialId,
    } as Partial<SceneObject>)
    await syncSelectedObjectMeasuredSize()
    // 标记未保存状态（Store 已直接更新，无需 emit('update') 二次写入）
    useProjectStore().markAsUnsaved()
  }
  // 素材变更后重新注入帧动画定义
  const updatedObj = sceneObjectStore.getObject(localObject.value.id)
  if (updatedObj) {
    animationStore.hydrateObjectAnimations(updatedObj)
    // 将注入结果持久化到 Store（触发 Vue 响应式更新）
    sceneObjectStore.updateObject(updatedObj.id, { animations: { ...updatedObj.animations } } as Partial<SceneObject>)
    // 从 Store 获取最新快照同步到 localObject（包含新 materials + hydrated animations）
    const latestObj = sceneObjectStore.getObject(localObject.value.id)
    if (latestObj) {
      localObject.value = { ...latestObj } as SceneObject
    }
  }
}

// v9.3: 过滤后的对象列表（排除 spawned=false 的动态对象）
const filteredObjects = computed(() => {
  const flat = sortedAllObjects.value.filter(obj => {
    // 相机始终显示
    if (obj.type === 'camera') return true
    // v9.3: 检查 spawned 状态
    const spawned = (obj as unknown as { spawned?: boolean }).spawned
    
    // Setup 模式：排除 spawned=false 的对象
    if (!props.isActionMode) {
      return spawned !== false
    }
    
    // Action Mode：根据 aliveObjectIds 过滤
    // 只显示有生命的对象（相机不在 aliveObjectIds 中，已在上面放行）
    if (props.aliveObjectIds) {
      return props.aliveObjectIds.includes(obj.id)
    }
    
    // 如果没有 aliveObjectIds，显示所有对象（回退逻辑）
    return true
  })

  // 双层架构：parentId 已由 applySlotState() 写入 runtimeObjects，不再需要 accumulatedParentIds 覆盖

  // P2: 树形排列 — 将子对象递归插入到其 parent 之后（支持嵌套运行时父对象）
  const result: typeof flat = []
  const childrenByParent = new Map<string, typeof flat>()

  // 第一遍：按 parentId 分组
  for (const obj of flat) {
    if (obj.parentId) {
      const siblings = childrenByParent.get(obj.parentId) ?? []
      siblings.push(obj)
      childrenByParent.set(obj.parentId, siblings)
    }
  }

  // 递归插入：深度优先（任何有子对象的父对象都展开树形，不仅限 composite）
  function insertWithChildren(obj: SceneObject): void {
    result.push(obj)
    const children = childrenByParent.get(obj.id)
    if (children) {
      childrenByParent.delete(obj.id)
      for (const child of children) {
        insertWithChildren(child)
      }
    }
  }

  // 第二遍：从根对象开始递归
  for (const obj of flat) {
    if (!obj.parentId) {
      insertWithChildren(obj)
    }
  }

  // 兆底：parent 不在列表中的孤立子对象追加到尾部
  for (const orphans of childrenByParent.values()) {
    result.push(...orphans)
  }

  return result
})

// P2: 检查树形项是否可见 — 沿祖先链检查所有 parent 是否展开
function isTreeItemVisible(obj: SceneObject): boolean {
  let currentParentId = getEffectiveParentId(obj)
  while (currentParentId) {
    if (!expandedComposites.has(currentParentId)) return false
    const parentObj = sceneObjectStore.getObject(currentParentId)
    currentParentId = parentObj ? getEffectiveParentId(parentObj) : undefined
  }
  return true
}

// P2: 获取对象在树形中的嵌套深度（用于缩进计算）
function getTreeDepth(obj: SceneObject): number {
  let depth = 0
  let currentParentId = getEffectiveParentId(obj)
  while (currentParentId) {
    depth++
    const parentObj = sceneObjectStore.getObject(currentParentId)
    currentParentId = parentObj ? getEffectiveParentId(parentObj) : undefined
  }
  return depth
}

// 双层架构：直接从 runtimeObjects 的 obj.parentId 读取（已由 applySlotState 写入）
function getEffectiveParentId(obj: SceneObject): string | undefined {
  return obj.parentId
}

// P2: 检查某个对象是否在运行时有子对象
function hasRuntimeChildren(objId: string): boolean {
  return filteredObjects.value.some(o => getEffectiveParentId(o) === objId)
}




// v9.3: 判断对象在当前 Slot 是否活跃（基于 spawned 状态）
function isObjectVisibleAtCurrentSlot(objectId: string): boolean {
  const obj = sceneObjectStore.objects.find(o => o.id === objectId)
  if (!obj) return false
  if (obj.type === 'camera') return true
  
  // 检查 spawned 状态
  const spawned = (obj as unknown as { spawned?: boolean }).spawned
  return spawned !== false
}

// v9.1: 获取对象状态后缀
function getObjectStatusSuffix(objectId: string): string {
  if (!props.isActionMode) return ''
  const obj = sceneObjectStore.objects.find(o => o.id === objectId)
  if (!obj || obj.type === 'camera') return ''
  if (obj.visible === false) return ' (隐藏)'
  return ''
}

// v9.1: 判断当前选中对象是否在当前槽位已出生
const isObjectBornAtCurrentSlot = computed(() => {
  if (!props.isActionMode || !localObject.value) return true
  if (localObject.value.type === 'camera') return true
  
  // 检查对象的 visible 属性（简化实现）
  // 动态对象在创建时 visible = false，出生后设为 true
  return localObject.value.visible !== false
})

// v9.4: 当前对象的显示名称（alias 优先，否则使用 name）
const localObjectDisplayName = computed(() => {
  if (!localObject.value) return '未设置'
  const obj = localObject.value
  // 使用 unknown 中转避免类型断言错误
  const alias = obj.alias
  return alias ?? obj.name ?? '未设置'
})

const recommendedNameOptions = RECOMMENDED_NAMES

const showPresetNamePicker = computed(() =>
  !!props.rootCompositeId &&
  !!localObject.value &&
  localObject.value.type !== 'camera',
)

const selectedPresetNameValue = computed(() => {
  const alias = localObject.value?.alias?.trim()
  return alias && RECOMMENDED_NAMES_SET.has(alias) ? alias : ''
})

function isPresetNameUsedByOtherObject(name: string): boolean {
  const current = localObject.value
  if (!current) return false
  const namespaceRoot = props.rootCompositeId ?? sceneObjectStore.resolveNamespaceRoot(current.id)
  return sceneObjectStore.isAliasExists(name, current.id, namespaceRoot)
}

// v16: 获取当前对象的动画列表（创建时已深克隆资源动画到 obj.animations）
const resourceAnimations = computed(() => {
  if (!localObject.value) return []
  return animationStore.getObjectAnimations(localObject.value)
})

// v16 H1: 分组 — 区分资源动画和实例动画
const resourceOriginAnimNames = computed<Set<string>>(() => {
  if (!localObject.value) return new Set()
  const obj = localObject.value
  if (obj.type !== 'prop' && obj.type !== 'background') return new Set()
  const resAnims = animationStore.getAnimations(obj.type, obj.refId)
  return new Set(resAnims.map(a => a.name))
})

const resourceOriginAnimations = computed(() =>
  resourceAnimations.value.filter(a => resourceOriginAnimNames.value.has(a.name))
)

const instanceAnimations = computed(() =>
  resourceAnimations.value.filter(a => !resourceOriginAnimNames.value.has(a.name))
)

// v16 H1: 重新应用资源动画（从资源重新深克隆覆盖）
function handleReapplyResourceAnimations() {
  if (!localObject.value) return
  const obj = localObject.value
  if (obj.type !== 'prop' && obj.type !== 'background' && obj.type !== 'symbol') return
  animationStore.hydrateObjectAnimations(obj)
  sceneObjectStore.updateObject(obj.id, { animations: { ...obj.animations } })
}


// v9.1: 获取对象的出生槽位索引
const objectBirthSlotIndex = computed(() => {
  if (!props.isActionMode || !localObject.value) return -1
  if (localObject.value.type === 'camera') return 0
  
  // 简化实现：如果对象 visible = false 则返回 -1 表示未出生
  // 完整实现需要遍历 Block 的 Actions 找到第一个 visible: true 的 Action
  return localObject.value.visible === false ? -1 : 0
})

// v9.1: 跳转到出生槽位
function jumpToBirthSlot() {
  if (objectBirthSlotIndex.value >= 0) {
    emit('selectSlot', objectBirthSlotIndex.value)
  }
}

// v11.1: 获取资源动画当前状态（基于当前槽位的 Action）
function getResourceAnimState(_animName: string): 'play' | 'stop' | null {
  // 简化实现：返回 null 表示无状态
  // 完整实现需要从当前 Block 的 Actions 中查找 set_anim 动作
  return null
}

// v11.1: 处理资源动画播放/停止动作
function handleResourceAnimAction(animName: string, action: 'play' | 'stop') {
  const timingMode = getResourceAnimTimingMode(animName)
  emit('triggerAnim', {
    animName,
    action,
    loop: action === 'play',
    ...(action === 'play' ? { timingMode } : {}),
    speed: 1
  })
}

function getResourceAnimTimingMode(animName: string): AnimationTimingMode {
  const animation = resourceAnimations.value.find(a => a.name === animName)
  return animation?.timingMode ?? 'continuous'
}

// v11.1: 获取资源动画循环状态
function getResourceAnimLoop(_animName: string): boolean {
  // 简化实现：默认循环
  return true
}

// v11.1: 处理资源动画循环变更
function handleResourceAnimLoopChange(animName: string, loop: boolean) {
  const timingMode = getResourceAnimTimingMode(animName)
  emit('triggerAnim', {
    animName,
    action: 'play',
    loop,
    timingMode,
    speed: 1
  })
}

// v8.6: 获取对象类型图标 — P1: 委托给 metadata 注册表
function getObjectIcon(type: string): string {
  return getTypeIcon(type)
}

// v8.6: 获取对象显示名称
function getObjectDisplayName(obj: SceneObject): string {
  if (obj.type === 'camera') {
    return obj.name ? obj.name : '相机'
  }
  if (obj.type === 'light' && (obj as LightObject).lightType === 'ambient') {
    return '环境光'
  }
  if (obj.type === 'light' && (obj as LightObject).lightType === 'spot') {
    return obj.alias ?? obj.name ?? '聚光灯'
  }
  return obj.alias ?? obj.name ?? '未命名'
}

// ==================== P2: Composite 相关逻辑 ====================

// 当前选中对象的父组合对象（支持运行时层级关系）
const parentComposite = computed((): CompositeObject | null => {
  if (!localObject.value) return null
  const effectiveId = getEffectiveParentId(localObject.value)
  if (!effectiveId) return null
  const parent = sceneObjectStore.getObject(effectiveId)
  if (parent?.type === 'composite') {
    return parent as CompositeObject
  }
  return null
})

// 当前 composite 对象的子对象列表
// 双层架构：runtimeObjects 的 parentId 已包含结构动作效果
const compositeChildObjects = computed((): SceneObject[] => {
  if (localObject.value?.type !== 'composite') return []
  const comp = localObject.value as CompositeObject

  // 按 childIds 顺序排列，确保 UI 列表与渲染顺序一致
  // childIds[0] = 底层（先渲染，被遮挡），childIds[last] = 顶层（后渲染，在前面）
  const result: SceneObject[] = []
  for (const childId of comp.childIds ?? []) {
    const child = sceneObjectStore.getObject(childId)
    if (child) result.push(child)
  }
  return result
})

/** 从 store 刷新 localObject（子对象增删后 childIds/renderChain 同步） */
function refreshLocalObject() {
  if (!localObject.value) return
  const fresh = sceneObjectStore.getObject(localObject.value.id)
  if (fresh) {
    localObject.value = { ...fresh } as SceneObject
  }
}

// entity composite: renderChain ordered objects
const renderChainObjects = computed((): SceneObject[] => {
  if (localObject.value?.type !== 'composite') return []
  const comp = localObject.value as CompositeObject
  if (comp.compositeMode !== 'entity') return []
  const chain = comp.renderChain ?? []
  const result: SceneObject[] = []
  for (const childId of chain) {
    const child = sceneObjectStore.getObject(childId)
    if (child) result.push(child)
  }
  return result
})

// === 渲染链排序：zIndex 分组 + 选中状态 + 拖拽 ===

/** 渲染链分组信息：按 zIndex 分组，在组边界插入分割线 */
interface RcGroupEntry {
  type: 'item'
  obj: SceneObject
  flatIndex: number    // 在 renderChainObjects 中的索引
  isFirstInGroup: boolean
  isLastInGroup: boolean
  zIndex: number
}

interface RcGroupDivider {
  type: 'divider'
  zIndex: number       // 分割线下方组的 zIndex
}

type RcDisplayEntry = RcGroupEntry | RcGroupDivider

const renderChainDisplay = computed((): RcDisplayEntry[] => {
  const items = renderChainObjects.value
  if (items.length === 0) return []

  const entries: RcDisplayEntry[] = []
  let prevZIndex: number | null = null

  for (let i = 0; i < items.length; i++) {
    const obj = items[i]!
    const z = obj.zIndex

    // 组切换时插入分割线
    if (z !== prevZIndex) {
      if (prevZIndex !== null) {
        // 标记上一个 item 为组末尾
        for (let j = entries.length - 1; j >= 0; j--) {
          const e = entries[j]!
          if (e.type === 'item') { e.isLastInGroup = true; break }
        }
      }
      entries.push({ type: 'divider', zIndex: z })
    }

    const isFirst = prevZIndex === null || z !== prevZIndex
    entries.push({
      type: 'item',
      obj,
      flatIndex: i,
      isFirstInGroup: isFirst,
      isLastInGroup: false, // 后续补标
      zIndex: z,
    })
    prevZIndex = z
  }

  // 标记最后一个 item 为组末尾
  for (let j = entries.length - 1; j >= 0; j--) {
    const e = entries[j]!
    if (e.type === 'item') { e.isLastInGroup = true; break }
  }

  return entries
})

const selectedRenderChainId = ref<string | null>(null)
const rcDragOverIndex = ref(-1)
let rcDragStartIndex = -1

const selectedRenderChainIndex = computed(() => {
  if (!selectedRenderChainId.value) return -1
  return renderChainObjects.value.findIndex(o => o.id === selectedRenderChainId.value)
})

/** 获取指定 flatIndex 所在 zIndex 分组的边界 [groupStart, groupEnd]（闭区间） */
function getZIndexGroupBounds(flatIdx: number): [number, number] {
  const items = renderChainObjects.value
  if (flatIdx < 0 || flatIdx >= items.length) return [-1, -1]
  const z = items[flatIdx]!.zIndex
  let start = flatIdx
  let end = flatIdx
  while (start > 0 && items[start - 1]!.zIndex === z) start--
  while (end < items.length - 1 && items[end + 1]!.zIndex === z) end++
  return [start, end]
}

const canMoveUp = computed(() => {
  const idx = selectedRenderChainIndex.value
  if (idx <= 0) return false
  const [groupStart] = getZIndexGroupBounds(idx)
  return idx > groupStart
})

const canMoveDown = computed(() => {
  const idx = selectedRenderChainIndex.value
  const items = renderChainObjects.value
  if (idx < 0 || idx >= items.length - 1) return false
  const [, groupEnd] = getZIndexGroupBounds(idx)
  return idx < groupEnd
})

function onRcDragStart(idx: number, e: DragEvent) {
  rcDragStartIndex = idx
  selectedRenderChainId.value = renderChainObjects.value[idx]?.id ?? null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onRcDragOver(idx: number) {
  // 仅允许拖到同 zIndex 组内
  if (rcDragStartIndex >= 0) {
    const items = renderChainObjects.value
    const srcZ = items[rcDragStartIndex]?.zIndex
    const tgtZ = items[idx]?.zIndex
    if (srcZ !== tgtZ) {
      rcDragOverIndex.value = -1
      return
    }
  }
  rcDragOverIndex.value = idx
}

function onRcDragLeave() {
  rcDragOverIndex.value = -1
}

function onRcDrop(dropIdx: number) {
  rcDragOverIndex.value = -1
  if (rcDragStartIndex < 0 || rcDragStartIndex === dropIdx) return
  if (localObject.value?.type !== 'composite') return

  // zIndex 跨组校验
  const items = renderChainObjects.value
  const srcZ = items[rcDragStartIndex]?.zIndex
  const tgtZ = items[dropIdx]?.zIndex
  if (srcZ !== tgtZ) return

  const comp = localObject.value as CompositeObject
  const chain = comp.renderChain
  if (!chain) return

  const newChain = [...chain]
  const [moved] = newChain.splice(rcDragStartIndex, 1)
  if (!moved) return
  newChain.splice(dropIdx, 0, moved)

  if (props.isActionMode) {
    emit('compositeAction', { action: 'reorderRenderChain', compositeId: comp.id, renderChain: newChain })
  } else {
    sceneObjectStore.updateObject(comp.id, { renderChain: newChain } as Partial<SceneObject>)
    comp.renderChain = newChain
    emit('update', localObject.value)
  }
  selectedRenderChainId.value = moved
}

function onRcDragEnd() {
  rcDragOverIndex.value = -1
  rcDragStartIndex = -1
}

function handleRenderChainMoveUp(idx: number) {
  if (idx <= 0) return
  // zIndex 边界检查
  const [groupStart] = getZIndexGroupBounds(idx)
  if (idx <= groupStart) return

  if (localObject.value?.type !== 'composite') return
  const comp = localObject.value as CompositeObject
  const chain = comp.renderChain
  if (!chain) return
  const newChain = [...chain]
  const moved = newChain.splice(idx, 1)[0]!
  newChain.splice(idx - 1, 0, moved)
  if (props.isActionMode) {
    emit('compositeAction', { action: 'reorderRenderChain', compositeId: comp.id, renderChain: newChain })
    return
  }
  sceneObjectStore.updateObject(comp.id, { renderChain: newChain } as Partial<SceneObject>)
  comp.renderChain = newChain
  emit('update', localObject.value)
}

function handleRenderChainMoveDown(idx: number) {
  if (localObject.value?.type !== 'composite') return
  const comp = localObject.value as CompositeObject
  const chain = comp.renderChain
  if (!chain || idx >= chain.length - 1) return

  // zIndex 边界检查
  const [, groupEnd] = getZIndexGroupBounds(idx)
  if (idx >= groupEnd) return

  const newChain = [...chain]
  const moved = newChain.splice(idx, 1)[0]!
  newChain.splice(idx + 1, 0, moved)
  if (props.isActionMode) {
    emit('compositeAction', { action: 'reorderRenderChain', compositeId: comp.id, renderChain: newChain })
    return
  }
  sceneObjectStore.updateObject(comp.id, { renderChain: newChain } as Partial<SceneObject>)
  comp.renderChain = newChain
  emit('update', localObject.value)
}



// 切换 compositeLocked
function handleCompositeLockChange(event: Event) {
  if (localObject.value?.type !== 'composite') return
  const target = event.target as HTMLInputElement
  if (props.isActionMode) {
    // Action Mode: 通过 compositeAction 事件让 ActionEditor 直接写入 scene.setup.objects
    emit('compositeAction', {
      action: 'setCompositeLocked',
      compositeId: localObject.value.id,
      locked: target.checked
    })
  } else {
    // Setup Mode: 直接更新 Store
    sceneObjectStore.updateObject(localObject.value.id, { compositeLocked: target.checked } as Partial<SceneObject>)
  }
  if (localObject.value) {
    ;(localObject.value as CompositeObject).compositeLocked = target.checked
  }
}

// 从父组合中移出当前对象
function handleRemoveFromComposite() {
  if (!localObject.value?.parentId) return
  const childId = localObject.value.id

  if (props.isActionMode) {
    // Action Mode: emit 事件让 ActionEditor 创建结构变更 Action
    emit('compositeAction', { action: 'removeChild', childId })
  } else {
    // Setup Mode: 直接使用 Store 方法
    sceneObjectStore.removeFromComposite([childId])
    refreshLocalObject()
  }
}

// 从 composite 中移出指定子对象
function handleRemoveChildFromComposite(childId: string) {
  if (localObject.value?.type !== 'composite') return

  if (props.isActionMode) {
    emit('compositeAction', { action: 'removeChild', childId })
  } else {
    sceneObjectStore.removeFromComposite([childId])
    // 从 store 刷新 localObject，同步 childIds/renderChain 变更
    refreshLocalObject()
  }
}

// 拆分全部子对象
function handleUngroupAll() {
  if (localObject.value?.type !== 'composite') return
  const compositeId = localObject.value.id

  if (props.isActionMode) {
    // Action Mode: emit 事件让 ActionEditor 创建结构变更 Action
    emit('compositeAction', { action: 'ungroupAll', compositeId })
  } else {
    // Setup Mode: 直接使用 Store 方法
    sceneObjectStore.ungroupAll(compositeId)
    refreshLocalObject()
  }
}

// 添加成员到当前组合
function handleAddMemberToComposite() {
  if (localObject.value?.type !== 'composite') return
  emit('compositeAction', { action: 'addMember', compositeId: localObject.value.id })
}

// P2: handleObjectSelect 已被 handleTreeItemSelect 替代

// P2: 树形下拉 — 状态
const treeDropdownRef = ref<HTMLElement>()
const treeDropdownOpen = ref(false)
const expandedComposites = reactive(new Set<string>())

// P2: 初始化时所有 composite 默认折叠
// 用户可手动点击展开感兴趣的组合
// （此前 union 模式默认展开，但场景模板导入后子对象过多影响操作）

// P2: 树形下拉 — 选中项目
function handleTreeItemSelect(objectId: string) {
  emit('selectObject', objectId)
  treeDropdownOpen.value = false
}

// P2: 树形下拉 — 展开/折叠
function toggleCompositeExpand(compositeId: string) {
  if (expandedComposites.has(compositeId)) {
    expandedComposites.delete(compositeId)
  } else {
    expandedComposites.add(compositeId)
  }
}

// P2: 树形下拉 — 点击外部关闭
function handleTreeDropdownOutsideClick(event: MouseEvent) {
  if (treeDropdownRef.value && !treeDropdownRef.value.contains(event.target as Node)) {
    treeDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleTreeDropdownOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleTreeDropdownOutsideClick)
})

// v8.6: 处理别名编辑点击
function handleEditAliasClick() {
  if (localObject.value && localObject.value.type !== 'camera') {
    emit('editAlias', localObject.value.id)
  }
}

function handlePresetNameSelect(name: string) {
  if (!localObject.value || !name) return
  if (isPresetNameUsedByOtherObject(name)) return
  localObject.value.alias = name
  emit('update', localObject.value)
}

// v9.3: 处理水平翻转变更
function handleFlipXChange(event: Event) {
  const target = event.target as HTMLInputElement
  const newFlipX = target.checked
  
  if (props.isActionMode) {
    // Action Mode: 发射 visualActionUpdate 创建 set_visual Action
    emit('visualActionUpdate', { flipX: newFlipX })
  } else {
    // Setup Mode: 更新本地对象并发射 update
    if (localObject.value) {
      (localObject.value as { flipX?: boolean }).flipX = newFlipX
      emit('update', localObject.value)
    }
  }
}

// v9.3: 处理可见性变更
function handleVisibleChange(event: Event) {
  const target = event.target as HTMLInputElement
  const newVisible = target.checked
  
  if (props.isActionMode) {
    // Action Mode: 发射 visualActionUpdate 创建 set_visual Action
    emit('visualActionUpdate', { visible: newVisible })
  } else {
    // Setup Mode: 更新本地对象并发射 update
    if (localObject.value) {
      localObject.value.visible = newVisible
      emit('update', localObject.value)
    }
  }
}

function handleReceiveLightingChange(event: Event) {
  const target = event.target as HTMLInputElement
  const receiveLighting = target.checked

  if (props.isActionMode) {
    emit('visualActionUpdate', { receiveLighting })
  } else if (localObject.value) {
    localObject.value.receiveLighting = receiveLighting
    emit('update', localObject.value)
  }
}

function handleCastShadowChange(event: Event) {
  const target = event.target as HTMLInputElement
  const castShadow = target.checked

  if (props.isActionMode) {
    emit('visualActionUpdate', { castShadow })
  } else if (localObject.value) {
    localObject.value.castShadow = castShadow
    emit('update', localObject.value)
  }
}

// v9.3: 处理结构变更
function handleZIndexChange() {
  if (!localObject.value) return
  
  const newZIndex = localObject.value.zIndex
  
  if (props.isActionMode) {
    // Action Mode: 发射 visualActionUpdate 创建 set_visual Action
    emit('visualActionUpdate', { zIndex: newZIndex })
  } else {
    // Setup Mode: 更新对象后稳定排序 renderChain
    // 稳定排序仅按 zIndex 重新分组，同 zIndex 内保留用户自定义的相对顺序
    emit('update', localObject.value)
    sceneObjectStore.sortOwningRenderChain(localObject.value.id)
    refreshLocalObject()
  }
}

// 处理变换原点X变更（Setup Mode only）
function handleTransformOriginXChange(event: Event) {
  if (!localObject.value) return
  const newValue = parseFloat((event.target as HTMLInputElement).value) || 0
  applyTransformOriginWithCompensation(newValue, localObject.value.transformOriginY ?? 0)
}

// 处理变换原点Y变更（Setup Mode only）
function handleTransformOriginYChange(event: Event) {
  if (!localObject.value) return
  const newValue = parseFloat((event.target as HTMLInputElement).value) || 0
  applyTransformOriginWithCompensation(localObject.value.transformOriginX ?? 0, newValue)
}

/**
 * 统一变换原点修改 + 位置补偿（像素偏移方案）
 * 与 useSceneRenderer.ts 画布拖拽路径的补偿逻辑一致：
 * 当对象已旋转/缩放时，移动变换点需同步补偿 x/y 以保持视觉不变。
 */
function applyTransformOriginWithCompensation(newOriginX: number, newOriginY: number) {
  const obj = localObject.value
  if (!obj) return

  const oldOriginX = obj.transformOriginX ?? 0
  const oldOriginY = obj.transformOriginY ?? 0
  const rotation = obj.rotation ?? 0
  const sx = Math.abs(obj.scaleX ?? 1)
  const sy = obj.scaleY ?? 1

  // 像素偏移方案：offset 就是 originX/Y 本身，无需 bounds 计算
  const deltaOffsetX = newOriginX - oldOriginX
  const deltaOffsetY = newOriginY - oldOriginY

  // (R×S - I) × Δoffset
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const adjustX = (cos * sx * deltaOffsetX - sin * sy * deltaOffsetY) - deltaOffsetX
  const adjustY = (sin * sx * deltaOffsetX + cos * sy * deltaOffsetY) - deltaOffsetY

  obj.transformOriginX = newOriginX
  obj.transformOriginY = newOriginY

  // 仅当对象已旋转/缩放时才补偿
  if (Math.abs(adjustX) > 0.01 || Math.abs(adjustY) > 0.01) {
    obj.x = (obj.x ?? 0) + adjustX
    obj.y = (obj.y ?? 0) + adjustY
  }

  emit('update', obj)
}

// 音频试听状态
const isAudioPreviewing = ref(false)
const previewAudioInstance = ref<HTMLAudioElement | null>(null)

// v9.1: 录制模式切换 (动画/布局)
type RecordMode = 'animation' | 'layout'
// v14.1: 从父组件 prop 获取初始值，解决 v-else 重建后重置为默认值的问题
const recordMode = ref<RecordMode>(props.objectRecordMode ?? 'layout')

// v14.1: 当父组件的 objectRecordMode 变化时，同步到本地 ref
watch(() => props.objectRecordMode, (newMode) => {
  if (newMode !== undefined) {
    recordMode.value = newMode
  }
})

// v9.2: 监听 recordMode 变更，通知父组件
watch(recordMode, (newMode) => {
  emit('recordModeChange', newMode)
})

// 表情选择对话框状态
const showExpressionDialog = ref(false)
// v18: 独立表情对象切换对话框状态
const showExpressionObjectDialog = ref(false)

// v18: 独立表情对象信息
const expressionObjectInfo = computed(() => {
  if (localObject.value?.type !== 'expression') return null
  const expr = expressionStore.getExpression(localObject.value.refId)
  if (!expr) return null
  return {
    name: expr.name,
    thumbnailUrl: expr.defaultFrame?.url ? getImageUrl(expr.defaultFrame.url) : null,
    flipH: expr.flipHorizontal ?? false,
  }
})

// v18: 独立表情对象切换处理
async function handleExpressionObjectSwitch(expressionId: string) {
  showExpressionObjectDialog.value = false
  if (localObject.value?.type !== 'expression') return

  if (props.isActionMode) {
    // Action Mode: emit materialActionUpdate → ActionEditor 创建/更新 set_material Action
    emit('materialActionUpdate', expressionId)
  } else {
    // Setup Mode: 直接更新 refId
    // 自动补充缺失的 defaultRefId（旧数据兼容：首次切换时记录原始值）
    const expr = localObject.value as ExpressionObject
    if (!expr.defaultRefId) {
      expr.defaultRefId = expr.refId
    }
    localObject.value.refId = expressionId
    sceneObjectStore.updateObject(localObject.value.id, {
      refId: expressionId,
      defaultRefId: expr.defaultRefId,
    } as Partial<ExpressionObject>)
    await syncSelectedObjectMeasuredSize()
    emit('update', localObject.value)
  }
}

// 表情是否已修改（refId ≠ defaultRefId）
const expressionIsModified = computed(() => {
  if (localObject.value?.type !== 'expression') return false
  const expr = localObject.value as ExpressionObject
  // 无 defaultRefId 的旧数据视为未修改
  if (!expr.defaultRefId) return false
  return expr.refId !== expr.defaultRefId
})

// 恢复默认表情
function handleRestoreDefaultExpression() {
  if (localObject.value?.type !== 'expression') return
  const expr = localObject.value as ExpressionObject
  if (!expr.defaultRefId) return

  if (props.isActionMode) {
    // Action Mode: emit materialActionUpdate → ActionEditor 创建/更新 set_material Action
    emit('materialActionUpdate', expr.defaultRefId)
  } else {
    // Setup Mode: 直接更新 refId
    localObject.value.refId = expr.defaultRefId
    emit('update', localObject.value)
  }
}

// 设为默认表情
function handleSetDefaultExpression() {
  if (localObject.value?.type !== 'expression') return
  const expr = localObject.value as ExpressionObject
  expr.defaultRefId = expr.refId
  emit('update', localObject.value)
}

// 初始表情
const initialExpression = ref<string>('')


// 判断是否是相机对象
const isCamera = computed(() => {
  return localObject.value?.type === 'camera' || localObject.value?.name === '相机'
})

const isAmbientLight = computed(() => {
  if (localObject.value?.type !== 'light') return false
  return (localObject.value as LightObject).lightType === 'ambient'
})

const showReceiveLighting = computed(() => {
  if (!localObject.value) return false
  const obj = localObject.value
  if (obj.type === 'prop' || obj.type === 'symbol' || obj.type === 'expression' || obj.type === 'text') return true
  if (obj.type === 'composite') {
    return (obj as CompositeObject).compositeMode === 'entity'
  }
  return false
})

const showCastShadow = computed(() => {
  if (!localObject.value) return false
  const obj = localObject.value
  if (obj.type === 'prop' || obj.type === 'symbol' || obj.type === 'expression') return true
  if (obj.type === 'composite') {
    return (obj as CompositeObject).compositeMode === 'entity'
  }
  return false
})

// v25.6: 移除基础/高级分组，所有灯光参数直接平铺显示

// 当前录制模式（从 props 获取或默认 camera_move）
const cameraRecordMode = computed(() => props.cameraRecordMode ?? 'camera_move')

// ==================== 相机控制台相关变量和函数 ====================

// const projectStore... (removed)

// 当前相机动作类型（从 currentCameraAction 或默认 camera_move）
// v6.7: 只返回互斥类动作类型，震动单独处理
const currentCameraActionType = computed<CameraActionType>(() => {
  if (props.currentCameraAction) {
    const type = props.currentCameraAction.type as string
    // 互斥类动作
    if (['camera_cut', 'camera_move', 'camera_follow'].includes(type)) {
      return type as CameraActionType
    }
  }
  return cameraRecordMode.value
})

// v6.7: 震动按钮是否激活
const isShakeActive = computed(() => {
  return props.currentSlotHasShake ?? false
})


// v21: 判断某个按钮是否应该禁用
// 新互斥规则：camera_cut + camera_move 可共存，camera_follow 与两者互斥
function isExclusiveButtonDisabled(buttonType: CameraActionType): boolean {
  // 震动不参与互斥
  if (buttonType === 'camera_shake') return false
  
  // 如果没有任何相机动作，所有按钮可用
  if (!props.currentCameraAction) return false
  
  const currentType = props.currentCameraAction.type as string
  
  // camera_follow 独占：有 follow 时禁用 cut/move，有 cut/move 时禁用 follow
  if (currentType === 'camera_follow') {
    // follow 存在 → cut/move 被禁用，follow 本身可用（选中状态）
    return buttonType !== 'camera_follow'
  }
  
  // 有 cut 或 move 时 → follow 被禁用，cut/move 都可用
  if (currentType === 'camera_cut' || currentType === 'camera_move') {
    return buttonType === 'camera_follow'
  }
  
  return false
}

// v7.0: 可用的角色实例列表（用于跟随目标选择）
// const availableInstances... (removed)

// 相机参数 computed
const cameraX = computed(() => {
  const action = props.currentCameraAction as { params?: { x?: number } } | null
  if (action?.params?.x !== undefined) return Math.round(action.params.x)
  return localObject.value?.x ? Math.round(localObject.value.x) : CANVAS_CENTER_X
})

const cameraY = computed(() => {
  const action = props.currentCameraAction as { params?: { y?: number } } | null
  if (action?.params?.y !== undefined) return Math.round(action.params.y)
  return localObject.value?.y ? Math.round(localObject.value.y) : CANVAS_CENTER_Y
})

const cameraZoom = computed(() => {
  // v7.19: 修复：在 Action Mode 下，属性面板应始终显示对象的 Setup 值 (zoom)，而不是当前 Action 的值
  // 用户反馈：场景编辑页面，action mode下，属性面板上显示的是场景对象setup的值，不会在action mode下发生变化
  // removed legacy code
  
  // // Action 模式下，优先从动作参数读取
  // if (action?.params?.zoom !== undefined) return action.params.zoom
  
  // 如果没有动作或动作没有 zoom 参数，从相机对象读取
  if (localObject.value?.type === 'camera') {
    return (localObject.value as { zoom?: number }).zoom ?? 1.0
  }
  
  return 1.0
})

// 相机 zoom 显示值（Setup 模式下从相机对象读取，Action 模式下从动作参数读取）
const cameraZoomDisplay = computed(() => {
  if (props.isActionMode) {
    return cameraZoom.value
  }
  // Setup 模式：从相机对象读取 zoom
  if (localObject.value?.type === 'camera') {
    return (localObject.value as { zoom?: number }).zoom ?? 1.0
  }
  return 1.0
})

// 相机 zoom 百分数显示值（zoom * 100）
const cameraZoomPercent = computed(() => {
  return Math.round(cameraZoomDisplay.value * 100)
})

// camera params... (removed)

// 相机动作类型选择处理
function handleCameraTypeSelect(actionType: CameraActionType) {
  // 同时更新 recordMode（对于 cut/move）
  if (actionType === 'camera_cut' || actionType === 'camera_move') {
    emit('cameraRecordModeChange', actionType)
  }
  
  // 发出动作创建/更新事件
  let defaultParams: Record<string, unknown> = {}
  switch (actionType) {
    case 'camera_cut':
    case 'camera_move':
      defaultParams = {
        x: cameraX.value,
        y: cameraY.value,
        zoom: cameraZoom.value
      }
      break
    case 'camera_follow':
      defaultParams = {
        followTarget: '',
        damping: 0,  // 固定值，死跟，不让用户调整
        offsetX: 0,
        offsetY: -50,  // 默认 -50，让人物稍微偏下
        zoom: 1,  // v6.10: 默认 100%
        constrainBounds: true  // v6.10: 默认约束边界，限制相机在画布范围内
      }
      break
    case 'camera_shake':
      defaultParams = {
        intensity: 10,
        frequency: 20,
        decay: true
      }
      break
  }
  
  emit('cameraActionUpdate', actionType, defaultParams)
}

// 相机位置参数处理函数
// camera handlers... (removed)

function handleCameraZoomChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value)
  if (!isNaN(percent) && percent > 0) {
    const zoom = percent / 100  // 百分数转换为 zoom 值
    if (props.isActionMode) {
      // Action 模式：发出动作更新事件
      emit('cameraActionUpdate', currentCameraActionType.value, { zoom })
    } else {
      // Setup 模式：更新相机对象的 zoom 属性，并同步更新 width/height
      if (localObject.value?.type === 'camera') {
        const baseWidth = CAMERA_BASE_WIDTH
        const baseHeight = CAMERA_BASE_HEIGHT
        const newWidth = baseWidth / zoom
        const newHeight = baseHeight / zoom
        
        ;(localObject.value as { zoom?: number }).zoom = zoom
        localObject.value.width = newWidth
        localObject.value.height = newHeight
        emit('update', localObject.value)
      }
    }
  }
}

// Setup 模式下的 zoom 滑块变化处理
function handleCameraZoomSliderChange(event: Event) {
  const target = event.target as HTMLInputElement
  const percent = parseFloat(target.value)
  if (!isNaN(percent) && percent > 0) {
    const zoom = percent / 100  // 百分数转换为 zoom 值
    if (localObject.value?.type === 'camera') {
      const baseWidth = CAMERA_BASE_WIDTH
      const baseHeight = CAMERA_BASE_HEIGHT
      const newWidth = baseWidth / zoom
      const newHeight = baseHeight / zoom
      
      ;(localObject.value as { zoom?: number }).zoom = zoom
      localObject.value.width = newWidth
      localObject.value.height = newHeight
      emit('update', localObject.value)
    }
  }
}

// more camera handlers... (removed)

// v11.2: isAnimatedProp 已删除，统一使用 resourceAnimations

// function emitTriggerAnim... (removed)

// v11.1: 本地动画默认状态缓存（用于 Setup 模式 UI）
// v11.3: 移除 speed 属性，使用 AnimationDefinition 中的值
const animDefaultStates = ref<Map<string, { action: 'play' | 'stop', loop: boolean }>>(new Map())

// v11.1: 获取动画默认状态（Setup 模式）
function getAnimDefaultState(animName: string): 'play' | 'stop' {
  return animDefaultStates.value.get(animName)?.action ?? 'stop'
}

// v11.1: 设置动画默认状态（Setup 模式）- 即时触发动画播放并保存到场景数据
function setAnimDefaultState(animName: string, action: 'play' | 'stop') {
  console.log('[ObjectPropertiesPanel] setAnimDefaultState:', animName, action)
  
  // 更新本地状态
  const current = animDefaultStates.value.get(animName) ?? { action: 'stop', loop: true, speed: 1 }
  current.action = action
  animDefaultStates.value.set(animName, current)
  
  // v16: 直接访问 SceneObjectBase.initialAnimations（无需断言）
  if (localObject.value) {
    if (!localObject.value.initialAnimations) {
      localObject.value.initialAnimations = []
    }
    
    if (action === 'play') {
      // 添加到列表（如果不存在）
      const existing = localObject.value.initialAnimations.find(a => a.name === animName)
      if (!existing) {
        localObject.value.initialAnimations.push({ name: animName, loop: current.loop })
      } else {
        existing.loop = current.loop
      }
    } else {
      // 从列表中移除
      const index = localObject.value.initialAnimations.findIndex(a => a.name === animName)
      if (index > -1) {
        localObject.value.initialAnimations.splice(index, 1)
      }
    }
    
    // 触发更新保存到场景数据
    emit('update', localObject.value)
  }
  
  // v11.52: 移除即时触发动画播放/停止
  // Setup 模式下仅标记默认播放状态，不实际播放
  // 动画在 Preview/Export 时根据 initialAnimations 生效
}

// v11.1: 获取动画循环设置（Setup 模式）
function getAnimLoop(animName: string): boolean {
  return animDefaultStates.value.get(animName)?.loop ?? true
}

// v11.1: 设置动画循环（Setup 模式）
function setAnimLoop(animName: string, loop: boolean) {
  console.log('[ObjectPropertiesPanel] setAnimLoop:', animName, loop)
  
  const current = animDefaultStates.value.get(animName) ?? { action: 'stop', loop: true }
  current.loop = loop
  animDefaultStates.value.set(animName, current)
  
  // v11.3: 同步保存到 initialAnimations
  if (localObject.value && current.action === 'play') {
    const obj = localObject.value
    if (obj.initialAnimations) {
      const existing = obj.initialAnimations.find(a => a.name === animName)
      if (existing) {
        existing.loop = loop
      }
    }
    emit('update', localObject.value)
  }
  
  // 如果正在播放，更新循环设置
  if (current.action === 'play') {
    emit('triggerAnim', {
      animName,
      action: 'play',
      loop,
      timingMode: getResourceAnimTimingMode(animName)
    })
  }
}

// v11.3: getAnimSpeed 和 setAnimSpeed 已移除，speed 使用 AnimationDefinition 中定义的值


// ==================== 音频控制函数 (v7.5) ====================

// 更新音频默认播放状态 (Setup Mode)
function updateAudioPlaybackState(state: 'play' | 'stop') {
  if (localObject.value?.type !== 'audio') return
  ;(localObject.value as AudioObject).playbackState = state
  emit('update', localObject.value)
}

// Action Mode 下的音频状态缓存
const actionAudioState = ref<{
  action: 'play' | 'stop' | null,
  volume: number,
  loop: boolean,
  fadeIn: number,
  fadeOut: number
}>({
  action: null,
  volume: 1.0,
  loop: false,
  fadeIn: 0,
  fadeOut: 0
})

const actionTextRevealState = ref<{
  action: 'play' | 'stop' | null
}>({
  action: null,
})

// 获取音频动作状态 (Action Mode)
function getAudioActionState(): 'play' | 'stop' | null {
  return actionAudioState.value.action
}

function getTextRevealActionState(): 'play' | 'stop' | null {
  return actionTextRevealState.value.action
}

function updateTextRevealInitialState(state: 'complete' | 'typewriter') {
  if (localObject.value?.type !== 'text') return
  ;(localObject.value as TextObject).revealInitialState = state
  handleUpdate()
}

// 获取音频动作参数
function getAudioActionParam(key: 'volume' | 'loop' | 'fadeIn' | 'fadeOut'): number | boolean {
  return actionAudioState.value[key]
}

// v9.4: 类型安全的音频参数获取函数
function getAudioActionLoop(): boolean {
  return actionAudioState.value.loop
}

function getAudioActionVolume(): number {
  return actionAudioState.value.volume
}

// 更新音频动作参数
function updateAudioActionParam(key: 'volume' | 'loop' | 'fadeIn' | 'fadeOut', value: number | boolean) {
  if (key === 'loop') {
    actionAudioState.value.loop = value as boolean
  } else if (key === 'volume') {
    actionAudioState.value.volume = value as number
  } else if (key === 'fadeIn') {
    actionAudioState.value.fadeIn = value as number
  } else if (key === 'fadeOut') {
    actionAudioState.value.fadeOut = value as number
  }
  
  // 如果当前没有选择动作，默认选择播放
  actionAudioState.value.action ??= 'play'
  
  // 立即触发更新事件
  emitTriggerAudio()
}

function emitTriggerAudio() {
  if (!actionAudioState.value.action) return
  emit('triggerAudio', {
    action: actionAudioState.value.action,
    volume: actionAudioState.value.volume,
    loop: actionAudioState.value.loop,
    fadeIn: actionAudioState.value.fadeIn,
    fadeOut: actionAudioState.value.fadeOut
  })
}

// 处理音频动作 (Action Mode)
function handleAudioAction(action: 'play' | 'stop') {
  actionAudioState.value.action = action
  emitTriggerAudio()
}

function handleTextRevealAction(action: 'play' | 'stop') {
  if (localObject.value?.type !== 'text') return
  actionTextRevealState.value.action = action
  emit('triggerTextReveal', { action, mode: 'typewriter' })
}

// 音频试听
async function handleAudioPreview() {
  if (isAudioPreviewing.value) {
    // Stop
    if (previewAudioInstance.value) {
      previewAudioInstance.value.pause()
      previewAudioInstance.value = null
    }
    isAudioPreviewing.value = false
    return
  }

  // Start
  if (localObject.value?.type !== 'audio') return
  const audioObj = localObject.value
  const sound = soundStore.getSound(audioObj.refId)
  if (!sound?.url) return

  const audioUrl = getAudioUrl(sound.url)
  if (!audioUrl) return

  const audio = new Audio(audioUrl)
  // Use current settings from panel
  // v7.22: 无论 Setup 还是 Action Mode，试听时始终使用 100% 音量和不循环
  const volume = 1.0
  const loop = false
  
  audio.volume = volume ?? 1.0
  audio.loop = !!loop
  
  audio.onended = () => {
    // Only reset if not looping
    if (!audio.loop) {
        isAudioPreviewing.value = false
        previewAudioInstance.value = null
    }
  }

  previewAudioInstance.value = audio
  try {
    await audio.play()
    isAudioPreviewing.value = true
  } catch (e) {
    console.warn('Preview failed', e)
    isAudioPreviewing.value = false
    previewAudioInstance.value = null
  }
}

// ==================== Action Mode 动画控制函数 ====================

// v11.1: 旧版 partId 动画状态已删除，使用 resourceAnimations 代替

// 截断文本
function truncateText(text: string, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text
}

// 缩放比例锁定状态
const scaleLocked = ref(true)

function toggleScaleLock() {
  scaleLocked.value = !scaleLocked.value
  if (scaleLocked.value && localObject.value) {
    localObject.value.scaleY = localObject.value.scaleX
    handleUpdate()
  }
}

// 缩放比例 X（百分比）
const scalePercentX = computed({
  get: () => {
    if (!localObject.value) return 100
    return Math.round(localObject.value.scaleX * 100)
  },
  set: (value: number) => {
    if (!localObject.value) return
    const scale = Math.max(0.1, value / 100)
    localObject.value.scaleX = scale
    if (scaleLocked.value) {
      localObject.value.scaleY = scale
    }
  }
})

// 缩放比例 Y（百分比）
const scalePercentY = computed({
  get: () => {
    if (!localObject.value) return 100
    return Math.round(localObject.value.scaleY * 100)
  },
  set: (value: number) => {
    if (!localObject.value) return
    const scale = Math.max(0.1, value / 100)
    localObject.value.scaleY = scale
    if (scaleLocked.value) {
      localObject.value.scaleX = scale
    }
  }
})

// 旋转角度（度）
const rotationDegrees = computed({
  get: () => {
    if (!localObject.value) return 0
    return Math.round((localObject.value.rotation * 180 / Math.PI) * 10) / 10
  },
  set: (value: number) => {
    if (!localObject.value) return
    localObject.value.rotation = value * Math.PI / 180
  }
})

// 显示宽度（考虑缩放）
const displayWidth = computed({
  get: () => {
    if (!localObject.value) return 0
    return Math.round(localObject.value.width * localObject.value.scaleX)
  },
  set: (value: number) => {
    if (!localObject.value || localObject.value.width === 0) return
    if (localObject.value.type === 'mask') {
      const scaleX = Math.abs(localObject.value.scaleX) || 1
      localObject.value.width = Math.max(1, Math.round(value / scaleX))
      return
    }
    const isTextFixed = localObject.value.type === 'text'
      && ((localObject.value as unknown as Record<string, unknown>)['textBoxMode'] === 'fixed')
    if (isTextFixed) {
      const scaleX = Math.abs(localObject.value.scaleX) || 1
      localObject.value.width = Math.max(1, Math.round(value / scaleX))
      return
    }
    const newScale = Math.max(0.01, value / localObject.value.width)
    localObject.value.scaleX = newScale
    if (scaleLocked.value) {
      localObject.value.scaleY = newScale
    }
  }
})

// 显示高度（考虑缩放）
const displayHeight = computed({
  get: () => {
    if (!localObject.value) return 0
    return Math.round(localObject.value.height * localObject.value.scaleY)
  },
  set: (value: number) => {
    if (!localObject.value || localObject.value.height === 0) return
    if (localObject.value.type === 'mask') {
      const scaleY = Math.abs(localObject.value.scaleY) || 1
      localObject.value.height = Math.max(1, Math.round(value / scaleY))
      return
    }
    const isTextFixed = localObject.value.type === 'text'
      && ((localObject.value as unknown as Record<string, unknown>)['textBoxMode'] === 'fixed')
    if (isTextFixed) {
      const scaleY = Math.abs(localObject.value.scaleY) || 1
      localObject.value.height = Math.max(1, Math.round(value / scaleY))
      return
    }
    const newScale = Math.max(0.01, value / localObject.value.height)
    localObject.value.scaleY = newScale
    if (scaleLocked.value) {
      localObject.value.scaleX = newScale
    }
  }
})

function handleScaleXInputChange() { handleUpdate() }
function handleScaleYInputChange() { handleUpdate() }

// 使用 deep watch 监听选中对象的所有属性变化
// 这确保了拖拽、外部更新等任何修改都会同步到属性面板
watch(
  () => ({ obj: props.selectedObject, runtime: props.runtimeState, slot: props.currentSlotIndex }),
  ({ obj }: { obj: SceneObject | undefined }) => {
    if (obj) {
      // 深度拷贝对象，确保数据同步
      const cloned = { ...obj } as SceneObject
      // screen_effect 的 params 是嵌套对象，需要深拷贝以避免与 store 共享引用
      if (cloned.type === 'screen_effect' && 'params' in cloned) {
        (cloned as unknown as { params: Record<string, unknown> }).params = { ...((cloned as unknown as { params: Record<string, unknown> }).params) }
      }
      
      
      localObject.value = cloned

      
      
      // 初始化音频 Action Mode 状态
      if (obj.type === 'audio') {
        const audioObj = obj
        actionAudioState.value = {
          action: null, // 初始不选中任何动作
          volume: (audioObj as AudioObject).volume ?? 1.0,
          loop: (audioObj as AudioObject).loop ?? false,
          fadeIn: (audioObj as AudioObject).fadeIn ?? 0,
          fadeOut: (audioObj as AudioObject).fadeOut ?? 0
        }
      }
      
      // v16: 从 initialAnimations 初始化 animDefaultStates
      animDefaultStates.value.clear()
      if (obj.initialAnimations && obj.initialAnimations.length > 0) {
        for (const anim of obj.initialAnimations) {
          animDefaultStates.value.set(anim.name, { action: 'play', loop: anim.loop })
        }
      }
    } else {
      localObject.value = null

      initialExpression.value = ''
    }
  },
  { immediate: true, deep: true }
)

// Watcher to stop preview when object changes
watch(
  () => props.selectedObject?.id,
  () => {
    if (isAudioPreviewing.value) {
      if (previewAudioInstance.value) {
        previewAudioInstance.value.pause()
        previewAudioInstance.value = null
      }
      isAudioPreviewing.value = false
    }
  }
)

function handleUpdate() {
  if (localObject.value) {
    emit('update', localObject.value)
  }
}

/**
 * 画面特效参数变更处理
 * 修改 params 中的指定 key，触发 store 更新 + PIXI 重绘
 */
function handleScreenEffectParamChange(key: string, value: string | number) {
  if (localObject.value?.type !== 'screen_effect') return
  const params = (localObject.value as ScreenEffectObject).params as Record<string, unknown>
  params[key] = value

  // 切换 holeShape 时，自动调整 holeWidth/holeHeight 以匹配形状语义
  if (key === 'holeShape') {
    const w = (params['holeWidth'] as number) ?? 600
    const h = (params['holeHeight'] as number) ?? 600
    if (value === 'horizontal_ellipse' && w < h) {
      // 水平椭圆：宽应大于高，交换
      params['holeWidth'] = h
      params['holeHeight'] = w
    } else if (value === 'vertical_ellipse' && h < w) {
      // 垂直椭圆：高应大于宽，交换
      params['holeWidth'] = h
      params['holeHeight'] = w
    } else if (value === 'circle') {
      // 圆形：宽高统一为较小值
      const minDim = Math.min(w, h)
      params['holeWidth'] = minDim
      params['holeHeight'] = minDim
    }
  }

  emit('update', localObject.value)
}

/**
 * v25: 光源参数变更处理
 */
function handleLightParamChange(
  key: 'lightColor' | 'lightIntensity' | 'lightRadius' | 'flicker' | 'flickerSpeed' | 'directionMode' | 'directionAngle' | 'coneAngle',
  value: string | number
) {
  if (localObject.value?.type !== 'light') return
  const lightObj = localObject.value as LightObject
  if (key === 'lightColor') {
    lightObj.lightColor = value as string
  } else if (key === 'lightIntensity') {
    lightObj.lightIntensity = value as number
  } else if (key === 'lightRadius') {
    lightObj.lightRadius = value as number
  } else if (key === 'flicker') {
    lightObj.flicker = value as number
  } else if (key === 'flickerSpeed') {
    lightObj.flickerSpeed = value as number
  } else if (key === 'directionMode') {
    lightObj.directionMode = value as 'omni' | 'cone'
  } else if (key === 'directionAngle') {
    lightObj.directionAngle = value as number
  } else if (key === 'coneAngle') {
    lightObj.coneAngle = value as number
  }
  emit('update', localObject.value)
}

/**
 * Clip-Mask Phase 1：蒙版属性变更处理（来自 MaskShapeSection / MaskTargetsSection）
 */
function handleMaskChange(patch: Partial<MaskObject>) {
  if (localObject.value?.type !== 'mask') return
  debugLog('mask', '[MASK-DEBUG] ObjectPropertiesPanel.handleMaskChange\n' + JSON.stringify({ id: localObject.value.id, patch }, null, 2))
  const target = localObject.value as unknown as Record<string, unknown>
  for (const k of Object.keys(patch)) {
    target[k] = (patch as Record<string, unknown>)[k]
  }
  emit('update', localObject.value)
}

/**
 * Text PRD Phase 0 + Phase 1: 文本属性变更处理
 */
function handleTextPropertyChange(key: string, value: string | number | boolean | undefined) {
  if (localObject.value?.type !== 'text') return
  const target = localObject.value as unknown as Record<string, unknown>
  target[key] = value

  if (key === 'revealSpeed') {
    const raw = Number(value)
    if (Number.isFinite(raw)) {
      target['revealSpeed'] = Math.max(0.5, Math.min(60, raw))
    } else {
      target['revealSpeed'] = 8
    }
  }

  // 历史兼容：若 lineHeight 命中旧自动值(fontSize*1.3)，自动归一为“自动行高”
  const normalizedLineHeight = resolveTextLineHeight(
    target['fontFamily'] as string | undefined,
    Number(target['fontSize'] ?? 72),
    target['lineHeight'] as number | undefined,
  )
  if (normalizedLineHeight.source !== 'explicit') {
    delete target['lineHeight']
  } else {
    target['lineHeight'] = normalizedLineHeight.lineHeight
  }

  // 切换到线性渐变时，自动补默认色标，避免“类型切换后看起来无变化”
  if (key === 'fillType' && value === 'linear_gradient') {
    const currentStops = target['gradientStops'] as { offset: number; color: string }[] | undefined
    if (!currentStops || currentStops.length === 0) {
      const baseColor = (target['color'] as string | undefined) ?? '#ffffff'
      target['gradientStops'] = [
        { offset: 0, color: baseColor },
        { offset: 1, color: '#000000' },
      ]
    }
    if (target['gradientAngle'] === undefined) {
      target['gradientAngle'] = 90
    }
  }

  if (key === 'textBoxMode' && value === 'fixed') {
    const content = normalizeTextContent((target['content'] as string | undefined) ?? '')
    const fontSize = Number(target['fontSize'] ?? 72)
    const lineHeight = Number(target['lineHeight'] ?? getAutoTextLineHeight(target['fontFamily'] as string | undefined, fontSize))
    const lines = Math.max(1, content.split('\n').length)
    const estimatedHeight = Math.ceil(lines * lineHeight + 24)
    const currentHeight = Number(target['height'] ?? 0)
    if (!Number.isFinite(currentHeight) || currentHeight < estimatedHeight) {
      target['height'] = estimatedHeight
    }
    const minWidth = Number(target['wordWrapWidth'] ?? 400)
    const currentWidth = Number(target['width'] ?? 0)
    if (!Number.isFinite(currentWidth) || currentWidth < minWidth) {
      target['width'] = minWidth
    }
    const safeWrapWidth = Math.max(50, Number(target['width'] ?? minWidth))
    target['wordWrapWidth'] = safeWrapWidth
  }

  if (key === 'textBoxMode' && value === 'auto-size') {
    target['wordWrap'] = false
  }

  if (key === 'textBackgroundEnabled' && value === true) {
    target['textBackgroundColor'] ??= '#000000'
    target['textBackgroundAlpha'] ??= 0.35
    target['textBackgroundPaddingX'] ??= 16
    target['textBackgroundPaddingY'] ??= 10
    target['textBackgroundRadius'] ??= 8
  }

  emit('update', localObject.value)
  // 切换字体时：先 emit 更新数据（PIXI 立即用 fallback 渲染），
  // 字体加载完成后用请求序号防止旧请求回流，并 emit 克隆对象触发 PIXI.Text 重建。
  if (key === 'fontFamily' && typeof value === 'string' && value) {
    const textObj = localObject.value as TextObject | null
    const objectId = textObj?.id
    const requestId = ++textFontLoadRequestId.value
    const sampleText = textObj?.content ?? ''
    void ensureFontLoaded(value, sampleText).then(() => {
      const latest = localObject.value as TextObject | null
      if (
        latest?.type === 'text'
        && latest.id === objectId
        && latest.fontFamily === value
        && requestId === textFontLoadRequestId.value
      ) {
        emit('update', { ...latest })
      }
    })
  }
}

/** 预置字体列表 */
const PRESET_FONT_FAMILIES = [
  'Noto Sans SC', 'Noto Serif SC', 'LXGW WenKai',
  'ZCOOL QingKe HuangYou', 'Ma Shan Zheng',
]

/** 系统本地字体列表（通过 queryLocalFonts API 枚举） */
const localFonts = ref<string[]>([])
const localFontsLoaded = ref(false)

/** 加载系统本地字体 */
async function loadLocalFonts() {
  // @ts-expect-error queryLocalFonts 是 Chrome 103+ 实验性 API，类型定义不在标准 lib 中
  if (typeof window.queryLocalFonts !== 'function') {
    alert('当前浏览器不支持枚举本地字体（需要 Chrome/Edge 103+）')
    return
  }
  try {
    // @ts-expect-error queryLocalFonts 返回 FontData[]，类型定义不在标准 lib 中
    const fonts: { family: string }[] = await (window.queryLocalFonts as () => Promise<{ family: string }[]>)()
    // 去重并按字母排序
    const uniqueFamilies = [...new Set(fonts.map(f => f.family))]
      .filter(name => !PRESET_FONT_FAMILIES.includes(name))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    localFonts.value = uniqueFamilies
    localFontsLoaded.value = true
  } catch (e) {
    console.warn('[ObjectPropertiesPanel] 加载本地字体失败:', e)
    alert('加载本地字体失败，可能是权限被拒绝')
  }
}

/** 当前字号 */
const currentFontSize = computed(() => {
  if (localObject.value?.type !== 'text') return 32
  return ((localObject.value as unknown as Record<string, unknown>)['fontSize'] as number | undefined) ?? 72
})

/** 当前字号在预设中的匹配值（用于 select 显示） */
const fontSizePresetMatch = computed(() => {
  const size = currentFontSize.value
  return FONT_SIZE_PRESETS.includes(size) ? size : size
})

/** 字号 select 变更 */
function handleFontSizeSelectChange(value: string) {
  handleTextPropertyChange('fontSize', Number(value))
}

/** 字距预设 */
const LETTER_SPACING_PRESETS = [-5, -2, 0, 1, 2, 4, 6, 8, 12, 16, 20]

/** 行高预设 */
const LINE_HEIGHT_PRESETS = [40, 48, 56, 64, 72, 80, 88, 96, 112, 128, 144]

const currentLetterSpacing = computed(() => {
  if (localObject.value?.type !== 'text') return 0
  return ((localObject.value as unknown as Record<string, unknown>)['letterSpacing'] as number | undefined) ?? 0
})

const letterSpacingPresetMatch = computed(() => {
  const v = currentLetterSpacing.value
  return LETTER_SPACING_PRESETS.includes(v) ? v : v
})

const currentLineHeight = computed<string | number>(() => {
  if (localObject.value?.type !== 'text') return ''
  const v = (localObject.value as unknown as Record<string, unknown>)['lineHeight'] as number | undefined
  return v ?? ''
})

const lineHeightPresetMatch = computed(() => {
  const v = currentLineHeight.value
  return v === '' ? '' : Number(v)
})

function handleLetterSpacingSelectChange(value: string) {
  handleTextPropertyChange('letterSpacing', Number(value))
}

function handleLineHeightSelectChange(value: string) {
  handleTextPropertyChange('lineHeight', value ? Number(value) : undefined)
}

/**
 * Phase 2: 渐变色标修改处理
 * 维护 2 色标的 gradientStops 数组
 */
function handleGradientStopChange(index: number, color: string) {
  if (localObject.value?.type !== 'text') return
  const obj = localObject.value as unknown as Record<string, unknown>
  const stops = (obj['gradientStops'] as { offset: number; color: string }[] | undefined) ?? [
    { offset: 0, color: '#ffffff' },
    { offset: 1, color: '#000000' },
  ]
  // 确保至少有 2 个色标
  while (stops.length < 2) {
    stops.push({ offset: stops.length === 0 ? 0 : 1, color: '#000000' })
  }
  stops[index]!.color = color
  obj['gradientStops'] = [...stops]
  emit('update', localObject.value)
}

/** 环境光预设列表（从统一模块导入，映射为旧 UI 格式） */
const AMBIENT_LIGHT_PRESETS = AMBIENT_PRESETS.map(p => ({
  id: p.id,
  label: p.label,
  color: p.params.lightColor,
  intensity: p.params.lightIntensity,
}))

/** 当前灯型对应的预设列表（点光/聚光） */
const currentLightPresets = computed<LightPresetEntry[]>(() => {
  if (localObject.value?.type !== 'light') return []
  return getPresetsForLightType((localObject.value as LightObject).lightType)
})

/** 应用环境光预设 */
function handleAmbientPreset(preset: { color: string; intensity: number }) {
  if (localObject.value?.type !== 'light') return
  const lightObj = localObject.value as LightObject
  lightObj.lightColor = preset.color
  lightObj.lightIntensity = preset.intensity
  emit('update', localObject.value)
}

/** 应用点光 / 聚光预设（一键覆写全部运行时参数） */
function handleLightPresetApply(preset: LightPresetEntry) {
  if (localObject.value?.type !== 'light') return
  const lightObj = localObject.value as LightObject
  const p = preset.params
  lightObj.lightColor = p.lightColor
  lightObj.lightIntensity = p.lightIntensity
  lightObj.lightRadius = p.lightRadius
  lightObj.flicker = p.flicker
  lightObj.flickerSpeed = p.flickerSpeed
  if (p.directionAngle !== undefined) lightObj.directionAngle = p.directionAngle
  if (p.coneAngle !== undefined) lightObj.coneAngle = p.coneAngle
  emit('update', localObject.value)
}

// 旋转角度变化
function handleRotationChange() {
  if (localObject.value) {
    emit('update', localObject.value)
  }
}

// 缩放变化时，同时更新 scaleX 和 scaleY 保持等比例
// function handleScaleChange... (removed)

// 尺寸变化时的处理
function handleSizeChange() {
  if (localObject.value) {
    emit('update', localObject.value)
  }
}

// X坐标变化
function handleXChange(event: Event) {
  if (localObject.value) {
    const target = event.target as HTMLInputElement
    const val = parseInt(target.value, 10)
    localObject.value.x = isNaN(val) ? 0 : val
    emit('update', localObject.value)
  }
}

// Y坐标变化
function handleYChange(event: Event) {
  if (localObject.value) {
    const target = event.target as HTMLInputElement
    const val = parseInt(target.value, 10)
    localObject.value.y = isNaN(val) ? 0 : val
    emit('update', localObject.value)
  }
}


// 处理表情选择
function handleExpressionSelect(expressionId: string) {
  initialExpression.value = expressionId
  showExpressionDialog.value = false
}
</script>

<style scoped>
.properties-panel {
  height: 100%;
  overflow-y: auto;
}

.empty-hint {
  padding: 20px;
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
}

.properties-form {
  padding: 16px;
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

.light-subsection {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fafafa;
}

.light-section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: none;
  background: #f3f4f6;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.light-section-body {
  padding: 12px;
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

.property-field input[type="text"],
.property-field input[type="number"],
.property-field select {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
}

.property-field input[type="range"] {
  width: 100%;
  margin-top: 8px;
}

.scale-control {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.scale-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  text-align: right;
}

.percent-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.scale-slider {
  width: 100%;
  margin-top: 0;
}

.value-label {
  font-size: 12px;
  color: #6b7280;
}

.readonly-value {
  display: block;
  padding: 6px 10px;
  font-size: 13px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  color: #374151;
}

.property-field.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.property-field.checkbox input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.property-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
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

.layer-controls {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.layer-btn {
  flex: 1;
  padding: 8px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.layer-btn:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: #3b82f6;
}

.layer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Action Mode 槽位提示样式 */
.action-mode-hint {
  margin-bottom: 16px;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 8px;
}

.slot-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.slot-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 20px;
  padding: 0 6px;
  background: #f59e0b;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
}

.slot-text {
  font-size: 13px;
  color: #92400e;
  font-weight: 500;
}

.hint-text {
  font-size: 11px;
  color: #b45309;
}

.anim-control-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.anim-part-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.anim-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.control-btn.play {
  color: #10b981;
}

.control-btn.stop {
  color: #ef4444;
}

.loop-check {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}

.speed-input {
  width: 40px;
  padding: 2px 4px;
  font-size: 11px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  text-align: center;
}

/* v16 H1: 动画分组样式 */
.anim-group {
  margin-bottom: 4px;
}

.anim-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.anim-group-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.btn-reapply {
  padding: 2px 8px;
  font-size: 11px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  color: #0284c7;
  cursor: pointer;
}

.btn-reapply:hover {
  background: #e0f2fe;
}

.btn-add-playlist {
  width: 100%;
  padding: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
}

.btn-add-playlist:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

/* 动画默认状态设置样式 */
.anim-default-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  margin-bottom: 12px;
}

.anim-default-hint .hint-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.anim-default-hint .hint-text {
  font-size: 12px;
  color: #0369a1;
  line-height: 1.4;
}

.anim-default-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.anim-part-header {
  margin-bottom: 8px;
}

.anim-part-header .anim-part-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.anim-default-options {
  display: flex;
  gap: 8px;
}

.anim-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.anim-option input[type="radio"] {
  display: none;
}

.anim-option .option-icon {
  font-size: 12px;
  color: #6b7280;
}

.anim-option .option-label {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.anim-option:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.anim-option.active {
  background: #eff6ff;
  border-color: #3b82f6;
}

.anim-option.active .option-icon {
  color: #3b82f6;
}

.anim-option.active .option-label {
  color: #1d4ed8;
}

/* 动画额外设置样式 */
.anim-extra-settings {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.anim-loop-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}

.anim-loop-option input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.anim-speed-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

.speed-input-small {
  width: 50px;
  padding: 2px 4px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  text-align: center;
}

/* Action Mode 动画动作样式 */
.action-record-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 6px;
  margin-bottom: 12px;
}

.action-record-hint .hint-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.action-record-hint .hint-text {
  font-size: 12px;
  color: #92400e;
  line-height: 1.4;
}

.action-record-hint .hint-text strong {
  color: #b45309;
  font-weight: 600;
}

.anim-action-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.anim-action-header {
  margin-bottom: 8px;
}

.anim-action-header .anim-part-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.anim-action-options {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.action-option-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-option-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.action-option-btn.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.action-option-btn.play.selected {
  border-color: #10b981;
  background: #ecfdf5;
}

.action-option-btn.play.selected .btn-icon {
  color: #10b981;
}

.action-option-btn.stop.selected {
  border-color: #ef4444;
  background: #fef2f2;
}

.action-option-btn.stop.selected .btn-icon {
  color: #ef4444;
}

.text-reveal-action-card {
  background: #f8fafc;
}

.text-reveal-default-card {
  background: #f8fafc;
}

.text-reveal-action-card .anim-action-options {
  margin-bottom: 0;
}

.anim-option.text-reveal-start-option.active {
  border-color: #10b981;
  background: #ecfdf5;
}

.anim-option.text-reveal-start-option.active .option-icon,
.anim-option.text-reveal-start-option.active .option-label {
  color: #047857;
}

.anim-option.text-reveal-complete-option.active {
  border-color: #3b82f6;
  background: #eff6ff;
}

.anim-option.text-reveal-complete-option.active .option-icon,
.anim-option.text-reveal-complete-option.active .option-label {
  color: #1d4ed8;
}

.action-option-btn.text-reveal-start.selected {
  border-color: #10b981;
  background: #ecfdf5;
}

.action-option-btn.text-reveal-start.selected .btn-icon,
.action-option-btn.text-reveal-start.selected .btn-label {
  color: #047857;
}

.action-option-btn.text-reveal-complete.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.action-option-btn.text-reveal-complete.selected .btn-icon,
.action-option-btn.text-reveal-complete.selected .btn-label {
  color: #1d4ed8;
}

.action-option-btn .btn-icon {
  font-size: 12px;
  color: #6b7280;
}

.action-option-btn .btn-label {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.preview-audio-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
}

.preview-audio-btn:hover {
  background: #2563eb;
}

.preview-audio-btn.playing {
  background: #ef4444;
}

.preview-audio-btn.playing:hover {
  background: #dc2626;
}

.anim-action-extras {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.action-loop-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}

.action-loop-option input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.action-speed-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

/* 相机动作按钮样式 */
/* v6.5: 相机控制台样式 */
.camera-console {
  padding: 12px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #bae6fd;
  border-radius: 8px;
}

.camera-console .console-label {
  font-size: 11px;
  color: #0369a1;
  margin-bottom: 8px;
  font-weight: 500;
}

.camera-console .camera-mode-tabs {
  display: flex;
  gap: 4px;
  background: white;
  padding: 4px;
  border-radius: 6px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

.camera-console .camera-mode-btn {
  flex: 1;
  padding: 8px 4px;
  font-size: 11px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.camera-console .camera-mode-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: #374151;
}

.camera-console .camera-mode-btn.active {
  background: #0284c7;
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(2, 132, 199, 0.3);
}

.camera-console .camera-mode-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.camera-console .console-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 10px;
  font-size: 12px;
  color: #0369a1;
  background: white;
  border-radius: 6px;
  border-left: 3px solid #0284c7;
}

.camera-console .console-hint .hint-icon {
  font-size: 14px;
}

.camera-console .slot-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.camera-console .slot-indicator .slot-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  background: #0284c7;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
}

.camera-console .slot-indicator .slot-text {
  color: #475569;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 相机参数面板样式 */
.slot-indicator-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 10px;
  background: #f8fafc;
  border-radius: 6px;
}

.slot-indicator-row .slot-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 8px;
  background: #0284c7;
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}

.slot-indicator-row .slot-text {
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-params-section {
  margin-top: 12px;
  padding: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.camera-mode-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 10px;
  font-size: 12px;
  color: #0369a1;
  background: #f0f9ff;
  border-radius: 6px;
  border-left: 3px solid #0284c7;
}

.camera-mode-hint .hint-icon {
  font-size: 14px;
}

.camera-param-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.camera-param-row:last-child {
  margin-bottom: 0;
}

.camera-param-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.camera-param-item.full-width {
  flex: unset;
  width: 100%;
  margin-bottom: 10px;
}

.camera-param-item.full-width:last-child {
  margin-bottom: 0;
}

.camera-param-item label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.camera-param-item label .hint-text {
  font-weight: normal;
  color: #94a3b8;
  font-size: 10px;
}

.camera-param-item input[type="number"],
.camera-param-item select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  background: white;
}

.camera-param-item input[type="number"]:focus,
.camera-param-item select:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.1);
}

.camera-param-item .range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.camera-param-item .range-row input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e2e8f0;
  border-radius: 2px;
}

.camera-param-item .range-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #0284c7;
  border-radius: 50%;
  cursor: pointer;
}

.camera-param-item .range-row .value-label {
  min-width: 30px;
  font-size: 12px;
  font-weight: 600;
  color: #0284c7;
  text-align: right;
}

.camera-param-item .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.camera-param-item .checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 部位素材选择器样式 */
.part-asset-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.current-asset-name {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-asset-select-btn {
  padding: 4px 10px;
  font-size: 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.part-asset-select-btn:hover {
  background: #e5e7eb;
  border-color: #9ca3af;
}

/* 部位素材缩略图预览 */
.part-asset-preview {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.part-asset-preview:hover {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.part-asset-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.part-asset-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  opacity: 0.5;
}

/* P2: 树形对象选择器 */
.object-selector-section {
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.tree-dropdown {
  position: relative;
  width: 100%;
}

.tree-dropdown-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.tree-dropdown-trigger:hover {
  border-color: #93c5fd;
}

.tree-dropdown-trigger:focus {
  border-color: #3b82f6;
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.trigger-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1f2937;
}

.trigger-placeholder {
  flex: 1;
  color: #9ca3af;
}

.trigger-arrow {
  flex-shrink: 0;
  font-size: 10px;
  color: #6b7280;
  margin-left: 6px;
}

.tree-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 50;
  padding: 4px;
}

.tree-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  gap: 4px;
  transition: background 0.1s;
  user-select: none;
}

.tree-item:hover {
  background: #f0f4ff;
}

.tree-item.selected {
  background: #3b82f6;
  color: white;
}

.tree-item.selected .tree-item-label {
  font-weight: 500;
}

.tree-item.inactive {
  opacity: 0.45;
}

.tree-item.child-item {
  padding-left: 24px;
}

.tree-toggle-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 9px;
  cursor: pointer;
  border-radius: 3px;
  flex-shrink: 0;
  transition: all 0.15s;
  padding: 0;
}

.tree-toggle-btn:hover {
  background: #e5e7eb;
  color: #1f2937;
}

.tree-item.selected .tree-toggle-btn {
  color: rgba(255, 255, 255, 0.8);
}

.tree-item.selected .tree-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.tree-indent {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  font-size: 12px;
  color: #9ca3af;
}

.tree-item.selected .tree-indent {
  color: rgba(255, 255, 255, 0.7);
}

.tree-indent-spacer {
  width: 18px;
  flex-shrink: 0;
}

.tree-item-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.tree-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* v8.6: 别名编辑 */
.alias-field {
  margin-top: 4px;
}

.alias-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.alias-edit-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.alias-value {
  flex: 1;
  font-size: 13px;
  color: #374151;
}

.alias-edit-btn {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.alias-edit-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.preset-name-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.preset-name-select {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #374151;
}

/* v9.1: 录制模式切换 */
.record-mode-section {
  padding: 8px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(to right, #fef3c7, #fde68a);
  display: flex;
  align-items: center;
  gap: 12px;
}

.record-mode-label {
  font-size: 12px;
  font-weight: 600;
  color: #78350f;
  white-space: nowrap;
}

.record-mode-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
}

.record-mode-btn {
  flex: 1;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #d97706;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  color: #92400e;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.record-mode-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: #b45309;
}

.record-mode-btn.active {
  background: #d97706;
  color: white;
  border-color: #b45309;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* Group Management Styles (Migrated) */
.part-groups-section {
  margin-top: 8px;
}

.group-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border-top: 1px dashed #e5e7eb;
  padding-top: 12px;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #4b5563;
}

.group-name {
  font-weight: 500;
}

.group-actions {
  display: flex;
  gap: 4px;
}

.btn-icon-small {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  color: #6b7280;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.btn-icon-small:hover {
  background: #f3f4f6;
  color: #3b82f6;
  border-color: #3b82f6;
}

.btn-icon-mini {
  width: 22px; 
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  color: #6b7280;
  font-size: 14px;
}

.btn-icon-mini:hover {
  background: #f3f4f6;
  color: #374151;
}

.btn-icon-mini.btn-delete:hover {
  color: #ef4444;
  background: #fee2e2;
}

/* ==================== P2: Composite UI ==================== */

.parent-composite-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: linear-gradient(135deg, #dbeafe, #ede9fe);
  border: 1px solid #93c5fd;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}

.parent-composite-hint .hint-label {
  color: #6b7280;
  white-space: nowrap;
}

.parent-composite-hint .hint-name {
  font-weight: 600;
  color: #1e40af;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parent-composite-hint .hint-name-clickable {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  font-size: inherit;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.parent-composite-hint .hint-name-clickable:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #1d4ed8;
  text-decoration: underline;
}

.remove-from-group-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: white;
  color: #3b82f6;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.remove-from-group-btn:hover {
  background: #3b82f6;
  color: white;
}

/* compositeMode 只读显示 */
.composite-mode-readonly {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

/* 环境光预设网格 */
.ambient-preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 4px;
}

.ambient-preset-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fafafa;
  cursor: pointer;
  font-size: 11px;
  color: #374151;
  transition: all 0.15s ease;
}

.ambient-preset-btn:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}

.preset-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.preset-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composite-children-list {
  margin-top: 8px;
}

.children-header {
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

.add-child-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.15s;
}

.add-child-btn:hover {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.child-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
  cursor: default;
}

.child-item.child-item-clickable {
  cursor: pointer;
}

.child-item.child-item-clickable:hover {
  background: #dbeafe;
}

.child-item[draggable="true"] {
  cursor: grab;
}

.child-item[draggable="true"]:active {
  cursor: grabbing;
}

.child-item.drag-over {
  background: #dbeafe;
  border: 1px dashed #3b82f6;
  border-radius: 4px;
}

.drag-handle {
  font-size: 14px;
  color: #9ca3af;
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
  line-height: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.render-order-hint {
  text-align: center;
  font-size: 10px;
  color: #9ca3af;
  padding: 2px 0;
  letter-spacing: 1px;
}

.zindex-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin: 4px 0 2px;
}

.zindex-divider::before,
.zindex-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.zindex-label {
  font-size: 10px;
  color: #9ca3af;
  white-space: nowrap;
  font-family: monospace;
}

.child-item:hover {
  background: #f3f4f6;
}

.child-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.child-name {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-child-btn {
  padding: 2px 6px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #6b7280;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
}

.child-item:hover .remove-child-btn {
  opacity: 1;
}

.reorder-btns {
  display: flex;
  flex-direction: row;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.child-item:hover .reorder-btns {
  opacity: 1;
}

.reorder-btn {
  padding: 4px 8px;
  font-size: 14px;
  line-height: 1;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.reorder-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.reorder-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* === 渲染链排序 UI === */
.render-chain-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.render-chain-controls {
  display: flex;
  gap: 4px;
}

.rc-move-btn {
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

.rc-move-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.rc-move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rc-item {
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
  border: 1px solid transparent;
  border-radius: 4px;
}

.rc-item:hover {
  background: #f3f4f6;
}

.rc-selected {
  background: #eff6ff !important;
  border-color: #93c5fd;
}

.rc-drag-over {
  border-color: #3b82f6;
  background: #dbeafe !important;
}

.rc-drag-handle {
  font-size: 14px;
  color: #c4c9d0;
  cursor: grab;
  flex-shrink: 0;
  letter-spacing: -2px;
  user-select: none;
  transition: color 0.15s;
}

.rc-item:hover .rc-drag-handle {
  color: #9ca3af;
}

.rc-drag-handle:active {
  cursor: grabbing;
}

.remove-child-btn:hover {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.empty-children {
  padding: 8px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
  font-style: italic;
}

.composite-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.composite-action-btn {
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.composite-action-btn:hover {
  background: #f3f4f6;
}

.composite-action-btn.danger {
  border-color: #fca5a5;
  color: #dc2626;
}

.composite-action-btn.danger:hover {
  background: #fef2f2;
  border-color: #f87171;
}

/* ===== Symbol Material Preview ===== */
.symbol-preview-area {
  display: flex;
  gap: 12px;
  padding: 8px 0;
}

.symbol-preview-frame {
  width: 80px;
  height: 80px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.symbol-preview-frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.symbol-preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #9ca3af;
  font-size: 11px;
}

.symbol-preview-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.symbol-current-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.symbol-material-count {
  font-size: 11px;
  color: #6b7280;
}
.symbol-material-path {
  font-size: 10px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  cursor: default;
}

/* v18: 表情引用卡片 */
.expression-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.expression-card:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}
.expression-card:active {
  background: #e5e7eb;
}

.expression-card-thumb {
  width: 48px;
  height: 48px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.expression-card-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.expression-card-info {
  flex: 1;
  min-width: 0;
}
.expression-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.expression-card-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.expression-card-action {
  flex-shrink: 0;
  font-size: 16px;
  opacity: 0.4;
  transition: opacity 0.15s ease;
}
.expression-card:hover .expression-card-action {
  opacity: 0.8;
}

.expression-default-badge {
  font-size: 10px;
  margin-left: 4px;
  vertical-align: middle;
}

.expression-default-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding: 0 2px;
}

.expression-action-link {
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}

.expression-action-link.restore {
  color: #60a5fa;
}

.expression-action-link.restore:hover {
  color: #93bbfd;
}

.expression-action-link.set-default {
  color: #9ca3af;
}

.expression-action-link.set-default:hover {
  color: #d1d5db;
}

.symbol-manage-btn {
  margin-top: 4px;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  width: fit-content;
}
.symbol-manage-btn:hover {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #2563EB;
}

/* ===== Symbol Quick Switch Grid ===== */
.symbol-switch-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.symbol-switch-item {
  width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  background: #f9fafb;
}
.symbol-switch-item:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.symbol-switch-item.active {
  border-color: #2563EB;
  background: #eff6ff;
}
.symbol-switch-item img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
}
.switch-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.switch-name {
  font-size: 10px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 52px;
  text-align: center;
}

/* ===== 快捷操作工具栏 ===== */
.quick-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  border-bottom: 1px solid #f0f0f0;
}

.quick-toolbar-header {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 2px;
}

.quick-toolbar-title {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.02em;
}

.quick-toolbar-subtitle {
  font-size: 11px;
  color: #64748b;
}

.quick-toolbar.with-record-mode {
  margin-top: 12px;
}

.quick-toolbar.setup-toolbar {
  margin-top: 2px;
}

.quick-toolbar-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.quick-toolbar-group--compact {
  flex: 0 0 auto;
}

.quick-toolbar-group--fill {
  flex: 1 1 220px;
}

.quick-toolbar-group-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  line-height: 1;
}

.qt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  user-select: none;
}

.qt-toggle:hover {
  border-color: #93c5fd;
  background: #f0f5ff;
}

.qt-toggle input[type="checkbox"] {
  margin: 0;
}

.qt-toggle-label {
  font-size: 12px;
}

/* ===== 穿透状态指示器 ===== */
.pass-through-indicator {
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f0f5ff, #e8f0fe);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
}

.pt-status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.pt-icon {
  font-size: 16px;
}

.pt-text {
  font-size: 12px;
  color: #1e40af;
  font-weight: 500;
}

.pt-actions {
  display: flex;
  gap: 6px;
}

.pt-btn {
  flex: 1;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid #93c5fd;
  background: white;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  color: #374151;
}

.pt-btn:hover {
  background: #dbeafe;
}

.pt-btn.active {
  border-color: #3b82f6;
  color: #1d4ed8;
}

.pt-btn.remove {
  border-color: #fca5a5;
  color: #dc2626;
}

.pt-btn.remove:hover {
  background: #fee2e2;
}

.qt-pt-btn {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px dashed #d1d5db;
  background: transparent;
  border-radius: 8px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.qt-pt-btn:hover {
  border-color: #93c5fd;
  background: #f0f5ff;
  color: #2563eb;
}

@media (max-width: 520px) {
  .quick-toolbar-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .quick-toolbar-group,
  .quick-toolbar-group--fill {
    width: 100%;
    flex-basis: 100%;
  }

  .qt-toggle,
  .qt-pt-btn {
    width: 100%;
    justify-content: center;
  }
}

/* Text properties */
.text-content-input {
  width: 100%;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  background: white;
}

.text-content-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.font-select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.text-align-group {
  display: flex;
  gap: 4px;
}

.text-align-btn {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.text-align-btn:hover {
  background: #f3f4f6;
}

.text-align-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* Phase 1: Sub-section headings within text properties */
.sub-section-heading {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 8px;
  margin-bottom: 2px;
  padding-bottom: 2px;
  border-bottom: 1px solid #e5e7eb;
}

/* FR-0.11: 自定义字体免责提示 */
.font-warning-tip {
  font-size: 11px;
  color: #d97706;
  margin-top: 4px;
  line-height: 1.3;
}

/* 加载本地字体按钮 */
.load-fonts-btn {
  margin-top: 4px;
  width: 100%;
  padding: 4px 8px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.load-fonts-btn:hover {
  color: #3b82f6;
  border-color: #93c5fd;
  background: #eff6ff;
}


/* Phase 2: 动画参数单位后缀 */
.value-label {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}
</style>
