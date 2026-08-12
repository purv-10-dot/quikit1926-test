import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { placeCall } from "@/lib/services/telephony/call-service";

export const runtime = "nodejs";

const schema = z.object({
  to: z.string().min(1),
  partyA: z.string().optional(),
  leadId: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "telephony", "create");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    const result = await placeCall({ user, ...parsed.data });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
