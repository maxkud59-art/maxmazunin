<template>
  <div class="p-6 max-w-5xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <button @click="navigateTo('/experiments')" class="text-gray-500 hover:text-gray-800 text-sm">← Назад</button>
      <h1 class="text-2xl font-bold text-gray-900 flex-1">{{ exp?.name ?? '...' }}</h1>
      <span v-if="exp" :class="statusBadge(exp.status)" class="px-3 py-1 rounded-full text-xs font-semibold">
        {{ statusLabel(exp.status) }}
      </span>
      <div class="flex gap-2">
        <button v-if="exp?.status === 'DRAFT'" @click="start" class="btn-primary text-sm">▶ Запустить</button>
        <button v-if="exp?.status === 'RUNNING'" @click="stop" class="btn-danger text-sm">⏹ Остановить</button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-gray-500">Загрузка...</div>

    <template v-else-if="exp">
      <!-- Meta -->
      <div class="bg-white rounded-xl border p-5">
        <div class="grid grid-cols-4 gap-4 text-sm">
          <div><div class="text-gray-500">Этапы</div><div class="font-semibold">{{ exp.stageFrom }} → {{ exp.stageTo }}</div></div>
          <div><div class="text-gray-500">Созревание</div><div class="font-semibold">{{ exp.maturationDays }} дн.</div></div>
          <div><div class="text-gray-500">Мин. выборка</div><div class="font-semibold">{{ exp.minSamplePerVariant }}</div></div>
          <div><div class="text-gray-500">p-порог</div><div class="font-semibold">&lt; {{ exp.pThreshold }}</div></div>
        </div>
        <div v-if="exp.hypothesis" class="mt-3 text-sm text-gray-600 italic">« {{ exp.hypothesis }} »</div>
      </div>

      <!-- Results -->
      <div v-if="results" class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-4 border-b flex items-center justify-between">
          <span class="font-semibold text-gray-800">Результаты</span>
          <span :class="results.overallSignificance === 'SIGNIFICANT' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
            class="px-3 py-1 rounded-full text-xs font-semibold">
            {{ results.overallSignificance === 'SIGNIFICANT' ? '✓ ЗНАЧИМО' : 'Недостаточно данных' }}
          </span>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Вариант</th>
              <th class="px-4 py-3 text-right">Назначено</th>
              <th class="px-4 py-3 text-right">Зрелых</th>
              <th class="px-4 py-3 text-right">Оплат</th>
              <th class="px-4 py-3 text-right">conv%</th>
              <th class="px-4 py-3 text-right">z</th>
              <th class="px-4 py-3 text-right">p-value</th>
              <th class="px-4 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in results.variants" :key="v.variantId" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3">
                <span class="font-medium">{{ v.name }}</span>
                <span v-if="v.isControl" class="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">контроль</span>
              </td>
              <td class="px-4 py-3 text-right font-mono">{{ v.nAssigned }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ v.nMatured }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ v.nPaid }}</td>
              <td class="px-4 py-3 text-right font-mono font-semibold">{{ (v.convToPaid * 100).toFixed(1) }}%</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ v.zVsControl !== null ? v.zVsControl.toFixed(3) : '—' }}</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ v.pValue !== null ? v.pValue.toFixed(4) : '—' }}</td>
              <td class="px-4 py-3 text-center">
                <span v-if="v.isControl" class="text-gray-400 text-xs">—</span>
                <span v-else-if="v.significance === 'SIGNIFICANT'"
                  class="text-green-600 text-xs font-semibold">ЗНАЧИМО</span>
                <span v-else class="text-yellow-600 text-xs">ждём</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="px-5 py-3 text-xs text-gray-400 border-t">
          Стабильный знак: {{ results.stableSignCount }} дн. из 3 требуемых
        </div>
      </div>

      <!-- Decide winner -->
      <div v-if="results?.overallSignificance === 'SIGNIFICANT' && exp.status === 'RUNNING'" class="bg-green-50 border border-green-200 rounded-xl p-5">
        <div class="font-semibold text-green-800 mb-3">Эксперимент достиг значимости</div>
        <div class="text-sm text-green-700 mb-4">Выберите победителя вручную. После решения вариант фиксируется, эксперимент переходит в DECIDED.</div>
        <div class="flex gap-3 flex-wrap">
          <button v-for="v in results.variants.filter(v => !v.isControl)" :key="v.variantId"
            @click="decide(v.variantId)"
            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium transition">
            Победитель: {{ v.name }}
          </button>
          <button @click="decide(results.variants.find(v => v.isControl)!.variantId)"
            class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm transition">
            Оставить контроль
          </button>
        </div>
      </div>

      <!-- Winner -->
      <div v-if="exp.status === 'DECIDED'" class="bg-emerald-50 border border-emerald-300 rounded-xl p-5">
        <div class="font-semibold text-emerald-800 text-lg mb-1">Победитель зафиксирован</div>
        <div class="text-sm text-emerald-700">
          {{ exp.variants.find((v: any) => v.id === exp.winnerVariantId)?.name ?? exp.winnerVariantId }}
          · {{ exp.decidedAt ? new Date(exp.decidedAt).toLocaleDateString('ru') : '' }}
        </div>
      </div>

      <!-- Snapshots -->
      <div v-if="exp.snapshots?.length" class="bg-white rounded-xl border overflow-hidden">
        <div class="px-5 py-4 border-b font-semibold text-gray-800">История снапшотов</div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Дата</th>
              <th class="px-4 py-3 text-left">Вариант</th>
              <th class="px-4 py-3 text-right">Назначено</th>
              <th class="px-4 py-3 text-right">Зрелых</th>
              <th class="px-4 py-3 text-right">conv%</th>
              <th class="px-4 py-3 text-right">z</th>
              <th class="px-4 py-3 text-right">p</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in exp.snapshots.slice(0, 30)" :key="s.id" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3">{{ new Date(s.snapshotDate).toLocaleDateString('ru') }}</td>
              <td class="px-4 py-3">{{ exp.variants.find((v: any) => v.id === s.variantId)?.name ?? s.variantId }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ s.nAssigned }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ s.nMatured }}</td>
              <td class="px-4 py-3 text-right font-mono">{{ (s.convToPaid * 100).toFixed(1) }}%</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ s.zVsControl !== null ? Number(s.zVsControl).toFixed(3) : '—' }}</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ s.pValue !== null ? Number(s.pValue).toFixed(4) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, navigateTo, useNuxtApp } from '#app';

const route = useRoute();
const { $api } = useNuxtApp() as any;
const id = route.params.id as string;

const loading = ref(false);
const exp = ref<any>(null);
const results = ref<any>(null);

async function load() {
  loading.value = true;
  try {
    [exp.value, results.value] = await Promise.all([
      $api(`/api/experiments/${id}`),
      $api(`/api/experiments/${id}/results`).catch(() => null),
    ]);
  } finally {
    loading.value = false;
  }
}

async function start() {
  await $api(`/api/experiments/${id}/start`, { method: 'POST' });
  await load();
}

async function stop() {
  if (!confirm('Остановить эксперимент?')) return;
  await $api(`/api/experiments/${id}/stop`, { method: 'POST' });
  await load();
}

async function decide(winnerVariantId: string) {
  if (!confirm('Зафиксировать победителя? Это необратимо.')) return;
  await $api(`/api/experiments/${id}/decide`, { method: 'POST', body: { winnerVariantId } });
  await load();
}

function statusBadge(s: string) {
  return { DRAFT: 'bg-gray-100 text-gray-600', RUNNING: 'bg-blue-100 text-blue-700', STOPPED: 'bg-red-100 text-red-600', DECIDED: 'bg-green-100 text-green-700' }[s] ?? 'bg-gray-100 text-gray-600';
}
function statusLabel(s: string) {
  return { DRAFT: 'Черновик', RUNNING: 'Запущен', STOPPED: 'Остановлен', DECIDED: 'Решение принято' }[s] ?? s;
}

onMounted(load);
</script>

<style scoped>
.btn-primary { @apply bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition; }
.btn-danger { @apply bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 font-medium transition; }
</style>
