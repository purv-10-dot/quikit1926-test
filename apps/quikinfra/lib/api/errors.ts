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

/**
 * Narrowing accessor for the `code` carried by Prisma / Node errors
 * (e.g. Prisma's `P2002` unique-constraint code). Returns undefined when
 * the thrown value isn't an object with a string `code`. Use instead of an
 * untyped cast to read `.code` in `catch (err: unknown)` blocks.
 */
export function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Narrowing accessor for Prisma's error `meta` bag (e.g. `meta.target`,
 * `meta.column` on a P2002/P2022). Returns undefined when absent. Use
 * instead of an untyped cast to read `.meta` in `catch (err: unknown)` blocks.
 */
export function getErrorMeta(error: unknown): Record<string, unknown> | undefined {
  if (typeof error === "object" && error !== null && "meta" in error) {
    const meta = (error as { meta?: unknown }).meta;
    return typeof meta === "object" && meta !== null
      ? (meta as Record<string, unknown>)
      : undefined;
  }
  return undefined;
}
