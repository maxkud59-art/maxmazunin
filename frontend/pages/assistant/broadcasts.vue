<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Рассылки</h1>
      <button class="btn-create" @click="openCreate">+ Новая рассылка</button>
    </div>

    <div class="content-area">
      <div v-if="loading" class="state-loading"><span class="spinner"></span> Загрузка...</div>
      <div v-else-if="!campaigns.length" class="state-empty">
        <div class="state-icon">📢</div>
        <div>Нет рассылок. Создайте первую кампанию.</div>
      </div>

      <div v-else class="campaigns-list">
        <div v-for="c in campaigns" :key="c.id" class="campaign-card" @click="openDetail(c)">
          <div class="campaign-top">
            <span class="campaign-name">{{ c.name }}</span>
            <span class="campaign-status" :class="statusClass(c.status)">{{ statusLabel(c.status) }}</span>
          </div>
          <div class="campaign-meta">
            <span>VK · {{ c.totalCount }} получателей</span>
            <span v-if="c.status === 'SENDING' || c.status === 'DONE' || c.status === 'PAUSED'">
              Отправлено: {{ c.sentCount }} / {{ c.totalCount }}
              <span v-if="c.errorCount"> · Ошибок: {{ c.errorCount }}</span>
            </span>
          </div>
          <div class="campaign-text">{{ c.messageText.slice(0, 100) }}{{ c.messageText.length > 100 ? '...' : '' }}</div>
          <div class="campaign-actions" @click.stop>
            <button v-if="c.status === 'DRAFT' || c.status === 'PAUSED' || c.status === 'FAILED'" class="btn-action-green" @click.stop="startCampaign(c)">▶ Запустить</button>
            <button v-if="c.status === 'SENDING'" class="btn-action-yellow" @click.stop="pauseCampaign(c)">⏸ Пауза</button>
            <button v-if="c.status === 'SENDING' || c.status === 'PAUSED'" class="btn-action-red" @click.stop="cancelCampaign(c)">✕ Отменить</button>
          </div>
          <!-- Progress bar -->
          <div v-if="c.status === 'SENDING' || c.status === 'DONE'" class="progress-bar-wrap">
            <div class="progress-bar" :style="{ width: progressPct(c) + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit campaign modal -->
    <div v-if="formModal" class="modal-overlay" @click.self="formModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Новая рассылка</h3>
          <button class="modal-close" @click="formModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="formError" class="form-error">{{ formError }}</div>

          <div class="form-section-title">1. Название кампании</div>
          <input v-model="form.name" class="form-input" placeholder="Напр.: Акция ноябрь 2026" />

          <div class="form-section-title">2. Текст сообщения</div>
          <textarea v-model="form.messageText" class="form-textarea" rows="5" placeholder="Текст сообщения для рассылки..."></textarea>

          <div class="form-section-title">3. Сегмент получателей</div>
          <div class="segment-form">
            <div class="segment-row">
              <label class="seg-label">CRM-статус</label>
              <select v-model="form.segmentFilter.crmStatusId" class="form-input-sm">
                <option value="">Все</option>
                <option v-for="s in crmStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="segment-row">
              <label class="seg-label">Тег</label>
              <select v-model="form.segmentFilter.tagId" class="form-input-sm">
                <option value="">Все</option>
                <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="segment-row">
              <label class="seg-label">Первый контакт с</label>
              <input type="date" v-model="form.segmentFilter.dateFrom" class="form-input-sm" />
            </div>
            <div class="segment-row">
              <label class="seg-label">по</label>
              <input type="date" v-model="form.segmentFilter.dateTo" class="form-input-sm" />
            </div>
          </div>

          <button class="btn-preview" :disabled="previewing" @click="previewSegment">
            <span v-if="previewing" class="spinner-sm-dark"></span>
            {{ previewing ? 'Расчёт...' : '👁 Предпросмотр сегмента' }}
          </button>

          <div v-if="segmentPreview" class="segment-preview">
            <strong>Получателей: {{ segmentPreview.count }}</strong>
            <div v-if="segmentPreview.sample.length" class="preview-sample">
              Примеры: {{ segmentPreview.sample.map((s: any) => s.name).join(', ') }}{{ segmentPreview.count > 5 ? ' и ещё...' : '' }}
            </div>
            <div v-if="!segmentPreview.count" class="preview-warning">⚠️ Нет получателей по выбранным фильтрам</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="formModal = false">Отмена</button>
          <button class="btn-primary" :disabled="saving || !form.name.trim() || !form.messageText.trim()" @click="saveCampaign">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' ...' : 'Создать черновик' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Campaign detail modal -->
    <div v-if="detailModal && detailCampaign" class="modal-overlay" @click.self="detailModal = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">{{ detailCampaign.name }}</h3>
          <span class="campaign-status" :class="statusClass(detailCampaign.status)">{{ statusLabel(detailCampaign.status) }}</span>
          <button class="modal-close" @click="detailModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-stats">
            <div class="stat-box"><div class="stat-val">{{ detailCampaign.totalCount }}</div><div class="stat-lbl">Всего</div></div>
            <div class="stat-box green"><div class="stat-val">{{ detailCampaign.sentCount }}</div><div class="stat-lbl">Отправлено</div></div>
            <div class="stat-box red" v-if="detailCampaign.errorCount"><div class="stat-val">{{ detailCampaign.errorCount }}</div><div class="stat-lbl">Ошибок</div></div>
            <div class="stat-box grey"><div class="stat-val">{{ detailCampaign.totalCount - detailCampaign.sentCount - detailCampaign.errorCount }}</div><div class="stat-lbl">Осталось</div></div>
          </div>

          <div v-if="detailCampaign.status === 'SENDING' || detailCampaign.status === 'DONE'" class="progress-bar-wrap large">
            <div class="progress-bar" :style="{ width: progressPct(detailCampaign) + '%' }"></div>
          </div>

          <div class="detail-message">
            <div class="detail-section-title">Текст сообщения</div>
            <div class="detail-text">{{ detailCampaign.messageText }}</div>
          </div>

          <div class="detail-section-title" style="margin-top:16px">Получатели (последние 200)</div>
          <div class="recipients-list">
            <div v-for="r in detailCampaign.recipients" :key="r.id" class="recipient-row">
              <span class="recipient-name">{{ r.clientName }}</span>
              <span class="recipient-status" :class="'rs-' + r.status.toLowerCase()">{{ r.status }}</span>
              <span v-if="r.sentAt" class="recipient-time">{{ fmtTime(r.sentAt) }}</span>
              <span v-if="r.error" class="recipient-error">{{ r.error }}</span>
            </div>
            <div v-if="!detailCampaign.recipients.length" class="empty-hint">Получатели появятся после запуска</div>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="detailCampaign.status === 'DRAFT' || detailCampaign.status === 'PAUSED' || detailCampaign.status === 'FAILED'" class="btn-action-green" @click="startCampaign(detailCampaign); detailModal = false">▶ Запустить</button>
          <button v-if="detailCampaign.status === 'SENDING'" class="btn-action-yellow" @click="pauseCampaign(detailCampaign); detailModal = false">⏸ Пауза</button>
          <button v-if="detailCampaign.status === 'SENDING' || detailCampaign.status === 'PAUSED'" class="btn-action-red" @click="cancelCampaign(detailCampaign); detailModal = false">✕ Отменить</button>
          <button class="btn-secondary" @click="detailModal = false">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Campaign, CampaignDetail, CrmStatus, Tag } from '~/composables/useAssistantModule';

const api = useAssistantModule();

const campaigns = ref<Campaign[]>([]);
const loading = ref(false);
const crmStatuses = ref<CrmStatus[]>([]);
const tags = ref<Tag[]>([]);

const formModal = ref(false);
const form = ref({ name: '', messageText: '', segmentFilter: { crmStatusId: '', tagId: '', dateFrom: '', dateTo: '' } });
const saving = ref(false);
const formError = ref('');
const previewing = ref(false);
const segmentPreview = ref<any>(null);

const detailModal = ref(false);
const detailCampaign = ref<CampaignDetail | null>(null);

let pollInterval: any = null;

onMounted(async () => {
  await Promise.all([load(), loadDirectories()]);
  pollInterval = setInterval(load, 5000);
});

onUnmounted(() => { if (pollInterval) clearInterval(pollInterval); });

async function load() {
  if (!loading.value) loading.value = true;
  try { campaigns.value = await api.listCampaigns(); } catch { } finally { loading.value = false; }
}

async function loadDirectories() {
  [crmStatuses.value, tags.value] = await Promise.all([api.listCrmStatuses(), api.listTags()]);
}

function openCreate() {
  form.value = { name: '', messageText: '', segmentFilter: { crmStatusId: '', tagId: '', dateFrom: '', dateTo: '' } };
  segmentPreview.value = null;
  formError.value = '';
  formModal.value = true;
}

async function previewSegment() {
  previewing.value = true;
  try {
    const f = form.value.segmentFilter;
    segmentPreview.value = await api.previewSegment({
      crmStatusId: f.crmStatusId || undefined,
      tagId: f.tagId || undefined,
      dateFrom: f.dateFrom || undefined,
      dateTo: f.dateTo || undefined,
    });
  } catch { } finally { previewing.value = false; }
}

async function saveCampaign() {
  formError.value = '';
  saving.value = true;
  try {
    const f = form.value.segmentFilter;
    const filter: any = {};
    if (f.crmStatusId) filter.crmStatusId = f.crmStatusId;
    if (f.tagId) filter.tagId = f.tagId;
    if (f.dateFrom) filter.dateFrom = f.dateFrom;
    if (f.dateTo) filter.dateTo = f.dateTo;
    await api.createCampaign({ name: form.value.name, messageText: form.value.messageText, segmentFilter: filter });
    formModal.value = false;
    await load();
  } catch (e: any) {
    formError.value = e?.data?.message ?? 'Ошибка создания';
  } finally { saving.value = false; }
}

async function openDetail(c: Campaign) {
  detailCampaign.value = await api.getCampaign(c.id).catch(() => null);
  detailModal.value = true;
}

async function startCampaign(c: Campaign) {
  try { await api.startCampaign(c.id); await load(); }
  catch (e: any) { alert(e?.data?.message ?? 'Ошибка запуска'); }
}

async function pauseCampaign(c: Campaign) {
  await api.pauseCampaign(c.id).catch(() => {});
  await load();
}

async function cancelCampaign(c: Campaign) {
  if (!confirm('Отменить рассылку?')) return;
  await api.cancelCampaign(c.id).catch(() => {});
  await load();
}

function progressPct(c: Campaign) {
  if (!c.totalCount) return 0;
  return Math.round((c.sentCount / c.totalCount) * 100);
}

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: 'Черновик', SCHEDULED: 'Запланировано', SENDING: 'Отправляется', DONE: 'Завершено', PAUSED: 'Пауза', FAILED: 'Ошибка' };
  return m[s] ?? s;
}

function statusClass(s: string) {
  const m: Record<string, string> = { DRAFT: 'sc-gray', SCHEDULED: 'sc-blue', SENDING: 'sc-green', DONE: 'sc-teal', PAUSED: 'sc-yellow', FAILED: 'sc-red' };
  return m[s] ?? '';
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }
.tab-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px; flex-shrink: 0; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.btn-create { margin-left: auto; background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }

.content-area { flex: 1; overflow-y: auto; padding: 16px 20px; }
.state-loading, .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.state-icon { font-size: 48px; }

.campaigns-list { display: flex; flex-direction: column; gap: 10px; }
.campaign-card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; transition: box-shadow 0.15s; }
.campaign-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.campaign-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.campaign-name { font-weight: 700; font-size: 14px; color: #1e293b; flex: 1; }
.campaign-meta { font-size: 12px; color: #64748b; margin-bottom: 6px; display: flex; gap: 10px; }
.campaign-text { font-size: 13px; color: #475569; line-height: 1.4; }
.campaign-actions { display: flex; gap: 8px; margin-top: 10px; }
.progress-bar-wrap { height: 4px; background: #e2e8f0; border-radius: 2px; margin-top: 8px; overflow: hidden; }
.progress-bar-wrap.large { height: 8px; border-radius: 4px; margin: 10px 0; }
.progress-bar { height: 100%; background: #10b981; border-radius: 2px; transition: width 0.5s; }

.campaign-status { padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.sc-gray { background: #f1f5f9; color: #64748b; }
.sc-blue { background: #eff6ff; color: #2563eb; }
.sc-green { background: #dcfce7; color: #059669; }
.sc-teal { background: #ccfbf1; color: #0f766e; }
.sc-yellow { background: #fef9c3; color: #a16207; }
.sc-red { background: #fef2f2; color: #ef4444; }

.btn-action-green { background: #dcfce7; color: #059669; border: 1px solid #a7f3d0; border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
.btn-action-yellow { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
.btn-action-red { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-lg { max-width: 680px; }
.modal-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; flex: 1; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.form-error { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.form-section-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-input-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; background: #fff; min-width: 0; flex: 1; }
.form-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }

.segment-form { background: #f8fafc; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.segment-row { display: flex; align-items: center; gap: 10px; }
.seg-label { font-size: 12px; color: #64748b; min-width: 120px; }

.btn-preview { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; width: fit-content; }
.btn-preview:disabled { opacity: 0.6; cursor: not-allowed; }

.segment-preview { background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
.preview-sample { color: #64748b; font-size: 12px; margin-top: 4px; }
.preview-warning { color: #f59e0b; font-weight: 600; margin-top: 4px; }

.detail-stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.stat-box { background: #f8fafc; border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 70px; }
.stat-box.green { background: #f0fdf4; }
.stat-box.red { background: #fef2f2; }
.stat-box.grey { background: #f1f5f9; }
.stat-val { font-size: 22px; font-weight: 700; color: #1e293b; }
.stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }

.detail-message { background: #f8fafc; border-radius: 8px; padding: 12px; }
.detail-section-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.detail-text { font-size: 13px; color: #1e293b; line-height: 1.5; white-space: pre-wrap; }

.recipients-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
.recipient-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #f8fafc; border-radius: 6px; font-size: 12px; }
.recipient-name { flex: 1; color: #1e293b; }
.recipient-status { padding: 1px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; }
.rs-pending { background: #f1f5f9; color: #64748b; }
.rs-sent { background: #dcfce7; color: #059669; }
.rs-error { background: #fef2f2; color: #ef4444; }
.rs-skipped { background: #fef9c3; color: #a16207; }
.recipient-time { color: #94a3b8; }
.recipient-error { color: #ef4444; font-size: 11px; }
.empty-hint { font-size: 13px; color: #94a3b8; padding: 8px 0; }

.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm-dark { display: inline-block; width: 12px; height: 12px; border: 2px solid #d1d5db; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
