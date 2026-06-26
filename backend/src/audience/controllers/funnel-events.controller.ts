import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FunnelIngestService } from '../services/funnel-ingest.service';
import { IngestEventDto } from '../dto/ingest-event.dto';

@ApiTags('audience')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audience/events')
export class FunnelEventsController {
  constructor(private readonly ingestSvc: FunnelIngestService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Принять рекламное событие (pixel / webhook / manual)' })
  receiveEvent(@Body() dto: IngestEventDto) {
    return this.ingestSvc.ingest(dto);
  }
}
