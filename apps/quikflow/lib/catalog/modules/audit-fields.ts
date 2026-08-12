import type { FieldDef } from "./types";

/**
 * The common "who / when" audit fields every QuikScale record carries. Kept in
 * one place so the trigger/condition builder shows the same Created By / Updated
 * By / Created Date / Updated Date filters on every module, and record reads
 * project them consistently.
 *
 * Column names are identical across the backing models (`createdAt`,
 * `updatedAt`, `createdBy`, `updatedBy`), so a module only declares which of the
 * two "by" fields its model actually stores:
 *   • KPI / Priority / OPSP / WWW → both createdBy + updatedBy
 *   • Goal                        → createdBy only (no updatedBy column)
 *   • Habit                       → neither (timestamps only)
 *
 * `backed: false` emits the same four fields as authorable-only (no `column`),
 * for record-like modules with no Prisma table yet (Meeting, Review). They show
 * in the picker but are not projected in live record reads until a table exists.
 */
export function auditFields(
  opts: { createdBy?: boolean; updatedBy?: boolean; backed?: boolean } = {},
): FieldDef[] {
  const { createdBy = false, updatedBy = false, backed = true } = opts;
  const col = (name: string) => (backed ? { column: name } : {});
  const out: FieldDef[] = [];

  if (createdBy) {
    out.push({ key: "createdBy", label: "Created By", type: "people", usableIn: ["condition"], source: "master:users", ...col("createdBy") });
  }
  if (updatedBy) {
    out.push({ key: "updatedBy", label: "Updated By", type: "people", usableIn: ["condition"], source: "master:users", ...col("updatedBy") });
  }
  out.push(
    { key: "createdAt", label: "Created Date", type: "date", usableIn: ["condition"], ...col("createdAt") },
    { key: "updatedAt", label: "Updated Date", type: "date", usableIn: ["condition"], ...col("updatedAt") },
  );
  return out;
}
