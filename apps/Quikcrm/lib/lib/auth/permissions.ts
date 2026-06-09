/**
 * Permission matrix helpers for QuikCRM.
 *
 * Primary storage (QuikScale parity):
 *   app_quikcrm.UserAppRole + RolePermission + UserPermissionExtra
 *
 * Legacy field-level rules still read from CrmPermissionTemplate when present.
 */
import { db } from "@/lib/db";
import { loadUserCrmGrants } from "@/lib/api/crm-rbac";
import { CRM_MODULES, isCrmAction, isCrmModule } from "@/lib/api/permissions-registry";
import { seedAllDefaultCrmRoles } from "@/lib/api/seed-crm-app-roles";
import type {
  ModuleAction,
  ModulePermRow,
  PermissionMatrix,
  SessionUser,
} from "@/types/permission";

const ADMIN_ROLE = "Administrator";

const ALL_MODULES = CRM_MODULES;

const ALL_ACTIONS: ModuleAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "markComplete",
];

function adminMatrix(): PermissionMatrix {
  return ALL_MODULES.map<ModulePermRow>((module) => ({
    module,
    actions: ALL_ACTIONS,
    hiddenFields: [],
    restrictedFields: [],
  }));
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

async function loadTemplateMatrix(userId: string): Promise<PermissionMatrix> {
  const links = await db.crmUserPermissionTemplate.findMany({
    where: { userId },
    include: { template: true },
  });
  return matrixFromTemplateLinks(links);
}

/**
 * Effective permissions for sidebar + API gates.
 * Pass `orgId` (tenant) so UserAppRole rows are resolved.
 */
export async function getEffectiveMatrix(
  userId: string,
  orgId?: string,
): Promise<PermissionMatrix> {
  const [templateMatrix, rbacMatrix] = await Promise.all([
    loadTemplateMatrix(userId),
    orgId
      ? seedAllDefaultCrmRoles(orgId)
          .then(() => loadUserCrmGrants(userId, orgId))
          .then(matrixFromRbacGrants)
          .catch(() => [] as PermissionMatrix)
      : Promise.resolve([] as PermissionMatrix),
  ]);

  if (rbacMatrix.length > 0) {
    return mergeMatrices(rbacMatrix, templateMatrix);
  }
  return templateMatrix;
}

export { adminMatrix };

export async function assertModule(
  user: SessionUser,
  module: string,
  action: ModuleAction,
): Promise<void> {
  if (user.role === ADMIN_ROLE) return;

  const grants = await loadUserCrmGrants(user.userId, user.orgId);
  if (grants.length > 0) {
    const allowed = grants.some((g) => g.resource === module && g.action === action);
    if (!allowed) {
      const err = new Error(`Forbidden: ${action} on ${module}`) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  const matrix = await getEffectiveMatrix(user.userId, user.orgId);
  if (matrix.length === 0) return;
  const row = matrix.find((r) => r.module === module);
  if (!row || !row.actions.includes(action)) {
    const err = new Error(`Forbidden: ${action} on ${module}`) as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}

export async function maskHiddenLeadFields<T extends Record<string, unknown>>(
  user: SessionUser,
  record: T,
): Promise<T> {
  if (user.role === ADMIN_ROLE) return record;
  const matrix = await getEffectiveMatrix(user.userId, user.orgId);
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
  if (user.role === ADMIN_ROLE) return payload;
  const matrix = await getEffectiveMatrix(user.userId, user.orgId);
  const row = matrix.find((r) => r.module === "leads");
  if (!row || row.restrictedFields.length === 0) return payload;
  const out = { ...payload } as Partial<T>;
  for (const f of row.restrictedFields) delete out[f as keyof T];
  return out;
}
