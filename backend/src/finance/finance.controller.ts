import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceService } from './finance.service';
import {
  CreateAccountDto, UpdateAccountDto,
  CreateCategoryDto, UpdateCategoryDto, CreateSubcategoryDto,
  CreateOperationDto, UpdateOperationDto, OperationQueryDto,
  CreateFinOrderDto, UpdateFinOrderDto,
  ReportQueryDto,
} from './dto';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // ─── Accounts ──────────────────────────────────────────────────────────────
  @Get('accounts')
  @ApiOperation({ summary: 'Список счетов' })
  listAccounts(@Query('all') all?: string) {
    return all ? this.svc.listAllAccounts() : this.svc.listAccounts();
  }

  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto) { return this.svc.createAccount(dto); }

  @Patch('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.svc.updateAccount(id, dto);
  }

  // ─── Categories ────────────────────────────────────────────────────────────
  @Get('categories')
  listCategories(@Query('all') all?: string) {
    return all ? this.svc.listAllCategories() : this.svc.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) { return this.svc.createCategory(dto); }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.svc.updateCategory(id, dto);
  }

  @Post('categories/:id/subcategories')
  createSubcategory(@Param('id') categoryId: string, @Body() dto: CreateSubcategoryDto) {
    return this.svc.createSubcategory(categoryId, dto);
  }

  @Patch('subcategories/:id')
  updateSubcategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.svc.updateSubcategory(id, dto);
  }

  // ─── Operations ────────────────────────────────────────────────────────────
  @Get('operations')
  listOperations(@Query() q: OperationQueryDto) { return this.svc.listOperations(q); }

  @Post('operations')
  createOperation(@Body() dto: CreateOperationDto) { return this.svc.createOperation(dto); }

  @Patch('operations/:id')
  updateOperation(@Param('id') id: string, @Body() dto: UpdateOperationDto) {
    return this.svc.updateOperation(id, dto);
  }

  @Delete('operations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOperation(@Param('id') id: string) { return this.svc.deleteOperation(id); }

  // ─── FinOrders ─────────────────────────────────────────────────────────────
  @Get('orders')
  listOrders(@Query() q: any) { return this.svc.listFinOrders(q); }

  @Post('orders')
  createOrder(@Body() dto: CreateFinOrderDto) { return this.svc.createFinOrder(dto); }

  @Patch('orders/:id')
  updateOrder(@Param('id') id: string, @Body() dto: UpdateFinOrderDto) {
    return this.svc.updateFinOrder(id, dto);
  }

  @Delete('orders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveOrder(@Param('id') id: string) { return this.svc.archiveFinOrder(id); }

  // ─── Reports ───────────────────────────────────────────────────────────────
  @Get('reports/dashboard')
  @ApiOperation({ summary: 'Дашборд: ключевые цифры за период' })
  getDashboard(@Query() q: ReportQueryDto) { return this.svc.getDashboard(q); }

  @Get('reports/cashflow')
  @ApiOperation({ summary: 'Отчёт ДДС' })
  getCashflow(@Query() q: ReportQueryDto) { return this.svc.getCashflowReport(q); }

  @Get('reports/pnl')
  @ApiOperation({ summary: 'Отчёт ПНЛ (по начислению)' })
  getPnl(@Query() q: ReportQueryDto) { return this.svc.getPnlReport(q); }

  // ─── Bank ──────────────────────────────────────────────────────────────────
  @Get('bank/accounts')
  @ApiOperation({ summary: 'Список счетов T-Bank' })
  getBankAccounts() {
    return this.svc.getBankAccounts();
  }

  // ─── Import ────────────────────────────────────────────────────────────────
  @Post('import/bank')
  @ApiOperation({ summary: 'Импорт из T-Bank (выписка за период)' })
  importBank(@Body() body: { from: string; to: string }) {
    return this.svc.importFromBank(body.from, body.to);
  }

  @Post('import/cdek')
  @ApiOperation({ summary: 'Импорт из СДЭК' })
  importCdek(@Body() body: { from: string; to: string }) {
    return this.svc.importFromCdek(body.from, body.to);
  }

  @Get('integrations/health')
  @ApiOperation({ summary: 'Статус интеграций (банк + СДЭК)' })
  async integrationsHealth() {
    const [bank, cdek] = await Promise.all([
      this.svc.checkBankHealth(),
      this.svc.checkCdekHealth(),
    ]);
    return { bank, cdek };
  }
}
