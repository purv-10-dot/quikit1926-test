/**
 * AES-256-GCM symmetric encryption for secrets at rest (User.aiApiKey,
 * tenant videoConfig provider credentials). Key from ENCRYPTION_KEY.
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 *
 * LEGACY COMPATIBILITY — read the note before changing `decryptSecret`.
 *
 * The NestJS backend encrypted `User.aiApiKey` with a DIFFERENT scheme
 * (`auth.service.ts:53-72`), incompatible on all three axes:
 *
 *              legacy                          | this module
 *   algorithm  aes-256-cbc                     | aes-256-gcm
 *   key        scryptSync(ENCRYPTION_KEY,'salt',32) | sha256(ENCRYPTION_KEY)
 *   format     hex(iv) ":" hex(ct)             | b64(iv) "." b64(tag) "." b64(ct)
 *
 * The ETL copies `aiApiKey` across verbatim (`scripts/etl/migrate.ts:126`) and
 * never re-encrypts, so every migrated row still holds a legacy CBC ciphertext.
 * `decryptSecret` therefore sniffs the format and falls back to the legacy
 * scheme; without that, every migrated key is unreadable and silently lost.
 *
 * `encryptSecret` only ever writes the new GCM format — legacy values are
 * upgraded naturally the next time a secret is written.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
// Normalize whatever ENCRYPTION_KEY is into a 32-byte key.
const KEY = createHash('sha256').update(env.ENCRYPTION_KEY).digest();

const LEGACY_ALGO = 'aes-256-cbc';
/** Legacy KDF — scrypt with the hardcoded literal salt `'salt'` (auth.service.ts:54). */
const LEGACY_KEY = scryptSync(env.ENCRYPTION_KEY, 'salt', 32);

/** Legacy payloads are `hex(iv):hex(ciphertext)` — a 32-hex-char IV, then ':'. */
function isLegacyPayload(payload: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(payload);
}

/** Port of `AuthService.decryptApiKey` (`auth.service.ts:63-72`). */
function decryptLegacy(payload: string): string {
  const parts = payload.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = createDecipheriv(LEGACY_ALGO, LEGACY_KEY, iv);
  return Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString('utf8');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  // Migrated NestJS ciphertexts are still in the legacy CBC format (see docblock).
  if (isLegacyPayload(payload)) return decryptLegacy(payload);

  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
