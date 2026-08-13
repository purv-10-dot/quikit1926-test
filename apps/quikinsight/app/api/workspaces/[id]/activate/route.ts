import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@quikit/database";
import { clearCache } from "@/lib/dashboardCache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qi = db as any;

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ws = await qi.qiWorkspace.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  clearCache(); // flush aggregator cache so next overview request uses the new workspace
  const response = NextResponse.json({ success: true, data: ws });
  // 30-day persistent cookie — httpOnly keeps it safe from client JS reads
  response.cookies.set("qi_active_workspace", ws.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
