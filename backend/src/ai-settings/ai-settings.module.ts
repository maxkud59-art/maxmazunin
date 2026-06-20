import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiSettingsService } from './ai-settings.service';
import { AiSettingsController } from './ai-settings.controller';

@Module({
  imports: [PrismaModule],
  providers: [AiSettingsService],
  controllers: [AiSettingsController],
})
export class AiSettingsModule {}
