<template>
  <div class="ai-module">
    <!-- Mobile top bar -->
    <div class="mobile-topbar">
      <button class="burger-btn" @click="drawerOpen = !drawerOpen">☰</button>
      <span class="mobile-title">ИИ-ассистент</span>
    </div>

    <!-- Mobile drawer backdrop -->
    <div v-if="drawerOpen" class="drawer-backdrop" @click="drawerOpen = false" />

    <!-- Left navigation -->
    <nav class="ai-nav" :class="{ open: drawerOpen }">
      <div class="nav-header">
        <span class="nav-brand">ИИ-ассистент</span>
        <button class="nav-close" @click="drawerOpen = false">✕</button>
      </div>
      <ul class="nav-list">
        <li v-for="tab in TABS" :key="tab.path">
          <NuxtLink
            :to="tab.path"
            class="nav-item"
            active-class="nav-item-active"
            @click="drawerOpen = false"
          >
            <span class="nav-icon">{{ tab.icon }}</span>
            <span class="nav-label">{{ tab.label }}</span>
          </NuxtLink>
        </li>
      </ul>
      <div class="nav-footer">
        <NuxtLink to="/" class="nav-back">← Главная</NuxtLink>
      </div>
    </nav>

    <!-- Content area -->
    <div class="ai-content">
      <NuxtPage />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

definePageMeta({ middleware: ['auth'] });

const drawerOpen = ref(false);

const TABS = [
  { path: '/assistant/clients', label: 'Клиенты', icon: '👥' },
  { path: '/assistant/orders', label: 'Заказы', icon: '📦' },
  { path: '/assistant/messenger', label: 'Мессенджер', icon: '💬' },
  { path: '/assistant/phrases', label: 'Быстрые фразы', icon: '⚡' },
  { path: '/assistant/directories', label: 'Справочники', icon: '📋' },
  { path: '/assistant/broadcasts', label: 'Рассылки', icon: '📢' },
  { path: '/assistant/ai-settings', label: 'Настройка ИИ', icon: '🤖' },
  { path: '/assistant/settings', label: 'Настройки', icon: '⚙️' },
];
</script>

<style scoped>
.ai-module {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f5f6fa;
}

/* ─── Mobile top bar ─────────────────────────────────────────────── */
.mobile-topbar {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 52px;
  background: #1e293b;
  color: #fff;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  z-index: 200;
}
.burger-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}
.mobile-title {
  font-weight: 600;
  font-size: 15px;
}

/* ─── Left nav ───────────────────────────────────────────────────── */
.ai-nav {
  width: 220px;
  flex-shrink: 0;
  background: #1e293b;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.nav-header {
  padding: 18px 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.nav-brand {
  font-weight: 700;
  font-size: 13px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.nav-close { display: none; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; }

.nav-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  flex: 1;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 13.5px;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
}
.nav-item:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.nav-item-active { background: rgba(99,102,241,0.2) !important; color: #a5b4fc !important; }

.nav-icon { font-size: 15px; flex-shrink: 0; }
.nav-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.nav-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.nav-back {
  font-size: 12px;
  color: #64748b;
  text-decoration: none;
}
.nav-back:hover { color: #94a3b8; }

/* ─── Content ────────────────────────────────────────────────────── */
.ai-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── Drawer backdrop ────────────────────────────────────────────── */
.drawer-backdrop {
  display: none;
}

/* ─── Mobile ─────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .mobile-topbar { display: flex; }
  .drawer-backdrop { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 149; }

  .ai-module { flex-direction: column; }

  .ai-nav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 260px;
    z-index: 150;
    transform: translateX(-100%);
    transition: transform 0.25s;
  }
  .ai-nav.open { transform: translateX(0); }
  .nav-close { display: block; }

  .ai-content {
    margin-top: 52px;
    flex: 1;
  }
}
</style>
