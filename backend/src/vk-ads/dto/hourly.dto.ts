import { ApiProperty } from '@nestjs/swagger';

export class HourlyStatDto {
  @ApiProperty({ description: 'Час по МСК (0–23)' }) hourMsk: number;
  @ApiProperty({ description: 'Начало часа в UTC (ISO)' }) hourStartUtc: string;
  @ApiProperty() impressionsDelta: number;
  @ApiProperty() clicksDelta: number;
  @ApiProperty({ description: 'Расход ₽' }) spendDelta: number;
  @ApiProperty({ description: 'Лиды / сообщения' }) leadsDelta: number;
  @ApiProperty({ nullable: true }) cpm: number | null;
  @ApiProperty({ nullable: true }) cpc: number | null;
  @ApiProperty({ nullable: true, description: 'Стоимость лида ₽' }) cpl: number | null;
  @ApiProperty({ description: 'Данные за последние 2 ч — предварительные' }) isPreliminary: boolean;
  @ApiProperty({ description: 'false — снимков за этот час нет' }) hasData: boolean;
}
