import { encryptField, decryptField, maskAccountNumber } from "@/lib/crypto";

/**
 * Credential-at-rest helpers for the integration platform. Reuses the project's
 * audited AES-256-GCM field encryption (lib/crypto) so secrets are never stored
 * in plaintext when CONTACT_ENCRYPTION_KEY (or INTEGRATIONS_ENCRYPTION_KEY) is
 * configured, and are never returned to the frontend.
 */

export function encryptSecret(value: string | null | undefined): string | null {
  return encryptField(value);
}

export function decryptSecret(stored: string | null | undefined): string | null {
  return decryptField(stored);
}

/** Safe-for-display masked form, e.g. "••••••••cdef". Never returns the secret. */
export function maskSecret(plaintext: string | null | undefined): string {
  if (!plaintext) return "";
  return maskAccountNumber(plaintext);
}

/** Whether encryption is actually active (key present). Surfaced in the UI. */
export function encryptionEnabled(): boolean {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY ?? process.env.CONTACT_ENCRYPTION_KEY;
  return Boolean(key && key.length >= 8);
}
