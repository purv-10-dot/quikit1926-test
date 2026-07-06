'use client';
import { io, type Socket } from 'socket.io-client';

// The Socket.IO server runs in the /worker (NEXT_PUBLIC_WORKER_URL, :3021),
// NOT the Next app (NEXT_PUBLIC_API_URL, :3020). Prefer the worker URL and
// fall back to the API URL only if the worker URL isn't configured.
// NOTE: socket auth token is pending the centralized auth work (do not add here).
const WS_BASE = (process.env.NEXT_PUBLIC_WORKER_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '')
  .replace(/\/api\/?$/, '') || '';

let messagesSocket: Socket | null = null;

export function getMessagesSocket(): Socket {
  if (messagesSocket?.connected) return messagesSocket;

  if (messagesSocket) {
    messagesSocket.removeAllListeners();
    messagesSocket.disconnect();
  }

  messagesSocket = io(`${WS_BASE}/messages`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
  });

  messagesSocket.on('connect', () => {
    console.log('[WS] /messages connected:', messagesSocket?.id);
  });

  messagesSocket.on('disconnect', (reason) => {
    console.log('[WS] /messages disconnected:', reason);
  });

  messagesSocket.on('connect_error', (err) => {
    console.warn('[WS] connection error:', err.message);
  });

  return messagesSocket;
}

export function disconnectMessagesSocket(): void {
  if (messagesSocket) {
    messagesSocket.removeAllListeners();
    messagesSocket.disconnect();
    messagesSocket = null;
  }
}
