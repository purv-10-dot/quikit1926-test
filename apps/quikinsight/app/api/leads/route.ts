import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getHubSpotLeads } from "@/lib/connectors/hubspot";

export const runtime = "nodejs";
export const maxDuration = 60;

// Always-complete empty shape so the Leads page never crashes on missing data.
const EMPTY = {
  leads: [] as unknown[],
  leadsBySource: {} as Record<string, number>,
  leadTrend: [0, 0, 0, 0, 0, 0],
  leadFunnelStages: [
    { label: "New lead", value: 0 },
    { label: "Contacted", value: 0 },
    { label: "Qualified", value: 0 },
    { label: "Opportunity", value: 0 },
    { label: "Customer", value: 0 },
  ],
};

// GET /api/leads — real lead records from the connected CRM (HubSpot today).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");

  const hubspot = await prisma.platformConnection.findFirst({
    where: { userId: session.user.id, workspaceId, platform: "HUBSPOT" },
    select: { status: true },
  }).catch(() => null);

  if (hubspot?.status !== "CONNECTED") {
    return NextResponse.json(EMPTY);
  }

  try {
    const data = await getHubSpotLeads(session.user.id, workspaceId);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/leads] hubspot fetch failed:", err);
    return NextResponse.json(EMPTY);
  }
}
