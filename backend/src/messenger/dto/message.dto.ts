import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AttachmentKind, MessageType } from '@prisma/client';

export class SendMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) body?: string;
  @ApiPropertyOptional({ description: 'ID сообщения для ответа' })
  @IsOptional()
  @IsString()
  replyToId?: string;
  @ApiPropertyOptional({ description: 'storageKey вложений из /upload' })
  @IsOptional()
  attachmentKeys?: string[];
}

export class EditMessageDto {
  @ApiProperty() @IsString() @MaxLength(8000) body: string;
}

export class AttachmentDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AttachmentKind }) kind: AttachmentKind;
  @ApiProperty() storageKey: string;
  @ApiProperty() fileName: string;
  @ApiProperty() mime: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({ description: 'URL для скачивания' }) url: string;
}

export class SenderDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) firstName: string | null;
  @ApiProperty({ nullable: true }) lastName: string | null;
  @ApiProperty({ nullable: true }) nickname: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
}

export class MessageDto {
  @ApiProperty() id: string;
  @ApiProperty() chatId: string;
  @ApiProperty({ enum: MessageType }) type: MessageType;
  @ApiProperty() body: string;
  @ApiProperty() sender: SenderDto;
  @ApiProperty({ nullable: true }) replyTo: MessageDto | null;
  @ApiProperty({ type: [AttachmentDto] }) attachments: AttachmentDto[];
  @ApiProperty({ type: [String], description: 'userId упомянутых' }) mentions: string[];
  @ApiProperty() createdAt: string;
  @ApiProperty({ nullable: true }) editedAt: string | null;
  @ApiProperty({ nullable: true }) deletedAt: string | null;
  @ApiProperty({ description: 'true если сообщение своё' }) isMine: boolean;
}

export class MessagesPageDto {
  @ApiProperty({ type: [MessageDto] }) items: MessageDto[];
  @ApiProperty() hasMore: boolean;
  @ApiProperty({ nullable: true }) nextCursor: string | null;
}

export class UploadResultDto {
  @ApiProperty() storageKey: string;
  @ApiProperty() fileName: string;
  @ApiProperty() mime: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({ enum: AttachmentKind }) kind: AttachmentKind;
  @ApiProperty() url: string;
}
