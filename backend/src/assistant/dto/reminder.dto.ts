import { ApiProperty } from '@nestjs/swagger';

export class ReminderDto {
  @ApiProperty() clientId: string;
  @ApiProperty() peerId: number;
  @ApiProperty() clientName: string;
  @ApiProperty({ nullable: true }) clientAvatar: string | null;
  @ApiProperty() nextContactDate: Date;
  @ApiProperty() isOverdue: boolean;
  @ApiProperty({ nullable: true }) conversationId: string | null;
}
