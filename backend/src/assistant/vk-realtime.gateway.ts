import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/assistant-realtime',
  transports: ['websocket', 'polling'],
})
export class VkRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(VkRealtimeGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        (client.handshake.headers?.authorization ?? '').replace('Bearer ', '');
      this.jwtService.verify(token);
      this.logger.debug('VkRealtime connected: %s', client.id);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug('VkRealtime disconnected: %s', client.id);
  }

  broadcast(event: string, data: any) {
    this.server?.emit(event, data);
  }
}
