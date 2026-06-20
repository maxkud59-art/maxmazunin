import { ApiProperty } from '@nestjs/swagger';

export class VkAttachmentDto {
  @ApiProperty() type: string;
  @ApiProperty({ nullable: true }) url?: string;
  @ApiProperty({ nullable: true }) title?: string;
  @ApiProperty({ nullable: true }) thumb?: string;
}

export class MessageDto {
  @ApiProperty() id: string;
  @ApiProperty() vkMessageId: number;
  @ApiProperty() direction: 'IN' | 'OUT';
  @ApiProperty() text: string;
  @ApiProperty() senderName: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: [VkAttachmentDto] }) attachments: VkAttachmentDto[];
}

export class MessageListDto {
  @ApiProperty({ type: [MessageDto] }) items: MessageDto[];
  @ApiProperty({ nullable: true }) nextCursor: string | null;
}

export class SendMessageDto {
  @ApiProperty() text: string;
}
