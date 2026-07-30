/**
 * Verifies that secrets encrypted by the NestJS backend still decrypt here.
 *
 * GAP_REPORT (§3.2 upload) flagged this as undetermined: "If the ETL did not
 * re-encrypt, every stored key fails to decrypt." It did not re-encrypt —
 * `scripts/etl/migrate.ts:126` copies `aiApiKey` verbatim — so every migrated
 * row holds an aes-256-cbc ciphertext that this module's aes-256-gcm reader
 * cannot parse.
 *
 * The `legacyEncrypt` helper below is a byte-for-byte copy of the legacy
 * `AuthService.encryptApiKey` (`auth.service.ts:53-60`). It is the fixture, not
 * the thing under test: it produces exactly what is sitting in the migrated
 * database today.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCipheriv, randomBytes, scryptSync } from 'crypto';

const h = vi.hoisted(() => ({ ENCRYPTION_KEY: 'quikskill-encryption-key-32chars!!' }));
const ENCRYPTION_KEY = h.ENCRYPTION_KEY;

vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_KEY: h.ENCRYPTION_KEY } }));

import { encryptSecret, decryptSecret } from '@/lib/crypto';

/** Byte-for-byte port of the legacy AuthService.encryptApiKey. */
function legacyEncrypt(text: string): string {
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

describe('decryptSecret — legacy NestJS ciphertexts', () => {
  it('reads a secret encrypted by the legacy backend', () => {
    const plaintext = 'sk-proj-abc123DEF456';
    const legacy = legacyEncrypt(plaintext);

    // Sanity-check the fixture really is the legacy shape: hex(iv):hex(ct).
    expect(legacy).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);

    expect(decryptSecret(legacy)).toBe(plaintext);
  });

  it('round-trips the current GCM format', () => {
    const plaintext = 'sk-new-format-key';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('always writes the new GCM format, never the legacy one', () => {
    // Legacy values upgrade on the next write; we never emit CBC again.
    expect(encryptSecret('x')).not.toMatch(/^[0-9a-f]{32}:/);
  });

  it('handles a legacy value long enough to span multiple CBC blocks', () => {
    const plaintext = 'k'.repeat(500);
    expect(decryptSecret(legacyEncrypt(plaintext))).toBe(plaintext);
  });

  it('does not mistake a GCM payload for a legacy one', () => {
    // The legacy sniff keys on `hex:hex`; base64 GCM payloads use '.' separators
    // and must never take the CBC path.
    for (let i = 0; i < 50; i++) {
      const enc = encryptSecret(`secret-${i}`);
      expect(decryptSecret(enc)).toBe(`secret-${i}`);
    }
  });

  it('still rejects a malformed payload', () => {
    expect(() => decryptSecret('not-encrypted-at-all')).toThrow('Malformed encrypted payload');
  });
});
