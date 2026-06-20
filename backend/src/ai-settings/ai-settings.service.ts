import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto, CreateKnowledgeEntryDto, UpdateKnowledgeEntryDto } from './dto';

@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    return this.prisma.aiSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async updateSettings(dto: UpdateAiSettingsDto) {
    return this.prisma.aiSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...dto },
      update: dto,
    });
  }

  listKnowledge() {
    return this.prisma.aiKnowledgeEntry.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  }

  createKnowledge(dto: CreateKnowledgeEntryDto) {
    return this.prisma.aiKnowledgeEntry.create({ data: dto });
  }

  updateKnowledge(id: string, dto: UpdateKnowledgeEntryDto) {
    return this.prisma.aiKnowledgeEntry.update({ where: { id }, data: dto });
  }

  deleteKnowledge(id: string) {
    return this.prisma.aiKnowledgeEntry.delete({ where: { id } });
  }
}
