import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/crm-client';

@Injectable()
export class PrismaCrmService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaCrmService.name);
  readonly configured: boolean;

  constructor() {
    const url = process.env.CRM_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
    super({ datasources: { db: { url } } });
    this.configured = !!process.env.CRM_DATABASE_URL;
    if (!this.configured) {
      this.logger.warn('CRM_DATABASE_URL not set — CRM module will be unavailable');
    }
  }

  async onModuleInit() {
    if (this.configured) await this.$connect();
  }

  async onModuleDestroy() {
    if (this.configured) await this.$disconnect();
  }
}
