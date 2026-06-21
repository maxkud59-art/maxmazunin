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
  assignedBotId?: string | null;
  assignedBotName?: string | null;
  botPaused?: boolean;
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
  firstName?: string | null;
  lastName?: string | null;
  phone: string | null;
  email?: string | null;
  birthDate?: string | null;
  country?: string | null;
  city: string | null;
  source: string | null;
  note: string | null;
  tags: any[];
  nextContactDate?: string | null;
  lastContactAt?: string | null;
  crmStatusId?: string | null;
  crmStatus?: any;
  clientName: string | null;
  clientAvatar: string | null;
}

export interface AssistantReminder {
  clientId: string;
  peerId: number;
  clientName: string;
  clientAvatar: string | null;
  nextContactDate: string;
  isOverdue: boolean;
  conversationId: string | null;
}

export interface AssistantBotInfo {
  botId: string | null;
  botName: string | null;
  paused: boolean;
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

  function apiExt<T>(path: string): Promise<T> {
    return $fetch<T>(`${apiBase}${path}`, {
      headers: headers(),
    });
  }

  function apiPatch<T>(path: string, body: any): Promise<T> {
    return $fetch<T>(`${apiBase}${path}`, {
      method: 'PATCH',
      headers: headers(),
      body,
    });
  }

  function apiPost<T>(path: string, body: any): Promise<T> {
    return $fetch<T>(`${apiBase}${path}`, {
      method: 'POST',
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

    getConversationBot: (conversationId: string) =>
      api<AssistantBotInfo>('GET', `/conversations/${conversationId}/bot`),

    setConversationBot: (conversationId: string, botId: string | null, paused?: boolean) =>
      api<AssistantBotInfo>('PATCH', `/conversations/${conversationId}/bot`, { botId, paused }),

    getReminders: () =>
      api<AssistantReminder[]>('GET', '/reminders'),

    // Updates client card via /api/clients/:id
    updateClient: (clientId: string, dto: Partial<AssistantClient> & { tagIds?: string[] }) =>
      apiPatch<AssistantClient>(`/api/clients/${clientId}`, dto),

    // Phrases from /api/phrases
    getPhrases: () =>
      apiExt<any>('/api/phrases'),

    // Bots list
    getBots: () =>
      apiExt<any[]>('/api/bots'),

    // Directories
    getCrmStatuses: () =>
      apiExt<any[]>('/api/directories/crm-statuses'),

    getTags: () =>
      apiExt<any[]>('/api/directories/tags'),

    // Orders for a specific client
    getClientOrders: (clientId: string) =>
      apiExt<any>(`/api/orders?clientId=${clientId}&pageSize=20`),

    createOrder: (dto: any) =>
      apiPost<any>('/api/orders', dto),

    updateOrder: (id: string, dto: any) =>
      apiPatch<any>(`/api/orders/${id}`, dto),

    getOrderStatuses: () =>
      apiExt<any[]>('/api/directories/order-statuses'),

    triggerSync: () =>
      api<{ started: boolean }>('POST', '/sync'),

    checkTokenHealth: () =>
      api<{ ok: boolean; message: string }>('GET', '/token-health'),
  };
}
