import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';
import { SlaService } from './sla.service';
import { GuardrailsService } from './guardrails.service';

@Module({
  imports: [PrismaModule],
  providers: [AiAssistantService, SlaService, GuardrailsService],
  controllers: [AiAssistantController],
  exports: [AiAssistantService, SlaService],
})
export class AiAssistantModule {}
