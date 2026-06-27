import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum, IsOptional, IsString, IsNotEmpty, MaxLength,
} from 'class-validator';
import { LifecycleStage, AiActionStatus } from '@prisma/client';

export class SetLifecycleStageDto {
  @ApiProperty({ enum: LifecycleStage })
  @IsEnum(LifecycleStage)
  stage!: LifecycleStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;
}

export class ReviewAiActionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsEnum(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';
}

export class CreateNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
