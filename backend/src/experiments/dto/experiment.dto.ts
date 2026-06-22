import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsInt, IsNumber, IsBoolean, Min, Max, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { DialogStage, ExperimentStatus, ExperimentMetric } from '@prisma/client';

export class CreateVariantDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scriptRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isControl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() weight?: number;
}

export class CreateExperimentDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hypothesis?: string;
  @ApiProperty({ enum: DialogStage }) @IsEnum(DialogStage) stageFrom: DialogStage;
  @ApiProperty({ enum: DialogStage }) @IsEnum(DialogStage) stageTo: DialogStage;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maturationDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) minSamplePerVariant?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Max(0.2) pThreshold?: number;
  @ApiProperty({ type: [CreateVariantDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto) variants: CreateVariantDto[];
}

export class UpdateExperimentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hypothesis?: string;
  @ApiPropertyOptional({ enum: ExperimentStatus }) @IsOptional() @IsEnum(ExperimentStatus) status?: ExperimentStatus;
}

export class AssignDto {
  @ApiProperty() @IsString() orderId: string;
  @ApiProperty() @IsString() managerId: string;
}
