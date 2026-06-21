import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class SetConversationBotDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() botId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paused?: boolean;
}

export class ConversationBotDto {
  @ApiProperty({ nullable: true }) botId: string | null;
  @ApiProperty({ nullable: true }) botName: string | null;
  @ApiProperty() paused: boolean;
}
