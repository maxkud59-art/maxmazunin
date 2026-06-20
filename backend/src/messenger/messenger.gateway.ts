import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/messenger',
  transports: ['websocket', 'polling'],
})
export class MessengerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessengerGateway.name);
  // userId → Set<socketId>
  private readonly online = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('MessengerGateway initialised');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        (client.handshake.headers?.authorization ?? '').replace('Bearer ', '');

      const payload = this.jwtService.verify(token);
      const userId: string = payload.sub;

      // Attach userId to socket
      (client as any).userId = userId;

      // Auto-join all user's chat rooms
      const memberships = await this.prisma.chatMember.findMany({
        where: { userId },
        select: { chatId: true },
      });
      for (const m of memberships) {
        await client.join(`chat:${m.chatId}`);
      }

      // Track online
      if (!this.online.has(userId)) this.online.set(userId, new Set());
      this.online.get(userId)!.add(client.id);

      // Send current presence snapshot to the newly connected client
      client.emit('presence:snapshot', { onlineIds: this.getOnlineUserIds() });

      // Broadcast presence change to all clients
      this.server.emit('presence:update', { userId, online: true });
      this.logger.debug(`Connected: ${userId} (${client.id})`);
    } catch {
      this.logger.warn(`Connection rejected: invalid token (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return;
    const sockets = this.online.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.online.delete(userId);
        this.server.emit('presence:update', { userId, online: false });
      }
    }
    this.logger.debug(`Disconnected: ${userId} (${client.id})`);
  }

  getOnlineUserIds(): string[] {
    return [...this.online.keys()];
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  // ─── Subscribe events ───────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async onJoinChat(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    await client.join(`chat:${data.chatId}`);
  }

  @SubscribeMessage('typing:start')
  onTypingStart(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    const userId = (client as any).userId;
    client.to(`chat:${data.chatId}`).emit('typing:start', { chatId: data.chatId, userId });
  }

  @SubscribeMessage('typing:stop')
  onTypingStop(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    const userId = (client as any).userId;
    client.to(`chat:${data.chatId}`).emit('typing:stop', { chatId: data.chatId, userId });
  }

  @SubscribeMessage('read:mark')
  onReadMark(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; lastMessageId: string },
  ) {
    const userId = (client as any).userId;
    client.to(`chat:${data.chatId}`).emit('read:update', {
      chatId: data.chatId,
      userId,
      lastMessageId: data.lastMessageId,
    });
  }

  // ─── Emit helpers (called by MessengerService via gateway) ──────────────

  emitToChat(chatId: string, event: string, data: any) {
    this.server.to(`chat:${chatId}`).emit(event, data);
  }

  emitNewMessage(chatId: string, message: any) {
    // Strip isMine — it's sender-relative; each client recomputes from sender.id
    const { isMine: _, ...rawMsg } = message;
    this.emitToChat(chatId, 'message:new', { chatId, message: rawMsg });
  }

  emitEditedMessage(chatId: string, message: any) {
    const { isMine: _, ...rawMsg } = message;
    this.emitToChat(chatId, 'message:edit', { chatId, message: rawMsg });
  }

  emitDeletedMessage(chatId: string, messageId: string) {
    this.emitToChat(chatId, 'message:delete', { chatId, messageId });
  }

  async joinUserToChat(userId: string, chatId: string) {
    const sockets = this.online.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
      const s = this.server.sockets.sockets.get(socketId);
      if (s) await s.join(`chat:${chatId}`);
    }
  }
}
