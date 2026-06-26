import { Controller, Get, Post, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AudienceService } from '../services/audience.service';
import { LalService } from '../services/lal.service';
import { CreateAudienceDto } from '../dto/create-audience.dto';

@ApiTags('audience')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audience')
export class AudiencesController {
  constructor(
    private readonly svc: AudienceService,
    private readonly lal: LalService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать сегмент аудитории' })
  create(@Body() dto: CreateAudienceDto) {
    return this.svc.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список сегментов с размером и статусом последнего синка' })
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Один сегмент + история синков' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post(':id/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Синхронизировать сегмент с VK Ads (DRY_RUN при VK_SYNC_ENABLED=false)' })
  async sync(@Param('id') id: string) {
    await this.svc.sync(id);
    return { ok: true };
  }

  @Post('lal/build')
  @HttpCode(200)
  @ApiOperation({ summary: 'Собрать LaL-сид из плательщиков и синхронизировать' })
  async buildLal() {
    await this.lal.buildAndSyncLal();
    return { ok: true };
  }
}
