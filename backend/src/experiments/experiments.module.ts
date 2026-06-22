import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExperimentsService } from './experiments.service';
import { ExperimentsController } from './experiments.controller';
import { AssignmentService } from './assignment.service';
import { ResultsService } from './results.service';
import { SnapshotCron } from './snapshot.cron';

@Module({
  imports: [PrismaModule],
  providers: [ExperimentsService, AssignmentService, ResultsService, SnapshotCron],
  controllers: [ExperimentsController],
  exports: [ExperimentsService, AssignmentService, ResultsService],
})
export class ExperimentsModule {}
