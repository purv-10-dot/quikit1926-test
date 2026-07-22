/**
 * Date helpers for `<input type="date">` min/max constraints.
 *
 * `toDateInput`/`todayInput` build a LOCAL `yyyy-mm-dd` string — using
 * `new Date().toISOString()` directly would shift the day across the UTC
 * boundary (e.g. early-morning IST resolves to "yesterday").
 */

/** Format a Date as a local `yyyy-mm-dd` string. */
export function toDateInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Today as a local `yyyy-mm-dd` string. Use as `min` to block past dates. */
export function todayInput(): string {
  return toDateInput(new Date());
}
