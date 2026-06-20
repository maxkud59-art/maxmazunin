import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateGrantDto {
  @ApiProperty({ description: 'userId пользователя, которому выдаём доступ к Гендиру' })
  @IsString()
  userId: string;
}

export class GrantDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true }) userNickname: string | null;
  @ApiProperty({ nullable: true }) userName: string | null;
  @ApiProperty() grantedBy: string;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}
