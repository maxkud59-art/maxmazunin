import {
  Controller, Get, Post, Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ClassifyService } from './classify/classify.service';
import { LearningService } from './classify/learning.service';
import { AnalyticsService } from './insights/analytics.service';
import { ForecastService } from './insights/forecast.service';
import { AnomalyService } from './insights/anomaly.service';
import { SummaryQueryDto, ForecastQueryDto } from './dto/ai-finance.dto';
import { FinProject } from '@prisma/client';

@ApiTags('finance-ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance/ai')
export class AiFinanceController {
  constructor(
    private readonly classify: ClassifyService,
    private readonly learning: LearningService,
    private readonly analytics: AnalyticsService,
    private readonly forecast: ForecastService,
    private readonly anomaly: AnomalyService,
  ) {}

  @Get('operations/uncategorized')
  @ApiOperation({ summary: 'Очередь незакатегоризированных операций' })
  getUncategorized(@Query('limit') limit?: string) {
    return this.classify.getUncategorized(limit ? +limit : 50);
  }

  @Post('operations/:id/classify')
  @ApiOperation({ summary: 'Классифицировать операцию (правило → AI)' })
  classifyOne(@Param('id') id: string) {
    return this.classify.classifyOperation(id);
  }

  @Post('operations/classify-batch')
  @ApiOperation({ summary: 'Пакетная классификация незакатегоризированных' })
  classifyBatch(@Query('limit') limit?: string) {
    return this.classify.classifyBatch(limit ? +limit : 50);
  }

  @Post('suggestions/:id/confirm')
  @ApiOperation({ summary: 'Подтвердить AI-предложение (human-in-the-loop) + создать правило' })
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.learning.confirmSuggestion(id, req.user.id);
  }

  @Post('suggestions/:id/reject')
  @ApiOperation({ summary: 'Отклонить AI-предложение' })
  reject(@Param('id') id: string, @Request() req: any) {
    return this.learning.rejectSuggestion(id, req.user.id);
  }

  @Post('insights/summary')
  @ApiOperation({ summary: 'Сводная аналитика ДДС + ПНЛ за период' })
  summary(@Body() dto: SummaryQueryDto) {
    return this.analytics.summary(new Date(dto.from), new Date(dto.to), dto.project);
  }

  @Post('insights/cashflow-forecast')
  @ApiOperation({ summary: 'Прогноз денежного потока (оценочно)' })
  cashflowForecast(@Body() dto: ForecastQueryDto) {
    return this.forecast.cashflowForecast(dto.horizonDays);
  }

  @Post('insights/pnl-forecast')
  @ApiOperation({ summary: 'Прогноз ПНЛ по пайплайну заказов (оценочно)' })
  pnlForecast(@Body() dto: ForecastQueryDto) {
    return this.forecast.pnlForecast(dto.horizonDays);
  }

  @Get('anomalies')
  @ApiOperation({ summary: 'Аномалии: дубли, выбросы, бэклог' })
  getAnomalies() {
    return this.anomaly.detectAnomalies();
  }

  @Get('rules')
  @ApiOperation({ summary: 'Список правил категоризации' })
  getRules() {
    return this.classify.getRules();
  }
}
