<template>
  <div class="fin-module">
    <!-- Left nav -->
    <nav class="fin-nav">
      <div class="nav-header">
        <span class="nav-brand">Финансы</span>
      </div>
      <ul class="nav-list">
        <li v-for="tab in TABS" :key="tab.path">
          <NuxtLink :to="tab.path" class="nav-item" active-class="nav-item-active">
            <span class="nav-icon">{{ tab.icon }}</span>
            <span class="nav-label">{{ tab.label }}</span>
          </NuxtLink>
        </li>
      </ul>
      <div class="nav-footer">
        <NuxtLink to="/" class="nav-back">← Главная</NuxtLink>
      </div>
    </nav>
    <div class="fin-content"><NuxtPage /></div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

const TABS = [
  { path: '/finance/dashboard', label: 'Дашборд', icon: '📊' },
  { path: '/finance/operations', label: 'Операции (ДДС)', icon: '💳' },
  { path: '/finance/cashflow', label: 'Отчёт ДДС', icon: '🔄' },
  { path: '/finance/pnl', label: 'ПНЛ', icon: '📈' },
  { path: '/finance/orders', label: 'Заказы → ПНЛ', icon: '📦' },
  { path: '/finance/accounts', label: 'Счета', icon: '🏦' },
  { path: '/finance/categories', label: 'Статьи', icon: '📋' },
  { path: '/finance/ai-finance', label: 'AI-финансист', icon: '🧠' },
];
</script>

<style scoped>
.fin-module { display: flex; height: 100vh; overflow: hidden; background: #f5f6fa; }
.fin-nav {
  width: 220px; flex-shrink: 0; background: #1e293b;
  display: flex; flex-direction: column; overflow: hidden;
}
.nav-header { padding: 18px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.nav-brand { font-weight: 700; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.nav-list { list-style: none; margin: 0; padding: 8px 0; flex: 1; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px; color: #94a3b8; text-decoration: none;
  font-size: 13.5px; transition: background 0.15s, color 0.15s; cursor: pointer;
}
.nav-item:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.nav-item-active { background: rgba(16,185,129,0.2) !important; color: #6ee7b7 !important; }
.nav-icon { font-size: 15px; flex-shrink: 0; }
.nav-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); }
.nav-back { font-size: 12px; color: #64748b; text-decoration: none; }
.nav-back:hover { color: #94a3b8; }
.fin-content { flex: 1; overflow: auto; display: flex; flex-direction: column; }
</style>
