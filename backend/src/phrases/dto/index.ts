import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class CreatePhraseCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdatePhraseCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
}

export class CreateQuickPhraseDto {
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hotkey?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
}

export class UpdateQuickPhraseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hotkey?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() archived?: boolean;
}
