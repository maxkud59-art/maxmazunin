/**
 * Адаптер СДЭК.
 * Токен: CDEK_CLIENT_ID + CDEK_CLIENT_SECRET в .env (OAuth 2.0).
 * Что нужно: статусы выдачи (для признания выручки в ПНЛ), суммы наложенного платежа,
 * комиссии СДЭК, даты выплат.
 *
 * Сейчас — заглушка. Подключение:
 *   1. Вписать CDEK_CLIENT_ID и CDEK_CLIENT_SECRET в .env.
 *   2. Реализовать методы ниже через СДЭК API v2 (https://api.cdek.ru/v2/).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CdekDelivery {
  trackingNumber: string;
  status: string;        // e.g. 'DELIVERED' | 'RECEIVED_AT_PICKUP_POINT' | ...
  deliveredAt?: Date;
  codAmountKopecks: number;    // наложенный платёж
  cdekFeeKopecks: number;      // комиссия СДЭК
  paidOutAt?: Date;            // дата выплаты наложенного платежа
}

@Injectable()
export class CdekAdapter {
  private readonly logger = new Logger(CdekAdapter.name);
  readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    this.configured = !!(
      config.get<string>('CDEK_CLIENT_ID') &&
      config.get<string>('CDEK_CLIENT_SECRET')
    );
    if (!this.configured) {
      this.logger.warn('CDEK_CLIENT_ID/CDEK_CLIENT_SECRET not set — CDEK import disabled');
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) {
      return { ok: false, message: 'CDEK_CLIENT_ID / CDEK_CLIENT_SECRET не заданы в .env' };
    }
    return { ok: false, message: 'Интеграция СДЭК не реализована. Добавьте логику в cdek.adapter.ts.' };
  }

  async fetchDeliveries(_from: Date, _to: Date): Promise<CdekDelivery[]> {
    if (!this.configured) return [];
    this.logger.warn('CdekAdapter.fetchDeliveries: не реализовано');
    return [];
  }

  async fetchByTrackNumber(_trackNumber: string): Promise<CdekDelivery | null> {
    if (!this.configured) return null;
    return null;
  }
}
