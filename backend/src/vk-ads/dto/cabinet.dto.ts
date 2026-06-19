import { ApiProperty } from '@nestjs/swagger';

export class VkCabinetDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() externalAccountId: string;
  @ApiProperty() isActive: boolean;
}
