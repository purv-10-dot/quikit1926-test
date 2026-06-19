import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { parseFilters } from "@/lib/services/dashboard/filters";
import { getSalespersonDetail } from "@/lib/services/dashboard/salesperson-detail-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) {
      return NextResponse.json(
        { error: "Access restricted to org administrators." },
        { status: 403 },
      );
    }

    const { userId } = params;
    const { range } = parseFilters(req, user);

    const data = await getSalespersonDetail(user.orgId, userId, range);
    if (!data) {
      return NextResponse.json({ error: "Salesperson not found." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
