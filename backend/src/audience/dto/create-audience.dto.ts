import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { AdAudienceKind } from '@prisma/client';

export class CreateAudienceDto {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: AdAudienceKind })
  @IsEnum(AdAudienceKind)
  kind: AdAudienceKind;

  @ApiPropertyOptional({ type: Object, description: 'Правила фильтрации членов сегмента' })
  @IsOptional()
  @IsObject()
  rule?: Record<string, any>;
}
