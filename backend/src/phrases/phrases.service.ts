import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePhraseCategoryDto, UpdatePhraseCategoryDto,
  CreateQuickPhraseDto, UpdateQuickPhraseDto,
} from './dto';

@Injectable()
export class PhrasesService {
  constructor(private readonly prisma: PrismaService) {}

  async listGrouped() {
    const categories = await this.prisma.phraseCategory.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
      include: {
        phrases: {
          where: { archived: false },
          orderBy: { order: 'asc' },
        },
      },
    });
    return categories;
  }

  createCategory(dto: CreatePhraseCategoryDto) {
    return this.prisma.phraseCategory.create({ data: dto });
  }

  updateCategory(id: string, dto: UpdatePhraseCategoryDto) {
    return this.prisma.phraseCategory.update({ where: { id }, data: dto });
  }

  createPhrase(dto: CreateQuickPhraseDto) {
    return this.prisma.quickPhrase.create({ data: dto, include: { category: true } });
  }

  updatePhrase(id: string, dto: UpdateQuickPhraseDto) {
    return this.prisma.quickPhrase.update({ where: { id }, data: dto, include: { category: true } });
  }
}
