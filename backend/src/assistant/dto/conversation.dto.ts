import { ApiProperty } from '@nestjs/swagger';

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
}

export class ConversationListDto {
  @ApiProperty({ type: [ConversationDto] }) items: ConversationDto[];
  @ApiProperty() total: number;
}
