import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connected = false;

export function useVkRealtime() {
  const config = useRuntimeConfig();

  function connect() {
    if (!process.client) return;
    if (connected && socket?.connected) return;

    const token = localStorage.getItem('auth_token') ?? '';
    if (!token) return;

    const apiBase = (config.public.apiBase as string) || '';

    // Lazy import to avoid SSR issues
    import('socket.io-client').then(({ io }) => {
      socket = io(`${apiBase}/assistant-realtime`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
      });

      socket.on('connect', () => {
        connected = true;
      });

      socket.on('disconnect', () => {
        connected = false;
      });
    });
  }

  function on(event: string, fn: (data: any) => void) {
    socket?.on(event, fn);
  }

  function off(event: string, fn: (data: any) => void) {
    socket?.off(event, fn);
  }

  function disconnect() {
    socket?.disconnect();
    socket = null;
    connected = false;
  }

  return { connect, on, off, disconnect };
}
