import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional, IsString, IsInt, IsEnum, IsBoolean, IsDateString, IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum FinProject { EASYBOOK = 'EASYBOOK', EASYNEON = 'EASYNEON', IZIBANYA = 'IZIBANYA', GENERAL = 'GENERAL' }
export enum FinAccountType { BANK = 'BANK', SAVINGS = 'SAVINGS', CASH = 'CASH', CREDIT = 'CREDIT' }
export enum FinOpType { INCOME = 'INCOME', EXPENSE = 'EXPENSE', TRANSFER = 'TRANSFER', LOAN_PRINCIPAL = 'LOAN_PRINCIPAL', DEPOSIT_PLACE = 'DEPOSIT_PLACE', DEPOSIT_RETURN = 'DEPOSIT_RETURN', DIVIDEND = 'DIVIDEND' }
export enum FinOpSource { MANUAL = 'MANUAL', BANK_IMPORT = 'BANK_IMPORT', CDEK_IMPORT = 'CDEK_IMPORT' }
export enum FinOrderStatus { PREPAY = 'PREPAY', PAID_50 = 'PAID_50', SHIPPED = 'SHIPPED', DELIVERED = 'DELIVERED', REFUNDED = 'REFUNDED' }

// ─── Account DTOs ─────────────────────────────────────────────────────────────

export class CreateAccountDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: FinAccountType }) @IsOptional() @IsEnum(FinAccountType) type?: FinAccountType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) order?: number;
}

export class UpdateAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: FinAccountType }) @IsOptional() @IsEnum(FinAccountType) type?: FinAccountType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
}

// ─── Category DTOs ────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() group?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPnl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) order?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() group?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPnl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) order?: number;
}

export class CreateSubcategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) order?: number;
}

// ─── Operation DTOs ───────────────────────────────────────────────────────────

export class CreateOperationDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty() @IsInt() @Type(() => Number) amountKopecks: number;
  @ApiPropertyOptional({ enum: FinOpType }) @IsOptional() @IsEnum(FinOpType) type?: FinOpType;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subcategoryId?: string;
  @ApiPropertyOptional({ enum: FinProject }) @IsOptional() @IsEnum(FinProject) project?: FinProject;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPnl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() finOrderId?: string;
}

export class UpdateOperationDto extends CreateOperationDto {}

export class OperationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() project?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pageSize?: string;
}

// ─── FinOrder DTOs ────────────────────────────────────────────────────────────

export class CreateFinOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vkClientId?: string;
  @ApiPropertyOptional({ enum: FinProject }) @IsOptional() @IsEnum(FinProject) project?: FinProject;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) totalAmountKopecks?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) prepayKopecks?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) cdekFeeKopecks?: number;
  @ApiPropertyOptional({ enum: FinOrderStatus }) @IsOptional() @IsEnum(FinOrderStatus) status?: FinOrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() shippedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cdekTrackNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateFinOrderDto extends CreateFinOrderDto {}

// ─── Report DTOs ──────────────────────────────────────────────────────────────

export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() project?: string;
}
