import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getYouTubeData } from "@/lib/connectors/google";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
    const data = await getYouTubeData(session.user.id, 28, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    if (message.includes("not connected") || message.includes("not configured") || message.includes("YouTube"))
      return NextResponse.json({ connected: false });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
