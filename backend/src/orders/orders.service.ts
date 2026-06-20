import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, UpdateOrderDto } from './dto';

const PAGE_SIZE = 30;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    page?: number;
    pageSize?: number;
    clientId?: string;
    orderStatusId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = Number(params.page ?? 0);
    const pageSize = Math.min(Number(params.pageSize ?? PAGE_SIZE), 1000);

    const where: any = { archived: false };
    if (params.clientId) where.clientId = params.clientId;
    if (params.orderStatusId) where.orderStatusId = params.orderStatusId;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        include: {
          client: {
            select: {
              id: true, peerId: true, firstName: true, lastName: true, fio: true,
              conversation: { select: { clientName: true } },
            },
          },
          orderStatus: { select: { id: true, name: true, color: true } },
        },
      }),
    ]);

    return { total, page, pageSize, items: items.map(this.mapOrder) };
  }

  async getOne(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true, peerId: true, firstName: true, lastName: true, fio: true,
            conversation: { select: { clientName: true } },
          },
        },
        orderStatus: { select: { id: true, name: true, color: true } },
      },
    });
    if (!o || o.archived) throw new NotFoundException('Заказ не найден');
    return this.mapOrder(o);
  }

  async create(dto: CreateOrderDto) {
    const o = await this.prisma.order.create({
      data: dto,
      include: {
        client: {
          select: {
            id: true, peerId: true, firstName: true, lastName: true, fio: true,
            conversation: { select: { clientName: true } },
          },
        },
        orderStatus: { select: { id: true, name: true, color: true } },
      },
    });
    return this.mapOrder(o);
  }

  async update(id: string, dto: UpdateOrderDto) {
    await this.prisma.order.update({ where: { id }, data: dto });
    return this.getOne(id);
  }

  async archive(id: string) {
    await this.prisma.order.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  private mapOrder(o: any) {
    const c = o.client;
    return {
      id: o.id,
      number: o.number,
      clientId: o.clientId,
      clientName: c?.firstName
        ? `${c.firstName} ${c.lastName ?? ''}`.trim()
        : c?.fio ?? c?.conversation?.clientName ?? '—',
      client: c ?? null,
      orderStatus: o.orderStatus ?? null,
      amount: o.amount ?? null,
      items: o.items ?? null,
      comment: o.comment ?? null,
      createdAt: o.createdAt,
      archived: o.archived,
    };
  }
}
