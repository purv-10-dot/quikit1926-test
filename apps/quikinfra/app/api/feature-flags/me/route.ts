import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisabledModules } from "@quikit/auth/feature-gate";
import { cacheOrCompute } from "@quikit/shared/redisCache";

/**
 * GET /api/feature-flags/me
 *
 * Returns the set of disabled moduleKeys for the current user's tenant on
 * THIS app (hard-coded to "quikinfra"). Used by the sidebar to filter the
 * nav tree. Safe to call freely — response dedupes via React.cache on the
 * server and is cached in Redis for 5 minutes per (orgId, appSlug).
 *
 * Mirrors apps/quikscale/app/api/feature-flags/me/route.ts.
 *
 * Response: { success: true, data: { appSlug, disabledKeys: string[] } }
 */
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.orgId;
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const cacheKey = `ff:me:quikinfra:${orgId}`;
    const disabledKeys = await cacheOrCompute(cacheKey, CACHE_TTL, async () => {
      const disabled = await getDisabledModules(orgId, "quikinfra");
      return Array.from(disabled);
    });

    return NextResponse.json({
      success: true,
      data: {
        appSlug: "quikinfra",
        disabledKeys,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
