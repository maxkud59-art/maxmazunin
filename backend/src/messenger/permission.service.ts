import { ForbiddenException, Injectable } from '@nestjs/common';
import { MessengerRole, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const LEADERSHIP: MessengerRole[] = [
  MessengerRole.GEN_DIRECTOR,
  MessengerRole.COMMERCIAL_DIRECTOR,
  MessengerRole.SALES_DIRECTOR,
  MessengerRole.ROP,
  MessengerRole.DESIGN_DIRECTOR,
  MessengerRole.PRODUCTION_HEAD,
];

function testMode(): boolean {
  return process.env.MESSENGER_TEST_MODE === 'true';
}

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  isLeadership(user: { role: Role; messengerRole: MessengerRole }): boolean {
    return user.role === Role.ADMIN || LEADERSHIP.includes(user.messengerRole);
  }

  canCreateGroup(user: { role: Role; messengerRole: MessengerRole }): boolean {
    if (testMode()) return true;
    return this.isLeadership(user);
  }

  canPostToNews(user: { role: Role; messengerRole: MessengerRole }): boolean {
    if (testMode()) return true;
    return user.role === Role.ADMIN || user.messengerRole === MessengerRole.GEN_DIRECTOR;
  }

  canAssignRoles(user: { role: Role; messengerRole: MessengerRole }): boolean {
    if (testMode()) return true;
    return this.isLeadership(user);
  }

  // Может ли requester написать target в личном чате?
  async canDirectMessage(
    requesterId: string,
    targetId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (requesterId === targetId) return { allowed: false, reason: 'Нельзя написать себе' };
    if (testMode()) return { allowed: true };

    const [requester, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: requesterId }, select: { messengerRole: true, role: true } }),
      this.prisma.user.findUnique({ where: { id: targetId }, select: { messengerRole: true } }),
    ]);

    if (!requester || !target) return { allowed: false, reason: 'Пользователь не найден' };

    // Защита аккаунта Гендира: MANAGER и DESIGNER не могут писать без гранта
    if (target.messengerRole === MessengerRole.GEN_DIRECTOR) {
      const blocked =
        requester.messengerRole === MessengerRole.MANAGER ||
        requester.messengerRole === MessengerRole.DESIGNER;
      const isSystemAdmin = requester.role === Role.ADMIN;
      const isLeadership = LEADERSHIP.includes(requester.messengerRole);

      if (blocked && !isSystemAdmin && !isLeadership) {
        // Проверяем наличие гранта от комдира
        const grant = await this.prisma.gendirAccessGrant.findUnique({
          where: { userId: requesterId },
          select: { active: true },
        });
        if (!grant?.active) {
          return { allowed: false, reason: 'Написать Гендиру нет разрешения. Обратитесь к Коммерческому директору.' };
        }
      }
    }

    return { allowed: true };
  }

  async assertCanDirectMessage(requesterId: string, targetId: string): Promise<void> {
    const result = await this.canDirectMessage(requesterId, targetId);
    if (!result.allowed) throw new ForbiddenException(result.reason);
  }
}
