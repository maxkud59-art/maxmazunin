<script setup lang="ts">
import { getHealth } from '~/app/api/generated/health/health';
import { getAuth } from '~/app/api/generated/auth/auth';
import { useAuthStore } from '~/stores/auth';

definePageMeta({ middleware: ['auth'] });

const auth = useAuthStore();
const backendStatus = ref<'loading' | 'ok' | 'error'>('loading');

onMounted(async () => {
  try {
    const { healthControllerCheck } = getHealth();
    const res = await healthControllerCheck();
    backendStatus.value = res.status === 'ok' ? 'ok' : 'error';
  } catch {
    backendStatus.value = 'error';
  }

  if (!auth.user && auth.token) {
    try {
      const { authControllerMe } = getAuth();
      const me = await authControllerMe();
      auth.setUser({ id: me.id!, email: me.email!, role: me.role as 'ADMIN' | 'USER' });
    } catch { auth.logout(); navigateTo('/login'); }
  }
});

const experiments = [
  { label: 'Реклама VK Ads',   icon: '📊',  soon: false, href: '/vk-ads' },
  { label: 'Мессенджер',       icon: '💬',  soon: false, href: '/messenger' },
  { label: 'ИИ-ассистент',     icon: '🤖',  soon: false, href: '/assistant' },
  { label: 'Авто-макет книг',  icon: '📖',  soon: false, href: '/book-layout' },
  { label: 'Финансы',          icon: '📈',  soon: true },
];
</script>

<template>
  <div class="min-h-screen bg-background overflow-x-hidden">
    <!-- Header — adaptive, no overflow on 360px -->
    <header class="border-b px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-bold text-base tracking-tight shrink-0">maxmazunin.ru</span>
          <span class="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded shrink-0">кабинет</span>
        </div>
        <!-- Backend status (hidden on very small screens) -->
        <span
          class="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
          :class="{
            'bg-green-100 text-green-700': backendStatus === 'ok',
            'bg-red-100 text-red-700': backendStatus === 'error',
            'bg-muted text-muted-foreground animate-pulse': backendStatus === 'loading',
          }"
        >
          <span v-if="backendStatus === 'loading'">…</span>
          <span v-else-if="backendStatus === 'ok'">ok ✓</span>
          <span v-else>✗</span>
        </span>
      </div>

      <!-- Second row for email + actions (always visible) -->
      <div class="flex items-center justify-between mt-1.5 gap-2">
        <span class="text-xs text-muted-foreground truncate min-w-0">{{ auth.user?.email }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <span v-if="auth.isAdmin" class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">ADMIN</span>
          <NuxtLink v-if="auth.isAdmin" to="/users" class="text-xs text-primary hover:underline">Пользователи</NuxtLink>
          <button class="text-xs text-destructive hover:underline" @click="auth.logout(); navigateTo('/login')">Выйти</button>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="max-w-4xl mx-auto px-4 py-8">
      <h1 class="text-2xl font-bold mb-1">Рабочий стол</h1>
      <p class="text-muted-foreground mb-8 text-sm">
        Привет, {{ auth.user?.email ?? '…' }}.
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <NuxtLink
          v-for="item in experiments" :key="item.label"
          :to="item.soon ? undefined : item.href"
          :class="[
            'rounded-xl border bg-card shadow p-4 block',
            item.soon ? 'opacity-50 cursor-not-allowed select-none' : 'hover:border-primary hover:shadow-md transition-all cursor-pointer',
          ]"
        >
          <div class="text-2xl mb-2">{{ item.soon ? '🔬' : item.icon }}</div>
          <div class="font-medium text-sm leading-tight">{{ item.label }}</div>
          <div class="text-xs text-muted-foreground mt-1">{{ item.soon ? 'Скоро' : 'Открыть →' }}</div>
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
