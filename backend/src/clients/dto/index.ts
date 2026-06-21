import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsInt, Min, IsNumber } from 'class-validator';

export class UpdateClientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() birthDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() crmStatusId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tagIds?: string[];
  @ApiPropertyOptional() @IsOptional() nextContactDate?: string;
  @ApiPropertyOptional() @IsOptional() lastContactAt?: string;
}

export class ClientListQueryDto {
  @ApiPropertyOptional() page?: number;
  @ApiPropertyOptional() pageSize?: number;

  // Text search
  @ApiPropertyOptional() search?: string;
  @ApiPropertyOptional() vkUrl?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() city?: string;
  @ApiPropertyOptional() country?: string;
  @ApiPropertyOptional() source?: string;
  @ApiPropertyOptional() note?: string;
  @ApiPropertyOptional() email?: string;

  // CRM status — single (legacy) or comma-separated multi
  @ApiPropertyOptional() crmStatusId?: string;
  @ApiPropertyOptional({ description: 'Comma-separated CRM status IDs' }) crmStatusIds?: string;

  // Tags — single (legacy) or comma-separated multi
  @ApiPropertyOptional() tagId?: string;
  @ApiPropertyOptional({ description: 'Comma-separated tag IDs' }) tagIds?: string;
  @ApiPropertyOptional({ description: "any (default) or all" }) tagMatch?: string;

  // Date ranges
  @ApiPropertyOptional() firstContactFrom?: string;
  @ApiPropertyOptional() firstContactTo?: string;
  @ApiPropertyOptional() lastContactFrom?: string;
  @ApiPropertyOptional() lastContactTo?: string;
  @ApiPropertyOptional() nextContactFrom?: string;
  @ApiPropertyOptional() nextContactTo?: string;

  // Multiple IDs
  @ApiPropertyOptional({ description: 'Comma-separated VK peer IDs' }) peerIds?: string;
  @ApiPropertyOptional({ description: 'Comma-separated client IDs' }) ids?: string;

  // Order filters
  @ApiPropertyOptional({ description: "yes | no" }) hasOrders?: string;
  @ApiPropertyOptional() orderStatusId?: string;
  @ApiPropertyOptional() orderAmountMin?: string;
  @ApiPropertyOptional() orderAmountMax?: string;

  // Sorting
  @ApiPropertyOptional() sortBy?: 'firstContactAt' | 'clientName' | 'lastContactAt';
  @ApiPropertyOptional() sortDir?: 'asc' | 'desc';
}
