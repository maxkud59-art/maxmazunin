import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DialogAnalysisService } from './dialog-analysis.service';
import { DialogAnalysisController } from './dialog-analysis.controller';
import { AnalysisWorker } from './analysis.worker';

@Module({
  imports: [PrismaModule],
  providers: [DialogAnalysisService, AnalysisWorker],
  controllers: [DialogAnalysisController],
  exports: [DialogAnalysisService],
})
export class DialogAnalysisModule {}
