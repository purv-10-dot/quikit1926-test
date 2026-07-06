/**
 * AES-256-GCM symmetric encryption for secrets at rest (User.aiApiKey,
 * tenant videoConfig provider credentials). Key from ENCRYPTION_KEY.
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
// Normalize whatever ENCRYPTION_KEY is into a 32-byte key.
const KEY = createHash('sha256').update(env.ENCRYPTION_KEY).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
