<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Счета</h1>
      <div class="header-actions">
        <button class="btn-secondary" @click="loadBankAccounts" :disabled="bankLoading">
          {{ bankLoading ? '...' : '🏦 Счета T-Bank' }}
        </button>
        <button class="btn-primary" @click="openCreate">+ Добавить счёт</button>
      </div>
    </div>

    <!-- T-Bank счета для привязки -->
    <div v-if="bankAccounts.length" class="bank-hint">
      <div class="bank-hint-title">Счета из T-Bank — привяжите к счетам ниже для авто-импорта:</div>
      <div class="bank-list">
        <div v-for="b in bankAccounts" :key="b.id" class="bank-item">
          <span class="bank-num">{{ b.number }}</span>
          <span class="bank-name">{{ b.name }}</span>
          <span class="bank-bal">{{ b.balance != null ? fmtRub(b.balance) : '—' }}</span>
        </div>
      </div>
    </div>
    <div v-if="bankError" class="bank-error">{{ bankError }}</div>

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
          <span v-if="acc.bankAccountNumber" class="linked-badge">🔗 {{ acc.bankAccountNumber.slice(-4) }}</span>
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
              Введите фактический остаток на дату начала учёта.
            </div>

            <label class="fl">Номер счёта T-Bank</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input v-model="form.bankAccountNumber" class="fi" placeholder="40702810..." style="flex:1" />
              <select v-if="bankAccounts.length" v-model="form.bankAccountNumber" class="fi" style="width:140px;flex-shrink:0">
                <option value="">—</option>
                <option v-for="b in bankAccounts" :key="b.id" :value="b.number">{{ b.number.slice(-4) }} {{ b.name }}</option>
              </select>
            </div>
            <div style="grid-column:2;font-size:11px;color:#94a3b8;margin-top:-6px">
              Привязывает счёт к T-Bank для авто-импорта выписок.
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
import { useNuxtApp } from '#app';
import { useFinance, fmtMoney } from '~/composables/useFinance';

const api = useFinance();
const { $api } = useNuxtApp() as any;

const items = ref<any[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref<any>({ name: '', type: 'BANK', bankAccountNumber: '' });
const formOpening = ref('0');

const bankAccounts = ref<any[]>([]);
const bankLoading = ref(false);
const bankError = ref('');

const ACC_TYPE_LABELS: Record<string, string> = { BANK: 'Банк', SAVINGS: 'Накопительный', CASH: 'Наличные', CREDIT: 'Кредит/Карта' };

function fmtRub(n: number) {
  return n.toLocaleString('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

async function loadBankAccounts() {
  bankLoading.value = true;
  bankError.value = '';
  try {
    bankAccounts.value = await $api('/api/finance/bank/accounts');
  } catch (e: any) {
    bankError.value = e?.data?.message ?? 'Не удалось получить счета T-Bank';
  } finally {
    bankLoading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', type: 'BANK', bankAccountNumber: '' };
  formOpening.value = '0';
  modalOpen.value = true;
}
function openEdit(acc: any) {
  editing.value = acc;
  form.value = { name: acc.name, type: acc.type, bankAccountNumber: acc.bankAccountNumber ?? '' };
  formOpening.value = String(acc.openingBalance / 100);
  modalOpen.value = true;
}
function closeModal() { modalOpen.value = false; editing.value = null; }

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const dto: any = {
      name: form.value.name,
      type: form.value.type,
      openingBalance: Math.round(parseFloat(formOpening.value || '0') * 100),
    };
    if (form.value.bankAccountNumber?.trim()) dto.bankAccountNumber = form.value.bankAccountNumber.trim();
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
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.btn-primary { background: #10b981; color: #fff; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #059669; }
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary { background: #e2e8f0; color: #475569; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.btn-secondary:hover { background: #cbd5e1; }
.bank-hint { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }
.bank-hint-title { font-size: 12px; color: #0369a1; font-weight: 600; margin-bottom: 8px; }
.bank-list { display: flex; flex-direction: column; gap: 4px; }
.bank-item { display: flex; gap: 12px; font-size: 12px; }
.bank-num { font-mono: monospace; color: #1e293b; font-weight: 600; }
.bank-name { color: #64748b; flex: 1; }
.bank-bal { color: #0369a1; font-weight: 500; }
.bank-error { color: #dc2626; font-size: 13px; margin-bottom: 12px; }
.accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.acc-card { background: #fff; border-radius: 12px; padding: 18px 20px; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.acc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.acc-name { font-size: 15px; font-weight: 600; color: #1e293b; }
.acc-type { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.acc-balance { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.positive { color: #10b981; }
.negative { color: #ef4444; }
.acc-meta { font-size: 11px; color: #94a3b8; display: flex; gap: 10px; align-items: center; }
.linked-badge { background: #dbeafe; color: #1d4ed8; border-radius: 4px; padding: 1px 6px; font-weight: 600; }
.action-btn { background: none; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 13px; }
.action-btn:hover { border-color: #6366f1; color: #6366f1; }
.state-loading, .state-empty { text-align: center; padding: 40px; color: #94a3b8; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 500px; max-width: 96vw; box-shadow: 0 8px 40px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px 24px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px 12px; align-items: center; }
.fl { font-size: 13px; color: #475569; font-weight: 500; }
.fi { border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
.fi:focus { border-color: #10b981; outline: none; }
</style>
