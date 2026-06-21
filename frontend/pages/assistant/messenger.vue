<template>
  <div class="mgr" :class="{ 'mgr--fs': fullscreen }">

    <!-- ═══ LEFT PANEL ═══════════════════════════════════════════════════════ -->
    <div class="mgr-left">

      <!-- Search + filter -->
      <div class="left-header">
        <input v-model="search" placeholder="Поиск диалогов..." class="conv-search" @input="onSearchInput" />
        <div class="filter-row">
          <button v-for="f in FILTERS" :key="f.v" :class="['filter-btn', { active: filter === f.v }]" @click="setFilter(f.v)">{{ f.l }}</button>
        </div>
      </div>

      <!-- Conversation list -->
      <div class="conv-list" ref="convListRef">
        <div v-if="convsLoading && !conversations.length" class="list-loading">Загрузка...</div>
        <div
          v-for="c in conversations"
          :key="c.id"
          :class="['conv-item', { active: activeConv?.id === c.id, unread: c.unreadCount > 0 }]"
          @click="openConv(c)"
        >
          <div class="conv-avatar-wrap">
            <img v-if="c.clientAvatar" :src="c.clientAvatar" class="conv-avatar" />
            <div v-else class="conv-avatar-placeholder">{{ c.clientName?.[0] ?? '?' }}</div>
            <span v-if="c.unreadCount > 0" class="conv-badge">{{ c.unreadCount > 99 ? '99+' : c.unreadCount }}</span>
          </div>
          <div class="conv-body">
            <div class="conv-name-row">
              <span class="conv-name">{{ c.clientName }}</span>
              <span class="conv-time">{{ fmtTime(c.lastMessageAt) }}</span>
            </div>
            <div class="conv-last">{{ c.lastMessageText }}</div>
            <div v-if="c.assignedBotId" class="conv-bot-badge" :class="{ paused: c.botPaused }">
              🤖 {{ c.assignedBotName || 'Бот' }}{{ c.botPaused ? ' ⏸' : '' }}
            </div>
          </div>
        </div>
        <button v-if="canLoadMore" class="load-more-btn" @click="loadMoreConvs">Ещё...</button>
      </div>

      <!-- Quick phrases -->
      <div class="left-section">
        <div class="section-header" @click="phrasesOpen = !phrasesOpen">
          <span>⚡ Быстрые фразы</span>
          <span class="section-arrow">{{ phrasesOpen ? '▲' : '▼' }}</span>
        </div>
        <transition name="slide">
          <div v-if="phrasesOpen" class="phrases-wrap">
            <div v-for="cat in phraseCategories" :key="cat.id" class="phrase-cat">
              <div class="phrase-cat-hdr" @click="toggleCat(cat.id)">
                <span>{{ cat.name }}</span>
                <span>{{ openCats.has(cat.id) ? '▲' : '▼' }}</span>
              </div>
              <div v-if="openCats.has(cat.id)" class="phrase-items">
                <div
                  v-for="ph in cat.phrases"
                  :key="ph.id"
                  class="phrase-item"
                  :title="ph.text"
                  @click="insertPhrase(ph)"
                >{{ ph.title }}</div>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Reminders -->
      <div class="left-section">
        <div class="section-header" @click="remindersOpen = !remindersOpen">
          <span>🔔 Напоминания <span v-if="reminders.length" class="reminder-count">{{ reminders.length }}</span></span>
          <span class="section-arrow">{{ remindersOpen ? '▲' : '▼' }}</span>
        </div>
        <transition name="slide">
          <div v-if="remindersOpen" class="reminders-wrap">
            <div
              v-for="r in reminders"
              :key="r.clientId"
              :class="['reminder-item', { overdue: r.isOverdue }]"
              @click="openByConvId(r.conversationId)"
            >
              <span class="reminder-name">{{ r.clientName }}</span>
              <span class="reminder-date">{{ fmtDate(r.nextContactDate) }}</span>
            </div>
            <div v-if="!reminders.length" class="empty-list">Нет напоминаний на ближайшую неделю</div>
          </div>
        </transition>
      </div>
    </div>

    <!-- ═══ CENTER PANEL ════════════════════════════════════════════════════ -->
    <div class="mgr-center">
      <div v-if="!activeConv" class="center-empty">
        <div class="empty-icon">💬</div>
        <div>Выберите диалог слева</div>
      </div>

      <template v-else>
        <!-- Thread header -->
        <div class="thread-header">
          <div class="thread-title">
            <img v-if="activeConv.clientAvatar" :src="activeConv.clientAvatar" class="thread-avatar" />
            <div v-else class="thread-avatar-ph">{{ activeConv.clientName?.[0] ?? '?' }}</div>
            <div>
              <div class="thread-name">{{ activeConv.clientName }}</div>
              <div v-if="activeConv.crmStatus" class="thread-status">{{ activeConv.crmStatus }}</div>
            </div>
          </div>
          <div class="thread-actions">
            <!-- Bot assignment -->
            <div class="bot-wrap" v-click-outside="() => botMenuOpen = false">
              <button :class="['bot-btn', { 'bot-active': activeConv.assignedBotId, 'bot-paused': activeConv.botPaused }]" @click="botMenuOpen = !botMenuOpen">
                🤖 {{ activeConv.assignedBotId ? (activeConv.assignedBotName || 'Бот') : 'Без бота' }}
                {{ activeConv.botPaused ? '⏸' : '' }}
              </button>
              <div v-if="botMenuOpen" class="bot-menu">
                <div class="bot-menu-item" @click="assignBot(null)">✕ Без бота</div>
                <div v-for="bot in availableBots" :key="bot.id" class="bot-menu-item" @click="assignBot(bot.id)">
                  {{ bot.name }} <span v-if="activeConv.assignedBotId === bot.id">✓</span>
                </div>
                <template v-if="activeConv.assignedBotId">
                  <div class="bot-menu-sep" />
                  <div class="bot-menu-item" @click="toggleBotPause">
                    {{ activeConv.botPaused ? '▶ Возобновить бота' : '⏸ Поставить на паузу' }}
                  </div>
                </template>
              </div>
            </div>
            <!-- Fullscreen toggle -->
            <button class="fs-btn" :title="fullscreen ? 'Выйти из полноэкранного' : 'Полный экран'" @click="toggleFullscreen">
              {{ fullscreen ? '⊡' : '⊞' }}
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="thread-msgs" ref="msgsRef" @scroll="onMsgsScroll">
          <button v-if="nextCursor" class="load-older-btn" :disabled="loadingOlder" @click="loadOlderMsgs">
            {{ loadingOlder ? 'Загрузка...' : 'Загрузить ранние сообщения' }}
          </button>
          <div v-if="msgsLoading && !messages.length" class="msgs-loading">Загрузка сообщений...</div>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="['msg-bubble', msg.direction === 'OUT' ? 'msg-out' : 'msg-in']"
          >
            <div v-if="msg.direction === 'IN'" class="msg-sender">{{ msg.senderName }}</div>
            <div class="msg-text">{{ msg.text }}</div>
            <div v-if="msg.attachments?.length" class="msg-attachments">
              <a v-for="(att, i) in msg.attachments" :key="i" :href="att.url || '#'" target="_blank" class="msg-att">
                {{ att.type }}{{ att.title ? ': ' + att.title : '' }}
              </a>
            </div>
            <div class="msg-time">{{ fmtMsgTime(msg.createdAt) }}</div>
          </div>
        </div>

        <!-- Input area -->
        <div class="thread-input-area">
          <div class="input-toolbar">
            <button class="tb-btn" @click="insertToken('[Имя]')" title="Вставить имя клиента">[Имя]</button>
            <button class="tb-btn" @click="attachPanel = !attachPanel" title="Добавить вложение">📎 Вложение</button>
          </div>
          <div v-if="attachPanel" class="attach-panel">
            <select v-model="attachType" class="attach-type">
              <option value="photo">photo</option>
              <option value="video">video</option>
              <option value="clip">clip</option>
              <option value="audio">audio</option>
              <option value="audio_message">audio_message</option>
              <option value="doc">doc</option>
            </select>
            <input v-model="attachUrl" placeholder="URL или VK owner_id (напр. -12345_678)" class="attach-url" />
            <button class="attach-ok" @click="doInsertAttachment">Вставить</button>
          </div>
          <div v-if="sendError" class="send-error">{{ sendError }}</div>
          <div class="input-row">
            <textarea
              ref="inputRef"
              v-model="msgText"
              placeholder="Сообщение... (Enter — отправить, Shift+Enter — перенос строки)"
              class="msg-textarea"
              rows="3"
              @keydown.enter.exact.prevent="sendMsg"
            />
            <button class="send-btn" :disabled="!msgText.trim() || sending" @click="sendMsg">
              <span v-if="sending">...</span>
              <span v-else>➤</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══ RIGHT PANEL ══════════════════════════════════════════════════════ -->
    <div v-if="activeConv" class="mgr-right">
      <div class="right-tabs">
        <button :class="['rt-tab', { active: rightTab === 'client' }]" @click="rightTab = 'client'">Клиент</button>
        <button :class="['rt-tab', { active: rightTab === 'orders' }]" @click="rightTab = 'orders'">Заказы</button>
      </div>

      <!-- Client card tab -->
      <div v-if="rightTab === 'client'" class="client-card">
        <div v-if="clientLoading" class="card-loading">Загрузка...</div>
        <template v-else-if="editClient">
          <div class="card-profile">
            <img v-if="activeConv.clientAvatar" :src="activeConv.clientAvatar" class="card-avatar" />
            <div>
              <div class="card-vk-name">{{ activeConv.clientName }}</div>
              <a :href="`https://vk.com/id${activeConv.peerId}`" target="_blank" class="card-vk-link">VK профиль ↗</a>
            </div>
          </div>

          <div class="card-fields">
            <div class="field-row">
              <label>Имя</label>
              <input v-model="editClient.firstName" placeholder="Имя" />
            </div>
            <div class="field-row">
              <label>Фамилия</label>
              <input v-model="editClient.lastName" placeholder="Фамилия" />
            </div>
            <div class="field-row">
              <label>Телефон</label>
              <input v-model="editClient.phone" placeholder="+7..." />
            </div>
            <div class="field-row">
              <label>Email</label>
              <input v-model="editClient.email" placeholder="email@..." />
            </div>
            <div class="field-row">
              <label>Дата рождения</label>
              <input type="date" v-model="editClient.birthDateStr" />
            </div>
            <div class="field-row">
              <label>Страна</label>
              <input v-model="editClient.country" placeholder="Россия" />
            </div>
            <div class="field-row">
              <label>Город</label>
              <input v-model="editClient.city" placeholder="Москва" />
            </div>
            <div class="field-row">
              <label>Источник</label>
              <input v-model="editClient.source" placeholder="ВКонтакте, Авито..." />
            </div>
            <div class="field-row">
              <label>CRM-статус</label>
              <select v-model="editClient.crmStatusId">
                <option value="">— без статуса —</option>
                <option v-for="s in crmStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="field-row">
              <label>Теги</label>
              <div class="tags-wrap">
                <label v-for="t in allTags" :key="t.id" class="tag-check">
                  <input type="checkbox" :value="t.id" v-model="editClient.tagIds" />
                  <span class="tag-pill" :style="{ background: t.color + '33', color: t.color }">{{ t.name }}</span>
                </label>
              </div>
            </div>
            <div class="field-row">
              <label>Следующий контакт</label>
              <input type="date" v-model="editClient.nextContactDateStr" />
            </div>
            <div class="field-row">
              <label>Заметка</label>
              <textarea v-model="editClient.note" rows="3" placeholder="Заметки..." />
            </div>
          </div>

          <div class="card-actions">
            <button class="save-btn" :disabled="savingClient" @click="saveClient">
              {{ savingClient ? 'Сохраняю...' : 'Сохранить' }}
            </button>
            <span v-if="savedMsg" class="saved-msg">{{ savedMsg }}</span>
          </div>
        </template>
      </div>

      <!-- Orders tab -->
      <div v-if="rightTab === 'orders'" class="orders-panel">
        <div v-if="ordersLoading" class="card-loading">Загрузка...</div>
        <template v-else>
          <div class="orders-list">
            <div v-for="ord in clientOrders" :key="ord.id" class="order-item">
              <div class="order-header">
                <span class="order-num">{{ ord.orderNumber || ord.id.slice(-6) }}</span>
                <span class="order-status" :style="{ background: ord.orderStatus?.color + '33', color: ord.orderStatus?.color }">
                  {{ ord.orderStatus?.name || 'Без статуса' }}
                </span>
              </div>
              <div class="order-title">{{ ord.title || '—' }}</div>
              <div class="order-amount" v-if="ord.amount">{{ Number(ord.amount).toLocaleString('ru-RU') }} ₽</div>
            </div>
            <div v-if="!clientOrders.length" class="empty-list">Нет заказов</div>
          </div>

          <!-- New order form -->
          <div class="new-order-form">
            <div class="form-title">+ Новый заказ</div>
            <input v-model="newOrder.title" placeholder="Название заказа" class="order-input" />
            <input v-model="newOrder.amount" placeholder="Сумма (₽)" type="number" class="order-input" />
            <select v-model="newOrder.orderStatusId" class="order-input">
              <option value="">— статус —</option>
              <option v-for="s in orderStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <textarea v-model="newOrder.note" placeholder="Заметка" rows="2" class="order-input" />
            <button class="save-btn" :disabled="creatingOrder" @click="createNewOrder">
              {{ creatingOrder ? 'Создаю...' : 'Создать заказ' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { AssistantConversation, AssistantMessage } from '~/composables/useAssistant';

definePageMeta({ middleware: ['auth'] });

const assistant = useAssistant();
const rt = useVkRealtime();
const fullscreen = useState('messengerFullscreen', () => false);

// ─── Filters & search ────────────────────────────────────────────────────────
const FILTERS = [
  { v: 'all', l: 'Все' },
  { v: 'unread', l: 'Непрочитанные' },
] as const;

const filter = ref<'all' | 'unread' | 'unanswered'>('all');
const search = ref('');
let searchTimer: any = null;

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadConvs(true), 400);
}

function setFilter(v: 'all' | 'unread' | 'unanswered') {
  filter.value = v;
  loadConvs(true);
}

// ─── Conversation list ────────────────────────────────────────────────────────
const conversations = ref<AssistantConversation[]>([]);
const convsLoading = ref(false);
const convsPage = ref(0);
const convsTotal = ref(0);
const convListRef = ref<HTMLElement>();

const canLoadMore = computed(() => conversations.value.length < convsTotal.value);

async function loadConvs(reset = false) {
  if (reset) { convsPage.value = 0; conversations.value = []; }
  convsLoading.value = true;
  try {
    const res = await assistant.listConversations({
      filter: filter.value,
      search: search.value || undefined,
      page: convsPage.value,
    });
    if (reset) {
      conversations.value = res.items;
    } else {
      conversations.value.push(...res.items);
    }
    convsTotal.value = res.total;
  } catch (e) {
    console.error('loadConvs error', e);
  } finally {
    convsLoading.value = false;
  }
}

async function loadMoreConvs() {
  convsPage.value++;
  await loadConvs(false);
}

// ─── Active conversation & messages ──────────────────────────────────────────
const activeConv = ref<AssistantConversation | null>(null);
const messages = ref<AssistantMessage[]>([]);
const msgsLoading = ref(false);
const loadingOlder = ref(false);
const nextCursor = ref<string | null>(null);
const msgsRef = ref<HTMLElement>();

async function openConv(c: AssistantConversation) {
  activeConv.value = c;
  messages.value = [];
  nextCursor.value = null;
  rightTab.value = 'client';
  botMenuOpen.value = false;
  msgText.value = '';
  attachPanel.value = false;

  await Promise.all([
    loadMessages(),
    loadClientCard(c.peerId),
  ]);
  scrollToBottom();
}

async function openByConvId(convId: string | null | undefined) {
  if (!convId) return;
  const c = conversations.value.find((x) => x.id === convId);
  if (c) await openConv(c);
}

async function loadMessages() {
  if (!activeConv.value) return;
  msgsLoading.value = true;
  try {
    const res = await assistant.getMessages(activeConv.value.id);
    messages.value = res.items;
    nextCursor.value = res.nextCursor;
  } catch (e) {
    console.error('loadMessages error', e);
  } finally {
    msgsLoading.value = false;
  }
}

async function loadOlderMsgs() {
  if (!activeConv.value || !nextCursor.value) return;
  loadingOlder.value = true;
  try {
    const res = await assistant.getMessages(activeConv.value.id, nextCursor.value);
    messages.value = [...res.items, ...messages.value];
    nextCursor.value = res.nextCursor;
  } finally {
    loadingOlder.value = false;
  }
}

function onMsgsScroll() {
  // could trigger load older on scroll-to-top but handled via button for simplicity
}

function scrollToBottom() {
  nextTick(() => {
    if (msgsRef.value) msgsRef.value.scrollTop = msgsRef.value.scrollHeight;
  });
}

// ─── Send message ─────────────────────────────────────────────────────────────
const msgText = ref('');
const sending = ref(false);
const sendError = ref('');
const inputRef = ref<HTMLTextAreaElement>();
const attachPanel = ref(false);
const attachType = ref('photo');
const attachUrl = ref('');

async function sendMsg() {
  if (!activeConv.value || !msgText.value.trim() || sending.value) return;
  sending.value = true;
  sendError.value = '';
  try {
    const msg = await assistant.sendMessage(activeConv.value.id, msgText.value);
    messages.value.push(msg as any);
    msgText.value = '';
    scrollToBottom();
  } catch (e: any) {
    const detail =
      e?.data?.message ??
      e?.response?.data?.message ??
      e?.message ??
      'Не удалось отправить сообщение';
    sendError.value = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.error('sendMsg error', e);
  } finally {
    sending.value = false;
  }
}

function insertToken(token: string) {
  const el = inputRef.value;
  if (!el) { msgText.value += token; return; }
  const start = el.selectionStart ?? msgText.value.length;
  const end = el.selectionEnd ?? start;
  msgText.value = msgText.value.slice(0, start) + token + msgText.value.slice(end);
  nextTick(() => el.setSelectionRange(start + token.length, start + token.length));
}

function doInsertAttachment() {
  const url = attachUrl.value.trim();
  if (!url) return;
  // Try to extract owner_id from URL or use raw
  let marker = '';
  const match = url.match(/(-?\d+_\d+)/);
  if (match) {
    marker = `[${attachType.value}${match[1]}]`;
  } else {
    marker = `[${attachType.value}${url}]`;
  }
  insertToken(marker);
  attachUrl.value = '';
  attachPanel.value = false;
}

function insertPhrase(ph: any) {
  if (!activeConv.value) return;
  let text = ph.text as string;
  // Replace [Имя] with client first name
  if (activeConv.value.clientName) {
    const firstName = activeConv.value.clientName.trim().split(/\s+/)[0];
    text = text.replace(/\[Имя\]/g, firstName);
  }
  insertToken(text);
  nextTick(() => inputRef.value?.focus());
}

// ─── Bot assignment ────────────────────────────────────────────────────────────
const botMenuOpen = ref(false);
const availableBots = ref<any[]>([]);

async function loadBots() {
  try {
    const res = await assistant.getBots();
    availableBots.value = (res as any[]).filter((b) => b.enabled && !b.archived);
  } catch {}
}

async function assignBot(botId: string | null) {
  if (!activeConv.value) return;
  botMenuOpen.value = false;
  try {
    const info = await assistant.setConversationBot(activeConv.value.id, botId);
    activeConv.value.assignedBotId = info.botId;
    activeConv.value.assignedBotName = info.botName;
    activeConv.value.botPaused = info.paused;
    // Also update in list
    const c = conversations.value.find((x) => x.id === activeConv.value!.id);
    if (c) { c.assignedBotId = info.botId; c.assignedBotName = info.botName; c.botPaused = info.paused; }
  } catch (e) {
    console.error('assignBot error', e);
  }
}

async function toggleBotPause() {
  if (!activeConv.value) return;
  botMenuOpen.value = false;
  const newPaused = !activeConv.value.botPaused;
  try {
    const info = await assistant.setConversationBot(activeConv.value.id, undefined, newPaused);
    activeConv.value.botPaused = info.paused;
    const c = conversations.value.find((x) => x.id === activeConv.value!.id);
    if (c) c.botPaused = info.paused;
  } catch (e) {
    console.error('toggleBotPause error', e);
  }
}

// ─── Client card ──────────────────────────────────────────────────────────────
const rightTab = ref<'client' | 'orders'>('client');
const clientLoading = ref(false);
const savingClient = ref(false);
const savedMsg = ref('');
const crmStatuses = ref<any[]>([]);
const allTags = ref<any[]>([]);
const editClient = ref<{
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDateStr: string;
  country: string;
  city: string;
  source: string;
  crmStatusId: string;
  nextContactDateStr: string;
  note: string;
  tagIds: string[];
} | null>(null);

async function loadClientCard(peerId: number) {
  clientLoading.value = true;
  try {
    const c = await assistant.getClient(peerId);
    editClient.value = {
      id: c.id,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      birthDateStr: c.birthDate ? new Date(c.birthDate).toISOString().split('T')[0] : '',
      country: c.country ?? '',
      city: c.city ?? '',
      source: c.source ?? '',
      crmStatusId: c.crmStatusId ?? '',
      nextContactDateStr: c.nextContactDate ? new Date(c.nextContactDate).toISOString().split('T')[0] : '',
      note: c.note ?? '',
      tagIds: Array.isArray(c.tags) ? c.tags.map((t: any) => t.id ?? t).filter(Boolean) : [],
    };
  } catch (e) {
    console.error('loadClientCard error', e);
  } finally {
    clientLoading.value = false;
  }
}

async function saveClient() {
  if (!editClient.value) return;
  savingClient.value = true;
  savedMsg.value = '';
  try {
    await assistant.updateClient(editClient.value.id, {
      firstName: editClient.value.firstName || undefined,
      lastName: editClient.value.lastName || undefined,
      phone: editClient.value.phone || undefined,
      email: editClient.value.email || undefined,
      birthDate: editClient.value.birthDateStr || undefined,
      country: editClient.value.country || undefined,
      city: editClient.value.city || undefined,
      source: editClient.value.source || undefined,
      crmStatusId: editClient.value.crmStatusId || undefined,
      nextContactDate: editClient.value.nextContactDateStr || undefined,
      note: editClient.value.note || undefined,
      tagIds: editClient.value.tagIds,
    } as any);
    savedMsg.value = 'Сохранено!';
    setTimeout(() => { savedMsg.value = ''; }, 2500);
    // Reload reminders after next-contact-date change
    loadReminders();
  } catch (e) {
    savedMsg.value = 'Ошибка сохранения';
    console.error('saveClient error', e);
  } finally {
    savingClient.value = false;
  }
}

// ─── Orders ────────────────────────────────────────────────────────────────────
const ordersLoading = ref(false);
const clientOrders = ref<any[]>([]);
const orderStatuses = ref<any[]>([]);
const newOrder = reactive({ title: '', amount: '', orderStatusId: '', note: '' });
const creatingOrder = ref(false);

async function loadClientOrders() {
  if (!editClient.value?.id) return;
  ordersLoading.value = true;
  try {
    const res = await assistant.getClientOrders(editClient.value.id);
    clientOrders.value = res.items ?? res;
  } catch (e) {
    console.error('loadClientOrders error', e);
  } finally {
    ordersLoading.value = false;
  }
}

watch(rightTab, (tab) => {
  if (tab === 'orders' && editClient.value) loadClientOrders();
});

async function createNewOrder() {
  if (!editClient.value?.id || !newOrder.title) return;
  creatingOrder.value = true;
  try {
    await assistant.createOrder({
      clientId: editClient.value.id,
      title: newOrder.title,
      amount: newOrder.amount ? Number(newOrder.amount) : undefined,
      orderStatusId: newOrder.orderStatusId || undefined,
      note: newOrder.note || undefined,
    });
    newOrder.title = ''; newOrder.amount = ''; newOrder.orderStatusId = ''; newOrder.note = '';
    await loadClientOrders();
  } catch (e) {
    console.error('createOrder error', e);
  } finally {
    creatingOrder.value = false;
  }
}

// ─── Quick phrases ─────────────────────────────────────────────────────────────
const phraseCategories = ref<any[]>([]);
const phrasesOpen = ref(false);
const openCats = ref(new Set<string>());

async function loadPhrases() {
  try {
    const res = await assistant.getPhrases();
    phraseCategories.value = Array.isArray(res) ? res : (res.items ?? []);
  } catch (e) {
    console.error('loadPhrases error', e);
  }
}

function toggleCat(id: string) {
  if (openCats.value.has(id)) openCats.value.delete(id);
  else openCats.value.add(id);
}

// ─── Reminders ────────────────────────────────────────────────────────────────
const remindersOpen = ref(true);
const reminders = ref<any[]>([]);

async function loadReminders() {
  try {
    reminders.value = await assistant.getReminders();
  } catch {}
}

// ─── Realtime ────────────────────────────────────────────────────────────────
function onVkMsgNew(data: { conversationId: string; message: AssistantMessage }) {
  if (activeConv.value?.id === data.conversationId) {
    // Avoid duplicates
    if (!messages.value.find((m) => m.id === data.message.id)) {
      messages.value.push(data.message);
      nextTick(scrollToBottom);
    }
  }
  // Update conversation in list
  const c = conversations.value.find((x) => x.id === data.conversationId);
  if (c) {
    c.lastMessageText = data.message.text;
    c.lastMessageAt = data.message.createdAt;
    if (data.message.direction === 'IN' && activeConv.value?.id !== c.id) {
      c.unreadCount = (c.unreadCount ?? 0) + 1;
    }
    // Move to top
    const idx = conversations.value.indexOf(c);
    if (idx > 0) {
      conversations.value.splice(idx, 1);
      conversations.value.unshift(c);
    }
  }
}

function onVkConvUpdate(data: AssistantConversation) {
  const idx = conversations.value.findIndex((c) => c.id === data.id);
  if (idx >= 0) {
    Object.assign(conversations.value[idx], data);
    if (idx > 0) {
      const c = conversations.value.splice(idx, 1)[0];
      conversations.value.unshift(c);
    }
  } else {
    // New conversation not yet in list
    conversations.value.unshift(data);
  }
}

// ─── Fullscreen ──────────────────────────────────────────────────────────────
function toggleFullscreen() {
  fullscreen.value = !fullscreen.value;
}

// ─── Format helpers ──────────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function fmtMsgTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadConvs(true);
  await Promise.all([
    loadPhrases(),
    loadReminders(),
    loadBots(),
    assistant.getCrmStatuses().then((r) => { crmStatuses.value = r as any[]; }),
    assistant.getTags().then((r) => { allTags.value = r as any[]; }),
    assistant.getOrderStatuses().then((r) => { orderStatuses.value = r as any[]; }),
  ]);

  // Realtime
  rt.connect();
  rt.on('vk:msg:new', onVkMsgNew);
  rt.on('vk:conv:update', onVkConvUpdate);
});

onUnmounted(() => {
  rt.off('vk:msg:new', onVkMsgNew);
  rt.off('vk:conv:update', onVkConvUpdate);
  // Don't disconnect - keep alive for other pages, unless navigating away from assistant entirely
});

// Custom directive v-click-outside
type ElWithHandler = HTMLElement & { _coHandler?: (e: MouseEvent) => void };
const vClickOutside = {
  mounted(el: ElWithHandler, binding: any) {
    el._coHandler = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) binding.value(e);
    };
    document.addEventListener('click', el._coHandler);
  },
  unmounted(el: ElWithHandler) {
    if (el._coHandler) document.removeEventListener('click', el._coHandler);
  },
};
</script>

<style scoped>
/* ═══ Layout ═══════════════════════════════════════════════════════════════════ */
.mgr {
  display: flex;
  height: 100%;
  background: #f1f5f9;
  overflow: hidden;
}
.mgr--fs {
  position: fixed;
  inset: 0;
  z-index: 100;
}

/* ─── Left panel ─── */
.mgr-left {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  overflow: hidden;
}

.left-header {
  padding: 10px 10px 6px;
  border-bottom: 1px solid #e2e8f0;
}
.conv-search {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 6px;
}
.conv-search:focus { border-color: #6366f1; }
.filter-row { display: flex; gap: 4px; }
.filter-btn {
  flex: 1;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-btn.active { background: #6366f1; color: #fff; border-color: #6366f1; }

.conv-list {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
}
.list-loading { padding: 16px; text-align: center; color: #94a3b8; font-size: 13px; }

.conv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}
.conv-item:hover { background: #f8fafc; }
.conv-item.active { background: #ede9fe; }
.conv-item.unread .conv-name { font-weight: 600; }

.conv-avatar-wrap { position: relative; flex-shrink: 0; }
.conv-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.conv-avatar-placeholder {
  width: 40px; height: 40px; border-radius: 50%;
  background: #6366f1; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 16px;
}
.conv-badge {
  position: absolute; top: -4px; right: -4px;
  background: #ef4444; color: #fff;
  border-radius: 10px; font-size: 10px;
  padding: 1px 4px; min-width: 16px; text-align: center;
}
.conv-body { flex: 1; min-width: 0; }
.conv-name-row { display: flex; justify-content: space-between; gap: 4px; }
.conv-name { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-time { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
.conv-last { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.conv-bot-badge { font-size: 10.5px; color: #6366f1; background: #ede9fe; border-radius: 4px; padding: 1px 5px; margin-top: 3px; display: inline-block; }
.conv-bot-badge.paused { color: #f59e0b; background: #fef3c7; }

.load-more-btn {
  display: block; width: 100%; padding: 10px;
  border: none; background: none; color: #6366f1;
  font-size: 13px; cursor: pointer;
}
.load-more-btn:hover { background: #f8fafc; }

/* ─── Left sections ─── */
.left-section {
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.section-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; cursor: pointer;
  font-size: 12.5px; font-weight: 600; color: #475569;
  user-select: none;
}
.section-header:hover { background: #f8fafc; }
.section-arrow { color: #94a3b8; }
.reminder-count {
  display: inline-flex; align-items: center; justify-content: center;
  background: #ef4444; color: #fff;
  border-radius: 10px; font-size: 10px; padding: 0 5px; margin-left: 4px;
}

.phrases-wrap, .reminders-wrap {
  max-height: 220px; overflow-y: auto;
  padding: 4px 0;
}
.phrase-cat-hdr {
  display: flex; justify-content: space-between;
  padding: 5px 12px; font-size: 12px; font-weight: 600; color: #64748b;
  cursor: pointer; background: #f8fafc;
}
.phrase-cat-hdr:hover { background: #f1f5f9; }
.phrase-items { padding: 2px 0; }
.phrase-item {
  padding: 5px 20px; font-size: 12.5px; cursor: pointer; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.phrase-item:hover { background: #ede9fe; color: #4f46e5; }

.reminder-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px; cursor: pointer; font-size: 12.5px; border-bottom: 1px solid #f1f5f9;
}
.reminder-item:hover { background: #fef9ee; }
.reminder-item.overdue { background: #fef2f2; }
.reminder-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reminder-date { font-size: 11px; color: #64748b; flex-shrink: 0; margin-left: 8px; }
.reminder-item.overdue .reminder-date { color: #ef4444; font-weight: 600; }
.empty-list { padding: 10px 12px; font-size: 12px; color: #94a3b8; }

/* ─── Center panel ─── */
.mgr-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f8fafc;
}
.center-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: #94a3b8; gap: 10px;
}
.empty-icon { font-size: 48px; }

/* Thread header */
.thread-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.thread-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.thread-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.thread-avatar-ph {
  width: 36px; height: 36px; border-radius: 50%;
  background: #6366f1; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
}
.thread-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.thread-status { font-size: 11px; color: #6366f1; }
.thread-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Bot button */
.bot-wrap { position: relative; }
.bot-btn {
  border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 6px; padding: 5px 10px;
  font-size: 12px; cursor: pointer; transition: all 0.15s;
  white-space: nowrap;
}
.bot-btn:hover { border-color: #6366f1; color: #6366f1; }
.bot-btn.bot-active { border-color: #6366f1; background: #ede9fe; color: #4f46e5; }
.bot-btn.bot-paused { border-color: #f59e0b; background: #fef3c7; color: #b45309; }
.bot-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: #fff; border: 1px solid #e2e8f0;
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12);
  min-width: 180px; z-index: 50;
}
.bot-menu-item {
  padding: 8px 14px; font-size: 13px; cursor: pointer;
}
.bot-menu-item:hover { background: #f1f5f9; }
.bot-menu-sep { border-top: 1px solid #e2e8f0; margin: 4px 0; }

.fs-btn {
  border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 6px; padding: 5px 8px;
  font-size: 14px; cursor: pointer; line-height: 1;
}
.fs-btn:hover { border-color: #6366f1; }

/* Messages */
.thread-msgs {
  flex: 1; overflow-y: auto;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.msgs-loading { text-align: center; color: #94a3b8; font-size: 13px; padding: 20px; }
.load-older-btn {
  align-self: center; border: 1px solid #e2e8f0; background: #fff;
  border-radius: 6px; padding: 5px 14px; font-size: 12.5px; cursor: pointer; color: #6366f1;
  margin-bottom: 8px;
}
.load-older-btn:hover { background: #ede9fe; }

.msg-bubble {
  max-width: 70%; padding: 8px 12px; border-radius: 10px; font-size: 13.5px; line-height: 1.5;
}
.msg-in {
  align-self: flex-start;
  background: #fff; border: 1px solid #e2e8f0;
  border-bottom-left-radius: 2px;
}
.msg-out {
  align-self: flex-end;
  background: #6366f1; color: #fff;
  border-bottom-right-radius: 2px;
}
.msg-sender { font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 2px; }
.msg-text { white-space: pre-wrap; word-break: break-word; }
.msg-time { font-size: 10.5px; color: rgba(0,0,0,.35); text-align: right; margin-top: 3px; }
.msg-out .msg-time { color: rgba(255,255,255,.6); }
.msg-attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.msg-att { font-size: 11.5px; color: #6366f1; text-decoration: underline; }
.msg-out .msg-att { color: #c7d2fe; }

/* Input area */
.thread-input-area {
  background: #fff; border-top: 1px solid #e2e8f0;
  padding: 8px 12px; flex-shrink: 0;
}
.input-toolbar { display: flex; gap: 6px; margin-bottom: 6px; }
.tb-btn {
  border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 5px; padding: 3px 9px;
  font-size: 12px; cursor: pointer;
}
.tb-btn:hover { border-color: #6366f1; color: #6366f1; }

.attach-panel {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.attach-type { border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px 6px; font-size: 12px; }
.attach-url {
  flex: 1; border: 1px solid #cbd5e1; border-radius: 5px;
  padding: 4px 8px; font-size: 12px;
}
.attach-ok {
  border: 1px solid #6366f1; background: #ede9fe; color: #4f46e5;
  border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}

.send-error { color: #dc2626; font-size: 12px; padding: 4px 2px 2px; }
.input-row { display: flex; gap: 8px; align-items: flex-end; }
.msg-textarea {
  flex: 1; border: 1px solid #cbd5e1; border-radius: 8px;
  padding: 8px 12px; font-size: 13.5px; resize: none;
  outline: none; font-family: inherit;
}
.msg-textarea:focus { border-color: #6366f1; }
.send-btn {
  background: #6366f1; color: #fff;
  border: none; border-radius: 8px;
  padding: 10px 16px; font-size: 16px; cursor: pointer;
  flex-shrink: 0; transition: background 0.15s;
}
.send-btn:hover:not(:disabled) { background: #4f46e5; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── Right panel ─── */
.mgr-right {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
}
.right-tabs {
  display: flex; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
}
.rt-tab {
  flex: 1; padding: 9px; font-size: 13px; border: none; background: none;
  cursor: pointer; color: #64748b; border-bottom: 2px solid transparent;
}
.rt-tab.active { color: #6366f1; border-bottom-color: #6366f1; font-weight: 600; }

.client-card {
  flex: 1; overflow-y: auto; padding: 12px;
}
.card-loading { padding: 20px; text-align: center; color: #94a3b8; }
.card-profile { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.card-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.card-vk-name { font-size: 13.5px; font-weight: 600; }
.card-vk-link { font-size: 11.5px; color: #6366f1; text-decoration: none; }
.card-vk-link:hover { text-decoration: underline; }

.card-fields { display: flex; flex-direction: column; gap: 8px; }
.field-row { display: flex; flex-direction: column; gap: 2px; }
.field-row label { font-size: 11px; color: #64748b; font-weight: 500; }
.field-row input,
.field-row select,
.field-row textarea {
  border: 1px solid #e2e8f0; border-radius: 5px;
  padding: 5px 8px; font-size: 12.5px;
  outline: none; font-family: inherit; width: 100%; box-sizing: border-box;
}
.field-row input:focus,
.field-row select:focus,
.field-row textarea:focus { border-color: #6366f1; }

.tags-wrap { display: flex; flex-wrap: wrap; gap: 4px; }
.tag-check { display: flex; align-items: center; cursor: pointer; }
.tag-check input { display: none; }
.tag-pill {
  border-radius: 12px; padding: 2px 8px; font-size: 11.5px;
  cursor: pointer; transition: opacity 0.15s;
}
.tag-check input:not(:checked) + .tag-pill { opacity: 0.4; }

.card-actions { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
.save-btn {
  background: #6366f1; color: #fff; border: none;
  border-radius: 6px; padding: 7px 18px; font-size: 13px;
  cursor: pointer; transition: background 0.15s;
}
.save-btn:hover:not(:disabled) { background: #4f46e5; }
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.saved-msg { font-size: 12.5px; color: #10b981; }

/* Orders */
.orders-panel { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.orders-list { display: flex; flex-direction: column; gap: 8px; }
.order-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
.order-header { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 4px; }
.order-num { font-size: 11px; color: #94a3b8; }
.order-status { font-size: 11px; border-radius: 10px; padding: 1px 7px; }
.order-title { font-size: 13px; font-weight: 500; }
.order-amount { font-size: 12.5px; color: #4f46e5; font-weight: 600; margin-top: 2px; }

.new-order-form { border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.form-title { font-size: 12.5px; font-weight: 600; color: #64748b; }
.order-input {
  border: 1px solid #e2e8f0; border-radius: 5px; padding: 5px 8px;
  font-size: 12.5px; outline: none; font-family: inherit;
}
.order-input:focus { border-color: #6366f1; }

/* Transitions */
.slide-enter-active, .slide-leave-active { transition: max-height 0.2s ease, opacity 0.2s; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 300px; opacity: 1; }

/* Mobile: hide right panel on small screens */
@media (max-width: 900px) {
  .mgr-right { display: none; }
}
@media (max-width: 600px) {
  .mgr-left { width: 100%; }
  .mgr-center { display: none; }
}
</style>
