// ─── RBAC ─────────────────────────────────────────────────────────────────────
//
// Static, DB-free authorization helpers. The permission map is the single source
// of truth for what each role can do; resolve a user's role from their session
// (see lib/auth.ts, which stamps `session.user.role` / `session.user.teamId`
// from the user_roles table) and check it here.

/**
 * QuikInsight ships exactly two assignable roles: `admin` and `viewer`.
 *
 * NAMES ARE LOWERCASE, matching the rest of the platform. @quikit/shared's
 * ROLES are lowercase (`super_admin`, `admin`, `member`), and every other app's
 * `AppRole` table stores lowercase — quikcrm has `admin`/`sales-user`, quikhrms
 * `admin`/`employee`, quikinfra `admin`/`site_admin`. QuikInsight was the only
 * app writing SCREAMING_CASE, which is why the Admin Portal's access panel
 * rendered a raw "ADMIN" / "VIEWER" next to every other app's "admin".
 *
 * The remaining names are LEGACY: rows already exist in `QiUserRole` carrying
 * them, and `hasPermission()` returns nothing for an unknown role — dropping
 * them from this map would silently strip access from those users. They stay
 * readable but are no longer offered for assignment.
 *
 * Role strings from the DB are normalised through `normalizeRole()` before any
 * lookup, so pre-existing uppercase rows keep working without a data migration.
 */
export type Role =
  | "admin"
  | "viewer"
  // Platform MEMBERSHIP_ROLES (OrgMember.role). These arrive on the session
  // from the central IdP, NOT from QuikInsight's own AppRole table, so they
  // must resolve here or an org admin coming in via SSO gets zero permissions.
  // See ADMIN_TIER_ROLES in @quikit/shared — org_admin is the current name for
  // the legacy "admin" tier, app_admin carries admin authority within its
  // scoped apps, member is the default.
  | "org_admin"
  | "app_admin"
  // Legacy QuikInsight names — existing QiUserRole rows still carry them.
  | "super_admin"
  | "management"
  | "team_lead"
  | "member";

export type Permission =
  | "analytics.view_own_team"
  | "analytics.view_all_teams"
  | "account.connect"
  | "org.manage_roles";

// Plain static map — no DB lookups. Each role lists exactly the permissions it
// grants.
export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  // ── Assignable ──
  admin: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
    "org.manage_roles",
  ],
  // Org-wide read. `analytics.view_all_teams` is deliberate: with only two
  // roles there is no team-lead tier, and getTeamFilter() returns null for a
  // user with no teamId — a team-scoped VIEWER would see an empty dashboard.
  viewer: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
  ],
  // ── Platform membership roles (from the IdP session) ──
  org_admin: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
    "org.manage_roles",
  ],
  app_admin: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
    "org.manage_roles",
  ],
  // ── Legacy, not offered for assignment ──
  super_admin: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
    "org.manage_roles",
  ],
  management: [
    "analytics.view_own_team",
    "analytics.view_all_teams",
    "account.connect",
  ],
  team_lead: [
    "analytics.view_own_team",
    "account.connect",
  ],
  member: [
    "analytics.view_own_team",
    "account.connect",
  ],
};

// Minimal shape of the session this module needs. Compatible with the NextAuth
// `Session` from lib/auth.ts (which exposes role/teamId under `session.user`).
export interface RbacSession {
  user?: {
    /** QuikInsight's own AppRole assignment, when the session carries one. */
    role?: Role | string | null;
    /**
     * Org-wide role stamped by the central IdP (OrgMember.role) — `super_admin`,
     * `org_admin`, `app_admin`, `member`. This is what an SSO session actually
     * carries; `role` above is often absent.
     */
    membershipRole?: string | null;
    teamId?: string | null;
  } | null;
}

/**
 * The role to authorize a request with.
 *
 * Reads the app-specific `role` first and falls back to the IdP's
 * `membershipRole`. The fallback is not cosmetic: the SSO session type has NO
 * `role` property, so every call site reading `session.user.role` alone was
 * evaluating `undefined` and silently denying permission to everyone —
 * including org admins. Always resolve through this helper.
 */
export function sessionRole(session: unknown): Role | null {
  // `unknown`, not RbacSession: withAuth attaches the session via
  // `Awaited<ReturnType<typeof getServerSession>>`, which erases to `unknown` at
  // several call sites. Taking `unknown` and narrowing here keeps every caller
  // honest without scattering casts through the routes.
  const user = (session as RbacSession | null | undefined)?.user;
  if (!user || typeof user !== "object") return null;
  return normalizeRole(user.role ?? user.membershipRole ?? null);
}

/**
 * Canonicalise a role string from any source.
 *
 * Rows written before the lowercase switch carry "ADMIN"/"VIEWER"/"SUPER_ADMIN",
 * and the Admin Portal may pass either. Lower-casing on READ means those users
 * keep their access with no data migration, and a single spelling reaches the
 * permission map.
 */
export function normalizeRole(role: string | null | undefined): Role | null {
  if (!role) return null;
  const key = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (key in PERMISSIONS ? key : null) as Role | null;
}

/** True if `role` grants `permission`. Unknown roles grant nothing. */
export function hasPermission(role: Role | string | null | undefined, permission: Permission): boolean {
  const key = normalizeRole(typeof role === "string" ? role : role ?? null);
  if (!key) return false;
  const perms = PERMISSIONS[key];
  return perms ? perms.includes(permission) : false;
}

/** True if the role can see analytics across all teams (not just its own). */
export function canViewAllTeams(role: Role | string | null | undefined): boolean {
  return hasPermission(role, "analytics.view_all_teams");
}

/**
 * Team scoping filter for analytics queries.
 * - Roles with view_all_teams (admin / viewer / legacy super_admin, management)
 *   → null, meaning "no filter, see everything".
 * - Everyone else → { teamId } scoped to their own team.
 *
 * Returns null when there's no session or no team to scope to (e.g. an
 * unassigned user), so callers should treat null as "no team-scoped access"
 * unless the role can view all teams — check that separately when it matters.
 */
export function getTeamFilter(session: unknown): { teamId: string } | null {
  // `unknown` for the same reason as sessionRole(): route handlers receive the
  // session through a type that erases to unknown. Narrow once, here, instead
  // of scattering casts through every caller.
  const role = sessionRole(session);
  if (canViewAllTeams(role)) return null;

  const teamId = (session as RbacSession | null | undefined)?.user?.teamId;
  if (!teamId) return null;
  return { teamId };
}

/**
 * True for the roles that can manage org-wide roles: `admin` (the assignable
 * one) and legacy `super_admin`. Derived from the permission map rather than a
 * name comparison so it cannot drift from PERMISSIONS.
 */
export function isOrgAdmin(role: Role | string | null | undefined): boolean {
  return hasPermission(role, "org.manage_roles");
}
