import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DirectoriesService } from './directories.service';
import { DirectoriesController } from './directories.controller';

@Module({
  imports: [PrismaModule],
  providers: [DirectoriesService],
  controllers: [DirectoriesController],
  exports: [DirectoriesService],
})
export class DirectoriesModule {}
