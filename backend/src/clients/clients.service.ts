import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientDto } from './dto';

const DEFAULT_PAGE_SIZE = 30;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    crmStatusId?: string;
    tagId?: string;
    sortBy?: string;
    sortDir?: string;
  }) {
    const page = Number(params.page ?? 0);
    const pageSize = Math.min(Number(params.pageSize ?? DEFAULT_PAGE_SIZE), 1000);
    const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';

    const where: any = {};

    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { fio: { contains: params.search, mode: 'insensitive' } },
        { conversation: { clientName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    if (params.crmStatusId) where.crmStatusId = params.crmStatusId;
    if (params.tagId) where.tagLinks = { some: { tagId: params.tagId } };

    let orderBy: any = { firstContactAt: sortDir };
    if (params.sortBy === 'clientName') {
      orderBy = [{ firstName: sortDir }, { lastName: sortDir }];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.vkClient.count({ where }),
      this.prisma.vkClient.findMany({
        where,
        orderBy,
        skip: page * pageSize,
        take: pageSize,
        include: {
          conversation: { select: { clientName: true, clientAvatar: true, lastMessageAt: true, id: true } },
          crmStatus: { select: { id: true, name: true, color: true } },
          tagLinks: { include: { tag: { select: { id: true, name: true, color: true } } } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((c) => this.mapClient(c)),
    };
  }

  async getOne(id: string) {
    const c = await this.prisma.vkClient.findUnique({
      where: { id },
      include: {
        conversation: { select: { clientName: true, clientAvatar: true, lastMessageAt: true, id: true } },
        crmStatus: { select: { id: true, name: true, color: true } },
        tagLinks: { include: { tag: { select: { id: true, name: true, color: true } } } },
        orders: {
          where: { archived: false },
          include: { orderStatus: { select: { id: true, name: true, color: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!c) throw new NotFoundException('Клиент не найден');
    return this.mapClient(c);
  }

  async update(id: string, dto: UpdateClientDto) {
    const { tagIds, ...rest } = dto;

    await this.prisma.vkClient.update({
      where: { id },
      data: {
        ...rest,
        ...(tagIds !== undefined && {
          tagLinks: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
    });

    return this.getOne(id);
  }

  private mapClient(c: any) {
    const conv = c.conversation;
    return {
      id: c.id,
      peerId: c.peerId,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      fio: c.fio ?? null,
      clientName: conv?.clientName ?? null,
      clientAvatar: c.avatar ?? conv?.clientAvatar ?? null,
      vkUrl: c.vkUrl ?? `https://vk.com/id${c.peerId}`,
      phone: c.phone ?? null,
      city: c.city ?? null,
      source: c.source ?? null,
      note: c.note ?? null,
      firstContactAt: c.firstContactAt ?? conv?.lastMessageAt ?? null,
      crmStatus: c.crmStatus ?? null,
      tags: (c.tagLinks ?? []).map((tl: any) => tl.tag),
      conversationId: conv?.id ?? null,
      orders: c.orders ?? undefined,
    };
  }
}
