/**
 * Permission matrix helpers — ported from quikcrm-nextjs/src/lib/auth/permissions.ts.
 *
 * Adapted to the monorepo schema:
 *   - PermissionTemplate / UserPermissionTemplate are now CrmPermissionTemplate /
 *     CrmUserPermissionTemplate in the app_quikcrm schema.
 *   - The CRM no longer owns its own User model. Role comes from the OAuth
 *     session (session.user.membershipRole, exposed as SessionUser.role) so
 *     getEffectiveMatrix queries the link table directly without joining User.
 */
import { db } from "@/lib/db";
import type {
  ModuleAction,
  ModulePermRow,
  PermissionMatrix,
  SessionUser,
} from "@/types/permission";

const ADMIN_ROLE = "Administrator";

const ALL_MODULES = [
  "dashboard",
  "leads",
  "accounts",
  "contacts",
  "opportunities",
  "activities",
  "tasks",
  "notes",
  "campaigns",
  "automations",
  "imports",
  "reports",
  "settings",
  "telephony",
  // Quotes module — gated under `assertModule(user, "quotes", "view"|"create"|...)`.
  // Catalog (products + price lists) is gated under `quotes` too so tenants
  // can grant a sales rep the whole quoting workflow with a single template row.
  "quotes",
  "documents",
] as const;

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

/**
 * Compute the user's effective permission matrix.
 *
 * Merge rule across multiple templates:
 *   - actions: union (most permissive wins)
 *   - hiddenFields:    intersection (a field is hidden only if EVERY template hides it)
 *   - restrictedFields: intersection (same logic)
 *
 * Note: the legacy code looked up `user.role === Administrator` here. Without
 * a CRM-owned User table that's no longer possible from userId alone, so the
 * admin bypass is enforced one level up (assertModule / mask*) using the
 * SessionUser.role from the OAuth session. If you need the admin matrix
 * directly use `adminMatrix()` exported below.
 */
export async function getEffectiveMatrix(userId: string): Promise<PermissionMatrix> {
  const links = await db.crmUserPermissionTemplate.findMany({
    where: { userId },
    include: { template: true },
  });
  if (links.length === 0) return [];

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
      existing.restrictedFields = existing.restrictedFields.filter((f) => row.restrictedFields.includes(f));
    }
  }
  return [...byModule.values()];
}

export { adminMatrix };

export async function assertModule(
  user: SessionUser,
  module: string,
  action: ModuleAction,
): Promise<void> {
  if (user.role === ADMIN_ROLE) return;
  const matrix = await getEffectiveMatrix(user.userId);
  // Backwards-compat: if no permission templates are configured for this user
  // at all, treat as unrestricted (matches the legacy "no ACL configured =
  // full org access" behavior used by account-acl.ts). Tighten by seeding
  // templates via Settings → Permissions.
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
  const matrix = await getEffectiveMatrix(user.userId);
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
  const matrix = await getEffectiveMatrix(user.userId);
  const row = matrix.find((r) => r.module === "leads");
  if (!row || row.restrictedFields.length === 0) return payload;
  const out = { ...payload } as Partial<T>;
  for (const f of row.restrictedFields) delete out[f as keyof T];
  return out;
}
