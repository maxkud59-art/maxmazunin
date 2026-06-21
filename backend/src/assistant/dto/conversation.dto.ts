import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationDto {
  @ApiProperty() id: string;
  @ApiProperty() peerId: number;
  @ApiProperty() peerType: string;
  @ApiProperty() clientName: string;
  @ApiProperty({ nullable: true }) clientAvatar: string | null;
  @ApiProperty() lastMessageText: string;
  @ApiProperty() lastMessageAt: Date;
  @ApiProperty() unreadCount: number;
  @ApiProperty({ nullable: true }) crmStatus: string | null;
  @ApiPropertyOptional({ nullable: true }) assignedBotId?: string | null;
  @ApiPropertyOptional({ nullable: true }) assignedBotName?: string | null;
  @ApiPropertyOptional() botPaused?: boolean;
}

export class ConversationListDto {
  @ApiProperty({ type: [ConversationDto] }) items: ConversationDto[];
  @ApiProperty() total: number;
}
