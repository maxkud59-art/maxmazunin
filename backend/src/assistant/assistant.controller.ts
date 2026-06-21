import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AssistantService } from './assistant.service';
import { ConversationListDto } from './dto/conversation.dto';
import { MessageListDto, SendMessageDto, MessageDto } from './dto/message.dto';
import { ClientDto } from './dto/client.dto';
import { SetConversationBotDto, ConversationBotDto } from './dto/bot-assignment.dto';
import { ReminderDto } from './dto/reminder.dto';

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly svc: AssistantService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Список диалогов VK-сообщества' })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'unread', 'unanswered'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, type: ConversationListDto })
  listConversations(
    @Query('filter') filter?: 'all' | 'unread' | 'unanswered',
    @Query('search') search?: string,
    @Query('page') page?: string,
  ): Promise<ConversationListDto> {
    return this.svc.listConversations({ filter, search, page: page ? Number(page) : 0 });
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'История переписки (cursor-пагинация)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: 200, type: MessageListDto })
  getMessages(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ): Promise<MessageListDto> {
    return this.svc.getMessages(id, cursor);
  }

  @Post('conversations/:id/send')
  @ApiOperation({ summary: 'Отправить сообщение в VK' })
  @ApiResponse({ status: 201, type: MessageDto })
  sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.svc.sendMessage(id, body.text);
  }

  @Get('conversations/:id/bot')
  @ApiOperation({ summary: 'Получить назначенного бота для диалога' })
  @ApiResponse({ status: 200, type: ConversationBotDto })
  getConversationBot(@Param('id') id: string) {
    return this.svc.getConversationBotInfo(id);
  }

  @Patch('conversations/:id/bot')
  @ApiOperation({ summary: 'Назначить/снять/поставить на паузу бота для диалога' })
  @ApiResponse({ status: 200, type: ConversationBotDto })
  setConversationBot(
    @Param('id') id: string,
    @Body() body: SetConversationBotDto,
  ) {
    return this.svc.setConversationBot(id, body.botId, body.paused);
  }

  @Get('reminders')
  @ApiOperation({ summary: 'Напоминания: клиенты с ближайшей датой след. контакта' })
  @ApiResponse({ status: 200, type: [ReminderDto] })
  getReminders(): Promise<ReminderDto[]> {
    return this.svc.getReminders();
  }

  @Get('clients/:peerId')
  @ApiOperation({ summary: 'Карточка клиента' })
  @ApiResponse({ status: 200, type: ClientDto })
  getClient(@Param('peerId', ParseIntPipe) peerId: number): Promise<ClientDto> {
    return this.svc.getClient(peerId);
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Ручной запуск синхронизации диалогов из VK' })
  triggerSync() {
    void this.svc.syncAll();
    return { started: true };
  }

  @Get('token-health')
  @ApiOperation({ summary: 'Проверить VK_GROUP_TOKEN' })
  @ApiResponse({ status: 200, schema: { properties: { ok: { type: 'boolean' }, message: { type: 'string' } } } })
  checkTokenHealth() {
    return this.svc.checkTokenHealth();
  }
}
