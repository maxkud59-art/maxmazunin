import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrmDealClientDto {
  @ApiProperty() id: number;
  @ApiProperty() fullName: string;
  @ApiProperty() phone: string;
}

export class CrmDealUserDto {
  @ApiProperty() id: number;
  @ApiProperty() fullName: string;
}

export class CrmDealGroupDto {
  @ApiProperty() id: number;
  @ApiProperty() title: string;
}

export class CrmDealPaymentDto {
  @ApiProperty() id: number;
  @ApiProperty() price: number;
  @ApiProperty() method: string;
}

export class CrmDealDto {
  @ApiProperty() id: number;
  @ApiProperty() saleDate: string;
  @ApiProperty() title: string;
  @ApiProperty() price: number;
  @ApiProperty() status: string;
  @ApiProperty() source: string;
  @ApiProperty() adTag: string;
  @ApiProperty() clothingMethod: string;
  @ApiProperty() period: string;
  @ApiProperty() paid: boolean;
  @ApiProperty() reservation: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: CrmDealClientDto }) client: CrmDealClientDto;
  @ApiProperty({ type: CrmDealUserDto }) user: CrmDealUserDto;
  @ApiProperty({ type: CrmDealGroupDto }) group: CrmDealGroupDto;
  @ApiProperty({ type: [CrmDealPaymentDto] }) payments: CrmDealPaymentDto[];
}

export class CrmDealsResponseDto {
  @ApiProperty({ type: [CrmDealDto] }) data: CrmDealDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() pages: number;
}

export class CrmGroupDto {
  @ApiProperty() id: number;
  @ApiProperty() title: string;
}

export class CrmWorkSpaceDto {
  @ApiProperty() id: number;
  @ApiProperty() title: string;
}
