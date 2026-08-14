import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getMemberList } from "@/lib/services/telephony/india-voice";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await getMemberList();
    return NextResponse.json({ success: true, data: { items } });
  } catch (e) {
    return errorResponse(e);
  }
}
