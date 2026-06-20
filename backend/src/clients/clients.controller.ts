import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Список клиентов (VkClient)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'crmStatusId', required: false })
  @ApiQuery({ name: 'tagId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('crmStatusId') crmStatusId?: string,
    @Query('tagId') tagId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.svc.list({ page: page ? +page : 0, pageSize: pageSize ? +pageSize : 30, search, crmStatusId, tagId, sortBy, sortDir });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка клиента' })
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить карточку клиента' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.svc.update(id, dto);
  }
}
