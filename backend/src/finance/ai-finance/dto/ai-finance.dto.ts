import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { FinProject } from '@prisma/client';
import { Type } from 'class-transformer';

export class SummaryQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  from!: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsString()
  to!: string;

  @ApiPropertyOptional({ enum: FinProject })
  @IsOptional()
  @IsEnum(FinProject)
  project?: FinProject;
}

export class ForecastQueryDto {
  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  horizonDays?: number;
}
