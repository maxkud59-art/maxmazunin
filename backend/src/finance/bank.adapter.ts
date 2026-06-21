/**
 * Адаптер банка.
 * Токен банка — BANK_API_TOKEN в .env; метод API зависит от конкретного банка.
 * Сейчас — заглушка с интерфейсом. Подключение конкретного банка:
 *   1. Вписать BANK_API_TOKEN в .env на сервере.
 *   2. Реализовать fetchTransactions() под API вашего банка (Т-Банк, Сбер, Альфа и т.д.).
 *   3. Убрать return [] и подключить HTTP-клиент.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BankTransaction {
  externalId: string;
  date: Date;
  amountKopecks: number; // положительное = приход, отрицательное = расход
  counterparty: string;
  description: string;
  accountExternalId: string;
}

@Injectable()
export class BankAdapter {
  private readonly logger = new Logger(BankAdapter.name);
  readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    this.configured = !!config.get<string>('BANK_API_TOKEN');
    if (!this.configured) {
      this.logger.warn('BANK_API_TOKEN not set — bank import disabled');
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) return { ok: false, message: 'BANK_API_TOKEN не задан в .env' };
    // TODO: реализовать вызов API банка
    return { ok: false, message: 'Интеграция с банком не реализована. Добавьте логику в bank.adapter.ts.' };
  }

  async fetchTransactions(_from: Date, _to: Date): Promise<BankTransaction[]> {
    if (!this.configured) return [];
    this.logger.warn('BankAdapter.fetchTransactions: не реализовано для конкретного банка');
    // TODO: реализовать
    return [];
  }
}
