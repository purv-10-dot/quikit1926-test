/**
 * Role-based approver chain resolver.
 *
 * Given a request context (requester, project, module) this returns the
 * escalation chain of users who can approve, in order:
 *
 *   Level 1 — SITE_ADMIN assigned to the requester's project (if any)
 *   Level 2 — HO_USER with access to the module (cross-project)
 *   Level 3 — ADMIN (tenant-wide)
 *
 * If a level has no candidate (e.g. no site admin is assigned to that
 * project), it's skipped and the next level is considered. The chain is
 * never empty for a healthy tenant — there's always at least one ADMIN.
 *
 * This is intentionally separate from the `CnApprovalWorkflow` step-based
 * engine (which encodes amount thresholds / sequential L1→L2→L3 routing).
 * Think of it as the "who are the people at each role level?" primitive —
 * the step engine decides HOW MANY levels are required; this resolver
 * decides WHICH USERS fill those levels for a given request.
 */

import { db } from "@/lib/db/prisma";
import { USER_TYPES } from "@/lib/rbac/user-types";

export interface ApproverUser {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  department: string | null;
  userType: string;
}

export interface ApproverLevel {
  /** 1 = site admin, 2 = ho user, 3 = admin. Lower = closer to the requester. */
  level: number;
  /** Human label used in UI: "Site Admin", "HO User", "Admin". */
  label: string;
  /** Every user at this level who could approve. UI typically picks the first. */
  candidates: ApproverUser[];
}

export interface ResolveApproverChainOptions {
  tenantId: string;
  /** User id of the person raising the request — excluded from the chain. */
  requesterId?: string;
  /** Project the request is tied to. Used to find the assigned SITE_ADMIN. */
  projectId?: string;
  /**
   * Module key (e.g. "purchase", "store"). When set, HO_USERs are filtered
   * to those with the module in their `modulesAssigned`. Pass `undefined`
   * to match any HO_USER.
   */
  module?: string;
}

// Keep this select narrow + consistent so the shape always matches ApproverUser.
const APPROVER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  mobile: true,
  department: true,
  userType: true,
} as const;

function mapApprover(row: any): ApproverUser {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    mobile: row.mobile ?? null,
    department: row.department ?? null,
    userType: row.userType,
  };
}

/**
 * Returns the escalation chain for the given context. Levels with zero
 * candidates are omitted from the response so callers can iterate the
 * result directly without empty-check logic.
 */
export async function resolveApproverChain(
  opts: ResolveApproverChainOptions,
): Promise<ApproverLevel[]> {
  const { tenantId, requesterId, projectId, module } = opts;
  if (!tenantId) return [];

  // Run all three lookups in parallel — each is an independent DB round-trip
  // but they share the same tenantId predicate so the scheduler can coalesce.
  const [siteAdmins, hoUsers, admins] = await Promise.all([
    projectId
      ? (db as any).cnUser.findMany({
          where: {
            tenantId,
            userType: USER_TYPES.SITE_ADMIN,
            status: "active",
            // `has` translates to a Postgres `@>` containment check.
            projectsAssigned: { has: projectId },
          },
          select: APPROVER_SELECT,
          orderBy: { fullName: "asc" },
        })
      : Promise.resolve([]),
    (db as any).cnUser.findMany({
      where: {
        tenantId,
        userType: USER_TYPES.HO_USER,
        status: "active",
        ...(module ? { modulesAssigned: { has: module } } : {}),
      },
      select: APPROVER_SELECT,
      orderBy: { fullName: "asc" },
    }),
    (db as any).cnUser.findMany({
      where: { tenantId, userType: USER_TYPES.ADMIN, status: "active" },
      select: APPROVER_SELECT,
      orderBy: { fullName: "asc" },
    }),
  ]);

  // Never route a request back to its own author — dedupe by id across levels
  // and drop the requester in case they happen to hold an approver role too.
  const excluded = new Set<string>();
  if (requesterId) excluded.add(requesterId);

  function pickLevel(rows: any[], level: number, label: string): ApproverLevel | null {
    const fresh = rows.map(mapApprover).filter((u) => !excluded.has(u.id));
    if (fresh.length === 0) return null;
    // Mark these users as already-used for lower levels so we don't list
    // the same person at both "HO User" and "Admin" if their role spans both.
    for (const u of fresh) excluded.add(u.id);
    return { level, label, candidates: fresh };
  }

  const chain: ApproverLevel[] = [];
  const l1 = pickLevel(siteAdmins as any[], 1, "Site Admin");
  if (l1) chain.push(l1);
  const l2 = pickLevel(hoUsers as any[], 2, "HO User");
  if (l2) chain.push(l2);
  const l3 = pickLevel(admins as any[], 3, "Admin");
  if (l3) chain.push(l3);

  return chain;
}

/**
 * Convenience wrapper that returns the FIRST approver (by level, then by
 * name) for a request — i.e. the person the PR should land with the
 * moment it's submitted. Used by the PR/indent/PO submit handlers.
 * Returns `null` only when the tenant has zero admins, which should
 * never happen in a seeded tenant.
 */
export async function resolveNextApprover(
  opts: ResolveApproverChainOptions,
): Promise<ApproverUser | null> {
  const chain = await resolveApproverChain(opts);
  for (const level of chain) {
    if (level.candidates.length > 0) return level.candidates[0];
  }
  return null;
}
