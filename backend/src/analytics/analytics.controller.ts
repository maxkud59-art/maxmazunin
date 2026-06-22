import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunnelService } from './funnel.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly funnel: FunnelService) {}

  @Get('funnel')
  @ApiOperation({ summary: 'Отчёт воронки с разбивкой по этапам, возражениям, менеджерам' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'managerId', required: false })
  getFunnel(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('managerId') managerId?: string,
  ) {
    return this.funnel.report({ from, to, managerId });
  }
}
