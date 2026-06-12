import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getFullAccountRecord } from "@/lib/services/accounts/full-record";

export const runtime = "nodejs";

/** GET /api/accounts/:id/full — account 360 aggregate payload. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");

    const record = await getFullAccountRecord({ user, accountId: id });
    if (!record) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: record });
  } catch (e) {
    return errorResponse(e);
  }
}
