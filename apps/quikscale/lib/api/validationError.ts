import { NextResponse } from "next/server";
import type { SafeParseReturnType } from "zod";

/**
 * Return a standardised 400 response from a failed Zod `safeParse`.
 *
 * Replaces the 3–5 line block duplicated across 18+ route handlers:
 *
 *   if (!parsed.success) {
 *     return NextResponse.json(
 *       { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
 *       { status: 400 },
 *     );
 *   }
 *
 * Usage:
 *   const parsed = schema.safeParse(body);
 *   if (!parsed.success) return validationError(parsed);
 */
export function validationError(
  result: SafeParseReturnType<any, any>,
  fallback = "Invalid input",
): NextResponse {
  const message =
    !result.success
      ? result.error.errors[0]?.message ?? fallback
      : fallback;

  return NextResponse.json(
    { success: false, error: message },
    { status: 400 },
  );
}
