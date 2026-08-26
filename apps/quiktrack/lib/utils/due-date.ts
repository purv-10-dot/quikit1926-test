/**
 * Date-only helpers for the `dueDate` field.
 *
 * A due date is a calendar day, not an instant. The issue drawer stores it as
 * UTC midnight (`new Date("2026-08-12").toISOString()`) and reads it back by
 * slicing the ISO string, so every other surface that edits the same field has
 * to use that convention too — otherwise a date set in the backlog reopens in
 * the drawer a day off, and each save shifts it again.
 *
 * That is why these helpers stay in UTC and never project into the viewer's
 * zone. `datetime-input.ts` does the opposite on purpose: it is for real
 * instants (sprint start/end), where the local wall clock is what matters.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Stored instant → `YYYY-MM-DD` for `<input type="date">`. "" when unset. */
export function toDueDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` from the picker → UTC-midnight ISO for the API. null clears. */
export function dueDateInputToISO(input: string): string | null {
  if (!input) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Local calendar day as `YYYY-MM-DD`, for comparison against a stored day. */
export function localDayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * `YYYY-MM-DD` for today plus `offsetDays` in the viewer's zone — backs the
 * picker's Today / Tomorrow / Next week shortcuts.
 */
export function dayKeyFromToday(offsetDays: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + offsetDays);
  return localDayKey(d);
}

export type DueDateTone = "overdue" | "today" | "upcoming";

/**
 * How the chip should read: past its day, on its day, or still ahead.
 * Compares day keys as strings — no zone maths, no DST edge cases.
 * Returns null when there is no (or an unparseable) due date.
 */
export function dueDateTone(
  iso: string | null | undefined,
  now: Date = new Date(),
): DueDateTone | null {
  const day = toDueDateInput(iso);
  if (!day) return null;
  const today = localDayKey(now);
  if (day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

/**
 * Short chip label, e.g. "12 Aug" (adds the year when it isn't the current
 * one, so a stale 2025 due date can't be mistaken for this year's).
 */
export function formatDueDateLabel(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  const day = toDueDateInput(iso);
  if (!day) return "";
  const d = new Date(`${day}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(d.getUTCFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Due-date filter presets offered in the backlog's Filter panel.
 *
 * The range is resolved HERE, in the browser, because "today" is the viewer's
 * local day — the API takes absolute instants and stays zone-agnostic.
 */
export type DueDateFilterPreset =
  | ""
  | "overdue"
  | "today"
  | "week"
  | "month"
  | "none";

export const DUE_DATE_FILTER_OPTIONS: Array<{
  value: DueDateFilterPreset;
  label: string;
}> = [
  { value: "", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due in 7 days" },
  { value: "month", label: "Due in 30 days" },
  { value: "none", label: "No due date" },
];

/** Query params the API understands for a due-date filter. */
export interface DueDateFilterQuery {
  /** "none" selects items with no due date; omitted otherwise. */
  dueDate?: "none";
  /** Inclusive lower bound, ISO instant. */
  dueFrom?: string;
  /** Inclusive upper bound, ISO instant. */
  dueTo?: string;
}

/** Local day N days from today, as a UTC instant at 00:00 of that stored day. */
function storedDayStart(offsetDays: number, now: Date): string {
  return `${dayKeyFromToday(offsetDays, now)}T00:00:00.000Z`;
}

/** End of that stored day, so an inclusive upper bound catches the whole day. */
function storedDayEnd(offsetDays: number, now: Date): string {
  return `${dayKeyFromToday(offsetDays, now)}T23:59:59.999Z`;
}

/**
 * Preset -> query params.
 *
 * Bounds are built against the UTC-midnight convention due dates are stored
 * with (see the note at the top of this file), so a "due today" item is
 * matched by its own day and not by the instant the page happened to load.
 * An unknown preset resolves to no filter rather than throwing — a stale
 * persisted value must not break the backlog.
 */
export function dueDateFilterQuery(
  preset: DueDateFilterPreset | string,
  now: Date = new Date(),
): DueDateFilterQuery {
  switch (preset) {
    case "none":
      return { dueDate: "none" };
    // Strictly before today: everything up to the end of yesterday. Items with
    // no due date are excluded (they have no bound to be past).
    case "overdue":
      return { dueTo: storedDayEnd(-1, now) };
    case "today":
      return { dueFrom: storedDayStart(0, now), dueTo: storedDayEnd(0, now) };
    // Forward-looking windows start today, so an item due this afternoon still
    // counts as "due in 7 days".
    case "week":
      return { dueFrom: storedDayStart(0, now), dueTo: storedDayEnd(7, now) };
    case "month":
      return { dueFrom: storedDayStart(0, now), dueTo: storedDayEnd(30, now) };
    default:
      return {};
  }
}

/** Serialize the preset onto a URLSearchParams. No-op for "Any"/unknown. */
export function appendDueDateParams(
  params: URLSearchParams,
  preset: DueDateFilterPreset | string,
  now: Date = new Date(),
): void {
  const q = dueDateFilterQuery(preset, now);
  if (q.dueDate) params.set("dueDate", q.dueDate);
  if (q.dueFrom) params.set("dueFrom", q.dueFrom);
  if (q.dueTo) params.set("dueTo", q.dueTo);
}
