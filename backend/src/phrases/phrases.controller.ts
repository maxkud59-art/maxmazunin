import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PhrasesService } from './phrases.service';
import {
  CreatePhraseCategoryDto, UpdatePhraseCategoryDto,
  CreateQuickPhraseDto, UpdateQuickPhraseDto,
} from './dto';

@ApiTags('phrases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('phrases')
export class PhrasesController {
  constructor(private readonly svc: PhrasesService) {}

  @Get()
  @ApiOperation({ summary: 'Быстрые фразы, сгруппированные по категориям' })
  listGrouped() { return this.svc.listGrouped(); }

  @Post('categories')
  @ApiOperation({ summary: 'Создать категорию фраз' })
  createCategory(@Body() dto: CreatePhraseCategoryDto) { return this.svc.createCategory(dto); }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Обновить/архивировать категорию' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdatePhraseCategoryDto) {
    return this.svc.updateCategory(id, dto);
  }

  @Post('phrases')
  @ApiOperation({ summary: 'Создать быструю фразу' })
  createPhrase(@Body() dto: CreateQuickPhraseDto) { return this.svc.createPhrase(dto); }

  @Patch('phrases/:id')
  @ApiOperation({ summary: 'Обновить/архивировать фразу' })
  updatePhrase(@Param('id') id: string, @Body() dto: UpdateQuickPhraseDto) {
    return this.svc.updatePhrase(id, dto);
  }
}
