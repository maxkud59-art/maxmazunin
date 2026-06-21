<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Счета</h1>
      <button class="btn-primary" @click="openCreate">+ Добавить счёт</button>
    </div>

    <div v-if="loading" class="state-loading">Загрузка...</div>
    <div v-else-if="!items.length" class="state-empty">Счетов нет. Добавьте первый.</div>
    <div v-else class="accounts-grid">
      <div v-for="acc in items" :key="acc.id" class="acc-card">
        <div class="acc-header">
          <div>
            <div class="acc-name">{{ acc.name }}</div>
            <div class="acc-type">{{ ACC_TYPE_LABELS[acc.type] ?? acc.type }}</div>
          </div>
          <div class="acc-actions">
            <button class="action-btn" @click="openEdit(acc)">✎</button>
          </div>
        </div>
        <div class="acc-balance" :class="acc.currentBalance >= 0 ? 'positive' : 'negative'">
          {{ fmtMoney(acc.currentBalance) }}
        </div>
        <div class="acc-meta">
          <span>Нач. остаток: {{ fmtMoney(acc.openingBalance) }}</span>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editing ? 'Редактировать счёт' : 'Новый счёт' }}</h2>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="fl">Название</label>
            <input v-model="form.name" class="fi" placeholder="Например: Основной, Копилка" />

            <label class="fl">Тип</label>
            <select v-model="form.type" class="fi">
              <option v-for="(l,k) in ACC_TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>

            <label class="fl">Нач. остаток (₽)</label>
            <input type="number" v-model="formOpening" class="fi" step="0.01" placeholder="0.00" />
            <div style="grid-column:2;font-size:11px;color:#94a3b8;margin-top:-6px">
              Введите фактический остаток на дату начала учёта. Отрицательный — если есть задолженность.
            </div>
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
import { useFinance, fmtMoney } from '~/composables/useFinance';

const api = useFinance();
const items = ref<any[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref<any>({ name: '', type: 'BANK' });
const formOpening = ref('0');

const ACC_TYPE_LABELS: Record<string, string> = { BANK: 'Банк', SAVINGS: 'Накопительный', CASH: 'Наличные', CREDIT: 'Кредит/Карта' };

function openCreate() { editing.value = null; form.value = { name: '', type: 'BANK' }; formOpening.value = '0'; modalOpen.value = true; }
function openEdit(acc: any) {
  editing.value = acc;
  form.value = { name: acc.name, type: acc.type };
  formOpening.value = String(acc.openingBalance / 100);
  modalOpen.value = true;
}
function closeModal() { modalOpen.value = false; editing.value = null; }

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const dto = { ...form.value, openingBalance: Math.round(parseFloat(formOpening.value || '0') * 100) };
    if (editing.value) await api.updateAccount(editing.value.id, dto);
    else await api.createAccount(dto);
    closeModal();
    await load();
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); } finally { saving.value = false; }
}

async function load() {
  loading.value = true;
  try { items.value = await api.listAccounts(); }
  catch (e) { console.error(e); } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.btn-primary { background: #10b981; color: #fff; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #059669; }
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary { background: #e2e8f0; color: #475569; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.acc-card { background: #fff; border-radius: 12px; padding: 18px 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.acc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.acc-name { font-size: 15px; font-weight: 600; color: #1e293b; }
.acc-type { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.acc-balance { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.acc-meta { font-size: 11px; color: #94a3b8; }
.action-btn { background: none; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 13px; }
.action-btn:hover { border-color: #6366f1; color: #6366f1; }
.state-loading, .state-empty { text-align: center; padding: 40px; color: #94a3b8; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 480px; max-width: 96vw; box-shadow: 0 8px 40px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px 24px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 130px 1fr; gap: 10px 12px; align-items: center; }
.fl { font-size: 13px; color: #475569; font-weight: 500; }
.fi { border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
.fi:focus { border-color: #10b981; outline: none; }
</style>
