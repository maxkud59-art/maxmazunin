import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '[ADMIN] Создать пользователя' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '[ADMIN] Список пользователей с профилем' })
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: '[ADMIN] Обновить профиль пользователя' })
  updateProfile(@Param('id') id: string, @Body() dto: UpdateUserProfileDto) {
    return this.usersService.updateProfile(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[ADMIN] Удалить пользователя' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
