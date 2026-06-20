import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhrasesService } from './phrases.service';
import { PhrasesController } from './phrases.controller';

@Module({
  imports: [PrismaModule],
  providers: [PhrasesService],
  controllers: [PhrasesController],
})
export class PhrasesModule {}
