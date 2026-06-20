import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [PrismaModule],
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
