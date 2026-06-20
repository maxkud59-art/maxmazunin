<script setup lang="ts">
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';
import {
  ArrowLeft, Send, Paperclip, Smile, Plus, X, CornerUpLeft,
  Users, Megaphone, MoreHorizontal, CheckCheck,
} from 'lucide-vue-next';
import { useMessengerStore } from '~/stores/messenger';
import { useAuthStore } from '~/stores/auth';
import { getMessenger } from '~/app/api/generated/messenger/messenger';
import type { ChatDto, UserProfileDto } from '~/app/api/generated/maxmazuninRuPersonalCabinetAPI.schemas';

definePageMeta({ middleware: ['auth'] });

const auth = useAuthStore();
const store = useMessengerStore();
const { $connectSocket, $disconnectSocket, $emitTypingStart, $emitTypingStop, $emitReadMark } = useNuxtApp() as any;

// ─── State ─────────────────────────────────────────────────────────────────

const showProfileGate = ref(false);
const showNewGroup = ref(false);
const mobileShowChat = ref(false);
const sidebarTab = ref<'chats' | 'contacts'>('chats');

const profileForm = reactive({ firstName: '', lastName: '', nickname: '', avatarUrl: '' });
const profileError = ref('');
const profileSaving = ref(false);

const groupForm = reactive({ title: '', memberIds: [] as string[] });
const groupError = ref('');
const groupUserQuery = ref('');
const groupUserResults = ref<UserProfileDto[]>([]);
const groupUserLoading = ref(false);

const sidebarQuery = ref('');
const messagesEl = ref<HTMLElement | null>(null);

const messageBody = ref('');
const replyTo = ref<any | null>(null);
const pendingAttachments = ref<{ storageKey: string; fileName: string; kind: string; url: string }[]>([]);
const typingTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const sending = ref(false);

const showEmojiPicker = ref(false);
const activeActionsId = ref<string | null>(null);

const mentionQuery = ref('');
const mentionUsers = ref<UserProfileDto[]>([]);
const showMentionList = ref(false);
const mentionCursorStart = ref(0);

// ─── Init ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  const token = localStorage.getItem('auth_token');
  if (token) $connectSocket(token);
  await store.loadProfile();
  if (!store.profile?.isComplete) {
    showProfileGate.value = true;
    return;
  }
  await store.loadChats();
  await store.loadAllUsers();
  await store.loadOnlineUsers();
});

onUnmounted(() => $disconnectSocket());

// Close emoji/actions on Escape
function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showEmojiPicker.value = false;
    showNewGroup.value = false;
    showProfileGate.value = false;
    activeActionsId.value = null;
  }
}
onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onUnmounted(() => document.removeEventListener('keydown', onDocumentKeydown));

// ─── Presence helpers ──────────────────────────────────────────────────────

function isUserOnline(userId?: string | null): boolean {
  return !!userId && store.onlineUsers.includes(userId);
}

function chatOtherMember(chat: ChatDto): any {
  return chat.members?.find((m: any) => m.userId !== auth.user?.id);
}

function isChatOnline(chat: ChatDto): boolean {
  if (chat.type !== 'DIRECT') return false;
  return isUserOnline(chatOtherMember(chat)?.userId);
}

// ─── Profile gate ──────────────────────────────────────────────────────────

async function saveProfile() {
  if (!profileForm.firstName.trim() || !profileForm.lastName.trim() || !profileForm.nickname.trim()) {
    profileError.value = 'Заполните все обязательные поля';
    return;
  }
  profileSaving.value = true;
  profileError.value = '';
  try {
    await store.updateProfile({
      firstName: profileForm.firstName.trim(),
      lastName: profileForm.lastName.trim(),
      nickname: profileForm.nickname.trim().toLowerCase(),
      avatarUrl: profileForm.avatarUrl || undefined,
    } as any);
    showProfileGate.value = false;
    await store.loadChats();
    await store.loadAllUsers();
  } catch (e: any) {
    profileError.value = e?.response?.data?.message ?? 'Ошибка сохранения';
  } finally {
    profileSaving.value = false;
  }
}

// ─── Chat selection ────────────────────────────────────────────────────────

async function selectChat(chat: ChatDto) {
  const chatId = chat.id!;
  store.selectChat(chatId);
  mobileShowChat.value = true;
  activeActionsId.value = null;
  // Load full history only if not already loaded (loadedChats prevents double-load)
  if (!store.loadedChats[chatId]) {
    await store.loadMessages(chatId);
  }
  nextTick(scrollToBottom);
  await store.markRead(chatId);
  const lastId = store.selectedMessages.at(-1)?.id;
  if (lastId) $emitReadMark(chatId, lastId);
}

function backToList() {
  mobileShowChat.value = false;
  store.selectChat(null);
  activeActionsId.value = null;
}

// ─── Contacts / direct ────────────────────────────────────────────────────

async function openDirectWith(user: UserProfileDto) {
  try {
    await store.openDirect(user.id!);
    const chat = store.selectedChat;
    if (chat) {
      mobileShowChat.value = true;
      if (!store.loadedChats[chat.id!]) await store.loadMessages(chat.id!);
      nextTick(scrollToBottom);
    }
  } catch (e: any) {
    alert(e?.response?.data?.message ?? 'Нет доступа');
  }
}

// ─── Group creation ────────────────────────────────────────────────────────

const debouncedGroupSearch = useDebounceFn(async (q: string) => {
  if (!q.trim()) { groupUserResults.value = []; return; }
  groupUserLoading.value = true;
  try {
    const { messengerControllerSearchUsers } = getMessenger();
    groupUserResults.value = await messengerControllerSearchUsers({ q });
  } finally {
    groupUserLoading.value = false;
  }
}, 300);

watch(groupUserQuery, (q) => debouncedGroupSearch(q));

async function createGroup() {
  if (!groupForm.title.trim()) { groupError.value = 'Введите название'; return; }
  if (groupForm.memberIds.length === 0) { groupError.value = 'Добавьте участников'; return; }
  groupError.value = '';
  try {
    await store.createGroup({ title: groupForm.title.trim(), memberIds: groupForm.memberIds });
    showNewGroup.value = false;
    groupForm.title = '';
    groupForm.memberIds = [];
    groupUserQuery.value = '';
    groupUserResults.value = [];
    const chat = store.selectedChat;
    if (chat) { mobileShowChat.value = true; await store.loadMessages(chat.id!); }
  } catch (e: any) {
    groupError.value = e?.response?.data?.message ?? 'Ошибка';
  }
}

function toggleGroupMember(userId: string) {
  const idx = groupForm.memberIds.indexOf(userId);
  if (idx >= 0) groupForm.memberIds.splice(idx, 1);
  else groupForm.memberIds.push(userId);
}

// ─── Emoji picker ──────────────────────────────────────────────────────────

function onSelectEmoji(emoji: any) {
  const char: string = emoji.i ?? '';
  const el = document.querySelector('#msg-input') as HTMLTextAreaElement;
  if (el) {
    const start = el.selectionStart ?? messageBody.value.length;
    const end = el.selectionEnd ?? messageBody.value.length;
    messageBody.value = messageBody.value.slice(0, start) + char + messageBody.value.slice(end);
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + char.length;
      el.focus();
    });
  } else {
    messageBody.value += char;
  }
  showEmojiPicker.value = false;
}

// ─── Sending ───────────────────────────────────────────────────────────────

async function sendMessage() {
  const chatId = store.selectedChatId;
  if (!chatId || (!messageBody.value.trim() && !pendingAttachments.value.length)) return;
  sending.value = true;
  $emitTypingStop(chatId);
  try {
    await store.sendMessage(
      chatId,
      messageBody.value.trim(),
      replyTo.value?.id,
      pendingAttachments.value.map((a) => a.storageKey),
    );
    messageBody.value = '';
    replyTo.value = null;
    pendingAttachments.value = [];
    nextTick(scrollToBottom);
  } catch (e: any) {
    alert(e?.response?.data?.message ?? 'Ошибка отправки');
  } finally {
    sending.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (showMentionList.value && mentionUsers.value.length) insertMention(mentionUsers.value[0]);
    else sendMessage();
  }
}

// ─── Typing ────────────────────────────────────────────────────────────────

function onInput() {
  const chatId = store.selectedChatId;
  if (!chatId) return;

  const text = messageBody.value;
  const cursor = (document.querySelector('#msg-input') as HTMLInputElement)?.selectionStart ?? text.length;
  const before = text.slice(0, cursor);
  const match = before.match(/@([a-z0-9_.–-]*)$/i);
  if (match) {
    mentionQuery.value = match[1];
    mentionCursorStart.value = cursor - match[0].length;
    showMentionList.value = true;
    searchMentionUsers(match[1]);
  } else {
    showMentionList.value = false;
    mentionUsers.value = [];
  }

  $emitTypingStart(chatId);
  if (typingTimeout.value) clearTimeout(typingTimeout.value);
  typingTimeout.value = setTimeout(() => $emitTypingStop(chatId), 2000);
}

function searchMentionUsers(q: string) {
  const members = (store.selectedChat?.members ?? []) as any[];
  mentionUsers.value = (q
    ? members.filter((m) =>
        m.nickname?.toLowerCase().includes(q.toLowerCase()) ||
        m.firstName?.toLowerCase().includes(q.toLowerCase()) ||
        m.lastName?.toLowerCase().includes(q.toLowerCase()))
    : members
  ).slice(0, 6);
}

function insertMention(user: any) {
  const nick = user.nickname ?? user.userId;
  const text = messageBody.value;
  const before = text.slice(0, mentionCursorStart.value);
  const after = text.slice((document.querySelector('#msg-input') as HTMLInputElement)?.selectionStart ?? text.length);
  messageBody.value = `${before}@${nick} ${after}`;
  showMentionList.value = false;
  mentionUsers.value = [];
  nextTick(() => (document.querySelector('#msg-input') as HTMLInputElement)?.focus());
}

// ─── Files ────────────────────────────────────────────────────────────────

async function onFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files?.length) return;
  const token = localStorage.getItem('auth_token');
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  for (const file of Array.from(files)) {
    if (file.size > 20 * 1024 * 1024) { alert(`${file.name}: слишком большой (макс. 20 МБ)`); continue; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await $fetch<any>(`${apiBase}/api/messenger/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      pendingAttachments.value.push(res);
    } catch (e: any) {
      alert(e?.data?.message ?? 'Ошибка загрузки');
    }
  }
  if (fileInput.value) fileInput.value.value = '';
}

// ─── Scroll + pagination ──────────────────────────────────────────────────

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

async function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollTop < 60 && store.selectedChatId && store.hasMore[store.selectedChatId] && !store.messagesLoading) {
    const prev = el.scrollHeight;
    await store.loadMessages(store.selectedChatId, true);
    nextTick(() => { el.scrollTop = el.scrollHeight - prev; });
  }
}

// Auto-scroll on new message in selected chat
watch(() => store.selectedMessages.length, () => {
  if (messagesEl.value) {
    const el = messagesEl.value;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) scrollToBottom();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function chatName(chat: ChatDto): string {
  if (chat.type === 'DIRECT') {
    const other = chatOtherMember(chat);
    if (!other) return 'Личный чат';
    return `${other.firstName ?? ''} ${other.lastName ?? ''}`.trim() || other.nickname || 'Пользователь';
  }
  return chat.title ?? 'Чат';
}

function chatAvatar(chat: ChatDto): string | null {
  if (chat.avatarUrl) return chat.avatarUrl;
  if (chat.type === 'DIRECT') return chatOtherMember(chat)?.avatarUrl ?? null;
  return null;
}

function avatarInitials(name: string): string {
  return name.split(' ').map((n) => n[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

function linkify(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline opacity-80 break-all">$1</a>')
    .replace(/@([a-z0-9_.–-]+)/gi, '<span class="font-semibold">@$1</span>');
}

function senderName(msg: any): string {
  if (!msg?.sender) return '';
  return `${msg.sender.firstName ?? ''} ${msg.sender.lastName ?? ''}`.trim() || msg.sender.nickname || '';
}

function openTab(url: string) { window.open(url, '_blank'); }

const typingText = computed(() => {
  const cid = store.selectedChatId;
  if (!cid) return '';
  const others = (store.typingUsers[cid] ?? []).filter((id) => id !== auth.user?.id);
  if (!others.length) return '';
  const names = others.map((uid) => {
    const m = (store.selectedChat?.members ?? []).find((mm: any) => mm.userId === uid) as any;
    return m ? (m.firstName ?? m.nickname ?? '…') : '…';
  });
  return names.join(', ') + (others.length === 1 ? ' печатает…' : ' печатают…');
});

const groupedMessages = computed(() => {
  const groups: { date: string; messages: any[] }[] = [];
  let lastDate = '';
  for (const msg of store.selectedMessages) {
    const iso = msg.createdAt ?? new Date().toISOString();
    const d = new Date(iso).toDateString();
    if (d !== lastDate) { groups.push({ date: formatDate(iso), messages: [] }); lastDate = d; }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
});

const filteredChats = computed(() => {
  const q = sidebarQuery.value.toLowerCase();
  if (!q) return store.chats;
  return store.chats.filter((c) =>
    chatName(c).toLowerCase().includes(q) || c.lastMessage?.body?.toLowerCase().includes(q));
});

const filteredContacts = computed(() => {
  const q = sidebarQuery.value.toLowerCase();
  const myId = auth.user?.id;
  return store.allUsers.filter((u) => {
    if (u.id === myId) return false;
    if (!q) return true;
    return u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.nickname?.toLowerCase().includes(q);
  });
});

function useDebounceFn<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
</script>

<template>
  <div class="flex flex-col overflow-hidden bg-background" style="height: 100dvh">

    <!-- ═══ Main layout ═══════════════════════════════════════════════════════ -->
    <div class="flex flex-1 min-h-0">

      <!-- ─── Sidebar ─────────────────────────────────────────────────────── -->
      <aside
        class="flex flex-col border-r bg-background transition-all duration-200"
        :class="mobileShowChat
          ? 'hidden sm:flex sm:w-72 lg:w-80'
          : 'flex w-full sm:w-72 lg:w-80'"
      >
        <!-- Sidebar header -->
        <div class="shrink-0 px-4 py-3 border-b flex items-center gap-3 bg-background/80 backdrop-blur-sm">
          <NuxtLink
            to="/"
            class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Вернуться в кабинет"
          >
            <ArrowLeft class="w-4 h-4" />
            <span class="hidden sm:inline">Кабинет</span>
          </NuxtLink>
          <span class="flex-1 font-semibold text-base tracking-tight">Мессенджер</span>
          <span v-if="store.totalUnread > 0" class="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5 font-medium tabular-nums">
            {{ store.totalUnread }}
          </span>
        </div>

        <!-- Tabs -->
        <div class="shrink-0 flex border-b">
          <button
            class="flex-1 py-2.5 text-sm font-medium transition-colors relative"
            :class="sidebarTab === 'chats' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="sidebarTab = 'chats'"
          >
            Чаты
            <span v-if="store.totalUnread > 0" class="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5">{{ store.totalUnread }}</span>
            <span v-if="sidebarTab === 'chats'" class="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-t-full" />
          </button>
          <button
            class="flex-1 py-2.5 text-sm font-medium transition-colors relative"
            :class="sidebarTab === 'contacts' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="sidebarTab = 'contacts'"
          >
            Контакты
            <span v-if="sidebarTab === 'contacts'" class="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-t-full" />
          </button>
        </div>

        <!-- Search + new group -->
        <div class="shrink-0 px-3 py-2 border-b flex gap-2">
          <input
            v-model="sidebarQuery"
            :placeholder="sidebarTab === 'chats' ? 'Поиск в чатах…' : 'Поиск контактов…'"
            class="flex-1 min-w-0 border rounded-xl px-3 py-1.5 text-sm bg-secondary/40 placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
          <button
            v-if="sidebarTab === 'chats'"
            class="p-1.5 rounded-xl border hover:bg-secondary transition-colors shrink-0"
            title="Создать группу"
            @click="showNewGroup = true"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>

        <!-- ── CHATS TAB ── -->
        <div v-if="sidebarTab === 'chats'" class="flex-1 overflow-y-auto min-h-0">
          <div v-if="!filteredChats.length" class="p-6 text-center text-sm text-muted-foreground mt-8 space-y-2">
            <div class="text-3xl">💬</div>
            <p>Нет чатов.<br>Перейдите во вкладку «Контакты».</p>
          </div>
          <button
            v-for="chat in filteredChats"
            :key="chat.id"
            class="w-full flex items-center gap-3 px-3 py-3 text-left transition-all duration-150 border-b border-border/50 relative group/chat"
            :class="[
              store.selectedChatId === chat.id
                ? 'bg-primary/8 dark:bg-primary/10'
                : 'hover:bg-secondary/60',
              (chat.unreadCount ?? 0) > 0 && store.selectedChatId !== chat.id
                ? 'bg-primary/5 dark:bg-primary/8'
                : '',
            ]"
            @click="selectChat(chat)"
          >
            <!-- Unread accent -->
            <span
              v-if="(chat.unreadCount ?? 0) > 0 && store.selectedChatId !== chat.id"
              class="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full"
            />

            <!-- Avatar -->
            <div class="relative shrink-0">
              <div class="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm overflow-hidden shadow-sm">
                <img v-if="chatAvatar(chat)" :src="chatAvatar(chat)!" class="w-full h-full object-cover" />
                <template v-else-if="chat.type === 'GROUP'"><Users class="w-5 h-5 text-muted-foreground" /></template>
                <template v-else-if="chat.type === 'NEWS'"><Megaphone class="w-5 h-5 text-muted-foreground" /></template>
                <span v-else class="text-sm">{{ avatarInitials(chatName(chat)) }}</span>
              </div>
              <!-- Online dot -->
              <span
                v-if="chat.type === 'DIRECT'"
                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                :class="isChatOnline(chat) ? 'bg-green-500' : 'bg-red-400'"
                :title="isChatOnline(chat) ? 'Онлайн' : 'Офлайн'"
                :aria-label="isChatOnline(chat) ? 'Онлайн' : 'Офлайн'"
                role="img"
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="text-sm truncate"
                  :class="(chat.unreadCount ?? 0) > 0 ? 'font-semibold text-foreground' : 'font-medium'"
                >{{ chatName(chat) }}</span>
                <span class="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {{ chat.lastMessage?.createdAt ? formatTime(chat.lastMessage.createdAt) : '' }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-2 mt-0.5">
                <span class="text-xs text-muted-foreground truncate">
                  <span v-if="chat.lastMessage?.senderName" class="opacity-70">{{ chat.lastMessage.senderName }}: </span>
                  {{ chat.lastMessage?.body ?? '' }}
                </span>
                <span
                  v-if="(chat.unreadCount ?? 0) > 0"
                  class="shrink-0 bg-primary text-primary-foreground text-[11px] rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center font-semibold tabular-nums"
                >{{ chat.unreadCount }}</span>
              </div>
            </div>
          </button>
        </div>

        <!-- ── CONTACTS TAB ── -->
        <div v-if="sidebarTab === 'contacts'" class="flex-1 overflow-y-auto min-h-0">
          <div v-if="!filteredContacts.length" class="p-6 text-center text-sm text-muted-foreground mt-8">
            Нет контактов.
          </div>
          <button
            v-for="u in filteredContacts"
            :key="u.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/50"
            @click="openDirectWith(u)"
          >
            <div class="relative shrink-0">
              <div class="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm overflow-hidden">
                <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-full h-full object-cover" />
                <span v-else>{{ avatarInitials(`${u.firstName ?? ''} ${u.lastName ?? ''}`) }}</span>
              </div>
              <span
                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                :class="isUserOnline(u.id) ? 'bg-green-500' : 'bg-red-400'"
                :title="isUserOnline(u.id) ? 'Онлайн' : 'Офлайн'"
                :aria-label="isUserOnline(u.id) ? 'Онлайн' : 'Офлайн'"
                role="img"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">
                {{ (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.email }}
              </div>
              <div class="text-xs text-muted-foreground truncate">
                <span v-if="u.nickname">@{{ u.nickname }}</span>
                <span v-if="u.jobTitle" class="ml-1 opacity-60">· {{ u.jobTitle }}</span>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <!-- ─── Chat area ────────────────────────────────────────────────────── -->
      <main
        class="flex flex-col flex-1 min-w-0"
        :class="!mobileShowChat ? 'hidden sm:flex' : 'flex'"
      >
        <!-- Empty state -->
        <div v-if="!store.selectedChatId" class="flex-1 flex items-center justify-center text-muted-foreground">
          <div class="text-center space-y-3">
            <div class="text-5xl opacity-30">💬</div>
            <p class="text-sm font-medium">Выберите чат для начала общения</p>
          </div>
        </div>

        <template v-else>
          <!-- Chat header (sticky) -->
          <div class="shrink-0 px-4 py-3 border-b flex items-center gap-3 bg-background/80 backdrop-blur-md">
            <button class="sm:hidden p-1 -ml-1 rounded-lg hover:bg-secondary transition-colors" @click="backToList">
              <ArrowLeft class="w-5 h-5" />
            </button>

            <div class="relative shrink-0">
              <div class="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-semibold text-xs overflow-hidden shadow-sm">
                <img v-if="chatAvatar(store.selectedChat!)" :src="chatAvatar(store.selectedChat!)!" class="w-full h-full object-cover" />
                <template v-else-if="store.selectedChat?.type === 'GROUP'"><Users class="w-4 h-4 text-muted-foreground" /></template>
                <template v-else-if="store.selectedChat?.type === 'NEWS'"><Megaphone class="w-4 h-4 text-muted-foreground" /></template>
                <span v-else>{{ avatarInitials(chatName(store.selectedChat!)) }}</span>
              </div>
              <span
                v-if="store.selectedChat?.type === 'DIRECT'"
                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                :class="isChatOnline(store.selectedChat!) ? 'bg-green-500' : 'bg-red-400'"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm leading-tight truncate">{{ chatName(store.selectedChat!) }}</div>
              <div class="text-xs text-muted-foreground leading-tight mt-0.5">
                <span v-if="typingText" class="animate-pulse text-primary">{{ typingText }}</span>
                <template v-else-if="store.selectedChat?.type === 'DIRECT'">
                  <span :class="isChatOnline(store.selectedChat!) ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'">
                    {{ isChatOnline(store.selectedChat!) ? 'В сети' : 'Не в сети' }}
                  </span>
                </template>
                <span v-else>{{ store.selectedChat?.members?.length ?? 0 }} участников</span>
              </div>
            </div>
          </div>

          <!-- Messages (scrollable) -->
          <div
            ref="messagesEl"
            class="flex-1 overflow-y-auto px-4 py-4 space-y-1 min-h-0"
            @scroll="onScroll"
            @click="activeActionsId = null"
          >
            <div v-if="store.messagesLoading" class="text-center text-xs text-muted-foreground py-3">
              <div class="inline-flex items-center gap-2">
                <div class="w-3 h-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
                Загрузка…
              </div>
            </div>

            <template v-for="group in groupedMessages" :key="group.date">
              <!-- Date separator -->
              <div class="flex items-center gap-3 my-4">
                <div class="flex-1 h-px bg-border/60" />
                <span class="text-[11px] text-muted-foreground font-medium px-3 py-1 rounded-full bg-secondary/60">{{ group.date }}</span>
                <div class="flex-1 h-px bg-border/60" />
              </div>

              <!-- Messages -->
              <div
                v-for="msg in group.messages"
                :key="msg.id"
                class="flex gap-2.5 items-end group/msg"
                :class="msg.isMine ? 'flex-row-reverse' : ''"
              >
                <!-- Sender avatar (only for theirs) -->
                <div
                  v-if="!msg.isMine && store.selectedChat?.type !== 'DIRECT'"
                  class="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold shrink-0 overflow-hidden shadow-sm"
                >
                  <img v-if="msg.sender?.avatarUrl" :src="msg.sender.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ avatarInitials(senderName(msg)) }}</span>
                </div>
                <!-- Spacer for DIRECT theirs (no avatar shown) -->
                <div v-else-if="!msg.isMine && store.selectedChat?.type === 'DIRECT'" class="w-0" />

                <!-- Bubble + actions -->
                <div class="max-w-[72%] sm:max-w-[60%] lg:max-w-[55%] flex flex-col" :class="msg.isMine ? 'items-end' : 'items-start'">
                  <!-- Sender name (groups) -->
                  <span v-if="!msg.isMine && store.selectedChat?.type !== 'DIRECT'" class="text-[11px] text-muted-foreground mb-1 ml-3 font-medium">
                    {{ senderName(msg) }}
                  </span>

                  <!-- Reply preview -->
                  <div
                    v-if="msg.replyTo && !msg.deletedAt"
                    class="mb-1 mx-1 px-2.5 py-1.5 rounded-xl border-l-2 border-primary/60 bg-secondary/60 text-xs text-muted-foreground max-w-full truncate"
                  >
                    <span class="font-medium text-foreground/70">{{ senderName(msg.replyTo) }}</span>
                    {{ msg.replyTo.body || '📎 Вложение' }}
                  </div>

                  <!-- Main bubble -->
                  <div
                    class="rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm cursor-pointer select-text"
                    :class="[
                      msg.isMine
                        ? 'bg-primary text-primary-foreground rounded-br-[4px]'
                        : 'bg-secondary text-secondary-foreground rounded-bl-[4px]',
                      msg.deletedAt ? 'opacity-50' : '',
                    ]"
                    @click.stop="activeActionsId = activeActionsId === msg.id ? null : msg.id"
                  >
                    <span v-if="msg.deletedAt" class="italic text-xs opacity-70">Сообщение удалено</span>
                    <span v-else-if="msg.type === 'SYSTEM'" class="italic opacity-70">{{ msg.body }}</span>
                    <span v-else v-html="linkify(msg.body ?? '')" />

                    <!-- Attachments -->
                    <div v-if="!msg.deletedAt && msg.attachments?.length" class="mt-2 space-y-1.5">
                      <div v-for="att in msg.attachments" :key="att.id">
                        <img v-if="att.kind === 'IMAGE'" :src="att.url" class="max-w-full rounded-xl max-h-56 object-contain cursor-pointer" @click.stop="att.url && openTab(att.url)" />
                        <video v-else-if="att.kind === 'VIDEO'" :src="att.url" controls class="max-w-full rounded-xl max-h-56" />
                        <a v-else :href="att.url" target="_blank" class="flex items-center gap-2 text-xs underline opacity-80">
                          📎 {{ att.fileName }} ({{ (att.sizeBytes / 1024).toFixed(1) }} KB)
                        </a>
                      </div>
                    </div>

                    <!-- Timestamp -->
                    <div class="flex items-center gap-1 mt-1.5" :class="msg.isMine ? 'justify-end' : 'justify-start'">
                      <span class="text-[10px] opacity-50 tabular-nums">{{ msg.createdAt ? formatTime(msg.createdAt) : '' }}</span>
                      <span v-if="msg.editedAt && !msg.deletedAt" class="text-[10px] opacity-50">ред.</span>
                      <CheckCheck v-if="msg.isMine && !msg.deletedAt" class="w-3 h-3 opacity-50" />
                    </div>
                  </div>

                  <!-- Context actions (hover desktop / tap mobile) -->
                  <div
                    v-if="!msg.deletedAt"
                    class="flex gap-1 mt-1 px-1 transition-all duration-150"
                    :class="[
                      msg.isMine ? 'flex-row-reverse' : '',
                      activeActionsId === msg.id ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover/msg:opacity-100 pointer-events-none group-hover/msg:pointer-events-auto translate-y-1 group-hover/msg:translate-y-0',
                    ]"
                  >
                    <button
                      class="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-[11px] text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                      @click.stop="replyTo = msg; activeActionsId = null"
                    >
                      <CornerUpLeft class="w-3 h-3" />
                      Ответить
                    </button>
                    <button
                      v-if="msg.isMine"
                      class="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary hover:bg-destructive hover:text-destructive-foreground text-[11px] text-muted-foreground transition-colors shadow-sm"
                      @click.stop="store.deleteMessage(msg.id); activeActionsId = null"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Reply bar -->
          <div v-if="replyTo" class="shrink-0 mx-4 mb-1 px-3 py-2 rounded-xl bg-secondary/80 border border-border/60 flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <CornerUpLeft class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span class="text-muted-foreground truncate">
                <span class="font-medium text-foreground/80">{{ senderName(replyTo) }}</span>:
                {{ replyTo.body || '📎 Вложение' }}
              </span>
            </div>
            <button class="shrink-0 hover:text-foreground text-muted-foreground" @click="replyTo = null">
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Pending attachments -->
          <div v-if="pendingAttachments.length" class="shrink-0 mx-4 mb-1 flex gap-2 flex-wrap">
            <div v-for="(att, i) in pendingAttachments" :key="att.storageKey" class="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1 text-xs shadow-sm">
              <img v-if="att.kind === 'IMAGE'" :src="att.url" class="h-8 w-8 object-cover rounded-md" />
              <span v-else class="max-w-[120px] truncate">📎 {{ att.fileName }}</span>
              <button class="text-muted-foreground hover:text-destructive ml-1 transition-colors" @click="pendingAttachments.splice(i, 1)">
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- @Mention list -->
          <div v-if="showMentionList && mentionUsers.length" class="shrink-0 mx-4 mb-1 bg-background border rounded-xl shadow-lg overflow-hidden">
            <button
              v-for="u in mentionUsers"
              :key="(u as any).userId ?? u.id"
              class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary text-left text-sm transition-colors"
              @click="insertMention(u)"
            >
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="isUserOnline((u as any).userId ?? u.id) ? 'bg-green-500' : 'bg-red-400'"
                :title="isUserOnline((u as any).userId ?? u.id) ? 'Онлайн' : 'Офлайн'"
                role="img"
              />
              <span class="font-medium text-primary">@{{ (u as any).nickname }}</span>
              <span class="text-muted-foreground text-xs">{{ (u as any).firstName }} {{ (u as any).lastName }}</span>
            </button>
          </div>

          <!-- Input bar (sticky bottom) -->
          <div class="shrink-0 border-t bg-background/90 backdrop-blur-sm pb-safe">
            <div class="px-3 py-2 flex items-end gap-2 relative">
              <!-- Emoji picker -->
              <template v-if="showEmojiPicker">
                <div class="fixed inset-0 z-40" @click="showEmojiPicker = false" />
                <div class="absolute bottom-full left-0 mb-2 z-50 shadow-2xl rounded-2xl overflow-hidden" style="max-width: min(340px, 100vw - 24px)">
                  <EmojiPicker :native="true" :display-recent="true" theme="auto" @select="onSelectEmoji" />
                </div>
              </template>

              <button
                class="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0"
                :class="showEmojiPicker ? 'bg-secondary text-foreground' : ''"
                title="Эмодзи"
                aria-label="Открыть пикер эмодзи"
                @click="showEmojiPicker = !showEmojiPicker"
              >
                <Smile class="w-5 h-5" />
              </button>

              <button
                class="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0"
                title="Прикрепить файл"
                @click="fileInput?.click()"
              >
                <Paperclip class="w-5 h-5" />
              </button>
              <input ref="fileInput" type="file" multiple class="hidden" accept="*/*" @change="onFileSelect" />

              <textarea
                id="msg-input"
                v-model="messageBody"
                placeholder="Сообщение…"
                rows="1"
                class="flex-1 min-w-0 resize-none rounded-2xl border border-input bg-secondary/40 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all max-h-28 overflow-y-auto placeholder:text-muted-foreground"
                style="min-height: 42px"
                @input="onInput"
                @keydown="onKeydown"
              />

              <button
                class="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-md"
                :disabled="sending || (!messageBody.trim() && !pendingAttachments.length)"
                @click="sendMessage"
              >
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- ═══ Profile gate modal ═══════════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showProfileGate" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style="background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)">
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4 border border-border/40">
          <h2 class="text-lg font-bold tracking-tight">Добро пожаловать!</h2>
          <p class="text-sm text-muted-foreground">Заполните профиль для начала общения.</p>

          <div class="space-y-2.5">
            <input v-model="profileForm.firstName" placeholder="Имя *" class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all" />
            <input v-model="profileForm.lastName" placeholder="Фамилия *" class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all" />
            <div>
              <input v-model="profileForm.nickname" placeholder="Никнейм (a–z, 0–9, ._-) *" class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all" />
              <p class="text-xs text-muted-foreground mt-1.5 ml-1">Для @-упоминаний. Только латиница и цифры.</p>
            </div>
            <input v-model="profileForm.avatarUrl" placeholder="URL аватарки (необязательно)" class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all" />
          </div>

          <p v-if="profileError" class="text-sm text-destructive font-medium">{{ profileError }}</p>

          <button
            class="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
            :disabled="profileSaving"
            @click="saveProfile"
          >
            {{ profileSaving ? 'Сохраняем…' : 'Сохранить и войти' }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- ═══ New group modal ═══════════════════════════════════════════════════ -->
    <Transition name="modal">
      <div
        v-if="showNewGroup"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style="background: rgba(0,0,0,0.5); backdrop-filter: blur(4px)"
        @click.self="showNewGroup = false"
      >
        <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-border/40 overflow-hidden">
          <!-- Modal header -->
          <div class="flex items-center justify-between px-5 py-4 border-b">
            <h2 class="font-bold text-base tracking-tight">Новая группа</h2>
            <button class="p-1 rounded-lg hover:bg-secondary transition-colors" @click="showNewGroup = false">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="p-5 space-y-4">
            <!-- Group name -->
            <input
              v-model="groupForm.title"
              placeholder="Название группы"
              class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all"
            />

            <!-- Member search -->
            <div>
              <label class="text-xs font-medium text-muted-foreground mb-1.5 block">Участники</label>
              <input
                v-model="groupUserQuery"
                placeholder="Найти пользователей…"
                class="w-full border rounded-xl px-3.5 py-2.5 text-sm bg-secondary/40 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-all mb-2"
              />

              <!-- Results -->
              <div v-if="groupUserResults.length" class="max-h-36 overflow-y-auto border rounded-xl divide-y divide-border/60 bg-background">
                <button
                  v-for="u in groupUserResults"
                  :key="u.id"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary transition-colors"
                  :class="groupForm.memberIds.includes(u.id!) ? 'bg-primary/6' : ''"
                  @click="toggleGroupMember(u.id!)"
                >
                  <div class="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                    {{ avatarInitials(`${u.firstName ?? ''} ${u.lastName ?? ''}`) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">{{ u.firstName }} {{ u.lastName }}</div>
                    <div v-if="u.nickname" class="text-xs text-muted-foreground">@{{ u.nickname }}</div>
                  </div>
                  <div
                    class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                    :class="groupForm.memberIds.includes(u.id!) ? 'bg-primary border-primary' : 'border-border'"
                  >
                    <span v-if="groupForm.memberIds.includes(u.id!)" class="text-primary-foreground text-[10px] font-bold">✓</span>
                  </div>
                </button>
              </div>

              <!-- Selected chips -->
              <div v-if="groupForm.memberIds.length" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="id in groupForm.memberIds"
                  :key="id"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-xs font-medium"
                >
                  {{ store.allUsers.find((u) => u.id === id)?.firstName ?? id }}
                  <button @click="toggleGroupMember(id)"><X class="w-3 h-3" /></button>
                </span>
              </div>
            </div>

            <p v-if="groupError" class="text-sm text-destructive font-medium">{{ groupError }}</p>
          </div>

          <!-- Modal footer -->
          <div class="flex gap-2 px-5 pb-5">
            <button
              class="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-secondary transition-colors"
              @click="showNewGroup = false; groupError = ''; groupForm.memberIds = []"
            >
              Отмена
            </button>
            <button
              class="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
              @click="createGroup"
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-enter-from > div {
  transform: translateY(16px) scale(0.97);
}
.modal-leave-to > div {
  transform: translateY(8px) scale(0.97);
}
</style>
