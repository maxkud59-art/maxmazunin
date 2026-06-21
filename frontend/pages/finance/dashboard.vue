<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Дашборд</h1>
      <div class="period-row">
        <input type="date" v-model="from" class="period-input" @change="load" />
        <span class="period-sep">—</span>
        <input type="date" v-model="to" class="period-input" @change="load" />
        <select v-model="project" class="period-select" @change="load">
          <option value="">Все проекты</option>
          <option v-for="(lbl, k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ lbl }}</option>
        </select>
        <button class="btn-refresh" @click="load">Обновить</button>
      </div>
    </div>

    <div v-if="loading" class="state-loading">Загрузка...</div>
    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card income">
          <div class="kpi-label">Поступления (ДДС)</div>
          <div class="kpi-value">{{ fmtMoneyK(data.totalIncome) }}</div>
        </div>
        <div class="kpi-card expense">
          <div class="kpi-label">Расходы (ДДС)</div>
          <div class="kpi-value">{{ fmtMoneyK(data.totalExpense) }}</div>
        </div>
        <div class="kpi-card" :class="data.netCashFlow >= 0 ? 'positive' : 'negative'">
          <div class="kpi-label">Денежный поток</div>
          <div class="kpi-value">{{ fmtMoney(data.netCashFlow, true) }}</div>
        </div>
        <div class="kpi-card revenue">
          <div class="kpi-label">Выручка (ПНЛ, по выдаче)</div>
          <div class="kpi-value">{{ fmtMoneyK(data.netRevenue) }}</div>
        </div>
        <div class="kpi-card" :class="data.grossProfit >= 0 ? 'positive' : 'negative'">
          <div class="kpi-label">Чистая прибыль (ПНЛ)</div>
          <div class="kpi-value">{{ fmtMoney(data.grossProfit, true) }}</div>
          <div class="kpi-sub">Маржа {{ data.marginPercent }}%</div>
        </div>
        <div class="kpi-card orders">
          <div class="kpi-label">Заказов отправлено</div>
          <div class="kpi-value">{{ data.ordersShipped }}</div>
        </div>
      </div>

      <!-- Account balances -->
      <div class="section">
        <div class="section-title">Остатки по счетам</div>
        <div class="accounts-row">
          <div v-for="acc in data.accounts" :key="acc.id" class="acc-card">
            <div class="acc-name">{{ acc.name }}</div>
            <div class="acc-balance" :class="acc.currentBalance >= 0 ? 'positive' : 'negative'">
              {{ fmtMoney(acc.currentBalance) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Note on methodology -->
      <div class="note">
        <strong>ДДС</strong> — кассовый метод (фактическое движение денег).
        <strong>ПНЛ</strong> — начисление: выручка признаётся при выдаче заказа в СДЭК, а не при получении оплаты.
        Авансы, переводы, тело кредита, депозиты — <em>не влияют</em> на прибыль ПНЛ.
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFinance, fmtMoney, fmtMoneyK, FIN_PROJECT_LABELS } from '~/composables/useFinance';

const api = useFinance();
const loading = ref(false);
const data = ref<any>(null);
const project = ref('');

const now = new Date();
const from = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
const to = ref(now.toISOString().slice(0, 10));

async function load() {
  loading.value = true;
  try {
    data.value = await api.getDashboard({
      from: from.value,
      to: to.value,
      project: project.value || undefined,
    });
  } catch (e) { console.error(e); } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; max-width: 1200px; }
.page-header { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.period-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.period-input { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.period-sep { color: #94a3b8; }
.period-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.btn-refresh { background: #10b981; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.btn-refresh:hover { background: #059669; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi-card {
  background: #fff; border-radius: 12px; padding: 20px;
  border-left: 4px solid #94a3b8;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.kpi-card.income { border-color: #10b981; }
.kpi-card.expense { border-color: #ef4444; }
.kpi-card.positive { border-color: #10b981; }
.kpi-card.negative { border-color: #ef4444; }
.kpi-card.revenue { border-color: #6366f1; }
.kpi-card.orders { border-color: #f59e0b; }
.kpi-label { font-size: 12px; color: #64748b; margin-bottom: 8px; }
.kpi-value { font-size: 22px; font-weight: 700; color: #1e293b; }
.kpi-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }

.section { margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 12px; }
.accounts-row { display: flex; gap: 12px; flex-wrap: wrap; }
.acc-card { background: #fff; border-radius: 10px; padding: 16px 20px; border: 1px solid #e2e8f0; min-width: 160px; }
.acc-name { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.acc-balance { font-size: 18px; font-weight: 700; }
.acc-balance.positive { color: #10b981; }
.acc-balance.negative { color: #ef4444; }

.note { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 12.5px; color: #166534; line-height: 1.6; }
.state-loading { color: #94a3b8; padding: 40px; text-align: center; }
</style>
