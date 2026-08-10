import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  compareQuoteVersions,
  listComparableVersions,
} from "@/lib/services/quotes/enterprise/compare-versions";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const withId = req.nextUrl.searchParams.get("with");
    if (!withId) {
      const versions = await listComparableVersions(user.tenantId, id);
      return NextResponse.json({ success: true, data: { versions } });
    }

    const comparison = await compareQuoteVersions(user.tenantId, id, withId);
    return NextResponse.json({ success: true, data: comparison });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Compare failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
