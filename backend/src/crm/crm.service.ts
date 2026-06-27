import { Injectable } from '@nestjs/common';
import { PrismaCrmService } from './prisma-crm.service';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaCrmService) {}

  async findDeals(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    groupId?: number;
    workSpaceId?: number;
    periodFrom?: string;
    periodTo?: string;
  }) {
    const { page, limit, search, status, groupId, workSpaceId, periodFrom, periodTo } = params;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (status) where.status = status;
    if (groupId) where.groupId = groupId;
    if (workSpaceId) where.workSpaceId = workSpaceId;
    if (periodFrom || periodTo) {
      where.period = {};
      if (periodFrom) where.period.gte = periodFrom;
      if (periodTo) where.period.lte = periodTo;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { client: { fullName: { contains: search, mode: 'insensitive' } } },
        { client: { phone: { contains: search } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          saleDate: true,
          title: true,
          price: true,
          status: true,
          source: true,
          adTag: true,
          clothingMethod: true,
          period: true,
          paid: true,
          reservation: true,
          createdAt: true,
          client: { select: { id: true, fullName: true, phone: true } },
          user: { select: { id: true, fullName: true } },
          group: { select: { id: true, title: true } },
          workSpace: { select: { id: true, title: true } },
          payments: { select: { id: true, price: true, method: true } },
        },
      }),
      this.prisma.deal.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getDealStatuses() {
    const rows = await this.prisma.deal.findMany({
      where: { deletedAt: null },
      select: { status: true },
      distinct: ['status'],
    });
    return rows.map((r) => r.status).sort();
  }

  async getGroups() {
    return this.prisma.group.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
  }

  async getWorkSpaces() {
    return this.prisma.workSpace.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
  }
}
