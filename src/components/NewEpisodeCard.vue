<template>
  <div
    class="new-episode-card"
    @click="$emit('click')"
  >
    <div class="card-icon">
      <span class="plus-icon">+</span>
    </div>
    <p class="card-text">
      新建动画
    </p>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  click: []
}>()
</script>

<style scoped>
.new-episode-card {
  background: white;
  border-radius: 12px;
  border: 2px dashed #d1d5db;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.new-episode-card:hover {
  border-color: #3b82f6;
  background: #f9fafb;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

.card-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.3s;
}

.new-episode-card:hover .card-icon {
  background: #3b82f6;
}

.plus-icon {
  font-size: 48px;
  font-weight: 300;
  color: #3b82f6;
  transition: all 0.3s;
}

.new-episode-card:hover .plus-icon {
  color: white;
}

.card-text {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.3s;
}

.new-episode-card:hover .card-text {
  color: #3b82f6;
}
</style>
