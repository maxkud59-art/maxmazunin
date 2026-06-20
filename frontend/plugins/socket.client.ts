import { io, Socket } from 'socket.io-client';
import { useMessengerStore } from '~/stores/messenger';
import { useAuthStore } from '~/stores/auth';

let socket: Socket | null = null;

export function getSocket(): Socket | null { return socket; }

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  return {
    provide: {
      connectSocket: (token: string) => {
        if (socket?.connected) return socket;

        socket = io(`${apiBase}/messenger`, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 2000,
        });

        socket.on('connect', () => {
          console.log('[WS] Connected:', socket?.id);
        });

        socket.on('disconnect', (reason) => {
          console.log('[WS] Disconnected:', reason);
        });

        socket.on('connect_error', (err) => {
          console.warn('[WS] Error:', err.message);
        });

        const store = useMessengerStore();
        const auth = useAuthStore();

        socket.on('message:new', ({ message }) => {
          // isMine is stripped by gateway so each client decides based on their own userId
          message.isMine = message.sender?.id === auth.user?.id;
          store.addMessage(message);
        });

        socket.on('message:edit', ({ message }) => {
          message.isMine = message.sender?.id === auth.user?.id;
          store.updateMessage(message);
        });

        socket.on('message:delete', ({ chatId, messageId }) => {
          store.removeMessage(chatId, messageId);
        });

        socket.on('typing:start', ({ chatId, userId }) => {
          store.setTyping(chatId, userId, true);
          // Автоматически снять через 3 сек
          setTimeout(() => store.setTyping(chatId, userId, false), 3000);
        });

        socket.on('typing:stop', ({ chatId, userId }) => {
          store.setTyping(chatId, userId, false);
        });

        // presence:snapshot — полный список онлайн при подключении
        socket.on('presence:snapshot', ({ onlineIds }: { onlineIds: string[] }) => {
          store.setOnline(onlineIds);
        });
        // presence:update — изменение статуса конкретного пользователя
        socket.on('presence:update', ({ userId, online }: { userId: string; online: boolean }) => {
          if (online) store.addOnline(userId);
          else store.removeOnline(userId);
        });

        return socket;
      },

      disconnectSocket: () => {
        socket?.disconnect();
        socket = null;
      },

      emitTypingStart: (chatId: string) => {
        socket?.emit('typing:start', { chatId });
      },

      emitTypingStop: (chatId: string) => {
        socket?.emit('typing:stop', { chatId });
      },

      emitReadMark: (chatId: string, lastMessageId: string) => {
        socket?.emit('read:mark', { chatId, lastMessageId });
      },
    },
  };
});
