import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, Request, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiAssistantService } from './ai-assistant.service';
import { SlaService } from './sla.service';
import { SetLifecycleStageDto, ReviewAiActionDto, CreateNoteDto } from './dto/ai-assistant.dto';

@ApiTags('ai-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(
    private readonly service: AiAssistantService,
    private readonly sla: SlaService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Список диалогов с lifecycleStage (для боковой панели)' })
  listConversations(@Query('limit') limit?: string) {
    return this.service.listConversations(limit ? +limit : 100);
  }

  @Get('conversations/:id/panel')
  @ApiOperation({ summary: 'Данные панели AI-ассистента для диалога' })
  getPanel(@Param('id') id: string) {
    return this.service.getConversationPanel(id);
  }

  @Patch('conversations/:id/stage')
  @ApiOperation({ summary: 'Сменить стадию жизненного цикла (только менеджер)' })
  setStage(@Param('id') id: string, @Body() dto: SetLifecycleStageDto, @Request() req: any) {
    return this.service.setLifecycleStage(id, dto.stage, dto.managerId ?? req.user.id);
  }

  @Post('conversations/:id/coach')
  @ApiOperation({ summary: 'Запросить советы AI для диалога (без автоотправки)' })
  coach(@Param('id') id: string) {
    return this.service.requestCoaching(id);
  }

  @Get('conversations/:id/actions')
  @ApiOperation({ summary: 'Список ожидающих AI-действий' })
  getActions(@Param('id') id: string) {
    return this.service.getPendingActions(id);
  }

  @Patch('actions/:actionId/review')
  @ApiOperation({ summary: 'Утвердить или отклонить AI-предложение (human-in-the-loop)' })
  reviewAction(
    @Param('actionId') actionId: string,
    @Body() dto: ReviewAiActionDto,
    @Request() req: any,
  ) {
    return this.service.reviewAction(actionId, dto.decision, req.user.id);
  }

  @Get('conversations/:id/notes')
  @ApiOperation({ summary: 'Внутренние заметки по диалогу' })
  getNotes(@Param('id') id: string) {
    return this.service.listNotes(id);
  }

  @Post('conversations/:id/notes')
  @ApiOperation({ summary: 'Добавить внутреннюю заметку' })
  addNote(@Param('id') id: string, @Body() dto: CreateNoteDto, @Request() req: any) {
    return this.service.addNote(id, req.user.id, dto.body);
  }

  @Get('conversations/:id/sla')
  @ApiOperation({ summary: 'SLA-трекеры диалога' })
  getSla(@Param('id') id: string) {
    return this.sla.getConversationSla(id);
  }
}
