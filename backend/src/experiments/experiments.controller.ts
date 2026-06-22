import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExperimentsService } from './experiments.service';
import { ResultsService } from './results.service';
import { AssignmentService } from './assignment.service';
import { SnapshotCron } from './snapshot.cron';
import { CreateExperimentDto, UpdateExperimentDto, AssignDto } from './dto/experiment.dto';

@ApiTags('experiments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('experiments')
export class ExperimentsController {
  constructor(
    private readonly svc: ExperimentsService,
    private readonly resultsSvc: ResultsService,
    private readonly assignment: AssignmentService,
    private readonly snapshotCron: SnapshotCron,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать эксперимент (DRAFT)' })
  create(@Body() dto: CreateExperimentDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Список экспериментов' })
  list() { return this.svc.list(); }

  @Get(':id')
  @ApiOperation({ summary: 'Один эксперимент' })
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  @Get(':id/results')
  @ApiOperation({ summary: 'Результаты: convToPaid, p-value, значимость' })
  getResults(@Param('id') id: string) { return this.resultsSvc.computeResults(id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить эксперимент' })
  update(@Param('id') id: string, @Body() dto: UpdateExperimentDto) { return this.svc.update(id, dto); }

  @Post(':id/start')
  @ApiOperation({ summary: 'Запустить эксперимент (DRAFT → RUNNING)' })
  start(@Param('id') id: string) { return this.svc.start(id); }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Остановить эксперимент' })
  stop(@Param('id') id: string) { return this.svc.stop(id); }

  @Post(':id/decide')
  @ApiOperation({ summary: 'Зафиксировать победителя (только человек, после SIGNIFICANT)' })
  decide(@Param('id') id: string, @Body('winnerVariantId') winnerVariantId: string) {
    return this.svc.decide(id, winnerVariantId);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Назначить вариант сделке (детерминированный баланс внутри менеджера)' })
  assign(@Param('id') id: string, @Body() dto: AssignDto) {
    return this.assignment.assignOrder(id, dto.orderId, dto.managerId);
  }

  @Post(':id/snapshot')
  @ApiOperation({ summary: 'Сохранить снапшот результатов вручную' })
  async takeSnapshot(@Param('id') _id: string) {
    await this.snapshotCron.takeSnapshots();
    return { ok: true };
  }

  @Get(':id/bias-check')
  @ApiOperation({ summary: 'Проверить перекос вариантов внутри менеджеров' })
  biasCheck(@Param('id') id: string) { return this.assignment.checkManagerBias(id); }
}
