/**
 * Shared master-lookup builder.
 *
 * Lookups (dropdowns that reference a master) must only offer ACTIVE rows —
 * inactive (paused) and deleted masters must never be selectable. But a record
 * that was saved earlier may still reference a master that has since gone
 * inactive/deleted; blanking that field silently would let a careless save drop
 * the link. So we keep the stale value visible, tagged, and surface a warning.
 *
 * The master list API returns active + inactive rows (deleted are excluded
 * server-side), so:
 *   - assigned value present in the list but not active  → "inactive"
 *   - assigned value absent from the list entirely       → "unavailable" (deleted/gone)
 */

export interface LookupRow {
  id: string;
  name: string;
  status?: string;
}

export interface LookupOption {
  value: string;
  label: string;
}

export interface LookupResult {
  /** Active options, plus the stale assigned value (tagged) when applicable. */
  options: LookupOption[];
  /** Amber warning to render under the field, or null when the value is fine. */
  notice: string | null;
}

export interface BuildLookupArgs<T extends LookupRow> {
  rows: T[];
  /** Currently-assigned value on the form (id or name, per `by`). */
  assigned: string | null | undefined;
  /** Whether option values are the row id (default) or the row name. */
  by?: "id" | "name";
  /** Lower-case entity word used in the warning text, e.g. "contractor". */
  entityLabel: string;
}

export function buildLookupOptions<T extends LookupRow>({
  rows,
  assigned,
  by = "id",
  entityLabel,
}: BuildLookupArgs<T>): LookupResult {
  const valueOf = (r: T) => (by === "id" ? r.id : r.name);
  const options: LookupOption[] = rows
    .filter((r) => r?.status === "active")
    .map((r) => ({ value: valueOf(r), label: r.name }));

  const value = (assigned ?? "").trim();
  if (!value) return { options, notice: null };

  if (options.some((o) => o.value === value)) return { options, notice: null };

  const existing = rows.find((r) => valueOf(r) === value);
  const notice = existing
    ? `This ${entityLabel} is inactive — select another to reassign.`
    : `This ${entityLabel} no longer exists — select another to reassign.`;

  return {
    options: [
      ...options,
      {
        value,
        label: `${existing?.name ?? value} (${existing ? "inactive" : "unavailable"})`,
      },
    ],
    notice,
  };
}
