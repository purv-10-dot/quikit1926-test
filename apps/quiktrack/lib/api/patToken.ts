import { createHash, randomBytes } from "node:crypto";

export function generatePatToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPatToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PatValidityRecord {
  expiresAt: Date;
  revokedAt: Date | null;
}

export function isPatValid(record: PatValidityRecord, now: Date): boolean {
  if (record.revokedAt) return false;
  return record.expiresAt > now;
}
