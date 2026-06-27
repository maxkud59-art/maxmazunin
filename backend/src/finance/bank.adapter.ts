import { Injectable, Logger } from '@nestjs/common';

export interface BankTransaction {
  externalId: string;
  date: Date;
  amountKopecks: number; // positive = income, negative = expense
  counterparty: string;
  description: string;
  accountExternalId: string; // T-Bank account number
}

type Rec = Record<string, unknown>;

@Injectable()
export class BankAdapter {
  private readonly logger = new Logger(BankAdapter.name);
  readonly configured: boolean;

  private readonly accountsUrl = 'https://business.tbank.ru/openapi/api/v4/bank-accounts';
  private readonly statementUrl = 'https://business.tbank.ru/openapi/api/v1/statement';

  constructor() {
    this.configured = !!this._token();
    if (!this.configured) {
      this.logger.warn('TBANK_TOKEN not set — bank import disabled');
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) return { ok: false, message: 'TBANK_TOKEN не задан в .env' };
    try {
      const accounts = await this._getAccounts();
      return { ok: true, message: `T-Bank OK: ${accounts.length} счетов` };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'T-Bank API error' };
    }
  }

  async fetchTransactions(from: Date, to: Date): Promise<BankTransaction[]> {
    if (!this.configured) return [];

    const accounts = await this._getAccounts();
    const result: BankTransaction[] = [];

    for (const acc of accounts) {
      if (!acc.number) continue;
      try {
        const ops = await this._fetchStatement(acc.number, from, to);
        result.push(...ops);
      } catch (e: any) {
        this.logger.error(`Statement error for ${acc.number}: ${e?.message}`);
      }
    }

    return result;
  }

  // ── T-Bank: список счетов ────────────────────────────────────────────────

  async getBankAccounts() {
    return this._getAccounts();
  }

  private async _getAccounts() {
    const res = await fetch(this.accountsUrl, { headers: this._headers() });
    if (!res.ok) throw new Error(`T-Bank accounts: ${res.status}`);
    const payload = await res.json() as unknown;
    return this._extractAccounts(payload);
  }

  private _extractAccounts(payload: unknown): { id: string; number: string; name: string; balance: number | null }[] {
    const records = this._extractList(payload);
    return records.map((r, i) => {
      const number = this._str(r.accountNumber ?? r.number ?? r.account);
      const id = this._str(r.id ?? r.accountId) || number;
      const balance = this._money(r.balance ?? r.currentBalance ?? r.availableBalance);
      const name = this._str(r.name ?? r.accountName ?? r.type) || `Счёт …${number.slice(-4) || i}`;
      return { id: id || `acc-${i}`, number, name, balance };
    });
  }

  // ── T-Bank: выписка по счёту ────────────────────────────────────────────

  private async _fetchStatement(accountNumber: string, from: Date, to: Date): Promise<BankTransaction[]> {
    const ops: BankTransaction[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(this.statementUrl);
      url.searchParams.set('accountNumber', accountNumber);
      url.searchParams.set('from', from.toISOString());
      url.searchParams.set('to', to.toISOString());
      url.searchParams.set('limit', '500');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url.toString(), { headers: this._headers() });
      if (!res.ok) throw new Error(`T-Bank statement ${accountNumber}: ${res.status}`);

      const payload = await res.json() as Rec;
      const rawOps = Array.isArray(payload.operations) ? payload.operations as Rec[] : [];
      cursor = typeof payload.nextCursor === 'string' ? payload.nextCursor : undefined;

      for (const op of rawOps) {
        const mapped = this._mapOp(op, accountNumber);
        if (mapped) ops.push(mapped);
      }
    } while (cursor);

    return ops;
  }

  private _mapOp(op: Rec, accountNumber: string): BankTransaction | null {
    const id = this._str(op.operationId);
    if (!id) return null;

    const status = this._str(op.operationStatus).toLowerCase();
    // Skip pending/rejected operations
    if (status && !['executed', 'paid', 'ok', 'success', 'confirmed', ''].includes(status)) {
      return null;
    }

    const date = new Date(this._str(op.operationDate) || this._str(op.date));
    if (isNaN(date.getTime())) return null;

    const amountRub = this._money(op.accountAmount ?? op.operationAmount) ?? 0;
    const amountKopecks = Math.round(Math.abs(amountRub) * 100);

    const typeRaw = this._str(op.typeOfOperation).toLowerCase();
    const isCredit = typeRaw === 'credit';
    const signedKopecks = isCredit ? amountKopecks : -amountKopecks;

    const description = this._str(op.payPurpose ?? op.description);

    let counterparty = '';
    for (const field of [op.counterParty, op.payer, op.receiver]) {
      if (field && typeof field === 'object') {
        const r = field as Rec;
        counterparty = this._str(r.name ?? r.fullName ?? r.inn);
        if (counterparty) break;
      }
    }

    return {
      externalId: id,
      date,
      amountKopecks: signedKopecks,
      counterparty,
      description,
      accountExternalId: accountNumber,
    };
  }

  // ── Утилиты ──────────────────────────────────────────────────────────────

  private _token() {
    return (
      process.env.TBANK_TOKEN ??
      process.env.T_BANK_TOKEN ??
      process.env.TBANK_API_TOKEN ??
      process.env.BANK_API_TOKEN ??
      ''
    ).trim();
  }

  private _headers() {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this._token()}`,
      'X-Request-Id': crypto.randomUUID(),
    };
  }

  private _extractList(payload: unknown): Rec[] {
    if (Array.isArray(payload)) return payload.filter(Boolean) as Rec[];
    if (!payload || typeof payload !== 'object') return [];
    const r = payload as Rec;
    for (const key of ['accounts', 'bankAccounts', 'items', 'result', 'data']) {
      if (Array.isArray(r[key])) return r[key] as Rec[];
    }
    return [r];
  }

  private _str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  private _money(v: unknown): number | null {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(',', '.'));
      return isFinite(n) ? n : null;
    }
    if (v && typeof v === 'object') {
      const r = v as Rec;
      return this._money(r.amount ?? r.value ?? r.sum);
    }
    return null;
  }
}
