import { IsString, IsBoolean, IsEnum, IsOptional, IsArray, IsNumber, IsObject } from 'class-validator';
import { BotType, BotStepType } from '@prisma/client';

export class CreateBotDto {
  @IsString() name: string;
  @IsEnum(BotType) type: BotType;
}

export class UpdateBotDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class CreateBotStepDto {
  @IsEnum(BotStepType) type: BotStepType;
  @IsOptional() config?: Record<string, any>;
  @IsOptional() @IsNumber() position?: number;
  @IsOptional() @IsString() nextStepId?: string;
  @IsOptional() branches?: any[];
}

export class UpdateBotStepDto {
  @IsOptional() @IsEnum(BotStepType) type?: BotStepType;
  @IsOptional() config?: Record<string, any>;
  @IsOptional() @IsNumber() position?: number;
  @IsOptional() @IsString() nextStepId?: string | null;
  @IsOptional() branches?: any[];
}

export class ReorderStepsDto {
  @IsArray() ids: string[];
}

export class AddClientToScenarioDto {
  @IsString() clientId: string;
  @IsString() botId: string;
}
