/**
 * Shared response helpers for the ICP routes.
 *
 * The other modules redeclare `ok`/`fail` in every route file; ICP has five
 * route files, so they live here once. Shape is identical to the rest of the
 * app: `{ success: true, data }` / `{ success: false, error, fieldErrors? }`.
 */

import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(
  status: number,
  error: string,
  fieldErrors?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

/**
 * Map a thrown error to a response, honouring `statusCode` (set by assertModule
 * and by the ICP services) and `fieldErrors` (set by the services for
 * form-level validation failures). 5xx is logged; 4xx is expected traffic.
 */
export function failFromError(error: unknown, tag: string, fallback: string): NextResponse {
  const e = error as { statusCode?: number; message?: string; fieldErrors?: Record<string, string> };
  const status = e?.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 500;
  const message = error instanceof Error ? error.message : fallback;
  if (status >= 500) console.error(`[${tag}]`, error);
  return fail(status, message, e?.fieldErrors);
}

/** Flatten a ZodError into the `fieldErrors` map the forms read. */
export function zodFieldErrors(err: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> {
  const flat = err.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v?.length) out[k] = v[0]!;
  }
  return out;
}
