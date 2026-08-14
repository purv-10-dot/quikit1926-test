import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { toErrorMessage } from "@/lib/api/errors";

/**
 * Service-to-service auth for machine callers (no user session). Verifies the
 * `x-internal-secret` header against INTERNAL_SECRET with a constant-time
 * compare. Formalizes the shared-secret pattern used across the platform's
 * `/api/internal/*` routes (e.g. provision-roles), which QuikScale's event
 * emitter uses to reach QuikFlow's /api/events.
 *
 * runtime must be "nodejs" on routes using this (crypto + no edge).
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function withServiceAuth(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
  options: { fallbackErrorMessage?: string } = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const expected = process.env.INTERNAL_SECRET;
    const provided = req.headers.get("x-internal-secret");
    if (!expected || !provided || !secretsMatch(provided, expected)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(req);
    } catch (error: unknown) {
      return NextResponse.json(
        {
          success: false,
          error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed"),
        },
        { status: 500 },
      );
    }
  };
}
