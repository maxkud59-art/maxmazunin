<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Заказы</h1>
      <span class="tab-count" v-if="total > 0">{{ total }}</span>
      <button class="btn-create" @click="openCreate">+ Создать заказ</button>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <select v-model="filterStatus" class="filter-select" @change="load(true)">
        <option value="">Все статусы</option>
        <option v-for="s in orderStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <input v-model="filterClient" class="filter-input" placeholder="Фильтр по клиенту (ID)..." @input="onFilterInput" />
      <input v-model="dateFrom" type="date" class="filter-input-sm" @change="load(true)" />
      <input v-model="dateTo" type="date" class="filter-input-sm" @change="load(true)" />
      <div class="page-size-group">
        <label class="page-size-label">По:</label>
        <select v-model="pageSize" class="filter-select-sm" @change="load(true)">
          <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <div v-if="loading && !items.length" class="state-loading"><span class="spinner"></span> Загрузка...</div>
      <div v-else-if="!loading && !items.length" class="state-empty">
        <div class="state-icon">📦</div>
        <div>Заказов нет. Создайте первый заказ.</div>
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Клиент</th>
            <th>Статус</th>
            <th>Сумма</th>
            <th>Позиции</th>
            <th>Дата</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in items" :key="o.id" class="table-row" @click="openEdit(o)">
            <td class="td-num">#{{ o.number }}</td>
            <td class="td-client">{{ o.clientName }}</td>
            <td>
              <span v-if="o.orderStatus" class="status-chip" :style="{ background: o.orderStatus.color + '22', color: o.orderStatus.color, borderColor: o.orderStatus.color + '66' }">{{ o.orderStatus.name }}</span>
              <span v-else class="td-empty">—</span>
            </td>
            <td class="td-amount">{{ o.amount != null ? formatAmount(o.amount) + ' ₽' : '—' }}</td>
            <td class="td-items">{{ o.items ?? '—' }}</td>
            <td class="td-date">{{ fmtDate(o.createdAt) }}</td>
            <td @click.stop>
              <button class="action-btn" @click="openEdit(o)">Ред.</button>
              <button class="action-btn-danger" @click="confirmArchive(o)">Архив</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="pagination">
      <button class="pg-btn" :disabled="page === 0" @click="goPage(page - 1)">← Пред</button>
      <span class="pg-info">Стр. {{ page + 1 }} из {{ totalPages }}</span>
      <button class="pg-btn" :disabled="page >= totalPages - 1" @click="goPage(page + 1)">След →</button>
    </div>

    <!-- Order modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ editId ? 'Редактировать заказ' : 'Новый заказ' }}</h3>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="formError" class="form-error">{{ formError }}</div>
          <div class="form-grid">
            <label class="form-label">Клиент *</label>
            <div class="client-search-wrap">
              <input v-model="clientSearch" class="form-input" placeholder="Поиск клиента..." @input="searchClients" />
              <div v-if="clientResults.length" class="client-dropdown">
                <div v-for="c in clientResults" :key="c.id" class="client-option" @click="selectClient(c)">
                  {{ c.clientName || c.fio || `ID ${c.peerId}` }}
                </div>
              </div>
              <div v-if="selectedClient" class="selected-client">
                ✓ {{ selectedClient.clientName || selectedClient.fio || `ID ${selectedClient.peerId}` }}
                <button @click="clearClient">✕</button>
              </div>
            </div>

            <label class="form-label">Статус</label>
            <select v-model="form.orderStatusId" class="form-input">
              <option value="">— нет —</option>
              <option v-for="s in orderStatuses.filter(x => !x.archived)" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>

            <label class="form-label">Сумма (₽)</label>
            <input v-model.number="form.amount" type="number" class="form-input" placeholder="0" />

            <label class="form-label">Позиции</label>
            <input v-model="form.items" class="form-input" placeholder="Напр.: Фотокнига 20x20, 1 шт." />

            <label class="form-label">Комментарий</label>
            <textarea v-model="form.comment" class="form-textarea" rows="3" placeholder="Доп. информация..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeModal">Отмена</button>
          <button class="btn-primary" :disabled="saving" @click="saveOrder">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Order, OrderStatus } from '~/composables/useAssistantModule';

const api = useAssistantModule();

const items = ref<Order[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = ref(30);
const loading = ref(false);
const filterStatus = ref('');
const filterClient = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const filterInputDebounce = ref<any>(null);

const orderStatuses = ref<OrderStatus[]>([]);

const modalOpen = ref(false);
const editId = ref<string | null>(null);
const form = ref<any>({});
const saving = ref(false);
const formError = ref('');
const clientSearch = ref('');
const clientResults = ref<any[]>([]);
const selectedClient = ref<any>(null);
const clientSearchDebounce = ref<any>(null);

const PAGE_SIZES = [30, 50, 100, 500, 1000];
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

onMounted(async () => {
  orderStatuses.value = await api.listOrderStatuses();
  await load(true);
});

async function load(reset = false) {
  if (reset) page.value = 0;
  loading.value = true;
  try {
    const res = await api.listOrders({
      page: page.value, pageSize: pageSize.value,
      orderStatusId: filterStatus.value || undefined,
      clientId: filterClient.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
    });
    items.value = res.items;
    total.value = res.total;
  } catch { /* silent */ } finally { loading.value = false; }
}

function onFilterInput() {
  if (filterInputDebounce.value) clearTimeout(filterInputDebounce.value);
  filterInputDebounce.value = setTimeout(() => load(true), 500);
}

function goPage(p: number) { page.value = p; load(); }

function openCreate() {
  editId.value = null;
  form.value = { orderStatusId: '', amount: null, items: '', comment: '' };
  selectedClient.value = null;
  clientSearch.value = '';
  clientResults.value = [];
  formError.value = '';
  modalOpen.value = true;
}

function openEdit(o: Order) {
  editId.value = o.id;
  form.value = {
    orderStatusId: o.orderStatus?.id ?? '',
    amount: o.amount,
    items: o.items ?? '',
    comment: o.comment ?? '',
  };
  selectedClient.value = o.client ?? { id: o.clientId, clientName: o.clientName };
  clientSearch.value = o.clientName;
  clientResults.value = [];
  formError.value = '';
  modalOpen.value = true;
}

function closeModal() { modalOpen.value = false; }

async function searchClients() {
  if (clientSearchDebounce.value) clearTimeout(clientSearchDebounce.value);
  clientSearchDebounce.value = setTimeout(async () => {
    if (!clientSearch.value.trim()) { clientResults.value = []; return; }
    try {
      const res = await api.listClients({ search: clientSearch.value, pageSize: 10 });
      clientResults.value = res.items;
    } catch { clientResults.value = []; }
  }, 300);
}

function selectClient(c: any) { selectedClient.value = c; clientSearch.value = c.clientName || c.fio || `ID ${c.peerId}`; clientResults.value = []; }
function clearClient() { selectedClient.value = null; clientSearch.value = ''; }

async function saveOrder() {
  formError.value = '';
  if (!selectedClient.value && !editId.value) { formError.value = 'Выберите клиента'; return; }
  saving.value = true;
  try {
    const data: any = {
      orderStatusId: form.value.orderStatusId || null,
      amount: form.value.amount ?? null,
      items: form.value.items || null,
      comment: form.value.comment || null,
    };
    if (!editId.value) data.clientId = selectedClient.value.id;
    if (editId.value) {
      await api.updateOrder(editId.value, data);
    } else {
      await api.createOrder(data);
    }
    closeModal();
    await load(true);
  } catch (e: any) {
    formError.value = e?.data?.message ?? 'Ошибка сохранения';
  } finally { saving.value = false; }
}

async function confirmArchive(o: Order) {
  if (!confirm(`Архивировать заказ #${o.number}?`)) return;
  await api.archiveOrder(o.id).catch(() => {});
  await load();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatAmount(n: number) { return n.toLocaleString('ru-RU'); }
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }
.tab-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px; flex-shrink: 0; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.tab-count { background: #f59e0b; color: #fff; border-radius: 99px; font-size: 12px; padding: 2px 8px; font-weight: 600; }
.btn-create { margin-left: auto; background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-create:hover { background: #4f46e5; }

.filter-bar { display: flex; gap: 8px; padding: 8px 20px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }
.filter-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; min-width: 160px; }
.filter-input:focus { border-color: #6366f1; }
.filter-input-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; }
.filter-select { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; background: #fff; }
.filter-select-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 5px 8px; font-size: 12px; background: #fff; }
.page-size-group { display: flex; align-items: center; gap: 6px; }
.page-size-label { font-size: 12px; color: #64748b; }

.table-wrap { flex: 1; overflow: auto; padding: 0 20px 16px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 700px; }
.data-table th { background: #f8fafc; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.data-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }
.table-row { cursor: pointer; transition: background 0.15s; }
.table-row:hover { background: #f5f7ff; }

.td-num { font-weight: 700; color: #6366f1; }
.td-client { font-weight: 600; }
.td-amount { font-weight: 600; }
.td-items { color: #64748b; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-date { white-space: nowrap; color: #64748b; }
.td-empty { color: #cbd5e1; }

.status-chip { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; border: 1px solid; }

.action-btn { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-right: 4px; }
.action-btn:hover { background: #dbeafe; }
.action-btn-danger { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.action-btn-danger:hover { background: #fee2e2; }

.pagination { display: flex; align-items: center; gap: 12px; padding: 10px 20px; flex-shrink: 0; }
.pg-btn { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-info { font-size: 13px; color: #64748b; }

.state-loading, .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.state-icon { font-size: 48px; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 500px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.form-error { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
.form-grid { display: grid; grid-template-columns: 100px 1fr; gap: 10px 14px; align-items: start; }
.form-label { font-size: 12px; color: #64748b; font-weight: 500; padding-top: 8px; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
.client-search-wrap { position: relative; }
.client-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; max-height: 160px; overflow-y: auto; }
.client-option { padding: 8px 12px; font-size: 13px; cursor: pointer; }
.client-option:hover { background: #f5f7ff; }
.selected-client { margin-top: 6px; font-size: 12px; color: #059669; display: flex; align-items: center; gap: 6px; }
.selected-client button { background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 12px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
