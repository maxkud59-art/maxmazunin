// Finance module API composable

export type FinProject = 'EASYBOOK' | 'EASYNEON' | 'IZIBANYA' | 'GENERAL';
export type FinOpType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'LOAN_PRINCIPAL' | 'DEPOSIT_PLACE' | 'DEPOSIT_RETURN' | 'DIVIDEND';
export type FinAccountType = 'BANK' | 'SAVINGS' | 'CASH' | 'CREDIT';
export type FinOrderStatus = 'PREPAY' | 'PAID_50' | 'SHIPPED' | 'DELIVERED' | 'REFUNDED';

export const FIN_PROJECT_LABELS: Record<FinProject, string> = {
  EASYBOOK: 'EasyBook',
  EASYNEON: 'EasyNeon',
  IZIBANYA: 'ИзиБаня',
  GENERAL: 'Общая деятельность',
};

export const FIN_OP_TYPE_LABELS: Record<FinOpType, string> = {
  INCOME: 'Поступление',
  EXPENSE: 'Списание',
  TRANSFER: 'Перевод',
  LOAN_PRINCIPAL: 'Погашение тела кредита',
  DEPOSIT_PLACE: 'Размещение депозита',
  DEPOSIT_RETURN: 'Возврат депозита',
  DIVIDEND: 'Дивиденды',
};

export const FIN_ORDER_STATUS_LABELS: Record<FinOrderStatus, string> = {
  PREPAY: 'Предоплата',
  PAID_50: 'Оплачено 50%',
  SHIPPED: 'Отправлен / Выдан',
  DELIVERED: 'Доставлен',
  REFUNDED: 'Возврат',
};

export const NON_PNL_TYPES: FinOpType[] = ['TRANSFER', 'LOAN_PRINCIPAL', 'DEPOSIT_PLACE', 'DEPOSIT_RETURN', 'DIVIDEND'];

export function fmtMoney(kopecks: number, showSign = false): string {
  const rubles = kopecks / 100;
  const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(rubles));
  const sign = showSign && kopecks > 0 ? '+' : kopecks < 0 ? '−' : '';
  return `${sign}${formatted} ₽`;
}

export function fmtMoneyK(kopecks: number): string {
  const rubles = kopecks / 100;
  if (Math.abs(rubles) >= 1_000_000) return `${(rubles / 1_000_000).toFixed(1)} млн ₽`;
  if (Math.abs(rubles) >= 1_000) return `${(rubles / 1_000).toFixed(0)} тыс ₽`;
  return `${rubles.toFixed(0)} ₽`;
}

export function rublesInput(kopecks: number | null | undefined): string {
  if (kopecks === null || kopecks === undefined) return '';
  return (kopecks / 100).toFixed(2).replace('.00', '');
}

export function inputToKopecks(val: string): number {
  return Math.round(parseFloat(val.replace(',', '.') || '0') * 100);
}

export function useFinance() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function headers(): Record<string, string> {
    const token = process.client ? (localStorage.getItem('auth_token') ?? '') : '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString() : '';
    return $fetch<T>(`${apiBase}/api/finance${path}${qs}`, { headers: headers() });
  }

  function post<T>(path: string, body?: any): Promise<T> {
    return $fetch<T>(`${apiBase}/api/finance${path}`, { method: 'POST', headers: headers(), body });
  }

  function patch<T>(path: string, body?: any): Promise<T> {
    return $fetch<T>(`${apiBase}/api/finance${path}`, { method: 'PATCH', headers: headers(), body });
  }

  function del<T>(path: string): Promise<T> {
    return $fetch<T>(`${apiBase}/api/finance${path}`, { method: 'DELETE', headers: headers() });
  }

  return {
    // Accounts
    listAccounts: (all = false) => get<any[]>('/accounts', all ? { all: '1' } : {}),
    createAccount: (dto: any) => post<any>('/accounts', dto),
    updateAccount: (id: string, dto: any) => patch<any>(`/accounts/${id}`, dto),

    // Categories
    listCategories: (all = false) => get<any[]>('/categories', all ? { all: '1' } : {}),
    createCategory: (dto: any) => post<any>('/categories', dto),
    updateCategory: (id: string, dto: any) => patch<any>(`/categories/${id}`, dto),
    createSubcategory: (categoryId: string, dto: any) => post<any>(`/categories/${categoryId}/subcategories`, dto),
    updateSubcategory: (id: string, dto: any) => patch<any>(`/subcategories/${id}`, dto),

    // Operations
    listOperations: (params?: any) => get<{ total: number; items: any[] }>('/operations', params),
    createOperation: (dto: any) => post<any>('/operations', dto),
    updateOperation: (id: string, dto: any) => patch<any>(`/operations/${id}`, dto),
    deleteOperation: (id: string) => del<void>(`/operations/${id}`),

    // Orders
    listOrders: (params?: any) => get<{ total: number; items: any[] }>('/orders', params),
    createOrder: (dto: any) => post<any>('/orders', dto),
    updateOrder: (id: string, dto: any) => patch<any>(`/orders/${id}`, dto),
    archiveOrder: (id: string) => del<void>(`/orders/${id}`),

    // Reports
    getDashboard: (params?: any) => get<any>('/reports/dashboard', params),
    getCashflow: (params?: any) => get<any>('/reports/cashflow', params),
    getPnl: (params?: any) => get<any>('/reports/pnl', params),

    // Import
    importBank: (from: string, to: string) => post<any>('/import/bank', { from, to }),
    importCdek: (from: string, to: string) => post<any>('/import/cdek', { from, to }),
    integrationsHealth: () => get<any>('/integrations/health'),
  };
}
