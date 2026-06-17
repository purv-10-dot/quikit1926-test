import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getFullContactRecord } from "@/lib/services/contacts/full-record";

export const runtime = "nodejs";

/** GET /api/contacts/:id/full — contact 360 aggregate payload. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const record = await getFullContactRecord({ user, contactId: id });
    if (!record) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: record });
  } catch (e) {
    return errorResponse(e);
  }
}
