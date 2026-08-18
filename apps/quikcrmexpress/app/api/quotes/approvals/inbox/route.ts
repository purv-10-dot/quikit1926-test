import { NextResponse } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listApprovalInbox } from "@/lib/services/quotes/enterprise/approval-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const items = await listApprovalInbox(user.orgId);
    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Inbox failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
