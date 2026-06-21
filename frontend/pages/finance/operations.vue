<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Операции <span v-if="total > 0" class="count-badge">{{ total }}</span></h1>
      <button class="btn-primary" @click="openCreate">+ Добавить операцию</button>
    </div>

    <!-- Filters -->
    <div class="filters-row">
      <input type="date" v-model="fFrom" class="f-input" placeholder="С" />
      <input type="date" v-model="fTo" class="f-input" placeholder="По" />
      <select v-model="fAccount" class="f-select">
        <option value="">Все счета</option>
        <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model="fProject" class="f-select">
        <option value="">Все проекты</option>
        <option v-for="(l,k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <select v-model="fType" class="f-select">
        <option value="">Все типы</option>
        <option v-for="(l,k) in FIN_OP_TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <input v-model="fSearch" class="f-input" placeholder="Контрагент/Комментарий" style="min-width:160px" />
      <button class="btn-apply" @click="load(true)">Найти</button>
      <button class="btn-reset" @click="resetFilters">Сбросить</button>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <div v-if="loading && !items.length" class="state-loading">Загрузка...</div>
      <div v-else-if="!items.length && !loading" class="state-empty">Операций нет. Добавьте первую.</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Счёт</th>
            <th>Сумма</th>
            <th>Статья</th>
            <th>Проект</th>
            <th>Контрагент</th>
            <th>Комментарий</th>
            <th>P&L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="op in items" :key="op.id" :class="rowClass(op)">
            <td class="td-date">{{ fmtDate(op.date) }}</td>
            <td><span class="type-badge" :class="typeBadgeClass(op.type)">{{ FIN_OP_TYPE_LABELS[op.type as FinOpType] ?? op.type }}</span></td>
            <td>{{ op.account?.name ?? '—' }}</td>
            <td class="td-amount" :class="op.amountKopecks >= 0 ? 'positive' : 'negative'">
              {{ fmtMoney(op.amountKopecks, true) }}
            </td>
            <td>
              <span v-if="op.category">{{ op.category.name }}<span v-if="op.subcategory"> / {{ op.subcategory.name }}</span></span>
              <span v-else class="td-empty">—</span>
            </td>
            <td>{{ op.project ? (FIN_PROJECT_LABELS[op.project as FinProject] ?? op.project) : '—' }}</td>
            <td>{{ op.counterparty || '—' }}</td>
            <td class="td-comment">{{ op.comment || '—' }}</td>
            <td><span v-if="op.isPnl" class="pnl-yes">✓</span><span v-else class="pnl-no">—</span></td>
            <td>
              <button class="action-btn" @click="openEdit(op)">✎</button>
              <button class="action-btn danger" @click="deleteOp(op.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="pagination">
      <button :disabled="page === 0" @click="goPage(page-1)" class="pg-btn">←</button>
      <span class="pg-info">Стр {{ page+1 }} из {{ Math.ceil(total/pageSize) }} · {{ total }}</span>
      <button :disabled="page >= Math.ceil(total/pageSize)-1" @click="goPage(page+1)" class="pg-btn">→</button>
    </div>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editing ? 'Редактировать операцию' : 'Новая операция' }}</h2>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="fl">Дата</label>
            <input type="date" v-model="form.date" class="fi" required />

            <label class="fl">Тип</label>
            <select v-model="form.type" class="fi" @change="onTypeChange">
              <option v-for="(l,k) in FIN_OP_TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>

            <label class="fl">Счёт</label>
            <select v-model="form.accountId" class="fi">
              <option value="">— выбрать —</option>
              <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>

            <template v-if="form.type === 'TRANSFER'">
              <label class="fl">Счёт назначения</label>
              <select v-model="form.linkedAccountId" class="fi">
                <option value="">— выбрать —</option>
                <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </template>

            <label class="fl">Сумма (₽)</label>
            <input type="number" v-model="formAmountRubles" class="fi" step="0.01" placeholder="0.00" />
            <div style="grid-column:2;font-size:11px;color:#94a3b8;margin-top:-4px">
              {{ form.type === 'EXPENSE' || form.type === 'TRANSFER' ? 'Положительное число — будет списано (хранится отрицательным)' : '' }}
            </div>

            <label class="fl">Статья</label>
            <select v-model="form.categoryId" class="fi" @change="form.subcategoryId = ''">
              <option value="">— без статьи —</option>
              <optgroup v-for="g in groupedCategories" :key="g.group" :label="g.group">
                <option v-for="c in g.cats" :key="c.id" :value="c.id">{{ c.name }}</option>
              </optgroup>
            </select>

            <template v-if="subcatsForSelected.length">
              <label class="fl">Подстатья</label>
              <select v-model="form.subcategoryId" class="fi">
                <option value="">— без подстатьи —</option>
                <option v-for="s in subcatsForSelected" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </template>

            <label class="fl">Проект</label>
            <select v-model="form.project" class="fi">
              <option value="">— без проекта —</option>
              <option v-for="(l,k) in FIN_PROJECT_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>

            <label class="fl">Контрагент</label>
            <input v-model="form.counterparty" class="fi" placeholder="Организация / ФЛ" />

            <label class="fl">Комментарий</label>
            <input v-model="form.comment" class="fi" placeholder="Произвольно" />

            <label class="fl">Входит в P&L</label>
            <label class="fi checkbox-label">
              <input type="checkbox" v-model="form.isPnl" />
              <span>Да (влияет на прибыль)</span>
            </label>
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
import { ref, computed, onMounted } from 'vue';
import { useFinance, fmtMoney, inputToKopecks, rublesInput, FIN_PROJECT_LABELS, FIN_OP_TYPE_LABELS, NON_PNL_TYPES, type FinOpType, type FinProject } from '~/composables/useFinance';

const api = useFinance();
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = 50;
const loading = ref(false);

const accounts = ref<any[]>([]);
const categories = ref<any[]>([]);

// Filters
const fFrom = ref('');
const fTo = ref('');
const fAccount = ref('');
const fProject = ref('');
const fType = ref('');
const fSearch = ref('');

// Modal
const modalOpen = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref<any>(emptyForm());
const formAmountRubles = ref('');

function emptyForm() {
  const today = new Date().toISOString().slice(0, 10);
  return { date: today, type: 'INCOME', accountId: '', linkedAccountId: '', categoryId: '', subcategoryId: '', project: '', counterparty: '', comment: '', isPnl: true };
}

const groupedCategories = computed(() => {
  const typeFilter = form.value.type === 'INCOME' ? 'income'
    : form.value.type === 'EXPENSE' ? 'expense'
    : form.value.type === 'TRANSFER' ? 'transfer'
    : form.value.type === 'DIVIDEND' ? 'dividend'
    : form.value.type === 'LOAN_PRINCIPAL' ? 'loan_principal'
    : form.value.type === 'DEPOSIT_PLACE' ? 'deposit_place'
    : 'deposit_return';

  const cats = categories.value.filter((c: any) => c.type === typeFilter);
  const groups = new Map<string, any[]>();
  for (const c of cats) {
    const g = c.group ?? (typeFilter === 'income' ? 'Доходы' : typeFilter === 'expense' ? 'Расходы' : 'Прочее');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  return Array.from(groups.entries()).map(([group, cats]) => ({ group, cats }));
});

const subcatsForSelected = computed(() => {
  if (!form.value.categoryId) return [];
  const cat = categories.value.find((c: any) => c.id === form.value.categoryId);
  return cat?.subcategories ?? [];
});

function onTypeChange() {
  form.value.categoryId = '';
  form.value.subcategoryId = '';
  form.value.isPnl = !NON_PNL_TYPES.includes(form.value.type);
}

function openCreate() {
  editing.value = null;
  form.value = emptyForm();
  formAmountRubles.value = '';
  modalOpen.value = true;
}

function openEdit(op: any) {
  editing.value = op;
  form.value = {
    date: op.date?.slice(0, 10),
    type: op.type,
    accountId: op.accountId,
    linkedAccountId: op.linkedAccountId ?? '',
    categoryId: op.categoryId ?? '',
    subcategoryId: op.subcategoryId ?? '',
    project: op.project ?? '',
    counterparty: op.counterparty ?? '',
    comment: op.comment ?? '',
    isPnl: op.isPnl,
  };
  formAmountRubles.value = rublesInput(Math.abs(op.amountKopecks));
  modalOpen.value = true;
}

function closeModal() { modalOpen.value = false; editing.value = null; }

async function save() {
  if (!form.value.accountId || !form.value.date) return;
  saving.value = true;
  try {
    const rawRubles = parseFloat(formAmountRubles.value.replace(',', '.') || '0');
    const sign = ['EXPENSE', 'TRANSFER', 'LOAN_PRINCIPAL', 'DEPOSIT_PLACE', 'DIVIDEND'].includes(form.value.type) ? -1 : 1;
    const amountKopecks = Math.round(rawRubles * 100) * sign;

    const dto = {
      ...form.value,
      amountKopecks,
      categoryId: form.value.categoryId || undefined,
      subcategoryId: form.value.subcategoryId || undefined,
      project: form.value.project || undefined,
      linkedAccountId: form.value.linkedAccountId || undefined,
      counterparty: form.value.counterparty || undefined,
      comment: form.value.comment || undefined,
    };

    if (editing.value) {
      await api.updateOperation(editing.value.id, dto);
    } else {
      await api.createOperation(dto);
    }
    closeModal();
    await load();
  } catch (e: any) {
    alert(e?.data?.message ?? 'Ошибка сохранения');
  } finally { saving.value = false; }
}

async function deleteOp(id: string) {
  if (!confirm('Удалить операцию?')) return;
  await api.deleteOperation(id);
  await load();
}

async function load(reset = false) {
  if (reset) page.value = 0;
  loading.value = true;
  try {
    const res = await api.listOperations({
      from: fFrom.value || undefined,
      to: fTo.value || undefined,
      accountId: fAccount.value || undefined,
      project: fProject.value || undefined,
      type: fType.value || undefined,
      search: fSearch.value || undefined,
      page: page.value,
      pageSize,
    });
    items.value = res.items;
    total.value = res.total;
  } catch (e) { console.error(e); } finally { loading.value = false; }
}

function goPage(p: number) { page.value = p; load(); }

function resetFilters() {
  fFrom.value = ''; fTo.value = ''; fAccount.value = '';
  fProject.value = ''; fType.value = ''; fSearch.value = '';
  load(true);
}

function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('ru-RU') : '—'; }
function rowClass(op: any) { return op.amountKopecks >= 0 ? 'row-income' : 'row-expense'; }
function typeBadgeClass(type: string) {
  return { 'badge-income': type === 'INCOME', 'badge-expense': type === 'EXPENSE', 'badge-transfer': type === 'TRANSFER', 'badge-other': !['INCOME','EXPENSE','TRANSFER'].includes(type) };
}

onMounted(async () => {
  [accounts.value, categories.value] = await Promise.all([api.listAccounts(), api.listCategories()]);
  await load();
});
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.count-badge { font-size: 13px; color: #64748b; font-weight: normal; }
.filters-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.f-input, .f-select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; font-size: 13px; }
.btn-apply { background: #6366f1; color: #fff; border: none; border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.btn-reset { background: #e2e8f0; color: #475569; border: none; border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
.btn-primary { background: #10b981; color: #fff; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #059669; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #e2e8f0; color: #475569; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; }

.table-wrap { overflow-x: auto; margin-bottom: 16px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 13px; }
.data-table th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.data-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
.row-income { background: #f0fdf4; }
.row-expense { background: #fff5f5; }
.td-date { white-space: nowrap; }
.td-amount { font-weight: 600; white-space: nowrap; }
.td-comment { color: #64748b; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-empty { color: #cbd5e1; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.pnl-yes { color: #10b981; font-weight: 700; }
.pnl-no { color: #cbd5e1; }
.type-badge { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
.badge-income { background: #d1fae5; color: #065f46; }
.badge-expense { background: #fee2e2; color: #7f1d1d; }
.badge-transfer { background: #dbeafe; color: #1e3a5f; }
.badge-other { background: #f3f4f6; color: #374151; }
.action-btn { background: none; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 13px; margin-right: 4px; color: #475569; }
.action-btn:hover { border-color: #6366f1; color: #6366f1; }
.action-btn.danger:hover { border-color: #ef4444; color: #ef4444; }
.pagination { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 12px 0; }
.pg-btn { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-info { font-size: 13px; color: #64748b; }
.state-loading, .state-empty { text-align: center; padding: 40px; color: #94a3b8; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 560px; max-width: 96vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px 24px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px 12px; align-items: center; }
.fl { font-size: 13px; color: #475569; font-weight: 500; }
.fi { border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
.fi:focus { border-color: #6366f1; outline: none; }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
</style>
