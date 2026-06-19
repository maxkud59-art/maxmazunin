import { ApiProperty } from '@nestjs/swagger';

export class HourProfileItemDto {
  @ApiProperty({ description: 'Час суток по МСК (0–23)' }) hourMsk: number;
  @ApiProperty({ description: 'Суммарный расход ₽ за все дни периода' }) totalSpend: number;
  @ApiProperty() totalLeads: number;
  @ApiProperty() totalImpressions: number;
  @ApiProperty() totalClicks: number;
  @ApiProperty({ nullable: true, description: 'totalSpend / totalLeads' }) avgCpl: number | null;
  @ApiProperty({ nullable: true }) avgCpm: number | null;
  @ApiProperty({ nullable: true }) avgCpc: number | null;
  @ApiProperty({ description: 'Кол-во дней с данными для этого часа' }) daysCount: number;
}
