/**
 * Settings → API Keys service.
 *
 * Manages CrmApiKey rows — the secret keys that authenticate the public API
 * layer (`/api/public/*`). Admin-only surface (gating enforced in the route).
 *
 * Security invariants enforced here:
 *   - The raw secret is generated server-side via generateApiKey() and returned
 *     to the caller EXACTLY ONCE (on create). It is never stored.
 *   - Only the SHA-256 hash (keyHash) is persisted.
 *   - keyHash is NEVER included in any list/read DTO — see ApiKeyView.
 *   - Every query is scoped to the actor's orgId (tenant isolation).
 *
 * Reuses generateApiKey() / hashApiKey() from lib/api/public-api-auth.ts so key
 * derivation lives in exactly one place (same code path the public API
 * validates against). All mutations write a CrmAuditLog entry via audit().
 */
import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { generateApiKey } from "@/lib/api/public-api-auth";
import type { SessionUser } from "@/types/permission";

const MODULE = "api-keys";

/**
 * Conflict / not-found error carrying an HTTP status. Mirrors the shape of the
 * shared `SettingsConflictError` used by the other settings services (default
 * 409; pass 404 for not-found). Defined locally so this module doesn't pull in
 * the heavy users.service dependency graph — the route matches on `statusCode`.
 */
export class ApiKeyServiceError extends Error {
  constructor(message: string, public statusCode = 409) {
    super(message);
    this.name = "ApiKeyServiceError";
  }
}

/**
 * Safe, client-facing shape of an API key. Note the deliberate ABSENCE of
 * `keyHash` — the hash is a server-only secret and must never leave the DB.
 */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  status: "active" | "revoked";
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdByUserId: string | null;
  createdByName: string | null;
}

/** Returned only from createApiKey — carries the raw secret ONE time. */
export interface CreatedApiKey {
  apiKey: ApiKeyView;
  /** The raw secret. Shown once to the user, never persisted, never re-returned. */
  rawKey: string;
}

/** Columns selected for list/read. Intentionally excludes keyHash. */
const VIEW_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastFour: true,
  isActive: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdByUserId: true,
} as const;

type ViewRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdByUserId: string | null;
};

function toView(row: ViewRow, createdByName: string | null): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastFour: row.lastFour,
    status: row.isActive ? "active" : "revoked",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdByUserId: row.createdByUserId,
    createdByName,
  };
}

/** Resolve "First Last" display names for a set of user ids (best-effort). */
async function resolveNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.id,
    ]),
  );
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listApiKeys(orgId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.crmApiKey.findMany({
    where: { orgId },
    select: VIEW_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const names = await resolveNames(
    rows.map((r) => r.createdByUserId).filter((x): x is string => !!x),
  );
  return rows.map((r) => toView(r, r.createdByUserId ? names.get(r.createdByUserId) ?? null : null));
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createApiKey(opts: {
  actor: SessionUser;
  data: { name: string };
}): Promise<CreatedApiKey> {
  const { actor, data } = opts;
  const name = data.name.trim();

  // Prevent duplicate names within an org (case-insensitive) — keeps the list
  // readable and avoids two keys the admin can't tell apart.
  const dupe = await prisma.crmApiKey.findFirst({
    where: { orgId: actor.orgId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dupe) throw new ApiKeyServiceError(`An API key named "${name}" already exists`);

  const { rawKey, keyHash, prefix, lastFour } = generateApiKey();

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.crmApiKey.create({
      data: {
        orgId: actor.orgId,
        name,
        keyHash,
        prefix,
        lastFour,
        isActive: true,
        createdByUserId: actor.userId,
      },
      select: VIEW_SELECT,
    });

    // Audit the creation. NEVER record the raw key or the hash in the audit log.
    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "create",
        resourceId: row.id,
        after: { name: row.name, prefix: row.prefix, lastFour: row.lastFour },
      },
      tx,
    );
    return row;
  });

  const createdByName = (await resolveNames([actor.userId])).get(actor.userId) ?? null;
  return { apiKey: toView(created, createdByName), rawKey };
}

// ─── Revoke / Activate ────────────────────────────────────────────────────────

export async function setApiKeyActive(opts: {
  actor: SessionUser;
  id: string;
  active: boolean;
}): Promise<ApiKeyView> {
  const { actor, id, active } = opts;

  return prisma.$transaction(async (tx) => {
    const before = await tx.crmApiKey.findFirst({
      where: { id, orgId: actor.orgId },
      select: VIEW_SELECT,
    });
    if (!before) throw new ApiKeyServiceError("API key not found", 404);

    // No-op guard keeps audit noise down and gives a clear error.
    if (before.isActive === active) {
      throw new ApiKeyServiceError(
        active ? "API key is already active" : "API key is already revoked",
      );
    }

    const updated = await tx.crmApiKey.update({
      where: { id },
      data: {
        isActive: active,
        // Set revokedAt when revoking; clear it when reactivating.
        revokedAt: active ? null : new Date(),
      },
      select: VIEW_SELECT,
    });

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: active ? "activate" : "revoke",
        resourceId: id,
        before: { status: before.isActive ? "active" : "revoked" },
        after: { status: updated.isActive ? "active" : "revoked" },
      },
      tx,
    );

    const createdByName = updated.createdByUserId
      ? (await resolveNames([updated.createdByUserId])).get(updated.createdByUserId) ?? null
      : null;
    return toView(updated, createdByName);
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteApiKey(opts: {
  actor: SessionUser;
  id: string;
}): Promise<void> {
  const { actor, id } = opts;

  await prisma.$transaction(async (tx) => {
    const target = await tx.crmApiKey.findFirst({
      where: { id, orgId: actor.orgId },
      select: VIEW_SELECT,
    });
    if (!target) throw new ApiKeyServiceError("API key not found", 404);

    await tx.crmApiKey.delete({ where: { id } });

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "delete",
        resourceId: id,
        before: { name: target.name, prefix: target.prefix, lastFour: target.lastFour },
      },
      tx,
    );
  });
}
