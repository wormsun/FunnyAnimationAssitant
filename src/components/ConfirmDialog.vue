<template>
  <div
    class="confirm-overlay"
    @click.self="handleCancel"
  >
    <div class="confirm-dialog">
      <div class="dialog-header">
        <h3>{{ title }}</h3>
      </div>
      
      <div class="dialog-body">
        <p>{{ message }}</p>
      </div>
      
      <div class="dialog-footer">
        <button
          class="btn btn-cancel"
          @click="handleCancel"
        >
          {{ cancelText }}
        </button>
        <button
          v-if="showSecondaryConfirm"
          class="btn btn-confirm btn-danger"
          @click="handleSecondaryConfirm"
        >
          {{ secondaryConfirmText }}
        </button>
        <button
          class="btn btn-confirm"
          :class="{ 'btn-danger': isDanger }"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  showSecondaryConfirm?: boolean
  secondaryConfirmText?: string
}>(), {
  title: '确认',
  confirmText: '确定',
  cancelText: '取消',
  isDanger: false,
  showSecondaryConfirm: false,
  secondaryConfirmText: '',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  secondaryConfirm: []
}>()

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleSecondaryConfirm() {
  emit('secondaryConfirm')
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.confirm-dialog {
  width: 90%;
  max-width: 440px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.dialog-body {
  padding: 24px;
}

.dialog-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
  white-space: pre-line;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
}

.btn-cancel {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-cancel:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-confirm {
  background: #3b82f6;
  color: white;
}

.btn-confirm:hover {
  background: #2563eb;
}

.btn-danger {
  background: #dc2626;
}

.btn-danger:hover {
  background: #b91c1c;
}
</style>
