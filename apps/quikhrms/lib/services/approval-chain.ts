import { prisma } from "@/lib/prisma";

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
