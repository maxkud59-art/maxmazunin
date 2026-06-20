import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MessengerRole, Company } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) lastName?: string;
  @ApiPropertyOptional({
    description: 'Уникальный никнейм латиницей/цифрами/._-, 3–32 символа',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-z0-9_.–-]+$/i, { message: 'nickname: only a-z, 0-9, . _ - allowed' })
  nickname?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) jobTitle?: string;
}

export class SetUserRoleDto {
  @ApiProperty({ enum: MessengerRole }) @IsEnum(MessengerRole) messengerRole: MessengerRole;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) jobTitle?: string;
  @ApiPropertyOptional({ enum: Company, isArray: true })
  @IsOptional()
  @IsEnum(Company, { each: true })
  companies?: Company[];
}

export class UserProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true }) firstName: string | null;
  @ApiProperty({ nullable: true }) lastName: string | null;
  @ApiProperty({ nullable: true }) nickname: string | null;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) jobTitle: string | null;
  @ApiProperty({ enum: MessengerRole }) messengerRole: MessengerRole;
  @ApiProperty({ enum: Company, isArray: true }) companies: Company[];
  @ApiProperty({ description: 'true если профиль полностью заполнен' }) isComplete: boolean;
}
