import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { parseOverviewFilters } from "@/lib/services/dashboard/parse-overview-filters";
import { buildExecutiveOverview } from "@/lib/services/dashboard/executive-overview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) {
      return NextResponse.json(
        { success: false, error: "Executive overview is available to org administrators only." },
        { status: 403 },
      );
    }

    const parsed = parseOverviewFilters(req, user);

    const data = await buildExecutiveOverview(user, {
      range: parsed.range,
      resolvedOwnerId: parsed.resolvedOwnerId,
      source: parsed.extended.source,
      tz: parsed.tz,
      extended: {
        ...parsed.extended,
        ownerId: parsed.resolvedOwnerId ?? parsed.extended.ownerId,
      },
    });

    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
