import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MessengerRole, Company } from '@prisma/client';

export class UpdateUserProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z0-9._-]+$/i, { message: 'Никнейм: только латиница, цифры, ._-' })
  nickname?: string;
  @ApiPropertyOptional({ enum: MessengerRole }) @IsOptional() @IsEnum(MessengerRole) messengerRole?: MessengerRole;
  @ApiPropertyOptional({ enum: Company, isArray: true }) @IsOptional() @IsArray() @IsEnum(Company, { each: true }) companies?: Company[];
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
}
