import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CrmService } from './crm.service';
import {
  CrmDealsResponseDto,
  CrmDealDto,
  CrmGroupDto,
  CrmWorkSpaceDto,
} from './dto/crm-deals.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('deals')
  @ApiOperation({ summary: 'Список сделок из CRM' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'groupId', required: false, type: Number })
  @ApiQuery({ name: 'workSpaceId', required: false, type: Number })
  @ApiQuery({ name: 'periodFrom', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'periodTo', required: false, description: 'YYYY-MM' })
  @ApiResponse({ status: 200, type: CrmDealsResponseDto })
  findDeals(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('groupId') groupId?: string,
    @Query('workSpaceId') workSpaceId?: string,
    @Query('periodFrom') periodFrom?: string,
    @Query('periodTo') periodTo?: string,
  ) {
    return this.crmService.findDeals({
      page: Math.max(1, parseInt(page)),
      limit: Math.min(200, Math.max(1, parseInt(limit))),
      search: search || undefined,
      status: status || undefined,
      groupId: groupId ? parseInt(groupId) : undefined,
      workSpaceId: workSpaceId ? parseInt(workSpaceId) : undefined,
      periodFrom: periodFrom || undefined,
      periodTo: periodTo || undefined,
    });
  }

  @Get('deals/statuses')
  @ApiOperation({ summary: 'Доступные статусы сделок' })
  @ApiResponse({ status: 200, type: [String] })
  getDealStatuses() {
    return this.crmService.getDealStatuses();
  }

  @Get('deals/groups')
  @ApiOperation({ summary: 'Группы (команды)' })
  @ApiResponse({ status: 200, type: [CrmGroupDto] })
  getGroups() {
    return this.crmService.getGroups();
  }

  @Get('deals/workspaces')
  @ApiOperation({ summary: 'Воркспейсы' })
  @ApiResponse({ status: 200, type: [CrmWorkSpaceDto] })
  getWorkSpaces() {
    return this.crmService.getWorkSpaces();
  }
}
