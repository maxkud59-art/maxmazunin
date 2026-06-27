<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp } from '#app';

definePageMeta({ middleware: ['auth'] });

const { $api } = useNuxtApp() as any;

const conversations = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const selected = ref<string | null>(null);

const STAGES: Record<string, string> = {
  NEW_LEAD: 'Новый лид',
  PRICE_SENT: 'Цена отправлена',
  OFORMLENO: 'Оформлено',
  IN_PRODUCTION: 'В производстве',
  READY_TO_SHIP: 'Готово к отправке',
  SHIPPED: 'Отправлено',
  DELIVERED: 'Доставлено',
  OPLACHENO: 'Оплачено',
  CLOSED_LOST: 'Потеря',
};

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: 'bg-gray-100 text-gray-600',
  PRICE_SENT: 'bg-blue-100 text-blue-700',
  OFORMLENO: 'bg-indigo-100 text-indigo-700',
  IN_PRODUCTION: 'bg-yellow-100 text-yellow-700',
  READY_TO_SHIP: 'bg-orange-100 text-orange-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-teal-100 text-teal-700',
  OPLACHENO: 'bg-green-100 text-green-700',
  CLOSED_LOST: 'bg-red-100 text-red-600',
};

const filtered = computed(() =>
  conversations.value.filter(c =>
    !search.value || c.clientName.toLowerCase().includes(search.value.toLowerCase()),
  ),
);

async function load() {
  loading.value = true;
  try {
    const res = await $api('/api/ai-assistant/conversations', { params: { limit: 100 } });
    conversations.value = Array.isArray(res) ? res : (res.items ?? []);
    if (!selected.value && conversations.value.length) {
      selected.value = conversations.value[0].id;
    }
  } catch (e: any) {
    console.error('ai-panel load error', e);
  } finally {
    loading.value = false;
  }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-50">
    <!-- Sidebar -->
    <div class="w-72 shrink-0 border-r bg-white flex flex-col">
      <div class="p-4 border-b">
        <div class="flex items-center justify-between mb-3">
          <h1 class="font-bold text-gray-900">AI-ассистент</h1>
          <NuxtLink to="/assistant" class="text-xs text-indigo-600 hover:underline">← Назад</NuxtLink>
        </div>
        <input
          v-model="search"
          placeholder="Поиск по клиенту..."
          class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
        <div v-else-if="!filtered.length" class="text-center py-8 text-gray-400 text-sm">Нет диалогов</div>
        <button
          v-for="c in filtered"
          :key="c.id"
          @click="selected = c.id"
          :class="[
            'w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition',
            selected === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : '',
          ]"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium text-sm text-gray-900 truncate">{{ c.clientName || 'Без имени' }}</span>
            <span v-if="c.lifecycleStage"
              :class="['shrink-0 text-xs px-1.5 py-0.5 rounded font-medium', STAGE_COLORS[c.lifecycleStage] ?? 'bg-gray-100 text-gray-600']">
              {{ STAGES[c.lifecycleStage] ?? c.lifecycleStage }}
            </span>
          </div>
          <div class="text-xs text-gray-400 mt-0.5 truncate">{{ c.lastMessageText }}</div>
          <div class="text-xs text-gray-300 mt-0.5">{{ fmtDate(c.lastMessageAt) }}</div>
        </button>
      </div>
    </div>

    <!-- Panel -->
    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="!selected" class="flex items-center justify-center h-full text-gray-400">
        Выберите диалог слева
      </div>
      <AiAssistantAiAssistantPanel v-else :key="selected" :conversationId="selected" />
    </div>
  </div>
</template>
