import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { VkAdsService } from './vk-ads.service';
import { VkCabinetDto } from './dto/cabinet.dto';
import { HourlyStatDto } from './dto/hourly.dto';
import { HourProfileItemDto } from './dto/hour-profile.dto';
import { PollResultDto } from './dto/poll.dto';

@ApiTags('vk-ads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vk-ads')
export class VkAdsController {
  constructor(private readonly vkAdsService: VkAdsService) {}

  @Get('cabinets')
  @ApiOperation({ summary: 'Список рекламных кабинетов VK' })
  @ApiResponse({ status: 200, type: [VkCabinetDto] })
  getCabinets(): Promise<VkCabinetDto[]> {
    return this.vkAdsService.getCabinets();
  }

  @Get('hourly')
  @ApiOperation({ summary: 'Почасовые метрики кабинета за день (МСК)' })
  @ApiQuery({ name: 'cabinetId', required: true, type: String })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'YYYY-MM-DD по МСК' })
  @ApiResponse({ status: 200, type: [HourlyStatDto] })
  getHourly(
    @Query('cabinetId') cabinetId: string,
    @Query('date') date: string,
  ): Promise<HourlyStatDto[]> {
    return this.vkAdsService.getHourly(cabinetId, date);
  }

  @Get('hour-profile')
  @ApiOperation({ summary: 'Средний профиль метрик по часу суток (0–23 МСК) за период' })
  @ApiQuery({ name: 'cabinetId', required: true, type: String })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'YYYY-MM-DD (МСК, включительно)' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'YYYY-MM-DD (МСК, включительно)' })
  @ApiResponse({ status: 200, type: [HourProfileItemDto] })
  getHourProfile(
    @Query('cabinetId') cabinetId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<HourProfileItemDto[]> {
    return this.vkAdsService.getHourProfile(cabinetId, from, to);
  }

  @Post('sync-accounts')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Синхронизировать список аккаунтов из VK API в VkCabinet' })
  @ApiResponse({ status: 200, schema: { properties: { synced: { type: 'number' }, cabinets: { type: 'array' } } } })
  syncAccounts(): Promise<{ synced: number; cabinets: VkCabinetDto[] }> {
    return this.vkAdsService.syncAccounts();
  }

  @Post('poll')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Ручной запуск сбора снимка из VK API' })
  @ApiResponse({ status: 200, type: [PollResultDto] })
  poll(): Promise<PollResultDto[]> {
    return this.vkAdsService.pollSnapshots();
  }

  @Get('token-health')
  @ApiOperation({ summary: 'Проверить валидность VK-токена (тестовый запрос к VK API)' })
  @ApiResponse({ status: 200, schema: { properties: { ok: { type: 'boolean' }, message: { type: 'string' } } } })
  checkTokenHealth(): Promise<{ ok: boolean; message: string }> {
    return this.vkAdsService.checkTokenHealth();
  }
}
