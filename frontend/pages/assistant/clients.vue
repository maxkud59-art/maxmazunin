<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Клиенты</h1>
      <span class="tab-count" v-if="total > 0">{{ total }}</span>
      <div class="header-right">
        <div class="page-size-group">
          <label class="page-size-label">По:</label>
          <select v-model="pageSize" class="filter-select-sm" @change="applyFilters">
            <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <button class="btn-filters" :class="{ active: filtersOpen || hasActiveFilters }" @click="filtersOpen = !filtersOpen">
          Фильтры{{ hasActiveFilters ? ` (${activeFilterCount})` : '' }} {{ filtersOpen ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Filter Panel -->
    <div v-if="filtersOpen" class="filter-panel">
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ active: filterTab === 'clients' }" @click="filterTab = 'clients'">По клиентам</button>
        <button class="filter-tab" :class="{ active: filterTab === 'orders' }" @click="filterTab = 'orders'">По заказам</button>
      </div>

      <!-- Tab: По клиентам -->
      <div v-if="filterTab === 'clients'" class="filter-grid">
        <div class="filter-field">
          <label class="filter-label">ФИО / имя в соцсетях</label>
          <input v-model="draft.search" class="filter-input" placeholder="Поиск по имени..." />
        </div>
        <div class="filter-field">
          <label class="filter-label">VK-страница</label>
          <input v-model="draft.vkUrl" class="filter-input" placeholder="vk.com/id..." />
        </div>
        <div class="filter-field">
          <label class="filter-label">Телефон</label>
          <input v-model="draft.phone" class="filter-input" placeholder="+7..." />
        </div>
        <div class="filter-field">
          <label class="filter-label">Город</label>
          <input v-model="draft.city" class="filter-input" placeholder="Москва..." />
        </div>
        <div class="filter-field">
          <label class="filter-label">Источник</label>
          <input v-model="draft.source" class="filter-input" placeholder="Откуда клиент..." />
        </div>
        <div class="filter-field">
          <label class="filter-label">Заметка (содержит)</label>
          <input v-model="draft.note" class="filter-input" placeholder="Текст заметки..." />
        </div>

        <div class="filter-field full-width">
          <label class="filter-label">CRM-статус</label>
          <div class="chip-group">
            <label v-for="s in crmStatuses.filter(x => !x.archived)" :key="s.id" class="chip-check">
              <input type="checkbox" :value="s.id" v-model="draft.crmStatusIds" />
              <span class="chip" :style="{ background: s.color + '22', color: s.color, borderColor: s.color + '55' }">{{ s.name }}</span>
            </label>
          </div>
        </div>

        <div class="filter-field full-width">
          <label class="filter-label">
            Теги
            <span class="tag-match-group">
              <label class="radio-label"><input type="radio" v-model="draft.tagMatch" value="any" /> Любой</label>
              <label class="radio-label"><input type="radio" v-model="draft.tagMatch" value="all" /> Все</label>
            </span>
          </label>
          <div class="chip-group">
            <label v-for="t in tags.filter(x => !x.archived)" :key="t.id" class="chip-check">
              <input type="checkbox" :value="t.id" v-model="draft.tagIds" />
              <span class="chip" :style="{ background: t.color + '22', color: t.color }">{{ t.name }}</span>
            </label>
          </div>
        </div>

        <div class="filter-field">
          <label class="filter-label">Первый контакт — от</label>
          <input type="date" v-model="draft.firstContactFrom" class="filter-input" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Первый контакт — до</label>
          <input type="date" v-model="draft.firstContactTo" class="filter-input" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Последний контакт — от</label>
          <input type="date" v-model="draft.lastContactFrom" class="filter-input" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Последний контакт — до</label>
          <input type="date" v-model="draft.lastContactTo" class="filter-input" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Следующий контакт — от</label>
          <input type="date" v-model="draft.nextContactFrom" class="filter-input" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Следующий контакт — до</label>
          <input type="date" v-model="draft.nextContactTo" class="filter-input" />
        </div>

        <div class="filter-field full-width">
          <label class="filter-label">VK ID (несколько, через запятую)</label>
          <input v-model="draft.peerIds" class="filter-input" placeholder="123456, 789012, ..." />
        </div>
        <div class="filter-field full-width">
          <label class="filter-label">ID клиентов (несколько, через запятую)</label>
          <input v-model="draft.ids" class="filter-input" placeholder="cuid1, cuid2, ..." />
        </div>
      </div>

      <!-- Tab: По заказам -->
      <div v-if="filterTab === 'orders'" class="filter-grid">
        <div class="filter-field full-width">
          <label class="filter-label">Наличие заказов</label>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" v-model="draft.hasOrders" value="" /> Не важно</label>
            <label class="radio-label"><input type="radio" v-model="draft.hasOrders" value="yes" /> Есть заказы</label>
            <label class="radio-label"><input type="radio" v-model="draft.hasOrders" value="no" /> Нет заказов</label>
          </div>
        </div>
        <div class="filter-field">
          <label class="filter-label">Статус заказа</label>
          <select v-model="draft.orderStatusId" class="filter-input">
            <option value="">— любой —</option>
            <option v-for="s in orderStatuses.filter(x => !x.archived)" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="filter-field">
          <label class="filter-label">Сумма — от (₽)</label>
          <input type="number" v-model="draft.orderAmountMin" class="filter-input" placeholder="0" min="0" />
        </div>
        <div class="filter-field">
          <label class="filter-label">Сумма — до (₽)</label>
          <input type="number" v-model="draft.orderAmountMax" class="filter-input" placeholder="∞" min="0" />
        </div>
      </div>

      <div class="filter-actions">
        <button class="btn-reset" @click="resetFilters">Сбросить</button>
        <button class="btn-apply" @click="applyFilters">
          Показать{{ total > 0 ? ` (${total})` : '' }}
        </button>
      </div>
    </div>

    <!-- Active filter chips (when panel is closed) -->
    <div v-if="!filtersOpen && hasActiveFilters" class="active-chips">
      <span v-for="chip in activeChips" :key="chip.key" class="active-chip">
        {{ chip.label }}
        <button class="chip-remove" @click="removeFilter(chip.key)">✕</button>
      </span>
      <button class="chip-clear-all" @click="resetFilters">Сбросить все</button>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <div v-if="loading && !items.length" class="state-loading"><span class="spinner"></span> Загрузка...</div>
      <div v-else-if="!loading && !items.length" class="state-empty">
        <div class="state-empty-icon">👥</div>
        <div>{{ hasActiveFilters ? 'Нет клиентов по заданным фильтрам.' : 'Клиентов нет. После синхронизации VK-диалогов клиенты появятся здесь.' }}</div>
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
      <span class="pg-info">Стр. {{ page + 1 }} из {{ totalPages }} · {{ total }} клиентов</span>
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

            <label class="form-label">Email</label>
            <input v-model="editForm.email" class="form-input" placeholder="..." />

            <label class="form-label">Город</label>
            <input v-model="editForm.city" class="form-input" placeholder="..." />

            <label class="form-label">Источник</label>
            <input v-model="editForm.source" class="form-input" placeholder="Откуда клиент..." />

            <label class="form-label">След. контакт</label>
            <input type="date" v-model="editForm.nextContactDate" class="form-input" />

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
import { useRouter, useRoute } from 'vue-router';
import type { ClientListItem, CrmStatus, Tag, OrderStatus } from '~/composables/useAssistantModule';

const api = useAssistantModule();
const router = useRouter();
const route = useRoute();

const items = ref<ClientListItem[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = ref(30);
const loading = ref(false);
const sortBy = ref('firstContactAt');
const sortDir = ref<'asc' | 'desc'>('desc');

const crmStatuses = ref<CrmStatus[]>([]);
const tags = ref<Tag[]>([]);
const orderStatuses = ref<OrderStatus[]>([]);

const modalClient = ref<any>(null);
const editForm = ref<any>({});
const saving = ref(false);

const PAGE_SIZES = [30, 50, 100, 500, 1000];

const filtersOpen = ref(false);
const filterTab = ref<'clients' | 'orders'>('clients');

function emptyDraft() {
  return {
    search: '',
    vkUrl: '',
    phone: '',
    city: '',
    source: '',
    note: '',
    crmStatusIds: [] as string[],
    tagIds: [] as string[],
    tagMatch: 'any',
    firstContactFrom: '',
    firstContactTo: '',
    lastContactFrom: '',
    lastContactTo: '',
    nextContactFrom: '',
    nextContactTo: '',
    peerIds: '',
    ids: '',
    hasOrders: '',
    orderStatusId: '',
    orderAmountMin: '',
    orderAmountMax: '',
  };
}

const draft = ref(emptyDraft());
const applied = ref(emptyDraft());

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const hasActiveFilters = computed(() => {
  const a = applied.value;
  return !!(
    a.search || a.vkUrl || a.phone || a.city || a.source || a.note ||
    a.crmStatusIds.length || a.tagIds.length ||
    a.firstContactFrom || a.firstContactTo ||
    a.lastContactFrom || a.lastContactTo ||
    a.nextContactFrom || a.nextContactTo ||
    a.peerIds || a.ids ||
    a.hasOrders || a.orderStatusId || a.orderAmountMin || a.orderAmountMax
  );
});

const activeFilterCount = computed(() => {
  const a = applied.value;
  let n = 0;
  if (a.search) n++;
  if (a.vkUrl) n++;
  if (a.phone) n++;
  if (a.city) n++;
  if (a.source) n++;
  if (a.note) n++;
  if (a.crmStatusIds.length) n++;
  if (a.tagIds.length) n++;
  if (a.firstContactFrom || a.firstContactTo) n++;
  if (a.lastContactFrom || a.lastContactTo) n++;
  if (a.nextContactFrom || a.nextContactTo) n++;
  if (a.peerIds) n++;
  if (a.ids) n++;
  if (a.hasOrders) n++;
  if (a.orderStatusId) n++;
  if (a.orderAmountMin || a.orderAmountMax) n++;
  return n;
});

const activeChips = computed(() => {
  const a = applied.value;
  const chips: { key: string; label: string }[] = [];
  if (a.search) chips.push({ key: 'search', label: `Поиск: «${a.search}»` });
  if (a.vkUrl) chips.push({ key: 'vkUrl', label: `VK: ${a.vkUrl}` });
  if (a.phone) chips.push({ key: 'phone', label: `Тел: ${a.phone}` });
  if (a.city) chips.push({ key: 'city', label: `Город: ${a.city}` });
  if (a.source) chips.push({ key: 'source', label: `Источник: ${a.source}` });
  if (a.note) chips.push({ key: 'note', label: `Заметка: ${a.note}` });
  if (a.crmStatusIds.length) {
    const names = a.crmStatusIds.map(id => crmStatuses.value.find(s => s.id === id)?.name ?? id).join(', ');
    chips.push({ key: 'crmStatusIds', label: `Статус: ${names}` });
  }
  if (a.tagIds.length) {
    const names = a.tagIds.map(id => tags.value.find(t => t.id === id)?.name ?? id).join(', ');
    chips.push({ key: 'tagIds', label: `Теги (${a.tagMatch === 'all' ? 'все' : 'любой'}): ${names}` });
  }
  if (a.firstContactFrom || a.firstContactTo) chips.push({ key: 'firstContact', label: `Первый контакт: ${a.firstContactFrom || '…'} — ${a.firstContactTo || '…'}` });
  if (a.lastContactFrom || a.lastContactTo) chips.push({ key: 'lastContact', label: `Последний: ${a.lastContactFrom || '…'} — ${a.lastContactTo || '…'}` });
  if (a.nextContactFrom || a.nextContactTo) chips.push({ key: 'nextContact', label: `След. контакт: ${a.nextContactFrom || '…'} — ${a.nextContactTo || '…'}` });
  if (a.peerIds) chips.push({ key: 'peerIds', label: `VK ID: ${a.peerIds}` });
  if (a.ids) chips.push({ key: 'ids', label: `ID: ${a.ids}` });
  if (a.hasOrders === 'yes') chips.push({ key: 'hasOrders', label: 'Есть заказы' });
  if (a.hasOrders === 'no') chips.push({ key: 'hasOrders', label: 'Нет заказов' });
  if (a.orderStatusId) {
    const name = orderStatuses.value.find(s => s.id === a.orderStatusId)?.name ?? a.orderStatusId;
    chips.push({ key: 'orderStatusId', label: `Статус заказа: ${name}` });
  }
  if (a.orderAmountMin || a.orderAmountMax) chips.push({ key: 'orderAmount', label: `Сумма: ${a.orderAmountMin || '0'} — ${a.orderAmountMax || '∞'} ₽` });
  return chips;
});

onMounted(async () => {
  await loadDirectories();
  readQueryParams();
  await load(true);
});

async function loadDirectories() {
  [crmStatuses.value, tags.value, orderStatuses.value] = await Promise.all([
    api.listCrmStatuses(),
    api.listTags(),
    api.listOrderStatuses(),
  ]);
}

function readQueryParams() {
  const q = route.query as Record<string, string>;
  if (q.page) page.value = Number(q.page);
  if (q.pageSize) pageSize.value = Number(q.pageSize);
  if (q.sortBy) sortBy.value = q.sortBy;
  if (q.sortDir) sortDir.value = q.sortDir as 'asc' | 'desc';

  const strKeys = ['search', 'vkUrl', 'phone', 'city', 'source', 'note',
    'firstContactFrom', 'firstContactTo', 'lastContactFrom', 'lastContactTo',
    'nextContactFrom', 'nextContactTo', 'peerIds', 'ids',
    'hasOrders', 'orderStatusId', 'orderAmountMin', 'orderAmountMax', 'tagMatch'] as const;
  for (const k of strKeys) {
    if (q[k]) (draft.value as any)[k] = q[k];
  }
  if (q.crmStatusIds) draft.value.crmStatusIds = q.crmStatusIds.split(',').filter(Boolean);
  if (q.tagIds) draft.value.tagIds = q.tagIds.split(',').filter(Boolean);
  applied.value = { ...draft.value, crmStatusIds: [...draft.value.crmStatusIds], tagIds: [...draft.value.tagIds] };
}

function buildQueryParams(): Record<string, string> {
  const a = applied.value;
  const q: Record<string, string> = {
    page: String(page.value),
    pageSize: String(pageSize.value),
    sortBy: sortBy.value,
    sortDir: sortDir.value,
  };
  if (a.search) q.search = a.search;
  if (a.vkUrl) q.vkUrl = a.vkUrl;
  if (a.phone) q.phone = a.phone;
  if (a.city) q.city = a.city;
  if (a.source) q.source = a.source;
  if (a.note) q.note = a.note;
  if (a.crmStatusIds.length) q.crmStatusIds = a.crmStatusIds.join(',');
  if (a.tagIds.length) { q.tagIds = a.tagIds.join(','); q.tagMatch = a.tagMatch; }
  if (a.firstContactFrom) q.firstContactFrom = a.firstContactFrom;
  if (a.firstContactTo) q.firstContactTo = a.firstContactTo;
  if (a.lastContactFrom) q.lastContactFrom = a.lastContactFrom;
  if (a.lastContactTo) q.lastContactTo = a.lastContactTo;
  if (a.nextContactFrom) q.nextContactFrom = a.nextContactFrom;
  if (a.nextContactTo) q.nextContactTo = a.nextContactTo;
  if (a.peerIds) q.peerIds = a.peerIds;
  if (a.ids) q.ids = a.ids;
  if (a.hasOrders) q.hasOrders = a.hasOrders;
  if (a.orderStatusId) q.orderStatusId = a.orderStatusId;
  if (a.orderAmountMin) q.orderAmountMin = a.orderAmountMin;
  if (a.orderAmountMax) q.orderAmountMax = a.orderAmountMax;
  return q;
}

async function load(reset = false) {
  if (reset) page.value = 0;
  loading.value = true;
  router.replace({ query: buildQueryParams() }).catch(() => {});
  try {
    const a = applied.value;
    const res = await api.listClients({
      page: page.value,
      pageSize: pageSize.value,
      search: a.search || undefined,
      vkUrl: a.vkUrl || undefined,
      phone: a.phone || undefined,
      city: a.city || undefined,
      source: a.source || undefined,
      note: a.note || undefined,
      crmStatusIds: a.crmStatusIds.length ? a.crmStatusIds.join(',') : undefined,
      tagIds: a.tagIds.length ? a.tagIds.join(',') : undefined,
      tagMatch: a.tagIds.length ? a.tagMatch : undefined,
      firstContactFrom: a.firstContactFrom || undefined,
      firstContactTo: a.firstContactTo || undefined,
      lastContactFrom: a.lastContactFrom || undefined,
      lastContactTo: a.lastContactTo || undefined,
      nextContactFrom: a.nextContactFrom || undefined,
      nextContactTo: a.nextContactTo || undefined,
      peerIds: a.peerIds || undefined,
      ids: a.ids || undefined,
      hasOrders: a.hasOrders || undefined,
      orderStatusId: a.orderStatusId || undefined,
      orderAmountMin: a.orderAmountMin || undefined,
      orderAmountMax: a.orderAmountMax || undefined,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    });
    items.value = res.items;
    total.value = res.total;
  } catch { /* silent */ } finally { loading.value = false; }
}

function applyFilters() {
  applied.value = { ...draft.value, crmStatusIds: [...draft.value.crmStatusIds], tagIds: [...draft.value.tagIds] };
  load(true);
}

function resetFilters() {
  const empty = emptyDraft();
  draft.value = empty;
  applied.value = { ...empty, crmStatusIds: [], tagIds: [] };
  load(true);
}

function removeFilter(key: string) {
  const a = { ...applied.value, crmStatusIds: [...applied.value.crmStatusIds], tagIds: [...applied.value.tagIds] };
  if (key === 'search') a.search = '';
  else if (key === 'vkUrl') a.vkUrl = '';
  else if (key === 'phone') a.phone = '';
  else if (key === 'city') a.city = '';
  else if (key === 'source') a.source = '';
  else if (key === 'note') a.note = '';
  else if (key === 'crmStatusIds') a.crmStatusIds = [];
  else if (key === 'tagIds') a.tagIds = [];
  else if (key === 'firstContact') { a.firstContactFrom = ''; a.firstContactTo = ''; }
  else if (key === 'lastContact') { a.lastContactFrom = ''; a.lastContactTo = ''; }
  else if (key === 'nextContact') { a.nextContactFrom = ''; a.nextContactTo = ''; }
  else if (key === 'peerIds') a.peerIds = '';
  else if (key === 'ids') a.ids = '';
  else if (key === 'hasOrders') a.hasOrders = '';
  else if (key === 'orderStatusId') a.orderStatusId = '';
  else if (key === 'orderAmount') { a.orderAmountMin = ''; a.orderAmountMax = ''; }
  applied.value = a;
  draft.value = { ...a, crmStatusIds: [...a.crmStatusIds], tagIds: [...a.tagIds] };
  load(true);
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
  const f = full as any;
  editForm.value = {
    crmStatusId: f.crmStatus?.id ?? '',
    tagIds: (f.tags ?? []).map((t: any) => t.id),
    phone: f.phone ?? '',
    email: f.email ?? '',
    city: f.city ?? '',
    source: f.source ?? '',
    nextContactDate: f.nextContactDate ? f.nextContactDate.slice(0, 10) : '',
    note: f.note ?? '',
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
      email: editForm.value.email || null,
      city: editForm.value.city || null,
      source: editForm.value.source || null,
      nextContactDate: editForm.value.nextContactDate || null,
      note: editForm.value.note || null,
    });
    const idx = items.value.findIndex((i) => i.id === modalClient.value.id);
    if (idx >= 0) items.value[idx] = updated;
    closeModal();
  } catch { /* silent */ } finally { saving.value = false; }
}

function goToMessenger(_c: any) {
  router.push('/assistant/messenger');
  closeModal();
}

function displayName(c: any) {
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
.header-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.page-size-group { display: flex; align-items: center; gap: 6px; }
.page-size-label { font-size: 12px; color: #64748b; white-space: nowrap; }
.filter-select-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 5px 8px; font-size: 12px; background: #fff; }

.btn-filters { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: #1e293b; white-space: nowrap; }
.btn-filters:hover { background: #f1f5f9; }
.btn-filters.active { border-color: #6366f1; background: #eef2ff; color: #6366f1; }

/* Filter panel */
.filter-panel { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 20px; flex-shrink: 0; overflow-y: auto; max-height: 60vh; }
.filter-tabs { display: flex; gap: 2px; background: #f1f5f9; border-radius: 8px; padding: 3px; margin-bottom: 14px; width: fit-content; }
.filter-tab { border: none; background: transparent; border-radius: 6px; padding: 5px 16px; font-size: 13px; cursor: pointer; color: #64748b; }
.filter-tab.active { background: #fff; color: #1e293b; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

.filter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px 16px; }
.filter-field { display: flex; flex-direction: column; gap: 4px; }
.filter-field.full-width { grid-column: 1 / -1; }
.filter-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; display: flex; align-items: center; gap: 10px; }
.filter-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; background: #fff; width: 100%; box-sizing: border-box; }
.filter-input:focus { border-color: #6366f1; }

.chip-group { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
.chip-check { display: flex; align-items: center; cursor: pointer; }
.chip-check input { display: none; }
.chip-check input:checked + .chip { box-shadow: 0 0 0 2px currentColor; font-weight: 700; }
.chip { padding: 3px 10px; border-radius: 99px; font-size: 12px; cursor: pointer; border: 1px solid transparent; transition: box-shadow 0.1s; }

.tag-match-group { display: flex; gap: 10px; font-size: 11px; font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: 8px; }
.radio-label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #475569; cursor: pointer; font-weight: 400; text-transform: none; letter-spacing: 0; }
.radio-group { display: flex; gap: 16px; flex-wrap: wrap; }

.filter-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
.btn-reset { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; color: #64748b; }
.btn-reset:hover { background: #f8fafc; }
.btn-apply { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 7px 20px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-apply:hover { background: #4f46e5; }

/* Active chips row */
.active-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 20px; flex-shrink: 0; }
.active-chip { display: inline-flex; align-items: center; gap: 6px; background: #eef2ff; color: #4f46e5; border-radius: 99px; padding: 3px 10px 3px 12px; font-size: 12px; font-weight: 500; }
.chip-remove { background: none; border: none; color: #6366f1; cursor: pointer; font-size: 11px; padding: 0; line-height: 1; }
.chip-clear-all { background: none; border: 1px solid #d1d5db; border-radius: 99px; padding: 3px 10px; font-size: 12px; color: #64748b; cursor: pointer; }
.chip-clear-all:hover { background: #f1f5f9; }

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
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 540px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-avatar { width: 48px; height: 48px; border-radius: 50%; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; overflow: hidden; }
.modal-avatar img { width: 100%; height: 100%; object-fit: cover; }
.modal-name { font-weight: 700; font-size: 16px; color: #1e293b; }
.modal-vk-link { font-size: 12px; color: #6366f1; text-decoration: none; }
.modal-close { margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; padding: 4px; }

.modal-body { padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
.form-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px 14px; align-items: start; }
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
