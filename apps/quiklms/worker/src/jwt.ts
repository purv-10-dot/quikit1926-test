// JWT verification for the Socket.IO handshake — same HS256 secret as the app.
import { jwtVerify } from 'jose';
import { env } from './env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SocketClaims {
  sub: string;
  tenantId?: string | null;
  role?: string;
  [k: string]: unknown;
}

export async function verifySocketToken(token: string): Promise<SocketClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SocketClaims;
  } catch {
    return null;
  }
}
