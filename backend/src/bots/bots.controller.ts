import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BotsService } from './bots.service';
import { CreateBotDto, UpdateBotDto, CreateBotStepDto, UpdateBotStepDto, ReorderStepsDto, AddClientToScenarioDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/bots')
export class BotsController {
  constructor(private readonly svc: BotsService) {}

  // ─── Bots ────────────────────────────────────────────────────────────────────

  @Get()
  list(@Query('archived') archived?: string) {
    return this.svc.listBots(archived === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getBot(id);
  }

  @Post()
  create(@Body() dto: CreateBotDto) {
    return this.svc.createBot(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.svc.updateBot(id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.svc.duplicateBot(id);
  }

  // ─── Steps ───────────────────────────────────────────────────────────────────

  @Post(':id/steps')
  createStep(@Param('id') botId: string, @Body() dto: CreateBotStepDto) {
    return this.svc.createStep(botId, dto);
  }

  @Patch(':id/steps/:stepId')
  updateStep(@Param('id') botId: string, @Param('stepId') stepId: string, @Body() dto: UpdateBotStepDto) {
    return this.svc.updateStep(botId, stepId, dto);
  }

  @Delete(':id/steps/:stepId')
  deleteStep(@Param('id') botId: string, @Param('stepId') stepId: string) {
    return this.svc.deleteStep(botId, stepId);
  }

  @Post(':id/steps/reorder')
  reorderSteps(@Param('id') botId: string, @Body() dto: ReorderStepsDto) {
    return this.svc.reorderSteps(botId, dto.ids);
  }

  // ─── Logs ────────────────────────────────────────────────────────────────────

  @Get(':id/logs')
  getLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.getLogs(id, limit ? parseInt(limit, 10) : 50);
  }

  // ─── Scenario states ─────────────────────────────────────────────────────────

  @Post('scenario/add-client')
  addClientToScenario(@Body() dto: AddClientToScenarioDto) {
    return this.svc.addClientToScenario(dto.clientId, dto.botId);
  }

  @Get('scenario/states')
  listStates(@Query('botId') botId?: string, @Query('clientId') clientId?: string) {
    return this.svc.listScenarioStates(botId, clientId);
  }
}
