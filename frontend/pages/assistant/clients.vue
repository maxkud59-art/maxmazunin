<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Клиенты</h1>
      <span class="tab-count" v-if="total > 0">{{ total }}</span>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <input v-model="search" class="filter-input" placeholder="Поиск по имени..." @input="onSearch" />

      <select v-model="filterCrmStatus" class="filter-select" @change="load(true)">
        <option value="">Все статусы</option>
        <option v-for="s in crmStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>

      <select v-model="filterTag" class="filter-select" @change="load(true)">
        <option value="">Все теги</option>
        <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>

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
        <div class="state-empty-icon">👥</div>
        <div>Клиентов нет. После синхронизации VK-диалогов клиенты появятся здесь.</div>
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Аватар</th>
            <th class="sortable" @click="toggleSort('firstContactAt')">
              Первый контакт <span class="sort-icon">{{ sortBy === 'firstContactAt' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th>Имя (VK)</th>
            <th>Ссылка VK</th>
            <th>CRM-статус</th>
            <th>Теги</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in items" :key="c.id" @click="openClient(c)" class="table-row">
            <td>
              <div class="avatar-cell">
                <img v-if="c.clientAvatar" :src="c.clientAvatar" class="avatar-img" alt="" />
                <span v-else class="avatar-placeholder">{{ initials(displayName(c)) }}</span>
              </div>
            </td>
            <td class="td-date">{{ c.firstContactAt ? fmtDate(c.firstContactAt) : '—' }}</td>
            <td class="td-name">{{ displayName(c) }}</td>
            <td>
              <a :href="c.vkUrl" target="_blank" class="vk-link" @click.stop>VK ↗</a>
            </td>
            <td>
              <span v-if="c.crmStatus" class="status-chip" :style="{ background: c.crmStatus.color + '22', color: c.crmStatus.color, borderColor: c.crmStatus.color + '66' }">
                {{ c.crmStatus.name }}
              </span>
              <span v-else class="td-empty">—</span>
            </td>
            <td>
              <div class="tag-list">
                <span v-for="tag in c.tags" :key="tag.id" class="tag-chip" :style="{ background: tag.color + '22', color: tag.color }">{{ tag.name }}</span>
                <span v-if="!c.tags.length" class="td-empty">—</span>
              </div>
            </td>
            <td @click.stop>
              <button class="action-btn" @click="openClient(c)">Открыть</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading && items.length" class="load-more-spinner"><span class="spinner"></span></div>
    </div>

    <!-- Pagination -->
    <div v-if="total > 0" class="pagination">
      <button class="pg-btn" :disabled="page === 0" @click="goPage(page - 1)">← Пред</button>
      <span class="pg-info">Стр. {{ page + 1 }} из {{ totalPages }}</span>
      <button class="pg-btn" :disabled="page >= totalPages - 1" @click="goPage(page + 1)">След →</button>
    </div>

    <!-- Client modal -->
    <div v-if="modalClient" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-avatar">
            <img v-if="modalClient.clientAvatar" :src="modalClient.clientAvatar" alt="" />
            <span v-else>{{ initials(displayName(modalClient)) }}</span>
          </div>
          <div>
            <div class="modal-name">{{ displayName(modalClient) }}</div>
            <a :href="modalClient.vkUrl" target="_blank" class="modal-vk-link">{{ modalClient.vkUrl }}</a>
          </div>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-grid">
            <label class="form-label">CRM-статус</label>
            <select v-model="editForm.crmStatusId" class="form-input">
              <option value="">— нет —</option>
              <option v-for="s in crmStatuses.filter(x => !x.archived)" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>

            <label class="form-label">Теги</label>
            <div class="tag-checkboxes">
              <label v-for="t in tags.filter(x => !x.archived)" :key="t.id" class="tag-check">
                <input type="checkbox" :value="t.id" v-model="editForm.tagIds" />
                <span class="tag-chip-sm" :style="{ background: t.color + '22', color: t.color }">{{ t.name }}</span>
              </label>
            </div>

            <label class="form-label">Телефон</label>
            <input v-model="editForm.phone" class="form-input" placeholder="+7..." />

            <label class="form-label">Источник</label>
            <input v-model="editForm.source" class="form-input" placeholder="Откуда клиент..." />

            <label class="form-label">Заметка</label>
            <textarea v-model="editForm.note" class="form-textarea" rows="3" placeholder="Произвольная заметка..."></textarea>
          </div>

          <!-- Client orders -->
          <div v-if="modalClient.orders?.length" class="modal-orders">
            <div class="modal-section-title">Заказы клиента</div>
            <div v-for="o in modalClient.orders" :key="o.id" class="order-row">
              <span class="order-num">#{{ o.number }}</span>
              <span class="order-status-chip" v-if="o.orderStatus" :style="{ background: o.orderStatus.color + '22', color: o.orderStatus.color }">{{ o.orderStatus.name }}</span>
              <span class="order-amount" v-if="o.amount">{{ formatAmount(o.amount) }} ₽</span>
              <span class="order-date">{{ fmtDate(o.createdAt) }}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="goToMessenger(modalClient)">💬 Открыть диалог</button>
          <button class="btn-primary" :disabled="saving" @click="saveClient">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { ClientListItem, CrmStatus, Tag } from '~/composables/useAssistantModule';

const api = useAssistantModule();
const router = useRouter();

const items = ref<ClientListItem[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = ref(30);
const loading = ref(false);
const search = ref('');
const filterCrmStatus = ref('');
const filterTag = ref('');
const sortBy = ref('firstContactAt');
const sortDir = ref<'asc' | 'desc'>('desc');
const searchDebounce = ref<any>(null);

const crmStatuses = ref<CrmStatus[]>([]);
const tags = ref<Tag[]>([]);

const modalClient = ref<any>(null);
const editForm = ref<any>({});
const saving = ref(false);

const PAGE_SIZES = [30, 50, 100, 500, 1000];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

onMounted(async () => {
  await Promise.all([loadDirectories(), load(true)]);
});

async function loadDirectories() {
  [crmStatuses.value, tags.value] = await Promise.all([
    api.listCrmStatuses(),
    api.listTags(),
  ]);
}

async function load(reset = false) {
  if (reset) page.value = 0;
  loading.value = true;
  try {
    const res = await api.listClients({
      page: page.value,
      pageSize: pageSize.value,
      search: search.value || undefined,
      crmStatusId: filterCrmStatus.value || undefined,
      tagId: filterTag.value || undefined,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    });
    items.value = res.items;
    total.value = res.total;
  } catch { /* silent */ } finally { loading.value = false; }
}

function onSearch() {
  if (searchDebounce.value) clearTimeout(searchDebounce.value);
  searchDebounce.value = setTimeout(() => load(true), 400);
}

function goPage(p: number) { page.value = p; load(); }

function toggleSort(field: string) {
  if (sortBy.value === field) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortBy.value = field; sortDir.value = 'desc'; }
  load(true);
}

async function openClient(c: ClientListItem) {
  const full = await api.getClient(c.id).catch(() => c);
  modalClient.value = full;
  editForm.value = {
    crmStatusId: (full as any).crmStatus?.id ?? '',
    tagIds: ((full as any).tags ?? []).map((t: any) => t.id),
    phone: (full as any).phone ?? '',
    source: (full as any).source ?? '',
    note: (full as any).note ?? '',
  };
}

function closeModal() { modalClient.value = null; }

async function saveClient() {
  if (!modalClient.value) return;
  saving.value = true;
  try {
    const updated = await api.updateClient(modalClient.value.id, {
      crmStatusId: editForm.value.crmStatusId || null,
      tagIds: editForm.value.tagIds,
      phone: editForm.value.phone || null,
      source: editForm.value.source || null,
      note: editForm.value.note || null,
    });
    const idx = items.value.findIndex((i) => i.id === modalClient.value.id);
    if (idx >= 0) items.value[idx] = updated;
    closeModal();
  } catch { /* show error? */ } finally { saving.value = false; }
}

function goToMessenger(c: any) {
  if (c.conversationId) router.push('/assistant/messenger');
  else router.push('/assistant/messenger');
  closeModal();
}

function displayName(c: ClientListItem) {
  if (c.firstName) return `${c.firstName} ${c.lastName ?? ''}`.trim();
  if (c.fio) return c.fio;
  return c.clientName ?? '—';
}

function initials(name: string) {
  return name.trim().split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(n: number) {
  return n.toLocaleString('ru-RU');
}
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }
.tab-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px; flex-shrink: 0; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.tab-count { background: #6366f1; color: #fff; border-radius: 99px; font-size: 12px; padding: 2px 8px; font-weight: 600; }

.filter-bar { display: flex; gap: 8px; padding: 8px 20px; flex-shrink: 0; flex-wrap: wrap; }
.filter-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 12px; font-size: 13px; outline: none; min-width: 200px; flex: 1; }
.filter-input:focus { border-color: #6366f1; }
.filter-select { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; background: #fff; }
.filter-select-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 5px 8px; font-size: 12px; background: #fff; }
.page-size-group { display: flex; align-items: center; gap: 6px; }
.page-size-label { font-size: 12px; color: #64748b; white-space: nowrap; }

.table-wrap { flex: 1; overflow: auto; padding: 0 20px 16px; }
.data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.data-table th { background: #f8fafc; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.data-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }
.table-row { cursor: pointer; transition: background 0.15s; }
.table-row:hover { background: #f5f7ff; }
.sortable { cursor: pointer; user-select: none; }
.sort-icon { font-size: 10px; color: #94a3b8; }

.avatar-cell { display: flex; }
.avatar-img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; }

.td-date { white-space: nowrap; color: #64748b; }
.td-name { font-weight: 600; }
.td-empty { color: #cbd5e1; }
.vk-link { color: #2563eb; font-size: 12px; text-decoration: none; }
.vk-link:hover { text-decoration: underline; }

.status-chip { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; border: 1px solid; }
.tag-list { display: flex; flex-wrap: wrap; gap: 4px; }
.tag-chip { padding: 2px 7px; border-radius: 99px; font-size: 11px; font-weight: 500; }

.action-btn { background: #6366f1; color: #fff; border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.action-btn:hover { background: #4f46e5; }

.pagination { display: flex; align-items: center; gap: 12px; padding: 10px 20px; flex-shrink: 0; }
.pg-btn { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-info { font-size: 13px; color: #64748b; }

.state-loading, .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.state-empty-icon { font-size: 48px; }
.load-more-spinner { text-align: center; padding: 12px; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-avatar { width: 48px; height: 48px; border-radius: 50%; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; overflow: hidden; }
.modal-avatar img { width: 100%; height: 100%; object-fit: cover; }
.modal-name { font-weight: 700; font-size: 16px; color: #1e293b; }
.modal-vk-link { font-size: 12px; color: #6366f1; text-decoration: none; }
.modal-close { margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; padding: 4px; }

.modal-body { padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: 10px 14px; align-items: start; }
.form-label { font-size: 12px; color: #64748b; font-weight: 500; padding-top: 8px; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
.form-textarea:focus { border-color: #6366f1; }
.tag-checkboxes { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
.tag-check { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.tag-check input { margin: 0; }
.tag-chip-sm { padding: 2px 8px; border-radius: 99px; font-size: 12px; }

.modal-orders { display: flex; flex-direction: column; gap: 6px; }
.modal-section-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.order-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f8fafc; border-radius: 8px; font-size: 13px; }
.order-num { font-weight: 700; color: #1e293b; min-width: 36px; }
.order-status-chip { padding: 2px 7px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.order-amount { margin-left: auto; font-weight: 600; color: #1e293b; }
.order-date { color: #94a3b8; font-size: 12px; }

.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:hover { background: #4f46e5; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.btn-secondary:hover { background: #e2e8f0; }

.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
