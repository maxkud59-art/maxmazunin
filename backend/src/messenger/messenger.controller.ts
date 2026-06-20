import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessengerService } from './messenger.service';
import { MessengerGateway } from './messenger.gateway';
import { UpdateProfileDto, SetUserRoleDto, UserProfileDto } from './dto/profile.dto';
import { CreateGroupChatDto, ChatDto } from './dto/chat.dto';
import { SendMessageDto, EditMessageDto, MessageDto, MessagesPageDto } from './dto/message.dto';
import { CreateGrantDto, GrantDto } from './dto/grant.dto';

interface JwtUser { id: string; email: string; role: string }

@ApiTags('messenger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messenger')
export class MessengerController {
  constructor(
    private readonly svc: MessengerService,
    private readonly gateway: MessengerGateway,
  ) {}

  // ─── Profile ─────────────────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Получить свой профиль мессенджера' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  getProfile(@CurrentUser() u: JwtUser) {
    return this.svc.getProfile(u.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Обновить профиль (имя, ник, аватар)' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  updateProfile(@CurrentUser() u: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.svc.updateProfile(u.id, dto);
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Список/поиск пользователей' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiResponse({ status: 200, type: [UserProfileDto] })
  searchUsers(@Query('q') q?: string) {
    return this.svc.searchUsers(q);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: '[Руководитель] Назначить должность/роль пользователю' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  setRole(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: SetUserRoleDto) {
    return this.svc.setUserRole(u.id, id, dto);
  }

  // ─── Chats ───────────────────────────────────────────────────────────────

  @Get('chats')
  @ApiOperation({ summary: 'Список чатов текущего пользователя' })
  @ApiResponse({ status: 200, type: [ChatDto] })
  getChats(@CurrentUser() u: JwtUser) {
    return this.svc.getChats(u.id);
  }

  @Post('chats')
  @ApiOperation({ summary: '[Руководитель] Создать групповой чат' })
  createGroup(@CurrentUser() u: JwtUser, @Body() dto: CreateGroupChatDto) {
    return this.svc.createGroupChat(u.id, dto);
  }

  @Post('direct/:userId')
  @ApiOperation({ summary: 'Открыть или создать личный чат (с проверкой прав на Гендира)' })
  async openDirect(@CurrentUser() u: JwtUser, @Param('userId') targetId: string) {
    const result = await this.svc.createDirectChat(u.id, targetId);
    await this.gateway.joinUserToChat(targetId, result.chatId);
    return result;
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Get('chats/:id/messages')
  @ApiOperation({ summary: 'Сообщения чата (пагинация курсором, 40 за раз)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: MessagesPageDto })
  getMessages(
    @CurrentUser() u: JwtUser,
    @Param('id') chatId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.getMessages(chatId, u.id, cursor);
  }

  @Post('chats/:id/messages')
  @ApiOperation({ summary: 'Отправить сообщение' })
  @ApiResponse({ status: 201, type: MessageDto })
  async sendMessage(
    @CurrentUser() u: JwtUser,
    @Param('id') chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    const msg = await this.svc.sendMessage(chatId, u.id, dto);
    this.gateway.emitNewMessage(chatId, msg);
    return msg;
  }

  @Patch('messages/:id')
  @ApiOperation({ summary: 'Редактировать своё сообщение' })
  @ApiResponse({ status: 200, type: MessageDto })
  async editMessage(
    @CurrentUser() u: JwtUser,
    @Param('id') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    const msg = await this.svc.editMessage(messageId, u.id, dto);
    this.gateway.emitEditedMessage(msg.chatId, msg);
    return msg;
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: 'Удалить своё сообщение (soft delete)' })
  async deleteMessage(@CurrentUser() u: JwtUser, @Param('id') messageId: string) {
    const result = await this.svc.deleteMessage(messageId, u.id);
    this.gateway.emitDeletedMessage(result.chatId, result.messageId);
    return result;
  }

  @Post('chats/:id/read')
  @ApiOperation({ summary: 'Пометить сообщения прочитанными' })
  async markRead(
    @CurrentUser() u: JwtUser,
    @Param('id') chatId: string,
    @Body('lastMessageId') lastMessageId: string,
  ) {
    await this.svc.markRead(chatId, u.id, lastMessageId);
    return { ok: true };
  }

  // ─── Grants ──────────────────────────────────────────────────────────────

  @Get('gendir-grants')
  @ApiOperation({ summary: '[КомДир] Список активных грантов доступа к Гендиру' })
  @ApiResponse({ status: 200, type: [GrantDto] })
  listGrants() {
    return this.svc.listGrants();
  }

  @Post('gendir-grants')
  @ApiOperation({ summary: '[КомДир] Выдать доступ к Гендиру' })
  @ApiResponse({ status: 201, type: GrantDto })
  createGrant(@CurrentUser() u: JwtUser, @Body() dto: CreateGrantDto) {
    return this.svc.createGrant(u.id, dto);
  }

  @Delete('gendir-grants/:id')
  @ApiOperation({ summary: '[КомДир] Отозвать доступ к Гендиру' })
  revokeGrant(@CurrentUser() u: JwtUser, @Param('id') grantId: string) {
    return this.svc.revokeGrant(grantId, u.id);
  }

  // ─── Online ──────────────────────────────────────────────────────────────

  @Get('online')
  @ApiOperation({ summary: 'Список онлайн-пользователей' })
  getOnline() {
    return this.gateway.getOnlineUserIds();
  }
}
