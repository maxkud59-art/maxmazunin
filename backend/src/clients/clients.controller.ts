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
  @ApiOperation({ summary: 'Список клиентов с фильтрами' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'vkUrl', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'note', required: false })
  @ApiQuery({ name: 'crmStatusId', required: false })
  @ApiQuery({ name: 'crmStatusIds', required: false, description: 'Comma-separated CRM status IDs' })
  @ApiQuery({ name: 'tagId', required: false })
  @ApiQuery({ name: 'tagIds', required: false, description: 'Comma-separated tag IDs' })
  @ApiQuery({ name: 'tagMatch', required: false, description: 'any (default) or all' })
  @ApiQuery({ name: 'firstContactFrom', required: false })
  @ApiQuery({ name: 'firstContactTo', required: false })
  @ApiQuery({ name: 'lastContactFrom', required: false })
  @ApiQuery({ name: 'lastContactTo', required: false })
  @ApiQuery({ name: 'nextContactFrom', required: false })
  @ApiQuery({ name: 'nextContactTo', required: false })
  @ApiQuery({ name: 'peerIds', required: false, description: 'Comma-separated VK peer IDs' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated client IDs' })
  @ApiQuery({ name: 'hasOrders', required: false, description: 'yes | no' })
  @ApiQuery({ name: 'orderStatusId', required: false })
  @ApiQuery({ name: 'orderAmountMin', required: false })
  @ApiQuery({ name: 'orderAmountMax', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('vkUrl') vkUrl?: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('source') source?: string,
    @Query('note') note?: string,
    @Query('crmStatusId') crmStatusId?: string,
    @Query('crmStatusIds') crmStatusIds?: string,
    @Query('tagId') tagId?: string,
    @Query('tagIds') tagIds?: string,
    @Query('tagMatch') tagMatch?: string,
    @Query('firstContactFrom') firstContactFrom?: string,
    @Query('firstContactTo') firstContactTo?: string,
    @Query('lastContactFrom') lastContactFrom?: string,
    @Query('lastContactTo') lastContactTo?: string,
    @Query('nextContactFrom') nextContactFrom?: string,
    @Query('nextContactTo') nextContactTo?: string,
    @Query('peerIds') peerIds?: string,
    @Query('ids') ids?: string,
    @Query('hasOrders') hasOrders?: string,
    @Query('orderStatusId') orderStatusId?: string,
    @Query('orderAmountMin') orderAmountMin?: string,
    @Query('orderAmountMax') orderAmountMax?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.svc.list({
      page: page ? +page : 0,
      pageSize: pageSize ? +pageSize : 30,
      search, vkUrl, phone, email, city, country, source, note,
      crmStatusId, crmStatusIds, tagId, tagIds, tagMatch,
      firstContactFrom, firstContactTo,
      lastContactFrom, lastContactTo,
      nextContactFrom, nextContactTo,
      peerIds, ids,
      hasOrders, orderStatusId, orderAmountMin, orderAmountMax,
      sortBy, sortDir,
    });
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
