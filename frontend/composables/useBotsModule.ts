export type BotType = 'RULE' | 'SCENARIO';
export type BotStepType =
  | 'TRIGGER' | 'SEND_MESSAGE' | 'SET_CRM_STATUS' | 'SET_TAGS' | 'SET_ORDER_STATUS'
  | 'MARK_IMPORTANT' | 'EXTRACT_FIELD' | 'SET_REMINDER' | 'ASSIGN_MANAGER'
  | 'NOTIFY_MANAGER' | 'LOG_STAT' | 'CONDITION' | 'DELAY' | 'END_SCENARIO'
  | 'UNSUBSCRIBE' | 'GOTO_STEP';
export type ScenarioStateStatus = 'ACTIVE' | 'WAITING_DELAY' | 'DONE' | 'CANCELLED';

export interface BotStep {
  id: string;
  botId: string;
  type: BotStepType;
  config: Record<string, any>;
  position: number;
  nextStepId: string | null;
  branches: any[];
  createdAt: string;
}

export interface Bot {
  id: string;
  name: string;
  type: BotType;
  enabled: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  steps: BotStep[];
  _count?: { logs: number; states: number };
}

export interface BotLog {
  id: string;
  botId: string;
  clientId: string | null;
  peerId: number | null;
  event: string;
  action: string;
  result: string | null;
  createdAt: string;
}

export interface ScenarioState {
  id: string;
  clientId: string;
  botId: string;
  currentStepId: string | null;
  vars: Record<string, any>;
  status: ScenarioStateStatus;
  scheduledAt: string | null;
  createdAt: string;
  bot: { id: string; name: string };
}

export function useBotsModule() {
  const config = useRuntimeConfig();
  const base = (config.public as any).apiBase ?? '';

  function headers() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
    return { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' };
  }

  async function api<T>(method: string, path: string, body?: any): Promise<T> {
    return $fetch<T>(`${base}/api/bots${path}`, { method, headers: headers(), body } as any);
  }

  return {
    // Bots
    listBots: (archived = false) => api<Bot[]>('GET', `?archived=${archived}`),
    getBot: (id: string) => api<Bot>('GET', `/${id}`),
    createBot: (name: string, type: BotType) => api<Bot>('POST', '', { name, type }),
    updateBot: (id: string, data: Partial<Pick<Bot, 'name' | 'enabled' | 'archived'>>) => api<Bot>('PATCH', `/${id}`, data),
    duplicateBot: (id: string) => api<Bot>('POST', `/${id}/duplicate`),

    // Steps
    createStep: (botId: string, data: { type: BotStepType; config?: any; position?: number; nextStepId?: string; branches?: any[] }) =>
      api<BotStep>('POST', `/${botId}/steps`, data),
    updateStep: (botId: string, stepId: string, data: Partial<BotStep>) =>
      api<BotStep>('PATCH', `/${botId}/steps/${stepId}`, data),
    deleteStep: (botId: string, stepId: string) =>
      api<{ ok: boolean }>('DELETE', `/${botId}/steps/${stepId}`),
    reorderSteps: (botId: string, ids: string[]) =>
      api<Bot>('POST', `/${botId}/steps/reorder`, { ids }),

    // Logs
    getLogs: (botId: string, limit = 50) => api<BotLog[]>('GET', `/${botId}/logs?limit=${limit}`),

    // Scenario states
    addClientToScenario: (clientId: string, botId: string) =>
      api<ScenarioState>('POST', '/scenario/add-client', { clientId, botId }),
    listStates: (params?: { botId?: string; clientId?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return api<ScenarioState[]>('GET', `/scenario/states${q ? '?' + q : ''}`);
    },
  };
}
