import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageHistory } from "@/lib/tokens/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "20")));

  const { rows, total } = await getUsageHistory(session.user.id, { page, limit });
  return NextResponse.json({ rows, total, page, limit });
}
