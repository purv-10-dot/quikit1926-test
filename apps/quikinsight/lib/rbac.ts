// ─── RBAC ─────────────────────────────────────────────────────────────────────
//
// Static, DB-free authorization helpers. The permission map is the single source
// of truth for what each role can do; resolve a user's role from their session
// (see lib/auth.ts, which stamps `session.user.role` / `session.user.teamId`
// from the user_roles table) and check it here.

export type Role =
  | "SUPER_ADMIN"
  | "MANAGEMENT"
  | "TEAM_LEAD"
  | "MEMBER"
  | "VIEWER";

export type Permission =
  | "analytics.view_own_team"
  | "analytics.view_all_teams"
  | "account.connect"
  | "org.manage_roles";

// Plain static map — no DB lookups. Each role lists exactly the permissions it
// grants.
export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
    "org.manage_roles",
  ],
  MANAGEMENT: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
  ],
  TEAM_LEAD: [
    "analytics.view_own_team",
    "account.connect",
  ],
  MEMBER: [
    "analytics.view_own_team",
    "account.connect",
  ],
  VIEWER: [
    "analytics.view_own_team",
  ],
};

// Minimal shape of the session this module needs. Compatible with the NextAuth
// `Session` from lib/auth.ts (which exposes role/teamId under `session.user`).
export interface RbacSession {
  user?: {
    role?: Role | string | null;
    teamId?: string | null;
  } | null;
}

/** True if `role` grants `permission`. Unknown roles grant nothing. */
export function hasPermission(role: Role | string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
}

/** True if the role can see analytics across all teams (not just its own). */
export function canViewAllTeams(role: Role | string | null | undefined): boolean {
  return hasPermission(role, "analytics.view_all_teams");
}

/**
 * Team scoping filter for analytics queries.
 * - SUPER_ADMIN / MANAGEMENT (view_all_teams) → null, meaning "no filter, see everything".
 * - Everyone else → { teamId } scoped to their own team.
 *
 * Returns null when there's no session or no team to scope to (e.g. an
 * unassigned user), so callers should treat null as "no team-scoped access"
 * unless the role can view all teams — check that separately when it matters.
 */
export function getTeamFilter(session: RbacSession | null | undefined): { teamId: string } | null {
  const role = session?.user?.role;
  if (canViewAllTeams(role)) return null;

  const teamId = session?.user?.teamId;
  if (!teamId) return null;
  return { teamId };
}

/** True only for SUPER_ADMIN — the role that can manage org-wide roles. */
export function isOrgAdmin(role: Role | string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}
