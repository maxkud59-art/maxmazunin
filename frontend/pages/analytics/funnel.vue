<template>
  <div class="p-6 max-w-6xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900">Воронка диалогов</h1>
      <div class="flex gap-3">
        <input v-model="from" type="date" class="input-sm" />
        <input v-model="to" type="date" class="input-sm" />
        <input v-model="managerId" type="text" placeholder="ID менеджера" class="input-sm w-40" />
        <button @click="load" class="btn-primary text-sm">Применить</button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-gray-500">Загрузка...</div>
    <div v-else-if="error" class="text-red-600 py-8">{{ error }}</div>

    <template v-else-if="report">
      <!-- Summary -->
      <div class="bg-white rounded-xl border p-5">
        <div class="text-sm text-gray-500 mb-1">Всего диалогов в выборке</div>
        <div class="text-3xl font-bold">{{ report.total }}</div>
      </div>

      <!-- Funnel table -->
      <div class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-4 border-b font-semibold text-gray-800">Этапы воронки</div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Этап</th>
              <th class="px-4 py-3 text-right">Кол-во</th>
              <th class="px-4 py-3 text-right">от топа</th>
              <th class="px-4 py-3 text-right">от пред.</th>
              <th class="px-4 py-3 text-right">Потери</th>
              <th class="px-4 py-3 text-right">Потери %</th>
              <th class="px-4 py-3 text-left w-48">Прогресс</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in report.stages" :key="s.stage" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">
                <span :class="stageBadge(s.stage)" class="px-2 py-0.5 rounded text-xs font-semibold mr-2">{{ s.stage }}</span>
                {{ stageLabel(s.stage) }}
              </td>
              <td class="px-4 py-3 text-right font-mono">{{ s.count.toLocaleString() }}</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ s.convFromTop !== null ? s.convFromTop.toFixed(1) + '%' : '—' }}</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ s.convFromPrev !== null ? s.convFromPrev.toFixed(1) + '%' : '—' }}</td>
              <td class="px-4 py-3 text-right text-red-500">{{ s.dropCount > 0 ? '-' + s.dropCount.toLocaleString() : '—' }}</td>
              <td class="px-4 py-3 text-right text-red-500">{{ s.dropPct !== null ? s.dropPct.toFixed(1) + '%' : '—' }}</td>
              <td class="px-4 py-3">
                <div class="w-full bg-gray-100 rounded-full h-2">
                  <div class="bg-indigo-500 h-2 rounded-full" :style="{ width: (s.convFromTop ?? 0) + '%' }" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Objections -->
      <div v-if="report.objections.length" class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-4 border-b font-semibold text-gray-800">Типы возражений</div>
        <div class="p-5 flex flex-wrap gap-3">
          <div v-for="o in report.objections" :key="o.type"
            class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <span class="font-semibold text-red-700">{{ o.count }}</span>
            <span class="text-sm text-red-600">{{ objectionLabel(o.type) }}</span>
          </div>
        </div>
      </div>

      <!-- CTA + Day-in-day -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white rounded-xl border p-5">
          <div class="font-semibold text-gray-800 mb-4">Влияние CTA</div>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">С CTA ({{ report.ctaImpact.withCTA }})</span>
              <span class="font-semibold text-green-600">{{ report.ctaImpact.convWithCTA.toFixed(1) }}% → оплата</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Без CTA ({{ report.ctaImpact.withoutCTA }})</span>
              <span class="font-semibold text-gray-500">{{ report.ctaImpact.convWithoutCTA.toFixed(1) }}% → оплата</span>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl border p-5">
          <div class="font-semibold text-gray-800 mb-4">День в день</div>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">В тот же день ({{ report.dayInDay.yes }})</span>
              <span class="font-semibold text-green-600">{{ report.dayInDay.convYes.toFixed(1) }}% → оплата</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Позже ({{ report.dayInDay.no }})</span>
              <span class="font-semibold text-gray-500">{{ report.dayInDay.convNo.toFixed(1) }}% → оплата</span>
            </div>
          </div>
        </div>
      </div>

      <!-- By manager -->
      <div v-if="report.byManager.length" class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-4 border-b font-semibold text-gray-800">По менеджерам</div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Менеджер</th>
              <th v-for="s in stageKeys" :key="s" class="px-3 py-3 text-right">{{ s }}</th>
              <th class="px-4 py-3 text-right">conv → оплата</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in report.byManager" :key="m.key" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">{{ m.label }}</td>
              <td v-for="s in stageKeys" :key="s" class="px-3 py-3 text-right text-gray-600">
                {{ m.stageCounts[s] || 0 }}
              </td>
              <td class="px-4 py-3 text-right font-semibold">
                {{ m.convToPaid !== null ? m.convToPaid.toFixed(1) + '%' : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp } from '#app';

const { $api } = useNuxtApp() as any;

const loading = ref(false);
const error = ref('');
const report = ref<any>(null);
const from = ref('');
const to = ref('');
const managerId = ref('');

const stageKeys = ['CONTACT', 'REPLIED', 'PRICE_SHOWN', 'OBJECTION', 'REBUTTAL', 'ORDERED', 'PREPAID', 'PAID_FULL'];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params: any = {};
    if (from.value) params.from = from.value;
    if (to.value) params.to = to.value;
    if (managerId.value) params.managerId = managerId.value;
    report.value = await $api('/api/analytics/funnel', { params });
  } catch (e: any) {
    error.value = e?.data?.message ?? e.message ?? 'Ошибка загрузки';
  } finally {
    loading.value = false;
  }
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    CONTACT: 'Первый контакт', REPLIED: 'Менеджер ответил', PRICE_SHOWN: 'Цена показана',
    OBJECTION: 'Возражение', REBUTTAL: 'Отработка', ORDERED: 'Заказ', PREPAID: 'Предоплата', PAID_FULL: 'Оплата',
  };
  return map[stage] ?? stage;
}

function stageBadge(stage: string) {
  const map: Record<string, string> = {
    CONTACT: 'bg-gray-100 text-gray-600', REPLIED: 'bg-blue-100 text-blue-700',
    PRICE_SHOWN: 'bg-indigo-100 text-indigo-700', OBJECTION: 'bg-yellow-100 text-yellow-700',
    REBUTTAL: 'bg-orange-100 text-orange-700', ORDERED: 'bg-purple-100 text-purple-700',
    PREPAID: 'bg-emerald-100 text-emerald-700', PAID_FULL: 'bg-green-100 text-green-700',
  };
  return map[stage] ?? 'bg-gray-100 text-gray-600';
}

function objectionLabel(type: string) {
  const map: Record<string, string> = {
    NONE: 'Нет', EXPENSIVE: 'Дорого', THINKING: 'Подумаю', JUST_ASKING: 'Просто интересовался',
    IGNORED_AFTER_LINK: 'Пропал после ссылки', TIMING: 'Не сейчас', OTHER: 'Другое',
  };
  return map[type] ?? type;
}

onMounted(load);
</script>

<style scoped>
.input-sm { @apply border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition; }
</style>
