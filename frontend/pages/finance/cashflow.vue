<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Отчёт ДДС — движение денежных средств</h1>
      <div class="period-row">
        <input type="date" v-model="from" class="period-input" @change="load" />
        <span>—</span>
        <input type="date" v-model="to" class="period-input" @change="load" />
        <select v-model="project" class="period-select" @change="load">
          <option value="">Все проекты</option>
          <option v-for="(l,k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ l }}</option>
        </select>
        <button class="btn-refresh" @click="load">Обновить</button>
      </div>
    </div>

    <div v-if="loading" class="state-loading">Загрузка...</div>
    <template v-else-if="data">
      <!-- Summary -->
      <div class="summary-row">
        <div class="sum-card income">
          <div class="sum-label">Поступления</div>
          <div class="sum-val">{{ fmtMoney(data.totalIncome) }}</div>
        </div>
        <div class="sum-card expense">
          <div class="sum-label">Расходы</div>
          <div class="sum-val">{{ fmtMoney(data.totalExpense) }}</div>
        </div>
        <div class="sum-card" :class="data.netCashFlow >= 0 ? 'positive' : 'negative'">
          <div class="sum-label">Чистый денежный поток</div>
          <div class="sum-val">{{ fmtMoney(data.netCashFlow, true) }}</div>
        </div>
      </div>

      <!-- Accounts balance -->
      <div class="section">
        <div class="section-title">Остатки по счетам (сверка)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Счёт</th><th>Тип</th><th>Начало</th><th>Поступило</th><th>Списано</th><th>Переводы +</th><th>Переводы −</th><th>Конец</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in data.accounts" :key="a.accountId">
              <td>{{ a.accountName }}</td>
              <td>{{ a.accountType }}</td>
              <td class="td-num">{{ fmtMoney(a.openingBalance) }}</td>
              <td class="td-num positive">{{ fmtMoney(a.income) }}</td>
              <td class="td-num negative">{{ fmtMoney(a.expense) }}</td>
              <td class="td-num">{{ fmtMoney(a.transferIn) }}</td>
              <td class="td-num">{{ fmtMoney(a.transferOut) }}</td>
              <td class="td-num" :class="a.closingBalance >= 0 ? 'positive' : 'negative'">
                <strong>{{ fmtMoney(a.closingBalance) }}</strong>
              </td>
            </tr>
            <tr class="totals-row">
              <td colspan="2"><strong>Итого</strong></td>
              <td class="td-num"><strong>{{ fmtMoney(totalOpening) }}</strong></td>
              <td class="td-num positive"><strong>{{ fmtMoney(data.totalIncome) }}</strong></td>
              <td class="td-num negative"><strong>{{ fmtMoney(data.totalExpense) }}</strong></td>
              <td colspan="2"></td>
              <td class="td-num" :class="totalClosing >= 0 ? 'positive' : 'negative'">
                <strong>{{ fmtMoney(totalClosing) }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Income by category -->
      <div class="section">
        <div class="section-title">Поступления по статьям</div>
        <table class="data-table">
          <thead><tr><th>Статья</th><th>Сумма</th></tr></thead>
          <tbody>
            <tr v-for="cat in incomeCats" :key="cat.name">
              <td>{{ cat.name }}</td>
              <td class="td-num positive">{{ fmtMoney(cat.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Expense by group -->
      <div class="section">
        <div class="section-title">Расходы по статьям</div>
        <table class="data-table">
          <thead><tr><th>Группа / Статья</th><th>Сумма</th></tr></thead>
          <tbody>
            <template v-for="g in expenseGroups" :key="g.group">
              <tr class="group-row">
                <td><strong>{{ g.group }}</strong></td>
                <td class="td-num negative"><strong>{{ fmtMoney(g.total) }}</strong></td>
              </tr>
              <tr v-for="cat in g.categories" :key="cat.name">
                <td class="indent">{{ cat.name }}</td>
                <td class="td-num negative">{{ fmtMoney(cat.total) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Transfers and non-P&L -->
      <div v-if="data.transferOps?.length || data.nonPnlOps?.length" class="section">
        <div class="section-title">Перемещения и нефинансовые операции (не влияют на прибыль)</div>
        <table class="data-table">
          <thead><tr><th>Дата</th><th>Тип</th><th>Счёт</th><th>Сумма</th><th>Контрагент/Комментарий</th></tr></thead>
          <tbody>
            <tr v-for="op in [...(data.transferOps ?? []), ...(data.nonPnlOps ?? [])]" :key="op.id">
              <td>{{ fmtDate(op.date) }}</td>
              <td>{{ FIN_OP_TYPE_LABELS[op.type] ?? op.type }}</td>
              <td>{{ op.accountName }}</td>
              <td class="td-num">{{ fmtMoney(op.amountKopecks, true) }}</td>
              <td>{{ op.counterparty || op.comment || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFinance, fmtMoney, FIN_PROJECT_LABELS, FIN_OP_TYPE_LABELS } from '~/composables/useFinance';

const api = useFinance();
const loading = ref(false);
const data = ref<any>(null);
const project = ref('');

const now = new Date();
const from = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
const to = ref(now.toISOString().slice(0, 10));

const incomeCats = computed(() => (data.value?.byCategory ?? []).filter((c: any) => c.type === 'income').sort((a: any, b: any) => b.total - a.total));
const expenseGroups = computed(() => {
  const cats = (data.value?.byCategory ?? []).filter((c: any) => c.type === 'expense');
  const groups = new Map<string, { group: string; total: number; categories: any[] }>();
  for (const c of cats) {
    const g = c.group ?? 'Другое';
    if (!groups.has(g)) groups.set(g, { group: g, total: 0, categories: [] });
    groups.get(g)!.total += c.total;
    groups.get(g)!.categories.push(c);
  }
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
});
const totalOpening = computed(() => (data.value?.accounts ?? []).reduce((s: number, a: any) => s + a.openingBalance, 0));
const totalClosing = computed(() => (data.value?.accounts ?? []).reduce((s: number, a: any) => s + a.closingBalance, 0));

async function load() {
  loading.value = true;
  try {
    data.value = await api.getCashflow({ from: from.value, to: to.value, project: project.value || undefined });
  } catch (e) { console.error(e); } finally { loading.value = false; }
}

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('ru-RU') : '—'; }

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 12px; }
.period-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.period-input, .period-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; font-size: 13px; }
.btn-refresh { background: #10b981; color: #fff; border: none; border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.summary-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.sum-card { background: #fff; border-radius: 10px; padding: 16px 20px; flex: 1; min-width: 160px; border-left: 4px solid #94a3b8; }
.sum-card.income { border-color: #10b981; }
.sum-card.expense { border-color: #ef4444; }
.sum-card.positive { border-color: #10b981; }
.sum-card.negative { border-color: #ef4444; }
.sum-label { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.sum-val { font-size: 20px; font-weight: 700; color: #1e293b; }
.section { margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 10px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px; }
.data-table th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 9px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.data-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
.td-num { text-align: right; white-space: nowrap; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.totals-row { background: #f8fafc; font-weight: 600; }
.group-row { background: #f8fafc; }
.indent { padding-left: 28px !important; }
.state-loading { text-align: center; padding: 40px; color: #94a3b8; }
</style>
