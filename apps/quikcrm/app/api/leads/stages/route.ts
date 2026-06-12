import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const DEFAULT_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const ws = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId: user.orgId } });
    const settings = (ws?.settings as Record<string, unknown> | null) ?? {};
    const stages = (settings.leadPipelineConfig as { stages?: string[] } | undefined)?.stages ?? DEFAULT_STAGES;
    return NextResponse.json({ stages });
  } catch (e) {
    return errorResponse(e);
  }
}
