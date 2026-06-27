import { Module } from '@nestjs/common';
import { PrismaCrmService } from './prisma-crm.service';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

@Module({
  providers: [PrismaCrmService, CrmService],
  controllers: [CrmController],
})
export class CrmModule {}
