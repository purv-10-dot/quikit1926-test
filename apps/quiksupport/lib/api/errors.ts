/**
 * Error → message helper for QuikSupport API routes. Mirrors quiktrack's
 * `lib/api/errors.ts` so the withOrgAuth wrapper has a single, consistent way
 * to surface a message from an unknown throw.
 */
export function toErrorMessage(error: unknown, fallback = "Operation failed"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
