// Direct API composable for assistant (VK community messages)

export interface AssistantConversation {
  id: string;
  peerId: number;
  peerType: string;
  clientName: string;
  clientAvatar: string | null;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  crmStatus: string | null;
}

export interface AssistantConversationList {
  items: AssistantConversation[];
  total: number;
}

export interface AssistantAttachment {
  type: string;
  url?: string | null;
  title?: string | null;
  thumb?: string | null;
}

export interface AssistantMessage {
  id: string;
  vkMessageId: number;
  direction: 'IN' | 'OUT';
  text: string;
  senderName: string;
  createdAt: string;
  attachments: AssistantAttachment[];
}

export interface AssistantMessageList {
  items: AssistantMessage[];
  nextCursor: string | null;
}

export interface AssistantClient {
  id: string;
  peerId: number;
  fio: string | null;
  phone: string | null;
  city: string | null;
  source: string | null;
  note: string | null;
  tags: string[];
  clientName: string | null;
  clientAvatar: string | null;
}

export function useAssistant() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function headers(): Record<string, string> {
    const token = process.client ? (localStorage.getItem('auth_token') ?? '') : '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function api<T>(method: string, path: string, body?: any): Promise<T> {
    return $fetch<T>(`${apiBase}/api/assistant${path}`, {
      method: method as any,
      headers: headers(),
      body,
    });
  }

  return {
    listConversations: (params?: {
      filter?: 'all' | 'unread' | 'unanswered';
      search?: string;
      page?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.filter && params.filter !== 'all') q.set('filter', params.filter);
      if (params?.search) q.set('search', params.search);
      if (params?.page) q.set('page', String(params.page));
      const qs = q.toString() ? `?${q}` : '';
      return api<AssistantConversationList>('GET', `/conversations${qs}`);
    },

    getMessages: (conversationId: string, cursor?: string) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return api<AssistantMessageList>('GET', `/conversations/${conversationId}/messages${qs}`);
    },

    sendMessage: (conversationId: string, text: string) =>
      api<AssistantMessage>('POST', `/conversations/${conversationId}/send`, { text }),

    getClient: (peerId: number) =>
      api<AssistantClient>('GET', `/clients/${peerId}`),

    triggerSync: () =>
      api<{ started: boolean }>('POST', '/sync'),

    checkTokenHealth: () =>
      api<{ ok: boolean; message: string }>('GET', '/token-health'),
  };
}
