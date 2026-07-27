/**
 * Pull the server-provided error message from a parsed API JSON body, falling
 * back to a generic message when there isn't one.
 *
 * Our API errors are shaped `{ success: false, error: string }`. Surfacing that
 * `error` (instead of a hardcoded generic string) is what lets the UI show the
 * REAL reason a request failed — the fix for handlers that used to do
 * `if (!res.ok) throw new Error()` and swallow the response.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}
