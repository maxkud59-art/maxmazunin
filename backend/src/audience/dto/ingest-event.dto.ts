import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { AdFunnelStage, AdEventSource } from '@prisma/client';

export class IngestEventDto {
  @ApiProperty({ enum: AdFunnelStage })
  @IsEnum(AdFunnelStage)
  stage: AdFunnelStage;

  @ApiProperty({ enum: AdEventSource })
  @IsEnum(AdEventSource)
  source: AdEventSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vkUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adId?: string;

  @ApiProperty({ description: 'Уникальный ключ для идемпотентности' })
  @IsString()
  dedupeKey: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  raw?: Record<string, any>;
}
