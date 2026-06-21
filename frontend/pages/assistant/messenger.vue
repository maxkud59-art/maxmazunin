<template>
  <div class="messenger-page">
    <!-- Token error banner -->
    <div v-if="tokenError" class="token-banner">
      <span>⚠️ {{ tokenError }}</span>
      <span class="token-hint">Обновите <code>VK_GROUP_TOKEN</code> и <code>VK_GROUP_ID</code> в .env на сервере → <code>pm2 restart cabinet-backend</code></span>
    </div>

    <!-- Three-column layout -->
    <div class="messenger-layout" :class="{ 'mobile-thread': mobileView === 'thread', 'mobile-client': mobileView === 'client' }">
      <!-- LEFT: conversation list -->
      <aside class="conv-sidebar">
        <div class="conv-header">
          <div class="conv-title-row">
            <h2 class="conv-title">Диалоги VK</h2>
            <button class="sync-btn" :class="{ spinning: syncing }" @click="doSync" title="Синхронизировать">↻</button>
          </div>
          <div class="filter-tabs">
            <button v-for="f in FILTERS" :key="f.id" class="filter-tab" :class="{ active: activeFilter === f.id }" @click="setFilter(f.id)">{{ f.label }}</button>
          </div>
          <input v-model="searchQuery" class="conv-search" placeholder="Поиск..." @input="onSearch" />
        </div>

        <div class="conv-list" ref="convListEl" @scroll="onConvScroll">
          <div v-if="convLoading && !conversations.length" class="conv-loading"><span class="spinner"></span> Загрузка...</div>
          <div v-else-if="!conversations.length && !convLoading" class="conv-empty">
            <div>{{ tokenError ? '🔑 Токен не настроен' : '💬 Диалогов нет' }}</div>
          </div>
          <div
            v-for="conv in conversations"
            :key="conv.id"
            class="conv-item"
            :class="{ active: activeConv?.id === conv.id }"
            @click="selectConv(conv)"
          >
            <div class="conv-avatar">
              <img v-if="conv.clientAvatar" :src="conv.clientAvatar" alt="" />
              <span v-else class="conv-avatar-placeholder">{{ initials(conv.clientName) }}</span>
              <span v-if="conv.unreadCount" class="unread-badge">{{ conv.unreadCount }}</span>
            </div>
            <div class="conv-info">
              <div class="conv-name-row">
                <span class="conv-name">{{ conv.clientName }}</span>
                <span class="conv-time">{{ formatTime(conv.lastMessageAt) }}</span>
              </div>
              <div class="conv-preview">{{ conv.lastMessageText || '...' }}</div>
            </div>
          </div>
          <div v-if="convLoading && conversations.length" class="conv-loading-more"><span class="spinner-sm"></span></div>
        </div>
      </aside>

      <!-- CENTER: message thread -->
      <main class="thread-pane">
        <div v-if="activeConv" class="thread-header">
          <button class="back-btn" @click="mobileView = 'list'">←</button>
          <div class="thread-avatar">
            <img v-if="activeConv.clientAvatar" :src="activeConv.clientAvatar" alt="" />
            <span v-else>{{ initials(activeConv.clientName) }}</span>
          </div>
          <div class="thread-name">{{ activeConv.clientName }}</div>
          <button class="client-card-btn" @click="mobileView = 'client'">👤</button>
        </div>

        <div v-if="!activeConv" class="thread-empty">
          <div class="thread-empty-icon">💬</div>
          <div>Выберите диалог слева</div>
        </div>

        <template v-else>
          <div class="thread-messages" ref="threadEl" @scroll="onThreadScroll">
            <div v-if="msgLoadingMore" class="msg-loading-more"><span class="spinner-sm"></span></div>
            <template v-for="(msg, idx) in messages" :key="msg.id">
              <div v-if="showDateSep(idx)" class="date-sep">{{ formatDate(msg.createdAt) }}</div>
              <div class="msg-row" :class="msg.direction === 'OUT' ? 'msg-out' : 'msg-in'">
                <div class="bubble">
                  <div v-if="msg.text" class="bubble-text">{{ msg.text }}</div>
                  <template v-for="(att, ai) in msg.attachments" :key="ai">
                    <a v-if="att.url && (att.type === 'photo' || att.type === 'video' || att.type === 'doc')" :href="att.url" target="_blank" class="att-link">
                      <img v-if="att.thumb || (att.type === 'photo' && att.url)" :src="att.thumb ?? att.url" class="att-img" />
                      <span v-else>{{ att.title || att.type }}</span>
                    </a>
                    <div v-else-if="att.type === 'link'" class="att-link-text"><a :href="att.url ?? '#'" target="_blank">🔗 {{ att.title || att.url }}</a></div>
                    <div v-else class="att-generic">📎 {{ att.type }}{{ att.title ? ': ' + att.title : '' }}</div>
                  </template>
                  <div class="bubble-meta">{{ formatMsgTime(msg.createdAt) }}</div>
                </div>
              </div>
            </template>
            <div v-if="msgLoading && !messages.length" class="msg-loading"><span class="spinner"></span></div>
          </div>

          <!-- Quick phrases panel -->
          <div v-if="phrasePanelOpen" class="phrase-panel">
            <div class="phrase-panel-header">
              <span>⚡ Быстрые фразы</span>
              <button @click="phrasePanelOpen = false">✕</button>
            </div>
            <div class="phrase-panel-body">
              <div v-if="!phraseCategories.length" class="phrase-empty">Нет фраз. Добавьте в разделе «Быстрые фразы».</div>
              <div v-for="cat in phraseCategories" :key="cat.id" class="phrase-cat">
                <div class="phrase-cat-name">{{ cat.name }}</div>
                <button
                  v-for="ph in cat.phrases"
                  :key="ph.id"
                  class="phrase-chip"
                  @click="insertPhrase(ph.text)"
                >{{ ph.title }}</button>
              </div>
            </div>
          </div>

          <div class="thread-input-wrap">
            <div class="thread-insert-bar">
              <button type="button" class="ins-btn" @click="insertMsgAtCursor('[Имя]')">[Имя]</button>
              <button type="button" class="ins-btn" :class="{ active: msgAttachPanel }" @click="msgAttachPanel = !msgAttachPanel">+ Вложение</button>
            </div>
            <div v-if="msgAttachPanel" class="thread-attach-row">
              <select v-model="msgAttachType" class="msg-attach-select">
                <option value="photo">Фото</option>
                <option value="video">Видео</option>
                <option value="clip">Клип</option>
                <option value="audio">Аудио</option>
                <option value="audio_message">Голосовое</option>
                <option value="doc">Документ</option>
              </select>
              <input v-model="msgAttachUrl" class="msg-attach-url" placeholder="https://vk.com/photo-12345_678" />
              <button type="button" class="ins-btn ins-btn-ok" @click="insertMsgAttachment">Вставить</button>
            </div>
            <div class="thread-input">
              <button class="phrase-toggle-btn" @click="togglePhrasePanel" title="Быстрые фразы">⚡</button>
              <textarea
                ref="msgInputRef"
                v-model="draftText"
                class="msg-input"
                placeholder="Написать сообщение..."
                rows="2"
                @keydown.enter.exact.prevent="sendMsg"
              ></textarea>
              <button class="send-btn" :disabled="!draftText.trim() || sending" @click="sendMsg">
                <span v-if="sending" class="spinner-sm"></span>
                <span v-else>➤</span>
              </button>
            </div>
          </div>
        </template>
      </main>

      <!-- RIGHT: client card -->
      <aside class="client-pane">
        <div v-if="mobileView === 'client'" class="mobile-client-back">
          <button @click="mobileView = 'thread'">← Назад к диалогу</button>
        </div>

        <div v-if="!activeConv" class="client-empty">Выберите диалог для просмотра карточки клиента</div>

        <template v-else-if="clientInfo">
          <div class="client-card">
            <div class="client-header">
              <div class="client-avatar-lg">
                <img v-if="activeConv.clientAvatar" :src="activeConv.clientAvatar" alt="" />
                <span v-else>{{ initials(activeConv.clientName) }}</span>
              </div>
              <div>
                <div class="client-name">{{ clientInfo.fio || activeConv.clientName }}</div>
                <div v-if="clientInfo.city" class="client-city">📍 {{ clientInfo.city }}</div>
              </div>
            </div>
            <div class="client-fields">
              <div class="client-field" v-if="clientInfo.phone"><span class="field-label">Телефон</span><span class="field-value">{{ clientInfo.phone }}</span></div>
              <div class="client-field" v-if="clientInfo.source"><span class="field-label">Источник</span><span class="field-value">{{ clientInfo.source }}</span></div>
              <div class="client-field" v-if="clientInfo.note"><span class="field-label">Заметка</span><span class="field-value">{{ clientInfo.note }}</span></div>
            </div>
            <div v-if="clientInfo.tags?.length" class="client-tags">
              <span v-for="tag in clientInfo.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="client-vk-link">
              <a :href="`https://vk.com/id${activeConv.peerId}`" target="_blank" class="vk-link">Открыть профиль ВКонтакте ↗</a>
            </div>
          </div>
        </template>
        <div v-else-if="clientLoading" class="client-loading"><span class="spinner"></span></div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import type { AssistantConversation, AssistantMessage, AssistantClient } from '~/composables/useAssistant';

const api = useAssistant();
const phrasesApi = useAssistantModule();

const conversations = ref<AssistantConversation[]>([]);
const convTotal = ref(0);
const convPage = ref(0);
const convLoading = ref(false);
const activeFilter = ref<'all' | 'unread' | 'unanswered'>('all');
const searchQuery = ref('');
const searchDebounce = ref<ReturnType<typeof setTimeout> | null>(null);

const activeConv = ref<AssistantConversation | null>(null);
const messages = ref<AssistantMessage[]>([]);
const msgLoading = ref(false);
const msgLoadingMore = ref(false);
const msgNextCursor = ref<string | null>(null);
const draftText = ref('');
const sending = ref(false);

const clientInfo = ref<AssistantClient | null>(null);
const clientLoading = ref(false);

const syncing = ref(false);
const tokenError = ref('');

const convListEl = ref<HTMLElement | null>(null);
const threadEl = ref<HTMLElement | null>(null);
const mobileView = ref<'list' | 'thread' | 'client'>('list');

const phrasePanelOpen = ref(false);
const phraseCategories = ref<any[]>([]);

const msgInputRef = ref<HTMLTextAreaElement | null>(null);
const msgAttachPanel = ref(false);
const msgAttachType = ref('photo');
const msgAttachUrl = ref('');

const FILTERS = [
  { id: 'all' as const, label: 'Все' },
  { id: 'unread' as const, label: 'Непрочитанные' },
  { id: 'unanswered' as const, label: 'Неотвеченные' },
];

onMounted(async () => {
  const health = await api.checkTokenHealth().catch(() => ({ ok: false, message: 'Нет связи с сервером' }));
  if (!health.ok) tokenError.value = health.message;
  await loadConversations(true);
});

async function loadConversations(reset = false) {
  if (convLoading.value) return;
  convLoading.value = true;
  if (reset) { convPage.value = 0; conversations.value = []; }
  try {
    const res = await api.listConversations({ filter: activeFilter.value, search: searchQuery.value || undefined, page: convPage.value });
    if (reset) conversations.value = res.items;
    else conversations.value.push(...res.items);
    convTotal.value = res.total;
  } catch { /* silent */ } finally { convLoading.value = false; }
}

function setFilter(f: 'all' | 'unread' | 'unanswered') { activeFilter.value = f; loadConversations(true); }

function onSearch() {
  if (searchDebounce.value) clearTimeout(searchDebounce.value);
  searchDebounce.value = setTimeout(() => loadConversations(true), 400);
}

function onConvScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
    if (conversations.value.length < convTotal.value && !convLoading.value) {
      convPage.value++;
      loadConversations(false);
    }
  }
}

async function selectConv(conv: AssistantConversation) {
  if (activeConv.value?.id === conv.id) return;
  activeConv.value = conv;
  messages.value = [];
  msgNextCursor.value = null;
  clientInfo.value = null;
  mobileView.value = 'thread';
  await loadMessages();
  await loadClient(conv.peerId);
  await nextTick();
  scrollThreadToBottom();
}

async function loadMessages(loadMore = false) {
  if (!activeConv.value) return;
  if (loadMore) msgLoadingMore.value = true;
  else msgLoading.value = true;
  try {
    const cursor = loadMore ? msgNextCursor.value ?? undefined : undefined;
    const res = await api.getMessages(activeConv.value.id, cursor ?? undefined);
    if (loadMore) messages.value = [...res.items, ...messages.value];
    else messages.value = res.items;
    msgNextCursor.value = res.nextCursor;
  } catch { /* silent */ } finally { msgLoading.value = false; msgLoadingMore.value = false; }
}

function onThreadScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollTop < 80 && msgNextCursor.value && !msgLoadingMore.value) loadMessages(true);
}

function scrollThreadToBottom() {
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
}

async function sendMsg() {
  if (!activeConv.value || !draftText.value.trim() || sending.value) return;
  sending.value = true;
  const text = draftText.value.trim();
  draftText.value = '';
  try {
    const msg = await api.sendMessage(activeConv.value.id, text);
    messages.value.push(msg);
    const idx = conversations.value.findIndex((c) => c.id === activeConv.value!.id);
    if (idx >= 0) conversations.value[idx] = { ...conversations.value[idx], lastMessageText: text };
    await nextTick();
    scrollThreadToBottom();
  } catch { draftText.value = text; } finally { sending.value = false; }
}

async function loadClient(peerId: number) {
  clientLoading.value = true;
  try { clientInfo.value = await api.getClient(peerId); }
  catch { clientInfo.value = null; } finally { clientLoading.value = false; }
}

async function doSync() {
  if (syncing.value) return;
  syncing.value = true;
  try { await api.triggerSync(); setTimeout(() => loadConversations(true), 3000); }
  catch { /* silent */ } finally { setTimeout(() => { syncing.value = false; }, 2000); }
}

async function togglePhrasePanel() {
  phrasePanelOpen.value = !phrasePanelOpen.value;
  if (phrasePanelOpen.value && !phraseCategories.value.length) {
    try { phraseCategories.value = await phrasesApi.listPhrases(); }
    catch { phraseCategories.value = []; }
  }
}

function insertPhrase(text: string) {
  draftText.value = (draftText.value + ' ' + text).trim();
  phrasePanelOpen.value = false;
}

function insertMsgAtCursor(marker: string) {
  const el = msgInputRef.value;
  if (!el) { draftText.value += marker; return; }
  const start = el.selectionStart ?? draftText.value.length;
  const end = el.selectionEnd ?? start;
  draftText.value = draftText.value.slice(0, start) + marker + draftText.value.slice(end);
  nextTick(() => { el.focus(); el.setSelectionRange(start + marker.length, start + marker.length); });
}

function insertMsgAttachment() {
  const url = msgAttachUrl.value.trim();
  if (!url) return;
  const type = msgAttachType.value;
  const typeEsc = type.replace('_', '_?');
  const m = url.match(new RegExp(`(?:vk\\.com/)?${typeEsc}(-?\\d+_\\d+)`));
  if (!m) { alert(`Не удалось извлечь ID из URL для типа «${type}»`); return; }
  const marker = `[${type}${m[1]}]`;
  insertMsgAtCursor(marker);
  msgAttachUrl.value = '';
  msgAttachPanel.value = false;
}

function showDateSep(idx: number): boolean {
  if (idx === 0) return true;
  return formatDate(messages.value[idx - 1].createdAt) !== formatDate(messages.value[idx].createdAt);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}
</script>

<style scoped>
.messenger-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
}

.token-banner {
  background: #fef3cd;
  border-bottom: 1px solid #ffc107;
  padding: 10px 16px;
  font-size: 13px;
  color: #7a5c00;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.token-hint { color: #9a7000; }
.token-hint code { background: #fff3cd; padding: 1px 4px; border-radius: 3px; }

.messenger-layout { flex: 1; display: flex; overflow: hidden; }

/* Conv sidebar */
.conv-sidebar { width: 300px; flex-shrink: 0; background: #fff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; overflow: hidden; }
.conv-header { padding: 12px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.conv-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.conv-title { font-weight: 700; font-size: 15px; color: #111; }
.sync-btn { background: none; border: 1px solid #e5e7eb; border-radius: 6px; width: 30px; height: 30px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; color: #555; }
.sync-btn.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.filter-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.filter-tab { flex: 1; padding: 5px 2px; border: 1px solid #e5e7eb; border-radius: 6px; background: none; cursor: pointer; font-size: 11px; color: #666; }
.filter-tab.active { background: #2563eb; color: #fff; border-color: #2563eb; }
.conv-search { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; box-sizing: border-box; }
.conv-search:focus { border-color: #2563eb; }
.conv-list { flex: 1; overflow-y: auto; }
.conv-loading { padding: 24px; text-align: center; color: #888; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.conv-empty { padding: 40px 16px; text-align: center; color: #aaa; font-size: 14px; }
.conv-item { display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
.conv-item:hover { background: #f5f7ff; }
.conv-item.active { background: #eff6ff; }
.conv-avatar { position: relative; flex-shrink: 0; width: 42px; height: 42px; }
.conv-avatar img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
.conv-avatar-placeholder { width: 42px; height: 42px; border-radius: 50%; background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
.unread-badge { position: absolute; top: -2px; right: -2px; background: #ef4444; color: #fff; border-radius: 99px; font-size: 10px; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; padding: 0 3px; font-weight: 600; }
.conv-info { flex: 1; min-width: 0; }
.conv-name-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
.conv-name { font-weight: 600; font-size: 13px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.conv-time { font-size: 11px; color: #999; flex-shrink: 0; }
.conv-preview { font-size: 12px; color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-loading-more { padding: 8px; text-align: center; }

/* Thread pane */
.thread-pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; }
.thread-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #aaa; font-size: 15px; }
.thread-empty-icon { font-size: 48px; }
.thread-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; background: #fff; }
.back-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #444; display: none; }
.thread-avatar { width: 34px; height: 34px; border-radius: 50%; background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; flex-shrink: 0; }
.thread-avatar img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; }
.thread-name { font-weight: 600; font-size: 15px; color: #111; flex: 1; }
.client-card-btn { background: none; border: none; font-size: 18px; cursor: pointer; display: none; }
.thread-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.msg-loading { display: flex; align-items: center; justify-content: center; padding: 32px; color: #888; gap: 8px; }
.msg-loading-more { text-align: center; padding: 8px; }
.date-sep { text-align: center; font-size: 11px; color: #aaa; padding: 8px 0; }
.msg-row { display: flex; }
.msg-in { justify-content: flex-start; }
.msg-out { justify-content: flex-end; }
.bubble { max-width: 70%; padding: 8px 12px; border-radius: 16px; }
.msg-in .bubble { background: #f0f0f0; border-bottom-left-radius: 4px; }
.msg-out .bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 4px; }
.bubble-text { font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
.att-img { max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 4px; display: block; }
.att-link { display: block; text-decoration: none; margin-top: 4px; }
.att-link-text { margin-top: 4px; font-size: 13px; }
.att-link-text a { color: inherit; }
.msg-out .att-link-text a { color: #cce0ff; }
.att-generic { margin-top: 4px; font-size: 13px; opacity: 0.8; }
.bubble-meta { font-size: 10px; opacity: 0.65; text-align: right; margin-top: 4px; }

/* Quick phrases */
.phrase-panel { border-top: 1px solid #e5e7eb; background: #f9fafb; max-height: 180px; overflow-y: auto; flex-shrink: 0; }
.phrase-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e7eb; }
.phrase-panel-header button { background: none; border: none; cursor: pointer; color: #888; font-size: 14px; }
.phrase-panel-body { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.phrase-empty { font-size: 12px; color: #aaa; }
.phrase-cat { display: flex; flex-direction: column; gap: 4px; }
.phrase-cat-name { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.phrase-chip { background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; text-align: left; width: fit-content; }
.phrase-chip:hover { background: #dbeafe; }

/* Thread input */
.thread-input-wrap { border-top: 1px solid #e5e7eb; background: #fff; flex-shrink: 0; }
.thread-insert-bar { display: flex; gap: 6px; padding: 6px 12px 0; flex-wrap: wrap; }
.thread-attach-row { display: flex; gap: 6px; padding: 4px 12px; align-items: center; flex-wrap: wrap; }
.msg-attach-select { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 6px; font-size: 12px; outline: none; }
.msg-attach-url { flex: 1; min-width: 160px; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 8px; font-size: 12px; outline: none; }
.msg-attach-url:focus { border-color: #2563eb; }
.ins-btn { background: #f1f5f9; border: 1px solid #d1d5db; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; color: #374151; white-space: nowrap; }
.ins-btn:hover, .ins-btn.active { background: #dbeafe; border-color: #2563eb; color: #1d4ed8; }
.ins-btn-ok { background: #2563eb; color: #fff; border-color: #2563eb; }
.ins-btn-ok:hover { background: #1d4ed8; }
.thread-input { display: flex; gap: 8px; padding: 8px 12px 12px; align-items: flex-end; }
.phrase-toggle-btn { background: none; border: 1px solid #e5e7eb; border-radius: 8px; width: 36px; height: 36px; cursor: pointer; font-size: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #555; }
.phrase-toggle-btn:hover { background: #f0f0f0; }
.msg-input { flex: 1; border: 1px solid #d1d5db; border-radius: 12px; padding: 8px 12px; font-size: 14px; resize: none; outline: none; font-family: inherit; line-height: 1.4; }
.msg-input:focus { border-color: #2563eb; }
.send-btn { background: #2563eb; color: #fff; border: none; border-radius: 12px; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; flex-shrink: 0; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Client pane */
.client-pane { width: 260px; flex-shrink: 0; background: #fafafa; border-left: 1px solid #e5e7eb; overflow-y: auto; }
.client-empty { padding: 32px 16px; text-align: center; color: #bbb; font-size: 13px; }
.client-loading { display: flex; align-items: center; justify-content: center; padding: 32px; }
.client-card { padding: 16px; }
.client-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.client-avatar-lg { width: 48px; height: 48px; border-radius: 50%; background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; }
.client-avatar-lg img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.client-name { font-weight: 700; font-size: 14px; color: #111; }
.client-city { font-size: 12px; color: #888; margin-top: 2px; }
.client-fields { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.client-field { display: flex; flex-direction: column; gap: 2px; }
.field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #aaa; }
.field-value { font-size: 13px; color: #222; }
.client-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.tag { background: #f0f0f0; color: #555; padding: 3px 8px; border-radius: 99px; font-size: 12px; }
.vk-link { font-size: 12px; color: #2563eb; text-decoration: none; }
.vk-link:hover { text-decoration: underline; }
.mobile-client-back { display: none; padding: 10px; border-bottom: 1px solid #e5e7eb; }
.mobile-client-back button { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 14px; }

/* Spinners */
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #d1d5db; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
.conv-loading .spinner-sm, .msg-loading-more .spinner-sm { border-color: #d1d5db; border-top-color: #2563eb; }

/* Mobile */
@media (max-width: 900px) {
  .messenger-layout { position: relative; }
  .conv-sidebar { position: absolute; inset: 0; width: 100%; z-index: 10; transition: transform 0.25s; }
  .messenger-layout.mobile-thread .conv-sidebar, .messenger-layout.mobile-client .conv-sidebar { transform: translateX(-100%); }
  .thread-pane { position: absolute; inset: 0; width: 100%; z-index: 20; transform: translateX(100%); transition: transform 0.25s; }
  .messenger-layout.mobile-thread .thread-pane, .messenger-layout.mobile-client .thread-pane { transform: translateX(0); }
  .client-pane { position: absolute; inset: 0; width: 100%; z-index: 30; transform: translateX(100%); transition: transform 0.25s; }
  .messenger-layout.mobile-client .client-pane { transform: translateX(0); }
  .back-btn { display: block; }
  .client-card-btn { display: block; }
  .mobile-client-back { display: block; }
}
</style>
