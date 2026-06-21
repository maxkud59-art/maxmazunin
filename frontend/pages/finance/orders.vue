<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Заказы → ПНЛ <span v-if="total > 0" class="count-badge">{{ total }}</span></h1>
      <button class="btn-primary" @click="openCreate">+ Новый заказ</button>
    </div>

    <div class="note">
      Выручка признаётся при переводе заказа в статус <strong>«Отправлен / Выдан»</strong> (дата выдачи в СДЭК).
      Авансы и частичные оплаты — не выручка до выдачи.
    </div>

    <!-- Filters -->
    <div class="filters-row">
      <select v-model="fStatus" class="f-select" @change="load(true)">
        <option value="">Все статусы</option>
        <option v-for="(l,k) in FIN_ORDER_STATUS_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <select v-model="fProject" class="f-select" @change="load(true)">
        <option value="">Все проекты</option>
        <option v-for="(l,k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
    </div>

    <div class="table-wrap">
      <div v-if="loading && !items.length" class="state-loading">Загрузка...</div>
      <div v-else-if="!items.length" class="state-empty">Заказов нет</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Клиент / Ref</th>
            <th>Проект</th>
            <th>Сумма</th>
            <th>Аванс</th>
            <th>Ком. СДЭК</th>
            <th>Статус</th>
            <th>Дата выдачи</th>
            <th>Выручка призн.</th>
            <th>Трек-номер</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in items" :key="o.id">
            <td>{{ o.clientRef || '—' }}</td>
            <td>{{ FIN_PROJECT_LABELS[o.project as FinProject] ?? o.project }}</td>
            <td class="td-num">{{ fmtMoney(o.totalAmountKopecks) }}</td>
            <td class="td-num">{{ o.prepayKopecks > 0 ? fmtMoney(o.prepayKopecks) : '—' }}</td>
            <td class="td-num negative">{{ o.cdekFeeKopecks > 0 ? fmtMoney(o.cdekFeeKopecks) : '—' }}</td>
            <td><span class="status-badge" :class="statusBadgeClass(o.status)">{{ FIN_ORDER_STATUS_LABELS[o.status as FinOrderStatus] ?? o.status }}</span></td>
            <td>{{ o.shippedAt ? fmtDate(o.shippedAt) : '—' }}</td>
            <td><span v-if="o.revenueRecognizedAt" class="rev-yes">✓ {{ fmtDate(o.revenueRecognizedAt) }}</span><span v-else class="rev-no">—</span></td>
            <td>{{ o.cdekTrackNumber || '—' }}</td>
            <td>
              <button class="action-btn" @click="openEdit(o)">✎</button>
              <button class="action-btn danger" @click="archiveOp(o.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="pagination">
      <button :disabled="page === 0" @click="goPage(page-1)" class="pg-btn">←</button>
      <span class="pg-info">{{ page+1 }} / {{ Math.ceil(total/pageSize) }} · {{ total }}</span>
      <button :disabled="page >= Math.ceil(total/pageSize)-1" @click="goPage(page+1)" class="pg-btn">→</button>
    </div>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editing ? 'Редактировать заказ' : 'Новый заказ (ПНЛ)' }}</h2>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="!editing" class="hint-box">
            После перехода в статус «Отправлен» — выручка будет автоматически признана в ПНЛ за месяц выдачи.
          </div>
          <div class="form-grid">
            <label class="fl">Клиент / Ref</label>
            <input v-model="form.clientRef" class="fi" placeholder="ФИО, номер заказа из CRM" />

            <label class="fl">Проект</label>
            <select v-model="form.project" class="fi">
              <option v-for="(l,k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>

            <label class="fl">Сумма заказа (₽)</label>
            <input type="number" v-model="formTotal" class="fi" step="0.01" min="0" placeholder="0.00" />

            <label class="fl">Аванс (₽)</label>
            <input type="number" v-model="formPrepay" class="fi" step="0.01" min="0" placeholder="0.00" />

            <label class="fl">Комиссия СДЭК (₽)</label>
            <input type="number" v-model="formCdekFee" class="fi" step="0.01" min="0" placeholder="0.00" />

            <label class="fl">Статус</label>
            <select v-model="form.status" class="fi">
              <option v-for="(l,k) in FIN_ORDER_STATUS_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>

            <template v-if="form.status === 'SHIPPED' || form.status === 'DELIVERED'">
              <label class="fl">Дата выдачи</label>
              <input type="date" v-model="form.shippedAt" class="fi" />
            </template>

            <label class="fl">Трек-номер СДЭК</label>
            <input v-model="form.cdekTrackNumber" class="fi" placeholder="CDEKxxxxxxxx" />

            <label class="fl">Комментарий</label>
            <input v-model="form.comment" class="fi" placeholder="" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeModal">Отмена</button>
          <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFinance, fmtMoney, FIN_PROJECT_LABELS, FIN_ORDER_STATUS_LABELS, type FinProject, type FinOrderStatus } from '~/composables/useFinance';

const api = useFinance();
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = 50;
const loading = ref(false);
const fStatus = ref('');
const fProject = ref('');

const modalOpen = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref<any>(emptyForm());
const formTotal = ref('');
const formPrepay = ref('');
const formCdekFee = ref('');

function emptyForm() {
  return { clientRef: '', vkClientId: '', project: 'EASYBOOK', status: 'PREPAY', shippedAt: '', cdekTrackNumber: '', comment: '' };
}

function openCreate() { editing.value = null; form.value = emptyForm(); formTotal.value = ''; formPrepay.value = ''; formCdekFee.value = ''; modalOpen.value = true; }
function openEdit(o: any) {
  editing.value = o;
  form.value = { clientRef: o.clientRef ?? '', project: o.project, status: o.status, shippedAt: o.shippedAt?.slice(0,10) ?? '', cdekTrackNumber: o.cdekTrackNumber ?? '', comment: o.comment ?? '' };
  formTotal.value = String(o.totalAmountKopecks / 100);
  formPrepay.value = String(o.prepayKopecks / 100);
  formCdekFee.value = String(o.cdekFeeKopecks / 100);
  modalOpen.value = true;
}
function closeModal() { modalOpen.value = false; editing.value = null; }

async function save() {
  saving.value = true;
  try {
    const dto = {
      ...form.value,
      totalAmountKopecks: Math.round(parseFloat(formTotal.value || '0') * 100),
      prepayKopecks: Math.round(parseFloat(formPrepay.value || '0') * 100),
      cdekFeeKopecks: Math.round(parseFloat(formCdekFee.value || '0') * 100),
      shippedAt: form.value.shippedAt || undefined,
      cdekTrackNumber: form.value.cdekTrackNumber || undefined,
      comment: form.value.comment || undefined,
      clientRef: form.value.clientRef || undefined,
    };
    if (editing.value) await api.updateOrder(editing.value.id, dto);
    else await api.createOrder(dto);
    closeModal();
    await load();
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); } finally { saving.value = false; }
}

async function archiveOp(id: string) {
  if (!confirm('Убрать заказ в архив?')) return;
  await api.archiveOrder(id);
  await load();
}

async function load(reset = false) {
  if (reset) page.value = 0;
  loading.value = true;
  try {
    const res = await api.listOrders({ status: fStatus.value || undefined, project: fProject.value || undefined, page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } catch (e) { console.error(e); } finally { loading.value = false; }
}

function goPage(p: number) { page.value = p; load(); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('ru-RU') : '—'; }
function statusBadgeClass(s: string) {
  return { 'badge-prepay': s === 'PREPAY', 'badge-paid50': s === 'PAID_50', 'badge-shipped': s === 'SHIPPED', 'badge-delivered': s === 'DELIVERED', 'badge-refunded': s === 'REFUNDED' };
}

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.count-badge { font-size: 13px; color: #64748b; font-weight: normal; }
.btn-primary { background: #10b981; color: #fff; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #059669; }
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary { background: #e2e8f0; color: #475569; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.note { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #1e40af; margin-bottom: 16px; }
.filters-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.f-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; font-size: 13px; }
.table-wrap { overflow-x: auto; margin-bottom: 16px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px; }
.data-table th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 9px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.data-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
.td-num { text-align: right; white-space: nowrap; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.rev-yes { color: #10b981; font-size: 12px; }
.rev-no { color: #cbd5e1; }
.status-badge { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
.badge-prepay { background: #fef9c3; color: #713f12; }
.badge-paid50 { background: #dbeafe; color: #1e3a5f; }
.badge-shipped { background: #dcfce7; color: #14532d; }
.badge-delivered { background: #d1fae5; color: #065f46; }
.badge-refunded { background: #fee2e2; color: #7f1d1d; }
.action-btn { background: none; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 13px; margin-right: 4px; }
.action-btn:hover { border-color: #6366f1; color: #6366f1; }
.action-btn.danger:hover { border-color: #ef4444; color: #ef4444; }
.pagination { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 12px 0; }
.pg-btn { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.pg-btn:disabled { opacity: 0.4; }
.pg-info { font-size: 13px; color: #64748b; }
.state-loading, .state-empty { text-align: center; padding: 40px; color: #94a3b8; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 520px; max-width: 96vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px 24px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 140px 1fr; gap: 10px 12px; align-items: center; }
.fl { font-size: 13px; color: #475569; font-weight: 500; }
.fi { border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
.fi:focus { border-color: #10b981; outline: none; }
.hint-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 7px; padding: 10px 14px; font-size: 12.5px; color: #166534; margin-bottom: 16px; }
</style>
