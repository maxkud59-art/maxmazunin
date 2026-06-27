<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useNuxtApp } from '#app';

const { $api } = useNuxtApp() as any;

// ── Состояние ──────────────────────────────────────────────────────────────
const tab = ref<'queue' | 'analytics' | 'forecast' | 'anomalies' | 'rules'>('queue');

// Очередь
const queue = ref<any[]>([]);
const queueLoading = ref(false);
const batchRunning = ref(false);
const batchResult = ref<any>(null);
const suggestions = ref<Record<string, any>>({});

// Аналитика
const summaryFrom = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
const summaryTo = ref(new Date().toISOString().slice(0, 10));
const summaryProject = ref('');
const summary = ref<any>(null);
const summaryLoading = ref(false);

// Прогноз
const horizonDays = ref(60);
const cashflow = ref<any>(null);
const pnl = ref<any>(null);
const forecastLoading = ref(false);

// Аномалии
const anomalies = ref<any[]>([]);
const anomaliesLoading = ref(false);

// Правила
const rules = ref<any[]>([]);
const rulesLoading = ref(false);

// ── Загрузка ───────────────────────────────────────────────────────────────
async function loadQueue() {
  queueLoading.value = true;
  try {
    queue.value = await $api('/api/finance/ai/operations/uncategorized', { params: { limit: 30 } });
  } catch (e: any) {
    console.error(e);
  } finally {
    queueLoading.value = false;
  }
}

async function classifyOne(id: string) {
  try {
    const res = await $api(`/api/finance/ai/operations/${id}/classify`, { method: 'POST' });
    suggestions.value = { ...suggestions.value, [id]: res };
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка классификации');
  }
}

async function runBatch() {
  batchRunning.value = true;
  try {
    batchResult.value = await $api('/api/finance/ai/operations/classify-batch', { method: 'POST', params: { limit: 30 } });
    await loadQueue();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка');
  } finally {
    batchRunning.value = false;
  }
}

async function confirm(suggId: string, opId: string) {
  try {
    await $api(`/api/finance/ai/suggestions/${suggId}/confirm`, { method: 'POST' });
    const newSugg = { ...suggestions.value };
    delete newSugg[opId];
    suggestions.value = newSugg;
    queue.value = queue.value.filter(o => o.id !== opId);
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка подтверждения');
  }
}

async function reject(suggId: string, opId: string) {
  try {
    await $api(`/api/finance/ai/suggestions/${suggId}/reject`, { method: 'POST' });
    const newSugg = { ...suggestions.value };
    delete newSugg[opId];
    suggestions.value = newSugg;
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка');
  }
}

async function loadSummary() {
  summaryLoading.value = true;
  try {
    summary.value = await $api('/api/finance/ai/insights/summary', {
      method: 'POST',
      body: { from: summaryFrom.value, to: summaryTo.value, project: summaryProject.value || undefined },
    });
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка аналитики');
  } finally {
    summaryLoading.value = false;
  }
}

async function loadForecast() {
  forecastLoading.value = true;
  try {
    const [cf, pf] = await Promise.all([
      $api('/api/finance/ai/insights/cashflow-forecast', { method: 'POST', body: { horizonDays: horizonDays.value } }),
      $api('/api/finance/ai/insights/pnl-forecast', { method: 'POST', body: { horizonDays: horizonDays.value } }),
    ]);
    cashflow.value = cf;
    pnl.value = pf;
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка прогноза');
  } finally {
    forecastLoading.value = false;
  }
}

async function loadAnomalies() {
  anomaliesLoading.value = true;
  try {
    anomalies.value = await $api('/api/finance/ai/anomalies');
  } catch { } finally {
    anomaliesLoading.value = false;
  }
}

async function loadRules() {
  rulesLoading.value = true;
  try {
    rules.value = await $api('/api/finance/ai/rules');
  } catch { } finally {
    rulesLoading.value = false;
  }
}

function effectBadge(e: string) {
  const m: Record<string, string> = {
    DDS_AND_PNL: 'bg-green-100 text-green-700',
    DDS_ONLY: 'bg-blue-100 text-blue-700',
    NEUTRAL: 'bg-gray-100 text-gray-500',
  };
  return m[e] ?? 'bg-gray-100 text-gray-500';
}

function severityBadge(s: string) {
  const m: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-500' };
  return m[s] ?? 'bg-gray-100 text-gray-500';
}

function fmtRub(kopecks: number) {
  return (kopecks / 100).toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽';
}

function fmtRubDirect(rub: number) {
  return rub.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

onMounted(() => { loadQueue(); loadAnomalies(); });
</script>

<template>
  <div class="p-5 space-y-4 min-h-full">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-900">AI-финансист</h1>
      <p class="text-xs text-gray-400">Прогнозы — оценочные данные, не финансовая рекомендация</p>
    </div>

    <!-- Вкладки -->
    <div class="flex gap-1 border-b">
      <button v-for="t in [
        { id: 'queue', label: `Очередь (${queue.length})` },
        { id: 'analytics', label: 'Аналитика' },
        { id: 'forecast', label: 'Прогноз' },
        { id: 'anomalies', label: `Аномалии (${anomalies.length})` },
        { id: 'rules', label: 'Правила' },
      ]" :key="t.id"
        @click="tab = t.id as any; if(t.id==='rules') loadRules();"
        :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition', tab===t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700']"
      >{{ t.label }}</button>
    </div>

    <!-- ── Очередь ─────────────────────────────────────────────────────────── -->
    <div v-if="tab==='queue'" class="space-y-3">
      <div class="flex items-center gap-3">
        <button @click="runBatch" :disabled="batchRunning"
          class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {{ batchRunning ? '...' : '⚡ Пакетная классификация (30 оп.)' }}
        </button>
        <button @click="loadQueue" class="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Обновить</button>
        <span v-if="batchResult" class="text-sm text-gray-600">
          Обработано: {{ batchResult.processed }} · Авто: {{ batchResult.autoApplied }} · Предложено: {{ batchResult.proposed }}
        </span>
      </div>

      <div v-if="queueLoading" class="text-center py-10 text-gray-400">Загрузка...</div>
      <div v-else-if="!queue.length" class="text-center py-10 text-gray-400">Нет незакатегоризированных операций</div>

      <div v-for="op in queue" :key="op.id" class="bg-white rounded-xl border p-4 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-medium text-sm text-gray-900">{{ op.counterparty || '—' }}</div>
            <div class="text-xs text-gray-500">{{ fmtDate(op.date) }} · {{ op.account?.name }}</div>
            <div v-if="op.comment" class="text-xs text-gray-400 mt-0.5">{{ op.comment }}</div>
          </div>
          <div class="text-right shrink-0">
            <div :class="['font-mono font-bold', op.amountKopecks >= 0 ? 'text-green-700' : 'text-red-700']">
              {{ op.amountKopecks >= 0 ? '+' : '' }}{{ fmtRub(op.amountKopecks) }}
            </div>
            <div class="text-xs text-gray-400">{{ op.type }}</div>
          </div>
        </div>

        <!-- Предложение AI -->
        <div v-if="suggestions[op.id]" class="rounded-lg border bg-blue-50 border-blue-100 p-3 space-y-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-blue-700">AI предлагает</span>
            <span v-if="suggestions[op.id].effect" :class="['text-xs px-2 py-0.5 rounded font-medium', effectBadge(suggestions[op.id].effect)]">
              {{ suggestions[op.id].effect }}
            </span>
            <span v-if="suggestions[op.id].confidence !== null" class="text-xs text-gray-500">
              уверенность {{ (suggestions[op.id].confidence * 100).toFixed(0) }}%
            </span>
            <span v-if="suggestions[op.id].autoApplied" class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
              Авто-применено
            </span>
          </div>
          <p v-if="suggestions[op.id].rationale" class="text-xs text-gray-700 italic">{{ suggestions[op.id].rationale }}</p>
          <div v-if="!suggestions[op.id].autoApplied && suggestions[op.id].status === 'PROPOSED'" class="flex gap-2">
            <button @click="confirm(suggestions[op.id].id, op.id)"
              class="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
              Принять + запомнить
            </button>
            <button @click="reject(suggestions[op.id].id, op.id)"
              class="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Отклонить
            </button>
          </div>
        </div>

        <button v-else @click="classifyOne(op.id)"
          class="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">
          ✨ Классифицировать
        </button>
      </div>
    </div>

    <!-- ── Аналитика ─────────────────────────────────────────────────────── -->
    <div v-else-if="tab==='analytics'" class="space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <input v-model="summaryFrom" type="date" class="border rounded-lg px-3 py-1.5 text-sm" />
        <span class="text-gray-400">—</span>
        <input v-model="summaryTo" type="date" class="border rounded-lg px-3 py-1.5 text-sm" />
        <select v-model="summaryProject" class="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">Все проекты</option>
          <option v-for="p in ['EASYBOOK','EASYNEON','IZIBANYA','GENERAL']" :key="p" :value="p">{{ p }}</option>
        </select>
        <button @click="loadSummary" :disabled="summaryLoading"
          class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {{ summaryLoading ? '...' : 'Рассчитать' }}
        </button>
      </div>

      <div v-if="summary" class="space-y-4">
        <!-- ДДС -->
        <div class="bg-white rounded-xl border p-4">
          <div class="font-semibold text-gray-800 mb-3">ДДС (кассовый метод)</div>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-green-50 p-3">
              <div class="text-xs text-gray-500">Поступления</div>
              <div class="font-bold text-green-700 text-lg">{{ fmtRubDirect(summary.dds.totalIncomeRub) }}</div>
            </div>
            <div class="rounded-lg bg-red-50 p-3">
              <div class="text-xs text-gray-500">Расходы</div>
              <div class="font-bold text-red-700 text-lg">{{ fmtRubDirect(summary.dds.totalExpenseRub) }}</div>
            </div>
            <div :class="['rounded-lg p-3', summary.dds.netCashFlowRub >= 0 ? 'bg-emerald-50' : 'bg-orange-50']">
              <div class="text-xs text-gray-500">Денежный поток</div>
              <div :class="['font-bold text-lg', summary.dds.netCashFlowRub >= 0 ? 'text-emerald-700' : 'text-orange-700']">
                {{ summary.dds.netCashFlowRub >= 0 ? '+' : '' }}{{ fmtRubDirect(summary.dds.netCashFlowRub) }}
              </div>
            </div>
          </div>
        </div>

        <!-- ПНЛ -->
        <div class="bg-white rounded-xl border p-4">
          <div class="font-semibold text-gray-800 mb-3">ПНЛ (начисление, по выдаче)</div>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-blue-50 p-3">
              <div class="text-xs text-gray-500">Выручка (по выдаче)</div>
              <div class="font-bold text-blue-700 text-lg">{{ fmtRubDirect(summary.pnl.netRevenueRub) }}</div>
            </div>
            <div class="rounded-lg bg-red-50 p-3">
              <div class="text-xs text-gray-500">Расходы (ПНЛ)</div>
              <div class="font-bold text-red-700 text-lg">{{ fmtRubDirect(summary.pnl.pnlOpexRub) }}</div>
            </div>
            <div :class="['rounded-lg p-3', summary.pnl.grossProfitRub >= 0 ? 'bg-emerald-50' : 'bg-orange-50']">
              <div class="text-xs text-gray-500">Прибыль</div>
              <div :class="['font-bold text-lg', summary.pnl.grossProfitRub >= 0 ? 'text-emerald-700' : 'text-orange-700']">
                {{ fmtRubDirect(summary.pnl.grossProfitRub) }}
              </div>
              <div class="text-xs text-gray-500">маржа {{ summary.pnl.marginPercent }}%</div>
            </div>
          </div>
        </div>

        <!-- Топ категории -->
        <div v-if="summary.topCategories?.length" class="bg-white rounded-xl border p-4">
          <div class="font-semibold text-gray-800 mb-3">Топ статьи</div>
          <div v-for="c in summary.topCategories" :key="c.name" class="flex items-center justify-between py-1.5 border-b last:border-0">
            <span class="text-sm text-gray-700">{{ c.name }}</span>
            <span class="text-sm font-medium text-gray-900">{{ fmtRubDirect(c.totalRub) }}</span>
          </div>
        </div>

        <!-- AI-комментарий -->
        <div v-if="summary.commentary" class="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
          <div class="text-xs font-semibold text-indigo-700 mb-1">AI-комментарий</div>
          <p class="text-sm text-gray-700">{{ summary.commentary }}</p>
        </div>
      </div>
    </div>

    <!-- ── Прогноз ─────────────────────────────────────────────────────────── -->
    <div v-else-if="tab==='forecast'" class="space-y-4">
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        ⚠️ Данные носят оценочный характер. Прогноз строится по историческим средним и данным пайплайна. Не является финансовой рекомендацией.
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-700">Горизонт:</label>
        <input v-model.number="horizonDays" type="number" min="7" max="365" class="border rounded-lg px-3 py-1.5 text-sm w-24" />
        <span class="text-sm text-gray-500">дней</span>
        <button @click="loadForecast" :disabled="forecastLoading"
          class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {{ forecastLoading ? '...' : 'Построить прогноз' }}
        </button>
      </div>

      <div v-if="cashflow" class="space-y-3">
        <div class="bg-white rounded-xl border p-4">
          <div class="font-semibold text-gray-800 mb-3">Прогноз денежного потока (по неделям)</div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="text-gray-500 border-b">
                <tr>
                  <th class="py-2 text-left">Неделя</th>
                  <th class="py-2 text-right">Доход</th>
                  <th class="py-2 text-right">Расход</th>
                  <th class="py-2 text-right">Поток</th>
                  <th class="py-2 text-right">Опт.</th>
                  <th class="py-2 text-right">Пессим.</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="w in cashflow.weeklyForecast?.slice(0,8)" :key="w.weekStart" class="border-b">
                  <td class="py-1.5">{{ fmtDate(w.weekStart) }}</td>
                  <td class="py-1.5 text-right text-green-700">+{{ fmtRubDirect(w.expectedIncomeRub) }}</td>
                  <td class="py-1.5 text-right text-red-700">-{{ fmtRubDirect(w.expectedExpenseRub) }}</td>
                  <td :class="['py-1.5 text-right font-medium', w.netRub >= 0 ? 'text-emerald-700' : 'text-orange-700']">
                    {{ w.netRub >= 0 ? '+' : '' }}{{ fmtRubDirect(w.netRub) }}
                  </td>
                  <td class="py-1.5 text-right text-gray-400">{{ fmtRubDirect(w.optimisticNetRub) }}</td>
                  <td class="py-1.5 text-right text-gray-400">{{ fmtRubDirect(w.pessimisticNetRub) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="cashflow.commentary" class="mt-3 bg-indigo-50 rounded-lg p-3 text-xs text-gray-700">{{ cashflow.commentary }}</div>
          <div class="mt-3">
            <div class="text-xs font-semibold text-gray-500 mb-1">Допущения:</div>
            <ul class="text-xs text-gray-500 list-disc list-inside space-y-0.5">
              <li v-for="a in cashflow.assumptions" :key="a">{{ a }}</li>
            </ul>
          </div>
        </div>

        <!-- ПНЛ-прогноз -->
        <div v-if="pnl" class="bg-white rounded-xl border p-4">
          <div class="font-semibold text-gray-800 mb-3">Прогноз ПНЛ по пайплайну</div>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div class="rounded-lg bg-blue-50 p-3">
              <div class="text-xs text-gray-500">Заказов в пайплайне</div>
              <div class="font-bold text-blue-700 text-lg">{{ pnl.pipelineOrdersCount }}</div>
            </div>
            <div class="rounded-lg bg-green-50 p-3">
              <div class="text-xs text-gray-500">Ожидаемая выручка</div>
              <div class="font-bold text-green-700 text-lg">{{ fmtRubDirect(pnl.expectedRevenueRub) }}</div>
            </div>
            <div :class="['rounded-lg p-3', pnl.expectedProfitRub >= 0 ? 'bg-emerald-50' : 'bg-red-50']">
              <div class="text-xs text-gray-500">Прогноз прибыли</div>
              <div :class="['font-bold text-lg', pnl.expectedProfitRub >= 0 ? 'text-emerald-700' : 'text-red-700']">
                {{ fmtRubDirect(pnl.expectedProfitRub) }}
              </div>
            </div>
          </div>
          <div v-if="pnl.commentary" class="bg-indigo-50 rounded-lg p-3 text-xs text-gray-700 mb-2">{{ pnl.commentary }}</div>
          <ul class="text-xs text-gray-500 list-disc list-inside space-y-0.5">
            <li v-for="a in pnl.assumptions" :key="a">{{ a }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- ── Аномалии ─────────────────────────────────────────────────────── -->
    <div v-else-if="tab==='anomalies'" class="space-y-3">
      <div class="flex items-center gap-3">
        <button @click="loadAnomalies" :disabled="anomaliesLoading" class="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {{ anomaliesLoading ? '...' : 'Обновить' }}
        </button>
      </div>

      <div v-if="!anomalies.length" class="text-center py-10 text-gray-400">Аномалий не обнаружено</div>

      <div v-for="a in anomalies" :key="a.description" class="bg-white rounded-xl border p-4 space-y-2">
        <div class="flex items-center gap-2">
          <span :class="['px-2 py-0.5 rounded text-xs font-semibold', severityBadge(a.severity)]">{{ a.severity }}</span>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">{{ a.kind }}</span>
        </div>
        <p class="text-sm text-gray-800">{{ a.description }}</p>
        <p v-if="a.operationIds?.length" class="text-xs text-gray-400 font-mono">IDs: {{ a.operationIds.slice(0,2).join(', ') }}</p>
      </div>
    </div>

    <!-- ── Правила ─────────────────────────────────────────────────────── -->
    <div v-else-if="tab==='rules'" class="space-y-3">
      <div v-if="rulesLoading" class="text-center py-10 text-gray-400">Загрузка...</div>
      <div v-else-if="!rules.length" class="text-center py-10 text-gray-400">Нет правил</div>
      <div class="bg-white rounded-xl border overflow-hidden">
        <table v-if="rules.length" class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Тип матча</th>
              <th class="px-4 py-3 text-left">Паттерн</th>
              <th class="px-4 py-3 text-left">Эффект</th>
              <th class="px-4 py-3 text-right">Срабатываний</th>
              <th class="px-4 py-3 text-right">Уверенность</th>
              <th class="px-4 py-3 text-left">Источник</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rules" :key="r.id" class="border-t hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-xs text-gray-600">{{ r.matchType }}</td>
              <td class="px-4 py-3 font-medium text-gray-900">{{ r.pattern }}</td>
              <td class="px-4 py-3">
                <span :class="['px-2 py-0.5 rounded text-xs font-medium', effectBadge(r.effect)]">{{ r.effect }}</span>
              </td>
              <td class="px-4 py-3 text-right font-mono">{{ r.hitCount }}</td>
              <td class="px-4 py-3 text-right text-gray-600">{{ (r.confidence * 100).toFixed(0) }}%</td>
              <td class="px-4 py-3 text-xs text-gray-500">{{ r.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
