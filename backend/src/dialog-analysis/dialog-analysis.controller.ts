import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DialogAnalysisService } from './dialog-analysis.service';
import { AnalysisWorker } from './analysis.worker';

@ApiTags('dialog-analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dialog-analysis')
export class DialogAnalysisController {
  constructor(
    private readonly svc: DialogAnalysisService,
    private readonly worker: AnalysisWorker,
  ) {}

  @Post('run')
  @ApiOperation({ summary: 'Запустить пакетную разметку диалогов вручную' })
  async runBatch() {
    const count = await this.svc.processBatch(200);
    return { processed: count };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Статистика разметки' })
  async stats() {
    return this.svc.getStats();
  }
}
