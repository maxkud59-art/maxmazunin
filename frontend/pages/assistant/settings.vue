<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Настройки</h1>
    </div>
    <div class="stub-content">
      <div class="stub-icon">⚙️</div>
      <div class="stub-title">Скоро</div>
      <div class="stub-hint">Раздел настроек в разработке. Здесь будут: уведомления, интеграции, доступы.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// stub page
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; background: #f5f6fa; }
.tab-header { padding: 16px 20px 8px; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.stub-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 20px; text-align: center; color: #94a3b8; }
.stub-icon { font-size: 64px; }
.stub-title { font-size: 22px; font-weight: 700; color: #64748b; }
.stub-hint { font-size: 14px; max-width: 360px; }
</style>
