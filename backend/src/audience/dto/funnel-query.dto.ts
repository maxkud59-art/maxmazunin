import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class FunnelQueryDto {
  @ApiPropertyOptional({ description: 'ISO date string, inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date string, inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
