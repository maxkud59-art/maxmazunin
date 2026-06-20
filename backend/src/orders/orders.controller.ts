import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Список заказов' })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('clientId') clientId?: string,
    @Query('orderStatusId') orderStatusId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.svc.list({ page: page ? +page : 0, pageSize: pageSize ? +pageSize : 30, clientId, orderStatusId, dateFrom, dateTo });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Заказ по ID' })
  getOne(@Param('id') id: string) { return this.svc.getOne(id); }

  @Post()
  @ApiOperation({ summary: 'Создать заказ' })
  create(@Body() dto: CreateOrderDto) { return this.svc.create(dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить заказ' })
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.svc.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Архивировать заказ (не удалять)' })
  archive(@Param('id') id: string) { return this.svc.archive(id); }
}
