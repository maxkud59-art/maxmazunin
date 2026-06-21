<template>
  <div class="fin-page">
    <div class="page-header">
      <h1 class="page-title">Статьи ДДС/ПНЛ</h1>
      <button class="btn-primary" @click="openCreateCat">+ Добавить статью</button>
    </div>

    <div class="tab-row">
      <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="state-loading">Загрузка...</div>
    <div v-else>
      <div v-for="cat in filteredCats" :key="cat.id" class="cat-card">
        <div class="cat-header">
          <div class="cat-info">
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-meta">{{ typeLabel(cat.type) }}<span v-if="cat.group"> · {{ cat.group }}</span></span>
            <span v-if="cat.isPnl" class="pnl-badge">P&L</span>
          </div>
          <div class="cat-actions">
            <button class="action-btn" @click="openEditCat(cat)">✎</button>
            <button class="action-btn add" @click="openCreateSub(cat)">+ подстатья</button>
          </div>
        </div>

        <!-- Subcategories -->
        <div v-if="cat.subcategories?.length" class="sub-list">
          <div v-for="sub in cat.subcategories" :key="sub.id" class="sub-item">
            <span>{{ sub.name }}</span>
            <button class="action-btn sm" @click="openEditSub(cat, sub)">✎</button>
          </div>
        </div>
      </div>

      <div v-if="!filteredCats.length" class="state-empty">Статей нет для этого типа.</div>
    </div>

    <!-- Modal: Category -->
    <div v-if="catModalOpen" class="modal-overlay" @click.self="closeCatModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingCat ? 'Редактировать статью' : 'Новая статья' }}</h2>
          <button class="modal-close" @click="closeCatModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="fl">Название</label>
            <input v-model="catForm.name" class="fi" placeholder="Например: Реклама, Зарплата" />

            <label class="fl">Тип</label>
            <select v-model="catForm.type" class="fi">
              <option value="income">Приход</option>
              <option value="expense">Расход</option>
              <option value="transfer">Перевод</option>
              <option value="loan_principal">Кредит (тело)</option>
              <option value="deposit_place">Депозит (размещение)</option>
              <option value="deposit_return">Депозит (возврат)</option>
              <option value="dividend">Дивиденды</option>
            </select>

            <label class="fl">Группа</label>
            <input v-model="catForm.group" class="fi" placeholder="Маркетинг, Операционка, Персонал..." />

            <label class="fl">Входит в P&L</label>
            <label class="fi checkbox-label">
              <input type="checkbox" v-model="catForm.isPnl" />
              <span>Да</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeCatModal">Отмена</button>
          <button class="btn-primary" :disabled="catSaving" @click="saveCat">{{ catSaving ? 'Сохранение...' : 'Сохранить' }}</button>
        </div>
      </div>
    </div>

    <!-- Modal: Subcategory -->
    <div v-if="subModalOpen" class="modal-overlay" @click.self="closeSubModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingSub ? 'Редактировать подстатью' : `Подстатья к «${parentCat?.name}»` }}</h2>
          <button class="modal-close" @click="closeSubModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="fl">Название</label>
            <input v-model="subForm.name" class="fi" placeholder="Например: Яндекс Директ, VK Ads" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeSubModal">Отмена</button>
          <button class="btn-primary" :disabled="subSaving" @click="saveSub">{{ subSaving ? 'Сохранение...' : 'Сохранить' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFinance } from '~/composables/useFinance';

const api = useFinance();
const items = ref<any[]>([]);
const loading = ref(false);
const activeTab = ref('all');

const tabs = [
  { key: 'all', label: 'Все' },
  { key: 'income', label: 'Приход' },
  { key: 'expense', label: 'Расход' },
  { key: 'other', label: 'Прочие' },
];

const filteredCats = computed(() => {
  if (activeTab.value === 'all') return items.value;
  if (activeTab.value === 'income') return items.value.filter((c: any) => c.type === 'income');
  if (activeTab.value === 'expense') return items.value.filter((c: any) => c.type === 'expense');
  return items.value.filter((c: any) => !['income', 'expense'].includes(c.type));
});

function typeLabel(type: string): string {
  const m: Record<string, string> = { income: 'Приход', expense: 'Расход', transfer: 'Перевод', loan_principal: 'Кредит', deposit_place: 'Депозит +', deposit_return: 'Депозит −', dividend: 'Дивиденды' };
  return m[type] ?? type;
}

// Category modal
const catModalOpen = ref(false);
const editingCat = ref<any>(null);
const catSaving = ref(false);
const catForm = ref<any>({ name: '', type: 'expense', group: '', isPnl: true });

function openCreateCat() { editingCat.value = null; catForm.value = { name: '', type: activeTab.value === 'income' ? 'income' : 'expense', group: '', isPnl: true }; catModalOpen.value = true; }
function openEditCat(cat: any) { editingCat.value = cat; catForm.value = { name: cat.name, type: cat.type, group: cat.group ?? '', isPnl: cat.isPnl }; catModalOpen.value = true; }
function closeCatModal() { catModalOpen.value = false; editingCat.value = null; }

async function saveCat() {
  if (!catForm.value.name.trim()) return;
  catSaving.value = true;
  try {
    const dto = { ...catForm.value, group: catForm.value.group || undefined };
    if (editingCat.value) await api.updateCategory(editingCat.value.id, dto);
    else await api.createCategory(dto);
    closeCatModal();
    await load();
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); } finally { catSaving.value = false; }
}

// Subcategory modal
const subModalOpen = ref(false);
const editingSub = ref<any>(null);
const parentCat = ref<any>(null);
const subSaving = ref(false);
const subForm = ref({ name: '' });

function openCreateSub(cat: any) { parentCat.value = cat; editingSub.value = null; subForm.value = { name: '' }; subModalOpen.value = true; }
function openEditSub(cat: any, sub: any) { parentCat.value = cat; editingSub.value = sub; subForm.value = { name: sub.name }; subModalOpen.value = true; }
function closeSubModal() { subModalOpen.value = false; editingSub.value = null; parentCat.value = null; }

async function saveSub() {
  if (!subForm.value.name.trim()) return;
  subSaving.value = true;
  try {
    if (editingSub.value) await api.updateSubcategory(editingSub.value.id, { name: subForm.value.name });
    else await api.createSubcategory(parentCat.value.id, { name: subForm.value.name });
    closeSubModal();
    await load();
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка'); } finally { subSaving.value = false; }
}

async function load() {
  loading.value = true;
  try { items.value = await api.listCategories(); }
  catch (e) { console.error(e); } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.fin-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
.btn-primary { background: #10b981; color: #fff; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-primary:hover { background: #059669; }
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary { background: #e2e8f0; color: #475569; border: none; border-radius: 7px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.tab-row { display: flex; gap: 4px; margin-bottom: 16px; }
.tab-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; font-size: 13px; cursor: pointer; color: #475569; }
.tab-btn.active { background: #10b981; border-color: #10b981; color: #fff; font-weight: 600; }
.cat-card { background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.cat-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.cat-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cat-name { font-size: 14px; font-weight: 600; color: #1e293b; }
.cat-meta { font-size: 11px; color: #94a3b8; }
.pnl-badge { background: #dbeafe; color: #1e40af; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 20px; }
.cat-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.action-btn { background: none; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 12px; color: #475569; }
.action-btn:hover { border-color: #6366f1; color: #6366f1; }
.action-btn.add { border-color: #bbf7d0; color: #166534; font-size: 11px; }
.action-btn.add:hover { background: #f0fdf4; }
.action-btn.sm { padding: 1px 6px; font-size: 11px; }
.sub-list { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; display: flex; flex-wrap: wrap; gap: 6px; }
.sub-item { display: flex; align-items: center; gap: 6px; background: #f8fafc; border-radius: 6px; padding: 4px 10px; font-size: 12.5px; color: #334155; }
.state-loading, .state-empty { text-align: center; padding: 40px; color: #94a3b8; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 14px; width: 480px; max-width: 96vw; box-shadow: 0 8px 40px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px 24px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: 10px 12px; align-items: center; }
.fl { font-size: 13px; color: #475569; font-weight: 500; }
.fi { border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
.fi:focus { border-color: #10b981; outline: none; }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; padding: 0; border: none; background: none; }
</style>
