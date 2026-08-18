import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { registerMember } from "@/lib/services/telephony/india-voice";

export const runtime = "nodejs";

const schema = z.object({ memberName: z.string().min(1), memberNum: z.string().min(10) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "telephony", "edit");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
    const result = await registerMember(parsed.data.memberName, parsed.data.memberNum);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
