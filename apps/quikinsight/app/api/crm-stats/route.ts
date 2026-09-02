import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getHubSpotCRMStats } from "@/lib/connectors/hubspot";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");

  const hubspot = await prisma.platformConnection.findFirst({
    where: { userId: session.user.id, workspaceId, platform: "HUBSPOT" },
    select: { status: true },
  }).catch(() => null);

  if (hubspot?.status !== "CONNECTED") {
    return NextResponse.json({ connected: false, neverConnected: !hubspot });
  }

  try {
    const data = await getHubSpotCRMStats(session.user.id, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
