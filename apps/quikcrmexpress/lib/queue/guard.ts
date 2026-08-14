import { NextResponse } from "next/server";
import { isRedisEnabled } from "@/lib/db/redis";

/**
 * Returns a 503 NextResponse if Redis is disabled. Use at the top of any route
 * handler that requires BullMQ (imports, automation manual-execute).
 */
export function requireRedisOr503(): NextResponse | null {
  if (isRedisEnabled()) return null;
  return NextResponse.json(
    { success: false, error: "Background processing disabled",
      detail:
        "REDIS_URL is not set. Imports and workflow execution require Redis. Set REDIS_URL and restart the server to enable.",
    },
    { status: 503 },
  );
}
