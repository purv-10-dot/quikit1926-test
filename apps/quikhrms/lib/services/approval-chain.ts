import { prisma } from "@/lib/prisma";
import { expandDelegatedPermissions } from "@/lib/rbac/delegatable";

/**
 * Approval-chain execution helpers. Approvals are driven by the org's Approval
 * Chains (Settings → Approval Chains), NOT ad-hoc manager/random-employee
 * fallbacks. A flow (leave, expense, …) must NOT proceed unless an active chain
 * exists for its module.
 *
 * Multi-level, role-aware: a chain has ordered levels; each level is a ROLE
 * (anyone holding that role can action it) or a specific USER. A request is
 * routed level-by-level — level 1 must approve before level 2 becomes
 * actionable, and the final level's approval completes the request.
 */

export type ChainLevelCfg = {
  level: number;
  kind: "ROLE" | "USER";
  roleId?: string | null;
  userId?: string | null;
};

export type ResolvedLevel = ChainLevelCfg & { approverId: string };

type ChainFailure = { ok: false; reason: "NOT_CONFIGURED" | "UNRESOLVABLE"; message: string };

/** Raw (sorted) levels of the active chain for a module, or null if none. */
export async function getActiveChainLevels(orgId: string, module: string): Promise<ChainLevelCfg[] | null> {
  const chain = await prisma.approvalChain.findFirst({
    where: { orgId, deletedAt: null, isActive: true, module: module as never },
    orderBy: { createdAt: "desc" },
  });
  if (!chain) return null;
  const levels = (Array.isArray(chain.levels) ? chain.levels : []) as ChainLevelCfg[];
  return levels.slice().sort((a, b) => a.level - b.level);
}

/**
 * Resolve a representative active-employee approverId for a level.
 * By default the applicant is excluded (no self-approval). When `allowSelf` is
 * true, the applicant themselves is preferred if they hold the level's role —
 * used for Requisition so an admin can approve a requisition they raised.
 */
async function resolveLevelApprover(
  orgId: string, level: ChainLevelCfg, applicantId?: string | null, allowSelf = false,
): Promise<string | null> {
  if (level.kind === "USER" && level.userId) {
    const u = await prisma.employee.findFirst({
      where: { id: level.userId, orgId, deletedAt: null, status: "Active" },
      select: { id: true },
    });
    return u?.id ?? null;
  }
  if (level.kind === "ROLE" && level.roleId) {
    // Self-approval allowed: assign the applicant if they hold this role.
    if (allowSelf && applicantId) {
      const self = await prisma.employee.findFirst({
        where: { id: applicantId, orgId, deletedAt: null, status: "Active", appRoles: { some: { roleId: level.roleId } } },
        select: { id: true },
      });
      if (self) return self.id;
    }
    const e = await prisma.employee.findFirst({
      where: {
        orgId, deletedAt: null, status: "Active",
        ...(!allowSelf && applicantId ? { id: { not: applicantId } } : {}),
        appRoles: { some: { roleId: level.roleId } },
      },
      select: { id: true },
    });
    return e?.id ?? null;
  }
  return null;
}

/**
 * Resolve every level of the active chain into a concrete approver. Used at
 * apply time to seed one approval row per level. Blocks (ok:false) when no
 * chain is configured or a level has no resolvable approver.
 */
export async function resolveApprovalChainLevels(
  orgId: string,
  module: string,
  applicantId?: string | null,
  allowSelf = false,
): Promise<{ ok: true; chainId: string; levels: ResolvedLevel[] } | ChainFailure> {
  const chain = await prisma.approvalChain.findFirst({
    where: { orgId, deletedAt: null, isActive: true, module: module as never },
    orderBy: { createdAt: "desc" },
  });
  if (!chain) {
    return { ok: false, reason: "NOT_CONFIGURED", message: `No active approval chain is configured for ${module}. An admin must set one up in Settings → Approval Chains before this can be used.` };
  }
  const sorted = ((Array.isArray(chain.levels) ? chain.levels : []) as ChainLevelCfg[])
    .slice()
    .sort((a, b) => a.level - b.level);
  if (sorted.length === 0) {
    return { ok: false, reason: "UNRESOLVABLE", message: `The ${module} approval chain has no approval levels configured.` };
  }
  const resolved: ResolvedLevel[] = [];
  for (const lv of sorted) {
    const approverId = await resolveLevelApprover(orgId, lv, applicantId, allowSelf);
    if (!approverId) {
      return { ok: false, reason: "UNRESOLVABLE", message: `No active user found for level ${lv.level} of the ${module} approval chain. Contact HR to fix the chain.` };
    }
    resolved.push({ ...lv, approverId });
  }
  return { ok: true, chainId: chain.id, levels: resolved };
}

/** The AppRole ids an employee holds (for role-based level checks). */
export async function getCallerRoleIds(orgId: string, employeeId: string): Promise<string[]> {
  const rows = await prisma.hrmsUserAppRole.findMany({
    where: { orgId, userId: employeeId },
    select: { roleId: true },
  });
  return rows.map((r) => r.roleId);
}

/**
 * Can this caller action the given chain level? A ROLE level is actionable by
 * anyone holding that role; a USER level only by that user; and the specific
 * representative approver assigned at apply time is always allowed.
 */
export function callerCanActionLevel(
  level: ChainLevelCfg | undefined,
  caller: { employeeId: string; roleIds: string[] },
  assignedApproverId?: string,
): boolean {
  if (assignedApproverId && caller.employeeId === assignedApproverId) return true;
  if (!level) return false;
  if (level.kind === "USER" && level.userId) return caller.employeeId === level.userId;
  if (level.kind === "ROLE" && level.roleId) return caller.roleIds.includes(level.roleId);
  return false;
}

export type DelegatedApprover = { delegatorId: string; employeeId: string; roleIds: string[] };

/**
 * Approver identities a delegatee may stand in for on `approvePermission`, via
 * active delegations pointed at them that actually include that authority. Each
 * returned context is a delegator's own {employeeId, roleIds}, so passing it to
 * callerCanActionLevel lets the delegatee clear the level exactly as the
 * delegator could — no more, no less. Empty when the user holds no such
 * delegation (the overwhelmingly common case).
 */
export async function getDelegatedApprovers(
  orgId: string,
  delegateeId: string,
  approvePermission: string,
): Promise<DelegatedApprover[]> {
  const now = new Date();
  const dels = await prisma.delegation.findMany({
    where: {
      orgId,
      delegateeId,
      deletedAt: null,
      isActive: true,
      fromDate: { lte: now },
      OR: [{ toDate: null }, { toDate: { gte: now } }],
    },
    select: { delegatorId: true, modules: true },
  });
  const out: DelegatedApprover[] = [];
  for (const d of dels) {
    if (!expandDelegatedPermissions(d.modules).includes(approvePermission)) continue;
    const roleIds = await getCallerRoleIds(orgId, d.delegatorId);
    out.push({ delegatorId: d.delegatorId, employeeId: d.delegatorId, roleIds });
  }
  return out;
}

/**
 * True when the caller can action the level either in their own right OR by
 * standing in for one of the delegators who handed them this authority. Returns
 * the matching delegator id (or null) so callers can attribute an on-behalf
 * action in the audit trail.
 */
export function resolveLevelActor(
  level: ChainLevelCfg | undefined,
  caller: { employeeId: string; roleIds: string[] },
  delegated: DelegatedApprover[],
  assignedApproverId?: string,
): { canAction: boolean; onBehalfOf: string | null } {
  if (callerCanActionLevel(level, caller, assignedApproverId)) return { canAction: true, onBehalfOf: null };
  for (const d of delegated) {
    if (callerCanActionLevel(level, d, assignedApproverId)) return { canAction: true, onBehalfOf: d.delegatorId };
  }
  return { canAction: false, onBehalfOf: null };
}
