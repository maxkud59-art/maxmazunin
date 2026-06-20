<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Справочники</h1>
    </div>

    <!-- Sub-tabs -->
    <div class="subtab-bar">
      <button v-for="t in SUBTABS" :key="t.id" class="subtab" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">{{ t.label }}</button>
    </div>

    <div class="content-area">
      <!-- CRM Statuses -->
      <template v-if="activeTab === 'crm'">
        <div class="section-header">
          <span>CRM-статусы клиентов</span>
          <button class="btn-add" @click="openCreate('crm')">+ Добавить</button>
        </div>
        <div v-if="loadingCrm" class="state-loading"><span class="spinner"></span></div>
        <div v-else class="items-list">
          <div v-for="s in crmStatuses" :key="s.id" class="dir-item" :class="{ archived: s.archived }">
            <span class="color-dot" :style="{ background: s.color }"></span>
            <span class="item-name">{{ s.name }}</span>
            <span class="item-order">{{ s.order }}</span>
            <div class="item-actions">
              <button class="icon-btn" @click="openEdit('crm', s)">✏️</button>
              <button class="icon-btn" @click="toggleArchive('crm', s)">{{ s.archived ? '↩️' : '🗑' }}</button>
            </div>
          </div>
          <div v-if="!crmStatuses.length" class="empty-hint">Нет статусов. Дефолтные создаются при старте сервера.</div>
        </div>
      </template>

      <!-- Tags -->
      <template v-if="activeTab === 'tags'">
        <div class="section-header">
          <span>Теги</span>
          <button class="btn-add" @click="openCreate('tag')">+ Добавить</button>
        </div>
        <div v-if="loadingTags" class="state-loading"><span class="spinner"></span></div>
        <div v-else class="items-list">
          <div v-for="t in tags" :key="t.id" class="dir-item" :class="{ archived: t.archived }">
            <span class="color-dot" :style="{ background: t.color }"></span>
            <span class="item-name">{{ t.name }}</span>
            <div class="item-actions">
              <button class="icon-btn" @click="openEdit('tag', t)">✏️</button>
              <button class="icon-btn" @click="toggleArchive('tag', t)">{{ t.archived ? '↩️' : '🗑' }}</button>
            </div>
          </div>
          <div v-if="!tags.length" class="empty-hint">Нет тегов.</div>
        </div>
      </template>

      <!-- Order Statuses -->
      <template v-if="activeTab === 'order'">
        <div class="section-header">
          <span>Статусы заказов</span>
          <button class="btn-add" @click="openCreate('order')">+ Добавить</button>
        </div>
        <div v-if="loadingOrder" class="state-loading"><span class="spinner"></span></div>
        <div v-else class="items-list">
          <div v-for="s in orderStatuses" :key="s.id" class="dir-item" :class="{ archived: s.archived }">
            <span class="color-dot" :style="{ background: s.color }"></span>
            <span class="item-name">{{ s.name }}</span>
            <span class="item-order">{{ s.order }}</span>
            <div class="item-actions">
              <button class="icon-btn" @click="openEdit('order', s)">✏️</button>
              <button class="icon-btn" @click="toggleArchive('order', s)">{{ s.archived ? '↩️' : '🗑' }}</button>
            </div>
          </div>
          <div v-if="!orderStatuses.length" class="empty-hint">Нет статусов.</div>
        </div>
      </template>
    </div>

    <!-- Edit/Create modal -->
    <div v-if="modal" class="modal-overlay" @click.self="modal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">{{ editItem ? 'Редактировать' : 'Создать' }}</h3>
          <button class="modal-close" @click="modal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">Название</label>
            <input v-model="form.name" class="form-input" placeholder="Название..." />
          </div>
          <div class="form-row">
            <label class="form-label">Цвет</label>
            <div class="color-row">
              <input v-model="form.color" type="color" class="color-picker" />
              <input v-model="form.color" class="form-input-sm" placeholder="#6366f1" maxlength="7" />
              <div class="color-presets">
                <span v-for="c in COLOR_PRESETS" :key="c" class="color-preset" :style="{ background: c }" @click="form.color = c"></span>
              </div>
            </div>
          </div>
          <div v-if="activeTab !== 'tags'" class="form-row">
            <label class="form-label">Порядок</label>
            <input v-model.number="form.order" type="number" class="form-input-sm" min="0" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="modal = false">Отмена</button>
          <button class="btn-primary" :disabled="saving || !form.name.trim()" @click="save">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' ...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { CrmStatus, Tag, OrderStatus } from '~/composables/useAssistantModule';

const api = useAssistantModule();
const activeTab = ref<'crm' | 'tags' | 'order'>('crm');
const SUBTABS = [
  { id: 'crm' as const, label: 'CRM-статусы' },
  { id: 'tags' as const, label: 'Теги' },
  { id: 'order' as const, label: 'Статусы заказов' },
];

const crmStatuses = ref<CrmStatus[]>([]);
const tags = ref<Tag[]>([]);
const orderStatuses = ref<OrderStatus[]>([]);
const loadingCrm = ref(false);
const loadingTags = ref(false);
const loadingOrder = ref(false);

const modal = ref(false);
const modalType = ref<'crm' | 'tag' | 'order'>('crm');
const editItem = ref<any>(null);
const form = ref({ name: '', color: '#6366f1', order: 0 });
const saving = ref(false);

const COLOR_PRESETS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

onMounted(() => {
  loadCrm(); loadTags(); loadOrder();
});

async function loadCrm() { loadingCrm.value = true; try { crmStatuses.value = await api.listCrmStatuses(); } catch { } finally { loadingCrm.value = false; } }
async function loadTags() { loadingTags.value = true; try { tags.value = await api.listTags(); } catch { } finally { loadingTags.value = false; } }
async function loadOrder() { loadingOrder.value = true; try { orderStatuses.value = await api.listOrderStatuses(); } catch { } finally { loadingOrder.value = false; } }

function openCreate(type: 'crm' | 'tag' | 'order') {
  modalType.value = type;
  editItem.value = null;
  form.value = { name: '', color: '#6366f1', order: 0 };
  modal.value = true;
}

function openEdit(type: 'crm' | 'tag' | 'order', item: any) {
  modalType.value = type;
  editItem.value = item;
  form.value = { name: item.name, color: item.color, order: item.order ?? 0 };
  modal.value = true;
}

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const data: any = { name: form.value.name, color: form.value.color };
    if (modalType.value !== 'tag') data.order = form.value.order;

    if (editItem.value) {
      if (modalType.value === 'crm') await api.updateCrmStatus(editItem.value.id, data);
      else if (modalType.value === 'tag') await api.updateTag(editItem.value.id, data);
      else await api.updateOrderStatus(editItem.value.id, data);
    } else {
      if (modalType.value === 'crm') await api.createCrmStatus(data);
      else if (modalType.value === 'tag') await api.createTag(data);
      else await api.createOrderStatus(data);
    }
    modal.value = false;
    if (modalType.value === 'crm') await loadCrm();
    else if (modalType.value === 'tag') await loadTags();
    else await loadOrder();
  } catch { /* silent */ } finally { saving.value = false; }
}

async function toggleArchive(type: 'crm' | 'tag' | 'order', item: any) {
  const newVal = !item.archived;
  if (!newVal && !confirm(`Восстановить из архива?`)) return;
  if (newVal && !confirm(`Архивировать «${item.name}»? Он перестанет отображаться в выпадающих списках.`)) return;

  if (type === 'crm') await api.updateCrmStatus(item.id, { archived: newVal });
  else if (type === 'tag') await api.updateTag(item.id, { archived: newVal });
  else await api.updateOrderStatus(item.id, { archived: newVal });

  if (type === 'crm') await loadCrm();
  else if (type === 'tag') await loadTags();
  else await loadOrder();
}
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }
.tab-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px; flex-shrink: 0; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }

.subtab-bar { display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; background: #fff; }
.subtab { padding: 10px 16px; font-size: 13px; color: #64748b; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.subtab.active { color: #6366f1; border-bottom-color: #6366f1; font-weight: 600; }

.content-area { flex: 1; overflow-y: auto; padding: 20px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 600; font-size: 14px; color: #1e293b; }
.btn-add { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.btn-add:hover { background: #4f46e5; }

.items-list { display: flex; flex-direction: column; gap: 6px; }
.dir-item { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 8px; padding: 10px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: opacity 0.15s; }
.dir-item.archived { opacity: 0.5; }
.color-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.item-name { font-size: 14px; color: #1e293b; flex: 1; font-weight: 500; }
.item-order { font-size: 11px; color: #94a3b8; min-width: 28px; text-align: right; }
.item-actions { display: flex; gap: 4px; }
.icon-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.icon-btn:hover { opacity: 1; background: #f1f5f9; }
.empty-hint { font-size: 13px; color: #94a3b8; padding: 16px 0; }
.state-loading { padding: 24px; text-align: center; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
.modal-sm { max-width: 400px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.form-row { display: flex; flex-direction: column; gap: 5px; }
.form-label { font-size: 12px; color: #64748b; font-weight: 500; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-input-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100px; }
.color-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.color-picker { width: 36px; height: 36px; border: none; padding: 0; cursor: pointer; border-radius: 6px; }
.color-presets { display: flex; gap: 5px; flex-wrap: wrap; }
.color-preset { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
.color-preset:hover { border-color: #1e293b; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; }
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
