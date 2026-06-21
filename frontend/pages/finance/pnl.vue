<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Отчёт ПНЛ — прибыли и убытки (метод начисления)</h1>
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
      <!-- Methodology note -->
      <div class="method-note">
        <strong>Выручка признаётся при выдаче заказа в СДЭК</strong> (статус «Отправлен»), не при получении оплаты.
        Авансы, тело кредита, переводы между счетами — не влияют на прибыль ПНЛ.
      </div>

      <!-- P&L summary -->
      <div class="pnl-table-wrap">
        <table class="pnl-table">
          <tbody>
            <tr class="pnl-section-header"><td colspan="2">ВЫРУЧКА</td></tr>
            <tr>
              <td>Выручка (по выдаче)</td>
              <td class="td-num positive">{{ fmtMoney(data.revenue) }}</td>
            </tr>
            <tr v-if="data.refunds > 0">
              <td class="indent">Возвраты (−)</td>
              <td class="td-num negative">{{ fmtMoney(data.refunds) }}</td>
            </tr>
            <tr v-if="data.cdekFees > 0">
              <td class="indent">Комиссия СДЭК (−)</td>
              <td class="td-num negative">{{ fmtMoney(data.cdekFees) }}</td>
            </tr>
            <tr class="pnl-subtotal">
              <td><strong>Чистая выручка</strong></td>
              <td class="td-num"><strong :class="data.netRevenue >= 0 ? 'positive' : 'negative'">{{ fmtMoney(data.netRevenue) }}</strong></td>
            </tr>

            <tr class="pnl-section-header"><td colspan="2">РАСХОДЫ ПЕРИОДА</td></tr>
            <template v-for="g in data.opexByGroup" :key="g.group">
              <tr class="group-row">
                <td><strong>{{ g.group }}</strong></td>
                <td class="td-num negative"><strong>{{ fmtMoney(g.total) }}</strong></td>
              </tr>
              <tr v-for="cat in g.categories" :key="cat.name">
                <td class="indent">{{ cat.name }}</td>
                <td class="td-num negative">{{ fmtMoney(cat.total) }}</td>
              </tr>
            </template>
            <tr class="pnl-subtotal">
              <td><strong>Итого расходы</strong></td>
              <td class="td-num negative"><strong>{{ fmtMoney(data.opex) }}</strong></td>
            </tr>

            <tr class="pnl-result" :class="data.grossProfit >= 0 ? 'profit' : 'loss'">
              <td><strong>ЧИСТАЯ ПРИБЫЛЬ</strong></td>
              <td class="td-num"><strong>{{ fmtMoney(data.grossProfit, true) }}</strong></td>
            </tr>
            <tr class="pnl-margin">
              <td>Рентабельность</td>
              <td class="td-num">{{ data.marginPercent }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- By project -->
      <div v-if="data.byProject?.length" class="section">
        <div class="section-title">Разбивка по проектам</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Проект</th>
              <th class="td-num">Выручка</th>
              <th class="td-num">Возвраты</th>
              <th class="td-num">Ком. СДЭК</th>
              <th class="td-num">Чистая выручка</th>
              <th class="td-num">Расходы</th>
              <th class="td-num">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in data.byProject" :key="p.project">
              <td>{{ FIN_PROJECT_LABELS[p.project as FinProject] ?? p.project }}</td>
              <td class="td-num positive">{{ fmtMoney(p.revenue) }}</td>
              <td class="td-num negative">{{ p.refunds > 0 ? fmtMoney(p.refunds) : '—' }}</td>
              <td class="td-num negative">{{ p.cdekFees > 0 ? fmtMoney(p.cdekFees) : '—' }}</td>
              <td class="td-num">{{ fmtMoney(p.netRevenue) }}</td>
              <td class="td-num negative">{{ fmtMoney(p.opex) }}</td>
              <td class="td-num" :class="p.grossProfit >= 0 ? 'positive' : 'negative'">
                <strong>{{ fmtMoney(p.grossProfit, true) }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Accrual log -->
      <div class="section">
        <div class="section-title">Начисления за период (из заказов)</div>
        <div v-if="!data.accruals?.length" class="state-empty-sm">Нет начислений. Заказы переводите в статус «Отправлен» для признания выручки.</div>
        <table v-else class="data-table">
          <thead>
            <tr><th>Период</th><th>Тип</th><th>Проект</th><th>Сумма</th><th>Описание</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in data.accruals" :key="a.id">
              <td>{{ fmtMonth(a.period) }}</td>
              <td>{{ accrualTypeLabel(a.type) }}</td>
              <td>{{ FIN_PROJECT_LABELS[a.project as FinProject] ?? a.project }}</td>
              <td class="td-num" :class="a.amountKopecks >= 0 ? 'positive' : 'negative'">{{ fmtMoney(a.amountKopecks, true) }}</td>
              <td>{{ a.description ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFinance, fmtMoney, FIN_PROJECT_LABELS, type FinProject } from '~/composables/useFinance';

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
    data.value = await api.getPnl({ from: from.value, to: to.value, project: project.value || undefined });
  } catch (e) { console.error(e); } finally { loading.value = false; }
}

function fmtMonth(d: string) { return d ? new Date(d).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }) : '—'; }
function accrualTypeLabel(type: string): string {
  const m: Record<string, string> = { REVENUE: 'Выручка', OPEX: 'Расход', REFUND: 'Возврат', ADVANCE: 'Аванс', CDEK_FEE: 'Комиссия СДЭК', CDEK_RECEIVABLE: 'Дебиторка СДЭК' };
  return m[type] ?? type;
}

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 12px; }
.period-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.period-input, .period-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; font-size: 13px; }
.btn-refresh { background: #10b981; color: #fff; border: none; border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.method-note { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #1e40af; margin-bottom: 20px; }
.pnl-table-wrap { margin-bottom: 24px; max-width: 600px; }
.pnl-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13.5px; }
.pnl-table td { padding: 9px 16px; border-bottom: 1px solid #f1f5f9; }
.pnl-section-header td { background: #1e293b; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.pnl-subtotal td { background: #f8fafc; border-top: 2px solid #e2e8f0; }
.pnl-result { font-size: 16px; }
.pnl-result.profit td { background: #d1fae5; color: #065f46; }
.pnl-result.loss td { background: #fee2e2; color: #7f1d1d; }
.pnl-margin td { background: #f0fdf4; color: #166534; font-size: 13px; }
.group-row td { background: #f8fafc; }
.indent { padding-left: 28px !important; }
.td-num { text-align: right; white-space: nowrap; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.section { margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 10px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px; }
.data-table th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 9px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.data-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
.state-loading { text-align: center; padding: 40px; color: #94a3b8; }
.state-empty-sm { color: #94a3b8; font-size: 13px; padding: 12px 0; }
</style>
