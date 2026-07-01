/**
 * Read service for admin-configured activity types and their field definitions.
 *
 * Reads the real CrmActivityType / CrmActivityFieldDefinition tables (indexed
 * storage, decision #1) — so EVERY read is scoped by orgId. There is no
 * cross-org read path here; a missing/foreign id resolves to null.
 *
 * Consumed by the settings editor (Phase 1 UI) and the logging UX (Phase 3).
 */
import { prisma } from "@/lib/db/prisma";
import type {
  ActivityFieldDefinition,
  ActivityTypeDefinition,
  ActivityTypeWithFields,
} from "@/types/activity-type";

// Prisma rows carry Json columns typed loosely; map them to the domain shape
// so callers get clean arrays/objects instead of Prisma's JsonValue.
interface RawFieldRow {
  id: string;
  activityTypeId: string;
  key: string;
  label: string;
  fieldType: string;
  requirement: string;
  options: unknown;
  visible: boolean;
  helpText: string | null;
  sortOrder: number;
}

interface RawTypeRow {
  id: string;
  code: string;
  label: string;
  category: string | null;
  config: unknown;
  sortOrder: number;
  isActive: boolean;
}

function toFieldDefinition(row: RawFieldRow): ActivityFieldDefinition {
  return {
    id: row.id,
    activityTypeId: row.activityTypeId,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType as ActivityFieldDefinition["fieldType"],
    requirement: row.requirement as ActivityFieldDefinition["requirement"],
    options: Array.isArray(row.options) ? (row.options as string[]) : null,
    visible: row.visible,
    helpText: row.helpText,
    sortOrder: row.sortOrder,
  };
}

function toTypeDefinition(row: RawTypeRow): ActivityTypeDefinition {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    category: row.category,
    config:
      row.config && typeof row.config === "object"
        ? (row.config as Record<string, unknown>)
        : null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

/** All activity types for an org, ordered for display. Org-scoped. */
/**
 * All activity types for an org, ordered for display. Org-scoped.
 *
 * `opts.activeOnly` is OPT-IN: omit it (the default) to return ALL types —
 * which the admin settings list relies on, so it can show + reactivate
 * inactive types. The user-facing logging list passes activeOnly:true so
 * loggers only see usable types. Do NOT hardcode an isActive filter here, or
 * the admin list would lose visibility of inactive types.
 */
export async function listActivityTypes(
  orgId: string,
  opts?: { activeOnly?: boolean },
): Promise<ActivityTypeDefinition[]> {
  const rows = await prisma.crmActivityType.findMany({
    where: { orgId, ...(opts?.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map((r) => toTypeDefinition(r as unknown as RawTypeRow));
}

/**
 * A single activity type with its field definitions, scoped to (id, orgId).
 * Returns null if the type does not exist in the caller's org — there is no
 * cross-tenant read path.
 */
export async function getActivityTypeWithFields(
  orgId: string,
  typeId: string,
): Promise<ActivityTypeWithFields | null> {
  const row = await prisma.crmActivityType.findFirst({
    where: { id: typeId, orgId },
    include: {
      fieldDefinitions: {
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
    },
  });
  if (!row) return null;

  const typed = row as unknown as RawTypeRow & { fieldDefinitions: RawFieldRow[] };
  return {
    ...toTypeDefinition(typed),
    fieldDefinitions: typed.fieldDefinitions.map(toFieldDefinition),
  };
}
