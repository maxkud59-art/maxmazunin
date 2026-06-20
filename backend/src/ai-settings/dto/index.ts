import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() systemPrompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() draftMode?: boolean;
}

export class CreateKnowledgeEntryDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() order?: number;
}

export class UpdateKnowledgeEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() order?: number;
}
