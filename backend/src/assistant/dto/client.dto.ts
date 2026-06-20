import { ApiProperty } from '@nestjs/swagger';

export class ClientDto {
  @ApiProperty() id: string;
  @ApiProperty() peerId: number;
  @ApiProperty({ nullable: true }) fio: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) city: string | null;
  @ApiProperty({ nullable: true }) source: string | null;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  // VK-profile data from conversation
  @ApiProperty({ nullable: true }) clientName: string | null;
  @ApiProperty({ nullable: true }) clientAvatar: string | null;
}
