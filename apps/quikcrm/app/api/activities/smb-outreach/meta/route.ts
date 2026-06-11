import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getSmbOutreachMetaResponse } from "@/lib/services/activities/smb-outreach-meta";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");
    return NextResponse.json({ success: true, data: getSmbOutreachMetaResponse() });
  } catch (e) {
    return errorResponse(e);
  }
}
