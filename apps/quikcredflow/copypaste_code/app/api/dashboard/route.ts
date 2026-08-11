import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { parseFilters } from "@/lib/services/dashboard/filters";
import { buildSummary } from "@/lib/services/dashboard/summary-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const filters = parseFilters(req, user);
    const summary = await buildSummary(user, filters);
    return NextResponse.json(summary);
  } catch (e) {
    return errorResponse(e);
  }
}
