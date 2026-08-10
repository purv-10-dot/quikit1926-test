/**
 * Required screen-field resolution, workflow-independent (no imports from the
 * workflow engine) so the executeTransition gate can use it without a cycle.
 */
import { db } from "@/lib/db";
import { isCustomFieldKey, CUSTOM_FIELD_PREFIX } from "./field-registry";

/**
 * Required field keys for a KNOWN screen id. Summary is always required; a
 * custom field is required when its QtCustomField.isRequired is true; other
 * built-ins are optional.
 */
export async function requiredKeysForScreen(orgId: string, screenId: string): Promise<string[]> {
  const screen = await db.qtScreen.findFirst({
    where: { id: screenId, orgId, isDeleted: false },
    select: {
      tabs: { orderBy: { orderNo: "asc" }, select: { fields: { orderBy: { orderNo: "asc" }, select: { fieldKey: true } } } },
    },
  });
  if (!screen) return [];
  const keys = screen.tabs.flatMap((t) => t.fields.map((f) => f.fieldKey));
  const cfKeys = keys.filter(isCustomFieldKey).map((k) => k.slice(CUSTOM_FIELD_PREFIX.length));
  const requiredCf = cfKeys.length
    ? new Set(
        (await db.qtCustomField.findMany({
          where: { orgId, key: { in: cfKeys }, isDeleted: false, isRequired: true },
          select: { key: true },
        })).map((f) => f.key),
      )
    : new Set<string>();
  return keys.filter((key) => {
    if (isCustomFieldKey(key)) return requiredCf.has(key.slice(CUSTOM_FIELD_PREFIX.length));
    return key === "summary";
  });
}
