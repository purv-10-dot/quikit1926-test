import { NextResponse } from "next/server";

/**
 * Background processing (imports + workflow execution) has been removed — the
 * BullMQ/Redis queue backend no longer exists. This always returns a 503 so the
 * import / automation routes report the disabled state cleanly.
 *
 * Signature is kept (`NextResponse | null`) so existing call sites need no change.
 */
export function requireRedisOr503(): NextResponse | null {
  return NextResponse.json(
    {
      error: "Background processing disabled",
      detail:
        "Imports and workflow execution are disabled in this deployment (queue backend removed).",
    },
    { status: 503 },
  );
}
