import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty() @IsString() clientId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderStatusId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() items?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderStatusId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() items?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
}
