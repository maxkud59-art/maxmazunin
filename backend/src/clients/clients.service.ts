import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientDto } from './dto';

const DEFAULT_PAGE_SIZE = 30;

function parseDateRange(from?: string, to?: string): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const range: Record<string, Date> = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = new Date(to);
  return range;
}

function splitIds(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    vkUrl?: string;
    phone?: string;
    email?: string;
    city?: string;
    country?: string;
    source?: string;
    note?: string;
    crmStatusId?: string;
    crmStatusIds?: string;
    tagId?: string;
    tagIds?: string;
    tagMatch?: string;
    firstContactFrom?: string;
    firstContactTo?: string;
    lastContactFrom?: string;
    lastContactTo?: string;
    nextContactFrom?: string;
    nextContactTo?: string;
    peerIds?: string;
    ids?: string;
    hasOrders?: string;
    orderStatusId?: string;
    orderAmountMin?: string;
    orderAmountMax?: string;
    sortBy?: string;
    sortDir?: string;
  }) {
    const page = Number(params.page ?? 0);
    const pageSize = Math.min(Number(params.pageSize ?? DEFAULT_PAGE_SIZE), 1000);
    const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';

    const andConditions: any[] = [];

    // ─── Text search (ФИО / имя в соцсети) ──────────────────────────
    if (params.search) {
      andConditions.push({
        OR: [
          { firstName: { contains: params.search, mode: 'insensitive' } },
          { lastName: { contains: params.search, mode: 'insensitive' } },
          { fio: { contains: params.search, mode: 'insensitive' } },
          { conversation: { clientName: { contains: params.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (params.vkUrl) andConditions.push({ vkUrl: { contains: params.vkUrl, mode: 'insensitive' } });
    if (params.phone) andConditions.push({ phone: { contains: params.phone, mode: 'insensitive' } });
    if (params.email) andConditions.push({ email: { contains: params.email, mode: 'insensitive' } });
    if (params.city) andConditions.push({ city: { contains: params.city, mode: 'insensitive' } });
    if (params.country) andConditions.push({ country: { contains: params.country, mode: 'insensitive' } });
    if (params.source) andConditions.push({ source: { contains: params.source, mode: 'insensitive' } });
    if (params.note) andConditions.push({ note: { contains: params.note, mode: 'insensitive' } });

    // ─── CRM status ─────────────────────────────────────────────────
    const crmIds = splitIds(params.crmStatusIds);
    if (crmIds.length) {
      andConditions.push({ crmStatusId: { in: crmIds } });
    } else if (params.crmStatusId) {
      andConditions.push({ crmStatusId: params.crmStatusId });
    }

    // ─── Tags ────────────────────────────────────────────────────────
    const tagIdList = splitIds(params.tagIds);
    if (tagIdList.length) {
      if (params.tagMatch === 'all') {
        // AND: client must have ALL listed tags
        for (const tid of tagIdList) {
          andConditions.push({ tagLinks: { some: { tagId: tid } } });
        }
      } else {
        // OR: client must have ANY of the listed tags (default)
        andConditions.push({ tagLinks: { some: { tagId: { in: tagIdList } } } });
      }
    } else if (params.tagId) {
      andConditions.push({ tagLinks: { some: { tagId: params.tagId } } });
    }

    // ─── Date ranges ─────────────────────────────────────────────────
    const firstRange = parseDateRange(params.firstContactFrom, params.firstContactTo);
    if (firstRange) andConditions.push({ firstContactAt: firstRange });

    const lastRange = parseDateRange(params.lastContactFrom, params.lastContactTo);
    if (lastRange) andConditions.push({ lastContactAt: lastRange });

    const nextRange = parseDateRange(params.nextContactFrom, params.nextContactTo);
    if (nextRange) andConditions.push({ nextContactDate: nextRange });

    // ─── Multiple IDs ────────────────────────────────────────────────
    const peerIdList = splitIds(params.peerIds).map(Number).filter((n) => !isNaN(n));
    if (peerIdList.length) andConditions.push({ peerId: { in: peerIdList } });

    const clientIdList = splitIds(params.ids);
    if (clientIdList.length) andConditions.push({ id: { in: clientIdList } });

    // ─── Order filters ───────────────────────────────────────────────
    if (params.hasOrders === 'yes') {
      andConditions.push({ orders: { some: { archived: false } } });
    } else if (params.hasOrders === 'no') {
      andConditions.push({ orders: { none: { archived: false } } });
    }

    if (params.orderStatusId || params.orderAmountMin || params.orderAmountMax) {
      const orderFilter: any = { archived: false };
      if (params.orderStatusId) orderFilter.orderStatusId = params.orderStatusId;
      if (params.orderAmountMin || params.orderAmountMax) {
        orderFilter.amount = {};
        if (params.orderAmountMin) orderFilter.amount.gte = Number(params.orderAmountMin);
        if (params.orderAmountMax) orderFilter.amount.lte = Number(params.orderAmountMax);
      }
      andConditions.push({ orders: { some: orderFilter } });
    }

    const where: any = andConditions.length ? { AND: andConditions } : {};

    // ─── Sorting ─────────────────────────────────────────────────────
    let orderBy: any = { firstContactAt: sortDir };
    if (params.sortBy === 'clientName') {
      orderBy = [{ firstName: sortDir }, { lastName: sortDir }];
    } else if (params.sortBy === 'lastContactAt') {
      orderBy = { lastContactAt: sortDir };
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
    const { tagIds, nextContactDate, lastContactAt, birthDate, ...rest } = dto;

    await this.prisma.vkClient.update({
      where: { id },
      data: {
        ...rest,
        ...(nextContactDate !== undefined && {
          nextContactDate: nextContactDate ? new Date(nextContactDate) : null,
        }),
        ...(lastContactAt !== undefined && {
          lastContactAt: lastContactAt ? new Date(lastContactAt) : null,
        }),
        ...(birthDate !== undefined && {
          birthDate: birthDate ? new Date(birthDate) : null,
        }),
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
      email: c.email ?? null,
      birthDate: c.birthDate ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
      source: c.source ?? null,
      note: c.note ?? null,
      firstContactAt: c.firstContactAt ?? conv?.lastMessageAt ?? null,
      lastContactAt: c.lastContactAt ?? null,
      nextContactDate: c.nextContactDate ?? null,
      crmStatus: c.crmStatus ?? null,
      tags: (c.tagLinks ?? []).map((tl: any) => tl.tag),
      conversationId: conv?.id ?? null,
      orders: c.orders ?? undefined,
    };
  }
}
