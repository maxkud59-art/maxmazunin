// API composable for all ИИ-ассистент sub-modules

export interface CrmStatus { id: string; name: string; color: string; order: number; archived: boolean; }
export interface Tag { id: string; name: string; color: string; archived: boolean; }
export interface OrderStatus { id: string; name: string; color: string; order: number; archived: boolean; }

export interface ClientTag { tag: Tag; }
export interface ClientListItem {
  id: string;
  peerId: number;
  firstName: string | null;
  lastName: string | null;
  fio: string | null;
  clientName: string | null;
  clientAvatar: string | null;
  vkUrl: string;
  phone: string | null;
  city: string | null;
  source: string | null;
  note: string | null;
  firstContactAt: string | null;
  crmStatus: CrmStatus | null;
  tags: Tag[];
  conversationId: string | null;
}

export interface ClientListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ClientListItem[];
}

export interface Order {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  client: any;
  orderStatus: OrderStatus | null;
  amount: number | null;
  items: string | null;
  comment: string | null;
  createdAt: string;
  archived: boolean;
}

export interface OrderListResponse { total: number; page: number; pageSize: number; items: Order[]; }

export interface PhraseCategory {
  id: string;
  name: string;
  order: number;
  archived: boolean;
  phrases: QuickPhrase[];
}
export interface QuickPhrase {
  id: string;
  categoryId: string;
  title: string;
  text: string;
  order: number;
  archived: boolean;
}

export type AudienceType = 'vkIds' | 'clientIds' | 'filter';

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  messageText: string;
  attachments: any[];
  audienceType: AudienceType;
  audienceConfig: any;
  segmentFilter: any;
  description: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'DONE' | 'PAUSED' | 'FAILED';
  scheduledAt: string | null;
  createdAt: string;
  totalCount: number;
  sentCount: number;
  errorCount: number;
  archived: boolean;
}

export interface CampaignDetail extends Campaign {
  recipients: CampaignRecipient[];
}

export interface CampaignRecipient {
  id: string;
  peerId: number;
  clientName: string;
  status: 'PENDING' | 'SENT' | 'ERROR' | 'SKIPPED';
  sentAt: string | null;
  error: string | null;
}

export interface DailyLimitInfo {
  sentToday: number;
  ratePerSec: number;
  delayMs: number;
  vkConfigured: boolean;
  groupId: number | null;
}

export interface AudiencePreviewResult {
  count: number;
  sample: Array<{ id?: string; name: string }>;
  knownClients?: number;
}

export interface AiSettings {
  id: string;
  systemPrompt: string;
  provider: string;
  model: string;
  temperature: number;
  draftMode: boolean;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  enabled: boolean;
  order: number;
  createdAt: string;
}

export function useAssistantModule() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function headers(): Record<string, string> {
    const token = process.client ? (localStorage.getItem('auth_token') ?? '') : '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function api<T>(method: string, path: string, body?: any): Promise<T> {
    return $fetch<T>(`${apiBase}/api${path}`, { method: method as any, headers: headers(), body });
  }

  return {
    // ─── Directories ────────────────────────────────────────────────
    listCrmStatuses: () => api<CrmStatus[]>('GET', '/directories/crm-statuses'),
    createCrmStatus: (data: any) => api<CrmStatus>('POST', '/directories/crm-statuses', data),
    updateCrmStatus: (id: string, data: any) => api<CrmStatus>('PATCH', `/directories/crm-statuses/${id}`, data),

    listTags: () => api<Tag[]>('GET', '/directories/tags'),
    createTag: (data: any) => api<Tag>('POST', '/directories/tags', data),
    updateTag: (id: string, data: any) => api<Tag>('PATCH', `/directories/tags/${id}`, data),

    listOrderStatuses: () => api<OrderStatus[]>('GET', '/directories/order-statuses'),
    createOrderStatus: (data: any) => api<OrderStatus>('POST', '/directories/order-statuses', data),
    updateOrderStatus: (id: string, data: any) => api<OrderStatus>('PATCH', `/directories/order-statuses/${id}`, data),

    // ─── Clients ───────────────────────────────────────────────────
    listClients: (params?: Record<string, any>) => {
      const q = new URLSearchParams();
      if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)));
      const qs = q.toString() ? `?${q}` : '';
      return api<ClientListResponse>('GET', `/clients${qs}`);
    },
    getClient: (id: string) => api<ClientListItem>('GET', `/clients/${id}`),
    updateClient: (id: string, data: any) => api<ClientListItem>('PATCH', `/clients/${id}`, data),

    // ─── Orders ────────────────────────────────────────────────────
    listOrders: (params?: Record<string, any>) => {
      const q = new URLSearchParams();
      if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)));
      const qs = q.toString() ? `?${q}` : '';
      return api<OrderListResponse>('GET', `/orders${qs}`);
    },
    getOrder: (id: string) => api<Order>('GET', `/orders/${id}`),
    createOrder: (data: any) => api<Order>('POST', '/orders', data),
    updateOrder: (id: string, data: any) => api<Order>('PATCH', `/orders/${id}`, data),
    archiveOrder: (id: string) => api<any>('DELETE', `/orders/${id}`),

    // ─── Phrases ───────────────────────────────────────────────────
    listPhrases: () => api<PhraseCategory[]>('GET', '/phrases'),
    createPhraseCategory: (data: any) => api<PhraseCategory>('POST', '/phrases/categories', data),
    updatePhraseCategory: (id: string, data: any) => api<PhraseCategory>('PATCH', `/phrases/categories/${id}`, data),
    createPhrase: (data: any) => api<QuickPhrase>('POST', '/phrases/phrases', data),
    updatePhrase: (id: string, data: any) => api<QuickPhrase>('PATCH', `/phrases/phrases/${id}`, data),

    // ─── Broadcasts ────────────────────────────────────────────────
    listCampaigns: () => api<Campaign[]>('GET', '/broadcasts'),
    getCampaign: (id: string) => api<CampaignDetail>('GET', `/broadcasts/${id}`),
    createCampaign: (data: any) => api<Campaign>('POST', '/broadcasts', data),
    updateCampaign: (id: string, data: any) => api<Campaign>('PATCH', `/broadcasts/${id}`, data),
    archiveCampaign: (id: string) => api<any>('DELETE', `/broadcasts/${id}`),
    getDailyLimit: () => api<DailyLimitInfo>('GET', '/broadcasts/daily-limit'),
    audiencePreview: (data: any) => api<AudiencePreviewResult>('POST', '/broadcasts/audience-preview', data),
    previewSegment: (filter: any) => api<AudiencePreviewResult>('POST', '/broadcasts/segment-preview', filter),
    startCampaign: (id: string) => api<any>('POST', `/broadcasts/${id}/start`),
    pauseCampaign: (id: string) => api<any>('POST', `/broadcasts/${id}/pause`),
    cancelCampaign: (id: string) => api<any>('POST', `/broadcasts/${id}/cancel`),

    // ─── AI Settings ───────────────────────────────────────────────
    getAiSettings: () => api<AiSettings>('GET', '/ai-settings'),
    updateAiSettings: (data: any) => api<AiSettings>('PATCH', '/ai-settings', data),
    listKnowledge: () => api<KnowledgeEntry[]>('GET', '/ai-settings/knowledge'),
    createKnowledge: (data: any) => api<KnowledgeEntry>('POST', '/ai-settings/knowledge', data),
    updateKnowledge: (id: string, data: any) => api<KnowledgeEntry>('PATCH', `/ai-settings/knowledge/${id}`, data),
    deleteKnowledge: (id: string) => api<any>('DELETE', `/ai-settings/knowledge/${id}`),
  };
}
