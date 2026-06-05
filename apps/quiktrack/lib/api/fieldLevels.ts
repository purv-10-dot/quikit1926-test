/**
 * Server-side field-level permission resolver.
 *
 * For a given (userId, orgId, projectId, entity), returns a Map<fieldKey, level>
 * representing the user's effective level on every catalog field for that
 * entity. Result is the merge of:
 *   - Layer 1: rows in QtRoleFieldPermission for every QtAppRole the user holds
 *     in this org.
 *   - Layer 2: rows in QtProjectRoleFieldPermission for the QtProjectRole the
 *     user holds on this project (one project role per user per project).
 *
 * Most-restrictive-wins precedence (lower number = more restrictive):
 *   hidden(0) > readonly(1) > required(2) > editable(3)
 *
 * Why required > readonly: a required row pins the field as "must be filled"
 * but still expects a value, so it's more permissive than read-only.
 *
 * Global admins (tenant admin OR app admin) bypass everything — empty map
 * (i.e., "no restrictions").
 */
import { db } from "@/lib/db";
import { hasAdminAccess } from "@/lib/api/permissions";
import {
  DEFAULT_FIELD_LEVEL,
  FIELD_TREE,
  findField,
  type FieldLevel,
} from "@/lib/api/fieldsRegistry";

const RANK: Record<FieldLevel, number> = {
  hidden: 0,
  readonly: 1,
  required: 2,
  editable: 3,
};

function moreRestrictive(a: FieldLevel, b: FieldLevel): FieldLevel {
  return RANK[a] <= RANK[b] ? a : b;
}

export async function getEffectiveFieldLevels(
  userId: string,
  orgId: string,
  projectId: string,
  entity: string,
): Promise<Map<string, FieldLevel>> {
  if (await hasAdminAccess(userId, orgId)) {
    return new Map();
  }

  const [layer1Rows, layer2Rows] = await Promise.all([
    db.qtRoleFieldPermission.findMany({
      where: {
        entity,
        role: { members: { some: { userId, orgId } } },
      },
      select: { field: true, level: true },
    }),
    db.qtProjectRoleFieldPermission.findMany({
      where: {
        entity,
        projectRole: {
          projectId,
          members: { some: { userId } },
        },
      },
      select: { field: true, level: true },
    }),
  ]);

  const merged = new Map<string, FieldLevel>();
  for (const r of [...layer1Rows, ...layer2Rows]) {
    const lvl = r.level as FieldLevel;
    const existing = merged.get(r.field);
    merged.set(r.field, existing ? moreRestrictive(existing, lvl) : lvl);
  }
  return merged;
}

/**
 * Filter an incoming update payload against the user's effective field levels.
 * Returns `{ allowed: <safe-to-apply subset>, rejected: <fields the user can't touch> }`.
 * Use in PATCH handlers like:
 *
 *   const { allowed, rejected } = await filterUpdatePayload(
 *     userId, orgId, projectId, "Issue", payload,
 *   );
 *   if (rejected.length > 0) return forbidden(`Cannot modify: ${rejected.join(", ")}`);
 *   await db.qtIssue.update({ where: { id }, data: allowed });
 */
export async function filterUpdatePayload<T extends Record<string, unknown>>(
  userId: string,
  orgId: string,
  projectId: string,
  entity: string,
  payload: T,
): Promise<{ allowed: Partial<T>; rejected: string[] }> {
  const levels = await getEffectiveFieldLevels(userId, orgId, projectId, entity);
  if (levels.size === 0) return { allowed: payload, rejected: [] };

  const allowed: Partial<T> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const lvl = levels.get(key);
    if (lvl === "hidden" || lvl === "readonly") {
      rejected.push(key);
    } else {
      (allowed as Record<string, unknown>)[key] = value;
    }
  }
  return { allowed, rejected };
}

/** Validate that every `required` field in the catalog is non-empty in the payload. */
export function checkRequiredFields(
  levels: Map<string, FieldLevel>,
  payload: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const [field, level] of levels.entries()) {
    if (level !== "required") continue;
    const v = payload[field];
    if (v === null || v === undefined || v === "") missing.push(field);
  }
  return missing;
}

/** Catalog defaults — for fields not explicitly overridden. */
export function defaultLevelFor(entity: string, field: string): FieldLevel {
  const def = findField(entity, field);
  return def ? DEFAULT_FIELD_LEVEL : DEFAULT_FIELD_LEVEL;
}

// Re-exports for convenience inside handlers.
export { FIELD_TREE };
