import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DirectoriesService } from './directories.service';
import {
  CreateCrmStatusDto, UpdateCrmStatusDto,
  CreateTagDto, UpdateTagDto,
  CreateOrderStatusDto, UpdateOrderStatusDto,
} from './dto';

@ApiTags('directories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('directories')
export class DirectoriesController {
  constructor(private readonly svc: DirectoriesService) {}

  // CRM Statuses
  @Get('crm-statuses') @ApiOperation({ summary: 'CRM-статусы' })
  listCrmStatuses() { return this.svc.listCrmStatuses(); }

  @Post('crm-statuses') @ApiOperation({ summary: 'Создать CRM-статус' })
  createCrmStatus(@Body() dto: CreateCrmStatusDto) { return this.svc.createCrmStatus(dto); }

  @Patch('crm-statuses/:id') @ApiOperation({ summary: 'Обновить CRM-статус' })
  updateCrmStatus(@Param('id') id: string, @Body() dto: UpdateCrmStatusDto) {
    return this.svc.updateCrmStatus(id, dto);
  }

  // Tags
  @Get('tags') @ApiOperation({ summary: 'Теги' })
  listTags() { return this.svc.listTags(); }

  @Post('tags') @ApiOperation({ summary: 'Создать тег' })
  createTag(@Body() dto: CreateTagDto) { return this.svc.createTag(dto); }

  @Patch('tags/:id') @ApiOperation({ summary: 'Обновить тег' })
  updateTag(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.svc.updateTag(id, dto);
  }

  // Order Statuses
  @Get('order-statuses') @ApiOperation({ summary: 'Статусы заказов' })
  listOrderStatuses() { return this.svc.listOrderStatuses(); }

  @Post('order-statuses') @ApiOperation({ summary: 'Создать статус заказа' })
  createOrderStatus(@Body() dto: CreateOrderStatusDto) { return this.svc.createOrderStatus(dto); }

  @Patch('order-statuses/:id') @ApiOperation({ summary: 'Обновить статус заказа' })
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.svc.updateOrderStatus(id, dto);
  }
}
