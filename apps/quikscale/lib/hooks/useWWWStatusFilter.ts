"use client";

/**
 * The WWW status filter, shared between the Dashboard's WWW section and the
 * WWW module page. Picking statuses in one place carries over to the other.
 *
 * Semantics (identical on both surfaces):
 *   - the value is an EXPLICIT set of selected statuses
 *   - `[]` matches nothing
 *   - every status selected matches everything
 *
 * Why the stored value is nullable: the two surfaces have different *initial*
 * defaults (the Dashboard deliberately hides "completed" to stay focused on
 * actionable work; the WWW list shows everything). `null` means "the user
 * hasn't chosen yet", so each surface keeps its own default until the filter is
 * actually touched — at which point the explicit selection is stored and both
 * surfaces follow it. That gives the requested sync without silently changing
 * what either page shows on first load.
 */

import { useSessionState } from "@/lib/hooks/useSessionState";
import { ITEM_STATUS_ORDER } from "@/lib/constants/status";

/** sessionStorage key holding the shared selection (or null when untouched). */
export const WWW_STATUS_FILTER_KEY = "qs:www:status:shared";

/** WWW module page default — every status. */
export const WWW_PAGE_DEFAULT_STATUSES: string[] = [...ITEM_STATUS_ORDER];

/** Dashboard default — everything except completed. */
export const DASHBOARD_DEFAULT_STATUSES: string[] = ITEM_STATUS_ORDER.filter(
  (s) => s !== "completed",
);

export function useWWWStatusFilter(
  fallback: string[],
): [string[], (next: string[]) => void] {
  const [stored, setStored] = useSessionState<string[] | null>(
    WWW_STATUS_FILTER_KEY,
    null,
  );
  return [stored ?? fallback, setStored];
}
