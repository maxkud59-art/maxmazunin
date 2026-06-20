import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from './permission.service';
import { ChatType, Company, MessengerRole, ChatMemberRole, MessageType, AttachmentKind } from '@prisma/client';
import { CreateGroupChatDto } from './dto/chat.dto';
import { SendMessageDto, EditMessageDto } from './dto/message.dto';
import { UpdateProfileDto, SetUserRoleDto } from './dto/profile.dto';
import { CreateGrantDto } from './dto/grant.dto';
import * as path from 'path';

const PAGE_SIZE = 40;
const UPLOAD_BASE_URL = '/api/messenger/files';

const FILE_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  avatarUrl: true,
  jobTitle: true,
  messengerRole: true,
  role: true,
  companies: true,
};

function kindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return AttachmentKind.IMAGE;
  if (mime.startsWith('video/')) return AttachmentKind.VIDEO;
  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation')
  )
    return AttachmentKind.DOC;
  return AttachmentKind.FILE;
}

function attachmentUrl(storageKey: string): string {
  return `${UPLOAD_BASE_URL}/${storageKey}`;
}

function formatSender(u: any) {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, nickname: u.nickname, avatarUrl: u.avatarUrl };
}

function formatMessage(msg: any, myId: string, depth = 0) {
  return {
    id: msg.id,
    chatId: msg.chatId,
    type: msg.type,
    body: msg.deletedAt ? '' : msg.body,
    sender: formatSender(msg.sender),
    replyTo: msg.replyTo && depth === 0 ? formatMessage(msg.replyTo, myId, 1) : null,
    attachments: (msg.attachments ?? []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      storageKey: a.storageKey,
      fileName: a.fileName,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      url: attachmentUrl(a.storageKey),
    })),
    mentions: (msg.mentions ?? []).map((m: any) => m.userId),
    createdAt: msg.createdAt.toISOString(),
    editedAt: msg.editedAt?.toISOString() ?? null,
    deletedAt: msg.deletedAt?.toISOString() ?? null,
    isMine: msg.senderId === myId,
  };
}

@Injectable()
export class MessengerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perm: PermissionService,
  ) {}

  // ─── Profile ─────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: FILE_MEMBER_SELECT,
    });
    return this.formatProfile(u);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.nickname) {
      const existing = await this.prisma.user.findUnique({
        where: { nickname: dto.nickname },
        select: { id: true },
      });
      if (existing && existing.id !== userId) throw new BadRequestException('Никнейм уже занят');
    }
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: FILE_MEMBER_SELECT,
    });
    return this.formatProfile(u);
  }

  private formatProfile(u: any) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      jobTitle: u.jobTitle,
      messengerRole: u.messengerRole,
      companies: u.companies,
      isComplete: !!(u.firstName && u.lastName && u.nickname),
    };
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  async searchUsers(query?: string) {
    const where = query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' as const } },
            { lastName: { contains: query, mode: 'insensitive' as const } },
            { nickname: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const users = await this.prisma.user.findMany({
      where,
      select: FILE_MEMBER_SELECT,
      take: 50,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return users.map((u: any) => this.formatProfile(u));
  }

  async setUserRole(adminId: string, targetId: string, dto: SetUserRoleDto) {
    const admin = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { role: true, messengerRole: true },
    });
    if (!this.perm.canAssignRoles(admin))
      throw new ForbiddenException('Только руководитель может назначать должности');

    const u = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        messengerRole: dto.messengerRole,
        ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
        ...(dto.companies !== undefined && { companies: dto.companies }),
      },
      select: FILE_MEMBER_SELECT,
    });
    return this.formatProfile(u);
  }

  // ─── Chats ───────────────────────────────────────────────────────────────

  async getChats(userId: string) {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: { include: { user: { select: FILE_MEMBER_SELECT } } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });

    const result = await Promise.all(
      memberships.map(async (m) => {
        const lastMsg = m.chat.messages[0] ?? null;
        const unread = m.lastReadMessageId
          ? await this.prisma.message.count({
              where: {
                chatId: m.chatId,
                deletedAt: null,
                senderId: { not: userId },
                createdAt: { gt: (await this.prisma.message.findUnique({ where: { id: m.lastReadMessageId }, select: { createdAt: true } }))?.createdAt ?? new Date(0) },
              },
            })
          : await this.prisma.message.count({
              where: { chatId: m.chatId, deletedAt: null, senderId: { not: userId } },
            });

        const members = m.chat.members.map((cm) => ({
          userId: cm.userId,
          firstName: cm.user.firstName,
          lastName: cm.user.lastName,
          nickname: cm.user.nickname,
          avatarUrl: cm.user.avatarUrl,
          jobTitle: cm.user.jobTitle,
          role: cm.role,
          muted: cm.muted,
        }));

        return {
          id: m.chat.id,
          type: m.chat.type,
          title: m.chat.title,
          avatarUrl: m.chat.avatarUrl,
          company: m.chat.company,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                body: lastMsg.body,
                senderName: lastMsg.sender
                  ? `${lastMsg.sender.firstName ?? ''} ${lastMsg.sender.lastName ?? ''}`.trim()
                  : null,
                createdAt: lastMsg.createdAt.toISOString(),
              }
            : null,
          unreadCount: unread,
          updatedAt: lastMsg?.createdAt.toISOString() ?? m.chat.messages[0]?.createdAt.toISOString() ?? m.joinedAt.toISOString(),
          members,
        };
      }),
    );

    return result.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }

  async createDirectChat(requesterId: string, targetId: string) {
    await this.perm.assertCanDirectMessage(requesterId, targetId);

    // Ищем существующий DM
    const existing = await this.prisma.chat.findFirst({
      where: {
        type: ChatType.DIRECT,
        members: { every: { userId: { in: [requesterId, targetId] } } },
        AND: [
          { members: { some: { userId: requesterId } } },
          { members: { some: { userId: targetId } } },
        ],
      },
    });
    if (existing) return { chatId: existing.id };

    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.DIRECT,
        createdById: requesterId,
        members: {
          create: [
            { userId: requesterId, role: ChatMemberRole.MEMBER },
            { userId: targetId, role: ChatMemberRole.MEMBER },
          ],
        },
      },
    });
    return { chatId: chat.id };
  }

  async createGroupChat(creatorId: string, dto: CreateGroupChatDto) {
    const creator = await this.prisma.user.findUniqueOrThrow({
      where: { id: creatorId },
      select: { role: true, messengerRole: true },
    });
    if (!this.perm.canCreateGroup(creator))
      throw new ForbiddenException('Только руководитель может создавать групповые чаты');

    const uniqueIds = [...new Set([creatorId, ...dto.memberIds])];
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.GROUP,
        title: dto.title,
        avatarUrl: dto.avatarUrl,
        createdById: creatorId,
        members: {
          create: uniqueIds.map((uid) => ({
            userId: uid,
            role: uid === creatorId ? ChatMemberRole.OWNER : ChatMemberRole.MEMBER,
          })),
        },
      },
    });
    return { chatId: chat.id };
  }

  async ensureNewsChannels() {
    for (const company of [Company.IZIBOOK, Company.IZINEON]) {
      const existing = await this.prisma.chat.findFirst({
        where: { type: ChatType.NEWS, company },
      });
      if (!existing) {
        const name = company === Company.IZIBOOK ? 'ИЗИБУК — Новости' : 'ИЗИНЕОН — Новости';
        const genDir = await this.prisma.user.findFirst({
          where: { messengerRole: MessengerRole.GEN_DIRECTOR },
        });
        if (genDir) {
          await this.prisma.chat.create({
            data: {
              type: ChatType.NEWS,
              title: name,
              company,
              createdById: genDir.id,
            },
          });
        }
      }
      // Добавляем пользователей кампании как членов
      const chat = await this.prisma.chat.findFirst({ where: { type: ChatType.NEWS, company } });
      if (!chat) continue;

      const users = await this.prisma.user.findMany({ where: { companies: { has: company } }, select: { id: true } });
      for (const u of users) {
        await this.prisma.chatMember.upsert({
          where: { chatId_userId: { chatId: chat.id, userId: u.id } },
          create: { chatId: chat.id, userId: u.id, role: ChatMemberRole.MEMBER, canLeave: false },
          update: {},
        });
      }
    }
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async getMessages(chatId: string, userId: string, cursor?: string) {
    await this.assertMember(chatId, userId);

    const where: any = { chatId };
    if (cursor) {
      const cursorMsg = await this.prisma.message.findUnique({ where: { id: cursor }, select: { createdAt: true } });
      if (cursorMsg) where.createdAt = { lt: cursorMsg.createdAt };
    }

    const msgs = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      include: {
        sender: { select: FILE_MEMBER_SELECT },
        attachments: true,
        mentions: { select: { userId: true } },
        replyTo: {
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true } },
            attachments: true,
            mentions: { select: { userId: true } },
          },
        },
      },
    });

    const hasMore = msgs.length > PAGE_SIZE;
    const items = msgs.slice(0, PAGE_SIZE).reverse();

    return {
      items: items.map((m) => formatMessage(m, userId)),
      hasMore,
      nextCursor: hasMore ? items[0]?.id ?? null : null,
    };
  }

  async sendMessage(chatId: string, senderId: string, dto: SendMessageDto) {
    const member = await this.assertMember(chatId, senderId);
    const chat = await this.prisma.chat.findUniqueOrThrow({ where: { id: chatId } });

    // NEWS: только Гендир постит
    if (chat.type === ChatType.NEWS) {
      const sender = await this.prisma.user.findUniqueOrThrow({
        where: { id: senderId },
        select: { role: true, messengerRole: true },
      });
      if (!this.perm.canPostToNews(sender))
        throw new ForbiddenException('В новостной канал может постить только Генеральный директор');
    }

    if (!dto.body?.trim() && (!dto.attachmentKeys || dto.attachmentKeys.length === 0))
      throw new BadRequestException('Сообщение не может быть пустым');

    // Парсим @упоминания
    const mentionedNicknames = (dto.body ?? '').match(/@([a-z0-9_.–-]+)/gi)?.map((m) => m.slice(1)) ?? [];
    const mentionedUsers =
      mentionedNicknames.length > 0
        ? await this.prisma.user.findMany({
            where: {
              nickname: { in: mentionedNicknames, mode: 'insensitive' },
              memberships: { some: { chatId } },
            },
            select: { id: true },
          })
        : [];

    // Разрешаем вложения
    const attachments = dto.attachmentKeys?.length
      ? await this.prisma.attachment.findMany({
          where: { storageKey: { in: dto.attachmentKeys }, messageId: '' }, // messageId '' — pending
        })
      : [];

    const messageType =
      attachments.length > 0
        ? attachments[0].kind === AttachmentKind.IMAGE
          ? MessageType.IMAGE
          : attachments[0].kind === AttachmentKind.VIDEO
            ? MessageType.VIDEO
            : MessageType.FILE
        : MessageType.TEXT;

    const msg = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        type: messageType,
        body: dto.body ?? '',
        replyToId: dto.replyToId ?? null,
        mentions: mentionedUsers.length
          ? { create: mentionedUsers.map((u) => ({ userId: u.id })) }
          : undefined,
      },
      include: {
        sender: { select: FILE_MEMBER_SELECT },
        attachments: true,
        mentions: { select: { userId: true } },
        replyTo: {
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true } },
            attachments: true,
            mentions: { select: { userId: true } },
          },
        },
      },
    });

    // Привязываем pending вложения
    if (dto.attachmentKeys?.length) {
      await this.prisma.attachment.updateMany({
        where: { storageKey: { in: dto.attachmentKeys } },
        data: { messageId: msg.id },
      });
    }

    return formatMessage(msg, senderId);
  }

  async editMessage(messageId: string, userId: string, dto: EditMessageDto) {
    const msg = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    if (msg.senderId !== userId) throw new ForbiddenException('Нельзя редактировать чужое сообщение');
    if (msg.deletedAt) throw new BadRequestException('Сообщение удалено');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { body: dto.body, editedAt: new Date() },
      include: {
        sender: { select: FILE_MEMBER_SELECT },
        attachments: true,
        mentions: { select: { userId: true } },
        replyTo: {
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true } },
            attachments: true,
            mentions: { select: { userId: true } },
          },
        },
      },
    });
    return formatMessage(updated, userId);
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: { senderId: true, chatId: true },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, messengerRole: true },
    });
    const isOwn = msg.senderId === userId;
    const isAdmin = this.perm.isLeadership(user);
    if (!isOwn && !isAdmin) throw new ForbiddenException('Нельзя удалить чужое сообщение');

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: '' },
    });
    return { chatId: msg.chatId, messageId };
  }

  async markRead(chatId: string, userId: string, lastMessageId: string) {
    await this.assertMember(chatId, userId);
    const msg = await this.prisma.message.findFirst({
      where: { id: lastMessageId, chatId },
      select: { id: true },
    });
    if (!msg) return;
    await this.prisma.chatMember.updateMany({
      where: { chatId, userId },
      data: { lastReadMessageId: lastMessageId },
    });
  }

  // ─── Grants ──────────────────────────────────────────────────────────────

  async createGrant(adminId: string, dto: CreateGrantDto) {
    const admin = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { messengerRole: true, role: true },
    });
    if (admin.messengerRole !== MessengerRole.COMMERCIAL_DIRECTOR && admin.role !== 'ADMIN')
      throw new ForbiddenException('Только Коммерческий директор выдаёт гранты Гендира');

    const grant = await this.prisma.gendirAccessGrant.upsert({
      where: { userId: dto.userId },
      create: { userId: dto.userId, grantedBy: adminId, active: true },
      update: { grantedBy: adminId, active: true },
      include: {
        user: { select: { nickname: true, firstName: true, lastName: true } },
      },
    });

    return this.formatGrant(grant);
  }

  async revokeGrant(grantId: string, adminId: string) {
    const admin = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { messengerRole: true, role: true },
    });
    if (admin.messengerRole !== MessengerRole.COMMERCIAL_DIRECTOR && admin.role !== 'ADMIN')
      throw new ForbiddenException('Только Коммерческий директор отзывает гранты');

    const grant = await this.prisma.gendirAccessGrant.update({
      where: { id: grantId },
      data: { active: false },
      include: { user: { select: { nickname: true, firstName: true, lastName: true } } },
    });
    return this.formatGrant(grant);
  }

  async listGrants() {
    const grants = await this.prisma.gendirAccessGrant.findMany({
      where: { active: true },
      include: { user: { select: { nickname: true, firstName: true, lastName: true } } },
    });
    return grants.map(this.formatGrant);
  }

  private formatGrant(g: any) {
    return {
      id: g.id,
      userId: g.userId,
      userNickname: g.user?.nickname ?? null,
      userName: `${g.user?.firstName ?? ''} ${g.user?.lastName ?? ''}`.trim() || null,
      grantedBy: g.grantedBy,
      active: g.active,
      createdAt: g.createdAt.toISOString(),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async assertMember(chatId: string, userId: string) {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) throw new ForbiddenException('Нет доступа к этому чату');
    return member;
  }

  async getChatMembers(chatId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      include: { user: { select: FILE_MEMBER_SELECT } },
    });
    return members.map((m) => ({
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      nickname: m.user.nickname,
      avatarUrl: m.user.avatarUrl,
      jobTitle: m.user.jobTitle,
      role: m.role,
      muted: m.muted,
    }));
  }
}
