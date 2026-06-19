<script setup lang="ts">
import { getHealth } from '~/app/api/generated/health/health';
import { getAuth } from '~/app/api/generated/auth/auth';
import { useAuthStore } from '~/stores/auth';

definePageMeta({ middleware: ['auth'] });

const auth = useAuthStore();
const backendStatus = ref<'loading' | 'ok' | 'error'>('loading');

onMounted(async () => {
  // 1. Health check
  try {
    const { healthControllerCheck } = getHealth();
    const res = await healthControllerCheck();
    backendStatus.value = res.status === 'ok' ? 'ok' : 'error';
  } catch {
    backendStatus.value = 'error';
  }

  // 2. Загрузить профиль если ещё нет
  if (!auth.user && auth.token) {
    try {
      const { authControllerMe } = getAuth();
      const me = await authControllerMe();
      auth.setUser({ id: me.id!, email: me.email!, role: me.role as 'ADMIN' | 'USER' });
    } catch { /* токен протух */ auth.logout(); navigateTo('/login'); }
  }
});

const experiments = [
  { label: 'Реклама VK Ads',   icon: 'Megaphone',  soon: false, href: '/vk-ads' },
  { label: 'ИИ-ассистент',     icon: 'Bot',         soon: true },
  { label: 'Авто-макет книг',  icon: 'BookImage',   soon: true },
  { label: 'Финансы',          icon: 'BarChart2',   soon: true },
];
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="font-bold text-lg tracking-tight">maxmazunin.ru</span>
        <span class="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">кабинет</span>
      </div>
      <div class="flex items-center gap-4">
        <!-- Backend status -->
        <span
          class="text-xs px-2.5 py-1 rounded-full font-medium"
          :class="{
            'bg-green-100 text-green-700': backendStatus === 'ok',
            'bg-red-100 text-red-700': backendStatus === 'error',
            'bg-muted text-muted-foreground animate-pulse': backendStatus === 'loading',
          }"
        >
          <span v-if="backendStatus === 'loading'">бэкенд: …</span>
          <span v-else-if="backendStatus === 'ok'">бэкенд: ok ✓</span>
          <span v-else>бэкенд: ✗</span>
        </span>

        <!-- User -->
        <span class="text-sm text-muted-foreground">{{ auth.user?.email }}</span>
        <span
          v-if="auth.isAdmin"
          class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium"
        >ADMIN</span>
        <NuxtLink v-if="auth.isAdmin" to="/users" class="text-sm text-primary hover:underline">
          Пользователи
        </NuxtLink>
        <button class="text-sm text-destructive hover:underline" @click="auth.logout(); navigateTo('/login')">
          Выйти
        </button>
      </div>
    </header>

    <!-- Main -->
    <main class="max-w-4xl mx-auto px-6 py-12">
      <h1 class="text-3xl font-bold mb-1">Рабочий стол</h1>
      <p class="text-muted-foreground mb-10 text-sm">
        Привет, {{ auth.user?.email ?? '…' }}. Здесь будут эксперименты.
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <NuxtLink
          v-for="item in experiments" :key="item.label"
          :to="item.soon ? undefined : item.href"
          :class="[
            'rounded-xl border bg-card shadow p-5 block',
            item.soon ? 'opacity-50 cursor-not-allowed select-none' : 'hover:border-primary hover:shadow-md transition-all cursor-pointer',
          ]"
        >
          <div class="text-2xl mb-2">{{ item.soon ? '🔬' : '📊' }}</div>
          <div class="font-medium text-sm">{{ item.label }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">{{ item.soon ? 'Скоро' : 'Открыть →' }}</div>
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
