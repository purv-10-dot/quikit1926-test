/**
 * Permission matrix helpers for QuikCRM.
 *
 * Primary storage (QuikScale parity):
 *   app_quikcrm.UserAppRole + RolePermission + UserPermissionExtra
 *
 * Legacy field-level rules still read from QcePermissionTemplate when present.
 */
import { db } from "@/lib/db";
import { loadUserCrmGrants, isCrmRbacClientReady } from "@/lib/api/crm-rbac";
import { isCrmAction, isCrmModule } from "@/lib/api/permissions-registry";
import {
  ADMIN_ROLE,
  isAdminRole,
  roleBaselineMatrix,
} from "@/lib/auth/role-grants";
import { isRbacAuthoritative, rbacMode } from "@/lib/auth/rbac-mode";
import type {
  ModuleAction,
  ModulePermRow,
  PermissionMatrix,
  SessionUser,
} from "@/types/permission";

/** Administrator gets every module/action. */
function adminMatrix(): PermissionMatrix {
  return roleBaselineMatrix(ADMIN_ROLE);
}

function matrixFromTemplateLinks(
  links: { template: { matrix: unknown } }[],
): PermissionMatrix {
  const matrices = links
    .map((upt) => upt.template.matrix as unknown as PermissionMatrix)
    .filter((m): m is PermissionMatrix => Array.isArray(m));
  if (matrices.length === 0) return [];

  const byModule = new Map<string, ModulePermRow>();
  for (const matrix of matrices) {
    for (const row of matrix) {
      const existing = byModule.get(row.module);
      if (!existing) {
        byModule.set(row.module, {
          module: row.module,
          actions: [...new Set(row.actions)],
          hiddenFields: [...row.hiddenFields],
          restrictedFields: [...row.restrictedFields],
        });
        continue;
      }
      existing.actions = [...new Set([...existing.actions, ...row.actions])];
      existing.hiddenFields = existing.hiddenFields.filter((f) => row.hiddenFields.includes(f));
      existing.restrictedFields = existing.restrictedFields.filter((f) =>
        row.restrictedFields.includes(f),
      );
    }
  }
  return [...byModule.values()];
}

function matrixFromRbacGrants(
  grants: { resource: string; action: string }[],
): PermissionMatrix {
  const byModule = new Map<string, ModuleAction[]>();
  for (const { resource, action } of grants) {
    if (!isCrmModule(resource) || !isCrmAction(action)) continue;
    const actions = byModule.get(resource) ?? [];
    if (!actions.includes(action)) actions.push(action);
    byModule.set(resource, actions);
  }
  return [...byModule.entries()].map(([module, actions]) => ({
    module,
    actions,
    hiddenFields: [],
    restrictedFields: [],
  }));
}

function mergeMatrices(primary: PermissionMatrix, fieldRules: PermissionMatrix): PermissionMatrix {
  if (fieldRules.length === 0) return primary;
  if (primary.length === 0) return fieldRules;

  const byModule = new Map<string, ModulePermRow>();
  for (const row of primary) byModule.set(row.module, { ...row });

  for (const row of fieldRules) {
    const existing = byModule.get(row.module);
    if (!existing) {
      byModule.set(row.module, {
        module: row.module,
        actions: [],
        hiddenFields: [...row.hiddenFields],
        restrictedFields: [...row.restrictedFields],
      });
      continue;
    }
    existing.actions = [...new Set([...existing.actions, ...row.actions])];
    if (row.hiddenFields.length > 0) {
      existing.hiddenFields =
        existing.hiddenFields.length === 0
          ? [...row.hiddenFields]
          : existing.hiddenFields.filter((f) => row.hiddenFields.includes(f));
    }
    if (row.restrictedFields.length > 0) {
      existing.restrictedFields =
        existing.restrictedFields.length === 0
          ? [...row.restrictedFields]
          : existing.restrictedFields.filter((f) => row.restrictedFields.includes(f));
    }
  }
  return [...byModule.values()];
}

/**
 * Permission-template grants for a user, scoped to ONE org.
 *
 * The join table (QceUserPermissionTemplate) carries only (userId, templateId)
 * — it has no orgId column — so the scope has to come from the related
 * template, which does (`@@unique([orgId, name])`). Querying by userId alone
 * returned every org's templates for a multi-org user: they inherited org A's
 * module/action grants while acting inside org B, and because mergeMatrices
 * INTERSECTS hiddenFields/restrictedFields, a second org's template with fewer
 * hidden fields also stripped field masking.
 *
 * No orgId → return nothing rather than everything. The caller's baseline
 * still applies, and default-deny in assertModule is the intended failure mode.
 */
async function loadTemplateMatrix(
  userId: string,
  orgId?: string,
): Promise<PermissionMatrix> {
  if (!orgId) return [];
  const links = await db.qceUserPermissionTemplate.findMany({
    where: { userId, template: { orgId } },
    include: { template: true },
  });
  return matrixFromTemplateLinks(links);
}

/**
 * Every (module, action) pair present in `a` but missing from `b`, formatted as
 * `module:action`. Used only to describe shadow-mode drift.
 */
function missingPairs(a: PermissionMatrix, b: PermissionMatrix): string[] {
  const have = new Set(
    b.flatMap((row) => row.actions.map((action) => `${row.module}:${action}`)),
  );
  return a
    .flatMap((row) => row.actions.map((action) => `${row.module}:${action}`))
    .filter((pair) => !have.has(pair));
}

/**
 * Shadow-mode reporter: log how the authoritative matrix would differ from what
 * we are actually serving, so the drift can be reviewed before flipping
 * `CRMEXPRESS_RBAC_MODE=on`.
 *
 * Logs to stdout rather than a table on purpose — a persisted audit would need
 * a new model in `packages/database`, and this work stays inside the app. Grep
 * UAT logs for `[crm-rbac-shadow]`.
 */
function reportShadowDrift(
  userId: string,
  orgId: string | undefined,
  legacy: PermissionMatrix,
  authoritative: PermissionMatrix,
  unbound: boolean,
): void {
  const wouldLose = missingPairs(legacy, authoritative);
  const wouldGain = missingPairs(authoritative, legacy);
  if (!unbound && wouldLose.length === 0 && wouldGain.length === 0) return;

  console.warn(
    `[crm-rbac-shadow] user=${userId} org=${orgId ?? "none"}` +
      (unbound ? " unbound=true (no UserAppRole row — backfill needed)" : "") +
      (wouldLose.length > 0 ? ` wouldLose=${wouldLose.join(",")}` : "") +
      (wouldGain.length > 0 ? ` wouldGain=${wouldGain.join(",")}` : ""),
  );
}

/**
 * Effective permissions for sidebar + API gates.
 *
 * Two resolution models, selected by `CRMEXPRESS_RBAC_MODE` (see
 * `lib/auth/rbac-mode.ts`):
 *
 *   LEGACY (`shadow` / `off`) — all three layers unioned, all additive:
 *     1. role baseline        — in-code grants for the user's membership role
 *     2. DB role grants       — AppRole/RolePermission
 *     3. permission templates — additive module/action grants + field masking
 *   Because the union only ever adds, a role can never restrict a user here.
 *
 *   AUTHORITATIVE (`on`) — layers 2 and 3 only, matching QuikScale/QuikTrack/
 *   QuikInfra. The in-code baseline is dropped, so editing or downgrading a
 *   role finally takes effect.
 *
 * The switch is safe because both models are generated from the SAME constants:
 * `seed-crm-app-roles.ts` seeds each AppRole from the very `*_GRANTS` exports in
 * `role-grants.ts` that `roleBaselineMatrix()` builds from (admin from
 * `allCrmPermissionPairs()` on both sides). For a user bound to the role
 * matching their membership role, the two matrices are identical.
 *
 * FAIL-SAFE: in authoritative mode a user with NO RBAC grants falls back to the
 * legacy union rather than being denied everything. A missed backfill should
 * degrade to today's behaviour, never to a lockout; shadow mode flags those
 * users as `unbound=true` so they can be fixed.
 */
export async function getEffectiveMatrix(
  userId: string,
  orgId?: string,
  role?: string,
): Promise<PermissionMatrix> {
  const mode = rbacMode();
  const baseline = role ? roleBaselineMatrix(role) : [];

  const rbacReady = isCrmRbacClientReady();
  const [templateMatrix, rbacMatrix] = await Promise.all([
    loadTemplateMatrix(userId, orgId),
    orgId && rbacReady
      ? loadUserCrmGrants(userId, orgId)
          .then(matrixFromRbacGrants)
          .catch(() => [] as PermissionMatrix)
      : Promise.resolve([] as PermissionMatrix),
  ]);

  const primary =
    rbacMatrix.length > 0 ? mergeMatrices(baseline, rbacMatrix) : baseline;
  const legacy = mergeMatrices(primary, templateMatrix);

  // No RBAC grants → nothing authoritative to stand on. Serve legacy in every
  // mode; shadow reporting still flags the user so the backfill can fix them.
  const unbound = rbacMatrix.length === 0;

  if (mode === "off") return legacy;

  const authoritative = unbound
    ? legacy
    : mergeMatrices(rbacMatrix, templateMatrix);

  if (mode === "shadow") {
    reportShadowDrift(userId, orgId, legacy, authoritative, unbound);
    return legacy;
  }

  return authoritative;
}

export { adminMatrix };

export async function assertModule(
  user: SessionUser,
  module: string,
  action: ModuleAction,
): Promise<void> {
  // The Administrator short-circuit is a legacy-role bypass: it grants every
  // (module, action) pair from the mapped membership role alone, so an org
  // admin can never be scoped by a CRM role. QuikScale removed the equivalent
  // bypass deliberately ("the isSystem=true flag on the admin role no longer
  // bypasses permission checks"). In authoritative mode we match that — admins
  // pass through the matrix like everyone else, backed by the seeded `admin`
  // AppRole which holds `allCrmPermissionPairs()`.
  if (!isRbacAuthoritative() && isAdminRole(user.role)) return;

  // Default-deny: the matrix is always populated from the role baseline for a
  // known role, so an empty/missing row means the action is genuinely denied.
  const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
  const row = matrix.find((r) => r.module === module);
  if (!row || !row.actions.includes(action)) {
    const err = new Error(`Forbidden: ${action} on ${module}`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

export async function maskHiddenLeadFields<T extends Record<string, unknown>>(
  user: SessionUser,
  record: T,
): Promise<T> {
  if (isAdminRole(user.role)) return record;
  const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
  const row = matrix.find((r) => r.module === "leads");
  if (!row || row.hiddenFields.length === 0) return record;
  const out: Record<string, unknown> = { ...record };
  for (const f of row.hiddenFields) out[f] = null;
  return out as T;
}

export async function filterRestrictedLeadFields<T extends Record<string, unknown>>(
  user: SessionUser,
  payload: T,
): Promise<Partial<T>> {
  if (isAdminRole(user.role)) return payload;
  const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
  const row = matrix.find((r) => r.module === "leads");
  if (!row || row.restrictedFields.length === 0) return payload;
  const out = { ...payload } as Partial<T>;
  for (const f of row.restrictedFields) delete out[f as keyof T];
  return out;
}
