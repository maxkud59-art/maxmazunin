import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsDateString } from 'class-validator';

export class SegmentFilterDto {
  @ApiPropertyOptional() @IsOptional() crmStatusId?: string;
  @ApiPropertyOptional() @IsOptional() tagId?: string;
  @ApiPropertyOptional() @IsOptional() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() dateTo?: string;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() messageText: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() segmentFilter?: SegmentFilterDto;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() messageText?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() segmentFilter?: SegmentFilterDto;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}
