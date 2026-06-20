import { Module } from '@nestjs/common';
import { BookLayoutController } from './book-layout.controller';
import { BookLayoutService } from './book-layout.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BookLayoutController],
  providers: [BookLayoutService],
})
export class BookLayoutModule {}
