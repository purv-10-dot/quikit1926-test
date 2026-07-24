'use client';
import { io, type Socket } from 'socket.io-client';

// The Socket.IO server runs in the /worker (NEXT_PUBLIC_WORKER_URL, :3021),
// NOT the Next app (NEXT_PUBLIC_API_URL, :3020). Prefer the worker URL and
// fall back to the API URL only if the worker URL isn't configured.
const WS_BASE = (process.env.NEXT_PUBLIC_WORKER_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '')
  .replace(/\/api\/?$/, '') || '';

let messagesSocket: Socket | null = null;

/**
 * Fetch a fresh handshake token from the app, which derives it from the
 * centralized session cookie (`GET /api/messages/socket-token`).
 *
 * The worker rejects any handshake without a valid HS256 JWT, so this is not
 * optional — connecting without it is what left the whole realtime layer dead.
 * Returns '' on failure so the socket still attempts to connect and surfaces a
 * normal `connect_error` rather than throwing inside the caller.
 */
async function fetchSocketToken(): Promise<string> {
  try {
    const res = await fetch('/api/messages/socket-token', { credentials: 'include' });
    if (!res.ok) return '';
    const body = await res.json();
    return body?.data?.token ?? '';
  } catch {
    return '';
  }
}

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
    // Connect only once a token is in hand — see the auth callback below.
    autoConnect: false,
    /**
     * socket.io calls this before EVERY connect attempt, including each
     * reconnect, so an expired token is replaced automatically rather than
     * pinning a dead one for the life of the tab.
     */
    auth: (cb: (data: { token: string }) => void) => {
      void fetchSocketToken().then((token) => cb({ token }));
    },
  });
  messagesSocket.connect();

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
