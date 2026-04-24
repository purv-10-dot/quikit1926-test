/**
 * Centralized error-message extraction — same shape as quikscale's.
 */
export function toErrorMessage(error: unknown, fallback = "Operation failed"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const s = JSON.stringify(error);
    if (s && s !== "{}") return s;
  } catch {
    /* noop */
  }
  return fallback;
}
