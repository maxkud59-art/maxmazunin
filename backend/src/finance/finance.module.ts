import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BankAdapter } from './bank.adapter';
import { CdekAdapter } from './cdek.adapter';
import { AiFinanceModule } from './ai-finance/ai-finance.module';

@Module({
  imports: [PrismaModule, AiFinanceModule],
  providers: [FinanceService, BankAdapter, CdekAdapter],
  controllers: [FinanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
