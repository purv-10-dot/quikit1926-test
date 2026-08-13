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

/** One resource name per external route. Add a new entry here whenever a new
 *  external/* route is introduced, and pick it in the Settings key-creation form. */
export const EXTERNAL_API_SCOPES = ["departments", "employees"] as const;
export type ExternalApiScope = (typeof EXTERNAL_API_SCOPES)[number];

interface KeyRow { orgId: string; scope: string }

function scopeAllows(scope: string, resource: ExternalApiScope): boolean {
  if (scope === "all") return true;
  return scope.split(",").map((s) => s.trim()).includes(resource);
}

/**
 * Shared by every external (API-key-gated, no-session) read route — resolves
 * a raw incoming key to the org it belongs to, but ONLY if that key was
 * granted the given resource scope (a key issued for "employees" must not
 * also unlock "departments", and vice versa). Returns null if the key is
 * missing/invalid/revoked/out-of-scope — callers can't distinguish which,
 * by design, so a wrong-scope key fails exactly like an invalid one.
 * Best-effort bumps lastUsedAt (never blocks the caller on it).
 */
export async function verifyExternalApiKey(rawKey: string | null, resource: ExternalApiScope): Promise<string | null> {
  if (!rawKey) return null;
  const hash = hashExternalApiKey(rawKey);
  const rows = await prisma.$queryRaw<KeyRow[]>`
    SELECT "orgId", "scope" FROM "app_quikhrms"."ExternalApiKey"
    WHERE "keyHash" = ${hash} AND "isActive" = true
    LIMIT 1`;
  const row = rows[0];
  if (!row || !scopeAllows(row.scope, resource)) return null;

  prisma.$executeRaw`UPDATE "app_quikhrms"."ExternalApiKey" SET "lastUsedAt" = now() WHERE "keyHash" = ${hash}`
    .catch((e) => console.error("[external-api-key] lastUsedAt update failed:", e));

  return row.orgId;
}
