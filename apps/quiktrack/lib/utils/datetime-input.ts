/**
 * Helpers for `<input type="date">` / `<input type="time">` fields that are
 * backed by a UTC instant (ISO 8601 string) on the server.
 *
 * The inputs are wall-clock only — they carry no zone — so a stored instant
 * has to be projected into the viewer's local zone before it is shown, and
 * re-interpreted as local time on the way back. Slicing the raw ISO string
 * (`iso.slice(0, 10)` / `iso.slice(11, 16)`) skips that projection and leaks
 * the UTC wall clock into the form: a sprint saved at 16:40 IST reopens as
 * 11:10, and saving again shifts it a further -5:30.
 */

function toLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC instant → local `YYYY-MM-DD` for `<input type="date">`. */
export function toLocalDateInput(iso: string | null | undefined): string {
  const d = toLocalDate(iso);
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** UTC instant → local `HH:mm` for `<input type="time">`. */
export function toLocalTimeInput(iso: string | null | undefined): string {
  const d = toLocalDate(iso);
  if (!d) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Local `YYYY-MM-DD` + `HH:mm` → UTC ISO string for the API.
 * Returns undefined when there is no date; an empty/invalid time falls back
 * to 09:00 local, matching the sprint modals' previous behaviour.
 */
export function localInputsToISO(
  date: string,
  time: string,
): string | undefined {
  if (!date) return undefined;
  const t = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "09:00:00";
  const d = new Date(`${date}T${t}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
