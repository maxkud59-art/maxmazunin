import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExperimentDto, UpdateExperimentDto } from './dto/experiment.dto';

@Injectable()
export class ExperimentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExperimentDto, createdById: string) {
    const exp = await this.prisma.experiment.create({
      data: {
        name: dto.name,
        hypothesis: dto.hypothesis ?? '',
        stageFrom: dto.stageFrom,
        stageTo: dto.stageTo,
        maturationDays: dto.maturationDays ?? 7,
        minSamplePerVariant: dto.minSamplePerVariant ?? 100,
        pThreshold: dto.pThreshold ?? 0.05,
        createdById,
        variants: {
          create: dto.variants.map((v, i) => ({
            name: v.name,
            scriptRef: v.scriptRef ?? '',
            isControl: v.isControl ?? i === 0,
            weight: v.weight ?? 1,
          })),
        },
      },
      include: { variants: true },
    });
    return exp;
  }

  async list() {
    return this.prisma.experiment.findMany({
      include: { variants: { select: { id: true, name: true, isControl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const exp = await this.prisma.experiment.findUnique({
      where: { id },
      include: { variants: true, snapshots: { orderBy: { snapshotDate: 'desc' }, take: 30 } },
    });
    if (!exp) throw new NotFoundException(`Experiment ${id} not found`);
    return exp;
  }

  async update(id: string, dto: UpdateExperimentDto) {
    return this.prisma.experiment.update({ where: { id }, data: dto });
  }

  async start(id: string) {
    const exp = await this.prisma.experiment.findUniqueOrThrow({ where: { id } });
    if (exp.status !== 'DRAFT') throw new BadRequestException('Only DRAFT experiments can be started');
    return this.prisma.experiment.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } });
  }

  async stop(id: string) {
    return this.prisma.experiment.update({ where: { id }, data: { status: 'STOPPED' } });
  }

  // Только человек вызывает этот метод — записывает победителя.
  async decide(id: string, winnerVariantId: string) {
    const exp = await this.prisma.experiment.findUniqueOrThrow({ where: { id }, include: { variants: true } });
    if (exp.status === 'DECIDED') throw new BadRequestException('Already decided');
    const valid = exp.variants.some((v) => v.id === winnerVariantId);
    if (!valid) throw new BadRequestException('Invalid variantId');
    return this.prisma.experiment.update({
      where: { id },
      data: { status: 'DECIDED', winnerVariantId, decidedAt: new Date() },
    });
  }
}
