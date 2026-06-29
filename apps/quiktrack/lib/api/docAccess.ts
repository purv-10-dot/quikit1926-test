/**
 * Centralized document access resolver for QtDoc.
 *
 * A user's effective role on a doc is the MOST-PERMISSIVE of:
 *   1. Owner   — the doc's `createdBy` (or an org/app admin).
 *   2. Explicit per-user share (QtDocShare) — "editor" | "viewer".
 *   3. Project-level access (existing model) — Doc:update → editor,
 *      Doc:view → viewer. Applies to PUBLISHED docs only; drafts stay
 *      author-only unless explicitly shared / owned / admin.
 *
 * Public-link access (shareToken/shareMode) is handled by the unauthenticated
 * token route, not here — this resolver is for signed-in users.
 *
 * QtDocShare is queried via raw SQL: the generated Prisma client can be stale
 * on these models on Windows (DLL-lock on `prisma generate`), the same reason
 * the docs routes use raw SQL.
 */
import { db } from "@/lib/db";
import { hasAdminAccess } from "@/lib/api/permissions";
import { canDoc } from "@/lib/api/docPermissions";

export type DocRole = "owner" | "editor" | "viewer";

const RANK: Record<DocRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** The minimal doc shape the resolver needs. */
export interface DocForAccess {
  id: string;
  projectId: string;
  createdBy: string | null;
  status: string; // "draft" | "published"
}

/**
 * Most-permissive role from a set (pure — unit-testable without a DB).
 * Owner > Editor > Viewer; returns null when no role is present.
 */
export function mostPermissiveRole(
  roles: Array<DocRole | null | undefined>,
): DocRole | null {
  let best = 0;
  for (const r of roles) if (r && RANK[r] > best) best = RANK[r];
  return best === 3 ? "owner" : best === 2 ? "editor" : best === 1 ? "viewer" : null;
}

/** Can this role edit the doc's content? (owner or editor) */
export function canEditDocRole(role: DocRole | null): boolean {
  return role === "owner" || role === "editor";
}

/** Explicit per-user share role for a doc, or null. Raw SQL. */
export async function getDocShareRole(
  docId: string,
  userId: string,
): Promise<"editor" | "viewer" | null> {
  const rows = await db.$queryRaw<{ role: string }[]>`
    SELECT role FROM app_quiktrack."QtDocShare"
    WHERE "docId" = ${docId} AND "userId" = ${userId}
    LIMIT 1
  `;
  const r = rows[0]?.role;
  return r === "editor" || r === "viewer" ? r : null;
}

/**
 * Effective role for a signed-in user on a doc, or null when they have no
 * access at all.
 */
export async function resolveDocAccess(
  userId: string,
  orgId: string,
  doc: DocForAccess,
): Promise<DocRole | null> {
  // 1. Owner / admin → full control (works regardless of draft status).
  if (doc.createdBy && doc.createdBy === userId) return "owner";
  if (await hasAdminAccess(userId, orgId)) return "owner";

  const roles: Array<DocRole | null> = [];

  // 2. Explicit per-user share — intentional, so it grants access even for a
  //    draft, and independent of project membership (a doc shared to an org
  //    member who isn't in the project must still open). The unauthenticated
  //    surface is the /share/<token> route; this resolver only runs for a
  //    signed-in org member (withOrgAuth), so a share row here is trustworthy.
  roles.push(await getDocShareRole(doc.id, userId));

  // 3. Project-level baseline — published docs only (drafts are author-only).
  if (doc.status !== "draft") {
    if (await canDoc(userId, orgId, doc.projectId, "update")) roles.push("editor");
    else if (await canDoc(userId, orgId, doc.projectId, "view")) roles.push("viewer");
  }

  return mostPermissiveRole(roles);
}

/**
 * Only the owner (createdBy) or an org/app admin may manage sharing
 * (add/remove people, change roles, change general access).
 */
export async function canManageDocSharing(
  userId: string,
  orgId: string,
  doc: DocForAccess,
): Promise<boolean> {
  if (doc.createdBy && doc.createdBy === userId) return true;
  return hasAdminAccess(userId, orgId);
}
