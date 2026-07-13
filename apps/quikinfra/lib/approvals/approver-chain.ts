/**
 * Role-based approver chain resolver.
 *
 * Given a request context (requester, project, module) this returns the
 * escalation chain of users who can approve, in order:
 *
 *   Level 1 — SITE_ADMIN assigned to the requester's project (if any)
 *   Level 2 — HO_USER with access to the module (cross-project)
 *   Level 3 — ADMIN (org-wide)
 *
 * If a level has no candidate (e.g. no site admin is assigned to that
 * project), it's skipped and the next level is considered. The chain is
 * never empty for a healthy org — there's always at least one ADMIN.
 *
 * Step H: sources roles from `CnUserAppRole + CnAppRole` and project
 * scope from `CnUserProjectAccess`. The legacy `cn_users` reads have
 * been removed.
 */

import { db as dbCentral } from "@quikit/database";

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
  orgId: string;
  /** User id of the person raising the request — excluded from the chain. */
  requesterId?: string;
  /** Project the request is tied to. Used to find the assigned SITE_ADMIN. */
  projectId?: string;
  /**
   * Module key (e.g. "purchase", "store"). Currently advisory only —
   * the lookup returns every HO_USER in the org. The downstream UI
   * can further filter by per-user module permissions if needed.
   */
  module?: string;
}

function roleNameToUserType(name: string): string {
  switch (name.toLowerCase()) {
    case "admin": return "ADMIN";
    case "ho_user": return "HO_USER";
    case "site_admin": return "SITE_ADMIN";
    default: return "USER";
  }
}

/**
 * Find every user in this org assigned to a role with the given name.
 * Optionally narrows by a `projectId` whitelist via CnUserProjectAccess.
 */
async function findUsersByRoleName(
  orgId: string,
  roleName: string,
  opts: { projectId?: string } = {},
): Promise<ApproverUser[]> {
  // Get every UserAppRole row for this (orgId, roleName).
  const userAppRoles = (await dbCentral.cnUserAppRole.findMany({
    where: {
      orgId,
      role: { name: roleName },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  })) as Array<{
    userId: string;
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;

  let candidateIds = userAppRoles
    .filter((r): r is typeof r & { user: NonNullable<typeof r.user> } => !!r.user)
    .map((r) => r.userId);

  // Site-admin lookup is project-scoped: only those with project access
  // to the requester's project qualify.
  if (opts.projectId && candidateIds.length > 0) {
    const access = (await dbCentral.cnUserProjectAccess.findMany({
      where: {
        orgId,
        userId: { in: candidateIds },
        projectId: opts.projectId,
      },
      select: { userId: true },
    })) as Array<{ userId: string }>;
    const scoped = new Set(access.map((a) => a.userId));
    candidateIds = candidateIds.filter((id) => scoped.has(id));
  }

  // Filter to only ACTIVE OrgMembers — inactive accounts can't approve.
  const memberships = candidateIds.length === 0
    ? []
    : (await dbCentral.orgMember.findMany({
        where: {
          orgId,
          userId: { in: candidateIds },
          status: "active",
        },
        select: { userId: true },
      })) as Array<{ userId: string }>;
  const activeIds = new Set(memberships.map((m) => m.userId));

  // Hydrate profile data (department, mobile) from User_profiles.
  const profiles = candidateIds.length === 0
    ? []
    : (await dbCentral.cnUserProfile.findMany({
        where: { orgId, userId: { in: candidateIds } },
        select: {
          userId: true,
          department: true,
          mobile: true,
        },
      })) as Array<{
        userId: string;
        department: string | null;
        mobile: string | null;
      }>;
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

  const userType = roleNameToUserType(roleName);

  return userAppRoles
    .filter((r) => r.user && activeIds.has(r.userId))
    .filter((r) => candidateIds.includes(r.userId)) // re-apply post-project-filter
    .map((r) => {
      const u = r.user!;
      const p = profileByUser.get(r.userId);
      const fullName =
        `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
        u.email.split("@")[0] ||
        "Unknown";
      return {
        id: u.id,
        fullName,
        email: u.email,
        mobile: p?.mobile ?? null,
        department: p?.department ?? null,
        userType,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Returns the escalation chain for the given context. Levels with zero
 * candidates are omitted from the response so callers can iterate the
 * result directly without empty-check logic.
 */
export async function resolveApproverChain(
  opts: ResolveApproverChainOptions,
): Promise<ApproverLevel[]> {
  const { orgId, requesterId, projectId } = opts;
  if (!orgId) return [];

  const [siteAdmins, hoUsers, admins] = await Promise.all([
    projectId
      ? findUsersByRoleName(orgId, "site_admin", { projectId })
      : Promise.resolve([] as ApproverUser[]),
    findUsersByRoleName(orgId, "ho_user"),
    findUsersByRoleName(orgId, "admin"),
  ]);

  const excluded = new Set<string>();
  if (requesterId) excluded.add(requesterId);

  function pickLevel(
    rows: ApproverUser[],
    level: number,
    label: string,
  ): ApproverLevel | null {
    const fresh = rows.filter((u) => !excluded.has(u.id));
    if (fresh.length === 0) return null;
    for (const u of fresh) excluded.add(u.id);
    return { level, label, candidates: fresh };
  }

  const out: ApproverLevel[] = [];
  const l1 = pickLevel(siteAdmins, 1, "Site Admin");
  if (l1) out.push(l1);
  const l2 = pickLevel(hoUsers, 2, "HO User");
  if (l2) out.push(l2);
  const l3 = pickLevel(admins, 3, "Admin");
  if (l3) out.push(l3);
  return out;
}

/**
 * Returns just the first eligible approver (level 1 if present, else
 * level 2, else level 3). Used by routes that need a single suggested
 * approver — e.g. the "auto-route to next approver" affordance in the
 * approval inbox.
 */
export async function resolveNextApprover(
  opts: ResolveApproverChainOptions,
): Promise<ApproverUser | null> {
  const chain = await resolveApproverChain(opts);
  for (const level of chain) {
    if (level.candidates.length > 0) return level.candidates[0] ?? null;
  }
  return null;
}
