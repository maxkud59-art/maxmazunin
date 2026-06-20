import { defineStore } from 'pinia';
import { getMessenger } from '~/app/api/generated/messenger/messenger';
import type {
  UserProfileDto,
  ChatDto,
  MessageDto,
} from '~/app/api/generated/maxmazuninRuPersonalCabinetAPI.schemas';

export const useMessengerStore = defineStore('messenger', {
  state: () => ({
    profile: null as UserProfileDto | null,
    chats: [] as ChatDto[],
    allUsers: [] as UserProfileDto[],
    messages: {} as Record<string, MessageDto[]>,
    cursors: {} as Record<string, string | null>,
    hasMore: {} as Record<string, boolean>,
    loadedChats: {} as Record<string, boolean>, // full REST load completed
    selectedChatId: null as string | null,
    onlineUsers: [] as string[],
    typingUsers: {} as Record<string, string[]>,
    loading: false,
    messagesLoading: false,
  }),

  getters: {
    selectedChat: (s): ChatDto | null =>
      s.chats.find((c) => c.id === s.selectedChatId) ?? null,

    selectedMessages: (s): MessageDto[] =>
      s.selectedChatId ? (s.messages[s.selectedChatId] ?? []) : [],

    totalUnread: (s): number =>
      s.chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
  },

  actions: {
    async loadProfile() {
      const { messengerControllerGetProfile } = getMessenger();
      this.profile = await messengerControllerGetProfile();
    },

    async updateProfile(data: Partial<UserProfileDto>) {
      const { messengerControllerUpdateProfile } = getMessenger();
      this.profile = await messengerControllerUpdateProfile(data as any);
      return this.profile;
    },

    async loadChats() {
      const { messengerControllerGetChats } = getMessenger();
      this.chats = await messengerControllerGetChats();
    },

    async loadAllUsers() {
      const { messengerControllerSearchUsers } = getMessenger();
      this.allUsers = await messengerControllerSearchUsers({});
    },

    async openDirect(userId: string): Promise<string> {
      const { messengerControllerOpenDirect } = getMessenger();
      const result = await messengerControllerOpenDirect(userId);
      const chatId = (result as any).chatId as string;
      await this.loadChats();
      this.selectedChatId = chatId;
      return chatId;
    },

    async createGroup(data: { title: string; memberIds: string[] }): Promise<string> {
      const { messengerControllerCreateGroup } = getMessenger();
      const result = await messengerControllerCreateGroup(data);
      const chatId = (result as any).chatId as string;
      await this.loadChats();
      this.selectedChatId = chatId;
      return chatId;
    },

    async loadMessages(chatId: string, append = false) {
      const { messengerControllerGetMessages } = getMessenger();
      this.messagesLoading = true;
      try {
        const cursor = append ? (this.cursors[chatId] ?? undefined) : undefined;
        const page = await messengerControllerGetMessages(chatId, cursor ? { cursor } : {});
        const items = page.items ?? [];
        if (append) {
          // Prepend older messages, merge with any WS-received newer ones
          const wsMessages = this.messages[chatId] ?? [];
          const existingIds = new Set(items.map((m: MessageDto) => m.id));
          const newOnly = wsMessages.filter((m) => !existingIds.has(m.id!));
          this.messages[chatId] = [...items, ...newOnly];
        } else {
          // Full load: keep any WS messages that arrived after the last item
          const wsMessages = this.messages[chatId] ?? [];
          const lastRestTime = items[items.length - 1]?.createdAt ?? '';
          const newerWs = wsMessages.filter(
            (m) => m.createdAt && m.createdAt > lastRestTime &&
              !items.find((r: MessageDto) => r.id === m.id),
          );
          this.messages[chatId] = [...items, ...newerWs];
        }
        this.hasMore[chatId] = page.hasMore ?? false;
        this.cursors[chatId] = page.nextCursor ?? null;
        this.loadedChats[chatId] = true;
      } finally {
        this.messagesLoading = false;
      }
    },

    async sendMessage(chatId: string, body: string, replyToId?: string, attachmentKeys?: string[]) {
      const { messengerControllerSendMessage } = getMessenger();
      const msg = await messengerControllerSendMessage(chatId, {
        body,
        replyToId,
        attachmentKeys,
      });
      this.addMessage(msg);
      return msg;
    },

    async deleteMessage(messageId: string) {
      const { messengerControllerDeleteMessage } = getMessenger();
      await messengerControllerDeleteMessage(messageId);
    },

    async markRead(chatId: string) {
      const msgs = this.messages[chatId];
      if (!msgs?.length) return;
      const lastId = msgs[msgs.length - 1]?.id;
      if (!lastId) return;
      const { messengerControllerMarkRead } = getMessenger();
      await messengerControllerMarkRead(chatId, { lastMessageId: lastId });
      const chat = this.chats.find((c) => c.id === chatId);
      if (chat) chat.unreadCount = 0;
    },

    // WebSocket event handlers
    addMessage(msg: MessageDto) {
      const chatId = msg.chatId!;
      if (!this.messages[chatId]) this.messages[chatId] = [];
      const exists = this.messages[chatId].find((m: MessageDto) => m.id === msg.id);
      if (!exists) this.messages[chatId].push(msg);

      // Update last message in chat list
      const chat = this.chats.find((c) => c.id === chatId);
      if (chat) {
        chat.lastMessage = {
          id: msg.id,
          body: msg.body,
          senderName: `${msg.sender?.firstName ?? ''} ${msg.sender?.lastName ?? ''}`.trim(),
          createdAt: msg.createdAt,
        };
        chat.updatedAt = msg.createdAt;
        if (chatId !== this.selectedChatId && !msg.isMine) {
          chat.unreadCount = (chat.unreadCount ?? 0) + 1;
        }
        // Re-sort chats
        this.chats = [...this.chats].sort((a, b) =>
          (b.updatedAt ?? '') > (a.updatedAt ?? '') ? 1 : -1,
        );
      }
    },

    updateMessage(msg: MessageDto) {
      const chatId = msg.chatId!;
      const arr = this.messages[chatId];
      if (!arr) return;
      const idx = arr.findIndex((m: MessageDto) => m.id === msg.id);
      if (idx >= 0) arr[idx] = msg;
    },

    removeMessage(chatId: string, messageId: string) {
      const arr = this.messages[chatId];
      if (!arr) return;
      const idx = arr.findIndex((m: MessageDto) => m.id === messageId);
      if (idx >= 0) arr[idx] = { ...arr[idx], deletedAt: new Date().toISOString(), body: '' };
    },

    async loadOnlineUsers() {
      const { messengerControllerGetOnline } = getMessenger();
      const ids = await messengerControllerGetOnline() as unknown as string[];
      this.onlineUsers = ids ?? [];
    },
    setOnline(userIds: string[]) { this.onlineUsers = userIds; },
    addOnline(userId: string) { if (!this.onlineUsers.includes(userId)) this.onlineUsers.push(userId); },
    removeOnline(userId: string) { this.onlineUsers = this.onlineUsers.filter((id) => id !== userId); },

    setTyping(chatId: string, userId: string, active: boolean) {
      if (!this.typingUsers[chatId]) this.typingUsers[chatId] = [];
      if (active) {
        if (!this.typingUsers[chatId].includes(userId)) this.typingUsers[chatId].push(userId);
      } else {
        this.typingUsers[chatId] = this.typingUsers[chatId].filter((id) => id !== userId);
      }
    },

    selectChat(chatId: string | null) {
      this.selectedChatId = chatId;
    },
  },
});
