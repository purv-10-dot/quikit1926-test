/**
 * User repository — Prisma-backed CRUD for `users`.
 *
 * Call sites:
 *   - POST /api/settings/users      (invite)
 *   - GET  /api/settings/users      (list)
 *   - NextAuth.authorize()           (login lookup)
 *
 * All queries are tenant-scoped. The login lookup is a special case —
 * it only has an email to go on, no tenant context yet — so it uses a
 * plain `findFirst({ email })` rather than the composite unique key.
 */

import { db } from "@/lib/db/prisma";
import { Prisma } from "../../../node_modules/.prisma-qc/client";

/**
 * Detect at module load time whether the generated Prisma client knows
 * about the `mobile` / `permissionMatrix` fields on CnUser. When a dev
 * adds a new column to schema.prisma but hasn't run `npx prisma generate`
 * yet, the field is in the schema file but not in the compiled client —
 * and queries that select it fail with `PrismaClientValidationError`.
 *
 * We introspect Prisma's dmmf (data model meta-format) once, up-front, so
 * the hot-path queries can skip the doomed select entirely instead of
 * throwing and retrying on every request. This also stops the prisma:error
 * log firing for a known-and-handled condition.
 */
const USER_FIELDS = (() => {
  try {
    const model = Prisma.dmmf.datamodel.models.find((m: any) => m.name === "CnUser");
    return new Set<string>((model?.fields ?? []).map((f: any) => String(f.name)));
  } catch {
    return new Set<string>();
  }
})();
const CLIENT_HAS_MOBILE = USER_FIELDS.has("mobile");
const CLIENT_HAS_PERMISSION_MATRIX = USER_FIELDS.has("permissionMatrix");

if (!CLIENT_HAS_MOBILE || !CLIENT_HAS_PERMISSION_MATRIX) {
  const missing = [
    CLIENT_HAS_MOBILE ? null : "mobile",
    CLIENT_HAS_PERMISSION_MATRIX ? null : "permissionMatrix",
  ].filter(Boolean).join(", ");
  console.warn(
    `[users.repository] Prisma client is missing field(s): ${missing}. ` +
    `Run \`npx prisma generate\` after stopping the dev server. ` +
    `The app will keep working without these fields until then.`,
  );
}

export interface UserRecord {
  id: string;
  tenantId: string;
  orgId: string;
  email: string;
  username: string;
  fullName: string;
  mobile: string | null;
  department: string | null;
  userType: string;
  roleKey: string;
  modulesAssigned: string[];
  projectsAssigned: string[];
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  inviteToken: string | null;
  inviteTokenExpires: string | null;
  invitedAt: string;
  invitedByName: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Per-menu Add/Edit/Delete/View matrix. Stored as JSON on the user row.
   * Shape: { [menuKey: string]: { add, edit, delete, view: boolean } }.
   * Null until the admin visits the Permissions page and hits Save.
   */
  permissionMatrix: Record<string, Record<string, boolean>> | null;
}

// The Prisma rows carry Date objects and BigInt primitives; flatten them
// to plain strings / scalars so the repository returns plain JSON and
// the API handlers don't have to serialise types defensively.
function toUserRecord(row: any): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
    email: row.email,
    username: row.username,
    fullName: row.fullName,
    mobile: row.mobile ?? null,
    department: row.department ?? null,
    userType: row.userType,
    roleKey: row.roleKey,
    modulesAssigned: row.modulesAssigned ?? [],
    projectsAssigned: row.projectsAssigned ?? [],
    status: row.status,
    mustChangePassword: !!row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    inviteToken: row.inviteToken ?? null,
    inviteTokenExpires: row.inviteTokenExpires
      ? row.inviteTokenExpires.toISOString()
      : null,
    invitedAt: row.invitedAt?.toISOString?.() ?? String(row.invitedAt ?? ""),
    invitedByName: row.invitedByName ?? null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt ?? ""),
    updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt ?? ""),
    permissionMatrix: (row.permissionMatrix as Record<string, Record<string, boolean>> | null) ?? null,
  };
}

// Same as `toUserRecord` but also returns the passwordHash. Only the
// login / password-reset paths should ever see the hash.
export interface UserRecordWithHash extends UserRecord {
  passwordHash: string;
}
function toUserRecordWithHash(row: any): UserRecordWithHash {
  return { ...toUserRecord(row), passwordHash: row.passwordHash };
}

// ─── Query ──────────────────────────────────────────────────────────

// Explicit column list for list/login queries. We intentionally DO NOT
// select `permissionMatrix` here because that column was added in a later
// migration that may not yet be applied on every dev/prod DB. Omitting it
// means the queries keep working on pre-migration DBs — only the per-user
// matrix read/write paths (`findUserById`, `updateUser`) hit the new column,
// and those are wrapped in try/catch so a missing column gracefully
// degrades to "no saved matrix" instead of 500-ing the whole list page.
// Build the select at module load, conditionally including `mobile`.
// If the generated Prisma client doesn't know about the field yet, we
// skip it entirely rather than attempting and recovering — the attempt
// would produce a prisma:error log on every request and be noisy.
const USER_BASE_SELECT: Record<string, boolean> = {
  id: true, tenantId: true, orgId: true,
  email: true, username: true, fullName: true, department: true,
  userType: true, roleKey: true,
  modulesAssigned: true, projectsAssigned: true,
  status: true, mustChangePassword: true, lastLoginAt: true,
  inviteToken: true, inviteTokenExpires: true,
  invitedAt: true, invitedByName: true, acceptedAt: true,
  createdAt: true, updatedAt: true,
};
if (CLIENT_HAS_MOBILE) USER_BASE_SELECT.mobile = true;

// Select variant without `mobile` — used as an extra-safe fallback when
// even the conditional select fails (e.g. column physically missing in
// the DB even though the client knows about it).
const USER_BASE_SELECT_NO_MOBILE: Record<string, boolean> = { ...USER_BASE_SELECT };
delete USER_BASE_SELECT_NO_MOBILE.mobile;

const USER_BASE_SELECT_WITH_HASH: Record<string, boolean> = {
  ...USER_BASE_SELECT,
  passwordHash: true,
};

const USER_BASE_SELECT_WITH_HASH_NO_MOBILE: Record<string, boolean> = {
  ...USER_BASE_SELECT_NO_MOBILE,
  passwordHash: true,
};

/**
 * Detect whether a Prisma error is "mobile column / field doesn't exist" —
 * either at the DB layer (P2022: column not in table) or at the generated
 * Prisma client layer (PrismaClientValidationError: client wasn't
 * regenerated after the schema change). Both are resolved the same way:
 * retry without the `mobile` field.
 */
function isMobileFieldMissing(err: any): boolean {
  if (!err) return false;
  if (err.code === "P2022" && String(err.meta?.column ?? "").includes("mobile")) return true;
  const msg = String(err.message ?? "");
  // PrismaClientValidationError emits messages like:
  //   "Unknown field `mobile` for select statement on model `CnUser`"
  //   "Unknown argument `mobile`"
  if (msg.includes("`mobile`")) return true;
  return false;
}

function isPermissionMatrixFieldMissing(err: any): boolean {
  if (!err) return false;
  if (err.code === "P2022" && String(err.meta?.column ?? "").includes("permissionMatrix")) return true;
  const msg = String(err.message ?? "");
  if (msg.includes("`permissionMatrix`")) return true;
  return false;
}

/**
 * Run a cnUser query with USER_BASE_SELECT, retrying without the `mobile`
 * column if it doesn't exist on this DB (P2022) or isn't known to the
 * generated Prisma client yet (PrismaClientValidationError). Centralised
 * so every query site gets the same graceful degradation until the
 * schema change has been both migrated AND regenerated.
 */
async function withMobileFallback<T>(
  run: (select: Record<string, unknown>) => Promise<T>,
  includeHash = false,
): Promise<T> {
  const primary = includeHash ? USER_BASE_SELECT_WITH_HASH : USER_BASE_SELECT;
  const fallback = includeHash ? USER_BASE_SELECT_WITH_HASH_NO_MOBILE : USER_BASE_SELECT_NO_MOBILE;
  try {
    return await run(primary as Record<string, unknown>);
  } catch (err: any) {
    if (isMobileFieldMissing(err)) {
      return await run(fallback as Record<string, unknown>);
    }
    throw err;
  }
}

export async function listUsers(tenantId: string, search = ""): Promise<UserRecord[]> {
  const q = search.toLowerCase();
  const rows = await withMobileFallback((select) =>
    (db as any).cnUser.findMany({
      where: {
        tenantId,
        status: { not: "inactive" },
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
                { fullName: { contains: q, mode: "insensitive" } },
                { department: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select,
    }),
  );
  return (rows as any[]).map(toUserRecord);
}

export async function findByTenantAndEmail(
  tenantId: string,
  email: string
): Promise<UserRecord | null> {
  const row = await withMobileFallback((select) =>
    (db as any).cnUser.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
      select,
    }),
  );
  return row ? toUserRecord(row) : null;
}

export async function findByTenantAndUsername(
  tenantId: string,
  username: string
): Promise<UserRecord | null> {
  const row = await withMobileFallback((select) =>
    (db as any).cnUser.findUnique({
      where: { tenantId_username: { tenantId, username } },
      select,
    }),
  );
  return row ? toUserRecord(row) : null;
}

/**
 * Lookup by primary key, tenant-scoped. Used by the individual-user
 * API route and the per-user permissions page. Tries to fetch
 * `permissionMatrix`; if the column is missing on a stale DB, falls back
 * to the base select and leaves the matrix null.
 */
export async function findUserById(
  tenantId: string,
  userId: string,
): Promise<UserRecord | null> {
  // Try full select (includes mobile + permissionMatrix). Both are optional
  // columns/fields that may be absent on pre-migration DBs or outdated
  // Prisma clients. Fall back progressively.
  try {
    const row = await (db as any).cnUser.findFirst({
      where: { id: userId, tenantId },
      select: { ...USER_BASE_SELECT, permissionMatrix: true },
    });
    return row ? toUserRecord(row) : null;
  } catch (err: any) {
    if (!isMobileFieldMissing(err) && !isPermissionMatrixFieldMissing(err)) throw err;
  }
  // Retry without permissionMatrix (possibly still with mobile)
  try {
    const row = await withMobileFallback((select) =>
      (db as any).cnUser.findFirst({ where: { id: userId, tenantId }, select }),
    );
    return row ? toUserRecord(row) : null;
  } catch (err: any) {
    if (!isMobileFieldMissing(err)) throw err;
  }
  // Final fallback: base select minus mobile AND permissionMatrix.
  const row = await (db as any).cnUser.findFirst({
    where: { id: userId, tenantId },
    select: USER_BASE_SELECT_NO_MOBILE,
  });
  return row ? toUserRecord(row) : null;
}

/**
 * Login lookup — called from NextAuth.authorize() which doesn't have
 * tenant context. Matches by email alone, case-insensitively, and
 * returns the row INCLUDING passwordHash so the caller can verify it.
 */
export async function findByEmailForLogin(
  email: string
): Promise<UserRecordWithHash | null> {
  const row = await withMobileFallback(
    (select) =>
      (db as any).cnUser.findFirst({
        where: {
          email: { equals: email.toLowerCase(), mode: "insensitive" },
          status: "active",
        },
        select,
      }),
    true, // includeHash
  );
  return row ? toUserRecordWithHash(row) : null;
}

// ─── Mutate ─────────────────────────────────────────────────────────

export interface CreateUserInput {
  tenantId: string;
  orgId: string;
  email: string;
  username: string;
  fullName: string;
  mobile?: string;
  department?: string;
  userType: string;
  roleKey: string;
  passwordHash: string;
  modulesAssigned?: string[];
  projectsAssigned?: string[];
  inviteToken?: string;
  inviteTokenExpires?: Date;
  invitedBy?: string;
  invitedByName?: string;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const baseData: Record<string, unknown> = {
    tenantId: input.tenantId,
    orgId: input.orgId,
    email: input.email.toLowerCase(),
    username: input.username,
    fullName: input.fullName,
    department: input.department ?? null,
    userType: input.userType,
    roleKey: input.roleKey,
    passwordHash: input.passwordHash,
    modulesAssigned: input.modulesAssigned ?? [],
    projectsAssigned: input.projectsAssigned ?? [],
    status: "active",
    mustChangePassword: true,
    inviteToken: input.inviteToken ?? null,
    inviteTokenExpires: input.inviteTokenExpires ?? null,
    invitedAt: new Date(),
    invitedBy: input.invitedBy ?? null,
    invitedByName: input.invitedByName ?? null,
    acceptedAt: null,
    createdBy: input.invitedBy ?? null,
    updatedBy: input.invitedBy ?? null,
  };
  // Include mobile only when provided AND the generated Prisma client
  // knows about the field. Otherwise skip it up-front — we can't save it
  // until `npx prisma generate` is run.
  const dataWithMobile =
    input.mobile && CLIENT_HAS_MOBILE ? { ...baseData, mobile: input.mobile } : baseData;
  try {
    const row = await (db as any).cnUser.create({
      data: dataWithMobile,
      select: USER_BASE_SELECT,
    });
    return toUserRecord(row);
  } catch (err: any) {
    if (isMobileFieldMissing(err)) {
      const row = await (db as any).cnUser.create({
        data: baseData,
        select: USER_BASE_SELECT_NO_MOBILE,
      });
      return toUserRecord(row);
    }
    throw err;
  }
}

/**
 * Patch-style update. Only the keys in `patch` are written. Any field
 * passed as `undefined` is ignored so callers don't wipe values by omission.
 * Immutable fields (id, tenantId, orgId, email, username, passwordHash,
 * createdAt, createdBy) must be stripped by the caller before passing in.
 */
export interface UpdateUserInput {
  fullName?: string;
  mobile?: string | null;
  department?: string | null;
  userType?: string;
  roleKey?: string;
  modulesAssigned?: string[];
  projectsAssigned?: string[];
  status?: string;
  mustChangePassword?: boolean;
  permissionMatrix?: Record<string, Record<string, boolean>> | null;
  updatedBy?: string | null;
}

export async function updateUser(
  tenantId: string,
  userId: string,
  patch: UpdateUserInput,
): Promise<UserRecord | null> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) data[k] = v;
  }
  // Strip fields that the generated Prisma client doesn't know about yet.
  // `npx prisma generate` fixes this — until then we silently drop them
  // so the rest of the update still goes through.
  if (!CLIENT_HAS_MOBILE) delete data.mobile;
  if (!CLIENT_HAS_PERMISSION_MATRIX) delete data.permissionMatrix;
  if (Object.keys(data).length === 0) {
    return findUserById(tenantId, userId);
  }
  // On pre-migration DBs, either `permissionMatrix` or `mobile` may not
  // exist. Retry without whichever column the error names.
  async function attempt(payload: Record<string, unknown>): Promise<number> {
    const res = await (db as any).cnUser.updateMany({
      where: { id: userId, tenantId },
      data: payload,
    });
    return res.count as number;
  }
  try {
    const count = await attempt(data);
    if (count === 0) return null;
  } catch (err: any) {
    // Two classes of missing-field error:
    //   (a) DB column missing (P2022) — add the column / run migration.
    //   (b) Prisma client outdated (PrismaClientValidationError) — run
    //       `npx prisma generate` so the client knows about the field.
    // Either way, strip the problematic field(s) and retry so other
    // edits still save.
    const missingMobile = isMobileFieldMissing(err);
    const missingMatrix = isPermissionMatrixFieldMissing(err);
    if (missingMobile || missingMatrix) {
      const retryData = { ...data };
      if (missingMobile) delete retryData.mobile;
      if (missingMatrix) delete retryData.permissionMatrix;
      console.warn(
        `[users.repository] Field missing on Prisma client / DB — ${
          missingMobile ? "mobile " : ""
        }${missingMatrix ? "permissionMatrix " : ""}— run \`npx prisma generate\` (and migrate if not done). Saving other fields only.`,
      );
      if (Object.keys(retryData).length === 0) return findUserById(tenantId, userId);
      const count = await attempt(retryData);
      if (count === 0) return null;
    } else {
      throw err;
    }
  }
  return findUserById(tenantId, userId);
}

/** Soft delete — flip status to "inactive" (rows are never hard-deleted). */
export async function softDeleteUser(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const res = await (db as any).cnUser.updateMany({
    where: { id: userId, tenantId },
    data: { status: "inactive", updatedAt: new Date() },
  });
  return res.count > 0;
}

/** Mark the last-login timestamp. Called from NextAuth's jwt callback. */
export async function touchLastLogin(userId: string): Promise<void> {
  try {
    await (db as any).cnUser.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    /* non-fatal — login should succeed even if the timestamp update fails */
  }
}
