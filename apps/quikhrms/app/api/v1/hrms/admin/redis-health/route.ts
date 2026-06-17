import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { isRedisAvailable } from "@quikit/redis";
import { isRedisCacheEnabled } from "@quikit/auth/cache";

/**
 * GET /api/v1/hrms/admin/redis-health
 *
 * The hot-path cache is the shared layered cache (@quikit/auth/cache):
 * in-memory LRU → shared Redis (@quikit/redis). Reports whether Redis is
 * configured (REDIS_URL) and reachable (PING) so admins can spot the
 * degraded in-memory-per-instance mode. Admin-only.
 */
export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const configured = isRedisCacheEnabled();
    const reachable = configured ? await isRedisAvailable() : false;
    return successResponse({
      backend: configured ? "layered (in-memory LRU + shared Redis)" : "in-memory only",
      redisConfigured: configured,
      redisReachable: reachable,
      note: configured
        ? "Hot-path cache is shared across instances; invalidation fans out via pub/sub."
        : "REDIS_URL unset — cache degrades to per-process memory; cross-instance invalidation and worker-computed snapshots are unavailable.",
    });
  } catch (e) {
    console.error("GET /admin/redis-health error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
