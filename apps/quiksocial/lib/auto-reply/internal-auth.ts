/**
 * Internal-token guard for /api/internal/* routes called by the Python AI
 * service (auto-reply monitor, offering enrichment, etc.).
 *
 * The Python service ships the same QS_INTERNAL_TOKEN as the
 * `X-QS-Internal-Token` header on every internal request. Symmetrically, this
 * Next.js side sends the same token when calling the Python service. Single
 * env var, both directions.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function checkInternalToken(req: NextRequest): NextResponse | null {
  const expected = process.env.QS_INTERNAL_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "QS_INTERNAL_TOKEN not configured", code: "INTERNAL_AUTH_NOT_CONFIGURED" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-qs-internal-token");
  if (provided !== expected) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  return null;
}
