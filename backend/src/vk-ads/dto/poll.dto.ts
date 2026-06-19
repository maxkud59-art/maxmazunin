import { ApiProperty } from '@nestjs/swagger';

export class PollResultDto {
  @ApiProperty() cabinetId: string;
  @ApiProperty() snapshots: number;
  @ApiProperty() campaigns: number;
  @ApiProperty() capturedAt: string;
}
