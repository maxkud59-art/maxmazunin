import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientDto {
  @ApiProperty() id: string;
  @ApiProperty() peerId: number;
  @ApiProperty({ nullable: true }) fio: string | null;
  @ApiPropertyOptional({ nullable: true }) firstName?: string | null;
  @ApiPropertyOptional({ nullable: true }) lastName?: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) email?: string | null;
  @ApiPropertyOptional({ nullable: true }) birthDate?: Date | null;
  @ApiPropertyOptional({ nullable: true }) country?: string | null;
  @ApiProperty({ nullable: true }) city: string | null;
  @ApiProperty({ nullable: true }) source: string | null;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiPropertyOptional({ nullable: true }) nextContactDate?: Date | null;
  @ApiPropertyOptional({ nullable: true }) lastContactAt?: Date | null;
  @ApiPropertyOptional({ nullable: true }) crmStatusId?: string | null;
  @ApiPropertyOptional() crmStatus?: any;
  // VK-profile data from conversation
  @ApiProperty({ nullable: true }) clientName: string | null;
  @ApiProperty({ nullable: true }) clientAvatar: string | null;
}
