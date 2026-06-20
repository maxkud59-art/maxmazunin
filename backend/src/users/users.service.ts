import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  firstName: true,
  lastName: true,
  nickname: true,
  messengerRole: true,
  companies: true,
  jobTitle: true,
  avatarUrl: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email уже занят');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, role: dto.role },
      select: USER_SELECT,
    });
    return user;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateProfile(id: string, dto: UpdateUserProfileDto) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Пользователь не найден');

    if (dto.nickname) {
      const taken = await this.prisma.user.findFirst({
        where: { nickname: dto.nickname, id: { not: id } },
      });
      if (taken) throw new BadRequestException('Никнейм уже занят');
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
