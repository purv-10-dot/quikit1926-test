/**
 * Resolved-permissions reader for the AI Runtime (GET /api/internal/permissions).
 *
 * This is the LIST form of the permission model that `permissions.ts` answers
 * one (resource, action) at a time. It deliberately does NOT share code with
 * `userCan` / `userCanInProject`:
 *
 *   - Making `userCanInProject` delegate to a list builder would turn a
 *     2-query targeted check into a full permission-set load on ~45 hot call
 *     sites. Bad trade.
 *   - Drift is prevented by a test instead of by shared code:
 *     `__tests__/permissions/resolve-permissions-agreement.test.ts` runs this
 *     resolver and `userCanInProject` over the whole project-scoped registry
 *     cross-product in every resolution state and asserts they agree pairwise.
 *     If you change precedence here or there, that test goes red.
 *
 * The precedence implemented below mirrors `userCanInProject` exactly:
 *   1. hasAdminAccess            → bypasses everything          (admin_bypass)
 *   2. project role = Space Admin → full access in this space    (space_admin)
 *   3. project role present       → role grants ∪ per-user extras (project_role)
 *      — AUTHORITATIVE: the app-wide role is NOT consulted.
 *   4. no project role            → fall back to the app-wide answer (org_fallback)
 *
 * Two deliberate divergences from `userCanInProject`, both documented in the
 * endpoint contract:
 *
 *   a) SCOPE. The project answer covers project-scoped resources only.
 *      `APP_WIDE_ONLY_RESOURCES` (Home / Dashboard / Report / Team) are global
 *      sidebar destinations with no project context and are excluded from
 *      `PROJECT_PERMISSION_TREE`, so a project role can never grant them. The
 *      rule is "the project role is authoritative over project-scoped
 *      resources only" — an app-wide-only grant is answered by
 *      `orgPermissions`, and the response ships the split (see
 *      `appWideOnlyResources`) so the consumer never hardcodes it.
 *
 *   b) PROJECT VALIDITY. `userCanInProject` never checks that `projectId`
 *      belongs to `orgId` (QtProjectUserRole has no orgId column), so a
 *      cross-org or soft-deleted id falls through to the app-wide answer —
 *      fail-open. This resolver validates the project first and returns
 *      `project: null` instead. Tracked separately as a bug in the gate; not
 *      fixed here.
 */
import { db } from "@/lib/db";
import { hasAdminAccess, loadMyPermissions } from "@/lib/api/permissions";
import {
  ACTIONS,
  ALL_RESOURCES,
  APP_WIDE_ONLY_RESOURCES,
  isAppWideOnly,
  SPACE_ADMIN_ROLE_NAME,
} from "@/lib/api/permissionsRegistry";

/**
 * Which layer produced the project answer. An enum rather than two booleans
 * because only 4 of the (isSpaceAdmin × authoritative) combinations are
 * reachable and one of them is meaningless.
 *
 *   admin_bypass  — org-tier or app admin. `permissions` is OMITTED.
 *   space_admin   — Space Admin of this project: full access here, including
 *                   resources added later. `permissions` is OMITTED.
 *   project_role  — holds a project role here. `permissions` is the WHOLE
 *                   story for project-scoped resources; orgPermissions must
 *                   NOT be consulted for them.
 *   org_fallback  — no project role here, so the app-wide answer applies;
 *                   `permissions` restates it filtered to project scope.
 *
 * `permissions` is omitted — not empty — for the two bypass states, so an
 * empty array can never be misread as "denied everything".
 */
export type PermissionResolution =
  | "admin_bypass"
  | "space_admin"
  | "project_role"
  | "org_fallback";

export interface ResolvedProjectPermissions {
  /** The project's cuid, even when the caller passed a projectKey. */
  projectId: string;
  /**
   * Whether a QtProjectMember row exists for this user in this project.
   *
   * LOAD-BEARING, not decorative: reads are gated on membership, not on a
   * `view` grant (the registry has no `Issue:view` — issue visibility is
   * membership-based). `withProjectAccess` returns 404 to a non-member BEFORE
   * any permission check, so a permission list alone over-reports for
   * non-members.
   *
   * Reported literally (does the row exist), NOT smoothed for admins: the
   * wrapper's own admin bypass is narrower than `hasAdminAccess` (it checks
   * OrgMember.role === "admin" | "owner", not ADMIN_TIER_ROLES), so a v4
   * `org_admin` who is not a member gets `isAdmin: true` here and a 404 from
   * the route. That disagreement is fail-closed and is stated in the contract
   * rather than papered over.
   */
  isMember: boolean;
  resolution: PermissionResolution;
  /** Present for project_role / org_fallback; omitted for the bypass states. */
  permissions?: string[];
}

export interface ResolvedPermissions {
  /** `hasAdminAccess` — bypasses every check. Treat as "allow everything". */
  isAdmin: boolean;
  /**
   * `userCan`'s answer: role grants ∪ per-user extras, with NO admin bypass
   * (matching `userCan`, whose header states the admin flag does not bypass).
   * Literal, never expanded for admins — an enumerated set would go stale the
   * moment a resource is added.
   *
   * NOT sufficient for any decision about a specific project — see `project`.
   */
  orgPermissions: string[];
  /**
   * Resources that exist only at the app-wide level and are therefore never
   * present in a project answer. Shipped so the consumer reads the split from
   * the registry instead of hardcoding it and drifting.
   */
  appWideOnlyResources: string[];
  /**
   * Present only when a projectId was supplied. `null` when the project does
   * not exist, is soft-deleted, or belongs to another org — one indistinct
   * answer, so this endpoint is not a project-existence oracle.
   */
  project?: ResolvedProjectPermissions | null;
}

/**
 * Every `Resource:action` string the gates can actually enforce, derived from
 * the registry constants (never hand-written literals — §7 of the contract).
 *
 * The guard is `isResource(r) && isAction(a)`, the SAME predicate `userCan`
 * and `userCanInProject` apply to their input — deliberately not
 * `isValidPermissionPair`, which additionally requires the action to be listed
 * on the leaf. The gates do not check that, so a stored `Board:create` row
 * really does grant access; reporting it is honest, filtering it out would
 * under-report.
 *
 * Rows whose resource is no longer in the registry are dropped: `userCan`
 * returns false for them at its `isResource` guard, so a stale grant is
 * unenforceable and must not be reported as held.
 */
const ENFORCEABLE_KEYS: ReadonlySet<string> = (() => {
  const keys = new Set<string>();
  for (const resource of ALL_RESOURCES) {
    for (const action of ACTIONS) keys.add(`${resource}:${action}`);
  }
  return keys;
})();

/** Resource half of a `Resource:action` key. Registry resources contain no
 *  colon, so the first separator is the boundary. */
function resourceOf(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(0, i);
}

/** Drop stale/unenforceable strings, then sort for a deterministic response. */
function enforceable(keys: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    if (ENFORCEABLE_KEYS.has(key)) out.add(key);
  }
  return Array.from(out).sort();
}

/** Enforceable AND project-scoped — the project answer's vocabulary. */
function projectScoped(keys: Iterable<string>): string[] {
  return enforceable(keys).filter((key) => !isAppWideOnly(resourceOf(key)));
}

/**
 * Resolve a user's permissions in an org, and optionally within one project.
 *
 * A `userId` who is not a member of `orgId` resolves naturally to
 * `{ isAdmin: false, orgPermissions: [] }` — no membership probe, no error
 * that would distinguish "no such user" from "no permissions". This endpoint
 * answers questions about arbitrary user ids on presentation of one shared
 * secret; it must not become a membership oracle.
 *
 * @param projectRef a QtProject cuid OR its projectKey (the manifest's own
 *   input schemas accept either, and `withProjectAccess` resolves both).
 */
export async function resolvePermissions(
  userId: string,
  orgId: string,
  projectRef?: string | null,
): Promise<ResolvedPermissions> {
  const [isAdmin, my] = await Promise.all([
    hasAdminAccess(userId, orgId),
    loadMyPermissions(userId, orgId),
  ]);

  const base: ResolvedPermissions = {
    isAdmin,
    orgPermissions: enforceable(my.permissions),
    appWideOnlyResources: Array.from(APP_WIDE_ONLY_RESOURCES).sort(),
  };

  if (!projectRef) return base;

  // Org-scoped + not soft-deleted, exactly as withProjectAccess resolves it.
  const project = await db.qtProject.findFirst({
    where: {
      orgId,
      isDeleted: false,
      OR: [{ id: projectRef }, { projectKey: projectRef }],
    },
    select: { id: true },
  });
  if (!project) return { ...base, project: null };

  const projectId = project.id;
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  const isMember = !!member;

  // 1. Admin bypass — no list is meaningful.
  if (isAdmin) {
    return { ...base, project: { projectId, isMember, resolution: "admin_bypass" } };
  }

  const assignment = await db.qtProjectUserRole.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: {
      projectRoleId: true,
      projectRole: {
        select: { name: true, permissions: { select: { resource: true, action: true } } },
      },
    },
  });

  // 2. Space Admin — full access in this space, incl. resources added later.
  if (assignment?.projectRole.name === SPACE_ADMIN_ROLE_NAME) {
    return { ...base, project: { projectId, isMember, resolution: "space_admin" } };
  }

  // 3. Project role is authoritative: its grants plus the user's per-user
  //    extras, which stay additive inside a project (QtUserPermissionExtra is
  //    org-scoped — there is no project-scoped extra today).
  if (assignment) {
    const grants = assignment.projectRole.permissions.map(
      (p) => `${p.resource}:${p.action}`,
    );
    return {
      ...base,
      project: {
        projectId,
        isMember,
        resolution: "project_role",
        permissions: projectScoped([...grants, ...my.extras]),
      },
    };
  }

  // 4. No project role here — the app-wide answer applies.
  return {
    ...base,
    project: {
      projectId,
      isMember,
      resolution: "org_fallback",
      permissions: projectScoped(my.permissions),
    },
  };
}
