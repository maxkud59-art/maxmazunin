import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BroadcastsService } from './broadcasts.service';
import { CreateCampaignDto, UpdateCampaignDto, AudiencePreviewDto } from './dto';

@ApiTags('broadcasts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private readonly svc: BroadcastsService) {}

  @Get()
  @ApiOperation({ summary: 'Список кампаний рассылки (не архивных)' })
  listCampaigns() { return this.svc.listCampaigns(); }

  @Get('daily-limit')
  @ApiOperation({ summary: 'Дневной лимит отправки' })
  getDailyLimit() { return this.svc.getDailyLimit(); }

  @Get(':id')
  @ApiOperation({ summary: 'Кампания с получателями' })
  getCampaign(@Param('id') id: string) { return this.svc.getCampaign(id); }

  @Post()
  @ApiOperation({ summary: 'Создать кампанию' })
  create(@Body() dto: CreateCampaignDto) { return this.svc.create(dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить кампанию' })
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.svc.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Архивировать кампанию (не удаляет данные)' })
  archive(@Param('id') id: string) { return this.svc.archiveCampaign(id); }

  @Post('audience-preview')
  @ApiOperation({ summary: 'Предпросмотр аудитории (все 3 типа)' })
  audiencePreview(@Body() dto: AudiencePreviewDto) { return this.svc.audiencePreview(dto); }

  /** @deprecated Use audience-preview */
  @Post('segment-preview')
  @ApiOperation({ summary: 'Предпросмотр сегмента (устаревший)' })
  previewSegment(@Body() dto: any) { return this.svc.previewSegment(dto); }

  @Post(':id/start')
  @ApiOperation({ summary: 'Запустить рассылку' })
  start(@Param('id') id: string) { return this.svc.startCampaign(id); }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Поставить на паузу' })
  pause(@Param('id') id: string) { return this.svc.pauseCampaign(id); }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Отменить рассылку' })
  cancel(@Param('id') id: string) { return this.svc.cancelCampaign(id); }
}
