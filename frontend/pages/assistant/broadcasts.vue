<template>
  <div class="bc-page">

    <!-- ═══ Info banner (collapsible) ═══ -->
    <div v-if="showBanner" class="bc-banner">
      <div class="bc-banner-text">
        <strong>Рассылки</strong> — отправляйте сообщения клиентам через VK. Выбирайте аудиторию
        по VK ID, ID клиентов или фильтрам CRM. Рассылка идёт со скоростью 2 сообщения/сек
        (настраивается через BROADCAST_RATE_PER_SEC), автоматически притормаживает при флуд-контроле
        VK и не дублирует отправку.
      </div>
      <button class="bc-banner-close" @click="showBanner = false">✕</button>
    </div>

    <!-- ═══ Stats bar ═══ -->
    <div class="bc-limit-bar">
      <div class="bc-limit-info">
        <span v-if="!dailyLimit">
          <span class="spinner-sm-dark"></span> Загрузка...
        </span>
        <template v-else>
          <span v-if="!dailyLimit.vkConfigured" class="bc-limit-warn">
            ⚠️ VK_GROUP_TOKEN не задан — отправка недоступна
          </span>
          <template v-else>
            <span class="bc-limit-label">Отправлено сегодня:</span>
            <span class="bc-limit-count">{{ dailyLimit.sentToday.toLocaleString('ru-RU') }}</span>
            <span class="bc-limit-label">· Скорость:</span>
            <span class="bc-limit-count">{{ dailyLimit.ratePerSec }} сообщ/сек</span>
          </template>
        </template>
      </div>
    </div>

    <!-- ═══ Toolbar ═══ -->
    <div class="bc-toolbar">
      <div class="bc-toolbar-left">
        <span v-if="selected.size > 0" class="bc-selected-label">Выбрано: {{ selected.size }}</span>
        <button v-if="selected.size > 0" class="btn-tool-red" @click="archiveSelected">
          Архивировать выбранные
        </button>
      </div>
      <div class="bc-toolbar-right">
        <select v-model="pageSize" class="bc-page-size" @change="currentPage = 0">
          <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }} на стр.</option>
        </select>
        <button class="btn-create" @click="openCreate()">+ Создать рассылку</button>
      </div>
    </div>

    <!-- ═══ Table ═══ -->
    <div class="bc-table-wrap">
      <div v-if="loading && !campaigns.length" class="bc-state-loading">
        <span class="spinner"></span> Загрузка...
      </div>
      <div v-else-if="!campaigns.length" class="bc-state-empty">
        <div class="bc-state-icon">📢</div>
        <div>Рассылок пока нет. Нажмите «Создать рассылку».</div>
      </div>

      <table v-else class="bc-table">
        <thead>
          <tr>
            <th class="th-check">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            </th>
            <th class="th-edit"></th>
            <th class="th-name sortable" @click="toggleSort('name')">
              Название <span class="sort-icon">{{ sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="th-date sortable" @click="toggleSort('createdAt')">
              Создана <span class="sort-icon">{{ sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="th-date sortable" @click="toggleSort('scheduledAt')">
              Дата запуска <span class="sort-icon">{{ sortBy === 'scheduledAt' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
            </th>
            <th class="th-channel">Канал</th>
            <th class="th-audience">Аудитория</th>
            <th class="th-stats">Статистика</th>
            <th class="th-status">Статус</th>
            <th class="th-desc">Описание</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in pagedCampaigns" :key="c.id" class="bc-row" :class="{ 'bc-row-selected': selected.has(c.id) }">
            <td class="td-check" @click.stop>
              <input type="checkbox" :checked="selected.has(c.id)" @change="toggleSelect(c.id)" />
            </td>
            <td class="td-edit" @click.stop>
              <button class="btn-icon" title="Редактировать" @click="openEdit(c)">✏️</button>
            </td>
            <td class="td-name">
              <button class="bc-name-link" @click="openDetail(c)">{{ c.name }}</button>
            </td>
            <td class="td-date">{{ fmtDate(c.createdAt) }}</td>
            <td class="td-date">{{ c.scheduledAt ? fmtDate(c.scheduledAt) : '—' }}</td>
            <td class="td-channel">
              <span class="channel-badge">{{ channelLabel(c) }}</span>
            </td>
            <td class="td-audience">
              <button class="audience-link" @click="openDetail(c)">
                <template v-if="c.audienceType === 'vkIds'">{{ audienceVkCount(c) }} VK ID</template>
                <template v-else-if="c.audienceType === 'clientIds'">{{ audienceClientCount(c) }} клиентов</template>
                <template v-else>{{ c.totalCount || '—' }} клиентов</template>
              </button>
            </td>
            <td class="td-stats">
              <span v-if="c.sentCount" class="stat-sent">✓ {{ c.sentCount }}</span>
              <span v-if="c.errorCount" class="stat-err">✗ {{ c.errorCount }}</span>
              <span v-if="!c.sentCount && !c.errorCount" class="td-empty">—</span>
            </td>
            <td class="td-status">
              <span class="campaign-status" :class="statusClass(c.status)">{{ statusLabel(c.status) }}</span>
            </td>
            <td class="td-desc">
              <span class="bc-desc-text">{{ c.description || statusDesc(c) }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="loading && campaigns.length" class="bc-refresh-hint">
        <span class="spinner-sm-dark"></span>
      </div>
    </div>

    <!-- ═══ Pagination ═══ -->
    <div class="bc-footer">
      <div class="bc-footer-actions">
        <button class="btn-create" @click="openCreate()">+ Создать рассылку</button>
        <button v-if="selected.size > 0" class="btn-tool-red" @click="archiveSelected">
          Архивировать ({{ selected.size }})
        </button>
      </div>
      <div class="bc-pagination">
        <button class="pg-btn" :disabled="currentPage === 0" @click="currentPage--">← Пред</button>
        <span class="pg-info">Стр. {{ currentPage + 1 }} / {{ totalPages }}</span>
        <button class="pg-btn" :disabled="currentPage >= totalPages - 1" @click="currentPage++">След →</button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         ФОРМА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="formOpen" class="modal-overlay" @click.self="closeForm">
      <div class="modal modal-xl">
        <div class="modal-header">
          <h3 class="modal-title">{{ editingId ? 'Редактировать рассылку' : 'Новая рассылка' }}</h3>
          <button class="modal-close" @click="closeForm">✕</button>
        </div>

        <div class="modal-body">
          <div v-if="formError" class="form-error">{{ formError }}</div>

          <!-- 1. Название -->
          <div class="form-row">
            <label class="form-label">Название <span class="req">*</span></label>
            <input v-model="form.name" class="form-input" placeholder="Напр.: Акция ноябрь 2026" />
          </div>

          <!-- 2. Канал -->
          <div class="form-row">
            <label class="form-label">Канал <span class="req">*</span></label>
            <div class="channel-row">
              <span class="channel-badge channel-badge-lg">VK</span>
              <span class="channel-hint" v-if="dailyLimit?.groupId">vk.com/club{{ dailyLimit.groupId }}</span>
              <span class="channel-hint" v-else-if="dailyLimit && !dailyLimit.vkConfigured" style="color:#ef4444">VK_GROUP_TOKEN не задан</span>
            </div>
          </div>

          <!-- 3. Аудитория — табы -->
          <div class="form-row">
            <label class="form-label">Аудитория <span class="req">*</span></label>

            <div class="audience-tabs">
              <button
                v-for="tab in AUDIENCE_TABS"
                :key="tab.type"
                class="aud-tab"
                :class="{ 'aud-tab-active': form.audienceType === tab.type }"
                @click="form.audienceType = tab.type; audiencePreviewResult = null"
              >{{ tab.label }}</button>
            </div>

            <!-- vkIds tab -->
            <div v-if="form.audienceType === 'vkIds'" class="aud-panel">
              <p class="aud-hint">Вставьте VK ID или ссылки на страницы через запятую, пробел или с новой строки.</p>
              <textarea
                v-model="form.vkIdsRaw"
                class="form-textarea aud-textarea"
                rows="5"
                placeholder="123456789&#10;vk.com/durov&#10;456789012"
                @input="audiencePreviewResult = null"
              ></textarea>
              <div class="aud-counter">Распознано: {{ parsedVkIds.length }} ID</div>
            </div>

            <!-- clientIds tab -->
            <div v-if="form.audienceType === 'clientIds'" class="aud-panel">
              <p class="aud-hint">Вставьте ID наших клиентов (cuid) через запятую или с новой строки.</p>
              <textarea
                v-model="form.clientIdsRaw"
                class="form-textarea aud-textarea"
                rows="5"
                placeholder="clj3k2... &#10;clj3k3..."
                @input="audiencePreviewResult = null"
              ></textarea>
              <div class="aud-counter">Распознано: {{ parsedClientIds.length }} ID</div>
            </div>

            <!-- filter tab -->
            <div v-if="form.audienceType === 'filter'" class="aud-panel">
              <p class="aud-hint">Фильтруйте клиентов по параметрам CRM.</p>
              <div class="filter-grid">
                <div class="filter-item">
                  <label class="filter-lbl">CRM-статус</label>
                  <select v-model="form.filter.crmStatusId" class="form-input-sm" @change="audiencePreviewResult = null">
                    <option value="">Все</option>
                    <option v-for="s in crmStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
                <div class="filter-item">
                  <label class="filter-lbl">Тег</label>
                  <select v-model="form.filter.tagId" class="form-input-sm" @change="audiencePreviewResult = null">
                    <option value="">Все</option>
                    <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
                  </select>
                </div>
                <div class="filter-item">
                  <label class="filter-lbl">1-й контакт с</label>
                  <input type="date" v-model="form.filter.dateFrom" class="form-input-sm" @change="audiencePreviewResult = null" />
                </div>
                <div class="filter-item">
                  <label class="filter-lbl">по</label>
                  <input type="date" v-model="form.filter.dateTo" class="form-input-sm" @change="audiencePreviewResult = null" />
                </div>
                <div class="filter-item">
                  <label class="filter-lbl">Источник</label>
                  <input v-model="form.filter.source" class="form-input-sm" placeholder="Любой" @input="audiencePreviewResult = null" />
                </div>
                <div class="filter-item">
                  <label class="filter-lbl">Город</label>
                  <input v-model="form.filter.city" class="form-input-sm" placeholder="Любой" @input="audiencePreviewResult = null" />
                </div>
              </div>
            </div>

            <!-- Preview button & result -->
            <div class="aud-preview-row">
              <button class="btn-preview" :disabled="previewing" @click="runAudiencePreview">
                <span v-if="previewing" class="spinner-sm-dark"></span>
                {{ previewing ? 'Расчёт...' : '👁 Предпросмотр аудитории' }}
              </button>
              <div v-if="audiencePreviewResult" class="aud-preview-result" :class="{ 'aud-empty': !audiencePreviewResult.count }">
                <template v-if="audiencePreviewResult.count">
                  <strong>{{ audiencePreviewResult.count }} получателей</strong>
                  <span v-if="audiencePreviewResult.sample.length" class="preview-sample">
                    · {{ audiencePreviewResult.sample.map((s: any) => s.name).join(', ') }}{{ audiencePreviewResult.count > 5 ? ' и др.' : '' }}
                  </span>
                </template>
                <template v-else>
                  <span class="preview-warn">⚠️ Нет получателей по выбранным параметрам</span>
                </template>
              </div>
            </div>
          </div>

          <!-- 4. Сообщение -->
          <div class="form-row">
            <label class="form-label">Сообщение <span class="req">*</span></label>
            <div class="msg-toolbar">
              <button class="ins-btn" @click="insertAtCursor('[Имя]')" title="Имя клиента">[Имя]</button>
              <button class="ins-btn" @click="insertAtCursor('[Заказ.Сумма]')">[Заказ.Сумма]</button>
              <button class="ins-btn" @click="insertAtCursor('[Заказ.Номер]')">[Заказ.Номер]</button>
              <div class="msg-toolbar-sep"></div>
              <button class="ins-btn ins-btn-attach" @click="showAttachPanel = !showAttachPanel">
                📎 Вложение
              </button>
            </div>

            <!-- Attach panel -->
            <div v-if="showAttachPanel" class="attach-panel">
              <div class="attach-row" v-for="atype in ATTACH_TYPES" :key="atype.prefix">
                <span class="attach-type-label">{{ atype.label }}</span>
                <input
                  v-model="attachInputs[atype.prefix]"
                  class="form-input-sm attach-url"
                  :placeholder="atype.placeholder"
                />
                <button class="btn-attach-add" @click="insertAttachment(atype.prefix)">Вставить</button>
              </div>
            </div>

            <textarea
              ref="msgTextareaRef"
              v-model="form.messageText"
              class="form-textarea msg-textarea"
              rows="7"
              placeholder="Текст сообщения. Используйте [Имя] для подстановки имени клиента."
            ></textarea>

            <!-- Preview substitution -->
            <div class="msg-preview">
              <span class="msg-preview-label">Предпросмотр:</span>
              <span class="msg-preview-text">{{ messagePreview }}</span>
            </div>
          </div>

          <!-- 5. Отложенный запуск -->
          <div class="form-row">
            <label class="form-label">Отложенный запуск</label>
            <input type="datetime-local" v-model="form.scheduledAt" class="form-input form-input-half" />
            <span class="form-hint">Оставьте пустым для запуска вручную</span>
          </div>

          <!-- 6. Дополнительные настройки -->
          <div class="form-row">
            <button class="btn-extra-toggle" @click="showExtra = !showExtra">
              {{ showExtra ? '▾' : '▸' }} Дополнительные настройки
            </button>
            <div v-if="showExtra" class="extra-panel">
              <div class="extra-item">
                <label class="extra-label">Пауза между сообщениями, мс</label>
                <input v-model="form.throttleMs" type="number" class="form-input-sm" min="500" max="10000" step="100" />
                <span class="form-hint">Минимум 500 мс · глобальная скорость задаётся через BROADCAST_RATE_PER_SEC</span>
              </div>
              <div class="extra-item">
                <label class="extra-label">Описание статуса</label>
                <input v-model="form.description" class="form-input" placeholder="Внутренняя заметка о кампании" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="closeForm">Отмена</button>
          <button
            class="btn-primary"
            :disabled="saving || !form.name.trim() || !form.messageText.trim()"
            @click="saveCampaign(false)"
          >
            <span v-if="saving" class="spinner-sm"></span>
            {{ saving ? '...' : (editingId ? 'Сохранить' : 'Сохранить черновик') }}
          </button>
          <button
            v-if="!editingId"
            class="btn-start"
            :disabled="saving || !form.name.trim() || !form.messageText.trim()"
            @click="saveCampaign(true)"
          >
            ▶ Сохранить и запустить
          </button>
          <button
            v-if="editingId"
            class="btn-start"
            :disabled="saving"
            @click="startEditedCampaign"
          >
            ▶ Запустить
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         ДЕТАЛИ КАМПАНИИ
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="detailOpen && detailCampaign" class="modal-overlay" @click.self="detailOpen = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">{{ detailCampaign.name }}</h3>
          <span class="campaign-status" :class="statusClass(detailCampaign.status)">{{ statusLabel(detailCampaign.status) }}</span>
          <button class="modal-close" @click="detailOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <!-- Stats boxes -->
          <div class="detail-stats">
            <div class="stat-box"><div class="stat-val">{{ detailCampaign.totalCount }}</div><div class="stat-lbl">Всего</div></div>
            <div class="stat-box green"><div class="stat-val">{{ detailCampaign.sentCount }}</div><div class="stat-lbl">Отправлено</div></div>
            <div class="stat-box red" v-if="detailCampaign.errorCount"><div class="stat-val">{{ detailCampaign.errorCount }}</div><div class="stat-lbl">Ошибок</div></div>
            <div class="stat-box grey"><div class="stat-val">{{ Math.max(0, detailCampaign.totalCount - detailCampaign.sentCount - detailCampaign.errorCount) }}</div><div class="stat-lbl">В очереди</div></div>
          </div>

          <div v-if="['SENDING', 'DONE', 'PAUSED'].includes(detailCampaign.status)" class="progress-bar-wrap">
            <div class="progress-bar" :style="{ width: progressPct(detailCampaign) + '%' }"></div>
          </div>

          <!-- Info row -->
          <div class="detail-info-row">
            <div class="detail-info-item">
              <span class="di-label">Канал</span>
              <span class="channel-badge">{{ channelLabel(detailCampaign) }}</span>
            </div>
            <div class="detail-info-item">
              <span class="di-label">Тип аудитории</span>
              <span>{{ audienceTypeLabel(detailCampaign.audienceType) }}</span>
            </div>
            <div class="detail-info-item" v-if="detailCampaign.scheduledAt">
              <span class="di-label">Запланирована</span>
              <span>{{ fmtDate(detailCampaign.scheduledAt) }}</span>
            </div>
          </div>

          <!-- Message -->
          <div class="detail-message">
            <div class="detail-section-title">Текст сообщения</div>
            <div class="detail-text">{{ detailCampaign.messageText }}</div>
          </div>

          <!-- Recipients -->
          <div class="detail-section-title" style="margin-top:14px">Получатели (последние 200)</div>
          <div class="recipients-list">
            <div v-for="r in detailCampaign.recipients" :key="r.id" class="recipient-row">
              <span class="recipient-name">{{ r.clientName }}</span>
              <span class="recipient-status" :class="'rs-' + r.status.toLowerCase()">{{ recipientStatusLabel(r.status) }}</span>
              <span v-if="r.sentAt" class="recipient-time">{{ fmtTime(r.sentAt) }}</span>
              <span v-if="r.error" class="recipient-error" :title="r.error">{{ r.error.slice(0, 60) }}</span>
            </div>
            <div v-if="!detailCampaign.recipients.length" class="empty-hint">Получатели появятся после запуска</div>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="['DRAFT', 'PAUSED', 'FAILED'].includes(detailCampaign.status)" class="btn-start" @click="doStart(detailCampaign)">▶ Запустить</button>
          <button v-if="detailCampaign.status === 'SENDING'" class="btn-action-yellow" @click="doPause(detailCampaign)">⏸ Пауза</button>
          <button v-if="['SENDING', 'PAUSED'].includes(detailCampaign.status)" class="btn-action-red" @click="doCancel(detailCampaign)">✕ Отменить</button>
          <button class="btn-secondary" style="margin-left:auto" @click="detailOpen = false">Закрыть</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import type { Campaign, CampaignDetail, DailyLimitInfo, AudiencePreviewResult, CrmStatus, Tag } from '~/composables/useAssistantModule';

definePageMeta({ middleware: ['auth'] });

const api = useAssistantModule();
const router = useRouter();
const route = useRoute();

// ─── State ───────────────────────────────────────────────────────────────
const campaigns = ref<Campaign[]>([]);
const loading = ref(false);
const crmStatuses = ref<CrmStatus[]>([]);
const tags = ref<Tag[]>([]);
const dailyLimit = ref<DailyLimitInfo | null>(null);
const showBanner = ref(true);

// Table
const selected = ref<Set<string>>(new Set());
const sortBy = ref<string>('createdAt');
const sortDir = ref<'asc' | 'desc'>('desc');
const currentPage = ref(0);
const pageSize = ref(25);
const PAGE_SIZES = [10, 25, 50, 100];

// Form
const formOpen = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');
const showExtra = ref(false);
const showAttachPanel = ref(false);
const msgTextareaRef = ref<HTMLTextAreaElement | null>(null);

const emptyForm = () => ({
  name: '',
  messageText: '',
  audienceType: 'filter' as 'vkIds' | 'clientIds' | 'filter',
  vkIdsRaw: '',
  clientIdsRaw: '',
  filter: { crmStatusId: '', tagId: '', dateFrom: '', dateTo: '', source: '', city: '', country: '' },
  scheduledAt: '',
  description: '',
  throttleMs: 500,
});

const form = ref(emptyForm());
const audiencePreviewResult = ref<AudiencePreviewResult | null>(null);
const previewing = ref(false);

// Detail
const detailOpen = ref(false);
const detailCampaign = ref<CampaignDetail | null>(null);

// Attach inputs
const attachInputs = ref<Record<string, string>>({});

let pollInterval: ReturnType<typeof setInterval> | null = null;

const AUDIENCE_TABS = [
  { type: 'filter' as const, label: 'Фильтры клиентов' },
  { type: 'vkIds' as const, label: 'VK ID' },
  { type: 'clientIds' as const, label: 'ID клиентов' },
];

const ATTACH_TYPES = [
  { prefix: 'photo', label: 'Фото', placeholder: 'https://vk.com/photo-12345_678' },
  { prefix: 'video', label: 'Видео', placeholder: 'https://vk.com/video-12345_678' },
  { prefix: 'doc', label: 'Документ', placeholder: 'https://vk.com/doc-12345_678' },
  { prefix: 'clip', label: 'Клип', placeholder: 'https://vk.com/clip-12345_678' },
];

// ─── Computed ─────────────────────────────────────────────────────────────
const sortedCampaigns = computed(() => {
  const arr = [...campaigns.value];
  arr.sort((a, b) => {
    let va: any = (a as any)[sortBy.value] ?? '';
    let vb: any = (b as any)[sortBy.value] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir.value === 'asc' ? -1 : 1;
    if (va > vb) return sortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
  return arr;
});

const totalPages = computed(() => Math.max(1, Math.ceil(sortedCampaigns.value.length / pageSize.value)));

const pagedCampaigns = computed(() => {
  const start = currentPage.value * pageSize.value;
  return sortedCampaigns.value.slice(start, start + pageSize.value);
});

const allSelected = computed(() =>
  pagedCampaigns.value.length > 0 && pagedCampaigns.value.every((c) => selected.value.has(c.id))
);

const parsedVkIds = computed(() => {
  if (!form.value.vkIdsRaw.trim()) return [];
  return form.value.vkIdsRaw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .map((s) => {
      // Extract numeric ID from vk.com/id123 or just number
      const m = s.match(/(?:vk\.com\/(?:id)?)?(-?\d+)$/);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n) => !isNaN(n) && n !== 0);
});

const parsedClientIds = computed(() =>
  form.value.clientIdsRaw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);

const messagePreview = computed(() => {
  let text = form.value.messageText;
  text = text.replace(/\[Имя\]/g, 'Алексей');
  text = text.replace(/\[Заказ\.Сумма\]/g, '5 000 ₽');
  text = text.replace(/\[Заказ\.Номер\]/g, '#42');
  return text || '(пусто)';
});

// ─── Lifecycle ────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([load(), loadDirectories(), loadDailyLimit()]);
  pollInterval = setInterval(() => {
    if (campaigns.value.some((c) => c.status === 'SENDING')) load();
  }, 5000);

  // Check for pre-fill from clients page
  if (route.query.fromFilter) {
    try {
      const filter = JSON.parse(decodeURIComponent(route.query.fromFilter as string));
      openCreate({ audienceType: 'filter', filter });
    } catch {}
  }
});

onUnmounted(() => { if (pollInterval) clearInterval(pollInterval); });

// ─── Data loading ─────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  try { campaigns.value = await api.listCampaigns(); } catch { } finally { loading.value = false; }
}

async function loadDirectories() {
  try {
    [crmStatuses.value, tags.value] = await Promise.all([api.listCrmStatuses(), api.listTags()]);
  } catch {}
}

async function loadDailyLimit() {
  try { dailyLimit.value = await api.getDailyLimit(); } catch {}
}

// ─── Form open/close ──────────────────────────────────────────────────────
function openCreate(prefill?: { audienceType?: 'filter' | 'vkIds' | 'clientIds'; filter?: any }) {
  editingId.value = null;
  form.value = emptyForm();
  if (prefill) {
    if (prefill.audienceType) form.value.audienceType = prefill.audienceType;
    if (prefill.filter) {
      form.value.filter = { ...form.value.filter, ...prefill.filter };
    }
  }
  audiencePreviewResult.value = null;
  formError.value = '';
  showExtra.value = false;
  showAttachPanel.value = false;
  formOpen.value = true;

  // Auto-preview if pre-filled
  if (prefill?.filter) {
    setTimeout(() => runAudiencePreview(), 100);
  }
}

function openEdit(c: Campaign) {
  editingId.value = c.id;
  const f = emptyForm();
  f.name = c.name;
  f.messageText = c.messageText;
  f.audienceType = (c.audienceType as any) ?? 'filter';
  f.description = c.description ?? '';
  f.scheduledAt = c.scheduledAt ? c.scheduledAt.slice(0, 16) : '';
  // Restore audience config
  const cfg = c.audienceConfig ?? {};
  if (f.audienceType === 'vkIds') {
    f.vkIdsRaw = ((cfg as any).vkPeerIds ?? []).join('\n');
  } else if (f.audienceType === 'clientIds') {
    f.clientIdsRaw = ((cfg as any).clientIds ?? []).join('\n');
  } else {
    const sf = (c.segmentFilter ?? {}) as any;
    f.filter.crmStatusId = sf.crmStatusId ?? '';
    f.filter.tagId = sf.tagId ?? '';
    f.filter.dateFrom = sf.dateFrom ?? '';
    f.filter.dateTo = sf.dateTo ?? '';
    f.filter.source = sf.source ?? '';
    f.filter.city = sf.city ?? '';
  }
  form.value = f;
  audiencePreviewResult.value = null;
  formError.value = '';
  showExtra.value = false;
  showAttachPanel.value = false;
  formOpen.value = true;
}

function closeForm() {
  formOpen.value = false;
  editingId.value = null;
}

// ─── Save ─────────────────────────────────────────────────────────────────
async function saveCampaign(andStart = false) {
  formError.value = '';
  saving.value = true;
  try {
    const payload = buildPayload();
    let campaign: Campaign;
    if (editingId.value) {
      campaign = await api.updateCampaign(editingId.value, payload);
    } else {
      campaign = await api.createCampaign(payload);
    }
    formOpen.value = false;
    if (andStart) {
      await doStartById(campaign.id);
    }
    await load();
  } catch (e: any) {
    formError.value = e?.data?.message ?? e?.message ?? 'Ошибка сохранения';
  } finally {
    saving.value = false;
  }
}

async function startEditedCampaign() {
  if (!editingId.value) return;
  saving.value = true;
  try {
    const payload = buildPayload();
    await api.updateCampaign(editingId.value, payload);
    formOpen.value = false;
    await doStartById(editingId.value);
    await load();
  } catch (e: any) {
    formError.value = e?.data?.message ?? e?.message ?? 'Ошибка';
  } finally {
    saving.value = false;
  }
}

function buildPayload() {
  const { audienceType, name, messageText, description, scheduledAt } = form.value;

  let audienceConfig: any = {};
  let segmentFilter: any = {};

  if (audienceType === 'vkIds') {
    audienceConfig = { vkPeerIds: parsedVkIds.value };
  } else if (audienceType === 'clientIds') {
    audienceConfig = { clientIds: parsedClientIds.value };
  } else {
    const f = form.value.filter;
    segmentFilter = {};
    if (f.crmStatusId) segmentFilter.crmStatusId = f.crmStatusId;
    if (f.tagId) segmentFilter.tagId = f.tagId;
    if (f.dateFrom) segmentFilter.dateFrom = f.dateFrom;
    if (f.dateTo) segmentFilter.dateTo = f.dateTo;
    if (f.source) segmentFilter.source = f.source;
    if (f.city) segmentFilter.city = f.city;
  }

  return {
    name: name.trim(),
    messageText: messageText.trim(),
    audienceType,
    audienceConfig,
    segmentFilter,
    channel: 'VK',
    description: description.trim(),
    scheduledAt: scheduledAt || undefined,
  };
}

// ─── Audience preview ─────────────────────────────────────────────────────
async function runAudiencePreview() {
  previewing.value = true;
  try {
    const { audienceType } = form.value;
    let payload: any = { audienceType };

    if (audienceType === 'vkIds') {
      payload.audienceConfig = { vkPeerIds: parsedVkIds.value };
    } else if (audienceType === 'clientIds') {
      payload.audienceConfig = { clientIds: parsedClientIds.value };
    } else {
      const f = form.value.filter;
      const sf: any = {};
      if (f.crmStatusId) sf.crmStatusId = f.crmStatusId;
      if (f.tagId) sf.tagId = f.tagId;
      if (f.dateFrom) sf.dateFrom = f.dateFrom;
      if (f.dateTo) sf.dateTo = f.dateTo;
      if (f.source) sf.source = f.source;
      if (f.city) sf.city = f.city;
      payload.segmentFilter = sf;
    }

    audiencePreviewResult.value = await api.audiencePreview(payload);
  } catch { } finally {
    previewing.value = false;
  }
}

// ─── Message field helpers ─────────────────────────────────────────────────
function insertAtCursor(text: string) {
  const el = msgTextareaRef.value;
  if (!el) { form.value.messageText += text; return; }
  const start = el.selectionStart ?? form.value.messageText.length;
  const end = el.selectionEnd ?? start;
  form.value.messageText = form.value.messageText.slice(0, start) + text + form.value.messageText.slice(end);
  nextTick(() => { el.selectionStart = el.selectionEnd = start + text.length; el.focus(); });
}

function insertAttachment(type: string) {
  const url = (attachInputs.value[type] ?? '').trim();
  if (!url) return;
  // Try to extract marker from URL
  const typeRe = type.replace('_', '_?');
  const pattern = new RegExp(`(?:vk\\.com/)?${typeRe}(-?\\d+_\\d+)`);
  const match = url.match(pattern);
  const marker = match ? `[${type}${match[1]}]` : `[${type}${url}]`;
  insertAtCursor(marker);
  attachInputs.value[type] = '';
}

// ─── Campaign actions ──────────────────────────────────────────────────────
async function doStart(c: Campaign) {
  try {
    await api.startCampaign(c.id);
    detailOpen.value = false;
    await load();
  } catch (e: any) { alert(e?.data?.message ?? 'Ошибка запуска'); }
}

async function doStartById(id: string) {
  try { await api.startCampaign(id); } catch (e: any) { alert(e?.data?.message ?? 'Ошибка запуска'); }
}

async function doPause(c: Campaign) {
  await api.pauseCampaign(c.id).catch(() => {});
  detailOpen.value = false;
  await load();
}

async function doCancel(c: Campaign) {
  if (!confirm('Отменить рассылку?')) return;
  await api.cancelCampaign(c.id).catch(() => {});
  detailOpen.value = false;
  await load();
}

async function openDetail(c: Campaign) {
  try {
    detailCampaign.value = await api.getCampaign(c.id);
    detailOpen.value = true;
  } catch {}
}

async function archiveSelected() {
  if (!confirm(`Архивировать ${selected.value.size} кампаний?`)) return;
  const ids = [...selected.value];
  await Promise.all(ids.map((id) => api.archiveCampaign(id).catch(() => {})));
  selected.value.clear();
  await load();
}

// ─── Selection ────────────────────────────────────────────────────────────
function toggleSelect(id: string) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  selected.value = s;
}

function toggleAll() {
  if (allSelected.value) {
    const s = new Set(selected.value);
    pagedCampaigns.value.forEach((c) => s.delete(c.id));
    selected.value = s;
  } else {
    const s = new Set(selected.value);
    pagedCampaigns.value.forEach((c) => s.add(c.id));
    selected.value = s;
  }
}

function toggleSort(col: string) {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = col;
    sortDir.value = 'asc';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function channelLabel(c: Campaign) {
  const gid = dailyLimit.value?.groupId;
  if (c.channel === 'VK' && gid) return `vk.com/club${gid}`;
  return c.channel ?? 'VK';
}

function audienceVkCount(c: Campaign) {
  return ((c.audienceConfig as any)?.vkPeerIds?.length ?? c.totalCount) || '?';
}

function audienceClientCount(c: Campaign) {
  return ((c.audienceConfig as any)?.clientIds?.length ?? c.totalCount) || '?';
}

function audienceTypeLabel(t: string) {
  const m: Record<string, string> = { vkIds: 'VK ID', clientIds: 'ID клиентов', filter: 'Фильтры CRM' };
  return m[t] ?? t;
}

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: 'Черновик', SCHEDULED: 'Запланирована', SENDING: 'Отправляется', DONE: 'Выполнена', PAUSED: 'Пауза', FAILED: 'Ошибка' };
  return m[s] ?? s;
}

function statusClass(s: string) {
  const m: Record<string, string> = { DRAFT: 'sc-gray', SCHEDULED: 'sc-blue', SENDING: 'sc-green-anim', DONE: 'sc-teal', PAUSED: 'sc-yellow', FAILED: 'sc-red' };
  return m[s] ?? '';
}

function statusDesc(c: Campaign) {
  if (c.status === 'SENDING') return `В процессе · ${c.sentCount}/${c.totalCount}`;
  if (c.status === 'DONE') return `Завершена · отправлено ${c.sentCount}`;
  if (c.status === 'FAILED') return 'Отменена';
  return '';
}

function recipientStatusLabel(s: string) {
  return { PENDING: 'В очереди', SENT: 'Отправлено', ERROR: 'Ошибка', SKIPPED: 'Пропущено' }[s] ?? s;
}

function progressPct(c: Campaign) {
  if (!c.totalCount) return 0;
  return Math.min(100, Math.round(((c.sentCount + c.errorCount) / c.totalCount) * 100));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
/* ─── Layout ─────────────────────────────────────────────────────────────── */
.bc-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }

/* ─── Info banner ────────────────────────────────────────────────────────── */
.bc-banner {
  display: flex; align-items: flex-start; gap: 10px;
  background: #eff6ff; border-bottom: 1px solid #bfdbfe;
  padding: 10px 20px; font-size: 13px; color: #1e40af; flex-shrink: 0;
}
.bc-banner-text { flex: 1; line-height: 1.5; }
.bc-banner-close { background: none; border: none; cursor: pointer; color: #93c5fd; font-size: 16px; flex-shrink: 0; padding: 0; }
.bc-banner-close:hover { color: #1e40af; }

/* ─── Daily limit bar ────────────────────────────────────────────────────── */
.bc-limit-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 20px; background: #fff; border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0; flex-wrap: wrap;
}
.bc-limit-info { flex: 1; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #475569; flex-wrap: wrap; }
.bc-limit-count { font-size: 18px; font-weight: 700; color: #059669; }
.bc-limit-low { color: #ef4444; }
.bc-limit-label { color: #64748b; font-size: 13px; }
.bc-limit-warn { color: #ef4444; font-weight: 600; }
.bc-limit-link { font-size: 12px; color: #6366f1; background: none; border: none; cursor: pointer; text-decoration: underline; white-space: nowrap; }

/* ─── Toolbar ────────────────────────────────────────────────────────────── */
.bc-toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 20px; flex-shrink: 0; flex-wrap: wrap; }
.bc-toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
.bc-toolbar-right { display: flex; align-items: center; gap: 8px; }
.bc-selected-label { font-size: 13px; color: #6366f1; font-weight: 600; }
.bc-page-size { border: 1px solid #d1d5db; border-radius: 7px; padding: 5px 8px; font-size: 12px; background: #fff; cursor: pointer; }
.btn-create { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 600; white-space: nowrap; }
.btn-create:hover { background: #4f46e5; }
.btn-tool-red { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }

/* ─── Table ──────────────────────────────────────────────────────────────── */
.bc-table-wrap { flex: 1; overflow: auto; padding: 0 20px; }
.bc-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 900px; }
.bc-table thead tr { background: #f8fafc; border-bottom: 2px solid #e5e7eb; }
.bc-table th { padding: 9px 10px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
.bc-table th.sortable { cursor: pointer; user-select: none; }
.bc-table th.sortable:hover { color: #1e293b; }
.sort-icon { font-size: 11px; color: #94a3b8; margin-left: 2px; }
.bc-row { border-bottom: 1px solid #f1f5f9; transition: background 0.1s; }
.bc-row:hover { background: #fafbfc; }
.bc-row-selected { background: #eff6ff !important; }
.bc-table td { padding: 8px 10px; vertical-align: middle; }
.td-check { width: 32px; }
.td-edit { width: 30px; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 4px; }
.btn-icon:hover { background: #f1f5f9; }
.td-name { max-width: 200px; }
.bc-name-link { background: none; border: none; color: #4f46e5; font-weight: 600; font-size: 13px; cursor: pointer; text-align: left; padding: 0; text-decoration: underline; text-decoration-style: dashed; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; display: block; }
.bc-name-link:hover { color: #312e81; }
.td-date { white-space: nowrap; color: #64748b; font-size: 12px; }
.td-channel { white-space: nowrap; }
.channel-badge { background: #ede9fe; color: #4f46e5; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
.channel-badge-lg { font-size: 13px; padding: 4px 12px; }
.channel-hint { font-size: 12px; color: #64748b; }
.audience-link { background: none; border: none; color: #0f766e; font-size: 13px; cursor: pointer; text-decoration: underline; text-decoration-style: dashed; padding: 0; }
.audience-link:hover { color: #134e4a; }
.td-stats { white-space: nowrap; }
.stat-sent { color: #059669; font-weight: 600; font-size: 12px; margin-right: 6px; }
.stat-err { color: #ef4444; font-weight: 600; font-size: 12px; }
.td-empty { color: #cbd5e1; }
.td-status { white-space: nowrap; }
.td-desc { max-width: 160px; }
.bc-desc-text { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 150px; }

.campaign-status { padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; display: inline-block; }
.sc-gray { background: #f1f5f9; color: #64748b; }
.sc-blue { background: #eff6ff; color: #2563eb; }
.sc-green-anim { background: #dcfce7; color: #059669; animation: pulse-green 2s infinite; }
@keyframes pulse-green { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
.sc-teal { background: #ccfbf1; color: #0f766e; }
.sc-yellow { background: #fef9c3; color: #a16207; }
.sc-red { background: #fef2f2; color: #ef4444; }

.bc-refresh-hint { display: flex; justify-content: center; padding: 8px; }

/* ─── Footer pagination ──────────────────────────────────────────────────── */
.bc-footer { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; flex-wrap: wrap; }
.bc-footer-actions { display: flex; gap: 8px; flex: 1; }
.bc-pagination { display: flex; align-items: center; gap: 8px; }
.pg-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 7px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.pg-btn:disabled { opacity: 0.4; cursor: default; }
.pg-btn:hover:not(:disabled) { background: #e2e8f0; }
.pg-info { font-size: 12px; color: #64748b; }

/* ─── Modal ──────────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 560px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-xl { max-width: 720px; }
.modal-lg { max-width: 660px; }
.modal-header { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; flex: 1; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { display: flex; gap: 8px; align-items: center; padding: 12px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; flex-wrap: wrap; }

/* ─── Form ───────────────────────────────────────────────────────────────── */
.form-error { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 12px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.4px; }
.req { color: #ef4444; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-input-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; background: #fff; min-width: 0; flex: 1; }
.form-input-half { max-width: 240px; }
.form-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
.form-hint { font-size: 11px; color: #94a3b8; }

/* Channel row */
.channel-row { display: flex; align-items: center; gap: 10px; }

/* Audience tabs */
.audience-tabs { display: flex; gap: 2px; background: #f1f5f9; border-radius: 8px; padding: 2px; width: fit-content; }
.aud-tab { background: none; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; transition: background 0.15s, color 0.15s; }
.aud-tab-active { background: #fff; color: #4f46e5; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.aud-panel { padding: 10px; background: #f8fafc; border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
.aud-hint { font-size: 12px; color: #64748b; margin: 0; }
.aud-textarea { height: 100px; resize: vertical; }
.aud-counter { font-size: 12px; color: #059669; font-weight: 600; }

.filter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.filter-item { display: flex; flex-direction: column; gap: 3px; }
.filter-lbl { font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; }

.aud-preview-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.aud-preview-result { font-size: 13px; padding: 6px 12px; background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; flex: 1; }
.aud-empty { background: #fef9c3; border-color: #fde68a; }
.preview-sample { color: #64748b; font-size: 12px; }
.preview-warn { color: #f59e0b; font-weight: 600; }
.btn-preview { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
.btn-preview:disabled { opacity: 0.6; cursor: not-allowed; }

/* Message toolbar */
.msg-toolbar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ins-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; font-family: monospace; }
.ins-btn:hover { background: #e2e8f0; }
.ins-btn-attach { background: #fef3c7; border-color: #fde68a; color: #92400e; }
.msg-toolbar-sep { width: 1px; height: 20px; background: #e2e8f0; margin: 0 2px; }
.msg-textarea { min-height: 120px; }

.attach-panel { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.attach-row { display: flex; align-items: center; gap: 8px; }
.attach-type-label { font-size: 11px; font-weight: 700; color: #92400e; min-width: 60px; text-transform: uppercase; }
.attach-url { flex: 1; }
.btn-attach-add { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }

.msg-preview { background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; padding: 8px 12px; display: flex; gap: 8px; font-size: 12px; }
.msg-preview-label { color: #059669; font-weight: 600; white-space: nowrap; }
.msg-preview-text { color: #1e293b; white-space: pre-wrap; word-break: break-word; }

/* Extra settings */
.btn-extra-toggle { background: none; border: none; color: #6366f1; font-size: 13px; cursor: pointer; padding: 0; font-weight: 600; }
.extra-panel { background: #f8fafc; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.extra-item { display: flex; flex-direction: column; gap: 4px; }
.extra-label { font-size: 12px; font-weight: 600; color: #374151; }

/* Buttons */
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: #4f46e5; }
.btn-start { background: #059669; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; font-weight: 600; }
.btn-start:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-start:hover:not(:disabled) { background: #047857; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.btn-action-yellow { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; border-radius: 7px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }
.btn-action-red { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 7px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }

/* Detail */
.detail-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.stat-box { background: #f8fafc; border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 70px; }
.stat-box.green { background: #f0fdf4; }
.stat-box.red { background: #fef2f2; }
.stat-box.grey { background: #f1f5f9; }
.stat-val { font-size: 22px; font-weight: 700; color: #1e293b; }
.stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }

.progress-bar-wrap { height: 6px; background: #e2e8f0; border-radius: 3px; margin: 8px 0; overflow: hidden; }
.progress-bar { height: 100%; background: #10b981; border-radius: 3px; transition: width 0.5s; }

.detail-info-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
.detail-info-item { display: flex; flex-direction: column; gap: 2px; }
.di-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }

.detail-message { background: #f8fafc; border-radius: 8px; padding: 12px; }
.detail-section-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.detail-text { font-size: 13px; color: #1e293b; line-height: 1.5; white-space: pre-wrap; }

.recipients-list { display: flex; flex-direction: column; gap: 3px; max-height: 220px; overflow-y: auto; }
.recipient-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #f8fafc; border-radius: 6px; font-size: 12px; }
.recipient-name { flex: 1; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recipient-status { padding: 1px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; flex-shrink: 0; }
.rs-pending { background: #f1f5f9; color: #64748b; }
.rs-sent { background: #dcfce7; color: #059669; }
.rs-error { background: #fef2f2; color: #ef4444; }
.rs-skipped { background: #fef9c3; color: #a16207; }
.recipient-time { color: #94a3b8; flex-shrink: 0; }
.recipient-error { color: #ef4444; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.empty-hint { font-size: 13px; color: #94a3b8; padding: 8px 0; }

/* Spinners */
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm-dark { display: inline-block; width: 12px; height: 12px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.bc-state-loading, .bc-state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.bc-state-icon { font-size: 48px; }

/* ─── Mobile ─────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .bc-table-wrap { padding: 0 10px; }
  .bc-toolbar { padding: 8px 10px; }
  .bc-limit-bar { padding: 8px 10px; }
  .bc-footer { padding: 10px; }
  .filter-grid { grid-template-columns: 1fr; }
  .th-desc, .td-desc { display: none; }
  .th-date:nth-child(5), .td-date:nth-child(5) { display: none; }
}
</style>
