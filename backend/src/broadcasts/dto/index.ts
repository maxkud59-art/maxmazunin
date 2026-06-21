import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsDateString, IsArray, IsIn } from 'class-validator';

export type AudienceType = 'vkIds' | 'clientIds' | 'filter';

export class SegmentFilterDto {
  @ApiPropertyOptional() @IsOptional() crmStatusId?: string;
  @ApiPropertyOptional() @IsOptional() tagId?: string;
  @ApiPropertyOptional() @IsOptional() tagIds?: string;
  @ApiPropertyOptional() @IsOptional() crmStatusIds?: string;
  @ApiPropertyOptional() @IsOptional() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsOptional() hasOrders?: string;
  @ApiPropertyOptional() @IsOptional() orderStatusId?: string;
  @ApiPropertyOptional() @IsOptional() source?: string;
  @ApiPropertyOptional() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsOptional() country?: string;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() messageText: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() attachments?: any[];
  @ApiPropertyOptional({ enum: ['vkIds', 'clientIds', 'filter'] })
  @IsOptional()
  @IsIn(['vkIds', 'clientIds', 'filter'])
  audienceType?: AudienceType;
  @ApiPropertyOptional() @IsOptional() @IsObject() audienceConfig?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsObject() segmentFilter?: SegmentFilterDto;
  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() messageText?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() attachments?: any[];
  @ApiPropertyOptional({ enum: ['vkIds', 'clientIds', 'filter'] })
  @IsOptional()
  @IsIn(['vkIds', 'clientIds', 'filter'])
  audienceType?: AudienceType;
  @ApiPropertyOptional() @IsOptional() @IsObject() audienceConfig?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsObject() segmentFilter?: SegmentFilterDto;
  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class AudiencePreviewDto {
  @ApiPropertyOptional({ enum: ['vkIds', 'clientIds', 'filter'] })
  @IsOptional()
  @IsIn(['vkIds', 'clientIds', 'filter'])
  audienceType?: AudienceType;

  @ApiPropertyOptional()
  @IsOptional()
  audienceConfig?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  segmentFilter?: SegmentFilterDto;
}
