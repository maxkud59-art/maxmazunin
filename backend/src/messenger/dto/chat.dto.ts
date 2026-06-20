import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ChatType, ChatMemberRole, Company } from '@prisma/client';

export class CreateGroupChatDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiProperty({ type: [String], description: 'userId[] участников' })
  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}

export class ChatMemberDto {
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true }) firstName: string | null;
  @ApiProperty({ nullable: true }) lastName: string | null;
  @ApiProperty({ nullable: true }) nickname: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) jobTitle: string | null;
  @ApiProperty({ enum: ChatMemberRole }) role: ChatMemberRole;
  @ApiProperty() muted: boolean;
}

export class LastMessageDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) body: string | null;
  @ApiProperty({ nullable: true }) senderName: string | null;
  @ApiProperty() createdAt: string;
}

export class ChatDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ChatType }) type: ChatType;
  @ApiProperty({ nullable: true }) title: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true, enum: Company }) company: Company | null;
  @ApiProperty({ nullable: true, type: () => LastMessageDto }) lastMessage: LastMessageDto | null;
  @ApiProperty() unreadCount: number;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: [ChatMemberDto] }) members: ChatMemberDto[];
}
