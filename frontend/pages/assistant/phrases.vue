<template>
  <div class="tab-page">
    <div class="tab-header">
      <h1 class="tab-title">Быстрые фразы</h1>
      <button class="btn-create" @click="openCreatePhrase()">+ Новая фраза</button>
    </div>
    <div class="hint-bar">Фразы вставляются в поле ввода Мессенджера нажатием кнопки ⚡</div>

    <div class="content-area">
      <div v-if="loading" class="state-loading"><span class="spinner"></span> Загрузка...</div>
      <div v-else-if="!categories.length" class="state-empty">
        <div class="state-icon">⚡</div>
        <div>Нет категорий. Создайте первую категорию и добавьте фразы.</div>
        <button class="btn-create-cat" @click="openCreateCat">+ Создать категорию</button>
      </div>

      <div v-else class="cats-list">
        <div v-for="cat in categories" :key="cat.id" class="cat-block">
          <div class="cat-header">
            <button class="cat-toggle" @click="toggleCat(cat.id)">{{ expandedCats.has(cat.id) ? '▼' : '▶' }}</button>
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ cat.phrases.length }} фраз</span>
            <div class="cat-actions">
              <button class="icon-btn" @click="openEditCat(cat)" title="Переименовать">✏️</button>
              <button class="icon-btn" @click="openCreatePhrase(cat.id)" title="Добавить фразу">+</button>
              <button class="icon-btn danger" @click="archiveCat(cat)" title="Архивировать">🗑</button>
            </div>
          </div>

          <div v-if="expandedCats.has(cat.id)" class="phrases-list">
            <div v-if="!cat.phrases.length" class="phrases-empty">В категории нет фраз</div>
            <div v-for="ph in cat.phrases" :key="ph.id" class="phrase-item">
              <div class="phrase-main">
                <div class="phrase-title">{{ ph.title }}</div>
                <div class="phrase-text">{{ ph.text }}</div>
              </div>
              <div class="phrase-actions">
                <button class="icon-btn" @click="openEditPhrase(ph)" title="Редактировать">✏️</button>
                <button class="icon-btn danger" @click="archivePhrase(ph)" title="Архивировать">🗑</button>
              </div>
            </div>
          </div>
        </div>

        <button class="btn-add-cat" @click="openCreateCat">+ Добавить категорию</button>
      </div>
    </div>

    <!-- Category modal -->
    <div v-if="catModal" class="modal-overlay" @click.self="catModal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">{{ catEditId ? 'Переименовать категорию' : 'Новая категория' }}</h3>
          <button class="modal-close" @click="catModal = false">✕</button>
        </div>
        <div class="modal-body">
          <input v-model="catForm.name" class="form-input" placeholder="Название категории..." autofocus />
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="catModal = false">Отмена</button>
          <button class="btn-primary" :disabled="saving || !catForm.name.trim()" @click="saveCat">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' ...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Phrase modal -->
    <div v-if="phraseModal" class="modal-overlay" @click.self="phraseModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">{{ phraseEditId ? 'Редактировать фразу' : 'Новая фраза' }}</h3>
          <button class="modal-close" @click="phraseModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="form-label">Категория</label>
            <select v-model="phraseForm.categoryId" class="form-input">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <label class="form-label">Название</label>
            <input v-model="phraseForm.title" class="form-input" placeholder="Краткое название фразы..." />
            <label class="form-label">Текст</label>
            <textarea v-model="phraseForm.text" class="form-textarea" rows="5" placeholder="Полный текст фразы, который вставится в сообщение..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="phraseModal = false">Отмена</button>
          <button class="btn-primary" :disabled="saving || !phraseForm.title.trim() || !phraseForm.text.trim()" @click="savePhrase">
            <span v-if="saving" class="spinner-sm"></span>{{ saving ? ' ...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PhraseCategory, QuickPhrase } from '~/composables/useAssistantModule';

const api = useAssistantModule();

const categories = ref<PhraseCategory[]>([]);
const loading = ref(false);
const expandedCats = ref(new Set<string>());
const saving = ref(false);

const catModal = ref(false);
const catEditId = ref<string | null>(null);
const catForm = ref({ name: '' });

const phraseModal = ref(false);
const phraseEditId = ref<string | null>(null);
const phraseForm = ref({ categoryId: '', title: '', text: '' });

onMounted(() => loadAll());

async function loadAll() {
  loading.value = true;
  try {
    categories.value = await api.listPhrases();
    // expand all by default
    categories.value.forEach((c) => expandedCats.value.add(c.id));
  } catch { /* silent */ } finally { loading.value = false; }
}

function toggleCat(id: string) {
  if (expandedCats.value.has(id)) expandedCats.value.delete(id);
  else expandedCats.value.add(id);
}

function openCreateCat() { catEditId.value = null; catForm.value = { name: '' }; catModal.value = true; }
function openEditCat(cat: PhraseCategory) { catEditId.value = cat.id; catForm.value = { name: cat.name }; catModal.value = true; }

async function saveCat() {
  if (!catForm.value.name.trim()) return;
  saving.value = true;
  try {
    if (catEditId.value) await api.updatePhraseCategory(catEditId.value, { name: catForm.value.name });
    else await api.createPhraseCategory({ name: catForm.value.name });
    catModal.value = false;
    await loadAll();
  } catch { /* silent */ } finally { saving.value = false; }
}

async function archiveCat(cat: PhraseCategory) {
  if (!confirm(`Архивировать категорию «${cat.name}»?`)) return;
  await api.updatePhraseCategory(cat.id, { archived: true }).catch(() => {});
  await loadAll();
}

function openCreatePhrase(categoryId?: string) {
  phraseEditId.value = null;
  phraseForm.value = { categoryId: categoryId ?? categories.value[0]?.id ?? '', title: '', text: '' };
  phraseModal.value = true;
}

function openEditPhrase(ph: QuickPhrase) {
  phraseEditId.value = ph.id;
  phraseForm.value = { categoryId: ph.categoryId, title: ph.title, text: ph.text };
  phraseModal.value = true;
}

async function savePhrase() {
  saving.value = true;
  try {
    if (phraseEditId.value) await api.updatePhrase(phraseEditId.value, phraseForm.value);
    else await api.createPhrase(phraseForm.value);
    phraseModal.value = false;
    await loadAll();
  } catch { /* silent */ } finally { saving.value = false; }
}

async function archivePhrase(ph: QuickPhrase) {
  if (!confirm(`Архивировать фразу «${ph.title}»?`)) return;
  await api.updatePhrase(ph.id, { archived: true }).catch(() => {});
  await loadAll();
}
</script>

<style scoped>
.tab-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }
.tab-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px; flex-shrink: 0; }
.tab-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.btn-create { margin-left: auto; background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
.hint-bar { padding: 6px 20px 10px; font-size: 12px; color: #64748b; background: #fff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
.content-area { flex: 1; overflow-y: auto; padding: 16px 20px; }

.state-loading, .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #94a3b8; font-size: 14px; }
.state-icon { font-size: 48px; }
.btn-create-cat { background: #eff6ff; color: #6366f1; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; margin-top: 8px; }

.cats-list { display: flex; flex-direction: column; gap: 12px; }

.cat-block { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
.cat-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.cat-toggle { background: none; border: none; cursor: pointer; font-size: 11px; color: #94a3b8; width: 20px; }
.cat-name { font-weight: 700; font-size: 14px; color: #1e293b; flex: 1; }
.cat-count { font-size: 12px; color: #94a3b8; }
.cat-actions { display: flex; gap: 4px; }
.icon-btn { background: none; border: none; cursor: pointer; font-size: 15px; padding: 2px 4px; border-radius: 4px; opacity: 0.7; }
.icon-btn:hover { opacity: 1; background: #f1f5f9; }
.icon-btn.danger:hover { background: #fef2f2; }

.phrases-list { padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 6px; }
.phrases-empty { font-size: 13px; color: #94a3b8; padding: 8px 0; }
.phrase-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; background: #f8fafc; border-radius: 8px; }
.phrase-main { flex: 1; min-width: 0; }
.phrase-title { font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 3px; }
.phrase-text { font-size: 12px; color: #64748b; white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.phrase-actions { display: flex; gap: 2px; flex-shrink: 0; }

.btn-add-cat { background: none; border: 1px dashed #d1d5db; border-radius: 8px; padding: 10px; color: #94a3b8; cursor: pointer; font-size: 13px; width: 100%; }
.btn-add-cat:hover { border-color: #6366f1; color: #6366f1; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 480px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-sm { max-width: 380px; }
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
