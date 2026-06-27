import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAccountDto, UpdateAccountDto,
  CreateCategoryDto, UpdateCategoryDto, CreateSubcategoryDto,
  CreateOperationDto, UpdateOperationDto, OperationQueryDto,
  CreateFinOrderDto, UpdateFinOrderDto,
  ReportQueryDto,
} from './dto';
import { BankAdapter } from './bank.adapter';
import { CdekAdapter } from './cdek.adapter';

const PAGE_SIZE = 50;

function toRubles(kopecks: number) { return kopecks / 100; }
function kopecks(rubles: number) { return Math.round(rubles * 100); }

function parseDateRange(from?: string, to?: string) {
  const r: any = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); d.setDate(d.getDate() + 1); r.lt = d; }
  return Object.keys(r).length ? r : undefined;
}

// Non-P&L operation types
const NON_PNL_TYPES = ['TRANSFER', 'LOAN_PRINCIPAL', 'DEPOSIT_PLACE', 'DEPOSIT_RETURN', 'DIVIDEND'];

@Injectable()
export class FinanceService implements OnModuleInit {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: BankAdapter,
    private readonly cdek: CdekAdapter,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  // ─── Seed ──────────────────────────────────────────────────────────────────

  private async seedDefaults() {
    const accountCount = await this.prisma.finAccount.count();
    if (accountCount === 0) {
      const accounts = [
        { name: 'Основной (7213)', type: 'BANK' as const, order: 0 },
        { name: '4658', type: 'BANK' as const, order: 1 },
        { name: 'Счёт ИзиБук', type: 'BANK' as const, order: 2 },
        { name: 'Копилка', type: 'SAVINGS' as const, order: 3 },
        { name: 'Копилка 2', type: 'SAVINGS' as const, order: 4 },
      ];
      for (const a of accounts) {
        await this.prisma.finAccount.create({ data: a });
      }
      this.logger.log('Finance: seeded default accounts');
    }

    const catCount = await this.prisma.finCategory.count();
    if (catCount === 0) {
      const cats = [
        // Доходы
        { name: 'СБП', type: 'income', isPnl: true, order: 0 },
        { name: 'Онлайн-касса', type: 'income', isPnl: true, order: 1 },
        { name: 'Наложка СДЭК', type: 'income', isPnl: true, order: 2 },
        { name: 'Наложка Почта', type: 'income', isPnl: true, order: 3 },
        { name: 'Долями', type: 'income', isPnl: true, order: 4 },
        { name: 'Перевод на РС', type: 'income', isPnl: true, order: 5 },
        { name: 'Проценты по депозиту', type: 'income', isPnl: true, order: 6 },
        // Расходы — Производство
        { name: 'Материалы и расходники', type: 'expense', group: 'Производство', isPnl: true, order: 10 },
        { name: 'Печать', type: 'expense', group: 'Производство', isPnl: true, order: 11 },
        { name: 'Упаковка и комплектующие', type: 'expense', group: 'Производство', isPnl: true, order: 12 },
        { name: 'ФОТ производства', type: 'expense', group: 'Производство', isPnl: true, order: 13 },
        // Расходы — Коммерческий отдел
        { name: 'Реклама и маркетинг', type: 'expense', group: 'Коммерческий отдел', isPnl: true, order: 20 },
        { name: 'Логистика и доставка', type: 'expense', group: 'Коммерческий отдел', isPnl: true, order: 21 },
        { name: 'Комиссия СДЭК', type: 'expense', group: 'Коммерческий отдел', isPnl: true, order: 22 },
        { name: 'ФОТ продаж', type: 'expense', group: 'Коммерческий отдел', isPnl: true, order: 23 },
        // Расходы — Другое
        { name: 'Аренда', type: 'expense', group: 'Другое', isPnl: true, order: 30 },
        { name: 'Налоги и взносы', type: 'expense', group: 'Другое', isPnl: true, order: 31 },
        { name: 'Интернет и связь', type: 'expense', group: 'Другое', isPnl: true, order: 32 },
        { name: 'Банковские комиссии', type: 'expense', group: 'Другое', isPnl: true, order: 33 },
        { name: 'Офисные расходы', type: 'expense', group: 'Другое', isPnl: true, order: 34 },
        { name: 'Прочее', type: 'expense', group: 'Другое', isPnl: true, order: 35 },
        // Нне P&L
        { name: 'Перевод между счетами', type: 'transfer', isPnl: false, order: 50 },
        { name: 'Погашение тела кредита', type: 'loan_principal', isPnl: false, order: 51 },
        { name: 'Проценты по кредиту', type: 'expense', group: 'Другое', isPnl: true, order: 36 },
        { name: 'Размещение депозита', type: 'deposit_place', isPnl: false, order: 52 },
        { name: 'Возврат депозита', type: 'deposit_return', isPnl: false, order: 53 },
        { name: 'Дивиденды', type: 'dividend', isPnl: false, order: 54 },
      ];
      for (const c of cats) {
        await this.prisma.finCategory.create({ data: c as any });
      }
      this.logger.log('Finance: seeded default categories');
    }
  }

  // ─── Accounts ──────────────────────────────────────────────────────────────

  listAccounts() {
    return this.prisma.finAccount.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });
  }

  listAllAccounts() {
    return this.prisma.finAccount.findMany({ orderBy: { order: 'asc' } });
  }

  async createAccount(dto: CreateAccountDto) {
    return this.prisma.finAccount.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'BANK',
        openingBalance: dto.openingBalance ?? 0,
        currentBalance: dto.openingBalance ?? 0,
        order: dto.order ?? 0,
        bankAccountNumber: dto.bankAccountNumber ?? null,
      },
    });
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    return this.prisma.finAccount.update({ where: { id }, data: dto as any });
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  listCategories() {
    return this.prisma.finCategory.findMany({
      where: { archived: false },
      include: { subcategories: { where: { archived: false }, orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
  }

  listAllCategories() {
    return this.prisma.finCategory.findMany({
      include: { subcategories: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.finCategory.create({ data: dto as any });
  }

  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.finCategory.update({ where: { id }, data: dto as any });
  }

  createSubcategory(categoryId: string, dto: CreateSubcategoryDto) {
    return this.prisma.finSubcategory.create({ data: { categoryId, ...dto } });
  }

  updateSubcategory(id: string, dto: Partial<CreateSubcategoryDto> & { archived?: boolean }) {
    return this.prisma.finSubcategory.update({ where: { id }, data: dto as any });
  }

  // ─── Operations ────────────────────────────────────────────────────────────

  async listOperations(q: OperationQueryDto) {
    const page = Math.max(0, Number(q.page ?? 0));
    const pageSize = Math.min(500, Number(q.pageSize ?? PAGE_SIZE));
    const dateRange = parseDateRange(q.from, q.to);

    const where: any = {};
    if (dateRange) where.date = dateRange;
    if (q.accountId) where.accountId = q.accountId;
    if (q.project) where.project = q.project;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.type) where.type = q.type;
    if (q.search) {
      where.OR = [
        { counterparty: { contains: q.search, mode: 'insensitive' } },
        { comment: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.finOperation.count({ where }),
      this.prisma.finOperation.findMany({
        where,
        include: {
          account: true,
          category: true,
          subcategory: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: page * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items };
  }

  async createOperation(dto: CreateOperationDto) {
    const isPnlByType = !NON_PNL_TYPES.includes(dto.type ?? 'INCOME');
    const isPnl = dto.isPnl !== undefined ? dto.isPnl : isPnlByType;

    const op = await this.prisma.finOperation.create({
      data: {
        date: new Date(dto.date),
        accountId: dto.accountId,
        amountKopecks: dto.amountKopecks,
        type: (dto.type ?? 'INCOME') as any,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId,
        project: dto.project as any,
        counterparty: dto.counterparty,
        comment: dto.comment,
        isPnl,
        linkedAccountId: dto.linkedAccountId,
        finOrderId: dto.finOrderId,
        source: 'MANUAL' as any,
      },
      include: { account: true, category: true, subcategory: true },
    });
    await this.recalcAccountBalance(dto.accountId);
    if (dto.type === 'TRANSFER' && dto.linkedAccountId) {
      await this.recalcAccountBalance(dto.linkedAccountId);
    }
    return op;
  }

  async updateOperation(id: string, dto: UpdateOperationDto) {
    const existing = await this.prisma.finOperation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Операция не найдена');

    const isPnlByType = !NON_PNL_TYPES.includes(dto.type ?? existing.type);
    const isPnl = dto.isPnl !== undefined ? dto.isPnl : isPnlByType;

    const op = await this.prisma.finOperation.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        accountId: dto.accountId,
        amountKopecks: dto.amountKopecks,
        type: dto.type as any,
        categoryId: dto.categoryId ?? null,
        subcategoryId: dto.subcategoryId ?? null,
        project: dto.project as any ?? null,
        counterparty: dto.counterparty ?? null,
        comment: dto.comment ?? null,
        isPnl,
        linkedAccountId: dto.linkedAccountId ?? null,
        finOrderId: dto.finOrderId ?? null,
      },
      include: { account: true, category: true, subcategory: true },
    });

    const affectedAccounts = new Set<string>([
      existing.accountId,
      dto.accountId,
      ...(existing.linkedAccountId ? [existing.linkedAccountId] : []),
      ...(dto.linkedAccountId ? [dto.linkedAccountId] : []),
    ].filter(Boolean) as string[]);
    for (const aid of affectedAccounts) await this.recalcAccountBalance(aid);
    return op;
  }

  async deleteOperation(id: string) {
    const existing = await this.prisma.finOperation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Операция не найдена');
    await this.prisma.finOperation.delete({ where: { id } });
    await this.recalcAccountBalance(existing.accountId);
    if (existing.linkedAccountId) await this.recalcAccountBalance(existing.linkedAccountId);
  }

  private async recalcAccountBalance(accountId: string) {
    const account = await this.prisma.finAccount.findUnique({ where: { id: accountId } });
    if (!account) return;
    const ops = await this.prisma.finOperation.findMany({ where: { accountId } });
    const delta = ops.reduce((sum, op) => sum + op.amountKopecks, 0);
    await this.prisma.finAccount.update({
      where: { id: accountId },
      data: { currentBalance: account.openingBalance + delta },
    });
  }

  // ─── FinOrders ─────────────────────────────────────────────────────────────

  async listFinOrders(q: { status?: string; project?: string; from?: string; to?: string; page?: string; pageSize?: string }) {
    const page = Math.max(0, Number(q.page ?? 0));
    const pageSize = Math.min(200, Number(q.pageSize ?? 50));
    const where: any = { archived: false };
    if (q.status) where.status = q.status;
    if (q.project) where.project = q.project;
    if (q.from || q.to) where.createdAt = parseDateRange(q.from, q.to);

    const [total, items] = await Promise.all([
      this.prisma.finOrder.count({ where }),
      this.prisma.finOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items };
  }

  async createFinOrder(dto: CreateFinOrderDto) {
    const order = await this.prisma.finOrder.create({
      data: {
        clientRef: dto.clientRef,
        vkClientId: dto.vkClientId,
        project: (dto.project ?? 'EASYBOOK') as any,
        totalAmountKopecks: dto.totalAmountKopecks ?? 0,
        prepayKopecks: dto.prepayKopecks ?? 0,
        cdekFeeKopecks: dto.cdekFeeKopecks ?? 0,
        status: (dto.status ?? 'PREPAY') as any,
        shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : undefined,
        cdekTrackNumber: dto.cdekTrackNumber,
        comment: dto.comment,
      },
    });
    if (order.status === 'SHIPPED' && order.shippedAt) {
      await this.createRevenueAccrual(order);
    }
    return order;
  }

  async updateFinOrder(id: string, dto: UpdateFinOrderDto) {
    const existing = await this.prisma.finOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Заказ не найден');

    const wasShipped = existing.status === 'SHIPPED';
    const data: any = {};
    if (dto.clientRef !== undefined) data.clientRef = dto.clientRef;
    if (dto.vkClientId !== undefined) data.vkClientId = dto.vkClientId;
    if (dto.project !== undefined) data.project = dto.project;
    if (dto.totalAmountKopecks !== undefined) data.totalAmountKopecks = dto.totalAmountKopecks;
    if (dto.prepayKopecks !== undefined) data.prepayKopecks = dto.prepayKopecks;
    if (dto.cdekFeeKopecks !== undefined) data.cdekFeeKopecks = dto.cdekFeeKopecks;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.shippedAt !== undefined) data.shippedAt = dto.shippedAt ? new Date(dto.shippedAt) : null;
    if (dto.cdekTrackNumber !== undefined) data.cdekTrackNumber = dto.cdekTrackNumber;
    if (dto.comment !== undefined) data.comment = dto.comment;

    const order = await this.prisma.finOrder.update({ where: { id }, data });

    // Create revenue accrual when transitioning to SHIPPED
    const nowShipped = order.status === 'SHIPPED' && !wasShipped;
    if (nowShipped && order.shippedAt) {
      await this.createRevenueAccrual(order);
    }
    // Sтorno on REFUNDED
    if (order.status === 'REFUNDED' && wasShipped) {
      await this.createRefundAccrual(order);
    }
    return order;
  }

  private async createRevenueAccrual(order: any) {
    const period = new Date(order.shippedAt);
    period.setDate(1);
    period.setHours(0, 0, 0, 0);
    await this.prisma.accrualEntry.create({
      data: {
        period,
        type: 'REVENUE' as any,
        amountKopecks: order.totalAmountKopecks,
        project: order.project,
        finOrderId: order.id,
        description: `Выручка: ${order.clientRef ?? order.id}`,
      },
    });
    if (order.cdekFeeKopecks > 0) {
      await this.prisma.accrualEntry.create({
        data: {
          period,
          type: 'CDEK_FEE' as any,
          amountKopecks: -order.cdekFeeKopecks,
          project: order.project,
          finOrderId: order.id,
          description: `Комиссия СДЭК: ${order.clientRef ?? order.id}`,
        },
      });
    }
    await this.prisma.finOrder.update({
      where: { id: order.id },
      data: { revenueRecognizedAt: order.shippedAt },
    });
  }

  private async createRefundAccrual(order: any) {
    const period = new Date();
    period.setDate(1);
    period.setHours(0, 0, 0, 0);
    await this.prisma.accrualEntry.create({
      data: {
        period,
        type: 'REFUND' as any,
        amountKopecks: -order.totalAmountKopecks,
        project: order.project,
        finOrderId: order.id,
        description: `Возврат: ${order.clientRef ?? order.id}`,
      },
    });
  }

  async archiveFinOrder(id: string) {
    return this.prisma.finOrder.update({ where: { id }, data: { archived: true } });
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  async getCashflowReport(q: ReportQueryDto) {
    const dateRange = parseDateRange(q.from, q.to);
    const projectFilter = q.project && q.project !== 'ALL' ? { project: q.project as any } : {};

    const accounts = await this.prisma.finAccount.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });

    // All operations in period
    const ops = await this.prisma.finOperation.findMany({
      where: {
        ...(dateRange ? { date: dateRange } : {}),
        ...projectFilter,
      },
      include: { category: true, subcategory: true, account: true },
      orderBy: [{ date: 'asc' }],
    });

    // Account balances: opening = openingBalance + all ops before period
    const accountBalances = await Promise.all(
      accounts.map(async (acc) => {
        const opsBeforeRange = dateRange?.gte
          ? await this.prisma.finOperation.aggregate({
              where: { accountId: acc.id, date: { lt: dateRange.gte } },
              _sum: { amountKopecks: true },
            })
          : { _sum: { amountKopecks: 0 } };
        const openingBalance = acc.openingBalance + (opsBeforeRange._sum.amountKopecks ?? 0);

        const periodOps = ops.filter((o) => o.accountId === acc.id);
        const income = periodOps.filter((o) => o.amountKopecks > 0 && o.type !== 'TRANSFER').reduce((s, o) => s + o.amountKopecks, 0);
        const expense = periodOps.filter((o) => o.amountKopecks < 0 && o.type !== 'TRANSFER').reduce((s, o) => s + Math.abs(o.amountKopecks), 0);
        const transferIn = periodOps.filter((o) => o.type === 'TRANSFER' && o.amountKopecks > 0).reduce((s, o) => s + o.amountKopecks, 0);
        const transferOut = periodOps.filter((o) => o.type === 'TRANSFER' && o.amountKopecks < 0).reduce((s, o) => s + Math.abs(o.amountKopecks), 0);
        const closingBalance = openingBalance + income - expense + transferIn - transferOut;

        return {
          accountId: acc.id,
          accountName: acc.name,
          accountType: acc.type,
          openingBalance,
          income,
          expense,
          transferIn,
          transferOut,
          closingBalance,
        };
      }),
    );

    // Total income/expense by category
    const pnlOps = ops.filter((o) => o.isPnl);
    const incomeOps = pnlOps.filter((o) => o.amountKopecks > 0 && o.type === 'INCOME');
    const expenseOps = pnlOps.filter((o) => o.amountKopecks < 0 && o.type === 'EXPENSE');
    const transferOps = ops.filter((o) => o.type === 'TRANSFER');
    const nonPnlOps = ops.filter((o) => !o.isPnl && o.type !== 'TRANSFER');

    const totalIncome = incomeOps.reduce((s, o) => s + o.amountKopecks, 0);
    const totalExpense = expenseOps.reduce((s, o) => s + Math.abs(o.amountKopecks), 0);
    const netCashFlow = totalIncome - totalExpense;

    // Group income by category
    const byCategory = this.groupByCategory(incomeOps, expenseOps);

    return {
      period: { from: q.from, to: q.to },
      totalIncome,
      totalExpense,
      netCashFlow,
      accounts: accountBalances,
      byCategory,
      transferOps: transferOps.map((o) => this.mapOp(o)),
      nonPnlOps: nonPnlOps.map((o) => this.mapOp(o)),
    };
  }

  async getPnlReport(q: ReportQueryDto) {
    const dateRange = parseDateRange(q.from, q.to);
    const projectFilter = q.project && q.project !== 'ALL' ? { project: q.project as any } : {};

    // AccrualEntries for the period
    const accruals = await this.prisma.accrualEntry.findMany({
      where: {
        ...(dateRange ? { period: dateRange } : {}),
        ...projectFilter,
      },
      include: { finOrder: true },
      orderBy: { period: 'asc' },
    });

    // OPEX from FinOperations (isPnl=true, type=EXPENSE) in period
    const expenseOps = await this.prisma.finOperation.findMany({
      where: {
        type: 'EXPENSE' as any,
        isPnl: true,
        ...(dateRange ? { date: dateRange } : {}),
        ...projectFilter,
      },
      include: { category: true, subcategory: true },
    });

    const revenue = accruals.filter((a) => a.type === 'REVENUE').reduce((s, a) => s + a.amountKopecks, 0);
    const refunds = accruals.filter((a) => a.type === 'REFUND').reduce((s, a) => s + Math.abs(a.amountKopecks), 0);
    const cdekFees = accruals.filter((a) => a.type === 'CDEK_FEE').reduce((s, a) => s + Math.abs(a.amountKopecks), 0);
    const netRevenue = revenue - refunds - cdekFees;

    const opexTotal = expenseOps.reduce((s, o) => s + Math.abs(o.amountKopecks), 0);
    const grossProfit = netRevenue - opexTotal;

    // Group opex by category group
    const opexByGroup = this.groupExpenseByGroup(expenseOps);

    // Per project
    const projects = ['EASYBOOK', 'EASYNEON', 'IZIBANYA', 'GENERAL'];
    const byProject = projects.map((proj) => {
      const projAccruals = accruals.filter((a) => a.project === proj);
      const projRev = projAccruals.filter((a) => a.type === 'REVENUE').reduce((s, a) => s + a.amountKopecks, 0);
      const projRef = projAccruals.filter((a) => a.type === 'REFUND').reduce((s, a) => s + Math.abs(a.amountKopecks), 0);
      const projFee = projAccruals.filter((a) => a.type === 'CDEK_FEE').reduce((s, a) => s + Math.abs(a.amountKopecks), 0);
      const projExp = expenseOps.filter((o) => o.project === proj).reduce((s, o) => s + Math.abs(o.amountKopecks), 0);
      const projNetRev = projRev - projRef - projFee;
      return {
        project: proj,
        revenue: projRev,
        refunds: projRef,
        cdekFees: projFee,
        netRevenue: projNetRev,
        opex: projExp,
        grossProfit: projNetRev - projExp,
      };
    }).filter((p) => p.revenue > 0 || p.opex > 0);

    return {
      period: { from: q.from, to: q.to },
      revenue,
      refunds,
      cdekFees,
      netRevenue,
      opex: opexTotal,
      grossProfit,
      marginPercent: netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100) : 0,
      opexByGroup,
      byProject,
      accruals: accruals.map((a) => ({
        id: a.id,
        period: a.period,
        type: a.type,
        amountKopecks: a.amountKopecks,
        project: a.project,
        description: a.description,
        finOrderRef: (a as any).finOrder?.clientRef,
      })),
    };
  }

  async getDashboard(q: ReportQueryDto) {
    const now = new Date();
    const from = q.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = q.to ?? now.toISOString().slice(0, 10);

    const [cashflow, pnl] = await Promise.all([
      this.getCashflowReport({ from, to }),
      this.getPnlReport({ from, to }),
    ]);

    const accounts = await this.prisma.finAccount.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });

    const ordersShippedThisMonth = await this.prisma.finOrder.count({
      where: {
        status: { in: ['SHIPPED', 'DELIVERED'] as any[] },
        shippedAt: parseDateRange(from, to),
        archived: false,
      },
    });

    return {
      period: { from, to },
      totalIncome: cashflow.totalIncome,
      totalExpense: cashflow.totalExpense,
      netCashFlow: cashflow.netCashFlow,
      revenue: pnl.revenue,
      netRevenue: pnl.netRevenue,
      grossProfit: pnl.grossProfit,
      marginPercent: pnl.marginPercent,
      ordersShipped: ordersShippedThisMonth,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currentBalance: a.currentBalance,
      })),
    };
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  async importFromBank(from: string, to: string) {
    if (!this.bank.configured) {
      throw new BadRequestException('TBANK_TOKEN не задан в .env');
    }
    const txs = await this.bank.fetchTransactions(new Date(from), new Date(to));

    // Кэш счетов: сначала ищем по bankAccountNumber, иначе берём первый BANK-счёт
    const allAccounts = await this.prisma.finAccount.findMany({ where: { archived: false } });
    const accountByNumber = new Map(allAccounts.filter(a => a.bankAccountNumber).map(a => [a.bankAccountNumber!, a]));
    const fallbackAccount = allAccounts.find(a => a.type === 'BANK') ?? allAccounts[0];

    let created = 0;
    let skipped = 0;
    for (const tx of txs) {
      const existing = await this.prisma.finOperation.findUnique({
        where: { source_externalId: { source: 'BANK_IMPORT', externalId: tx.externalId } },
      });
      if (existing) { skipped++; continue; }

      const account = accountByNumber.get(tx.accountExternalId) ?? fallbackAccount;
      if (!account) continue;

      await this.prisma.finOperation.create({
        data: {
          date: tx.date,
          accountId: account.id,
          amountKopecks: tx.amountKopecks,
          type: tx.amountKopecks > 0 ? 'INCOME' : 'EXPENSE',
          counterparty: tx.counterparty,
          comment: tx.description,
          isPnl: true,
          source: 'BANK_IMPORT',
          externalId: tx.externalId,
        },
      });
      created++;
    }
    if (created > 0) {
      for (const a of allAccounts) await this.recalcAccountBalance(a.id);
    }
    return { imported: created, skipped, total: txs.length };
  }

  async getBankAccounts() {
    if (!this.bank.configured) throw new BadRequestException('TBANK_TOKEN не задан в .env');
    return this.bank.getBankAccounts();
  }

  async importFromCdek(from: string, to: string) {
    if (!this.cdek.configured) {
      throw new BadRequestException('CDEK_CLIENT_ID / CDEK_CLIENT_SECRET не заданы в .env');
    }
    const deliveries = await this.cdek.fetchDeliveries(new Date(from), new Date(to));
    let matched = 0;
    for (const d of deliveries) {
      const order = await this.prisma.finOrder.findFirst({ where: { cdekTrackNumber: d.trackingNumber } });
      if (!order) continue;
      if (d.status === 'DELIVERED' && order.status !== 'SHIPPED') {
        await this.updateFinOrder(order.id, { status: 'SHIPPED', shippedAt: d.deliveredAt?.toISOString() } as any);
      }
      if (d.cdekFeeKopecks > 0 && order.cdekFeeKopecks !== d.cdekFeeKopecks) {
        await this.prisma.finOrder.update({ where: { id: order.id }, data: { cdekFeeKopecks: d.cdekFeeKopecks } });
      }
      matched++;
    }
    return { matched, total: deliveries.length };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  checkBankHealth() { return this.bank.checkHealth(); }
  checkCdekHealth() { return this.cdek.checkHealth(); }

  private groupByCategory(incomeOps: any[], expenseOps: any[]) {
    const map = new Map<string, { name: string; type: string; total: number; group?: string }>();
    for (const op of incomeOps) {
      const key = op.categoryId ?? '_no_category';
      const name = op.category?.name ?? 'Без категории';
      const existing = map.get(key) ?? { name, type: 'income', total: 0 };
      map.set(key, { ...existing, total: existing.total + op.amountKopecks });
    }
    for (const op of expenseOps) {
      const key = op.categoryId ?? '_no_category_exp';
      const name = op.category?.name ?? 'Без категории';
      const group = op.category?.group;
      const existing = map.get(key) ?? { name, type: 'expense', total: 0, group };
      map.set(key, { ...existing, total: existing.total + Math.abs(op.amountKopecks) });
    }
    return Array.from(map.values());
  }

  private groupExpenseByGroup(ops: any[]) {
    const map = new Map<string, { group: string; total: number; categories: Map<string, { name: string; total: number }> }>();
    for (const op of ops) {
      const group = op.category?.group ?? 'Другое';
      const catName = op.category?.name ?? 'Без категории';
      const catId = op.categoryId ?? '_nc';
      if (!map.has(group)) map.set(group, { group, total: 0, categories: new Map() });
      const g = map.get(group)!;
      g.total += Math.abs(op.amountKopecks);
      const cat = g.categories.get(catId) ?? { name: catName, total: 0 };
      g.categories.set(catId, { ...cat, total: cat.total + Math.abs(op.amountKopecks) });
    }
    return Array.from(map.values()).map((g) => ({
      group: g.group,
      total: g.total,
      categories: Array.from(g.categories.values()),
    }));
  }

  private mapOp(op: any) {
    return {
      id: op.id,
      date: op.date,
      accountId: op.accountId,
      accountName: op.account?.name,
      amountKopecks: op.amountKopecks,
      type: op.type,
      categoryName: op.category?.name,
      project: op.project,
      counterparty: op.counterparty,
      comment: op.comment,
      isPnl: op.isPnl,
    };
  }
}
