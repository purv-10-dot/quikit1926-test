import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getLinkedInOrgStats } from "@/lib/connectors/linkedin";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/linkedin — full LinkedIn company page analytics
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
    const data = await getLinkedInOrgStats(session.user.id, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load LinkedIn data";
    if (message.includes("not connected")) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
