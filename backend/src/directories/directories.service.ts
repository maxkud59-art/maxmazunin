import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCrmStatusDto, UpdateCrmStatusDto,
  CreateTagDto, UpdateTagDto,
  CreateOrderStatusDto, UpdateOrderStatusDto,
} from './dto';

const DEFAULT_CRM_STATUSES = [
  { name: 'Новый', color: '#6366f1', order: 0 },
  { name: 'В работе', color: '#f59e0b', order: 1 },
  { name: 'Оплачен', color: '#10b981', order: 2 },
  { name: 'Отказ', color: '#ef4444', order: 3 },
];

const DEFAULT_ORDER_STATUSES = [
  { name: 'Новый', color: '#6366f1', order: 0 },
  { name: 'В производстве', color: '#f59e0b', order: 1 },
  { name: 'Готов', color: '#10b981', order: 2 },
  { name: 'Отгружен', color: '#3b82f6', order: 3 },
  { name: 'Отменён', color: '#ef4444', order: 4 },
];

@Injectable()
export class DirectoriesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults() {
    for (const s of DEFAULT_CRM_STATUSES) {
      await this.prisma.crmStatus.upsert({
        where: { id: `default_crm_${s.order}` },
        create: { id: `default_crm_${s.order}`, ...s },
        update: {},
      });
    }
    for (const s of DEFAULT_ORDER_STATUSES) {
      await this.prisma.orderStatus.upsert({
        where: { id: `default_ord_${s.order}` },
        create: { id: `default_ord_${s.order}`, ...s },
        update: {},
      });
    }
  }

  // ─── CRM Statuses ────────────────────────────────────────────────────────────

  listCrmStatuses() {
    return this.prisma.crmStatus.findMany({ orderBy: [{ archived: 'asc' }, { order: 'asc' }] });
  }

  createCrmStatus(dto: CreateCrmStatusDto) {
    return this.prisma.crmStatus.create({ data: dto });
  }

  updateCrmStatus(id: string, dto: UpdateCrmStatusDto) {
    return this.prisma.crmStatus.update({ where: { id }, data: dto });
  }

  // ─── Tags ────────────────────────────────────────────────────────────────────

  listTags() {
    return this.prisma.tag.findMany({ orderBy: [{ archived: 'asc' }, { name: 'asc' }] });
  }

  createTag(dto: CreateTagDto) {
    return this.prisma.tag.create({ data: dto });
  }

  updateTag(id: string, dto: UpdateTagDto) {
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  // ─── Order Statuses ──────────────────────────────────────────────────────────

  listOrderStatuses() {
    return this.prisma.orderStatus.findMany({ orderBy: [{ archived: 'asc' }, { order: 'asc' }] });
  }

  createOrderStatus(dto: CreateOrderStatusDto) {
    return this.prisma.orderStatus.create({ data: dto });
  }

  updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    return this.prisma.orderStatus.update({ where: { id }, data: dto });
  }
}
