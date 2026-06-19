/**
 * Shared date formatting utilities.
 *
 * Consolidates the duplicated `toDateInput` / `toDateInputValue` functions
 * from WWWTable and WWWPanel into a single source of truth.
 *
 * NOTE: `formatDate` is NOT consolidated here because the display format
 * intentionally differs between components:
 *   - WWWTable / Dashboard: DD/MM/YYYY  ("15/03/2026")
 *   - WWWPanel:             Month Day, Year ("Mar 15, 2026")
 * Changing either would be a visible UX regression.
 */

/**
 * Convert an ISO date string to HTML `<input type="date">` value (YYYY-MM-DD).
 * Returns "" for falsy / unparseable input.
 */
export function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}
