import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiSettingsService } from './ai-settings.service';
import { UpdateAiSettingsDto, CreateKnowledgeEntryDto, UpdateKnowledgeEntryDto } from './dto';

@ApiTags('ai-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-settings')
export class AiSettingsController {
  constructor(private readonly svc: AiSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Настройки ИИ-ассистента' })
  getSettings() { return this.svc.getSettings(); }

  @Patch()
  @ApiOperation({ summary: 'Обновить настройки ИИ-ассистента' })
  updateSettings(@Body() dto: UpdateAiSettingsDto) { return this.svc.updateSettings(dto); }

  @Get('knowledge')
  @ApiOperation({ summary: 'База знаний' })
  listKnowledge() { return this.svc.listKnowledge(); }

  @Post('knowledge')
  @ApiOperation({ summary: 'Добавить запись в базу знаний' })
  createKnowledge(@Body() dto: CreateKnowledgeEntryDto) { return this.svc.createKnowledge(dto); }

  @Patch('knowledge/:id')
  @ApiOperation({ summary: 'Обновить запись базы знаний' })
  updateKnowledge(@Param('id') id: string, @Body() dto: UpdateKnowledgeEntryDto) {
    return this.svc.updateKnowledge(id, dto);
  }

  @Delete('knowledge/:id')
  @ApiOperation({ summary: 'Удалить запись базы знаний' })
  deleteKnowledge(@Param('id') id: string) { return this.svc.deleteKnowledge(id); }
}
