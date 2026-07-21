import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDisabledModules } from "@quikit/auth/feature-gate";
import { cacheOrCompute } from "@quikit/shared/redisCache";

/**
 * GET /api/feature-flags/me
 *
 * Returns the set of disabled moduleKeys for the current user's tenant on
 * QuikChat (hard-coded slug). Used by `useDisabledModules()` to hide
 * affordances for disabled modules (Calls, Calendar, Assistant, KB). Safe to
 * call freely — deduped via React.cache server-side + Redis-cached 5 min per
 * (orgId, appSlug).
 *
 * Mirrors QuikScale's route verbatim (envelope + caching), for the ported
 * client hook. Response: { success, data: { appSlug, disabledKeys } }.
 */
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.orgId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = `ff:me:quikchat:${orgId}`;
    const disabledKeys = await cacheOrCompute(cacheKey, CACHE_TTL, async () => {
      const disabled = await getDisabledModules(orgId, "quikchat");
      return Array.from(disabled);
    });

    return NextResponse.json({
      success: true,
      data: { appSlug: "quikchat", disabledKeys },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
