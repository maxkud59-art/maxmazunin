import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FunnelIngestService } from '../services/funnel-ingest.service';
import { FunnelQueryDto } from '../dto/funnel-query.dto';

@ApiTags('audience')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audience/funnel')
export class FunnelController {
  constructor(private readonly ingest: FunnelIngestService) {}

  @Get()
  @ApiOperation({ summary: 'Воронка рекламного пути: counts по этапам + конверсии' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getFunnel(@Query() q: FunnelQueryDto) {
    return this.ingest.getFunnelCounts(q.from, q.to);
  }
}
