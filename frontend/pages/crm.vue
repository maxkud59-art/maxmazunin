<script setup lang="ts">
import { apiInstance } from '~/composables/useApi';

definePageMeta({ middleware: ['auth'] });

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface CrmDeal {
  id: number;
  saleDate: string;
  title: string;
  price: number;
  status: string;
  source: string;
  adTag: string;
  clothingMethod: string;
  period: string;
  paid: boolean;
  reservation: boolean;
  createdAt: string;
  client: { id: number; fullName: string; phone: string } | null;
  user: { id: number; fullName: string } | null;
  group: { id: number; title: string } | null;
  workSpace: { id: number; title: string } | null;
  payments: { id: number; price: number; method: string }[];
}

interface DealsResponse {
  data: CrmDeal[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const deals = ref<CrmDeal[]>([]);
const total = ref(0);
const page = ref(1);
const pages = ref(1);
const limit = ref(50);
const loading = ref(false);
const error = ref('');

const search = ref('');
const filterStatus = ref('');
const filterGroup = ref('');
const filterWorkSpace = ref('');
const periodFrom = ref('');
const periodTo = ref('');

const statuses = ref<string[]>([]);
const groups = ref<{ id: number; title: string }[]>([]);
const workSpaces = ref<{ id: number; title: string }[]>([]);

// ─── API ──────────────────────────────────────────────────────────────────────

async function loadDeals(p = 1) {
  loading.value = true;
  error.value = '';
  page.value = p;
  try {
    const params: Record<string, string> = {
      page: String(p),
      limit: String(limit.value),
    };
    if (search.value) params.search = search.value;
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterGroup.value) params.groupId = filterGroup.value;
    if (filterWorkSpace.value) params.workSpaceId = filterWorkSpace.value;
    if (periodFrom.value) params.periodFrom = periodFrom.value;
    if (periodTo.value) params.periodTo = periodTo.value;

    const res = await apiInstance.get<DealsResponse>('/api/crm/deals', { params });
    deals.value = res.data.data;
    total.value = res.data.total;
    pages.value = res.data.pages;
  } catch (e: any) {
    error.value = e?.response?.data?.message || 'Ошибка загрузки';
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  try {
    const [s, g, w] = await Promise.all([
      apiInstance.get<string[]>('/api/crm/deals/statuses'),
      apiInstance.get<{ id: number; title: string }[]>('/api/crm/deals/groups'),
      apiInstance.get<{ id: number; title: string }[]>('/api/crm/deals/workspaces'),
    ]);
    statuses.value = s.data;
    groups.value = g.data;
    workSpaces.value = w.data;
  } catch {
    // non-critical
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paidSum(deal: CrmDeal) {
  return deal.payments.reduce((s, p) => s + p.price, 0);
}

const STATUS_COLORS: Record<string, string> = {
  'Создана': 'badge-blue',
  'Изготовление': 'badge-yellow',
  'Готов': 'badge-green',
  'Готов к отправке': 'badge-teal',
  'Отправлена': 'badge-purple',
  'Вручена': 'badge-dark-green',
};

function statusBadge(s: string) {
  return STATUS_COLORS[s] ?? 'badge-gray';
}

// ─── Search debounce ──────────────────────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadDeals(1), 400);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(() => {
  loadMeta();
  loadDeals(1);
});
</script>

<template>
  <div class="crm-page">
    <div class="crm-header">
      <h1>CRM — Сделки</h1>
      <span class="crm-total">{{ total.toLocaleString('ru') }} записей</span>
    </div>

    <!-- Фильтры -->
    <div class="crm-filters">
      <input
        v-model="search"
        class="crm-input crm-input--wide"
        placeholder="Поиск: название, клиент, телефон..."
        @input="onSearch"
      />
      <select v-model="filterStatus" class="crm-select" @change="loadDeals(1)">
        <option value="">Все статусы</option>
        <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-model="filterWorkSpace" class="crm-select" @change="loadDeals(1)">
        <option value="">Все направления</option>
        <option v-for="w in workSpaces" :key="w.id" :value="w.id">{{ w.title }}</option>
      </select>
      <select v-model="filterGroup" class="crm-select" @change="loadDeals(1)">
        <option value="">Все группы</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.title }}</option>
      </select>
      <input v-model="periodFrom" class="crm-input crm-input--month" type="month" @change="loadDeals(1)" />
      <span class="crm-dash">—</span>
      <input v-model="periodTo" class="crm-input crm-input--month" type="month" @change="loadDeals(1)" />
    </div>

    <!-- Error -->
    <div v-if="error" class="crm-error">{{ error }}</div>

    <!-- Таблица -->
    <div class="crm-table-wrap">
      <div v-if="loading" class="crm-loading">Загрузка...</div>
      <table v-else class="crm-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Дата</th>
            <th>Название / Клиент</th>
            <th>Менеджер</th>
            <th>Группа</th>
            <th class="th-right">Сумма</th>
            <th class="th-right">Оплачено</th>
            <th>Статус</th>
            <th>Источник</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="deal in deals"
            :key="deal.id"
            :class="{ 'row-canceled': ['Отменена','Отказ'].includes(deal.status), 'row-done': deal.status === 'Вручена' }"
          >
            <td class="td-id">{{ deal.id }}</td>
            <td class="td-date">{{ deal.saleDate }}</td>
            <td class="td-title">
              <div class="deal-title">{{ deal.title }}</div>
              <div v-if="deal.client" class="deal-client">
                {{ deal.client.fullName }}
                <span v-if="deal.client.phone" class="deal-phone">{{ deal.client.phone }}</span>
              </div>
            </td>
            <td class="td-user">{{ deal.user?.fullName ?? '—' }}</td>
            <td class="td-group">{{ deal.group?.title ?? '—' }}</td>
            <td class="td-price td-right">{{ deal.price.toLocaleString('ru') }} ₽</td>
            <td class="td-paid td-right">
              <span :class="paidSum(deal) >= deal.price ? 'paid-full' : 'paid-part'">
                {{ paidSum(deal).toLocaleString('ru') }} ₽
              </span>
            </td>
            <td>
              <span class="crm-badge" :class="statusBadge(deal.status)">{{ deal.status }}</span>
            </td>
            <td class="td-source">{{ deal.source }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Пагинация -->
    <div class="crm-pagination">
      <button class="crm-btn" :disabled="page <= 1" @click="loadDeals(page - 1)">← Назад</button>
      <span class="crm-page-info">{{ page }} / {{ pages }}</span>
      <button class="crm-btn" :disabled="page >= pages" @click="loadDeals(page + 1)">Вперёд →</button>
      <select v-model.number="limit" class="crm-select crm-select--sm" @change="loadDeals(1)">
        <option :value="25">25</option>
        <option :value="50">50</option>
        <option :value="100">100</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.crm-page { padding: 24px; max-width: 1600px; margin: 0 auto; }

.crm-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
.crm-header h1 { font-size: 20px; font-weight: 700; }
.crm-total { color: #888; font-size: 13px; }

.crm-filters {
  display: flex; flex-wrap: wrap; gap: 8px;
  align-items: center; margin-bottom: 14px;
}
.crm-input {
  padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; outline: none; background: #fff;
}
.crm-input--wide { min-width: 280px; flex: 1; max-width: 400px; }
.crm-input--month { width: 130px; }
.crm-dash { color: #aaa; }

.crm-select {
  padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; background: #fff; cursor: pointer;
}
.crm-select--sm { width: 70px; }

.crm-error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }

.crm-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
.crm-loading { padding: 40px; text-align: center; color: #999; }

.crm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.crm-table th {
  padding: 10px 12px; text-align: left; background: #f8fafc;
  border-bottom: 2px solid #e2e8f0; font-weight: 600; color: #64748b;
  white-space: nowrap; position: sticky; top: 0; z-index: 1;
}
.th-right { text-align: right; }
.crm-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.crm-table tr:last-child td { border-bottom: none; }
.crm-table tr:hover td { background: #f8fafc; }

.row-canceled td { color: #94a3b8; }
.row-done { background: #f0fdf4; }
.row-done td { background: transparent; }

.td-id { color: #94a3b8; font-size: 11px; white-space: nowrap; }
.td-date { white-space: nowrap; color: #64748b; }
.td-title { min-width: 180px; max-width: 260px; }
.deal-title { font-weight: 500; }
.deal-client { color: #64748b; font-size: 12px; margin-top: 2px; }
.deal-phone { color: #94a3b8; margin-left: 6px; }
.td-user, .td-group { white-space: nowrap; color: #64748b; }
.td-right { text-align: right; }
.td-price { font-weight: 600; white-space: nowrap; }
.td-paid { white-space: nowrap; }
.td-source { color: #64748b; white-space: nowrap; }

.paid-full { color: #16a34a; font-weight: 500; }
.paid-part { color: #ea580c; }

.crm-badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 500; white-space: nowrap;
}
.badge-blue { background: #dbeafe; color: #1d4ed8; }
.badge-yellow { background: #fef9c3; color: #92400e; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-teal { background: #ccfbf1; color: #0f766e; }
.badge-purple { background: #ede9fe; color: #5b21b6; }
.badge-dark-green { background: #bbf7d0; color: #14532d; }
.badge-gray { background: #f1f5f9; color: #64748b; }

.crm-pagination {
  display: flex; align-items: center; gap: 10px;
  justify-content: center; margin-top: 16px;
}
.crm-btn {
  padding: 6px 14px; border: 1px solid #e2e8f0; border-radius: 6px;
  background: #fff; cursor: pointer; font-size: 13px;
}
.crm-btn:disabled { opacity: 0.4; cursor: default; }
.crm-btn:not(:disabled):hover { background: #f8fafc; }
.crm-page-info { font-size: 13px; color: #64748b; }
</style>
