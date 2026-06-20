<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Настройка ИИ-ассистента</h1>
    </div>

    <div class="subtab-bar">
      <button v-for="t in SUBTABS" :key="t.id" class="subtab" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">{{ t.label }}</button>
    </div>

    <div class="content-area">

      <!-- System prompt tab -->
      <template v-if="activeTab === 'prompt'">
        <div v-if="loadingSettings" class="state-loading"><span class="spinner"></span></div>
        <div v-else class="settings-card">
          <div class="card-section">
            <div class="section-title">Системный контекст</div>
            <div class="section-hint">Описание бизнеса, тон общения, правила ответа. ИИ получает этот текст перед каждым диалогом.</div>
            <textarea v-model="settings.systemPrompt" class="prompt-textarea" rows="12" placeholder="Напр.: Ты менеджер по продажам фотокниг в компании EasyBook. Твоя задача — вежливо отвечать на вопросы клиентов, уточнять детали заказа и помогать выбрать подходящий продукт..."></textarea>
          </div>

          <div class="card-section">
            <div class="section-title">Параметры модели</div>
            <div class="params-grid">
              <label class="param-label">Провайдер</label>
              <select v-model="settings.provider" class="param-input">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>

              <label class="param-label">Модель</label>
              <input v-model="settings.model" class="param-input" placeholder="claude-haiku-4-5-20251001" />

              <label class="param-label">Температура</label>
              <div class="temp-row">
                <input type="range" v-model.number="settings.temperature" min="0" max="2" step="0.1" class="temp-slider" />
                <span class="temp-val">{{ settings.temperature }}</span>
              </div>

              <label class="param-label">Режим</label>
              <div class="mode-toggle">
                <label class="toggle-opt" :class="{ active: settings.draftMode }">
                  <input type="radio" :value="true" v-model="settings.draftMode" />
                  Черновик (ИИ предлагает, менеджер отправляет)
                </label>
                <label class="toggle-opt" :class="{ active: !settings.draftMode }">
                  <input type="radio" :value="false" v-model="settings.draftMode" />
                  Автоответ (ИИ отправляет сам)
                </label>
              </div>
            </div>
          </div>

          <div class="info-box">
            <strong>🔑 API-ключ ИИ-провайдера</strong> хранится в <code>.env</code> на сервере (<code>AI_API_KEY</code>). Впишите его вручную на сервере.
          </div>

          <div class="card-footer">
            <button class="btn-primary" :disabled="saving" @click="saveSettings">
              <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' Сохранение...' : 'Сохранить настройки' }}
            </button>
            <span v-if="saved" class="save-ok">✓ Сохранено</span>
          </div>
        </div>
      </template>

      <!-- Knowledge base tab -->
      <template v-if="activeTab === 'knowledge'">
        <div class="knowledge-header">
          <div class="knowledge-hint">Вопросы/ответы, прайсы, условия — ИИ использует их при составлении ответов.</div>
          <button class="btn-add" @click="openCreateEntry">+ Добавить запись</button>
        </div>

        <div v-if="loadingKnowledge" class="state-loading"><span class="spinner"></span></div>
        <div v-else-if="!entries.length" class="state-empty">
          <div class="state-icon">📚</div>
          <div>База знаний пуста. Добавьте первую запись.</div>
        </div>
        <div v-else class="entries-list">
          <!-- Grouped by category -->
          <div v-for="group in groupedEntries" :key="group.category" class="entry-group">
            <div class="group-title">{{ group.category }}</div>
            <div v-for="e in group.entries" :key="e.id" class="entry-item" :class="{ disabled: !e.enabled }">
              <div class="entry-main">
                <div class="entry-title">{{ e.title }}</div>
                <div class="entry-content">{{ e.content.slice(0, 120) }}{{ e.content.length > 120 ? '...' : '' }}</div>
              </div>
              <div class="entry-actions">
                <button class="toggle-btn" :class="{ on: e.enabled }" @click="toggleEntry(e)">{{ e.enabled ? 'Вкл' : 'Выкл' }}</button>
                <button class="icon-btn" @click="openEditEntry(e)">✏️</button>
                <button class="icon-btn danger" @click="deleteEntry(e)">🗑</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Entry modal -->
    <div v-if="entryModal" class="modal-overlay" @click.self="entryModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ editEntryId ? 'Редактировать запись' : 'Новая запись' }}</h3>
          <button class="modal-close" @click="entryModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="form-label">Категория</label>
            <input v-model="entryForm.category" class="form-input" placeholder="general, pricing, faq..." list="cat-suggestions" />
            <datalist id="cat-suggestions">
              <option v-for="cat in existingCategories" :key="cat" :value="cat" />
            </datalist>

            <label class="form-label">Заголовок</label>
            <input v-model="entryForm.title" class="form-input" placeholder="Напр.: Стоимость фотокниги 20x20" />

            <label class="form-label">Содержимое</label>
            <textarea v-model="entryForm.content" class="form-textarea" rows="6" placeholder="Подробный ответ, прайс или факт..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="entryModal = false">Отмена</button>
          <button class="btn-primary" :disabled="savingEntry || !entryForm.title.trim() || !entryForm.content.trim()" @click="saveEntry">
            <span v-if="savingEntry" class="spinner-sm"></span>{{ savingEntry ? ' ...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { AiSettings, KnowledgeEntry } from '~/composables/useAssistantModule';

const api = useAssistantModule();

const activeTab = ref<'prompt' | 'knowledge'>('prompt');
const SUBTABS = [
  { id: 'prompt' as const, label: 'Системный контекст и параметры' },
  { id: 'knowledge' as const, label: 'База знаний' },
];

const settings = ref<AiSettings>({ id: 'default', systemPrompt: '', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.7, draftMode: true });
const loadingSettings = ref(false);
const saving = ref(false);
const saved = ref(false);

const entries = ref<KnowledgeEntry[]>([]);
const loadingKnowledge = ref(false);

const entryModal = ref(false);
const editEntryId = ref<string | null>(null);
const entryForm = ref({ category: 'general', title: '', content: '' });
const savingEntry = ref(false);

const groupedEntries = computed(() => {
  const map = new Map<string, KnowledgeEntry[]>();
  entries.value.forEach((e) => {
    if (!map.has(e.category)) map.set(e.category, []);
    map.get(e.category)!.push(e);
  });
  return Array.from(map.entries()).map(([category, entries]) => ({ category, entries }));
});

const existingCategories = computed(() => [...new Set(entries.value.map((e) => e.category))]);

onMounted(async () => {
  loadingSettings.value = true;
  try { settings.value = await api.getAiSettings(); } catch { } finally { loadingSettings.value = false; }
  await loadKnowledge();
});

async function loadKnowledge() {
  loadingKnowledge.value = true;
  try { entries.value = await api.listKnowledge(); } catch { } finally { loadingKnowledge.value = false; }
}

async function saveSettings() {
  saving.value = true;
  saved.value = false;
  try {
    settings.value = await api.updateAiSettings({
      systemPrompt: settings.value.systemPrompt,
      provider: settings.value.provider,
      model: settings.value.model,
      temperature: settings.value.temperature,
      draftMode: settings.value.draftMode,
    });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch { } finally { saving.value = false; }
}

function openCreateEntry() {
  editEntryId.value = null;
  entryForm.value = { category: 'general', title: '', content: '' };
  entryModal.value = true;
}

function openEditEntry(e: KnowledgeEntry) {
  editEntryId.value = e.id;
  entryForm.value = { category: e.category, title: e.title, content: e.content };
  entryModal.value = true;
}

async function saveEntry() {
  savingEntry.value = true;
  try {
    if (editEntryId.value) await api.updateKnowledge(editEntryId.value, entryForm.value);
    else await api.createKnowledge(entryForm.value);
    entryModal.value = false;
    await loadKnowledge();
  } catch { } finally { savingEntry.value = false; }
}

async function toggleEntry(e: KnowledgeEntry) {
  await api.updateKnowledge(e.id, { enabled: !e.enabled }).catch(() => {});
  e.enabled = !e.enabled;
}

async function deleteEntry(e: KnowledgeEntry) {
  if (!confirm(`Удалить запись «${e.title}»?`)) return;
  await api.deleteKnowledge(e.id).catch(() => {});
  await loadKnowledge();
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
.state-loading, .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.state-icon { font-size: 48px; }

/* Settings */
.settings-card { display: flex; flex-direction: column; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; max-width: 680px; }
.card-section { padding: 20px; border-bottom: 1px solid #f1f5f9; }
.section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
.section-hint { font-size: 12px; color: #64748b; margin-bottom: 10px; }
.prompt-textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 13px; outline: none; resize: vertical; font-family: inherit; line-height: 1.6; box-sizing: border-box; }
.prompt-textarea:focus { border-color: #6366f1; }

.params-grid { display: grid; grid-template-columns: 100px 1fr; gap: 12px 16px; align-items: center; }
.param-label { font-size: 12px; color: #64748b; font-weight: 500; }
.param-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; background: #fff; }
.param-input:focus { border-color: #6366f1; }
.temp-row { display: flex; align-items: center; gap: 10px; }
.temp-slider { flex: 1; }
.temp-val { font-weight: 600; font-size: 13px; color: #1e293b; min-width: 28px; }
.mode-toggle { display: flex; flex-direction: column; gap: 6px; }
.toggle-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #64748b; cursor: pointer; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
.toggle-opt.active { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.toggle-opt input { margin: 0; }

.info-box { margin: 0; padding: 14px 20px; background: #fffbeb; border-bottom: 1px solid #fde68a; font-size: 13px; color: #92400e; }
.info-box code { background: #fef3c7; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.card-footer { padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
.save-ok { font-size: 13px; color: #059669; font-weight: 600; }

/* Knowledge */
.knowledge-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.knowledge-hint { font-size: 13px; color: #64748b; }
.btn-add { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }

.entries-list { display: flex; flex-direction: column; gap: 12px; }
.entry-group { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.group-title { background: #f8fafc; padding: 8px 16px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #f1f5f9; }
.entry-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; transition: opacity 0.15s; }
.entry-item.disabled { opacity: 0.5; }
.entry-item:last-child { border-bottom: none; }
.entry-main { flex: 1; min-width: 0; }
.entry-title { font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 3px; }
.entry-content { font-size: 12px; color: #64748b; line-height: 1.4; }
.entry-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.toggle-btn { border-radius: 99px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid; background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0; }
.toggle-btn.on { background: #dcfce7; color: #059669; border-color: #a7f3d0; }
.icon-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.icon-btn:hover { opacity: 1; background: #f1f5f9; }
.icon-btn.danger:hover { background: #fef2f2; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 500px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.form-grid { display: grid; grid-template-columns: 90px 1fr; gap: 10px 14px; align-items: start; }
.form-label { font-size: 12px; color: #64748b; font-weight: 500; padding-top: 8px; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
.form-input:focus { border-color: #6366f1; }
.form-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
