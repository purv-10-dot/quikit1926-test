/**
 * Parse the dashboard query string into a normalized {range, ownerId, tz}
 * tuple, plus produce the Prisma `where` fragments each domain query needs.
 */
import { parseAndClampRange, safeTz, type DateRange } from "./period";
import type { SessionUser } from "@/types/permission";
import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam } from "./team";
import { resolveTeamScope } from "@/lib/services/teams/team-scope";

export type DashboardFilters = {
  range: DateRange;
  ownerId: string | null;
  /** Resolved (`me` substituted) — what to send to Prisma. */
  resolvedOwnerId: string | null;
  tz: string;
};

const TZ_HEADER = "x-client-tz";
const TZ_COOKIE_NAME = "tz";

export function readTzFromHeaders(headers: Headers): string {
  const fromHeader = headers.get(TZ_HEADER);
  if (fromHeader) return safeTz(fromHeader);
  // Cookie fallback — set by client on first page load.
  const cookieHeader = headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === TZ_COOKIE_NAME && v) return safeTz(decodeURIComponent(v));
  }
  return safeTz(undefined);
}

export function parseFilters(req: Request, user: SessionUser): DashboardFilters {
  const url = new URL(req.url);
  const tz = readTzFromHeaders(req.headers);
  const range = parseAndClampRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    tz,
  );

  const rawOwner = url.searchParams.get("ownerId");
  const ownerId = rawOwner && rawOwner !== "all" && rawOwner !== "" ? rawOwner : null;
  const resolvedOwnerId = ownerId === "me" ? user.userId : ownerId;
  return { range, ownerId, resolvedOwnerId, tz };
}

/** Where fragment for `orgId` + optional ownerId on a model that has an
 * `ownerId` column (CrmLead, CrmOpportunity, CrmActivity-after-migration). */
export function tenantOwnerWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.ownerId = ownerId;
  return w;
}

/** CrmTask uses `assignedToUserId` instead of `ownerId`. */
export function tenantAssigneeWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.assignedToUserId = ownerId;
  return w;
}

/** CrmCallLog uses `agentUserId` instead of `ownerId`. */
export function tenantAgentWhere(
  user: SessionUser,
  ownerId: string | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = { orgId: user.orgId };
  if (ownerId) w.agentUserId = ownerId;
  return w;
}

// ───────────────────────────────────────────────────────────────────────────
// Role-aware dashboard scope (Path B RBAC).
//
// The plain tenant*Where helpers above scope by orgId (+ optional Owner
// dropdown) only. This resolver layers the SAME role/ACL model already applied
// by buildRoleMetrics (lib/services/dashboard/role-metrics.ts) and the module
// list routes — reusing accountScopeFilter / getScope / resolveManagerTeam /
// resolveTeamScope. No new permission logic is introduced.
//
// Scope by role (mirrors role-metrics exactly):
//   Administrator  → org-wide (no extra clause)
//   SalesManager   → leads/opps: accountScopeFilter; activity/task/call: team
//                    member ids; quotes: allowedAccountIds
//   SalesUser      → leads/opps: own (ownerId=self) + accountScopeFilter;
//                    activity/task/call: own; quotes: own
//   TeamManager    → leads/opps: accountScopeFilter; activity/task/call: team
//                    member ids; quotes: allowedAccountIds
//   Marketing/Finance/other → leads/opps: accountScopeFilter; activity/task/
//                    call: own; quotes: allowedAccountIds
//
// Each builder takes the resolved Owner-dropdown id and applies it as an
// ADDITIONAL narrowing inside the allowed scope (so it never widens access).
// ───────────────────────────────────────────────────────────────────────────

/** Resolved, request-scoped RBAC context shared by every Path-B query. */
export interface DashboardScope {
  /** Lead / Opportunity (models with an accountId + ownerId — accountScopeFilter). */
  recordWhere(ownerId: string | null): Record<string, unknown>;
  /** CrmAccount (the account itself — scoped on its `id`, not accountId). */
  accountWhere(ownerId: string | null): Record<string, unknown>;
  /** CrmActivity (ownerId). */
  activityWhere(ownerId: string | null): Record<string, unknown>;
  /** CrmTask (assignedToUserId). */
  taskWhere(ownerId: string | null): Record<string, unknown>;
  /** CrmCallLog (agentUserId). */
  callWhere(ownerId: string | null): Record<string, unknown>;
}

/** AND-merge a base where with an optional ACL fragment (skip when null). */
function withAcl(
  base: Record<string, unknown>,
  acl: Record<string, unknown> | null,
): Record<string, unknown> {
  return acl ? { AND: [base, acl] } : base;
}

/** Apply the Owner-dropdown id to a person-scoped where, intersecting (never widening). */
function applyOwnerColumn(
  where: Record<string, unknown>,
  column: string,
  ownerId: string | null,
  alreadyRestrictedTo: string | string[] | null,
): Record<string, unknown> {
  if (!ownerId) return where;
  // If the scope already restricts this column to a fixed set/self, the dropdown
  // can only narrow within it — and for a SalesUser it's already self, so a
  // foreign ownerId must yield nothing rather than widen. Intersect explicitly.
  if (alreadyRestrictedTo != null) {
    const allowed = Array.isArray(alreadyRestrictedTo)
      ? alreadyRestrictedTo
      : [alreadyRestrictedTo];
    return { ...where, [column]: allowed.includes(ownerId) ? ownerId : "__none__" };
  }
  return { ...where, [column]: ownerId };
}

export async function resolveDashboardScope(user: SessionUser): Promise<DashboardScope> {
  const { orgId, userId, role } = user;

  // Administrator → unrestricted. Keep org-only behavior (no extra clauses);
  // the Owner dropdown still narrows.
  if (role === "Administrator") {
    return {
      recordWhere: (ownerId) =>
        applyOwnerColumn({ orgId }, "ownerId", ownerId, null),
      accountWhere: (ownerId) =>
        applyOwnerColumn({ orgId }, "ownerId", ownerId, null),
      activityWhere: (ownerId) =>
        applyOwnerColumn({ orgId }, "ownerId", ownerId, null),
      taskWhere: (ownerId) =>
        applyOwnerColumn({ orgId }, "assignedToUserId", ownerId, null),
      callWhere: (ownerId) =>
        applyOwnerColumn({ orgId }, "agentUserId", ownerId, null),
    };
  }

  // Non-admin: resolve the same building blocks role-metrics uses.
  const [aclFilter, scope, managerTeam, teamScope] = await Promise.all([
    accountScopeFilter(user),
    getScope(user),
    resolveManagerTeam(user),
    resolveTeamScope(user),
  ]);
  // Account ids the user may see (for scoping the CrmAccount model on its `id`).
  const allowedAccountIds = scope.unrestricted ? null : scope.allowedAccountIds;

  // Person-scope member ids for activity/task/call:
  //   SalesManager → managed group members
  //   TeamManager  → team members
  //   else (SalesUser/Marketing/Finance) → self only
  const memberIds =
    role === "SalesManager"
      ? managerTeam?.memberIds ?? []
      : teamScope?.memberIds ?? [];
  // Allowed person set for the dropdown-intersection check. With no team this is
  // [self] (so a manager with no reports sees only their own activity/tasks/calls
  // — role-metrics parity), otherwise the member ids.
  const allowedPersons: string[] = memberIds.length > 0 ? memberIds : [userId];

  /** Base person-scoped clause for a given column (no dropdown applied yet). */
  function personBase(column: string): Record<string, unknown> {
    return {
      orgId,
      [column]: memberIds.length > 0 ? { in: memberIds } : userId,
    };
  }

  // SalesUser additionally restricts leads/opps to its own ownerId (role-metrics
  // parity). Managers/Marketing/Finance rely on accountScopeFilter alone.
  const recordOwnerSelf = role === "SalesUser";

  return {
    recordWhere: (ownerId) => {
      const base: Record<string, unknown> = { orgId };
      if (recordOwnerSelf) base.ownerId = userId;
      const scoped = withAcl(base, aclFilter);
      // Owner dropdown narrows within scope. For a SalesUser the column is
      // already self; intersect so a foreign ownerId returns nothing.
      return applyOwnerColumn(
        scoped,
        "ownerId",
        ownerId,
        recordOwnerSelf ? userId : null,
      );
    },
    accountWhere: (ownerId) => {
      // CrmAccount is scoped on its own `id` (allowedAccountIds) OR the account's
      // ownerId = self — mirroring getScope's account visibility. SalesUser also
      // narrows to accounts they own. The Owner dropdown narrows ownerId further.
      const base: Record<string, unknown> = { orgId };
      if (allowedAccountIds) {
        base.OR = [
          { id: { in: allowedAccountIds } },
          { ownerId: userId },
        ];
      }
      if (recordOwnerSelf) base.ownerId = userId;
      return applyOwnerColumn(base, "ownerId", ownerId, recordOwnerSelf ? userId : null);
    },
    activityWhere: (ownerId) =>
      applyOwnerColumn(personBase("ownerId"), "ownerId", ownerId, allowedPersons),
    taskWhere: (ownerId) =>
      applyOwnerColumn(personBase("assignedToUserId"), "assignedToUserId", ownerId, allowedPersons),
    callWhere: (ownerId) =>
      applyOwnerColumn(personBase("agentUserId"), "agentUserId", ownerId, allowedPersons),
  };
}
