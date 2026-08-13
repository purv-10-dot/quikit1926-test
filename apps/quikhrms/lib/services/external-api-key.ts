import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * External (cross-app) API keys: a random raw key is shown to the admin ONCE
 * at creation; only its SHA-256 hash is stored. Verification hashes the
 * incoming key and matches on the hash, so a DB leak never exposes a usable
 * key. Same pattern as invite tokens (lib/auth/invite-token.ts).
 */
export function generateExternalApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `sk_live_${crypto.randomBytes(24).toString("hex")}`;
  return { raw, hash: hashExternalApiKey(raw), prefix: raw.slice(0, 14) };
}

export function hashExternalApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

interface KeyRow { orgId: string }

/**
 * Shared by every external (API-key-gated, no-session) read route — resolves
 * a raw incoming key to the org it belongs to, or null if missing/invalid/
 * revoked. Best-effort bumps lastUsedAt (never blocks the caller on it).
 */
export async function verifyExternalApiKey(rawKey: string | null): Promise<string | null> {
  if (!rawKey) return null;
  const hash = hashExternalApiKey(rawKey);
  const rows = await prisma.$queryRaw<KeyRow[]>`
    SELECT "orgId" FROM "app_quikhrms"."ExternalApiKey"
    WHERE "keyHash" = ${hash} AND "isActive" = true
    LIMIT 1`;
  const orgId = rows[0]?.orgId;
  if (!orgId) return null;

  prisma.$executeRaw`UPDATE "app_quikhrms"."ExternalApiKey" SET "lastUsedAt" = now() WHERE "keyHash" = ${hash}`
    .catch((e) => console.error("[external-api-key] lastUsedAt update failed:", e));

  return orgId;
}
