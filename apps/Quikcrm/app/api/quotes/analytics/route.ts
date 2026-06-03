import { NextResponse } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getQuoteAnalytics } from "@/lib/services/quotes/enterprise/analytics-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const data = await getQuoteAnalytics(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analytics failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
