/**
 * FR-RE read-back — resolve the custom disposition field values an agent saved
 * for a given activity into a READABLE, display-ready shape for the "See form
 * details" view (timeline + disposition tab).
 *
 * The raw values live in CrmFieldValue keyed by (activityId, fieldKey), typed by
 * valueType. This service:
 *   1. loads those rows for the activity (tenant-scoped),
 *   2. resolves each fieldKey -> its human label + tab name (from CrmFormField),
 *   3. renders a type-aware display string (number / datetime / dropdown / text),
 *      and resolves user_picker IDs -> "Name (email)" via the users table,
 *   4. returns them ordered by the field's sortOrder, grouped-ready for the UI.
 *
 * Read-only. No writes, no rule evaluation.
 */
import { prisma } from "@/lib/db/prisma";

export interface DispositionValueView {
  fieldKey: string;
  label: string;
  /** The tab this field belongs to (e.g. "Payment Form"); null if unassigned. */
  tabName: string | null;
  fieldType: string;
  /** Display-ready value string (user IDs resolved, dates formatted). */
  display: string;
}

/** Format a stored datetime for display (YYYY-MM-DD HH:mm, local-ish). */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * The saved custom field values for one disposition activity, resolved to a
 * display-ready list. Tenant-scoped: only returns rows for the caller's tenant.
 * Empty array when the activity has no custom field values.
 */
export async function getDispositionValues(
  tenantId: string,
  activityId: string,
): Promise<DispositionValueView[]> {
  const rows = await prisma.crmFieldValue.findMany({
    where: { tenantId, activityId },
    select: {
      fieldKey: true,
      valueType: true,
      valueText: true,
      valueNumber: true,
      valueDatetime: true,
      valueUserIds: true,
      formSetVersionId: true,
    },
  });
  if (rows.length === 0) return [];

  // Resolve field labels + tab placement from the form definition. All rows for
  // one activity share a formSetVersionId, but group defensively in case not.
  const versionIds = [...new Set(rows.map((r) => r.formSetVersionId))];
  const defs = await prisma.crmFormField.findMany({
    where: { formSetVersionId: { in: versionIds } },
    select: {
      fieldKey: true,
      label: true,
      sortOrder: true,
      formSetVersionId: true,
      formTab: { select: { name: true } },
    },
  });
  const defByKey = new Map(
    defs.map((d) => [`${d.formSetVersionId}:${d.fieldKey}`, d]),
  );

  // Collect all user IDs across user_picker fields, resolve names in one query.
  const userIds = [...new Set(rows.flatMap((r) => r.valueUserIds ?? []))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
  const userById = new Map(
    users.map((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      const label = name ? (u.email ? `${name} (${u.email})` : name) : u.email;
      return [u.id, label];
    }),
  );

  const views: (DispositionValueView & { sortOrder: number })[] = rows.map((r) => {
    const def = defByKey.get(`${r.formSetVersionId}:${r.fieldKey}`);
    let display = "";
    switch (r.valueType) {
      case "user_picker":
        display = (r.valueUserIds ?? []).map((id) => userById.get(id) ?? id).join(", ");
        break;
      case "number":
        display = r.valueNumber != null ? r.valueNumber.toString() : "";
        break;
      case "datetime":
        display = r.valueDatetime != null ? fmtDate(r.valueDatetime) : "";
        break;
      default: // text, dropdown
        display = r.valueText ?? "";
    }
    return {
      fieldKey: r.fieldKey,
      label: def?.label ?? r.fieldKey,
      tabName: def?.formTab?.name ?? null,
      fieldType: r.valueType,
      display,
      sortOrder: def?.sortOrder ?? 0,
    };
  });

  // Only return fields that actually have a value; order by the form's sortOrder.
  return views
    .filter((v) => v.display.trim() !== "")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...v }) => v);
}
