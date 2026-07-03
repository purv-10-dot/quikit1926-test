import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Field-level encryption for sensitive data at rest (e.g. bank account numbers).
 * AES-256-GCM with a key derived from CONTACT_ENCRYPTION_KEY. When the key is
 * not configured the value is stored as-is, prefixed so we know it is plaintext
 * — set CONTACT_ENCRYPTION_KEY in production to enable encryption.
 *
 * Stored format (encrypted): "enc:v1:<iv-b64>:<tag-b64>:<cipher-b64>".
 */

const PREFIX = "enc:v1:";
const PLAIN_PREFIX = "plain:";

function getKey(): Buffer | null {
  const secret = process.env.CONTACT_ENCRYPTION_KEY;
  if (!secret || secret.length < 8) return null;
  // Derive a stable 32-byte key from the secret.
  return scryptSync(secret, "quikfinance-contact-salt", 32);
}

export function encryptField(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const key = getKey();
  if (!key) return `${PLAIN_PREFIX}${value}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) return null; // cannot decrypt without the key
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Mask all but the last 4 characters for display, e.g. "••••6789". */
export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return "";
  const last4 = value.slice(-4);
  return `${"•".repeat(Math.max(0, value.length - 4))}${last4}`;
}
