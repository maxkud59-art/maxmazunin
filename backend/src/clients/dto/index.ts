import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsInt, Min, IsNumber } from 'class-validator';

export class UpdateClientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() crmStatusId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tagIds?: string[];
}

export class ClientListQueryDto {
  @ApiPropertyOptional() page?: number;
  @ApiPropertyOptional() pageSize?: number;
  @ApiPropertyOptional() search?: string;
  @ApiPropertyOptional() crmStatusId?: string;
  @ApiPropertyOptional() tagId?: string;
  @ApiPropertyOptional() sortBy?: 'firstContactAt' | 'clientName';
  @ApiPropertyOptional() sortDir?: 'asc' | 'desc';
}
