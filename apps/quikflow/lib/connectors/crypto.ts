/**
 * Symmetric encryption for connection secrets at rest (AES-256-GCM).
 *
 * WfConnection.accessToken / refreshToken are declared "encrypted at rest" in
 * the schema — this is where that promise is kept. Every token is sealed with
 * a random 96-bit IV and an authentication tag, so tampering is detectable on
 * decrypt. The key comes from WF_CONNECTION_ENC_KEY (32 bytes, hex or base64).
 *
 * Format:  v1.<ivB64>.<tagB64>.<ciphertextB64>   ("." never occurs in base64)
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

/** Decode WF_CONNECTION_ENC_KEY to a 32-byte key (hex or base64 accepted). */
function key(): Buffer {
  const raw = process.env.WF_CONNECTION_ENC_KEY;
  if (!raw) {
    throw new Error("WF_CONNECTION_ENC_KEY is not set — cannot encrypt/decrypt connection tokens.");
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("WF_CONNECTION_ENC_KEY must decode to exactly 32 bytes (256-bit).");
  }
  return buf;
}

/** Encrypt a UTF-8 secret to the `v1.iv.tag.ct` envelope. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a `v1.iv.tag.ct` envelope; throws if the key or tag is wrong. */
export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, ctB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !ctB) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}
